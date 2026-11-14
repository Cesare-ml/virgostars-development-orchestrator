import test from 'node:test';
import assert from 'node:assert/strict';
import {claim,newSession,status} from '../src/claims.mjs';
import {claimNext} from '../src/queue.mjs';
import {GitHubError} from '../src/github.mjs';
import {assertLiveWriteTaskAdmission}
  from '../src/live-write-admission.mjs';

const TARGET='Cesare-ml/astrological-charts';
const LEDGER='owner/synthetic-private-ledger';
const SHA='a'.repeat(40),BASE='b'.repeat(40);
const UPSTREAM_BRANCH='feat/synthetic-approved-parent';
const config={active_repositories:[{full_name:TARGET,pilot_enabled:true}],
  claim_store:{repo:LEDGER,branch:'coordination/claims'}};
const roots=['tests/owner-alpha-a.test.mjs','tests/owner-alpha-b.test.mjs'];
const tasks=()=>roots.map((root,i)=>({
  repository:TARGET,issue:701+i,status:'ready',
  role:'developer',access:'write',pilot_wave:3,
  title:'Synthetic approved task '+i,scope:[root],
  resource_scope:{id:'owner-synthetic-'+i,roots:[root]},
  upstream_pr:55,upstream_branch:UPSTREAM_BRANCH
}));
const clone=x=>structuredClone(x);
function fixture(options={}) {
  const files=new Map(),calls=[],catalog=tasks();
  let revision=0,upstreamReads=0,prLists=0;
  const upstream={
    number:55,state:options.closedUpstream?'closed':'open',
    head:{ref:UPSTREAM_BRANCH,sha:SHA},base:{ref:'main',sha:BASE},
    changed_files:0,draft:true
  };
  const competing={
    number:56,state:'open',changed_files:1,draft:true,
    head:{ref:'feat/competing',sha:'c'.repeat(40)},
    base:{ref:'main',sha:BASE}
  };
  const api={
    async getIssue(_repo,number) {
      calls.push('getIssue');
      return {number:options.wrongIssue?999:number,
        state:options.closedIssue?'closed':'open'};
    },
    async getPullRequest(_repo,number) {
      calls.push('getPullRequest');
      if(number===55) {
        upstreamReads++;
        const value=clone(upstream);
        if(options.driftHead&&upstreamReads>=2)
          value.head.sha='d'.repeat(40);
        if(options.driftBase&&upstreamReads>=2)
          value.base.sha='e'.repeat(40);
        return value;
      }
      return clone(competing);
    },
    async getOpenPullRequests() {
      calls.push('getOpenPullRequests');
      prLists++;
      if(options.listDrift&&prLists>=2)
        return [clone(upstream),clone(competing)];
      return options.competitor?[clone(upstream),clone(competing)]
        :[clone(upstream)];
    },
    async getPullRequestFiles(_repo,number) {
      calls.push('getPullRequestFiles');
      if(number!==56)return [];
      if(options.incompleteFiles)return [];
      return [{filename:options.unrelated?'docs/other-file.md':roots[0],
        status:'added'}];
    },
    async getClaim(_ledger,path) {
      calls.push('getClaim');return clone(files.get(path)||null);
    },
    async createClaim(_ledger,path,_branch,data) {
      calls.push('createClaim');
      if(files.has(path))throw new GitHubError(422);
      files.set(path,{sha:String(++revision),data:clone(data)});
    },
    async updateClaim(_ledger,path,_branch,sha,data) {
      calls.push('updateClaim');
      if(files.get(path)?.sha!==sha)throw new GitHubError(409);
      files.set(path,{sha:String(++revision),data:clone(data)});
    },
    async deleteClaim(_ledger,path,_branch,sha) {
      calls.push('deleteClaim');
      if(files.get(path)?.sha!==sha)throw new GitHubError(409);
      files.delete(path);
    }
  };
  return {api,files,calls,catalog,upstream,competing};
}
function gate(x) {
  return task=>task.access==='write'
    ? assertLiveWriteTaskAdmission({api:x.api,tasks:x.catalog,task})
    : undefined;
}
function args(x,session=newSession()) {
  return {api:x.api,config,tasks:x.catalog,
    repo:TARGET,issue:701,session,role:'developer',beforeClaim:gate(x)};
}

test('live admission audits upstream, competing open PRs and real issue without writes',async()=>{
  const x=fixture();
  const result=await assertLiveWriteTaskAdmission({
    api:x.api,tasks:x.catalog,task:x.catalog[0]});
  assert.equal(result.admissible,true);
  assert.equal(result.lock_acquired,false);
  assert.ok(x.calls.filter(c=>c==='getOpenPullRequests').length>=2);
  assert.ok(x.calls.filter(c=>c==='getPullRequest').length>=2);
  assert.equal(x.calls.filter(c=>c==='createClaim').length,0);
});

test('new approved claim creates write resource BEFORE task claim after a live audit',async()=>{
  const x=fixture();
  const result=await claim(args(x));
  assert.equal(result.result,'acquired');
  const writes=x.calls.filter(c=>c==='createClaim');
  assert.equal(writes.length,2);
  const entries=[...x.files.keys()];
  assert.ok(entries[0].startsWith('resources/'),entries.join(','));
  assert.ok(entries[1].startsWith('claims/'),entries.join(','));
  const firstWrite=x.calls.indexOf('createClaim');
  assert.ok(x.calls.slice(0,firstWrite).includes('getOpenPullRequests'));
  assert.equal((await status({api:x.api,config,repo:TARGET,issue:701})).status,'claimed');
});

test('overlapping competing PR blocks before any resource or task lock',async()=>{
  const x=fixture({competitor:true});
  await assert.rejects(()=>claim(args(x)),/Live write-task admission blocked/);
  assert.equal(x.files.size,0);
  assert.equal(x.calls.filter(c=>c==='createClaim').length,0);
});

test('unrelated PR does not block independently scoped task',async()=>{
  const x=fixture({competitor:true,unrelated:true});
  const result=await claim(args(x));
  assert.equal(result.result,'acquired');
});

test('stale upstream PR or drifted head/base refuses new claims',async()=>{
  for(const opts of [{closedUpstream:true},{driftHead:true},{driftBase:true}]) {
    const x=fixture(opts);
    await assert.rejects(()=>claim(args(x)),/Live write-task admission blocked/);
    assert.equal(x.files.size,0);
  }
});

test('closed or mismatched target issue refuses new claim before write',async()=>{
  for(const opts of [{closedIssue:true},{wrongIssue:true}]) {
    const x=fixture(opts);
    await assert.rejects(()=>claim(args(x)),/open GitHub issue|Live write-task admission blocked/);
    assert.equal(x.files.size,0);
  }
});

test('incomplete, racing open-PR inventory fails closed before creating locks',async()=>{
  for(const opts of [
    {competitor:true,incompleteFiles:true},
    {listDrift:true}
  ]) {
    const x=fixture(opts);
    await assert.rejects(()=>claim(args(x)),/Live write-task admission blocked/);
    assert.equal(x.files.size,0);
  }
});

test('claim-next also audits current PRs and stops instead of skipping a conflict',async()=>{
  const x=fixture({competitor:true});
  await assert.rejects(()=>claimNext({
    api:x.api,config,tasks:x.catalog,session:newSession(),
    role:'developer',beforeClaim:gate(x)
  }),/Live write-task admission blocked/);
  assert.equal(x.files.size,0);
});

test('claim-next can acquire second disjoint task while first partition is claimed',async()=>{
  const x=fixture();
  const first=await claim(args(x));
  assert.equal(first.result,'acquired');
  const next=await claimNext({
    api:x.api,config,tasks:x.catalog,session:newSession(),
    role:'developer',beforeClaim:gate(x)
  });
  assert.equal(next.result,'acquired');
  assert.equal(next.claim.issue_number,702);
  assert.equal(x.files.size,4);
});

test('resuming an already-owned claim never creates a second resource',async()=>{
  const x=fixture();
  const session=newSession();
  await claim(args(x,session));
  const writes=x.calls.filter(c=>c==='createClaim').length;
  x.upstream.state='closed';
  const same=await claim(args(x,session));
  assert.equal(same.result,'already-owned');
  assert.equal(x.calls.filter(c=>c==='createClaim').length,writes);
  assert.equal(x.files.size,2);
});

test('non-function callbacks fail without claim writes',async()=>{
  const x=fixture();
  await assert.rejects(()=>claim({...args(x),beforeClaim:{}}),
    /Invalid live write-task admission gate/);
  assert.equal(x.files.size,0);
});

test('catalog callback does not accept detached task or missing GitHub methods',async()=>{
  const x=fixture();
  const detached=clone(x.catalog[0]);
  await assert.rejects(()=>assertLiveWriteTaskAdmission({
    api:x.api,tasks:x.catalog,task:detached
  }),/Live write-task admission blocked/);
  delete x.api.getOpenPullRequests;
  await assert.rejects(()=>assertLiveWriteTaskAdmission({
    api:x.api,tasks:x.catalog,task:x.catalog[0]
  }),/Live write-task admission blocked/);
  assert.equal(x.files.size,0);
});
