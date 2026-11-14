import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildReport, reportMarkdown, boardMarkdown } from '../src/agent-report.mjs';

const fleet = JSON.parse(await readFile(new URL('../config/agent-fleet.json', import.meta.url), 'utf8'));
const cfg = name => fleet.repos.find(r => r.name.endsWith(name));
const SINCE = '2026-11-14T18:00:00Z', UNTIL = '2026-11-14T20:00:00Z';
const SHA = 'a'.repeat(40), A = 'chat-aaaaaaaa', B = 'chat-bbbbbbbb';
const url = n => `https://api.github.com/repos/x/y/issues/${n}`;

test('report counts markers, merges, sessions and flags violations', () => {
  const eph = cfg('VirgoStars-Ephemeris');
  const repos = [{
    config: eph,
    comments: [
      { body: `AGENT-REVIEW session=${B} head=${SHA} verdict=approve\nok`, issue_url: url(1) },
      { body: `AGENT-REVIEW session=${A} head=${SHA} verdict=approve`, issue_url: url(2) },
      { body: `AGENT-TRIAGE session=${B} verdict=close`, issue_url: url(3) },
      { body: 'AGENT-REVIEW session=bob head=1 verdict=approve', issue_url: url(4) },
      { body: 'just a normal comment', issue_url: url(5) },
    ],
    prs: [
      { number: 1, body: `Agent-Session: ${A}`, base: 'dev/ephemeris', created_at: '2026-11-14T10:00:00Z' },
      { number: 2, body: `Agent-Session: ${A}`, base: 'dev/ephemeris', created_at: '2026-11-14T10:00:00Z' },
      { number: 9, body: 'no session', base: 'dev/ephemeris', created_at: '2026-11-14T19:00:00Z' },
    ],
    closedPrs: [
      { number: 7, body: '', base: 'dev/ephemeris', created_at: '2026-11-13T00:00:00Z', merged_at: '2026-11-14T19:00:00Z', closed_at: '2026-11-14T19:00:00Z' },
      { number: 8, body: '', base: 'main', created_at: '2026-11-13T00:00:00Z', merged_at: '2026-11-14T19:10:00Z', closed_at: '2026-11-14T19:10:00Z' },
      { number: 6, body: '', base: 'dev/ephemeris', created_at: '2026-11-13T00:00:00Z', merged_at: null, closed_at: '2026-11-14T18:30:00Z' },
    ],
    newIssues: [{ number: 50, body: `Agent-Session: ${B}` }],
  }];
  const claims = { 'k/1': [{ session: B, attempt: 1, claimed_at: '2026-11-14T18:30:00Z' }], 'k/2': [{ session: A, attempt: 1, claimed_at: '2026-11-14T10:00:00Z' }] };
  const rep = buildReport({ fleet, since: SINCE, until: UNTIL, repos, claims });
  const [r] = rep.repos;
  assert.deepEqual([r.reviews, r.approvals, r.triage, r.merged, r.closed_unmerged, r.new_prs, r.new_issues], [2, 2, 1, 2, 1, 1, 1]);
  assert.equal(rep.claims, 1);
  assert.deepEqual(Object.keys(rep.sessions).sort(), [A, B]);
  assert.equal(rep.sessions[B].reviews, 1);
  const kinds = rep.violations.map(v => v.kind).sort();
  assert.deepEqual(kinds, ['malformed-marker', 'merged-into-default-not-integration', 'self-review']);
  assert.equal(r.prs_outside_runbook, 1);
  const md = reportMarkdown(rep);
  assert.match(md, /Rule violations/);
  assert.match(md, /\| VirgoStars-Ephemeris \| 2 \(2 approve\) \|/);
});

test('board markdown renders every repo', () => {
  const md = boardMarkdown({ generated_at: UNTIL, live_claims: 1, next_for_new_chat: { step: 'C' },
    repos: [{ repo: 'Cesare-ml/X', open_prs: 3, draft_prs: 1, stacked_prs: 0, wip_limit: 2, over_wip: true,
      eligible_tasks: 0, awaiting_review: 2, mergeable_by_agents: [], owner_merge_queue: [4] }] });
  assert.match(md, /\| X \| 3 \(1 draft, 0 stacked\) \| 2 ⚠️ \| 0 \| 2 \| – \| 4 \|/);
});

test('CLI parses --markdown as a boolean flag and validates --hours before any network call', async () => {
  const { execFile } = await import('node:child_process');
  const run = args => new Promise(res => execFile(process.execPath, ['bin/vs-agent.mjs', ...args],
    { cwd: new URL('..', import.meta.url), env: { ...process.env, GITHUB_TOKEN: '' } }, (err, out, errOut) => res(String(errOut))));
  assert.match(await run(['fleet-report', '--markdown', '--hours', '0']), /--hours must be between/);
  assert.match(await run(['next-work', '--session', 'chat-XYZ']), /Session must look like chat-xxxxxxxx/);
});
