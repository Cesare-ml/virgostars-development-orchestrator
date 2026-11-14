/**
 * Authenticated, read-only GitHub REST + GraphQL adapter for Integrator evidence.
 * Exactly five GET/query operations; NO merge, mutation, claim or approval API.
 * A caller-supplied token remains in memory and is never returned or logged.
 */
const API='https://api.github.com';
const REPO=/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA=/^[a-f0-9]{40}$/i;
const PAGE=100, MAX=200;
const THREAD_QUERY=`query IntegratorReviewThreads($owner:String!,$name:String!,$number:Int!,$after:String) {
  repository(owner:$owner,name:$name) {
    pullRequest(number:$number) {
      reviewThreads(first:100,after:$after) {
        totalCount
        nodes { id isResolved }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;
const stop=reason=>{throw new Error('Integrator GitHub read blocked: '+reason)};
const validNumber=n=>Number.isSafeInteger(n)&&n>0;
function validateRepo(repo){if(!REPO.test(repo||''))stop('invalid repository')}
function validateNumber(n){if(!validNumber(n))stop('invalid pull request number')}

export function makeIntegratorGitHubReadAdapter({token,fetchImpl=fetch}={}) {
  if(typeof token!=='string'||!token.trim()||token.includes('\n')||token.includes('\r'))
    stop('a private GitHub credential is required');
  if(typeof fetchImpl!=='function')stop('fetch implementation unavailable');

  async function request(method,path,body) {
    const headers={
      Authorization:'Bearer '+token,
      Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'VirgoStars-Integrator-read-only'
    };
    if(body!==undefined)headers['Content-Type']='application/json';
    let response;
    try {
      response=await fetchImpl(API+path,{method,headers,redirect:'error',
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
    } catch {
      stop('GitHub transport error');
    }
    if(!response||response.ok!==true)
      stop('GitHub HTTP '+(Number.isSafeInteger(response?.status)?response.status:'unknown'));
    try {
      const json=await response.json();
      if(json===null||typeof json!=='object')stop('empty GitHub response');
      return json;
    } catch {
      stop('GitHub returned malformed JSON');
    }
  }
  function endpoint(repo,number,suffix='') {
    validateRepo(repo);validateNumber(number);
    return '/repos/'+repo+'/pulls/'+number+suffix;
  }
  async function restPages(repo,number,resource) {
    const rows=[];
    for(let page=1;page<=3;page++) {
      const chunk=await request('GET',endpoint(repo,number,'/'+resource)+
        '?per_page='+PAGE+'&page='+page);
      if(!Array.isArray(chunk)||chunk.length>PAGE||rows.length+chunk.length>MAX)
        stop('incomplete '+resource+' pagination');
      rows.push(...chunk);
      if(chunk.length<PAGE)return rows;
    }
    stop('unbounded '+resource+' pagination');
  }

  return Object.freeze({
    async getPullRequest(repo,number) {
      const pr=await request('GET',endpoint(repo,number));
      if(pr.number!==number||pr.head?.repo?.full_name!==repo||
         pr.base?.repo?.full_name!==repo)stop('unexpected PR identity');
      return pr;
    },
    async getPullRequestFiles(repo,number) {
      return restPages(repo,number,'files');
    },
    async getPullRequestReviews(repo,number) {
      return restPages(repo,number,'reviews');
    },
    async getPullRequestCheckRuns(repo,headSha) {
      validateRepo(repo);
      if(typeof headSha!=='string'||!SHA.test(headSha))
        stop('invalid commit SHA');
      const found=[], ids=new Set();
      let total=null;
      for(let page=1;page<=3;page++) {
        const data=await request('GET','/repos/'+repo+'/commits/'+headSha+
          '/check-runs?per_page='+PAGE+'&page='+page);
        if(!Number.isSafeInteger(data.total_count)||data.total_count<0||
           data.total_count>MAX||!Array.isArray(data.check_runs)||
           data.check_runs.length>PAGE||(total!==null&&data.total_count!==total))
          stop('incomplete check-run pagination');
        total=data.total_count;
        for(const run of data.check_runs) {
          if(!validNumber(run?.id)||ids.has(run.id)||
             run.head_sha!==headSha)stop('invalid or stale check-run');
          ids.add(run.id);found.push(run);
        }
        if(found.length>total)stop('check-run count exceeds GitHub total');
        if(found.length===total)return {head_sha:headSha,total_count:total,check_runs:found};
        if(data.check_runs.length<PAGE)stop('check-run pages stopped before GitHub total');
      }
      stop('unbounded check-run pagination');
    },
    async getPullRequestReviewThreads(repo,number) {
      validateRepo(repo);validateNumber(number);
      const [owner,name]=repo.split('/');
      const found=[],seen=new Set(),cursors=new Set();
      let after=null,total=null;
      for(let page=1;page<=3;page++) {
        const data=await request('POST','/graphql',{
          query:THREAD_QUERY,variables:{owner,name,number,after}
        });
        if(Array.isArray(data.errors)&&data.errors.length)
          stop('GraphQL review-thread query failed');
        const threads=data.data?.repository?.pullRequest?.reviewThreads;
        const info=threads?.pageInfo;
        if(!Number.isSafeInteger(threads?.totalCount)||
           threads.totalCount<0||threads.totalCount>MAX||
           (total!==null&&total!==threads.totalCount)||
           !Array.isArray(threads.nodes)||threads.nodes.length>PAGE||
           typeof info?.hasNextPage!=='boolean')
          stop('incomplete review-thread pagination');
        total=threads.totalCount;
        for(const row of threads.nodes) {
          if(typeof row?.id!=='string'||!row.id||
             typeof row?.isResolved!=='boolean'||seen.has(row.id))
            stop('invalid or duplicate review thread');
          seen.add(row.id);found.push(row);
        }
        if(found.length>total)stop('review threads exceed GitHub total');
        if(!info.hasNextPage) {
          if(found.length!==total)stop('review-thread count mismatch');
          return {complete:true,total_count:total,threads:found};
        }
        if(typeof info.endCursor!=='string'||!info.endCursor||
           cursors.has(info.endCursor)||threads.nodes.length===0)
          stop('invalid review-thread cursor');
        cursors.add(info.endCursor);after=info.endCursor;
      }
      stop('unbounded review-thread pagination');
    }
  });
}
