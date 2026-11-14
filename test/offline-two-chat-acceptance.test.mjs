import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVIDENCE_SCHEMA,
  RESULT_SCHEMA,
  evaluateTwoChatAcceptance,
  emptyAcceptanceResult,
} from '../src/offline-two-chat-acceptance.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/check-two-chat-acceptance.mjs', import.meta.url));
const CHECKOUT_FILE = fileURLToPath(new URL('../package.json', import.meta.url));
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const CHECKS = [
  'exclusive_claim_verified', 'draft_pr_verified', 'scope_audit_verified',
  'no_competing_prs', 'head_sha_current', 'native_tests_verified',
  'handoff_published', 'submission_marker_verified', 'claim_released',
  'resource_released', 'independent_review_recorded',
];

function agent(session_id, task_id, resource_scope_id, pr_number, pr_head_sha) {
  return {
    session_id, task_id, resource_scope_id, pr_number, pr_head_sha,
    ...Object.fromEntries(CHECKS.map((key) => [key, true])),
  };
}
function fixture() {
  return {
    schema: EVIDENCE_SCHEMA,
    owner_checks: {
      private_ledger_verified: true,
      historic_seven_submissions_verified: true,
    },
    fleet_counters: {
      active_claims: 0, orphan_resource_locks: 0,
      ambiguous_claims: 0, stale_submissions: 0,
    },
    agents: [
      agent(ID1, 'synthetic-task-1', 'synthetic-scope-1', 101, 'a'.repeat(40)),
      agent(ID2, 'synthetic-task-2', 'synthetic-scope-2', 102, 'b'.repeat(40)),
    ],
  };
}

async function runCli(content) {
  const dir = await mkdtemp(join(tmpdir(), 'virgostars-alpha-acceptance-'));
  try {
    const filename = join(dir, 'owner-evidence.json');
    await writeFile(filename, content);
    const result = spawnSync(process.execPath, [SCRIPT, filename], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_TOKEN: 'TOKEN_DO_NOT_ECHO',
        VS_PRIVATE_LEDGER_REPO: 'REPO_DO_NOT_ECHO',
      },
    });
    return { code: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('valid synthetic two-agent attestations produce only aggregate non-authorizing output', () => {
  const out = evaluateTwoChatAcceptance(fixture());
  assert.equal(out.schema, RESULT_SCHEMA);
  assert.equal(out.evidence_source, 'owner_self_reported');
  assert.equal(out.self_reported_requirements_met, true);
  assert.equal(out.checked_sessions, 2);
  assert.equal(out.live_github_verified, false);
  assert.equal(out.ready_to_scale, false);
  assert.equal(out.operator_review_required, true);
  assert.deepEqual(out.blockers, []);
  assert.doesNotMatch(JSON.stringify(out), /synthetic|11111111|22222222|aaaa/);
});

test('a false owner requirement blocks the gate', () => {
  const item = fixture();
  item.owner_checks.private_ledger_verified = false;
  const out = evaluateTwoChatAcceptance(item);
  assert.equal(out.self_reported_requirements_met, false);
  assert.deepEqual(out.blockers, ['OWNER_PRIVATE_LEDGER_VERIFIED']);
});

test('nonzero orphan and drift counters block with fixed codes', () => {
  const item = fixture();
  item.fleet_counters.orphan_resource_locks = 1;
  item.fleet_counters.stale_submissions = 2;
  assert.deepEqual(evaluateTwoChatAcceptance(item).blockers, [
    'FLEET_ORPHAN_RESOURCE_LOCKS', 'FLEET_STALE_SUBMISSIONS',
  ]);
});

test('missing per-chat evidence blocks without echoing identifying values', () => {
  const item = fixture();
  item.agents[1].handoff_published = false;
  item.agents[1].independent_review_recorded = false;
  const out = evaluateTwoChatAcceptance(item);
  assert.deepEqual(out.blockers, [
    'AGENT_HANDOFF_PUBLISHED', 'AGENT_INDEPENDENT_REVIEW_RECORDED',
  ]);
  assert.doesNotMatch(JSON.stringify(out), /synthetic|22222222/);
});

test('duplicate session IDs are rejected even with casing variants', () => {
  const item = fixture();
  item.agents[1].session_id = ID1.toUpperCase();
  assert.ok(evaluateTwoChatAcceptance(item).blockers.includes('DUPLICATE_SESSION_ID'));
});

test('duplicate task, resource and PR identities are all rejected', () => {
  const item = fixture();
  item.agents[1].task_id = 'SYNTHETIC-TASK-1';
  item.agents[1].resource_scope_id = 'SYNTHETIC-SCOPE-1';
  item.agents[1].pr_number = 101;
  item.agents[1].pr_head_sha = 'A'.repeat(40);
  assert.deepEqual(evaluateTwoChatAcceptance(item).blockers, [
    'DUPLICATE_TASK_ID', 'DUPLICATE_RESOURCE_SCOPE_ID',
    'DUPLICATE_PR_NUMBER', 'DUPLICATE_PR_HEAD_SHA',
  ]);
});

test('wrong schema, missing fields and extra fields are invalid', () => {
  const item = fixture();
  item.schema = 'unexpected';
  assert.throws(() => evaluateTwoChatAcceptance(item), /INVALID_EVIDENCE/);
  const missing = fixture();
  delete missing.agents[0].claim_released;
  assert.throws(() => evaluateTwoChatAcceptance(missing), /INVALID_EVIDENCE/);
  const extra = fixture();
  extra.private_token = 'SENSITIVE';
  assert.throws(() => evaluateTwoChatAcceptance(extra), /INVALID_EVIDENCE/);
});

test('wrong types, invalid UUID, invalid SHA and invalid PR number are invalid', () => {
  for (const mutate of [
    (x) => { x.agents[0].session_id = ID2.replace('-4', '-1'); },
    (x) => { x.agents[0].pr_head_sha = 'a'.repeat(39); },
    (x) => { x.agents[0].pr_number = 0; },
    (x) => { x.agents[0].native_tests_verified = 'yes'; },
    (x) => { x.fleet_counters.active_claims = -1; },
    (x) => { x.fleet_counters.active_claims = 1.5; },
    (x) => { x.owner_checks.private_ledger_verified = 1; },
    (x) => { x.agents[0].task_id = 'sensitive/owner/repo'; },
  ]) {
    const item = fixture();
    mutate(item);
    assert.throws(() => evaluateTwoChatAcceptance(item), /INVALID_EVIDENCE/);
  }
});

test('reject unexpected accessors and prototype-bearing inputs', () => {
  const item = fixture();
  Object.defineProperty(item.owner_checks, 'private_ledger_verified', {
    enumerable: true, get() { throw new Error('SHOULD_NOT_RUN'); },
  });
  assert.throws(() => evaluateTwoChatAcceptance(item), /INVALID_EVIDENCE/);
  assert.throws(() => evaluateTwoChatAcceptance({ ...fixture(), agents: [fixture().agents[0]] }), /INVALID_EVIDENCE/);
  assert.throws(() => evaluateTwoChatAcceptance(Object.create({ inherited: true })), /INVALID_EVIDENCE/);
});

test('failure fallback is constant, private-safe and blocks scaling', () => {
  const out = emptyAcceptanceResult();
  assert.deepEqual(out.blockers, ['INVALID_EVIDENCE']);
  assert.equal(out.checked_sessions, 0);
  assert.equal(out.live_github_verified, false);
  assert.equal(out.ready_to_scale, false);
});

test('CLI accepts only an absolute local owner file and redacts env variables', async () => {
  const result = await runCli(JSON.stringify(fixture()));
  assert.equal(result.code, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.self_reported_requirements_met, true);
  assert.equal(out.ready_to_scale, false);
  assert.equal(result.stderr, '');
  assert.doesNotMatch(result.stdout, /TOKEN_DO_NOT_ECHO|REPO_DO_NOT_ECHO|synthetic-task/);
});

test('CLI uses nonzero code for incomplete evidence but never exposes record content', async () => {
  const item = fixture();
  item.agents[0].claim_released = false;
  const result = await runCli(JSON.stringify(item));
  assert.equal(result.code, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, ['AGENT_CLAIM_RELEASED']);
  assert.doesNotMatch(result.stdout + result.stderr, /11111111|TOKEN_DO_NOT_ECHO/);
});

test('CLI rejects malformed and oversized files with generic output', async () => {
  for (const content of ['{ "secret":"SENSITIVE_SENTINEL"', 'z'.repeat(32769)]) {
    const result = await runCli(content);
    assert.equal(result.code, 2);
    assert.deepEqual(JSON.parse(result.stdout).blockers, ['INVALID_EVIDENCE']);
    assert.doesNotMatch(result.stdout + result.stderr, /SENSITIVE_SENTINEL|TOKEN_DO_NOT_ECHO/);
  }
});


test('CLI rejects duplicate owner check even when a later true hides a false', async () => {
  const evidence = JSON.stringify(fixture()).replace(
    '"private_ledger_verified":true',
    '"private_ledger_verified":false,"private_ledger_verified":true',
  );
  const result = await runCli(evidence);
  assert.equal(result.code, 2);
  assert.deepEqual(JSON.parse(result.stdout).blockers, ['INVALID_EVIDENCE']);
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-task|TOKEN_DO_NOT_ECHO/);
});

test('CLI rejects duplicate nested agent checks with Unicode-equivalent key spellings', async () => {
  const plain = JSON.stringify(fixture()).replace(
    '"claim_released":true',
    '"claim_released":false,"claim_released":true',
  );
  const escaped = JSON.stringify(fixture()).replace(
    '"claim_released":true',
    '"claim_released":false,"\\u0063laim_released":true',
  );
  for (const content of [plain, escaped]) {
    const result = await runCli(content);
    assert.equal(result.code, 2);
    assert.deepEqual(JSON.parse(result.stdout).blockers, ['INVALID_EVIDENCE']);
    assert.doesNotMatch(result.stdout + result.stderr, /11111111|TOKEN_DO_NOT_ECHO/);
  }
});

test('CLI permits a single Unicode-escaped key without a duplicate', async () => {
  const evidence = JSON.stringify(fixture()).replace(
    '"claim_released":true',
    '"\\u0063laim_released":true',
  );
  const result = await runCli(evidence);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).self_reported_requirements_met, true);
  assert.equal(result.stderr, '');
});

test('CLI rejects duplicated fleet counter rather than accepting the final zero', async () => {
  const evidence = JSON.stringify(fixture()).replace(
    '"active_claims":0',
    '"active_claims":5,"active_claims":0',
  );
  const result = await runCli(evidence);
  assert.equal(result.code, 2);
  assert.deepEqual(JSON.parse(result.stdout).blockers, ['INVALID_EVIDENCE']);
});

test('CLI rejects checkout-local data, relative paths and extra arguments', () => {
  for (const args of [
    [CHECKOUT_FILE],
    ['relative.json'],
    [],
    [CHECKOUT_FILE, 'extra'],
  ]) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.deepEqual(JSON.parse(result.stdout).blockers, ['INVALID_EVIDENCE']);
    assert.equal(result.stderr, '');
  }
});
