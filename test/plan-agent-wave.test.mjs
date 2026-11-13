import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { planAgentWave, writeAgentWave } from '../scripts/plan-agent-wave.mjs';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = () => ({
  schema_version: 1,
  wave_id: 'pilot-a',
  tasks: [
    { repository: 'example-org/alpha', issue: 10, role: 'developer', roots: ['src/clock/'] },
    { repository: 'example-org/alpha', issue: 11, role: 'developer', roots: ['src/moon/'] },
    { repository: 'example-org/beta', issue: 12, role: 'reviewer', roots: [] }
  ]
});
const make = (data) => { let i = 0; return planAgentWave(data, { uuid: () => uuid(++i), now: () => '2026-11-13T20:00:00.000Z' }); };

test('creates distinct per-chat sessions, fixed safety prompt, no claims', () => {
  const result = make(base());
  assert.equal(result.agents.length, 3);
  assert.equal(result.ready_to_launch, false);
  assert.equal(result.claims_acquired, false);
  assert.equal(new Set(result.agents.map((a) => a.session_id)).size, 3);
  assert.match(result.agents[0].prompt, /private ledger/i);
  assert.match(result.agents[0].prompt, /BEFORE the issue claim/);
  assert.match(result.agents[2].prompt, /Read-only review/);
  assert.doesNotMatch(result.agents[0].prompt, /create a claim on coordination\/claims branch/);
});

test('permits exactly forty disjoint developer tasks', () => {
  const data = base();
  data.tasks = Array.from({ length: 40 }, (_, i) => ({
    repository: 'example-org/alpha', issue: i + 1, role: 'developer', roots: [`src/module${i}/`]
  }));
  assert.equal(make(data).agents.length, 40);
  data.tasks.push({ repository: 'example-org/beta', issue: 50, role: 'reviewer', roots: [] });
  assert.throws(() => make(data), /Invalid wave manifest/);
  data.tasks.length = 1;
  assert.throws(() => make(data), /Invalid wave manifest/);
});

test('refuses duplicate issues including case aliases', () => {
  const data = base();
  data.tasks[1].repository = 'EXAMPLE-ORG/ALPHA';
  data.tasks[1].issue = 10;
  assert.throws(() => make(data), /Duplicate task identity/);
});

test('rejects overlapping roots in a task or between tasks, case-insensitively', () => {
  const data = base();
  data.tasks[1].roots = ['SRC/CLOCK/subdir/'];
  assert.throws(() => make(data), /Overlapping write roots/);
  data.tasks[1].roots = ['SRC/CLOCK/'];
  assert.throws(() => make(data), /Overlapping write roots/);
  data.tasks[1].roots = ['src/moon/', 'src/moon/deep/'];
  assert.throws(() => make(data), /Overlapping write roots/);
});

test('directory boundaries are respected and review tasks do not reserve file roots', () => {
  const data = base();
  data.tasks[1].roots = ['src/clockwork/'];
  assert.equal(make(data).agents.length, 3);
  data.tasks[2].repository = 'EXAMPLE-ORG/ALPHA';
  assert.equal(make(data).agents.length, 3);
});

test('rejects traversal, unsafe roots, unapproved roles and unexpected fields', () => {
  const invalid = ['../src/', 'src/../', '/src/', 'src//', 'src\\code/', '.github/workflows/', 'src/*/', '.git/'];
  for (const root of invalid) {
    const data = base(); data.tasks[0].roots = [root];
    assert.throws(() => make(data), /Invalid task definition/, root);
  }
  const data = base();
  data.tasks[0].secret = 'not allowed';
  assert.throws(() => make(data), /Invalid task definition/);
  delete data.tasks[0].secret;
  data.tasks[0].role = 'admin';
  assert.throws(() => make(data), /Invalid task definition/);
});

test('fails closed on UUID generator reuse or non-v4 IDs', () => {
  assert.throws(() => planAgentWave(base(), { uuid: () => uuid(1) }), /Duplicate generated session UUID/);
  assert.throws(() => planAgentWave(base(), { uuid: () => 'same-id' }), /Invalid generated session UUID/);
});

test('writes exclusive local file and refuses overwrite; no output leaks to stdout', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'vs-plan-wave-'));
  try {
    const input = path.join(temp, 'owner-tasks.json');
    const output = path.join(temp, 'launch.json');
    await writeFile(input, JSON.stringify(base()));
    const result = await writeAgentWave(input, output, { uuid: (() => {let i=0;return () => uuid(++i);})(), now: () => '2026-11-13T20:00:00.000Z' });
    assert.equal(result.count, 3);
    assert.equal(JSON.parse(await readFile(output, 'utf8')).agents.length, 3);
    if (process.platform !== 'win32') assert.equal((await stat(output)).mode & 0o777, 0o600);
    await assert.rejects(writeAgentWave(input, output), /EEXIST/);
    assert.equal(JSON.parse(await readFile(output, 'utf8')).agents.length, 3);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('requires absolute paths and rejects symlinked manifest', async () => {
  await assert.rejects(writeAgentWave('relative.json', '/tmp/out'), /Absolute paths/);
  const temp = await mkdtemp(path.join(tmpdir(), 'vs-plan-wave-'));
  try {
    const input = path.join(temp, 'input.json');
    const link = path.join(temp, 'link.json');
    await writeFile(input, JSON.stringify(base()));
    const { symlink } = await import('node:fs/promises');
    await symlink(input, link);
    await assert.rejects(writeAgentWave(link, path.join(temp, 'output.json')), /Unsafe input file/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('tokenless CLI help does not access files', () => {
  const exe = path.resolve('scripts/plan-agent-wave.mjs');
  const run = spawnSync(process.execPath, [exe, '--help'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /Usage:/);
});
