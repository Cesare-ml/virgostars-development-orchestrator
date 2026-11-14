#!/usr/bin/env node
import {runLocalProcessCrashRehearsal} from '../src/local-process-crash-rehearsal.mjs';

if (process.argv.length !== 2) {
  process.stderr.write('ERROR: Unexpected options for local crash rehearsal.\n');
  process.exitCode = 1;
} else {
  try {
    process.stdout.write(JSON.stringify(await runLocalProcessCrashRehearsal(), null, 2) + '\n');
  } catch {
    process.stderr.write('ERROR: Local crash rehearsal did not pass.\n');
    process.exitCode = 1;
  }
}
