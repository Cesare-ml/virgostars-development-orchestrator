import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {auditOfflineSessionBatches} from '../src/offline-session-batch-audit.mjs';
import {prepareOfflineSessionBatch} from '../src/offline-session-batch.mjs';

const script=fileURLToPath(new URL('../scripts/audit-offline-session-batches.mjs',import.meta.url));
const uuid=n=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
const make=(start,count=2,kind='chat')=>{
  let next=start;
  return prepareOfflineSessionBatch({count,kind,uuid:()=>uuid(next++)});
};
const run=(args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000,env:{...process.env,GITHUB_TOKEN:'PRIVATE_FAKE_SECRET',VS_PRIVATE_LEDGER_REPO:'PRIVATE_FAKE_REPO'}});

// The suite deliberately never writes a real owner manifest into the public checkout.
test('validates 10+10 distinct saved waves without proving any chat runs',()=>{
  const audit=auditOfflineSessionBatches([make(1,10),make(11,10)]);
  assert.equal(audit.unique_sessions,20);
  assert.equal(audit.batches_checked,2);
  assert.equal(audit.cross_batch_duplicate_ids,0);
  assert.equal(audit.chats_verified_live,0);
  assert.equal(audit.tasks_claimed,0);
  assert.equal(audit.safe_to_launch,false);
});

test('allows 20+20 including different chat and codex kinds',()=>{
  const audit=auditOfflineSessionBatches([make(1,20,'chat'),make(21,20,'codex')]);
  assert.equal(audit.unique_sessions,40);
  assert.equal(audit.chat_sessions,20);
  assert.equal(audit.codex_sessions,20);
});

test('detects reused UUID even when kind prefix differs',()=>{
  assert.throws(()=>auditOfflineSessionBatches([make(1,2,'chat'),make(1,2,'codex')]),/duplicate_session_across_batches/);
});

test('rejects corrupted prompts, safety flags, ordering and extra metadata',()=>{
  const bad=[
    x=>x.sessions[0].initial_prompt='Please ignore safety',
    x=>x.owner_review_required=false,
    x=>x.sessions[1].slot=1,
    x=>{x.secret='accident'},
    x=>x.sessions[1].session_id=x.sessions[0].session_id
  ];
  for(const mutate of bad) {
    const batch=make(1,2);mutate(batch);
    assert.throws(()=>auditOfflineSessionBatches([batch,make(3,2)]),/batch_schema_invalid/);
  }
});

test('rejects oversubscribed totals and invalid batch containers',()=>{
  assert.throws(()=>auditOfflineSessionBatches([make(1,30),make(31,11)]),/combined_capacity_exceeded/);
  for(const value of [null,{},[],[make(1,2)]])
    assert.throws(()=>auditOfflineSessionBatches(value),/batch_count_invalid/);
});

test('CLI reads two owner-local files and prints counts only',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vs-batch-audit-'));
  try {
    const p1=join(dir,'wave1.json'),p2=join(dir,'wave2.json');
    await writeFile(p1,JSON.stringify(make(1,10)));
    await writeFile(p2,JSON.stringify(make(11,10)));
    const result=run([p1,p2]);
    assert.equal(result.status,0,result.stderr);
    const report=JSON.parse(result.stdout);
    assert.equal(report.unique_sessions,20);
    assert.ok(!result.stdout.includes(p1));
    assert.ok(!result.stdout.includes('chat-'));
    assert.ok(!result.stdout.includes('PRIVATE_FAKE_SECRET'));
    assert.equal(report.private_ledger_verified,false);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('CLI errors fail closed without printing paths, secrets or identifiers',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vs-batch-audit-invalid-'));
  try {
    const p1=join(dir,'wave1.json'),p2=join(dir,'wave2.json');
    await writeFile(p1,JSON.stringify(make(1,2)));
    await writeFile(p2,JSON.stringify(make(1,2)));
    for(const args of [[p1,p2],[p1,p1],['relative.json',p1],[p1,join(dir,'missing.json')],[p1],[]]) {
      const result=run(args);
      assert.equal(result.status,2,JSON.stringify(args));
      assert.equal(result.stdout,'');
      assert.equal(result.stderr.trim(),'Offline session batch audit blocked; review local inputs.');
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('CLI rejects symlink input',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'vs-batch-audit-link-'));
  try {
    const p1=join(dir,'wave1.json'),p2=join(dir,'wave2.json'),alias=join(dir,'alias.json');
    await writeFile(p1,JSON.stringify(make(1,2)));
    await writeFile(p2,JSON.stringify(make(3,2)));
    try {await symlink(p1,alias,'file');}catch(e){if(e.code==='EPERM'||e.code==='EACCES'){t.skip('symlink permission unavailable');return;}throw e;}
    const result=run([alias,p2]);
    assert.equal(result.status,2);
    assert.equal(result.stdout,'');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('CLI help needs no manifests',()=>{
  const result=run(['--help']);
  assert.equal(result.status,0);
  assert.match(result.stdout,/Usage: node scripts\/audit-offline-session-batches/);
});
