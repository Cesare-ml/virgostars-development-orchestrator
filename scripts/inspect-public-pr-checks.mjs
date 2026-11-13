#!/usr/bin/env node
/**
 * Tokenless, GET-only audit of public GitHub checks on selected PR HEADs.
 * Reports observed evidence, never integration readiness or merge authority.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const PUBLIC_REPO = 'Cesare-ml/virgostars-development-orchestrator';
const SHA = /^[0-9a-f]{40}$/i;
const MAX_PRS = 12;
const MAX_RUNS = 200;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseNumbers(args) {
  assert(Array.isArray(args) && args.length >= 1 && args.length <= MAX_PRS,
    'Supply 1–12 distinct public PR numbers.');
  const numbers = args.map(raw => {
    assert(typeof raw === 'string' && /^[1-9][0-9]{0,8}$/.test(raw),
      'Invalid public PR number.');
    return Number(raw);
  });
  assert(new Set(numbers).size === numbers.length, 'Duplicate public PR number.');
  return numbers;
}

function validatePr(pr, number) {
  assert(pr && pr.number === number && pr.state === 'open' &&
    pr.merged !== true && !pr.merged_at && typeof pr.draft === 'boolean' &&
    SHA.test(pr.head?.sha || '') && SHA.test(pr.base?.sha || '') &&
    typeof pr.head?.ref === 'string' && pr.head.ref.length > 0 &&
    typeof pr.base?.ref === 'string' && pr.base.ref.length > 0 &&
    pr.head.repo?.full_name === PUBLIC_REPO &&
    pr.base.repo?.full_name === PUBLIC_REPO,
  'Incomplete or foreign public PR metadata.');
}

function validateRuns(payload) {
  assert(payload && Number.isSafeInteger(payload.total_count) &&
    payload.total_count >= 0 && payload.total_count <= MAX_RUNS &&
    Array.isArray(payload.check_runs),
  'Incomplete or excessive public check-run inventory.');
  const ids = new Set();
  for (const run of payload.check_runs) {
    assert(run && Number.isSafeInteger(run.id) && run.id > 0 &&
      typeof run.name === 'string' && run.name.length > 0 && run.name.length <= 200 &&
      typeof run.status === 'string' &&
      ['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending'].includes(run.status) &&
      (run.conclusion === null || typeof run.conclusion === 'string'),
    'Malformed public check-run metadata.');
    assert(!ids.has(run.id), 'Duplicate public check-run identifier.');
    ids.add(run.id);
  }
  assert(ids.size === payload.total_count,
    'Public check-run pagination is incomplete.');
  return payload.check_runs;
}

/** Conservative: every observed run must be completed successfully.
 * Rerun histories and non-required checks can produce review blockers.
 */
export function inspectSnapshot(pr, number, payload) {
  validatePr(pr, number);
  const runs = validateRuns(payload);
  let passed = 0, pending = 0, unsuccessful = 0;
  const names = new Set();
  let repeatedNames = 0;
  for (const run of runs) {
    if (names.has(run.name.toLowerCase())) repeatedNames++;
    names.add(run.name.toLowerCase());
    if (run.status !== 'completed') pending++;
    else if (run.conclusion === 'success') passed++;
    else unsuccessful++;
  }
  const blockers = [];
  if (runs.length === 0) blockers.push('NO_CHECK_RUNS_OBSERVED');
  if (pending) blockers.push('CHECK_RUNS_INCOMPLETE');
  if (unsuccessful) blockers.push('CHECK_RUNS_NOT_SUCCESSFUL');
  if (repeatedNames) blockers.push('AMBIGUOUS_REPEATED_CHECK_NAMES');
  return {
    pull_request: number,
    total_check_runs: runs.length,
    completed_successfully: passed,
    pending: pending,
    other_conclusions: unsuccessful,
    repeated_check_names: repeatedNames,
    blockers,
    observed_checks_all_successful: blockers.length === 0
  };
}

function prSignature(pr) {
  return JSON.stringify([
    pr.number,pr.state,pr.draft,pr.merged,pr.merged_at,
    pr.head?.sha,pr.head?.ref,pr.head?.repo?.full_name,
    pr.base?.sha,pr.base?.ref,pr.base?.repo?.full_name
  ]);
}
function runsSignature(payload) {
  const runs = validateRuns(payload);
  return JSON.stringify(runs.map(run => [run.id,run.name,run.status,run.conclusion])
    .sort((a,b) => a[0] - b[0]));
}

/** Two complete PR+check scans; a moving check or PR head fails closed. */
export async function inspectLive({numbers,getPr,getChecks}) {
  assert(Array.isArray(numbers) && numbers.length >= 1 && numbers.length <= MAX_PRS &&
    numbers.every(n => Number.isSafeInteger(n) && n > 0) &&
    new Set(numbers).size === numbers.length &&
    typeof getPr === 'function' && typeof getChecks === 'function',
  'Invalid public audit adapter or PR list.');
  const result = [];
  for (const n of numbers) {
    const beforePr = await getPr(n);
    validatePr(beforePr,n);
    const beforeChecks = await getChecks(beforePr.head.sha);
    const before = inspectSnapshot(beforePr,n,beforeChecks);
    const afterPr = await getPr(n);
    validatePr(afterPr,n);
    const afterChecks = await getChecks(afterPr.head.sha);
    const after = inspectSnapshot(afterPr,n,afterChecks);
    assert(prSignature(beforePr) === prSignature(afterPr) &&
      runsSignature(beforeChecks) === runsSignature(afterChecks),
    'PR or checks changed during public scan; rerun entire audit.');
    result.push(after);
    assert(JSON.stringify(before) === JSON.stringify(after),
      'Public check evidence changed during scan.');
  }
  return {
    schema_version:'1-public-pr-checks-audit',
    mode:'public-get-only',
    inspected_pull_requests:result.length,
    checks:result,
    all_observed_checks_successful:result.every(x=>x.observed_checks_all_successful),
    live_snapshots_stable:true,
    github_writes:0,
    required_checks_verified:false,
    independent_review_verified:false,
    merge_authorized:false,
    note:'Observed public check runs are not a branch-protection policy, review or permission to merge.'
  };
}

/** Only fixed PUBLIC repository and strictly validated PR/check paths. */
export async function fetchPublicJson(path, {request = fetch} = {}) {
  assert(/^\/pulls\/[1-9][0-9]*$/.test(path) ||
    /^\/commits\/[0-9a-f]{40}\/check-runs\?per_page=100&page=[12]$/i.test(path),
  'Invalid public-only GitHub API path.');
  const response = await request('https://api.github.com/repos/' + PUBLIC_REPO + path, {
    method:'GET',
    headers:{
      Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'VirgoStars-Public-PR-Checks-Audit'
    },
    signal:AbortSignal.timeout(12000)
  });
  assert(response?.status === 200, 'Public GitHub PR checks unavailable.');
  return response.json();
}

export async function fetchAllChecks(sha, {request = fetch} = {}) {
  assert(typeof sha === 'string' && SHA.test(sha), 'Invalid public commit SHA.');
  const merged = [], ids = new Set();
  let expected = null;
  for (let page = 1; page <= 2; page++) {
    const part = await fetchPublicJson('/commits/' + sha +
      '/check-runs?per_page=100&page=' + page, {request});
    assert(part && Number.isSafeInteger(part.total_count) &&
      part.total_count >= 0 && part.total_count <= MAX_RUNS &&
      Array.isArray(part.check_runs) && part.check_runs.length <= 100,
    'Invalid check-run page.');
    if (expected === null) expected = part.total_count;
    assert(expected === part.total_count, 'Public check-run count changed during pagination.');
    for (const run of part.check_runs) {
      assert(Number.isSafeInteger(run?.id) && !ids.has(run.id),
        'Invalid or duplicated paginated check run.');
      ids.add(run.id);
      merged.push(run);
    }
    assert(merged.length <= expected, 'Excess check-run data.');
    if (merged.length === expected) return {total_count:expected,check_runs:merged};
    assert(part.check_runs.length === 100 && page < 2,
      'Incomplete check-run pagination.');
  }
  throw new Error('Check-run inventory exceeds limit.');
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write('Public GET-only PR check audit: node scripts/inspect-public-pr-checks.mjs PR1 [PR2...]\n');
    return 0;
  }
  const numbers = parseNumbers(argv);
  const result = await inspectLive({
    numbers,
    getPr:n => fetchPublicJson('/pulls/' + n),
    getChecks:sha => fetchAllChecks(sha)
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  return result.all_observed_checks_successful ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code=>{process.exitCode=code;}).catch(()=>{
    process.stderr.write('ERROR: public check audit incomplete or invalid; nothing approved.\n');
    process.exitCode=1;
  });
}
