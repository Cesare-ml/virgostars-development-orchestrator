import test from 'node:test';
import assert from 'node:assert/strict';
import {collectIntegratorLivePrEvidence} from '../src/integrator-live-pr-evidence.mjs';

const A='a'.repeat(40), B='b'.repeat(40), C='c'.repeat(40);
const REPO='Cesare-ml/virgostars-development-orchestrator';
const args={repository:REPO,prNumber:12,requiredCheckNames:['Node 22']};
const clone=x=>structuredClone(x);
function fixture() {
  const p={number:12,state:'open',draft:false,merged:false,mergeable:true,
    changed_files:1,head:{sha:A,ref:'feat/work',repo:{full_name:REPO}},
    base:{sha:B,ref:'main',repo:{full_name:REPO}},user:{login:'dev'}};
  const store={p,files:[{filename:'src/test.mjs',status:'added'}],
    reviews:[{id:1,user:{login:'reviewer'},state:'APPROVED',commit_id:A,
      submitted_at:'2026-11-14T14:00:00Z'}],
    checks:{head_sha:A,total_count:1,check_runs:[{name:'Node 22',head_sha:A,
      status:'completed',conclusion:'success'}]},
    threads:{complete:true,total_count:1,threads:[{isResolved:true}]}};
  const log=[];
  const api={
    getPullRequest:async()=>{log.push('pr');return clone(store.p)},
    getPullRequestFiles:async()=>{log.push('files');return clone(store.files)},
    getPullRequestReviews:async()=>{log.push('reviews');return clone(store.reviews)},
    getPullRequestCheckRuns:async()=>{log.push('checks');return clone(store.checks)},
    getPullRequestReviewThreads:async()=>{log.push('threads');return clone(store.threads)}
  };
  return {store,api,log};
}
async function result(fixture){return collectIntegratorLivePrEvidence({...args,api:fixture.api})}
async function blocked(name,edit,code){
  await test(name,async()=>{
    const f=fixture();edit(f.store,f);
    const r=await result(f);
    assert.equal(r.verdict,'blocked');
    assert.equal(r.merge_authorized,false);
    assert.ok(r.reasons.includes(code),r.reasons.join(','));
  });
}

test('valid complete GitHub snapshot still never authorizes a merge',async()=>{
  const f=fixture(),r=await result(f);
  assert.equal(r.verdict,'candidate');
  assert.equal(r.head_sha,A);assert.equal(r.merge_authorized,false);
  assert.equal(r.approval_or_session_verified,false);
  assert.equal(r.branch_protection_verified,false);
  assert.deepEqual(f.log.sort(),['pr','pr','files','checks','reviews','threads'].sort());
});
await blocked('draft PR',s=>{s.p.draft=true},'PR_NOT_MERGEABLE_OR_READY');
await blocked('unmergeable PR',s=>{s.p.mergeable=null},'PR_NOT_MERGEABLE_OR_READY');
await blocked('missing check',s=>{s.checks.check_runs[0].name='other'},'REQUIRED_CHECK_NOT_SUCCESSFUL_ON_HEAD');
await blocked('failing check',s=>{s.checks.check_runs[0].conclusion='failure'},'REQUIRED_CHECK_NOT_SUCCESSFUL_ON_HEAD');
await blocked('stale check',s=>{s.checks.check_runs[0].head_sha=C},'INVALID_OR_DUPLICATE_CHECK_RUN');
await blocked('stale review',s=>{s.reviews[0].commit_id=C},'CURRENT_HEAD_REVIEW_APPROVAL_MISSING');
await blocked('self review by GitHub author',s=>{s.reviews[0].user.login='dev'},'CURRENT_HEAD_REVIEW_APPROVAL_MISSING');
await blocked('unresolved review thread',s=>{s.threads.threads[0].isResolved=false},'UNRESOLVED_REVIEW_THREAD');
await blocked('sensitive workflow path',s=>{s.files[0].filename='.github/workflows/publish.yml'},'HIGH_RISK_FILE_REQUIRES_OWNER');
await blocked('changes requested by reviewer',s=>{s.reviews[0].state='CHANGES_REQUESTED'},'CHANGES_REQUESTED_OUTSTANDING');
await blocked('multiple approvals but later changes requested',s=>{s.reviews.push({id:2,user:{login:'reviewer'},state:'CHANGES_REQUESTED',commit_id:A,submitted_at:'2026-11-14T15:00:00Z'})},'CHANGES_REQUESTED_OUTSTANDING');
await blocked('duplicate changed paths',s=>{s.p.changed_files=2;s.files.push({filename:'src/TEST.mjs'})},'UNSAFE_OR_DUPLICATE_CHANGED_FILE');
await blocked('unknown review author',s=>{s.p.user.login=null},'PR_AUTHOR_UNKNOWN');
await blocked('missing review commit',s=>{delete s.reviews[0].commit_id},'INCOMPLETE_REVIEW_EVIDENCE');

test('PR HEAD changing between read passes blocks hard',async()=>{
  const f=fixture();let reads=0;
  f.api.getPullRequest=async()=>{reads++;let p=clone(f.store.p);if(reads===2)p.head.sha=C;return p};
  await assert.rejects(()=>result(f),/PR changed/);
});
test('base SHA changing between reads blocks hard',async()=>{
  const f=fixture();let reads=0;
  f.api.getPullRequest=async()=>{reads++;let p=clone(f.store.p);if(reads===2)p.base.sha=C;return p};
  await assert.rejects(()=>result(f),/PR changed/);
});
test('truncated file inventory blocks hard',async()=>{
  const f=fixture();f.store.p.changed_files=2;
  await assert.rejects(()=>result(f),/file inventory count mismatch/);
});
test('truncated check run inventory blocks hard',async()=>{
  const f=fixture();f.store.checks.total_count=2;
  await assert.rejects(()=>result(f),/incomplete or stale check-run inventory/);
});
test('truncated review thread inventory blocks hard',async()=>{
  const f=fixture();f.store.threads.complete=false;
  await assert.rejects(()=>result(f),/incomplete review-thread inventory/);
});
test('missing required check names fails before accessing API',async()=>{
  const f=fixture();await assert.rejects(()=>collectIntegratorLivePrEvidence({api:f.api,repository:REPO,prNumber:12,requiredCheckNames:[]}),/required-check list/);
  assert.equal(f.log.length,0);
});
test('missing GitHub adapter methods fails before accessing PR',async()=>{
  const f=fixture();delete f.api.getPullRequestReviewThreads;
  await assert.rejects(()=>result(f),/adapter is missing/);
});
test('permission failure propagates and never returns candidate',async()=>{
  const f=fixture();f.api.getPullRequestCheckRuns=async()=>{throw new Error('GitHub 403')};
  await assert.rejects(()=>result(f),/GitHub 403/);
});
