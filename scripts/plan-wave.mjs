#!/usr/bin/env node
import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectOwnerTaskFile, loadHistoricalPilotTasks, requireOwnerTaskApproval } from '../src/owner-task-catalog.mjs';
import { planOfflineWave } from '../src/offline-wave-planner.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const usage = 'Usage: node scripts/plan-wave.mjs --agents 2..40 --role developer|tester|reviewer|auditor|planner|integrator|any --output ABSOLUTE_PRIVATE_FILE.json';

function options(args) {
  const found = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--agents', '--role', '--output'].includes(key) || found.has(key) || !args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error('invalid options.');
    found.set(key, args[i + 1]);
  }
  if (!found.has('--agents') || !found.has('--output') || !/^(?:[2-9]|[1-3][0-9]|40)$/.test(found.get('--agents')))
    throw new Error('missing or invalid agent count/output.');
  return { agents: Number(found.get('--agents')), role: found.get('--role') || 'developer', output: found.get('--output') };
}

async function writePrivatePlan(path, plan) {
  if (!isAbsolute(path)) throw new Error('output must be an absolute path.');
  const root = await realpath(PROJECT_ROOT);
  const resolved = resolve(path);
  const parent = await realpath(dirname(resolved));
  const inside = relative(root, parent);
  if (!inside || (inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside)))
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
  const plan = planOfflineWave({ tasks, agents: args.agents, role: args.role });
  await writePrivatePlan(args.output, { ...plan, approved_catalog_sha256: report.sha256 });
  process.stdout.write(JSON.stringify({
    schema_version: plan.schema_version,
    agents_planned: plan.agents_planned,
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
