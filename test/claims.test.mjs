import test from 'node:test';
import assert from 'node:assert/strict';
import { newSession, claim, release, status, taskKey } from '../src/claims.mjs';
import { GitHubError } from '../src/github.mjs';

const target='Cesare-ml/astrological-charts';
const config={active_repositories:[{full_name:target,pilot_enabled:true}],claim_store:{repo:'Cesare-ml/virgostars-development-orchestrator',branch:'coordination/claims'}};
const tasks=[{repository:target,issue:42,status:'ready',role:'reviewer'}];
function mock() {
 const claims=new Map();
 return {
  async getIssue(){return {state:'open'};},
  async getClaim(_r,path){return claims.get(path)||null;},
  async createClaim(_r,path,_b,data){
   if(claims.has(path)) throw new GitHubError(422);
   claims.set(path,{sha:'sha-'+claims.size,data});
  },
  async deleteClaim(_r,path,_b,sha){
   if(claims.get(path)?.sha!==sha) throw new GitHubError(409);
   claims.delete(path);
  }
 };
}
test('concurrent claim and release',async()=>{
 const api=mock(),a=newSession('chat'),b=newSession('codex');
 const args={api,config,tasks,repo:target,issue:42,role:'reviewer'};
 const both=await Promise.all([claim({...args,session:a}),claim({...args,session:b})]);
 assert.deepEqual(both.map(x=>x.result).sort(),['acquired','busy']);
 assert.equal((await status(args)).claim.session_id,a);
 await assert.rejects(()=>release({...args,session:b,confirm:true}),/Not the current owner/);
 await release({...args,session:a,confirm:true});
 assert.equal((await claim({...args,session:b})).result,'acquired');
});
test('task key is deterministic',()=>{
 assert.equal(taskKey(target,42),'claims/Cesare-ml__astrological-charts/issue-42.json');
});
