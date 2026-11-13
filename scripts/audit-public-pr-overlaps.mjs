#!/usr/bin/env node
// Public development PR inventory ONLY: no coordination ledger, tokens or writes.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const REPOSITORY='Cesare-ml/virgostars-development-orchestrator';
export const DEFAULT_BASE='feat/offline-two-agent-rehearsal-20261113';
const API='https://api.github.com/repos/'+REPOSITORY;
const MAX_OPEN=80,MAX_FILES=200,MAX_RELEVANT=60,DISPLAY_PAIRS=60;
const HEX=/^[0-9a-f]{40}$/i;
const REF=/^[a-z0-9_.\/-]{1,120}$/i;

function assertBase(base) {
  if(typeof base!=='string'||!REF.test(base)||base.startsWith('/')||
     base.endsWith('/')||base.includes('//')||
     base.split('/').some(p=>p==='.'||p==='..'||!p))
    throw new Error('Invalid public PR base branch.');
}
function safePath(path) {
  if(typeof path!=='string'||!path||path.length>512||path.startsWith('/')||
     path.includes('\\')||path.includes('//')||/[\x00-\x1f\x7f]/.test(path)||
     path.split('/').some(p=>!p||p==='.'||p==='..'))
    throw new Error('Malformed public PR changed-file path.');
  return path.normalize('NFC').toLowerCase();
}
function prShape(pr) {
  if(!pr || !Number.isSafeInteger(pr.number)||pr.number<1||
     pr.state!=='open'||typeof pr.draft!=='boolean'||
     !HEX.test(pr.head?.sha||'')||!HEX.test(pr.base?.sha||'')||
     typeof pr.head?.ref!=='string'||typeof pr.base?.ref!=='string'||
     !pr.base?.repo?.full_name||
     pr.base.repo.full_name.toLowerCase()!==REPOSITORY.toLowerCase())
    throw new Error('Incomplete or unsafe public PR inventory.');
  return [pr.number,pr.head.sha,pr.base.sha,pr.head.ref,pr.base.ref,
    pr.state,pr.draft,pr.changed_files??null];
}
function validateInventory(items) {
  if(!Array.isArray(items)||items.length>MAX_OPEN)
    throw new Error('Open PR inventory is incomplete or above the audit bound.');
  const seen=new Set();
  for(const p of items) {
    const signature=prShape(p);
    if(seen.has(signature[0]))throw new Error('Duplicate public PR in inventory.');
    seen.add(signature[0]);
  }
  return items;
}
const stableSignature=items=>JSON.stringify(items.map(prShape).sort((a,b)=>a[0]-b[0]));

export function createPublicGitHubReader(fetchImpl=fetch) {
  async function get(path) {
    const response=await fetchImpl(API+path,{
      method:'GET',
      headers:{Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'VirgoStars-public-pr-overlap-audit'}
    });
    if(!response?.ok)throw new Error('Public GitHub GET failed (HTTP '+(response?.status??'unknown')+').');
    return response.json();
  }
  async function paged(path,limit) {
    const items=[];
    for(let page=1;page<=3;page++) {
      const chunk=await get(path+'&per_page=100&page='+page);
      if(!Array.isArray(chunk)||chunk.length>100)
        throw new Error('Malformed public GitHub pagination.');
      items.push(...chunk);
      if(items.length>limit)
        throw new Error('Public GitHub pagination exceeded safe audit bounds.');
      if(chunk.length<100)return items;
    }
    throw new Error('Public GitHub pagination incomplete.');
  }
  return {
    getRepository:()=>get(''),
    listOpenPullRequests:()=>paged('/pulls?state=open',MAX_OPEN),
    listPullRequestFiles:number=>{
      if(!Number.isSafeInteger(number)||number<1)
        throw new Error('Invalid PR number.');
      return paged('/pulls/'+number+'/files?sort=filename',MAX_FILES);
    }
  };
}

/**
 * Two independent inventory passes fence out PR additions, closures, pushes
 * and rebases during file-list reads. This is a READ-ONLY advisory snapshot,
 * never a mergeability proof or permission to integrate.
 */
export async function auditPublicPrOverlaps({api=createPublicGitHubReader(),base=DEFAULT_BASE}={}) {
  assertBase(base);
  const identity=await api.getRepository();
  if(!identity || identity.full_name?.toLowerCase()!==REPOSITORY.toLowerCase()||
     identity.private!==false||identity.visibility!=='public'||
     identity.archived===true)
    throw new Error('Expected public orchestrator repository metadata.');
  const first=validateInventory(await api.listOpenPullRequests());
  const candidates=first.filter(pr=>pr.base.ref===base).sort((a,b)=>a.number-b.number);
  if(candidates.length>MAX_RELEVANT)
    throw new Error('Too many PRs on the selected base; audit incomplete.');

  const touched=new Map();
  for(const pr of candidates) {
    const list=await api.listPullRequestFiles(pr.number);
    if(!Array.isArray(list)||!list.length||list.length>MAX_FILES ||
       (Number.isSafeInteger(pr.changed_files)&&pr.changed_files!==list.length))
      throw new Error('Incomplete changed-file listing for public PR.');
    const paths=new Set();
    for(const file of list) {
      if(!['added','modified','removed','renamed','copied','changed'].includes(file?.status))
        throw new Error('Unknown changed-file status in public PR.');
      paths.add(safePath(file.filename));
      if(file.status==='renamed'||file.status==='copied') {
        if(!file.previous_filename)throw new Error('Rename/copy source is missing.');
        paths.add(safePath(file.previous_filename));
      } else if(file.previous_filename) {
        // Any unexpected old path is conservatively treated as touched.
        paths.add(safePath(file.previous_filename));
      }
    }
    touched.set(pr.number,paths);
  }
  const second=validateInventory(await api.listOpenPullRequests());
  if(stableSignature(first)!==stableSignature(second))
    throw new Error('Public PR inventory changed during audit; rerun.');
  const pairs=[];
  for(let i=0;i<candidates.length;i++) {
    const a=candidates[i],paths=touched.get(a.number);
    for(let j=i+1;j<candidates.length;j++) {
      const b=candidates[j],other=touched.get(b.number);
      const shared=[...paths].filter(p=>other.has(p)).sort();
      if(shared.length)pairs.push({prs:[a.number,b.number],shared_files:shared});
    }
  }
  return {
    schema_version:'1-public-pr-overlap-audit',
    mode:'public-read-only',base,
    open_prs_checked:first.length,
    base_prs_checked:candidates.length,
    overlap_pairs:pairs.length,
    pairs:pairs.slice(0,DISPLAY_PAIRS),
    omitted_pairs:Math.max(0,pairs.length-DISPLAY_PAIRS),
    complete:true,git_writes:0,merge_authorized:false,
    note:'Overlapping paths require review; disjoint paths do not prove clean merges. Compare current heads and CI independently.'
  };
}

async function main(args=process.argv.slice(2)) {
  if(args.length>2 || (args.length===2&&args[0]!=='--base') ||
     (args.length===1&&args[0]!=='--help'))
    throw new Error('Usage: node scripts/audit-public-pr-overlaps.mjs [--base PUBLIC_BRANCH]');
  if(args[0]==='--help') {
    process.stdout.write('Usage: node scripts/audit-public-pr-overlaps.mjs [--base PUBLIC_BRANCH]\n');
    return;
  }
  const report=await auditPublicPrOverlaps({
    base:args.length===2?args[1]:DEFAULT_BASE
  });
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(report.overlap_pairs>0)process.exitCode=2;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{
    process.stderr.write('ERROR: '+error.message+'\n');
    process.exitCode=1;
  });
