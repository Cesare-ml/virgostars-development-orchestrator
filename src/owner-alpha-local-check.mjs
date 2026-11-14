// Offline, aggregate-only operator setup preflight. No GitHub client or I/O here.
const SHA256 = /^[a-f0-9]{64}$/;
const isText = value => typeof value === 'string' && value.trim().length > 0;

/**
 * Validate only locally supplied settings before attempting alpha-doctor.
 * Injected callbacks are deliberately restricted to local selection and
 * owner-file validation. Nothing here proves GitHub visibility or writes.
 */
export async function assessOwnerAlphaLocalSetup({
  env = {},
  nodeVersion = process.versions.node,
  validateSelection,
  loadApprovedTasks
} = {}) {
  if (typeof validateSelection !== 'function' ||
      typeof loadApprovedTasks !== 'function')
    throw new TypeError('Required offline preflight validators are missing.');

  const blockers = new Set();
  const major = typeof nodeVersion === 'string' && /^(\d+)\./.exec(nodeVersion);
  if (!major || Number(major[1]) < 20)
    blockers.add('NODE_20_OR_NEWER_REQUIRED');

  let ledgerSelected = false;
  if (!isText(env.VS_PRIVATE_LEDGER_REPO) ||
      !isText(env.VS_PRIVATE_LEDGER_APPROVED_REPO)) {
    blockers.add('PRIVATE_LEDGER_SELECTION_MISSING');
  } else {
    try {
      validateSelection({
        repository: env.VS_PRIVATE_LEDGER_REPO,
        acknowledgedRepository: env.VS_PRIVATE_LEDGER_APPROVED_REPO
      });
      ledgerSelected = true;
    } catch {
      blockers.add('PRIVATE_LEDGER_SELECTION_INVALID');
    }
  }

  if (!isText(env.GITHUB_TOKEN))
    blockers.add('LOCAL_GITHUB_TOKEN_MISSING');

  let validatedTasks = false;
  let configuredTasks = 0;
  let configuredWriters = 0;
  let configuredDevelopers = 0;
  let independentDeveloperPartitions = 0;
  if (!isText(env.VS_PRIVATE_TASKS_FILE) ||
      !isText(env.VS_PRIVATE_TASKS_APPROVED_SHA256)) {
    blockers.add('OWNER_TASK_APPROVAL_MISSING');
  } else if (!SHA256.test(env.VS_PRIVATE_TASKS_APPROVED_SHA256)) {
    blockers.add('OWNER_TASK_APPROVAL_SHA_INVALID');
  } else {
    try {
      // The repository reader rejects symlinks, public-checkout files,
      // malformed tasks, historical issue reuse and stale SHA approvals.
      const tasks = await loadApprovedTasks({
        file: env.VS_PRIVATE_TASKS_FILE,
        approvedSha256: env.VS_PRIVATE_TASKS_APPROVED_SHA256
      });
      if (!Array.isArray(tasks) || tasks.length > 40)
        throw new TypeError('Invalid approved tasks.');
      validatedTasks = true;
      configuredTasks = tasks.length;
      configuredWriters = tasks.filter(t => t?.access === 'write').length;
      if (configuredWriters < 2)
        blockers.add('TWO_WRITE_TASKS_REQUIRED');
      // The remote alpha-doctor requires two eligible developer partitions,
      // not just any two writers (tester tasks cannot launch this pilot).
      const developers = tasks.filter(t =>
        t?.access === 'write' && t?.role === 'developer' &&
        t?.status === 'ready' &&
        typeof t?.repository === 'string' &&
        typeof t?.resource_scope?.id === 'string'
      );
      configuredDevelopers = developers.length;
      independentDeveloperPartitions = new Set(developers.map(t =>
        t.repository.toLowerCase() + '#' + t.resource_scope.id.toLowerCase()
      )).size;
      if (independentDeveloperPartitions < 2)
        blockers.add('TWO_DISTINCT_DEVELOPER_TASKS_REQUIRED');
    } catch {
      blockers.add('OWNER_TASK_FILE_OR_APPROVAL_INVALID');
    }
  }

  const sorted = [...blockers].sort();
  return {
    schema_version: '1-owner-alpha-local-check',
    mode: 'offline-local-only',
    result: sorted.length ? 'blocked' : 'local-preflight-pass',
    blockers: sorted,
    node_version_supported: !blockers.has('NODE_20_OR_NEWER_REQUIRED'),
    private_ledger_selected_locally: ledgerSelected,
    private_task_file_validated: validatedTasks,
    configured_tasks: configuredTasks,
    configured_write_tasks: configuredWriters,
    configured_developer_tasks: configuredDevelopers,
    independent_developer_partitions: independentDeveloperPartitions,
    eligible_for_remote_alpha_doctor: sorted.length === 0,
    github_requests: 0,
    private_ledger_verified: false,
    historical_submissions_verified: false,
    real_multi_chat_pilot_proven: false,
    task_claimed: false,
    ready_to_launch: false,
    merge_authorized: false,
    next_step: sorted.length ? 'resolve-local-blockers' : 'run-owner-verified-private-activation-and-alpha-doctor'
  };
}
