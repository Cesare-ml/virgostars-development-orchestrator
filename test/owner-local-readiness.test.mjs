import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assessOwnerLocalReadiness} from '../src/owner-local-readiness.mjs';

const publicSmoke=()=>({
  schema_version:'1-public-alpha-smoke',result:'offline-demo-pass',
  public_discovery_verified:true,synthetic_two_agent_flow_verified:true,
  public_preview_count:5,synthetic_agents:2,live_github_requests:0,
  private_ledger_verified:false,real_multi_agent_pilot_proven:false,
  write_claims_enabled:false,merge_authorized:false,deploy_authorized:false
});
const localProcesses=()=>({
  schema_version:'1-local-process-rehearsal',
  mode:'isolated-temporary-filesystem',
  independent_os_processes:2,simultaneous_claim_attempts:2,
  exclusive_create_winners:1,competing_claims_blocked:1,
  non_owner_release_denied:true,original_owner_release_succeeded:true,
  second_agent_reclaim_after_release:true,
  previous_owner_cannot_release_reclaimed_task:true,
  remaining_synthetic_claims:0,github_requests:0,
  real_private_ledger_verified:false,remote_chat_coordination_proven:false,
  merge_authorized:false,deploy_authorized:false,
  result:'local-concurrency-pass'
});
const script=fileURLToPath(new URL('../scripts/verify-owner-local-readiness.mjs',import.meta.url));

test('gate preserves offline-only safety and explicit private activation blockers',()=>{
  const result=assessOwnerLocalReadiness(publicSmoke(),localProcesses());
  assert.equal(result.result,'offline-checks-pass-live-pilot-blocked');
  assert.equal(result.checks_passed,3);
  assert.equal(result.live_pilot_ready,false);
  assert.equal(result.live_github_requests,0);
  assert.equal(result.real_chat_sessions_tested,0);
  assert.equal(result.next_required_steps.length,5);
  assert.equal(JSON.stringify(result).includes('secret'),false);
});

test('gate rejects fabricated live readiness evidence',()=>{
  const publicResult=publicSmoke(); publicResult.private_ledger_verified=true;
  assert.throws(()=>assessOwnerLocalReadiness(publicResult,localProcesses()),
    /public-private-ledger-verified/);
  const localResult=localProcesses(); localResult.github_requests=1;
  assert.throws(()=>assessOwnerLocalReadiness(publicSmoke(),localResult),
    /local-github-requests/);
  localResult.github_requests=0;localResult.remote_chat_coordination_proven=true;
  assert.throws(()=>assessOwnerLocalReadiness(publicSmoke(),localResult),
    /local-remote-chat-coordination-proven/);
});

test('gate rejects unreliable process ownership evidence and counts',()=>{
  for(const [key,value] of [
    ['exclusive_create_winners',2],['competing_claims_blocked',0],
    ['non_owner_release_denied',false],['remaining_synthetic_claims',1],
    ['previous_owner_cannot_release_reclaimed_task',false]
  ]) {
    const altered=localProcesses(); altered[key]=value;
    assert.throws(()=>assessOwnerLocalReadiness(publicSmoke(),altered),
      /Owner local readiness blocked/);
  }
  const publicResult=publicSmoke();publicResult.public_preview_count=0;
  assert.throws(()=>assessOwnerLocalReadiness(publicResult,localProcesses()),
    /public-aggregate-counts/);
});

test('owner CLI runs all three real offline checks with no credential access',()=>{
  const run=spawnSync(process.execPath,[script],{
    encoding:'utf8',timeout:60_000,maxBuffer:64*1024,windowsHide:true,
    env:{...process.env,GITHUB_TOKEN:'INHERITED_TOKEN_MUST_NOT_LEAK',
      VS_PRIVATE_LEDGER_REPO:'someone/private-do-not-inspect',
      VS_PRIVATE_TASKS_FILE:'C:\\local-secret\\queue.json',
      VS_PRIVATE_TASKS_APPROVED_SHA256:'a'.repeat(64)}
  });
  assert.equal(run.status,0,run.stderr);
  const result=JSON.parse(run.stdout);
  assert.equal(result.checks_passed,3);
  assert.equal(result.live_github_requests,0);
  assert.equal(result.private_ledger_verified,false);
  assert.equal(result.live_pilot_ready,false);
  assert.equal(run.stderr,'');
  for(const secret of ['INHERITED_TOKEN_MUST_NOT_LEAK',
    'someone/private-do-not-inspect','local-secret','a'.repeat(64)]) {
    assert.equal(run.stdout.includes(secret),false);
  }
});

test('owner CLI rejects unexpected options without disclosing their values',()=>{
  const run=spawnSync(process.execPath,[script,'--repo','someone/private'],{
    encoding:'utf8',timeout:5_000,windowsHide:true
  });
  assert.equal(run.status,1);
  assert.equal(run.stdout,'');
  assert.match(run.stderr,/Owner offline readiness check did not pass/);
  assert.equal(run.stderr.includes('someone/private'),false);
});
