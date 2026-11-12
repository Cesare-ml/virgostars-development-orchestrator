import { randomUUID } from 'node:crypto';
import { GitHubError } from './github.mjs';

const VALID_REPO = /^[a-z\d_.-]+\/[a-z\d_.-]+$/i;
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
function assertSession(s) {
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
export async function status({api,config,repo,issue}) {
  const {ledger,branch}=store(config);
  const current=await api.getClaim(ledger,taskKey(repo,issue),branch);
  return current ? {status:'claimed',claim:current.data,blob_sha:current.sha} : {status:'unclaimed'};
}
export async function claim({api,config,tasks,repo,issue,session,role='developer',branchName=null,now=()=>new Date().toISOString()}) {
  assertSession(session);
  const task=approved(config,tasks,repo,issue);
  if (!['developer','tester','planner','reviewer','auditor','integrator'].includes(role)) throw new Error('Unknown role.');
  if (task.role && task.role!==role) throw new Error('Task requires role ' + task.role);
  const target=await api.getIssue(repo,issue);
  if (!target || target.state!=='open' || target.pull_request)
    throw new Error('The target issue is not an open GitHub issue.');
  const path=taskKey(repo,issue);
  const {ledger,branch}=store(config);
  const existing=await api.getClaim(ledger,path,branch);
  if (existing) {
    if (isOwner(existing,session,repo,issue)) return {result:'already-owned',claim:existing.data};
    return {result:'busy',task:repo+'#'+issue};
  }
  const data={schema_version:1,target_repository:repo,issue_number:issue,session_id:session,
              role,state:'claimed',claimed_at:now(),branch:branchName,last_handoff:null};
  try {
    await api.createClaim(ledger,path,branch,data);
    return {result:'acquired',claim:data};
  } catch(error) {
    if (error instanceof GitHubError && [409,422].includes(error.status)) return {result:'busy',task:repo+'#'+issue};
    throw error;
  }
}
export async function handoff({api,config,repo,issue,session,summary,branchName,headSha,now=()=>new Date().toISOString()}) {
  assertSession(session);
  if (typeof summary!=='string' || !summary.trim() || summary.length>2000)
    throw new Error('A factual handoff summary of 1–2000 characters is required.');
  const path=taskKey(repo,issue);
  const {ledger,branch}=store(config);
  const current=await api.getClaim(ledger,path,branch);
  if (!isOwner(current,session,repo,issue)) throw new Error('Not the current owner; stop work.');
  const updated={...current.data,state:'in_progress',branch:branchName||current.data.branch,
     last_handoff:{at:now(),summary,head_sha:headSha||null}};
  try {
    await api.updateClaim(ledger,path,branch,current.sha,updated);
  } catch(error) {
    if (error instanceof GitHubError && [409,422].includes(error.status))
      throw new Error('Claim was changed concurrently; re-read before continuing.');
    throw error;
  }
  return {result:'handoff-saved',claim:updated};
}
export async function release({api,config,repo,issue,session,confirm}) {
  assertSession(session);
  if (confirm!==true) throw new Error('Release needs explicit --confirm after reviewing handoff and PR state.');
  const path=taskKey(repo,issue);
  const {ledger,branch}=store(config);
  const current=await api.getClaim(ledger,path,branch);
  if (!isOwner(current,session,repo,issue)) throw new Error('Not the current owner; cannot release.');
  try {
    await api.deleteClaim(ledger,path,branch,current.sha,current.data);
  } catch(error) {
    if (error instanceof GitHubError && [409,422].includes(error.status))
      throw new Error('Claim changed concurrently; re-read before release.');
    throw error;
  }
  return {result:'released',task:repo+'#'+issue};
}
export async function discover({api,config,tasks}) {
  const output=[];
  for(const task of tasks.filter(t=>t.status==='ready')) {
    if (!config.active_repositories.some(r=>r.full_name===task.repository && r.pilot_enabled)) continue;
    const [issue,current]=await Promise.all([
      api.getIssue(task.repository,task.issue),
      status({api,config,repo:task.repository,issue:task.issue})
    ]);
    output.push({repository:task.repository,issue:task.issue,title:task.title,role:task.role,
      scope:task.scope,availability:issue.state!=='open' || issue.pull_request ? 'closed' : current.status});
  }
  return output;
}
