// Read-only activity report: what fleet agents did in a time window, plus rule violations.
import { parseMarker, authorSession, SESSION_RE, integrationBranch } from './agent-work.mjs';
import { loadClaims } from './agent-github.mjs';

const MARKERS = ['AGENT-REVIEW', 'AGENT-TRIAGE', 'AGENT-READY-TO-MERGE'];

async function pages(get, path, max = 10) {
  const out = [];
  for (let page = 1; page <= max; page++) {
    const batch = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/** Pure part: classify raw GitHub records into a report. */
export function buildReport({ fleet, since, until, repos, claims }) {
  const sessions = {};
  const bump = (s, k) => { const e = (sessions[s] ??= { reviews: 0, triage: 0, ready_to_merge: 0, prs: 0, issues: 0, claims: 0 }); e[k]++; };
  const violations = [];
  const perRepo = [];
  for (const r of repos) {
    const cfg = r.config, name = cfg.name;
    const prAuthor = new Map(r.prs.map(p => [p.number, authorSession(p.body)]));
    const row = { repo: name, reviews: 0, approvals: 0, triage: 0, ready_to_merge: 0, merged: 0, closed_unmerged: 0, new_prs: 0, prs_outside_runbook: 0, new_issues: 0 };
    for (const c of r.comments) {
      const tag = MARKERS.find(t => String(c.body).trimStart().startsWith(t));
      if (!tag) continue;
      const m = parseMarker(c.body, tag) ?? {};
      const target = Number(String(c.issue_url ?? '').split('/').pop());
      if (!SESSION_RE.test(m.session ?? '')) { violations.push({ repo: name, kind: 'malformed-marker', item: target, url: c.html_url }); continue; }
      if (tag === 'AGENT-REVIEW') {
        row.reviews++; bump(m.session, 'reviews');
        if (m.verdict === 'approve') row.approvals++;
        if (!/^[0-9a-f]{40}$/.test(m.head ?? '')) violations.push({ repo: name, kind: 'review-without-full-head-sha', item: target, url: c.html_url });
        if (prAuthor.get(target) && prAuthor.get(target) === m.session) violations.push({ repo: name, kind: 'self-review', item: target, session: m.session, url: c.html_url });
      } else if (tag === 'AGENT-TRIAGE') { row.triage++; bump(m.session, 'triage'); }
      else { row.ready_to_merge++; bump(m.session, 'ready_to_merge'); }
    }
    for (const p of r.closedPrs) {
      if (p.merged_at && p.merged_at >= since) {
        row.merged++;
        if (p.base !== integrationBranch(cfg) && p.base === cfg.default_branch)
          violations.push({ repo: name, kind: 'merged-into-default-not-integration', item: p.number });
      } else if (p.closed_at >= since) row.closed_unmerged++;
    }
    const openAtStart = r.prs.filter(p => p.created_at < since).length;
    for (const p of [...r.prs, ...r.closedPrs].filter(p => p.created_at >= since)) {
      row.new_prs++;
      const s = authorSession(p.body);
      if (s) bump(s, 'prs');
      else row.prs_outside_runbook++;
      if (openAtStart >= cfg.wip_limit && s)
        violations.push({ repo: name, kind: 'new-pr-while-over-wip', item: p.number, session: s });
    }
    for (const i of r.newIssues) { row.new_issues++; const s = authorSession(i.body); if (s) bump(s, 'issues'); }
    perRepo.push(row);
  }
  let claimCount = 0;
  for (const list of Object.values(claims)) for (const c of list) {
    if (c.claimed_at >= since && c.claimed_at <= until) { claimCount++; if (SESSION_RE.test(c.session ?? '')) bump(c.session, 'claims'); }
  }
  return { since, until, active_sessions: Object.keys(sessions).length, claims: claimCount, repos: perRepo, sessions, violations };
}

export async function loadReport({ fleet, get, hours = 2, now = Date.now(), claims = null }) {
  const since = new Date(now - hours * 3600_000).toISOString();
  const until = new Date(now).toISOString();
  const repos = [];
  for (const config of fleet.repos) {
    const n = config.name;
    const comments = await pages(get, `repos/${n}/issues/comments?since=${since}`);
    const map = p => ({ number: p.number, body: p.body ?? '', base: p.base.ref, created_at: p.created_at, merged_at: p.merged_at, closed_at: p.closed_at });
    const prs = (await pages(get, `repos/${n}/pulls?state=open`)).map(map);
    const closedPrs = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await get(`repos/${n}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
      closedPrs.push(...batch.map(map));
      if (batch.length < 100 || batch.at(-1).updated_at < since) break;
    }
    const newIssues = (await pages(get, `repos/${n}/issues?state=all&since=${since}`, 3))
      .filter(i => !i.pull_request && i.created_at >= since).map(i => ({ number: i.number, body: i.body ?? '' }));
    repos.push({ config, comments, prs, closedPrs, newIssues });
  }
  claims ??= await loadClaims(get, fleet.ledger);
  return buildReport({ fleet, since, until, repos, claims });
}

export function boardMarkdown(board) {
  const rows = board.repos.map(r => `| ${r.repo.split('/')[1]} | ${r.open_prs} (${r.draft_prs} draft, ${r.stacked_prs ?? 0} stacked) | ${r.wip_limit}${r.over_wip ? ' ⚠️' : ''} | ${r.eligible_tasks} | ${r.awaiting_review} | ${r.mergeable_by_agents.join(', ') || '–'} | ${r.owner_merge_queue.join(', ') || '–'} |`);
  return [`## Fleet board — ${board.generated_at}`, '',
    '| Repo | Open PRs | WIP limit | Ready tasks | Awaiting review | Agent-mergeable | Owner merge queue |',
    '|---|---|---|---|---|---|---|', ...rows, '',
    `Live claims: ${board.live_claims}. Next step for a new chat: \`${JSON.stringify(board.next_for_new_chat)}\``, ''].join('\n');
}

export function reportMarkdown(rep) {
  const rows = rep.repos.map(r => `| ${r.repo.split('/')[1]} | ${r.reviews} (${r.approvals} approve) | ${r.triage} | ${r.ready_to_merge} | ${r.merged} | ${r.closed_unmerged} | ${r.new_prs} (${r.prs_outside_runbook} outside runbook) | ${r.new_issues} |`);
  const sess = Object.entries(rep.sessions).map(([s, e]) => `| ${s} | ${e.claims} | ${e.reviews} | ${e.triage} | ${e.ready_to_merge} | ${e.prs} | ${e.issues} |`);
  const viol = rep.violations.map(v => `- **${v.kind}** · ${v.repo.split('/')[1]} #${v.item}${v.session ? ` · ${v.session}` : ''}`);
  return [`## Fleet activity ${rep.since} → ${rep.until}`, '',
    `Active sessions: **${rep.active_sessions}** · claims: **${rep.claims}** · rule violations: **${rep.violations.length}** · new PRs without \`Agent-Session\` (owner or chats not following the runbook): **${rep.repos.reduce((n, r) => n + r.prs_outside_runbook, 0)}**`, '',
    '| Repo | Reviews | Triage | Ready-to-merge | Merged | Closed unmerged | New PRs | New issues |', '|---|---|---|---|---|---|---|---|', ...rows, '',
    ...(sess.length ? ['| Session | Claims | Reviews | Triage | Ready | PRs | Issues |', '|---|---|---|---|---|---|---|', ...sess, ''] : []),
    ...(viol.length ? ['### Rule violations', ...viol, ''] : []), ''].join('\n');
}
