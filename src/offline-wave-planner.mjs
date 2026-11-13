import { randomUUID } from 'node:crypto';
import { validateTaskCatalog } from './resources.mjs';

const ROLES = new Set(['any', 'developer', 'tester', 'reviewer', 'auditor', 'planner', 'integrator']);

/**
 * Offline ADVISORY plan, not a reservation. The caller must use a separately
 * SHA-approved local task catalog and revalidate every task against live GitHub
 * before a session acquires the resource + issue locks.
 */
export function planOfflineWave({ tasks, agents, role = 'developer', sessionFactory = () => 'chat-' + randomUUID() }) {
  if (!Number.isSafeInteger(agents) || agents < 2 || agents > 40)
    throw new Error('agent count must be between 2 and 40.');
  if (!ROLES.has(role)) throw new Error('unknown agent role.');
  if (typeof sessionFactory !== 'function') throw new Error('invalid session generator.');
  validateTaskCatalog(tasks);
  const ready = tasks.filter(task => task.status === 'ready' && (role === 'any' || task.role === role));
  // Stable, input-order-independent distribution across repositories. Catalog
  // validation already rejects overlapping roots in different partitions.
  const groups = new Map();
  for (const task of ready) {
    const key = task.repository.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const keys = [...groups.keys()].sort();
  for (const list of groups.values()) list.sort((a, b) => a.issue - b.issue);
  const selected = [];
  const partitions = new Set();
  // Selecting at most one task per write partition prevents simultaneous
  // recommendations for two different issues sharing a single lock.
  let progress = true;
  while (selected.length < agents && progress) {
    progress = false;
    for (const key of keys) {
      const queue = groups.get(key);
      while (queue.length) {
        const task = queue.shift();
        const partition = task.access === 'write'
          ? key + '#' + task.resource_scope.id.toLowerCase() : null;
        if (partition && partitions.has(partition)) continue;
        if (partition) partitions.add(partition);
        selected.push(task);
        progress = true;
        break;
      }
      if (selected.length === agents) break;
    }
  }
  if (selected.length < agents)
    throw new Error('not enough independent ready tasks for the requested wave.');
  const sessions = new Set();
  const slots = selected.map((task, i) => {
    const session_id = sessionFactory();
    if (typeof session_id !== 'string' || !/^chat-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session_id)
      || sessions.has(session_id)) throw new Error('duplicate or invalid chat session ID.');
    sessions.add(session_id);
    return {
      slot: i + 1,
      session_id,
      repository: task.repository,
      issue: task.issue,
      role: task.role,
      access: task.access,
      ...(task.access === 'write' ? {
        resource_partition: task.resource_scope.id,
        upstream_pr: task.upstream_pr,
        upstream_branch: task.upstream_branch
      } : {})
    };
  });
  return {
    schema_version: '1-offline-wave-plan',
    mode: 'advisory-only',
    claims_acquired: false,
    verified_live_eligibility: false,
    merge_authorized: false,
    agents_requested: agents,
    agents_planned: slots.length,
    roles: [...new Set(slots.map(slot => slot.role))].sort(),
    slots
  };
}
