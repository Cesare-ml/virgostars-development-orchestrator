#!/usr/bin/env node
import {prepareOfflineSessionBatch} from '../src/offline-session-batch.mjs';

const usage=[
  'Prepare 2–40 independent VirgoStars session IDs and initial prompts OFFLINE.',
  'Usage: node scripts/prepare-agent-sessions.mjs COUNT [chat|codex]',
  'Example: node scripts/prepare-agent-sessions.mjs 10 chat',
  'No chats, GitHub requests, task claims or private-ledger checks are performed.',
  'Treat generated session IDs and any saved output as owner-local coordination data.'
].join('\n')+'\n';

function main(args) {
  if(args.length===1&&(args[0]==='--help'||args[0]==='-h')) {
    process.stdout.write(usage);
    return;
  }
  if(args.length<1||args.length>2||!/^(?:[2-9]|[1-3][0-9]|40)$/.test(args[0]))
    throw new Error('Supply COUNT as an integer from 2 to 40 and optional chat|codex.');
  const report=prepareOfflineSessionBatch({count:Number(args[0]),kind:args[1]??'chat'});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}

try {
  main(process.argv.slice(2));
} catch(error) {
  process.stderr.write('Offline session preparation blocked: '+error.message+'\n');
  process.exitCode=2;
}
