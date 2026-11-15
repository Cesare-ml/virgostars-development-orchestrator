#!/usr/bin/env node
// Debounce for claim-triggered queue rebuilds: prints how many seconds to wait so that rebuilds are at least
// --min-seconds (default 300) apart. 0 when queue.json on agent-queue is old enough, missing or unreadable.
// The Fleet queue workflow (one running + one pending run at most) sleeps this long, then rebuilds,
// so the last claim of a burst is always reflected (trailing edge) while rebuilds stay <= 12 per hour.
import { readFile } from 'node:fs/promises';
import { makeGet } from '../src/agent-github.mjs';

export function waitSeconds(generatedAt, now, min) {
  const age = (now - Date.parse(generatedAt)) / 1000;
  if (!Number.isFinite(age) || age < 0 || age >= min) return 0;
  return Math.ceil(min - age);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--min-seconds');
  const min = i > 0 ? Number(process.argv[i + 1]) : 300;
  const fleet = JSON.parse(await readFile(new URL('../config/agent-fleet.json', import.meta.url), 'utf8'));
  let wait = 0;
  try {
    const file = await makeGet()(`repos/${fleet.ledger.repo}/contents/queue.json?ref=agent-queue`, { allow404: true });
    if (file) wait = waitSeconds(JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')).generated_at, Date.now(), min);
  } catch { wait = 0; }
  process.stdout.write(`${wait}\n`);
}
