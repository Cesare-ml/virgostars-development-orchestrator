import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTaskPullRequest,inspectTaskPullRequest} from '../src/pr-audit.mjs';

const H='a'.repeat(40),U='b'.repeat(40),R='Cesare-ml/astrological-functions';
const task={repository:R,issue:5,status:'ready',role:'developer',access:'write',pilot_wave:2,
  upstream_pr:3,upstream_branch:'agent/provider-contract-validation-20261110',
  resource_scope:{id:'adapter',roots:['src/ephemeris-provider.js','test/pilot-provider-consumer-smoke.test.mjs']}};
const repo={full_name:R};
const upstream={state:'open',head:{ref:task.upstream_branch,sha:U}};
const pr={number:6,state:'open',draft:true,head:{ref:'pilot/provider-smoke',sha:H,repo},
  base:{ref:task.upstream_branch,sha:U,repo},changed_files:2};
const files=[{filename:task.resource_scope.roots[0],status:'added'},
  {filename:task.resource_scope.roots[1],status:'added'}];
const review=(p=pr,u=upstream,f=files)=>inspectTaskPullRequest(task,p,u,f);

test('valid stacked draft PR with two declared added files is scope clean',()=>{
  const r=review();assert.equal(r.verdict,'scope-clean');assert.equal(r.approved,false);
});
test('out-of-scope file is blocked',()=>{
  const r=review({...pr,changed_files:3},upstream,[...files,{filename:'src/index.mjs',status:'added'}]);
  assert.ok(r.reasons.some(x=>x.code==='OUTSIDE_APPROVED_SCOPE'));
});
test('wrong base, moved upstream and non-draft are blocked',()=>{
  const r=review({...pr,draft:false,base:{...pr.base,ref:'main'}},
    {...upstream,head:{...upstream.head,sha:H}});
  assert.ok(r.reasons.some(x=>x.code==='WRONG_BASE_BRANCH'));
  assert.ok(r.reasons.some(x=>x.code==='UPSTREAM_MOVED'));
  assert.ok(r.reasons.some(x=>x.code==='NOT_OPEN_DRAFT'));
});
test('missing, modified, renamed, or duplicate files block submission',()=>{
  const mod=review(pr,upstream,[{...files[0],status:'modified'},files[1]]);
  assert.ok(mod.reasons.some(x=>x.code==='NOT_A_NEW_FILE'));
  const missing=review(pr,upstream,[files[0]]);
  assert.ok(missing.reasons.some(x=>x.code==='MISSING_REQUIRED_FILE'));
  const renamed=review(pr,upstream,[{...files[0],status:'renamed',previous_filename:'src/old.js'},files[1]]);
  assert.ok(renamed.reasons.some(x=>x.code==='RENAMED_FILE'));
  const duplicate=review(pr,upstream,[files[0],files[0]]);
  assert.ok(duplicate.reasons.some(x=>x.code==='INVALID_FILE_PATH'));
});
test('same name with different case is not authorized',()=>{
  const x=review(pr,upstream,[{...files[0],filename:'src/Ephemeris-provider.js'},files[1]]);
  assert.equal(x.verdict,'blocked');
});
test('runtime audit does not invent PR if API denies it',async()=>{
  const api={getPullRequest:async(_r,n)=>n===6?pr:upstream,getPullRequestFiles:async()=>files};
  assert.equal((await auditTaskPullRequest({api,tasks:[task],repo:R,issue:5,prNumber:6})).verdict,'scope-clean');
  await assert.rejects(()=>auditTaskPullRequest({api,tasks:[task],repo:R,issue:5,prNumber:0}),/positive/);
  const denied={...api,getPullRequestFiles:async()=>{throw new Error('403')}};
  await assert.rejects(()=>auditTaskPullRequest({api:denied,tasks:[task],repo:R,issue:5,prNumber:6}),/403/);
});
test('wrong repo or task scope is rejected',async()=>{
  const api={getPullRequest:async()=>pr,getPullRequestFiles:async()=>files};
  await assert.rejects(()=>auditTaskPullRequest({api,tasks:[task],repo:R,issue:4,prNumber:6}),/not a curated/);
  assert.throws(()=>inspectTaskPullRequest({...task,access:'read'},pr,upstream,files),
    /Read-only tasks cannot reserve write resources|not configured/);
});


test('authorized tester write task uses the same scoped stacked PR checks',()=>{
  const result=inspectTaskPullRequest({...task,role:'tester'},pr,upstream,files);
  assert.equal(result.verdict,'scope-clean');
  assert.equal(result.approved,false);
});
