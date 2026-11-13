import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOperatorSelection,verifyPreservedSubmissions,
  assertPrivateLedgerActivation,FROZEN_PUBLIC_LEDGER_HEAD,FROZEN_PUBLIC_SUBMISSIONS
} from '../src/private-ledger-activation.mjs';
import {PUBLIC_COORDINATOR,DESTINATION_BRANCH} from '../src/private-ledger-preflight.mjs';

const DEST='example/private-coordinator';
const DEST_HEAD='b'.repeat(40);
const PUBLIC_TREE='a'.repeat(40);
const PRIVATE_TREE='c'.repeat(40);
const SHA='d'.repeat(40);
const records=()=>Array.from({length:FROZEN_PUBLIC_SUBMISSIONS},(_,i)=>({
  path:'submissions/example__project/issue-'+(i+1)+'.json',
  sha:SHA,
  data:{state:'submitted',target_repository:'example/project',issue_number:i+1}
}));
const blob=(record)=>({
  path:record.path,type:'blob',mode:'100644',size:200,sha:record.sha
});
const ref=head=>({object:{type:'commit',sha:head}});
const sourceMeta={full_name:PUBLIC_COORDINATOR,private:false,visibility:'public'};
const destMeta={full_name:DEST,private:true,visibility:'private',archived:false,disabled:false};
const config={repository_visibility_required:'private',
  claim_store:{repo:DEST,branch:DESTINATION_BRANCH}};
const clone=x=>structuredClone(x);

function fixture() {
  const source=records(),dest=records();
  const calls=[];
  const api={
    async getRepository(repo) {
      calls.push(['metadata',repo]);
      return clone(repo===DEST?destMeta:sourceMeta);
    },
    async getBranchRef(repo) {
      calls.push(['branch',repo]);
      return ref(repo===DEST?DEST_HEAD:FROZEN_PUBLIC_LEDGER_HEAD);
    },
    async getGitCommit(repo) {
      calls.push(['commit',repo]);
      return {sha:repo===DEST?DEST_HEAD:FROZEN_PUBLIC_LEDGER_HEAD,
        tree:{sha:repo===DEST?PRIVATE_TREE:PUBLIC_TREE}};
    },
    async getGitTree(repo) {
      calls.push(['tree',repo]);
      if(repo===DEST) return {sha:PRIVATE_TREE,truncated:false,tree:dest.map(blob)};
      return {sha:PUBLIC_TREE,truncated:false,tree:[
        {path:'README.md',type:'blob',mode:'100644',sha:'e'.repeat(40),size:350},
        ...source.map(blob)
      ]};
    },
    async getLedgerSnapshot(repo) {
      calls.push(['snapshot',repo]);
      return {head:repo===DEST?DEST_HEAD:FROZEN_PUBLIC_LEDGER_HEAD,
        entries:clone(repo===DEST?dest:source)};
    }
  };
  return {api,calls,source,dest};
}

test('owner selects a distinct private repository twice; public and malformed inputs fail',()=>{
  assert.equal(validateOperatorSelection({
    repository:DEST,acknowledgedRepository:DEST}),DEST);
  for(const [repository,acknowledgedRepository] of [
    [DEST,undefined], [DEST,'example/other'],[PUBLIC_COORDINATOR,PUBLIC_COORDINATOR],
    ['../private','../private'],['example/private..repo','example/private..repo'],
    ['', ''],[null,null]
  ]) assert.throws(()=>validateOperatorSelection({
    repository,acknowledgedRepository}),/activation blocked/);
});

test('exact historic records are required, not just seven submission counts',()=>{
  const source=records();
  assert.deepEqual(verifyPreservedSubmissions({
    publicEntries:source,privateEntries:clone(source)
  }),{historical_submissions_preserved:7});
  const missing=clone(source).slice(1);
  assert.throws(()=>verifyPreservedSubmissions({
    publicEntries:source,privateEntries:missing
  }),/missing or has different bytes/);
  const modified=clone(source);modified[1].sha='f'.repeat(40);
  assert.throws(()=>verifyPreservedSubmissions({
    publicEntries:source,privateEntries:modified
  }),/missing or has different bytes/);
  const duplicate=clone(source);duplicate[1].path=duplicate[0].path;
  assert.throws(()=>verifyPreservedSubmissions({
    publicEntries:source,privateEntries:duplicate
  }),/duplicate or case-colliding/);
});

test('source with claims, malformed states or missing historical markers is blocked',()=>{
  const source=records();
  source[0].path='claims/example__project/issue-1.json';
  assert.throws(()=>verifyPreservedSubmissions({
    publicEntries:source,privateEntries:records()
  }),/non-submission/);
  const source2=records();source2[0].data.state='claimed';
  assert.throws(()=>verifyPreservedSubmissions({
    publicEntries:source2,privateEntries:records()
  }),/non-submission/);
  assert.throws(()=>verifyPreservedSubmissions({
    publicEntries:records().slice(1),privateEntries:records()
  }),/count changed/);
});

test('frozen public submissions mirrored byte-for-byte in private branch pass GET-only',async()=>{
  const {api,calls}=fixture();
  const report=await assertPrivateLedgerActivation({api,config});
  assert.equal(report.status,'readiness_verified');
  assert.equal(report.historical_submissions_preserved,7);
  assert.equal(report.private_visibility_verified,true);
  assert.equal(report.migration_performed,false);
  assert.equal(report.approval_or_merge_performed,false);
  assert.equal(report.current_private_claims,0);
  assert.ok(calls.some(x=>x[0]==='snapshot'&&x[1]===DEST));
  assert.ok(calls.some(x=>x[0]==='snapshot'&&x[1]===PUBLIC_COORDINATOR));
  assert.deepEqual(Object.keys(api).filter(x=>/create|update|delete/i.test(x)),[]);
  assert.doesNotMatch(JSON.stringify(report),/example\/|submission\/|[a-f0-9]{40}/);
});

test('private branch may contain additional legitimate records once activated',async()=>{
  const {api,dest}=fixture();
  dest.push({path:'claims/example__project/issue-88.json',
    sha:'2'.repeat(40),data:{state:'claimed'}});
  const report=await assertPrivateLedgerActivation({api,config});
  assert.equal(report.current_private_claims,1);
});

test('private metadata must be private before any ledger snapshot access',async()=>{
  const {api,calls}=fixture();
  const original=api.getRepository;
  api.getRepository=async repo=>repo===DEST
    ? {...destMeta,visibility:'public',private:false} : original(repo);
  await assert.rejects(()=>assertPrivateLedgerActivation({api,config}),
    /not verified PRIVATE/);
  assert.ok(!calls.some(x=>x[0]==='snapshot'));
});

test('missing private branch, public source changes or active source claim blocks',async()=>{
  const a=fixture();
  const originalBranch=a.api.getBranchRef;
  a.api.getBranchRef=async repo=>repo===DEST
    ? Promise.reject(Object.assign(new Error('404'),{name:'GitHubError',status:404}))
    : originalBranch(repo);
  await assert.rejects(()=>assertPrivateLedgerActivation({api:a.api,config}));

  const b=fixture();
  b.api.getBranchRef=async repo=>ref(repo===DEST?DEST_HEAD:'1'.repeat(40));
  await assert.rejects(()=>assertPrivateLedgerActivation({api:b.api,config}),
    /public checkpoint drift|source branch commit/);

  const c=fixture();
  c.source.push({path:'claims/example__project/issue-99.json',sha:SHA,
    data:{state:'claimed'}});
  await assert.rejects(()=>assertPrivateLedgerActivation({api:c.api,config}),
    /public checkpoint drift/);
});

test('matching counts do not excuse modified private submission blobs',async()=>{
  const {api,dest}=fixture();
  dest[0].sha='1'.repeat(40);
  await assert.rejects(()=>assertPrivateLedgerActivation({api,config}),
    /missing or has different bytes/);
});

test('changed private branch ref after snapshot blocks readiness',async()=>{
  const {api}=fixture();
  let reads=0;
  api.getBranchRef=async repo=>{
    if(repo===DEST && ++reads>2)return ref('f'.repeat(40));
    return ref(repo===DEST?DEST_HEAD:FROZEN_PUBLIC_LEDGER_HEAD);
  };
  await assert.rejects(()=>assertPrivateLedgerActivation({api,config}),
    /branch changed/);
});

test('refuse a public or invalid selected ledger even when API exists',async()=>{
  const {api}=fixture();
  for(const bad of [PUBLIC_COORDINATOR,'../public','bad/name/extra']) {
    await assert.rejects(()=>assertPrivateLedgerActivation({api,config:{
      repository_visibility_required:'private',
      claim_store:{repo:bad,branch:DESTINATION_BRANCH}
    }}),/activation blocked/);
  }
});
