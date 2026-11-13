#!/usr/bin/env node
import {runOfflineWaveMatrix} from '../src/offline-wave-matrix.mjs';

// No arguments, credentials, network clients, task files or live GitHub writes.
// A failed matrix prints a fixed diagnostic only: never forward task data.
if (process.argv.length !== 2) {
  process.stderr.write('Usage: node scripts/verify-offline-wave-matrix.mjs\n');
  process.exitCode = 2;
} else {
  try {
    const report = await runOfflineWaveMatrix();
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch {
    process.stderr.write('Offline synthetic wave matrix failed.\n');
    process.exitCode = 1;
  }
}
