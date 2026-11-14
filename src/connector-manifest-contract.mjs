// Offline, public-safe shape and consistency checks for a proposed PRIVATE
// GitHub-only owner task manifest. Never authorizes claims or private writes.
export const CONNECTOR_MANIFEST_SCHEMA = 'virgostars.connector-private-tasks.v1';
const SHA = /^[a-f0-9]{40}$/i;
const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,150}$/;
const MANIFEST_FIELDS = ['schema_version', 'status', 'wave', 'tasks'];
const TASK_FIELDS = ['task_id', 'repository', 'issue', 'status', 'role', 'access',
  'pilot_wave', 'title', 'scope', 'resource_scope', 'upstream_pr',
  'upstream_branch', 'upstream_head_sha'];
const RESOURCE_FIELDS = ['id', 'roots'];
const GATE_FIELDS = ['fetched_commit_sha', 'owner_approved_commit_sha',
  'private_visibility_verified', 'independent_owner_approval_verified',
  'manifest_separate_from_ledger_verified', 'historic_submissions_verified',
  'approved_repositories', 'historic_submitted_task_keys'];
const block = () => { throw new TypeError('CONNECTOR_MANIFEST_BLOCKED'); };

function exactRecord(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) block();
  const found = Reflect.ownKeys(value);
  if (found.length !== keys.length || found.some(k => typeof k !== 'string' || !keys.includes(k))) block();
  for (const key of found) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !Object.hasOwn(d, 'value')) block();
  }
}
function exactString(value, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) block();
}
function positive(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000000000) block();
}
function safeFile(path) {
  if (typeof path !== 'string' || path.length > 200 || !path.includes('/') ||
      !/^[A-Za-z0-9._/-]+$/.test(path) || path.includes('//')) block();
  const parts = path.split('/');
  if (parts.some(x => x === '' || x === '.' || x === '..' ||
      x.toLowerCase() === '.git' || x.toLowerCase() === '.github')) block();
  if (!path.startsWith('test/') && !path.startsWith('tests/') &&
      !path.startsWith('python/tests/')) block();
  return path.toLowerCase();
}
function safeBranch(value) {
  exactString(value, BRANCH);
  if (value.includes('..') || value.includes('//') || value.endsWith('/') ||
      value.endsWith('.') || value.endsWith('.lock')) block();
}

// JSON.parse alone accepts duplicate keys (last write wins), including escaped
// Unicode aliases. Scan the bounded raw JSON tree for repeated decoded keys.
export function parseUniqueManifestJson(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 32768 || !raw.length) block();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { block(); }
  let cursor = 0;
  const whitespace = () => { while (/\s/.test(raw[cursor] ?? '') && cursor < raw.length) cursor++; };
  function quoted() {
    if (raw[cursor] !== '"') block();
    const begin = cursor++;
    while (cursor < raw.length) {
      if (raw[cursor] === '\\') { cursor += 2; continue; }
      if (raw[cursor++] === '"') return JSON.parse(raw.slice(begin, cursor));
    }
    block();
  }
  function value(depth) {
    if (depth > 16) block();
    whitespace();
    const c = raw[cursor];
    if (c === '"') { quoted(); return; }
    if (c === '{') {
      cursor++; whitespace();
      const keys = new Set();
      if (raw[cursor] === '}') { cursor++; return; }
      while (cursor < raw.length) {
        const key = quoted();
        if (keys.has(key)) block();
        keys.add(key); whitespace();
        if (raw[cursor++] !== ':') block();
        value(depth + 1); whitespace();
        if (raw[cursor] === '}') { cursor++; return; }
        if (raw[cursor++] !== ',') block();
        whitespace();
      }
      block();
    }
    if (c === '[') {
      cursor++; whitespace();
      if (raw[cursor] === ']') { cursor++; return; }
      while (cursor < raw.length) {
        value(depth + 1); whitespace();
        if (raw[cursor] === ']') { cursor++; return; }
        if (raw[cursor++] !== ',') block();
      }
      block();
    }
    if (c === undefined) block();
    while (cursor < raw.length && !/[,}\]\s]/.test(raw[cursor])) cursor++;
  }
  value(0); whitespace();
  if (cursor !== raw.length) block();
  return parsed;
}

/**
 * Verifies only the internal consistency of data supplied by the caller.
 * gate is NOT authenticated by this function, even if its fields are true.
 * Returns no task, private repository, issue, path or owner identity.
 */
export function inspectConnectorManifest(rawJson, gate) {
  exactRecord(gate, GATE_FIELDS);
  exactString(gate.fetched_commit_sha, SHA);
  exactString(gate.owner_approved_commit_sha, SHA);
  if (gate.fetched_commit_sha.toLowerCase() !== gate.owner_approved_commit_sha.toLowerCase()) block();
  for (const key of GATE_FIELDS.slice(2, 6)) if (gate[key] !== true) block();
  if (!Array.isArray(gate.approved_repositories) ||
      gate.approved_repositories.length < 2 || gate.approved_repositories.length > 8 ||
      !Array.isArray(gate.historic_submitted_task_keys) ||
      gate.historic_submitted_task_keys.length < 7 ||
      gate.historic_submitted_task_keys.length > 1000) block();
  const approved = new Set();
  for (const repo of gate.approved_repositories) {
    exactString(repo, REPO);
    if (approved.has(repo.toLowerCase())) block();
    approved.add(repo.toLowerCase());
  }
  const historic = new Set();
  for (const key of gate.historic_submitted_task_keys) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}#[1-9][0-9]*$/.test(key)) block();
    historic.add(key.toLowerCase());
  }
  if (historic.size !== gate.historic_submitted_task_keys.length) block();

  const data = parseUniqueManifestJson(rawJson);
  exactRecord(data, MANIFEST_FIELDS);
  if (data.schema_version !== CONNECTOR_MANIFEST_SCHEMA ||
      data.status !== 'owner-approved' || data.wave !== 2 ||
      !Array.isArray(data.tasks) || data.tasks.length !== 2) block();
  const ids = new Set(), issues = new Set(), resources = new Set(), files = new Set();
  for (const task of data.tasks) {
    exactRecord(task, TASK_FIELDS);
    exactString(task.task_id, ID);
    exactString(task.repository, REPO);
    exactString(task.upstream_head_sha, SHA);
    safeBranch(task.upstream_branch);
    positive(task.issue); positive(task.upstream_pr);
    if (task.status !== 'ready' || task.role !== 'developer' ||
        task.access !== 'write' || task.pilot_wave !== 2 ||
        typeof task.title !== 'string' || !/^[^\u0000-\u001f\u007f]{3,160}$/.test(task.title)) block();
    if (!gate.approved_repositories.includes(task.repository)) block();
    exactRecord(task.resource_scope, RESOURCE_FIELDS);
    exactString(task.resource_scope.id, ID);
    if (!Array.isArray(task.scope) || task.scope.length !== 1 ||
        !Array.isArray(task.resource_scope.roots) || task.resource_scope.roots.length !== 1 ||
        task.scope[0] !== task.resource_scope.roots[0]) block();
    const path = safeFile(task.scope[0]);
    const key = task.repository.toLowerCase() + '#' + task.issue;
    if (ids.has(task.task_id) || issues.has(key) || historic.has(key)) block();
    const resourceKey = task.repository.toLowerCase() + '/' + task.resource_scope.id.toLowerCase();
    const fileKey = task.repository.toLowerCase() + '/' + path;
    if (resources.has(resourceKey) || files.has(fileKey)) block();
    ids.add(task.task_id); issues.add(key); resources.add(resourceKey); files.add(fileKey);
  }
  return Object.freeze({
    schema: 'virgostars.connector-manifest-shape-result.v1',
    task_count: 2,
    distinct_task_ids: 2,
    distinct_resource_partitions: 2,
    immutable_commit_reference_consistent: true,
    caller_assertions_only: true,
    live_github_verified: false,
    claim_authorized: false,
    ready_to_scale: false,
    operator_review_required: true,
  });
}