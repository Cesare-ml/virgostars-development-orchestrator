/**
 * GitHub-only, read-only independent branch protection + PR dependency preflight.
 * NOTE: "candidate" is NEVER a merge authorization, even with green evidence.
 */
const HOST='https://api.github.com';
const REPO=/^[a-z\d][a-z\d._-]*\/[a-z\d][a-z\d._-]*$/i;
const SHA=/^[0-9a-f]{40}$/i;
const MAX_DEPS=12;
const issue=(n)=>Number.isSafeInteger(n)&&n>0;
const isSha=s=>typeof s==='string'&&SHA.test(s);
function invalid(msg){throw new Error('Integrator branch/dependency preflight blocked: '+msg)}
function validBranch(s){
  return typeof s==='string'&&s.length>0&&s.length<=160&&
    /^[a-zA-Z0-9._/-]+$/.test(s)&&!s.startsWith('/')&&!s.endsWith('/')&&
    s.split('/').every(v=>v&&v!=='.'&&v!=='..')&&!s.includes('..');
}
function identity(pr){
  if(!issue(pr?.number)||!isSha(pr?.head?.sha)||!isSha(pr?.base?.sha)||
     !validBranch(pr?.head?.ref)||!validBranch(pr?.base?.ref))
    invalid('malformed pull request identity');
  return [pr.number,pr.state,pr.draft,pr.merged,pr.mergeable,
    pr.head.sha,pr.base.sha,pr.head.ref,pr.base.ref,
    pr.head.repo?.full_name,pr.base.repo?.full_name].join('|');
}
function sanitize(value){
  return typeof value==='string'&&value.length<=150?value:'unknown';
}
function readOnlyGitHub({token,fetchImpl=fetch}) {
  if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token)||typeof fetchImpl!=='function')
    invalid('private read-only GitHub credential/fetch unavailable');
  async function get(path) {
    let response;
    try{
      response=await fetchImpl(HOST+path,{
        method:'GET',redirect:'error',
        headers:{Authorization:'Bearer '+token,
          Accept:'application/vnd.github+json',
          'X-GitHub-Api-Version':'2022-11-28',
          'User-Agent':'VirgoStars-Integrator-protection-read'}
      });
    }catch {invalid('GitHub transport failure')}
    if(!response||response.ok!==true)
      invalid('GitHub read denied: HTTP '+(Number.isInteger(response?.status)?response.status:'unknown'));
    try{
      const body=await response.json();
      if(!body||typeof body!=='object'||Array.isArray(body))
        invalid('GitHub response not a complete object');
      return body;
    }catch{invalid('GitHub JSON response unavailable')}
  }
  return get;
}
function requiredNames(protection) {
  const status=protection?.required_status_checks;
  const list=[
    ...(Array.isArray(status?.contexts)?status.contexts:[]),
    ...(Array.isArray(status?.checks)?status.checks.map(x=>x?.context):[])
  ];
  if(!list.length||list.length>60||list.some(x=>typeof x!=='string'||!x||x.length>140))
    invalid('required status checks not verifiable');
  return [...new Set(list)];
}

/**
 * The repo GET, branch GET, branch protection GET, PR GET and compare GETs
 * are real GitHub REST reads. Any 403/404/missing data stops or blocks.
 * Only DEFAULT branch integration is in scope for this initial policy.
 * @returns an observation, never permission to merge.
 */
export async function inspectIntegratorProtectedDependencyPreflight({
  token,fetchImpl,repository,prNumber,expectedHeadSha,targetBranch,
  dependencies=[]
}={}) {
  if(!REPO.test(repository||'')||!issue(prNumber)||!isSha(expectedHeadSha)||
     !validBranch(targetBranch)||!Array.isArray(dependencies)||
     dependencies.length>MAX_DEPS||dependencies.some(n=>!issue(n)||n===prNumber)||
     new Set(dependencies).size!==dependencies.length)
    invalid('invalid or incomplete approved integration scope');
  const get=readOnlyGitHub({token,fetchImpl});
  const prefix='/repos/'+repository;
  const encBranch=encodeURIComponent(targetBranch);
  const initial=await get(prefix+'/pulls/'+prNumber);
  const frozen=identity(initial);
  if(initial.number!==prNumber||initial.head?.repo?.full_name!==repository||
     initial.base?.repo?.full_name!==repository)
    invalid('PR repository identity mismatch');
  const reasons=[];
  const block=reason=>{if(!reasons.includes(reason))reasons.push(reason)};
  if(initial.state!=='open'||initial.draft!==false||initial.merged!==false||
     initial.mergeable!==true)block('PR_NOT_READY');
  if(initial.head.sha!==expectedHeadSha)block('PR_HEAD_DRIFT');
  if(initial.base.ref!==targetBranch)block('WRONG_BASE_BRANCH');

  const [metadata,branch,protection]=await Promise.all([
    get(prefix),
    get(prefix+'/branches/'+encBranch),
    get(prefix+'/branches/'+encBranch+'/protection')
  ]);
  if(typeof metadata.default_branch!=='string'||!validBranch(metadata.default_branch))
    invalid('default branch not verifiable');
  if(metadata.default_branch!==targetBranch)
    block('NON_DEFAULT_BRANCH_REQUIRES_SEPARATE_POLICY');
  if(branch.name!==targetBranch||!isSha(branch.commit?.sha)||
     branch.protected!==true)
    block('BRANCH_NOT_PROVEN_PROTECTED');
  const approvals=protection?.required_pull_request_reviews;
  if(!approvals||!Number.isSafeInteger(approvals.required_approving_review_count)||
     approvals.required_approving_review_count<1)
    block('REQUIRED_REVIEWS_UNVERIFIED');
  if(protection?.required_conversation_resolution?.enabled!==true)
    block('CONVERSATION_RESOLUTION_UNVERIFIED');
  if(protection?.enforce_admins?.enabled!==true)
    block('ENFORCE_ADMINS_UNVERIFIED');
  let checks=[];
  try{checks=requiredNames(protection)}
  catch{block('REQUIRED_STATUS_CHECKS_UNVERIFIED')}
  if(protection?.required_status_checks?.strict!==true)
    block('UP_TO_DATE_CHECKS_UNVERIFIED');
  if(initial.base.sha!==branch.commit?.sha)
    block('BASE_BRANCH_CHANGED_OR_UNVERIFIED');
  const depEvidence=[];
  for(const number of dependencies) {
    const dep=await get(prefix+'/pulls/'+number);
    if(dep.number!==number||dep.state!=='closed'||dep.merged!==true||
       !isSha(dep.merge_commit_sha)||dep.base?.repo?.full_name!==repository||
       dep.base?.ref!==targetBranch)
      block('UNMERGED_OR_MISROUTED_DEPENDENCY');
    if(isSha(dep.merge_commit_sha)) {
      const compare=await get(prefix+'/compare/'+dep.merge_commit_sha+'...'+branch.commit.sha);
      if(!['ahead','identical'].includes(compare.status)||
         compare.base_commit?.sha!==dep.merge_commit_sha)
        block('DEPENDENCY_NOT_ANCESTOR_OF_TARGET');
    }
    depEvidence.push({number,merged:dep.merged===true,merge_sha:
      isSha(dep.merge_commit_sha)?dep.merge_commit_sha:null});
  }
  const [latestPr,latestBranch]=await Promise.all([
    get(prefix+'/pulls/'+prNumber),
    get(prefix+'/branches/'+encBranch)
  ]);
  if(identity(latestPr)!==frozen||latestBranch.name!==targetBranch||
     latestBranch.commit?.sha!==branch.commit.sha||
     latestBranch.protected!==branch.protected)
    invalid('PR or target branch changed during evidence collection');

  return {
    verdict:reasons.length?'blocked':'candidate',reasons,
    repository,pr_number:prNumber,head_sha:initial.head.sha,
    base_sha:branch.commit.sha,target_branch:targetBranch,
    verified_required_checks:checks,
    required_approving_reviews:approvals?.required_approving_review_count??null,
    dependencies:depEvidence,
    merge_authorized:false,merge_executed:false,
    rulesets_independently_verified:false,
    review_and_ci_current_head_verified:false,
    private_integrator_claim_verified:false,
    warning:'Read-only preflight. It does not prove checks actually passed, all GitHub rulesets, all PR collisions, a reviewed private task, or merge authorization.'
  };
}
