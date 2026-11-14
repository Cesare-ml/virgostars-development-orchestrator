#!/usr/bin/env node
import {runLocalCrashRehearsal} from '../src/local-crash-rehearsal.mjs';

if (process.argv.length !== 2) {
  process.stderr.write('ERROR: Unexpected options for crash rehearsal.\n');
  process.exitCode = 1;
} else {
  try {
    const report = await runLocalCrashRehearsal();
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch {
    process.stderr.write('ERROR: Synthetic crash rehearsal did not pass.\n');
    process.exitCode = 1;
  }
}
