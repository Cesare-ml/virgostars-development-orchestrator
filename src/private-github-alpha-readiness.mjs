import {readVerifiedPrivateGitHubCatalog}
  from './private-github-catalog-preflight.mjs';
import {inspectAlphaLaunch} from './alpha-doctor.mjs';

const blocked=()=>{throw new Error('Private GitHub alpha readiness blocked: owner-reviewed configuration or immutable checkpoint required.');};

/**
 * Compose the verified PRIVATE GitHub task catalog with the existing live
 * alpha doctor. No local task JSON, no claim and no task data in the report.
 *
 * This is a read-only eligibility check, NOT an authorization to launch,
 * approve tasks, take over a lock, or merge any code.
 */
export async function inspectPrivateGitHubAlphaReadiness({
  api,config,repository,acknowledgedRepository,
  approvedMainSha,approvedSha256,legacyTasks=[]
}) {
  if(!config||config.repository_visibility_required!=='private'||
     config.claim_store?.repo!==repository||
     config.claim_store?.branch!=='coordination/claims'||
     !Array.isArray(config.active_repositories))blocked();

  const vetted=await readVerifiedPrivateGitHubCatalog({
    api,repository,acknowledgedRepository,
    approvedMainSha,approvedSha256,legacyTasks
  });

  // This invokes *all* existing live checks: legacy marker preservation,
  // single-snapshot ledger integrity, distinct developer resource scopes,
  // open issues, upstream PR freshness and competing open-PR file audits.
  const doctor=await inspectAlphaLaunch({api,config,tasks:vetted.tasks});

  // A catalog update between vetting and the live scan makes the snapshot
  // ineligible, even if the individual Git blob verified correctly.
  const finalRef=await api.getOwnerCatalogRef(repository);
  if(finalRef?.object?.type!=='commit'||
     finalRef?.object?.sha!==approvedMainSha)blocked();

  // Output is deliberately aggregate-only: no task bodies, repository names,
  // issue IDs, owner approvals, branch refs or secret SHA fingerprints.
  return {
    ...doctor,
    schema_version:'1-private-github-owner-alpha-readiness',
    mode:'get-only',
    private_catalog_verified:true,
    owner_pinned_private_main_stable:true,
    live_readiness_prerequisites_passed:doctor.ready_for_manual_pilot===true,
    owner_approval_proven_cryptographically:false,
    owner_final_launch_approval_required:true,
    ready_to_launch:false,
    work_claimed:false,
    merge_authorized:false,
    next_step:doctor.ready_for_manual_pilot
      ? 'Owner separately verifies full backup, approvals and two independent chat identities before supervised claims.'
      : 'Owner resolves the reported blocker codes; no claims may be acquired.'
  };
}
