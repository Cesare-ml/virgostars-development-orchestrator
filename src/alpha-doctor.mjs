import {assertPrivateLedgerActivation} from './private-ledger-activation.mjs';
import {assertPrivateLedger} from './ledger-visibility.mjs';
import {auditOpenPullRequestCollisions} from './pr-collisions.mjs';
import {taskKey,submissionKey} from './claims.mjs';
import {validateTaskCatalog} from './resources.mjs';

const SHA=/^[a-f0-9]{40}$/i;
const PATH=/^(claims|resources|submissions)\/[A-Za-z0-9][A-Za-z0-9_.-]*__[A-Za-z0-9][A-Za-z0-9_.-]*\/[a-z][a-z0-9_-]*\.json$/;
const MAX_ENTRIES=250;

function invalid(reason) {
  throw new Error('Alpha launch readiness blocked: '+reason);
}

function assertActiveTaskFleet(config,tasks) {
  if(!Array.isArray(config?.active_repositories) ||
     config.active_repositories.length<1 ||
     config.active_repositories.length>40)
    invalid('approved first-alpha repository fleet is missing or malformed.');
  const seen=new Set(),enabled=new Set();
  for(const entry of config.active_repositories) {
    if(!entry||typeof entry.full_name!=='string'||
       !/^[a-z\d][a-z\d_.-]*\/[a-z\d][a-z\d_.-]*$/i.test(entry.full_name)||
       typeof entry.pilot_enabled!=='boolean')
      invalid('approved first-alpha repository fleet is malformed.');
    const key=entry.full_name.toLowerCase();
    if(seen.has(key))
      invalid('approved first-alpha repository fleet has duplicate entries.');
    seen.add(key);
    if(entry.pilot_enabled===true)enabled.add(key);
  }
  if(tasks.some(task=>!enabled.has(task.repository.toLowerCase())))
    invalid('curated task targets a repository not enabled in the approved pilot.');
}

function validHead(ref) {
  if(ref?.object?.type!=='commit'||!SHA.test(ref?.object?.sha||''))
    invalid('private ledger branch reference is missing or malformed.');
  return ref.object.sha;
}

/**
 * Pure structural check of one pinned PRIVATE Git snapshot. No task names,
 * branch refs, repository identities or session IDs are returned.
 */
export function inspectAlphaLedgerSnapshot(snapshot,tasks) {
  validateTaskCatalog(tasks);
  if(!snapshot||!SHA.test(snapshot.head||'')||
     !Array.isArray(snapshot.entries)||snapshot.entries.length>MAX_ENTRIES)
    invalid('private coordination snapshot missing, incomplete or oversized.');

  const seen=new Set();
  const submissionPaths=new Set();
  let activeClaims=0,activeResources=0,recordedSubmissions=0;
  for(const entry of snapshot.entries) {
    if(!entry||typeof entry.path!=='string'||!PATH.test(entry.path)||
       !SHA.test(entry.sha||'')||
       !entry.data||typeof entry.data!=='object'||Array.isArray(entry.data))
      invalid('private coordination contains unexpected record metadata.');
    const folded=entry.path.toLowerCase();
    if(seen.has(folded))
      invalid('duplicate or case-conflicting private coordination record.');
    seen.add(folded);
    if(entry.path.startsWith('claims/'))activeClaims++;
    if(entry.path.startsWith('resources/'))activeResources++;
    if(entry.path.startsWith('submissions/')) {
      if(entry.data.state!=='submitted')
        invalid('unrecognized private submission record state.');
      recordedSubmissions++;
      submissionPaths.add(folded);
    }
  }
  let pending=0,alreadySubmitted=0;
  for(const task of tasks) {
    if(submissionPaths.has(submissionKey(task.repository,task.issue).toLowerCase()))
      alreadySubmitted++;
    else pending++;
  }
  return {
    active_claims:activeClaims,
    active_resource_locks:activeResources,
    recorded_submissions:recordedSubmissions,
    new_tasks_already_submitted:alreadySubmitted,
    pending_new_tasks:pending
  };
}

/**
 * Read-only pre-launch gate for an owner-approved, independent PRIVATE ledger.
 * Reuses the historical 7-submission preservation guard. Does NOT acquire a
 * lease or guarantee another agent will not race a subsequent claim.
 */
export async function inspectAlphaLaunch({api,config,tasks}) {
  if(!api||!['getLedgerSnapshot','getIssue','getPullRequest',
    'getOpenPullRequests','getPullRequestFiles','getBranchRef','getRepository']
    .every(k=>typeof api[k]==='function'))
    invalid('required read-only GitHub methods are unavailable.');
  validateTaskCatalog(tasks);
  // Reject the historical committed queue. A new owner-reviewed local catalog
  // must be selected by the CLI BEFORE this function is invoked.
  if(tasks.length<2||tasks.length>40)
    invalid('two or more independently curated tasks are required.');
  if(tasks.some(task=>task.status!=='ready'))
    invalid('all curated first-alpha tasks must be ready.');
  assertActiveTaskFleet(config,tasks);

  const preservation=await assertPrivateLedgerActivation({api,config});
  if(preservation.status!=='readiness_verified'||
     preservation.historical_submissions_preserved!==7)
    invalid('historical submissions are not safely preserved.');

  const repo=config.claim_store.repo,branch=config.claim_store.branch;
  const snapshot=await api.getLedgerSnapshot(repo,branch);
  const ledger=inspectAlphaLedgerSnapshot(snapshot,tasks);
  const blockers=new Set();
  if(ledger.active_claims||ledger.active_resource_locks)
    blockers.add('ACTIVE_LOCKS_REQUIRE_RECONCILIATION');
  if(ledger.new_tasks_already_submitted)
    blockers.add('NEW_TASK_ALREADY_SUBMITTED');

  let openIssues=0,writeTasks=0,writeTasksEligible=0,occupiedWriteScopes=0;
  const independentWriterPartitions=new Set();
  const independentDeveloperPartitions=new Set();
  let eligibleDeveloperTasks=0;
  for(const task of tasks) {
    const issue=await api.getIssue(task.repository,task.issue);
    if(!issue||issue.pull_request||
       issue.number!==task.issue||!['open','closed'].includes(issue.state))
      invalid('unexpected GitHub target issue response.');
    if(issue.state!=='open'){
      blockers.add('TARGET_ISSUE_CLOSED');
      continue;
    }
    openIssues++;
    if(task.access!=='write')continue;
    writeTasks++;
    const upstream=await api.getPullRequest(task.repository,task.upstream_pr);
    if(upstream?.number!==task.upstream_pr||
       upstream.state!=='open'||upstream.head?.ref!==task.upstream_branch||
       !SHA.test(upstream.head?.sha||'')) {
      blockers.add('WRITE_UPSTREAM_PR_MISSING_OR_CHANGED');
      continue;
    }

    const scan=await auditOpenPullRequestCollisions({
      api,tasks,repo:task.repository,issue:task.issue
    });
    if(scan.candidates.length>0) {
      occupiedWriteScopes++;
      blockers.add('OPEN_PR_OVERLAPS_WRITE_SCOPE');
      continue;
    }
    // The upstream head may have moved while the collision scan ran.
    const after=await api.getPullRequest(task.repository,task.upstream_pr);
    if(after?.state!=='open'||after.head?.sha!==upstream.head.sha||
       after.head?.ref!==task.upstream_branch) {
      blockers.add('WRITE_UPSTREAM_PR_MOVED_DURING_SCAN');
      continue;
    }
    writeTasksEligible++;
    const partition=task.repository.toLowerCase()+'#'+
      task.resource_scope.id.toLowerCase();
    independentWriterPartitions.add(partition);
    if(task.role==='developer') {
      eligibleDeveloperTasks++;
      independentDeveloperPartitions.add(partition);
    }
  }

  // An alpha should not claim "ready" with one developer or any competing
  // draft. Read-only reviewer tasks can supplement, not replace, two writers.
  if(independentWriterPartitions.size<2)
    blockers.add('TWO_DISJOINT_WRITE_TASKS_REQUIRED');
  if(independentDeveloperPartitions.size<2)
    blockers.add('TWO_ELIGIBLE_DEVELOPER_TASKS_REQUIRED');
  if(openIssues<2)blockers.add('TWO_OPEN_ISSUES_REQUIRED');
  if(ledger.pending_new_tasks<2)
    blockers.add('TWO_UNSUBMITTED_TASKS_REQUIRED');

  const branchEnd=await api.getBranchRef(repo,branch);
  if(validHead(branchEnd)!==snapshot.head)
    invalid('private coordination head changed during pre-launch checks.');
  await assertPrivateLedger({api,config});

  return {
    schema_version:'1-owner-alpha-doctor',
    mode:'read-only',
    private_ledger_verified:true,
    historical_submissions_preserved:7,
    configured_tasks:tasks.length,
    new_write_tasks:writeTasks,
    open_issues:openIssues,
    write_tasks_without_pr_overlap:writeTasksEligible,
    independent_writer_partitions:independentWriterPartitions.size,
    eligible_developer_tasks:eligibleDeveloperTasks,
    independent_developer_partitions:independentDeveloperPartitions.size,
    overlapping_write_scopes:occupiedWriteScopes,
    ...ledger,
    blockers:[...blockers].sort(),
    ready_for_manual_pilot:blockers.size===0,
    work_claimed:false,
    merge_authorized:false,
    warning:'A read-only snapshot is not an atomic assignment; every agent must acquire and reverify its own exclusive lock.'
  };
}
