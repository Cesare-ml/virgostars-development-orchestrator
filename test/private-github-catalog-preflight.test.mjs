import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  verifyPinnedCatalogBlob,inspectApprovedPrivateGitHubCatalog,
  OWNER_CATALOG_PATH
} from '../src/private-github-catalog-preflight.mjs';
import {loadHistoricalPilotTasks} from '../src/owner-task-catalog.mjs';
import {FROZEN_PUBLIC_LEDGER_HEAD} from '../src/private-ledger-activation.mjs';

const PUBLIC='Cesare-ml/virgostars-development-orchestrator';
const PRIVATE='fixture/private-coordinator';
const SOURCE_TREE='a'.repeat(40);
const LEDGER_HEAD='b'.repeat(40);
const MAIN_HEAD='c'.repeat(40);
const LEDGER_TREE='d'.repeat(40);
const MAIN_TREE='e'.repeat(40);
const SUBMISSION_BLOB='f'.repeat(40);
const ref=sha=>({object:{type:'commit',sha}});
const clone=x=>structuredClone(x);
const submission=()=>Array.from({length:7},(_,i)=>({
  path:'submissions/fixture__app/issue-'+(i+1)+'.json',
  sha:SUBMISSION_BLOB,
  data:{state:'submitted',issue_number:i+1}
}));
const treeRecord=x=>({
  path:x.path,sha:x.sha,type:'blob',mode:'100644',size:120
});
const payload=()=>({
  schema_version:'1-owner-task-catalog',
  status:'owner-curated-local',
  tasks:[141,142].map((issue,i)=>({
    repository:PUBLIC,issue,status:'ready',role:'developer',access:'write',
    pilot_wave:3,title:'Synthetic owner task '+(i+1),
    scope:[i===0?'docs/test-owner-only.md':'test/test-owner-only.test.mjs'],
    resource_scope:{
      id:i===0?'owner-doc-pilot':'owner-test-pilot',
      roots:[i===0?'docs/test-owner-only.md':'test/test-owner-only.test.mjs']
    },
    upstream_pr:139,upstream_branch:'feat/allow-owner-orchestrator-self-tasks-20261114'
  }))
});
const encode=x=>{
  const raw=Buffer.from(JSON.stringify(x,null,2)+'\n','utf8');
  const sha=createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
  const sha256=createHash('sha256').update(raw).digest('hex');
  return {
    sha256,
    entry:{path:OWNER_CATALOG_PATH,sha,type:'blob',mode:'100644',size:raw.length},
    blob:{sha,encoding:'base64',size:raw.length,content:raw.toString('base64')}
  };
};

function fixture(overrides={}) {
  const source=submission(),dest=submission(),calls=[];
  const candidate=encode(overrides.payload??payload());
  let mainReads=0;
  const api={
    async getRepository(repo) {
      calls.push('getRepository');
      if(repo===PUBLIC)return {full_name:PUBLIC,visibility:'public',private:false};
      return {full_name:PRIVATE,
        visibility:overrides.publicDestination?'public':'private',
        private:!overrides.publicDestination,archived:false,disabled:false};
    },
    async getBranchRef(repo) {
      calls.push('getBranchRef');
      return ref(repo===PUBLIC?FROZEN_PUBLIC_LEDGER_HEAD:LEDGER_HEAD);
    },
    async getOwnerCatalogRef() {
      calls.push('getOwnerCatalogRef');mainReads++;
      return ref(overrides.mainMoved && mainReads>1?'1'.repeat(40):MAIN_HEAD);
    },
    async getGitCommit(repo,sha) {
      calls.push('getGitCommit');
      if(repo===PUBLIC)return {sha:FROZEN_PUBLIC_LEDGER_HEAD,tree:{sha:SOURCE_TREE}};
      if(sha===MAIN_HEAD)return {sha:MAIN_HEAD,tree:{sha:MAIN_TREE}};
      return {sha:LEDGER_HEAD,tree:{sha:LEDGER_TREE}};
    },
    async getGitTree(repo,sha) {
      calls.push('getGitTree');
      if(repo===PUBLIC)return {sha:SOURCE_TREE,truncated:false,
        tree:[{path:'README.md',sha:'0'.repeat(40),type:'blob',
          mode:'100644',size:33},...source.map(treeRecord)]};
      if(sha===MAIN_TREE)return {sha:MAIN_TREE,truncated:false,tree:
        overrides.noCatalog?[]:[
          {...candidate.entry,...overrides.entryOverrides},
          ...(overrides.aliasPath?[{...candidate.entry,path:overrides.aliasPath}]:[])
        ]};
      return {sha:LEDGER_TREE,truncated:false,tree:dest.map(treeRecord)};
    },
    async getLedgerSnapshot(repo) {
      calls.push('getLedgerSnapshot');
      return repo===PUBLIC
        ? {head:FROZEN_PUBLIC_LEDGER_HEAD,entries:clone(source)}
        : {head:LEDGER_HEAD,entries:clone(dest)};
    },
    async getGitBlob() {
      calls.push('getGitBlob');
      return {...candidate.blob,...overrides.blobOverrides};
    }
  };
  return {api,calls,candidate,source,dest};
}
async function check(x,params={}) {
  return inspectApprovedPrivateGitHubCatalog({
    api:x.api,repository:PRIVATE,acknowledgedRepository:PRIVATE,
    approvedMainSha:MAIN_HEAD,
    approvedSha256:x.candidate.sha256,
    legacyTasks:await loadHistoricalPilotTasks(),
    ...params
  });
}

test('strict Git blob SHA-1 + independently pinned SHA-256 plus task schema',async()=>{
  const x=fixture();
  const tasks=(await loadHistoricalPilotTasks());
  const result=verifyPinnedCatalogBlob({
    entry:x.candidate.entry,blob:x.candidate.blob,
    approvedSha256:x.candidate.sha256,legacyTasks:tasks
  });
  assert.equal(result.tasks.length,2);
  assert.equal(result.sha256,x.candidate.sha256);
});

test('a reviewed private main commit passes aggregate-only GET-only preflight',async()=>{
  const x=fixture();const result=await check(x);
  assert.equal(result.catalog_git_blob_and_sha256_verified,true);
  assert.equal(result.configured_tasks,2);
  assert.equal(result.configured_write_tasks,2);
  assert.equal(result.historical_submissions_preserved,7);
  assert.equal(result.owner_approval_proven_cryptographically,false);
  assert.equal(result.task_claimed,false);
  assert.equal(result.ready_to_launch,false);
  assert.equal(result.branch_protection_verified,false);
  assert.deepEqual(Object.keys(x.api).filter(k=>/create|update|delete|post|put/i.test(k)),[]);
  assert.doesNotMatch(JSON.stringify(result),/fixture\/|issue-141|owner-doc-pilot|[a-f0-9]{40}/);
});

test('private PR proposal status is NOT treated as an approved catalog',async()=>{
  const x=fixture({payload:{...payload(),status:'proposal-awaiting-owner-approval'}});
  await assert.rejects(()=>check(x),/Private GitHub catalog blocked/);
});

test('approval must pin the current private main HEAD before file reads',async()=>{
  const x=fixture();
  await assert.rejects(()=>check(x,{approvedMainSha:'1'.repeat(40)}),
    /Private GitHub catalog blocked/);
  assert.ok(!x.calls.includes('getGitBlob'));
});

test('malformed SHA, missing confirmation or public selection aborts before API calls',async()=>{
  for(const params of [
    {approvedMainSha:'bad'},
    {approvedSha256:'x'.repeat(64)},
    {acknowledgedRepository:'fixture/other'},
    {repository:PUBLIC,acknowledgedRepository:PUBLIC}
  ]) {
    const x=fixture();
    await assert.rejects(()=>check(x,params));
    assert.deepEqual(x.calls,[]);
  }
});

test('public destination refuses even when pinned catalog exists',async()=>{
  const x=fixture({publicDestination:true});
  await assert.rejects(()=>check(x),/PRIVATE|private/i);
  assert.ok(!x.calls.includes('getGitBlob'));
});

test('missing, aliased or symlink catalog is fail-closed',async()=>{
  for(const opts of [
    {noCatalog:true},
    {aliasPath:'Owner-Catalog/Approved.json'},
    {entryOverrides:{mode:'120000'}}
  ]) {
    const x=fixture(opts);
    await assert.rejects(()=>check(x),/Private GitHub catalog blocked/);
  }
});

test('Git blob metadata, canonical base64 and byte hashes are verified',async()=>{
  for(const blobOverrides of [
    {sha:'1'.repeat(40)},
    {size:12},
    {encoding:'utf-8'},
    {content:'not-base64?'}
  ]) {
    const x=fixture({blobOverrides});
    await assert.rejects(()=>check(x),/Private GitHub catalog blocked/);
  }
  const x=fixture();
  await assert.rejects(()=>check(x,{approvedSha256:'0'.repeat(64)}),
    /Private GitHub catalog blocked/);
});

test('main ref movement while reading blocks and cannot authorize a claim',async()=>{
  const x=fixture({mainMoved:true});
  await assert.rejects(()=>check(x),/Private GitHub catalog blocked/);
});

test('missing or changed historic submission blocks private catalog use',async()=>{
  const x=fixture();x.dest[0].sha='1'.repeat(40);
  await assert.rejects(()=>check(x),/missing or has different bytes/);
  assert.ok(!x.calls.includes('getGitBlob'));
});

test('catalog with historic issue identity or overlapping resources is rejected',async()=>{
  const old=fixture();
  const tasks=payload();
  tasks.tasks[0].repository='Cesare-ml/astrological-charts';
  tasks.tasks[0].issue=25;
  const x=fixture({payload:tasks});
  await assert.rejects(()=>check(x),/Private GitHub catalog blocked/);
  const conflict=payload();
  conflict.tasks[1].resource_scope.roots=
    conflict.tasks[0].resource_scope.roots;
  const y=fixture({payload:conflict});
  await assert.rejects(()=>check(y),/Private GitHub catalog blocked/);
});
