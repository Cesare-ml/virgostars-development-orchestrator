import test from 'node:test';
import assert from 'node:assert/strict';
import {claim,handoff,newSession,submissionKey,taskKey,status} from '../src/claims.mjs';
import {submit} from '../src/submissions.mjs';
import {GitHubError} from '../src/github.mjs';

const REPO='Cesare-ml/astrological-charts';
const LEDGER='synthetic/independent-private-ledger';
const ISSUE=901;
const config={
  claim_store:{repo:LEDGER,branch:'coordination/claims'},
  active_repositories:[{full_name:REPO,pilot_enabled:true}]
};
const tasks=[{
  repository:REPO,issue:ISSUE,status:'ready',role:'reviewer',access:'read'
}];
const submissionPath=submissionKey(REPO,ISSUE);
const issuePath=taskKey(REPO,ISSUE);
const clone=x=>structuredClone(x);

function fixture(mode='normal') {
  const files=new Map(),calls=[];
  let revision=0,markerCreated=false,submissionReads=0;
  const api={
    async getIssue(){return {number:ISSUE,state:'open'};},
    async getClaim(_ledger,path) {
      calls.push('get:'+path);
      if(path===submissionPath && markerCreated) {
        submissionReads++;
        if(mode==='missing'||mode==='ack-only')return null;
        if(mode==='unavailable')throw new Error('synthetic unavailable GitHub read');
      }
      const current=files.get(path);
      if(!current)return null;
      const record=clone(current);
      if(path===submissionPath&&markerCreated) {
        if(mode==='forged-role')record.data.role='developer';
        if(mode==='altered-timestamp')record.data.submitted_at='different-timestamp';
        if(mode==='empty-blob')record.sha='';
        if(mode==='collision-changes-after-receipt'&&submissionReads>=2)
          record.data.last_handoff.summary='modified between checks';
      }
      return record;
    },
    async createClaim(_ledger,path,_branch,data) {
      calls.push('create:'+path);
      if(files.has(path))throw new GitHubError(422);
      if(path===submissionPath)markerCreated=true;
      if(mode==='ack-only'&&path===submissionPath)return;
      files.set(path,{sha:'sha-'+(++revision),data:clone(data)});
      if(mode==='collision-changes-after-receipt'&&path===submissionPath)
        throw new GitHubError(422);
    },
    async updateClaim(_ledger,path,_branch,sha,data) {
      calls.push('update:'+path);
      if(files.get(path)?.sha!==sha)throw new GitHubError(409);
      files.set(path,{sha:'sha-'+(++revision),data:clone(data)});
    },
    async deleteClaim(_ledger,path,_branch,sha) {
      calls.push('delete:'+path);
      if(files.get(path)?.sha!==sha)throw new GitHubError(409);
      files.delete(path);
    }
  };
  return {api,files,calls,submissionReads:()=>submissionReads};
}
async function start(x,session=newSession()) {
  await claim({api:x.api,config,tasks,repo:REPO,issue:ISSUE,
    session,role:'reviewer'});
  await handoff({api:x.api,config,repo:REPO,issue:ISSUE,session,
    summary:'Synthetic reviewer completed the GitHub code review.'});
  return session;
}
const submitArgs=(x,session)=>({
  api:x.api,config,tasks,repo:REPO,issue:ISSUE,session,confirm:true
});

test('submission marker is independently readable before issue claim is deleted',async()=>{
  const x=fixture(),session=await start(x);
  const result=await submit(submitArgs(x,session));
  assert.equal(result.result,'submitted');
  assert.ok(x.submissionReads()>0);
  assert.ok(x.calls.indexOf('get:'+submissionPath) <
    x.calls.indexOf('delete:'+issuePath));
  assert.equal(x.files.has(issuePath),false);
  assert.equal(x.files.has(submissionPath),true);
  assert.equal((await status({api:x.api,config,repo:REPO,issue:ISSUE})).status,'submitted');
});

test('successful create ACK with no persisted submission blocks task release',async()=>{
  const x=fixture('ack-only'),session=await start(x);
  await assert.rejects(()=>submit(submitArgs(x,session)),
    /Submission marker readback inconsistent/);
  assert.equal(x.files.has(submissionPath),false);
  assert.equal(x.files.has(issuePath),true);
  assert.ok(!x.calls.includes('delete:'+issuePath));
});

test('stale missing submission GET keeps the owner claim protected',async()=>{
  const x=fixture('missing'),session=await start(x);
  await assert.rejects(()=>submit(submitArgs(x,session)),
    /Submission marker readback inconsistent/);
  assert.equal(x.files.has(submissionPath),true);
  assert.equal(x.files.has(issuePath),true);
  assert.ok(!x.calls.some(c=>c.startsWith('delete:')));
});

test('interrupted post-create GET does not release any claim',async()=>{
  const x=fixture('unavailable'),session=await start(x);
  await assert.rejects(()=>submit(submitArgs(x,session)),
    /Submission marker readback unavailable/);
  assert.equal(x.files.has(issuePath),true);
  assert.equal(x.files.has(submissionPath),true);
  assert.ok(!x.calls.some(c=>c.startsWith('delete:')));
});

test('forged marker role or changed exact timestamp blocks release',async()=>{
  for(const mode of ['forged-role','altered-timestamp','empty-blob']) {
    const x=fixture(mode),session=await start(x);
    await assert.rejects(()=>submit(submitArgs(x,session)),
      /Submission marker readback inconsistent/);
    assert.equal(x.files.has(issuePath),true,mode);
    assert.equal(x.files.has(submissionPath),true,mode);
    assert.ok(!x.calls.some(c=>c.startsWith('delete:')),mode);
  }
});

test('409/422 identical same-session collision still succeeds after fresh readback',async()=>{
  const x=fixture(),session=await start(x);
  const original=x.api.createClaim;
  x.api.createClaim=async(...args)=>{
    if(args[1]===submissionPath) {
      await original(...args);
      throw new GitHubError(422);
    }
    return original(...args);
  };
  const result=await submit(submitArgs(x,session));
  assert.equal(result.result,'submitted');
  assert.equal(x.files.has(issuePath),false);
  assert.equal(x.files.has(submissionPath),true);
});

test('409/422 marker that changes after collision check prevents release',async()=>{
  const x=fixture('collision-changes-after-receipt'),session=await start(x);
  await assert.rejects(()=>submit(submitArgs(x,session)),
    /Submission marker readback inconsistent/);
  assert.equal(x.files.has(issuePath),true);
  assert.equal(x.files.has(submissionPath),true);
  assert.ok(!x.calls.some(c=>c.startsWith('delete:')));
});
