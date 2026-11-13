import { randomUUID } from 'node:crypto';
import { validateTaskCatalog } from './resources.mjs';

const ROLES = new Set(['any', 'developer', 'tester', 'reviewer', 'auditor', 'planner', 'integrator']);

const SESSION = /^chat-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function taskKey(repository, issue) {
  return repository.toLowerCase() + '#' + issue;
}

/**
 * Previous local plans are NOT claims. Validate their identities against the
 * same SHA-approved catalog before excluding them from a later wave.
 */
function inspectPreviousSlots(tasks, previousSlots, agents) {
  if (!Array.isArray(previousSlots) || previousSlots.length + agents > 40)
    throw new Error('total planned wave capacity must be at most 40.');
  const catalog = new Map(tasks.map(task => [taskKey(task.repository, task.issue), task]));
  const occupiedTasks = new Set(), occupiedPartitions = new Set(), occupiedSessions = new Set();
  for (const slot of previousSlots) {
    if (!slot || typeof slot !== 'object' || Array.isArray(slot) ||
        typeof slot.repository !== 'string' || !Number.isSafeInteger(slot.issue) ||
        slot.issue < 1 || typeof slot.session_id !== 'string' ||
        !SESSION.test(slot.session_id))
      throw new Error('invalid previous wave slot.');
    const key = taskKey(slot.repository, slot.issue);
    const task = catalog.get(key);
    if (!task || task.role !== slot.role || task.access !== slot.access ||
        task.status !== 'ready' || occupiedTasks.has(key) ||
        occupiedSessions.has(slot.session_id.toLowerCase()))
      throw new Error('previous wave conflicts with approved tasks or sessions.');
    if (task.access === 'write') {
      const partition = task.repository.toLowerCase() + '#' + task.resource_scope.id.toLowerCase();
      if (slot.resource_partition !== task.resource_scope.id ||
          slot.upstream_pr !== task.upstream_pr ||
          slot.upstream_branch !== task.upstream_branch ||
          occupiedPartitions.has(partition))
        throw new Error('previous wave has conflicting write partition.');
      occupiedPartitions.add(partition);
    } else if (slot.resource_partition !== undefined ||
               slot.upstream_pr !== undefined || slot.upstream_branch !== undefined) {
      throw new Error('read-only previous slot cannot reserve a write partition.');
    }
    occupiedTasks.add(key);
    occupiedSessions.add(slot.session_id.toLowerCase());
  }
  return { occupiedTasks, occupiedPartitions, occupiedSessions };
}


/**
 * Offline ADVISORY plan, not a reservation. The caller must use a separately
 * SHA-approved local task catalog and revalidate every task against live GitHub
 * before a session acquires the resource + issue locks.
 */
export function planOfflineWave({ tasks, agents, role = 'developer', sessionFactory = () => 'chat-' + randomUUID(), previousSlots = [] }) {
  if (!Number.isSafeInteger(agents) || agents < 2 || agents > 40)
    throw new Error('agent count must be between 2 and 40.');
  if (!ROLES.has(role)) throw new Error('unknown agent role.');
  if (typeof sessionFactory !== 'function') throw new Error('invalid session generator.');
  validateTaskCatalog(tasks);
  const previous = inspectPreviousSlots(tasks, previousSlots, agents);
  const ready = tasks.filter(task => task.status === 'ready' &&
    !previous.occupiedTasks.has(taskKey(task.repository, task.issue)) &&
    (role === 'any' || task.role === role));
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
  const partitions = new Set(previous.occupiedPartitions);
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
  const sessions = new Set(previous.occupiedSessions);
  const slots = selected.map((task, i) => {
    const session_id = sessionFactory();
    if (typeof session_id !== 'string' || !SESSION.test(session_id)
      || sessions.has(session_id.toLowerCase())) throw new Error('duplicate or invalid chat session ID.');
    sessions.add(session_id.toLowerCase());
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
    agents_previously_planned: previousSlots.length,
    agents_total_planned: previousSlots.length + slots.length,
    agents_planned: slots.length,
    roles: [...new Set(slots.map(slot => slot.role))].sort(),
    slots
  };
}
