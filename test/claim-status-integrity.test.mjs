import test from 'node:test';
import assert from 'node:assert/strict';
import {status,taskKey,newSession} from '../src/claims.mjs';
import {claimNext} from '../src/queue.mjs';
import {resourceKey} from '../src/resources.mjs';

const repo='ExampleOrg/sample-repo',issue=145;
const session='chat-12345678-1234-4abc-8abc-123456789abc';
const otherSession='chat-87654321-4321-4cba-8cba-cba987654321';
const start='2026-11-14T12:00:00.000Z';
const config={active_repositories:[{full_name:repo,pilot_enabled:true}],
  claim_store:{repo:'Fixture/private-ledger',branch:'coordination/claims'}};
const task={repository:repo,issue,status:'ready',role:'reviewer',access:'read'};
const claim=()=>({schema_version:2,target_repository:repo,issue_number:issue,
  session_id:session,role:'reviewer',access:'read',resource_scope_id:null,
  resource_roots:null,state:'claimed',claimed_at:start,branch:null,last_handoff:null});
const write=()=>({...claim(),role:'developer',access:'write',
  resource_scope_id:'partition',resource_roots:['src/code/']});
const resource=()=>({schema_version:1,kind:'write-resource',
  target_repository:repo,issue_number:issue,session_id:session,
  resource_scope_id:'partition',resource_roots:['src/code/'],claimed_at:start});
function fixture(data,lock=null) {
  const records=new Map([[taskKey(repo,issue),{data,sha:'synthetic-claim'}]]);
  if(lock)records.set(resourceKey(repo,'partition'),{data:lock,sha:'synthetic-resource'});
  let writes=0;
  const api={
    async getClaim(_repo,path){return records.get(path)??null;},
    async getIssue(){return {state:'open'};},
    async createClaim(){writes++;throw Error('unexpected write');},
    async updateClaim(){writes++;throw Error('unexpected update');},
    async deleteClaim(){writes++;throw Error('unexpected delete');}
  };
  return {api,writes:()=>writes};
}
test('status accepts valid read/write and valid handed-off records',async()=>{
  const cases=[
    [claim(),null],[write(),resource()],
    [{...claim(),state:'in_progress',last_handoff:
      {at:'2026-11-14T12:05:00.000Z',summary:'Verified tests',head_sha:null}},null]
  ];
  for(const [data,lock] of cases){
    const f=fixture(data,lock);
    assert.equal((await status({api:f.api,config,repo,issue})).status,'claimed');
    assert.equal(f.writes(),0);
  }
});
test('status rejects malformed role/access, state and unknown fields',async()=>{
  const mutations=[
    c=>{c.role='developer';},
    c=>{c.resource_roots=['src/'];},
    c=>{c.claimed_at='not-a-timestamp';},
    c=>{c.state='in_progress';},
    c=>{c.issue_number=999;},
    c=>{c.unexpected=true;},
  ];
  for(const mutate of mutations){
    const data=claim();mutate(data);const f=fixture(data);
    assert.equal((await status({api:f.api,config,repo,issue})).status,'inconsistent');
    assert.equal(f.writes(),0);
  }
});
test('queue fails closed on malformed foreign-session claims without writes',async()=>{
  const data=claim();data.session_id=otherSession;data.role='developer';
  const f=fixture(data);
  await assert.rejects(()=>claimNext({api:f.api,config,tasks:[task],
    session:newSession(),role:'reviewer'}),/Inconsistent active task claim/);
  assert.equal(f.writes(),0);
});
test('write resource must still match exact issue/session/root partition',async()=>{
  const bad=resource();bad.session_id=otherSession;
  const f=fixture(write(),bad);
  assert.equal((await status({api:f.api,config,repo,issue})).status,'inconsistent');
  assert.equal(f.writes(),0);
});
