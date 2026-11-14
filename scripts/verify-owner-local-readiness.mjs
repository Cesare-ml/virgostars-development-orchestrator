#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assessOwnerLocalReadiness} from '../src/owner-local-readiness.mjs';

// Never pass GitHub tokens, local task paths, private destination names or
// arbitrary command arguments to the two offline child scripts.
const env={};
for(const key of ['SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP']) {
  if(typeof process.env[key]==='string') env[key]=process.env[key];
}
function offlineReport(script) {
  const path=fileURLToPath(new URL(script,import.meta.url));
  const run=spawnSync(process.execPath,[path],{
    env,encoding:'utf8',timeout:45_000,maxBuffer:64*1024,windowsHide:true
  });
  if(run.error||run.signal||run.status!==0||run.stderr!=='') throw new Error('offline-child-failed');
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new Error('offline-child-invalid-json');
  }
}

try {
  if(process.argv.length!==2) throw new Error('unexpected-arguments');
  const publicSmoke=offlineReport('./verify-public-alpha-smoke.mjs');
  const localProcesses=offlineReport('./rehearse-local-processes.mjs');
  process.stdout.write(JSON.stringify(
    assessOwnerLocalReadiness(publicSmoke,localProcesses),null,2)+'\n');
} catch {
  // Deliberately avoid printing child stderr, arguments, paths or inherited env.
  process.stderr.write('ERROR: Owner offline readiness check did not pass.\n');
  process.exitCode=1;
}
