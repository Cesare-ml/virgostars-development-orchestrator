import {GitHubError} from './github.mjs';
import {inspectPrivateLedger} from './ledger-visibility.mjs';

export const PUBLIC_COORDINATOR='Cesare-ml/virgostars-development-orchestrator';
export const DESTINATION_BRANCH='coordination/claims';
const REPO=/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const SHA=/^[a-f0-9]{40}$/i;

function invalid(message) {
  throw new Error('Private destination preflight blocked: '+message);
}
function validateName(name) {
  if(typeof name!=='string'||!REPO.test(name)||name.includes('..')||
     name.toLowerCase()===PUBLIC_COORDINATOR.toLowerCase())
    invalid('choose a distinct private GitHub repository.');
  return name;
}
function privateConfig(repo) {
  return {
    repository_visibility_required:'private',
    claim_store:{repo,branch:DESTINATION_BRANCH}
  };
}
function inspectMeta(repo,metadata) {
  // Reuse the same strict live-visibility gate as legacy protected operations.
  inspectPrivateLedger({config:privateConfig(repo),metadata});
}
function sha(value) {
  return typeof value==='string'&&SHA.test(value);
}

/**
 * A local read-only check. Does not fetch or expose private blob contents,
 * paths, tokens, session IDs, owners, issue numbers or record values.
 */
export async function inspectPrivateDestination({api,destination}) {
  const repo=validateName(destination);
  if(!api||!['getRepository','getBranchRef','getGitCommit','getGitTree']
    .every(key=>typeof api[key]==='function'))
    invalid('required read-only GitHub API methods unavailable.');

  inspectMeta(repo,await api.getRepository(repo));

  let ref;
  try {
    ref=await api.getBranchRef(repo,DESTINATION_BRANCH);
  } catch(error) {
    // Only an explicitly absent branch (after a verified private repo) is
    // classified as uninitialized. All other errors remain hard failures.
    if(!(error instanceof GitHubError)||error.status!==404)throw error;
    // A branch created after the first 404 must not be mistaken for an
    // empty target. Recheck absence before claiming a stable snapshot.
    try {
      await api.getBranchRef(repo,DESTINATION_BRANCH);
    } catch(recheckError) {
      if(!(recheckError instanceof GitHubError)||recheckError.status!==404)
        throw recheckError;
      inspectMeta(repo,await api.getRepository(repo));
      return {
        schema_version:'1-private-destination-preflight',
      private_visibility_verified:true,
      branch_exists:false,
      status:'private_branch_needs_setup',
      records:{claims:0,resources:0,submissions:0},
      ready_to_migrate:false,write_enabled:false,
      requires_owner_reconciliation:true,
      next_step:'Create the private coordination branch only after explicit owner approval.'
      };
    }
    invalid('destination branch appeared during the private metadata scan.');
  }
  const commitSha=ref?.object?.sha;
  if(ref?.object?.type!=='commit'||!sha(commitSha))
    invalid('GitHub returned an invalid coordination branch reference.');

  const commit=await api.getGitCommit(repo,commitSha);
  const treeSha=commit?.tree?.sha;
  if(commit?.sha!==commitSha||!sha(treeSha))
    invalid('GitHub branch commit or tree does not match the pinned ref.');
  const tree=await api.getGitTree(repo,treeSha);
  if(tree?.sha!==treeSha||tree?.truncated!==false||
     !Array.isArray(tree?.tree)||tree.tree.length>500)
    invalid('the private ledger tree is incomplete or oversized.');

  const records={claims:0,resources:0,submissions:0};
  const seen=new Set();
  for(const entry of tree.tree) {
    if(!entry||typeof entry.path!=='string'||
       entry.path.length>300||entry.path.startsWith('/')||
       entry.path.includes('\\')||
       entry.path.split('/').some(x=>!x||x==='.'||x==='..'))
      invalid('unsafe tree path in destination.');
    const folded=entry.path.toLowerCase();
    if(seen.has(folded))invalid('duplicate destination tree path.');
    seen.add(folded);
    if(entry.type==='blob') {
      if(!sha(entry.sha)||!Number.isSafeInteger(entry.size)||
         entry.size<0||entry.size>65536||entry.mode!=='100644')
        invalid('unsupported or oversized destination record.');
      for(const key of Object.keys(records)) {
        if(entry.path.startsWith(key+'/'))records[key]++;
      }
    } else if(entry.type!=='tree'||entry.mode!=='040000') {
      invalid('unsupported destination Git object type.');
    }
  }

  // Re-fetch the ref after enumeration: a moving branch invalidates the
  // counts even if all objects themselves were individually well formed.
  const lastRef=await api.getBranchRef(repo,DESTINATION_BRANCH);
  if(lastRef?.object?.type!=='commit'||lastRef.object.sha!==commitSha)
    invalid('destination branch changed while its records were inspected.');
  // A visibility change during the scan invalidates the result.
  inspectMeta(repo,await api.getRepository(repo));
  const hasRecords=Object.values(records).some(x=>x>0);
  return {
    schema_version:'1-private-destination-preflight',
    private_visibility_verified:true,
    branch_exists:true,
    status:hasRecords?'existing_records_need_reconciliation':'empty_branch_needs_owner_approval',
    records,
    ready_to_migrate:false,write_enabled:false,
    requires_owner_reconciliation:true,
    next_step:hasRecords
      ?'Review existing private records and resolve conflicts before approving any transfer.'
      :'Review branch isolation and approve a migration plan before enabling writes.'
  };
}
