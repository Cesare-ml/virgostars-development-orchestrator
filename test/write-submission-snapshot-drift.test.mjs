import test from 'node:test';
import assert from 'node:assert/strict';
import {claim,handoff,newSession,status,submissionKey,taskKey} from '../src/claims.mjs';
import {resourceKey} from '../src/resources.mjs';
import {submit} from '../src/submissions.mjs';
import {GitHubError} from '../src/github.mjs';

// Only synthetic identities, in-memory records and local code. No tokens or network.
const R='example-synthetic/scope-guard',H=n=>n.repeat(40);
const scope='tests/safe-scope.test.mjs';
const task={repository:R,issue:501,status:'ready',role:'developer',
  access:'write',pilot_wave:2,upstream_pr:10,upstream_branch:'agent/upstream',
  resource_scope:{id:'submit-guard',roots:[scope]}};
const tasks=[task];
const config={claim_store:{repo:'example-synthetic/private-ledger',
  branch:'coordination/claims'},active_repositories:[{full_name:R,pilot_enabled:true}]};
const repo={full_name:R};
const upstream=()=>({number:10,state:'open',draft:true,changed_files:0,
  head:{ref:task.upstream_branch,sha:H('b'),repo},
  base:{ref:'main',sha:H('c'),repo}});
const files=[{filename:scope,status:'added'}];

function adapter({drift=null,markerRace=null}={}) {
  const records=new Map();
  let sequence=0,inventoryReads=0;
  let head=H('a'),base=H('b'),baseRef=task.upstream_branch;
  const delivery=()=>({number:20,state:'open',draft:true,changed_files:1,
    head:{ref:'agent/pilot-delivery',sha:head,repo},
    base:{ref:baseRef,sha:base,repo}});
  const copy=value=>structuredClone(value);
  const api={
    records,
    async getIssue(){return {number:501,state:'open'};},
    async getClaim(_ledger,path){
      return records.has(path)?copy(records.get(path)):null;
    },
    async createClaim(_ledger,path,_branch,data){
      if(path.startsWith('submissions/') && markerRace) {
        let conflicting=copy(data);
        if(markerRace==='different-head') conflicting.audited_head_sha=H('f');
        if(markerRace==='different-handoff')
          conflicting.last_handoff={...conflicting.last_handoff,summary:'Different evidence'};
        if(markerRace==='same-evidence')
          conflicting.submitted_at='2020-01-01T00:00:00.000Z';
        markerRace=null;
        records.set(path,{sha:String(++sequence),data:conflicting});
        throw new GitHubError(422);
      }
      if(records.has(path))throw new GitHubError(422);
      records.set(path,{sha:String(++sequence),data:copy(data)});
    },
    async updateClaim(_ledger,path,_branch,sha,data){
      if(records.get(path)?.sha!==sha)throw new GitHubError(409);
      records.set(path,{sha:String(++sequence),data:copy(data)});
    },
    async deleteClaim(_ledger,path,_branch,sha){
      if(records.get(path)?.sha!==sha)throw new GitHubError(409);
      records.delete(path);
    },
    async getPullRequest(_repo,num){
      if(num===10)return upstream();
      if(num===20)return delivery();
      throw new Error('Unrecognized synthetic PR');
    },
    async getPullRequestFiles(_repo,num){
      if(num!==20)throw new Error('Unexpected upstream changed-file access');
      return copy(files);
    },
    async getOpenPullRequests(){
      inventoryReads++;
      // Scope audit already finished; deliberately mutate before the first
      // collision inventory read, not during either audit's own recheck.
      if(inventoryReads===1) {
        if(drift==='head')head=H('d');
        if(drift==='base-sha')base=H('e');
        if(drift==='base-ref')baseRef='agent/rebased-elsewhere';
      }
      return [upstream(),delivery()];
    }
  };
  return api;
}

async function prepare(api) {
  const session=newSession();
  const acquired=await claim({api,config,tasks,repo:R,issue:501,
    session,role:'developer'});
  assert.equal(acquired.result,'acquired');
  await handoff({api,config,repo:R,issue:501,session,
    summary:'Synthetic approved diff and independent tests pending.',
    headSha:H('a')});
  return session;
}

test('unchanged scope/collision snapshots produce one submitted record and release locks',async()=>{
  const api=adapter(),session=await prepare(api);
  const result=await submit({api,config,tasks,repo:R,issue:501,
    session,prNumber:20,confirm:true});
  assert.equal(result.result,'submitted');
  assert.equal(api.records.has(submissionKey(R,501)),true);
  assert.equal(api.records.has(taskKey(R,501)),false);
  assert.equal(api.records.has(resourceKey(R,task.resource_scope.id)),false);
});

for(const drift of ['head','base-sha','base-ref']) {
  test('fail closed on delivery PR '+drift+' change between audits',async()=>{
    const api=adapter({drift}),session=await prepare(api);
    await assert.rejects(()=>submit({api,config,tasks,repo:R,issue:501,
      session,prNumber:20,confirm:true}),/changed between scope and collision audits/);
    assert.equal(api.records.has(submissionKey(R,501)),false);
    assert.equal(api.records.has(taskKey(R,501)),true);
    assert.equal(api.records.has(resourceKey(R,task.resource_scope.id)),true);
    const state=await status({api,config,repo:R,issue:501});
    assert.equal(state.status,'claimed');
    assert.equal(state.claim.session_id,session);
  });
}

for(const markerRace of ['different-head','different-handoff']) {
  test('same-session competing submission with '+markerRace+' evidence cannot release locks',async()=>{
    const api=adapter({markerRace}),session=await prepare(api);
    await assert.rejects(()=>submit({api,config,tasks,repo:R,issue:501,
      session,prNumber:20,confirm:true}),/Submission evidence conflict; manual reconciliation required/);
    assert.equal(api.records.has(submissionKey(R,501)),true);
    assert.equal(api.records.has(taskKey(R,501)),true);
    assert.equal(api.records.has(resourceKey(R,task.resource_scope.id)),true);
  });
}

test('same-session concurrent marker with equivalent evidence allows release',async()=>{
  const api=adapter({markerRace:'same-evidence'}),session=await prepare(api);
  const result=await submit({api,config,tasks,repo:R,issue:501,
    session,prNumber:20,confirm:true});
  assert.equal(result.result,'submitted');
  assert.equal(api.records.has(taskKey(R,501)),false);
  assert.equal(api.records.has(resourceKey(R,task.resource_scope.id)),false);
  assert.equal(api.records.has(submissionKey(R,501)),true);
});
