#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePublicAlphaSmoke} from '../src/public-alpha-smoke.mjs';

// No token, private task/ledger env, session ID, or network API is handed to
// either subprocess. The CLI commands are intentionally fixed, not user input.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const childEnvironment = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']) {
  if (typeof process.env[key] === 'string') childEnvironment[key] = process.env[key];
}
function runOfflineCommand(command) {
  const run = spawnSync(process.execPath, [resolve(root, 'bin/vs-agent.mjs'), command], {
    cwd: root, env: childEnvironment, encoding: 'utf8', windowsHide: true,
    timeout: 20_000, maxBuffer: 64 * 1024
  });
  if (run.error || run.signal || run.status !== 0 || typeof run.stdout !== 'string') {
    throw new Error('command-failed-' + command);
  }
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new Error('invalid-json-' + command);
  }
}

try {
  if (process.argv.length !== 2) throw new Error('unexpected-arguments');
  const discovery = runOfflineCommand('public-discover');
  const rehearsal = runOfflineCommand('rehearse-two-agents');
  process.stdout.write(JSON.stringify(validatePublicAlphaSmoke(discovery, rehearsal), null, 2) + '\n');
} catch (error) {
  // Always print a fixed error: upstream subprocess stderr might accidentally
  // contain private paths or task identities, and must not be relayed to logs.
  process.stderr.write('ERROR: Public alpha smoke check failed.\n');
  process.exitCode = 1;
}
