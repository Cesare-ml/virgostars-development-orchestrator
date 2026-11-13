import test from 'node:test';
import assert from 'node:assert/strict';
import {auditFleet,inspectActiveSessionOwnership} from '../src/fleet-status.mjs';
import {taskKey,submissionKey} from '../src/claims.mjs';

const R='example-synthetic/active-session-audit';
const LEDGER='example-synthetic/private-ledger';
const ONE='chat-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TWO='codex-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tasks=[101,102].map(issue=>({
  repository:R,issue,title:'Synthetic review',role:'reviewer',access:'read',status:'ready'
}));
const config={claim_store:{repo:LEDGER,branch:'coordination/claims'},
  active_repositories:[{full_name:R,pilot_enabled:true}]};
const item=(path,data)=>({path,sha:'a'.repeat(40),data});
const owned=(issue,session)=>item(taskKey(R,issue),{
  schema_version:2,state:'claimed',target_repository:R,issue_number:issue,
  session_id:session,role:'reviewer',access:'read'
});
const submitted=(issue,session)=>item(submissionKey(R,issue),{
  schema_version:1,state:'submitted',target_repository:R,issue_number:issue,
  session_id:session,role:'reviewer',access:'read',
  last_handoff:{summary:'Documented synthetic review evidence'}
});
const fixture=entries=>{
  let writes=0;
  const api={
    async getLedgerSnapshot(){return {head:'b'.repeat(40),entries};},
    async getIssue(){return {state:'open'};},
    async createClaim(){writes++;throw new Error('read-only audit attempted a write');},
    async deleteClaim(){writes++;throw new Error('read-only audit attempted a delete');}
  };
  return {run:()=>auditFleet({api,config,tasks}),writes:()=>writes};
};

test('two active claims with the SAME case-insensitive session require reconciliation',async()=>{
  const f=fixture([owned(101,ONE),owned(102,ONE.toUpperCase())]);
  const result=await f.run();
  assert.deepEqual(result.session_integrity,{
    active_claim_records:2,active_sessions:1,duplicate_active_sessions:1,
    affected_active_claims:2,malformed_active_claim_sessions:0,
    manual_reconciliation_required:true,authorizes_new_assignments:false
  });
  assert.equal(result.summary.claimed,2);
  assert.equal(result.tasks.every(t=>t.warning?.includes('DUPLICATE_ACTIVE_SESSION_CLAIMS')),true);
  assert.ok(result.alerts.some(a=>a.reason.includes('DUPLICATE_ACTIVE_SESSION_CLAIMS')));
  assert.equal(f.writes(),0);
});

test('two DISTINCT active sessions are not reported as duplicate ownership',async()=>{
  const result=await fixture([owned(101,ONE),owned(102,TWO)]).run();
  assert.equal(result.session_integrity.active_sessions,2);
  assert.equal(result.session_integrity.duplicate_active_sessions,0);
  assert.equal(result.session_integrity.manual_reconciliation_required,false);
  assert.equal(result.session_integrity.authorizes_new_assignments,false);
});

test('completed submission marker alone does not create an active session',async()=>{
  const result=await fixture([owned(101,ONE),submitted(102,ONE)]).run();
  assert.equal(result.session_integrity.active_claim_records,1);
  assert.equal(result.session_integrity.active_sessions,1);
  assert.equal(result.session_integrity.duplicate_active_sessions,0);
  assert.equal(result.tasks[1].status,'submitted');
});

test('submission awaiting release STILL counts as active physical claim',async()=>{
  const result=await fixture([
    owned(101,ONE),submitted(101,ONE),owned(102,ONE)
  ]).run();
  assert.equal(result.session_integrity.duplicate_active_sessions,1);
  assert.equal(result.tasks[0].status,'submitted-pending-release');
  assert.match(result.tasks[0].warning,/DUPLICATE_ACTIVE_SESSION_CLAIMS/);
});

test('untracked live claim participates in the session-wide duplicate audit',async()=>{
  const path=taskKey(R,999);
  const result=await fixture([
    owned(101,ONE),item(path,{target_repository:R,issue_number:999,
      state:'in_progress',access:'read',role:'reviewer',session_id:ONE})
  ]).run();
  assert.equal(result.session_integrity.duplicate_active_sessions,1);
  assert.equal(result.session_integrity.affected_active_claims,2);
  assert.ok(result.untracked.includes(path));
  assert.equal(result.tasks[0].warning.includes('DUPLICATE_ACTIVE_SESSION_CLAIMS'),true);
});

test('malformed session metadata creates a review blocker without auto-release',async()=>{
  const result=await fixture([owned(101,'chat-not-a-valid-uuid')]).run();
  assert.equal(result.session_integrity.malformed_active_claim_sessions,1);
  assert.equal(result.session_integrity.active_claim_records,1);
  assert.equal(result.session_integrity.manual_reconciliation_required,true);
  assert.match(result.tasks[0].warning,/MALFORMED_ACTIVE_SESSION/);
  assert.equal(result.tasks[1].status,'available');
});

test('pure session auditor emits aggregate counts, not sensitive owners or paths',()=>{
  const result=inspectActiveSessionOwnership([
    owned(101,ONE),owned(102,ONE),
    submitted(101,ONE)
  ]);
  assert.equal(result.summary.duplicate_active_sessions,1);
  assert.doesNotMatch(JSON.stringify(result.summary),/chat-|claims\/|example-synthetic/i);
  assert.equal(result.duplicatePaths.size,2);
  assert.equal(result.invalidPaths.size,0);
});
