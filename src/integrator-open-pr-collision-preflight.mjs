import {makeGitHubClient} from './github.mjs';
import {inspectIntegratorChangedFile} from './integrator-changed-file-safety.mjs';

const SHA=/^[a-f0-9]{40}$/i;
const REPO=/^[a-z\d][a-z\d._-]*\/[a-z\d][a-z\d._-]*$/i;
const MAX_PRS=200, MAX_FILES=200;
const blocked=message=>{throw new Error('Integrator PR collision preflight blocked: '+message)};
const sha=x=>typeof x==='string'&&SHA.test(x);
const number=x=>Number.isSafeInteger(x)&&x>0;
const fold=x=>x.toLowerCase();

function prIdentity(pr) {
  if(!number(pr?.number)||pr.state!=='open'||!sha(pr.head?.sha)||
     !sha(pr.base?.sha)||typeof pr.head?.ref!=='string'||!pr.head.ref||
     typeof pr.base?.ref!=='string'||!pr.base.ref||
     typeof pr.head?.repo?.full_name!=='string'||
     typeof pr.base?.repo?.full_name!=='string')
    blocked('missing open PR identity or head/base commit SHA');
  return [pr.number,pr.head.sha,pr.base.sha,pr.head.ref,pr.base.ref,
    pr.head.repo.full_name,pr.base.repo.full_name].join('|');
}
function freezeOpenPRs(list,repository,target) {
  if(!Array.isArray(list)||!list.length||list.length>MAX_PRS)
    blocked('open PR inventory absent, truncated or above safe limit');
  const seen=new Set(),fingerprint=[];
  for(const pr of list) {
    if(seen.has(pr?.number))blocked('duplicate PR in open listing');
    seen.add(pr.number);
    if(pr.base?.repo?.full_name!==repository)
      blocked('open PR inventory contains unexpected base repository');
    fingerprint.push(prIdentity(pr));
  }
  if(!seen.has(target))blocked('target PR not present in complete open inventory');
  return fingerprint.sort().join('\n');
}
function pathsOf(files,expectedCount,prNumber) {
  if(!Array.isArray(files)||!number(expectedCount)||expectedCount>MAX_FILES||
     files.length!==expectedCount)
    blocked('PR #'+prNumber+' has incomplete changed-file pagination');
  const names=new Set(),paths=new Set();
  for(const entry of files) {
    const inspected=inspectIntegratorChangedFile(entry);
    if(!inspected.valid)blocked('PR #'+prNumber+' has unknown/unsafe changed-file metadata');
    const current=fold(entry.filename);
    if(names.has(current))blocked('PR #'+prNumber+' has duplicate changed filenames');
    names.add(current);
    for(const path of inspected.paths)paths.add(fold(path));
  }
  return paths;
}

/**
 * Authenticated GET-only full-repository collision audit. Uses the existing
 * makeGitHubClient pagination guards; no caller-supplied "complete" booleans.
 *
 * A clean result is still NOT a merge authorization. Parent dependency PRs
 * with overlapping paths are deliberately blocking until integrated safely.
 */
export async function auditIntegratorOpenPrCollisions({
  token,fetchImpl,repository,prNumber,expectedHeadSha
}={}) {
  if(!REPO.test(repository||'')||!number(prNumber)||!sha(expectedHeadSha))
    blocked('missing approved target PR identity or SHA');
  const api=makeGitHubClient({token,fetchImpl});
  const first=await api.getOpenPullRequests(repository);
  const frozen=freezeOpenPRs(first,repository,prNumber);
  let target=null,scannedFiles=0;
  const peers=[];
  const byNumber=[...first].sort((a,b)=>a.number-b.number);
  for(const listing of byNumber) {
    const detail=await api.getPullRequest(repository,listing.number);
    if(prIdentity(detail)!==prIdentity(listing))
      blocked('PR #'+listing.number+' drifted between inventory and details');
    if(!number(detail.changed_files)||detail.changed_files>MAX_FILES)
      blocked('PR #'+listing.number+' file count cannot be verified');
    const files=await api.getPullRequestFiles(repository,listing.number);
    const paths=pathsOf(files,detail.changed_files,listing.number);
    scannedFiles+=files.length;
    if(listing.number===prNumber) {
      if(detail.head.sha!==expectedHeadSha||
         detail.head.repo?.full_name!==repository)
        blocked('target PR SHA changed or head repository mismatched');
      target={identity:prIdentity(detail),paths};
    } else peers.push({number:listing.number,head_sha:detail.head.sha,paths});
  }
  if(!target)blocked('target PR disappeared during scan');

  const collisions=[];
  for(const peer of peers) {
    const intersect=[...peer.paths].filter(path=>target.paths.has(path)).sort();
    if(intersect.length)collisions.push({
      pr_number:peer.number,head_sha:peer.head_sha,conflicting_paths:intersect
    });
  }
  const final=await api.getOpenPullRequests(repository);
  if(freezeOpenPRs(final,repository,prNumber)!==frozen)
    blocked('open PR inventory changed during collision audit');
  const currentTarget=await api.getPullRequest(repository,prNumber);
  if(prIdentity(currentTarget)!==target.identity||
     currentTarget.head.sha!==expectedHeadSha)
    blocked('target PR moved after changed-file audit');
  return {
    verdict:collisions.length?'blocked':'candidate',
    repository,pr_number:prNumber,head_sha:expectedHeadSha,
    scanned_open_prs:byNumber.length,scanned_files:scannedFiles,
    collision_count:collisions.length,collisions,
    merge_authorized:false,merge_executed:false,
    private_integrator_claim_verified:false,
    note:'Read-only scoped collision snapshot; not an owner approval, a lease, or merge authorization. Recheck immediately before any authorized merge.'
  };
}
