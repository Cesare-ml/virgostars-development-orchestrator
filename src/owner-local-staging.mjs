import {createHash} from 'node:crypto';
import {constants as fsConstants} from 'node:fs';
import {lstat,mkdir,open,readFile,realpath,rm} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readVerifiedLocalCopyManifest} from './offline-ledger-copy-plan.mjs';

const SHA256=/^[a-f0-9]{64}$/;
const SHA1=/^[a-f0-9]{40}$/;
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const fail=reason=>{throw new Error('Owner staging blocked: '+reason);};
const gitBlobHash=bytes=>createHash('sha1')
  .update('blob '+bytes.length+'\0').update(bytes).digest('hex');

function safelyMissingRecords(manifest,report) {
  if(!report.eligible_for_independent_owner_review||
     report.blockers.length||!report.destination_branch_present||
     report.submissions_conflicting||report.destination_only_submissions)
    fail('local copy plan has unresolved review blockers.');
  const existing=new Set(manifest.destination.records.map(r=>r.path.toLowerCase()));
  const missing=manifest.source.records.filter(r=>!existing.has(r.path.toLowerCase()));
  if(missing.length!==report.submissions_to_copy)
    fail('local copy plan changed since validation.');
  if(missing.length===0)
    fail('all historical submissions are already present; nothing to stage.');
  return missing;
}

async function requirePrivateNewDirectory(output) {
  if(typeof output!=='string'||!isAbsolute(output)||output.length>1024||
     /[\u0000-\u001f\u007f]/.test(output))
    fail('an absolute owner-private staging directory is required.');
  const target=resolve(output);
  const parent=dirname(target);
  let folder=parent;
  // Reject symlinks anywhere in existing parent ancestry, not only leaf.
  while(true) {
    let metadata;
    try {metadata=await lstat(folder);}
    catch {fail('staging parent must already exist as a non-symlink directory.');}
    if(!metadata.isDirectory()||metadata.isSymbolicLink())
      fail('staging parent must contain only real directories.');
    const next=dirname(folder);
    if(next===folder)break;
    folder=next;
  }
  const [canonical,checkout]=await Promise.all([realpath(parent),realpath(ROOT)]);
  const inside=relative(checkout,canonical);
  if(!inside||(!inside.startsWith('..'+sep)&&inside!=='..'&&!isAbsolute(inside)))
    fail('owner-private staging must be outside the public checkout.');
  try {
    await lstat(target);
    fail('staging directory already exists; it will never be overwritten.');
  } catch(error) {
    if(error?.message?.startsWith('Owner staging blocked:'))throw error;
    if(error?.code!=='ENOENT')
      fail('staging destination cannot be checked safely.');
  }
  return target;
}

async function stageOne(root,record) {
  // Fully validated by immutable historical checkpoint + Git blob parser.
  // Explicitly avoid unsafe paths or directory traversal even on repeated use.
  const parts=record.path.split('/');
  if(parts.length!==3||parts[0]!=='submissions'||
     !/^[A-Za-z0-9][A-Za-z0-9_.-]*__[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(parts[1])||
     !/^issue-[1-9][0-9]*\.json$/.test(parts[2])||
     !SHA1.test(record.git_blob_sha||''))
    fail('unexpected historical staging file path.');
  const bytes=Buffer.from(record.content_base64,'base64');
  if(gitBlobHash(bytes)!==record.git_blob_sha)
    fail('historical staging bytes do not match frozen Git blob SHA.');
  const folder=join(root,'submissions',parts[1]);
  const target=join(folder,parts[2]);
  let handle;
  try {
    handle=await open(target,
      fsConstants.O_WRONLY|fsConstants.O_CREAT|fsConstants.O_EXCL|
      (fsConstants.O_NOFOLLOW||0),0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle?.close();
  }
  const written=await readFile(target);
  if(written.length!==bytes.length||gitBlobHash(written)!==record.git_blob_sha)
    fail('staged file verification failed after writing.');
  return bytes.length;
}

/**
 * Writes ONLY missing historical submission bytes into a freshly created
 * LOCAL owner-private directory, with no remote access or import. No contents,
 * relative paths, repository names, sessions or output path are returned.
 */
export async function stageOwnerLocalMissingSubmissions({
  manifestFile,outputDirectory,approvedSha256,confirm=false
}) {
  if(confirm!==true)fail('explicit --confirm is required for local staging.');
  if(typeof approvedSha256!=='string'||!SHA256.test(approvedSha256))
    fail('VS_PRIVATE_BACKUP_APPROVED_SHA256 must be a reviewed 64-character lowercase SHA-256.');
  const output=await requirePrivateNewDirectory(outputDirectory);
  // Parse and fingerprint the exact manifest bytes once; all Git blob,
  // immutable historic checkpoint and path identity checks are reused here.
  const {manifest,report}=await readVerifiedLocalCopyManifest(manifestFile);
  if(report.local_manifest_sha256!==approvedSha256)
    fail('owner approval fingerprint does not match the exact local manifest.');
  const records=safelyMissingRecords(manifest,report);

  let created=false,bytesWritten=0;
  try {
    await mkdir(output,{mode:0o700});
    created=true;
    await mkdir(join(output,'submissions'),{mode:0o700});
    const folders=new Set();
    for(const record of records) {
      const folder=record.path.split('/')[1];
      if(!folders.has(folder)) {
        await mkdir(join(output,'submissions',folder),{mode:0o700});
        folders.add(folder);
      }
      bytesWritten+=await stageOne(output,record);
    }
  } catch {
    // Clean only the directory this invocation created; never alter the
    // pre-existing parent, the approved backup input or any GitHub repo.
    if(created) {
      try {await rm(output,{recursive:true,force:true});}
      catch {fail('staging failed and local cleanup needs manual inspection.');}
    }
    fail('staging did not finish; no remote data was modified.');
  }

  return {
    schema_version:'1-owner-local-submission-stage',
    mode:'offline-local-only',
    approved_manifest_sha256:approvedSha256,
    immutable_history_verified:true,
    exact_source_git_blobs_verified:true,
    destination_branch_present_in_local_manifest:true,
    previously_identical_submissions:report.submissions_already_identical,
    newly_staged_submissions:records.length,
    required_historical_submissions:report.required_historical_submissions,
    bytes_staged:bytesWritten,
    staging_directory_created:true,
    file_overwrite_performed:false,
    github_requests:0,
    remote_import_performed:false,
    full_git_mirror_verified:false,
    live_private_visibility_verified:false,
    permission_to_import_granted:false,
    warning:'The PRIVATE staging directory contains original confidential records. No live GitHub state was verified; require separate full mirror backups and explicit owner approval before any remote copy.'
  };
}
