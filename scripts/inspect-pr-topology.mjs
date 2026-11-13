#!/usr/bin/env node
/**
 * Public GitHub PR topology inventory. GET-only, tokenless, bounded and
 * strictly separate from the owner's private coordination ledger.
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PUBLIC_REPOSITORY='Cesare-ml/virgostars-development-orchestrator';
const SHA=/^[0-9a-f]{40}$/i;
const REF=/^[a-z0-9][a-z0-9._/-]{0,199}$/i;
const PAGE_SIZE=100;
const MAX_PRS=200;

function validRef(value) {
  return typeof value==='string' && REF.test(value) &&
    !value.includes('..') && !value.includes('//') &&
    !value.startsWith('/') && !value.endsWith('/') &&
    !value.split('/').some(part=>part==='.'||part==='..'||part.endsWith('.lock'));
}
function assertPr(pr) {
  if(!pr||!Number.isSafeInteger(pr.number)||pr.number<1||
     pr.state!=='open'||typeof pr.draft!=='boolean'||
     !validRef(pr.head?.ref)||!validRef(pr.base?.ref)||
     !SHA.test(pr.head?.sha||'')||!SHA.test(pr.base?.sha||'')||
     typeof pr.head.repo?.full_name!=='string'||
     typeof pr.base.repo?.full_name!=='string')
    throw new Error('Public PR inventory contains malformed or incomplete metadata.');
}
function signature(pr) {
  return [
    pr.number,pr.state,pr.draft,pr.merged_at||null,
    pr.head.ref,pr.head.sha,pr.head.repo.full_name,
    pr.base.ref,pr.base.sha,pr.base.repo.full_name
  ];
}

/**
 * Analyze an exact supplied set of open public PR metadata. Fork points
 * describe sibling proposals ONLY: they are not proof of changed-file overlap.
 * No branch names or commit SHAs are returned to the caller.
 */
export function analyzePublicPrTopology(pullRequests) {
  if(!Array.isArray(pullRequests)||pullRequests.length>MAX_PRS)
    throw new Error('Public PR inventory is incomplete or exceeds the 200-PR limit.');
  const records=[...pullRequests].sort((a,b)=>a.number-b.number);
  const byNumber=new Map(),byHead=new Map(),children=new Map();
  const blockers=new Set(),roots=[],detached=[],links=[];
  let draft=0,external=0;
  for(const pr of records) {
    assertPr(pr);
    if(byNumber.has(pr.number))
      throw new Error('Duplicate PR number in public GitHub inventory.');
    byNumber.set(pr.number,pr);
    if(byHead.has(pr.head.ref))
      blockers.add('DUPLICATE_HEAD_BRANCH');
    else byHead.set(pr.head.ref,pr);
    if(pr.draft)draft++;
    if(pr.merged_at)blockers.add('OPEN_PR_MARKED_MERGED');
    if(pr.head.repo.full_name.toLowerCase()!==PUBLIC_REPOSITORY.toLowerCase()||
       pr.base.repo.full_name.toLowerCase()!==PUBLIC_REPOSITORY.toLowerCase()) {
      external++;
      blockers.add('EXTERNAL_OR_DIFFERENT_REPOSITORY_BRANCH');
    }
    if(pr.head.ref===pr.base.ref)
      blockers.add('SELF_BASED_PR');
  }
  const parentByNumber=new Map();
  for(const pr of records) {
    if(pr.base.ref==='main') {
      roots.push(pr.number);
      continue;
    }
    const parent=byHead.get(pr.base.ref);
    if(!parent) {
      detached.push(pr.number);
      blockers.add('BASE_PR_NOT_IN_OPEN_INVENTORY');
      continue;
    }
    parentByNumber.set(pr.number,parent.number);
    links.push({parent_pr:parent.number,child_pr:pr.number});
    if(pr.base.sha.toLowerCase()!==parent.head.sha.toLowerCase())
      blockers.add('PARENT_HEAD_SHA_MISMATCH');
    if(!children.has(parent.number))children.set(parent.number,[]);
    children.get(parent.number).push(pr.number);
  }
  let maxDepth=0;
  for(const pr of records) {
    let depth=0,at=pr.number;
    const trail=new Set();
    while(at!==undefined) {
      if(trail.has(at)) {
        blockers.add('PR_PARENT_CYCLE');
        break;
      }
      trail.add(at);
      depth++;
      at=parentByNumber.get(at);
    }
    maxDepth=Math.max(maxDepth,depth);
  }
  const forks=[...children.entries()]
    .filter(([,descendants])=>descendants.length>1)
    .map(([parent,descendants])=>({
      parent_pr:parent,child_prs:[...descendants].sort((a,b)=>a-b)
    })).sort((a,b)=>a.parent_pr-b.parent_pr);
  const branchLinks=links.sort((a,b)=>a.parent_pr-b.parent_pr||a.child_pr-b.child_pr);
  const problems=[...blockers].sort();
  return {
    schema_version:'1-public-open-pr-topology',
    mode:'unauthenticated-get-only',
    checked_open_prs:records.length,
    draft_open_prs:draft,
    top_level_prs:roots.sort((a,b)=>a-b),
    linked_prs:branchLinks.length,
    parent_child_links:branchLinks,
    branching_points:forks,
    branching_point_count:forks.length,
    detached_base_prs:detached.sort((a,b)=>a-b),
    external_head_or_base_prs:external,
    max_observed_chain_depth:maxDepth,
    blockers:problems,
    structurally_consistent:problems.length===0,
    inventory_stable:false,
    file_conflicts_evaluated:false,
    merge_authorized:false,
    remote_writes:0,
    note:'Shared PR bases are a coordination signal, not evidence of overlapping file changes.'
  };
}

/**
 * Bounded two-page inventory (+ a page-three overflow guard) using public GET
 * without credentials or redirects. Errors fail closed; never return partial.
 */
export async function fetchOpenPublicPullRequests({request=fetch}={}) {
  const results=[];
  for(let page=1;page<=3;page++) {
    const url='https://api.github.com/repos/'+PUBLIC_REPOSITORY+
      '/pulls?state=open&per_page='+PAGE_SIZE+'&page='+page;
    const response=await request(url,{
      method:'GET',redirect:'error',
      headers:{
        Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'VirgoStars-Public-Pr-Topology'
      },
      signal:AbortSignal.timeout(12000)
    });
    if(response?.status!==200)
      throw new Error('Public GitHub PR inventory unavailable; no partial report.');
    const batch=await response.json();
    if(!Array.isArray(batch)||batch.length>PAGE_SIZE)
      throw new Error('Malformed public GitHub PR inventory page.');
    if(page===3) {
      if(batch.length)throw new Error('Public PR inventory exceeds 200-PR limit.');
      break;
    }
    results.push(...batch);
    if(batch.length<PAGE_SIZE)break;
  }
  return results;
}

/** Detect page reshuffling or PR push/rebase between complete inventory sweeps. */
export async function inspectLivePublicTopology({fetchInventory=fetchOpenPublicPullRequests}={}) {
  if(typeof fetchInventory!=='function')
    throw new Error('Expected a read-only public inventory adapter.');
  const first=await fetchInventory();
  const second=await fetchInventory();
  const before=analyzePublicPrTopology(first);
  const after=analyzePublicPrTopology(second);
  const sorted=prs=>[...prs].sort((a,b)=>a.number-b.number).map(signature);
  const stable=JSON.stringify(sorted(first))===JSON.stringify(sorted(second));
  const blockers=new Set([...before.blockers,...after.blockers]);
  if(!stable)blockers.add('OPEN_PR_INVENTORY_CHANGED_DURING_SCAN');
  return {
    ...after,
    blockers:[...blockers].sort(),
    structurally_consistent:blockers.size===0,
    inventory_stable:stable
  };
}

export async function main(args=process.argv.slice(2)) {
  if(args.length===1&&args[0]==='--help') {
    process.stdout.write('Public GET-only topology: node scripts/inspect-pr-topology.mjs\n');
    return 0;
  }
  if(args.length)throw new Error('Public topology command takes no arguments.');
  const result=await inspectLivePublicTopology();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  return result.structurally_consistent?0:2;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().then(code=>{process.exitCode=code;}).catch(error=>{
    process.stderr.write('ERROR: '+error.message+'\n');
    process.exitCode=1;
  });
}
