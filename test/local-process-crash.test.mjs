import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runLocalProcessCrashRehearsal} from '../src/local-process-crash-rehearsal.mjs';

const script = fileURLToPath(new URL('../scripts/rehearse-local-process-crash.mjs', import.meta.url));

test('a crashed owner leaves a claim that blocks a second real OS process', async () => {
  const result = await runLocalProcessCrashRehearsal();
  assert.equal(result.independent_os_processes_started, 3);
  assert.equal(result.forced_owner_terminations, 1);
  assert.equal(result.contender_blocked_before_and_after_crash, true);
  assert.equal(result.non_owner_release_denied, true);
  assert.equal(result.stale_local_claims_inspected, 1);
  assert.equal(result.automatic_reclaims, 0);
  assert.equal(result.manual_sandbox_resets, 1);
  assert.equal(result.contender_reclaim_after_manual_reset, true);
  assert.equal(result.restarted_owner_cannot_release_successor, true);
  assert.equal(result.remaining_synthetic_claims, 0);
});

test('successive isolated rehearsals are independent', async () => {
  assert.deepEqual(await runLocalProcessCrashRehearsal(), await runLocalProcessCrashRehearsal());
});

test('report cannot be mistaken for real crash recovery or live chat coordination', async () => {
  const result = await runLocalProcessCrashRehearsal();
  assert.equal(result.real_private_ledger_verified, false);
  assert.equal(result.production_crash_recovery_implemented, false);
  assert.equal(result.remote_fencing_proven, false);
  assert.equal(result.merge_authorized, false);
  assert.equal(result.deploy_authorized, false);
  assert.equal(result.github_requests, 0);
});

test('CLI uses synthetic data and never prints inherited secrets', () => {
  const child = spawnSync(process.execPath, [script], {
    encoding:'utf8', timeout:15000, maxBuffer:16*1024,
    env:{...process.env, GITHUB_TOKEN:'EXAMPLE_SUPER_SECRET',
      VS_PRIVATE_LEDGER_REPO:'example/private-archive'}
  });
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout);
  assert.equal(report.result, 'local-crash-safety-pass');
  assert.equal(report.github_requests, 0);
  assert.equal(child.stdout.includes('EXAMPLE_SUPER_SECRET'), false);
  assert.equal(child.stdout.includes('example/private-archive'), false);
  assert.equal(child.stderr, '');
});

test('CLI rejects all arguments without echoing user-controlled values', () => {
  const child = spawnSync(process.execPath,
    [script, '--repo', 'example/private-archive'], {encoding:'utf8', timeout:3000});
  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  assert.match(child.stderr, /Unexpected options/);
  assert.equal(child.stderr.includes('example/private-archive'), false);
});
