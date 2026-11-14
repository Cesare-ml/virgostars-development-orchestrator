import {mkdtemp, readFile, lstat, unlink, access, rm} from 'node:fs/promises';
import {fork} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const workerScript = fileURLToPath(new URL('../scripts/local-process-worker.mjs', import.meta.url));
const fail = () => { throw new Error('Synthetic crash rehearsal failed.'); };
const requireCondition = value => { if (!value) fail(); };
const hasExited = child => child.exitCode !== null || child.signalCode !== null;

function minimalEnvironment() {
  const result = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']) {
    if (typeof process.env[key] === 'string') result[key] = process.env[key];
  }
  return result;
}

function waitForExit(child, timeout = 3000) {
  return new Promise((resolve, reject) => {
    if (hasExited(child)) return resolve();
    const onExit = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      reject(new Error('Synthetic worker did not exit.'));
    }, timeout);
    child.once('exit', onExit);
  });
}

function startWorker() {
  const child = fork(workerScript, [], {
    execArgv: [], env: minimalEnvironment(),
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true
  });
  let sequence = 0;
  const request = (op, details = {}) => new Promise((resolve, reject) => {
    if (!child.connected || hasExited(child)) return reject(new Error('Worker is unavailable.'));
    const id = ++sequence;
    const cleanup = () => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
    };
    const onMessage = message => {
      if (message?.id !== id) return;
      cleanup();
      if (message.status === 'error' || typeof message.status !== 'string') {
        reject(new Error('Synthetic worker refused the operation.'));
      } else resolve(message.status);
    };
    const onExit = () => { cleanup(); reject(new Error('Synthetic worker exited unexpectedly.')); };
    const timer = setTimeout(() => {
      cleanup(); reject(new Error('Synthetic worker operation timed out.'));
    }, 10000);
    child.on('message', onMessage);
    child.once('exit', onExit);
    try {
      child.send({id, op, ...details}, error => {
        if (error) { cleanup(); reject(new Error('Synthetic IPC send failed.')); }
      });
    } catch {
      cleanup(); reject(new Error('Synthetic IPC send failed.'));
    }
  });
  const crash = async () => {
    requireCondition(!hasExited(child));
    const exit = waitForExit(child);
    requireCondition(child.kill('SIGKILL'));
    await exit;
  };
  const stop = async () => {
    if (hasExited(child)) return;
    try { if (child.connected) await request('stop'); }
    catch { child.kill('SIGKILL'); }
    try { await waitForExit(child, 1000); }
    catch { child.kill('SIGKILL'); await waitForExit(child, 1000).catch(() => {}); }
  };
  return {request, crash, stop};
}

async function mustBeAbsent(path) {
  await access(path).then(fail, error => requireCondition(error?.code === 'ENOENT'));
}

/**
 * A deliberately LOCAL, isolated crash/claim-liveness drill.
 * The manual reset below is authorized only by this test's own fresh temp directory.
 * Never reuse it for real user tasks, GitHub claims or production recovery.
 */
export async function runLocalProcessCrashRehearsal() {
  const directory = await mkdtemp(join(tmpdir(), 'vs-process-demo-'));
  const claimPath = join(directory, 'synthetic-claim.json');
  const workers = [];
  try {
    const original = startWorker();
    const contender = startWorker();
    workers.push(original, contender);
    const setup = await Promise.all([
      original.request('setup', {directory, owner:'synthetic-a'}),
      contender.request('setup', {directory, owner:'synthetic-b'})
    ]);
    requireCondition(setup.every(status => status === 'ready'));
    requireCondition(await original.request('claim') === 'acquired');
    requireCondition(await contender.request('claim') === 'busy');

    // An ungraceful OS-level process termination never invokes 'release'.
    await original.crash();
    requireCondition(await contender.request('claim') === 'busy');
    requireCondition(await contender.request('release') === 'not-owner');
    const metadata = await lstat(claimPath);
    requireCondition(metadata.isFile() && !metadata.isSymbolicLink());
    const claim = JSON.parse(await readFile(claimPath, 'utf8'));
    requireCondition(Object.keys(claim).sort().join(',') === 'owner,schema_version');
    requireCondition(claim.schema_version === '1-synthetic-os-process-claim' &&
                     claim.owner === 'synthetic-a');

    // The operator action is only simulated against this uniquely owned sandbox.
    // In a real coordinator, staleness requires separate human/fencing safeguards.
    await unlink(claimPath);
    await mustBeAbsent(claimPath);
    requireCondition(await contender.request('claim') === 'acquired');
    const restarted = startWorker();
    workers.push(restarted);
    requireCondition(await restarted.request('setup', {
      directory, owner:'synthetic-a'
    }) === 'ready');
    requireCondition(await restarted.request('release') === 'not-owner');
    requireCondition(await restarted.request('claim') === 'busy');
    requireCondition(await contender.request('release') === 'released');
    await mustBeAbsent(claimPath);

    return {
      schema_version:'1-local-process-crash-rehearsal',
      mode:'isolated-temporary-filesystem',
      independent_os_processes_started:3,
      forced_owner_terminations:1,
      contender_blocked_before_and_after_crash:true,
      non_owner_release_denied:true,
      stale_local_claims_inspected:1,
      automatic_reclaims:0,
      manual_sandbox_resets:1,
      contender_reclaim_after_manual_reset:true,
      restarted_owner_cannot_release_successor:true,
      remaining_synthetic_claims:0,
      github_requests:0,
      real_private_ledger_verified:false,
      production_crash_recovery_implemented:false,
      remote_fencing_proven:false,
      merge_authorized:false,
      deploy_authorized:false,
      result:'local-crash-safety-pass'
    };
  } finally {
    await Promise.allSettled(workers.map(worker => worker.stop()));
    await rm(directory, {recursive:true, force:true});
  }
}
