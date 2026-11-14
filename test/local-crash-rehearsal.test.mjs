import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runLocalCrashRehearsal} from '../src/local-crash-rehearsal.mjs';

const cli = fileURLToPath(new URL('../scripts/rehearse-local-crash.mjs', import.meta.url));

test('abruptly lost owner leaves a synthetic claim unavailable to both new and restarted workers', async () => {
  const report = await runLocalCrashRehearsal();
  assert.equal(report.independent_os_processes, 3);
  assert.equal(report.original_owner_crashed_without_release, true);
  assert.equal(report.original_claim_survived_process_exit, true);
  assert.equal(report.competing_process_blocked, true);
  assert.equal(report.restarted_same_identity_blocked, true);
  assert.equal(report.non_owner_release_blocked, true);
  assert.equal(report.automatic_recovery_attempts, 0);
  assert.equal(report.owner_reconciliation_required, true);
  assert.equal(report.github_requests, 0);
  assert.equal(report.real_private_ledger_verified, false);
  assert.equal(report.remote_chat_recovery_proven, false);
  assert.equal(report.merge_authorized, false);
});

test('synthetic crash rehearsal is repeatable with separate fresh sandboxes', async () => {
  const first = await runLocalCrashRehearsal();
  const second = await runLocalCrashRehearsal();
  assert.deepEqual(first, second);
});

test('CLI emits aggregate-only data even when caller environment holds private tokens', () => {
  const run = spawnSync(process.execPath, [cli], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 16384,
    env: {
      ...process.env,
      GITHUB_TOKEN: 'DO_NOT_EXPOSE_CRASH_TOKEN_123',
      VS_PRIVATE_LEDGER_REPO: 'synthetic-owner/private-sensitive',
      VS_PRIVATE_TASKS_FILE: 'C:\\private\\secret-tasks.json'
    }
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  const report = JSON.parse(run.stdout);
  assert.equal(report.result, 'local-crash-fail-closed');
  assert.equal(report.github_requests, 0);
  assert.equal(report.remote_chat_recovery_proven, false);
  assert.equal(run.stdout.includes('DO_NOT_EXPOSE_CRASH_TOKEN_123'), false);
  assert.equal(run.stdout.includes('private-sensitive'), false);
  assert.equal(run.stdout.includes('secret-tasks'), false);
  assert.equal(run.stdout.includes('synthetic-claim.json'), false);
});

test('CLI rejects arbitrary target or file arguments before running', () => {
  const run = spawnSync(process.execPath, [cli, '--repo', 'someone/private'], {
    encoding: 'utf8', timeout: 5000
  });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /Unexpected options/);
  assert.equal(run.stderr.includes('someone\/private'), false);
});
