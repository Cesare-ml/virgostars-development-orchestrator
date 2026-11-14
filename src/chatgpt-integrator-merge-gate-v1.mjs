/** Read-only, fail-closed Integrator merge candidate gate. Never merges, approves, or contacts GitHub. */
export function inspectIntegratorMergeGate({task,pr,approval,reviews,checks,requiredChecks,files,dependencies,conflicts,discussions,protection,session}={}) {
  const SHA=/^[0-9a-f]{40}$/i;
  const reasons=[];
  const block=(code)=>{if(!reasons.includes(code))reasons.push(code);};
  const head=pr?.head?.sha;
  const repo=task?.repository;
  if(task?.role!=='integrator'||task?.access!=='merge'||task?.status!=='ready'||
     !Number.isSafeInteger(task?.pull_request)||task.pull_request<1||
     !SHA.test(task?.approved_manifest_sha||'')||!['squash','merge','rebase'].includes(task?.merge_method)||
     typeof task?.target_branch!=='string'||!task.target_branch)
    block('INVALID_INTEGRATOR_TASK');
  if(approval?.verified!==true||approval?.manifest_sha!==task?.approved_manifest_sha||
     approval?.owner_reviewed!==true)block('OWNER_APPROVAL_NOT_VERIFIED');
  if(typeof session?.integrator_id!=='string'||!/^chat-[\w-]{8,100}$/i.test(session.integrator_id)||
     session?.author_id===session.integrator_id||!session?.author_id||
     session?.independent_identity_verified!==true)
    block('INDEPENDENT_INTEGRATOR_NOT_VERIFIED');
  if(!SHA.test(head||'')||!SHA.test(pr?.base?.sha||'')||
     pr?.number!==task?.pull_request||pr?.state!=='open'||pr?.draft!==false||
     pr?.merged!==false||pr?.mergeable!==true||pr?.head?.repo?.full_name!==repo||
     pr?.base?.repo?.full_name!==repo||pr?.base?.ref!==task?.target_branch||
     pr?.head?.sha!==task?.expected_head_sha)
    block('PR_NOT_READY_OR_HEAD_DRIFT');
  if(!protection||protection.from_github!==true||
     protection.required_rules_satisfied!==true||protection.latest_head_sha!==head||
     protection.allowed_merge_method!==task?.merge_method)
    block('BRANCH_PROTECTION_UNVERIFIED');
  if(!Array.isArray(files)||!Number.isSafeInteger(pr?.changed_files)||
     files.length!==pr.changed_files||files.length<1||files.length>200||
     files.some(f=>typeof f?.filename!=='string'||!f.filename||f.filename.startsWith('/')||
     f.filename.includes('\\')||f.filename.split('/').some(x=>!x||x==='.'||x==='..')))
    block('INCOMPLETE_OR_INVALID_FILE_INVENTORY');
  else {
    const keys=files.map(f=>f.filename.toLowerCase());
    if(new Set(keys).size!==keys.length)block('DUPLICATE_CHANGED_PATHS');
    if(files.some(f=>/(^|\/)(\.github\/workflows\/|\.env(?:\.|$)|secrets?\/|credentials?\/|migrations?\/|deploy\/|LICENSE$)/i.test(f.filename)))
      block('SENSITIVE_CHANGE_REQUIRES_OWNER');
  }
  if(!Array.isArray(requiredChecks)||requiredChecks.length<1||
     requiredChecks.some(x=>typeof x!=='string'||!x)||new Set(requiredChecks).size!==requiredChecks.length||
     !Array.isArray(checks))
    block('CHECK_INVENTORY_NOT_VERIFIED');
  else for(const required of requiredChecks) {
    const matched=checks.filter(x=>x?.name===required&&x?.source==='github');
    if(matched.length!==1||matched[0].conclusion!=='success'||matched[0].head_sha!==head)
      block('REQUIRED_HEAD_CHECK_MISSING_OR_FAILED');
  }
  if(!Array.isArray(reviews)||!reviews.some(r=>r?.state==='APPROVED'&&
     r?.head_sha===head&&r?.source==='github'&&r?.reviewer_session!==session?.author_id&&
     r?.reviewer_session!==session?.integrator_id&&r?.independence_verified===true))
    block('INDEPENDENT_HEAD_REVIEW_MISSING');
  if(!Array.isArray(dependencies)||dependencies.some(d=>d?.merged!==true||
     !SHA.test(d?.merge_sha||'')||d?.target_branch!==task?.target_branch))
    block('STACKED_DEPENDENCIES_UNVERIFIED');
  if(!Array.isArray(conflicts)||conflicts.length!==0)
    block('OPEN_PR_COLLISIONS_NOT_CLEARED');
  if(!discussions||discussions.from_github!==true||
     discussions.unresolved_count!==0||discussions.head_sha!==head)
    block('UNRESOLVED_OR_UNVERIFIED_REVIEW_THREADS');
  return {verdict:reasons.length?'blocked':'candidate',
    candidate_for_sha_pinned_merge:reasons.length===0,
    merge_authorized:false,merge_executed:false,requires_fresh_remote_checks:true,
    inspected_head_sha:SHA.test(head||'')?head:null,reasons,
    note:'Read-only preliminary gate. A separately authorized executor must revalidate live GitHub and claim ownership before any merge.'};
}
