import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalVerifiedWaveReport,
  sameVerifiedWaveReport
} from '../src/offline-wave-evidence.mjs';

// Test with independently verified aggregate-shaped reports; the caller must
// run verifyWaveReport() before invoking this order-independent comparator.
const evidence = Object.freeze({
  schema_version: '1-offline-fleet-stress',
  mode: 'synthetic-single-process-only',
  verdict: 'synthetic-stress-pass',
  requested_agents: 20,
  arrival_batch_sizes: [10, 10],
  earlier_session_resumes_verified: 10,
  unique_claims: 20,
  remaining_issue_claims: 0,
  remaining_resource_locks: 0,
  synthetic_ledger_mutations: 120,
  real_github_requests: 0,
  automatic_merges_or_deploys: 0
});

test('equal aggregate reports compare equal despite different property insertion order', () => {
  const reordered = Object.fromEntries(Object.entries(evidence).reverse());
  assert.equal(sameVerifiedWaveReport(evidence, reordered), true);
  assert.equal(canonicalVerifiedWaveReport(evidence), canonicalVerifiedWaveReport(reordered));
});

test('actual differences in any aggregate metric still fail comparison', () => {
  for (const field of Object.keys(evidence)) {
    const value = field === 'arrival_batch_sizes' ? [20] :
      typeof evidence[field] === 'number' ? evidence[field] + 1 :
      evidence[field] + '-changed';
    assert.equal(sameVerifiedWaveReport(evidence, {...evidence, [field]: value}), false, field);
  }
});

test('optional verified no-reopen diagnostics and missing fields also matter', () => {
  assert.equal(sameVerifiedWaveReport(evidence,
    {...evidence, synthetic_adapter_recreated: false}), false);
  const missing = {...evidence};
  delete missing.unique_claims;
  assert.equal(sameVerifiedWaveReport(evidence, missing), false);
});

test('reject non-report arguments and accessor metadata without invoking it', () => {
  for (const value of [null, [], 1, 'report', new Date()]) {
    assert.throws(() => canonicalVerifiedWaveReport(value), /Invalid verified synthetic wave report/);
  }
  const accessor = {...evidence};
  Object.defineProperty(accessor, 'dangerous', {enumerable: true, get() {
    throw new Error('must never read accessor');
  }});
  assert.throws(() => canonicalVerifiedWaveReport(accessor),
    /Invalid verified synthetic wave descriptor/);
});
