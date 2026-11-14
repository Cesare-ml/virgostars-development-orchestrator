import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import {fork} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const workerScript = fileURLToPath(new URL('../scripts/local-process-worker.mjs', import.meta.url));
const requireEvidence = value => { if (!value) throw new Error('Local orphan-claim safety rehearsal failed.'); };

function minimalEnvironment() {
  const env = {};
  for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']) {
    if (typeof process.env[name] === 'string') env[name] = process.env[name];
  }
  return env;
}

function startSyntheticWorker() {
  const child = fork(workerScript, [], {
    execArgv: [], env: minimalEnvironment(),
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true
  });
  let nextId = 0;
  let exited = false;
  child.once('exit', () => { exited = true; });

  function request(op, details = {}) {
    return new Promise((resolve, reject) => {
      if (exited || !child.connected) return reject(new Error('Synthetic worker unavailable.'));
      const id = ++nextId;
      const done = () => {
        clearTimeout(timer);
        child.off('message', onMessage);
        child.off('exit', onExit);
        child.off('error', onError);
      };
      const onMessage = message => {
        if (message?.id !== id) return;
        done();
        if (typeof message.status !== 'string' || message.status === 'error')
          reject(new Error('Synthetic worker operation failed.'));
        else resolve(message.status);
      };
      const onExit = () => { done(); reject(new Error('Synthetic worker exited unexpectedly.')); };
      const onError = () => { done(); reject(new Error('Synthetic worker error.')); };
      const timer = setTimeout(() => { done(); reject(new Error('Synthetic worker request timed out.')); }, 10000);
      child.on('message', onMessage);
      child.once('exit', onExit);
      child.once('error', onError);
      try {
        child.send({id, op, ...details}, error => {
          if (error) { done(); reject(new Error('Synthetic worker IPC failed.')); }
        });
      } catch { done(); reject(new Error('Synthetic worker IPC failed.')); }
    });
  }

  async function terminateWithoutRelease() {
    if (exited || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        child.off('exit', onExit);
        child.off('error', onError);
      };
      const onExit = () => { done(); resolve(); };
      const onError = () => { done(); reject(new Error('Synthetic worker termination failed.')); };
      const timer = setTimeout(() => {
        done(); reject(new Error('Synthetic worker did not terminate.'));
      }, 10000);
      child.once('exit', onExit);
      child.once('error', onError);
      if (!child.kill('SIGKILL') && !exited) {
        done(); reject(new Error('Synthetic worker could not be terminated.'));
      }
    });
  }
  return {request, terminateWithoutRelease};
}

/**
 * Only demonstrates fail-closed *local* orphan handling after an OS process exit.
 * Never reclaims a claim, calls GitHub, or performs owner-private coordination.
 */
export async function runLocalProcessCrashSafety() {
  const directory = await mkdtemp(join(tmpdir(), 'vs-process-demo-'));
  const claimFile = join(directory, 'synthetic-claim.json');
  const workers = [];
  try {
    const original = startSyntheticWorker();
    workers.push(original);
    const competitor = startSyntheticWorker();
    workers.push(competitor);

    requireEvidence(await original.request('setup', {directory, owner: 'synthetic-a'}) === 'ready');
    requireEvidence(await competitor.request('setup', {directory, owner: 'synthetic-b'}) === 'ready');
    requireEvidence(await original.request('claim') === 'acquired');
    requireEvidence(await competitor.request('claim') === 'busy');
    const claimBytes = await readFile(claimFile, 'utf8');
    requireEvidence(JSON.stringify({schema_version:'1-synthetic-os-process-claim',owner:'synthetic-a'}) === claimBytes);

    // Intentionally terminate the owner without a release / IPC stop command.
    await original.terminateWithoutRelease();
    requireEvidence(await readFile(claimFile, 'utf8') === claimBytes);
    requireEvidence(await competitor.request('claim') === 'busy');
    requireEvidence(await competitor.request('release') === 'not-owner');

    // A fresh OS process with the old synthetic *label* is not the old owner.
    const restarted = startSyntheticWorker();
    workers.push(restarted);
    requireEvidence(await restarted.request('setup', {directory, owner: 'synthetic-a'}) === 'ready');
    requireEvidence(await restarted.request('release') === 'not-owner');
    requireEvidence(await restarted.request('claim') === 'busy');
    requireEvidence(await readFile(claimFile, 'utf8') === claimBytes);
    return {
      schema_version: '1-local-process-orphan-safety',
      mode: 'isolated-temporary-filesystem',
      os_processes_spawned: 3,
      owner_terminated_without_release: true,
      claim_preserved_after_termination: true,
      competitor_reclaim_blocked: true,
      restarted_label_release_blocked: true,
      restarted_label_reclaim_blocked: true,
      unreleased_synthetic_claims_before_teardown: 1,
      operator_reconciliation_required: true,
      github_requests: 0,
      private_ledger_verified: false,
      crash_recovery_proven: false,
      distributed_claim_safety_proven: false,
      merge_authorized: false,
      deploy_authorized: false,
      result: 'orphaned-claim-remains-blocked'
    };
  } finally {
    const terminations = await Promise.allSettled(workers.map(w => w.terminateWithoutRelease()));
    await rm(directory, {recursive: true, force: true});
    await access(directory).then(() => { throw new Error('Test sandbox cleanup failed.'); }, error => {
      if (error?.code !== 'ENOENT') throw new Error('Test sandbox cleanup failed.');
    });
    requireEvidence(terminations.every(result => result.status === 'fulfilled'));
  }
}
