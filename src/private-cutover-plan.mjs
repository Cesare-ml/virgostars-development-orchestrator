import {GitHubError} from './github.mjs';
import {
  PUBLIC_COORDINATOR,DESTINATION_BRANCH,inspectPrivateDestination
} from './private-ledger-preflight.mjs';
import {inspectPrivateLedger} from './ledger-visibility.mjs';

const SHA=/^[a-f0-9]{40}$/i;
const MAX_TREE_ENTRIES=500;
const KINDS=['claims','resources','submissions'];
const fail=message=>{throw new Error('Cutover dry run blocked: '+message);};
const sha=x=>typeof x==='string'&&SHA.test(x);
const sameCounts=(x,y)=>KINDS.every(k=>x[k]===y[k]);

function requirePublicSource(meta) {
  if(meta?.full_name!==PUBLIC_COORDINATOR||
     meta?.private!==false||meta?.visibility!=='public'||
     meta?.archived===true||meta?.disabled===true)
    fail('historical source visibility or repository identity changed.');
}
function requirePrivateDestination(repo,meta) {
  // The same strict fail-closed gate protects every private ledger read.
  inspectPrivateLedger({config:{
    repository_visibility_required:'private',
    claim_store:{repo,branch:DESTINATION_BRANCH}
  },metadata:meta});
}
function branchCommit(ref) {
  const id=ref?.object?.sha;
  if(ref?.object?.type!=='commit'||!sha(id))
    fail('branch does not point to a valid Git commit.');
  return id;
}
function safeTreePath(value) {
  return typeof value==='string'&&value.length>=1&&value.length<=300&&
    !value.startsWith('/')&&!value.includes('\\')&&!value.includes(':')&&
    !/[\x00-\x1f\x7f]/.test(value)&&
    value.split('/').every(x=>x&&x!=='.'&&x!=='..');
}

/** Aggregate counts only; rejects unsafe/missing/partial Git tree metadata. */
export function summarizeHistoricalLedgerTree(tree) {
  if(!tree||tree.truncated!==false||!Array.isArray(tree.tree)||
     !sha(tree.sha)||tree.tree.length>MAX_TREE_ENTRIES)
    fail('public source Git tree is missing, truncated or oversized.');
  const records={claims:0,resources:0,submissions:0};
  let unclassified_blobs=0;
  const seen=new Set();
  for(const item of tree.tree) {
    if(!item||!safeTreePath(item.path))
      fail('unsafe source Git tree path.');
    const folded=item.path.toLowerCase();
    if(seen.has(folded))fail('case-colliding source Git tree entries.');
    seen.add(folded);
    if(item.type==='tree') {
      if(item.mode!=='040000'||!sha(item.sha))
        fail('unsupported source Git tree object.');
      continue;
    }
    if(item.type!=='blob'||item.mode!=='100644'||!sha(item.sha)||
       !Number.isSafeInteger(item.size)||item.size<0||item.size>65536)
      fail('unsupported or oversized source Git blob.');
    const kind=KINDS.find(k=>item.path.startsWith(k+'/'));
    if(kind)records[kind]++;
    else unclassified_blobs++;
  }
  return {records,unclassified_blobs};
}

export async function inspectHistoricalSource({api}) {
  if(!api||!['getRepository','getBranchRef','getGitCommit','getGitTree']
    .every(key=>typeof api[key]==='function'))
    fail('read-only GitHub metadata client unavailable.');
  requirePublicSource(await api.getRepository(PUBLIC_COORDINATOR));
  const original=branchCommit(await api.getBranchRef(
    PUBLIC_COORDINATOR,DESTINATION_BRANCH));
  const commit=await api.getGitCommit(PUBLIC_COORDINATOR,original);
  const treeId=commit?.tree?.sha;
  if(commit?.sha!==original||!sha(treeId))
    fail('source branch commit does not match its Git tree.');
  const tree=await api.getGitTree(PUBLIC_COORDINATOR,treeId);
  if(tree?.sha!==treeId)
    fail('source Git tree differs from pinned commit.');
  const counts=summarizeHistoricalLedgerTree(tree);
  const reread=branchCommit(await api.getBranchRef(
    PUBLIC_COORDINATOR,DESTINATION_BRANCH));
  if(reread!==original)
    fail('source branch moved while the records were inspected.');
  requirePublicSource(await api.getRepository(PUBLIC_COORDINATOR));
  // Keep the SHA internal: the public output includes counts, not per-record
  // paths, session IDs or source/destination branch identifiers.
  return {...counts,head:original};
}

async function optionalPrivateBranchRef(api,destination) {
  try {
    return branchCommit(await api.getBranchRef(destination,DESTINATION_BRANCH));
  } catch(error) {
    if(error instanceof GitHubError&&error.status===404)return null;
    throw error;
  }
}

/**
 * Both sources are read-only. Every result is non-authorizing and contains
 * counts/blocker codes only; this cannot create/move/approve a private ledger.
 */
export async function planPrivateCutover({api,destination}) {
  if(typeof destination!=='string'||destination.length>200||
     destination.toLowerCase()===PUBLIC_COORDINATOR.toLowerCase())
    fail('choose an independent owner-controlled private destination.');
  // Check source first, and independently verify private visibility before
  // examining even a destination branch reference.
  const source=await inspectHistoricalSource({api});
  requirePrivateDestination(destination,await api.getRepository(destination));
  const destStart=await optionalPrivateBranchRef(api,destination);
  const target=await inspectPrivateDestination({api,destination});
  const destEnd=await optionalPrivateBranchRef(api,destination);
  if(destStart!==destEnd ||
     target.branch_exists!==(destStart!==null))
    fail('destination branch changed during the combined comparison.');
  // No guaranteed atomic read across GitHub repositories; check source one
  // last time, and never claim this substitutes for a cutover freeze/lock.
  const sourceEnd=branchCommit(await api.getBranchRef(
    PUBLIC_COORDINATOR,DESTINATION_BRANCH));
  if(sourceEnd!==source.head)
    fail('source branch changed during destination verification.');
  requirePublicSource(await api.getRepository(PUBLIC_COORDINATOR));
  requirePrivateDestination(destination,await api.getRepository(destination));

  const blockers=[];
  if(source.records.claims||source.records.resources)
    blockers.push('SOURCE_HAS_ACTIVE_LOCKS');
  if(source.unclassified_blobs)
    blockers.push('SOURCE_UNCLASSIFIED_BLOBS_REQUIRE_REVIEW');
  if(!source.records.submissions)
    blockers.push('SOURCE_HAS_NO_HISTORICAL_SUBMISSIONS');
  if(!target.branch_exists)
    blockers.push('DESTINATION_BRANCH_NOT_CONFIGURED');
  else if(Object.values(target.records).some(n=>n>0))
    blockers.push('DESTINATION_CONTAINS_EXISTING_RECORDS');
  else
    blockers.push('DESTINATION_EMPTY_REQUIRES_OWNER_APPROVAL');
  blockers.push('OWNER_APPROVAL_AND_PRIVATE_LEDGER_CUTOVER_REQUIRED');

  return {
    schema_version:'1-private-cutover-plan',
    mode:'metadata-only',
    source_visibility_verified:'public',
    destination_visibility_verified:'private',
    source_snapshot_stable:true,
    destination_snapshot_stable:true,
    source:{
      records:{...source.records},
      unclassified_blobs:source.unclassified_blobs
    },
    destination:{
      branch_exists:target.branch_exists,
      records:{...target.records}
    },
    blockers,
    ready_to_migrate:false,
    writes_enabled:false,
    historical_data_moved:false,
    independent_review:'pending'
  };
}
