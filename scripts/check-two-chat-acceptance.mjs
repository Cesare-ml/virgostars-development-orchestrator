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

// JSON.parse alone silently accepts duplicate object keys (last value wins).
// Examine complete string tokens, and track decoded keys per object. JSON.parse
// below remains the authority for all syntax; this scanner rejects ambiguity.
function parseUniqueObjectKeys(content) {
  const stack = [];
  for (let i = 0; i < content.length; i++) {
    const current = content[i];
    if (current === '{') {
      stack.push(new Set());
    } else if (current === '[') {
      stack.push(null);
    } else if (current === '}' || current === ']') {
      stack.pop();
    } else if (current === '"') {
      let end = i + 1;
      for (; end < content.length; end++) {
        if (content[end] === '\\') {
          end++; // skip escaped quote/backslash and Unicode escape introducer
        } else if (content[end] === '"') {
          break;
        }
      }
      if (end >= content.length) throw new Error('INVALID_INPUT');
      let after = end + 1;
      while (after < content.length && ' \t\n\r'.includes(content[after])) after++;
      const seen = stack[stack.length - 1];
      if (content[after] === ':' && seen instanceof Set) {
        // JSON decoding also resolves \u escapes, so equivalent spellings collide.
        const key = JSON.parse(content.slice(i, end + 1));
        if (seen.has(key)) throw new Error('INVALID_INPUT');
        seen.add(key);
      }
      i = end;
    }
  }
  return JSON.parse(content);
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
    return parseUniqueObjectKeys(content);
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
