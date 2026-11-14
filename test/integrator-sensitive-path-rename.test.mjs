import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectIntegratorChangedFile} from '../src/integrator-changed-file-safety.mjs';
import {inspectIntegratorMergeGate} from '../src/chatgpt-integrator-merge-gate-v1.mjs';
import {collectIntegratorLivePrEvidence} from '../src/integrator-live-pr-evidence.mjs';

const REPO='Cesare-ml/virgostars-development-orchestrator';
const H='a'.repeat(40),BASE='b'.repeat(40),MANIFEST='c'.repeat(40);
const ID='chat-12345678-1234-4123-8123-123456789abc';
const AUTHOR='chat-22345678-1234-4123-8123-123456789abc';
const REVIEWER='chat-32345678-1234-4123-8123-123456789abc';
const simple={filename:'src/new.mjs',status:'renamed',previous_filename:'src/old.mjs'};
function gate(file=simple) {
  return inspectIntegratorMergeGate({
    task:{role:'integrator',access:'merge',status:'ready',repository:REPO,
      pull_request:12,target_branch:'main',approved_manifest_sha:MANIFEST,
      merge_method:'squash',expected_head_sha:H},
    pr:{number:12,state:'open',draft:false,merged:false,mergeable:true,
      changed_files:1,head:{sha:H,repo:{full_name:REPO}},
      base:{sha:BASE,ref:'main',repo:{full_name:REPO}}},
    approval:{verified:true,manifest_sha:MANIFEST,owner_reviewed:true},
    session:{integrator_id:ID,author_id:AUTHOR,independent_identity_verified:true},
    reviews:[{state:'APPROVED',head_sha:H,source:'github',
      reviewer_session:REVIEWER,independence_verified:true}],
    checks:[{name:'ci',source:'github',conclusion:'success',head_sha:H}],
    requiredChecks:['ci'],files:[file],
    dependencies:[],conflicts:[],
    discussions:{from_github:true,unresolved_count:0,head_sha:H},
    protection:{from_github:true,required_rules_satisfied:true,
      latest_head_sha:H,allowed_merge_method:'squash'}
  });
}
async function collector(file=simple) {
  const pr={number:12,state:'open',draft:false,merged:false,mergeable:true,
    changed_files:1,head:{sha:H,ref:'feat/test',repo:{full_name:REPO}},
    base:{sha:BASE,ref:'main',repo:{full_name:REPO}},user:{login:'author'}};
  const api={
    async getPullRequest(){return structuredClone(pr)},
    async getPullRequestFiles(){return [structuredClone(file)]},
    async getPullRequestReviews(){return [{id:7,user:{login:'reviewer'},
      state:'APPROVED',commit_id:H,submitted_at:'2026-11-14T12:00:00Z'}]},
    async getPullRequestCheckRuns(){return {head_sha:H,total_count:1,
      check_runs:[{name:'ci',head_sha:H,status:'completed',conclusion:'success'}]}},
    async getPullRequestReviewThreads(){return {complete:true,total_count:0,threads:[]}}
  };
  return collectIntegratorLivePrEvidence({api,repository:REPO,prNumber:12,requiredCheckNames:['ci']});
}
test('ordinary rename remains a read-only candidate at both gates',async()=>{
  const f=inspectIntegratorChangedFile(simple),a=gate(),b=await collector();
  assert.equal(f.valid,true);assert.equal(f.sensitive,false);
  assert.equal(a.verdict,'candidate');assert.equal(b.verdict,'candidate');
  assert.equal(a.merge_authorized,false);assert.equal(b.merge_authorized,false);
});
test('old governance, workflow, license and manifest paths are all sensitive',async()=>{
  const oldPaths=[
    '.github/workflows/release.yml','CODEOWNERS','.github/CODEOWNERS',
    'docs/CODEOWNERS','LICENSE','LICENSE.md','NOTICE','package-lock.json',
    'pnpm-lock.yaml','Cargo.lock','pyproject.toml','AGENTS.md',
    'config/.env.production','infra/migrations/001.sql'
  ];
  for(const previous_filename of oldPaths){
    const file={...simple,previous_filename};
    const f=inspectIntegratorChangedFile(file),a=gate(file),b=await collector(file);
    assert.equal(f.sensitive,true,previous_filename);
    assert.ok(a.reasons.includes('SENSITIVE_CHANGE_REQUIRES_OWNER'),previous_filename);
    assert.ok(b.reasons.includes('HIGH_RISK_FILE_REQUIRES_OWNER'),previous_filename);
    assert.equal(a.merge_authorized,false);
    assert.equal(b.merge_executed,false);
  }
});
test('new sensitive filename is blocked too',async()=>{
  const file={...simple,filename:'.github/CODEOWNERS'};
  assert.equal(inspectIntegratorChangedFile(file).sensitive,true);
  assert.ok(gate(file).reasons.includes('SENSITIVE_CHANGE_REQUIRES_OWNER'));
  assert.ok((await collector(file)).reasons.includes('HIGH_RISK_FILE_REQUIRES_OWNER'));
});
test('renamed files must include a valid original path',async()=>{
  const files=[
    {filename:'src/new.mjs',status:'renamed'},
    {...simple,previous_filename:'../secrets/key'},
    {...simple,previous_filename:''},
    {...simple,previous_filename:'src//old.mjs'},
    {...simple,previous_filename:'src/new.mjs'}
  ];
  for(const file of files){
    assert.equal(inspectIntegratorChangedFile(file).valid,false);
    assert.ok(gate(file).reasons.includes('INCOMPLETE_OR_INVALID_FILE_INVENTORY'));
    assert.ok((await collector(file)).reasons.includes('UNSAFE_OR_DUPLICATE_CHANGED_FILE'));
  }
});
test('unknown statuses and unexpected previous filename block',async()=>{
  for(const file of [
    {...simple,status:'mystery'},
    {...simple,status:'added'},
    {filename:'src/new.mjs',status:'mystery'}
  ]){
    assert.equal(inspectIntegratorChangedFile(file).valid,false);
    assert.equal(gate(file).verdict,'blocked');
    assert.equal((await collector(file)).verdict,'blocked');
  }
});
test('non-v4, all-zero and synthetic agent IDs cannot pass gate',()=>{
  const badIds=[
    'chat-not-a-v4-id',
    'chat-00000000-0000-0000-0000-000000000000',
    'chat-12345678-1234-1123-8123-123456789abc',
    'chat-12345678-1234-4123-0123-123456789abc',
    'chat-aaaa-bbbb'
  ];
  for(const id of badIds){
    const evidence={
      task:{role:'integrator',access:'merge',status:'ready',repository:REPO,
        pull_request:12,target_branch:'main',approved_manifest_sha:MANIFEST,
        merge_method:'squash',expected_head_sha:H},
      pr:{number:12,state:'open',draft:false,merged:false,mergeable:true,
        changed_files:1,head:{sha:H,repo:{full_name:REPO}},
        base:{sha:BASE,ref:'main',repo:{full_name:REPO}}},
      approval:{verified:true,manifest_sha:MANIFEST,owner_reviewed:true},
      session:{integrator_id:id,author_id:AUTHOR,independent_identity_verified:true},
      reviews:[{state:'APPROVED',head_sha:H,source:'github',
        reviewer_session:REVIEWER,independence_verified:true}],
      checks:[{name:'ci',source:'github',conclusion:'success',head_sha:H}],
      requiredChecks:['ci'],files:[simple],dependencies:[],conflicts:[],
      discussions:{from_github:true,unresolved_count:0,head_sha:H},
      protection:{from_github:true,required_rules_satisfied:true,
        latest_head_sha:H,allowed_merge_method:'squash'}
    };
    const result=inspectIntegratorMergeGate(evidence);
    assert.ok(result.reasons.includes('INDEPENDENT_INTEGRATOR_NOT_VERIFIED'),id);
    assert.equal(result.merge_authorized,false);
  }
});
