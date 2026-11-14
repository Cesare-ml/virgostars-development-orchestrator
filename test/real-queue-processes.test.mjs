import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/rehearse-real-queue-processes.mjs',import.meta.url));
function run(args=[],env={}) {
  return spawnSync(process.execPath,[script,...args],{
    env:{...process.env,...env},encoding:'utf8',timeout:25000
  });
}

test('two OS processes execute actual claimNext and owner release with IPC claim CAS',()=>{
  const child=run();
  assert.equal(child.error,undefined,child.error?.message);
  assert.equal(child.status,0,child.stderr);
  assert.equal(child.stderr,'');
  const report=JSON.parse(child.stdout);
  assert.equal(report.result,'offline-queue-process-pass');
  assert.equal(report.mode,'synthetic-ipc-shared-memory');
  assert.equal(report.independent_node_processes,2);
  for(const field of ['real_queue_functions_exercised',
    'exclusive_issue_and_resource_claim_verified','same_session_resumption_verified',
    'non_owner_release_rejected','former_owner_release_rejected',
    'successor_claim_after_release_verified']) assert.equal(report[field],true,field);
  assert.equal(report.remaining_issue_claims,0);
  assert.equal(report.remaining_resource_locks,0);
  assert.equal(report.github_requests,0);
  assert.equal(report.real_private_ledger_verified,false);
  assert.equal(report.actual_browser_chat_concurrency_proven,false);
});

test('the parent never passes owner tokens or private activation configuration to workers',()=>{
  const sentinel='secret-do-not-log-queue-processes';
  const child=run([],{
    GITHUB_TOKEN:sentinel,GH_TOKEN:sentinel,
    VS_PRIVATE_LEDGER_REPO:sentinel,VS_PRIVATE_TASKS_FILE:sentinel,
    VS_PRIVATE_TASKS_APPROVED_SHA256:sentinel
  });
  assert.equal(child.status,0,child.stderr);
  assert.equal(JSON.parse(child.stdout).github_requests,0);
  assert.doesNotMatch(child.stdout+child.stderr,
    /secret-do-not-log|example-synthetic|chat-1111|coordination\/claims|GITHUB_TOKEN/);
});

test('offline process integration rehearsal is repeatable with no state reuse',()=>{
  const a=run(),b=run();
  assert.equal(a.status,0,a.stderr);
  assert.equal(b.status,0,b.stderr);
  assert.deepEqual(JSON.parse(a.stdout),JSON.parse(b.stdout));
});

test('unknown flags and standalone worker access fail without reporting task data',()=>{
  for(const args of [['--submit'],['--worker'],['--worker','chat-11111111-1111-4111-8111-111111111111']]) {
    const child=run(args);
    assert.equal(child.status,1);
    assert.equal(child.stdout,'');
    assert.doesNotMatch(child.stderr,/example-synthetic|GITHUB_TOKEN|coordination\/claims/);
  }
});