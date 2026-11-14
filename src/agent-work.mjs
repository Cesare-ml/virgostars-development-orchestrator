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
  return (pr.comments ?? []).flatMap(c => {
    const marker = parseMarker(c?.body, 'AGENT-REVIEW');
    if (!marker || marker.head !== pr.head_sha) return [];
    return [{ ...marker, github_author_id: c?.user?.id ?? null, github_comment_id: c?.id ?? null }];
  });
}

// This is a fail-closed *candidate* gate. All provenance booleans below must be
// supplied by authenticated GET-only evidence collection, never by a PR body,
// AGENT-REVIEW marker, or another agent's session claim.
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const FILE_STATES = new Set(['added', 'modified', 'removed', 'renamed', 'copied', 'changed']);
function githubId(x) { return Number.isSafeInteger(x) && x > 0; }
function cleanPath(p) {
  return typeof p === 'string' && p.length > 0 && !p.startsWith('/') &&
    !p.includes('\\') && !/[\u0000-\u001f\u007f]/.test(p) &&
    p.split('/').every(s => s !== '' && s !== '.' && s !== '..');
}
function verifiedFiles(pr) {
  if (!Array.isArray(pr.files) || !Number.isSafeInteger(pr.changed_files) ||
      pr.changed_files < 1 || pr.changed_files > 200 ||
      pr.files.length !== pr.changed_files) return null;
  const names = new Set(), paths = [];
  for (const f of pr.files) {
    if (!f || !FILE_STATES.has(f.status) || !cleanPath(f.filename)) return null;
    const key = f.filename.toLowerCase();
    if (names.has(key)) return null;
    names.add(key);
    paths.push(f.filename);
    if (f.status === 'renamed' || f.status === 'copied') {
      if (!cleanPath(f.previous_filename)) return null;
      paths.push(f.previous_filename);
    } else if (f.previous_filename !== undefined) return null;
  }
  return paths;
}
export function mergeGate(pr, repoCfg, session) {
  const reasons = [];
  const author = authorSession(pr.body);
  if (pr.base !== integrationBranch(repoCfg)) reasons.push('base-not-integration');
  if (pr.draft) reasons.push('draft');
  if (pr.mergeable !== true) reasons.push('mergeable-unknown');
  if (!COMMIT_SHA.test(pr.head_sha ?? '') || !COMMIT_SHA.test(pr.base_sha ?? ''))
    reasons.push('commit-identity-unverified');
  if (!author) reasons.push('author-session-unverified');
  if (author && author === session) reasons.push('own-pr');

  const paths = verifiedFiles(pr);
  if (!paths) reasons.push('incomplete-changed-files');
  const source = pr.evidence;
  if (source?.kind !== 'authenticated-github' ||
      source.head_sha !== pr.head_sha || source.base_sha !== pr.base_sha ||
      source.changed_files_complete !== true ||
      source.reviews_complete !== true || source.comments_complete !== true ||
      source.session_principal_binding_verified !== true ||
      source.branch_protection_verified !== true ||
      source.required_head_checks_verified !== true)
    reasons.push('merge-evidence-unverified');

  // A text marker is not an authenticated approval. Its real GitHub account
  // must differ from the PR author's GitHub account, and it must match a
  // native current-commit APPROVED review from that *same* account.
  const reviews = reviewsAtHead(pr);
  const native = Array.isArray(pr.github_reviews) ? pr.github_reviews : [];
  const approvers = new Set(native.filter(r =>
    r?.state === 'APPROVED' && r?.commit_id === pr.head_sha &&
    githubId(r?.user?.id)).map(r => r.user.id));
  if (!githubId(pr.author_id)) reasons.push('author-principal-unverified');
  const independent = reviews.some(r => r.verdict === 'approve' &&
    SESSION_RE.test(r.session ?? '') && author && r.session !== author &&
    r.session !== session && githubId(r.github_author_id) &&
    r.github_author_id !== pr.author_id && githubId(r.github_comment_id) &&
    approvers.has(r.github_author_id));
  if (!independent) reasons.push('no-approval-at-head');
  if (reviews.some(r => r.verdict === 'changes') ||
      native.some(r => r?.state === 'CHANGES_REQUESTED'))
    reasons.push('changes-requested');
  if (repoCfg.ci && pr.ci !== 'success')
    reasons.push(`ci-${pr.ci ?? 'missing'}`);

  const ownerMerge = (paths ?? []).some(isProtectedPath) ||
    (repoCfg.merge === 'docs-only' && !(paths ?? []).every(isDocsPath));
  return { ok: reasons.length === 0, reasons, ownerMerge };
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
 * snapshot: { fleet, now(ms), session, claims: {"owner__repo/key":[{session,attempt,claimed_at}]},
 *             repos: [{ config, prs:[{number,draft,base,head_sha,body,ci,mergeable,files,comments,updated_at}], issues:[{number,title,labels}] }] }
 */
export function nextWork(snapshot) {
  const ctx = snapshot;
  const repos = [...snapshot.repos].sort((a, b) => a.config.priority - b.config.priority);

  // A. resume own live develop claims whose issue is still open
  for (const r of repos) for (const issue of r.issues) {
    const key = claimKey('develop', issue.number);
    const st = claimState(ctx.claims, r.config.name, key, ctx.fleet.limits.claim_ttl_minutes.develop, ctx.now);
    if (st.live && st.current.session === ctx.session)
      return { step: 'A', action: 'resume', repo: r.config.name, issue: issue.number, key };
  }
  const byOldest = (a, b) => a.number - b.number;

  // B. integrate
  for (const r of repos) for (const pr of [...r.prs].sort(byOldest)) {
    const g = mergeGate(pr, r.config, ctx.session);
    if (!g.ok) continue;
    if (g.ownerMerge) { if (!readyMarked(pr)) return { step: 'B', action: 'mark-ready-to-merge', repo: r.config.name, pr: pr.number }; continue; }
    if (available(ctx, r.config.name, claimKey('merge', pr.number), 'merge'))
      return { step: 'B', action: 'merge', repo: r.config.name, pr: pr.number, key: claimKey('merge', pr.number) };
  }
  // C. review
  for (const r of repos) for (const pr of [...r.prs].sort(byOldest)) {
    if (pr.draft || authorSession(pr.body) === ctx.session || reviewsAtHead(pr).length) continue;
    const key = claimKey('review', pr.number, pr.head_sha);
    if (available(ctx, r.config.name, key, 'review')) return { step: 'C', action: 'review', repo: r.config.name, pr: pr.number, key };
  }
  // D. triage over-WIP repos
  for (const r of repos) {
    if (r.prs.length <= r.config.wip_limit) continue;
    const recent = ctx.now - 3 * 3600_000;
    const drafts = r.prs.filter(pr => pr.draft && !(pr.comments ?? []).some(c => parseMarker(c.body, 'AGENT-TRIAGE'))
      && Date.parse(pr.updated_at ?? 0) < recent)
      .sort((a, b) => (a.base === integrationBranch(r.config) ? 0 : 1) - (b.base === integrationBranch(r.config) ? 0 : 1) || byOldest(a, b));
    for (const pr of drafts) {
      const key = claimKey('triage', pr.number);
      if (available(ctx, r.config.name, key, 'triage')) return { step: 'D', action: 'triage', repo: r.config.name, pr: pr.number, key };
    }
  }
  // E. develop
  for (const r of repos) {
    if (r.prs.length >= r.config.wip_limit) continue;
    const [issue] = eligibleIssues(r, ctx);
    if (issue) return { step: 'E', action: 'develop', repo: r.config.name, issue: issue.number, key: claimKey('develop', issue.number) };
  }
  // F. plan
  const hour = new Date(ctx.now).toISOString().slice(0, 13).replace(/[-T]/g, '');
  for (const r of repos) {
    if (r.config.only_labels || r.prs.length >= r.config.wip_limit) continue;
    if (eligibleIssues(r, ctx).length >= ctx.fleet.limits.min_ready_tasks_per_repo) continue;
    const key = claimKey('plan', hour);
    if (available(ctx, r.config.name, key, 'plan')) return { step: 'F', action: 'plan', repo: r.config.name, key };
  }
  // G. audit
  return { step: 'G', action: 'audit', repo: repos[0]?.config.name ?? null };
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
