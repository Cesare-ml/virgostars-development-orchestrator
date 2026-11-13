import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  PUBLIC_REPOSITORY,analyzePublicPrTopology,inspectLivePublicTopology,
  fetchOpenPublicPullRequests
} from '../scripts/inspect-pr-topology.mjs';

const sha=c=>c.repeat(40);
const copy=x=>structuredClone(x);
const script=fileURLToPath(new URL('../scripts/inspect-pr-topology.mjs',import.meta.url));

function pr(number,head,base,headSha,baseSha) {
  return {
    number,state:'open',draft:true,merged_at:null,
    head:{ref:head,sha:headSha,repo:{full_name:PUBLIC_REPOSITORY}},
    base:{ref:base,sha:baseSha,repo:{full_name:PUBLIC_REPOSITORY}}
  };
}
function healthy() {
  return [
    pr(1,'feat/one','main',sha('a'),sha('0')),
    pr(2,'feat/two','feat/one',sha('b'),sha('a')),
    pr(3,'feat/three','feat/two',sha('c'),sha('b')),
    pr(4,'feat/four','feat/two',sha('d'),sha('b')),
    pr(5,'docs/standalone','main',sha('e'),sha('0'))
  ];
}

test('reports exact parent-child topology, fan-out and detached-free roots',()=>{
  const report=analyzePublicPrTopology(healthy());
  assert.equal(report.schema_version,'1-public-open-pr-topology');
  assert.equal(report.checked_open_prs,5);
  assert.equal(report.draft_open_prs,5);
  assert.deepEqual(report.top_level_prs,[1,5]);
  assert.deepEqual(report.parent_child_links,[
    {parent_pr:1,child_pr:2},
    {parent_pr:2,child_pr:3},
    {parent_pr:2,child_pr:4}
  ]);
  assert.deepEqual(report.branching_points,[{parent_pr:2,child_prs:[3,4]}]);
  assert.equal(report.branching_point_count,1);
  assert.equal(report.max_observed_chain_depth,3);
  assert.equal(report.structurally_consistent,true);
  assert.equal(report.file_conflicts_evaluated,false);
  assert.equal(report.merge_authorized,false);
  assert.equal(report.remote_writes,0);
  assert.equal(report.inventory_stable,false);
  assert.doesNotMatch(JSON.stringify(report),/feat\/|docs\/standalone|[a-f0-9]{40}/);
});

test('a sibling branch is only a signal, not a proven file conflict',()=>{
  const r=analyzePublicPrTopology(healthy());
  assert.equal(r.branching_point_count,1);
  assert.deepEqual(r.blockers,[]);
  assert.equal(r.file_conflicts_evaluated,false);
});

test('outdated parent SHA fails closed even when branch names match',()=>{
  const x=healthy();x[3].base.sha=sha('f');
  const r=analyzePublicPrTopology(x);
  assert.equal(r.structurally_consistent,false);
  assert.ok(r.blockers.includes('PARENT_HEAD_SHA_MISMATCH'));
});

test('a detached child with non-open parent is flagged',()=>{
  const x=healthy(); x[2].base.ref='feat/no-longer-open';
  const r=analyzePublicPrTopology(x);
  assert.ok(r.blockers.includes('BASE_PR_NOT_IN_OPEN_INVENTORY'));
  assert.deepEqual(r.detached_base_prs,[3]);
});

test('cycles, self-bases and duplicated head branches are blocked',()=>{
  const x=[
    pr(7,'feat/seven','feat/eight',sha('7'),sha('8')),
    pr(8,'feat/eight','feat/seven',sha('8'),sha('7')),
    pr(9,'feat/eight','feat/eight',sha('9'),sha('8'))
  ];
  const r=analyzePublicPrTopology(x);
  for(const key of ['PR_PARENT_CYCLE','DUPLICATE_HEAD_BRANCH','SELF_BASED_PR'])
    assert.ok(r.blockers.includes(key),key);
  assert.equal(r.structurally_consistent,false);
});

test('cross-repository heads and unexpected merged metadata block readiness',()=>{
  const x=healthy();
  x[0].head.repo.full_name='outsider/foreign';
  x[0].merged_at='2026-11-13T13:00:00Z';
  const r=analyzePublicPrTopology(x);
  assert.equal(r.external_head_or_base_prs,1);
  assert.ok(r.blockers.includes('EXTERNAL_OR_DIFFERENT_REPOSITORY_BRANCH'));
  assert.ok(r.blockers.includes('OPEN_PR_MARKED_MERGED'));
});

test('duplicate identity and malformed repository metadata do not produce partial reports',()=>{
  const x=healthy();
  assert.throws(()=>analyzePublicPrTopology([...x,copy(x[0])]),/Duplicate PR number/);
  const malformed=healthy();malformed[2].head.sha='not-sha';
  assert.throws(()=>analyzePublicPrTopology(malformed),/malformed or incomplete/);
  const unsafe=healthy();unsafe[2].base.ref='../unsafe';
  assert.throws(()=>analyzePublicPrTopology(unsafe),/malformed or incomplete/);
  assert.throws(()=>analyzePublicPrTopology(new Array(201).fill(0)),/200-PR limit/);
});

test('live stable double inventory reports topology without external state changes',async()=>{
  let calls=0;
  const r=await inspectLivePublicTopology({
    fetchInventory:async()=>{calls++;return copy(healthy());}
  });
  assert.equal(calls,2);
  assert.equal(r.inventory_stable,true);
  assert.equal(r.structurally_consistent,true);
  assert.deepEqual(r.blockers,[]);
});

test('changed PR number, branch or SHA between sweeps fails closed',async()=>{
  let calls=0;
  const result=await inspectLivePublicTopology({fetchInventory:async()=>{
    const list=copy(healthy());
    if(calls++===1)list[2].head.sha=sha('f');
    return list;
  }});
  assert.equal(result.inventory_stable,false);
  assert.equal(result.structurally_consistent,false);
  assert.ok(result.blockers.includes('OPEN_PR_INVENTORY_CHANGED_DURING_SCAN'));
});

test('pagination requests only unauthenticated GET pages, then terminates',async()=>{
  const calls=[];
  const fetched=await fetchOpenPublicPullRequests({request:async(url,opts)=>{
    calls.push({url,opts});
    const page=Number(new URL(url).searchParams.get('page'));
    return {status:200,json:async()=>page===1
      ? Array.from({length:100},(_,i)=>({number:i+1}))
      : [{number:101}]};
  }});
  assert.equal(fetched.length,101);
  assert.equal(calls.length,2);
  assert.ok(calls.every(x=>x.opts.method==='GET'&&
    x.opts.headers.Authorization===undefined&&x.opts.redirect==='error'));
  assert.ok(calls[1].url.endsWith('page=2'));
});

test('overflow and unsuccessful or malformed GitHub pages are rejected',async()=>{
  await assert.rejects(()=>fetchOpenPublicPullRequests({request:async()=>({status:403})}),
    /inventory unavailable/);
  await assert.rejects(()=>fetchOpenPublicPullRequests({request:async()=>({status:200,json:async()=>({})})}),
    /Malformed public/);
  await assert.rejects(()=>fetchOpenPublicPullRequests({request:async()=>({
    status:200,json:async()=>Array(100).fill({})
  })}),/exceeds 200-PR limit/);
});

test('CLI help and invalid arguments stay entirely offline',()=>{
  const help=spawnSync(process.execPath,[script,'--help'],{encoding:'utf8',timeout:10000});
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/GET-only topology/);
  const forbidden=spawnSync(process.execPath,[script,'--write'],{encoding:'utf8',timeout:10000});
  assert.equal(forbidden.status,1);
  assert.equal(forbidden.stdout,'');
  assert.match(forbidden.stderr,/takes no arguments/);
});
