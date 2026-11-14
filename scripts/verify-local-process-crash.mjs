#!/usr/bin/env node
import {runLocalProcessCrashSafety} from '../src/local-process-crash-safety.mjs';

if (process.argv.length !== 2) {
  process.stderr.write('ERROR: Unexpected options for local crash rehearsal.\n');
  process.exitCode = 1;
} else {
  try {
    const report = await runLocalProcessCrashSafety();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch {
    process.stderr.write('ERROR: Local crash safety rehearsal did not pass.\n');
    process.exitCode = 1;
  }
}
