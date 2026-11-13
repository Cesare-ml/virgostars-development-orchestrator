import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  runOfflineFleetStress,validateReopenAfterWave
} from '../src/offline-fleet-stress.mjs';

const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
function offlineEnv() {
  const env={...process.env,
    VS_PRIVATE_TASKS_FILE:'must-not-read-this-private-file',
    VS_PRIVATE_LEDGER_REPO:'must-not-print-this-private-ledger'
  };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  return env;
}

test('10+10 reopening reconstructs an independent ledger and preserves old owners',async()=>{
  const ordinary=await runOfflineFleetStress({agents:20,batches:[10,10]});
  const reopened=await runOfflineFleetStress({
    agents:20,batches:[10,10],reopenAfterWave:1
  });
  assert.equal(reopened.verdict,'synthetic-stress-pass');
  assert.equal(reopened.reopened_after_wave,1);
  assert.equal(reopened.restored_session_resumes_verified,10);
  assert.equal(reopened.restored_live_issue_claims,10);
  assert.equal(reopened.restored_live_resource_locks,10);
  assert.equal(reopened.restored_submission_markers,0);
  assert.equal(reopened.restored_ledger_entries_preserved,true);
  assert.equal(reopened.earlier_session_resumes_verified,10);
  assert.equal(reopened.unique_claims,20);
  assert.equal(reopened.submitted_markers,20);
  assert.equal(reopened.remaining_issue_claims,0);
  assert.equal(reopened.remaining_resource_locks,0);
  assert.equal(reopened.completed_tasks_reoffered,false);
  assert.equal(reopened.synthetic_ledger_mutations,ordinary.synthetic_ledger_mutations);
  assert.equal(Object.hasOwn(ordinary,'reopened_after_wave'),false);
  assert.equal(Object.hasOwn(ordinary,'restored_live_issue_claims'),false);
});

test('reopening works at any non-final boundary of four arrival waves',async()=>{
  for(const [waveIndex,expectedClaims] of [[1,5],[2,15],[3,25]]) {
    const result=await runOfflineFleetStress({
      agents:40,batches:[5,10,10,15],reopenAfterWave:waveIndex
    });
    assert.equal(result.reopened_after_wave,waveIndex);
    assert.equal(result.restored_session_resumes_verified,expectedClaims);
    assert.equal(result.restored_live_issue_claims,expectedClaims);
    assert.equal(result.restored_live_resource_locks,expectedClaims);
    assert.equal(result.restored_submission_markers,0);
    assert.equal(result.earlier_session_resumes_verified,45);
    assert.equal(result.unique_claims,40);
    assert.equal(result.submitted_markers,40);
    assert.equal(result.remaining_resource_locks,0);
  }
});

test('invalid reopening boundaries fail before synthetic work',async()=>{
  assert.equal(validateReopenAfterWave(null,null,[40]),null);
  assert.equal(validateReopenAfterWave(1,[10,10],[10,10]),1);
  for(const value of [0,-1,2,1.5,NaN,Infinity,'1',null===undefined?0:'01']) {
    assert.throws(()=>validateReopenAfterWave(value,[10,10],[10,10]),
      /Reopen-after-wave/);
  }
  assert.throws(()=>validateReopenAfterWave(1,null,[40]),
    /Reopen-after-wave/);
  for(const options of [
    {agents:20,reopenAfterWave:1},
    {agents:20,batches:[10,10],reopenAfterWave:2},
    {agents:20,batches:[10,10],reopenAfterWave:0},
    {agents:20,batches:[10,10],reopenAfterWave:'1'},
    {agents:40,batches:[5,10,10,15],reopenAfterWave:4}
  ]) {
    await assert.rejects(()=>runOfflineFleetStress(options),
      /Reopen-after-wave/);
  }
});

test('tokenless CLI recovery only reports aggregate synthetic counts',()=>{
  const run=spawnSync(process.execPath,[
    cli,'stress-fleet','--batches','10,10','--reopen-after-wave','1'
  ],{encoding:'utf8',env:offlineEnv(),timeout:30000});
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stderr,'');
  const report=JSON.parse(run.stdout);
  assert.equal(report.requested_agents,20);
  assert.equal(report.restored_session_resumes_verified,10);
  assert.equal(report.restored_ledger_entries_preserved,true);
  assert.equal(report.real_github_requests,0);
  assert.equal(report.real_multi_chat_concurrency_proven,false);
  assert.equal(report.real_private_ledger_verified,false);
  assert.equal(report.automatic_merges_or_deploys,0);
  assert.doesNotMatch(run.stdout,
    /must-not-read-this-private-file|must-not-print-this-private-ledger|example-synthetic|coordination\/claims|chat-[0-9a-f]|GITHUB_TOKEN/);
});

test('CLI rejects malformed or final-wave reopen indices without stdout',()=>{
  const invalid=[
    ['--reopen-after-wave','1'],
    ['--batches','10,10','--reopen-after-wave','0'],
    ['--batches','10,10','--reopen-after-wave','2'],
    ['--batches','10,10','--reopen-after-wave','-1'],
    ['--batches','10,10','--reopen-after-wave','1.0'],
    ['--batches','10,10','--reopen-after-wave','01'],
    ['--batches','10,10','--reopen-after-wave','NaN'],
    ['--batches','5,10,10,15','--reopen-after-wave','4'],
    ['--batches','10,10','--reopen-after-wave','9999999999999999999']
  ];
  for(const args of invalid) {
    const run=spawnSync(process.execPath,[cli,'stress-fleet',...args],{
      encoding:'utf8',env:offlineEnv(),timeout:15000
    });
    assert.equal(run.status,1,args.join(' ')+': '+run.stderr);
    assert.equal(run.stdout,'');
    assert.match(run.stderr,/stress-fleet|Reopen-after-wave/);
  }
});
