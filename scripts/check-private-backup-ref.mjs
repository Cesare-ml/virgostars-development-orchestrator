#!/usr/bin/env node
import {makeGitHubClient} from '../src/github.mjs';
import {inspectPrivateBackupRef} from '../src/private-backup-ref-gate.mjs';

async function main() {
  if (process.argv.length !== 2)
    throw new Error('This read-only command takes no arguments.');
  if (!process.env.GITHUB_TOKEN)
    throw new Error('An owner-local GitHub token is required.');
  const result = await inspectPrivateBackupRef({
    api: makeGitHubClient({token: process.env.GITHUB_TOKEN}),
    repository: process.env.VS_PRIVATE_LEDGER_REPO,
    acknowledgedRepository: process.env.VS_PRIVATE_LEDGER_APPROVED_REPO,
    backupBranch: process.env.VS_PRIVATE_LEDGER_BACKUP_REF
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch(() => {
  // Never echo private repo/ref names, paths, token values or API error bodies.
  process.stderr.write('ERROR: private backup reference gate blocked; review owner-local setup.\n');
  process.exitCode = 2;
});
