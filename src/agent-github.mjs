// Read-only (GET) GitHub snapshot builder for the agent work ladder.
// Token optional (GITHUB_TOKEN); unauthenticated calls hit GitHub's 60/hour limit quickly.
import { reviewsAtHead } from './agent-work.mjs';
import { collectFleetMergeEvidence } from './agent-merge-evidence.mjs';

export function makeGet({ token = process.env.GITHUB_TOKEN, fetchImpl = globalThis.fetch } = {}) {
  const get = async function get(path, { allow404 = false } = {}) {
    const res = await fetchImpl('https://api.github.com/' + path, {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
        ...(token ? { authorization: 'Bearer ' + token } : {}) },
      redirect: 'error'
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error('GitHub read-only request failed: HTTP ' + res.status);
    return res.json();
  };
  // Only a locally held token can establish an authenticated REST transport;
  // it does not prove a chat-to-reviewer binding or effective branch rules.
  Object.defineProperty(get, 'authenticated', { value: typeof token === 'string' && !!token.trim() });
  return get;
}

async function pages(get, path) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function ciState(get, repo, sha) {
  const runs = await get(`repos/${repo}/commits/${sha}/check-runs?per_page=100`);
  const list = runs.check_runs ?? [];
  if (!list.length) return 'missing';
  if (list.some(r => r.status !== 'completed')) return 'pending';
  return list.every(r => ['success', 'neutral', 'skipped'].includes(r.conclusion)) ? 'success' : 'failure';
}

export async function loadClaims(get, ledger) {
  const tree = await get(`repos/${ledger.repo}/git/trees/${encodeURIComponent(ledger.branch)}?recursive=1`, { allow404: true });
  const claims = {};
  if (!tree) return claims;
  const re = new RegExp(`^${ledger.root}/([^/]+/[^/]+)/(\\d+)\\.json$`);
  for (const item of tree.tree ?? []) {
    const m = item.type === 'blob' && item.path.match(re);
    if (!m) continue;
    const blob = await get(`repos/${ledger.repo}/git/blobs/${item.sha}`);
    try {
      const rec = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'));
      (claims[m[1]] ??= []).push({ ...rec, attempt: Number(m[2]) });
    } catch { /* malformed claim: ignored, counts as no claim */ }
  }
  return claims;
}

export async function loadSnapshot({ fleet, get, session = null, now = Date.now(), deep = true }) {
  const repos = [];
  for (const config of fleet.repos) {
    const name = config.name;
    const rawPrs = await pages(get, `repos/${name}/pulls?state=open`);
    const prs = [];
    for (const p of rawPrs) {
      const pr = { number: p.number, draft: p.draft, base: p.base.ref, head_sha: p.head.sha, body: p.body ?? '',
        updated_at: p.updated_at, comments: [], files: [], ci: null, mergeable: null };
      if (deep && p.comments !== 0) pr.comments = await pages(get, `repos/${name}/issues/${p.number}/comments`);
      if (deep && reviewsAtHead(pr).some(r => r.verdict === 'approve')) {
        // A marker is only a reason to *inspect*, never authentication.
        // Any denied, malformed, racing or partial GitHub read leaves the
        // merge candidate blocked and the rest of the fleet-board usable.
        if (get.authenticated !== true) {
          pr.evidence = { kind: 'anonymous-unverified' };
        } else {
          try {
            Object.assign(pr, await collectFleetMergeEvidence({
              get, repository: name, listing: p, ci: config.ci
            }));
          } catch {
            pr.evidence = { kind: 'incomplete-or-stale-github-evidence' };
            pr.mergeable = null;
            pr.ci = 'missing';
          }
        }
      }
      prs.push(pr);
    }
    const issues = (await pages(get, `repos/${name}/issues?state=open`))
      .filter(i => !i.pull_request)
      .map(i => ({ number: i.number, title: i.title, labels: i.labels.map(l => l.name) }));
    repos.push({ config, prs, issues });
  }
  const claims = await loadClaims(get, fleet.ledger);
  return { fleet, now, session, claims, repos };
}
