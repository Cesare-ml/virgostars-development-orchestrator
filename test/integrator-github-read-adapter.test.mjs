import test from 'node:test';
import assert from 'node:assert/strict';
import {makeIntegratorGitHubReadAdapter} from '../src/integrator-github-read-adapter.mjs';
import {collectIntegratorLivePrEvidence} from '../src/integrator-live-pr-evidence.mjs';

const REPO='Cesare-ml/virgostars-development-orchestrator';
const SHA='a'.repeat(40), BASE='b'.repeat(40), TOKEN='test-secret-never-output';
const clone=x=>structuredClone(x);
function fixture() {
  return {
    pr:{number:12,state:'open',draft:false,merged:false,mergeable:true,changed_files:1,
      head:{ref:'feat/safe',sha:SHA,repo:{full_name:REPO}},
      base:{ref:'main',sha:BASE,repo:{full_name:REPO}},user:{login:'developer'}},
    files:[{filename:'src/safe.mjs',status:'added'}],
    reviews:[{id:10,user:{login:'independent'},state:'APPROVED',commit_id:SHA,
      submitted_at:'2026-11-14T10:00:00Z'}],
    checks:[{id:31,name:'Node 22',head_sha:SHA,status:'completed',conclusion:'success'}],
    threads:[{id:'PRRT_1',isResolved:true}],
    requests:[],
    failedStatus:null, malformed:false, graphqlErrors:false, wrongPr:false,
    checkTotalOverride:null, threadTotalOverride:null, prReadDrift:false
  };
}
function fakeFetch(s) {
  return async (url,opts) => {
    s.requests.push({url,method:opts.method,body:opts.body??null,headers:opts.headers,redirect:opts.redirect});
    if(s.failedStatus!==null)return {ok:false,status:s.failedStatus};
    if(s.malformed)return {ok:true,status:200,json:async()=>{throw Error('invalid JSON')}};
    const u=new URL(url),page=Number(u.searchParams.get('page')||1);
    const segment=items=>clone(items.slice((page-1)*100,page*100));
    let data;
    if(u.pathname==='/repos/'+REPO+'/pulls/12'){
      data=clone(s.pr);if(s.wrongPr)data.number=11;
      if(s.prReadDrift&&s.requests.filter(x=>x.url.includes('/pulls/12')).length>1)
        data.head.sha='c'.repeat(40);
    }else if(u.pathname==='/repos/'+REPO+'/pulls/12/files'){
      data=segment(s.files);
    }else if(u.pathname==='/repos/'+REPO+'/pulls/12/reviews'){
      data=segment(s.reviews);
    }else if(u.pathname==='/repos/'+REPO+'/commits/'+SHA+'/check-runs'){
      data={total_count:s.checkTotalOverride??s.checks.length,check_runs:segment(s.checks)};
    }else if(u.pathname==='/graphql'){
      assert.equal(opts.method,'POST');
      const body=JSON.parse(opts.body);
      assert.match(body.query,/query IntegratorReviewThreads/);
      assert.doesNotMatch(body.query,/mutation/);
      assert.equal(body.variables.owner,'Cesare-ml');
      assert.equal(body.variables.name,'virgostars-development-orchestrator');
      const index=body.variables.after===null?0:100;
      const nodes=clone(s.threads.slice(index,index+100));
      const hasNextPage=index+nodes.length<s.threads.length;
      data=s.graphqlErrors?{errors:[{message:'permission denied'}]}:
        {data:{repository:{pullRequest:{reviewThreads:{
          totalCount:s.threadTotalOverride??s.threads.length,nodes,
          pageInfo:{hasNextPage,endCursor:hasNextPage?'p1':null}
        }}}}};
    }else{
      throw Error('Unexpected endpoint '+u.pathname);
    }
    return {ok:true,status:200,json:async()=>clone(data)};
  };
}
function adapter(s){return makeIntegratorGitHubReadAdapter({token:TOKEN,fetchImpl:fakeFetch(s)})}
async function snapshot(s) {
  return collectIntegratorLivePrEvidence({
    api:adapter(s),repository:REPO,prNumber:12,requiredCheckNames:['Node 22']
  });
}
test('authenticated REST/GraphQL adapter returns a read-only candidate',async()=>{
  const s=fixture();
  const r=await snapshot(s);
  assert.equal(r.verdict,'candidate');
  assert.equal(r.merge_authorized,false);
  assert.equal(r.merge_executed,false);
  assert.equal(r.branch_protection_verified,false);
  assert.equal(r.approval_or_session_verified,false);
  assert.equal(s.requests.filter(x=>x.url.endsWith('/pulls/12')).length,2);
  assert.deepEqual([...new Set(s.requests.map(x=>x.method))].sort(),['GET','POST']);
  assert.ok(s.requests.every(x=>x.redirect==='error'));
  assert.ok(s.requests.every(x=>x.headers.Authorization==='Bearer '+TOKEN));
});
test('handles 101 changed-file and review records with required pagination',async()=>{
  const s=fixture();
  s.files=Array.from({length:101},(_,i)=>({filename:'src/file'+i+'.mjs',status:'added'}));
  s.pr.changed_files=101;
  s.reviews=Array.from({length:101},(_,i)=>({id:i+1,user:{login:'independent'},
    state:'APPROVED',commit_id:SHA,submitted_at:'2026-11-14T10:00:00Z'}));
  const r=await snapshot(s);
  assert.equal(r.verdict,'candidate');
  assert.equal(s.requests.filter(x=>x.url.includes('/files?')).length,2);
  assert.equal(s.requests.filter(x=>x.url.includes('/reviews?')).length,2);
});
test('paginates more than 100 GitHub check runs',async()=>{
  const s=fixture();s.checks=Array.from({length:101},(_,i)=>({
    id:i+1,name:i===0?'Node 22':'Other '+i,head_sha:SHA,
    status:'completed',conclusion:'success'
  }));
  const x=await adapter(s).getPullRequestCheckRuns(REPO,SHA);
  assert.equal(x.total_count,101);
  assert.equal(x.check_runs.length,101);
  assert.equal(s.requests.filter(r=>r.url.includes('/check-runs?')).length,2);
});
test('paginates more than 100 resolved GraphQL review threads',async()=>{
  const s=fixture();
  s.threads=Array.from({length:101},(_,i)=>({id:'PRRT_'+i,isResolved:true}));
  const r=await snapshot(s);
  assert.equal(r.verdict,'candidate');
  assert.equal(s.requests.filter(x=>x.url.endsWith('/graphql')).length,2);
});
test('does not emit the token when GitHub denies permission',async()=>{
  const s=fixture();s.failedStatus=403;
  await assert.rejects(()=>snapshot(s),err=>{
    assert.match(err.message,/HTTP 403/);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
});
test('GraphQL errors block incomplete review evidence',async()=>{
  const s=fixture();s.graphqlErrors=true;
  await assert.rejects(()=>snapshot(s),/GraphQL review-thread query failed/);
});
test('transport and malformed JSON errors are sanitized',async()=>{
  const s=fixture();s.malformed=true;
  await assert.rejects(()=>snapshot(s),/malformed JSON/);
  const x=makeIntegratorGitHubReadAdapter({token:TOKEN,fetchImpl:async()=>{throw Error('network leaked '+TOKEN)}});
  await assert.rejects(()=>x.getPullRequest(REPO,12),err=>{
    assert.match(err.message,/transport error/);
    assert.ok(!err.message.includes(TOKEN));return true;
  });
});
test('rejects invalid repository, PR and commit before a network request',async()=>{
  const s=fixture(),a=adapter(s);
  await assert.rejects(()=>a.getPullRequest('bad/../repo',12),/invalid repository/);
  await assert.rejects(()=>a.getPullRequest(REPO,0),/invalid pull request/);
  await assert.rejects(()=>a.getPullRequestCheckRuns(REPO,'bad-sha'),/invalid commit SHA/);
  assert.equal(s.requests.length,0);
});
test('rejects missing token and unusable fetch method at construction',()=>{
  assert.throws(()=>makeIntegratorGitHubReadAdapter({token:''}),/credential/);
  assert.throws(()=>makeIntegratorGitHubReadAdapter({token:TOKEN,fetchImpl:null}),/fetch implementation/);
});
test('rejects PR identity mismatches',async()=>{
  const s=fixture();s.wrongPr=true;
  await assert.rejects(()=>adapter(s).getPullRequest(REPO,12),/unexpected PR identity/);
});
test('refuses a PR whose head changes during paginated snapshot',async()=>{
  const s=fixture();s.prReadDrift=true;
  await assert.rejects(()=>snapshot(s),/PR changed/);
});
test('refuses inconsistent check-run total count',async()=>{
  const s=fixture();s.checkTotalOverride=2;
  await assert.rejects(()=>snapshot(s),/check-run pages stopped before GitHub total/);
});
test('refuses duplicated check-run IDs',async()=>{
  const s=fixture();s.checks=[s.checks[0],{...s.checks[0]}];
  await assert.rejects(()=>adapter(s).getPullRequestCheckRuns(REPO,SHA),/invalid or stale check-run/);
});
test('refuses check-runs from a different commit',async()=>{
  const s=fixture();s.checks[0].head_sha=BASE;
  await assert.rejects(()=>adapter(s).getPullRequestCheckRuns(REPO,SHA),/invalid or stale check-run/);
});
test('refuses incomplete GraphQL thread inventory',async()=>{
  const s=fixture();s.threadTotalOverride=2;
  await assert.rejects(()=>snapshot(s),/review-thread count mismatch/);
});
test('refuses duplicate GraphQL thread IDs',async()=>{
  const s=fixture();s.threads.push({...s.threads[0]});
  await assert.rejects(()=>snapshot(s),/invalid or duplicate review thread/);
});
test('refuses a thread collection above safety cap',async()=>{
  const s=fixture();s.threads=Array.from({length:201},(_,i)=>({id:'PRRT_'+i,isResolved:true}));
  await assert.rejects(()=>snapshot(s),/incomplete review-thread pagination/);
});
test('refuses more than 200 changed files rather than truncating them',async()=>{
  const s=fixture();s.files=Array.from({length:201},(_,i)=>({filename:'src/file'+i+'.mjs'}));
  await assert.rejects(()=>adapter(s).getPullRequestFiles(REPO,12),/incomplete files pagination/);
});
test('refuses a missing GraphQL cursor on a multi-page result',async()=>{
  const s=fixture();s.threads=Array.from({length:101},(_,i)=>({id:'PRRT_'+i,isResolved:true}));
  const original=fakeFetch(s);
  const override=async(url,opts)=>{
    const r=await original(url,opts);
    if(!url.endsWith('/graphql'))return r;
    const j=await r.json();
    j.data.repository.pullRequest.reviewThreads.pageInfo.endCursor=null;
    return {ok:true,status:200,json:async()=>j};
  };
  const a=makeIntegratorGitHubReadAdapter({token:TOKEN,fetchImpl:override});
  await assert.rejects(()=>a.getPullRequestReviewThreads(REPO,12),/invalid review-thread cursor/);
});
