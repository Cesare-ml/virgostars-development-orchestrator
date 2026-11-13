import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../scripts/plan-wave.mjs', import.meta.url));
const repo = 'Cesare-ml/astrological-charts';
const task = (issue) => ({
  repository: repo, issue, status: 'ready', role: 'developer', access: 'write',
  pilot_wave: 3, title: 'Approved private smoke ' + issue,
  scope: ['tests/alpha-' + issue + '.mjs'],
  resource_scope: { id: 'alpha-' + issue, roots: ['tests/alpha-' + issue + '.mjs'] },
  upstream_pr: 22, upstream_branch: 'feat/planet-interactions-transit-aspects-20261110'
});

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'vs-private-wave-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'catalog.json');
  const catalog = { schema_version: '1-owner-task-catalog', status: 'owner-curated-local',
    tasks: [901, 902, 903, 904, 905].map(task) };
  const json = JSON.stringify(catalog, null, 2) + '\n';
  await writeFile(file, json, { mode: 0o600 });
  const approved = createHash('sha256').update(json).digest('hex');
  const env = { ...process.env, VS_PRIVATE_TASKS_FILE: file,
    VS_PRIVATE_TASKS_APPROVED_SHA256: approved };
  delete env.GITHUB_TOKEN;
  const run = (...args) => spawnSync(process.execPath, [cli, ...args],
    { env, encoding: 'utf8', timeout: 20000 });
  return { dir, file, env, approved, run };
}

test('CLI safely plans two consecutive 2-agent waves from the same private catalog', async (t) => {
  const { dir, run, approved } = await fixture(t);
  const first = join(dir, 'wave-01.json'), second = join(dir, 'wave-02.json');
  const a = run('--agents', '2', '--output', first);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stderr, '');
  assert.equal(JSON.parse(a.stdout).agents_total_planned, 2);
  const b = run('--agents', '2', '--previous', first, '--output', second);
  assert.equal(b.status, 0, b.stderr);
  const firstPlan = JSON.parse(await readFile(first, 'utf8'));
  const secondPlan = JSON.parse(await readFile(second, 'utf8'));
  assert.equal(firstPlan.approved_catalog_sha256, approved);
  assert.equal(secondPlan.approved_catalog_sha256, approved);
  assert.equal(secondPlan.agents_previously_planned, 2);
  assert.equal(secondPlan.agents_total_planned, 4);
  const combined = [...firstPlan.slots, ...secondPlan.slots];
  assert.equal(new Set(combined.map(s => s.issue)).size, 4);
  assert.equal(new Set(combined.map(s => s.session_id)).size, 4);
  assert.equal(new Set(combined.map(s => s.resource_partition)).size, 4);
  for (const output of [a.stdout, b.stdout]) {
    assert.doesNotMatch(output, /astrological-charts|alpha-90|chat-|catalog\.json|vs-private-wave/);
    assert.equal(JSON.parse(output).claims_acquired, false);
  }
});

test('CLI rejects duplicate previous plans, altered SHA and oversubscription without creating output', async t => {
  const { dir, run } = await fixture(t);
  const first = join(dir, 'wave-01.json'), missing = join(dir, 'missing.json');
  assert.equal(run('--agents', '2', '--output', first).status, 0);
  const doubled = run('--agents', '2', '--previous', first, '--previous', first, '--output', missing);
  assert.equal(doubled.status, 2);
  assert.equal(doubled.stdout, '');
  await assert.rejects(readFile(missing), /ENOENT/);
  const original = JSON.parse(await readFile(first, 'utf8'));
  await writeFile(first, JSON.stringify({ ...original, approved_catalog_sha256: '0'.repeat(64) }));
  const altered = run('--agents', '2', '--previous', first, '--output', missing);
  assert.equal(altered.status, 2);
  await assert.rejects(readFile(missing), /ENOENT/);
  await writeFile(first, JSON.stringify(original));
  const newPlan = join(dir, 'wave-02.json');
  assert.equal(run('--agents', '2', '--previous', first, '--output', newPlan).status, 0);
  const exhausted = run('--agents', '2', '--previous', first, '--previous', newPlan, '--output', missing);
  assert.equal(exhausted.status, 2);
  await assert.rejects(readFile(missing), /ENOENT/);
});

test('CLI refuses symlinked previous file, missing approval and overwriting a plan', async t => {
  const { dir, env, run } = await fixture(t);
  const first = join(dir, 'wave-01.json');
  assert.equal(run('--agents', '2', '--output', first).status, 0);
  assert.equal(run('--agents', '2', '--output', first).status, 2);
  const link = join(dir, 'alias.json');
  await symlink(first, link);
  assert.equal(run('--agents', '2', '--previous', link, '--output', join(dir, 'next.json')).status, 2);
  const noApproval = { ...env };
  delete noApproval.VS_PRIVATE_TASKS_APPROVED_SHA256;
  const result = spawnSync(process.execPath, [cli, '--agents', '2',
    '--output', join(dir, 'unapproved.json')], { env: noApproval, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stderr, /astrological-charts|catalog\.json|PRIVATE_TASKS_FILE/);
  await assert.rejects(readFile(join(dir, 'unapproved.json')), /ENOENT/);
});
