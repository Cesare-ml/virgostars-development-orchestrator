import {assertSession, status, release, submissionKey} from './claims.mjs';
import {GitHubError} from './github.mjs';
import {isDeepStrictEqual} from 'node:util';
import {auditTaskPullRequest} from './pr-audit.mjs';
import {auditOpenPullRequestCollisions} from './pr-collisions.mjs';
import {recoverSubmittedResourceRelease} from './submission-release-recovery.mjs';

/* Evidence may be retried with a fresh submitted_at timestamp, but all other
 * immutable fields must agree before accepting a pre-existing marker. Otherwise
 * a same-session 409/422 create race could release a claim for different work.
 */
const SUBMISSION_EVIDENCE_FIELDS = [
  'schema_version','state','target_repository','issue_number','session_id',
  'role','access','resource_scope_id','last_handoff','pull_request',
  'audited_head_sha','audited_base_sha','scope_verdict','collision_audit'
];
function sameSubmissionEvidence(stored,expected) {
  return stored && typeof stored==='object' && !Array.isArray(stored) &&
    SUBMISSION_EVIDENCE_FIELDS.every(key=>isDeepStrictEqual(stored[key],expected[key]));
}

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
    // GitHub cannot atomically delete the task claim and its write-resource
    // lock. The same owner may retry only after strict submission, PR evidence,
    // resource scope and missing-issue-claim checks; never reclaim a foreign
    // or unsubmitted lock.
    const recovered=await recoverSubmittedResourceRelease({
      api,config,tasks,repo,issue,session,prior,prNumber
    });
    return {result:'already-submitted',task:repo+'#'+issue,
      ...(recovered?{recovered_resource_lock:true}:{})};
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
    const collisions=await auditOpenPullRequestCollisions({api,tasks,repo,issue});
    if(collisions.status!=='single-candidate' ||
       collisions.candidates[0]?.number!==prNumber)
      throw new Error('Write submission blocked by competing/open PRs on the same resource: '+
        collisions.candidates.map(p=>'#'+p.number).join(',')+
        '. Review the overlapping branches before submitting.');
    // Scope and collision scans are independent GitHub requests, not one
    // transactional snapshot. A changed PR HEAD/base must block release.
    const delivery=collisions.candidates[0];
    if(delivery.head_sha!==scopedAudit.pull_request_head ||
       delivery.base_sha!==scopedAudit.upstream_head ||
       delivery.base_ref!==scopedAudit.base_branch)
      throw new Error('Delivery PR changed between scope and collision audits; re-audit before submitting.');
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
      audited_base_sha:scopedAudit.upstream_head,scope_verdict:scopedAudit.verdict,
      collision_audit:'single-candidate'}:{}),
    note:'Awaiting independent review; not automatically approved or DONE'
  };
  if(prior && !sameSubmissionEvidence(prior.data,marker))
    throw new Error('Existing submission evidence differs from current handoff; manual reconciliation required.');
  if(!prior) {
    try {await api.createClaim(ledger,path,branch,marker);}
    catch(error) {
      if(!(error instanceof GitHubError) || ![409,422].includes(error.status))
        throw new Error('Submission outcome unknown; inspect ledger before retrying.',{cause:error});
      const concurrent=await api.getClaim(ledger,path,branch);
      if(!sameSubmissionEvidence(concurrent?.data,marker))
        throw new Error('Submission evidence conflict; manual reconciliation required.');
    }
  }
  await release({api,config,repo,issue,session,confirm:true});
  return {result:'submitted',task:repo+'#'+issue,review_required:true};
}
