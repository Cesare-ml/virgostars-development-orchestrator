import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECTOR_MANIFEST_SCHEMA, inspectConnectorManifest, parseUniqueManifestJson,
} from '../src/connector-manifest-contract.mjs';

const sha = 'a'.repeat(40);
const repo1 = 'ExampleOrg/repo-one';
const repo2 = 'ExampleOrg/repo-two';
const historical = Array.from({length:7}, (_,i) => repo1+'#'+(i+1));
function gate() {
  return {
    fetched_commit_sha: sha, owner_approved_commit_sha: sha,
    private_visibility_verified: true, independent_owner_approval_verified: true,
    manifest_separate_from_ledger_verified: true, historic_submissions_verified: true,
    approved_repositories: [repo1,repo2],
    historic_submitted_task_keys: [...historical],
  };
}
function fixture() {
  return {
    schema_version: CONNECTOR_MANIFEST_SCHEMA, status:'owner-approved', wave:2,
    tasks: [
      {
        task_id:'pilot-a', repository:repo1, issue:10, status:'ready', role:'developer',
        access:'write', pilot_wave:2, title:'Synthetic safe test A',
        scope:['test/a.test.mjs'], resource_scope:{id:'partition-a',roots:['test/a.test.mjs']},
        upstream_pr:5, upstream_branch:'feat/a', upstream_head_sha:'b'.repeat(40),
      },
      {
        task_id:'pilot-b', repository:repo2, issue:11, status:'ready', role:'developer',
        access:'write', pilot_wave:2, title:'Synthetic safe test B',
        scope:['python/tests/test_b.py'],
        resource_scope:{id:'partition-b',roots:['python/tests/test_b.py']},
        upstream_pr:6, upstream_branch:'feat/b', upstream_head_sha:'c'.repeat(40),
      },
    ],
  };
}
const check = (obj, g=gate()) => inspectConnectorManifest(JSON.stringify(obj),g);
const rejected = (obj, g=gate()) => assert.throws(() => check(obj,g), /CONNECTOR_MANIFEST_BLOCKED/);

test('synthetic two-task manifest produces only non-authorizing, non-identifying evidence',()=>{
  const report=check(fixture());
  assert.equal(report.task_count,2);
  assert.equal(report.claim_authorized,false);
  assert.equal(report.live_github_verified,false);
  assert.equal(report.ready_to_scale,false);
  assert.equal(report.operator_review_required,true);
  assert.doesNotMatch(JSON.stringify(report), /ExampleOrg|repo-one|pilot-a|partition-a|aaa/);
});
test('reject duplicate object keys and decoded Unicode aliases',()=>{
  const raw=JSON.stringify(fixture());
  for(const altered of [
    raw.replace('"status":"owner-approved"','"status":"proposed","status":"owner-approved"'),
    raw.replace('"status":"owner-approved"','"status":"proposed","\\u0073tatus":"owner-approved"'),
    raw.replace('"role":"developer"','"role":"reviewer","role":"developer"'),
  ]) assert.throws(()=>inspectConnectorManifest(altered,gate()),/CONNECTOR_MANIFEST_BLOCKED/);
  assert.deepEqual(parseUniqueManifestJson('{"foo":1,"arr":[{"bar":"ok"}]}'),{foo:1,arr:[{bar:'ok'}]});
});
test('reject stale approved commit or unverified private/owner gates',()=>{
  for(const mutate of [
    g=>g.owner_approved_commit_sha='b'.repeat(40),
    g=>g.private_visibility_verified=false,
    g=>g.independent_owner_approval_verified=false,
    g=>g.manifest_separate_from_ledger_verified=false,
    g=>g.historic_submissions_verified=false,
  ]) { const g=gate();mutate(g);rejected(fixture(),g); }
});
test('reject empty or alias-colliding allowlist, missing historical snapshot',()=>{
  for(const mutate of [
    g=>g.approved_repositories=[],
    g=>g.approved_repositories=[repo1,repo1.toLowerCase()],
    g=>g.historic_submitted_task_keys=[],
    g=>g.historic_submitted_task_keys=[...historical,historical[0].toUpperCase()],
  ]) {const g=gate();mutate(g);rejected(fixture(),g);}
});
test('reject schema drift, unexpected fields, incomplete phase, task count',()=>{
  for(const mutate of [
    x=>x.schema_version='v2', x=>x.status='proposed', x=>x.wave=20,
    x=>x.tasks.pop(), x=>x.tasks.push({...x.tasks[1]}),
    x=>x.secret='do-not-print', x=>x.tasks[0].owner='invented',
    x=>x.tasks[0].resource_scope.extra=true,
  ]) {const x=fixture();mutate(x);rejected(x);}
});
test('reject historical task reuse, duplicate task IDs and issue identities',()=>{
  for(const mutate of [
    x=>x.tasks[0].issue=1,
    x=>x.tasks[1].task_id=x.tasks[0].task_id,
    x=>{x.tasks[1].repository=repo1;x.tasks[1].issue=10;},
  ]) {const x=fixture();mutate(x);rejected(x);}
});
test('reject same partition or same file in one repository',()=>{
  for(const mutate of [
    x=>{x.tasks[1].repository=repo1;x.tasks[1].resource_scope.id='partition-a';},
    x=>{x.tasks[1].repository=repo1;x.tasks[1].scope=['test/a.test.mjs'];x.tasks[1].resource_scope.roots=['test/a.test.mjs'];},
    x=>{x.tasks[1].repository=repo1;x.tasks[1].scope=['test/A.test.mjs'];x.tasks[1].resource_scope.roots=['test/A.test.mjs'];},
  ]) {const x=fixture();mutate(x);rejected(x);}
});
test('reject out-of-scope, missing roots, ambiguous paths and branch names',()=>{
  for(const mutate of [
    x=>x.tasks[0].repository='Unknown/project',
    x=>x.tasks[0].resource_scope.roots=['test/other.mjs'],
    x=>x.tasks[0].scope=['../test/a.test.mjs'],
    x=>x.tasks[0].scope=['test/../../other.mjs'],
    x=>x.tasks[0].scope=['.github/workflows/main.yml'],
    x=>x.tasks[0].scope=['test/*.mjs'],
    x=>x.tasks[0].scope=['test\\escape.mjs'],
    x=>x.tasks[0].upstream_branch='branch/../malicious',
    x=>x.tasks[0].upstream_head_sha='not-a-sha',
    x=>x.tasks[0].upstream_pr=0,
  ]) {const x=fixture();mutate(x);rejected(x);}
});
test('reject non-developer, unready, non-write, inaccurate wave',()=>{
  for(const mutate of [
    x=>x.tasks[0].status='submitted',
    x=>x.tasks[0].role='reviewer',
    x=>x.tasks[0].access='read',
    x=>x.tasks[0].pilot_wave=20,
  ]) {const x=fixture();mutate(x);rejected(x);}
});
test('reject hostile object prototypes/accessors rather than executing getters',()=>{
  let called=false;
  const g=gate();
  Object.defineProperty(g,'private_visibility_verified',{get(){called=true;throw Error('LEAK');}});
  rejected(fixture(),g);
  assert.equal(called,false);
  const x=fixture();
  assert.throws(()=>inspectConnectorManifest(JSON.stringify(x),Object.create(g)), /CONNECTOR_MANIFEST_BLOCKED/);
});
test('reject malformed, oversized or duplicate-key JSON without revealing payload',()=>{
  for(const raw of ['{', JSON.stringify(fixture()).repeat(1000), '{"a":0,"a":1}']) {
    assert.throws(()=>inspectConnectorManifest(raw,gate()), e=>e.message==='CONNECTOR_MANIFEST_BLOCKED');
  }
});