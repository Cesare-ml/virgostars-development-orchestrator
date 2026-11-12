import test from 'node:test';
import assert from 'node:assert/strict';
import {claim, handoff, release, status, discover, newSession, taskKey} from '../src/claims.mjs';
import {resourceKey} from '../src/resources.mjs';
import {GitHubError} from '../src/github.mjs';

const repo='Cesare-ml/astrological-charts';
const config={active_repositories:[{full_name:repo,pilot_enabled:true}],
 claim_store:{repo:'Cesare-ml/virgostars-development-orchestrator',branch:'coordination/claims'}};
const write=(issue,id,roots)=>({repository:repo,issue,role:'developer',status:'ready',
 access:'write',resource_scope:{id,roots}});
const tasks=[write(10,'render',['src/render/']),write(11,'render',['src/render/']),
 write(12,'translations',['src/i18n/'])];
const options=(api,session,issue)=>({api,session,config,tasks,repo,issue,role:'developer'});

function mock() {
 const files=new Map();
 let counter=0, failIssue=null, failResourceDelete=false;
 const clone=x=>structuredClone(x);
 return {
  files,
  failIssueWith(error){failIssue=error;},
  failResourceRelease(){failResourceDelete=true;},
  async getIssue(){return {state:'open'};},
  async getClaim(_repo,path){return files.has(path)?clone(files.get(path)):null;},
  async createClaim(_repo,path,_branch,data) {
   if(path.startsWith('claims/') && failIssue){const e=failIssue;failIssue=null;throw e;}
   if(files.has(path)) throw new GitHubError(422);
   files.set(path,{sha:String(++counter),data:clone(data)});
  },
  async updateClaim(_repo,path,_branch,sha,data) {
   if(files.get(path)?.sha!==sha) throw new GitHubError(409);
   files.set(path,{sha:String(++counter),data:clone(data)});
  },
  async deleteClaim(_repo,path,_branch,sha) {
   if(failResourceDelete && path.startsWith('resources/')) throw new GitHubError(409);
   if(files.get(path)?.sha!==sha) throw new GitHubError(409);
   files.delete(path);
  }
 };
}
const resource=id=>resourceKey(repo,id);

test('two different issues targeting the SAME resource cannot both start',async()=>{
 const api=mock(),a=newSession(),b=newSession();
 const [first,second]=await Promise.all([claim(options(api,a,10)),claim(options(api,b,11))]);
 assert.deepEqual([first.result,second.result].sort(),['acquired','busy']);
 assert.equal(api.files.size,2); // one issue + one resource
 const lock=api.files.get(resource('render'));
 assert.ok(lock);
 assert.equal(lock.data.session_id,first.claim.session_id);
});

test('truly disjoint partitions can be claimed concurrently',async()=>{
 const api=mock(),a=newSession(),b=newSession();
 const [left,right]=await Promise.all([claim(options(api,a,10)),claim(options(api,b,12))]);
 assert.equal(left.result,'acquired');
 assert.equal(right.result,'acquired');
 assert.equal(api.files.size,4); // two issues + two resources
});

test('issue collision rolls back a newly acquired partition',async()=>{
 const api=mock(),a=newSession();
 api.failIssueWith(new GitHubError(422));
 const result=await claim(options(api,a,10));
 assert.equal(result.result,'busy');
 assert.equal(api.files.size,0);
});

test('orphan reservation after interrupted claim blocks another session',async()=>{
 const api=mock(),a=newSession(),b=newSession();
 const data={kind:'write-resource',target_repository:repo,resource_scope_id:'render',
  issue_number:10,session_id:a,resource_roots:['src/render/'],claimed_at:'2026-11-12T00:00:00Z'};
 await api.createClaim('ledger',resource('render'),'branch',data);
 assert.equal((await claim(options(api,b,11))).result,'busy');
 assert.equal((await claim(options(api,a,10))).result,'acquired');
});

test('write handoff and release verify resource and clear both locks',async()=>{
 const api=mock(),a=newSession();
 await claim(options(api,a,10));
 await handoff({api,config,repo,issue:10,session:a,summary:'Verified work and review.'});
 assert.equal((await release({api,config,repo,issue:10,session:a,confirm:true})).result,'released');
 assert.equal(api.files.size,0);
 assert.equal((await status({api,config,repo,issue:10})).status,'unclaimed');
});

test('missing resource cannot be treated as valid write ownership',async()=>{
 const api=mock(),a=newSession();
 await claim(options(api,a,10));
 api.files.delete(resource('render'));
 assert.equal((await status({api,config,repo,issue:10})).status,'inconsistent');
 await assert.rejects(()=>handoff({api,config,repo,issue:10,session:a,summary:'Unsafe'}),/Resource lock invalid/);
 await assert.rejects(()=>release({api,config,repo,issue:10,session:a,confirm:true}),/Save an owner handoff/);
 assert.ok(api.files.has(taskKey(repo,10))); // never silently releases issue
});

test('partial release failure is reported and never frees the resource',async()=>{
 const api=mock(),a=newSession();
 await claim(options(api,a,10));
 await handoff({api,config,repo,issue:10,session:a,summary:'Evidence committed.'});
 api.failResourceRelease();
 await assert.rejects(()=>release({api,config,repo,issue:10,session:a,confirm:true}),/resource remains locked/);
 assert.ok(api.files.has(resource('render')));
 assert.equal((await claim(options(api,newSession(),11))).result,'busy');
});

test('unknown claim result is fail-closed, keeping the resource for recovery',async()=>{
 const api=mock(),a=newSession();
 api.failIssueWith(new Error('Network disconnected during issue claim'));
 await assert.rejects(()=>claim(options(api,a,10)),/outcome uncertain/);
 assert.ok(api.files.has(resource('render')));
 assert.equal((await claim(options(api,newSession(),11))).result,'busy');
});

test('discovery does not advertise an orphan-locked write resource as free',async()=>{
 const api=mock(),owner=newSession();
 await api.createClaim('ledger',resource('render'),'branch',{kind:'write-resource',
   target_repository:repo,resource_scope_id:'render',resource_roots:['src/render/'],
   issue_number:10,session_id:owner});
 const rows=await discover({api,config,tasks});
 assert.equal(rows.find(x=>x.issue===10).availability,'resource-busy');
 assert.equal(rows.find(x=>x.issue===11).availability,'resource-busy');
 assert.equal(rows.find(x=>x.issue===12).availability,'unclaimed');
});


test('release refuses a missing resource even after a valid handoff was saved',async()=>{
 const api=mock(),session=newSession();
 await claim(options(api,session,10));
 await handoff({api,config,repo,issue:10,session,
   summary:'Handoff saved while resource ownership was valid.'});
 api.files.delete(resource('render'));
 await assert.rejects(()=>release({api,config,repo,issue:10,session,confirm:true}),
   /Resource lock invalid/);
 assert.ok(api.files.has(taskKey(repo,10)));
 assert.equal((await status({api,config,repo,issue:10})).status,'inconsistent');
});
