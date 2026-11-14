import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectIntegratorMergeGate} from '../src/chatgpt-integrator-merge-gate-v1.mjs';

const A='a'.repeat(40), B='b'.repeat(40), C='c'.repeat(40), D='d'.repeat(40);
const REPO='Cesare-ml/virgostars-development-orchestrator';

function evidence() {
  return {
    task:{role:'integrator',access:'merge',status:'ready',repository:REPO,
      pull_request:123,target_branch:'main',approved_manifest_sha:C,
      merge_method:'squash',expected_head_sha:A},
    pr:{number:123,state:'open',draft:false,merged:false,mergeable:true,
      changed_files:1,head:{sha:A,repo:{full_name:REPO}},
      base:{sha:B,ref:'main',repo:{full_name:REPO}}},
    approval:{verified:true,manifest_sha:C,owner_reviewed:true},
    session:{integrator_id:'chat-12345678-1234-4123-8123-123456789abc',author_id:'chat-22345678-1234-4123-8123-123456789abc',
      independent_identity_verified:true},
    reviews:[{state:'APPROVED',head_sha:A,source:'github',
      reviewer_session:'chat-32345678-1234-4123-8123-123456789abc',independence_verified:true}],
    checks:[{name:'test',source:'github',conclusion:'success',head_sha:A}],
    requiredChecks:['test'],
    files:[{filename:'src/example.mjs',status:'added'}],
    dependencies:[{merged:true,merge_sha:D,target_branch:'main'}],
    conflicts:[],
    discussions:{from_github:true,unresolved_count:0,head_sha:A},
    protection:{from_github:true,required_rules_satisfied:true,
      latest_head_sha:A,allowed_merge_method:'squash'}
  };
}
function blocked(e,reason) {
  const result=inspectIntegratorMergeGate(e);
  assert.equal(result.verdict,'blocked');
  assert.equal(result.candidate_for_sha_pinned_merge,false);
  assert.equal(result.merge_authorized,false);
  assert.equal(result.merge_executed,false);
  assert.ok(result.reasons.includes(reason),JSON.stringify(result.reasons));
}
test('candidate remains read-only and never grants merge authorization',()=>{
  const result=inspectIntegratorMergeGate(evidence());
  assert.equal(result.verdict,'candidate');
  assert.equal(result.candidate_for_sha_pinned_merge,true);
  assert.equal(result.merge_authorized,false);
  assert.equal(result.merge_executed,false);
  assert.equal(result.requires_fresh_remote_checks,true);
});
test('rejects an unapproved manifest',()=>{
  const e=evidence(); e.approval.verified=false;
  blocked(e,'OWNER_APPROVAL_NOT_VERIFIED');
});
test('rejects same-session integrator self-merge',()=>{
  const e=evidence(); e.session.author_id=e.session.integrator_id;
  blocked(e,'INDEPENDENT_INTEGRATOR_NOT_VERIFIED');
});
test('rejects stale PR head even with historical passing CI',()=>{
  const e=evidence(); e.pr.head.sha=D;
  blocked(e,'PR_NOT_READY_OR_HEAD_DRIFT');
});
test('rejects a draft PR',()=>{
  const e=evidence(); e.pr.draft=true;
  blocked(e,'PR_NOT_READY_OR_HEAD_DRIFT');
});
test('rejects an unverified protected branch',()=>{
  const e=evidence(); e.protection.from_github=false;
  blocked(e,'BRANCH_PROTECTION_UNVERIFIED');
});
test('rejects no required checks, even with positive approvals',()=>{
  const e=evidence(); e.requiredChecks=[];
  blocked(e,'CHECK_INVENTORY_NOT_VERIFIED');
});
test('rejects stale, failed and missing required checks',()=>{
  for(const checks of [[],[{name:'test',source:'github',conclusion:'failure',head_sha:A}],
    [{name:'test',source:'github',conclusion:'success',head_sha:B}]]) {
    const e=evidence(); e.checks=checks;
    blocked(e,'REQUIRED_HEAD_CHECK_MISSING_OR_FAILED');
  }
});
test('rejects reviews from own agent or unrelated commit',()=>{
  const e=evidence(); e.reviews[0].reviewer_session=e.session.integrator_id;
  blocked(e,'INDEPENDENT_HEAD_REVIEW_MISSING');
  const other=evidence(); other.reviews[0].head_sha=D;
  blocked(other,'INDEPENDENT_HEAD_REVIEW_MISSING');
});
test('rejects sensitive workflow, environment and licensing changes',()=>{
  for(const filename of ['.github/workflows/release.yml','config/.env.production','LICENSE']) {
    const e=evidence(); e.files=[{filename,status:'modified'}];
    blocked(e,'SENSITIVE_CHANGE_REQUIRES_OWNER');
  }
});
test('rejects incomplete or duplicated GitHub changed-file inventories',()=>{
  const e=evidence(); e.pr.changed_files=2;
  blocked(e,'INCOMPLETE_OR_INVALID_FILE_INVENTORY');
  const d=evidence(); d.pr.changed_files=2;
  d.files=[{filename:'src/test.mjs',status:'added'},{filename:'src/TEST.mjs',status:'added'}];
  blocked(d,'DUPLICATE_CHANGED_PATHS');
});
test('rejects pending stacked PR dependencies or overlapping branches',()=>{
  const e=evidence(); e.dependencies[0].merged=false;
  blocked(e,'STACKED_DEPENDENCIES_UNVERIFIED');
  const c=evidence(); c.conflicts=['#456'];
  blocked(c,'OPEN_PR_COLLISIONS_NOT_CLEARED');
});
test('rejects incomplete or unresolved GitHub review discussions',()=>{
  const e=evidence(); e.discussions.unresolved_count=1;
  blocked(e,'UNRESOLVED_OR_UNVERIFIED_REVIEW_THREADS');
});
test('missing evidence fails closed without throwing or merging',()=>{
  blocked({},'INVALID_INTEGRATOR_TASK');
  blocked(undefined,'INVALID_INTEGRATOR_TASK');
});
