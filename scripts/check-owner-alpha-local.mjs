#!/usr/bin/env node
import {assessOwnerAlphaLocalSetup} from '../src/owner-alpha-local-check.mjs';
import {validateOperatorSelection} from '../src/private-ledger-activation.mjs';
import {loadOwnerTasks} from '../src/owner-task-catalog.mjs';

// Intentionally no GitHub client, HTTP request, file write or credentials log.
// The approved task reader is owner-local and emits no private data.
try {
  if (process.argv.length !== 2)
    throw new Error('arguments-not-accepted');
  const report = await assessOwnerAlphaLocalSetup({
    env: process.env,
    validateSelection: validateOperatorSelection,
    loadApprovedTasks: loadOwnerTasks
  });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.result !== 'local-preflight-pass') process.exitCode = 2;
} catch {
  // Fail closed without echoing local paths, token, repo or task identities.
  process.stderr.write('ERROR: Owner alpha local preflight failed.\n');
  process.exitCode = 1;
}
