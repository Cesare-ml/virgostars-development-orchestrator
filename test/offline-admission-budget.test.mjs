import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {planOfflineAdmission} from '../src/offline-admission-budget.mjs';
import {parseArgs} from '../scripts/plan-offline-admission.mjs';

const cli = fileURLToPath(new URL('../scripts/plan-offline-admission.mjs', import.meta.url));
const budget = (more={}) => ({waves:[10,10],active:0,pending:0,maxActive:10,maxPending:20,...more});
const run = args => spawnSync(process.execPath,[cli,...args],{
  encoding:'utf8',timeout:12000,env:{...process.env,
    VS_PRIVATE_LEDGER_REPO:'private-ledger-canary',
    GITHUB_TOKEN:'secret-token-canary',GH_TOKEN:'secret-gh-canary'
  }
});
const flags = ['--waves','10,10','--active','0','--pending','0','--max-active','10','--max-pending','20'];

test('10+10 respects full-wave atomic admission, never assumes a first-wave completion',()=>{
  const r=planOfflineAdmission(budget());
  assert.equal(r.verdict,'capacity-blocked');
  assert.equal(r.admitted_new_sessions,10);
  assert.equal(r.deferred_new_sessions,10);
  assert.deepEqual(r.wave_decisions.map(w=>w.status),['admitted','blocked']);
  assert.equal(r.wave_decisions[1].max_admissible_before_wave,0);
  assert.equal(r.requires_fresh_owner_counts_to_resume,true);
  assert.equal(r.real_task_claims_acquired,0);
  assert.equal(r.real_github_requests,0);
});

test('review backlog includes reserved slots for active writers',()=>{
  const r=planOfflineAdmission(budget({waves:[4,3],active:2,pending:3,maxActive:20,maxPending:10}));
  assert.deepEqual(r.wave_decisions.map(w=>w.status),['admitted','blocked']);
  assert.equal(r.wave_decisions[0].max_admissible_before_wave,5);
  assert.equal(r.wave_decisions[1].max_admissible_before_wave,1);
  assert.equal(r.admitted_new_sessions,4);
});

test('a complete wave is blocked even with insufficient partial capacity',()=>{
  const r=planOfflineAdmission(budget({maxActive:15,maxPending:20}));
  assert.deepEqual(r.wave_decisions.map(w=>w.status),['admitted','blocked']);
  assert.equal(r.wave_decisions[1].max_admissible_before_wave,5);
  assert.equal(r.admitted_new_sessions,10);
});

test('blocked wave causes later waves to remain unevaluated, not silently skipped',()=>{
  const r=planOfflineAdmission(budget({waves:[5,6,1],maxActive:10}));
  assert.deepEqual(r.wave_decisions.map(w=>w.status),['admitted','blocked','not-evaluated']);
  assert.equal(r.admitted_new_sessions,5);
  assert.equal(r.deferred_new_sessions,7);
});

test('40-chat capacity produces exact 40 reserved review slots with no automatic actions',()=>{
  const r=planOfflineAdmission(budget({waves:new Array(40).fill(1),maxActive:40,maxPending:40}));
  assert.equal(r.verdict,'all-waves-admissible');
  assert.equal(r.admitted_new_sessions,40);
  assert.equal(r.deferred_new_sessions,0);
  assert.equal(r.wave_decisions.length,40);
  assert.equal(r.automatic_merges_or_deploys,0);
  assert.equal(r.real_chat_sessions_launched,0);
});

test('input fails closed for unsafe or inconsistent capacity assumptions',()=>{
  const invalid=[
    budget({active:11}),budget({pending:21}),budget({active:8,pending:13}),
    budget({maxActive:0}),budget({maxPending:81}),budget({waves:[40,1]}),
    budget({waves:[1]}),budget({waves:[]}),budget({waves:[10,'10']}),
    budget({waves:[2.5,1.5]}),budget({active:NaN}),budget({pending:Infinity}),
    budget({maxActive:true}),budget({active:-1}),budget({unexpected:1}),
    {...budget(),pending:undefined},null
  ];
  for(const input of invalid) assert.throws(()=>planOfflineAdmission(input),/Offline admission|Invalid offline admission/);
});

test('CLI parser rejects unsupported/duplicate/missing flags, noncanonical numbers',()=>{
  assert.deepEqual(parseArgs(flags),budget());
  for(const input of [flags.slice(0,-2),[...flags,'--debug','true'],
    ['--waves','10,10','--active','0','--pending','0','--max-active','10','--max-active','20'],
    flags.map(x=>x==='10,10'?'10,01':x), flags.map(x=>x==='10,10'?'10,-10':x),
    flags.map(x=>x==='10,10'?'10,,10':x),flags.map(x=>x==='10,10'?'10,10,':x),
    flags.map(x=>x==='20'?'0020':x)]) {
    assert.throws(()=>parseArgs(input),/offline admission/i);
  }
});

test('CLI reports capacity block with code 2 and strictly aggregate output',()=>{
  const r=run(flags);
  assert.equal(r.status,2,r.stderr);
  assert.equal(r.stderr,'');
  const parsed=JSON.parse(r.stdout);
  assert.equal(parsed.verdict,'capacity-blocked');
  assert.equal(parsed.wave_decisions.length,2);
  assert.doesNotMatch(r.stdout,/private-ledger-canary|secret-token-canary|secret-gh-canary|GITHUB_TOKEN|coordination\/claims/);
});

test('CLI passes fully admissible plan and rejects malformed input without echoing secret data',()=>{
  const ok=run(['--waves','10,10','--active','0','--pending','0','--max-active','20','--max-pending','20']);
  assert.equal(ok.status,0,ok.stderr);
  assert.equal(JSON.parse(ok.stdout).admitted_new_sessions,20);
  const bad=run(['--waves','secret-token-canary',...flags.slice(2)]);
  assert.equal(bad.status,1);
  assert.equal(bad.stdout,'');
  assert.doesNotMatch(bad.stderr,/secret-token-canary|private-ledger-canary|GITHUB_TOKEN/);
});
