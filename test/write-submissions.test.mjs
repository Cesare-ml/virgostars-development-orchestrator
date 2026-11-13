import test from 'node:test';
import assert from 'node:assert/strict';
import {claim,handoff,status,newSession,taskKey,submissionKey} from '../src/claims.mjs';
import {resourceKey} from '../src/resources.mjs';
import {submit} from '../src/submissions.mjs';
import {GitHubError} from '../src/github.mjs';

const target='Cesare-ml/astrological-functions';
const config={active_repositories:[{full_name:target,pilot_enabled:true}],
 claim_store:{repo:'Cesare-ml/virgostars-development-orchestrator',branch:'coordination/claims'}};
const task={repository:target,issue:5,status:'ready',role:'developer',access:'write',pilot_wave:2,
 upstream_pr:3,upstream_branch:'agent/provider-contract-validation-20261110',
 resource_scope:{id:'provider-pilot',roots:['src/ephemeris-provider.js','test/pilot-provider-consumer-smoke.test.mjs']}};
const tasks=[task],A='a'.repeat(40),B='b'.repeat(40);
const origin={full_name:target};
const upstream={state:'open',head:{ref:task.upstream_branch,sha:B}};
const pr={number:6,state:'open',draft:true,changed_files:2,head:{ref:'pilot/consumer',sha:A,repo:origin},
 base:{ref:task.upstream_branch,sha:B,repo:origin}};
const validFiles=task.resource_scope.roots.map(filename=>({filename,status:'added'}));

function mock() {
 const store=new Map();let seq=0,changedFiles=validFiles,competing=false,submissionRace=null;
 const extra={...pr,number:7,head:{...pr.head,sha:'d'.repeat(40)}};
 return {store,
  setFiles(value){changedFiles=value;},
  setCompeting(value){competing=value;},
  injectSubmissionRace(transform){submissionRace=transform;},
  async getIssue(){return {state:'open'};},
  async getClaim(_r,p){return store.has(p)?structuredClone(store.get(p)):null;},
  async createClaim(_r,p,_b,data){
    if(p.startsWith('submissions/') && submissionRace) {
      const transform=submissionRace;submissionRace=null;
      store.set(p,{sha:String(++seq),data:structuredClone(transform(data))});
      throw new GitHubError(422);
    }
    if(store.has(p))throw new GitHubError(422);
    store.set(p,{sha:String(++seq),data:structuredClone(data)});
  },
  async updateClaim(_r,p,_b,sha,data){
    if(store.get(p)?.sha!==sha)throw new GitHubError(409);
    store.set(p,{sha:String(++seq),data:structuredClone(data)});
  },
  async deleteClaim(_r,p,_b,sha){
    if(store.get(p)?.sha!==sha)throw new GitHubError(409);
    store.delete(p);
  },
  async getOpenPullRequests(){return [
    {number:3,state:'open',head:{sha:B},base:{sha:'c'.repeat(40),ref:'main'}},
    pr,...(competing?[extra]:[])
  ];},
  async getPullRequest(_r,n){return n===3?upstream:n===7?extra:pr;},
  async getPullRequestFiles(_r,n){return n===7?validFiles:changedFiles;}
 };
}
async function assigned(api,session,head=A){
 const args={api,config,tasks,repo:target,issue:5,session};
 assert.equal((await claim({...args,role:'developer'})).result,'acquired');
 await handoff({...args,summary:'Draft stacked PR #6 reviewed locally; awaiting independent review.',headSha:head});
 return args;
}
test('write submit requires PR and leaves both claims untouched if missing',async()=>{
 const api=mock(),session=newSession(),args=await assigned(api,session);
 await assert.rejects(()=>submit({...args,confirm:true}),/requires a curated task catalog and --pr/);
 assert.equal((await status(args)).status,'claimed');
 assert.ok(api.store.has(resourceKey(target,task.resource_scope.id)));
 assert.equal(api.store.has(submissionKey(target,5)),false);
});
test('scope-clean stacked PR is recorded but not approved, then releases both locks',async()=>{
 const api=mock(),session=newSession(),args=await assigned(api,session);
 const result=await submit({...args,prNumber:6,confirm:true});
 assert.equal(result.result,'submitted');
 assert.equal(result.review_required,true);
 const saved=api.store.get(submissionKey(target,5))?.data;
 assert.equal(saved.pull_request,6);
 assert.equal(saved.audited_head_sha,A);
 assert.equal(saved.scope_verdict,'scope-clean');
 assert.equal(api.store.has(taskKey(target,5)),false);
 assert.equal(api.store.has(resourceKey(target,task.resource_scope.id)),false);
 assert.equal((await status(args)).status,'submitted');
});
test('out-of-scope changed file refuses write submit, claims stay owned',async()=>{
 const api=mock(),session=newSession(),args=await assigned(api,session);
 api.setFiles([validFiles[0],{filename:'src/index.mjs',status:'added'}]);
 await assert.rejects(()=>submit({...args,prNumber:6,confirm:true}),/blocked by scope audit/);
 assert.equal((await status(args)).status,'claimed');
 assert.ok(api.store.has(resourceKey(target,task.resource_scope.id)));
 assert.equal(api.store.has(submissionKey(target,5)),false);
});
test('audited head must match saved handoff HEAD and blocks stale delivery',async()=>{
 const api=mock(),session=newSession(),args=await assigned(api,session,B);
 await assert.rejects(()=>submit({...args,prNumber:6,confirm:true}),/Handoff head SHA/);
 assert.equal((await status(args)).status,'claimed');
});


test('write submission refuses handoff without an exact PR HEAD SHA',async()=>{
 const api=mock(),session=newSession(),args=await assigned(api,session,null);
 await assert.rejects(()=>submit({...args,prNumber:6,confirm:true}),/Handoff head SHA is missing/);
 assert.equal((await status(args)).status,'claimed');
 assert.ok(api.store.has(resourceKey(target,task.resource_scope.id)));
});

test('another open PR adding the same file blocks a write submission',async()=>{
 const api=mock(),session=newSession(),args=await assigned(api,session);
 api.setCompeting(true);
 await assert.rejects(()=>submit({...args,prNumber:6,confirm:true}),/competing\/open PRs/);
 assert.equal((await status(args)).status,'claimed');
 assert.ok(api.store.has(resourceKey(target,task.resource_scope.id)));
 assert.equal(api.store.has(submissionKey(target,5)),false);
});

test('same-session conflicting marker from create race retains the issue and resource locks',async()=>{
 const api=mock(),session=newSession(),args=await assigned(api,session);
 api.injectSubmissionRace(marker=>({...marker,audited_head_sha:'f'.repeat(40)}));
 await assert.rejects(()=>submit({...args,prNumber:6,confirm:true}),
   /Submission conflict: existing record has different task\/PR evidence/);
 assert.equal((await status(args)).status,'claimed');
 assert.ok(api.store.has(taskKey(target,5)));
 assert.ok(api.store.has(resourceKey(target,task.resource_scope.id)));
 assert.equal(api.store.get(submissionKey(target,5)).data.audited_head_sha,'f'.repeat(40));
 await assert.rejects(()=>submit({...args,prNumber:6,confirm:true}),
   /Existing submission marker differs from current handoff\/PR evidence/);
 assert.ok(api.store.has(taskKey(target,5)));
 assert.ok(api.store.has(resourceKey(target,task.resource_scope.id)));
});

test('same-session identical marker from create race is safely retryable',async()=>{
 const api=mock(),session=newSession(),args=await assigned(api,session);
 api.injectSubmissionRace(marker=>marker);
 const result=await submit({...args,prNumber:6,confirm:true});
 assert.equal(result.result,'submitted');
 assert.equal(api.store.get(submissionKey(target,5)).data.audited_head_sha,A);
 assert.equal(api.store.has(taskKey(target,5)),false);
 assert.equal(api.store.has(resourceKey(target,task.resource_scope.id)),false);
});

test('create race with a marker for another task never releases an owned lock',async()=>{
 const api=mock(),session=newSession(),args=await assigned(api,session);
 api.injectSubmissionRace(marker=>({...marker,issue_number:999}));
 await assert.rejects(()=>submit({...args,prNumber:6,confirm:true}),
   /Submission conflict: existing record has different task\/PR evidence/);
 assert.ok(api.store.has(taskKey(target,5)));
 assert.ok(api.store.has(resourceKey(target,task.resource_scope.id)));
});
