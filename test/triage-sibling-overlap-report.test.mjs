import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarizeSiblingOverlaps} from '../scripts/triage-sibling-overlap-report.mjs';

const script=fileURLToPath(new URL('../scripts/triage-sibling-overlap-report.mjs',import.meta.url));

function makeReport(ids,overlaps={}) {
  const pairs=[];
  for (let i=0;i<ids.length;i++) for (let j=i+1;j<ids.length;j++) {
    const a=ids[i],b=ids[j];
    const count=overlaps[a+':'+b]??0;
    pairs.push({pull_requests:[a,b],overlapping_paths:count,
      potential_overlap:count>0});
  }
  return {
    schema_version:'1-public-sibling-pr-overlap',
    mode:'public-get-only',
    live_snapshot_stable:true,
    checked_pull_requests:ids.length,
    pairs_compared:pairs.length,
    pairs_with_path_overlap:pairs.filter(x=>x.potential_overlap).length,
    shared_path_references:pairs.reduce((sum,x)=>sum+x.overlapping_paths,0),
    pairs,
    github_writes:0,
    merge_authorized:false,
    pr_selection_authorized:false
  };
}

test('groups transitive overlaps and leaves independent PRs isolated',()=>{
  const result=summarizeSiblingOverlaps(makeReport([41,45,47,59,60],
    {'41:45':2,'45:47':1,'59:60':3}));
  assert.deepEqual(result.isolated_pull_requests,[]);
  assert.deepEqual(result.overlapping_review_groups,[
    {pull_requests:[41,45,47],overlapping_pairs:2},
    {pull_requests:[59,60],overlapping_pairs:1}
  ]);
  assert.equal(result.merge_authorized,false);
  assert.equal(result.pr_selection_authorized,false);
  assert.equal(result.github_requests,0);
});
test('no overlaps emits isolated PRs, not integration approval',()=>{
  const result=summarizeSiblingOverlaps(makeReport([5,6,7]));
  assert.deepEqual(result.isolated_pull_requests,[5,6,7]);
  assert.deepEqual(result.overlapping_review_groups,[]);
  assert.equal(result.manual_overlap_review_required,false);
  assert.equal(result.merge_authorized,false);
});
test('mixed collision and independent PR are distinct',()=>{
  const result=summarizeSiblingOverlaps(makeReport([1,2,3,4],
    {'1:2':1,'2:3':1}));
  assert.deepEqual(result.isolated_pull_requests,[4]);
  assert.deepEqual(result.overlapping_review_groups[0].pull_requests,[1,2,3]);
});
test('order of pair endpoints cannot hide an overlap',()=>{
  const fixture=makeReport([1,2,3],{'1:2':1});
  fixture.pairs[0].pull_requests.reverse();
  assert.deepEqual(summarizeSiblingOverlaps(fixture).overlapping_review_groups[0].pull_requests,[1,2]);
});
test('refuses missing all-pairs evidence',()=>{
  const fixture=makeReport([1,2,3]);
  fixture.pairs.pop();
  assert.throws(()=>summarizeSiblingOverlaps(fixture),/Incomplete/);
});
test('refuses duplicate pair disguised as another edge',()=>{
  const fixture=makeReport([1,2,3]);
  fixture.pairs[1].pull_requests=[2,1];
  assert.throws(()=>summarizeSiblingOverlaps(fixture),/Duplicate/);
});
test('refuses invented aggregate and stale snapshot',()=>{
  const fixture=makeReport([1,2],{'1:2':2});
  assert.throws(()=>summarizeSiblingOverlaps({...fixture,shared_path_references:0}),/Aggregate/);
  assert.throws(()=>summarizeSiblingOverlaps({...fixture,live_snapshot_stable:false}),/stable/);
});
test('refuses partial lists, unsafe IDs or mistaken authorization',()=>{
  const fixture=makeReport([1,2,3]);
  assert.throws(()=>summarizeSiblingOverlaps({...fixture,checked_pull_requests:4}),/Incomplete/);
  assert.throws(()=>summarizeSiblingOverlaps({...fixture,merge_authorized:true}),/stable/);
  const broken=makeReport([1,2]);
  broken.pairs[0].pull_requests=[1,1];
  assert.throws(()=>summarizeSiblingOverlaps(broken),/Invalid/);
});
test('refuses false collision flags and broken counts',()=>{
  const fixture=makeReport([1,2]);
  fixture.pairs[0].potential_overlap=true;
  assert.throws(()=>summarizeSiblingOverlaps(fixture),/Inconsistent/);
});
test('CLI is offline, produces triage with code 2, and no review decision',()=>{
  const dir=mkdtempSync(join(tmpdir(),'vs-pr-triage-'));
  try {
    const path=join(dir,'public-report.json');
    writeFileSync(path,JSON.stringify(makeReport([41,45],{'41:45':1})));
    const result=spawnSync(process.execPath,[script,path],{encoding:'utf8',env:{}});
    assert.equal(result.status,2,result.stderr);
    assert.equal(result.stderr,'');
    const parsed=JSON.parse(result.stdout);
    assert.equal(parsed.overlapping_review_groups[0].overlapping_pairs,1);
    assert.equal(parsed.merge_authorized,false);
    assert.ok(!result.stdout.includes(path));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('CLI rejects unstable input, missing path and invalid invocation',()=>{
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',env:{}});
  assert.equal(result.status,1);
  const help=spawnSync(process.execPath,[script,'--help'],{encoding:'utf8',env:{}});
  assert.equal(help.status,0);
  assert.match(help.stdout,/ABSOLUTE_REPORT/);
});
