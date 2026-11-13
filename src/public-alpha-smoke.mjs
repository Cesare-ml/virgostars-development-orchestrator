// Strict, aggregate-only validation for the two existing *tokenless* CLI demos.
// It deliberately cannot validate live private GitHub coordination or authorize writes.
const fail = code => { throw new Error(`Public alpha smoke blocked: ${code}`); };
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const eq = (object, key, value, code) => {
  if (object[key] !== value) fail(code);
};

export function validatePublicAlphaSmoke(discovery, rehearsal) {
  if (!record(discovery)) fail('discovery-shape');
  eq(discovery, 'schema_version', '1-public-discovery', 'discovery-version');
  eq(discovery, 'mode', 'read-only', 'discovery-mode');
  eq(discovery, 'repository_visibility', 'public', 'discovery-visibility');
  eq(discovery, 'owner_approval_required', true, 'discovery-owner-approval');
  eq(discovery, 'write_claims_enabled', false, 'discovery-claims');
  eq(discovery, 'automatic_merge', false, 'discovery-merge');
  eq(discovery, 'automatic_deploy', false, 'discovery-deploy');
  eq(discovery, 'contribution_method', 'fork_pr_only_after_owner_approval', 'discovery-contribution');
  if (!Array.isArray(discovery.repositories) || discovery.repositories.length < 1 ||
      discovery.repositories.length > 25 ||
      discovery.repositories.some(repo => !record(repo) ||
        typeof repo.full_name !== 'string' ||
        repo.contribution_status !== 'pending_owner_approval')) {
    fail('discovery-repositories');
  }

  if (!record(rehearsal)) fail('rehearsal-shape');
  const expected = {
    schema_version: '1-offline-two-agent-rehearsal',
    mode: 'synthetic-in-memory-only',
    github_requests: 0,
    real_pull_requests_created: 0,
    code_changes_performed: 0,
    live_tests_executed: 0,
    agents_started_in_parallel: 2,
    independently_claimed_tasks: 2,
    exclusive_issue_and_resource_locks_verified: true,
    third_agent_denied: true,
    competing_pr_submission_blocked: true,
    original_owner_retained_on_conflict: true,
    competing_pr_recovery_submitted: true,
    interrupted_release_blocked: true,
    original_owner_retry_succeeded: true,
    submitted_markers: 2,
    remaining_issue_claims: 0,
    remaining_resource_locks: 0,
    submitted_tasks_reoffered: false,
    real_private_ledger_verified: false,
    real_multi_agent_pilot_proven: false,
    result: 'synthetic-rehearsal-pass'
  };
  for (const [key, value] of Object.entries(expected)) {
    eq(rehearsal, key, value, 'rehearsal-' + key.replaceAll('_', '-'));
  }
  return {
    schema_version: '1-public-alpha-smoke',
    result: 'offline-demo-pass',
    public_discovery_verified: true,
    synthetic_two_agent_flow_verified: true,
    public_preview_count: discovery.repositories.length,
    synthetic_agents: 2,
    live_github_requests: 0,
    private_ledger_verified: false,
    real_multi_agent_pilot_proven: false,
    write_claims_enabled: false,
    merge_authorized: false,
    deploy_authorized: false
  };
}
