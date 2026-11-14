import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectPrivateGitHubAlphaReadiness}
  from '../src/private-github-alpha-readiness.mjs';
import {loadHistoricalPilotTasks}
  from '../src/owner-task-catalog.mjs';
import {FROZEN_PUBLIC_LEDGER_HEAD}
  from '../src/private-ledger-activation.mjs';

const PUBLIC='Cesare-ml/virgostars-development-orchestrator';
const PRIVATE='example/reviewed-owner-ledger';
const MAIN='c'.repeat(40),LEDGER='b'.repeat(40);
const SOURCE_TREE='a'.repeat(40),DEST_TREE='d'.repeat(40);
const MAIN_TREE='e'.repeat(40),SUBMISSION_SHA='f'.repeat(40);
const SOURCE_PR=139,UPSTREAM_HEAD='1'.repeat(40),BASE_SHA='2'.repeat(40);
const REF=x=>({object:{type:'commit',sha:x}});
const clone=x=>structuredClone(x);
const entries=()=>Array.from({length:7},(_,i)=>({
  path:'submissions/example__test/issue-'+(i+1)+'.json',
  sha:SUBMISSION_SHA,data:{state:'submitted',target_repository:'example/test'}
}));
const blob=x=>({path:x.path,type:'blob',mode:'100644',size:128,sha:x.sha});
const roots=[
  'docs/supervised-owner-example.md',
  'test/supervised-owner-example.test.mjs'
];
const tasks=()=>roots.map((root,i)=>({
  repository:PUBLIC,issue:401+i,status:'ready',role:'developer',
  access:'write',pilot_wave:3,title:'Synthetic approved test '+i,
  scope:[root],resource_scope:{id:'owner-alpha-'+i,roots:[root]},
  upstream_pr:SOURCE_PR,upstream_branch:'feat/allow-owner-orchestrator-self-tasks-20261114'
}));
const makeCatalog=()=>({
  schema_version:'1-owner-task-catalog',status:'owner-curated-local',tasks:tasks()
});
const config={
  repository_visibility_required:'private',
  claim_store:{repo:PRIVATE,branch:'coordination/claims'},
  active_repositories:[{full_name:PUBLIC,pilot_enabled:true}]
};
function encodedCatalog() {
  const raw=Buffer.from(JSON.stringify(makeCatalog())+'\n');
  const sha=createHash('sha1').update('blob '+raw.length+'\0').update(raw)
    .digest('hex');
  return {
    sha256:createHash('sha256').update(raw).digest('hex'),
    entry:{path:'owner-catalog/approved.json',type:'blob',
      mode:'100644',size:raw.length,sha},
    blob:{encoding:'base64',content:raw.toString('base64'),
      size:raw.length,sha}
  };
}
function fixture(opts={}) {
  const catalog=encodedCatalog();
  const source=entries(),dest=entries(),calls=[];
  const original={
    number:SOURCE_PR,state:opts.staleUpstream?'closed':'open',
    changed_files:0,head:{ref:tasks()[0].upstream_branch,sha:UPSTREAM_HEAD},
    base:{ref:'main',sha:BASE_SHA},draft:true
  };
  const competing={
    number:500,state:'open',changed_files:1,
    head:{ref:'feat/other',sha:'3'.repeat(40)},
    base:{ref:'main',sha:BASE_SHA},draft:true
  };
  const prs=opts.overlap?[original,competing]:[original];
  let catalogReads=0;
  const api={
    async getRepository(repo) {
      calls.push('getRepository');
      if(repo===PUBLIC)return {full_name:PUBLIC,private:false,visibility:'public'};
      return {full_name:PRIVATE,private:!opts.publicLedger,
        visibility:opts.publicLedger?'public':'private',
        archived:false,disabled:false};
    },
    async getBranchRef(repo) {
      calls.push('getBranchRef');
      return REF(repo===PUBLIC?FROZEN_PUBLIC_LEDGER_HEAD:LEDGER);
    },
    async getOwnerCatalogRef() {
      calls.push('getOwnerCatalogRef');
      catalogReads++;
      return REF(opts.catalogMoved&&catalogReads===3?'4'.repeat(40):MAIN);
    },
    async getGitCommit(repo,sha) {
      calls.push('getGitCommit');
      if(repo===PUBLIC)return {sha:FROZEN_PUBLIC_LEDGER_HEAD,
        tree:{sha:SOURCE_TREE}};
      if(sha===MAIN)return {sha:MAIN,tree:{sha:MAIN_TREE}};
      return {sha:LEDGER,tree:{sha:DEST_TREE}};
    },
    async getGitTree(repo,sha) {
      calls.push('getGitTree');
      if(repo===PUBLIC)return {sha:SOURCE_TREE,truncated:false,tree:[
        {path:'README.md',type:'blob',mode:'100644',size:10,sha:'5'.repeat(40)},
        ...source.map(blob)]};
      if(sha===MAIN_TREE)return {sha:MAIN_TREE,truncated:false,
        tree:[catalog.entry]};
      return {sha:DEST_TREE,truncated:false,tree:dest.map(blob)};
    },
    async getGitBlob() {calls.push('getGitBlob');return catalog.blob;},
    async getLedgerSnapshot(repo) {
      calls.push('getLedgerSnapshot');
      return repo===PUBLIC?{head:FROZEN_PUBLIC_LEDGER_HEAD,entries:clone(source)}
        :{head:LEDGER,entries:clone(dest)};
    },
    async getIssue(_repo,issue) {
      calls.push('getIssue');
      return {number:issue,state:opts.closedIssue===issue?'closed':'open'};
    },
    async getPullRequest(_repo,number) {
      calls.push('getPullRequest');
      if(number===SOURCE_PR)return clone(original);
      return clone(competing);
    },
    async getOpenPullRequests() {
      calls.push('getOpenPullRequests');return clone(prs);
    },
    async getPullRequestFiles(_repo,number) {
      calls.push('getPullRequestFiles');
      return number===500?[{filename:roots[0],status:'added'}]:[];
    }
  };
  return {api,calls,catalog,dest};
}
async function run(x,overrides={}) {
  return inspectPrivateGitHubAlphaReadiness({
    api:x.api,config:clone(config),repository:PRIVATE,
    acknowledgedRepository:PRIVATE,
    approvedMainSha:MAIN,approvedSha256:x.catalog.sha256,
    legacyTasks:await loadHistoricalPilotTasks(),...overrides
  });
}

test('two disjoint real-issue-like tasks pass synthetic live preflight; still no launch',async()=>{
  const x=fixture();
  const report=await run(x);
  assert.equal(report.schema_version,'1-private-github-owner-alpha-readiness');
  assert.equal(report.configured_tasks,2);
  assert.equal(report.independent_developer_partitions,2);
  assert.equal(report.live_readiness_prerequisites_passed,true);
  assert.equal(report.private_catalog_verified,true);
  assert.equal(report.ready_to_launch,false);
  assert.equal(report.owner_final_launch_approval_required,true);
  assert.equal(report.work_claimed,false);
  assert.equal(report.merge_authorized,false);
  assert.deepEqual(report.blockers,[]);
  assert.deepEqual(Object.keys(x.api).filter(k=>/create|update|delete|put|post/i.test(k)),[]);
  assert.doesNotMatch(JSON.stringify(report),
    /example\/|owner-alpha-|issue-401|supervised-owner|[a-f0-9]{40}/);
});

test('closed task issue is reported blocked, not auto-claimed',async()=>{
  const report=await run(fixture({closedIssue:401}));
  assert.equal(report.live_readiness_prerequisites_passed,false);
  assert.ok(report.blockers.includes('TARGET_ISSUE_CLOSED'));
  assert.equal(report.ready_to_launch,false);
});

test('stale upstream review branch blocks real readiness',async()=>{
  const report=await run(fixture({staleUpstream:true}));
  assert.equal(report.live_readiness_prerequisites_passed,false);
  assert.ok(report.blockers.includes('WRITE_UPSTREAM_PR_MISSING_OR_CHANGED'));
});

test('an overlapping competing PR blocks two-chat launch',async()=>{
  const report=await run(fixture({overlap:true}));
  assert.equal(report.live_readiness_prerequisites_passed,false);
  assert.ok(report.blockers.includes('OPEN_PR_OVERLAPS_WRITE_SCOPE'));
  assert.equal(report.overlapping_write_scopes,1);
});

test('unapproved or moved private main SHA blocks all launch reports',async()=>{
  const a=fixture();
  await assert.rejects(()=>run(a,{approvedMainSha:'4'.repeat(40)}),
    /Private GitHub catalog blocked/);
  const b=fixture({catalogMoved:true});
  await assert.rejects(()=>run(b),
    /Private GitHub alpha readiness blocked/);
});

test('a public or mismatched private ledger selection fails before catalog read',async()=>{
  const a=fixture({publicLedger:true});
  await assert.rejects(()=>run(a),/PRIVATE|private/i);
  assert.ok(!a.calls.includes('getGitBlob'));
  const b=fixture();
  await assert.rejects(()=>run(b,{config:{
    ...clone(config),claim_store:{repo:PUBLIC,branch:'coordination/claims'}
  }}),/Private GitHub alpha readiness blocked/);
  assert.deepEqual(b.calls,[]);
});

test('active claim cannot be laundered through a clean pinned catalog',async()=>{
  const x=fixture();
  x.dest.push({path:'claims/example__test/issue-401.json',
    sha:SUBMISSION_SHA,data:{state:'claimed',session_id:'sensitive-session'}});
  const report=await run(x);
  assert.equal(report.live_readiness_prerequisites_passed,false);
  assert.ok(report.blockers.includes('ACTIVE_LOCKS_REQUIRE_RECONCILIATION'));
  assert.doesNotMatch(JSON.stringify(report),/sensitive-session/);
});

test('historical mismatch blocks before live issue enumeration',async()=>{
  const x=fixture();x.dest[0].sha='9'.repeat(40);
  await assert.rejects(()=>run(x),/missing or has different bytes/);
  assert.ok(!x.calls.includes('getIssue'));
});
