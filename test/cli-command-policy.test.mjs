import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLegacyCliInvocation} from '../src/cli-command-policy.mjs';

const valid = [
  ['discover', [], {}],
  ['fleet-status', [], {}],
  ['audit-pr', ['o/r', '1', '2'], {}],
  ['audit-collisions', ['o/r', '1'], {}],
  ['claim-next', [], {session:'chat-id', role:'developer', repo:'o/r'}],
  ['status', ['o/r','1'], {}],
  ['claim', ['o/r','1'], {session:'chat-id', role:'developer', branch:'topic'}],
  ['handoff', ['o/r','1'], {session:'chat-id', summary:'work', 'head-sha':'a'.repeat(40)}],
  ['release', ['o/r','1'], {session:'chat-id', confirm:true}],
  ['submit', ['o/r','1'], {session:'chat-id', confirm:true, pr:'2'}]
];

test('known legacy commands with supported options pass the local shape gate', () => {
  for (const args of valid) assert.doesNotThrow(() => validateLegacyCliInvocation(...args));
});

test('unknown or inherited command names cannot pass through to GitHub preflight', () => {
  for (const command of ['typo', 'constructor', '__proto__', 'toString']) {
    assert.throws(() => validateLegacyCliInvocation(command, [], {}), /Unknown command/);
  }
});

test('malformed positional counts fail locally for every owner-only command', () => {
  for (const [command, positionals, flags] of valid) {
    assert.throws(() => validateLegacyCliInvocation(command, [...positionals, 'extra'], flags), /Invalid arguments/);
    if (positionals.length) {
      assert.throws(() => validateLegacyCliInvocation(command, [], flags), /Invalid arguments/);
    }
  }
});

test('ignored or unsafe extra flags cannot be silently accepted', () => {
  for (const [command, positionals, flags] of valid) {
    assert.throws(() => validateLegacyCliInvocation(command, positionals, {...flags, confirm:true, output:'secret'}),
      /Option --/);
  }
});

test('invalid invocation data and duplicate shape confusion fail closed', () => {
  for (const bad of [null, [], undefined, 'text']) {
    assert.throws(() => validateLegacyCliInvocation('discover', [], bad), /Invalid arguments/);
  }
  assert.throws(() => validateLegacyCliInvocation('status', null, {}), /Invalid arguments/);
});

// Integration regression: these malformed invocations must never reach a
// GitHub token / private ledger check (or print owner-private details).
test('CLI rejects unknown and malformed legacy invocations before token preflight', async () => {
  const {spawnSync} = await import('node:child_process');
  const {fileURLToPath} = await import('node:url');
  const cli = fileURLToPath(new URL('../bin/vs-agent.mjs', import.meta.url));
  const env = {...process.env};
  delete env.GITHUB_TOKEN;
  for (const [args, expected] of [
    [['wrong-command'], /Unknown command wrong-command/],
    [['claim', 'example/repo', '1', '--output', 'foo'], /Option --output is not valid for claim/],
    [['fleet-status', 'extra'], /Invalid arguments for fleet-status/],
    [['submit', 'example/repo', '1', '--output', 'foo'], /Option --output is not valid for submit/]
  ]) {
    const run = spawnSync(process.execPath, [cli, ...args],
      {env, encoding:'utf8', timeout: 10000});
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, expected);
    assert.doesNotMatch(run.stderr, /GITHUB_TOKEN is required|not verified PRIVATE/);
    assert.equal(run.stdout, '');
  }
});
