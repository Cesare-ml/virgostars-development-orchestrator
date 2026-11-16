import { isStructurallyValidActiveClaim } from './claim-record-integrity.mjs';

/**
 * Same-session resumption is NOT a new authorization. A claim with a
 * recognizable session id but a modified role, identity, state or write scope
 * must not be resumed. No GitHub calls or mutations occur here.
 */
function blocked() {
  throw new Error(
    'Curated task resource scope changed or ownership inconsistent; manual reconciliation required.'
  );
}

export function assertResumableOwnerClaim({claim,task,session}) {
  if(!isStructurallyValidActiveClaim(claim,task?.repository,task?.issue)) blocked();
  if(!claim || !task || typeof session!=='string' ||
     claim.schema_version!==2 ||
     claim.session_id!==session ||
     claim.target_repository!==task.repository ||
     claim.issue_number!==task.issue ||
     claim.role!==task.role ||
     claim.access!==task.access ||
     !['claimed','in_progress'].includes(claim.state) ||
     typeof claim.claimed_at!=='string'||!claim.claimed_at ||
     !(claim.branch===null||
       (typeof claim.branch==='string'&&claim.branch.length>0)))blocked();

  if(claim.state==='claimed') {
    if(claim.last_handoff!==null)blocked();
  } else if(!claim.last_handoff ||
            typeof claim.last_handoff.summary!=='string' ||
            !claim.last_handoff.summary.trim() ||
            typeof claim.last_handoff.at!=='string' ||
            !claim.last_handoff.at)blocked();

  if(task.access==='write') {
    if(!task.resource_scope ||
       claim.resource_scope_id!==task.resource_scope.id ||
       !Array.isArray(claim.resource_roots) ||
       JSON.stringify(claim.resource_roots)!==
         JSON.stringify([...task.resource_scope.roots].sort()))
      blocked();
  } else if(task.access==='read') {
    if(claim.resource_scope_id!==null || claim.resource_roots!==null)
      blocked();
  } else blocked();
  return claim;
}
