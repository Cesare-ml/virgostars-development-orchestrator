import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  inspectSiblingSnapshot,inspectLiveSiblings,parseSiblingNumbers,
  fetchPublicJson,fetchPublicFiles
} from '../scripts/inspect-sibling-pr-overlaps.mjs';

const PUB='Cesare-ml/virgostars-development-orchestrator';
const SHA=i=>i.toString(16).padStart(40,'0');
const repo={full_name:PUB};
const makePr=(number,files=1,overrides={})=>({
  number,state:'open',draft:true,changed_files:files,
  head:{ref:'agent/parallel-'+number,sha:SHA(number+10),repo},
  base:{ref:'feature/synthetic-upstream',sha:SHA(9),repo},
  ...overrides
});
const one=makePr(10),two=makePr(11),three=makePr(12);
const files=new Map([
  [10,[{filename:'src/alpha.mjs',status:'modified'}]],
  [11,[{filename:'src/Alpha.mjs',status:'modified'}]],
  [12,[{filename:'docs/independent.md',status:'added'}]]
]);

test('only 2–24 distinct positive PR numbers are accepted',()=>{
  assert.deepEqual(parseSiblingNumbers(['10','11']),[10,11]);
  for(const numbers of [['1'],['1','1'],['0','2'],['a','2'],
    ['-1','2'],Array.from({length:25},(_,i)=>String(i+1))]){
    assert.throws(()=>parseSiblingNumbers(numbers));
  }
});

test('same-base public PRs editing same path case-insensitively are flagged',()=>{
  const report=inspectSiblingSnapshot([one,two],files);
  assert.equal(report.pairs_with_path_overlap,1);
  assert.equal(report.pairs[0].overlapping_paths,1);
  assert.equal(report.github_writes,0);
  assert.equal(report.merge_authorized,false);
  assert.doesNotMatch(JSON.stringify(report),/src\/alpha|feature\/synthetic/i);
});

test('distinct files yield a clean path-overlap report without approving merges',()=>{
  const report=inspectSiblingSnapshot([one,three],files);
  assert.equal(report.pairs_with_path_overlap,0);
  assert.equal(report.shared_path_references,0);
  assert.equal(report.pr_selection_authorized,false);
});

test('renamed previous_filename is included in both directions',()=>{
  const changed=new Map(files);
  changed.set(11,[{filename:'src/new.mjs',previous_filename:'src/alpha.mjs',status:'renamed'}]);
  const report=inspectSiblingSnapshot([one,two],changed);
  assert.equal(report.pairs_with_path_overlap,1);
  assert.equal(report.shared_path_references,1);
});

test('selected PRs must have exactly the same base SHA and branch',()=>{
  assert.throws(()=>inspectSiblingSnapshot([
    one,makePr(11,1,{base:{ref:'feature/synthetic-upstream',sha:SHA(8),repo}})
  ],files),/not siblings/);
  assert.throws(()=>inspectSiblingSnapshot([
    one,makePr(11,1,{base:{ref:'another-branch',sha:SHA(9),repo}})
  ],files),/not siblings/);
});

test('missing files, malformed paths and renamed metadata cannot imply no collision',()=>{
  assert.throws(()=>inspectSiblingSnapshot([one,two],new Map()),/missing/);
  const invalid=new Map(files);
  invalid.set(11,[]);
  assert.throws(()=>inspectSiblingSnapshot([one,two],invalid),/incomplete/);
  invalid.set(11,[{filename:'../private.json',status:'modified'}]);
  assert.throws(()=>inspectSiblingSnapshot([one,two],invalid),/Unsafe/);
  invalid.set(11,[{filename:'safe/new.mjs',status:'renamed'}]);
  assert.throws(()=>inspectSiblingSnapshot([one,two],invalid),/Renamed/);
});

test('non-public, closed and malformed PR metadata fail closed',()=>{
  const otherRepo={full_name:'example-synthetic/not-approved'};
  for(const override of [
    {state:'closed'}, {changed_files:201},
    {head:{ref:'other',sha:SHA(15),repo:otherRepo}},
    {draft:'yes'}, {base:{ref:'main',sha:'not-a-sha',repo}}
  ]){
    assert.throws(()=>inspectSiblingSnapshot([one,makePr(11,1,override)],files));
  }
});

test('live two-pass audit detects push or rebase between scans',async()=>{
  let n11=0;
  await assert.rejects(()=>inspectLiveSiblings({
    numbers:[10,11],
    getPullRequest:async n=>{
      if(n===10)return one;
      n11++;
      return n11===1?two:makePr(11,1,{head:{...two.head,sha:SHA(19)}});
    },
    getFiles:async n=>files.get(n)
  }),/changed during the file inventory/);
});

test('live scan succeeds with stable complete metadata',async()=>{
  const result=await inspectLiveSiblings({
    numbers:[10,11,12],
    getPullRequest:async n=>[one,two,three].find(p=>p.number===n),
    getFiles:async n=>files.get(n)
  });
  assert.equal(result.live_snapshot_stable,true);
  assert.equal(result.pairs_compared,3);
  assert.equal(result.pairs_with_path_overlap,1);
  assert.deepEqual(result.pairs.map(p=>p.pull_requests),[[10,11],[10,12],[11,12]]);
});

test('GitHub adapter only sends GET to fixed public endpoint without Authorization',async()=>{
  const calls=[];
  const request=async(url,options)=>{
    calls.push({url,options});
    return {status:200,json:async()=>makePr(10)};
  };
  const result=await fetchPublicJson('/pulls/10',{request});
  assert.equal(result.number,10);
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.headers.Authorization,undefined);
  assert.match(calls[0].url,/^https:\/\/api\.github\.com\/repos\/Cesare-ml\/virgostars-development-orchestrator\/pulls\/10$/);
  await assert.rejects(()=>fetchPublicJson('/repos/private',{request}),/Unexpected public/);
});

test('changed-file pagination rejects malformed or oversized data',async()=>{
  const observed=[];
  const call=async(url,options)=>{
    observed.push(options.method);
    const index=Number(url.match(/[?&]page=(\d+)/)?.[1]||0);
    return {status:200,json:async()=>index===1
      ? Array.from({length:100},(_,i)=>({filename:'tests/path-'+i,status:'modified'}))
      : [{filename:'tests/tail',status:'modified'}]};
  };
  const data=await fetchPublicFiles(10,{request:call});
  assert.equal(data.length,101);
  assert.deepEqual(observed,['GET','GET']);
  const bad=async()=>({status:200,json:async()=>({files:[]})});
  await assert.rejects(()=>fetchPublicFiles(10,{request:bad}),/Malformed/);
  const tooMany=async()=>({status:200,json:async()=>Array.from({length:100},
    (_,i)=>({filename:'tests/p-'+i,status:'modified'}))});
  await assert.rejects(()=>fetchPublicFiles(10,{request:tooMany}),/exceeds file audit limit|pagination did not terminate/);
});

test('tokenless help is safe and explains command invocation',()=>{
  const CLI=fileURLToPath(new URL('../scripts/inspect-sibling-pr-overlaps.mjs',import.meta.url));
  const env={...process.env};
  delete env.GITHUB_TOKEN;
  const run=spawnSync(process.execPath,[CLI,'--help'],{env,encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/GET-only sibling overlap/);
  assert.equal(run.stderr,'');
});
