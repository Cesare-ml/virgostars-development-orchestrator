#!/usr/bin/env node
import {constants} from 'node:fs';
import {lstat,open,realpath,unlink} from 'node:fs/promises';
import {dirname,isAbsolute,join,parse,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {planOfflineSessionRestarts} from '../src/offline-session-restart.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const MAX_BYTES=131072;
const HELP=[
  'Plan manual replacement of failed offline sessions, with fresh independent IDs.',
  'Usage: node scripts/plan-offline-session-restarts.mjs ABSOLUTE_BATCH.json ABSOLUTE_NEW_OUTPUT.json --slots 1,3',
  'No chat launch, old-claim transfer, GitHub access or readiness approval is performed.',
  'Keep both JSON files private and outside the public repository.'
].join('\n')+'\n';

function inside(root, path) {
  const rel=relative(root,path);
  return rel==='' || (rel!=='..' && !rel.startsWith('..'+sep) && !isAbsolute(rel));
}

// Verify each existing path segment, not only the leaf, to reject symlink parents.
async function rejectSymlinkAncestors(path, includeLeaf) {
  const absolute=resolve(path), root=parse(absolute).root;
  const segments=relative(root,includeLeaf?absolute:dirname(absolute)).split(sep).filter(Boolean);
  let part=root;
  for(const segment of segments) {
    part=join(part,segment);
    if((await lstat(part)).isSymbolicLink())throw new Error('path_symlink');
  }
}

async function paths(input, output) {
  if(!isAbsolute(input)||!isAbsolute(output)||resolve(input)===resolve(output))
    throw new Error('absolute_paths_required');
  await rejectSymlinkAncestors(input,true);
  await rejectSymlinkAncestors(output,false);
  const root=await realpath(ROOT);
  const inputResolved=await realpath(input);
  const outputParent=await realpath(dirname(output));
  if(inside(root,inputResolved)||inside(root,outputParent)||
     inside(root,resolve(output))) throw new Error('public_checkout_forbidden');
  if(!(await lstat(input)).isFile()) throw new Error('input_not_regular');
}

async function readBoundedJson(file) {
  const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    const before=await handle.stat();
    if(!before.isFile()||before.size<1||before.size>MAX_BYTES)
      throw new Error('input_size_invalid');
    const bytes=await handle.readFile();
    const after=await handle.stat();
    if(bytes.length!==before.size||after.size!==before.size||
       before.ino!==after.ino||before.dev!==after.dev||
       before.mtimeMs!==after.mtimeMs) throw new Error('input_changed');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } finally { await handle.close(); }
}

async function saveNew(file,record) {
  const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n','utf8');
  const handle=await open(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|
     (constants.O_NOFOLLOW||0),0o600);
  let success=false;
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    success=true;
  } finally {
    await handle.close();
    if(!success)await unlink(file).catch(()=>{});
  }
}

async function main(args) {
  if(args.length===1&&(args[0]==='--help'||args[0]==='-h')) {
    process.stdout.write(HELP);return;
  }
  if(args.length!==4||args[2]!=='--slots'||/^[1-9][0-9]*(,[1-9][0-9]*)*$/.test(args[3])===false)
    throw new Error('invalid_arguments');
  const [input,output,,csv]=args;
  const slots=csv.split(',').map(Number);
  await paths(input,output);
  const plan=planOfflineSessionRestarts(await readBoundedJson(input),slots);
  await saveNew(output,plan);
  // Do not print paths, session IDs or prompts. No claim ownership was verified.
  process.stdout.write(JSON.stringify({
    schema_version:plan.schema_version,
    replacements_prepared:plan.replacements_prepared,
    chats_started:plan.chats_started,
    tasks_claimed:plan.tasks_claimed,
    github_requests:plan.github_requests,
    old_claims_reconciled_verified:false,
    private_ledger_verified:false,
    owner_review_required:true,
    ready_to_launch:false
  })+'\n');
}

try { await main(process.argv.slice(2)); }
catch { process.stderr.write('Offline replacement planning blocked; review private local inputs.\n'); process.exitCode=2; }
