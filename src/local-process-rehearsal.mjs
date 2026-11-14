import {mkdtemp, readFile, rm, access} from 'node:fs/promises';
import {fork} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const fail = () => {throw new Error('Independent-process rehearsal failed.');};
const ensure = condition => {if (!condition) fail();};
const childScript = fileURLToPath(new URL('../scripts/local-process-worker.mjs',import.meta.url));

// An explicit allowlist prevents private GitHub credentials and owner-only
// ledger settings leaking into synthetic child workers.
function safeChildEnvironment() {
  const env = {};
  for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']) {
    if (typeof process.env[name] === 'string') env[name] = process.env[name];
  }
  return env;
}

function startWorker() {
  const child = fork(childScript, [], {
    execArgv: [], env: safeChildEnvironment(),
    stdio: ['ignore','ignore','ignore','ipc'], windowsHide: true
  });
  let nextId = 0;
  function request(op, details = {}) {
    return new Promise((resolve, reject) => {
      if (!child.connected) return reject(new Error('Worker disconnected.'));
      const id = ++nextId;
      const done = () => {
        clearTimeout(timer);
        child.off('message', onMessage);
        child.off('exit', onExit);
      };
      const onMessage = message => {
        if (message?.id !== id) return;
        done();
        if (message.status === 'error' || typeof message.status !== 'string')
          reject(new Error('Worker rejected a synthetic operation.'));
        else resolve(message.status);
      };
      const onExit = () => {done(); reject(new Error('Worker exited early.'));};
      const timer = setTimeout(() => {
        done(); reject(new Error('Worker IPC timed out.'));
      }, 10000);
      child.on('message', onMessage);
      child.once('exit', onExit);
      child.send({id,op,...details}, error => {if(error) {done(); reject(new Error('Worker IPC failed.'));}});
    });
  }
  async function stop() {
    try {
      if (child.connected) await request('stop');
    } catch {child.kill();}
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const timer=setTimeout(() => {child.kill(); resolve();}, 1000);
        child.once('exit', () => {clearTimeout(timer); resolve();});
      });
    }
  }
  return {request,stop};
}

/**
 * Real OS process contention, but only a synthetic *local* filesystem test.
 * Never contacts GitHub, reads owner catalogs or creates real task claims.
 */
export async function runLocalProcessRehearsal() {
  const directory = await mkdtemp(join(tmpdir(),'vs-process-demo-'));
  const claimFile = join(directory,'synthetic-claim.json');
  const workers=[];
  try {
    const a=startWorker(), b=startWorker();
    workers.push(a,b);
    const setup=await Promise.all([
      a.request('setup',{directory,owner:'synthetic-a'}),
      b.request('setup',{directory,owner:'synthetic-b'})
    ]);
    ensure(setup.every(s=>s==='ready'));
    // These are independent Node PIDs racing for the same wx file.
    const attempts=await Promise.all([a.request('claim'),b.request('claim')]);
    ensure(attempts.filter(s=>s==='acquired').length===1 &&
           attempts.filter(s=>s==='busy').length===1);
    const winner=attempts.indexOf('acquired');
    const loser=1-winner;
    const content=JSON.parse(await readFile(claimFile,'utf8'));
    ensure(content.schema_version==='1-synthetic-os-process-claim' &&
      content.owner===(winner===0?'synthetic-a':'synthetic-b'));
    const denied=await workers[loser].request('release');
    ensure(denied==='not-owner');
    ensure((await readFile(claimFile,'utf8')).length>0);
    const firstRelease=await workers[winner].request('release');
    ensure(firstRelease==='released');
    await access(claimFile).then(fail, error=>ensure(error?.code==='ENOENT'));
    const reclaimed=await workers[loser].request('claim');
    ensure(reclaimed==='acquired');
    const oldOwnerDenied=await workers[winner].request('release');
    ensure(oldOwnerDenied==='not-owner');
    const secondRelease=await workers[loser].request('release');
    ensure(secondRelease==='released');
    await access(claimFile).then(fail, error=>ensure(error?.code==='ENOENT'));
    return {
      schema_version:'1-local-process-rehearsal',
      mode:'isolated-temporary-filesystem',
      independent_os_processes:2,
      simultaneous_claim_attempts:2,
      exclusive_create_winners:1,
      competing_claims_blocked:1,
      non_owner_release_denied:true,
      original_owner_release_succeeded:true,
      second_agent_reclaim_after_release:true,
      previous_owner_cannot_release_reclaimed_task:true,
      remaining_synthetic_claims:0,
      github_requests:0,
      real_private_ledger_verified:false,
      remote_chat_coordination_proven:false,
      merge_authorized:false,
      deploy_authorized:false,
      result:'local-concurrency-pass'
    };
  } finally {
    await Promise.allSettled(workers.map(w=>w.stop()));
    await rm(directory,{recursive:true,force:true});
  }
}
