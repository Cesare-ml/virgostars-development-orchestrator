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


test('unaudited developer submission is explicitly flagged for independent PR scope review',async()=>{
 const developer={schema_version:1,state:'submitted',target_repository:r,issue_number:24,
   session_id:session,role:'developer',access:'write',
   last_handoff:{at:date,summary:'Draft PR pending scope validation.'}};
 const result=await fixture([entry(submissionKey(r,24),developer)]).run();
 assert.equal(result.tasks[2].status,'needs-scope-audit');
 assert.ok(result.alerts.some(a=>a.reason.includes('no usable PR number')));
 assert.ok(result.tasks[2].review_gates.blockers.includes('DELIVERY_PR_NOT_RECORDED'));
});


test('fleet monitor reports live stale developer PR without altering submitted ledger',async()=>{
 const task={repository:r,issue:24,status:'ready',role:'developer',access:'write',
   title:'Canvas smoke',pilot_wave:2,upstream_pr:22,upstream_branch:'feat/interactions',
   resource_scope:{id:'renderer',roots:['tests/pilot.test.mjs']}};
 const submitted={schema_version:1,state:'submitted',target_repository:r,issue_number:24,
   role:'developer',access:'write',session_id:session,pull_request:26,
   scope_verdict:'scope-clean',audited_head_sha:'a'.repeat(40),
   audited_base_sha:'b'.repeat(40),
   last_handoff:{head_sha:'a'.repeat(40),summary:'Published stacked draft PR and tests'}};
 const api={
   async getLedgerSnapshot(){return {head:'f'.repeat(40),
     entries:[entry(submissionKey(r,24),submitted)]};},
   async getIssue(){return {state:'open'};},
   async getPullRequest(_repo,n){return n===22?
     {state:'open',head:{ref:'feat/interactions',sha:'b'.repeat(40)}}:
     {number:26,state:'open',draft:true,changed_files:1,
       head:{ref:'pilot/axis',sha:'c'.repeat(40),repo:{full_name:r}},
       base:{ref:'feat/interactions',sha:'b'.repeat(40),repo:{full_name:r}}};},
   async getPullRequestFiles(){return [{filename:'tests/pilot.test.mjs',status:'added'}];},
   async getOpenPullRequests(){return [
     {number:22,state:'open',head:{sha:'b'.repeat(40)},
       base:{sha:'d'.repeat(40),ref:'main'}},
     {number:26,state:'open',draft:true,changed_files:1,
       head:{sha:'c'.repeat(40)},
       base:{sha:'b'.repeat(40),ref:'feat/interactions'}}
   ];}
 };
 const result=await auditFleet({api,config,tasks:[task]});
 assert.equal(result.summary['stale-submission'],1);
 assert.equal(result.tasks[0].pr_check.current_head,'c'.repeat(40));
 assert.equal(result.tasks[0].review,'pending');
 assert.ok(result.alerts.some(a=>a.reason.includes('HEAD changed')));
});
test('a stale PR warning remains visible when submission has not released its owner claim',async()=>{
 const task={repository:r,issue:24,status:'ready',role:'developer',access:'write',
   title:'Canvas smoke',pilot_wave:2,upstream_pr:22,upstream_branch:'feat/interactions',
   resource_scope:{id:'renderer',roots:['tests/pilot.test.mjs']}};
 const c={...issueClaim(r,24,'developer','write'),resource_roots:['tests/pilot.test.mjs']};
 const resource={kind:'write-resource',target_repository:r,resource_scope_id:'renderer',
   resource_roots:['tests/pilot.test.mjs'],issue_number:24,session_id:session};
 const s={state:'submitted',target_repository:r,issue_number:24,role:'developer',access:'write',
   session_id:session,pull_request:26,scope_verdict:'scope-clean',
   audited_head_sha:'a'.repeat(40),audited_base_sha:'b'.repeat(40),
   last_handoff:{head_sha:'a'.repeat(40),summary:'Draft PR submitted'}};
 const api={
   async getLedgerSnapshot(){return {head:'f'.repeat(40),entries:[
     entry(submissionKey(r,24),s),entry(taskKey(r,24),c),
     entry(resourceKey(r,'renderer'),resource)
   ]};},
   async getIssue(){return {state:'open'};},
   async getPullRequest(_r,n){return n===22?
     {state:'open',head:{ref:'feat/interactions',sha:'b'.repeat(40)}}:
     {number:26,state:'open',draft:true,changed_files:1,
       head:{ref:'pilot/axis',sha:'c'.repeat(40),repo:{full_name:r}},
       base:{ref:'feat/interactions',sha:'b'.repeat(40),repo:{full_name:r}}};},
   async getPullRequestFiles(){return [{filename:'tests/pilot.test.mjs',status:'added'}];},
   async getOpenPullRequests(){return [
     {number:22,state:'open',head:{sha:'b'.repeat(40)},
       base:{sha:'d'.repeat(40),ref:'main'}},
     {number:26,state:'open',draft:true,changed_files:1,
       head:{sha:'c'.repeat(40)},
       base:{sha:'b'.repeat(40),ref:'feat/interactions'}}
   ];}
 };
 const result=await auditFleet({api,config,tasks:[task]});
 assert.equal(result.tasks[0].status,'stale-submission');
 assert.match(result.tasks[0].warning,/finish releasing claim/);
 assert.match(result.tasks[0].warning,/HEAD changed/);
});


test('live competing PRs are visible together with manual scope review blockers',async()=>{
 const task={repository:r,issue:24,status:'ready',role:'developer',access:'write',
   title:'Canvas focus smoke',pilot_wave:2,upstream_pr:22,upstream_branch:'feat/interactions',
   resource_scope:{id:'renderer',roots:['tests/pilot.test.mjs']}};
 const h='a'.repeat(40),base='b'.repeat(40);
 const marker={state:'submitted',target_repository:r,issue_number:24,
   role:'developer',access:'write',session_id:session,pull_request:26,
   scope_verdict:'manual-reviewed',audited_head_sha:h,audited_base_sha:base,
   last_handoff:{head_sha:h,summary:'Draft #26 manual-reviewed, tests not run'}};
 const upstream={number:22,state:'open',draft:true,changed_files:10,
   head:{sha:base,ref:'feat/interactions',repo:{full_name:r}},
   base:{sha:'d'.repeat(40),ref:'main',repo:{full_name:r}}};
 const draft=n=>({number:n,state:'open',draft:true,changed_files:1,
   head:{sha:n===26?h:'c'.repeat(40),ref:'agent/test-'+n,repo:{full_name:r}},
   base:{sha:base,ref:'feat/interactions',repo:{full_name:r}}});
 const candidates=[upstream,draft(26),draft(27)];
 let writes=0;
 const api={
   async getLedgerSnapshot(){return {head:'f'.repeat(40),
     entries:[entry(submissionKey(r,24),marker)]};},
   async getIssue(){return {state:'open'};},
   async getOpenPullRequests(){return candidates;},
   async getPullRequest(_repo,n){return candidates.find(p=>p.number===n);},
   async getPullRequestFiles(){return [{filename:'tests/pilot.test.mjs',status:'added'}];},
   async createClaim(){writes++;throw new Error('read-only monitor wrote a claim');}
 };
 const result=await auditFleet({api,config,tasks:[task]});
 assert.equal(result.tasks[0].status,'needs-scope-audit');
 assert.equal(result.tasks[0].collision_check.status,'conflict');
 assert.deepEqual(result.tasks[0].collision_check.candidates.map(x=>x.number),[26,27]);
 assert.equal(result.tasks[0].review_gates.integration_ready,false);
 assert.ok(result.tasks[0].review_gates.blockers.includes('OVERLAPPING_OPEN_PULL_REQUESTS'));
 assert.ok(result.tasks[0].review_gates.blockers.includes('INDEPENDENT_NATIVE_TESTS_NOT_VERIFIED'));
 assert.ok(result.alerts.some(a=>a.reason.includes('Competing open pull requests')));
 assert.equal(writes,0);
});

test('permission denied to enumerate competing PRs fails entire monitor closed',async()=>{
 const task={repository:r,issue:24,status:'ready',role:'developer',access:'write',
   title:'Canvas smoke',pilot_wave:2,upstream_pr:22,upstream_branch:'feat/interactions',
   resource_scope:{id:'renderer',roots:['tests/pilot.test.mjs']}};
 const h='a'.repeat(40),base='b'.repeat(40);
 const marker={state:'submitted',target_repository:r,issue_number:24,
   role:'developer',access:'write',session_id:session,pull_request:26,
   scope_verdict:'scope-clean',audited_head_sha:h,audited_base_sha:base,
   last_handoff:{head_sha:h,summary:'Submitted'}};
 const api={
   async getLedgerSnapshot(){return {head:'f'.repeat(40),
     entries:[entry(submissionKey(r,24),marker)]};},
   async getIssue(){return {state:'open'};},
   async getPullRequest(_r,n){return n===22?
     {state:'open',head:{ref:'feat/interactions',sha:base}}:
     {number:26,state:'open',draft:true,changed_files:1,
       head:{ref:'agent/test',sha:h,repo:{full_name:r}},
       base:{ref:'feat/interactions',sha:base,repo:{full_name:r}}};},
   async getPullRequestFiles(){return [{filename:'tests/pilot.test.mjs',status:'added'}];},
   async getOpenPullRequests(){throw new GitHubError(403);}
 };
 await assert.rejects(()=>auditFleet({api,config,tasks:[task]}),GitHubError);
});
