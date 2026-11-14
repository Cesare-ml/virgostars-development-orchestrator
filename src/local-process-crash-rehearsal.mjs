import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {fork} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const workerFile = fileURLToPath(new URL('../scripts/local-process-worker.mjs', import.meta.url));
const fail = () => { throw new Error('Synthetic crash rehearsal failed.'); };
const ensure = condition => { if (!condition) fail(); };

function safeEnvironment() {
  const env = {};
  for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']) {
    if (typeof process.env[name] === 'string') env[name] = process.env[name];
  }
  return env;
}

function createWorker() {
  const child = fork(workerFile, [], {
    execArgv: [], env: safeEnvironment(),
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true
  });
  let sequence = 0;
  function request(op, fields = {}) {
    return new Promise((resolve, reject) => {
      if (!child.connected) return reject(new Error('Synthetic worker disconnected.'));
      const id = ++sequence;
      const cleanup = () => {
        clearTimeout(timeout);
        child.off('message', onMessage);
        child.off('exit', onExit);
      };
      const onMessage = message => {
        if (message?.id !== id) return;
        cleanup();
        if (typeof message.status !== 'string' || message.status === 'error')
          reject(new Error('Synthetic worker operation rejected.'));
        else resolve(message.status);
      };
      const onExit = () => {
        cleanup();
        reject(new Error('Synthetic worker exited during an operation.'));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Synthetic worker operation timed out.'));
      }, 8000);
      child.on('message', onMessage);
      child.once('exit', onExit);
      child.send({id, op, ...fields}, error => {
        if (error) {
          cleanup();
          reject(new Error('Synthetic worker IPC failed.'));
        }
      });
    });
  }
  async function terminate() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => {
      const timer = setTimeout(resolve, 2500);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    child.kill();
    await exited;
    ensure(child.exitCode !== null || child.signalCode !== null);
  }
  return {request, terminate};
}

/**
 * Tokenless, temporary-filesystem crash experiment. A dead owner must not
 * automatically free its claim, even when a new process uses the same label.
 */
export async function runLocalProcessCrashRehearsal() {
  const directory = await mkdtemp(join(tmpdir(), 'vs-process-demo-'));
  const claimPath = join(directory, 'synthetic-claim.json');
  const workers = [];
  try {
    const owner = createWorker();
    const competitor = createWorker();
    workers.push(owner, competitor);
    ensure((await owner.request('setup', {directory, owner: 'synthetic-a'})) === 'ready');
    ensure((await competitor.request('setup', {directory, owner: 'synthetic-b'})) === 'ready');
    ensure((await owner.request('claim')) === 'acquired');
    ensure((await competitor.request('claim')) === 'busy');

    const before = await readFile(claimPath, 'utf8');
    const record = JSON.parse(before);
    ensure(record?.schema_version === '1-synthetic-os-process-claim' &&
      record.owner === 'synthetic-a');

    // Kill the process, not the claim file: there is intentionally no TTL.
    await owner.terminate();
    ensure((await readFile(claimPath, 'utf8')) === before);
    ensure((await competitor.request('claim')) === 'busy');

    const replacement = createWorker();
    workers.push(replacement);
    ensure((await replacement.request('setup', {directory, owner: 'synthetic-a'})) === 'ready');
    ensure((await replacement.request('claim')) === 'busy');
    ensure((await replacement.request('release')) === 'not-owner');
    ensure((await competitor.request('release')) === 'not-owner');
    ensure((await readFile(claimPath, 'utf8')) === before);

    return {
      schema_version: '1-local-process-crash-rehearsal',
      mode: 'isolated-temporary-filesystem',
      independent_os_processes: 3,
      owner_process_terminated: true,
      orphaned_claim_preserved: true,
      competitor_reclaim_denied: true,
      restarted_same_label_reclaim_denied: true,
      restarted_same_label_release_denied: true,
      non_owner_release_denied: true,
      synthetic_orphans_before_sandbox_cleanup: 1,
      owner_review_required: true,
      automatic_stale_claim_recovery: false,
      github_requests: 0,
      private_ledger_verified: false,
      cross_machine_fencing_proven: false,
      merge_authorized: false,
      deploy_authorized: false,
      result: 'local-crash-safety-pass'
    };
  } finally {
    await Promise.allSettled(workers.map(worker => worker.terminate()));
    await rm(directory, {recursive: true, force: true});
  }
}
