import {fork} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const workerPath = fileURLToPath(new URL('../scripts/local-process-worker.mjs', import.meta.url));
const fail = () => { throw new Error('Synthetic crash rehearsal failed.'); };
const ensure = condition => { if (!condition) fail(); };

// Never forward GitHub credentials or any private-ledger/task settings to a worker.
function safeEnvironment() {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  return env;
}

function spawnSyntheticWorker() {
  const child = fork(workerPath, [], {
    execArgv: [],
    env: safeEnvironment(),
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true
  });
  let serial = 0;

  function request(op, details = {}) {
    return new Promise((resolve, reject) => {
      if (!child.connected) return reject(new Error('Synthetic worker disconnected.'));
      const id = ++serial;
      let settled = false;
      const done = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        child.off('message', onMessage);
        child.off('exit', onExit);
        if (error) reject(error);
        else resolve(value);
      };
      const onMessage = message => {
        if (message?.id !== id) return;
        if (typeof message.status !== 'string' || message.status === 'error') {
          done(new Error('Synthetic worker rejected operation.'));
        } else {
          done(null, message.status);
        }
      };
      const onExit = () => done(new Error('Synthetic worker exited without acknowledgement.'));
      const timeout = setTimeout(() => done(new Error('Synthetic IPC timeout.')), 8000);
      child.on('message', onMessage);
      child.once('exit', onExit);
      child.send({id, op, ...details}, error => {
        if (error) done(new Error('Synthetic IPC send failed.'));
      });
    });
  }

  function waitForExit() {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onExit = () => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        child.off('exit', onExit);
        reject(new Error('Synthetic process did not exit.'));
      }, 8000);
      child.once('exit', onExit);
    });
  }

  async function crash() {
    ensure(child.exitCode === null && child.signalCode === null);
    const exited = waitForExit();
    ensure(child.kill('SIGKILL'));
    await exited;
  }

  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      if (child.connected) await request('stop');
    } catch {
      child.kill();
    }
    try {
      await waitForExit();
    } catch {
      child.kill();
    }
  }

  return {request, crash, stop};
}

/**
 * Demonstrates a deliberately fail-closed outcome after an OS process dies:
 * the exclusive local claim file persists, and neither a new identity nor a
 * worker with the previous synthetic owner label can silently take it over.
 * This is NOT a distributed lease, durable ledger, or real ChatGPT restart.
 */
export async function runLocalCrashRehearsal() {
  const directory = await mkdtemp(join(tmpdir(), 'vs-process-demo-'));
  const claimPath = join(directory, 'synthetic-claim.json');
  const workers = [];
  try {
    const first = spawnSyntheticWorker();
    workers.push(first);
    ensure(await first.request('setup', {directory, owner: 'synthetic-a'}) === 'ready');
    ensure(await first.request('claim') === 'acquired');

    const expected = JSON.stringify({
      schema_version: '1-synthetic-os-process-claim',
      owner: 'synthetic-a'
    });
    ensure(await readFile(claimPath, 'utf8') === expected);

    // An abrupt termination: do not call the worker's normal release path.
    await first.crash();
    ensure(await readFile(claimPath, 'utf8') === expected);

    const competitor = spawnSyntheticWorker();
    workers.push(competitor);
    ensure(await competitor.request('setup', {directory, owner: 'synthetic-b'}) === 'ready');
    ensure(await competitor.request('claim') === 'busy');
    ensure(await competitor.request('release') === 'not-owner');

    const restarted = spawnSyntheticWorker();
    workers.push(restarted);
    ensure(await restarted.request('setup', {directory, owner: 'synthetic-a'}) === 'ready');
    ensure(await restarted.request('claim') === 'busy');
    ensure(await restarted.request('release') === 'not-owner');
    ensure(await readFile(claimPath, 'utf8') === expected);

    return {
      schema_version: '1-local-crash-rehearsal',
      mode: 'isolated-temporary-filesystem',
      independent_os_processes: 3,
      original_owner_crashed_without_release: true,
      original_claim_survived_process_exit: true,
      competing_process_blocked: true,
      restarted_same_identity_blocked: true,
      non_owner_release_blocked: true,
      automatic_recovery_attempts: 0,
      owner_reconciliation_required: true,
      github_requests: 0,
      real_private_ledger_verified: false,
      remote_chat_recovery_proven: false,
      merge_authorized: false,
      deploy_authorized: false,
      result: 'local-crash-fail-closed'
    };
  } finally {
    await Promise.allSettled(workers.map(worker => worker.stop()));
    // Remove only the entirely synthetic sandbox. Never remove a live claim.
    await rm(directory, {recursive: true, force: true});
  }
}
