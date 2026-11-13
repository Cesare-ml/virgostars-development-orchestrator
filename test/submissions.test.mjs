import test from 'node:test';
import assert from 'node:assert/strict';
import {claim, handoff, status, discover, newSession, submissionKey} from '../src/claims.mjs';
import {claimNext} from '../src/queue.mjs';
import {submit} from '../src/submissions.mjs';
import {GitHubError} from '../src/github.mjs';

const repo='Cesare-ml/astrological-charts';
const config={active_repositories:[{full_name:repo,pilot_enabled:true}],
 claim_store:{repo:'Cesare-ml/virgostars-development-orchestrator',branch:'coordination/claims'}};
const tasks=[{repository:repo,issue:23,role:'reviewer',status:'ready',access:'read',
 title:'Review chart interactions'}, {repository:repo,issue:24,role:'reviewer',
 status:'ready',access:'read',title:'Another review'}];

function fake(){
 const files=new Map();let sequence=0,failOn=null,submissionRace=null;
 return {files,
  failDeleteOnce(){failOn='delete';},
  failSubmissionCreateOnce(){failOn='submission';},
  raceSubmissionCreateWith(transform){submissionRace=transform;},
  async getIssue(){return {state:'open'};},
  async getClaim(_r,path){return files.has(path)?structuredClone(files.get(path)):null;},
  async createClaim(_r,path,_b,data){
   if(failOn==='submission' && path.startsWith('submissions/')){
     failOn=null;throw new Error('network disconnected');
   }
   if(submissionRace && path.startsWith('submissions/')) {
     const transform=submissionRace;submissionRace=null;
     files.set(path,{sha:String(++sequence),data:transform(structuredClone(data))});
     throw new GitHubError(422);
   }
   if(files.has(path))throw new GitHubError(422);
   files.set(path,{sha:String(++sequence),data:structuredClone(data)});
  },
  async updateClaim(_r,path,_b,sha,data){
   if(files.get(path)?.sha!==sha)throw new GitHubError(409);
   files.set(path,{sha:String(++sequence),data:structuredClone(data)});
  },
  async deleteClaim(_r,path,_b,sha){
   if(failOn==='delete'){failOn=null;throw new GitHubError(409);}
   if(files.get(path)?.sha!==sha)throw new GitHubError(409);
   files.delete(path);
  }
 };
}
const common=(api,session,issue=23)=>({api,config,repo,issue,session});
async function ready(api,session,issue=23){
 await claim({...common(api,session,issue),tasks,role:'reviewer'});
 await handoff({...common(api,session,issue),summary:'Documented code review on GitHub issue.'});
}

test('submission blocks reassignment without pretending human approval',async()=>{
 const api=fake(),session=newSession();
 await ready(api,session);
 const x=await submit({...common(api,session),confirm:true});
 assert.deepEqual(x,{result:'submitted',task:repo+'#23',review_required:true});
 const after=await status(common(api,session));
 assert.equal(after.status,'submitted');
 assert.equal(after.submission.state,'submitted');
 assert.equal(after.submission.last_handoff.summary,'Documented code review on GitHub issue.');
 const catalog=await discover({api,config,tasks});
 assert.equal(catalog[0].availability,'submitted');
 assert.equal(catalog[1].availability,'unclaimed');
 const newOwner=newSession();
 assert.equal((await claim({...common(api,newOwner),tasks,role:'reviewer'})).result,'submitted');
 const next=await claimNext({api,config,tasks,session:newOwner,role:'reviewer'});
 assert.equal(next.claim.issue_number,24);
});

test('no task remains when only curated task is submitted',async()=>{
 const api=fake(),session=newSession();
 await ready(api,session);
 await submit({...common(api,session),confirm:true});
 const next=await claimNext({api,config,tasks:tasks.slice(0,1),session:newSession(),role:'reviewer'});
 assert.equal(next.result,'no-task');
 assert.equal(next.submitted,1);
});

test('only owner with handoff and explicit confirmation may submit',async()=>{
 const api=fake(),session=newSession(),other=newSession();
 await claim({...common(api,session),tasks,role:'reviewer'});
 await assert.rejects(()=>submit({...common(api,session),confirm:true}),/Save a factual handoff/);
 await handoff({...common(api,session),summary:'PR review evidence published.'});
 await assert.rejects(()=>submit({...common(api,other),confirm:true}),/Only the current task owner/);
 await assert.rejects(()=>submit({...common(api,session)}),/Use --confirm/);
 assert.equal((await status(common(api,session))).status,'claimed');
});

test('retry after release failure finishes without duplicate marker',async()=>{
 const api=fake(),session=newSession();
 await ready(api,session);
 api.failDeleteOnce();
 await assert.rejects(()=>submit({...common(api,session),confirm:true}),/Claim changed concurrently/);
 assert.ok(api.files.has(submissionKey(repo,23)));
 const state=await status(common(api,session));
 assert.equal(state.status,'claimed'); assert.equal(state.submitted,true);
 const retried=await submit({...common(api,session),confirm:true});
 assert.equal(retried.result,'submitted');
 assert.equal((await status(common(api,session))).status,'submitted');
});

test('unknown submission write error leaves issue locked for inspection',async()=>{
 const api=fake(),session=newSession();
 await ready(api,session);
 api.failSubmissionCreateOnce();
 await assert.rejects(()=>submit({...common(api,session),confirm:true}),/Submission outcome unknown/);
 assert.equal((await status(common(api,session))).status,'claimed');
});

test('cannot re-submit a task using another session after completion',async()=>{
 const api=fake(),session=newSession(),other=newSession();
 await ready(api,session);
 await submit({...common(api,session),confirm:true});
 assert.equal((await submit({...common(api,session),confirm:true})).result,'already-submitted');
 await assert.rejects(()=>submit({...common(api,other),confirm:true}),/Foreign or invalid/);
});

test('same-session create collision with different handoff evidence cannot release owner',async()=>{
 const api=fake(),session=newSession();
 await ready(api,session);
 api.raceSubmissionCreateWith(marker=>({
   ...marker,last_handoff:{...marker.last_handoff,summary:'Conflicting concurrent handoff'}
 }));
 await assert.rejects(()=>submit({...common(api,session),confirm:true}),
   /Submission evidence conflict/);
 const observed=await status(common(api,session));
 assert.equal(observed.status,'claimed');
 assert.equal(observed.claim.session_id,session);
 assert.equal(observed.submitted,true);
 assert.ok(api.files.has(submissionKey(repo,23)));
});

test('identical same-session create collision is an idempotent successful submission',async()=>{
 const api=fake(),session=newSession();
 await ready(api,session);
 api.raceSubmissionCreateWith(marker=>marker);
 const result=await submit({...common(api,session),confirm:true});
 assert.equal(result.result,'submitted');
 assert.equal((await status(common(api,session))).status,'submitted');
});

test('changed handoff after interrupted release blocks reuse of stored submission',async()=>{
 const api=fake(),session=newSession();
 await ready(api,session);
 api.failDeleteOnce();
 await assert.rejects(()=>submit({...common(api,session),confirm:true}),
   /Claim changed concurrently/);
 await handoff({...common(api,session),summary:'Different review evidence following interruption.'});
 await assert.rejects(()=>submit({...common(api,session),confirm:true}),
   /Existing submission evidence differs/);
 const observed=await status(common(api,session));
 assert.equal(observed.status,'claimed');
 assert.equal(observed.submitted,true);
});
