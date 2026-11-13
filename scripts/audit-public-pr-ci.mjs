#!/usr/bin/env node
/**
 * Public, GET-only snapshot audit for the exact Node 20/22 check-run evidence
 * attached to explicit Orchestrator PR HEADs. Not a merge authorization.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const REPO = 'Cesare-ml/virgostars-development-orchestrator';
const API = `https://api.github.com/repos/${REPO}`;
const EXPECTED_CHECKS = Object.freeze([
  ['node20', 'Node 20 · tests'],
  ['node22', 'Node 22 · tests'],
]);
const MAX_PRS = 8;
const MAX_CHECK_RUNS = 250;
const HEX_SHA = /^[0-9a-f]{40}$/;

class AuditFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function parsePrNumbers(argv) {
  if (!Array.isArray(argv) || argv.length < 1 || argv.length > MAX_PRS) {
    throw new AuditFailure('INVALID_ARGUMENTS');
  }
  const seen = new Set();
  return argv.map(value => {
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,7}$/.test(value)) {
      throw new AuditFailure('INVALID_ARGUMENTS');
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || seen.has(number)) {
      throw new AuditFailure('INVALID_ARGUMENTS');
    }
    seen.add(number);
    return number;
  });
}

async function getJson(path, request) {
  const response = await request(`${API}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'virgostars-public-ci-audit',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response || response.ok !== true || typeof response.json !== 'function') {
    throw new AuditFailure('API_READ_FAILED');
  }
  try {
    return await response.json();
  } catch {
    throw new AuditFailure('API_READ_FAILED');
  }
}

function normalizePr(raw, expectedNumber) {
  if (!raw || raw.number !== expectedNumber || raw.state !== 'open' ||
      raw.head?.repo?.full_name !== REPO || raw.base?.repo?.full_name !== REPO ||
      !HEX_SHA.test(raw.head?.sha) || !HEX_SHA.test(raw.base?.sha) ||
      typeof raw.head?.ref !== 'string' || !raw.head.ref ||
      typeof raw.base?.ref !== 'string' || !raw.base.ref) {
    throw new AuditFailure('PR_SCOPE_INVALID');
  }
  return {
    head: raw.head.sha,
    base: raw.base.sha,
    headRef: raw.head.ref,
    baseRef: raw.base.ref,
  };
}

function sameSnapshot(a, b) {
  return a.head === b.head && a.base === b.base &&
    a.headRef === b.headRef && a.baseRef === b.baseRef;
}

async function getCompleteRuns(sha, request) {
  const result = [];
  let expected;
  const seenIds = new Set();
  for (let page = 1; page <= 3; page++) {
    const data = await getJson(`/commits/${sha}/check-runs?per_page=100&page=${page}`, request);
    if (!data || !Number.isInteger(data.total_count) ||
        data.total_count < 0 || data.total_count > MAX_CHECK_RUNS ||
        !Array.isArray(data.check_runs) || data.check_runs.length > 100 ||
        (expected !== undefined && data.total_count !== expected)) {
      throw new AuditFailure('INCOMPLETE_CHECK_INVENTORY');
    }
    expected = data.total_count;
    for (const run of data.check_runs) {
      if (!run || (typeof run.id !== 'number' && typeof run.id !== 'string') ||
          !String(run.id).match(/^[1-9][0-9]*$/) ||
          typeof run.name !== 'string' ||
          !HEX_SHA.test(run.head_sha) ||
          typeof run.status !== 'string' ||
          typeof run.conclusion !== 'string' && run.conclusion !== null ||
          typeof run.app?.slug !== 'string') {
        throw new AuditFailure('MALFORMED_CHECK_RUN');
      }
      const id = String(run.id);
      if (seenIds.has(id)) throw new AuditFailure('DUPLICATE_CHECK_RUN_ID');
      seenIds.add(id);
      result.push(run);
    }
    if (result.length > expected) throw new AuditFailure('INCOMPLETE_CHECK_INVENTORY');
    if (result.length === expected) return result;
    if (data.check_runs.length !== 100) {
      throw new AuditFailure('INCOMPLETE_CHECK_INVENTORY');
    }
  }
  throw new AuditFailure('INCOMPLETE_CHECK_INVENTORY');
}

function inspectCheck(runs, sha, checkName) {
  const matches = runs.filter(run => run.name === checkName);
  if (matches.length === 0) return { state: 'missing', blocker: 'MISSING_REQUIRED_CHECK' };
  if (matches.length !== 1) return { state: 'duplicate', blocker: 'AMBIGUOUS_REQUIRED_CHECK' };
  const [run] = matches;
  if (run.head_sha !== sha) return { state: 'wrong_sha', blocker: 'CHECK_HEAD_MISMATCH' };
  if (run.app.slug !== 'github-actions') {
    return { state: 'untrusted', blocker: 'UNEXPECTED_CHECK_APP' };
  }
  if (run.status !== 'completed') return { state: 'pending', blocker: 'CHECK_NOT_COMPLETED' };
  if (run.conclusion !== 'success') return { state: 'not_successful', blocker: 'CHECK_NOT_SUCCESSFUL' };
  return { state: 'success', blocker: null };
}

export async function auditPublicPrCi(prNumbers, { request = fetch } = {}) {
  // Revalidate here so callers cannot bypass the public CLI's input caps.
  const numbers = parsePrNumbers(prNumbers.map(String));
  if (typeof request !== 'function') throw new AuditFailure('INVALID_REQUEST');
  const results = [];
  for (const number of numbers) {
    const first = normalizePr(await getJson(`/pulls/${number}`, request), number);
    const runs = await getCompleteRuns(first.head, request);
    const second = normalizePr(await getJson(`/pulls/${number}`, request), number);
    if (!sameSnapshot(first, second)) throw new AuditFailure('PR_SNAPSHOT_DRIFT');
    const checks = Object.fromEntries(EXPECTED_CHECKS.map(([key, name]) => [
      key, inspectCheck(runs, first.head, name),
    ]));
    const blockers = [...new Set(Object.values(checks)
      .map(item => item.blocker).filter(Boolean))].sort();
    results.push({
      pr: number,
      node20: checks.node20.state,
      node22: checks.node22.state,
      evidence_complete: blockers.length === 0,
      blockers,
    });
  }
  const complete = results.every(item => item.evidence_complete);
  return {
    repository: REPO,
    status: complete ? 'node_check_evidence_complete' : 'review_required',
    merge_authorized: false,
    pr_count: results.length,
    results,
    exit_code: complete ? 0 : 2,
  };
}

export async function runCli(argv, { request = fetch, stdout = process.stdout, stderr = process.stderr } = {}) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    stdout.write('Usage: node scripts/audit-public-pr-ci.mjs PR_NUMBER [PR_NUMBER ...]\n' +
      'GET-only public GitHub Node 20/22 check evidence at current PR HEAD; no merge decision.\n');
    return 0;
  }
  try {
    const report = await auditPublicPrCi(parsePrNumbers(argv), { request });
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.exit_code;
  } catch (error) {
    // Error text from HTTP/client failures must never reach a public log.
    const code = error instanceof AuditFailure ? error.code : 'API_READ_FAILED';
    stderr.write(`${JSON.stringify({ status: 'error', code, merge_authorized: false })}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}
