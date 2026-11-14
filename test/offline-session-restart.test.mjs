import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,symlink,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareOfflineSessionBatch} from '../src/offline-session-batch.mjs';
import {planOfflineSessionRestarts} from '../src/offline-session-restart.mjs';

const script=fileURLToPath(new URL('../scripts/plan-offline-session-restarts.mjs',import.meta.url));
const uuid=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
function batch(count=4,kind='chat') {
  let i=1;
  return prepareOfflineSessionBatch({count,kind,uuid:()=>uuid(i++)});
}
function replacements(start=50){let i=start;return ()=>uuid(i++);}
function invoke(...args) {return spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??''}});}

for(const kind of ['chat','codex']) {
  test(kind+' selected restarts use fresh IDs with the unchanged initial message',()=>{
    const source=batch(4,kind),r=planOfflineSessionRestarts(source,[1,4],{uuid:replacements()});
    assert.equal(r.replacements_prepared,2);
    assert.deepEqual(r.replacements.map(s=>s.slot),[1,4]);
    for(const replacement of r.replacements) {
      const original=source.sessions[replacement.slot-1];
      assert.notEqual(replacement.previous_session_id,replacement.replacement_session_id);
      assert.equal(replacement.previous_session_id,original.session_id);
      assert.equal(replacement.initial_prompt.replaceAll(replacement.replacement_session_id,original.session_id),original.initial_prompt);
      assert.equal(replacement.claim_transfer_attempted,false);
    }
    assert.equal(r.old_sessions_closed_verified,false);
    assert.equal(r.old_claims_reconciled_verified,false);
    assert.equal(r.ready_to_launch,false);
    assert.equal(r.github_requests,0);
    assert.equal(r.tasks_claimed,0);
  });
}

test('original batch tampering, even safety-field and prompt edits, fails closed',()=>{
  for(const mutate of [b=>b.sessions[1].initial_prompt+=' unsafe',b=>b.private_ledger_verified=true,b=>b.sessions[0].slot=3,b=>b.extra='surprise',b=>b.sessions[0].session_id=b.sessions[1].session_id]) {
    const source=batch();mutate(source);
    assert.throws(()=>planOfflineSessionRestarts(source,[1],{uuid:replacements()}),/source_batch_invalid/);
  }
});

test('invalid or duplicate slot selection fails closed',()=>{
  for(const slots of [[],[0],[5],[2,2],[3,1],[1,1.2],['1'],[1,2,3,4,5],null])
    assert.throws(()=>planOfflineSessionRestarts(batch(),slots,{uuid:replacements()}),/restart_slots_invalid/);
});

test('replacing with an original UUID or duplicate fresh UUID fails closed',()=>{
  assert.throws(()=>planOfflineSessionRestarts(batch(),[1],{uuid:replacements(1)}),/old_session_id_reused/);
  assert.throws(()=>planOfflineSessionRestarts(batch(),[1],{uuid:()=>uuid(77)}),/Duplicate session identifier/);
  assert.throws(()=>planOfflineSessionRestarts(batch(),[1],{uuid:()=> 'not-uuid'}),/valid v4 identifier/);
});

test('only explicit selected slots are included; 40 slots work',()=>{
  const r=planOfflineSessionRestarts(batch(40),Array.from({length:40},(_,i)=>i+1),{uuid:replacements(100)});
  assert.equal(r.replacements.length,40);
  assert.equal(new Set(r.replacements.map(s=>s.replacement_session_id)).size,40);
  assert.equal(r.ready_to_launch,false);
});

test('real CLI writes private new file, reports counts only, never overwrites',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vs-restart-test-'));
  try {
    const input=join(dir,'old.json'),out=join(dir,'replacement.json');
    const source=batch();await writeFile(input,JSON.stringify(source));
    const run=invoke(input,out,'--slots','1,3');
    assert.equal(run.status,0,run.stderr);
    const payload=JSON.parse(await readFile(out,'utf8'));
    assert.equal(payload.replacements.length,2);
    assert.equal(payload.ready_to_launch,false);
    assert.equal(JSON.parse(run.stdout).replacements_prepared,2);
    assert.doesNotMatch(run.stdout+run.stderr,/chat-00000000|owner-pilot agent|\/vs-restart-test-|replacement_session_id/);
    const retry=invoke(input,out,'--slots','1');
    assert.equal(retry.status,2);
    assert.equal((await readFile(out,'utf8')),JSON.stringify(payload,null,2)+'\n');
    assert.doesNotMatch(retry.stderr,/\.json|vs-restart-test/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('CLI rejects tampered source and invalid slots without creating output',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vs-restart-invalid-'));
  try {
    const input=join(dir,'old.json'),out=join(dir,'new.json');
    const b=batch();b.sessions[0].initial_prompt='hijacked';
    await writeFile(input,JSON.stringify(b));
    assert.equal(invoke(input,out,'--slots','1').status,2);
    await assert.rejects(readFile(out));
    await writeFile(input,JSON.stringify(batch()));
    for(const arg of ['1,1','3,2','0','1, 2','41'])assert.equal(invoke(input,out,'--slots',arg).status,2);
    await assert.rejects(readFile(out));
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('CLI rejects public-checkout input/output and symlinked sources',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vs-restart-symlink-'));
  try {
    const input=join(dir,'old.json'),out=join(dir,'new.json');
    await writeFile(input,JSON.stringify(batch()));
    const link=join(dir,'alias.json');
    try {
      await symlink(input,link);
      assert.equal(invoke(link,out,'--slots','1').status,2);
    } catch (error) {
      if(!['EPERM','EACCES','ENOTSUP'].includes(error.code)) throw error;
    }
    assert.equal(invoke(script,out,'--slots','1').status,2);
    assert.equal(invoke(input,join(fileURLToPath(new URL('../',import.meta.url)),'public.json'),'--slots','1').status,2);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('CLI argument help remains tokenless',()=>{
  assert.match(invoke('--help').stdout,/No chat launch/);
  for(const args of [[],['nope'],['--help','junk']])assert.equal(invoke(...args).status,2);
});
