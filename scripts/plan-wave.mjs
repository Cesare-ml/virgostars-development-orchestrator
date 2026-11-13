#!/usr/bin/env node
import { open, realpath, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectOwnerTaskFile, loadHistoricalPilotTasks, requireOwnerTaskApproval } from '../src/owner-task-catalog.mjs';
import { planOfflineWave } from '../src/offline-wave-planner.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const usage = 'Usage: node scripts/plan-wave.mjs --agents 2..40 --role developer|tester|reviewer|auditor|planner|integrator|any [--previous ABSOLUTE_PRIOR_WAVE.json ...] --output ABSOLUTE_NEW_PRIVATE_FILE.json';

function options(args) {
  const found = new Map(), previous = [];
  if (args.length % 2) throw new Error('invalid options.');
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--agents', '--role', '--output', '--previous'].includes(key) ||
        !value || value.startsWith('--')) throw new Error('invalid options.');
    if (key === '--previous') {
      previous.push(value);
      if (previous.length > 40) throw new Error('too many previous wave plans.');
      continue;
    }
    if (found.has(key)) throw new Error('duplicate option.');
    found.set(key, value);
  }
  if (!found.has('--agents') || !found.has('--output') ||
      !/^(?:[2-9]|[1-3][0-9]|40)$/.test(found.get('--agents')))
    throw new Error('missing or invalid agent count/output.');
  return { agents: Number(found.get('--agents')), role: found.get('--role') || 'developer',
    output: found.get('--output'), previous };
}

function outsideCheckout(canonical, root) {
  const path = relative(root, canonical);
  return !!path && (path === '..' || path.startsWith('..' + sep) || isAbsolute(path));
}

function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => Object.hasOwn(value, key)) &&
    keys.every(key => required.includes(key) || optional.includes(key));
}

function validatePreviousPlan(plan, approvedSha256) {
  const base = ['schema_version', 'mode', 'claims_acquired', 'verified_live_eligibility',
    'merge_authorized', 'agents_requested', 'agents_planned', 'roles', 'slots',
    'approved_catalog_sha256'];
  if (!exactKeys(plan, base, ['agents_previously_planned', 'agents_total_planned']) ||
      plan.schema_version !== '1-offline-wave-plan' || plan.mode !== 'advisory-only' ||
      plan.claims_acquired !== false || plan.verified_live_eligibility !== false ||
      plan.merge_authorized !== false || plan.approved_catalog_sha256 !== approvedSha256 ||
      !Array.isArray(plan.slots) || plan.slots.length < 2 || plan.slots.length > 40 ||
      plan.agents_requested !== plan.slots.length || plan.agents_planned !== plan.slots.length ||
      !Array.isArray(plan.roles) || plan.roles.length < 1 ||
      !plan.roles.every(role => typeof role === 'string') ||
      (plan.agents_previously_planned !== undefined &&
        (!Number.isSafeInteger(plan.agents_previously_planned) ||
          plan.agents_previously_planned < 0)) ||
      (plan.agents_total_planned !== undefined &&
        plan.agents_total_planned !== plan.agents_previously_planned + plan.slots.length))
    throw new Error('previous plan is malformed, changed, or from another catalog.');
  const actualRoles = new Set();
  for (let i = 0; i < plan.slots.length; i++) {
    const slot = plan.slots[i];
    const required = ['slot', 'session_id', 'repository', 'issue', 'role', 'access'];
    const writeFields = ['resource_partition', 'upstream_pr', 'upstream_branch'];
    if (!exactKeys(slot, slot?.access === 'write' ? [...required, ...writeFields] : required) ||
        slot.slot !== i + 1 || !['read', 'write'].includes(slot.access) ||
        typeof slot.role !== 'string') throw new Error('previous plan slot is malformed.');
    actualRoles.add(slot.role);
  }
  if (actualRoles.size !== plan.roles.length ||
      plan.roles.some(role => !actualRoles.has(role)) ||
      new Set(plan.roles).size !== plan.roles.length)
    throw new Error('previous plan roles do not match its slots.');
  return plan.slots;
}

async function readPreviousPlan(file, approvedSha256) {
  if (!isAbsolute(file)) throw new Error('previous wave path must be absolute.');
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 131072)
    throw new Error('previous wave file must be regular, bounded and non-symlink.');
  const [root, canonical] = await Promise.all([realpath(PROJECT_ROOT), realpath(file)]);
  if (!outsideCheckout(canonical, root))
    throw new Error('previous wave file must remain outside the public checkout.');
  const fd = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let bytes;
  try {
    const before = await fd.stat();
    if (!before.isFile() || before.size < 1 || before.size > 131072)
      throw new Error('previous wave file is invalid.');
    bytes = await fd.readFile();
    const after = await fd.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
        before.ino !== after.ino || bytes.length !== after.size)
      throw new Error('previous wave changed during read.');
  } finally { await fd.close(); }
  const plan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return validatePreviousPlan(plan, approvedSha256);
}

async function writePrivatePlan(path, plan) {
  if (!isAbsolute(path)) throw new Error('output must be an absolute path.');
  const root = await realpath(PROJECT_ROOT);
  const resolved = resolve(path);
  const parent = await realpath(dirname(resolved));
  if (!outsideCheckout(parent, root))
    throw new Error('private output must be outside the public checkout.');
  // Exclusive creation: no overwrites or following an existing symlink.
  const fd = await open(resolved, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
  try { await fd.writeFile(JSON.stringify(plan, null, 2) + '\n', 'utf8'); }
  finally { await fd.close(); }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === 'help')) {
    process.stdout.write(usage + '\n');
    return;
  }
  const args = options(argv);
  if (!env.VS_PRIVATE_TASKS_FILE || !env.VS_PRIVATE_TASKS_APPROVED_SHA256)
    throw new Error('owner-approved local catalog is required.');
  const report = await inspectOwnerTaskFile(env.VS_PRIVATE_TASKS_FILE, { legacyTasks: await loadHistoricalPilotTasks() });
  const tasks = requireOwnerTaskApproval(report, env.VS_PRIVATE_TASKS_APPROVED_SHA256);
  const previousSlots = [];
  for (const file of args.previous)
    previousSlots.push(...await readPreviousPlan(file, report.sha256));
  const plan = planOfflineWave({ tasks, agents: args.agents, role: args.role, previousSlots });
  await writePrivatePlan(args.output, { ...plan, approved_catalog_sha256: report.sha256 });
  process.stdout.write(JSON.stringify({
    schema_version: plan.schema_version,
    agents_planned: plan.agents_planned,
    agents_previously_planned: plan.agents_previously_planned,
    agents_total_planned: plan.agents_total_planned,
    claims_acquired: false,
    verified_live_eligibility: false,
    private_file_written: true
  }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Never echo filesystem errors: they may contain private paths or task IDs.
    process.stderr.write('Wave planning blocked: check the approved catalog, requested capacity and private output destination.\n');
    process.exitCode = 2;
  });
}
