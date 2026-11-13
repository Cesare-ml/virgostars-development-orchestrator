#!/usr/bin/env node
import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditOfflineSessionBatches} from '../src/offline-session-batch-audit.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const MAX_BYTES=131072;
const HELP=[
  'Audit 2–20 saved owner-local session batches (40 sessions maximum).',
  'Usage: node scripts/audit-offline-session-batches.mjs ABSOLUTE_BATCH1.json ABSOLUTE_BATCH2.json [...]',
  'Read-only, offline, aggregate-only. Zero chats/claims are verified or created.',
  'Never publish real batch files or session identifiers.'
].join('\n')+'\n';

async function readBatch(file) {
  if(typeof file!=='string'||!isAbsolute(file))throw new Error('path_invalid');
  const info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>MAX_BYTES)
    throw new Error('file_invalid');
  const canonical=await realpath(file);
  const root=await realpath(ROOT);
  const rel=relative(root,canonical);
  if(!rel||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel)))
    throw new Error('inside_public_checkout');
  const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    const before=await handle.stat();
    if(!before.isFile()||before.size<1||before.size>MAX_BYTES||
       before.ino!==info.ino||before.dev!==info.dev)
      throw new Error('file_changed');
    const bytes=await handle.readFile();
    const after=await handle.stat();
    if(bytes.length!==after.size||before.size!==after.size||
       before.ino!==after.ino||before.dev!==after.dev||
       before.mtimeMs!==after.mtimeMs)
      throw new Error('file_changed');
    return {
      canonical,
      data:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
    };
  } finally {
    await handle.close();
  }
}

async function main(args) {
  if(args.length===1&&(args[0]==='--help'||args[0]==='-h')) {
    process.stdout.write(HELP);return;
  }
  if(args.length<2||args.length>20||args.some(x=>x.startsWith('--')))
    throw new Error('usage_invalid');
  const batches=[],files=new Set();
  for(const file of args) {
    const batch=await readBatch(file);
    const id=process.platform==='win32'?batch.canonical.toLowerCase():batch.canonical;
    if(files.has(id))throw new Error('file_duplicate');
    files.add(id);
    batches.push(batch.data);
  }
  const report=auditOfflineSessionBatches(batches);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}

try {
  await main(process.argv.slice(2));
} catch {
  // Never echo filesystem errors; they can contain owner-local paths.
  process.stderr.write('Offline session batch audit blocked; review local inputs.\n');
  process.exitCode=2;
}
