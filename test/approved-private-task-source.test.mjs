import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  selectOwnerTaskSource,loadApprovedPrivateTaskSource,
  guardPinnedOwnerCatalogWrites
} from '../src/approved-private-task-source.mjs';
import {FROZEN_PUBLIC_LEDGER_HEAD}
  from '../src/private-ledger-activation.mjs';

const PUBLIC='Cesare-ml/virgostars-development-orchestrator';
const PRIVATE='owner/independent-private-fixture';
const HEAD='c'.repeat(40),LEDGER='b'.repeat(40);
const SOURCE_TREE='a'.repeat(40),LEDGER_TREE='d'.repeat(40);
const MAIN_TREE='e'.repeat(40),ENTRY_SHA='f'.repeat(40);
const REF=sha=>({object:{type:'commit',sha}});
const localSha='1'.repeat(64);
const remoteSha='a'.repeat(64);
const remoteEnv={
  VS_PRIVATE_LEDGER_REPO:PRIVATE,VS_PRIVATE_LEDGER_APPROVED_REPO:PRIVATE,
  VS_OWNER_CATALOG_APPROVED_MAIN_SHA:HEAD,
  VS_OWNER_CATALOG_APPROVED_SHA256:remoteSha
};
const localEnv={
  VS_PRIVATE_TASKS_FILE:'/tmp/owner-synthetic.json',
  VS_PRIVATE_TASKS_APPROVED_SHA256:localSha
};
const task={
  repository:PUBLIC,issue:14001,status:'ready',
  role:'developer',access:'write',pilot_wave:3,
  title:'Bounded synthetic independent smoke test',
  scope:['test/synthetic-owner-smoke.test.mjs'],
  resource_scope:{id:'synthetic-smoke',roots:['test/synthetic-owner-smoke.test.mjs']},
  upstream_pr:139,upstream_branch:'feat/allow-owner-orchestrator-self-tasks-20261114'
};
const catalog=()=>({
  schema_version:'1-owner-task-catalog',status:'owner-curated-local',tasks:[structuredClone(task)]
});
const config={repository_visibility_required:'private',
  claim_store:{repo:PRIVATE,branch:'coordination/claims'}};

function fixture() {
  const raw=Buffer.from(JSON.stringify(catalog())+'\n');
  const sha1=createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
  const sha256=createHash('sha256').update(raw).digest('hex');
  const entry={path:'owner-catalog/approved.json',
    sha:sha1,type:'blob',mode:'100644',size:raw.length};
  const historical=Array.from({length:7},(_,i)=>({
    path:'submissions/example__app/issue-'+(i+1)+'.json',
    sha:ENTRY_SHA,
    data:{state:'submitted',issue_number:i+1}
  }));
  const histTree=historical.map(x=>({path:x.path,sha:x.sha,
    mode:'100644',type:'blob',size:200}));
  const calls=[];
  let currentMain=HEAD,writeCount=0;
  const api={
    async getRepository(repo) {
      calls.push('getRepository');
      return repo===PUBLIC
        ? {full_name:PUBLIC,private:false,visibility:'public'}
        : {full_name:PRIVATE,private:true,visibility:'private',
          archived:false,disabled:false};
    },
    async getBranchRef(repo) {
      calls.push('getBranchRef');
      return REF(repo===PUBLIC?FROZEN_PUBLIC_LEDGER_HEAD:LEDGER);
    },
    async getOwnerCatalogRef(repo) {
      calls.push('getOwnerCatalogRef');
      assert.equal(repo,PRIVATE);
      return REF(currentMain);
    },
    async getGitCommit(repo,sha) {
      calls.push('getGitCommit');
      if(repo===PUBLIC)return {sha:FROZEN_PUBLIC_LEDGER_HEAD,tree:{sha:SOURCE_TREE}};
      if(sha===HEAD)return {sha:HEAD,tree:{sha:MAIN_TREE}};
      return {sha:LEDGER,tree:{sha:LEDGER_TREE}};
    },
    async getGitTree(_repo,sha) {
      calls.push('getGitTree');
      if(sha===SOURCE_TREE)return {sha:SOURCE_TREE,truncated:false,
        tree:[{path:'README.md',type:'blob',mode:'100644',
          size:15,sha:'0'.repeat(40)},...histTree]};
      if(sha===MAIN_TREE)return {sha:MAIN_TREE,truncated:false,
        tree:[entry]};
      return {sha:LEDGER_TREE,truncated:false,tree:histTree};
    },
    async getGitBlob() {
      calls.push('getGitBlob');
      return {encoding:'base64',content:raw.toString('base64'),
        size:raw.length,sha:sha1};
    },
    async getLedgerSnapshot(repo) {
      calls.push('getLedgerSnapshot');
      return repo===PUBLIC
        ? {head:FROZEN_PUBLIC_LEDGER_HEAD,entries:historical}
        : {head:LEDGER,entries:historical};
    },
    async createClaim() {writeCount++;return {ok:true};},
    async updateClaim() {writeCount++;return {ok:true};},
    async deleteClaim() {writeCount++;return {ok:true};}
  };
  return {api,calls,sha256,move:()=>{currentMain='9'.repeat(40);},
    writes:()=>writeCount};
}

test('unconfigured legacy fallback is distinct from approved owner catalog',()=>{
  assert.deepEqual(selectOwnerTaskSource({}),{mode:'historical-submitted-only'});
  assert.deepEqual(selectOwnerTaskSource(localEnv),{mode:'owner-local'});
  assert.deepEqual(selectOwnerTaskSource(remoteEnv),{
    mode:'owner-private-github',
    approvedMainSha:HEAD,approvedSha256:remoteSha
  });
});

test('mixed or partially configured owner source is rejected without GitHub calls',()=>{
  for(const bad of [
    {...localEnv,...remoteEnv},
    {VS_PRIVATE_TASKS_FILE:localEnv.VS_PRIVATE_TASKS_FILE},
    {VS_PRIVATE_TASKS_APPROVED_SHA256:localSha},
    {VS_OWNER_CATALOG_APPROVED_MAIN_SHA:HEAD},
    {VS_OWNER_CATALOG_APPROVED_SHA256:remoteSha},
    {...remoteEnv,VS_OWNER_CATALOG_APPROVED_MAIN_SHA:'oops'},
    {...remoteEnv,VS_OWNER_CATALOG_APPROVED_SHA256:remoteSha.toUpperCase()},
    {...localEnv,VS_PRIVATE_TASKS_APPROVED_SHA256:'garbage'},
    [],
    null
  ]) assert.throws(()=>selectOwnerTaskSource(bad),/Owner task source blocked/);
});

test('remote mode loads actual reviewed private blob tasks without local JSON',async()=>{
  const x=fixture();
  const result=await loadApprovedPrivateTaskSource({
    api:x.api,config,
    env:{...remoteEnv,VS_OWNER_CATALOG_APPROVED_SHA256:x.sha256}
  });
  assert.equal(result.mode,'owner-private-github');
  assert.equal(result.tasks.length,1);
  assert.deepEqual(result.tasks[0],task);
  assert.equal(result.approvedMainSha,HEAD);
  assert.ok(x.calls.includes('getGitBlob'));
  assert.equal(x.writes(),0);
});

test('private main ref drift and wrong remote SHA block before any claim',async()=>{
  const x=fixture();x.move();
  await assert.rejects(()=>loadApprovedPrivateTaskSource({
    api:x.api,config,
    env:{...remoteEnv,VS_OWNER_CATALOG_APPROVED_SHA256:x.sha256}
  }),/Owner task source blocked/);
  assert.equal(x.writes(),0);
  const y=fixture();
  await assert.rejects(()=>loadApprovedPrivateTaskSource({
    api:y.api,config,env:remoteEnv
  }),/Owner task source blocked/);
  assert.equal(y.writes(),0);
});

test('private ledger mismatch blocks remote mode before GitHub reads',async()=>{
  const x=fixture();
  await assert.rejects(()=>loadApprovedPrivateTaskSource({
    api:x.api,config:{...config,claim_store:{...config.claim_store,repo:PUBLIC}},
    env:{...remoteEnv,VS_OWNER_CATALOG_APPROVED_SHA256:x.sha256}
  }),/Owner task source blocked/);
  assert.deepEqual(x.calls,[]);
});

test('historical source remains seven submitted tasks without remote access',async()=>{
  const x=fixture();
  const result=await loadApprovedPrivateTaskSource({api:x.api,config,env:{}});
  assert.equal(result.mode,'historical-submitted-only');
  assert.equal(result.tasks.length,7);
  assert.deepEqual(x.calls,[]);
});

test('existing owner-local catalog still loads by exact SHA-256',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'vs-owner-local-source-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'catalog.json');
  const bytes=Buffer.from(JSON.stringify(catalog())+'\n');
  await writeFile(file,bytes);
  const sha=createHash('sha256').update(bytes).digest('hex');
  const x=fixture();
  const result=await loadApprovedPrivateTaskSource({
    api:x.api,config,env:{
      VS_PRIVATE_TASKS_FILE:file,VS_PRIVATE_TASKS_APPROVED_SHA256:sha
    }
  });
  assert.equal(result.mode,'owner-local');
  assert.deepEqual(result.tasks,[task]);
  assert.deepEqual(x.calls,[]);
});

test('mutating calls in remote mode recheck pinned private main every time',async()=>{
  const x=fixture();
  const client=guardPinnedOwnerCatalogWrites({
    api:x.api,refApi:x.api,repository:PRIVATE,approvedMainSha:HEAD
  });
  await client.createClaim(PRIVATE,'claims/example__task/issue-1.json','coordination/claims',{});
  await client.updateClaim(PRIVATE,'claims/example__task/issue-1.json','coordination/claims','sha',{});
  assert.equal(x.writes(),2);
  x.move();
  for(const op of ['createClaim','updateClaim','deleteClaim']) {
    await assert.rejects(()=>client[op](PRIVATE),/Owner task source blocked/);
  }
  assert.equal(x.writes(),2);
});

test('remote mutation guard never writes to an unexpected repository',async()=>{
  const x=fixture();
  const client=guardPinnedOwnerCatalogWrites({
    api:x.api,refApi:x.api,repository:PRIVATE,approvedMainSha:HEAD
  });
  await assert.rejects(()=>client.createClaim(PUBLIC),/Owner task source blocked/);
  assert.equal(x.writes(),0);
  assert.ok(!x.calls.includes('getOwnerCatalogRef'));
});

test('malformed mutation guard cannot be used as a fail-open adapter',()=>{
  const x=fixture();
  for(const approvedMainSha of [undefined,'', '0'.repeat(64)]) {
    assert.throws(()=>guardPinnedOwnerCatalogWrites({
      api:x.api,refApi:x.api,repository:PRIVATE,approvedMainSha
    }),/Owner task source blocked/);
  }
});

test('public tokenless CLI never resolves private catalogs despite hostile env',()=>{
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env,...remoteEnv,
    VS_OWNER_CATALOG_APPROVED_SHA256:'0'.repeat(64)};
  delete env.GITHUB_TOKEN;
  const p=spawnSync(process.execPath,[cli,'public-discover'],
    {env,encoding:'utf8',timeout:15000});
  assert.equal(p.status,0,p.stderr);
  assert.equal(JSON.parse(p.stdout).write_claims_enabled,false);
  assert.doesNotMatch(p.stdout,/owner-private-github|independent-private-fixture/);
});

test('offline malformed remote mode blocks alpha-doctor before GitHub access',()=>{
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env,VS_OWNER_CATALOG_APPROVED_MAIN_SHA:HEAD};
  delete env.GITHUB_TOKEN;
  delete env.VS_OWNER_CATALOG_APPROVED_SHA256;
  delete env.VS_PRIVATE_TASKS_FILE;
  delete env.VS_PRIVATE_TASKS_APPROVED_SHA256;
  const p=spawnSync(process.execPath,[cli,'alpha-doctor'],
    {env,encoding:'utf8',timeout:15000});
  assert.equal(p.status,1);
  assert.match(p.stderr,/Owner task source blocked/);
  assert.doesNotMatch(p.stderr,/GITHUB_TOKEN|independent-private-fixture/);
});
