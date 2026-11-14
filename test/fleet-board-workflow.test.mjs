import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const y = await readFile(new URL('../.github/workflows/fleet-board.yml', import.meta.url), 'utf8');

test('fleet board workflow is read-only, pinned and only runs GET-only commands', () => {
  assert.match(y, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(y, /:\s*write$/m);
  assert.doesNotMatch(y, /\$\{\{\s*(?:secrets|vars)\./i);
  assert.doesNotMatch(y, /\b(?:pull_request_target|workflow_run|repository_dispatch|pull_request)\s*:/);
  assert.match(y, /^\s+persist-credentials: false$/m);
  const actions = [...y.matchAll(/^\s+uses:\s+(\S+)/gm)].map(x => x[1]);
  assert.deepEqual(actions.map(a => a.split('@')[0]), ['actions/checkout', 'actions/setup-node']);
  for (const a of actions) assert.match(a, /@[0-9a-f]{40}$/);
  const runs = [...y.matchAll(/^\s+run:\s+(.+)$/gm)].map(x => x[1]);
  assert.equal(runs.length, 2);
  for (const r of runs) assert.match(r, /^node bin\/vs-agent\.mjs (?:fleet-board|fleet-report --hours \d+) --markdown >> "\$GITHUB_STEP_SUMMARY"$/);
  assert.doesNotMatch(y, /\b(?:curl|wget|git push|gh |npm publish|upload-artifact)\b/);
});
