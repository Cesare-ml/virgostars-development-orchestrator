import test from 'node:test';
import assert from 'node:assert/strict';
import { claimNext } from '../src/queue.mjs';
import { status, handoff, release, newSession } from '../src/claims.mjs';
import { GitHubError } from '../src/github.mjs';

const repo='Cesare-ml/astrological-charts';
const secondRepo='Cesare-ml/VirgoStars-Ephemeris';
const config={active_repositories:[{full_name:repo,pilot_enabled:true},{full_name:secondRepo,pilot_enabled:true}],
 claim_store:{repo:'Cesare-ml/virgostars-development-orchestrator',branch:'coordination/claims'}};
const tasks=[{repository:repo,issue:12,role:'reviewer',access:'read',status:'ready'},
 {repository:repo,issue:13,role:'reviewer',access:'read',status:'ready'},
 {repository:secondRepo,issue:14,role:'developer',access:'write',resource_scope:{id:'core',roots:['src/core/']},status:'ready'}];
function fake({closed=[]}={}) {
  const files=new Map(); let rev=0;
  return {
    async getIssue(_r,issue){return {state:closed.includes(issue)?'closed':'open'};},
    async getClaim(_r,path){return files.get(path)||null;},
    async createClaim(_r,path,_branch,data){if(files.has(path))throw new GitHubError(422);files.set(path,{sha:String(++rev),data:structuredClone(data)});},
    async updateClaim(_r,path,_branch,sha,data){if(files.get(path)?.sha!==sha)throw new GitHubError(409);files.set(path,{sha:String(++rev),data:structuredClone(data)});},
    async deleteClaim(_r,path,_branch,sha){if(files.get(path)?.sha!==sha)throw new GitHubError(409);files.delete(path);}
  };
}
const a=(api,session,role='reviewer')=>({api,config,tasks,session,role});

test('concurrent claim-next finds different tasks; no duplicate ownership',async()=>{
 const api=fake(),s1=newSession(),s2=newSession();
 const [x,y]=await Promise.all([claimNext(a(api,s1)),claimNext(a(api,s2))]);
 assert.equal(x.result,'acquired');assert.equal(y.result,'acquired');
 assert.notEqual(x.claim.issue_number,y.claim.issue_number);
});
test('same session resumes before taking another available task',async()=>{
 const api=fake(),session=newSession();
 const first=await claimNext(a(api,session));
 const again=await claimNext(a(api,session));
 assert.equal(again.result,'already-owned');
 assert.equal(again.claim.issue_number,first.claim.issue_number);
});
test('role/repo filtering, closed skip and exhaustion are explicit',async()=>{
 const api=fake({closed:[12]});
 const x=await claimNext({...a(api,newSession()),repository:repo});
 assert.equal(x.claim.issue_number,13);
 const y=await claimNext({...a(api,newSession()),repository:repo});
 assert.equal(y.result,'no-task');assert.equal(y.contended,1);assert.equal(y.closed,1);
 const dev=await claimNext(a(api,newSession(),'developer'));
 assert.equal(dev.claim.issue_number,14);
});
test('invalid role, unknown repo, and missing permissions fail closed',async()=>{
 const api=fake(),session=newSession();
 await assert.rejects(()=>claimNext(a(api,session,'not-a-role')),/valid role/);
 await assert.rejects(()=>claimNext({...a(api,session),repository:'unknown/repo'}),/not enabled/);
 api.getIssue=async()=>{throw new GitHubError(403);};
 await assert.rejects(()=>claimNext(a(api,session)),GitHubError);
});
test('release requires owner handoff and cannot lose unfinished work',async()=>{
 const api=fake(),session=newSession();
 const first=await claimNext(a(api,session));
 const common={api,config,repo:first.claim.target_repository,issue:first.claim.issue_number,session};
 await assert.rejects(()=>release({...common,confirm:true}),/Save an owner handoff/);
 await handoff({...common,summary:'Reviewed actual code and left notes.'});
 assert.equal((await release({...common,confirm:true})).result,'released');
 assert.equal((await status(common)).status,'unclaimed');
});
test('non-ready ownership is resumed but not otherwise offered',async()=>{
 const api=fake(),session=newSession();
 await claimNext(a(api,session));
 const changed=tasks.map(t=>({...t,status:t.issue===12?'blocked':t.status}));
 const same=await claimNext({...a(api,session),tasks:changed});
 assert.equal(same.result,'already-owned');
 const other=await claimNext({...a(api,newSession()),tasks:changed});
 assert.equal(other.claim.issue_number,13);
});


test('a resumed write task is blocked if curated partition changes',async()=>{
 const api=fake(),session=newSession();
 const original=[{repository:repo,issue:77,role:'developer',access:'write',
  resource_scope:{id:'renderer',roots:['src/render/']},status:'ready'}];
 const first=await claimNext({api,config,tasks:original,session,role:'developer'});
 assert.equal(first.result,'acquired');
 const changed=[{...original[0],resource_scope:{id:'other',roots:['src/other/']}}];
 await assert.rejects(()=>claimNext({api,config,tasks:changed,session,role:'developer'}),/resource scope changed/);
});
