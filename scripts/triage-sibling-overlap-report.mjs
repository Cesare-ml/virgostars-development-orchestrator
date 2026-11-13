#!/usr/bin/env node
/**
 * Offline, read-only triage of a stable public sibling PR overlap report.
 * Does not fetch GitHub data, pick a PR, or authorize integration.
 */
import {lstatSync, readFileSync} from 'node:fs';
import {isAbsolute, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const MAX_PRS=24;
const MAX_BYTES=256*1024;
const SOURCE_SCHEMA='1-public-sibling-pr-overlap';

function requireTrue(condition, message) {
  if (!condition) throw new Error(message);
}
function validNumber(value) {
  return Number.isSafeInteger(value) && value>0 && value<=999999999;
}
function canonicalPair(a,b) {
  return a<b?a+':'+b:b+':'+a;
}

/**
 * A complete all-pairs inventory is mandatory: absent edges must not be
 * interpreted as non-overlapping. Components are review groups, not choices.
 */
export function summarizeSiblingOverlaps(report) {
  requireTrue(report && typeof report==='object' && !Array.isArray(report),
    'Invalid sibling report.');
  requireTrue(report.schema_version===SOURCE_SCHEMA &&
    report.mode==='public-get-only' &&
    report.live_snapshot_stable===true &&
    report.github_writes===0 &&
    report.merge_authorized===false &&
    report.pr_selection_authorized===false,
    'Report must be a stable, public, non-authorizing sibling audit.');
  const n=report.checked_pull_requests;
  const expected=n*(n-1)/2;
  requireTrue(Number.isSafeInteger(n) && n>=2 && n<=MAX_PRS &&
    Array.isArray(report.pairs) && report.pairs.length===expected &&
    report.pairs_compared===expected,
    'Incomplete or oversized all-pairs inventory.');

  const seenPairs=new Set();
  const participants=new Set();
  const adjacency=new Map();
  let overlapPairs=0, sharedPaths=0;
  for (const pair of report.pairs) {
    requireTrue(pair && typeof pair==='object' && !Array.isArray(pair) &&
      Array.isArray(pair.pull_requests) && pair.pull_requests.length===2,
      'Invalid sibling pair.');
    const [a,b]=pair.pull_requests;
    requireTrue(validNumber(a) && validNumber(b) && a!==b,
      'Invalid or repeated PR number.');
    requireTrue(Number.isSafeInteger(pair.overlapping_paths) &&
      pair.overlapping_paths>=0 && pair.overlapping_paths<=400 &&
      pair.potential_overlap===(pair.overlapping_paths>0),
      'Inconsistent overlap evidence.');
    const key=canonicalPair(a,b);
    requireTrue(!seenPairs.has(key),'Duplicate pair in sibling report.');
    seenPairs.add(key);
    participants.add(a); participants.add(b);
    if (!adjacency.has(a)) adjacency.set(a,new Set());
    if (!adjacency.has(b)) adjacency.set(b,new Set());
    sharedPaths+=pair.overlapping_paths;
    if (pair.overlapping_paths>0) {
      overlapPairs++;
      adjacency.get(a).add(b);
      adjacency.get(b).add(a);
    }
  }
  requireTrue(participants.size===n &&
    report.pairs_with_path_overlap===overlapPairs &&
    report.shared_path_references===sharedPaths,
    'Aggregate counts or complete participant inventory disagree.');
  const ids=[...participants].sort((a,b)=>a-b);
  const visited=new Set(), reviewGroups=[], isolated=[];
  for (const id of ids) {
    if (visited.has(id)) continue;
    const pending=[id], group=[];
    visited.add(id);
    while (pending.length>0) {
      const current=pending.pop();
      group.push(current);
      for (const next of adjacency.get(current)) {
        if (!visited.has(next)) {
          visited.add(next);
          pending.push(next);
        }
      }
    }
    group.sort((a,b)=>a-b);
    if (group.length===1) {
      isolated.push(group[0]);
      continue;
    }
    const members=new Set(group);
    const edges=report.pairs.filter(pair=>
      pair.overlapping_paths>0 &&
      members.has(pair.pull_requests[0]) &&
      members.has(pair.pull_requests[1])).length;
    reviewGroups.push({pull_requests:group, overlapping_pairs:edges});
  }
  reviewGroups.sort((a,b)=>a.pull_requests[0]-b.pull_requests[0]);
  return {
    schema_version:'1-public-sibling-triage',
    source_schema_version:SOURCE_SCHEMA,
    input_snapshot_stable:true,
    checked_pull_requests:n,
    pairs_checked:expected,
    overlapping_pairs:overlapPairs,
    isolated_pull_requests:isolated,
    overlapping_review_groups:reviewGroups,
    manual_overlap_review_required:reviewGroups.length>0,
    github_requests:0,
    github_writes:0,
    merge_authorized:false,
    pr_selection_authorized:false,
    note:'A connected review group is not a Git merge conflict or an instruction to merge, close, or choose any PR. Recheck current HEADs before manual decisions.'
  };
}

export function readLocalReport(path) {
  requireTrue(typeof path==='string' && isAbsolute(path),
    'Specify one absolute local JSON report path.');
  const stat=lstatSync(path);
  requireTrue(stat.isFile() && stat.size>0 && stat.size<=MAX_BYTES,
    'Report must be a bounded regular file, not a symlink.');
  return JSON.parse(readFileSync(path,'utf8'));
}

export function main(args=process.argv.slice(2)) {
  if (args.length===1 && args[0]==='--help') {
    process.stdout.write('Usage: node scripts/triage-sibling-overlap-report.mjs ABSOLUTE_REPORT.json\n');
    return 0;
  }
  requireTrue(args.length===1,'Specify exactly one local report path.');
  const summary=summarizeSiblingOverlaps(readLocalReport(args[0]));
  process.stdout.write(JSON.stringify(summary,null,2)+'\n');
  return summary.manual_overlap_review_required?2:0;
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { process.exitCode=main(); }
  catch (error) {
    process.stderr.write('ERROR: public sibling report is invalid, incomplete or inaccessible.\n');
    process.exitCode=1;
  }
}
