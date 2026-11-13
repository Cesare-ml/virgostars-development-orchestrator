import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  WAVE_SCENARIOS, expectedEarlierResumes, verifyWaveReport,
  runOfflineWaveMatrix
} from '../src/offline-wave-matrix.mjs';

const cli = fileURLToPath(new URL(
  '../scripts/verify-offline-wave-matrix.mjs', import.meta.url
));

function fixture(waves) {
  const agents = waves.reduce((sum, size) => sum + size, 0);
  return {
    schema_version: '1-offline-fleet-stress',
    mode: 'synthetic-single-process-only',
    verdict: 'synthetic-stress-pass',
    requested_agents: agents,
    arrival_batch_sizes: [...waves],
    earlier_session_resumes_verified: expectedEarlierResumes(waves),
    earlier_claims_preserved: true,
    simulated_repositories: 5,
    unique_claims: agents,
    unique_resource_locks: agents,
    excess_contenders_denied: 3,
    synthetic_stacked_pr_submissions: agents,
    submitted_markers: agents,
    remaining_issue_claims: 0,
    remaining_resource_locks: 0,
    completed_tasks_reoffered: false,
    synthetic_ledger_mutations: 6 * agents,
    real_github_requests: 0,
    real_private_ledger_verified: false,
    real_multi_chat_concurrency_proven: false,
    automatic_merges_or_deploys: 0
  };
}

test('matrix covers asymmetric arrivals, overlap, and 40 one-at-a-time chats', () => {
  assert.equal(WAVE_SCENARIOS.length, 8);
  assert.equal(expectedEarlierResumes([2]), 0);
  assert.equal(expectedEarlierResumes([10, 10]), 10);
  assert.equal(expectedEarlierResumes([5, 10, 10, 15]), 45);
  assert.equal(expectedEarlierResumes([1, 39]), 1);
  assert.equal(expectedEarlierResumes([39, 1]), 39);
  assert.equal(expectedEarlierResumes(Array(40).fill(1)), 780);
  for (const waves of WAVE_SCENARIOS) {
    assert.ok(Object.isFrozen(waves));
    assert.deepEqual(verifyWaveReport(fixture(waves), waves), {
      agents: waves.reduce((sum, size) => sum + size, 0),
      expectedResumes: expectedEarlierResumes(waves)
    });
  }
});

test('arrival resume counter fails closed on malformed or oversized schedules', () => {
  for (const waves of [null, undefined, '10,10', {}, [], [1],
    [41], [0, 40], [-1, 3], [1.5, 1.5], [20, 21],
    [1, '1'], new Array(41).fill(1)]) {
    assert.throws(() => expectedEarlierResumes(waves), /schedule/);
  }
});

test('matrix rejects partial, contradictory and over-permissive reports', () => {
  const good = fixture([10, 10]);
  for (const field of Object.keys(good)) {
    const bad = {...good};
    delete bad[field];
    assert.throws(() => verifyWaveReport(bad, [10, 10]),
      /evidence|schedule|mutation/);
  }
  for (const [field, value] of [
    ['remaining_issue_claims', 1],
    ['remaining_resource_locks', 1],
    ['real_github_requests', 1],
    ['real_private_ledger_verified', true],
    ['real_multi_chat_concurrency_proven', true],
    ['automatic_merges_or_deploys', 1],
    ['completed_tasks_reoffered', true],
    ['earlier_claims_preserved', false],
    ['earlier_session_resumes_verified', 9],
    ['synthetic_ledger_mutations', 119]
  ]) {
    assert.throws(() => verifyWaveReport({...good, [field]: value}, [10, 10]));
  }
  assert.throws(() => verifyWaveReport({...good, arrival_batch_sizes: [20]}, [10, 10]));
  assert.throws(() => verifyWaveReport(null, [10, 10]));
});

test('injected runner receives only fixed scenarios; result hides raw session fields', async () => {
  const calls = [];
  const report = await runOfflineWaveMatrix({
    runStress: async args => {
      calls.push(args);
      return {...fixture(args.batches ?? [args.agents]),
        session_id: 'must-not-appear',
        private_task_path: 'must-not-appear'};
    }
  });
  assert.equal(calls.length, 8);
  assert.deepEqual(calls[0], {agents: 2});
  assert.deepEqual(calls.at(-1), {agents: 40, batches: Array(40).fill(1)});
  assert.equal(report.scenarios_passed, 8);
  assert.equal(report.synthetic_sessions_exercised, 262);
  assert.equal(report.earlier_session_resumes_verified, 955);
  assert.equal(report.maximum_sessions_in_one_scenario, 40);
  assert.equal(report.real_github_requests, 0);
  assert.equal(report.merge_authorized, false);
  assert.doesNotMatch(JSON.stringify(report), /must-not-appear|session_id|private_task_path/);
});

test('runner aborts rather than allowing one unsafe scenario to count as passed', async () => {
  let calls = 0;
  await assert.rejects(() => runOfflineWaveMatrix({
    runStress: async args => {
      calls++;
      return {...fixture(args.batches ?? [args.agents]),
        remaining_resource_locks: 1};
    }
  }), /remaining_resource_locks/);
  assert.equal(calls, 1);
  await assert.rejects(() => runOfflineWaveMatrix({runStress: null}),
    /Invalid synthetic stress runner/);
});

test('CLI executes the real synthetic engine with no secrets or network', {timeout: 90000}, () => {
  const env = {...process.env,
    VS_PRIVATE_LEDGER_REPO: 'sensitive-local-ledger-not-to-print',
    VS_PRIVATE_TASKS_FILE: 'sensitive-local-task-file-not-to-print'
  };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  const out = spawnSync(process.execPath, [cli], {
    env, encoding: 'utf8', timeout: 85000
  });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, '');
  const report = JSON.parse(out.stdout);
  assert.equal(report.verdict, 'synthetic-matrix-pass');
  assert.equal(report.scenarios_passed, 8);
  assert.equal(report.earlier_session_resumes_verified, 955);
  assert.equal(report.remaining_issue_claims, 0);
  assert.equal(report.remaining_resource_locks, 0);
  assert.equal(report.real_github_requests, 0);
  assert.doesNotMatch(out.stdout,
    /sensitive-local-ledger|sensitive-local-task-file|example-synthetic|chat-[0-9a-f]|coordination\/claims|GITHUB_TOKEN/);
});

test('CLI rejects unsupported arguments without running a matrix', () => {
  const out = spawnSync(process.execPath, [cli, '--agents', '40'], {
    encoding: 'utf8', timeout: 10000
  });
  assert.equal(out.status, 2);
  assert.equal(out.stdout, '');
  assert.match(out.stderr, /Usage: node scripts\/verify-offline-wave-matrix.mjs/);
});


test('repeat mode independently checks identical aggregate evidence for all scenarios', async () => {
  let calls = 0;
  const report = await runOfflineWaveMatrix({
    repeat: true,
    runStress: async args => {
      calls++;
      return fixture(args.batches ?? [args.agents]);
    }
  });
  assert.equal(calls, 16);
  assert.equal(report.scenarios_passed, 8);
  assert.equal(report.repeated_scenarios_verified, 8);
  assert.equal(report.repeat_consistency_verified, true);
  assert.equal(report.synthetic_sessions_exercised, 262);
  assert.equal(report.earlier_session_resumes_verified, 955);
  assert.equal(report.real_github_requests, 0);
});

test('repeat mode fails closed on drift after a valid second scenario result', async () => {
  let calls = 0;
  await assert.rejects(() => runOfflineWaveMatrix({
    repeat: true,
    runStress: async args => {
      calls++;
      return {
        ...fixture(args.batches ?? [args.agents]),
        // Both reports satisfy the minimum mutation count, but differ.
        synthetic_ledger_mutations: 6 * args.agents + (calls === 2 ? 1 : 0)
      };
    }
  }), /Synthetic wave repeat evidence changed/);
  assert.equal(calls, 2);
  await assert.rejects(() => runOfflineWaveMatrix({repeat: 1}),
    /Invalid synthetic wave matrix options/);
});

test('CLI --repeat validates real simulator stability without exposing private variables', {timeout: 90000}, () => {
  const env = {...process.env,
    VS_PRIVATE_LEDGER_REPO: 'private-ledger-repeat-secret',
    VS_PRIVATE_TASKS_FILE: 'private-tasks-repeat-secret'
  };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  const out = spawnSync(process.execPath, [cli, '--repeat'], {
    encoding: 'utf8', env, timeout: 85000
  });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, '');
  const report = JSON.parse(out.stdout);
  assert.equal(report.repeated_scenarios_verified, 8);
  assert.equal(report.repeat_consistency_verified, true);
  assert.equal(report.real_github_requests, 0);
  assert.equal(report.merge_authorized, false);
  assert.doesNotMatch(out.stdout,
    /private-ledger-repeat-secret|private-tasks-repeat-secret|chat-[0-9a-f]|example-synthetic|GITHUB_TOKEN/);
});

test('CLI rejects misspelled or value-bearing repeat flag', () => {
  for (const args of [['--repeats'], ['--repeat', 'true'], ['--repeat', '--repeat']]) {
    const out = spawnSync(process.execPath, [cli, ...args], {
      encoding: 'utf8', timeout: 10000
    });
    assert.equal(out.status, 2);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /Usage:/);
  }
});
