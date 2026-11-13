import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  inspectAlphaLaunch,inspectAlphaLedgerSnapshot
} from '../src/alpha-doctor.mjs';

const PUBLIC='Cesare-ml/virgostars-development-orchestrator';
const PRIVATE='owner/private-ledger-fixture';
const PUBLIC_HEAD='6a6e8f2562b101f6bdfe207397521cf0f5ca1ebf';
const PRIVATE_HEAD='b'.repeat(40),PUBLIC_TREE='a'.repeat(40);
const PRIVATE_TREE='c'.repeat(40),BLOB='d'.repeat(40);
const repoChart='Cesare-ml/astrological-charts';
const repoFunctions='Cesare-ml/astrological-functions';
const config={repository_visibility_required:'private',
  claim_store:{repo:PRIVATE,branch:'coordination/claims'}};
const tasks=[
  {
    repository:repoChart,issue:401,status:'ready',role:'developer',
    access:'write',title:'Independent chart test',scope:['tests/owner-doctor-chart.test.mjs'],
    resource_scope:{id:'doctor-chart-test',roots:['tests/owner-doctor-chart.test.mjs']},
    upstream_pr:22,upstream_branch:'feature/charts-tests'
  },
  {
    repository:repoFunctions,issue:402,status:'ready',role:'developer',
    access:'write',title:'Independent function test',scope:['tests/owner-doctor-functions.test.mjs'],
    resource_scope:{id:'doctor-functions-test',roots:['tests/owner-doctor-functions.test.mjs']},
    upstream_pr:3,upstream_branch:'feature/function-tests'
  }
];
const clone=x=>structuredClone(x);
const ref=sha=>({object:{type:'commit',sha}});
const historical=()=>Array.from({length:7},(_,i)=>({
  path:'submissions/example__project/issue-'+(i+1)+'.json',
  sha:BLOB,data:{state:'submitted',issue_number:i+1,target_repository:'example/project'}
}));
const treeEntry=x=>({path:x.path,sha:x.sha,type:'blob',size:320,mode:'100644'});
const upstreams={
  [repoChart]:{number:22,state:'open',changed_files:0,
    head:{ref:'feature/charts-tests',sha:'1'.repeat(40)},
    base:{ref:'main',sha:'9'.repeat(40)}},
  [repoFunctions]:{number:3,state:'open',changed_files:0,
    head:{ref:'feature/function-tests',sha:'2'.repeat(40)},
    base:{ref:'main',sha:'9'.repeat(40)}}
};

function fixture() {
  const source=historical(),destination=historical();
  const calls=[];
  const pullRequests=clone(upstreams);
  const issues=new Map(tasks.map(t=>[t.repository+'#'+t.issue,
    {number:t.issue,state:'open',title:'Synthetic fixture issue'}]));
  const api={
    async getRepository(repo) {
      calls.push(['getRepository',repo]);
      if(repo===PRIVATE)return {full_name:PRIVATE,visibility:'private',
        private:true,archived:false,disabled:false};
      if(repo===PUBLIC)return {full_name:PUBLIC,visibility:'public',private:false};
      throw new Error('unexpected repository request');
    },
    async getBranchRef(repo) {
      calls.push(['getBranchRef',repo]);
      return ref(repo===PUBLIC?PUBLIC_HEAD:PRIVATE_HEAD);
    },
    async getGitCommit(repo) {
      calls.push(['getGitCommit',repo]);
      return {sha:repo===PUBLIC?PUBLIC_HEAD:PRIVATE_HEAD,
        tree:{sha:repo===PUBLIC?PUBLIC_TREE:PRIVATE_TREE}};
    },
    async getGitTree(repo) {
      calls.push(['getGitTree',repo]);
      return {sha:repo===PUBLIC?PUBLIC_TREE:PRIVATE_TREE,truncated:false,
        tree:repo===PUBLIC
          ? [{path:'README.md',sha:'e'.repeat(40),mode:'100644',
              type:'blob',size:352},...source.map(treeEntry)]
          : destination.map(treeEntry)};
    },
    async getLedgerSnapshot(repo) {
      calls.push(['getLedgerSnapshot',repo]);
      return {head:repo===PUBLIC?PUBLIC_HEAD:PRIVATE_HEAD,
        entries:clone(repo===PUBLIC?source:destination)};
    },
    async getIssue(repo,issue) {
      calls.push(['getIssue',repo]);
      return clone(issues.get(repo+'#'+issue));
    },
    async getPullRequest(repo,pr) {
      calls.push(['getPullRequest',repo]);
      return pr===pullRequests[repo]?.number
        ? clone(pullRequests[repo])
        : clone(pullRequests['competing-'+repo]);
    },
    async getOpenPullRequests(repo) {
      calls.push(['getOpenPullRequests',repo]);
      return [clone(pullRequests[repo]),...(pullRequests['competing-'+repo]
        ? [clone(pullRequests['competing-'+repo])]:[])];
    },
    async getPullRequestFiles(repo,number) {
      calls.push(['getPullRequestFiles',repo]);
      return number===27
        ? [{filename:'tests/owner-doctor-chart.test.mjs',status:'added'}]
        : [];
    }
  };
  return {api,calls,source,destination,pullRequests,issues};
}

test('owner alpha doctor allows two distinct unclaimed write tasks after historical preservation',async()=>{
  const x=fixture();
  const report=await inspectAlphaLaunch({api:x.api,config,tasks});
  assert.equal(report.schema_version,'1-owner-alpha-doctor');
  assert.equal(report.private_ledger_verified,true);
  assert.equal(report.ready_for_manual_pilot,true);
  assert.deepEqual(report.blockers,[]);
  assert.equal(report.historical_submissions_preserved,7);
  assert.equal(report.new_write_tasks,2);
  assert.equal(report.write_tasks_without_pr_overlap,2);
  assert.equal(report.recorded_submissions,7);
  assert.equal(report.work_claimed,false);
  assert.equal(report.merge_authorized,false);
  assert.ok(x.calls.every(([method])=>method.startsWith('get')));
  assert.doesNotMatch(JSON.stringify(report),
    /owner\/|example__project|doctor-chart-test|feature\/|[a-f0-9]{40}/);
});

test('submitted new tasks cannot be reported available for first launch',async()=>{
  const x=fixture();
  x.destination.push({path:'submissions/Cesare-ml__astrological-charts/issue-401.json',
    sha:BLOB,data:{state:'submitted'}});
  const result=await inspectAlphaLaunch({api:x.api,config,tasks});
  assert.equal(result.ready_for_manual_pilot,false);
  assert.ok(result.blockers.includes('NEW_TASK_ALREADY_SUBMITTED'));
  assert.ok(result.blockers.includes('TWO_UNSUBMITTED_TASKS_REQUIRED'));
});

test('orphaned claim or resource records block alpha startup without exposing owners',async()=>{
  const x=fixture();
  x.destination.push({path:'claims/example__project/issue-999.json',
    sha:BLOB,data:{state:'claimed',session_id:'sensitive-session-identity'}});
  const report=await inspectAlphaLaunch({api:x.api,config,tasks});
  assert.equal(report.ready_for_manual_pilot,false);
  assert.equal(report.active_claims,1);
  assert.ok(report.blockers.includes('ACTIVE_LOCKS_REQUIRE_RECONCILIATION'));
  assert.doesNotMatch(JSON.stringify(report),/sensitive-session-identity/);
});

test('closed target issue and stale upstream branch stop two-agent readiness',async()=>{
  const x=fixture();
  x.issues.get(repoChart+'#401').state='closed';
  const report=await inspectAlphaLaunch({api:x.api,config,tasks});
  assert.equal(report.ready_for_manual_pilot,false);
  assert.ok(report.blockers.includes('TARGET_ISSUE_CLOSED'));

  const y=fixture();
  y.pullRequests[repoChart].head.ref='unexpected-feature';
  const report2=await inspectAlphaLaunch({api:y.api,config,tasks});
  assert.equal(report2.ready_for_manual_pilot,false);
  assert.ok(report2.blockers.includes('WRITE_UPSTREAM_PR_MISSING_OR_CHANGED'));
});

test('two task issues sharing the same resource partition are NOT two simultaneous writers',async()=>{
  const x=fixture();
  const samePartition=clone(tasks);
  samePartition[1].repository=repoChart;
  samePartition[1].resource_scope.id=samePartition[0].resource_scope.id;
  samePartition[1].upstream_pr=22;
  samePartition[1].upstream_branch='feature/charts-tests';
  x.issues.set(repoChart+'#402',{number:402,state:'open'});
  const report=await inspectAlphaLaunch({api:x.api,config,tasks:samePartition});
  assert.equal(report.write_tasks_without_pr_overlap,2);
  assert.equal(report.independent_writer_partitions,1);
  assert.equal(report.ready_for_manual_pilot,false);
  assert.ok(report.blockers.includes('TWO_DISJOINT_WRITE_TASKS_REQUIRED'));
});

test('open competing PR touching exact task root blocks launch',async()=>{
  const x=fixture();
  x.pullRequests['competing-'+repoChart]={
    number:27,state:'open',draft:true,changed_files:1,
    head:{ref:'agent/other',sha:'3'.repeat(40)},
    base:{ref:'feature/charts-tests',sha:'1'.repeat(40)}
  };
  const report=await inspectAlphaLaunch({api:x.api,config,tasks});
  assert.equal(report.ready_for_manual_pilot,false);
  assert.equal(report.overlapping_write_scopes,1);
  assert.ok(report.blockers.includes('OPEN_PR_OVERLAPS_WRITE_SCOPE'));
});

test('branch movement after check is rejected, even when all other checks pass',async()=>{
  const x=fixture();
  let moved=false;
  const getPr=x.api.getPullRequest;
  x.api.getPullRequest=async(...args)=>{
    moved=true;return getPr(...args);
  };
  const getRef=x.api.getBranchRef;
  x.api.getBranchRef=async repo=>
    moved&&repo===PRIVATE?ref('f'.repeat(40)):getRef(repo);
  await assert.rejects(()=>inspectAlphaLaunch({api:x.api,config,tasks}),
    /private coordination head changed/);
});

test('invalid snapshot entries, duplicates and unknown submission states fail closed',()=>{
  const snap={head:PRIVATE_HEAD,entries:historical()};
  assert.equal(inspectAlphaLedgerSnapshot(snap,tasks).recorded_submissions,7);
  for(const entries of [
    [...historical(),clone(historical()[0])],
    [{path:'other/unexpected.txt',sha:BLOB,data:{}}],
    [{path:'submissions/example__project/issue-1.json',sha:BLOB,
      data:{state:'claimed'}}]
  ]) assert.throws(()=>inspectAlphaLedgerSnapshot({...snap,entries},tasks),
    /Alpha launch readiness blocked/);
});

test('private visibility failure, incomplete GitHub methods or source drift never succeeds',async()=>{
  const x=fixture();
  const original=x.api.getRepository;
  x.api.getRepository=async repo=>repo===PRIVATE
    ? {...await original(repo),visibility:'public',private:false}
    : original(repo);
  await assert.rejects(()=>inspectAlphaLaunch({api:x.api,config,tasks}),
    /not verified PRIVATE/);
  await assert.rejects(()=>inspectAlphaLaunch({api:{},config,tasks}),
    /required read-only GitHub methods/);
  const y=fixture();
  y.api.getBranchRef=async repo=>ref(repo===PUBLIC?'6'.repeat(40):PRIVATE_HEAD);
  await assert.rejects(()=>inspectAlphaLaunch({api:y.api,config,tasks}));
});

test('CLI alpha-doctor blocks without approved local catalog even without token',()=>{
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};delete env.GITHUB_TOKEN;
  delete env.VS_PRIVATE_TASKS_FILE;
  delete env.VS_PRIVATE_TASKS_APPROVED_SHA256;
  const result=spawnSync(process.execPath,[cli,'alpha-doctor'],
    {env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/approved local owner task catalog/);
  assert.equal(result.stdout,'');
});
