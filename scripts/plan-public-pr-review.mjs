#!/usr/bin/env node
/**
 * Public-only, tokenless dependency-first REVIEW grouping, not a merge planner.
 * Reuse the independently checked two-sweep topology reader; never read private
 * task/ledger records or make write requests.
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectLivePublicTopology} from './inspect-pr-topology.mjs';

function validId(id) {
  return Number.isSafeInteger(id) && id > 0;
}
function fail() {
  throw new Error('Public PR review topology is incomplete, stale or contradictory.');
}
function sameJson(a,b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Requires the COMPLETE, stable, fail-closed output of inspectLivePublicTopology.
 * A wave is an order for HUMAN SOURCE REVIEW, not permission to integrate.
 * Only public PR numbers and aggregate counts are returned.
 */
export function planPublicPrReviewWaves(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report) ||
      report.schema_version !== '1-public-open-pr-topology' ||
      report.mode !== 'unauthenticated-get-only' ||
      report.inventory_stable !== true ||
      report.structurally_consistent !== true ||
      !Array.isArray(report.blockers) || report.blockers.length !== 0 ||
      report.file_conflicts_evaluated !== false ||
      report.merge_authorized !== false ||
      report.remote_writes !== 0 ||
      report.external_head_or_base_prs !== 0 ||
      !Array.isArray(report.detached_base_prs) || report.detached_base_prs.length !== 0 ||
      !Number.isSafeInteger(report.checked_open_prs) ||
      report.checked_open_prs < 1 || report.checked_open_prs > 200 ||
      !Number.isSafeInteger(report.draft_open_prs) ||
      report.draft_open_prs < 0 || report.draft_open_prs > report.checked_open_prs ||
      !Array.isArray(report.top_level_prs) ||
      !Array.isArray(report.parent_child_links) ||
      !Array.isArray(report.branching_points) ||
      !Number.isSafeInteger(report.linked_prs) ||
      !Number.isSafeInteger(report.branching_point_count) ||
      !Number.isSafeInteger(report.max_observed_chain_depth)) fail();

  const roots = new Set(), childParent = new Map(), nodes = new Set();
  for (const id of report.top_level_prs) {
    if (!validId(id) || roots.has(id)) fail();
    roots.add(id);
    nodes.add(id);
  }
  for (const link of report.parent_child_links) {
    if (!link || !validId(link.parent_pr) || !validId(link.child_pr) ||
        link.parent_pr === link.child_pr ||
        childParent.has(link.child_pr) || roots.has(link.child_pr)) fail();
    childParent.set(link.child_pr, link.parent_pr);
    nodes.add(link.parent_pr);
    nodes.add(link.child_pr);
  }
  if (roots.size === 0 || nodes.size !== report.checked_open_prs ||
      childParent.size !== report.linked_prs ||
      roots.size + childParent.size !== nodes.size) fail();

  const children = new Map();
  for (const [child,parent] of childParent) {
    if (!nodes.has(parent) || (!roots.has(parent) && !childParent.has(parent))) fail();
    const entries = children.get(parent) || [];
    entries.push(child);
    children.set(parent,entries);
  }
  const fanouts = [...children.entries()]
    .filter(([,ids]) => ids.length > 1)
    .map(([parent,ids]) => ({
      parent_pr:parent, child_prs:ids.sort((a,b)=>a-b)
    })).sort((a,b)=>a.parent_pr-b.parent_pr);
  const statedFanouts = report.branching_points.map(point => {
    if (!point || !validId(point.parent_pr) ||
        !Array.isArray(point.child_prs) || point.child_prs.length < 2 ||
        point.child_prs.some(id => !validId(id))) fail();
    return {parent_pr:point.parent_pr,child_prs:[...point.child_prs].sort((a,b)=>a-b)};
  }).sort((a,b)=>a.parent_pr-b.parent_pr);
  if (fanouts.length !== report.branching_point_count ||
      !sameJson(fanouts,statedFanouts)) fail();

  const pending = new Set(nodes), reviewed = new Set(), waves = [];
  while (pending.size) {
    const ready = [...pending].filter(id =>
      roots.has(id) || reviewed.has(childParent.get(id))
    ).sort((a,b)=>a-b);
    // All parents must be reviewed in an EARLIER wave; cycles cannot pass.
    if (ready.length === 0 || waves.length >= 200) fail();
    waves.push({review_wave:waves.length + 1, pr_numbers:ready});
    for (const id of ready) pending.delete(id);
    for (const id of ready) reviewed.add(id);
  }
  if (waves.length !== report.max_observed_chain_depth ||
      waves.reduce((n,w)=>n+w.pr_numbers.length,0)!==report.checked_open_prs) fail();

  return {
    schema_version:'1-public-manual-pr-review-waves',
    mode:'public-get-only-advisory',
    checked_open_prs:report.checked_open_prs,
    draft_prs_requiring_independent_review:report.draft_open_prs,
    dependency_review_waves:waves,
    sibling_fanout_review_points:fanouts,
    sibling_fanout_may_overlap_files:true,
    file_conflicts_evaluated:false,
    pr_ci_evidence_verified:false,
    private_ledger_verified:false,
    real_agent_execution_proven:false,
    merge_authorized:false,
    deployment_authorized:false,
    remote_writes:0,
    verdict:'human-review-required'
  };
}

export async function main(args=process.argv.slice(2),{
  inspect=inspectLivePublicTopology
}={}) {
  if (args.length===1 && args[0]==='--help') {
    process.stdout.write('GET-only manual PR review waves: node scripts/plan-public-pr-review.mjs\\n');
    return 0;
  }
  if (args.length || typeof inspect !== 'function')
    throw new Error('Public PR review command takes no arguments.');
  const plan = planPublicPrReviewWaves(await inspect());
  process.stdout.write(JSON.stringify(plan,null,2)+'\\n');
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code=>{process.exitCode=code;}).catch(()=>{
    // No raw GitHub response, private local path, branch or SHA in stderr.
    process.stderr.write('ERROR: Public PR review topology blocked or unavailable.\\n');
    process.exitCode=2;
  });
}
