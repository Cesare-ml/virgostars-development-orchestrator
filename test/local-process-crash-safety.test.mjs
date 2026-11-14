import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runLocalProcessCrashSafety} from '../src/local-process-crash-safety.mjs';

const cli = fileURLToPath(new URL('../scripts/verify-local-process-crash.mjs', import.meta.url));

test('orphaned claim remains after killed owner; competitors cannot take it', async () => {
  const report = await runLocalProcessCrashSafety();
  assert.equal(report.os_processes_spawned, 3);
  assert.equal(report.owner_terminated_without_release, true);
  assert.equal(report.claim_preserved_after_termination, true);
  assert.equal(report.competitor_reclaim_blocked, true);
  assert.equal(report.restarted_label_release_blocked, true);
  assert.equal(report.restarted_label_reclaim_blocked, true);
  assert.equal(report.unreleased_synthetic_claims_before_teardown, 1);
  assert.equal(report.operator_reconciliation_required, true);
  assert.equal(report.github_requests, 0);
  assert.equal(report.crash_recovery_proven, false);
  assert.equal(report.distributed_claim_safety_proven, false);
});

test('repeated process-crash demonstrations have no retained test sandbox', async () => {
  assert.deepEqual(await runLocalProcessCrashSafety(), await runLocalProcessCrashSafety());
});

test('CLI is aggregate-only and does not reveal inherited secrets', () => {
  const result = spawnSync(process.execPath, [cli], {
    encoding: 'utf8', timeout: 20000, maxBuffer: 16384,
    env: {...process.env, GITHUB_TOKEN: 'SECRET_DO_NOT_PRINT',
      VS_PRIVATE_LEDGER_REPO: 'sensitive/private-ledger',
      VS_PRIVATE_TASKS_FILE: 'C:\\private\\tasks.json'}
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.result, 'orphaned-claim-remains-blocked');
  assert.equal(report.private_ledger_verified, false);
  assert.equal(report.merge_authorized, false);
  assert.equal(result.stdout.includes('SECRET_DO_NOT_PRINT'), false);
  assert.equal(result.stdout.includes('sensitive/private-ledger'), false);
  assert.equal(result.stderr, '');
});

test('CLI refuses caller-selected directories and private task parameters', () => {
  const result = spawnSync(process.execPath, [cli, '--repo', 'private/sensitive'], {
    encoding: 'utf8', timeout: 3000
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Unexpected options/);
  assert.equal(result.stderr.includes('private/sensitive'), false);
});

test('verification never reports automatic reclamation or remote readiness', async () => {
  const report = await runLocalProcessCrashSafety();
  assert.equal(report.unreleased_synthetic_claims_before_teardown, 1);
  assert.equal(report.operator_reconciliation_required, true);
  assert.equal(report.private_ledger_verified, false);
  assert.equal(report.crash_recovery_proven, false);
  assert.equal(report.merge_authorized, false);
  assert.equal(report.deploy_authorized, false);
});
