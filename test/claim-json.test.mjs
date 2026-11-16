import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUniqueKeyJsonObject } from '../src/claim-json.mjs';

const canonical = {
  session: 'chat-a7e4b921',
  key: 'issue-184',
  repo: 'Cesare-ml/virgostars-development-orchestrator',
  step: 'develop',
  claimed_at: '2026-11-15T10:30:44.761Z',
  attempt: 1,
};

const keyOverride = (first, second) =>
  '{"' + first + '":"obsolete","' + second + '":"chat-a7e4b921","key":"issue-184","repo":"Cesare-ml/virgostars-development-orchestrator","step":"develop","claimed_at":"2026-11-15T10:30:44.761Z","attempt":1}';

test('accepts canonical six-key agent claim unchanged', () => {
  assert.deepEqual(parseUniqueKeyJsonObject(JSON.stringify(canonical)), canonical);
});

test('rejects exact and Unicode-escaped aliases of the same key', () => {
  assert.throws(() => parseUniqueKeyJsonObject(keyOverride('session', 'session')), /duplicate JSON member/);
  assert.throws(() => parseUniqueKeyJsonObject(keyOverride('session', '\\u0073ession')), /duplicate JSON member/);
});

test('rejects duplicate lease timestamp and attempt members', () => {
  for (const property of ['claimed_at', 'attempt']) {
    const pairs = property === 'attempt' ? '"attempt":0,"attempt":1' : '"claimed_at":"old","claimed_at":"new"';
    assert.throws(() => parseUniqueKeyJsonObject('{' + pairs + '}'), /duplicate JSON member/);
  }
});

test('rejects duplicates in nested objects and in arrays', () => {
  assert.throws(() => parseUniqueKeyJsonObject('{"outer":{"x":1,"\\u0078":2}}'), /duplicate JSON member/);
  assert.throws(() => parseUniqueKeyJsonObject('{"nested":[{"x":1,"x":2}]}'), /duplicate JSON member/);
});

test('accepts distinct escaped keys, quotes and backslashes in string data', () => {
  const result = parseUniqueKeyJsonObject('{"session":"chat-a7e4b921","note":"quote: \\" and slash: \\\\"}');
  assert.deepEqual(result, { session: 'chat-a7e4b921', note: 'quote: " and slash: \\' });
});

test('rejects malformed escapes, truncation and trailing tokens', () => {
  for (const raw of ['{"session":"\\u00G0"}', '{"\\x":1}', '{"x":1', '{"x":1}{}', '{"x":1,}']) {
    assert.throws(() => parseUniqueKeyJsonObject(raw), SyntaxError, raw);
  }
});

test('enforces bounded parsing and top-level object contract', () => {
  assert.throws(() => parseUniqueKeyJsonObject('[' + JSON.stringify(canonical) + ']'), SyntaxError);
  assert.throws(() => parseUniqueKeyJsonObject('{"payload":"' + 'a'.repeat(9000) + '"}'), SyntaxError);
  assert.throws(() => parseUniqueKeyJsonObject('{"nested":'.repeat(40) + 'null' + '}'.repeat(40)), SyntaxError);
});
