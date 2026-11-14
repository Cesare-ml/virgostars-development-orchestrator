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
  if (!report || typeof report !== 'object' || Array.isArray(report) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(report))) {
    throw new Error('Missing or invalid synthetic wave report.');
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
  // Synthetic adapters may expose zero-valued state-reopen diagnostics in
  // their default (no-reopen) mode. Do not accept positive recovery claims in
  // this matrix, which has not requested or verified any reconstruction.
  const optionalNoReopen = {
    reopened_after_wave: null,
    synthetic_adapter_recreated: false,
    restored_session_resumes_verified: 0,
    restored_ledger_entries_verified: 0,
    real_external_storage_durability_proven: false
  };
  const allowed = new Set([
    ...Object.keys(required), 'arrival_batch_sizes',
    'synthetic_ledger_mutations', ...Object.keys(optionalNoReopen)
  ]);
  // Reflect.ownKeys also catches symbol and non-enumerable properties that
  // JSON.stringify would silently discard. Never accept unrecognized flags
  // asserting live permission, merge/deployment or leaked session metadata.
  for (const field of Reflect.ownKeys(report)) {
    const descriptor = Object.getOwnPropertyDescriptor(report, field);
    if (!allowed.has(field) || !descriptor?.enumerable ||
        !Object.hasOwn(descriptor, 'value')) {
      throw new Error('Unexpected synthetic wave evidence field.');
    }
  }
  for (const [field, value] of Object.entries(required)) {
    if (!Object.hasOwn(report, field) || report[field] !== value) {
      throw new Error('Invalid synthetic wave evidence: ' + field);
    }
  }
  for (const [field, value] of Object.entries(optionalNoReopen)) {
    if (Object.hasOwn(report, field) && report[field] !== value) {
      throw new Error('Invalid synthetic no-reopen evidence: ' + field);
    }
  }
  if (!Object.hasOwn(report, 'arrival_batch_sizes') ||
      !Object.hasOwn(report, 'synthetic_ledger_mutations')) {
    throw new Error('Incomplete synthetic wave report fields.');
  }
  if (!Number.isSafeInteger(report.synthetic_ledger_mutations) ||
      report.synthetic_ledger_mutations < 6 * agents) {
    throw new Error('Incomplete synthetic ledger mutation evidence.');
  }
  return {agents, expectedResumes};
}

export async function runOfflineWaveMatrix({
  runStress = runOfflineFleetStress, repeat = false
} = {}) {
  if (typeof runStress !== 'function' || typeof repeat !== 'boolean') {
    throw new Error('Invalid synthetic wave matrix options.');
  }
  let sessionsExercised = 0;
  let resumeChecks = 0;
  let repeatedScenarios = 0;
  for (const waves of WAVE_SCENARIOS) {
    const agents = waves.reduce((sum, size) => sum + size, 0);
    const args = waves.length === 1 ?
      {agents} : {agents, batches: [...waves]};
    const evidence = await runStress(args);
    const verified = verifyWaveReport(evidence, waves);
    if (repeat) {
      // Validate the second run independently before comparing whole reports.
      // The aggregate check detects unstable simulator results but cannot
      // prove a particular task/session assignment is deterministic.
      const repeated = await runStress(args);
      verifyWaveReport(repeated, waves);
      if (JSON.stringify(repeated) !== JSON.stringify(evidence)) {
        throw new Error('Synthetic wave repeat evidence changed.');
      }
      repeatedScenarios++;
    }
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
    repeated_scenarios_verified: repeatedScenarios,
    repeat_consistency_verified: repeat,
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
