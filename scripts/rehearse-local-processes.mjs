#!/usr/bin/env node
import {runLocalProcessRehearsal} from '../src/local-process-rehearsal.mjs';

if(process.argv.length!==2) {
  process.stderr.write('ERROR: Unexpected options for local rehearsal.\n');
  process.exitCode=1;
} else {
  try {
    const report=await runLocalProcessRehearsal();
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  } catch {
    process.stderr.write('ERROR: Local process rehearsal did not pass.\n');
    process.exitCode=1;
  }
}
