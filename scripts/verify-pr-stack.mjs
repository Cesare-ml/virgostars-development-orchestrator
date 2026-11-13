#!/usr/bin/env node
/**
 * Public-only, GET-only stacked draft PR preflight. No token, private repo
 * access, branch mutation, claim or merge. A green structural result is NOT
 * test approval and never authorizes integration.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const PUBLIC_REPO='Cesare-ml/virgostars-development-orchestrator';
const SHA=/^[0-9a-f]{40}$/i;
const BRANCH=/^[a-z0-9][a-z0-9._/-]{0,199}$/i;
const MAX_PRS=24;

function validBranch(value) {
  return typeof value==='string' && BRANCH.test(value) &&
    !value.includes('..') && !value.includes('//') &&
    !value.endsWith('/') && !value.startsWith('/') &&
    !value.split('/').some(x=>x==='.'||x==='..'||x.endsWith('.lock'));
}

export function parsePrNumbers(args) {
  if(!Array.isArray(args)||args.length<1||args.length>MAX_PRS)
    throw new Error('Supply 1–24 ordered PR numbers, oldest to newest.');
  const ids=args.map(raw=>{
    if(typeof raw!=='string'||!/^[1-9][0-9]{0,8}$/.test(raw))
      throw new Error('Every PR number must be a positive decimal integer.');
    const n=Number(raw);
    if(!Number.isSafeInteger(n))throw new Error('Invalid PR number.');
    return n;
  });
  if(new Set(ids).size!==ids.length)
    throw new Error('Duplicate PR number in the proposed chain.');
  return ids;
}

function requiredPr(pr,repository) {
  if(!pr||!Number.isSafeInteger(pr.number)||pr.number<1||
     typeof pr.state!=='string' || typeof pr.draft!=='boolean' ||
     !pr.head||!pr.base || !SHA.test(pr.head.sha||'') ||
     !SHA.test(pr.base.sha||'') ||
     !validBranch(pr.head.ref)||!validBranch(pr.base.ref) ||
     typeof pr.head.repo?.full_name!=='string' ||
     typeof pr.base.repo?.full_name!=='string')
    throw new Error('Malformed or incomplete public pull request metadata.');
  if(pr.head.repo.full_name.toLowerCase()!==repository.toLowerCase()||
     pr.base.repo.full_name.toLowerCase()!==repository.toLowerCase())
    return false;
  return true;
}

function signature(pr) {
  return [
    pr.number,pr.state,pr.draft,pr.merged_at??null,
    pr.head.ref,pr.head.sha,pr.head.repo.full_name,
    pr.base.ref,pr.base.sha,pr.base.repo.full_name
  ];
}

/** Pure structure-only verifier; never treats a draft as merge-approved. */
export function inspectStackSnapshot(prs,{repository=PUBLIC_REPO,rootBranch='main'}={}) {
  if(!Array.isArray(prs)||prs.length<1||prs.length>MAX_PRS ||
     repository!==PUBLIC_REPO || !validBranch(rootBranch))
    throw new Error('Invalid public-only stack review input.');
  const blockers=new Set(),seenNumbers=new Set(),seenHeads=new Set();
  let draftCount=0;
  for(let i=0;i<prs.length;i++) {
    const pr=prs[i];
    const sameRepository=requiredPr(pr,repository);
    if(seenNumbers.has(pr.number))blockers.add('DUPLICATE_PULL_REQUEST');
    seenNumbers.add(pr.number);
    if(seenHeads.has(pr.head.ref))blockers.add('DUPLICATE_HEAD_BRANCH');
    seenHeads.add(pr.head.ref);
    if(!sameRepository)blockers.add('CROSS_REPOSITORY_BRANCH');
    if(pr.state!=='open'||pr.merged===true||pr.merged_at)
      blockers.add('PULL_REQUEST_NOT_OPEN');
    if(pr.draft)draftCount++;
    if(pr.head.ref===pr.base.ref)
      blockers.add('SELF_BASED_PULL_REQUEST');
    if(i===0) {
      if(pr.base.ref!==rootBranch)
        blockers.add('ROOT_BASE_BRANCH_CHANGED');
    } else {
      const previous=prs[i-1];
      if(pr.base.ref!==previous.head.ref)
        blockers.add('STACK_BASE_BRANCH_MISMATCH');
      if(pr.base.sha.toLowerCase()!==previous.head.sha.toLowerCase())
        blockers.add('STACK_BASE_SHA_MISMATCH');
    }
  }
  return {
    schema_version:'1-public-pr-stack-review',
    mode:'public-read-only',
    checked_pull_requests:prs.length,
    draft_pull_requests:draftCount,
    stack_links_checked:Math.max(0,prs.length-1),
    blockers:[...blockers].sort(),
    structurally_consistent:blockers.size===0,
    live_snapshot_stable:false,
    remote_writes:0,
    merge_authorized:false,
    tests_approved:false,
    note:'PR metadata consistency is not code review, native CI validation or permission to merge.'
  };
}

/**
 * Two complete GET-only sweeps detect PR changes during the audit. There is
 * still no transactional GitHub snapshot: re-run immediately before review.
 */
export async function inspectLiveStack({numbers,fetchPullRequest}) {
  if(!Array.isArray(numbers)||numbers.length<1||numbers.length>MAX_PRS||
     !numbers.every(x=>Number.isSafeInteger(x)&&x>0)||
     new Set(numbers).size!==numbers.length||
     typeof fetchPullRequest!=='function')
    throw new Error('Invalid PR list or read-only GitHub adapter.');
  const first=[];
  const second=[];
  for(const number of numbers)first.push(await fetchPullRequest(number));
  for(const number of numbers)second.push(await fetchPullRequest(number));
  const before=inspectStackSnapshot(first);
  const after=inspectStackSnapshot(second);
  for(let i=0;i<numbers.length;i++)
    if(first[i].number!==numbers[i]||second[i].number!==numbers[i])
      throw new Error('GitHub returned a different pull request number.');
  const stable=first.every((pr,i)=>
    JSON.stringify(signature(pr))===JSON.stringify(signature(second[i])));
  const blockers=new Set([...before.blockers,...after.blockers]);
  if(!stable)blockers.add('PULL_REQUEST_CHANGED_DURING_SCAN');
  return {...after,
    blockers:[...blockers].sort(),
    structurally_consistent:blockers.size===0,
    live_snapshot_stable:stable};
}

export async function fetchPublicPullRequest(number,{request=fetch}={}) {
  if(!Number.isSafeInteger(number)||number<1)
    throw new Error('Invalid public PR number.');
  const url='https://api.github.com/repos/'+PUBLIC_REPO+'/pulls/'+number;
  const response=await request(url,{
    method:'GET',
    headers:{
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'VirgoStars-Public-PR-Stack-Review'
    },
    signal:AbortSignal.timeout(12000)
  });
  if(!response||response.status!==200)
    throw new Error('Public GitHub PR metadata could not be retrieved.');
  return response.json();
}

export async function main(argv=process.argv.slice(2)) {
  if(argv.length===1 && argv[0]==='--help') {
    process.stdout.write(
      'GET-only public stack check: node scripts/verify-pr-stack.mjs 1 23 25 27 30 33 35\n');
    return 0;
  }
  const numbers=parsePrNumbers(argv);
  const result=await inspectLiveStack({
    numbers,fetchPullRequest:number=>fetchPublicPullRequest(number)
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  return result.structurally_consistent?0:2;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().then(code=>{process.exitCode=code;}).catch(error=>{
    process.stderr.write('ERROR: '+error.message+'\n');
    process.exitCode=1;
  });
}
