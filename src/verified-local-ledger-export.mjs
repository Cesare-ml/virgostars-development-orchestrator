import {createHash} from 'node:crypto';
import {constants as fsConstants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,parse,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GitHubError} from './github.mjs';
import {inspectHistoricalSource} from './private-cutover-plan.mjs';
import {
  inspectPrivateDestination,PUBLIC_COORDINATOR,DESTINATION_BRANCH
} from './private-ledger-preflight.mjs';
import {
  FROZEN_PUBLIC_LEDGER_HEAD,FROZEN_PUBLIC_SUBMISSIONS,
  validateOperatorSelection
} from './private-ledger-activation.mjs';
import {inspectPrivateLedger} from './ledger-visibility.mjs';
import {rehearseLedgerBackups} from './offline-cutover-rehearsal.mjs';

const SHA=/^[a-f0-9]{40}$/i;
const NAME=/^[A-Za-z0-9][A-Za-z0-9_.-]*__[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const RESOURCE=/^[a-z][a-z0-9_-]{0,63}\.json$/;
const ISSUE=/^issue-[1-9]\d*\.json$/;
const MAX_RECORDS=250,MAX_BLOB=65536,MAX_MANIFEST=2000000;
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const fail=reason=>{throw new Error('Verified local export blocked: '+reason);};

function gitHash(bytes) {
  return createHash('sha1').update('blob '+bytes.length+'\0')
    .update(bytes).digest('hex');
}
function assertSha(sha) {
  return typeof sha==='string'&&SHA.test(sha);
}
function validRef(ref) {
  if(ref?.object?.type!=='commit'||!assertSha(ref.object.sha))
    fail('branch reference is missing or malformed.');
  return ref.object.sha;
}
function safeRecord(entry) {
  if(!entry||entry.type!=='blob'||entry.mode!=='100644'||
     !assertSha(entry.sha)||!Number.isSafeInteger(entry.size)||
     entry.size<2||entry.size>MAX_BLOB||
     typeof entry.path!=='string'||entry.path.length>240)
    fail('unsafe or oversized Git ledger record.');

  const parts=entry.path.split('/');
  if(parts.length!==3||!['claims','resources','submissions'].includes(parts[0])||
     !NAME.test(parts[1])||
     !(parts[0]==='resources'?RESOURCE:ISSUE).test(parts[2]))
    fail('unsafe record namespace or filename.');
  return entry.path;
}
function countKinds(entries) {
  const counts={claims:0,resources:0,submissions:0};
  for(const entry of entries)counts[entry.path.split('/')[0]]++;
  return counts;
}
function enumerateRecords(tree,requireSource) {
  if(tree?.truncated!==false||!Array.isArray(tree.tree)||
     tree.tree.length>500||!assertSha(tree.sha))
    fail('incomplete or unsupported pinned Git tree.');
  const entries=[],folded=new Set();
  for(const entry of tree.tree) {
    if(typeof entry?.path!=='string'||entry.path.length>300||
       entry.path.includes('\\')||entry.path.includes(':')||
       entry.path.startsWith('/')||
       entry.path.split('/').some(x=>!x||x==='.'||x==='..'))
      fail('unsafe Git tree path.');
    const name=entry.path.toLowerCase();
    if(folded.has(name))fail('duplicate or case-colliding Git tree path.');
    folded.add(name);
    if(entry.type==='tree') {
      if(entry.mode!=='040000'||!assertSha(entry.sha))
        fail('unsupported Git tree object.');
      continue;
    }
    if(entry.type!=='blob'||entry.mode!=='100644'||!assertSha(entry.sha)||
       !Number.isSafeInteger(entry.size)||entry.size<0||entry.size>MAX_BLOB)
      fail('unexpected Git blob metadata.');
    if(/^(claims|resources|submissions)\//.test(entry.path)) {
      safeRecord(entry);
      if(requireSource&&
         (entry.path.split('/')[0]!=='submissions'))
        fail('historical source contains an active coordination record.');
      entries.push(entry);
    }
  }
  if(entries.length>MAX_RECORDS)fail('too many ledger record blobs.');
  if(requireSource&&entries.length!==FROZEN_PUBLIC_SUBMISSIONS)
    fail('frozen historical submission inventory changed.');
  return entries;
}

async function getPinnedTree(api,repo,head) {
  const commit=await api.getGitCommit(repo,head);
  if(commit?.sha!==head||!assertSha(commit.tree?.sha))
    fail('pinned branch does not match Git commit.');
  const tree=await api.getGitTree(repo,commit.tree.sha);
  if(tree?.sha!==commit.tree.sha)
    fail('Git tree differs from pinned commit.');
  return tree;
}

async function readRecordBlobs(api,repo,entries) {
  const rows=[];
  for(const entry of entries) {
    const raw=await api.getGitBlob(repo,entry.sha);
    if(raw?.sha!==entry.sha||raw.encoding!=='base64'||
       !Number.isSafeInteger(raw.size)||raw.size!==entry.size||
       typeof raw.content!=='string'||
       raw.content.length>MAX_BLOB*2)
      fail('pinned Git blob response is incomplete or inconsistent.');
    const encoded=raw.content.replace(/\s/g,'');
    if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
      fail('noncanonical Git blob base64.');
    const bytes=Buffer.from(encoded,'base64');
    if(bytes.length!==entry.size||
       bytes.toString('base64')!==encoded||
       gitHash(bytes)!==entry.sha)
      fail('Git blob digest, decoded bytes or size mismatch.');
    let data;
    try {
      const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      data=JSON.parse(value);
    } catch {
      fail('pinned Git record is not valid UTF-8 JSON.');
    }
    if(!data||typeof data!=='object'||Array.isArray(data))
      fail('Git record payload must be a JSON object.');
    if(entry.path.startsWith('submissions/')&&data.state!=='submitted')
      fail('ledger submission marker has unexpected state.');
    rows.push({
      path:entry.path,git_blob_sha:entry.sha,content_base64:encoded
    });
  }
  return rows;
}

async function optionalBranchHead(api,repo) {
  try {return validRef(await api.getBranchRef(repo,DESTINATION_BRANCH));}
  catch(error) {
    if(error instanceof GitHubError&&error.status===404)return null;
    throw error;
  }
}

async function assertSafeOutputPath(target) {
  if(typeof target!=='string'||!isAbsolute(target)||
     target.length>1024||!target.toLowerCase().endsWith('.json')||
     /[\u0000-\u001f\u007f]/.test(target))
    fail('output must be an absolute JSON filename.');
  const full=resolve(target);
  const parent=dirname(full);
  // Reject any symlink in the output directory ancestry, not just the leaf.
  let cursor=parent;
  while(true) {
    let stat;
    try {stat=await lstat(cursor);}
    catch {fail('output parent directory must already exist.');}
    if(!stat.isDirectory()||stat.isSymbolicLink())
      fail('output parent cannot include symlinks or non-directories.');
    const higher=dirname(cursor);
    if(higher===cursor)break;
    cursor=higher;
  }
  const canonical=await realpath(parent);
  const root=await realpath(ROOT);
  const inside=relative(root,canonical);
  if(!inside||(!inside.startsWith('..'+sep)&&inside!=='..'&&
     !isAbsolute(inside)))
    fail('sensitive local backups must be outside the public checkout.');
  try {
    await lstat(full);
    fail('output already exists and will never be overwritten.');
  } catch(error) {
    if(error?.message?.startsWith('Verified local export blocked:'))throw error;
    if(error?.code!=='ENOENT')
      fail('output filename cannot be checked safely.');
  }
  return full;
}

async function saveNewOwnerFile(target,buffer) {
  let handle=null;
  try {
    handle=await open(target,fsConstants.O_WRONLY|fsConstants.O_CREAT|
      fsConstants.O_EXCL|(fsConstants.O_NOFOLLOW||0),0o600);
    await handle.writeFile(buffer);
    await handle.sync();
  } catch {
    fail('local backup could not be exclusively written; inspect file locally.');
  } finally {
    await handle?.close();
  }
}

/**
 * A one-time export for the OWNER'S LOCAL MACHINE.
 * Remote GitHub access is strictly GET-only; never log or return records,
 * paths, session IDs, repository identities or full manifest bytes.
 * Still NOT a complete repository mirror backup and NOT a migration.
 */
export async function exportVerifiedLocalLedgerBackup({
  api,destination,acknowledgedDestination,output,confirm=false
}) {
  if(confirm!==true)fail('explicit --confirm is required for local export.');
  const repo=validateOperatorSelection({
    repository:destination,acknowledgedRepository:acknowledgedDestination
  });
  const required=[
    'getRepository','getBranchRef','getGitCommit','getGitTree','getGitBlob'
  ];
  if(!api||!required.every(k=>typeof api[k]==='function'))
    fail('required read-only GitHub methods unavailable.');

  // Validate local destination BEFORE reading any private GitHub records.
  const path=await assertSafeOutputPath(output);
  const source=await inspectHistoricalSource({api});
  if(source.head!==FROZEN_PUBLIC_LEDGER_HEAD||
     source.records.claims!==0||source.records.resources!==0||
     source.records.submissions!==FROZEN_PUBLIC_SUBMISSIONS||
     source.unclassified_blobs!==1)
    fail('historical source no longer matches frozen audited checkpoint.');

  const privateMeta=await api.getRepository(repo);
  inspectPrivateLedger({
    config:{repository_visibility_required:'private',
      claim_store:{repo,branch:DESTINATION_BRANCH}},
    metadata:privateMeta
  });
  const destPreflight=await inspectPrivateDestination({api,destination:repo});
  if(destPreflight.records.claims||destPreflight.records.resources)
    fail('destination has active claims or resource locks needing review.');

  const sourceHead=validRef(await api.getBranchRef(
    PUBLIC_COORDINATOR,DESTINATION_BRANCH));
  if(sourceHead!==FROZEN_PUBLIC_LEDGER_HEAD)
    fail('historical source changed before blob export.');
  const srcTree=await getPinnedTree(api,PUBLIC_COORDINATOR,sourceHead);
  const sourceEntries=enumerateRecords(srcTree,true);
  const sourceRows=await readRecordBlobs(api,PUBLIC_COORDINATOR,sourceEntries);

  let destinationHead=null,destinationTree=null,destRows=[];
  if(destPreflight.branch_exists) {
    destinationHead=await optionalBranchHead(api,repo);
    if(!destinationHead)
      fail('destination coordination branch disappeared.');
    destinationTree=await getPinnedTree(api,repo,destinationHead);
    const destEntries=enumerateRecords(destinationTree,false);
    if(JSON.stringify(countKinds(destEntries))!==
       JSON.stringify(destPreflight.records))
      fail('destination record inventory changed during export.');
    destRows=await readRecordBlobs(api,repo,destEntries);
  } else {
    if(await optionalBranchHead(api,repo)!==null)
      fail('previously absent destination branch appeared.');
  }

  const backup={
    schema_version:'1-offline-ledger-backups',
    source:{repository:PUBLIC_COORDINATOR,head_sha:sourceHead,
      tree_sha:srcTree.sha,records:sourceRows},
    destination:{repository:repo,head_sha:destinationHead,
      tree_sha:destinationTree?.sha??null,records:destRows}
  };
  const report=rehearseLedgerBackups(backup);
  if(report.records.source.submissions!==FROZEN_PUBLIC_SUBMISSIONS||
     report.records.source.claims!==0||report.records.source.resources!==0)
    fail('local manifest does not preserve the frozen source inventory.');
  const encoded=Buffer.from(JSON.stringify(backup,null,2)+'\n','utf8');
  if(encoded.length>MAX_MANIFEST)
    fail('bounded local backup manifest size exceeded.');

  const sourceEnd=validRef(await api.getBranchRef(
    PUBLIC_COORDINATOR,DESTINATION_BRANCH));
  const destEnd=await optionalBranchHead(api,repo);
  if(sourceEnd!==sourceHead||destEnd!==destinationHead)
    fail('a coordination branch moved during the export.');
  const finalSource=await inspectHistoricalSource({api});
  const finalPrivate=await inspectPrivateDestination({api,destination:repo});
  if(finalSource.head!==sourceHead||
     finalPrivate.branch_exists!==(destinationHead!==null)||
     JSON.stringify(finalPrivate.records)!==
       JSON.stringify(destPreflight.records))
    fail('source/destination changed during final integrity validation.');

  // All validation is complete; only this local file is created.
  await saveNewOwnerFile(path,encoded);
  return {
    schema_version:'1-verified-local-record-backup-export',
    source_checkpoint_verified:true,
    destination_private_visibility_verified:true,
    destination_branch_exists:destinationHead!==null,
    historical_submissions:sourceRows.length,
    destination_records:destRows.length,
    identical_records:report.records.identical,
    conflicting_records:report.records.conflicting,
    destination_only_records:report.records.destination_only,
    record_blob_sha_verified:true,
    owner_file_created:true,
    full_git_repository_backup:false,
    github_writes:0,
    migration_performed:false,
    ready_to_cutover:false,
    note:'Keep the local file confidential; verify a separate FULL Git mirror backup before any approved migration.'
  };
}
