#!/usr/bin/env node
// Offline integration rehearsal: actual claimNext/handoff/release in TWO OS
// processes, a synchronous parent-owned synthetic GitHub claim store over IPC.
// No GitHub client, token, private ledger or real tasks are used.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GitHubError } from '../src/github.mjs';
import { claimNext } from '../src/queue.mjs';
import { handoff, release } from '../src/claims.mjs';

const REPOSITORY='example-synthetic/queue-process';
const LEDGER='example-synthetic/isolated-local-ledger';
const BRANCH='coordination/claims';
const SESSIONS=[
  'chat-11111111-1111-4111-8111-111111111111',
  'chat-22222222-2222-4222-8222-222222222222'
];
const config={
  claim_store:{repo:LEDGER,branch:BRANCH},
  active_repositories:[{full_name:REPOSITORY,pilot_enabled:true}]
};
const tasks=[{
  repository:REPOSITORY,issue:101,status:'ready',role:'developer',
  access:'write',title:'Synthetic offline contention task',
  resource_scope:{id:'local-exclusive',roots:['test/synthetic-claim.test.mjs']}
}];
const clone=value=>value===undefined?undefined:structuredClone(value);
function requireCondition(condition,reason) {
  if(!condition) throw new Error('Queue process rehearsal failed: '+reason);
}

// Each child runs the real coordinator functions through an IPC-backed API.
async function worker(session) {
  if(!process.send || !SESSIONS.includes(session))
    throw new Error('The offline worker requires a parent IPC channel.');
  for(const key of ['GITHUB_TOKEN','GH_TOKEN','VS_PRIVATE_LEDGER_REPO',
    'VS_PRIVATE_TASKS_FILE','VS_PRIVATE_TASKS_APPROVED_SHA256']) {
    if(Object.hasOwn(process.env,key)) throw new Error('Unsafe inherited worker environment.');
  }
  let rpcId=0;
  const waiting=new Map();
  const call=(method,...args)=>new Promise((resolve,reject)=>{
    const id=++rpcId;
    waiting.set(id,{resolve,reject});
    process.send({kind:'rpc',id,method,args});
  });
  const api=Object.fromEntries(
    ['getClaim','createClaim','updateClaim','deleteClaim','getIssue']
      .map(method=>[method,(...args)=>call(method,...args)]));
  process.on('message',async message=>{
    if(message?.kind==='rpc-result') {
      const current=waiting.get(message.id);
      if(!current)return;
      waiting.delete(message.id);
      if(message.ok) current.resolve(message.value);
      else current.reject(message.status ? new GitHubError(message.status) :
        new Error('Synthetic IPC operation rejected.'));
      return;
    }
    if(message?.kind!=='run')return;
    try {
      let result;
      if(message.action==='claim') {
        result=await claimNext({api,config,tasks,session,role:'developer'});
        result={result:result.result,contended:result.contended??0};
      } else if(message.action==='handoff') {
        result=await handoff({api,config,repo:REPOSITORY,issue:101,session,
          summary:'Synthetic process-local handoff; no PR and no code changes.',
          branchName:'synthetic/local',headSha:'a'.repeat(40),
          now:()=> '2026-01-01T00:00:00.000Z'});
        result={result:result.result};
      } else if(message.action==='release') {
        result=await release({api,config,repo:REPOSITORY,issue:101,
          session,confirm:true});
        result={result:result.result};
      } else throw new Error('Unsupported synthetic action.');
      process.send({kind:'outcome',id:message.id,ok:true,result});
    } catch(error) {
      // Never send operational record data or exception stacks to the parent.
      process.send({kind:'outcome',id:message.id,ok:false,
        rejected_not_owner:/Not the current owner/.test(error.message)});
    }
  });
  process.send({kind:'ready'});
}

// This is a local IPC stub of the GitHub Contents API's create-if-absent
// and SHA-conditional update/delete semantics. It is NOT a GitHub emulator.
function makeStore() {
  const files=new Map();
  let sequence=0,requests=0;
  const keyCheck=(repo,path,branch)=>{
    if(repo!==LEDGER || branch!==BRANCH ||
      !/^(claims|resources)\/example-synthetic__queue-process\/[a-z0-9.-]+\.json$/.test(path))
      throw new Error('Unexpected synthetic claim path.');
  };
  const service=(method,args)=>{
    requests++;
    if(method==='getIssue') {
      if(args[0]!==REPOSITORY || args[1]!==101)
        throw new Error('Unexpected synthetic issue.');
      return {number:101,state:'open'};
    }
    if(!['getClaim','createClaim','updateClaim','deleteClaim'].includes(method))
      throw new Error('Unexpected method.');
    const [repo,path,branch]=args;
    keyCheck(repo,path,branch);
    const current=files.get(path);
    if(method==='getClaim')return clone(current??null);
    if(method==='createClaim') {
      if(current)throw new GitHubError(422);
      files.set(path,{sha:(++sequence).toString(16).padStart(40,'0'),data:clone(args[3])});
      return null;
    }
    if(!current || current.sha!==args[3])throw new GitHubError(409);
    if(method==='updateClaim') {
      files.set(path,{sha:(++sequence).toString(16).padStart(40,'0'),data:clone(args[4])});
    } else files.delete(path);
    return null;
  };
  const count=prefix=>[...files.keys()].filter(path=>path.startsWith(prefix+'/')).length;
  return {service,count,get requests(){return requests;}};
}

async function rehearse() {
  const store=makeStore();
  const workers=[];
  const executable=fileURLToPath(import.meta.url);
  const environment={};
  for(const name of ['SystemRoot','WINDIR','PATH','TMP','TEMP','HOME']) {
    if(process.env[name])environment[name]=process.env[name];
  }
  const waiters=[];
  let aborted=false;
  function spawnWorker(session) {
    const child=fork(executable,['--worker',session],{
      env:environment,execArgv:[],stdio:['ignore','ignore','ignore','ipc']
    });
    let resolveReady,rejectReady;
    const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    const pending=new Map();
    const fail=()=>{
      aborted=true;
      rejectReady(new Error('Synthetic worker exited before completion.'));
      for(const {reject} of pending.values())reject(new Error('Synthetic worker exited.'));
      pending.clear();
    };
    child.on('error',fail);
    child.on('exit',fail);
    child.on('message',message=>{
      if(message?.kind==='ready') {resolveReady();return;}
      if(message?.kind==='rpc') {
        let response;
        try { response={ok:true,value:store.service(message.method,message.args)}; }
        catch(error){ response={ok:false,status:error instanceof GitHubError?error.status:null}; }
        if(child.connected)child.send({kind:'rpc-result',id:message.id,...response});
      } else if(message?.kind==='outcome') {
        const callbacks=pending.get(message.id);
        if(callbacks) {pending.delete(message.id);callbacks.resolve(message);}
      }
    });
    let id=0;
    const ask=action=>new Promise((resolve,reject)=>{
      if(aborted || !child.connected)return reject(new Error('Synthetic worker unavailable.'));
      const requestId=++id;
      pending.set(requestId,{resolve,reject});
      child.send({kind:'run',id:requestId,action});
    });
    return {child,ready,ask};
  }
  try {
    for(const session of SESSIONS)workers.push(spawnWorker(session));
    const timeout=setTimeout(()=>{
      aborted=true;
      for(const worker of workers)worker.child.kill();
    },15000);
    timeout.unref();
    waiters.push(timeout);
    await Promise.all(workers.map(w=>w.ready));
    const first=await Promise.all(workers.map(w=>w.ask('claim')));
    requireCondition(first.every(x=>x.ok), 'initial contenders must complete.');
    const winner=first.findIndex(x=>x.result.result==='acquired');
    const loser=1-winner;
    requireCondition(winner!==-1 && first[loser].result.result==='no-task' &&
      first[loser].result.contended===1,'exactly one process must acquire.');
    requireCondition(store.count('claims')===1 && store.count('resources')===1,
      'winning write task must own BOTH locks.');
    const resumed=await workers[winner].ask('claim');
    requireCondition(resumed.ok && resumed.result.result==='already-owned',
      'same session must resume original ownership.');
    const foreign=await workers[loser].ask('release');
    requireCondition(!foreign.ok && foreign.rejected_not_owner,
      'non-owner must not release a claim.');
    requireCondition((await workers[winner].ask('handoff')).result?.result==='handoff-saved',
      'winner must persist a factual handoff.');
    requireCondition((await workers[winner].ask('release')).result?.result==='released',
      'winner release must succeed.');
    const reclaimed=await workers[loser].ask('claim');
    requireCondition(reclaimed.ok && reclaimed.result.result==='acquired',
      'other process must acquire only after release.');
    const stale=await workers[winner].ask('release');
    requireCondition(!stale.ok && stale.rejected_not_owner,
      'former owner must not release successor claim.');
    requireCondition((await workers[loser].ask('handoff')).result?.result==='handoff-saved' &&
      (await workers[loser].ask('release')).result?.result==='released',
      'second owner must hand off and release.');
    requireCondition(store.count('claims')===0 && store.count('resources')===0,
      'all synthetic locks must be released.');
    return {
      schema_version:'1-queue-cross-process-offline',
      mode:'synthetic-ipc-shared-memory',
      independent_node_processes:2,
      real_queue_functions_exercised:true,
      exclusive_issue_and_resource_claim_verified:true,
      same_session_resumption_verified:true,
      non_owner_release_rejected:true,
      former_owner_release_rejected:true,
      successor_claim_after_release_verified:true,
      remaining_issue_claims:store.count('claims'),
      remaining_resource_locks:store.count('resources'),
      github_requests:0,
      real_private_ledger_verified:false,
      actual_browser_chat_concurrency_proven:false,
      result:'offline-queue-process-pass'
    };
  } finally {
    for(const timer of waiters)clearTimeout(timer);
    for(const w of workers)w.child.kill();
  }
}

if(process.argv[2]==='--worker' && process.argv.length===4) {
  worker(process.argv[3]).catch(()=>{process.stderr.write('Offline worker rejected.\n');process.exitCode=1;});
} else if(process.argv.length===2) {
  try {process.stdout.write(JSON.stringify(await rehearse(),null,2)+'\n');}
  catch {process.stderr.write('ERROR: Offline queue process rehearsal failed.\n');process.exitCode=1;}
} else {
  process.stderr.write('ERROR: Unexpected arguments for offline queue process rehearsal.\n');
  process.exitCode=1;
}