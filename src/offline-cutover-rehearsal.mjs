import {createHash} from 'node:crypto';
import {constants as fsConstants} from 'node:fs';
import {lstat,open} from 'node:fs/promises';
import {resolve} from 'node:path';

export const REHEARSAL_SCHEMA='1-offline-ledger-backups';
const PUBLIC_SOURCE='Cesare-ml/virgostars-development-orchestrator';
const SHA=/^[0-9a-f]{40}$/;
const REPO=/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const B64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ROOTS=['claims','resources','submissions'];
const MAX_EXPORT_BYTES=2_000_000;
const MAX_RECORDS=250;
const MAX_BLOB_BYTES=65_536;

const fail=reason=>{throw new Error('Offline rehearsal refused: '+reason);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keys=(value,required)=>object(value)&&
  Object.keys(value).length===required.length&&
  required.every(k=>Object.hasOwn(value,k));
const isSha=x=>typeof x==='string'&&SHA.test(x);
const blankCounts=()=>({claims:0,resources:0,submissions:0});

function safeRecordPath(path) {
  if(typeof path!=='string'||path.length>240||path.length<7||
     !/^[A-Za-z0-9._/-]+$/.test(path)||
     path.includes('..')||path.includes('//')||
     path.startsWith('/')||!path.endsWith('.json'))return false;
  const parts=path.split('/');
  return parts.length>=3&&ROOTS.includes(parts[0])&&
    parts.slice(1).every(p=>p&&p!=='.'&&p!=='..'&&p.toLowerCase()!=='.git'&&
      !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p));
}
function gitBlobHash(bytes) {
  return createHash('sha1')
    .update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}

/**
 * Verify a *local* backup payload. This cannot establish the live GitHub
 * commit/tree identity, source inventory completeness or private visibility.
 * Never print record contents, paths, repository names or sensitive values.
 */
function validateSnapshot(snapshot,{isSource}) {
  if(!keys(snapshot,['repository','head_sha','tree_sha','records']))
    fail('invalid backup snapshot structure.');
  const repo=snapshot.repository;
  if(typeof repo!=='string'||!REPO.test(repo)||repo.includes('..')||
     (isSource?repo!==PUBLIC_SOURCE:repo.toLowerCase()===PUBLIC_SOURCE.toLowerCase()))
    fail('source/destination repository identity is not allowed.');
  const absent=snapshot.head_sha===null&&snapshot.tree_sha===null;
  if(isSource?absent:(!absent&&!isSha(snapshot.head_sha)))
    fail('invalid source/destination pinned commit.');
  if(!absent&&(!isSha(snapshot.head_sha)||!isSha(snapshot.tree_sha)))
    fail('invalid pinned Git SHA values.');
  if(!Array.isArray(snapshot.records)||snapshot.records.length>MAX_RECORDS||
     (!isSource&&absent&&snapshot.records.length!==0))
    fail('invalid local record inventory.');
  const inventory=new Map(),counts=blankCounts();
  let bytesTotal=0;
  for(const entry of snapshot.records) {
    if(!keys(entry,['path','git_blob_sha','content_base64'])||
       !safeRecordPath(entry.path)||!isSha(entry.git_blob_sha)||
       typeof entry.content_base64!=='string'||
       entry.content_base64.length>MAX_BLOB_BYTES*2||
       !B64.test(entry.content_base64))
      fail('unsafe, unsupported or malformed record.');
    const folded=entry.path.toLowerCase();
    if(inventory.has(folded))fail('duplicate or case-colliding record path.');
    const bytes=Buffer.from(entry.content_base64,'base64');
    if(bytes.length>MAX_BLOB_BYTES||gitBlobHash(bytes)!==entry.git_blob_sha)
      fail('record contents do not match the declared Git blob.');
    bytesTotal+=bytes.length;
    if(bytesTotal>MAX_EXPORT_BYTES)
      fail('local record set exceeds safe size limits.');
    let payload;
    try {payload=JSON.parse(bytes.toString('utf8'));}
    catch {fail('record is not valid JSON.');}
    if(!object(payload))fail('record must be a JSON object.');
    const kind=entry.path.split('/')[0];
    counts[kind]++;
    // Retain only local identifiers for comparison. These never appear in output.
    inventory.set(folded,entry.git_blob_sha);
  }
  return {inventory,counts,bytesTotal,repo,head:snapshot.head_sha,
    tree:snapshot.tree_sha,branchAbsent:absent};
}

export function rehearseLedgerBackups(data) {
  if(!keys(data,['schema_version','source','destination'])||
     data.schema_version!==REHEARSAL_SCHEMA)
    fail('unexpected local backup manifest schema.');
  const source=validateSnapshot(data.source,{isSource:true});
  const destination=validateSnapshot(data.destination,{isSource:false});
  let identical=0,wouldCopy=0,conflicting=0,destinationOnly=0;
  for(const [path,sha] of source.inventory) {
    const other=destination.inventory.get(path);
    if(other===undefined)wouldCopy++;
    else if(other===sha)identical++;
    else conflicting++;
  }
  for(const path of destination.inventory.keys())
    if(!source.inventory.has(path))destinationOnly++;
  const blockers=[
    'REMOTE_COMMIT_TREE_PROVENANCE_NOT_VERIFIED',
    'FULL_LEDGER_TREE_BACKUP_NOT_VERIFIED',
    'DESTINATION_PRIVATE_VISIBILITY_NOT_VERIFIED',
    'OWNER_APPROVAL_AND_WRITE_FREEZE_REQUIRED'
  ];
  if(source.counts.claims||source.counts.resources)
    blockers.push('SOURCE_HAS_CLAIMS_OR_RESOURCE_LOCKS');
  if(source.counts.submissions===0)
    blockers.push('SOURCE_HAS_NO_SUBMISSION_RECORDS');
  if(destination.branchAbsent)
    blockers.push('DESTINATION_BRANCH_NOT_CREATED');
  if(conflicting)blockers.push('CONFLICTING_RECORD_CONTENTS');
  if(destinationOnly)blockers.push('DESTINATION_ONLY_RECORDS_REQUIRE_REVIEW');
  return {
    schema_version:'1-offline-cutover-rehearsal',
    mode:'local-backup-check-only',
    local_git_blob_integrity_verified:true,
    live_head_verified:false,
    full_backup_verified:false,
    private_visibility_verified:false,
    records:{
      source:{...source.counts},
      destination:{...destination.counts},
      identical,would_copy:wouldCopy,conflicting,destination_only:destinationOnly
    },
    blockers,
    procedure:[
      'Privately verify owner access, exact current Git HEAD/tree and full backups.',
      'Freeze new source/destination writes and reconcile outstanding agent locks.',
      'Approve copy-only staging and preserve both original repositories unchanged.',
      'Independently compare all staged blob hashes and record identities.',
      'Switch clients only after an explicit operator decision and smoke tests.',
      'On failure, restore the previous client configuration; do not delete either ledger.'
    ],
    ready_to_migrate:false,
    writes_enabled:false,
    migration_performed:false,
    rollback_performed:false,
    independent_review:'pending'
  };
}

/** Read bounded offline content with no symlink following and no filename echo. */
export async function rehearseLocalBackupFile(file) {
  if(typeof file!=='string'||!file.trim()||file.includes('\0'))
    fail('a local backup filename is required.');
  let handle;
  try {
    const path=resolve(file);
    const stat=await lstat(path);
    if(!stat.isFile()||stat.isSymbolicLink()||
       stat.size>MAX_EXPORT_BYTES||stat.size<2)
      fail('backup input must be a bounded regular file.');
    handle=await open(path,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW||0));
    const opened=await handle.stat();
    if(!opened.isFile()||opened.size!==stat.size)
      fail('backup file changed or is not a regular file.');
    const buffer=Buffer.alloc(MAX_EXPORT_BYTES+1);
    let size=0;
    while(size<buffer.length) {
      const {bytesRead}=await handle.read(buffer,size,buffer.length-size,size);
      if(bytesRead===0)break;
      size+=bytesRead;
    }
    if(size>MAX_EXPORT_BYTES||size<2||size!==opened.size)
      fail('backup manifest exceeds safe size limits or changed during reading.');
    let manifest;
    try {manifest=JSON.parse(buffer.subarray(0,size).toString('utf8'));}
    catch {fail('backup manifest is not valid JSON.');}
    return rehearseLedgerBackups(manifest);
  } catch(error) {
    if(error?.message?.startsWith('Offline rehearsal refused:'))throw error;
    fail('local backup could not be read safely.');
  } finally {
    await handle?.close();
  }
}
