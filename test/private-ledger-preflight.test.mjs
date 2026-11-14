import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GitHubError,makeGitHubClient} from '../src/github.mjs';
import {
  inspectPrivateDestination,PUBLIC_COORDINATOR,DESTINATION_BRANCH
} from '../src/private-ledger-preflight.mjs';

const D='example-org/private-ledger';
const A='a'.repeat(40),B='b'.repeat(40);
const privateRepo=()=>({full_name:D,private:true,visibility:'private',
  archived:false,disabled:false});
const record=(path)=>({path,type:'blob',mode:'100644',sha:A,size:200});
const directory=(path)=>({path,type:'tree',mode:'040000',sha:B});
function api({visibility='private',missing=false,records=[],truncated=false,
               drift=false}={}) {
  const calls=[];
  let reads=0;
  const client={
    calls,
    async getRepository(repo) {
      calls.push('repository');assert.equal(repo,D);reads++;
      return {...privateRepo(),private:visibility==='private'&&!(drift&&reads>1),
        visibility:drift&&reads>1?'public':visibility};
    },
    async getBranchRef(repo,branch) {
      calls.push('branch');assert.equal(repo,D);
      assert.equal(branch,DESTINATION_BRANCH);
      if(missing)throw new GitHubError(404);
      return {object:{type:'commit',sha:A}};
    },
    async getGitCommit(repo,sha) {
      calls.push('commit');assert.equal(repo,D);assert.equal(sha,A);
      return {sha:A,tree:{sha:B}};
    },
    async getGitTree(repo,sha) {
      calls.push('tree');assert.equal(repo,D);assert.equal(sha,B);
      return {sha:B,truncated,tree:records};
    }
  };
  return client;
}
test('rejects public destination and the public orchestrator before fetching branch data',async()=>{
  const c=api({visibility:'public'});
  await assert.rejects(
    ()=>inspectPrivateDestination({api:c,destination:D}),/not verified PRIVATE/);
  assert.deepEqual(c.calls,['repository']);
  await assert.rejects(
    ()=>inspectPrivateDestination({api:c,destination:PUBLIC_COORDINATOR}),
    /distinct private GitHub repository/);
  assert.deepEqual(c.calls,['repository']);
});
test('private destination with missing branch returns planning state only, never writes',async()=>{
  const c=api({missing:true});
  const x=await inspectPrivateDestination({api:c,destination:D});
  assert.equal(x.branch_exists,false);
  assert.equal(x.private_visibility_verified,true);
  assert.equal(x.status,'private_branch_needs_setup');
  assert.equal(x.ready_to_migrate,false);
  assert.equal(x.write_enabled,false);
  assert.deepEqual(x.records,{claims:0,resources:0,submissions:0});
  assert.deepEqual(c.calls,['repository','branch','branch','repository']);
});
test('existing private records are counted without emitting sensitive paths or blobs',async()=>{
  const c=api({records:[
    directory('claims'),record('claims/owner__private/issue-10.json'),
    directory('resources'),record('resources/owner__private/sensitive.json'),
    directory('submissions'),record('submissions/owner__private/issue-2.json')
  ]});
  const x=await inspectPrivateDestination({api:c,destination:D});
  assert.equal(x.branch_exists,true);
  assert.equal(x.status,'existing_records_need_reconciliation');
  assert.deepEqual(x.records,{claims:1,resources:1,submissions:1});
  assert.equal(x.ready_to_migrate,false);
  assert.equal(x.write_enabled,false);
  assert.doesNotMatch(JSON.stringify(x),/owner__private|issue-10|sensitive|example-org/);
  assert.deepEqual(c.calls,['repository','branch','commit','tree','branch','repository']);
});
test('README-only bootstrap is empty, while foreign private files block the clean-branch status',async()=>{
  const clean=await inspectPrivateDestination({api:api({records:[record('README.md')]}) ,destination:D});
  assert.equal(clean.status,'empty_branch_needs_owner_approval');
  assert.equal(clean.unclassified_blobs,0);
  const dirty=await inspectPrivateDestination({api:api({records:[
    record('README.md'),directory('backups'),record('backups/private-sessions.json')
  ]}),destination:D});
  assert.equal(dirty.status,'existing_records_need_reconciliation');
  assert.equal(dirty.unclassified_blobs,1);
  assert.deepEqual(dirty.records,{claims:0,resources:0,submissions:0});
  assert.equal(dirty.ready_to_migrate,false);
  assert.equal(dirty.write_enabled,false);
  assert.doesNotMatch(JSON.stringify(dirty),/backups|private-sessions|example-org/);
});
test('existing empty private branch still requires explicit owner approval',async()=>{
  const x=await inspectPrivateDestination({api:api(),destination:D});
  assert.equal(x.branch_exists,true);
  assert.equal(x.status,'empty_branch_needs_owner_approval');
  assert.equal(x.ready_to_migrate,false);
});
test('denied repository metadata and branch access fail closed, not a clean status',async()=>{
  const denied=api();
  denied.getRepository=async()=>{throw new GitHubError(403)};
  await assert.rejects(
    ()=>inspectPrivateDestination({api:denied,destination:D}),GitHubError);
  const branchDenied=api();
  branchDenied.getBranchRef=async()=>{throw new GitHubError(403)};
  await assert.rejects(
    ()=>inspectPrivateDestination({api:branchDenied,destination:D}),GitHubError);
  const hidden=api();
  hidden.getRepository=async()=>{throw new GitHubError(404)};
  await assert.rejects(
    ()=>inspectPrivateDestination({api:hidden,destination:D}),GitHubError);
});
test('visibility drift while checking tree or missing ref never looks private',async()=>{
  await assert.rejects(()=>inspectPrivateDestination({
    api:api({drift:true}),destination:D
  }),/not verified PRIVATE/);
  await assert.rejects(()=>inspectPrivateDestination({
    api:api({drift:true,missing:true}),destination:D
  }),/not verified PRIVATE/);
});
test('invalid, truncated or conflicting Git metadata fails closed',async()=>{
  const mismatch=api();
  mismatch.getGitCommit=async()=>({sha:'c'.repeat(40),tree:{sha:B}});
  await assert.rejects(()=>inspectPrivateDestination({api:mismatch,destination:D}),
    /commit or tree/);
  await assert.rejects(()=>inspectPrivateDestination({
    api:api({truncated:true}),destination:D
  }),/incomplete or oversized/);
  await assert.rejects(()=>inspectPrivateDestination({
    api:api({records:[record('claims/a.json'),record('claims/A.json')]}),destination:D
  }),/duplicate destination tree path/);
  await assert.rejects(()=>inspectPrivateDestination({
    api:api({records:[{...record('claims/link'),mode:'120000'}]}),destination:D
  }),/unsupported or oversized destination record/);
  await assert.rejects(()=>inspectPrivateDestination({
    api:api({records:[record('../outside')]}),destination:D
  }),/unsafe tree path/);
});
test('metadata client performs GET only, never PUT/POST/DELETE or blob downloads',async()=>{
  const urls=[];
  const client=makeGitHubClient({token:'fake-local-test-token',
    fetchImpl:async(url,options)=>{
      urls.push({url,method:options.method});
      if(url.endsWith('/git/ref/heads/'+DESTINATION_BRANCH))
        return {ok:true,status:200,json:async()=>({object:{type:'commit',sha:A}})};
      if(url.endsWith('/git/commits/'+A))
        return {ok:true,status:200,json:async()=>({sha:A,tree:{sha:B}})};
      if(url.endsWith('/git/trees/'+B+'?recursive=1'))
        return {ok:true,status:200,json:async()=>({
          sha:B,truncated:false,tree:[]})};
      return {ok:true,status:200,json:async()=>privateRepo()};
    }
  });
  const x=await inspectPrivateDestination({api:client,destination:D});
  assert.equal(x.status,'empty_branch_needs_owner_approval');
  assert.equal(urls.length,6);
  assert.ok(urls.every(x=>x.method==='GET'));
  assert.ok(urls.every(x=>!x.url.includes('/git/blobs/')));
});
test('CLI preflight is independently reachable without the historical pilot catalog',()=>{
  const script=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};delete env.GITHUB_TOKEN;delete env.GH_TOKEN;
  const bad=spawnSync(process.execPath,[script,'check-private-destination',D],{
    env,encoding:'utf8',timeout:15000
  });
  assert.equal(bad.status,1);
  assert.match(bad.stderr,/GITHUB_TOKEN is required/);
  assert.doesNotMatch(bad.stderr,/Legacy coordination is disabled/);
  const publicMode=spawnSync(process.execPath,[script,'public-discover'],{
    env,encoding:'utf8',timeout:15000
  });
  assert.equal(publicMode.status,0,publicMode.stderr);
  const protectedCommand=spawnSync(process.execPath,[script,
    'check-private-destination',D,'--confirm'],{env,encoding:'utf8',timeout:15000});
  assert.equal(protectedCommand.status,1);
  assert.match(protectedCommand.stderr,/requires exactly OWNER\/REPO/);
});

test('branch moving between tree inspection and final ref read is rejected',async()=>{
 const base=api();
 const original=base.getBranchRef.bind(base);
 let reads=0;
 base.getBranchRef=async (repo,branch)=>{
  const ref=await original(repo,branch);
  reads++;
  return reads===2?{object:{type:'commit',sha:'e'.repeat(40)}}:ref;
 };
 await assert.rejects(()=>inspectPrivateDestination({api:base,destination:D}),
  /destination branch changed/);
});
test('missing branch suddenly appearing during a 404 recheck is not safe',async()=>{
 const base=api({missing:true});
 const original=base.getBranchRef.bind(base);
 let reads=0;
 base.getBranchRef=async (repo,branch)=>{
  reads++;
  if(reads===1)return original(repo,branch);
  return {object:{type:'commit',sha:A}};
 };
 await assert.rejects(()=>inspectPrivateDestination({api:base,destination:D}),
  /destination branch appeared/);
});
