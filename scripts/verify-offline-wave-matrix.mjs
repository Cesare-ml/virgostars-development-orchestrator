#!/usr/bin/env node
import {runOfflineWaveMatrix} from '../src/offline-wave-matrix.mjs';

// No arguments, credentials, network clients, task files or live GitHub writes.
// A failed matrix prints a fixed diagnostic only: never forward task data.
const repeat = process.argv.length === 3 && process.argv[2] === '--repeat';
if (process.argv.length !== 2 && !repeat) {
  process.stderr.write('Usage: node scripts/verify-offline-wave-matrix.mjs [--repeat]\n');
  process.exitCode = 2;
} else {
  try {
    const report = await runOfflineWaveMatrix({repeat});
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch {
    process.stderr.write('Offline synthetic wave matrix failed.\n');
    process.exitCode = 1;
  }
}
