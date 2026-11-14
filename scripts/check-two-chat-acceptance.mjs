#!/usr/bin/env node
// This tool is offline. Do not pass an owner-private report in a public checkout.
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emptyAcceptanceResult,
  evaluateTwoChatAcceptance,
} from '../src/offline-two-chat-acceptance.mjs';

const MAX_BYTES = 32 * 1024;
const CHECKOUT_ROOT = fileURLToPath(new URL('../', import.meta.url));

function withinDirectory(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
}

async function loadLocalReport(argument) {
  if (typeof argument !== 'string' || !isAbsolute(argument)) throw new Error('INVALID_INPUT');
  const requested = resolve(argument);
  const [checkoutRoot, resolvedFile, entry] = await Promise.all([
    realpath(CHECKOUT_ROOT), realpath(requested), lstat(requested),
  ]);
  if (withinDirectory(checkoutRoot, resolvedFile) || !entry.isFile() ||
      entry.isSymbolicLink() || entry.size < 1 || entry.size > MAX_BYTES) {
    throw new Error('INVALID_INPUT');
  }
  // O_NOFOLLOW is available on Unix; explicit lstat/realpath checks also protect Windows.
  const handle = await open(requested, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size < 1 || opened.size > MAX_BYTES ||
        (entry.ino && opened.ino && (entry.ino !== opened.ino || entry.dev !== opened.dev))) {
      throw new Error('INVALID_INPUT');
    }
    if (await realpath(requested) !== resolvedFile) throw new Error('INVALID_INPUT');
    const content = await handle.readFile({ encoding: 'utf8' });
    if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) throw new Error('INVALID_INPUT');
    return JSON.parse(content);
  } finally {
    await handle.close();
  }
}

async function main() {
  let result = emptyAcceptanceResult();
  let code = 2;
  try {
    if (process.argv.length !== 3) throw new Error('INVALID_ARGS');
    const report = await loadLocalReport(process.argv[2]);
    result = evaluateTwoChatAcceptance(report);
    code = result.self_reported_requirements_met ? 0 : 1;
  } catch {
    // Never echo filenames, IDs, contents, exceptions or private environment variables.
  }
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = code;
}

await main();
