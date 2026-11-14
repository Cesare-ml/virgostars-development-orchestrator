// Public-safe, offline consistency check of OWNER-SUPPLIED observations.
// These fields are attestations, not authenticated evidence from GitHub.
export const EVIDENCE_SCHEMA = 'virgostars.owner-alpha-evidence.v1';
export const RESULT_SCHEMA = 'virgostars.owner-alpha-acceptance-result.v1';

const OWNER_CHECKS = [
  'private_ledger_verified',
  'historic_seven_submissions_verified',
];
const FLEET_COUNTERS = [
  'active_claims',
  'orphan_resource_locks',
  'ambiguous_claims',
  'stale_submissions',
];
const AGENT_CHECKS = [
  'exclusive_claim_verified',
  'draft_pr_verified',
  'scope_audit_verified',
  'no_competing_prs',
  'head_sha_current',
  'native_tests_verified',
  'handoff_published',
  'submission_marker_verified',
  'claim_released',
  'resource_released',
  'independent_review_recorded',
];
const AGENT_ID_FIELDS = ['session_id', 'task_id', 'resource_scope_id', 'pr_number', 'pr_head_sha'];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40 = /^[0-9a-f]{40}$/i;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const safeCode = (name) => name.toUpperCase();

function requireRecord(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('INVALID_EVIDENCE');
  }
  if (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) {
    throw new TypeError('INVALID_EVIDENCE');
  }
  const found = Reflect.ownKeys(value);
  if (found.length !== expectedKeys.length ||
      found.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))) {
    throw new TypeError('INVALID_EVIDENCE');
  }
  if (found.some((key) => !Object.getOwnPropertyDescriptor(value, key)?.hasOwnProperty('value'))) {
    throw new TypeError('INVALID_EVIDENCE');
  }
}

function unique(values) {
  return new Set(values.map((value) => String(value).toLowerCase())).size === values.length;
}

export function emptyAcceptanceResult() {
  return {
    schema: RESULT_SCHEMA,
    evidence_source: 'owner_self_reported',
    live_github_verified: false,
    ready_to_scale: false,
    operator_review_required: true,
    checked_sessions: 0,
    self_reported_requirements_met: false,
    blockers: ['INVALID_EVIDENCE'],
  };
}

export function evaluateTwoChatAcceptance(evidence) {
  requireRecord(evidence, ['schema', 'owner_checks', 'fleet_counters', 'agents']);
  if (evidence.schema !== EVIDENCE_SCHEMA) throw new TypeError('INVALID_EVIDENCE');

  requireRecord(evidence.owner_checks, OWNER_CHECKS);
  requireRecord(evidence.fleet_counters, FLEET_COUNTERS);
  if (!Array.isArray(evidence.agents) || evidence.agents.length !== 2) {
    throw new TypeError('INVALID_EVIDENCE');
  }
  for (const name of OWNER_CHECKS) {
    if (typeof evidence.owner_checks[name] !== 'boolean') throw new TypeError('INVALID_EVIDENCE');
  }
  for (const name of FLEET_COUNTERS) {
    const value = evidence.fleet_counters[name];
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) {
      throw new TypeError('INVALID_EVIDENCE');
    }
  }

  const blockers = [];
  for (const name of OWNER_CHECKS) {
    if (!evidence.owner_checks[name]) blockers.push('OWNER_' + safeCode(name));
  }
  for (const name of FLEET_COUNTERS) {
    if (evidence.fleet_counters[name] !== 0) blockers.push('FLEET_' + safeCode(name));
  }

  for (const agent of evidence.agents) {
    requireRecord(agent, [...AGENT_ID_FIELDS, ...AGENT_CHECKS]);
    if (typeof agent.session_id !== 'string' || !UUID_V4.test(agent.session_id)) {
      throw new TypeError('INVALID_EVIDENCE');
    }
    for (const name of ['task_id', 'resource_scope_id']) {
      if (typeof agent[name] !== 'string' || !OPAQUE_ID.test(agent[name])) {
        throw new TypeError('INVALID_EVIDENCE');
      }
    }
    if (!Number.isSafeInteger(agent.pr_number) || agent.pr_number < 1 || agent.pr_number > 1000000000) {
      throw new TypeError('INVALID_EVIDENCE');
    }
    if (typeof agent.pr_head_sha !== 'string' || !SHA40.test(agent.pr_head_sha)) {
      throw new TypeError('INVALID_EVIDENCE');
    }
    for (const name of AGENT_CHECKS) {
      if (typeof agent[name] !== 'boolean') throw new TypeError('INVALID_EVIDENCE');
      if (!agent[name]) {
        const code = 'AGENT_' + safeCode(name);
        if (!blockers.includes(code)) blockers.push(code);
      }
    }
  }

  const uniquenessChecks = [
    ['DUPLICATE_SESSION_ID', 'session_id'],
    ['DUPLICATE_TASK_ID', 'task_id'],
    ['DUPLICATE_RESOURCE_SCOPE_ID', 'resource_scope_id'],
    ['DUPLICATE_PR_NUMBER', 'pr_number'],
    ['DUPLICATE_PR_HEAD_SHA', 'pr_head_sha'],
  ];
  for (const [code, key] of uniquenessChecks) {
    if (!unique(evidence.agents.map((agent) => agent[key]))) blockers.push(code);
  }

  return {
    schema: RESULT_SCHEMA,
    evidence_source: 'owner_self_reported',
    live_github_verified: false,
    ready_to_scale: false,
    operator_review_required: true,
    checked_sessions: 2,
    self_reported_requirements_met: blockers.length === 0,
    blockers,
  };
}
