import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runLocalProcessRehearsal} from '../src/local-process-rehearsal.mjs';

const script=fileURLToPath(new URL('../scripts/rehearse-local-processes.mjs',import.meta.url));

test('two distinct Node OS processes race on one exclusive local create', async () => {
  const report=await runLocalProcessRehearsal();
  assert.equal(report.independent_os_processes,2);
  assert.equal(report.exclusive_create_winners,1);
  assert.equal(report.competing_claims_blocked,1);
  assert.equal(report.non_owner_release_denied,true);
  assert.equal(report.second_agent_reclaim_after_release,true);
  assert.equal(report.previous_owner_cannot_release_reclaimed_task,true);
  assert.equal(report.remaining_synthetic_claims,0);
  assert.equal(report.remote_chat_coordination_proven,false);
  assert.equal(report.real_private_ledger_verified,false);
});

test('repeated independent rehearsal has no persistent claim state',async () => {
  const first=await runLocalProcessRehearsal();
  const second=await runLocalProcessRehearsal();
  assert.deepEqual(first,second);
});

test('CLI prints only aggregate evidence, never inherited private environment', () => {
  const child=spawnSync(process.execPath,[script],{
    encoding:'utf8',timeout:15000,maxBuffer:16*1024,
    env:{...process.env,GITHUB_TOKEN:'SECRET_DO_NOT_LEAK',
      VS_PRIVATE_LEDGER_REPO:'someone/private-secret',
      VS_PRIVATE_TASKS_FILE:'C:\\private\\file.json'}
  });
  assert.equal(child.status,0);
  const report=JSON.parse(child.stdout);
  assert.equal(report.result,'local-concurrency-pass');
  assert.equal(report.github_requests,0);
  assert.equal(report.remote_chat_coordination_proven,false);
  assert.equal(child.stdout.includes('SECRET_DO_NOT_LEAK'),false);
  assert.equal(child.stdout.includes('someone/private-secret'),false);
  assert.equal(child.stderr,'');
});

test('CLI rejects arbitrary options rather than accepting target task paths',() => {
  const run=spawnSync(process.execPath,[script,'--repo','someone/private'],{
    encoding:'utf8',timeout:3000
  });
  assert.equal(run.status,1);
  assert.equal(run.stdout,'');
  assert.match(run.stderr,/Unexpected options/);
  assert.equal(run.stderr.includes('someone/private'),false);
});

test('worker cannot execute user-supplied path operations as a standalone CLI',() => {
  const worker=fileURLToPath(new URL('../scripts/local-process-worker.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[worker,'/tmp/unsafe'],{
    encoding:'utf8',timeout:3000
  });
  assert.equal(run.status,1);
  assert.equal(run.stdout,'');
});
