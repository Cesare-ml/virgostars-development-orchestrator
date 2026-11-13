import test from 'node:test';
import assert from 'node:assert/strict';
import {submit} from '../src/submissions.mjs';
import {recoverSubmittedResourceRelease} from '../src/submission-release-recovery.mjs';
import {submissionKey,taskKey} from '../src/claims.mjs';
import {resourceKey} from '../src/resources.mjs';
import {GitHubError} from '../src/github.mjs';

const repo='example-synthetic/alpha-functions';
const session='chat-11111111-1111-4111-8111-111111111111';
const other='codex-22222222-2222-4222-8222-222222222222';
const config={
  claim_store:{repo:'example-synthetic/private-ledger',branch:'coordination/claims'},
  active_repositories:[{full_name:repo,pilot_enabled:true}]
};
const tasks=[{
  repository:repo,issue:201,status:'ready',role:'developer',access:'write',
  resource_scope:{id:'smoke',roots:['src/smoke/','test/smoke/']}
}];
const resourcePath=resourceKey(repo,'smoke'),submissionPath=submissionKey(repo,201);
const head='a'.repeat(40),base='b'.repeat(40);
const marker=()=>({
  schema_version:1,state:'submitted',target_repository:repo,issue_number:201,
  session_id:session,role:'developer',access:'write',
  resource_scope_id:'smoke',pull_request:42,audited_head_sha:head,
  audited_base_sha:base,scope_verdict:'scope-clean',
  collision_audit:'single-candidate',
  last_handoff:{head_sha:head,summary:'Synthetic PR handoff evidence.'}
});
const reservation=()=>({
  kind:'write-resource',target_repository:repo,issue_number:201,session_id:session,
  resource_scope_id:'smoke',resource_roots:['src/smoke/','test/smoke/']
});
function fake(){
  const files=new Map([
    [submissionPath,{sha:'c'.repeat(40),data:marker()}],
    [resourcePath,{sha:'d'.repeat(40),data:reservation()}]
  ]);
  const deletions=[];
  return {files,deletions,
    async getClaim(_ledger,path){return files.has(path)?structuredClone(files.get(path)):null;},
    async deleteClaim(_ledger,path,_branch,sha){
      if(files.get(path)?.sha!==sha)throw new GitHubError(409);
      deletions.push(path);files.delete(path);
    }
  };
}
const args=(api,overrides={})=>({
  api,config,tasks,repo,issue:201,session,confirm:true,...overrides
});

test('same owner retry finishes an orphaned resource deletion exactly once',async()=>{
  const api=fake();
  const result=await submit(args(api));
  assert.deepEqual(result,{
    result:'already-submitted',task:repo+'#201',recovered_resource_lock:true
  });
  assert.deepEqual(api.deletions,[resourcePath]);
  assert.equal(api.files.has(resourcePath),false);
  assert.equal(api.files.has(submissionPath),true);
  const again=await submit(args(api));
  assert.deepEqual(again,{result:'already-submitted',task:repo+'#201'});
  assert.deepEqual(api.deletions,[resourcePath]);
});

test('foreign session cannot claim a delivered task or release its resource',async()=>{
  const api=fake();
  await assert.rejects(()=>submit(args(api,{session:other})),/Foreign or invalid/);
  assert.equal(api.files.has(resourcePath),true);
});

test('active issue claim blocks recovery, even when owner and submission match',async()=>{
  const api=fake();
  api.files.set(taskKey(repo,201),{sha:'e'.repeat(40),
    data:{target_repository:repo,issue_number:201,session_id:session}});
  await assert.rejects(
    ()=>recoverSubmittedResourceRelease({...args(api),prior:api.files.get(submissionPath)}),
    /Claim or submission changed/
  );
  assert.equal(api.files.has(resourcePath),true);
});

test('changed curated resource roots cannot authorize deletion',async()=>{
  const api=fake();
  await assert.rejects(()=>submit(args(api,{tasks:[{
    ...tasks[0],resource_scope:{id:'smoke',roots:['src/different/']}
  }]})),/Resource belongs to another/);
  assert.equal(api.files.has(resourcePath),true);
});

test('foreign partition owner cannot be deleted during recovery',async()=>{
  const api=fake();
  api.files.get(resourcePath).data.session_id=other;
  await assert.rejects(()=>submit(args(api)),/Resource belongs to another/);
  assert.deepEqual(api.deletions,[]);
});

test('missing verified PR evidence or changed task identity fails closed',async()=>{
  const api=fake();
  api.files.get(submissionPath).data.scope_verdict='unchecked';
  await assert.rejects(()=>submit(args(api)),/audit evidence is incomplete/);
  api.files.get(submissionPath).data=marker();
  await assert.rejects(()=>submit(args(api,{tasks:[{
    ...tasks[0],resource_scope:{id:'renamed',roots:['src/smoke/','test/smoke/']}
  }]})),/write task changed/);
  assert.equal(api.files.has(resourcePath),true);
});

test('concurrent resource deletion conflict is not reported as successful',async()=>{
  const api=fake();
  const original=api.deleteClaim;
  api.deleteClaim=async()=>{throw new GitHubError(409);};
  await assert.rejects(()=>submit(args(api)),/Resource release outcome uncertain/);
  assert.equal(api.files.has(resourcePath),true);
  api.deleteClaim=original;
  assert.equal((await submit(args(api))).recovered_resource_lock,true);
});

test('submission marker change between checks prevents recovery',async()=>{
  const api=fake();
  const original=api.getClaim;
  let reads=0;
  api.getClaim=async(...arguments_)=>{
    const found=await original(...arguments_);
    if(arguments_[1]===submissionPath && ++reads>=3 && found)
      return {...found,sha:'f'.repeat(40)};
    return found;
  };
  await assert.rejects(()=>submit(args(api)),/Claim or submission changed/);
  assert.equal(api.files.has(resourcePath),true);
});

test('a read-only submission returns existing result without using task catalog',async()=>{
  const api=fake();
  api.files.get(submissionPath).data={...marker(),access:'read',
    resource_scope_id:null,role:'reviewer'};
  const result=await submit(args(api,{tasks:null}));
  assert.deepEqual(result,{result:'already-submitted',task:repo+'#201'});
  assert.equal(api.files.has(resourcePath),true); // unrelated, never touched
  assert.deepEqual(api.deletions,[]);
});
