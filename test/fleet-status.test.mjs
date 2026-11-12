import test from 'node:test';
import assert from 'node:assert/strict';
import {auditFleet} from '../src/fleet-status.mjs';
import {taskKey,submissionKey} from '../src/claims.mjs';
import {resourceKey} from '../src/resources.mjs';
import {GitHubError} from '../src/github.mjs';

const r='Cesare-ml/astrological-charts';
const e='Cesare-ml/VirgoStars-Ephemeris';
const ledger='Cesare-ml/virgostars-development-orchestrator';
const config={
 claim_store:{repo:ledger,branch:'coordination/claims'},
 active_repositories:[{full_name:r,pilot_enabled:true},{full_name:e,pilot_enabled:true}]
};
const tasks=[
 {repository:r,issue:23,status:'ready',role:'reviewer',access:'read',title:'Charts review'},
 {repository:e,issue:85,status:'ready',role:'reviewer',access:'read',title:'Ephemeris review'},
 {repository:r,issue:24,status:'ready',role:'developer',access:'write',
  resource_scope:{id:'renderer',roots:['src/renderer/']},title:'Renderer fix'}
];
const session='chat-11c4ba9c-36b2-47e9-96f4-d75d9e6165d1';
const date='2026-11-12T13:14:00Z';
function reviewMarker(repo,issue,format='handoff',owner=session) {
 return {schema_version:1,state:'submitted',target_repository:repo,issue_number:issue,
  session_id:owner,role:'reviewer',access:'read',submitted_at:date,
  [format]:{at:date,summary:'Reviewed source. https://github.com/'+repo+'/issues/'+issue+
    '#issuecomment-123456789'}};
}
function issueClaim(repo,issue,role='reviewer',access='read') {
 return {schema_version:2,state:'claimed',target_repository:repo,issue_number:issue,
  role,access,session_id:session,resource_scope_id:access==='write'?'renderer':null,
  resource_roots:access==='write'?['src/renderer/']:null,last_handoff:null};
}
function fixture(entries=[],states=new Map()) {
 const api={
  reads:0,writes:0,
  async getLedgerSnapshot(){this.reads++;return {head:'a'.repeat(40),entries};},
  async getIssue(repo,issue){return {state:states.get(repo+'#'+issue)||'open'};},
  async createClaim(){this.writes++;throw new Error('unexpected write');}
 };
 return {api,run:()=>auditFleet({api,config,tasks})};
}
function entry(path,data){return {path,sha:'b'.repeat(40),data};}

test('five-agent summary handles CLI handoff and ChatGPT last_handoff',async()=>{
 const items=[
  entry(submissionKey(r,23),reviewMarker(r,23,'last_handoff')),
  entry(submissionKey(e,85),reviewMarker(e,85,'handoff'))
 ];
 const {api,run}=fixture(items);
 const output=await run();
 assert.equal(output.summary.total,3);
 assert.equal(output.summary.submitted,2);
 assert.equal(output.summary.available,1);
 assert.equal(output.tasks[0].status,'submitted');
 assert.ok(output.tasks[0].evidence_url.includes('#issuecomment-'));
 assert.equal(output.tasks[1].status,'submitted');
 assert.equal(output.tasks[2].status,'available');
 assert.equal(output.alerts.length,0);
 assert.equal(api.writes,0);
 assert.equal(output.ledger_commit,'a'.repeat(40));
});

test('submission and claim both present mean release pending, not available',async()=>{
 const items=[
  entry(submissionKey(r,23),reviewMarker(r,23)),
  entry(taskKey(r,23),issueClaim(r,23))
 ];
 const output=await fixture(items).run();
 assert.equal(output.tasks[0].status,'submitted-pending-release');
 assert.equal(output.tasks[0].review,'pending');
 assert.equal(output.alerts.length,1);
});

test('mismatched owners or missing handoff are inconsistent',async()=>{
 const marker=reviewMarker(r,23,'handoff','chat-other');
 const claim=issueClaim(r,23);
 const wrong=await fixture([
  entry(submissionKey(r,23),marker),entry(taskKey(r,23),claim)
 ]).run();
 assert.equal(wrong.tasks[0].status,'inconsistent');
 const noHandoff=reviewMarker(r,23);
 delete noHandoff.handoff;
 const bad=await fixture([entry(submissionKey(r,23),noHandoff)]).run();
 assert.equal(bad.tasks[0].status,'inconsistent');
});

test('orphan resource is blocked and flagged for owner recovery',async()=>{
 const resource={kind:'write-resource',target_repository:r,issue_number:24,
  resource_scope_id:'renderer',resource_roots:['src/renderer/'],session_id:session};
 const state=await fixture([
  entry(resourceKey(r,'renderer'),resource)
 ]).run();
 assert.equal(state.tasks[2].status,'resource-busy');
 assert.ok(state.alerts.some(a=>a.reason.includes('Orphan')));
});

test('write claim and resource have to match the same owner/scope',async()=>{
 const resource={kind:'write-resource',target_repository:r,issue_number:24,
  resource_scope_id:'renderer',resource_roots:['src/renderer/'],session_id:'other'};
 const state=await fixture([
  entry(taskKey(r,24),issueClaim(r,24,'developer','write')),
  entry(resourceKey(r,'renderer'),resource)
 ]).run();
 assert.equal(state.tasks[2].status,'inconsistent');
});

test('closed issues and untracked locks are visible; they are not approved',async()=>{
 const state=await fixture([
  entry('claims/Unknown__repo/issue-99.json',{target_repository:'Unknown/repo',issue_number:99,session_id:'chat-id'})
 ],new Map([[e+'#85','closed']])).run();
 assert.equal(state.tasks[1].status,'closed');
 assert.ok(state.untracked.includes('claims/Unknown__repo/issue-99.json'));
 assert.ok(state.note.includes('not approved'));
});

test('missing permissions and truncated snapshot fail closed',async()=>{
 const f=fixture();
 f.api.getIssue=async()=>{throw new GitHubError(403)};
 await assert.rejects(f.run(),GitHubError);
 const g=fixture();
 g.api.getLedgerSnapshot=async()=>({head:'missing',entries:[]});
 await assert.rejects(g.run(),/Malformed ledger/);
});

test('duplicate paths in ledger cannot be counted as authoritative',async()=>{
 const x=entry(submissionKey(r,23),reviewMarker(r,23));
 const state=fixture([x,x]);
 await assert.rejects(state.run(),/Duplicate/);
});
