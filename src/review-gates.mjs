import {verifySubmissionFreshness} from './submission-freshness.mjs';
import {auditOpenPullRequestCollisions} from './pr-collisions.mjs';

const sha=/^[0-9a-f]{40}$/i;

/**
 * Maintainer-facing readiness evidence, never a merge decision.
 * Live GitHub PR scans are read-only and may race with a later commit.
 * Incomplete/denied GitHub responses propagate errors (fail closed).
 */
export async function assessSubmittedDeveloper({api,task,marker}) {
  if(!task || task.access!=='write' || task.role!=='developer')
    throw new Error('Developer review gates require a curated write task.');
  if(!marker || marker.state!=='submitted' ||
     marker.target_repository!==task.repository || marker.issue_number!==task.issue)
    throw new Error('Developer review gates require a matching submitted marker.');

  const freshness=await verifySubmissionFreshness({api,task,marker});
  const blockers=[];
  if(freshness.state==='stale-submission') blockers.push('STALE_DELIVERY_OR_UPSTREAM');
  if(freshness.state==='needs-scope-audit') blockers.push('INDEPENDENT_SCOPE_AUDIT_REQUIRED');
  if(!Number.isSafeInteger(marker.pull_request) || marker.pull_request<1)
    blockers.push('DELIVERY_PR_NOT_RECORDED');

  let collisions=null;
  let notice=null;
  if(Number.isSafeInteger(marker.pull_request) && marker.pull_request>0) {
    // Even when a marker says manual-reviewed or its upstream has moved,
    // inspect all CURRENT open PRs to detect duplicate agents.
    const report=await auditOpenPullRequestCollisions({
      api,tasks:[task],repo:task.repository,issue:task.issue
    });
    const candidates=report.candidates.map(x=>({
      number:x.number,head_sha:x.head_sha,base_ref:x.base_ref,
      changed_paths:x.paths.map(p=>p.path)
    }));
    const selected=candidates.find(p=>p.number===marker.pull_request);
    const unique=report.status==='single-candidate' && Boolean(selected);
    collisions={
      status:report.status,scanned_open_prs:report.scanned_open_prs,
      delivery_pr:marker.pull_request,delivery_is_unique_candidate:unique,
      candidates
    };
    if(report.status==='conflict') {
      blockers.push('OVERLAPPING_OPEN_PULL_REQUESTS');
      notice='Competing open pull requests touch the approved resource: '+
        candidates.map(p=>'#'+p.number).join(', ');
    } else if(!unique) {
      blockers.push('DELIVERY_PR_NOT_UNIQUE_OPEN_CANDIDATE');
      notice='The recorded delivery PR is not the sole open PR touching the approved resource.';
    }
    if(selected && sha.test(marker.audited_head_sha||'') &&
       selected.head_sha!==marker.audited_head_sha) {
      if(!blockers.includes('STALE_DELIVERY_OR_UPSTREAM'))
        blockers.push('STALE_DELIVERY_OR_UPSTREAM');
    }
  } else {
    // A marker without a PR cannot prove that its scope has no competition.
    blockers.push('LIVE_COLLISION_SCAN_NOT_POSSIBLE');
  }

  // Never infer native/visual test evidence from a handoff note or a self-written
  // submission marker. Actual results and independent approval remain separate.
  blockers.push('INDEPENDENT_NATIVE_TESTS_NOT_VERIFIED');
  blockers.push('INDEPENDENT_CODE_REVIEW_PENDING');
  return {
    status:freshness.state,
    pr_check:freshness.pr_check,
    collisions,
    review_gates:{
      integration_ready:false,
      merge_authorized:false,
      review:'pending',
      native_tests:'unverified',
      recorded_scope_verdict:marker.scope_verdict||null,
      blockers:[...new Set(blockers)]
    },
    warning:[freshness.reason,notice].filter(Boolean).join('; ')||null
  };
}
