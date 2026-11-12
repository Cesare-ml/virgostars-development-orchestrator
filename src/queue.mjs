import { assertSession, claim, status } from './claims.mjs';
import { validateTaskCatalog } from './resources.mjs';

const ROLES = new Set(['planner','developer','tester','reviewer','auditor','integrator']);

/**
 * Select at most one curated task per chat session.
 * All errors except an explicitly closed issue or a contended claim fail closed.
 */
export async function claimNext({ api, config, tasks, session, role, repository = null }) {
  assertSession(session);
  validateTaskCatalog(tasks);
  if (!ROLES.has(role)) throw new Error('Choose an explicit valid role for claim-next.');
  if (repository !== null && !config.active_repositories.some(r => r.full_name === repository && r.pilot_enabled))
    throw new Error('Repository filter is not enabled in private pilot.');

  const inFleet = tasks.filter(t => config.active_repositories.some(
    r => r.full_name === t.repository && r.pilot_enabled));

  // Resume a previously acquired task before considering new claims; even
  // tasks removed from READY remain owned until explicitly released.
  for (const task of inFleet) {
    const current = await status({ api, config, repo: task.repository, issue: task.issue });
    if (current.status === 'inconsistent')
      throw new Error('Inconsistent active task claim; manual recovery required.');
    if (current.status === 'claimed' && current.claim.session_id === session) {
      if (current.claim.access !== task.access ||
        (task.access === 'write' && current.claim.resource_scope_id !== task.resource_scope.id))
        throw new Error('Curated task resource scope changed; manual reconciliation required.');
      return { result: 'already-owned', claim: current.claim };
    }
  }

  let contended = 0;
  let closed = 0;
  const candidates = inFleet.filter(t => t.status === 'ready'
    && t.role === role && (repository === null || t.repository === repository));

  for (const task of candidates) {
    const issue = await api.getIssue(task.repository, task.issue);
    if (!issue || issue.pull_request) throw new Error('Invalid curated target issue.');
    if (issue.state !== 'open') { closed++; continue; }
    const attempt = await claim({ api, config, tasks, repo: task.repository,
      issue: task.issue, session, role });
    if (attempt.result === 'acquired' || attempt.result === 'already-owned')
      return attempt;
    if (attempt.result === 'busy') { contended++; continue; }
    throw new Error('Unrecognized claim result; stopping for safety.');
  }
  return { result: 'no-task', role, repository, eligible: candidates.length,
    contended, closed };
}
