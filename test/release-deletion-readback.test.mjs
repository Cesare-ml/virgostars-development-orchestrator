import test from 'node:test';
import assert from 'node:assert/strict';
import {claim,handoff,newSession,release,submissionKey,taskKey,status} from '../src/claims.mjs';
import {submit} from '../src/submissions.mjs';
import {recoverSubmittedResourceRelease} from '../src/submission-release-recovery.mjs';
import {resourceKey} from '../src/resources.mjs';
import {GitHubError} from '../src/github.mjs';

const repo='Cesare-ml/astrological-charts',issue=913;
const ledger='fixture/synthetic-private-ledger';
const branch='coordination/claims';
const config={
  claim_store:{repo:ledger,branch},
  active_repositories:[{full_name:repo,pilot_enabled:true}]
};
const readTask={repository:repo,issue,status:'ready',role:'reviewer',access:'read'};
const writeTask={repository:repo,issue,status:'ready',role:'developer',access:'write',
  resource_scope:{id:'release-confirmation',roots:['test/release-confirmation.test.mjs']}};
const issuePath=taskKey(repo,issue);
const resourcePath=resourceKey(repo,'release-confirmation');
const markerPath=submissionKey(repo,issue);
const clone=value=>structuredClone(value);
function fake(mode='normal') {
  const files=new Map(),calls=[];
  let revision=0,issueDeleteAck=false,resourceDeleteAck=false;
  let issueBeforeDelete=null,resourceBeforeDelete=null;
  const api={
    async getIssue(){return {state:'open',number:issue};},
    async getClaim(_ledger,path) {
      calls.push('get:'+path);
      if(path===issuePath && issueDeleteAck) {
        if(mode==='issue-stale')return clone(issueBeforeDelete);
        if(mode==='issue-unavailable')throw new Error('Simulated GitHub issue GET outage');
      }
      if(path===resourcePath && resourceDeleteAck) {
        if(mode==='resource-stale')return clone(resourceBeforeDelete);
        if(mode==='resource-unavailable')throw new Error('Simulated GitHub resource GET outage');
      }
      if(path===markerPath && resourceDeleteAck && mode==='marker-vanished')
        return null;
      const found=files.get(path);
      return found?clone(found):null;
    },
    async createClaim(_ledger,path,_branch,data) {
      calls.push('create:'+path);
      if(files.has(path))throw new GitHubError(422);
      files.set(path,{sha:'blob-'+(++revision),data:clone(data)});
    },
    async updateClaim(_ledger,path,_branch,sha,data) {
      calls.push('update:'+path);
      if(files.get(path)?.sha!==sha)throw new GitHubError(409);
      files.set(path,{sha:'blob-'+(++revision),data:clone(data)});
    },
    async deleteClaim(_ledger,path,_branch,sha) {
      calls.push('delete:'+path);
      if(files.get(path)?.sha!==sha)throw new GitHubError(409);
      if(path===issuePath) {
        issueBeforeDelete=clone(files.get(path));
        issueDeleteAck=true;
        if(mode==='issue-ack-only')return;
      }
      if(path===resourcePath) {
        resourceBeforeDelete=clone(files.get(path));
        resourceDeleteAck=true;
        if(mode==='resource-ack-only')return;
      }
      files.delete(path);
    }
  };
  return {api,files,calls};
}
async function owner(x,task=writeTask) {
  const session=newSession();
  assert.equal((await claim({
    api:x.api,config,tasks:[task],repo,issue,session,role:task.role
  })).result,'acquired');
  assert.equal((await handoff({
    api:x.api,config,repo,issue,session,summary:'Synthetic owner documented the review.'
  })).result,'handoff-saved');
  return session;
}

test('write release confirms issue deletion before resource deletion and final absence',async()=>{
  const x=fake(),session=await owner(x);
  const result=await release({api:x.api,config,repo,issue,session,confirm:true});
  assert.equal(result.result,'released');
  assert.equal(x.files.size,0);
  const issueDelete=x.calls.indexOf('delete:'+issuePath);
  const resourceDelete=x.calls.indexOf('delete:'+resourcePath);
  assert.ok(issueDelete>=0 && resourceDelete>issueDelete);
  assert.ok(x.calls.slice(issueDelete+1,resourceDelete).includes('get:'+issuePath));
  assert.ok(x.calls.slice(resourceDelete+1).includes('get:'+resourcePath));
});

test('read-only release confirms issue absence but never deletes write resources',async()=>{
  const x=fake(),session=await owner(x,readTask);
  assert.equal((await release({
    api:x.api,config,repo,issue,session,confirm:true
  })).result,'released');
  assert.equal(x.files.size,0);
  assert.ok(x.calls.includes('delete:'+issuePath));
  assert.ok(!x.calls.includes('delete:'+resourcePath));
});

test('acknowledged-but-persisted issue claim must never unlock write resource',async()=>{
  for(const mode of ['issue-ack-only','issue-stale','issue-unavailable']) {
    const x=fake(mode),session=await owner(x);
    await assert.rejects(()=>release({
      api:x.api,config,repo,issue,session,confirm:true
    }),/Issue deletion (not confirmed|readback unavailable)/,mode);
    assert.equal(x.calls.filter(c=>c==='delete:'+resourcePath).length,0,mode);
    assert.equal(x.files.has(resourcePath),true,mode);
  }
});

test('unverified resource deletion cannot return released',async()=>{
  for(const mode of ['resource-ack-only','resource-stale','resource-unavailable']) {
    const x=fake(mode),session=await owner(x);
    await assert.rejects(()=>release({
      api:x.api,config,repo,issue,session,confirm:true
    }),/Resource deletion (not confirmed|readback unavailable)/,mode);
    assert.equal(x.calls.filter(c=>c==='delete:'+resourcePath).length,1,mode);
    assert.equal(x.calls.filter(c=>c==='delete:'+issuePath).length,1,mode);
  }
});

test('submitted task release retains immutable submission marker through final status',async()=>{
  const x=fake(),session=await owner(x,readTask);
  assert.equal((await submit({
    api:x.api,config,tasks:[readTask],repo,issue,session,confirm:true
  })).result,'submitted');
  assert.equal(x.files.has(markerPath),true);
  assert.equal(x.files.has(issuePath),false);
  assert.equal((await status({api:x.api,config,repo,issue})).status,'submitted');
});

test('disappearing marker after issue/resource delete blocks claimed successful release',async()=>{
  const x=fake('marker-vanished'),session=await owner(x);
  await x.api.createClaim(ledger,markerPath,branch,{
    schema_version:1,state:'submitted',target_repository:repo,
    issue_number:issue,session_id:session,role:'developer',access:'write'
  });
  await assert.rejects(()=>release({
    api:x.api,config,repo,issue,session,confirm:true
  }),/Final release status inconsistent/);
  assert.equal(x.calls.filter(c=>c==='delete:'+issuePath).length,1);
  assert.equal(x.calls.filter(c=>c==='delete:'+resourcePath).length,1);
});

test('release rejects claim changed between its first two reads before deleting it',async()=>{
  const x=fake(),session=await owner(x,readTask);
  const original=x.api.getClaim;
  let count=0;
  x.api.getClaim=async (...args)=>{
    const result=await original(...args);
    if(args[1]===issuePath && ++count===2 && result)
      return {...result,data:{...result.data,role:'auditor'}};
    return result;
  };
  await assert.rejects(()=>release({
    api:x.api,config,repo,issue,session,confirm:true
  }),/Claim changed during release checks/);
  assert.ok(!x.calls.some(c=>c.startsWith('delete:')));
});

const head='a'.repeat(40),base='b'.repeat(40);
const submittedMarker=()=>({
  schema_version:1,state:'submitted',target_repository:repo,issue_number:issue,
  session_id:'chat-11111111-1111-4111-8111-111111111111',
  role:'developer',access:'write',resource_scope_id:'release-confirmation',
  last_handoff:{summary:'Verified source.',head_sha:head},
  pull_request:87,audited_head_sha:head,audited_base_sha:base,
  scope_verdict:'scope-clean',collision_audit:'single-candidate'
});
const resourceReservation=()=>({
  schema_version:1,kind:'write-resource',target_repository:repo,
  issue_number:issue,session_id:submittedMarker().session_id,
  resource_scope_id:'release-confirmation',
  resource_roots:['test/release-confirmation.test.mjs']
});
function orphan(mode='normal') {
  const files=new Map([
    [markerPath,{sha:'c'.repeat(40),data:submittedMarker()}],
    [resourcePath,{sha:'d'.repeat(40),data:resourceReservation()}]
  ]);
  let deleted=false,resourceBeforeDelete=null;
  const api={
    async getClaim(_ledger,path) {
      if(deleted && path===resourcePath) {
        if(mode==='resource-stale')return clone(resourceBeforeDelete);
        if(mode==='resource-unavailable')throw new Error('Synthetic read outage');
      }
      if(deleted && path===issuePath && mode==='new-claim')
        return {sha:'e'.repeat(40),data:{session_id:'foreign'}};
      if(deleted && path===markerPath && mode==='changed-marker')
        return {sha:'f'.repeat(40),data:submittedMarker()};
      const v=files.get(path);return v?clone(v):null;
    },
    async deleteClaim(_ledger,path,_branch,sha) {
      if(files.get(path)?.sha!==sha)throw new GitHubError(409);
      resourceBeforeDelete=clone(files.get(path));
      deleted=true;
      if(mode==='resource-ack-only')return;
      files.delete(path);
    }
  };
  return {api,files,prior:clone(files.get(markerPath))};
}
async function recover(x) {
  return recoverSubmittedResourceRelease({
    api:x.api,config,tasks:[writeTask],repo,issue,
    session:submittedMarker().session_id,prior:x.prior,prNumber:87
  });
}

test('submitted orphan resource recovery confirms resource deletion and preserved marker',async()=>{
  const x=orphan();
  assert.equal(await recover(x),true);
  assert.equal(x.files.has(resourcePath),false);
  assert.equal(x.files.has(markerPath),true);
});

test('acknowledged or stale orphan resource deletion cannot return recovered=true',async()=>{
  for(const mode of ['resource-ack-only','resource-stale','resource-unavailable']) {
    const x=orphan(mode);
    await assert.rejects(()=>recover(x),
      /Recovered resource deletion (not confirmed|readback unavailable)/,mode);
  }
});

test('foreign claim or changed submission marker after recovery blocks success',async()=>{
  for(const mode of ['new-claim','changed-marker']) {
    const x=orphan(mode);
    await assert.rejects(()=>recover(x),
      /Recovered resource deletion not confirmed/,mode);
  }
});
