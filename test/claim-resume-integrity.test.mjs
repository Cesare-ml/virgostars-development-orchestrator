import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,claim,taskKey,submissionKey} from '../src/claims.mjs';
import {claimNext} from '../src/queue.mjs';
import {assertResumableOwnerClaim}
  from '../src/claim-resume-integrity.mjs';
import {GitHubError} from '../src/github.mjs';

const REPO='Cesare-ml/astrological-charts';
const LEDGER='fixture/private-ledger';
const config={claim_store:{repo:LEDGER,branch:'coordination/claims'},
  active_repositories:[{full_name:REPO,pilot_enabled:true}]};
const writeTask={repository:REPO,issue:802,role:'developer',
  status:'ready',access:'write',
  resource_scope:{id:'resume-guard',roots:['test/exclusive-resume.test.mjs']}};
const readTask={repository:REPO,issue:803,role:'reviewer',
  status:'ready',access:'read'};
const clone=x=>structuredClone(x);
const verdict=/resource scope changed or ownership inconsistent|Inconsistent active claim|Inconsistent active task claim/;

function fake() {
  const ledger=new Map(),calls=[];
  let revision=0;
  const api={
    async getIssue(_repo,number) {
      calls.push('getIssue');
      return {number,state:'open'};
    },
    async getClaim(_repo,path) {
      calls.push('getClaim');
      const value=ledger.get(path);
      return value?clone(value):null;
    },
    async createClaim(_repo,path,_branch,data) {
      calls.push('createClaim');
      if(ledger.has(path))throw new GitHubError(422);
      ledger.set(path,{sha:'test-'+(++revision),data:clone(data)});
    },
    async updateClaim(_repo,path,_branch,sha,data) {
      calls.push('updateClaim');
      if(ledger.get(path)?.sha!==sha)throw new GitHubError(409);
      ledger.set(path,{sha:'test-'+(++revision),data:clone(data)});
    },
    async deleteClaim(_repo,path,_branch,sha) {
      calls.push('deleteClaim');
      if(ledger.get(path)?.sha!==sha)throw new GitHubError(409);
      ledger.delete(path);
    }
  };
  return {api,ledger,calls,mutate:(issue,fn)=>{
    const path=taskKey(REPO,issue);
    const current=ledger.get(path);
    if(!current)throw new Error('Expected an owned synthetic task');
    fn(current.data);
  }};
}
const args=(x,task,session)=>({
  api:x.api,config,tasks:[task],
  repo:task.repository,issue:task.issue,role:task.role,session
});

test('valid same-session claimed and handed-off states resume without another lock',async()=>{
  const x=fake(),session=newSession();
  const acquired=await claim(args(x,writeTask,session));
  assert.equal(acquired.result,'acquired');
  const initialWrites=x.calls.filter(c=>c==='createClaim').length;
  assert.equal((await claim(args(x,writeTask,session))).result,'already-owned');
  x.mutate(writeTask.issue,c=>{
    c.state='in_progress';
    c.branch='feat/supervised-review';
    c.last_handoff={at:c.claimed_at,summary:'Work handed off',head_sha:null};
  });
  const resumed=await claim(args(x,writeTask,session));
  assert.equal(resumed.result,'already-owned');
  assert.equal(resumed.claim.state,'in_progress');
  const queued=await claimNext({
    api:x.api,config,tasks:[writeTask],session,role:'developer'
  });
  assert.equal(queued.result,'already-owned');
  assert.equal(x.calls.filter(c=>c==='createClaim').length,initialWrites);
});

test('same-session claim rejects role, schema, issue identity and state tampering',async()=>{
  const changes=[
    c=>{c.role='tester';},
    c=>{c.schema_version=3;},
    c=>{c.issue_number=123;},
    c=>{c.target_repository='fixture/other';},
    c=>{c.state='completed';},
    c=>{c.state='in_progress';c.last_handoff=null;},
    c=>{c.last_handoff={summary:'fake'};},
    c=>{c.claimed_at='';},
    c=>{c.branch=42;}
  ];
  for(const mutate of changes) {
    const x=fake(),session=newSession();
    await claim(args(x,writeTask,session));
    const before=x.ledger.size;
    x.mutate(writeTask.issue,mutate);
    await assert.rejects(()=>claim(args(x,writeTask,session)),verdict);
    assert.equal(x.ledger.size,before);
    assert.equal(x.calls.filter(c=>c==='deleteClaim').length,0);
  }
});

test('claim-next never resumes tampered same-session reviewer record',async()=>{
  for(const mutate of [
    c=>{c.role='auditor';},
    c=>{c.state='ready';},
    c=>{c.schema_version=1;},
    c=>{c.resource_scope_id='forged';}
  ]) {
    const x=fake(),session=newSession();
    await claim(args(x,readTask,session));
    x.mutate(readTask.issue,mutate);
    await assert.rejects(()=>claimNext({
      api:x.api,config,tasks:[readTask],session,role:'reviewer'
    }),verdict);
    assert.equal(x.calls.filter(c=>c==='createClaim').length,1);
  }
});

test('claim-next refuses resuming an already owned different role',async()=>{
  const x=fake(),session=newSession();
  await claim(args(x,readTask,session));
  await assert.rejects(()=>claimNext({
    api:x.api,config,tasks:[readTask],session,role:'developer'
  }),/different role/);
  assert.equal(x.ledger.size,1);
});

test('valid existing read-only reviewer claim stays resumable without changing mode',async()=>{
  const x=fake(),session=newSession();
  const first=await claim(args(x,readTask,session));
  assert.equal(first.result,'acquired');
  assert.equal((await claim(args(x,readTask,session))).result,'already-owned');
  assert.equal(x.ledger.size,1);
});

test('pure gate refuses claims detached from task and foreign session',async()=>{
  const x=fake(),session=newSession();
  const first=await claim(args(x,writeTask,session));
  assert.equal(assertResumableOwnerClaim({
    claim:first.claim,task:writeTask,session
  }),first.claim);
  for(const change of [
    {task:{...writeTask,issue:999}},
    {task:{...writeTask,role:'tester'}},
    {task:{...writeTask,resource_scope:{...writeTask.resource_scope,
      roots:['src/different.mjs']}}},
    {session:newSession()},
    {claim:{...first.claim,session_id:newSession()}}
  ]) {
    await assert.throws(()=>assertResumableOwnerClaim({
      claim:first.claim,task:writeTask,session,...change
    }),verdict);
  }
});

test('submitted historical task record is never silently resumed via claim-next',async()=>{
  const x=fake(),session=newSession();
  await claim(args(x,readTask,session));
  await x.api.createClaim(LEDGER,submissionKey(REPO,readTask.issue),
    'coordination/claims',{
      state:'submitted',target_repository:REPO,
      issue_number:readTask.issue,session_id:session
    });
  await assert.rejects(()=>claimNext({
    api:x.api,config,tasks:[readTask],session,role:'reviewer'
  }),/Submitted task still has an active claim/);
});
