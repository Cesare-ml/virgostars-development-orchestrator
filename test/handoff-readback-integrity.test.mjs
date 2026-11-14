import test from 'node:test';
import assert from 'node:assert/strict';
import {claim,handoff,newSession,taskKey,submissionKey,status} from '../src/claims.mjs';
import {submit} from '../src/submissions.mjs';
import {resourceKey} from '../src/resources.mjs';
import {GitHubError} from '../src/github.mjs';

const REPO='Cesare-ml/astrological-charts',ISSUE=906;
const LEDGER='fixture/private-handoff-ledger';
const config={
  active_repositories:[{full_name:REPO,pilot_enabled:true}],
  claim_store:{repo:LEDGER,branch:'coordination/claims'}
};
const readTask={
  repository:REPO,issue:ISSUE,role:'reviewer',
  status:'ready',access:'read'
};
const writeTask={
  repository:REPO,issue:ISSUE,role:'developer',
  status:'ready',access:'write',
  resource_scope:{id:'owner-handoff',roots:['test/owner-handoff.test.mjs']}
};
const path=taskKey(REPO,ISSUE),resourcePath=resourceKey(REPO,'owner-handoff');
const copy=x=>structuredClone(x);
const summary='Reviewed scoped tests and recorded the exact next action.';

function fixture(mode='normal') {
  const files=new Map(),calls=[];
  let revision=0,inHandoff=false,handedOff=false,claimReads=0,previous=null;
  const api={
    async getIssue(){return {number:ISSUE,state:'open'};},
    async getClaim(_ledger,key) {
      calls.push('get:'+key);
      if(inHandoff && key===path)claimReads++;
      if(inHandoff && !handedOff && key===path && claimReads===2 &&
         mode==='prewrite-drift') {
        const record=copy(files.get(key));
        record.data.claimed_at='tampered-between-reads';
        return record;
      }
      if(handedOff && key===path) {
        if(mode==='missing-read')return null;
        if(mode==='error-read')throw new Error('synthetic GitHub read failed');
        if(mode==='stale-read'||mode==='ack-only')return copy(previous);
      }
      const current=files.get(key);
      if(!current)return null;
      const record=copy(current);
      if(handedOff && key===path) {
        if(mode==='foreign-owner')record.data.session_id=newSession();
        if(mode==='modified-handoff')record.data.last_handoff.summary='malicious replacement';
        if(mode==='missing-sha')record.sha='';
        if(mode==='previous-sha')record.sha=previous.sha;
      }
      if(handedOff && key===resourcePath && mode==='foreign-resource')
        record.data.session_id=newSession();
      return record;
    },
    async createClaim(_ledger,key,_branch,data) {
      calls.push('create:'+key);
      if(files.has(key))throw new GitHubError(422);
      files.set(key,{sha:'sha-'+(++revision),data:copy(data)});
    },
    async updateClaim(_ledger,key,_branch,sha,data) {
      calls.push('update:'+key);
      if(mode==='conflict')throw new GitHubError(409);
      if(files.get(key)?.sha!==sha)throw new GitHubError(409);
      previous=copy(files.get(key));
      handedOff=true;
      if(mode==='ack-only')return;
      files.set(key,{sha:'sha-'+(++revision),data:copy(data)});
    },
    async deleteClaim(_ledger,key,_branch,sha) {
      calls.push('delete:'+key);
      if(files.get(key)?.sha!==sha)throw new GitHubError(409);
      files.delete(key);
    }
  };
  return {api,files,calls,arm:()=>{inHandoff=true;claimReads=0;},
    readCount:()=>claimReads};
}

async function start(x,task=readTask) {
  const session=newSession();
  const acquired=await claim({
    api:x.api,config,tasks:[task],repo:REPO,
    issue:ISSUE,session,role:task.role
  });
  assert.equal(acquired.result,'acquired');
  x.arm();
  return session;
}
const doHandoff=(x,session,overrides={})=>handoff({
  api:x.api,config,repo:REPO,issue:ISSUE,session,
  summary,now:()=> '2026-11-14T16:00:00.000Z',
  ...overrides
});

test('read-only handoff reports saved only after verifying changed SHA and exact JSON',async()=>{
  const x=fixture(),session=await start(x);
  const result=await doHandoff(x,session);
  assert.equal(result.result,'handoff-saved');
  assert.equal(result.claim.state,'in_progress');
  assert.equal(result.claim.last_handoff.summary,summary);
  const update=x.calls.indexOf('update:'+path);
  assert.ok(update>=0);
  assert.ok(x.calls.slice(update+1).includes('get:'+path));
  assert.equal((await status({api:x.api,config,repo:REPO,issue:ISSUE})).claim.last_handoff.summary,summary);
  const delivered=await submit({
    api:x.api,config,tasks:[readTask],repo:REPO,
    issue:ISSUE,session,confirm:true
  });
  assert.equal(delivered.result,'submitted');
  assert.ok(x.files.has(submissionKey(REPO,ISSUE)));
});

test('write-task handoff checks same resource ownership in post-update status',async()=>{
  const x=fixture(),session=await start(x,writeTask);
  const result=await doHandoff(x,session,{
    branchName:'feat/verified-branch',headSha:'a'.repeat(40)
  });
  assert.equal(result.result,'handoff-saved');
  assert.equal(result.claim.access,'write');
  assert.equal(result.claim.last_handoff.head_sha,'a'.repeat(40));
  assert.equal(x.files.size,2);
});

test('a PUT success without a saved update cannot report handoff-saved',async()=>{
  const x=fixture('ack-only'),session=await start(x);
  await assert.rejects(()=>doHandoff(x,session),/Handoff readback inconsistent/);
  assert.equal(x.files.get(path).data.last_handoff,null);
  assert.equal(x.calls.filter(c=>c.startsWith('delete:')).length,0);
});

test('missing, stale or inaccessible post-update record blocks handoff completion',async()=>{
  for(const mode of ['missing-read','stale-read','error-read']) {
    const x=fixture(mode),session=await start(x);
    await assert.rejects(()=>doHandoff(x,session),
      /Handoff readback (inconsistent|unavailable)/,mode);
    assert.equal(x.files.has(path),true,mode);
    assert.equal(x.calls.filter(c=>c.startsWith('delete:')).length,0,mode);
  }
});

test('foreign owner, modified handoff or altered blob SHA fails closed',async()=>{
  for(const mode of ['foreign-owner','modified-handoff','missing-sha','previous-sha']) {
    const x=fixture(mode),session=await start(x);
    await assert.rejects(()=>doHandoff(x,session),/Handoff readback inconsistent/,mode);
    assert.equal(x.files.has(path),true,mode);
  }
});

test('a vanished or foreign write-resource blocks verifying a completed handoff',async()=>{
  const x=fixture('foreign-resource'),session=await start(x,writeTask);
  await assert.rejects(()=>doHandoff(x,session),
    /Handoff readback inconsistent/);
  assert.equal(x.files.has(path),true);
  assert.equal(x.files.has(resourcePath),true);
  assert.ok(x.calls.includes('get:'+resourcePath));
});

test('two conflicting pre-update reads never permit writing a stale claim',async()=>{
  const x=fixture('prewrite-drift'),session=await start(x);
  await assert.rejects(()=>doHandoff(x,session),
    /Claim changed between handoff reads/);
  assert.ok(!x.calls.includes('update:'+path));
  assert.equal(x.files.get(path).data.state,'claimed');
});

test('409 response to handoff update never reports saved or releases ownership',async()=>{
  const x=fixture('conflict'),session=await start(x);
  await assert.rejects(()=>doHandoff(x,session),
    /Claim was changed concurrently/);
  assert.equal(x.files.get(path).data.state,'claimed');
  assert.equal(x.calls.filter(c=>c.startsWith('delete:')).length,0);
});
