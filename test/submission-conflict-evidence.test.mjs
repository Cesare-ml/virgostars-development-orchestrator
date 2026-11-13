import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,claim,handoff,taskKey,submissionKey,status} from '../src/claims.mjs';
import {resourceKey} from '../src/resources.mjs';
import {submit} from '../src/submissions.mjs';
import {GitHubError} from '../src/github.mjs';

// Entirely synthetic fixtures: no GitHub token, HTTP client or real ledger.
const repo='example-synthetic/alpha';
const config={
  active_repositories:[{full_name:repo,pilot_enabled:true}],
  claim_store:{repo:'example-synthetic/private-ledger',branch:'coordination/claims'}
};
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const writeTask={
  repository:repo,issue:101,status:'ready',role:'developer',access:'write',
  pilot_wave:2,upstream_pr:10,upstream_branch:'feat/upstream',
  resource_scope:{id:'smoke',roots:['test/smoke.test.mjs']}
};
const readTask={
  repository:repo,issue:102,status:'ready',role:'reviewer',access:'read'
};
const origin={full_name:repo};
const upstream={
  number:10,state:'open',draft:true,changed_files:0,
  head:{ref:'feat/upstream',sha:B,repo:origin},
  base:{ref:'main',sha:C,repo:origin}
};
const delivery={
  number:20,state:'open',draft:true,changed_files:1,
  head:{ref:'agent/change',sha:A,repo:origin},
  base:{ref:'feat/upstream',sha:B,repo:origin}
};

function fixture(task) {
  const records=new Map();
  let sequence=0;
  let conflict=null;
  return {
    records,
    injectSubmissionConflict(transform) {conflict=transform;},
    async getClaim(_r,path) {
      return records.has(path)?structuredClone(records.get(path)):null;
    },
    async createClaim(_r,path,_branch,data) {
      if(path.startsWith('submissions/') && conflict) {
        const transform=conflict;
        conflict=null;
        records.set(path,{sha:String(++sequence),data:transform(structuredClone(data))});
        throw new GitHubError(422);
      }
      if(records.has(path))throw new GitHubError(422);
      records.set(path,{sha:String(++sequence),data:structuredClone(data)});
    },
    async updateClaim(_r,path,_branch,sha,data) {
      if(records.get(path)?.sha!==sha)throw new GitHubError(409);
      records.set(path,{sha:String(++sequence),data:structuredClone(data)});
    },
    async deleteClaim(_r,path,_branch,sha) {
      if(records.get(path)?.sha!==sha)throw new GitHubError(409);
      records.delete(path);
    },
    async getIssue(){return {state:'open'};},
    async getPullRequest(_r,number){
      if(number===10)return structuredClone(upstream);
      if(number===20)return structuredClone(delivery);
      throw new Error('Unexpected synthetic pull request.');
    },
    async getPullRequestFiles(){return [{filename:'test/smoke.test.mjs',status:'added'}];},
    async getOpenPullRequests(){return [structuredClone(upstream),structuredClone(delivery)];}
  };
}

async function assigned(task) {
  const api=fixture(task),session=newSession(),tasks=[task];
  const options={api,config,tasks,repo,issue:task.issue,session};
  assert.equal((await claim({...options,role:task.role})).result,'acquired');
  assert.equal((await handoff({...options,headSha:task.access==='write'?A:null,
    summary:'Actual handoff evidence for the synthetic task.'})).result,'handoff-saved');
  return {api,options};
}
function assertStillLocked(api,task,session) {
  const record=api.records.get(taskKey(repo,task.issue));
  assert.equal(record?.data?.session_id,session);
  if(task.access==='write')
    assert.ok(api.records.has(resourceKey(repo,task.resource_scope.id)));
}

test('a 422 with the same owner but a different delivery PR cannot release resource locks',async()=>{
  const {api,options}=await assigned(writeTask);
  api.injectSubmissionConflict(marker=>({...marker,pull_request:999}));
  await assert.rejects(()=>submit({...options,prNumber:20,confirm:true}),
    /Submission conflict: evidence differs/);
  assertStillLocked(api,writeTask,options.session);
  assert.equal(api.records.get(submissionKey(repo,101)).data.pull_request,999);
  assert.equal((await status(options)).status,'claimed');
});

test('a 422 with different audited HEAD cannot be treated as idempotent',async()=>{
  const {api,options}=await assigned(writeTask);
  api.injectSubmissionConflict(marker=>({...marker,audited_head_sha:C}));
  await assert.rejects(()=>submit({...options,prNumber:20,confirm:true}),
    /Submission conflict: evidence differs/);
  assertStillLocked(api,writeTask,options.session);
});

test('a matching 422 marker remains idempotent and frees both locks',async()=>{
  const {api,options}=await assigned(writeTask);
  api.injectSubmissionConflict(marker=>marker);
  const result=await submit({...options,prNumber:20,confirm:true});
  assert.equal(result.result,'submitted');
  assert.equal(api.records.has(taskKey(repo,101)),false);
  assert.equal(api.records.has(resourceKey(repo,'smoke')),false);
  assert.equal(api.records.get(submissionKey(repo,101)).data.audited_head_sha,A);
});

test('reviewer handoff cannot be substituted on a same-session 422 marker',async()=>{
  const {api,options}=await assigned(readTask);
  api.injectSubmissionConflict(marker=>({...marker,
    last_handoff:{...marker.last_handoff,summary:'Stale, different review handoff.'}}));
  await assert.rejects(()=>submit({...options,confirm:true}),
    /Submission conflict: evidence differs/);
  assertStillLocked(api,readTask,options.session);
});

test('an existing same-owner marker with changed handoff is not safe to retry',async()=>{
  const {api,options}=await assigned(writeTask);
  const originalClaim=api.records.get(taskKey(repo,101)).data;
  api.records.set(submissionKey(repo,101),{sha:'synthetic',data:{
    schema_version:1,state:'submitted',target_repository:repo,issue_number:101,
    session_id:options.session,role:'developer',access:'write',
    resource_scope_id:'smoke',pull_request:20,audited_head_sha:A,
    audited_base_sha:B,scope_verdict:'scope-clean',
    collision_audit:'single-candidate',last_handoff:{
      ...originalClaim.last_handoff,summary:'Different prior handoff.'
    }
  }});
  await assert.rejects(()=>submit({...options,prNumber:20,confirm:true}),
    /Existing submission evidence differs/);
  assertStillLocked(api,writeTask,options.session);
});
