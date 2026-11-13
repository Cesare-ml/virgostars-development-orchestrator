import {assertSession,taskKey,submissionKey} from './claims.mjs';
import {resourceKey,resourceMatches,validateTaskCatalog} from './resources.mjs';

/**
 * Complete only the second half of a submitted write-task release.
 *
 * GitHub Contents does not atomically delete the issue claim and its resource
 * lock. If the issue delete succeeds but the resource delete fails, an agent
 * retry previously saw "already-submitted" and left a permanent orphan.
 * This path NEVER removes an unsubmitted lock or an active issue claim.
 *
 * The caller must first observe a completed submission with no issue claim.
 */
export async function recoverSubmittedResourceRelease({
  api,config,tasks,repo,issue,session,prior
}) {
  assertSession(session);
  const marker=prior?.data;
  if(!marker || marker.state!=='submitted' ||
     marker.target_repository!==repo || marker.issue_number!==issue ||
     marker.session_id!==session)
    throw new Error('Submission identity changed; manual reconciliation required.');

  if(marker.access==='read')return false;
  if(marker.access!=='write')
    throw new Error('Unknown submission access; manual reconciliation required.');

  // Use the exact still-approved local task catalog, not an untrusted scope
  // or repository name copied from the submission or resource record.
  validateTaskCatalog(tasks);
  const task=tasks.find(t=>t.repository===repo && t.issue===issue);
  if(!task || task.access!=='write' || task.role!==marker.role ||
     task.resource_scope.id!==marker.resource_scope_id)
    throw new Error('Submitted write task changed; manual reconciliation required.');
  const expected={
    target_repository:repo,issue_number:issue,session_id:session,
    resource_scope_id:task.resource_scope.id,
    resource_roots:[...task.resource_scope.roots].sort()
  };
  if(marker.schema_version!==1 || marker.scope_verdict!=='scope-clean' ||
     marker.collision_audit!=='single-candidate' ||
     !Number.isSafeInteger(marker.pull_request) || marker.pull_request<1 ||
     !/^[0-9a-f]{40}$/i.test(marker.audited_head_sha||'') ||
     !/^[0-9a-f]{40}$/i.test(marker.audited_base_sha||'') ||
     marker.last_handoff?.head_sha!==marker.audited_head_sha ||
     !marker.last_handoff?.summary?.trim())
    throw new Error('Submitted PR audit evidence is incomplete; manual recovery required.');

  const ledger=config.claim_store.repo,branch=config.claim_store.branch;
  const path=resourceKey(repo,expected.resource_scope_id);
  const resource=await api.getClaim(ledger,path,branch);
  if(!resource)return false; // Already released: repeated retries are safe.
  if(!resourceMatches(resource,expected))
    throw new Error('Resource belongs to another task/session or scope; recovery blocked.');

  // Recheck just before the SHA-conditional delete. A valid submission marker
  // prevents normal claim() from re-offering the issue; any unexpected claim
  // is still an absolute blocker (including a claim owned by this session).
  const [activeClaim,latestSubmission]=await Promise.all([
    api.getClaim(ledger,taskKey(repo,issue),branch),
    api.getClaim(ledger,submissionKey(repo,issue),branch)
  ]);
  if(activeClaim || !latestSubmission || latestSubmission.sha!==prior.sha)
    throw new Error('Claim or submission changed during recovery; manual reconciliation required.');

  try {
    await api.deleteClaim(ledger,path,branch,resource.sha,resource.data);
  } catch(error) {
    throw new Error('Resource release outcome uncertain; inspect private ledger and retry with the same owner.',{cause:error});
  }
  return true;
}
