import {validateTaskCatalog} from './resources.mjs';

const MAX_OPEN_PRS=200;
const MAX_FILES_PER_PR=200;
const SHA=/^[0-9a-f]{40}$/i;

const sameTree=(a,b)=>a.length===b.length && a.every((x,i)=>{
  const y=b[i];
  return x.number===y.number && x.head?.sha===y.head?.sha &&
    x.base?.sha===y.base?.sha && x.base?.ref===y.base?.ref;
});

function sortedList(prs) {
  if(!Array.isArray(prs) || prs.length>MAX_OPEN_PRS)
    throw new Error('Open PR list is incomplete or exceeds the pilot limit.');
  const sorted=[...prs].sort((a,b)=>a.number-b.number);
  const ids=new Set();
  for(const pr of sorted) {
    if(!Number.isSafeInteger(pr?.number) || pr.number<1 ||
       pr.state!=='open' || !SHA.test(pr.head?.sha||'') ||
       !SHA.test(pr.base?.sha||'') || ids.has(pr.number))
      throw new Error('Open PR list contains inconsistent or duplicate metadata.');
    ids.add(pr.number);
  }
  return sorted;
}
function overlaps(root,path) {
  if(typeof path!=='string' || path.startsWith('/') || path.includes('\\') ||
    path.split('/').some(x=>!x || x==='.' || x==='..'))
    throw new Error('Invalid changed path in PR listing.');
  const r=root.toLowerCase(),p=path.toLowerCase();
  return r.endsWith('/')?p.startsWith(r):p===r;
}
export function checkOpenPullRequestCollisions({task,pullRequests,filesByNumber}) {
  validateTaskCatalog([task]);
  if(task.access!=='write' || !task.resource_scope)
    throw new Error('PR collisions are evaluated for curated write tasks.');
  const prs=sortedList(pullRequests);
  if(!(filesByNumber instanceof Map))
    throw new Error('Expected complete PR file map.');
  const candidates=[];
  for(const pr of prs) {
    if(pr.number===task.upstream_pr) continue;
    const files=filesByNumber.get(pr.number);
    if(!Array.isArray(files) || files.length>MAX_FILES_PER_PR ||
       !Number.isSafeInteger(pr.changed_files) ||
       files.length!==pr.changed_files)
      throw new Error('Incomplete changed-file list for PR #'+pr.number);
    const matches=[];
    for(const file of files) {
      const paths=[file.filename,...(file.previous_filename?[file.previous_filename]:[])];
      for(const path of paths) {
        if(task.resource_scope.roots.some(root=>overlaps(root,path)))
          matches.push({path,status:file.status});
      }
    }
    if(matches.length) {
      candidates.push({
        number:pr.number,head_sha:pr.head.sha,base_ref:pr.base.ref,
        base_sha:pr.base.sha,draft:pr.draft===true,paths:matches
      });
    }
  }
  const occupiedPaths=[...new Set(candidates.flatMap(c=>c.paths.map(x=>x.path)))].sort();
  return {
    task:task.repository+'#'+task.issue,
    resource_scope_id:task.resource_scope.id,
    approved_roots:[...task.resource_scope.roots],
    status:candidates.length>1?'conflict':candidates.length===1?'single-candidate':'no-open-candidates',
    candidates,occupied_paths:occupiedPaths,
    auto_resolved:false,approved:false,
    caveat:'Overlapping open PR paths are a conflict signal, not a code review or merge authorization.'
  };
}
/** Read-only GitHub PR scan, with a final list freshness check. */
export async function auditOpenPullRequestCollisions({api,tasks,repo,issue}) {
  validateTaskCatalog(tasks);
  const task=tasks.find(t=>t.repository===repo&&t.issue===issue);
  if(!task || task.access!=='write')
    throw new Error('Expected a curated write-task issue.');
  const initial=sortedList(await api.getOpenPullRequests(repo));
  const filesByNumber=new Map();
  const detailed=[];
  for(const summary of initial) {
    if(summary.number===task.upstream_pr) continue;
    const [pr,files]=await Promise.all([
      api.getPullRequest(repo,summary.number),
      api.getPullRequestFiles(repo,summary.number)
    ]);
    if(pr?.number!==summary.number || pr?.state!=='open' ||
       pr.head?.sha!==summary.head.sha || pr.base?.sha!==summary.base.sha ||
       pr.base?.ref!==summary.base.ref ||
       !Array.isArray(files) || files.length>MAX_FILES_PER_PR ||
       !Number.isSafeInteger(pr.changed_files) ||
       files.length!==pr.changed_files)
      throw new Error('PR changed or GitHub file list incomplete during collision audit.');
    detailed.push(pr);
    filesByNumber.set(pr.number,files);
  }
  const final=sortedList(await api.getOpenPullRequests(repo));
  if(!sameTree(initial,final))
    throw new Error('Open PR set/HEAD changed during collision audit; retry.');
  // Preserve already validated detailed changed_files counts in the analysis.
  const byId=new Map(detailed.map(pr=>[pr.number,pr]));
  const complete=initial.map(pr=>byId.get(pr.number)||pr);
  const result=checkOpenPullRequestCollisions({task,pullRequests:complete,filesByNumber});
  return {...result,scanned_open_prs:initial.length};
}
