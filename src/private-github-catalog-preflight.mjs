import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {validateOperatorSelection,assertPrivateLedgerActivation}
  from './private-ledger-activation.mjs';
import {validateOwnerTaskCatalog} from './owner-task-catalog.mjs';

const SHA1=/^[0-9a-f]{40}$/i;
const SHA256=/^[0-9a-f]{64}$/i;
export const OWNER_CATALOG_PATH='owner-catalog/approved.json';
const MAX_BYTES=131072;

const blocked=()=>{throw new Error('Private GitHub catalog blocked: owner review or immutable evidence incomplete.');};
const sha1=x=>typeof x==='string'&&SHA1.test(x);
const sha256=x=>typeof x==='string'&&SHA256.test(x);

/**
 * Accept one exact regular-file blob at an owner-pinned Git commit.
 * Never trust GitHub's reported hash without hashing the decoded raw bytes.
 */
export function verifyPinnedCatalogBlob({entry,blob,approvedSha256,legacyTasks=[]}) {
  if(!entry||entry.path!==OWNER_CATALOG_PATH||
     entry.type!=='blob'||entry.mode!=='100644'||!sha1(entry.sha)||
     !Number.isSafeInteger(entry.size)||entry.size<1||entry.size>MAX_BYTES||
     !sha256(approvedSha256)||
     !blob||blob.encoding!=='base64'||!sha1(blob.sha)||
     blob.sha.toLowerCase()!==entry.sha.toLowerCase()||
     blob.size!==entry.size||
     typeof blob.content!=='string'||blob.content.length>175000)
    blocked();

  const encoded=blob.content.replace(/\s/g,'');
  if(!encoded || encoded.length%4!==0 ||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))blocked();
  const raw=Buffer.from(encoded,'base64');
  if(raw.length!==entry.size||raw.toString('base64')!==encoded)blocked();
  const gitDigest=createHash('sha1').update('blob '+raw.length+'\0')
    .update(raw).digest('hex');
  const exactSha256=createHash('sha256').update(raw).digest('hex');
  if(gitDigest.toLowerCase()!==entry.sha.toLowerCase()||
     exactSha256!==approvedSha256)blocked();

  let catalog;
  try{
    catalog=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));
    validateOwnerTaskCatalog(catalog,legacyTasks);
  }catch{blocked();}
  return {tasks:catalog.tasks,sha256:exactSha256};
}

/**
 * GET-only: after proving private visibility and historic submission preservation,
 * verify a reviewed catalog exists on the CURRENT PRIVATE main HEAD.
 *
 * Explicit two-part owner approval (commit SHA and file SHA-256) is required;
 * this cannot prove the owner inspected it or that main branch rules are
 * protected. It does not claim tasks, change the ledger or launch chats.
 */
export async function readVerifiedPrivateGitHubCatalog({
  api,repository,acknowledgedRepository,approvedMainSha,approvedSha256,
  legacyTasks=[]
}) {
  const selected=validateOperatorSelection({repository,acknowledgedRepository});
  if(!sha1(approvedMainSha)||!sha256(approvedSha256)||
     !api||!['getOwnerCatalogRef','getGitCommit','getGitTree','getGitBlob']
       .every(x=>typeof api[x]==='function'))blocked();

  const config={repository_visibility_required:'private',
    claim_store:{repo:selected,branch:'coordination/claims'}};
  const prior=await assertPrivateLedgerActivation({api,config});
  if(prior.status!=='readiness_verified'||
     prior.historical_submissions_preserved!==7)blocked();

  const before=await api.getOwnerCatalogRef(selected);
  if(before?.object?.type!=='commit'||
     before?.object?.sha!==approvedMainSha)blocked();
  const commit=await api.getGitCommit(selected,approvedMainSha);
  const treeSha=commit?.tree?.sha;
  if(commit?.sha!==approvedMainSha||!sha1(treeSha))blocked();
  const tree=await api.getGitTree(selected,treeSha);
  if(tree?.sha!==treeSha||tree.truncated!==false||
     !Array.isArray(tree.tree)||tree.tree.length>500)blocked();
  const aliases=tree.tree.filter(x=>x?.path?.toLowerCase()===
    OWNER_CATALOG_PATH.toLowerCase());
  if(aliases.length!==1||aliases[0].path!==OWNER_CATALOG_PATH)blocked();
  const entry=aliases[0];
  const blob=await api.getGitBlob(selected,entry.sha);
  const checked=verifyPinnedCatalogBlob({
    entry,blob,approvedSha256,legacyTasks
  });

  const after=await api.getOwnerCatalogRef(selected);
  if(after?.object?.type!=='commit'||after.object.sha!==approvedMainSha)
    blocked();
  // Recheck both PRIVATE visibility and the frozen historical submissions.
  const end=await assertPrivateLedgerActivation({api,config});
  if(end.status!=='readiness_verified'||
     end.historical_submissions_preserved!==7)blocked();

  const report = {
    schema_version:'1-private-github-owner-catalog-preflight',
    mode:'get-only',
    private_visibility_verified:true,
    historical_submissions_preserved:7,
    approved_private_main_head_verified:true,
    catalog_git_blob_and_sha256_verified:true,
    catalog_structure_verified:true,
    configured_tasks:checked.tasks.length,
    configured_write_tasks:checked.tasks.filter(x=>x.access==='write').length,
    eligible_for_live_alpha_doctor:true,
    owner_approval_proven_cryptographically:false,
    branch_protection_verified:false,
    owner_review_required:true,
    task_claimed:false,
    ready_to_launch:false,
    merge_authorized:false,
    next_step:'Owner independently reviews private main history and runs the full live readiness/collision gates before any claim.'
  };
  // Only trusted in-process coordinators may consume these vetted task objects.
  // Never serialize or return the tasks via an operator/CI/public response.
  return {report,tasks:checked.tasks};
}

/** Safe public-facing operator report: never includes private task details. */
export async function inspectApprovedPrivateGitHubCatalog(options) {
  const {report}=await readVerifiedPrivateGitHubCatalog(options);
  return report;
}
