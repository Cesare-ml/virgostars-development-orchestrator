import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runOfflineTwoAgentRehearsal} from '../src/offline-two-agent-rehearsal.mjs';

const CLI=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));

test('two real claim/submit/release paths complete on synthetic in-memory fixtures',async()=>{
  const result=await runOfflineTwoAgentRehearsal();
  assert.equal(result.schema_version,'1-offline-two-agent-rehearsal');
  assert.equal(result.result,'synthetic-rehearsal-pass');
  assert.equal(result.mode,'synthetic-in-memory-only');
  assert.equal(result.agents_started_in_parallel,2);
  assert.equal(result.independently_claimed_tasks,2);
  assert.equal(result.third_agent_denied,true);
  assert.equal(result.exclusive_issue_and_resource_locks_verified,true);
  assert.equal(result.shared_partition_concurrent_writers,2);
  assert.equal(result.shared_partition_exclusive_claim_verified,true);
  assert.equal(result.blocked_writer_reacquired_after_owner_release,true);
  assert.equal(result.remaining_contention_issue_claims,0);
  assert.equal(result.remaining_contention_resource_locks,0);
  assert.equal(result.competing_pr_submission_blocked,true);
  assert.equal(result.original_owner_retained_on_conflict,true);
  assert.equal(result.competing_pr_recovery_submitted,true);
  assert.equal(result.interrupted_release_blocked,true);
  assert.equal(result.original_owner_retry_succeeded,true);
  assert.equal(result.submitted_markers,2);
  assert.equal(result.remaining_issue_claims,0);
  assert.equal(result.remaining_resource_locks,0);
  assert.equal(result.submitted_tasks_reoffered,false);
  assert.equal(result.github_requests,0);
  assert.equal(result.real_pull_requests_created,0);
  assert.equal(result.code_changes_performed,0);
  assert.equal(result.live_tests_executed,0);
  assert.equal(result.real_private_ledger_verified,false);
  assert.equal(result.real_multi_agent_pilot_proven,false);
});

test('offline rehearsal is reproducible on repeat runs without shared state',async()=>{
  const first=await runOfflineTwoAgentRehearsal();
  const second=await runOfflineTwoAgentRehearsal();
  assert.deepEqual(first,second);
  assert.equal(first.remaining_resource_locks,0);
});

test('CLI rehearsal runs without GitHub token and never dumps identities',()=>{
  const env={...process.env};
  delete env.GITHUB_TOKEN;delete env.GH_TOKEN;
  env.VS_PRIVATE_LEDGER_REPO='not-a-real-private-repository';
  env.VS_PRIVATE_TASKS_FILE='not-a-real-local-file';
  const result=spawnSync(process.execPath,[CLI,'rehearse-two-agents'],{
    env,encoding:'utf8',timeout:15000
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stderr,'');
  const report=JSON.parse(result.stdout);
  assert.equal(report.result,'synthetic-rehearsal-pass');
  assert.equal(report.github_requests,0);
  assert.doesNotMatch(result.stdout,
    /example-synthetic|not-a-real|chat-1111|codex-2222|coordination\/claims|GITHUB_TOKEN/);
});

test('CLI rehearsal fails closed for extra flags and arguments',()=>{
  const env={...process.env};delete env.GITHUB_TOKEN;
  for(const arg of ['--confirm','private/ledger']) {
    const result=spawnSync(process.execPath,[CLI,'rehearse-two-agents',arg],{
      env,encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,1);
    assert.match(result.stderr,/takes no arguments/);
    assert.equal(result.stdout,'');
  }
});
