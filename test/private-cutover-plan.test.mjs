import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GitHubError,makeGitHubClient} from '../src/github.mjs';
import {planPrivateCutover,summarizeHistoricalLedgerTree}
  from '../src/private-cutover-plan.mjs';
import {PUBLIC_COORDINATOR,DESTINATION_BRANCH}
  from '../src/private-ledger-preflight.mjs';

const DEST='example-org/private-coordination';
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),
  D='d'.repeat(40),E='e'.repeat(40);
const file=path=>({path,type:'blob',mode:'100644',sha:E,size:100});
const dir=path=>({path,type:'tree',mode:'040000',sha:E});
const submissions=()=>Array.from({length:7},(_,n)=>file('submissions/opaque-'+n+'.json'));
function mock({sourceFiles=submissions(),destinationFiles=[],sourceActive=0,
 missing=false,sourceMoved=false,destinationMoved=false,appears=false,
 sourcePrivate=false,destinationPublic=false,sourceTruncated=false,
 destinationTruncated=false,forbidden=false}={}) {
 let sReads=0,dReads=0;
 const calls=[];
 return {
  calls,
  async getRepository(repo){
   calls.push(['repo',repo]);
   if(forbidden)throw new GitHubError(403);
   if(repo===PUBLIC_COORDINATOR)
    return {full_name:repo,private:sourcePrivate,
      visibility:sourcePrivate?'private':'public'};
   assert.equal(repo,DEST);
   return {full_name:repo,private:!destinationPublic,
     visibility:destinationPublic?'public':'private'};
  },
  async getBranchRef(repo,branch){
   calls.push(['ref',repo]);assert.equal(branch,DESTINATION_BRANCH);
   if(repo===PUBLIC_COORDINATOR) {
    sReads++;return {object:{type:'commit',sha:sourceMoved&&sReads>2?E:A}};
   }
   assert.equal(repo,DEST);dReads++;
   if(missing && !(appears&&dReads>1))throw new GitHubError(404);
   return {object:{type:'commit',sha:destinationMoved&&dReads>=4?E:C}};
  },
  async getGitCommit(repo,id){
   calls.push(['commit',repo]);
   assert.equal(id,repo===PUBLIC_COORDINATOR?A:C);
   return {sha:id,tree:{sha:repo===PUBLIC_COORDINATOR?B:D}};
  },
  async getGitTree(repo,id){
   calls.push(['tree',repo]);
   if(repo===PUBLIC_COORDINATOR){
    assert.equal(id,B);
    return {sha:B,truncated:sourceTruncated,
      tree:[dir('submissions'),...sourceFiles,
       ...Array.from({length:sourceActive},(_,n)=>file('claims/lock-'+n+'.json'))]};
   }
   assert.equal(id,D);
   return {sha:D,truncated:destinationTruncated,tree:destinationFiles};
  }
 };
}
test('stable comparison is counts-only and never migration authorization',async()=>{
 const c=mock(),x=await planPrivateCutover({api:c,destination:DEST});
 assert.equal(x.schema_version,'1-private-cutover-plan');
 assert.deepEqual(x.source.records,{claims:0,resources:0,submissions:7});
 assert.deepEqual(x.destination.records,{claims:0,resources:0,submissions:0});
 assert.equal(x.ready_to_migrate,false);
 assert.equal(x.writes_enabled,false);
 assert.equal(x.historical_data_moved,false);
 assert.equal(x.source_snapshot_stable,true);
 assert.equal(x.destination_snapshot_stable,true);
 assert.ok(x.blockers.includes('DESTINATION_EMPTY_REQUIRES_OWNER_APPROVAL'));
 assert.doesNotMatch(JSON.stringify(x),/example-org|opaque-|session_id|owner_id/);
 assert.ok(c.calls.every(y=>['repo','ref','commit','tree'].includes(y[0])));
});
test('active source locks and nonempty private ledger require reconciliation',async()=>{
 const x=await planPrivateCutover({api:mock({sourceActive:1,
  destinationFiles:[dir('claims'),file('claims/a.json')]}),destination:DEST});
 assert.equal(x.source.records.claims,1);
 assert.equal(x.destination.records.claims,1);
 assert.ok(x.blockers.includes('SOURCE_HAS_ACTIVE_LOCKS'));
 assert.ok(x.blockers.includes('DESTINATION_CONTAINS_EXISTING_RECORDS'));
});
test('missing private branch remains blocked; no remote initialization occurs',async()=>{
 const c=mock({missing:true});
 const x=await planPrivateCutover({api:c,destination:DEST});
 assert.equal(x.destination.branch_exists,false);
 assert.ok(x.blockers.includes('DESTINATION_BRANCH_NOT_CONFIGURED'));
 assert.equal(c.calls.filter(y=>y[0]==='ref'&&y[1]===DEST).length,4);
});
test('unclassified source files and absent submissions require independent review',async()=>{
 const x=await planPrivateCutover({api:mock({sourceFiles:[file('other/unknown.json')]}),
  destination:DEST});
 assert.equal(x.source.unclassified_blobs,1);
 assert.ok(x.blockers.includes('SOURCE_UNCLASSIFIED_BLOBS_REQUIRE_REVIEW'));
 assert.ok(x.blockers.includes('SOURCE_HAS_NO_HISTORICAL_SUBMISSIONS'));
});
test('source or destination branch movement aborts rather than trusting stale counts',async()=>{
 await assert.rejects(()=>planPrivateCutover({api:mock({sourceMoved:true}),
  destination:DEST}),/source branch changed/);
 await assert.rejects(()=>planPrivateCutover({api:mock({destinationMoved:true}),
  destination:DEST}),/destination branch changed/);
 await assert.rejects(()=>planPrivateCutover({api:mock({missing:true,appears:true}),
  destination:DEST}),/destination branch changed|branch appeared/);
});
test('public/private visibility inversion and GitHub permission denial fail closed',async()=>{
 await assert.rejects(()=>planPrivateCutover({api:mock({sourcePrivate:true}),
  destination:DEST}),/source visibility/);
 await assert.rejects(()=>planPrivateCutover({api:mock({destinationPublic:true}),
  destination:DEST}),/not verified PRIVATE/);
 await assert.rejects(()=>planPrivateCutover({api:mock({forbidden:true}),
  destination:DEST}),GitHubError);
});
test('malformed/truncated Git trees and symlinks fail closed',async()=>{
 await assert.rejects(()=>planPrivateCutover({api:mock({sourceTruncated:true}),
  destination:DEST}),/truncated or oversized/);
 await assert.rejects(()=>planPrivateCutover({api:mock({destinationTruncated:true}),
  destination:DEST}),/incomplete or oversized/);
 for(const item of [file('../escape'),{...file('claims/link'),mode:'120000'},
   {...file('claims/huge'),size:65537}]) {
  await assert.rejects(()=>planPrivateCutover({api:mock({sourceFiles:[item]}),
   destination:DEST}),/unsafe source|unsupported or oversized/);
 }
 assert.throws(()=>summarizeHistoricalLedgerTree({sha:B,truncated:false,
  tree:[file('submissions/a.json'),file('submissions/A.json')]}),/case-colliding/);
});
test('CLI stays separate from legacy public ledger and requires local credentials',()=>{
 const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
 const env={...process.env};delete env.GITHUB_TOKEN;delete env.GH_TOKEN;
 const run=(args)=>spawnSync(process.execPath,[cli,...args],
  {env,encoding:'utf8',timeout:15000});
 const auth=run(['plan-private-cutover',DEST]);
 assert.equal(auth.status,1);
 assert.match(auth.stderr,/GITHUB_TOKEN is required/);
 assert.doesNotMatch(auth.stderr,/Legacy coordination is disabled/);
 const flags=run(['plan-private-cutover',DEST,'--confirm']);
 assert.equal(flags.status,1);
 assert.match(flags.stderr,/requires exactly OWNER\/PRIVATE-REPO/);
 assert.equal(run(['public-discover']).status,0);
});
