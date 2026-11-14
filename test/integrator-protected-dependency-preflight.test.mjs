import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectIntegratorProtectedDependencyPreflight as preflight}
  from '../src/integrator-protected-dependency-preflight.mjs';

const REPO='Cesare-ml/virgostars-development-orchestrator';
const H='a'.repeat(40),T='b'.repeat(40),M='c'.repeat(40),D='d'.repeat(40);
const clone=x=>structuredClone(x);
function fixture() {
  const branch={name:'main',protected:true,commit:{sha:T}};
  return {
    metadata:{default_branch:'main'},
    branch,branchReads:0,branchDrift:false,
    protection:{
      required_pull_request_reviews:{required_approving_review_count:1},
      required_conversation_resolution:{enabled:true},
      required_status_checks:{strict:true,contexts:['Node 20 · tests','Node 22 · tests'],
        checks:[{context:'Node 20 · tests'}]},
      enforce_admins:{enabled:true}
    },
    pr:{number:17,state:'open',draft:false,merged:false,mergeable:true,
      head:{sha:H,ref:'feature/test',repo:{full_name:REPO}},
      base:{sha:T,ref:'main',repo:{full_name:REPO}}},
    dependency:{number:15,state:'closed',merged:true,merge_commit_sha:M,
      base:{ref:'main',repo:{full_name:REPO}}},
    comparison:{status:'ahead',base_commit:{sha:M}},
    prReads:0,prDrift:false,deny:null,networkFailure:false,requested:[]
  };
}
function fetchFor(f) {
  return async (url,opts)=>{
    const parsed=new URL(url);
    f.requested.push({path:parsed.pathname,method:opts.method,auth:opts.headers.Authorization,
      redirect:opts.redirect});
    if(f.networkFailure)throw Error('dangerous private token leaked');
    if(f.deny===parsed.pathname)return {ok:false,status:403};
    const prefix='/repos/'+REPO;
    let data;
    switch(parsed.pathname){
      case prefix:
        data=f.metadata;break;
      case prefix+'/branches/main':
        f.branchReads++;
        data=clone(f.branch);
        if(f.branchDrift && f.branchReads>1)data.commit.sha=D;
        break;
      case prefix+'/branches/main/protection':
        data=f.protection;break;
      case prefix+'/pulls/17':
        f.prReads++;
        data=clone(f.pr);
        if(f.prDrift && f.prReads>1)data.head.sha=D;
        break;
      case prefix+'/pulls/15':
        data=f.dependency;break;
      case prefix+'/compare/'+M+'...'+T:
        data=f.comparison;break;
      default:
        throw Error('unrecognized URL '+parsed.pathname);
    }
    return {ok:true,status:200,json:async()=>clone(data)};
  };
}
const args={repository:REPO,prNumber:17,expectedHeadSha:H,targetBranch:'main'};
async function run(f,more={}) {
  return preflight({...args,...more,token:'synthetic-secret',fetchImpl:fetchFor(f)});
}
async function blocked(name,modify,code,more={}) {
  await test(name,async()=>{
    const f=fixture();modify(f);
    const r=await run(f,more);
    assert.equal(r.verdict,'blocked');
    assert.ok(r.reasons.includes(code),JSON.stringify(r.reasons));
    assert.equal(r.merge_authorized,false);
    assert.equal(r.merge_executed,false);
  });
}
test('positive source evidence is only a non-authorizing candidate',async()=>{
  const f=fixture(),r=await run(f);
  assert.equal(r.verdict,'candidate');
  assert.deepEqual(r.reasons,[]);
  assert.equal(r.merge_authorized,false);
  assert.equal(r.merge_executed,false);
  assert.equal(r.rulesets_independently_verified,false);
  assert.equal(r.review_and_ci_current_head_verified,false);
  assert.equal(r.private_integrator_claim_verified,false);
  assert.deepEqual(r.verified_required_checks,['Node 20 · tests','Node 22 · tests']);
  assert.equal(f.prReads,2);
  assert.equal(f.branchReads,2);
  assert.ok(f.requested.every(x=>x.method==='GET'&&x.redirect==='error'&&
    x.auth==='Bearer synthetic-secret'));
});
test('one merged dependency must be an ancestor of current target branch',async()=>{
  const f=fixture(),r=await run(f,{dependencies:[15]});
  assert.equal(r.verdict,'candidate');
  assert.deepEqual(r.dependencies,[{number:15,merged:true,merge_sha:M}]);
  assert.ok(f.requested.some(x=>x.path.endsWith('/compare/'+M+'...'+T)));
  assert.equal(r.merge_authorized,false);
});
await blocked('draft PR blocked',f=>{f.pr.draft=true},'PR_NOT_READY');
await blocked('unmergeable PR blocked',f=>{f.pr.mergeable=null},'PR_NOT_READY');
await blocked('head moves from approved SHA',f=>{f.pr.head.sha=D},'PR_HEAD_DRIFT');
await blocked('target is not protected',f=>{f.branch.protected=false},'BRANCH_NOT_PROVEN_PROTECTED');
await blocked('no mandatory independent reviewer',f=>{f.protection.required_pull_request_reviews=null},'REQUIRED_REVIEWS_UNVERIFIED');
await blocked('conversation resolution not required',f=>{f.protection.required_conversation_resolution=null},'CONVERSATION_RESOLUTION_UNVERIFIED');
await blocked('admin protections unverified',f=>{f.protection.enforce_admins.enabled=false},'ENFORCE_ADMINS_UNVERIFIED');
await blocked('required CI checks missing',f=>{f.protection.required_status_checks.contexts=[];f.protection.required_status_checks.checks=[]},'REQUIRED_STATUS_CHECKS_UNVERIFIED');
await blocked('strict up-to-date checks not required',f=>{f.protection.required_status_checks.strict=false},'UP_TO_DATE_CHECKS_UNVERIFIED');
await blocked('target base SHA moved since PR',f=>{f.pr.base.sha=D},'BASE_BRANCH_CHANGED_OR_UNVERIFIED');
await blocked('a dependency is not merged',f=>{f.dependency.merged=false},'UNMERGED_OR_MISROUTED_DEPENDENCY',{dependencies:[15]});
await blocked('dependency is merged to wrong branch',f=>{f.dependency.base.ref='feature'},'UNMERGED_OR_MISROUTED_DEPENDENCY',{dependencies:[15]});
await blocked('merged dependency not present in target',f=>{f.comparison.status='diverged'},'DEPENDENCY_NOT_ANCESTOR_OF_TARGET',{dependencies:[15]});
await blocked('target branch not repository default',f=>{f.metadata.default_branch='develop'},'NON_DEFAULT_BRANCH_REQUIRES_SEPARATE_POLICY');

test('GitHub 403 on branch protection blocks without leaking secrets',async()=>{
  const f=fixture();f.deny='/repos/'+REPO+'/branches/main/protection';
  await assert.rejects(()=>run(f),err=>{
    assert.match(err.message,/GitHub read denied: HTTP 403/);
    assert.doesNotMatch(err.message,/synthetic-secret/);
    return true;
  });
});
test('GitHub 404 for unprotected branch blocks',async()=>{
  const f=fixture();
  const original=fetchFor(f);
  const custom=async (url,opts)=>url.endsWith('/branches/main/protection')?
    {ok:false,status:404}:original(url,opts);
  await assert.rejects(()=>preflight({...args,token:'secret',fetchImpl:custom}),/HTTP 404/);
});
test('PR head drift during remote reads blocks hard',async()=>{
  const f=fixture();f.prDrift=true;
  await assert.rejects(()=>run(f),/changed during evidence collection/);
});
test('branch tip drift during remote reads blocks hard',async()=>{
  const f=fixture();f.branchDrift=true;
  await assert.rejects(()=>run(f),/changed during evidence collection/);
});
test('network errors are sanitized and never merged',async()=>{
  const f=fixture();f.networkFailure=true;
  await assert.rejects(()=>run(f),err=>{
    assert.match(err.message,/transport failure/);
    assert.doesNotMatch(err.message,/private token/);
    return true;
  });
});
test('input validation denies unexpected URL components before contacting GitHub',async()=>{
  const f=fixture();
  for(const changes of [
    {repository:'other/../repo'},
    {prNumber:0},
    {targetBranch:'../main'},
    {expectedHeadSha:'bad'},
    {dependencies:[15,15]},
    {dependencies:[17]},
    {dependencies:Array.from({length:13},(_,i)=>i+1)}
  ]){
    await assert.rejects(()=>run(f,changes),/invalid or incomplete approved integration scope/);
  }
  assert.equal(f.requested.length,0);
});
test('missing/invalid GitHub credential blocks before fetching',async()=>{
  const f=fixture();
  await assert.rejects(()=>preflight({...args,token:'',fetchImpl:fetchFor(f)}),/credential/);
  assert.equal(f.requested.length,0);
});
test('malformed response blocks rather than interpreting absence as success',async()=>{
  const f=fixture();f.protection={};
  const r=await run(f);
  assert.equal(r.verdict,'blocked');
  assert.ok(r.reasons.includes('REQUIRED_REVIEWS_UNVERIFIED'));
  assert.ok(r.reasons.includes('REQUIRED_STATUS_CHECKS_UNVERIFIED'));
  assert.equal(r.merge_authorized,false);
});
