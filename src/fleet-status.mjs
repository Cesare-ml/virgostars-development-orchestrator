import {taskKey,submissionKey} from './claims.mjs';
import {resourceKey,resourceMatches,validateTaskCatalog} from './resources.mjs';

function matches(item,task) {
  const d=item?.data;
  return d && d.target_repository===task.repository && d.issue_number===task.issue &&
    d.access===task.access && d.role===task.role && typeof d.session_id==='string';
}
function handoffOf(data) {
  // First GitHub-connected chats wrote last_handoff; local CLI writes handoff.
  // Read BOTH until a separate, owner-approved migration is performed.
  return data?.handoff ?? data?.last_handoff ?? null;
}
function commentLink(summary,task) {
  if(typeof summary!=='string') return null;
  const prefix='https://github.com/'+task.repository+'/issues/'+task.issue+'#issuecomment-';
  const match=summary.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*#issuecomment-\d+/g)||[];
  return match.find(url=>url.startsWith(prefix))||null;
}

/**
 * Read-only fleet view; one immutable Git tree for all claim files.
 * "submitted" is pending HUMAN review, never automatic acceptance.
 */
export async function auditFleet({api,config,tasks}) {
  validateTaskCatalog(tasks);
  const snapshot=await api.getLedgerSnapshot(config.claim_store.repo,config.claim_store.branch);
  if(!/^[0-9a-f]{40}$/i.test(snapshot?.head||'') || !Array.isArray(snapshot?.entries))
    throw new Error('Malformed ledger snapshot.');
  const files=new Map();
  for(const entry of snapshot.entries) {
    if(!entry || typeof entry.path!=='string' || files.has(entry.path))
      throw new Error('Duplicate or malformed ledger entry.');
    files.set(entry.path,entry);
  }
  const output=[],used=new Set(),alerts=[];
  const tracked=tasks.filter(t=>config.active_repositories.some(
    r=>r.full_name===t.repository&&r.pilot_enabled));
  for(const task of tracked) {
    const issue=await api.getIssue(task.repository,task.issue);
    if(!issue || issue.pull_request || !['open','closed'].includes(issue.state))
      throw new Error('Invalid target GitHub issue: '+task.repository+'#'+task.issue);
    const tpath=taskKey(task.repository,task.issue);
    const spath=submissionKey(task.repository,task.issue);
    const claimed=files.get(tpath),submitted=files.get(spath);
    if(claimed)used.add(tpath);
    if(submitted)used.add(spath);
    const resourcePath=task.access==='write'?resourceKey(task.repository,task.resource_scope.id):null;
    const resource=resourcePath?files.get(resourcePath):null;
    let state='available',warning=null,owner=null,evidence_url=null;
    if(submitted) {
      const d=submitted.data;
      const handoff=handoffOf(d);
      if(!matches(submitted,task) || d.state!=='submitted' ||
        !handoff || typeof handoff.summary!=='string' || !handoff.summary.trim()) {
        state='inconsistent';warning='Malformed submitted marker or missing handoff';
      } else {
        state='submitted';
        owner=d.session_id;
        evidence_url=commentLink(handoff.summary,task);
        if(!evidence_url) warning='Handoff has no matching GitHub issue-comment link';
        if(task.access==='write' && (d.scope_verdict!=='scope-clean' ||
            !Number.isSafeInteger(d.pull_request) ||
            !/^[0-9a-f]{40}$/i.test(d.audited_head_sha||''))) {
          state='needs-scope-audit';
          warning='Write submission has no verified CLI scope audit; independently review its PR.';
        }
      }
    }
    if(claimed) {
      const d=claimed.data;
      if(!matches(claimed,task) || d.state!=='claimed' && d.state!=='in_progress' ||
        (task.access==='write' && (!resourceMatches(resource,d) ||
          d.resource_scope_id!==task.resource_scope.id ||
          JSON.stringify(d.resource_roots)!==JSON.stringify([...task.resource_scope.roots].sort())))) {
        state='inconsistent';warning='Claim owner, role, scope or resource lock mismatches catalog';
      } else if(submitted && state!=='inconsistent') {
        if(submitted.data.session_id!==d.session_id) {
          state='inconsistent';warning='Different owners for submission and active claim';
        } else {
          state='submitted-pending-release';
          warning='Owner must finish releasing claim after submission';
          owner=d.session_id;
        }
      } else if(!submitted) {
        state='claimed';owner=d.session_id;
      }
    }
    if(!claimed && !submitted && resource) {
      state='resource-busy';
      owner=resource.data?.session_id??null;
    }
    if(issue.state==='closed' && state==='available')state='closed';
    if(issue.state==='closed' && state==='claimed')
      warning='Issue closed while claim remains active';
    if(warning)alerts.push({task:task.repository+'#'+task.issue,reason:warning});
    output.push({
      repository:task.repository,issue:task.issue,title:task.title,
      mode:task.access,role:task.role,issue_state:issue.state,status:state,
      session_id:owner,evidence_url,review:submitted?'pending':null,warning
    });
  }
  const claimedIds=new Set(snapshot.entries.filter(e=>e.path.startsWith('claims/'))
    .map(e=>e.data?.target_repository+'#'+e.data?.issue_number+'#'+e.data?.session_id));
  for(const entry of snapshot.entries) {
    if(!entry.path.startsWith('resources/'))continue;
    const id=entry.data?.target_repository+'#'+entry.data?.issue_number+'#'+entry.data?.session_id;
    if(!claimedIds.has(id)) alerts.push({task:entry.path,reason:'Orphan or unpaired resource lock'});
    used.add(entry.path);
  }
  const untracked=snapshot.entries
    .filter(e=>/^(claims|submissions)\//.test(e.path)&&!used.has(e.path))
    .map(e=>e.path);
  if(untracked.length)
    alerts.push({task:'pilot-ledger',reason:untracked.length+' claim/submission entries outside curated task list'});
  const counts={total:output.length};
  for(const item of output)counts[item.status]=(counts[item.status]||0)+1;
  return {
    mode:'private-pilot-read-only',ledger_commit:snapshot.head,
    summary:counts,
    tasks:output,alerts,untracked,
    note:'Submitted is not approved or DONE. Evidence links are identified, not independently adjudicated.'
  };
}
