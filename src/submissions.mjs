import {assertSession, status, release, submissionKey, taskKey} from './claims.mjs';
import {GitHubError} from './github.mjs';
import {auditTaskPullRequest} from './pr-audit.mjs';
import {auditOpenPullRequestCollisions} from './pr-collisions.mjs';
import {resourceKey,resourceMatches,validateTaskCatalog} from './resources.mjs';

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
    // Contents API deletion spans two independent files. If issue deletion
    // succeeded but resource deletion failed, a same-owner retry may safely
    // release ONLY the orphaned resource backed by an intact submission.
    if(prior.data.access!=='write')
      return {result:'already-submitted',task:repo+'#'+issue};
    const scopeId=prior.data.resource_scope_id;
    const resourcePath=resourceKey(repo,scopeId);
    const held=await api.getClaim(ledger,resourcePath,branch);
    if(!held) return {result:'already-submitted',task:repo+'#'+issue};
    if(!Array.isArray(tasks))
      throw new Error('Orphan recovery needs the approved task catalog.');
    validateTaskCatalog(tasks);
    const task=tasks.find(t=>t.repository===repo&&t.issue===issue);
    const evidence=prior.data;
    if(task?.access!=='write' || task.resource_scope.id!==scopeId ||
      task.role!==evidence.role || prNumber!==evidence.pull_request ||
      !Number.isSafeInteger(prNumber) || prNumber<1 ||
      evidence.scope_verdict!=='scope-clean' ||
      evidence.collision_audit!=='single-candidate' ||
      !/^[0-9a-f]{40}$/i.test(evidence.audited_head_sha||'') ||
      evidence.last_handoff?.head_sha!==evidence.audited_head_sha)
      throw new Error('Submitted write evidence or task scope changed; manual recovery required.');
    const expected={...evidence,resource_roots:[...task.resource_scope.roots].sort()};
    if(!resourceMatches(held,expected))
      throw new Error('Orphan resource belongs to a different owner or scope; manual recovery required.');
    const [active,latestSubmission,latestResource]=await Promise.all([
      api.getClaim(ledger,taskKey(repo,issue),branch),
      api.getClaim(ledger,path,branch),
      api.getClaim(ledger,resourcePath,branch)
    ]);
    if(active || latestSubmission?.sha!==prior.sha ||
      latestResource?.sha!==held.sha || !resourceMatches(latestResource,expected))
      throw new Error('Ledger changed during orphan recovery; manual reconciliation required.');
    try {await api.deleteClaim(ledger,resourcePath,branch,held.sha,held.data);}
    catch(error) {
      throw new Error('Orphan resource release failed; inspect the private ledger before retrying.',{cause:error});
    }
    return {result:'recovered-submitted-resource',task:repo+'#'+issue,review_required:true};
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
