#!/usr/bin/env node
// Offline owner-only preparation. This tool never acquires a GitHub claim.
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_INPUT_BYTES = 128 * 1024;
const own = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const issueId = (value) => Number.isSafeInteger(value) && value > 0 && value <= 1_000_000_000;
const safeRepo = (value) => typeof value === 'string' &&
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value) &&
  !value.split('/').some((p) => p === '.' || p === '..' || p.toLowerCase() === '.git');
// A trailing slash denotes a directory; a path ending in a filename extension denotes one exact file.
// Never infer that a bare directory-looking name authorizes a whole subtree.
const safeRoot = (value) => typeof value === 'string' && value.length <= 160 &&
  /^[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*\/?$/.test(value) &&
  (value.endsWith('/') || /\.[A-Za-z0-9_-]+$/.test(value)) &&
  !value.split('/').filter(Boolean).some((part) =>
    part.endsWith('.') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
const rootsOverlap = (left, right) => {
  const a = left.endsWith('/') ? left.slice(0, -1) : left;
  const b = right.endsWith('/') ? right.slice(0, -1) : right;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
};

function normalizeManifest(input) {
  if (!record(input) || !own(input, ['schema_version', 'wave_id', 'tasks']) || input.schema_version !== 1 ||
      typeof input.wave_id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(input.wave_id) ||
      !Array.isArray(input.tasks) || input.tasks.length < 2 || input.tasks.length > 40) {
    throw new Error('Invalid wave manifest');
  }
  const issueKeys = new Set();
  const writeScopes = new Map();
  const tasks = input.tasks.map((item) => {
    if (!record(item) || !own(item, ['repository', 'issue', 'role', 'roots']) ||
        !safeRepo(item.repository) || !issueId(item.issue) ||
        !['developer', 'reviewer'].includes(item.role) ||
        !Array.isArray(item.roots) || item.roots.length > 12 ||
        (item.role === 'developer' && item.roots.length === 0) ||
        (item.role === 'reviewer' && item.roots.length !== 0) ||
        !item.roots.every(safeRoot)) {
      throw new Error('Invalid task definition');
    }
    const repositoryKey = item.repository.toLowerCase();
    const key = `${repositoryKey}#${item.issue}`;
    if (issueKeys.has(key)) throw new Error('Duplicate task identity');
    issueKeys.add(key);
    const roots = item.roots.map((root) => root.toLowerCase());
    if (new Set(roots).size !== roots.length) throw new Error('Duplicate write root');
    if (item.role === 'developer') {
      const previous = writeScopes.get(repositoryKey) ?? [];
      for (const root of roots) {
        if (previous.some((other) => rootsOverlap(root, other))) {
          throw new Error('Overlapping write roots');
        }
        previous.push(root);
      }
      writeScopes.set(repositoryKey, previous);
    }
    return { repository: item.repository, issue: item.issue, role: item.role, roots: [...item.roots] };
  });
  return { schema_version: 1, wave_id: input.wave_id, tasks };
}

function startupPrompt(task, sessionId) {
  const scope = task.role === 'developer' ? `Proposed write roots: ${task.roots.join(', ')}.` : 'Read-only review; no source changes.';
  return [
    'You are one independent OWNER-OPERATED VirgoStars development chat. This prompt is a proposal, NOT a granted claim.',
    `Session ID (unique to this chat): ${sessionId}`,
    `Proposed task: ${task.repository} issue #${task.issue}. Role: ${task.role}.`,
    scope,
    'Before acting, read the current target AGENTS.md, roadmap, issue, open PRs and the approved private task catalog.',
    'Do NOT use the historical public coordination/claims branch. Confirm an owner-approved PRIVATE ledger and task authorization first.',
    'Revalidate live issue state, other claims, resource ownership, competing PRs and current base HEAD.',
    'If writing, exclusively acquire the approved resource lock BEFORE the issue claim; verify both locks. No successful claim means NO work.',
    'Work on a fresh feature branch only within independently confirmed authorized paths. Open a draft PR, report actual tests and leave a factual handoff.',
    'On follow-ups, revalidate the same session ownership; never claim a second task or reuse another chat session.',
    'No automatic merge, deploy, license changes, public/private data disclosure or unapproved access. Stop if a gate fails.'
  ].join('\n');
}

export function planAgentWave(manifest, { uuid = randomUUID, now = () => new Date().toISOString() } = {}) {
  const normalized = normalizeManifest(manifest);
  const sessions = new Set();
  const agents = normalized.tasks.map((task) => {
    const value = uuid();
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error('Invalid generated session UUID');
    }
    const sessionId = `chat-${value.toLowerCase()}`;
    if (sessions.has(sessionId)) throw new Error('Duplicate generated session UUID');
    sessions.add(sessionId);
    return { ...task, session_id: sessionId, prompt: startupPrompt(task, sessionId) };
  });
  const timestamp = now();
  if (typeof timestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(timestamp)) {
    throw new Error('Invalid timestamp');
  }
  return {
    schema_version: 1,
    wave_id: normalized.wave_id,
    created_at: timestamp,
    ready_to_launch: false,
    claims_acquired: false,
    requires_private_ledger_approval: true,
    agents
  };
}

function within(root, target) {
  const r = path.relative(root, target);
  return r === '' || (r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r));
}

export async function writeAgentWave(inputFile, outputFile, opts = {}) {
  if (!path.isAbsolute(inputFile) || !path.isAbsolute(outputFile)) throw new Error('Absolute paths required');
  const repoRoot = await fs.realpath(ROOT);
  const inputStat = await fs.lstat(inputFile);
  if (!inputStat.isFile() || inputStat.size > MAX_INPUT_BYTES) throw new Error('Unsafe input file');
  const realInput = await fs.realpath(inputFile);
  const parent = await fs.realpath(path.dirname(outputFile));
  if (within(repoRoot, realInput) || within(repoRoot, parent)) throw new Error('Files must stay outside repository');
  const data = await fs.readFile(inputFile);
  if (data.byteLength > MAX_INPUT_BYTES) throw new Error('Oversized input');
  const plan = planAgentWave(JSON.parse(data.toString('utf8')), opts);
  let handle;
  try {
    handle = await fs.open(outputFile, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
      handle = undefined;
      await fs.unlink(outputFile).catch(() => {});
    }
    throw error;
  } finally {
    await handle?.close();
  }
  return { count: plan.agents.length };
}

const executing = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executing) {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    process.stdout.write('Usage: node scripts/plan-agent-wave.mjs ABSOLUTE_INPUT.json ABSOLUTE_OUTPUT.json\n');
  } else if (process.argv.length === 4) {
    writeAgentWave(process.argv[2], process.argv[3]).then(({ count }) => {
      process.stdout.write(`Prepared ${count} independent chat prompts in a private local file. No task claims acquired.\n`);
    }).catch(() => {
      process.stderr.write('Wave plan blocked: check local input, safety constraints and output permissions.\n');
      process.exitCode = 1;
    });
  } else {
    process.stderr.write('Usage: node scripts/plan-agent-wave.mjs ABSOLUTE_INPUT.json ABSOLUTE_OUTPUT.json\n');
    process.exitCode = 1;
  }
}
