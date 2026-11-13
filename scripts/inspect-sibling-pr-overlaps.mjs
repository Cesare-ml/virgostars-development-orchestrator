#!/usr/bin/env node
/**
 * Public-only, unauthenticated and GET-only sibling PR overlap diagnostic.
 * This does not approve, merge, rebase or close a pull request.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const PUBLIC_REPOSITORY='Cesare-ml/virgostars-development-orchestrator';
const MAX_PRS=24;
const MAX_FILES_PER_PR=200;
const SHA=/^[0-9a-f]{40}$/i;

function assert(ok,message) {
  if(!ok)throw new Error(message);
}
export function parseSiblingNumbers(args) {
  assert(Array.isArray(args)&&args.length>=2&&args.length<=MAX_PRS,
    'Provide 2–24 distinct sibling PR numbers.');
  const numbers=args.map(value=>{
    assert(typeof value==='string' && /^[1-9][0-9]{0,8}$/.test(value),
      'Invalid PR number.');
    return Number(value);
  });
  assert(new Set(numbers).size===numbers.length,'Duplicate PR number.');
  return numbers;
}
function safePath(path) {
  return typeof path==='string' && path.length>=1 && path.length<=300 &&
    !path.startsWith('/') && !path.includes('\\') && !/[\x00-\x1f\x7f]/.test(path) &&
    !path.split('/').some(s=>!s || s==='.' || s==='..');
}
function normalized(path) {
  assert(safePath(path),'Unsafe changed-file path in public PR metadata.');
  return path.toLowerCase();
}
function filePaths(files,pr) {
  assert(Array.isArray(files)&&files.length>0&&
    files.length<=MAX_FILES_PER_PR&&files.length===pr.changed_files,
    'PR file metadata is incomplete or exceeds the public audit limit.');
  const set=new Set();
  const primary=new Set();
  for(const file of files) {
    assert(file && typeof file==='object'&&!Array.isArray(file),
      'Malformed changed-file entry.');
    const name=normalized(file.filename);
    assert(!primary.has(name),'Duplicate changed-file entry.');
    primary.add(name);
    assert(typeof file.status==='string' && 
      ['added','modified','removed','renamed','copied','changed','unchanged'].includes(file.status),
      'Unsupported changed-file status.');
    set.add(name);
    if(file.status==='renamed')
      assert(typeof file.previous_filename==='string',
        'Renamed file lacks its original path.');
    if(file.previous_filename!==undefined && file.previous_filename!==null)
      set.add(normalized(file.previous_filename));
  }
  return set;
}
function signature(pr) {
  return [
    pr.number,pr.state,pr.draft,pr.merged_at??null,
    pr.changed_files,pr.head?.ref,pr.head?.sha,pr.head?.repo?.full_name,
    pr.base?.ref,pr.base?.sha,pr.base?.repo?.full_name
  ];
}
function validatePr(pr) {
  assert(pr && Number.isSafeInteger(pr.number)&&pr.number>0 &&
    pr.state==='open' && pr.merged!==true && !pr.merged_at &&
    typeof pr.draft==='boolean' &&
    Number.isSafeInteger(pr.changed_files) && pr.changed_files>=1 &&
    pr.changed_files<=MAX_FILES_PER_PR &&
    SHA.test(pr.head?.sha||'') && SHA.test(pr.base?.sha||'') &&
    typeof pr.head?.ref==='string' && pr.head.ref.length>0 &&
    typeof pr.base?.ref==='string' && pr.base.ref.length>0 &&
    pr.head.repo?.full_name===PUBLIC_REPOSITORY &&
    pr.base.repo?.full_name===PUBLIC_REPOSITORY,
    'Invalid or non-public sibling PR metadata.');
}

/**
 * Pure comparison of complete, pinned PR metadata and changed-file listings.
 * Same filename means potential edit overlap, NOT a Git merge conflict proof.
 */
export function inspectSiblingSnapshot(prs,filesByNumber) {
  assert(Array.isArray(prs)&&prs.length>=2&&prs.length<=MAX_PRS &&
    filesByNumber instanceof Map,'Invalid sibling PR audit fixture.');
  const unique=new Set(),paths=new Map();
  for(const pr of prs) {
    validatePr(pr);
    assert(!unique.has(pr.number),'Duplicate PR in snapshot.');
    unique.add(pr.number);
    assert(filesByNumber.has(pr.number),'PR changed-file listing is missing.');
    paths.set(pr.number,filePaths(filesByNumber.get(pr.number),pr));
  }
  const first=prs[0];
  assert(prs.every(pr=>pr.base.ref===first.base.ref &&
    pr.base.sha===first.base.sha &&
    pr.base.repo.full_name===first.base.repo.full_name),
    'Selected PRs are not siblings on the same exact base snapshot.');
  const pairs=[];
  let overlappingPairs=0,sharedPathReferences=0;
  for(let i=0;i<prs.length;i++)for(let j=i+1;j<prs.length;j++) {
    const a=paths.get(prs[i].number),b=paths.get(prs[j].number);
    let shared=0;
    for(const value of a)if(b.has(value))shared++;
    if(shared)overlappingPairs++;
    sharedPathReferences+=shared;
    pairs.push({pull_requests:[prs[i].number,prs[j].number],
      overlapping_paths:shared,potential_overlap:shared>0});
  }
  return {
    schema_version:'1-public-sibling-pr-overlap',
    mode:'public-get-only',
    checked_pull_requests:prs.length,
    pairs_compared:pairs.length,
    pairs_with_path_overlap:overlappingPairs,
    shared_path_references:sharedPathReferences,
    pairs,
    live_snapshot_stable:false,
    github_writes:0,
    merge_authorized:false,
    pr_selection_authorized:false,
    note:'Same changed paths signal review candidates; they do not prove merge conflicts or select a winner.'
  };
}

/** Two metadata sweeps detect a push, rebase or base movement during file pagination. */
export async function inspectLiveSiblings({numbers,getPullRequest,getFiles}) {
  assert(Array.isArray(numbers)&&numbers.length>=2&&numbers.length<=MAX_PRS &&
    numbers.every(n=>Number.isSafeInteger(n)&&n>0)&&
    new Set(numbers).size===numbers.length&&
    typeof getPullRequest==='function'&&typeof getFiles==='function',
    'Invalid read-only sibling PR request.');
  const before=[],after=[],files=new Map();
  for(const n of numbers) {
    const pr=await getPullRequest(n);
    validatePr(pr);
    assert(pr.number===n,'GitHub returned an unexpected PR number.');
    before.push(pr);
  }
  for(const n of numbers)files.set(n,await getFiles(n));
  for(const n of numbers) {
    const pr=await getPullRequest(n);
    validatePr(pr);
    assert(pr.number===n,'GitHub returned a different PR number.');
    after.push(pr);
  }
  assert(before.every((pr,i)=>
    JSON.stringify(signature(pr))===JSON.stringify(signature(after[i]))),
    'A sibling PR changed during the file inventory; retry from scratch.');
  return {...inspectSiblingSnapshot(after,files),live_snapshot_stable:true};
}

/** No token, private endpoint, arbitrary user-supplied URL or POST/PUT. */
export async function fetchPublicJson(path,{request=fetch}={}) {
  assert(/^\/pulls\/[1-9][0-9]*(?:\/files\?per_page=100&page=[1-3])?$/.test(path),
    'Unexpected public GitHub path.');
  const response=await request(
    'https://api.github.com/repos/'+PUBLIC_REPOSITORY+path,{
      method:'GET',
      headers:{
        Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'VirgoStars-Public-Sibling-Overlap'
      },
      signal:AbortSignal.timeout(12000)
    });
  assert(response?.status===200,'Public GitHub PR information unavailable.');
  return response.json();
}
export async function fetchPublicFiles(number,{request=fetch}={}) {
  assert(Number.isSafeInteger(number)&&number>0,'Invalid PR number.');
  const results=[];
  for(let page=1;page<=3;page++) {
    const chunk=await fetchPublicJson('/pulls/'+number+
      '/files?per_page=100&page='+page,{request});
    assert(Array.isArray(chunk)&&chunk.length<=100,
      'Malformed public changed-file pagination.');
    results.push(...chunk);
    assert(results.length<=MAX_FILES_PER_PR,'Public PR exceeds file audit limit.');
    if(chunk.length<100)return results;
  }
  throw new Error('Public PR pagination did not terminate.');
}
export async function main(args=process.argv.slice(2)) {
  if(args.length===1&&args[0]==='--help'){
    process.stdout.write(
      'GET-only sibling overlap: node scripts/inspect-sibling-pr-overlaps.mjs PR1 PR2 [PR3...]\\n');
    return 0;
  }
  const numbers=parseSiblingNumbers(args);
  const result=await inspectLiveSiblings({
    numbers,
    getPullRequest:n=>fetchPublicJson('/pulls/'+n),
    getFiles:n=>fetchPublicFiles(n)
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  return result.pairs_with_path_overlap>0?2:0;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().then(code=>{process.exitCode=code;}).catch(error=>{
    process.stderr.write('ERROR: '+error.message+'\n');
    process.exitCode=1;
  });
}
