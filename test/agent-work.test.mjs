import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nextWork as nextWorkRandom, workQueue, workCandidates, mergeGate, fleetBoard, parseMarker, authorSession, eligibleIssues, claimState }
  from '../src/agent-work.mjs';

const nextWork = (s, o = {}) => nextWorkRandom(s, { rng: () => 0, ...o });
const fleet = JSON.parse(await readFile(new URL('../config/agent-fleet.json', import.meta.url), 'utf8'));
const cfg = name => fleet.repos.find(r => r.name.endsWith(name));
const NOW = Date.parse('2026-11-14T20:00:00Z');
const ME = 'chat-aaaaaaaa', OTHER = 'chat-bbbbbbbb', THIRD = 'chat-cccccccc';
const SHA = 'a'.repeat(40);

const pr = (n, o = {}) => ({ number: n, draft: false, base: 'main', head_sha: SHA, body: '', ci: 'success',
  mergeable: true, files: ['src/x.rs'], comments: [], updated_at: '2026-11-10T00:00:00Z', ...o });
const epr = (n, o = {}) => pr(n, { base: 'dev/ephemeris', ...o });
const approve = (s = OTHER, head = SHA) => ({ body: `AGENT-REVIEW session=${s} head=${head} verdict=approve\nok` });
const snap = (repos, o = {}) => ({ fleet, now: NOW, session: ME, claims: {}, repos, ...o });
const repo = (name, prs = [], issues = []) => ({ config: cfg(name), prs, issues });

test('fleet config is well formed', () => {
  assert.equal(fleet.schema, 'virgostars-agent-fleet/1');
  assert.equal(fleet.ledger.branch, 'agent-ledger');
  for (const r of fleet.repos) {
    assert.match(r.name, /^Cesare-ml\//);
    assert.ok(['ci+review', 'docs-only'].includes(r.merge));
    assert.ok(r.wip_limit > 0 && Number.isInteger(r.priority));
    if (r.ci) assert.ok(r.ci_allowed);
  }
  assert.equal(new Set(fleet.repos.map(r => r.priority)).size, fleet.repos.length);
});

test('markers and sessions parse', () => {
  assert.deepEqual(parseMarker(approve().body, 'AGENT-REVIEW'), { session: OTHER, head: SHA, verdict: 'approve' });
  assert.equal(authorSession(`Closes #4\nAgent-Session: ${ME}\n`), ME);
  assert.equal(authorSession('Agent-Session: chat-XYZ'), null);
});

test('merge gate: needs approval at current head from another session and green CI', () => {
  const r = cfg('VirgoStars-Ephemeris');
  assert.deepEqual(mergeGate(epr(1), r, ME).reasons, ['no-approval-at-head']);
  assert.ok(mergeGate(epr(1, { comments: [approve()] }), r, ME).ok);
  assert.ok(mergeGate(epr(1, { comments: [approve(OTHER, 'b'.repeat(40))] }), r, ME).reasons.includes('no-approval-at-head'));
  assert.ok(mergeGate(epr(1, { comments: [approve()], ci: 'pending' }), r, ME).reasons.includes('ci-pending'));
  assert.ok(mergeGate(epr(1, { comments: [approve()], body: `Agent-Session: ${ME}` }), r, ME).reasons.includes('own-pr'));
  const selfApproved = epr(1, { comments: [approve(OTHER)], body: `Agent-Session: ${OTHER}` });
  assert.ok(mergeGate(selfApproved, r, ME).reasons.includes('no-approval-at-head'));
  const changes = { body: `AGENT-REVIEW session=${THIRD} head=${SHA} verdict=changes` };
  assert.ok(mergeGate(epr(1, { comments: [approve(), changes] }), r, ME).reasons.includes('changes-requested'));
  assert.ok(mergeGate(epr(1, { comments: [approve()], base: 'feat/x' }), r, ME).reasons.includes('base-not-integration'));
  assert.ok(mergeGate(epr(1, { comments: [approve()], base: 'main' }), r, ME).reasons.includes('base-not-integration'),
    'agents never merge into the protected default branch of Ephemeris');
});

test('docs-only repos and protected files go to the owner merge queue', () => {
  const charts = cfg('astrological-charts');
  assert.equal(mergeGate(pr(1, { comments: [approve()], ci: null }), charts, ME).ownerMerge, true);
  assert.equal(mergeGate(pr(1, { comments: [approve()], ci: null, files: ['docs/a.md', 'README.md'] }), charts, ME).ownerMerge, false);
  const eph = cfg('VirgoStars-Ephemeris');
  assert.equal(mergeGate(epr(1, { comments: [approve()], files: ['.github/workflows/ci.yml'] }), eph, ME).ownerMerge, true);
  assert.equal(mergeGate(epr(1, { comments: [approve()], files: ['AGENTS.md'] }), eph, ME).ownerMerge, true);
});

test('ladder: integrate before review before develop', () => {
  const issues = [{ number: 7, title: 'P1 · something' }];
  let w = nextWork(snap([repo('VirgoStars-Ephemeris', [epr(2), epr(3, { comments: [approve()] })], issues)]));
  assert.deepEqual([w.step, w.action, w.pr], ['B', 'merge', 3]);
  w = nextWork(snap([repo('VirgoStars-Ephemeris', [epr(2)], issues)]));
  assert.deepEqual([w.step, w.pr, w.key], ['C', 2, 'review-pr-2-aaaaaaa']);
  w = nextWork(snap([repo('VirgoStars-Ephemeris', [], issues)]));
  assert.deepEqual([w.step, w.issue, w.key], ['E', 7, 'issue-7']);
});

test('a chat never reviews its own PR', () => {
  const w = nextWork(snap([repo('VirgoStars-Ephemeris', [epr(2, { body: `Agent-Session: ${ME}` })], [])]));
  assert.notEqual(w.step, 'C');
});

test('docs-only approved code PR gets marked ready-to-merge once', () => {
  const p = pr(4, { comments: [approve()], ci: null });
  let w = nextWork(snap([repo('astrological-charts', [p], [])]));
  assert.deepEqual([w.step, w.action], ['B', 'mark-ready-to-merge']);
  p.comments.push({ body: `AGENT-READY-TO-MERGE session=${OTHER} head=${SHA}` });
  w = nextWork(snap([repo('astrological-charts', [p], [])]));
  assert.notEqual(w.action, 'mark-ready-to-merge');
});

test('over-WIP repos are triaged and get no new development', () => {
  const r = cfg('VirgoStars-Event-Ephemeris');
  const drafts = Array.from({ length: r.wip_limit + 1 }, (_, i) => pr(100 + i, { draft: true }));
  const w = nextWork(snap([repo('VirgoStars-Event-Ephemeris', drafts, [{ number: 1, title: 'P0 · x' }])]));
  assert.deepEqual([w.step, w.action, w.pr], ['D', 'triage', 100]);
});

test('recently updated drafts are not triaged', () => {
  const r = cfg('VirgoStars-Event-Ephemeris');
  const drafts = Array.from({ length: r.wip_limit + 1 }, (_, i) => pr(100 + i, { draft: true, updated_at: '2026-11-14T19:30:00Z' }));
  assert.notEqual(nextWork(snap([repo('VirgoStars-Event-Ephemeris', drafts, [])])).step, 'D');
});

test('live claims of others are respected, expired ones can be taken over', () => {
  const issues = [{ number: 7, title: 'P0 · a' }, { number: 8, title: 'P1 · b' }];
  const claims = { 'Cesare-ml__VirgoStars-Ephemeris/issue-7': [{ session: OTHER, attempt: 1, claimed_at: '2026-11-14T19:00:00Z' }] };
  let w = nextWork(snap([repo('VirgoStars-Ephemeris', [], issues)], { claims }));
  assert.equal(w.issue, 8);
  claims['Cesare-ml__VirgoStars-Ephemeris/issue-7'][0].claimed_at = '2026-11-14T15:00:00Z';
  w = nextWork(snap([repo('VirgoStars-Ephemeris', [], issues)], { claims }));
  assert.equal(w.issue, 7);
  assert.equal(claimState(claims, 'Cesare-ml/VirgoStars-Ephemeris', 'issue-7', 180, NOW).nextAttempt, 2);
});

test('own live claim is resumed first', () => {
  const claims = { 'Cesare-ml__astrological-charts/issue-5': [{ session: ME, attempt: 1, claimed_at: '2026-11-14T19:30:00Z' }] };
  const w = nextWork(snap([repo('VirgoStars-Ephemeris', [epr(2)], []), repo('astrological-charts', [], [{ number: 5, title: 'x' }])], { claims }));
  assert.deepEqual([w.step, w.action, w.issue], ['A', 'resume', 5]);
});

test('eligibility: owner topics, blocking labels, linked PRs and only_labels', () => {
  const issues = [
    { number: 1, title: 'P0 · Audit public artwork rights' },
    { number: 2, title: 'P0 · fix', labels: ['owner-only'] },
    { number: 3, title: 'P1 · has PR' },
    { number: 4, title: 'plain task' },
    { number: 5, title: 'P0 · first' },
  ];
  const r = repo('astrological-assets', [pr(9, { body: 'Closes #3' })], issues);
  assert.deepEqual(eligibleIssues(r, snap([r])).map(i => i.number), [5, 4]);
  const orch = repo('virgostars-development-orchestrator', [], [{ number: 1, title: 'P0 x' }, { number: 2, title: 'y', labels: ['bug'] }]);
  assert.deepEqual(eligibleIssues(orch, snap([orch])).map(i => i.number), [2]);
});

test('there is always something to do: plan, then audit', () => {
  let w = nextWork(snap([repo('VirgoStars-Ephemeris', [], [])]));
  assert.deepEqual([w.step, w.repo, w.key], ['F', 'Cesare-ml/VirgoStars-Ephemeris', 'plan-2026111420']);
  const claims = { 'Cesare-ml__VirgoStars-Ephemeris/plan-2026111420': [{ session: OTHER, attempt: 1, claimed_at: '2026-11-14T19:59:00Z' }] };
  w = nextWork(snap([repo('VirgoStars-Ephemeris', [], [])], { claims }));
  assert.equal(w.step, 'G');
});

test('board summarises queues', () => {
  const [b] = fleetBoard(snap([repo('VirgoStars-Ephemeris', [epr(1, { comments: [approve()] }), epr(2, { draft: true })], [{ number: 3, title: 'P0' }])]));
  assert.deepEqual(b.mergeable_by_agents, [1]);
  assert.equal(b.draft_prs, 1);
  assert.equal(b.eligible_tasks, 1);
});

test('runbook prompt and key rules stay in sync with the code', async () => {
  const runbook = await readFile(new URL('../AGENT_START.md', import.meta.url), 'utf8');
  for (const s of ['agent-ledger', 'AGENT-REVIEW session=', 'AGENT-TRIAGE session=', 'AGENT-READY-TO-MERGE session=',
    'Agent-Session:', 'review-pr-<N>-<first 7 chars of head SHA>', 'merge-pr-<N>', 'issue-<N>', 'plan-<YYYYMMDDHH>'])
    assert.ok(runbook.includes(s), s);
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const prompt = readme.match(/<!-- prompt -->\s*>\s*(.+)/)?.[1];
  assert.ok(prompt, 'README must contain the start prompt');
  assert.ok(prompt.trim().split(/\s+/).length <= 18, 'prompt must be at most 18 words');
  assert.match(prompt, /AGENT_START\.md/);
});

test('issue #175: unknown mergeability or file list never passes the gate', () => {
  const r = cfg('VirgoStars-Ephemeris'), charts = cfg('astrological-charts');
  assert.ok(mergeGate(epr(1, { comments: [approve()], mergeable: null }), r, ME).reasons.includes('mergeable-unknown'));
  assert.ok(mergeGate(epr(1, { comments: [approve()], mergeable: undefined }), r, ME).reasons.includes('mergeable-unknown'));
  for (const files of [undefined, null, []]) {
    const g = mergeGate(pr(1, { comments: [approve()], ci: null, files }), charts, ME);
    assert.equal(g.ok, false);
    assert.ok(g.reasons.includes('files-unknown'));
  }
  const w = nextWork(snap([repo('VirgoStars-Ephemeris', [epr(3, { comments: [approve()], mergeable: null })], [])]));
  assert.notEqual(w.action, 'merge');
});

test('issue #175: a review written under the author session never counts', () => {
  const r = cfg('VirgoStars-Ephemeris');
  const g = mergeGate(epr(1, { body: `Agent-Session: ${OTHER}`, comments: [approve(OTHER)] }), r, ME);
  assert.ok(g.reasons.includes('no-approval-at-head'));
});

test('no planning in repos at or over their WIP limit', () => {
  const r = cfg('VirgoStars-Event-Ephemeris');
  const prs = Array.from({ length: r.wip_limit }, (_, i) => pr(200 + i, { draft: true, updated_at: '2026-11-14T19:59:00Z' }));
  const w = nextWork(snap([repo('VirgoStars-Event-Ephemeris', prs, [])]));
  assert.notEqual(w.step, 'F');
});

test('integration branches: Ephemeris uses dev/ephemeris, board counts stacked PRs', () => {
  assert.equal(cfg('VirgoStars-Ephemeris').integration_branch, 'dev/ephemeris');
  for (const r of fleet.repos) assert.equal(typeof r.integration_branch, 'string');
  const [b] = fleetBoard(snap([repo('VirgoStars-Ephemeris', [epr(1), epr(2, { base: 'feat/x' })], [])]));
  assert.equal(b.stacked_prs, 1);
});

test('runbook states the trust model and the stricter gate', async () => {
  const runbook = await readFile(new URL('../AGENT_START.md', import.meta.url), 'utf8');
  for (const s of ['## 8. Trust model', '`mergeable: true`', 'complete** list of changed files', 'verdict=close|finish|ready|retarget',
    'promotion is owner-only', '`integration_branch`'])
    assert.ok(runbook.includes(s), s);
});

test('herd avoidance: picks are spread over the top 10 of the first non-empty step', () => {
  const prs = Array.from({ length: 30 }, (_, i) => epr(300 + i));
  const s = snap([repo('VirgoStars-Ephemeris', prs, [])]);
  const seen = new Set();
  for (let k = 0; k < 10; k++) seen.add(nextWork(s, { rng: () => k / 10 }).pr);
  assert.deepEqual([...seen].sort(), Array.from({ length: 10 }, (_, i) => 300 + i));
  assert.equal(nextWork(s, { rng: () => 0.9999 }).pr, 309, 'never beyond the top 10');
  const real = nextWorkRandom(s);
  assert.ok(real.pr >= 300 && real.pr < 310 && real.step === 'C');
});

test('random pick never returns the session\'s own PR', () => {
  const s = snap([repo('VirgoStars-Ephemeris', [epr(1, { body: `Agent-Session: ${ME}` }), epr(2)], [])]);
  for (const x of [0, 0.5, 0.99]) assert.equal(nextWork(s, { rng: () => x }).pr, 2);
});

test('queue: session-agnostic, ordered by ladder, claimed items removed, capped per step', () => {
  const prs = [epr(1, { comments: [approve()] }), epr(2), epr(3), epr(4, { draft: true })];
  const claims = { 'Cesare-ml__VirgoStars-Ephemeris/review-pr-3-aaaaaaa': [{ session: OTHER, attempt: 1, claimed_at: '2026-11-14T19:50:00Z' }] };
  const q = workQueue(snap([repo('VirgoStars-Ephemeris', prs, [{ number: 9, title: 'P0 · x' }])], { claims }), { perStep: 50 });
  assert.equal(q.schema, 'virgostars-agent-queue/1');
  assert.deepEqual(q.steps.B.map(i => i.pr), [1]);
  assert.deepEqual(q.steps.C.map(i => i.pr), [2], 'claimed #3 and draft #4 are not offered for review');
  assert.equal(q.steps.C[0].head, 'a'.repeat(40));
  assert.deepEqual(q.steps.E.map(i => i.issue), [9]);
  assert.deepEqual(q.counts, { B: 1, C: 1, D: 0, E: 1, F: 1 });
  const many = workQueue(snap([repo('VirgoStars-Ephemeris', Array.from({ length: 20 }, (_, i) => epr(i + 1)), [])]), { perStep: 5 });
  assert.equal(many.steps.C.length, 5);
  assert.equal(many.counts.C, 20);
});

test('queue keeps own-authored PRs (filtered by each chat), candidates for a session drop them', () => {
  const s = snap([repo('VirgoStars-Ephemeris', [epr(1, { body: `Agent-Session: ${ME}` })], [])]);
  assert.equal(workQueue(s).steps.C[0].author, ME);
  assert.equal(workCandidates(s).C.length, 0);
});
