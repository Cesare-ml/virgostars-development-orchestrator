import {createHash} from 'node:crypto';
// Read-only (GET) GitHub snapshot builder for the agent work ladder.
// Token optional (GITHUB_TOKEN); unauthenticated calls hit GitHub's 60/hour limit quickly.
import { reviewsAtHead } from './agent-work.mjs';

export function makeGet({ token = process.env.GITHUB_TOKEN, fetchImpl = globalThis.fetch } = {}) {
  return async function get(path, { allow404 = false } = {}) {
    const res = await fetchImpl(`https://api.github.com/${path}`, {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
        ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub GET ${path} -> ${res.status}`);
    return res.json();
  };
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

const CLAIM_SHA = /^[0-9a-f]{40}$/i;
const CLAIM_SESSION = /^chat-[0-9a-f]{8}$/;
const CLAIM_KEY_PATTERNS = {
  develop: /^issue-[1-9][0-9]*$/,
  review: /^review-pr-[1-9][0-9]*-[a-f0-9]{7}$/,
  merge: /^merge-pr-[1-9][0-9]*$/,
  triage: /^triage-pr-[1-9][0-9]*$/,
  plan: /^plan-[0-9]{10}$/
};

function parseAgentClaim(raw, directory, key, attempt) {
  let record;
  try { record = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(raw)); }
  catch { throw new Error('Malformed agent-ledger claim JSON; reconcile the ledger.'); }
  const millis = Date.parse(record?.claimed_at);
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      Object.keys(record).sort().join('|') !== 'attempt|claimed_at|key|repo|session|step' ||
      !CLAIM_SESSION.test(record.session) ||
      !Object.hasOwn(CLAIM_KEY_PATTERNS, record.step) ||
      !CLAIM_KEY_PATTERNS[record.step].test(key) ||
      record.key !== key || record.attempt !== attempt ||
      typeof record.repo !== 'string' ||
      !/^[a-z\d][a-z\d._-]*\/[a-z\d][a-z\d._-]*$/i.test(record.repo) ||
      record.repo.replace('/', '__') !== directory ||
      !Number.isFinite(millis) || typeof record.claimed_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(record.claimed_at) ||
      new Date(millis).toISOString().slice(0, 19) !== record.claimed_at.slice(0, 19))
    throw new Error('Malformed agent-ledger claim identity, time, or generation.');
  return record;
}

/** GET-only snapshot, pinned to one commit; never treat corruption as no lock. */
export async function loadClaims(get, ledger) {
  if (!ledger || typeof ledger.repo !== 'string' ||
      !/^[a-z\d][a-z\d._-]*\/[a-z\d][a-z\d._-]*$/i.test(ledger.repo) ||
      ledger.branch !== 'agent-ledger' || ledger.root !== 'claims')
    throw new Error('Invalid agent-ledger configuration.');
  const base = 'repos/' + ledger.repo;
  const refPath = base + '/git/ref/heads/' + ledger.branch;
  const ref = await get(refPath);
  const head = ref?.object?.sha;
  if (ref?.object?.type !== 'commit' || !CLAIM_SHA.test(head ?? ''))
    throw new Error('Agent-ledger branch missing or unverifiable.');
  const commit = await get(base + '/git/commits/' + head);
  const treeSha = commit?.tree?.sha;
  if (commit?.sha !== head || !CLAIM_SHA.test(treeSha ?? ''))
    throw new Error('Agent-ledger commit tree cannot be verified.');
  const tree = await get(base + '/git/trees/' + treeSha + '?recursive=1');
  if (tree?.sha !== treeSha || tree.truncated !== false ||
      !Array.isArray(tree.tree) || tree.tree.length > 5000)
    throw new Error('Agent-ledger tree is incomplete or truncated.');
  const claims = {}, seen = new Set();
  const pattern = /^claims\/([^/]+)\/([^/]+)\/([1-9][0-9]*)\.json$/;
  for (const item of tree.tree) {
    if (!item || typeof item.path !== 'string')
      throw new Error('Malformed agent-ledger Git entry.');
    if ((item.path.toLowerCase() === 'claims' && item.path !== 'claims') ||
        (item.path.toLowerCase().startsWith('claims/') &&
         !item.path.startsWith('claims/')))
      throw new Error('Noncanonical case alias of agent-ledger claim root.');
    if (item.path === 'claims/README.md') {
      if (item.type !== 'blob' || item.mode !== '100644')
        throw new Error('Unexpected ledger README metadata.');
      continue;
    }
    if (item.path === 'claims') {
      if (item.type !== 'tree') throw new Error('Unexpected ledger root.');
      continue;
    }
    if (!item.path.startsWith('claims/')) continue;
    const parts = item.path.split('/');
    if (item.type === 'tree') {
      if ((parts.length !== 2 && parts.length !== 3) ||
          parts.some(p => !p || p === '.' || p === '..'))
        throw new Error('Unexpected ledger directory.');
      continue;
    }
    const match = item.path.match(pattern);
    if (!match || item.type !== 'blob' || item.mode !== '100644' ||
        !CLAIM_SHA.test(item.sha ?? '') ||
        !Number.isSafeInteger(item.size) || item.size < 1 || item.size > 8192)
      throw new Error('Unexpected ledger claim path or blob.');
    const folded = item.path.toLowerCase();
    if (seen.has(folded)) throw new Error('Duplicate ledger claim path.');
    seen.add(folded);
    const attempt = Number(match[3]);
    if (!Number.isSafeInteger(attempt) || attempt > 100000)
      throw new Error('Invalid ledger claim attempt.');
    const blob = await get(base + '/git/blobs/' + item.sha);
    if (blob?.encoding !== 'base64' || blob.sha !== item.sha ||
        blob.size !== item.size || typeof blob.content !== 'string')
      throw new Error('Agent-ledger blob metadata inconsistent.');
    const base64 = blob.content.replace(/\s/g, '');
    if (!base64 || base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
      throw new Error('Malformed ledger claim base64.');
    const raw = Buffer.from(base64, 'base64');
    if (raw.length !== item.size || raw.toString('base64') !== base64 ||
        createHash('sha1').update('blob ' + raw.length + '\0').update(raw).digest('hex') !== item.sha)
      throw new Error('Agent-ledger blob hash mismatch.');
    const record = parseAgentClaim(raw, match[1], match[2], attempt);
    (claims[match[1] + '/' + match[2]] ??= []).push(record);
  }
  for (const entries of Object.values(claims)) {
    entries.sort((a, b) => a.attempt - b.attempt);
    if (entries.some((record, i) => record.attempt !== i + 1))
      throw new Error('Agent-ledger claim generation gap.');
  }
  const latest = await get(refPath);
  if (latest?.object?.type !== 'commit' || latest.object.sha !== head)
    throw new Error('Agent-ledger branch moved during snapshot.');
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
        pr.files = (await pages(get, `repos/${name}/pulls/${p.number}/files`)).map(f => f.filename);
        pr.mergeable = (await get(`repos/${name}/pulls/${p.number}`)).mergeable;
        if (pr.mergeable === null) { // GitHub computes mergeability lazily; ask once more
          await new Promise(r => setTimeout(r, 2000));
          pr.mergeable = (await get(`repos/${name}/pulls/${p.number}`)).mergeable;
        }
        if (config.ci) pr.ci = await ciState(get, name, p.head.sha);
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
