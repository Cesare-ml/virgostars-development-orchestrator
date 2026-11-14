import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFleetMergeEvidence } from '../src/agent-merge-evidence.mjs';
import { mergeGate } from '../src/agent-work.mjs';
import { loadSnapshot } from '../src/agent-github.mjs';

const REPO = 'Cesare-ml/virgostars-development-orchestrator';
const HEAD = 'a'.repeat(40), BASE = 'b'.repeat(40);
const marker = 'AGENT-REVIEW session=chat-1234abcd head=' + HEAD + ' verdict=approve';
const clone = value => structuredClone(value);

function fixture() {
  const pr = {
    number: 22, state: 'open', draft: false, merged: false, mergeable: true,
    changed_files: 1, body: 'Agent-Session: chat-deadbeef',
    user: { id: 1, login: 'author' },
    head: { sha: HEAD, ref: 'agent/work', repo: { full_name: REPO } },
    base: { sha: BASE, ref: 'main', repo: { full_name: REPO } }
  };
  const s = {
    pr, files: [{ filename: 'src/agent-work.mjs', status: 'modified' }],
    reviews: [{ id: 7, user: { id: 2, login: 'reviewer' },
      state: 'APPROVED', commit_id: HEAD }],
    comments: [{ id: 11, user: { id: 2, login: 'reviewer' }, body: marker }],
    checks: [{ id: 20, name: 'Node 22', head_sha: HEAD,
      status: 'completed', conclusion: 'success', app: { id: 8 } }],
    count: 0, requests: [], drift: false, denied: false
  };
  const get = async path => {
    s.requests.push(path);
    if (s.denied) throw new Error('GitHub HTTP 403');
    const query = new URL('https://api.github.com/' + path);
    const pathname = query.pathname;
    const page = Number(query.searchParams.get('page') ?? 1);
    const part = list => clone(list.slice((page - 1) * 100, page * 100));
    if (pathname.endsWith('/pulls/22')) {
      s.count++;
      const value = clone(s.pr);
      if (s.drift && s.count > 1) value.head.sha = 'c'.repeat(40);
      return value;
    }
    if (pathname.endsWith('/pulls/22/files')) return part(s.files);
    if (pathname.endsWith('/pulls/22/reviews')) return part(s.reviews);
    if (pathname.endsWith('/issues/22/comments')) return part(s.comments);
    if (pathname.endsWith('/commits/' + HEAD + '/check-runs')) {
      return { total_count: s.checks.length, check_runs: part(s.checks) };
    }
    throw new Error('Unexpected endpoint: ' + pathname);
  };
  get.authenticated = true;
  return { s, get, listing: clone(pr) };
}
async function inspect(f, ci = true) {
  return collectFleetMergeEvidence({
    get: f.get, repository: REPO, listing: f.listing, ci
  });
}
const cfg = { default_branch: 'main', merge: 'ci+review', ci: true };

test('complete authenticated GitHub reads never grant session or branch-rule verification', async () => {
  const f = fixture();
  const got = await inspect(f);
  assert.equal(got.evidence.kind, 'authenticated-github');
  assert.equal(got.files.length, 1);
  assert.equal(got.github_reviews.length, 1);
  assert.equal(got.ci, 'success');
  assert.equal(got.author_id, 1);
  assert.equal(got.evidence.session_principal_binding_verified, false);
  assert.equal(got.evidence.branch_protection_verified, false);
  assert.equal(got.evidence.required_head_checks_verified, false);
  const gate = mergeGate(got, cfg, 'chat-abcd1234');
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.includes('merge-evidence-unverified'));
  assert.equal(f.s.count, 2);
});

test('a self-authored approval marker is not an independent review', async () => {
  const f = fixture();
  f.s.comments[0].user.id = 1;
  const got = await inspect(f);
  assert.ok(mergeGate(got, cfg, 'chat-abcd1234').reasons.includes('no-approval-at-head'));
});

test('all 101 changed files and reviews are paginated and complete', async () => {
  const f = fixture();
  f.s.files = Array.from({ length: 101 }, (_, i) => ({
    filename: 'src/file-' + i + '.mjs', status: 'modified'
  }));
  f.s.pr.changed_files = 101;
  f.listing.changed_files = 101;
  f.s.reviews = Array.from({ length: 101 }, (_, i) => ({
    id: i + 1, user: { id: i + 2, login: 'reviewer' + i },
    state: 'APPROVED', commit_id: HEAD
  }));
  const got = await inspect(f);
  assert.equal(got.files.length, 101);
  assert.equal(got.github_reviews.length, 101);
  assert.equal(f.s.requests.filter(x => x.includes('/pulls/22/reviews')).length, 2);
});

test('duplicate GitHub review IDs across pages reject all merge candidacy', async () => {
  const f = fixture();
  f.s.reviews = Array.from({ length: 101 }, (_, i) => ({
    id: Math.min(i + 1, 100), user: { id: i + 2 }, state: 'APPROVED', commit_id: HEAD
  }));
  await assert.rejects(() => inspect(f), /reviews duplicate or missing ID/);
});

test('truncated changed-file inventory fails closed', async () => {
  const f = fixture();
  f.s.pr.changed_files = 2;
  f.listing.changed_files = 2;
  await assert.rejects(() => inspect(f), /changed file count/);
});

test('changed HEAD or mergeability between authenticated reads fails closed', async () => {
  const f = fixture();
  f.s.drift = true;
  await assert.rejects(() => inspect(f), /PR changed/);
});

test('stale check run at a different HEAD blocks evidence', async () => {
  const f = fixture();
  f.s.checks[0].head_sha = BASE;
  await assert.rejects(() => inspect(f), /stale check-run/);
});

test('anonymous transport cannot make an authenticated evidence receipt', async () => {
  const f = fixture();
  f.get.authenticated = false;
  const got = await inspect(f);
  assert.equal(got.evidence.kind, 'anonymous-github');
  assert.ok(mergeGate(got, cfg, 'chat-abcd1234').reasons.includes('merge-evidence-unverified'));
});

test('denied GitHub reads stop instead of manufacturing review approval', async () => {
  const f = fixture();
  f.s.denied = true;
  await assert.rejects(() => inspect(f), /HTTP 403/);
});

test('real fleet snapshot integration cannot promote marker text into merge authority', async () => {
  const f = fixture();
  const get = async path => {
    if (path.startsWith('repos/' + REPO + '/pulls?state=open')) return [clone(f.listing)];
    if (path.startsWith('repos/' + REPO + '/issues?state=open')) return [];
    if (path.includes('/git/trees/')) return null;
    return f.get(path);
  };
  get.authenticated = true;
  const fleet = {
    repos: [{ name: REPO, default_branch: 'main', priority: 9,
      merge: 'ci+review', ci: true, wip_limit: 5, only_labels: ['bug'] }],
    ledger: { repo: REPO, branch: 'agent-ledger', root: 'claims' },
    limits: { claim_ttl_minutes: { develop: 180, review: 60, merge: 30,
      triage: 60, plan: 30 }, min_ready_tasks_per_repo: 5,
      max_new_tasks_per_plan_cycle: 3 }
  };
  const snap = await loadSnapshot({ fleet, get, session: 'chat-abcd1234' });
  assert.equal(snap.repos[0].prs.length, 1);
  const item = snap.repos[0].prs[0];
  assert.equal(item.evidence.kind, 'authenticated-github');
  assert.equal(item.changed_files, 1);
  assert.equal(item.github_reviews.length, 1);
  const decision = mergeGate(item, fleet.repos[0], 'chat-abcd1234');
  assert.equal(decision.ok, false);
  assert.ok(decision.reasons.includes('merge-evidence-unverified'));
});
