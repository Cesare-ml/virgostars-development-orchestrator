/**
 * Read-only snapshot evidence for the open ChatGPT agent fleet.
 *
 * Even a complete GitHub API snapshot is NOT proof that a chat session belongs
 * to an independent GitHub reviewer, that branch rules are enforced, or that
 * checks come from owner-approved apps. Those flags remain false until a
 * separately reviewed trusted adapter supplies the missing proof.
 */
const SHA = /^[0-9a-f]{40}$/i;
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX = 200;
function fail(message) { throw new Error('Fleet merge evidence incomplete: ' + message); }
const validId = x => Number.isSafeInteger(x) && x > 0;

function identity(pr) {
  if (!validId(pr?.number) || !SHA.test(pr?.head?.sha ?? '') ||
      !SHA.test(pr?.base?.sha ?? '') ||
      typeof pr?.head?.ref !== 'string' || !pr.head.ref ||
      typeof pr?.base?.ref !== 'string' || !pr.base.ref ||
      typeof pr?.head?.repo?.full_name !== 'string' ||
      typeof pr?.base?.repo?.full_name !== 'string' ||
      pr?.state !== 'open' || typeof pr?.draft !== 'boolean') fail('PR identity');
  return JSON.stringify([pr.number, pr.state, pr.draft, pr.head.sha,
    pr.base.sha, pr.head.ref, pr.base.ref,
    pr.head.repo.full_name, pr.base.repo.full_name]);
}

async function rows(get, path, idOf, label) {
  const found = [], seen = new Set();
  for (let page = 1; page <= 3; page++) {
    const chunk = await get(path + '?per_page=100&page=' + page);
    if (!Array.isArray(chunk) || chunk.length > 100 ||
        found.length + chunk.length > MAX) fail(label + ' pagination');
    for (const item of chunk) {
      const key = idOf(item);
      if (typeof key !== 'string' || !key || seen.has(key))
        fail(label + ' duplicate or missing ID');
      seen.add(key);
      found.push(item);
    }
    if (chunk.length < 100) return found;
  }
  fail(label + ' exceeds safety limit');
}
async function checkRuns(get, repo, head) {
  const found = [], seen = new Set();
  let total = null;
  for (let page = 1; page <= 3; page++) {
    const response = await get('repos/' + repo + '/commits/' + head +
      '/check-runs?per_page=100&page=' + page);
    if (!Number.isSafeInteger(response?.total_count) || response.total_count < 0 ||
        response.total_count > MAX || !Array.isArray(response.check_runs) ||
        response.check_runs.length > 100 ||
        (total !== null && total !== response.total_count))
      fail('check-run pagination');
    total = response.total_count;
    for (const run of response.check_runs) {
      if (!validId(run?.id) || seen.has(run.id) || run.head_sha !== head)
        fail('duplicate or stale check-run');
      seen.add(run.id); found.push(run);
    }
    if (found.length > total) fail('check-run count');
    if (found.length === total) {
      if (!found.length) return 'missing';
      if (found.some(r => r.status !== 'completed')) return 'pending';
      // This status is informational. Owner-required names and check App IDs
      // have not yet been verified against effective branch protection.
      return found.every(r => r.conclusion === 'success') ? 'success' : 'failure';
    }
    if (response.check_runs.length < 100) fail('check-run truncation');
  }
  fail('check-run inventory too large');
}

export async function collectFleetMergeEvidence({ get, repository, listing, ci = false } = {}) {
  if (typeof get !== 'function' || !REPO.test(repository ?? '') ||
      !validId(listing?.number)) fail('request parameters');
  const path = 'repos/' + repository + '/pulls/' + listing.number;
  const before = await get(path);
  if (identity(before) !== identity(listing) ||
      before.base.repo.full_name !== repository ||
      before.head.repo.full_name !== repository ||
      !validId(before.user?.id) || !Number.isSafeInteger(before.changed_files) ||
      before.changed_files < 1 || before.changed_files > MAX)
    fail('initial PR snapshot');

  const [files, reviews, comments, ciResult] = await Promise.all([
    rows(get, path + '/files', f => typeof f?.filename === 'string' ?
      f.filename.toLowerCase() : '', 'changed files'),
    rows(get, path + '/reviews', r => validId(r?.id) ? String(r.id) : '', 'reviews'),
    rows(get, 'repos/' + repository + '/issues/' + listing.number + '/comments',
      c => validId(c?.id) ? String(c.id) : '', 'comments'),
    ci ? checkRuns(get, repository, before.head.sha) : Promise.resolve(null)
  ]);
  if (files.length !== before.changed_files) fail('changed file count');
  if (reviews.some(r => !validId(r?.user?.id) ||
      typeof r?.state !== 'string' ||
      (r.state === 'APPROVED' && !SHA.test(r.commit_id ?? ''))))
    fail('invalid GitHub review');
  if (comments.some(c => !validId(c?.user?.id) || typeof c.body !== 'string'))
    fail('invalid GitHub comment');

  const after = await get(path);
  if (identity(after) !== identity(before) ||
      after.changed_files !== before.changed_files ||
      after.user?.id !== before.user.id ||
      after.mergeable !== before.mergeable)
    fail('PR changed while collecting evidence');

  return {
    number: after.number, base: after.base.ref, base_sha: after.base.sha,
    head_sha: after.head.sha, draft: after.draft, mergeable: after.mergeable,
    body: after.body ?? '', author_id: after.user.id,
    changed_files: files.length, files, github_reviews: reviews, comments,
    ci: ciResult,
    evidence: {
      kind: get.authenticated === true ? 'authenticated-github' : 'anonymous-github',
      head_sha: after.head.sha, base_sha: after.base.sha,
      changed_files_complete: true, reviews_complete: true, comments_complete: true,
      // DO NOT infer these from user-controlled AGENT-REVIEW marker text,
      // anonymous API results, or green-but-unpinned check-run names.
      session_principal_binding_verified: false,
      branch_protection_verified: false,
      required_head_checks_verified: false
    }
  };
}
