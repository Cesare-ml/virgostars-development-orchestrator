import test from 'node:test';
import assert from 'node:assert/strict';
import {isStructurallyValidActiveClaim as valid} from '../src/claim-record-integrity.mjs';

const repo='ExampleOrg/sample-repo',issue=145;
const session='chat-12345678-1234-4abc-8abc-123456789abc';
const start='2026-11-14T12:00:00.000Z';
const read=()=>({schema_version:2,target_repository:repo,issue_number:issue,
  session_id:session,role:'reviewer',access:'read',resource_scope_id:null,
  resource_roots:null,state:'claimed',claimed_at:start,branch:null,last_handoff:null});
const write=()=>({...read(),role:'developer',access:'write',
  resource_scope_id:'test-scope',resource_roots:['src/code/','test/sample.test.mjs']});
const handed=x=>({...x,state:'in_progress',branch:'agent/test',
  last_handoff:{at:'2026-11-14T12:01:00.000Z',summary:'Reviewed tests',head_sha:null}});

test('valid claimed and handed-off read/write records remain accepted',()=>{
  for(const c of [read(),write(),handed(read()),handed(write())])
    assert.equal(valid(c,repo,issue),true);
});
test('reject wrong issue, repository, UUID, schema and invalid lifecycle',()=>{
  for(const mutate of [
    c=>{c.target_repository='OtherOrg/repo';},
    c=>{c.issue_number=999;},
    c=>{c.session_id='chat-not-a-uuid';},
    c=>{c.schema_version=1;},
    c=>{c.state='released';},
  ]) {const c=read();mutate(c);assert.equal(valid(c,repo,issue),false);}
});
test('reject role/access mismatch and read claim with write resource metadata',()=>{
  for(const mutate of [
    c=>{c.role='developer';},
    c=>{c.access='write';},
    c=>{c.resource_scope_id='injected';},
    c=>{c.resource_roots=['src/'];},
  ]) {const c=read();mutate(c);assert.equal(valid(c,repo,issue),false);}
});
test('reject unknown keys, missing keys, prototypes and accessors',()=>{
  for(const mutate of [
    c=>{c.unknown=true;},
    c=>{delete c.last_handoff;},
    c=>{Object.setPrototypeOf(c,Array.prototype);},
    c=>{Object.defineProperty(c,'state',{get(){throw Error('getter accessed');},enumerable:true});},
  ]) {const c=read();mutate(c);assert.equal(valid(c,repo,issue),false);}
});
test('reject impossible, ambiguous and noncanonical claim timestamps',()=>{
  for(const timestamp of ['yesterday','2026-02-30T12:00:00.000Z',
    '2026-11-14T12:00:00Z','2026-11-14T12:00:00.000+01:00']){
    const c=read();c.claimed_at=timestamp;assert.equal(valid(c,repo,issue),false);
  }
});
test('require paired state and factual, chronological handoff',()=>{
  const bogus=read();bogus.state='in_progress';assert.equal(valid(bogus,repo,issue),false);
  const early=handed(read());early.last_handoff.at='2026-11-14T11:59:59.000Z';
  assert.equal(valid(early,repo,issue),false);
  const empty=handed(read());empty.last_handoff.summary='   ';
  assert.equal(valid(empty,repo,issue),false);
  const tampered=read();tampered.last_handoff={at:start,summary:'wrong',head_sha:null};
  assert.equal(valid(tampered,repo,issue),false);
  const extra=handed(read());extra.last_handoff.unexpected=true;
  assert.equal(valid(extra,repo,issue),false);
});
test('write claims require sorted, portable and unique resource roots',()=>{
  for(const roots of [
    ['test/z','test/a'],['test/../secrets'],['src/.git/config'],
    ['src/CON/file'],['src/name.'],['test/dup','test/DUP'],[]
  ]){const c=write();c.resource_roots=roots;assert.equal(valid(c,repo,issue),false);}
  const invalid=write();invalid.resource_scope_id='1invalid';
  assert.equal(valid(invalid,repo,issue),false);
});
test('validator is pure and does not change accepted records',()=>{
  const input=handed(write()),snapshot=JSON.stringify(input);
  assert.equal(valid(input,repo,issue),true);
  assert.equal(JSON.stringify(input),snapshot);
});
