import {createHash} from 'node:crypto';
import {open, lstat, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateTaskCatalog} from './resources.mjs';

const MAX_BYTES=131072;
const SHA256=/^[a-f0-9]{64}$/;
const LEGACY_PATH=new URL('../config/pilot-tasks.json',import.meta.url);
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const ALLOWED_TASK_FIELDS=new Set([
  'repository','issue','status','role','access','pilot_wave','title',
  'scope','resource_scope','upstream_pr','upstream_branch','instructions'
]);

function blocked(reason) {
  throw new Error('Owner task catalog blocked: '+reason);
}

function exactKeys(value,keys) {
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    Object.keys(value).every(k=>keys.has(k));
}

function safeText(value,max) {
  return typeof value==='string'&&value.length>0&&value.length<=max&&
    !/[\u0000-\u001f\u007f]/.test(value);
}

export function validateOwnerTaskCatalog(catalog,legacyTasks=[]) {
  if(!exactKeys(catalog,new Set(['schema_version','status','tasks']))||
     catalog.schema_version!=='1-owner-task-catalog'||
     catalog.status!=='owner-curated-local'||
     !Array.isArray(catalog.tasks)||catalog.tasks.length<1||catalog.tasks.length>40)
    blocked('invalid version, status or number of tasks.');

  const historical=new Set(legacyTasks.map(task=>
    task.repository.toLowerCase()+'#'+task.issue));
  for(const task of catalog.tasks) {
    if(!exactKeys(task,ALLOWED_TASK_FIELDS) ||
       task.status!=='ready' ||
       !safeText(task.title,160) ||
       !Array.isArray(task.scope) || !task.scope.length||
       task.scope.length>20 || !task.scope.every(x=>safeText(x,200)) ||
       (task.instructions!==undefined&&!safeText(task.instructions,1000)) ||
       (task.pilot_wave!==undefined&&
         (!Number.isSafeInteger(task.pilot_wave)||task.pilot_wave<3)) ||
       (task.upstream_pr!==undefined&&
         (!Number.isSafeInteger(task.upstream_pr)||task.upstream_pr<1)) ||
       (task.upstream_branch!==undefined&&!safeText(task.upstream_branch,200)))
      blocked('a new task has malformed or unexpected fields.');
    if(historical.has(task.repository.toLowerCase()+'#'+task.issue))
      blocked('new tasks may not reuse the original seven submitted issues.');
    // A new write task must have a reviewed base dependency; never assume
    // that an arbitrary open issue can authorize changes to any branch.
    if(task.access==='write'&&
       (!task.upstream_pr||!task.upstream_branch||!task.resource_scope))
      blocked('write tasks require an explicit upstream PR, branch and partition.');
  }
  try {
    return validateTaskCatalog(catalog.tasks);
  } catch {
    blocked('invalid or overlapping curated task scope.');
  }
}

/**
 * Only a locally supplied file *outside* the public checkout can become the
 * owner task queue. This reader never sends file bytes to GitHub or logs.
 */
export async function inspectOwnerTaskFile(file,{legacyTasks=[]}={}) {
  if(typeof file!=='string'||!isAbsolute(file))
    blocked('supply an absolute local task catalog file path.');
  const info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||
     info.size<1||info.size>MAX_BYTES)
    blocked('file must be a bounded, regular, non-symlink local JSON file.');
  const canonical=await realpath(file);
  const root=await realpath(ROOT);
  const inside=relative(root,canonical);
  if(!inside||(!inside.startsWith('..'+sep)&&inside!=='..'&&
     !isAbsolute(inside)))
    blocked('private catalog must be outside the public checkout.');

  const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  let bytes;
  try {
    const before=await handle.stat();
    if(!before.isFile()||before.size<1||before.size>MAX_BYTES)
      blocked('local catalog file changed or exceeds the size limit.');
    bytes=await handle.readFile();
    const after=await handle.stat();
    if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||
       before.ino!==after.ino||bytes.length!==after.size)
      blocked('task catalog changed while it was read.');
  } finally {
    await handle.close();
  }

  let catalog;
  try {
    catalog=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } catch {
    blocked('task catalog must contain valid UTF-8 JSON.');
  }
  const tasks=validateOwnerTaskCatalog(catalog,legacyTasks);
  const fingerprint=createHash('sha256').update(bytes).digest('hex');
  return {
    sha256:fingerprint,
    count:tasks.length,
    read_tasks:tasks.filter(x=>x.access==='read').length,
    write_tasks:tasks.filter(x=>x.access==='write').length,
    tasks
  };
}

export function requireOwnerTaskApproval(report,approvedSha256) {
  if(typeof approvedSha256!=='string'||!SHA256.test(approvedSha256)||
     approvedSha256!==report.sha256)
    blocked('set VS_PRIVATE_TASKS_APPROVED_SHA256 to the reviewed exact file fingerprint.');
  return report.tasks;
}

export async function loadHistoricalPilotTasks() {
  const catalog=JSON.parse(await (await import('node:fs/promises')).readFile(
    LEGACY_PATH,'utf8'));
  return validateTaskCatalog(catalog.tasks);
}

export async function loadOwnerTasks({
  file=process.env.VS_PRIVATE_TASKS_FILE,
  approvedSha256=process.env.VS_PRIVATE_TASKS_APPROVED_SHA256
}={}) {
  const historical=await loadHistoricalPilotTasks();
  if(file===undefined&&approvedSha256===undefined)return historical;
  if(file===undefined||approvedSha256===undefined)
    blocked('both local task file and approved SHA-256 are required.');
  const report=await inspectOwnerTaskFile(file,{legacyTasks:historical});
  return requireOwnerTaskApproval(report,approvedSha256);
}
