import {auditTaskPullRequest} from './pr-audit.mjs';

const SHA=/^[0-9a-f]{40}$/i;

/**
 * Live, read-only cross-check of a submitted developer PR against its persisted
 * audit snapshot. No marker mutation and no automatic PR approval.
 *
 * The immutable Git ledger is a snapshot, but GitHub PR refs are read LIVE;
 * this is an observation, not a cross-repository transaction/fencing token.
 */
export async function verifySubmissionFreshness({api,task,marker}) {
  if(task.access!=='write') throw new Error('PR freshness is only for write tasks.');
  const missing={state:'needs-scope-audit',reason:
    'Write submission has no usable PR number; independent verification required.',
    pr_check:null};
  if(!Number.isSafeInteger(marker?.pull_request)||marker.pull_request<1)
    return missing;

  // Any GitHub REST failure must stop the report, never masquerade as clean.
  const audit=await auditTaskPullRequest({
    api,tasks:[task],repo:task.repository,issue:task.issue,prNumber:marker.pull_request
  });
  const pr_check={
    number:marker.pull_request,
    recorded_head:SHA.test(marker.audited_head_sha||'')?marker.audited_head_sha:null,
    current_head:audit.pull_request_head,
    recorded_upstream:SHA.test(marker.audited_base_sha||'')?marker.audited_base_sha:null,
    current_upstream:audit.upstream_head,
    live_scope_verdict:audit.verdict,
    live_reasons:audit.reasons.map(r=>r.code),
    independently_tested:false,
    approved:false
  };

  if(audit.verdict!=='scope-clean')
    return {state:'stale-submission',
      reason:'Current PR no longer satisfies approved branch/file scope; re-review required.',
      pr_check};
  if(pr_check.recorded_head&&pr_check.recorded_head!==pr_check.current_head)
    return {state:'stale-submission',
      reason:'PR HEAD changed since the submission audit; re-review required.',
      pr_check};
  if(pr_check.recorded_upstream&&
     pr_check.recorded_upstream!==pr_check.current_upstream)
    return {state:'stale-submission',
      reason:'Upstream PR HEAD changed since the submission audit; re-review required.',
      pr_check};

  if(marker.scope_verdict!=='scope-clean' ||
    !pr_check.recorded_head || !pr_check.recorded_upstream ||
    marker?.last_handoff?.head_sha!==pr_check.recorded_head)
    return {state:'needs-scope-audit',
      reason:'Submission marker lacks matching CLI audit/head evidence; independent review required.',
      pr_check};

  return {state:'submitted',reason:null,pr_check};
}
