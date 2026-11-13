import {runOfflineFleetStress} from './offline-fleet-stress.mjs';

// Fixed, public-safe synthetic scenarios. They never read the owner task catalog,
// private coordination ledger, environment credentials or network resources.
export const WAVE_SCENARIOS = Object.freeze([
  [2],
  [10, 10],
  [5, 10, 10, 15],
  [1, 39],
  [39, 1],
  [20, 20],
  [10, 10, 10, 10],
  Array.from({length: 40}, () => 1)
].map(waves => Object.freeze(waves)));

export function expectedEarlierResumes(waves) {
  if (!Array.isArray(waves) || waves.length < 1 || waves.length > 40 ||
      waves.some(size => !Number.isSafeInteger(size) || size < 1)) {
    throw new Error('Invalid synthetic arrival schedule.');
  }
  const agents = waves.reduce((sum, size) => sum + size, 0);
  if (agents < 2 || agents > 40) {
    throw new Error('Synthetic arrival schedule must contain 2..40 agents.');
  }
  let active = 0;
  let resumes = 0;
  for (const size of waves) {
    resumes += active;
    active += size;
  }
  return resumes;
}

// Reject partial, contradictory or unexpectedly unsafe stress reports rather
// than counting a scenario as passed merely because the engine returned.
export function verifyWaveReport(report, waves) {
  const expectedResumes = expectedEarlierResumes(waves);
  const agents = waves.reduce((sum, size) => sum + size, 0);
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Missing synthetic wave report.');
  }
  if (!Array.isArray(report.arrival_batch_sizes) ||
      report.arrival_batch_sizes.length !== waves.length ||
      report.arrival_batch_sizes.some((size, i) => size !== waves[i])) {
    throw new Error('Synthetic arrival schedule mismatch.');
  }

  const required = {
    schema_version: '1-offline-fleet-stress',
    mode: 'synthetic-single-process-only',
    verdict: 'synthetic-stress-pass',
    requested_agents: agents,
    earlier_session_resumes_verified: expectedResumes,
    earlier_claims_preserved: true,
    simulated_repositories: 5,
    unique_claims: agents,
    unique_resource_locks: agents,
    excess_contenders_denied: 3,
    synthetic_stacked_pr_submissions: agents,
    submitted_markers: agents,
    remaining_issue_claims: 0,
    remaining_resource_locks: 0,
    completed_tasks_reoffered: false,
    real_github_requests: 0,
    real_private_ledger_verified: false,
    real_multi_chat_concurrency_proven: false,
    automatic_merges_or_deploys: 0
  };
  for (const [field, value] of Object.entries(required)) {
    if (report[field] !== value) {
      throw new Error('Invalid synthetic wave evidence: ' + field);
    }
  }
  if (!Number.isSafeInteger(report.synthetic_ledger_mutations) ||
      report.synthetic_ledger_mutations < 6 * agents) {
    throw new Error('Incomplete synthetic ledger mutation evidence.');
  }
  return {agents, expectedResumes};
}

export async function runOfflineWaveMatrix({runStress = runOfflineFleetStress} = {}) {
  if (typeof runStress !== 'function') {
    throw new Error('Invalid synthetic stress runner.');
  }
  let sessionsExercised = 0;
  let resumeChecks = 0;
  for (const waves of WAVE_SCENARIOS) {
    const agents = waves.reduce((sum, size) => sum + size, 0);
    const args = waves.length === 1 ?
      {agents} : {agents, batches: [...waves]};
    const evidence = await runStress(args);
    const verified = verifyWaveReport(evidence, waves);
    sessionsExercised += verified.agents;
    resumeChecks += verified.expectedResumes;
  }
  // Only aggregate, non-identifying evidence is returned to the operator.
  // Never forward raw runner responses containing task/session identifiers.
  return {
    schema_version: '1-offline-wave-matrix',
    mode: 'synthetic-single-process-only',
    scenarios_passed: WAVE_SCENARIOS.length,
    synthetic_sessions_exercised: sessionsExercised,
    earlier_session_resumes_verified: resumeChecks,
    maximum_sessions_in_one_scenario: 40,
    remaining_issue_claims: 0,
    remaining_resource_locks: 0,
    real_github_requests: 0,
    real_private_ledger_verified: false,
    real_multi_chat_concurrency_proven: false,
    merge_authorized: false,
    deployment_performed: false,
    verdict: 'synthetic-matrix-pass'
  };
}
