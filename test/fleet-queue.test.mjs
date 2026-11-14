import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadClaimsFromDir, loadMarkerComments, loadSnapshot } from '../src/agent-github.mjs';
import { expiredClaimFolders } from '../src/agent-ledger.mjs';

const fleet = JSON.parse(await readFile(new URL('../config/agent-fleet.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-14T20:00:00Z');
const hoursAgo = h => new Date(NOW - h * 3600_000).toISOString();
const root = new URL('..', import.meta.url).pathname;

async function writeClaim(dir, repo, key, attempt, rec) {
  await mkdir(join(dir, 'claims', repo, key), { recursive: true });
  await writeFile(join(dir, 'claims', repo, key, `${attempt}.json`), JSON.stringify(rec));
}

test('claims load from a local ledger checkout and expire by their latest attempt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  await writeClaim(dir, 'Cesare-ml__R', 'issue-1', 1, { session: 'chat-aaaaaaaa', claimed_at: hoursAgo(10) });
  await writeClaim(dir, 'Cesare-ml__R', 'issue-1', 2, { session: 'chat-bbbbbbbb', claimed_at: hoursAgo(1) });
  await writeClaim(dir, 'Cesare-ml__R', 'issue-2', 1, { session: 'chat-aaaaaaaa', claimed_at: hoursAgo(7) });
  await writeFile(join(dir, 'claims', 'Cesare-ml__R', 'issue-2', 'notes.txt'), 'ignored');
  await writeClaim(dir, 'Cesare-ml__R', 'issue-3', 1, 'not json{');
  await writeFile(join(dir, 'claims', 'Cesare-ml__R', 'issue-3', '1.json'), 'not json{');
  const claims = await loadClaimsFromDir(dir);
  assert.deepEqual(Object.keys(claims).sort(), ['Cesare-ml__R/issue-1', 'Cesare-ml__R/issue-2']);
  assert.equal(claims['Cesare-ml__R/issue-1'].length, 2);
  assert.deepEqual(expiredClaimFolders(claims, NOW), ['Cesare-ml__R/issue-2'], 'issue-1 has a recent attempt, so it stays');
  assert.deepEqual(await loadClaimsFromDir(join(dir, 'missing')), {});
});

const fakeGet = routes => async path => {
  for (const [re, val] of routes) if (re.test(path)) return typeof val === 'function' ? val(path) : val;
  throw new Error('unexpected GET ' + path);
};

test('marker comments are fetched repo-wide and grouped by issue', async () => {
  const get = fakeGet([[/issues\/comments\?since=/, [
    { body: 'AGENT-REVIEW session=chat-aaaaaaaa head=x verdict=approve', issue_url: 'https://api.github.com/repos/o/r/issues/5' },
    { body: 'plain comment', issue_url: 'https://api.github.com/repos/o/r/issues/5' },
    { body: '  AGENT-TRIAGE session=chat-aaaaaaaa verdict=close', issue_url: 'https://api.github.com/repos/o/r/issues/6' },
  ]]]);
  const m = await loadMarkerComments(get, 'o/r', NOW);
  assert.deepEqual([...m.keys()], [5, 6]);
  assert.equal(m.get(5).length, 1);
});

test('snapshot uses one comments listing per repo, not one call per PR', async () => {
  const calls = [];
  const sha = 'a'.repeat(40);
  const one = { ...fleet, repos: [fleet.repos.find(r => r.name.endsWith('Event-Ephemeris'))] };
  const get = async path => {
    calls.push(path);
    if (/\/pulls\?state=open/.test(path)) return Array.from({ length: 30 }, (_, i) => ({ number: i + 1, draft: false, base: { ref: 'main' }, head: { sha }, body: '', updated_at: '2026-11-01T00:00:00Z', comments: 3 }));
    if (/issues\/comments\?since=/.test(path)) return [];
    if (/\/issues\?state=open/.test(path)) return [];
    throw new Error('unexpected ' + path);
  };
  const snap = await loadSnapshot({ fleet: one, get, now: NOW, claims: {} });
  assert.equal(snap.repos[0].prs.length, 30);
  assert.equal(calls.length, 3, calls.join('\n'));
});

test('fleet-publish.sh archives only expired folders and publishes the queue branch', async () => {
  const base = await mkdtemp(join(tmpdir(), 'pub-'));
  const sh = (cmd, cwd = base) => execFileSync('bash', ['-c', cmd], { cwd, env: { ...process.env, GITHUB_TOKEN: 'x', GITHUB_REPOSITORY: 'o/r', FLEET_REMOTE: join(base, 'remote.git') } }).toString();
  sh('git init -q --bare remote.git && git init -q -b agent-ledger seed');
  const seed = join(base, 'seed');
  await writeClaim(seed, 'Cesare-ml__R', 'old', 1, { session: 'chat-aaaaaaaa', claimed_at: new Date(Date.now() - 9 * 3600_000).toISOString() });
  await writeClaim(seed, 'Cesare-ml__R', 'new', 1, { session: 'chat-aaaaaaaa', claimed_at: new Date().toISOString() });
  sh('git add . && git -c user.name=t -c user.email=t@t commit -qm seed && git push -q ../remote.git agent-ledger', seed);
  sh(`git clone -q --depth 1 --branch agent-ledger file://${join(base, 'remote.git')} ledger`);
  sh('git -C ledger remote set-url origin "$FLEET_REMOTE"');
  const out = sh(`${root}scripts/fleet-publish.sh archive ${join(base, 'ledger')}`);
  assert.match(out, /archive: removed 1/);
  const tree = sh('git -C remote.git ls-tree -r --name-only agent-ledger');
  assert.match(tree, /claims\/Cesare-ml__R\/new\/1\.json/);
  assert.doesNotMatch(tree, /old/);
  assert.match(sh(`${root}scripts/fleet-publish.sh archive ${join(base, 'ledger')}`), /nothing expired/);
  await writeFile(join(base, 'q.json'), '{"schema":"virgostars-agent-queue/1"}');
  sh(`${root}scripts/fleet-publish.sh queue ${join(base, 'q.json')}`);
  sh(`${root}scripts/fleet-publish.sh queue ${join(base, 'q.json')}`);
  assert.match(sh('git -C remote.git show agent-queue:queue.json'), /agent-queue\/1/);
  assert.equal(sh('git -C remote.git rev-list --count agent-queue').trim(), '1', 'queue branch keeps a single commit');
});

test('fleet-queue workflow writes only through the publish script and pins actions', async () => {
  const y = await readFile(new URL('../.github/workflows/fleet-queue.yml', import.meta.url), 'utf8');
  assert.match(y, /^permissions:\n  contents: write$/m);
  assert.doesNotMatch(y, /\b(?:issues|pull-requests|actions|id-token|packages|deployments): write/);
  assert.doesNotMatch(y, /\$\{\{\s*(?:secrets|vars)\./i);
  assert.doesNotMatch(y, /\b(?:pull_request_target|pull_request|workflow_run|repository_dispatch)\s*:/);
  assert.match(y, /^\s+persist-credentials: false$/m);
  for (const a of [...y.matchAll(/^\s+uses:\s+(\S+)/gm)].map(x => x[1])) assert.match(a, /^actions\/(?:checkout|setup-node)@[0-9a-f]{40}$/);
  const runs = [...y.matchAll(/^\s+run:\s+(.+)$/gm)].map(x => x[1]);
  assert.equal(runs.length, 4);
  assert.match(runs[0], /^git clone --quiet --depth 1 --branch agent-ledger /);
  assert.match(runs[1], /^node bin\/vs-agent\.mjs fleet-queue --ledger-dir /);
  assert.match(runs[2], /^scripts\/fleet-publish\.sh queue /);
  assert.match(runs[3], /^scripts\/fleet-publish\.sh archive /);
  const script = await readFile(new URL('../scripts/fleet-publish.sh', import.meta.url), 'utf8');
  const pushes = [...script.matchAll(/push[^\n]*/g)].map(m => m[0]).filter(l => /\bpush -q/.test(l));
  assert.deepEqual(pushes.map(l => l.match(/(agent-\w+)/)[1]), ['agent-queue', 'agent-ledger']);
});
