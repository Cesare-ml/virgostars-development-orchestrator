#!/usr/bin/env node
// Standalone tokenless CLI. Reads only argv; does not import private modules.
import {planOfflineAdmission} from '../src/offline-admission-budget.mjs';
import {pathToFileURL} from 'node:url';

const flags = new Map([
  ['--waves','waves'], ['--active','active'],
  ['--pending','pending'], ['--max-active','maxActive'],
  ['--max-pending','maxPending']
]);

function parseNumber(value, name) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`Invalid offline admission ${name}: expected canonical nonnegative integer.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Invalid offline admission ${name}: out of range.`);
  }
  return number;
}

export function parseArgs(argv) {
  if (argv.length !== flags.size * 2) {
    throw new Error('Offline admission requires --waves, --active, --pending, --max-active and --max-pending.');
  }
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = flags.get(argv[i]);
    if (!key || Object.hasOwn(options, key)) {
      throw new Error('Unknown or repeated offline admission option.');
    }
    const value = argv[i + 1];
    if (key === 'waves') {
      if (!/^[1-9][0-9]*(,[1-9][0-9]*)*$/.test(value ?? '')) {
        throw new Error('Invalid offline admission waves: expected comma-separated positive integers.');
      }
      options.waves = value.split(',').map(v => parseNumber(v, 'wave size'));
    } else {
      options[key] = parseNumber(value, key);
    }
  }
  return options;
}

// Guarded entrypoint permits native unit import without execution.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = planOfflineAdmission(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.verdict === 'capacity-blocked') process.exitCode = 2;
  } catch {
    // Do not echo input, environment variables, owner paths or identifiers.
    process.stderr.write('Offline admission input rejected; check the documented flags and capacity bounds.\n');
    process.exitCode = 1;
  }
}
