import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSessionClaimSnapshot as audit} from '../src/agent-session-claim-audit.mjs';

const ME='chat-aaaaaaaa',OTHER='chat-bbbbbbbb';
const T=Date.parse('2026-11-14T18:54:00.000Z');
const TTL={develop:180,review:60,merge:30,triage:60,plan:30};
const EPH='Cesare-ml/VirgoStars-Ephemeris';
const ORC='Cesare-ml/virgostars-development-orchestrator';
const keyOf=(repo,key)=>repo.replace('/','__')+'/'+key;
const record=(repo,key,step,session=ME,at='2026-11-14T18:53:00.000Z',attempt=1)=>
  ({repo,key,step,session,claimed_at:at,attempt});
const run=(claims={},args={})=>audit({claims,session:ME,ttlMinutes:TTL,now:T,...args});
const has=(repo,key,step,session=ME,at)=>
  ({[keyOf(repo,key)]:[record(repo,key,step,session,at)]});

test('verified empty ledger is diagnostic, not permission to claim',()=>{
  const x=run();
  assert.equal(x.status,'no-live-assignment');
  assert.equal(x.globally_exclusive_session_proven,false);
  assert.equal(x.new_claim_authorized,false);
  assert.deepEqual(x.live_assignments,[]);
});
test('detects an owned live developer task and preserves its key',()=>{
  const x=run(has(EPH,'issue-9','develop'));
  assert.equal(x.status,'one-live-assignment');
  assert.deepEqual(x.live_assignments,[{repo:EPH,key:'issue-9',step:'develop',attempt:1}]);
});
test('detects cross-repository duplicate live ownership',()=>{
  const c={...has(EPH,'issue-9','develop'),...has(ORC,'review-pr-17-abcdef0','review')};
  const x=run(c);
  assert.equal(x.status,'duplicate-live-assignments');
  assert.equal(x.duplicate_live_claims,true);
  assert.equal(x.live_assignments.length,2);
  assert.equal(x.new_claim_authorized,false);
});
test('detects two distinct task keys held by the same chat',()=>{
  const c={...has(EPH,'issue-9','develop'),...has(EPH,'merge-pr-22','merge')};
  assert.equal(run(c).duplicate_live_claims,true);
});
test('audits review, integration, triage and planning steps',()=>{
  for(const [key,step] of [['review-pr-22-a12bcde','review'],['merge-pr-2','merge'],
    ['triage-pr-19','triage'],['plan-2026111418','plan']]){
    assert.equal(run(has(ORC,key,step)).status,'one-live-assignment',step);
  }
});
test('other chat claim is not attributed to this chat',()=>{
  assert.equal(run(has(EPH,'issue-9','develop',OTHER)).status,'no-live-assignment');
});
test('expired own attempt is not incorrectly counted live or authorized',()=>{
  const x=run(has(EPH,'review-pr-17-abcdef0','review',ME,'2026-11-14T17:50:00Z'));
  assert.equal(x.status,'no-live-assignment');
  assert.equal(x.new_claim_authorized,false);
});
test('latest attempt wins but complete attempt history is required',()=>{
  const repo=ORC,key='issue-181';
  const x=run({[keyOf(repo,key)]:[
    record(repo,key,'develop',OTHER,'2026-11-14T18:00:00Z',1),
    record(repo,key,'develop',ME,'2026-11-14T18:53:00Z',2)
  ]});
  assert.equal(x.live_assignments[0].attempt,2);
});
test('Git lexical ordering of attempt 10 versus 2 is normalized without mutation',()=>{
  const repo=ORC,key='issue-181';
  const steps=Array.from({length:10},(_,i)=>record(repo,key,'develop',ME,
    '2026-11-14T18:'+String(40+i).padStart(2,'0')+':00Z',i+1));
  const c={[keyOf(repo,key)]:[steps[0],steps[9],...steps.slice(1,9)]};
  const clone=structuredClone(c);
  assert.equal(run(c).live_assignments[0].attempt,10);
  assert.deepEqual(c,clone);
});
test('latest attempt by another chat cannot count stale old ownership',()=>{
  const repo=ORC,key='issue-181';
  const x=run({[keyOf(repo,key)]:[
    record(repo,key,'develop',ME,'2026-11-14T17:00:00Z',1),
    record(repo,key,'develop',OTHER,'2026-11-14T18:53:00Z',2)
  ]});
  assert.equal(x.status,'no-live-assignment');
});
test('invalid attempt numbering and duplicates fail closed',()=>{
  const repo=ORC,key='issue-181';
  for(const attempts of [[record(repo,key,'develop',ME,undefined,2)],
    [record(repo,key,'develop'),record(repo,key,'develop')]])
    assert.throws(()=>run({[keyOf(repo,key)]:attempts}),/invalid attempt/);
});
test('forged directory, task, step or session fails closed',()=>{
  const repo=ORC,key='issue-181';
  for(const c of [
    {[keyOf(repo,key)]:[record(EPH,key,'develop')]},
    {[keyOf(repo,key)]:[record(repo,'issue-182','develop')]},
    {[keyOf(repo,key)]:[record(repo,key,'review')]},
    {[keyOf(repo,key)]:[record(repo,key,'develop','chat-INVALID')]},
    {'invalid':[record(repo,key,'develop')]}
  ])assert.throws(()=>run(c),/blocked/);
});
test('malformed, impossible, future and retrograde timestamps fail closed',()=>{
  const repo=ORC,key='issue-181';
  for(const ts of ['not-a-date','2026-02-30T10:00:00Z',
    '2026-11-14T18:53:00+00:00','2026-11-14T20:00:00Z'])
    assert.throws(()=>run(has(repo,key,'develop',ME,ts)),/timestamp/);
  const c={[keyOf(repo,key)]:[
    record(repo,key,'develop',ME,'2026-11-14T18:53:00Z',1),
    record(repo,key,'develop',ME,'2026-11-14T18:52:00Z',2)]};
  assert.throws(()=>run(c),/retrograde/);
});
test('invalid UTC calendar hour in planning key fails closed',()=>{
  assert.throws(()=>run(has(ORC,'plan-2026133218','plan')),/invalid attempt/);
});
test('missing TTL, malformed session or incomplete inventory fails closed',()=>{
  assert.throws(()=>run({},{ttlMinutes:{...TTL,review:undefined}}),/TTL/);
  assert.throws(()=>run({},{session:'chat-invalid'}),/audit inputs/);
  assert.throws(()=>run({'badkey':[]}),/incomplete/);
  assert.throws(()=>run({},{now:NaN}),/audit inputs/);
});
test('input evidence is never mutated by the audit',()=>{
  const c=has(EPH,'issue-9','develop'),clone=structuredClone(c);
  run(c);
  assert.deepEqual(c,clone);
});
