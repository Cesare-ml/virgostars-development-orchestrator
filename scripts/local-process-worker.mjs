#!/usr/bin/env node
import {open, readFile, unlink, realpath, stat} from 'node:fs/promises';
import {join, dirname, basename} from 'node:path';
import {tmpdir} from 'node:os';

// Child-only IPC worker. NEVER accepts task paths, tokens or target repos via CLI.
if (!process.send || process.argv.length !== 2) process.exit(1);
let claimFile = null;
let owner = null;
let owns = false;
const allowedOwners = new Set(['synthetic-a', 'synthetic-b']);

async function reply(message) {
  if (!Number.isSafeInteger(message?.id) || message.id < 1) return;
  let status = 'error';
  try {
    if (message.op === 'setup' && claimFile === null) {
      const requested = message.directory;
      if (typeof requested !== 'string' || !allowedOwners.has(message.owner))
        throw new Error('Invalid synthetic worker setup.');
      const root = await realpath(tmpdir());
      const directory = await realpath(requested);
      const info = await stat(directory);
      if (!info.isDirectory() || dirname(directory) !== root ||
          !/^vs-process-demo-[A-Za-z0-9]{6}$/.test(basename(directory)))
        throw new Error('Worker must use an owned, isolated temporary directory.');
      claimFile = join(directory, 'synthetic-claim.json');
      owner = message.owner;
      status = 'ready';
    } else if (message.op === 'claim' && claimFile && !owns) {
      let handle;
      try {
        handle = await open(claimFile, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({schema_version:'1-synthetic-os-process-claim', owner}), 'utf8');
        owns = true;
        status = 'acquired';
      } catch (error) {
        if (error?.code === 'EEXIST') status = 'busy';
        else throw error;
      } finally {
        await handle?.close();
      }
    } else if (message.op === 'claim' && claimFile && owns) {
      status = 'already-owned';
    } else if (message.op === 'release' && claimFile) {
      if (!owns) status = 'not-owner';
      else {
        const current = JSON.parse(await readFile(claimFile, 'utf8'));
        if (current?.schema_version !== '1-synthetic-os-process-claim' || current.owner !== owner)
          throw new Error('Synthetic claim owner changed.');
        await unlink(claimFile);
        owns = false;
        status = 'released';
      }
    } else if (message.op === 'stop') status = 'stopped';
  } catch { status = 'error'; }
  process.send({id:message.id,status}, () => {
    if (message.op === 'stop') process.exit(status === 'stopped' ? 0 : 1);
  });
}
process.on('message', message => { void reply(message); });
process.on('disconnect', () => process.exit(0));
