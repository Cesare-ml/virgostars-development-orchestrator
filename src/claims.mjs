import { randomUUID } from 'node:crypto';
import { GitHubError } from './github.mjs';
import { resourceKey, resourceMatches, validateTaskCatalog } from './resources.mjs';

const VALID_REPO = /^[a-z\d][a-z\d_.-]*\/[a-z\d][a-z\d_.-]*$/i;
const VALID_SESSION = /^(chat|codex)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function newSession(kind='chat') {
  if (!['chat','codex'].includes(kind)) throw new Error('Expected chat or codex.');
  return kind + '-' + randomUUID();
}
export function taskKey(repo,issue) {
  if (!VALID_REPO.test(repo)) throw new Error('Invalid repository.');
  if (!Number.isSafeInteger(issue) || issue < 1) throw new Error('Invalid issue number.');
  const [owner,name]=repo.split('/');
  return 'claims/' + owner + '__' + name + '/issue-' + issue + '.json';
}
export function submissionKey(repo,issue) {
  return taskKey(repo,issue).replace(/^claims\//,'submissions/');
}
export function assertSession(s) {
  if (!VALID_SESSION.test(s)) throw new Error('Create a unique session ID using the session command.');
}
function approved(config,tasks,repo,issue) {
  if (!config.active_repositories.some(r=>r.full_name===repo && r.pilot_enabled))
    throw new Error('Repository not enabled in private pilot.');
  const task=tasks.find(t=>t.repository===repo && t.issue===issue && t.status==='ready');
  if (!task) throw new Error('Task not explicitly curated as ready.');
  return task;
}
function store(config) {
  return {ledger:config.claim_store.repo, branch:config.claim_store.branch};
}
function isOwner(current,session,repo,issue) {
  return current?.data?.session_id===session && current.data.target_repository===repo && current.data.issue_number===issue;
}

/**
 * GitHub acknowledging a Contents PUT is not proof that this agent owns a
 * usable task/resource pair. Read both records back from the current PRIVATE
 * branch and demand the exact just-written receipt. A lagging or ambiguous
 * GitHub read must leave a lock for owner reconciliation, not authorize edits.
 */
async function verifyNewClaimReceipt({api,config,repo,issue,data}) {
  let observed;
  try { observed=await status({api,config,repo,issue}); }
  catch { throw new Error('New claim cannot be independently verified; stop and reconcile private locks.'); }
  const saved=observed?.claim;
  const rootsMatch=JSON.stringify(saved?.resource_roots)===
    JSON.stringify(data.resource_roots);
  if(observed?.status!=='claimed'||observed.submitted||
     !observed.blob_sha||!saved||
     saved.session_id!==data.session_id ||
     saved.target_repository!==repo || saved.issue_number!==issue ||
     saved.role!==data.role || saved.access!==data.access ||
     saved.resource_scope_id!==data.resource_scope_id || !rootsMatch ||
     saved.claimed_at!==data.claimed_at || saved.state!=='claimed' ||
     saved.branch!==data.branch || saved.last_handoff!==null)
    throw new Error('New claim readback inconsistent; do not work or automatically release locks.');
  return saved;
}
export async function status({api,config,repo,issue}) {
  const {ledger,branch}=store(config);
  const [current,submission]=await Promise.all([
    api.getClaim(ledger,taskKey(repo,issue),branch),
    api.getClaim(ledger,submissionKey(repo,issue),branch)
  ]);
  if(submission && (submission.data.target_repository!==repo || submission.data.issue_number!==issue ||
      submission.data.state!=='submitted'))
    throw new Error('Invalid submission record; manual reconciliation required.');
  if(!current) return submission
    ? {status:'submitted',submission:submission.data}
    : {status:'unclaimed'};
  const data=current.data;
  if(data.access==='write') {
    if(typeof data.resource_scope_id!=='string')
      return {status:'inconsistent',reason:'missing-resource-key'};
    const resource=await api.getClaim(ledger,resourceKey(repo,data.resource_scope_id),branch);
    if(!resourceMatches(resource,data))
      return {status:'inconsistent',reason:'missing-or-foreign-resource'};
  } else if(data.access!=='read') {
    return {status:'inconsistent',reason:'unknown-claim-access'};
  }
  return {status:'claimed',claim:data,blob_sha:current.sha,
    submitted:!!submission,submission:submission?.data??null};
}

export async function claim({api,config,tasks,repo,issue,session,role='developer',branchName=null,beforeClaim=null,now=()=>new Date().toISOString()}) {
  assertSession(session);
  validateTaskCatalog(tasks);
  const task=approved(config,tasks,repo,issue);
  if(!['developer','tester','planner','reviewer','auditor','integrator'].includes(role))
    throw new Error('Unknown role.');
  if(task.role!==role) throw new Error('Task requires role '+task.role);
  const {ledger,branch}=store(config);
  const previouslySubmitted=await api.getClaim(ledger,submissionKey(repo,issue),branch);
  if(previouslySubmitted) return {result:'submitted',task:repo+'#'+issue};
  const target=await api.getIssue(repo,issue);
  if(!target || target.state!=='open' || target.pull_request)
    throw new Error('The target issue is not an open GitHub issue.');

  const path=taskKey(repo,issue);
  const existing=await api.getClaim(ledger,path,branch);
  if(existing) {
    const observed=await status({api,config,repo,issue});
    if(observed.status==='inconsistent') throw new Error('Inconsistent active claim: manual recovery required.');
    if(isOwner(existing,session,repo,issue)) {
      if(observed.submitted) return {result:'submitted',task:repo+'#'+issue};
      if(existing.data.access!==task.access ||
        (task.access==='write' && (existing.data.resource_scope_id!==task.resource_scope.id ||
          JSON.stringify(existing.data.resource_roots)!==JSON.stringify([...task.resource_scope.roots].sort()))))
        throw new Error('Curated task scope changed during active assignment.');
      return {result:'already-owned',claim:observed.claim};
    }
    return {result:'busy',task:repo+'#'+issue};
  }

  // This optional callback is used by the SHA-approved PRIVATE GitHub
  // catalog mode only. It inspects the live target PR and changed files
  // BEFORE the first write-resource create. Existing owned claims resume
  // without acquiring a new resource or running a fresh admission.
  if(beforeClaim!==null) {
    if(typeof beforeClaim!=='function')
      throw new Error('Invalid live write-task admission gate.');
    await beforeClaim(task);
  }

  const claimedAt=now();
  const scopeId=task.access==='write'?task.resource_scope.id:null;
  const resourceRoots=task.access==='write'?[...task.resource_scope.roots].sort():null;
  const data={schema_version:2,target_repository:repo,issue_number:issue,session_id:session,
    role,access:task.access,resource_scope_id:scopeId,resource_roots:resourceRoots,state:'claimed',
    claimed_at:claimedAt,branch:branchName,last_handoff:null};
  let newResource=false,resourcePath=null;
  if(task.access==='write') {
    resourcePath=resourceKey(repo,scopeId);
    const reservation={schema_version:1,kind:'write-resource',target_repository:repo,
      resource_scope_id:scopeId,resource_roots:resourceRoots,issue_number:issue,session_id:session,claimed_at:claimedAt};
    let held=await api.getClaim(ledger,resourcePath,branch);
    if(held && !resourceMatches(held,data)) return {result:'busy',task:repo+'#'+issue,resource:scopeId};
    if(!held) {
      try {
        await api.createClaim(ledger,resourcePath,branch,reservation);
        newResource=true;
      } catch(error) {
        if(!(error instanceof GitHubError) || ![409,422].includes(error.status)) throw error;
        held=await api.getClaim(ledger,resourcePath,branch);
        if(!resourceMatches(held,data))
          return {result:'busy',task:repo+'#'+issue,resource:scopeId};
      }
    }
  }
  try {
    await api.createClaim(ledger,path,branch,data);
    // Failure is intentionally NOT followed by automatic lock deletion:
    // the PUT may have succeeded while GitHub reads are stale/ambiguous.
    const verified=await verifyNewClaimReceipt({api,config,repo,issue,data});
    return {result:'acquired',claim:verified};
  } catch(error) {
    // Ambiguous network errors deliberately leave the resource reserved.
    if(!(error instanceof GitHubError) || ![409,422].includes(error.status))
      throw new Error('Issue claim outcome uncertain; inspect resource lock before retrying.',{cause:error});
    const saved=await api.getClaim(ledger,path,branch);
    if(isOwner(saved,session,repo,issue)) {
      const observed=await status({api,config,repo,issue});
      if(observed.status!=='claimed'||observed.submitted||
         observed.claim.role!==role || observed.claim.access!==task.access ||
         (task.access==='write' &&
           (observed.claim.resource_scope_id!==task.resource_scope.id ||
            JSON.stringify(observed.claim.resource_roots)!==
              JSON.stringify([...task.resource_scope.roots].sort()))))
        throw new Error('Contended claim ownership or resource scope inconsistent; reconcile manually.');
      return {result:'already-owned',claim:observed.claim};
    }
    if(newResource) {
      const current=await api.getClaim(ledger,resourcePath,branch);
      if(!resourceMatches(current,data))
        throw new Error('Resource ownership changed; manual recovery required.');
      try { await api.deleteClaim(ledger,resourcePath,branch,current.sha,data); }
      catch(e) { throw new Error('Issue claim failed and resource rollback failed; manual recovery required.',{cause:e}); }
    }
    return {result:'busy',task:repo+'#'+issue};
  }
}

export async function handoff({api,config,repo,issue,session,summary,branchName,headSha,now=()=>new Date().toISOString()}) {
  assertSession(session);
  if(typeof summary!=='string'||!summary.trim()||summary.length>2000)
    throw new Error('A factual handoff summary of 1–2000 characters is required.');
  const path=taskKey(repo,issue),{ledger,branch}=store(config);
  const current=await api.getClaim(ledger,path,branch);
  if(!isOwner(current,session,repo,issue)) throw new Error('Not the current owner; stop work.');
  const observed=await status({api,config,repo,issue});
  if(observed.status!=='claimed') throw new Error('Resource lock invalid; handoff blocked.');
  const updated={...current.data,state:'in_progress',branch:branchName||current.data.branch,
    last_handoff:{at:now(),summary,head_sha:headSha||null}};
  try { await api.updateClaim(ledger,path,branch,current.sha,updated); }
  catch(error) {
    if(error instanceof GitHubError && [409,422].includes(error.status))
      throw new Error('Claim was changed concurrently; re-read before continuing.');
    throw error;
  }
  return {result:'handoff-saved',claim:updated};
}

export async function release({api,config,repo,issue,session,confirm}) {
  assertSession(session);
  if(confirm!==true) throw new Error('Release needs explicit --confirm after reviewing handoff and PR state.');
  const path=taskKey(repo,issue),{ledger,branch}=store(config);
  const current=await api.getClaim(ledger,path,branch);
  if(!isOwner(current,session,repo,issue)) throw new Error('Not the current owner; cannot release.');
  if(!current.data.last_handoff?.summary?.trim())
    throw new Error('Save an owner handoff before release; do not abandon work silently.');
  const observed=await status({api,config,repo,issue});
  if(observed.status!=='claimed') throw new Error('Resource lock invalid; release blocked.');
  try { await api.deleteClaim(ledger,path,branch,current.sha,current.data); }
  catch(error) {
    if(error instanceof GitHubError && [409,422].includes(error.status))
      throw new Error('Claim changed concurrently; re-read before release.');
    throw error;
  }
  if(current.data.access==='write') {
    const resourcePath=resourceKey(repo,current.data.resource_scope_id);
    const resource=await api.getClaim(ledger,resourcePath,branch);
    if(!resourceMatches(resource,current.data))
      throw new Error('Task released but resource ownership is inconsistent; manual recovery required.');
    try { await api.deleteClaim(ledger,resourcePath,branch,resource.sha,current.data); }
    catch(error) {
      throw new Error('Task released but resource remains locked; manual recovery required.',{cause:error});
    }
  }
  return {result:'released',task:repo+'#'+issue};
}

export async function discover({api,config,tasks}) {
  validateTaskCatalog(tasks);
  const output=[];
  for(const task of tasks.filter(t=>t.status==='ready')) {
    if (!config.active_repositories.some(r=>r.full_name===task.repository && r.pilot_enabled)) continue;
    const [issue,current]=await Promise.all([
      api.getIssue(task.repository,task.issue),
      status({api,config,repo:task.repository,issue:task.issue})
    ]);
    let availability=issue.state!=='open' || issue.pull_request ? 'closed' :
      (current.submitted?'submitted':current.status);
    if(availability==='unclaimed' && task.access==='write') {
      const {ledger,branch}=store(config);
      const held=await api.getClaim(ledger,resourceKey(task.repository,task.resource_scope.id),branch);
      if(held) availability='resource-busy';
    }
    output.push({repository:task.repository,issue:task.issue,title:task.title,role:task.role,
      access:task.access,resource_scope_id:task.access==='write'?task.resource_scope.id:null,
      scope:task.scope,availability});
  }
  return output;
}
