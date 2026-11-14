import test from 'node:test';
import assert from 'node:assert/strict';
import {verifySubmissionFreshness} from '../src/submission-freshness.mjs';
import {auditTaskPullRequest} from '../src/pr-audit.mjs';

const R='Cesare-ml/astrological-functions',H='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const task={
  repository:R,issue:5,status:'ready',role:'developer',access:'write',pilot_wave:2,
  upstream_pr:3,upstream_branch:'agent/provider-contract-validation-20261110',
  resource_scope:{id:'provider-smoke',roots:[
    'src/ephemeris-provider.js','test/pilot-provider-consumer-smoke.test.mjs'
  ]}
};
const repo={full_name:R};
const pull=(head=H,base=B,changed=2)=>({
  number:6,state:'open',draft:true,changed_files:changed,
  head:{sha:head,ref:'pilot/provider-consumer',repo},
  base:{sha:base,ref:task.upstream_branch,repo}
});
const upstream=(sha=B)=>({state:'open',head:{sha,ref:task.upstream_branch}});
const files=task.resource_scope.roots.map(filename=>({filename,status:'added'}));
const marker=(overrides={})=>({
  state:'submitted',target_repository:R,issue_number:5,
  role:'developer',access:'write',session_id:'chat-synthetic',
  pull_request:6,audited_head_sha:H,audited_base_sha:B,
  scope_verdict:'scope-clean',last_handoff:{head_sha:H,summary:'Draft PR #6 reviewed'},
  ...overrides
});
function api({delivery=pull(),source=upstream(),changedFiles=files,fail=null}={}) {
  return {
    async getPullRequest(_repo,number){
      if(fail) throw fail;
      return number===task.upstream_pr?source:delivery;
    },
    async getPullRequestFiles(){return changedFiles;}
  };
}
const verify=(a,m=marker())=>verifySubmissionFreshness({api:a,task,marker:m});

test('current exact PR and upstream SHA preserve submitted, never mark approved',async()=>{
  const x=await verify(api());
  assert.equal(x.state,'submitted');
  assert.equal(x.pr_check.recorded_head,H);
  assert.equal(x.pr_check.current_head,H);
  assert.equal(x.pr_check.approved,false);
  assert.equal(x.pr_check.independently_tested,false);
});
test('new delivery commit after submission is stale even if file scope still looks clean',async()=>{
  const x=await verify(api({delivery:pull(C)}));
  assert.equal(x.state,'stale-submission');
  assert.equal(x.pr_check.current_head,C);
  assert.equal(x.pr_check.live_scope_verdict,'scope-clean');
});
test('upstream HEAD moved without rebasing the stacked PR is stale',async()=>{
  const x=await verify(api({source:upstream(C)}));
  assert.equal(x.state,'stale-submission');
  assert.equal(x.pr_check.live_scope_verdict,'blocked');
  assert.ok(x.pr_check.live_reasons.includes('UPSTREAM_MOVED'));
});
test('out of scope changes after submission block the old clean marker',async()=>{
  const x=await verify(api({delivery:pull(H,B,3),changedFiles:[
    ...files,{filename:'src/index.mjs',status:'modified'}
  ]}));
  assert.equal(x.state,'stale-submission');
  assert.ok(x.pr_check.live_reasons.includes('OUTSIDE_APPROVED_SCOPE'));
});
test('manual-only connector submission retains independent audit requirement',async()=>{
  const x=await verify(api(),marker({scope_verdict:'manual-reviewed'}));
  assert.equal(x.state,'needs-scope-audit');
  assert.equal(x.pr_check.live_scope_verdict,'scope-clean');
});
test('missing PR number cannot be reported as scope-clean or trigger API reads',async()=>{
  const x=await verify({getPullRequest(){throw new Error('should not call')}},marker({pull_request:null}));
  assert.equal(x.state,'needs-scope-audit');
  assert.equal(x.pr_check,null);
});
test('handoff mismatch or missing base audit remains pending independent review',async()=>{
  const x=await verify(api(),marker({last_handoff:{head_sha:C,summary:'Wrong HEAD'}}));
  assert.equal(x.state,'needs-scope-audit');
  const y=await verify(api(),marker({audited_base_sha:null}));
  assert.equal(y.state,'needs-scope-audit');
});
test('GitHub permission failure propagates: never return a false clean result',async()=>{
  await assert.rejects(()=>verify(api({fail:new Error('GitHub 403')})),/403/);
});
test('PR head mutating between metadata and file fetch fails closed',async()=>{
  let calls=0;
  const changing={
    async getPullRequest(_r,n){
      if(n===3)return upstream();
      calls++;
      return calls===1?pull():pull(C);
    },
    async getPullRequestFiles(){return files;}
  };
  await assert.rejects(
    ()=>auditTaskPullRequest({api:changing,tasks:[task],repo:R,issue:5,prNumber:6}),
    /changed during audit/
  );
});
