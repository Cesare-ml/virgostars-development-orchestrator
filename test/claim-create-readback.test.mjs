import test from 'node:test';
import assert from 'node:assert/strict';
import {claim,newSession,taskKey,status} from '../src/claims.mjs';
import {claimNext} from '../src/queue.mjs';
import {GitHubError} from '../src/github.mjs';

const REPO='Cesare-ml/astrological-charts';
const LEDGER='fixture/private-claims';
const ISSUE=803;
const config={
  active_repositories:[{full_name:REPO,pilot_enabled:true}],
  claim_store:{repo:LEDGER,branch:'coordination/claims'}
};
const writeTask={
  repository:REPO,issue:ISSUE,status:'ready',
  role:'developer',access:'write',
  resource_scope:{id:'post-write-check',roots:['test/new-claim.test.mjs']}
};
const readTask={
  repository:REPO,issue:ISSUE,status:'ready',role:'reviewer',access:'read'
};
const copy=x=>structuredClone(x);

function fixture(mode='ok') {
  const ledger=new Map(),calls=[];
  let revision=0,issueWasCreated=false;
  const api={
    async getIssue(){return {state:'open'};},
    async getClaim(_repo,path) {
      calls.push('getClaim');
      const isIssue=path===taskKey(REPO,ISSUE);
      if(issueWasCreated&&isIssue&&mode==='stale-issue')return null;
      if(issueWasCreated&&isIssue&&mode==='error-on-read')
        throw new Error('synthetic transient stale read');
      if(issueWasCreated&&path.startsWith('resources/')&&mode==='stale-resource')
        return null;
      const saved=ledger.get(path);
      if(issueWasCreated&&isIssue&&mode==='foreign-owner'&&saved)
        return {...copy(saved),data:{...copy(saved.data),session_id:newSession()}};
      if(issueWasCreated&&isIssue&&mode==='altered-receipt'&&saved)
        return {...copy(saved),data:{...copy(saved.data),claimed_at:'other-time'}};
      return saved?copy(saved):null;
    },
    async createClaim(_repo,path,_branch,data) {
      calls.push('createClaim');
      if(ledger.has(path))throw new GitHubError(422);
      revision++;
      ledger.set(path,{sha:'blob-'+revision,data:copy(data)});
      if(path===taskKey(REPO,ISSUE)) {
        issueWasCreated=true;
        if(mode==='conflicted-ack')throw new GitHubError(422);
        if(mode==='conflicted-forged-role') {
          ledger.get(path).data.role='auditor';
          throw new GitHubError(422);
        }
      }
    },
    async deleteClaim(_repo,path,_branch,sha) {
      calls.push('deleteClaim');
      if(ledger.get(path)?.sha!==sha)throw new GitHubError(409);
      ledger.delete(path);
    }
  };
  return {api,ledger,calls};
}
function request(x,{task=writeTask,session=newSession()}={}) {
  return {api:x.api,config,tasks:[task],repo:REPO,issue:ISSUE,
    role:task.role,session};
}

test('successful write claim is reported only after issue and resource readback',async()=>{
  const x=fixture();
  const result=await claim(request(x));
  assert.equal(result.result,'acquired');
  assert.equal(x.ledger.size,2);
  assert.equal(x.calls.filter(x=>x==='createClaim').length,2);
  assert.ok(x.calls.lastIndexOf('getClaim')>x.calls.lastIndexOf('createClaim'));
  assert.equal(result.claim.resource_scope_id,'post-write-check');
  assert.equal((await status({api:x.api,config,repo:REPO,issue:ISSUE})).status,'claimed');
});

test('successful read-only claim also requires a matching readback',async()=>{
  const x=fixture();
  const result=await claim(request(x,{task:readTask}));
  assert.equal(result.result,'acquired');
  assert.equal(x.ledger.size,1);
  assert.equal(result.claim.access,'read');
});

test('stale, foreign or modified readback never reports acquired or deletes locks',async()=>{
  for(const mode of [
    'stale-issue','stale-resource','foreign-owner','altered-receipt','error-on-read'
  ]) {
    const x=fixture(mode);
    await assert.rejects(()=>claim(request(x)),
      /Issue claim outcome uncertain|readback inconsistent/);
    assert.equal(x.ledger.size,2,mode);
    assert.equal(x.calls.filter(x=>x==='deleteClaim').length,0,mode);
  }
});

test('a 409/422 with exact same owner and valid resource returns already-owned, never acquired',async()=>{
  const x=fixture('conflicted-ack');
  const result=await claim(request(x));
  assert.equal(result.result,'already-owned');
  assert.equal(x.ledger.size,2);
  assert.equal(x.calls.filter(x=>x==='deleteClaim').length,0);
});

test('a contended 422 with a forged role fails closed and leaves record for recovery',async()=>{
  const x=fixture('conflicted-forged-role');
  await assert.rejects(()=>claim(request(x)),
    /ownership or resource scope inconsistent/);
  assert.equal(x.ledger.size,2);
  assert.equal(x.calls.filter(x=>x==='deleteClaim').length,0);
});

test('claim-next never yields acquired when a post-write GitHub read is stale',async()=>{
  const x=fixture('stale-resource');
  await assert.rejects(()=>claimNext({
    api:x.api,config,tasks:[writeTask],
    session:newSession(),role:'developer'
  }),/Issue claim outcome uncertain/);
  assert.equal(x.ledger.size,2);
});

test('same-session resume still reads the active resource but does not rewrite it',async()=>{
  const x=fixture();
  const session=newSession();
  const first=await claim(request(x,{session}));
  assert.equal(first.result,'acquired');
  const writes=x.calls.filter(x=>x==='createClaim').length;
  const resumed=await claim(request(x,{session}));
  assert.equal(resumed.result,'already-owned');
  assert.equal(x.calls.filter(x=>x==='createClaim').length,writes);
});
