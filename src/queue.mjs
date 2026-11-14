import { assertSession, claim, status } from './claims.mjs';
import { validateTaskCatalog } from './resources.mjs';
import { assertResumableOwnerClaim } from './claim-resume-integrity.mjs';

const ROLES = new Set(['planner','developer','tester','reviewer','auditor','integrator']);

/**
 * Select at most one curated task per chat session.
 * All errors except an explicitly closed issue or a contended claim fail closed.
 */
export async function claimNext({ api, config, tasks, session, role, repository = null, beforeClaim = null }) {
  assertSession(session);
  validateTaskCatalog(tasks);
  if (!ROLES.has(role)) throw new Error('Choose an explicit valid role for claim-next.');
  if (repository !== null && !config.active_repositories.some(r => r.full_name === repository && r.pilot_enabled))
    throw new Error('Repository filter is not enabled in private pilot.');

  const inFleet = tasks.filter(t => config.active_repositories.some(
    r => r.full_name === t.repository && r.pilot_enabled));

  const submitted = new Set();
  const owned = [];
  // Inspect the full curated fleet before resuming or assigning anything:
  // returning the first owned claim can conceal a second active assignment
  // using the same session ID. Submitted-but-not-released claims also count.
  for (const task of inFleet) {
    const current = await status({ api, config, repo: task.repository, issue: task.issue });
    if (current.status === 'inconsistent')
      throw new Error('Inconsistent active task claim; manual recovery required.');
    if (current.status === 'submitted' || current.submitted)
      submitted.add(task.repository+'#'+task.issue);
    if (current.status === 'claimed' && current.claim.session_id === session) {
      const resumed=assertResumableOwnerClaim({claim:current.claim,task,session});
      owned.push({ claim:resumed,submitted:!!current.submitted });
    }
  }
  if (owned.length > 1)
    throw new Error('Session has multiple active task claims; manual reconciliation required.');
  if (owned.length === 1) {
    if (owned[0].submitted)
      throw new Error('Submitted task still has an active claim; original owner must finish release or request manual recovery.');
    if(owned[0].claim.role!==role)
      throw new Error('Session already owns a different role; reconcile before requesting new work.');
    return { result:'already-owned',claim:owned[0].claim };
  }

  let contended = 0;
  let closed = 0;
  let alreadySubmitted = 0;
  const candidates = inFleet.filter(t => t.status === 'ready'
    && t.role === role && (repository === null || t.repository === repository));

  for (const task of candidates) {
    if (submitted.has(task.repository+'#'+task.issue)) {
      alreadySubmitted++;
      continue;
    }
    const issue = await api.getIssue(task.repository, task.issue);
    if (!issue || issue.pull_request) throw new Error('Invalid curated target issue.');
    if (issue.state !== 'open') { closed++; continue; }
    const attempt = await claim({ api, config, tasks, repo: task.repository,
      issue: task.issue, session, role, beforeClaim });
    if (attempt.result === 'acquired' || attempt.result === 'already-owned')
      return attempt;
    if (attempt.result === 'busy') { contended++; continue; }
    if (attempt.result === 'submitted') { alreadySubmitted++; continue; }
    throw new Error('Unrecognized claim result; stopping for safety.');
  }
  return { result: 'no-task', role, repository, eligible: candidates.length,
    contended, closed, submitted: alreadySubmitted };
}
