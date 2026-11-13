import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
 PUBLIC_REPO,parseNumbers,inspectSnapshot,inspectLive,fetchPublicJson,fetchAllChecks
} from '../scripts/inspect-public-pr-checks.mjs';

const sha = c => c.repeat(40);
const clone = x => structuredClone(x);
const pr = (n=35) => ({number:n,state:'open',draft:true,merged:false,merged_at:null,
 head:{sha:sha('a'),ref:'feat/pilot',repo:{full_name:PUBLIC_REPO}},
 base:{sha:sha('b'),ref:'feat/base',repo:{full_name:PUBLIC_REPO}}});
const check = (id,name,status='completed',conclusion='success') =>
  ({id,name,status,conclusion});
const runs = (...xs) => ({total_count:xs.length,check_runs:xs});
const good = () => runs(check(1,'Node 20'),check(2,'Node 22'));

test('successful observed checks do not authorize merge or required-check policy',async()=>{
 const result=await inspectLive({numbers:[35],getPr:async()=>pr(),getChecks:async()=>good()});
 assert.equal(result.all_observed_checks_successful,true);
 assert.equal(result.merge_authorized,false);
 assert.equal(result.required_checks_verified,false);
 assert.equal(result.independent_review_verified,false);
 assert.equal(result.github_writes,0);
 assert.equal(result.live_snapshots_stable,true);
 assert.deepEqual(result.checks[0].blockers,[]);
 assert.doesNotMatch(JSON.stringify(result),/feat\/|[a-f0-9]{40}/);
});

test('empty, failed, pending and neutral checks are blockers',()=>{
 const scenarios=[
  [runs(),'NO_CHECK_RUNS_OBSERVED'],
  [runs(check(1,'node','completed','failure')),'CHECK_RUNS_NOT_SUCCESSFUL'],
  [runs(check(1,'node','in_progress',null)),'CHECK_RUNS_INCOMPLETE'],
  [runs(check(1,'node','completed','neutral')),'CHECK_RUNS_NOT_SUCCESSFUL'],
  [runs(check(1,'node'),check(2,'NODE')),'AMBIGUOUS_REPEATED_CHECK_NAMES']
 ];
 for(const [rs,blocker] of scenarios){
  const result=inspectSnapshot(pr(),35,rs);
  assert.ok(result.blockers.includes(blocker),blocker);
  assert.equal(result.observed_checks_all_successful,false);
 }
});

test('unsafe PR metadata, check IDs, counts and statuses fail closed',()=>{
 const foreign=pr();foreign.head.repo.full_name='owner/private';
 assert.throws(()=>inspectSnapshot(foreign,35,good()));
 const moved=pr();moved.head.sha='abc';
 assert.throws(()=>inspectSnapshot(moved,35,good()));
 assert.throws(()=>inspectSnapshot(pr(),35,{total_count:2,check_runs:[check(1,'node')]}));
 assert.throws(()=>inspectSnapshot(pr(),35,runs(check(1,'x'),check(1,'y'))));
 assert.throws(()=>inspectSnapshot(pr(),35,runs(check(1,'x','mystery',null))));
 assert.throws(()=>inspectSnapshot(pr(),35,runs(check(1,'', 'completed','success'))));
});

test('PR HEAD and check-run completion changes are detected between two scans',async()=>{
 let count=0;
 await assert.rejects(()=>inspectLive({numbers:[35],getPr:async()=>{
  const x=pr(); if(count++>0) x.head.sha=sha('f');return x;
 },getChecks:async()=>good()}),/changed during/);
 let checks=0;
 await assert.rejects(()=>inspectLive({numbers:[35],getPr:async()=>pr(),
  getChecks:async()=>checks++?runs(check(1,'Node 20'),check(2,'Node 22','in_progress',null)):good()
 }),/changed during/);
});

test('GET-only client forbids private/foreign routes and authorization headers',async()=>{
 let captured;
 const request=async(url,opts)=>{
  captured={url,opts};return {status:200,json:async()=>pr()};
 };
 assert.equal((await fetchPublicJson('/pulls/35',{request})).number,35);
 assert.equal(captured.opts.method,'GET');
 assert.equal(captured.opts.headers.Authorization,undefined);
 assert.match(captured.url,/api\.github\.com\/repos\/Cesare-ml\/virgostars-development-orchestrator\/pulls\/35/);
 await assert.rejects(()=>fetchPublicJson('/repos/other/private',{request}));
 await assert.rejects(()=>fetchPublicJson('/pulls/35/comments',{request}));
 await assert.rejects(()=>fetchPublicJson('/pulls/35',{request:async()=>({status:403})}));
});

test('paginated checks are complete and fail on missing, duplicated or drifting entries',async()=>{
 const hundred=Array.from({length:100},(_,i)=>check(i+1,'test-'+i));
 const rest=[check(101,'Node 20')];
 const requests=[];
 const request=async(url)=>{
  requests.push(url);
  return {status:200,json:async()=>url.endsWith('page=1')?
    ({total_count:101,check_runs:hundred}):({total_count:101,check_runs:rest})};
 };
 const result=await fetchAllChecks(sha('a'),{request});
 assert.equal(result.check_runs.length,101);
 assert.equal(requests.length,2);
 await assert.rejects(()=>fetchAllChecks(sha('a'),{request:async url=>
  ({status:200,json:async()=>url.endsWith('page=1')?
   ({total_count:101,check_runs:hundred}):({total_count:102,check_runs:rest})})
 }),/changed during/);
 await assert.rejects(()=>fetchAllChecks(sha('a'),{request:async url=>
  ({status:200,json:async()=>url.endsWith('page=1')?
   ({total_count:101,check_runs:hundred}):({total_count:101,check_runs:[check(1,'repeat')]})})
 }),/duplicated/);
 await assert.rejects(()=>fetchAllChecks(sha('a'),{request:async()=>({status:200,json:async()=>({total_count:3,check_runs:[check(1,'x')]})})}),/Incomplete/);
});

test('input help and invalid args work offline with no credentials',()=>{
 assert.deepEqual(parseNumbers(['1','35']),[1,35]);
 for(const x of [[],['0'],['35','35'],['35','--force'],['../../private'],['00035']])
  assert.throws(()=>parseNumbers(x));
 const cli=fileURLToPath(new URL('../scripts/inspect-public-pr-checks.mjs',import.meta.url));
 const help=spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8',timeout:10000});
 assert.equal(help.status,0,help.stderr);
 assert.match(help.stdout,/Public GET-only PR check audit/);
 const invalid=spawnSync(process.execPath,[cli,'35','35'],{encoding:'utf8',timeout:10000});
 assert.equal(invalid.status,1);
 assert.equal(invalid.stdout,'');
 assert.match(invalid.stderr,/incomplete or invalid/);
});
