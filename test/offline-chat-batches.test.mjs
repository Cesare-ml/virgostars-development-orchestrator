import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  runOfflineFleetStress,validateArrivalBatches,validateReopenAfterWave
} from '../src/offline-fleet-stress.mjs';

const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
const cleanEnv=()=>{
  const env={...process.env,
    VS_PRIVATE_LEDGER_REPO:'must-never-be-printed',
    VS_PRIVATE_TASKS_FILE:'nonexistent-owner-task-file'
  };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  return env;
};

test('second 10-chat batch preserves ten earlier owners and twenty simultaneous locks',async()=>{
  const result=await runOfflineFleetStress({agents:20,batches:[10,10]});
  assert.equal(result.verdict,'synthetic-stress-pass');
  assert.deepEqual(result.arrival_batch_sizes,[10,10]);
  assert.equal(result.earlier_session_resumes_verified,10);
  assert.equal(result.earlier_claims_preserved,true);
  assert.equal(result.unique_claims,20);
  assert.equal(result.unique_resource_locks,20);
  assert.equal(result.submitted_markers,20);
  assert.equal(result.remaining_issue_claims,0);
  assert.equal(result.remaining_resource_locks,0);
  assert.equal(result.real_github_requests,0);
  assert.equal(result.real_multi_chat_concurrency_proven,false);
  assert.equal(result.automatic_merges_or_deploys,0);
});

test('multiple waves retain earlier owners until all 40 synthetic agents finish',async()=>{
  const batches=[5,10,10,15];
  const result=await runOfflineFleetStress({agents:40,batches});
  assert.deepEqual(result.arrival_batch_sizes,batches);
  // Revalidates 5 existing sessions after wave 2, 15 after wave 3,
  // and 25 after wave 4: 45 identity/ownership checks.
  assert.equal(result.earlier_session_resumes_verified,45);
  assert.equal(result.unique_claims,40);
  assert.equal(result.submitted_markers,40);
  assert.equal(result.remaining_resource_locks,0);
});

test('arrival schedule validates positive integer counts and exact total',()=>{
  assert.deepEqual(validateArrivalBatches(undefined,10),[10]);
  assert.deepEqual(validateArrivalBatches(null,10),[10]);
  assert.deepEqual(validateArrivalBatches([10,10],20),[10,10]);
  for(const invalid of [[],[20],[0,20],[-1,21],[1.5,18.5],
    [1,'19'],['10','10'],[1,40],[10,9],new Array(41).fill(1),
    '10,10',{},[NaN,20],[Infinity,1]]) {
    assert.throws(()=>validateArrivalBatches(invalid,20),
      /Arrival batches|Arrival batch sizes/);
  }
  assert.throws(()=>validateArrivalBatches([10,10],41),/integer between 2 and 40/);
});

test('CLI --batches 10,10 works without tokens and emits aggregate-only report',()=>{
  const run=spawnSync(process.execPath,[cli,'stress-fleet','--batches','10,10'],{
    encoding:'utf8',env:cleanEnv(),timeout:30000
  });
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stderr,'');
  const result=JSON.parse(run.stdout);
  assert.deepEqual(result.arrival_batch_sizes,[10,10]);
  assert.equal(result.requested_agents,20);
  assert.equal(result.earlier_session_resumes_verified,10);
  assert.equal(result.real_github_requests,0);
  assert.doesNotMatch(run.stdout,
    /must-never-be-printed|nonexistent-owner-task-file|example-synthetic|chat-[0-9a-f]|coordination\/claims|GITHUB_TOKEN/);
});

test('CLI refuses malformed, over-capacity and mismatched batch schedules',()=>{
  const invalid=[
    ['--batches','10'],['--batches','0,20'],['--batches','10,-10'],
    ['--batches','10,'],['--batches','10,10,21'],
    ['--batches','1,1','--agents','5'],
    ['--batches','10,10','--agents','19'],
    ['--batches','10,10','--role','developer'],
    ['--batches','2.5,2']
  ];
  for(const args of invalid) {
    const run=spawnSync(process.execPath,[cli,'stress-fleet',...args],{
      encoding:'utf8',env:cleanEnv(),timeout:15000
    });
    assert.equal(run.status,1,args.join(' ')+': '+run.stderr);
    assert.equal(run.stdout,'');
    assert.match(run.stderr,/stress-fleet|Arrival batch|Offline fleet size/);
  }
});

test('reopening after first 10-chat wave preserves ownership with a fresh adapter',async()=>{
  const result=await runOfflineFleetStress({
    agents:20,batches:[10,10],reopenAfterWave:1
  });
  assert.equal(result.verdict,'synthetic-stress-pass');
  assert.equal(result.synthetic_adapter_recreated,true);
  assert.equal(result.reopened_after_wave,1);
  assert.equal(result.restored_session_resumes_verified,10);
  assert.equal(result.restored_ledger_entries_verified,20);
  assert.equal(result.earlier_session_resumes_verified,10);
  assert.equal(result.submitted_markers,20);
  assert.equal(result.remaining_issue_claims,0);
  assert.equal(result.remaining_resource_locks,0);
  assert.equal(result.real_external_storage_durability_proven,false);
  assert.equal(result.real_github_requests,0);
});

test('reopening after wave two retains all earlier owners through later waves',async()=>{
  const result=await runOfflineFleetStress({
    agents:40,batches:[5,10,10,15],reopenAfterWave:2
  });
  assert.equal(result.reopened_after_wave,2);
  assert.equal(result.restored_session_resumes_verified,15);
  assert.equal(result.restored_ledger_entries_verified,30);
  assert.equal(result.earlier_session_resumes_verified,45);
  assert.equal(result.submitted_markers,40);
  assert.equal(result.remaining_resource_locks,0);
});

test('reopen index is strictly between the first and last wave',async()=>{
  assert.equal(validateReopenAfterWave(null,[10,10]),null);
  assert.equal(validateReopenAfterWave(undefined,[10,10]),null);
  assert.equal(validateReopenAfterWave(1,[10,10]),1);
  assert.equal(validateReopenAfterWave(2,[5,10,10,15]),2);
  for(const invalid of [0,-1,2,1.5,'1',NaN,Infinity,1e100]) {
    assert.throws(()=>validateReopenAfterWave(invalid,[10,10]),
      /Reopen-after-wave/);
    await assert.rejects(()=>runOfflineFleetStress({
      agents:20,batches:[10,10],reopenAfterWave:invalid
    }),/Reopen-after-wave/);
  }
  await assert.rejects(()=>runOfflineFleetStress({
    agents:20,reopenAfterWave:1
  }),/Reopen-after-wave/);
});

test('CLI reconstructs synthetic ledger offline and prints only aggregates',()=>{
  const run=spawnSync(process.execPath,[
    cli,'stress-fleet','--batches','10,10','--reopen-after-wave','1'
  ],{encoding:'utf8',env:cleanEnv(),timeout:30000});
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stderr,'');
  const result=JSON.parse(run.stdout);
  assert.equal(result.restored_session_resumes_verified,10);
  assert.equal(result.restored_ledger_entries_verified,20);
  assert.equal(result.synthetic_adapter_recreated,true);
  assert.equal(result.real_github_requests,0);
  assert.doesNotMatch(run.stdout,
    /must-never-be-printed|nonexistent-owner-task-file|example-synthetic|chat-[0-9a-f]|coordination\/claims|GITHUB_TOKEN/);
});

test('CLI refuses invalid, final-wave or unscoped reopen requests',()=>{
  const invalid=[
    ['--reopen-after-wave','1'],
    ['--batches','10,10','--reopen-after-wave','0'],
    ['--batches','10,10','--reopen-after-wave','2'],
    ['--batches','10,10','--reopen-after-wave','-1'],
    ['--batches','10,10','--reopen-after-wave','1.5'],
    ['--batches','10,10','--reopen-after-wave','1','--role','developer']
  ];
  for(const args of invalid) {
    const run=spawnSync(process.execPath,[cli,'stress-fleet',...args],{
      encoding:'utf8',env:cleanEnv(),timeout:15000
    });
    assert.equal(run.status,1,args.join(' ')+': '+run.stderr);
    assert.equal(run.stdout,'');
    assert.match(run.stderr,/stress-fleet|Reopen-after-wave/);
  }
});

test('no reopen keeps the existing default aggregate counters unchanged',async()=>{
  const result=await runOfflineFleetStress({agents:20,batches:[10,10]});
  assert.equal(result.reopened_after_wave,null);
  assert.equal(result.synthetic_adapter_recreated,false);
  assert.equal(result.restored_session_resumes_verified,0);
  assert.equal(result.restored_ledger_entries_verified,0);
  assert.equal(result.earlier_session_resumes_verified,10);
});
