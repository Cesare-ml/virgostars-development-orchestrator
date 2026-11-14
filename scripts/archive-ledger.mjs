#!/usr/bin/env node
// Usage: node scripts/archive-ledger.mjs LEDGER_CHECKOUT_DIR
// Prints (one per line) the claim folders under claims/ whose latest attempt expired more than 6 hours ago.
// The workflow removes them with `git rm`; Git history keeps them.
import { loadClaimsFromDir } from '../src/agent-github.mjs';
import { expiredClaimFolders } from '../src/agent-ledger.mjs';

const dir = process.argv[2];
if (!dir) { process.stderr.write('usage: archive-ledger.mjs LEDGER_DIR\n'); process.exit(2); }
for (const p of expiredClaimFolders(await loadClaimsFromDir(dir), Date.now())) process.stdout.write(`claims/${p}\n`);
