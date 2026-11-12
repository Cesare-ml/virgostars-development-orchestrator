import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSubmittedDeveloper} from '../src/review-gates.mjs';
import {GitHubError} from '../src/github.mjs';

const R='Cesare-ml/astrological-functions',A='a'.repeat(40);
const B='b'.repeat(40),C='c'.repeat(40),D='d'.repeat(40);
const roots=['src/ephemeris-provider.js','test/pilot-provider-consumer-smoke.test.mjs'];
const task={repository:R,issue:5,role:'developer',access:'write',status:'ready',
  pilot_wave:2,upstream_pr:3,upstream_branch:'agent/provider-contract-validation-20261110',
  resource_scope:{id:'provider-consumer-pilot',roots}};
const repo={full_name:R};
const upstream=(head=B)=>({number:3,state:'open',draft:true,changed_files:20,
  head:{ref:task.upstream_branch,sha:head,repo},
  base:{ref:'main',sha:D,repo}});
const draft=(n=6,head=A)=>({number:n,state:'open',draft:true,changed_files:2,
  head:{ref:'agent/consumer-'+n,sha:head,repo},
  base:{ref:task.upstream_branch,sha:B,repo}});
const files=roots.map(filename=>({filename,status:'added'}));
const marker=(patch={})=>({
  state:'submitted',target_repository:R,issue_number:5,role:'developer',access:'write',
  pull_request:6,audited_head_sha:A,audited_base_sha:B,scope_verdict:'scope-clean',
  last_handoff:{head_sha:A,summary:'Draft PR and tests documented'},
  ...patch
});
function api({duplicated=false,upstreamHead=B,deliveryHead=A,outside=false,fail=false,
  missingCandidate=false}={}) {
  let scans=0;
  const delivered=draft(6,deliveryHead);
  const competing=draft(7,C);
  const base=upstream(upstreamHead);
  return {
    get scans(){return scans},
    async getIssue(){return {state:'open'};},
    async getOpenPullRequests(){
      scans++;
      return [base,...(missingCandidate?[]:[delivered]),...(duplicated?[competing]:[])];
    },
    async getPullRequest(_repo,n){
      if(fail)throw new GitHubError(403);
      if(n===3)return base;
      if(n===7)return competing;
      return delivered;
    },
    async getPullRequestFiles(_repo,n){
      if(fail)throw new GitHubError(403);
      if(n===7)return files;
      return outside?[files[0],{filename:'src/index.mjs',status:'modified'}]:files;
    }
  };
}
test('one current matching draft is still NOT approved or integration ready',async()=>{
  const client=api();
  const state=await assessSubmittedDeveloper({api:client,task,marker:marker()});
  assert.equal(state.status,'submitted');
  assert.equal(state.collisions.status,'single-candidate');
  assert.equal(state.collisions.delivery_is_unique_candidate,true);
  assert.equal(state.review_gates.integration_ready,false);
  assert.equal(state.review_gates.merge_authorized,false);
  assert.ok(state.review_gates.blockers.includes('INDEPENDENT_NATIVE_TESTS_NOT_VERIFIED'));
  assert.ok(state.review_gates.blockers.includes('INDEPENDENT_CODE_REVIEW_PENDING'));
  assert.equal(client.scans,2);
});
test('manual-only marker must not be upgraded by live path inspection',async()=>{
  const state=await assessSubmittedDeveloper({
    api:api(),task,marker:marker({scope_verdict:'manual-reviewed'})
  });
  assert.equal(state.status,'needs-scope-audit');
  assert.ok(state.review_gates.blockers.includes('INDEPENDENT_SCOPE_AUDIT_REQUIRED'));
});
test('two draft PRs touching the same file are explicit blockers',async()=>{
  const state=await assessSubmittedDeveloper({api:api({duplicated:true}),task,marker:marker()});
  assert.equal(state.status,'submitted');
  assert.equal(state.collisions.status,'conflict');
  assert.deepEqual(state.collisions.candidates.map(x=>x.number),[6,7]);
  assert.ok(state.review_gates.blockers.includes('OVERLAPPING_OPEN_PULL_REQUESTS'));
  assert.match(state.warning,/Competing open pull requests/);
});
test('upstream drift and duplicate PRs remain separately visible',async()=>{
  const state=await assessSubmittedDeveloper({
    api:api({duplicated:true,upstreamHead:C}),task,marker:marker()
  });
  assert.equal(state.status,'stale-submission');
  assert.ok(state.review_gates.blockers.includes('STALE_DELIVERY_OR_UPSTREAM'));
  assert.ok(state.review_gates.blockers.includes('OVERLAPPING_OPEN_PULL_REQUESTS'));
  assert.equal(state.pr_check.current_upstream,C);
});
test('delivery push after snapshot is stale even if its diff is in scope',async()=>{
  const state=await assessSubmittedDeveloper({
    api:api({deliveryHead:C}),task,marker:marker()
  });
  assert.equal(state.status,'stale-submission');
  assert.ok(state.review_gates.blockers.includes('STALE_DELIVERY_OR_UPSTREAM'));
});
test('missing recorded PR never looks clean or skips manual review',async()=>{
  const client=api();
  const state=await assessSubmittedDeveloper({
    api:client,task,marker:marker({pull_request:null})
  });
  assert.equal(state.status,'needs-scope-audit');
  assert.equal(state.collisions,null);
  assert.equal(client.scans,0);
  assert.ok(state.review_gates.blockers.includes('DELIVERY_PR_NOT_RECORDED'));
  assert.ok(state.review_gates.blockers.includes('LIVE_COLLISION_SCAN_NOT_POSSIBLE'));
});
test('recorded PR not in open candidate inventory cannot pass',async()=>{
  const state=await assessSubmittedDeveloper({
    api:api({missingCandidate:true}),task,marker:marker()
  });
  assert.equal(state.collisions.status,'no-open-candidates');
  assert.ok(state.review_gates.blockers.includes('DELIVERY_PR_NOT_UNIQUE_OPEN_CANDIDATE'));
});
test('scope violation remains stale without hiding other integration blockers',async()=>{
  const state=await assessSubmittedDeveloper({
    api:api({outside:true}),task,marker:marker()
  });
  assert.equal(state.status,'stale-submission');
  assert.ok(state.pr_check.live_reasons.includes('OUTSIDE_APPROVED_SCOPE'));
  assert.ok(state.review_gates.blockers.includes('INDEPENDENT_NATIVE_TESTS_NOT_VERIFIED'));
});
test('GitHub REST permission errors stop report (fail closed)',async()=>{
  await assert.rejects(()=>assessSubmittedDeveloper({
    api:api({fail:true}),task,marker:marker()
  }),GitHubError);
});
test('read-only tasks and mismatched markers are rejected',async()=>{
  await assert.rejects(()=>assessSubmittedDeveloper({
    api:api(),task:{...task,role:'reviewer',access:'read'},marker:marker()
  }),/curated write/);
  await assert.rejects(()=>assessSubmittedDeveloper({
    api:api(),task,marker:marker({issue_number:123})
  }),/matching submitted marker/);
});
