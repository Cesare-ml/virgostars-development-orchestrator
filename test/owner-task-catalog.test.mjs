import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mkdtemp,writeFile,rm,symlink,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  loadHistoricalPilotTasks,inspectOwnerTaskFile,
  requireOwnerTaskApproval,loadOwnerTasks,validateOwnerTaskCatalog
} from '../src/owner-task-catalog.mjs';

const clone=value=>structuredClone(value);
const writeTask={
  repository:'Cesare-ml/astrological-charts',
  issue:401,status:'ready',role:'developer',access:'write',
  pilot_wave:3,title:'Add independent bounded smoke coverage',
  scope:['tests/owner-alpha-smoke.test.mjs'],
  resource_scope:{id:'owner-alpha-smoke',roots:['tests/owner-alpha-smoke.test.mjs']},
  upstream_pr:22,upstream_branch:'feat/planet-interactions-transit-aspects-20261110',
  instructions:'Only edit the approved test file; create a draft stacked PR.'
};
const readTask={
  repository:'Cesare-ml/VirgoStars-Ephemeris',
  issue:900,status:'ready',role:'reviewer',access:'read',
  title:'Independently review a scoped PR',
  scope:['read-only: PR review and test evidence']
};
const payload=()=>({schema_version:'1-owner-task-catalog',
  status:'owner-curated-local',tasks:[clone(writeTask),clone(readTask)]});

async function fixture(t,custom=payload()) {
  const dir=await mkdtemp(join(tmpdir(),'vs-owner-tasks-'));
  t.after(async()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'owner-tasks.json');
  const json=JSON.stringify(custom,null,2)+'\n';
  await writeFile(file,json,{mode:0o600});
  return {file,json,dir,sha256:createHash('sha256').update(json).digest('hex')};
}

test('a locally approved exact SHA-256 catalog loads only two new tasks',async t=>{
  const {file,sha256}=await fixture(t);
  const legacy=await loadHistoricalPilotTasks();
  const report=await inspectOwnerTaskFile(file,{legacyTasks:legacy});
  assert.equal(report.sha256,sha256);
  assert.equal(report.count,2);
  assert.equal(report.read_tasks,1);
  assert.equal(report.write_tasks,1);
  assert.deepEqual(requireOwnerTaskApproval(report,sha256),payload().tasks);
  assert.deepEqual(await loadOwnerTasks({file,approvedSha256:sha256}),payload().tasks);
  assert.equal((await loadOwnerTasks({file:undefined,approvedSha256:undefined})).length,7);
});

test('missing, wrong, uppercase or stale approved SHA fails closed',async t=>{
  const {file,sha256}=await fixture(t);
  for(const approvedSha256 of [undefined,'',sha256.toUpperCase(),'0'.repeat(64)])
    await assert.rejects(()=>loadOwnerTasks({file,approvedSha256}),
      /Owner task catalog blocked/);
  await assert.rejects(()=>loadOwnerTasks({file:undefined,approvedSha256:sha256}),
    /Owner task catalog blocked/);
  await writeFile(file,JSON.stringify({...payload(),status:'changed'}));
  await assert.rejects(()=>loadOwnerTasks({file,approvedSha256:sha256}),
    /Owner task catalog blocked/);
});

test('original seven submitted issue identities may not be requeued',async()=>{
  const legacy=await loadHistoricalPilotTasks();
  assert.equal(legacy.length,7);
  const changed=payload();
  changed.tasks[0].issue=25; // formerly submitted Charts write issue
  assert.throws(()=>validateOwnerTaskCatalog(changed,legacy),/may not reuse/);
  changed.tasks[0].issue=401;
  changed.tasks[1].issue=85; // original Ephemeris review issue
  assert.throws(()=>validateOwnerTaskCatalog(changed,legacy),/may not reuse/);
});

test('unauthorized repo, duplicate issue and overlapping partitions are blocked',async()=>{
  const legacy=await loadHistoricalPilotTasks();
  const badRepo=payload();badRepo.tasks[0].repository='someone/other';
  assert.throws(()=>validateOwnerTaskCatalog(badRepo,legacy),/outside the approved/);
  const duplicate=payload();duplicate.tasks.push({...clone(writeTask)});
  assert.throws(()=>validateOwnerTaskCatalog(duplicate,legacy),
    /invalid or overlapping/);
  const overlap=payload();
  overlap.tasks.push({...clone(writeTask),issue:402,
    resource_scope:{id:'other-owner-alpha',roots:['tests/owner-alpha-smoke.test.mjs']}});
  assert.throws(()=>validateOwnerTaskCatalog(overlap,legacy),
    /invalid or overlapping/);
});

test('write tasks without explicit PR dependency or root scope are blocked',async()=>{
  const legacy=await loadHistoricalPilotTasks();
  for(const field of ['upstream_pr','upstream_branch','resource_scope']) {
    const changed=payload();delete changed.tasks[0][field];
    assert.throws(()=>validateOwnerTaskCatalog(changed,legacy),
      /write tasks require/);
  }
  const injected=payload();injected.tasks[0].secret='NEVER';
  assert.throws(()=>validateOwnerTaskCatalog(injected,legacy),
    /unexpected fields/);
});

test('absolute off-checkout file required; reject directory, symlink and checkout file',async t=>{
  const {file,dir}=await fixture(t);
  const legacy=await loadHistoricalPilotTasks();
  await assert.rejects(()=>inspectOwnerTaskFile('owner-tasks.json',{legacyTasks:legacy}),
    /absolute local/);
  await assert.rejects(()=>inspectOwnerTaskFile(dir,{legacyTasks:legacy}),
    /bounded, regular/);
  const alias=join(dir,'alias.json');
  await symlink(file,alias);
  await assert.rejects(()=>inspectOwnerTaskFile(alias,{legacyTasks:legacy}),
    /non-symlink/);
  const tracked=fileURLToPath(new URL('../config/pilot-tasks.json',import.meta.url));
  await assert.rejects(()=>inspectOwnerTaskFile(tracked,{legacyTasks:legacy}),
    /outside the public checkout/);
});

test('malformed JSON, oversized file and invalid UTF-8 are blocked',async t=>{
  const {file}=await fixture(t);
  const legacy=await loadHistoricalPilotTasks();
  for(const bytes of [
    '{',Buffer.alloc(131073,0x41),Buffer.from([0xff,0xfe])
  ]) {
    await writeFile(file,bytes);
    await assert.rejects(()=>inspectOwnerTaskFile(file,{legacyTasks:legacy}),
      /Owner task catalog blocked/);
  }
});

test('offline fingerprint CLI emits no task titles or repo names and requires no token',async t=>{
  const {file,sha256}=await fixture(t);
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};delete env.GITHUB_TOKEN;
  const run=spawnSync(process.execPath,[cli,'fingerprint-tasks',file],
    {env,encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stderr,'');
  const result=JSON.parse(run.stdout);
  assert.equal(result.sha256,sha256);
  assert.equal(result.tasks,2);
  assert.equal(result.approved,false);
  assert.equal(result.private_file_uploaded,false);
  assert.doesNotMatch(run.stdout,/astrological-charts|VirgoStars-Ephemeris|owner-alpha-smoke|Independently review/);
});

test('public discovery remains offline and ignores hostile owner-task variables',async t=>{
  const {file}=await fixture(t);
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env,VS_PRIVATE_TASKS_FILE:file,
    VS_PRIVATE_TASKS_APPROVED_SHA256:'0'.repeat(64)};
  delete env.GITHUB_TOKEN;
  const run=spawnSync(process.execPath,[cli,'public-discover'],
    {env,encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr);
  assert.equal(JSON.parse(run.stdout).write_claims_enabled,false);
  assert.doesNotMatch(run.stdout,/owner-alpha-smoke|VS_PRIVATE_TASKS_FILE/);
});
