import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadClaims} from '../src/agent-github.mjs';
import {claimState} from '../src/agent-work.mjs';

const REPO='Cesare-ml/virgostars-development-orchestrator';
const TARGET='Cesare-ml/VirgoStars-Ephemeris';
const LEDGER={repo:REPO,branch:'agent-ledger',root:'claims'};
const HEAD='a'.repeat(40),TREE='b'.repeat(40);
const TIME='2026-11-14T18:49:50.218Z';
const NOW=Date.parse('2026-11-14T18:50:00.000Z');
const path='claims/Cesare-ml__VirgoStars-Ephemeris/issue-178/1.json';
function validRecord(overrides={}) {
  return {session:'chat-d39bdf43',key:'issue-178',repo:TARGET,
    step:'develop',claimed_at:TIME,attempt:1,...overrides};
}
function gitBlob(raw) {
  const bytes=Buffer.from(raw);
  const sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  return {sha,bytes,entry:{path,type:'blob',mode:'100644',size:bytes.length,sha},
    response:{encoding:'base64',content:bytes.toString('base64'),size:bytes.length,sha}};
}
function synthetic({record=validRecord(),raw=null,truncated=false,missingRef=false,
  drift=false,wrongHash=false,attempt=1,include=true,alternatePath=null}={}) {
  const body=raw??JSON.stringify(record)+'\n';
  const blob=gitBlob(body);
  blob.entry.path=alternatePath??path.replace('/1.json','/'+attempt+'.json');
  const entries=include?[blob.entry]:[];
  const calls=[];
  let refs=0;
  const get=async (url) => {
    calls.push(url);
    if(url.endsWith('/git/ref/heads/agent-ledger')) {
      refs++;
      if(missingRef)return null;
      return {object:{type:'commit',sha:drift&&refs===2?'c'.repeat(40):HEAD}};
    }
    if(url.endsWith('/git/commits/'+HEAD))
      return {sha:HEAD,tree:{sha:TREE}};
    if(url.includes('/git/trees/'+TREE))
      return {sha:TREE,truncated,tree:entries};
    if(url.endsWith('/git/blobs/'+blob.sha))
      return wrongHash?{...blob.response,sha:'f'.repeat(40)}:blob.response;
    throw new Error('Unexpected synthetic GitHub GET '+url);
  };
  return {get,calls};
}
const read=x=>loadClaims(x.get,LEDGER);

test('intact empty agent-ledger can be distinguished from a missing branch',async()=>{
  const f=synthetic({include:false});
  assert.deepEqual(await read(f),{});
  assert.equal(f.calls.filter(p=>p.endsWith('/git/ref/heads/agent-ledger')).length,2);
});
test('valid, recent record remains a live protected claim',async()=>{
  const f=synthetic();
  const claims=await read(f);
  const status=claimState(claims,TARGET,'issue-178',180,NOW);
  assert.equal(status.live,true);
  assert.equal(status.current.session,'chat-d39bdf43');
  assert.equal(status.nextAttempt,2);
});
test('truncated Git tree cannot certify an empty ledger',async()=>{
  await assert.rejects(()=>read(synthetic({include:false,truncated:true})),/incomplete or truncated/);
});
test('missing agent-ledger ref is a blocker, not a free claim',async()=>{
  await assert.rejects(()=>read(synthetic({missingRef:true})),/branch missing/);
});
test('malformed JSON must not vanish from the claim inventory',async()=>{
  await assert.rejects(()=>read(synthetic({raw:'{bad-json'})),/Malformed agent-ledger claim JSON/);
});
test('malformed date and session are rejected before selection',async()=>{
  for(const record of [
    validRecord({claimed_at:'not-a-time'}),
    validRecord({session:'chat-NOT-HEX'})
  ]) await assert.rejects(()=>read(synthetic({record})),/Malformed agent-ledger claim identity/);
});
test('record repo and key must match canonical Git claim path',async()=>{
  for(const record of [
    validRecord({repo:'foreign/another-repo'}),
    validRecord({key:'issue-999'})
  ]) await assert.rejects(()=>read(synthetic({record})),/Malformed agent-ledger claim identity/);
});
test('missing generation 1 cannot masquerade as a fresh generation 2',async()=>{
  const f=synthetic({record:validRecord({attempt:2}),attempt:2});
  await assert.rejects(()=>read(f),/generation gap/);
});
test('Git blob SHA or metadata mismatch fails before task selection',async()=>{
  await assert.rejects(()=>read(synthetic({wrongHash:true})),/metadata inconsistent/);
});
test('ledger branch movement during GETs prevents stale ownership decisions',async()=>{
  await assert.rejects(()=>read(synthetic({drift:true})),/moved during snapshot/);
});
test('direct lease calculator never treats malformed claims as expired',()=>{
  const key='Cesare-ml__VirgoStars-Ephemeris/issue-178';
  for(const bad of [
    validRecord({claimed_at:'invalid'}),
    validRecord({session:'chat-bad'}),
    validRecord({attempt:2})
  ]) assert.throws(()=>claimState({[key]:[bad]},TARGET,'issue-178',180,NOW),
    /Malformed agent-ledger lease/);
});
test('direct lease calculator rejects missing or invalid TTL/now',()=>{
  assert.throws(()=>claimState({},TARGET,'issue-178',0,NOW),/Invalid agent-ledger lease/);
  assert.throws(()=>claimState({},TARGET,'issue-178',180,NaN),/Invalid agent-ledger lease/);
});

test('valid second-precision UTC timestamps remain supported',async()=>{
  const record=validRecord({claimed_at:'2026-11-14T18:49:50Z'});
  const claims=await read(synthetic({record}));
  assert.equal(claimState(claims,TARGET,'issue-178',180,NOW).live,true);
});

test('case-only alias of claims root must not hide active lock records',async()=>{
  const aliased=path.replace('claims/','Claims/');
  await assert.rejects(()=>read(synthetic({alternatePath:aliased})),
    /Noncanonical case alias/);
});
