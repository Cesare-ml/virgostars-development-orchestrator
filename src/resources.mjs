/**
 * Private pilot: every write task owns exactly ONE exclusive resource partition.
 * Multiple paths may belong to a partition, but multiple independent locks are
 * deliberately unsupported until a transactional coordinator exists.
 */
const SCOPE_ID = /^[a-z][a-z0-9_-]{0,63}$/;
const PATH = /^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*\/?$/i;
const REPO = /^[a-z\d][a-z\d_.-]*\/[a-z\d][a-z\d_.-]*$/i;

export function resourceKey(repository, scopeId) {
  if (!REPO.test(repository) || !SCOPE_ID.test(scopeId))
    throw new Error('Invalid resource repository or partition ID.');
  const [owner, name] = repository.split('/');
  return 'resources/' + owner + '__' + name + '/' + scopeId + '.json';
}

function validRoot(root) {
  if (typeof root !== 'string' || root.length > 200 || !PATH.test(root))
    return false;
  // Normalize an optional trailing slash; a root must be portable to both
  // Git checkouts and Windows worktrees before a write resource is reserved.
  return !root.replace(/\/$/, '').split('/').some(segment =>
    segment === '.' || segment === '..' || segment.endsWith('.') ||
    segment.toLowerCase() === '.git' ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment));
}

function rootsOverlap(a, b) {
  const left = a.toLowerCase(), right = b.toLowerCase();
  return left === right || (left.endsWith('/') && right.startsWith(left))
    || (right.endsWith('/') && left.startsWith(right));
}

/**
 * Reject ambiguous or overlapping partitions BEFORE any claim is attempted.
 * This check is static, not a distributed lock; changes to the catalog while
 * agents are working require human review.
 */
export function validateTaskCatalog(tasks) {
  if (!Array.isArray(tasks)) throw new Error('Expected a task array.');
  const keys = new Set();
  const repoSpellings = new Map();
  const writers = [];
  for (const task of tasks) {
    if (!task || !REPO.test(task.repository)
      || !Number.isSafeInteger(task.issue) || task.issue < 1)
      throw new Error('Invalid curated task identity.');
    // GitHub resolves repository names without regard to letter case, but
    // the Contents API stores claim/resource *paths* case-sensitively. A
    // differently cased alias could therefore acquire a second lock for
    // the same real repository and partition. Never rewrite legacy keys:
    // reject conflicting spellings before any coordination API call.
    const canonicalRepo = task.repository.toLowerCase();
    const existingSpelling = repoSpellings.get(canonicalRepo);
    if (existingSpelling !== undefined && existingSpelling !== task.repository)
      throw new Error('Conflicting repository capitalization in curated tasks.');
    repoSpellings.set(canonicalRepo, task.repository);
    const key = canonicalRepo + '#' + task.issue;
    if (keys.has(key)) throw new Error('Duplicate curated task: ' + key);
    keys.add(key);
    if (task.access === 'read') {
      if (task.resource_scope !== undefined && task.resource_scope !== null)
        throw new Error('Read-only tasks cannot reserve write resources.');
      if (!['reviewer', 'auditor', 'planner', 'integrator'].includes(task.role))
        throw new Error('Read-only task role is not permitted.');
    } else if (task.access === 'write') {
      if (!['developer', 'tester'].includes(task.role))
        throw new Error('Only developer/tester roles can own write tasks.');
      const scope = task.resource_scope;
      if (!scope || !SCOPE_ID.test(scope.id) || !Array.isArray(scope.roots)
        || scope.roots.length < 1 || scope.roots.length > 20
        || !scope.roots.every(validRoot))
        throw new Error('Write tasks require one valid partition and declared paths.');
      writers.push({repository:task.repository.toLowerCase(), id:scope.id,
        roots:scope.roots});
    } else throw new Error('Task access must be explicitly read or write.');
  }
  for (let i = 0; i < writers.length; i++) {
    for (let j = i + 1; j < writers.length; j++) {
      const a = writers[i], b = writers[j];
      if (a.repository !== b.repository || a.id === b.id) continue;
      if (a.roots.some(x => b.roots.some(y => rootsOverlap(x, y))))
        throw new Error('Overlapping write paths in different resource partitions: '
          + a.id + ' / ' + b.id);
    }
  }
  return tasks;
}

export function resourceMatches(current, claim) {
  return current?.data?.kind === 'write-resource'
    && current.data.target_repository === claim.target_repository
    && current.data.resource_scope_id === claim.resource_scope_id
    && current.data.issue_number === claim.issue_number
    && current.data.session_id === claim.session_id
    && Array.isArray(current.data.resource_roots)
    && JSON.stringify(current.data.resource_roots) === JSON.stringify(claim.resource_roots);
}
