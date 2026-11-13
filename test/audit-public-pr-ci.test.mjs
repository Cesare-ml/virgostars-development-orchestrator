import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPublicPrCi, parsePrNumbers, runCli } from '../scripts/audit-public-pr-ci.mjs';

const sha = 'a'.repeat(40);
const base = 'b'.repeat(40);
const NEXT = 'c'.repeat(40);
const repo = 'Cesare-ml/virgostars-development-orchestrator';

function pr(number = 35, patch = {}) {
  return {
    number,
    state: 'open',
    head: { repo: { full_name: repo }, sha, ref: 'feature' },
    base: { repo: { full_name: repo }, sha: base, ref: 'upstream' },
    ...patch,
  };
}
function run(id, name, opts = {}) {
  return { id, name, head_sha: sha, status: 'completed', conclusion: 'success',
    app: { slug: 'github-actions' }, ...opts };
}
function runs(items = [run(1, 'Node 20 · tests'), run(2, 'Node 22 · tests')], total_count = items.length) {
  return { total_count, check_runs: items };
}

function transport({ first = pr(), last = first, third = first, pages = [runs()], checkScans = null, status = 200 } = {}) {
  const calls = [];
  let reads = 0;
  const request = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method, 'GET');
    assert.equal(new URL(url).hostname, 'api.github.com');
    assert.equal('Authorization' in options.headers, false);
    if (url.includes('/pulls/')) {
      reads++;
      return { ok: status === 200, json: async () => reads === 1 ? first : reads === 2 ? last : third };
    }
    const page = Number(new URL(url).searchParams.get('page'));
    assert.match(url, /\/commits\/[a-f0-9]{40}\/check-runs\?/);
    const scanPages = checkScans?.[reads - 1] ?? pages;
    return { ok: status === 200, json: async () => scanPages[page - 1] };
  };
  return { request, calls };
}

test('current commit requires Node 20 and Node 22 exact successful GitHub Actions checks', async () => {
  const t = transport();
  const report = await auditPublicPrCi([35], t);
  assert.equal(report.exit_code, 0);
  assert.equal(report.results[0].evidence_complete, true);
  assert.equal(report.merge_authorized, false);
  assert.equal(t.calls.length, 5);
});

test('missing Node 22 is blocked, not green', async () => {
  const t = transport({ pages: [runs([run(1, 'Node 20 · tests')])] });
  const report = await auditPublicPrCi([35], t);
  assert.equal(report.exit_code, 2);
  assert.equal(report.results[0].node22, 'missing');
});

test('failed check is blocked', async () => {
  const t = transport({ pages: [runs([run(1, 'Node 20 · tests', { conclusion: 'failure' }), run(2, 'Node 22 · tests')])] });
  assert.equal((await auditPublicPrCi([35], t)).results[0].node20, 'not_successful');
});

test('pending check is blocked', async () => {
  const t = transport({ pages: [runs([run(1, 'Node 20 · tests', { status: 'in_progress', conclusion: null }), run(2, 'Node 22 · tests')])] });
  assert.equal((await auditPublicPrCi([35], t)).results[0].node20, 'pending');
});

test('check from another commit cannot count', async () => {
  const t = transport({ pages: [runs([run(1, 'Node 20 · tests', { head_sha: NEXT }), run(2, 'Node 22 · tests')])] });
  assert.equal((await auditPublicPrCi([35], t)).results[0].node20, 'wrong_sha');
});

test('third-party check with matching name is not trusted', async () => {
  const t = transport({ pages: [runs([run(1, 'Node 20 · tests', { app: { slug: 'other' } }), run(2, 'Node 22 · tests')])] });
  assert.equal((await auditPublicPrCi([35], t)).results[0].node20, 'untrusted');
});

test('duplicate matching checks are ambiguous and block', async () => {
  const t = transport({ pages: [runs([run(1, 'Node 20 · tests'), run(2, 'Node 20 · tests'), run(3, 'Node 22 · tests')])] });
  const report = await auditPublicPrCi([35], t);
  assert.deepEqual(report.results[0].blockers, ['AMBIGUOUS_REQUIRED_CHECK']);
});

test('PR HEAD and BASE moving during scan fails closed', async () => {
  const t = transport({ last: pr(35, { base: { repo: { full_name: repo }, sha: NEXT, ref: 'upstream' } }) });
  await assert.rejects(auditPublicPrCi([35], t), { code: 'PR_SNAPSHOT_DRIFT' });
  const u = transport({ last: pr(35, { head: { repo: { full_name: repo }, sha: NEXT, ref: 'feature' } }) });
  await assert.rejects(auditPublicPrCi([35], u), { code: 'PR_SNAPSHOT_DRIFT' });
});

test('fork PR and closed PR are excluded', async () => {
  const t = transport({ first: pr(35, { head: { repo: { full_name: 'other/fork' }, sha, ref: 'feature' } }) });
  await assert.rejects(auditPublicPrCi([35], t), { code: 'PR_SCOPE_INVALID' });
  const u = transport({ first: pr(35, { state: 'closed' }) });
  await assert.rejects(auditPublicPrCi([35], u), { code: 'PR_SCOPE_INVALID' });
});

test('incomplete or duplicate pages fail closed', async () => {
  const t = transport({ pages: [runs([run(1, 'Node 20 · tests')], 2)] });
  await assert.rejects(auditPublicPrCi([35], t), { code: 'INCOMPLETE_CHECK_INVENTORY' });
  const many = Array.from({ length: 100 }, (_, index) => run(index + 1, `extra ${index}`));
  const u = transport({ pages: [runs(many, 101), runs([run(1, 'Node 22 · tests')], 101)] });
  await assert.rejects(auditPublicPrCi([35], u), { code: 'DUPLICATE_CHECK_RUN_ID' });
});

test('complete multi-page inventory can pass', async () => {
  const many = Array.from({ length: 100 }, (_, index) => run(index + 1, `extra ${index}`));
  const t = transport({ pages: [runs(many, 102), runs([run(101, 'Node 20 · tests'), run(102, 'Node 22 · tests')], 102)] });
  assert.equal((await auditPublicPrCi([35], t)).exit_code, 0);
});


test('mid-audit CI status change fails closed even with an unchanged PR HEAD', async () => {
  const t = transport({checkScans: [
    [runs()],
    [runs([run(1, 'Node 20 · tests', { conclusion: 'failure' }), run(2, 'Node 22 · tests')])],
  ]});
  await assert.rejects(auditPublicPrCi([35], t), {code: 'CHECK_SNAPSHOT_DRIFT'});
});

test('mid-audit check-run creation or deletion fails closed', async () => {
  const t = transport({checkScans: [
    [runs()],
    [runs([run(1, 'Node 20 · tests')])],
  ]});
  await assert.rejects(auditPublicPrCi([35], t), {code: 'CHECK_SNAPSHOT_DRIFT'});
});

test('mid-audit check app swap fails closed', async () => {
  const t = transport({checkScans: [
    [runs()],
    [runs([run(1, 'Node 20 · tests', {app: {slug: 'other'}}), run(2, 'Node 22 · tests')])],
  ]});
  await assert.rejects(auditPublicPrCi([35], t), {code: 'CHECK_SNAPSHOT_DRIFT'});
});

test('different pagination ordering of the same check runs is stable', async () => {
  const t = transport({checkScans: [
    [runs([run(1, 'Node 20 · tests'), run(2, 'Node 22 · tests')])],
    [runs([run(2, 'Node 22 · tests'), run(1, 'Node 20 · tests')])],
  ]});
  assert.equal((await auditPublicPrCi([35], t)).exit_code, 0);
});

test('PR HEAD change during second check pass is blocked by third PR read', async () => {
  const t = transport({third: pr(35, {
    head: {repo: {full_name: repo}, sha: NEXT, ref: 'feature'}
  })});
  await assert.rejects(auditPublicPrCi([35], t), {code: 'PR_SNAPSHOT_DRIFT'});
});

test('API denial never publishes response payload or secrets', async () => {
  const t = transport({ status: 403 });
  let stdout = '', stderr = '';
  const result = await runCli(['35'], { request: t.request,
    stdout: { write: chunk => { stdout += chunk; } },
    stderr: { write: chunk => { stderr += chunk; } },
  });
  assert.equal(result, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /API_READ_FAILED/);
  assert.doesNotMatch(stderr, /token|secret/i);
});

test('CLI rejects unsafe, repeated or excessive PR numbers', async () => {
  for (const nums of [[], ['0'], ['01'], ['-1'], ['1', '1'], ['abc'], Array(9).fill('1')]) {
    assert.throws(() => parsePrNumbers(nums), { code: 'INVALID_ARGUMENTS' });
  }
  assert.deepEqual(parsePrNumbers(['1','999']), [1,999]);
});

test('help is offline, outputs only usage and requests nothing', async () => {
  let output = '';
  const code = await runCli(['--help'], {
    request: async () => { throw Error('network not allowed'); },
    stdout: { write: value => { output += value; } },
  });
  assert.equal(code, 0);
  assert.match(output, /Usage:/);
});
