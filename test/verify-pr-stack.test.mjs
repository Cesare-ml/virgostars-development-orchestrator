import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  PUBLIC_REPO,parsePrNumbers,inspectStackSnapshot,inspectLiveStack,
  fetchPublicPullRequest
} from '../scripts/verify-pr-stack.mjs';

const sha=char=>char.repeat(40);
const clone=x=>structuredClone(x);
const cli=fileURLToPath(new URL('../scripts/verify-pr-stack.mjs',import.meta.url));

function pr(number,baseRef,baseSha,headRef,headSha) {
  return {
    number,state:'open',draft:true,merged:false,merged_at:null,
    head:{ref:headRef,sha:headSha,repo:{full_name:PUBLIC_REPO}},
    base:{ref:baseRef,sha:baseSha,repo:{full_name:PUBLIC_REPO}}
  };
}
function chain() {
  return [
    pr(1,'main',sha('a'),'feat/alpha',sha('b')),
    pr(23,'feat/alpha',sha('b'),'feat/private-preflight',sha('c')),
    pr(35,'feat/private-preflight',sha('c'),'feat/rehearsal',sha('d'))
  ];
}

test('a consistent public branch chain stays read-only and is never merger approval',()=>{
  const result=inspectStackSnapshot(chain());
  assert.equal(result.schema_version,'1-public-pr-stack-review');
  assert.equal(result.structurally_consistent,true);
  assert.equal(result.checked_pull_requests,3);
  assert.equal(result.stack_links_checked,2);
  assert.equal(result.draft_pull_requests,3);
  assert.equal(result.live_snapshot_stable,false);
  assert.equal(result.merge_authorized,false);
  assert.equal(result.tests_approved,false);
  assert.equal(result.remote_writes,0);
  assert.deepEqual(result.blockers,[]);
});

test('base branch ordering and moved parent SHA are independently blocked',()=>{
  const wrong=chain();
  wrong[1].base.ref='main';
  assert.ok(inspectStackSnapshot(wrong).blockers.includes('STACK_BASE_BRANCH_MISMATCH'));
  const advanced=chain();
  advanced[2].base.sha=sha('f');
  assert.ok(inspectStackSnapshot(advanced).blockers.includes('STACK_BASE_SHA_MISMATCH'));
  const root=chain();
  root[0].base.ref='feature/other';
  assert.ok(inspectStackSnapshot(root).blockers.includes('ROOT_BASE_BRANCH_CHANGED'));
});

test('forks, closed PRs, duplicate heads and same-head bases are blocked',()=>{
  const xs=chain();
  xs[1].head.repo.full_name='other-user/fork';
  xs[1].state='closed';
  xs[1].draft=false;
  xs[2].head.ref=xs[1].head.ref;
  xs[2].base.ref=xs[2].head.ref;
  const result=inspectStackSnapshot(xs);
  assert.equal(result.structurally_consistent,false);
  for(const code of [
    'CROSS_REPOSITORY_BRANCH','PULL_REQUEST_NOT_OPEN',
    'DUPLICATE_HEAD_BRANCH','SELF_BASED_PULL_REQUEST'
  ])assert.ok(result.blockers.includes(code),code);
});

test('malformed metadata, duplicate identity and unsafe refs fail closed',()=>{
  const broken=chain(); broken[1].head.sha='not-a-commit';
  assert.throws(()=>inspectStackSnapshot(broken),/Malformed or incomplete/);
  const unsafe=chain(); unsafe[1].head.ref='feat/../bad';
  assert.throws(()=>inspectStackSnapshot(unsafe),/Malformed or incomplete/);
  const duplicate=chain();duplicate[1].number=1;
  assert.ok(inspectStackSnapshot(duplicate).blockers.includes('DUPLICATE_PULL_REQUEST'));
  assert.throws(()=>inspectStackSnapshot(chain(),{repository:'other/private'}),/Invalid public-only/);
});

test('live double-scan checks every PR twice and returns no identities or SHAs',async()=>{
  const ps=chain(),calls=[];
  const result=await inspectLiveStack({numbers:[1,23,35],fetchPullRequest:async n=>{
    calls.push(n);
    return clone(ps.find(x=>x.number===n));
  }});
  assert.equal(result.structurally_consistent,true);
  assert.equal(result.live_snapshot_stable,true);
  assert.deepEqual(calls,[1,23,35,1,23,35]);
  assert.doesNotMatch(JSON.stringify(result),/feat\/|[a-f0-9]{40}|other-user/);
});

test('a PR changed during the second sweep cannot pass as stable',async()=>{
  const ps=chain();let calls=0;
  const result=await inspectLiveStack({numbers:[1,23,35],
    fetchPullRequest:async n=>{
      const copy=clone(ps.find(x=>x.number===n));
      if(calls++>=3 && n===23)copy.head.sha=sha('f');
      return copy;
    }
  });
  assert.equal(result.structurally_consistent,false);
  assert.equal(result.live_snapshot_stable,false);
  assert.ok(result.blockers.includes('PULL_REQUEST_CHANGED_DURING_SCAN'));
});

test('wrong GitHub PR identity or network error fails closed',async()=>{
  const ps=chain();
  await assert.rejects(()=>inspectLiveStack({numbers:[1,23,35],
    fetchPullRequest:async n=>n===23?clone(ps[0]):clone(ps.find(x=>x.number===n))
  }),/different pull request number/);
  await assert.rejects(()=>inspectLiveStack({numbers:[1],
    fetchPullRequest:async()=>{throw new Error('API unavailable');}
  }),/API unavailable/);
});

test('public HTTP client makes GET only, with no Authorization header',async()=>{
  let args;
  const payload=await fetchPublicPullRequest(23,{
    request:async(url,options)=>{
      args={url,options};
      return {status:200,json:async()=>clone(chain()[1])};
    }
  });
  assert.equal(payload.number,23);
  assert.equal(args.options.method,'GET');
  assert.equal(args.options.headers.Authorization,undefined);
  assert.match(args.url,/api\.github\.com\/repos\/Cesare-ml\/virgostars-development-orchestrator\/pulls\/23$/);
  await assert.rejects(()=>fetchPublicPullRequest(23,{
    request:async()=>({status:403})
  }),/could not be retrieved/);
});

test('CLI validates numbers and help offline, before making any requests',()=>{
  assert.deepEqual(parsePrNumbers(['1','23','35']),[1,23,35]);
  for(const args of [[],['0'],['1','1'],['1','--force'],['../../private']])
    assert.throws(()=>parsePrNumbers(args));
  const help=spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8',timeout:10000});
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/GET-only public stack check/);
  const invalid=spawnSync(process.execPath,[cli,'1','1'],{encoding:'utf8',timeout:10000});
  assert.equal(invalid.status,1);
  assert.equal(invalid.stdout,'');
  assert.match(invalid.stderr,/Duplicate PR number/);
});
