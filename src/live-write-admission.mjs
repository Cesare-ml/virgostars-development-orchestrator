import {validateTaskCatalog} from './resources.mjs';
import {auditOpenPullRequestCollisions} from './pr-collisions.mjs';

const SHA=/^[a-f0-9]{40}$/i;
function blocked() {
  // Never expose task scopes, target repository names, private catalog
  // content or GitHub request bodies in CLI error output.
  throw new Error('Live write-task admission blocked: recheck owner-approved issue, upstream PR and competing work.');
}

function currentUpstream(pr,task) {
  return pr?.number===task.upstream_pr &&
    pr.state==='open' &&
    pr.head?.ref===task.upstream_branch &&
    SHA.test(pr.head?.sha||'') &&
    SHA.test(pr.base?.sha||'') &&
    typeof pr.base?.ref==='string' &&
    pr.base.ref.length>0;
}

/**
 * For NEW write claims, inspect live upstream PR, complete open-PR file
 * inventory, and target issue immediately before the exclusive resource
 * reservation. Repeats the upstream PR after the collision audit to reject
 * concurrent ref/base changes.
 *
 * This is not transactional with GitHub Contents lock creation. Call it on
 * each *new* assignment and still require the resource-first exclusive
 * claim protocol. No API mutation happens in this routine.
 */
export async function assertLiveWriteTaskAdmission({api,tasks,task}) {
  try {
    validateTaskCatalog(tasks);
    if(!task || task.access!=='write' ||
       !tasks.some(t=>t===task) ||
       !Number.isSafeInteger(task.upstream_pr) || task.upstream_pr<1 ||
       typeof task.upstream_branch!=='string'||!task.upstream_branch ||
       !api || !['getIssue','getPullRequest','getOpenPullRequests',
         'getPullRequestFiles'].every(k=>typeof api[k]==='function'))
      blocked();

    const upstream=await api.getPullRequest(task.repository,task.upstream_pr);
    if(!currentUpstream(upstream,task))blocked();

    const collisions=await auditOpenPullRequestCollisions({
      api,tasks,repo:task.repository,issue:task.issue
    });
    if(collisions.status!=='no-open-candidates' ||
       collisions.candidates.length!==0)blocked();

    const [again,issue]=await Promise.all([
      api.getPullRequest(task.repository,task.upstream_pr),
      api.getIssue(task.repository,task.issue)
    ]);
    if(!currentUpstream(again,task) ||
       upstream.head.sha!==again.head.sha ||
       upstream.base.sha!==again.base.sha ||
       upstream.base.ref!==again.base.ref ||
       !issue||issue.number!==task.issue ||
       issue.state!=='open'||issue.pull_request)
      blocked();

    return {admissible:true,live_pr_audited:true,lock_acquired:false};
  } catch {
    blocked();
  }
}
