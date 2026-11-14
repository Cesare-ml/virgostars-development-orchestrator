import {inspectIntegratorChangedFile} from './integrator-changed-file-safety.mjs';

/**
 * Conservative, read-only GitHub PR evidence snapshot.
 * The injected API must be an owner-reviewed authenticated GitHub adapter that
 * supplies COMPLETE paginated collections. No writes or merge permissions.
 */
const SHA = /^[a-f0-9]{40}$/i;
const REPO = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;
const METHOD_NAMES = [
  'getPullRequest','getPullRequestFiles','getPullRequestReviews',
  'getPullRequestCheckRuns','getPullRequestReviewThreads'
];
const hasSha = value => typeof value === 'string' && SHA.test(value);
const simple = value => typeof value === 'string' && value.length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);

function fail(message) { throw new Error('Integrator GitHub snapshot blocked: ' + message); }
function prIdentity(pr) {
  if (!pr || !Number.isSafeInteger(pr.number) || !hasSha(pr.head?.sha) ||
      !hasSha(pr.base?.sha) || !simple(pr.head?.ref) || !simple(pr.base?.ref))
    fail('missing PR commit identity');
  return [pr.number,pr.head.sha,pr.base.sha,pr.head.ref,pr.base.ref,
    pr.state,pr.draft,pr.merged,pr.mergeable,pr.changed_files].join('|');
}
function completeArray(value, max, what) {
  if (!Array.isArray(value) || value.length > max) fail('incomplete or malformed ' + what);
  return value;
}

/**
 * No owner approval, session authorization or merge decision is inferred here.
 * A clean report is ONLY a candidate for additional independent checks.
 */
export async function collectIntegratorLivePrEvidence({api,repository,prNumber,requiredCheckNames}={}) {
  if(!REPO.test(repository||'') || !Number.isSafeInteger(prNumber) || prNumber<1)
    fail('invalid repository or PR number');
  if(!api || METHOD_NAMES.some(k=>typeof api[k] !== 'function'))
    fail('read-only GitHub adapter is missing required methods');
  if(!Array.isArray(requiredCheckNames) || requiredCheckNames.length<1 ||
     requiredCheckNames.length>20 || requiredCheckNames.some(x=>!simple(x)) ||
     new Set(requiredCheckNames).size!==requiredCheckNames.length)
    fail('owner required-check list is missing or malformed');

  const initial = await api.getPullRequest(repository,prNumber);
  const initialIdentity=prIdentity(initial);
  if(initial.number!==prNumber || initial.head?.repo?.full_name!==repository ||
     initial.base?.repo?.full_name!==repository)
    fail('pull request target repository differs from requested repository');

  const [rawFiles,rawReviews,rawChecks,rawThreads]=await Promise.all([
    api.getPullRequestFiles(repository,prNumber),
    api.getPullRequestReviews(repository,prNumber),
    api.getPullRequestCheckRuns(repository,initial.head.sha),
    api.getPullRequestReviewThreads(repository,prNumber)
  ]);

  const files=completeArray(rawFiles,200,'changed-file list');
  const reviews=completeArray(rawReviews,200,'review list');
  const checks=rawChecks?.check_runs;
  const threads=rawThreads?.threads;
  if(!Number.isSafeInteger(initial.changed_files) || initial.changed_files<1 ||
     initial.changed_files!==files.length) fail('file inventory count mismatch');
  if(!rawChecks || rawChecks.head_sha!==initial.head.sha ||
     !Number.isSafeInteger(rawChecks.total_count) ||
     !Array.isArray(checks) || checks.length!==rawChecks.total_count ||
     checks.length>200) fail('incomplete or stale check-run inventory');
  if(!rawThreads || rawThreads.complete!==true ||
     !Array.isArray(threads) || threads.length>200 ||
     rawThreads.total_count!==threads.length) fail('incomplete review-thread inventory');

  const latest=await api.getPullRequest(repository,prNumber);
  if(prIdentity(latest)!==initialIdentity ||
     latest.head?.repo?.full_name!==repository ||
     latest.base?.repo?.full_name!==repository)
    fail('PR changed while GitHub evidence was being collected');

  const reasons=[];
  const block=x=>{if(!reasons.includes(x)) reasons.push(x);};
  if(latest.state!=='open' || latest.draft!==false || latest.merged!==false ||
     latest.mergeable!==true) block('PR_NOT_MERGEABLE_OR_READY');

  const filenames=new Set();
  for(const file of files) {
    const path=file?.filename;
    const finding=inspectIntegratorChangedFile(file);
    if(!simple(path) || !finding.valid || filenames.has(String(path||'').toLowerCase()))
      block('UNSAFE_OR_DUPLICATE_CHANGED_FILE');
    else filenames.add(path.toLowerCase());
    if(finding.sensitive)block('HIGH_RISK_FILE_REQUIRES_OWNER');
  }

  const seenCheckNames=new Set();
  for(const check of checks) {
    if(!simple(check?.name) || !hasSha(check?.head_sha) ||
       check.head_sha!==initial.head.sha || seenCheckNames.has(check.name))
      block('INVALID_OR_DUPLICATE_CHECK_RUN');
    if(typeof check?.name==='string')seenCheckNames.add(check.name);
  }
  for(const name of requiredCheckNames) {
    const found=checks.filter(c=>c?.name===name);
    if(found.length!==1 || found[0].status!=='completed' ||
       found[0].conclusion!=='success' || found[0].head_sha!==initial.head.sha)
      block('REQUIRED_CHECK_NOT_SUCCESSFUL_ON_HEAD');
  }

  const decisionByReviewer=new Map();
  for(const review of reviews) {
    if(!simple(review?.user?.login) || !simple(review?.state) ||
       !Number.isSafeInteger(review?.id) ||
       (review.commit_id!==null && !hasSha(review.commit_id)) ||
       (review.submitted_at!==null && (typeof review.submitted_at!=='string' ||
         !Number.isFinite(Date.parse(review.submitted_at))))) {
      block('INCOMPLETE_REVIEW_EVIDENCE');
      continue;
    }
    if(!['APPROVED','CHANGES_REQUESTED','DISMISSED','COMMENTED'].includes(review.state)) continue;
    const identity=review.user.login.toLowerCase();
    const prev=decisionByReviewer.get(identity);
    const timestamp=review.submitted_at ? Date.parse(review.submitted_at) : -Infinity;
    if(!prev || timestamp>prev.timestamp || (timestamp===prev.timestamp && review.id>prev.id))
      decisionByReviewer.set(identity,{state:review.state,commit_id:review.commit_id,
        id:review.id,timestamp});
  }
  const author=typeof latest.user?.login==='string' ? latest.user.login.toLowerCase() : null;
  if(!author)block('PR_AUTHOR_UNKNOWN');
  let independentApprovals=0;
  for(const [login,decision] of decisionByReviewer) {
    if(decision.state==='CHANGES_REQUESTED')block('CHANGES_REQUESTED_OUTSTANDING');
    if(decision.state==='APPROVED' && login!==author && decision.commit_id===initial.head.sha)
      independentApprovals++;
  }
  if(independentApprovals===0)block('CURRENT_HEAD_REVIEW_APPROVAL_MISSING');
  for(const thread of threads) {
    if(typeof thread?.isResolved!=='boolean')block('INCOMPLETE_REVIEW_THREAD');
    else if(!thread.isResolved)block('UNRESOLVED_REVIEW_THREAD');
  }

  return {
    verdict:reasons.length ? 'blocked' : 'candidate',
    repository,pr_number:prNumber,head_sha:initial.head.sha,base_sha:initial.base.sha,
    changed_file_count:files.length,required_checks:requiredCheckNames.length,
    successful_current_head_reviews:independentApprovals,
    unresolved_review_threads:threads.filter(t=>t?.isResolved===false).length,
    reasons,
    merge_authorized:false,merge_executed:false,
    approval_or_session_verified:false,
    branch_protection_verified:false,
    cross_pr_collisions_verified:false,
    dependencies_verified:false,
    note:'Read-only GitHub data review. Caller must independently verify API adapter provenance, owner approval, author/chat independence, branch rules, collisions and dependencies.'
  };
}
