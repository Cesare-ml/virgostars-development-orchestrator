import {createHash} from 'node:crypto';
import {constants as fsConstants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {rehearseLedgerBackups} from './offline-cutover-rehearsal.mjs';
import {FROZEN_PUBLIC_LEDGER_HEAD,FROZEN_PUBLIC_SUBMISSIONS} from './private-ledger-activation.mjs';
import {PUBLIC_COORDINATOR} from './private-ledger-preflight.mjs';

const SOURCE_TREE='892d39e23da8f6b4b16c9f2a8099df717b4221e7';
const MAX_FILE_BYTES=2_000_000;
const VALID_PATH=/^submissions\/([A-Za-z0-9][A-Za-z0-9_.-]*__[A-Za-z0-9][A-Za-z0-9_.-]*)\/issue-([1-9][0-9]*)\.json$/;
const fail=reason=>{throw new Error('Copy-only import plan blocked: '+reason);};
const ROOT=fileURLToPath(new URL('..',import.meta.url));

function submissionIdentity(record) {
  const match=record.path.match(VALID_PATH);
  if(!match)fail('submitted record has an unrecognized path.');
  let payload;
  try {
    const bytes=Buffer.from(record.content_base64,'base64');
    payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } catch {
    fail('submitted record cannot be decoded as UTF-8 JSON.');
  }
  const [owner,repo]=payload?.target_repository?.split('/')??[];
  if(!owner||!repo||owner+'__'+repo!==match[1]||
     !Number.isSafeInteger(payload.issue_number)||
     String(payload.issue_number)!==match[2]||
     payload.state!=='submitted')
    fail('submission metadata does not match its path or submitted state.');
  return record.path.toLowerCase();
}

/**
 * Rehearse exactly which seven immutable source markers are missing from
 * the PRIVATE destination. Pure and offline; no GitHub writes or disclosures.
 * The local manifest is NOT proof of live GitHub branch state or visibility.
 */
export function planCopyOnlyImport(manifest) {
  const rehearsal=rehearseLedgerBackups(manifest);
  if(manifest.source.repository!==PUBLIC_COORDINATOR||
     manifest.source.head_sha!==FROZEN_PUBLIC_LEDGER_HEAD||
     manifest.source.tree_sha!==SOURCE_TREE)
    fail('source backup does not match the immutable public checkpoint.');
  if(manifest.source.records.length!==FROZEN_PUBLIC_SUBMISSIONS||
     rehearsal.records.source.claims!==0||
     rehearsal.records.source.resources!==0||
     rehearsal.records.source.submissions!==FROZEN_PUBLIC_SUBMISSIONS)
    fail('historical source must contain exactly seven submitted markers and no active locks.');
  if(rehearsal.records.destination.claims||rehearsal.records.destination.resources)
    fail('private destination contains active claims or resource locks.');

  const old=new Map(),dest=new Map();
  for(const record of manifest.source.records)
    old.set(submissionIdentity(record),record.git_blob_sha);
  for(const record of manifest.destination.records)
    dest.set(submissionIdentity(record),record.git_blob_sha);
  if(old.size!==FROZEN_PUBLIC_SUBMISSIONS)
    fail('historical record identities are not unique.');

  let identical=0,missing=0,conflicts=0;
  for(const [path,sha] of old) {
    if(!dest.has(path))missing++;
    else if(dest.get(path)===sha)identical++;
    else conflicts++;
  }
  let destinationOnly=0;
  for(const path of dest.keys())
    if(!old.has(path))destinationOnly++;
  const reasons=[];
  if(conflicts)reasons.push('DIFFERENT_BYTES_AT_EXISTING_SUBMISSION_PATH');
  if(destinationOnly)reasons.push('UNREVIEWED_DESTINATION_ONLY_SUBMISSIONS');
  if(manifest.destination.head_sha===null)
    reasons.push('PRIVATE_COORDINATION_BRANCH_NOT_YET_CREATED');
  if(identical+missing+conflicts!==FROZEN_PUBLIC_SUBMISSIONS)
    fail('incomplete source-to-destination comparison.');

  return {
    schema_version:'1-offline-private-copy-plan',
    mode:'local-records-only',
    immutable_public_checkpoint_matched:true,
    git_blob_integrity_checked:true,
    required_historical_submissions:FROZEN_PUBLIC_SUBMISSIONS,
    submissions_already_identical:identical,
    submissions_to_copy:missing,
    submissions_conflicting:conflicts,
    destination_only_submissions:destinationOnly,
    would_have_submissions_after_clean_copy:FROZEN_PUBLIC_SUBMISSIONS,
    destination_branch_present:manifest.destination.head_sha!==null,
    blockers:reasons,
    eligible_for_independent_owner_review:reasons.length===0,
    live_github_metadata_verified:false,
    private_visibility_verified:false,
    git_repository_mirror_backup_verified:false,
    changes_to_local_or_remote_data:0,
    import_performed:false,
    approval_granted:false,
    warning:'This offline manifest may be stale or fabricated. Recheck live private visibility and frozen Git refs, take full backups and obtain explicit owner approval before any copy.'
  };
}

/**
 * Reject symlinks and project-local files; do not surface the local filename,
 * repository identifiers, record names, session IDs or record contents.
 */
export async function readVerifiedLocalCopyManifest(file) {
  if(typeof file!=='string'||!isAbsolute(file)||file.length>1024)
    fail('an absolute owner-local manifest file is required.');
  let descriptor;
  try {
    const stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||
       stat.size<2||stat.size>MAX_FILE_BYTES)
      fail('manifest must be a bounded ordinary file, not a symlink.');
    const canonical=await realpath(file),root=await realpath(ROOT);
    const inside=relative(root,canonical);
    if(!inside||(!inside.startsWith('..'+sep)&&inside!=='..'&&
       !isAbsolute(inside)))
      fail('owner-private backup must remain outside the public checkout.');

    descriptor=await open(file,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW||0));
    const before=await descriptor.stat();
    if(!before.isFile()||before.size!==stat.size)
      fail('manifest changed while opening.');
    const bytes=await descriptor.readFile();
    const after=await descriptor.stat();
    if(bytes.length!==before.size||after.size!==before.size||
       after.mtimeMs!==before.mtimeMs||after.ino!==before.ino)
      fail('manifest changed while reading.');
    let data;
    try {
      data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    } catch {
      fail('owner-local backup must contain valid UTF-8 JSON.');
    }
    const fingerprint=createHash('sha256').update(bytes).digest('hex');
    const report={...planCopyOnlyImport(data),local_manifest_sha256:fingerprint};
    return {report,manifest:data};
  } catch(error) {
    if(error?.message?.startsWith('Copy-only import plan blocked:'))throw error;
    fail('owner-local backup could not be read or verified.');
  } finally {
    await descriptor?.close();
  }
}

/** Return ONLY aggregate, non-sensitive status from the owner-local file. */
export async function planLocalCopyOnlyImport(file) {
  const {report}=await readVerifiedLocalCopyManifest(file);
  return report;
}
