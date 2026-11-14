// Pure implementation of the AGENT_START.md work ladder (steps A–G).
// Input is a snapshot of GitHub state; output is the next action for one session.
// Used by `vs-agent fleet-board` and by tests that pin the runbook rules.

const PRIORITY_RE = /^\s*\[?P([0-2])\b/i;
const OWNER_TOPICS = /\b(licen[cs]e|licensing|rights|copyright|visibility|publish|release|deploy)/i;
const PROTECTED_PATHS = [/^\.github\/workflows\//, /(^|\/)LICENSE/i, /(^|\/)NOTICE$/, /(^|\/)CODEOWNERS$/,
  /(^|\/)AGENTS\.md$/, /^AGENT_START\.md$/, /^config\/agent-fleet\.json$/];
const BLOCKING_LABELS = new Set(['owner-only', 'blocked', 'agent-skip']);

export const SESSION_RE = /^chat-[0-9a-f]{8}$/;

export function parseMarker(text, tag) {
  const line = String(text ?? '').split(/\r?\n/).find(l => l.trim().startsWith(tag));
  if (!line) return null;
  const out = {};
  for (const m of line.matchAll(/(\w+)=(\S+)/g)) out[m[1]] = m[2];
  return out;
}

export function authorSession(body) {
  const m = String(body ?? '').match(/^Agent-Session:\s*(chat-[0-9a-f]{8})\s*$/m);
  return m ? m[1] : null;
}

export function referencedIssues(body) {
  return new Set([...String(body ?? '').matchAll(/#(\d+)\b/g)].map(m => Number(m[1])));
}

export const isDocsPath = p => /\.md$/i.test(p) || p.startsWith('docs/');
export const isProtectedPath = p => PROTECTED_PATHS.some(re => re.test(p));

export function issuePriority(issue) {
  const m = String(issue.title ?? '').match(PRIORITY_RE);
  return m ? Number(m[1]) : 3;
}

export function claimKey(step, n, sha) {
  if (step === 'review') return `review-pr-${n}-${String(sha).slice(0, 7)}`;
  if (step === 'merge') return `merge-pr-${n}`;
  if (step === 'triage') return `triage-pr-${n}`;
  if (step === 'develop') return `issue-${n}`;
  if (step === 'plan') return `plan-${n}`;
  throw new Error(`unknown step ${step}`);
}

export const integrationBranch = cfg => cfg.integration_branch ?? cfg.default_branch;

export function repoDir(repo) { return repo.replace('/', '__'); }

/** Current claim for a key = highest attempt. Live if within TTL. */
export function claimState(claims, repo, key, ttlMinutes, now) {
  const list = (claims?.[`${repoDir(repo)}/${key}`] ?? []).slice().sort((a, b) => a.attempt - b.attempt);
  const current = list.at(-1);
  if (!current) return { live: false, current: null, nextAttempt: 1 };
  const expires = Date.parse(current.claimed_at) + ttlMinutes * 60_000;
  return { live: expires > now, current, nextAttempt: current.attempt + 1 };
}

function available(ctx, repo, key, step) {
  const st = claimState(ctx.claims, repo, key, ctx.fleet.limits.claim_ttl_minutes[step], ctx.now);
  return !st.live || st.current.session === ctx.session;
}

export function reviewsAtHead(pr) {
  return (pr.comments ?? []).map(c => parseMarker(c.body, 'AGENT-REVIEW'))
    .filter(r => r && r.head === pr.head_sha);
}

export function mergeGate(pr, repoCfg, session) {
  const reasons = [];
  const author = authorSession(pr.body);
  if (pr.base !== integrationBranch(repoCfg)) reasons.push('base-not-integration');
  if (pr.draft) reasons.push('draft');
  if (pr.mergeable === false) reasons.push('conflicts');
  else if (pr.mergeable !== true) reasons.push('mergeable-unknown');
  if (author && author === session) reasons.push('own-pr');
  const reviews = reviewsAtHead(pr);
  if (!reviews.some(r => r.verdict === 'approve' && r.session !== author)) reasons.push('no-approval-at-head');
  if (reviews.some(r => r.verdict === 'changes')) reasons.push('changes-requested');
  if (repoCfg.ci && pr.ci !== 'success') reasons.push(`ci-${pr.ci ?? 'missing'}`);
  const files = Array.isArray(pr.files) ? pr.files : [];
  if (!files.length) reasons.push('files-unknown');
  const ownerOnly = files.some(isProtectedPath) ||
    (repoCfg.merge === 'docs-only' && !files.every(isDocsPath));
  return { ok: reasons.length === 0, reasons, ownerMerge: ownerOnly };
}

function readyMarked(pr) {
  return (pr.comments ?? []).some(c => parseMarker(c.body, 'AGENT-READY-TO-MERGE')?.head === pr.head_sha);
}

export function eligibleIssues(repo, ctx) {
  const cfg = repo.config;
  const linked = new Set(repo.prs.flatMap(pr => [...referencedIssues(pr.body)]));
  return repo.issues
    .filter(i => !(i.labels ?? []).some(l => BLOCKING_LABELS.has(l)))
    .filter(i => !cfg.only_labels || (i.labels ?? []).some(l => cfg.only_labels.includes(l)))
    .filter(i => !OWNER_TOPICS.test(i.title))
    .filter(i => !linked.has(i.number))
    .filter(i => available(ctx, cfg.name, claimKey('develop', i.number), 'develop'))
    .sort((a, b) => issuePriority(a) - issuePriority(b) || a.number - b.number);
}

/**
 * All open work, per ladder step, in priority order, excluding items with a live claim of another session.
 * Session-specific filtering (own PRs) applies when snapshot.session is set.
 * snapshot: { fleet, now(ms), session, claims: {"owner__repo/key":[{session,attempt,claimed_at}]},
 *             repos: [{ config, prs:[{number,draft,base,head_sha,body,ci,mergeable,files,comments,updated_at}], issues:[{number,title,labels}] }] }
 */
export function workCandidates(snapshot) {
  const ctx = snapshot;
  const repos = [...snapshot.repos].sort((a, b) => a.config.priority - b.config.priority);
  const byOldest = (a, b) => a.number - b.number;
  const steps = { B: [], C: [], D: [], E: [], F: [] };

  for (const r of repos) for (const pr of [...r.prs].sort(byOldest)) {
    const g = mergeGate(pr, r.config, ctx.session);
    if (!g.ok) continue;
    const author = authorSession(pr.body);
    if (g.ownerMerge) {
      if (!readyMarked(pr)) steps.B.push({ step: 'B', action: 'mark-ready-to-merge', repo: r.config.name, pr: pr.number, head: pr.head_sha, author });
      continue;
    }
    if (available(ctx, r.config.name, claimKey('merge', pr.number), 'merge'))
      steps.B.push({ step: 'B', action: 'merge', repo: r.config.name, pr: pr.number, head: pr.head_sha, author, key: claimKey('merge', pr.number) });
  }
  for (const r of repos) for (const pr of [...r.prs].sort(byOldest)) {
    const author = authorSession(pr.body);
    if (pr.draft || (ctx.session && author === ctx.session) || reviewsAtHead(pr).length) continue;
    const key = claimKey('review', pr.number, pr.head_sha);
    if (available(ctx, r.config.name, key, 'review'))
      steps.C.push({ step: 'C', action: 'review', repo: r.config.name, pr: pr.number, head: pr.head_sha, author, key });
  }
  for (const r of repos) {
    if (r.prs.length <= r.config.wip_limit) continue;
    const recent = ctx.now - 3 * 3600_000;
    const drafts = r.prs.filter(pr => pr.draft && !(pr.comments ?? []).some(c => parseMarker(c.body, 'AGENT-TRIAGE'))
      && Date.parse(pr.updated_at ?? 0) < recent)
      .sort((a, b) => (a.base === integrationBranch(r.config) ? 0 : 1) - (b.base === integrationBranch(r.config) ? 0 : 1) || byOldest(a, b));
    for (const pr of drafts) {
      const key = claimKey('triage', pr.number);
      if (available(ctx, r.config.name, key, 'triage'))
        steps.D.push({ step: 'D', action: 'triage', repo: r.config.name, pr: pr.number, author: authorSession(pr.body), key });
    }
  }
  for (const r of repos) {
    if (r.prs.length >= r.config.wip_limit) continue;
    for (const issue of eligibleIssues(r, ctx))
      steps.E.push({ step: 'E', action: 'develop', repo: r.config.name, issue: issue.number, priority: issuePriority(issue), key: claimKey('develop', issue.number) });
  }
  const hour = new Date(ctx.now).toISOString().slice(0, 13).replace(/[-T]/g, '');
  for (const r of repos) {
    if (r.config.only_labels || r.prs.length >= r.config.wip_limit) continue;
    if (eligibleIssues(r, ctx).length >= ctx.fleet.limits.min_ready_tasks_per_repo) continue;
    const key = claimKey('plan', hour);
    if (available(ctx, r.config.name, key, 'plan')) steps.F.push({ step: 'F', action: 'plan', repo: r.config.name, key });
  }
  return steps;
}

export const PICK_TOP = 10;

/** Next action for one session: resume first, else a random pick among the top PICK_TOP of the first non-empty step. */
export function nextWork(snapshot, { rng = Math.random, top = PICK_TOP } = {}) {
  const ctx = snapshot;
  const repos = [...snapshot.repos].sort((a, b) => a.config.priority - b.config.priority);
  for (const r of repos) for (const issue of r.issues) {
    const key = claimKey('develop', issue.number);
    const st = claimState(ctx.claims, r.config.name, key, ctx.fleet.limits.claim_ttl_minutes.develop, ctx.now);
    if (st.live && st.current.session === ctx.session)
      return { step: 'A', action: 'resume', repo: r.config.name, issue: issue.number, key };
  }
  const steps = workCandidates(snapshot);
  for (const s of ['B', 'C', 'D', 'E', 'F']) {
    const list = steps[s].filter(i => !(ctx.session && i.author === ctx.session)).slice(0, top);
    if (list.length) {
      const { author, head, priority, ...item } = list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
      return item;
    }
  }
  return { step: 'G', action: 'audit', repo: repos[0]?.config.name ?? null };
}

/** Session-agnostic queue published for chats (queue.json on branch agent-queue). */
export function workQueue(snapshot, { perStep = 100 } = {}) {
  const steps = workCandidates({ ...snapshot, session: null });
  const out = {};
  for (const [k, v] of Object.entries(steps)) out[k] = v.slice(0, perStep);
  return {
    schema: 'virgostars-agent-queue/1',
    generated_at: new Date(snapshot.now).toISOString(),
    pick: `Take the first step with items; choose one at random among its first ${PICK_TOP}; skip PRs whose author is your session; verify live state and claim before working.`,
    counts: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, v.length])),
    steps: out,
  };
}

/** Aggregate board for the owner. */
export function fleetBoard(snapshot) {
  return snapshot.repos.slice().sort((a, b) => a.config.priority - b.config.priority).map(r => {
    const gates = r.prs.map(pr => ({ pr, g: mergeGate(pr, r.config, null) }));
    return {
      repo: r.config.name,
      open_prs: r.prs.length,
      draft_prs: r.prs.filter(p => p.draft).length,
      stacked_prs: r.prs.filter(p => p.base !== integrationBranch(r.config)).length,
      wip_limit: r.config.wip_limit,
      over_wip: r.prs.length > r.config.wip_limit,
      eligible_tasks: eligibleIssues(r, { ...snapshot, session: null }).length,
      awaiting_review: r.prs.filter(p => !p.draft && !reviewsAtHead(p).length).length,
      mergeable_by_agents: gates.filter(x => x.g.ok && !x.g.ownerMerge).map(x => x.pr.number),
      owner_merge_queue: gates.filter(x => x.g.ok && x.g.ownerMerge).map(x => x.pr.number),
    };
  });
}
