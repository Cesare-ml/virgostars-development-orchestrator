import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {prepareOfflineSessionBatch} from '../src/offline-session-batch.mjs';

const script=fileURLToPath(new URL('../scripts/prepare-agent-sessions.mjs',import.meta.url));
const UUID=/^(chat|codex)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function cli(...args) {
  return spawnSync(process.execPath,[script,...args],{
    encoding:'utf8',timeout:10000,maxBuffer:1024*1024,
    env:{...process.env,GITHUB_TOKEN:'SHOULD_NOT_BE_USED',VS_PRIVATE_LEDGER_REPO:'SHOULD_NOT_BE_USED'}
  });
}

test('prepares exactly two unique chat sessions with no claims or GitHub activity',()=>{
  const report=prepareOfflineSessionBatch({count:2});
  assert.equal(report.sessions_prepared,2);
  assert.deepEqual(report.sessions.map(item=>item.slot),[1,2]);
  assert.equal(new Set(report.sessions.map(x=>x.session_id)).size,2);
  assert.ok(report.sessions.every(x=>UUID.test(x.session_id)));
  assert.ok(report.sessions.every(x=>x.initial_prompt.includes(x.session_id)));
  assert.ok(report.sessions.every(x=>x.initial_prompt.includes('PRIVATE ledger')));
  assert.equal(report.chats_started,0);
  assert.equal(report.tasks_claimed,0);
  assert.equal(report.github_requests,0);
  assert.equal(report.private_ledger_verified,false);
  assert.equal(report.owner_review_required,true);
  assert.equal(report.session_ids_are_authentication,false);
});

test('supports maximum 40 isolated codex slots',()=>{
  const report=prepareOfflineSessionBatch({count:40,kind:'codex'});
  assert.equal(report.sessions.length,40);
  assert.ok(report.sessions.every(x=>x.session_id.startsWith('codex-')));
  assert.equal(new Set(report.sessions.map(x=>x.session_id)).size,40);
});

test('rejects all out-of-range and non-integer counts',()=>{
  for(const count of [undefined,null,0,1,41,100,2.5,'2',Number.NaN,Infinity,-1])
    assert.throws(()=>prepareOfflineSessionBatch({count}),/integer session count/);
});

test('rejects unrecognized kinds and UUID sources',()=>{
  assert.throws(()=>prepareOfflineSessionBatch({count:2,kind:'browser'}),/kind/);
  assert.throws(()=>prepareOfflineSessionBatch({count:2,uuid:42}),/UUID source/);
  assert.throws(()=>prepareOfflineSessionBatch({count:2,uuid:()=> 'invalid'}),/valid v4/);
});

test('aborts the entire batch if a generated ID is reused',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  assert.throws(()=>prepareOfflineSessionBatch({count:2,uuid:()=>id}),/Duplicate session identifier/);
});

test('CLI emits JSON with distinct session prompts without reading configured tokens',()=>{
  const result=cli('3','chat');
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stderr,'');
  const report=JSON.parse(result.stdout);
  assert.equal(report.sessions.length,3);
  assert.equal(new Set(report.sessions.map(x=>x.session_id)).size,3);
  assert.ok(!result.stdout.includes('SHOULD_NOT_BE_USED'));
  assert.equal(report.chats_started,0);
});

test('CLI supports help without creating sessions',()=>{
  const result=cli('--help');
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Usage: node scripts\/prepare-agent-sessions\.mjs/);
  assert.ok(!UUID.test(result.stdout));
});

test('CLI rejects malformed arguments without leaking session identifiers',()=>{
  for(const args of [[],['1'],['41'],['02'],['3.0'],['-3'],['2','invalid'],['2','chat','more'],['--help','2']]) {
    const result=cli(...args);
    assert.equal(result.status,2,JSON.stringify(args));
    assert.equal(result.stdout,'',JSON.stringify(args));
    assert.match(result.stderr,/Offline session preparation blocked:/);
  }
});
