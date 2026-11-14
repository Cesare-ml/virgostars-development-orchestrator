#!/usr/bin/env node
// Syntax-checks every .mjs file under bin/, src/, scripts/ and test/ (replaces the hand-maintained list).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = ['bin', 'src', 'scripts', 'test'];
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.mjs')) files.push(p);
  }
};
for (const r of roots) { try { walk(r); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { failed++; process.stderr.write(`syntax error: ${f}\n${e.stderr}\n`); }
}
process.stdout.write(`syntax check: ${files.length - failed}/${files.length} files OK\n`);
process.exit(failed ? 1 : 0);
