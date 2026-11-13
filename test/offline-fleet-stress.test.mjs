import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  runOfflineFleetStress,validateFleetSize
} from '../src/offline-fleet-stress.mjs';

test('2, 5, 10 and 40 synthetic developer sessions complete without duplicated claims',async()=>{
  for(const n of [2,5,10,40]) {
    const result=await runOfflineFleetStress({agents:n});
    assert.equal(result.verdict,'synthetic-stress-pass');
    assert.equal(result.schema_version,'1-offline-fleet-stress');
    assert.equal(result.requested_agents,n);
    assert.equal(result.unique_claims,n);
    assert.equal(result.unique_resource_locks,n);
    assert.equal(result.synthetic_stacked_pr_submissions,n);
    assert.equal(result.submitted_markers,n);
    assert.equal(result.excess_contenders_denied,3);
    assert.equal(result.remaining_issue_claims,0);
    assert.equal(result.remaining_resource_locks,0);
    assert.equal(result.completed_tasks_reoffered,false);
    assert.equal(result.real_github_requests,0);
    assert.equal(result.real_private_ledger_verified,false);
    assert.equal(result.real_multi_chat_concurrency_proven,false);
    assert.equal(result.automatic_merges_or_deploys,0);
    assert.ok(result.synthetic_ledger_mutations>=6*n);
  }
});

test('concurrent 40-agent simulation is deterministic on independent repeats',async()=>{
  const one=await runOfflineFleetStress();
  const two=await runOfflineFleetStress();
  assert.deepEqual(one,two);
  assert.equal(one.requested_agents,40);
  assert.equal(one.remaining_resource_locks,0);
});

test('size bounds forbid fractional, huge, string and malformed inputs',async()=>{
  for(const value of [-1,0,1,41,1000,2.5,'10',NaN,Infinity,null]) {
    assert.throws(()=>validateFleetSize(value),/integer between 2 and 40/);
    await assert.rejects(()=>runOfflineFleetStress({agents:value}),
      /integer between 2 and 40/);
  }
  assert.equal(validateFleetSize(2),2);
  assert.equal(validateFleetSize(40),40);
});

test('tokenless stress-fleet CLI never reads a private config or prints task identities',()=>{
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env,
    VS_PRIVATE_LEDGER_REPO:'unused-private-ledger',
    VS_PRIVATE_LEDGER_APPROVED_REPO:'unused-private-ledger',
    VS_PRIVATE_TASKS_FILE:'this-file-does-not-exist',
    VS_PRIVATE_TASKS_APPROVED_SHA256:'0'.repeat(64)
  };
  delete env.GITHUB_TOKEN;delete env.GH_TOKEN;
  const result=spawnSync(process.execPath,[cli,'stress-fleet','--agents','10'],{
    env,encoding:'utf8',timeout:15000
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stderr,'');
  const report=JSON.parse(result.stdout);
  assert.equal(report.requested_agents,10);
  assert.equal(report.verdict,'synthetic-stress-pass');
  assert.equal(report.real_github_requests,0);
  assert.doesNotMatch(result.stdout,
    /unused-private-ledger|this-file-does-not-exist|example-synthetic|coordination\/claims|chat-[0-9a-f]|GITHUB_TOKEN/);
});

test('stress-fleet CLI defaults to 40 agents without flags or credentials',()=>{
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};
  delete env.GITHUB_TOKEN;delete env.GH_TOKEN;
  const run=spawnSync(process.execPath,[cli,'stress-fleet'],{
    env,encoding:'utf8',timeout:15000
  });
  assert.equal(run.status,0,run.stderr);
  assert.equal(JSON.parse(run.stdout).requested_agents,40);
});

test('CLI rejects unsafe agent sizes or unrelated flags before synthetic work',()=>{
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};delete env.GITHUB_TOKEN;
  const cases=[
    ['--agents','0'],['--agents','1'],['--agents','41'],
    ['--agents','2.5'],['--agents','foo'],
    ['--confirm'],['--role','developer'],['another-argument']
  ];
  for(const rest of cases) {
    const run=spawnSync(process.execPath,[cli,'stress-fleet',...rest],{
      env,encoding:'utf8',timeout:15000
    });
    assert.equal(run.status,1,rest.join(' ')+': '+run.stderr);
    assert.match(run.stderr,/stress-fleet|Offline fleet size/);
    assert.equal(run.stdout,'');
  }
});
