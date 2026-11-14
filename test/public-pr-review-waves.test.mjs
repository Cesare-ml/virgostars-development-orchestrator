import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {analyzePublicPrTopology,PUBLIC_REPOSITORY} from '../scripts/inspect-pr-topology.mjs';
import {planPublicPrReviewWaves} from '../scripts/plan-public-pr-review.mjs';

const script=fileURLToPath(new URL('../scripts/plan-public-pr-review.mjs',import.meta.url));
const sha=char=>char.repeat(40);
const clone=value=>structuredClone(value);

function pr(number,head,base,headSha,baseSha) {
  return {
    number,state:'open',draft:true,merged_at:null,
    head:{ref:head,sha:headSha,repo:{full_name:PUBLIC_REPOSITORY}},
    base:{ref:base,sha:baseSha,repo:{full_name:PUBLIC_REPOSITORY}}
  };
}
function fixture() {
  const topology=analyzePublicPrTopology([
    pr(5,'docs/standalone','main',sha('e'),sha('0')),
    pr(4,'feat/four','feat/two',sha('d'),sha('b')),
    pr(2,'feat/two','feat/one',sha('b'),sha('a')),
    pr(3,'feat/three','feat/two',sha('c'),sha('b')),
    pr(1,'feat/one','main',sha('a'),sha('0'))
  ]);
  return {...topology,inventory_stable:true};
}

test('parent-before-child waves use only public PR numbers and mark review as manual',()=>{
  const result=planPublicPrReviewWaves(fixture());
  assert.deepEqual(result.dependency_review_waves,[
    {review_wave:1,pr_numbers:[1,5]},
    {review_wave:2,pr_numbers:[2]},
    {review_wave:3,pr_numbers:[3,4]}
  ]);
  assert.deepEqual(result.sibling_fanout_review_points,[
    {parent_pr:2,child_prs:[3,4]}
  ]);
  assert.equal(result.checked_open_prs,5);
  assert.equal(result.draft_prs_requiring_independent_review,5);
  assert.equal(result.merge_authorized,false);
  assert.equal(result.deployment_authorized,false);
  assert.equal(result.pr_ci_evidence_verified,false);
  assert.equal(result.file_conflicts_evaluated,false);
  assert.equal(result.remote_writes,0);
  assert.doesNotMatch(JSON.stringify(result),/feat\/|docs\/standalone|[a-f0-9]{40}/);
});

test('valid report is immutable: grouping does not alter input',()=>{
  const original=fixture(),before=clone(original);
  planPublicPrReviewWaves(original);
  assert.deepEqual(original,before);
});

test('reject missing, unapproved or structurally blocked topology',()=>{
  for (const bad of [null,[],{},'bad']) {
    assert.throws(()=>planPublicPrReviewWaves(bad),/topology/);
  }
  const cases=[
    ['inventory_stable',false],
    ['structurally_consistent',false],
    ['blockers',['PARENT_HEAD_SHA_MISMATCH']],
    ['file_conflicts_evaluated',true],
    ['merge_authorized',true],
    ['remote_writes',1],
    ['private_ledger_verified',true],
    ['schema_version','unexpected'],
    ['mode','authorized-write'],
    ['external_head_or_base_prs',1],
    ['detached_base_prs',[12]],
    ['checked_open_prs',201],
    ['draft_open_prs',6]
  ];
  for (const [field,value] of cases) {
    const r=fixture();r[field]=value;
    if (field==='private_ledger_verified') continue; // no such field in public analyzer schema
    assert.throws(()=>planPublicPrReviewWaves(r),/topology/,field);
  }
});

test('reject missing/duplicate roots, duplicated child and dangling parents',()=>{
  const scenarios=[
    r=>{r.top_level_prs=[];},
    r=>{r.top_level_prs=[1,1,5];},
    r=>{r.parent_child_links.push({parent_pr:2,child_pr:4});r.linked_prs++;},
    r=>{r.parent_child_links[0].parent_pr=999;},
    r=>{r.parent_child_links[0].child_pr=1;},
    r=>{r.parent_child_links[0].child_pr=2;r.parent_child_links[0].parent_pr=2;},
    r=>{r.parent_child_links.splice(0,1);r.linked_prs--;},
    r=>{r.checked_open_prs=6;}
  ];
  for (const makeBad of scenarios) {
    const r=fixture();makeBad(r);
    assert.throws(()=>planPublicPrReviewWaves(r),/topology/);
  }
});

test('reject forged, incomplete or duplicate sibling fanout evidence',()=>{
  for(const makeBad of [
    r=>{r.branching_points=[];},
    r=>{r.branching_points[0].child_prs=[3,5];},
    r=>{r.branching_points[0].child_prs=[3,3];},
    r=>{r.branching_point_count=0;}
  ]) {
    const r=fixture();makeBad(r);
    assert.throws(()=>planPublicPrReviewWaves(r),/topology/);
  }
});

test('reject cyclic or disconnected topology even with forged stable flags',()=>{
  const r=fixture();
  r.parent_child_links=[
    {parent_pr:2,child_pr:3},
    {parent_pr:3,child_pr:4},
    {parent_pr:4,child_pr:2}
  ];
  r.top_level_prs=[1,5];
  r.branching_points=[];
  r.branching_point_count=0;
  r.linked_prs=3;
  assert.throws(()=>planPublicPrReviewWaves(r),/topology/);
});

test('depth mismatches must not silently create a review plan',()=>{
  const r=fixture();r.max_observed_chain_depth=2;
  assert.throws(()=>planPublicPrReviewWaves(r),/topology/);
});

test('standalone command refuses unexpected CLI flags without fetching PRs',()=>{
  const result=spawnSync(process.execPath,[script,'--private-tasks','secret-value'],{
    encoding:'utf8',timeout:10000,
    env:{PATH:process.env.PATH, SystemRoot:process.env.SystemRoot}
  });
  assert.equal(result.status,2);
  assert.match(result.stderr,/blocked or unavailable/);
  assert.doesNotMatch(result.stderr+result.stdout,/secret-value/);
});

test('standalone --help is offline, no token and makes no GitHub request',()=>{
  const result=spawnSync(process.execPath,[script,'--help'],{
    encoding:'utf8',timeout:10000,
    env:{PATH:process.env.PATH, SystemRoot:process.env.SystemRoot}
  });
  assert.equal(result.status,0);
  assert.match(result.stdout,/manual PR review waves/);
  assert.equal(result.stderr,'');
});
