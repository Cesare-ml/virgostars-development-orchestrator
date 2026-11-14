import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validatePublicAlphaSmoke} from '../src/public-alpha-smoke.mjs';

const discovery = () => ({
  schema_version:'1-public-discovery', mode:'read-only',
  repository_visibility:'public', owner_approval_required:true,
  write_claims_enabled:false, automatic_merge:false, automatic_deploy:false,
  contribution_method:'fork_pr_only_after_owner_approval',
  repositories:[{full_name:'example/public',contribution_status:'pending_owner_approval'}]
});
const rehearsal = () => ({
  schema_version:'1-offline-two-agent-rehearsal', mode:'synthetic-in-memory-only',
  github_requests:0, real_pull_requests_created:0, code_changes_performed:0,
  live_tests_executed:0, agents_started_in_parallel:2, independently_claimed_tasks:2,
  exclusive_issue_and_resource_locks_verified:true, third_agent_denied:true,
  competing_pr_submission_blocked:true, original_owner_retained_on_conflict:true,
  competing_pr_recovery_submitted:true, interrupted_release_blocked:true,
  original_owner_retry_succeeded:true, submitted_markers:2,
  remaining_issue_claims:0, remaining_resource_locks:0, submitted_tasks_reoffered:false,
  real_private_ledger_verified:false, real_multi_agent_pilot_proven:false,
  result:'synthetic-rehearsal-pass'
});

test('validator: accepts the exact offline two-agent and read-only discovery contract', () => {
  const report = validatePublicAlphaSmoke(discovery(), rehearsal());
  assert.equal(report.result,'offline-demo-pass');
  assert.equal(report.public_preview_count,1);
  assert.equal(report.real_multi_agent_pilot_proven,false);
  assert.equal(report.write_claims_enabled,false);
  assert.equal(report.merge_authorized,false);
  assert.equal(JSON.stringify(report).includes('example/public'),false);
});

test('validator: fails closed when public contributions are enabled without approval', () => {
  const report = discovery(); report.owner_approval_required = false;
  assert.throws(() => validatePublicAlphaSmoke(report,rehearsal()),/discovery-owner-approval/);
});

test('validator: fails closed on unexpected or missing discovery catalog', () => {
  assert.throws(() => validatePublicAlphaSmoke({repositories:[]},rehearsal()));
  const report = discovery(); report.repositories[0].contribution_status='approved';
  assert.throws(() => validatePublicAlphaSmoke(report,rehearsal()),/discovery-repositories/);
});

test('validator: blocks incomplete or non-synthetic rehearsal evidence', () => {
  const report = rehearsal(); delete report.remaining_resource_locks;
  assert.throws(() => validatePublicAlphaSmoke(discovery(),report),/rehearsal-remaining-resource-locks/);
  report.remaining_resource_locks=0; report.real_private_ledger_verified=true;
  assert.throws(() => validatePublicAlphaSmoke(discovery(),report),/rehearsal-real-private-ledger-verified/);
});

test('validator: blocks false green if collision or retry was not proven', () => {
  for (const key of ['competing_pr_submission_blocked','original_owner_retry_succeeded',
    'third_agent_denied','submitted_tasks_reoffered']) {
    const report = rehearsal(); report[key]=!report[key];
    assert.throws(() => validatePublicAlphaSmoke(discovery(),report),/Public alpha smoke blocked/);
  }
});

test('CLI: performs both actual public-only commands without credentials', () => {
  const script = fileURLToPath(new URL('../scripts/verify-public-alpha-smoke.mjs',import.meta.url));
  const run = spawnSync(process.execPath,[script],{
    encoding:'utf8',maxBuffer:32*1024,timeout:30_000,windowsHide:true,
    env:{...process.env,GITHUB_TOKEN:'SHOULD_NOT_LEAK',
      VS_PRIVATE_LEDGER_REPO:'example/private-do-not-touch',
      VS_PRIVATE_TASKS_FILE:'/private/never-read'}
  });
  assert.equal(run.status,0,`public smoke failed with code ${run.status}`);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.result,'offline-demo-pass');
  assert.equal(parsed.live_github_requests,0);
  assert.equal(parsed.real_multi_agent_pilot_proven,false);
  assert.equal(run.stdout.includes('SHOULD_NOT_LEAK'),false);
  assert.equal(run.stdout.includes('example/private-do-not-touch'),false);
});
