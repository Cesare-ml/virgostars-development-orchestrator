import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runLocalProcessCrashRehearsal} from '../src/local-process-crash-rehearsal.mjs';

const script = fileURLToPath(new URL('../scripts/rehearse-local-process-crash.mjs', import.meta.url));

test('dead local worker retains the exclusive claim and denies restart/release', async () => {
  const report = await runLocalProcessCrashRehearsal();
  assert.equal(report.independent_os_processes, 3);
  assert.equal(report.owner_process_terminated, true);
  assert.equal(report.orphaned_claim_preserved, true);
  assert.equal(report.competitor_reclaim_denied, true);
  assert.equal(report.restarted_same_label_reclaim_denied, true);
  assert.equal(report.restarted_same_label_release_denied, true);
  assert.equal(report.non_owner_release_denied, true);
  assert.equal(report.synthetic_orphans_before_sandbox_cleanup, 1);
  assert.equal(report.owner_review_required, true);
  assert.equal(report.automatic_stale_claim_recovery, false);
  assert.equal(report.private_ledger_verified, false);
});

test('repeated crash rehearsals remain independent temporary sandboxes', async () => {
  assert.deepEqual(await runLocalProcessCrashRehearsal(), await runLocalProcessCrashRehearsal());
});

test('CLI returns aggregate evidence without printing inherited private secrets', () => {
  const run = spawnSync(process.execPath, [script], {
    encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024,
    env: {...process.env, GITHUB_TOKEN: 'SECRET_DO_NOT_PRINT',
      VS_PRIVATE_LEDGER_REPO: 'secret-owner/private-ledger'}
  });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.result, 'local-crash-safety-pass');
  assert.equal(report.github_requests, 0);
  assert.equal(report.merge_authorized, false);
  assert.equal(run.stdout.includes('SECRET_DO_NOT_PRINT'), false);
  assert.equal(run.stdout.includes('secret-owner/private-ledger'), false);
  assert.equal(run.stderr, '');
});

test('CLI rejects arbitrary repository/path arguments', () => {
  const run = spawnSync(process.execPath, [script, '--repo', 'secret-owner/private-ledger'], {
    encoding: 'utf8', timeout: 3000
  });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /Unexpected options/);
  assert.equal(run.stderr.includes('secret-owner/private-ledger'), false);
});
