import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  runOfflineFleetStress,validateReopenAfterWave
} from '../src/offline-fleet-stress.mjs';

const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
const environment=()=>{
  const env={...process.env,
    VS_PRIVATE_LEDGER_REPO:'recovery-secret-never-print',
    VS_PRIVATE_TASKS_FILE:'recovery-owner-file-never-print'
  };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  return env;
};

test('10+10: fresh adapter recovers first ten sessions and preserves their resource locks',async()=>{
  const result=await runOfflineFleetStress({
    agents:20,batches:[10,10],reopenAfterWave:1
  });
  assert.equal(result.verdict,'synthetic-stress-pass');
  assert.deepEqual(result.arrival_batch_sizes,[10,10]);
  assert.equal(result.adapter_reopened_after_wave,1);
  assert.equal(result.reopened_session_resumes_verified,10);
  assert.equal(result.earlier_session_resumes_verified,10);
  assert.equal(result.earlier_claims_preserved,true);
  assert.equal(result.unique_claims,20);
  assert.equal(result.unique_resource_locks,20);
  assert.equal(result.submitted_markers,20);
  assert.equal(result.remaining_issue_claims,0);
  assert.equal(result.remaining_resource_locks,0);
  assert.equal(result.real_github_requests,0);
  assert.equal(result.real_private_ledger_verified,false);
  assert.equal(result.real_multi_chat_concurrency_proven,false);
  assert.equal(result.automatic_merges_or_deploys,0);
});

test('40: adapter may reopen after a later wave with 25 existing owners',async()=>{
  const result=await runOfflineFleetStress({
    agents:40,batches:[5,10,10,15],reopenAfterWave:3
  });
  assert.equal(result.adapter_reopened_after_wave,3);
  assert.equal(result.reopened_session_resumes_verified,25);
  assert.equal(result.earlier_session_resumes_verified,45);
  assert.equal(result.submitted_markers,40);
  assert.equal(result.remaining_resource_locks,0);
});

test('reopened simulation keeps normal assignments, submissions and write count',async()=>{
  const normal=await runOfflineFleetStress({agents:20,batches:[10,10]});
  const recovered=await runOfflineFleetStress({
    agents:20,batches:[10,10],reopenAfterWave:1
  });
  assert.deepEqual(
    Object.fromEntries(Object.entries(recovered).filter(([key])=>
      !['adapter_reopened_after_wave','reopened_session_resumes_verified'].includes(key))),
    Object.fromEntries(Object.entries(normal).filter(([key])=>
      !['adapter_reopened_after_wave','reopened_session_resumes_verified'].includes(key)))
  );
  assert.equal(normal.adapter_reopened_after_wave,null);
  assert.equal(normal.reopened_session_resumes_verified,0);
});

test('invalid reopen points fail before simulated claims',async()=>{
  const batches=[10,10];
  assert.equal(validateReopenAfterWave(null,batches),null);
  assert.equal(validateReopenAfterWave(undefined,batches),null);
  assert.equal(validateReopenAfterWave(1,batches),1);
  for(const value of [0,-1,2,3,1.5,'1',NaN,Infinity]) {
    assert.throws(()=>validateReopenAfterWave(value,batches),/Reopen-after-wave/);
  }
  await assert.rejects(()=>runOfflineFleetStress({agents:20,batches,reopenAfterWave:2}),
    /Reopen-after-wave/);
  await assert.rejects(()=>runOfflineFleetStress({agents:20,reopenAfterWave:1}),
    /Reopen-after-wave/);
});

test('CLI supports synthetic adapter reopening, ignores credentials and redacts identities',()=>{
  const run=spawnSync(process.execPath,[
    cli,'stress-fleet','--batches','10,10','--reopen-after-wave','1'
  ],{encoding:'utf8',env:environment(),timeout:30000});
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stderr,'');
  const report=JSON.parse(run.stdout);
  assert.equal(report.requested_agents,20);
  assert.equal(report.reopened_session_resumes_verified,10);
  assert.equal(report.adapter_reopened_after_wave,1);
  assert.equal(report.real_github_requests,0);
  assert.doesNotMatch(run.stdout,
    /recovery-secret-never-print|recovery-owner-file-never-print|example-synthetic|chat-[0-9a-f]|coordination\/claims|GITHUB_TOKEN/);
});

test('CLI rejects omitted batches, malformed and final/out-of-range reopen points',()=>{
  const cases=[
    ['--reopen-after-wave','1'],
    ['--batches','10,10','--reopen-after-wave','0'],
    ['--batches','10,10','--reopen-after-wave','2'],
    ['--batches','10,10','--reopen-after-wave','21'],
    ['--batches','10,10','--reopen-after-wave','x'],
    ['--batches','10,10','--reopen-after-wave','1.5'],
    ['--batches','10,10','--reopen-after-wave','-1'],
    ['--batches','10,10','--reopen-after-wave','1','--agents','19']
  ];
  for(const args of cases) {
    const run=spawnSync(process.execPath,[cli,'stress-fleet',...args],{
      encoding:'utf8',env:environment(),timeout:15000
    });
    assert.equal(run.status,1,args.join(' ')+': '+run.stderr);
    assert.equal(run.stdout,'');
    assert.match(run.stderr,/stress-fleet|Reopen-after-wave|Arrival batch/);
  }
});
