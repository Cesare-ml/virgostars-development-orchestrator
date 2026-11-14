// Fail-closed, count-only gate for three offline demonstrations.
// This cannot discover, authenticate, or authorize a real private ledger.
function blocked(code) {
  throw new Error('Owner local readiness blocked: ' + code);
}
function isRecord(value) {
  return value!==null && typeof value==='object' && !Array.isArray(value);
}
function equal(record,key,value,source) {
  if(record[key]!==value) blocked(source+'-'+key.replaceAll('_','-'));
}

export function assessOwnerLocalReadiness(publicSmoke, localProcesses) {
  if(!isRecord(publicSmoke)) blocked('public-smoke-shape');
  for(const [key,value] of Object.entries({
    schema_version:'1-public-alpha-smoke',
    result:'offline-demo-pass',
    public_discovery_verified:true,
    synthetic_two_agent_flow_verified:true,
    live_github_requests:0,
    private_ledger_verified:false,
    real_multi_agent_pilot_proven:false,
    write_claims_enabled:false,
    merge_authorized:false,
    deploy_authorized:false
  })) equal(publicSmoke,key,value,'public');
  if(!Number.isInteger(publicSmoke.public_preview_count) ||
     publicSmoke.public_preview_count<1 ||
     publicSmoke.public_preview_count>25 ||
     publicSmoke.synthetic_agents!==2) blocked('public-aggregate-counts');

  if(!isRecord(localProcesses)) blocked('local-process-shape');
  for(const [key,value] of Object.entries({
    schema_version:'1-local-process-rehearsal',
    mode:'isolated-temporary-filesystem',
    independent_os_processes:2,
    simultaneous_claim_attempts:2,
    exclusive_create_winners:1,
    competing_claims_blocked:1,
    non_owner_release_denied:true,
    original_owner_release_succeeded:true,
    second_agent_reclaim_after_release:true,
    previous_owner_cannot_release_reclaimed_task:true,
    remaining_synthetic_claims:0,
    github_requests:0,
    real_private_ledger_verified:false,
    remote_chat_coordination_proven:false,
    merge_authorized:false,
    deploy_authorized:false,
    result:'local-concurrency-pass'
  })) equal(localProcesses,key,value,'local');

  return {
    schema_version:'1-owner-offline-first-run',
    result:'offline-checks-pass-live-pilot-blocked',
    mode:'offline-synthetic-only',
    checks_passed:3,
    public_repository_previews:publicSmoke.public_preview_count,
    simulated_agent_count:2,
    isolated_os_processes:2,
    live_github_requests:0,
    private_ledger_verified:false,
    historic_submission_migration_verified:false,
    owner_task_queue_approved:false,
    real_chat_sessions_tested:0,
    live_pilot_ready:false,
    merge_authorized:false,
    deploy_authorized:false,
    next_required_steps:[
      'owner-provision-private-ledger',
      'owner-verify-seven-historic-submissions',
      'owner-approve-local-task-catalog',
      'owner-run-private-alpha-doctor',
      'owner-supervise-two-real-chats'
    ]
  };
}
