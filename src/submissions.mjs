import {assertSession, status, release, submissionKey} from './claims.mjs';
import {GitHubError} from './github.mjs';
import {auditTaskPullRequest} from './pr-audit.mjs';

/**
 * Persist "submitted for review", then release the owner claim.
 * Submission is NOT maintainer approval or DONE.
 * An interrupted release can be retried by the same session.
 */
export async function submit({api,config,tasks,repo,issue,session,prNumber=null,confirm=false,now=()=>new Date().toISOString()}) {
  assertSession(session);
  if(confirm!==true) throw new Error('Use --confirm after publishing an actual issue/PR review handoff.');
  const ledger=config.claim_store.repo, branch=config.claim_store.branch;
  const path=submissionKey(repo,issue);
  const prior=await api.getClaim(ledger,path,branch);
  if(prior && (prior.data.target_repository!==repo || prior.data.issue_number!==issue
      || prior.data.session_id!==session || prior.data.state!=='submitted'))
    throw new Error('Foreign or invalid submitted-task record; manual reconciliation required.');

  const observed=await status({api,config,repo,issue});
  if(observed.status==='submitted') {
    if(!prior || prior.data.session_id!==session)
      throw new Error('Submission belongs to another session.');
    return {result:'already-submitted',task:repo+'#'+issue};
  }
  if(observed.status!=='claimed' || observed.claim.session_id!==session)
    throw new Error('Only the current task owner may submit.');
  const claim=observed.claim;
  if(!claim.last_handoff?.summary?.trim())
    throw new Error('Save a factual handoff before submitting work for review.');
  let scopedAudit=null;
  if(claim.access==='write') {
    if(!Number.isSafeInteger(prNumber)||prNumber<1||!Array.isArray(tasks))
      throw new Error('Write submission requires a curated task catalog and --pr PR_NUMBER.');
    scopedAudit=await auditTaskPullRequest({api,tasks,repo,issue,prNumber});
    if(scopedAudit.verdict!=='scope-clean')
      throw new Error('Write submission blocked by scope audit: '+
        scopedAudit.reasons.map(x=>x.code).join(','));
    if(claim.last_handoff.head_sha!==scopedAudit.pull_request_head)
      throw new Error('Handoff head SHA is missing or differs from audited PR head; revalidate work.');
    if(prior && (prior.data.pull_request!==prNumber ||
       prior.data.audited_head_sha!==scopedAudit.pull_request_head))
      throw new Error('Existing submission marker refers to different PR evidence.');
  }
  const marker={
    schema_version:1,state:'submitted',target_repository:repo,issue_number:issue,
    session_id:session,role:claim.role,access:claim.access,resource_scope_id:claim.resource_scope_id,
    submitted_at:now(),last_handoff:claim.last_handoff,
    ...(scopedAudit?{pull_request:prNumber,audited_head_sha:scopedAudit.pull_request_head,
      audited_base_sha:scopedAudit.upstream_head,scope_verdict:scopedAudit.verdict}:{}),
    note:'Awaiting independent review; not automatically approved or DONE'
  };
  if(!prior) {
    try {await api.createClaim(ledger,path,branch,marker);}
    catch(error) {
      if(!(error instanceof GitHubError) || ![409,422].includes(error.status))
        throw new Error('Submission outcome unknown; inspect ledger before retrying.',{cause:error});
      const concurrent=await api.getClaim(ledger,path,branch);
      if(concurrent?.data?.session_id!==session || concurrent.data.state!=='submitted')
        throw new Error('Submission conflict; manual review required.');
    }
  }
  await release({api,config,repo,issue,session,confirm:true});
  return {result:'submitted',task:repo+'#'+issue,review_required:true};
}
