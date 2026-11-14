import {GitHubError} from './github.mjs';
import {claimNext} from './queue.mjs';
import {handoff,status,submissionKey,taskKey} from './claims.mjs';
import {resourceKey} from './resources.mjs';
import {submit} from './submissions.mjs';

// SIMULATION ONLY. No GitHub client, fetch, tokens, file reads or writes.
const ISSUE_REPOS=['example-synthetic/alpha-charts','example-synthetic/alpha-functions'];
const SESSIONS=[
  'chat-11111111-1111-4111-8111-111111111111',
  'codex-22222222-2222-4222-8222-222222222222',
  'chat-33333333-3333-4333-8333-333333333333'
];
const HASH=i=>i.toString(16).padStart(40,'0');
const copy=value=>structuredClone(value);

function ensure(ok,reason) {
  if(!ok)throw new Error('Offline two-agent rehearsal failed: '+reason);
}

function syntheticTasks() {
  return ISSUE_REPOS.map((repository,i)=>({
    repository,issue:101+i,status:'ready',role:'developer',
    title:'Synthetic independent developer smoke test',access:'write',pilot_wave:3,
    scope:['tests/alpha-smoke.test.mjs'],
    resource_scope:{id:'synthetic-smoke-'+i,roots:['tests/alpha-smoke.test.mjs']},
    upstream_pr:11+i,
    upstream_branch:'feature/synthetic-upstream-'+i
  }));
}

function syntheticConfig() {
  return {
    claim_store:{repo:'example-synthetic/private-coordination',branch:'coordination/claims'},
    active_repositories:ISSUE_REPOS.map(full_name=>({full_name,pilot_enabled:true}))
  };
}

/**
 * Minimal GitHub adapter enforcing Contents create-if-absent and blob-SHA
 * compare-and-swap behavior. Used to execute the real claim/queue/handoff/
 * submission code in memory; NEVER reused as a production backend.
 */
function makeSyntheticGitHub(tasks) {
  const files=new Map();
  const pullRequests=new Map();
  let sequence=0, failDeleteOnce=false, externalCalls=0;
  const key=(repo,n)=>repo+'#'+n;
  const addPr=(repo,pr,changedFiles=[])=>{
    const all=pullRequests.get(repo)||new Map();
    all.set(pr.number,{pr:copy(pr),files:copy(changedFiles)});
    pullRequests.set(repo,all);
  };
  const upstream=(task,i)=>({
    number:task.upstream_pr,state:'open',draft:true,changed_files:0,
    head:{ref:task.upstream_branch,sha:HASH(100+i),
      repo:{full_name:task.repository}},
    base:{ref:'main',sha:HASH(200+i),repo:{full_name:task.repository}}
  });
  tasks.forEach((task,i)=>addPr(task.repository,upstream(task,i)));
  const targetIssue=(repo,number)=>tasks.some(t=>t.repository===repo&&t.issue===number);
  const api={
    async getIssue(repo,number) {
      if(!targetIssue(repo,number))throw new Error('Unknown synthetic issue.');
      return {number,state:'open'};
    },
    async getClaim(_repo,path) {
      return files.has(path)?copy(files.get(path)):null;
    },
    async createClaim(_repo,path,_branch,data) {
      if(files.has(path))throw new GitHubError(422);
      files.set(path,{sha:HASH(++sequence),data:copy(data)});
    },
    async updateClaim(_repo,path,_branch,sha,data) {
      if(files.get(path)?.sha!==sha)throw new GitHubError(409);
      files.set(path,{sha:HASH(++sequence),data:copy(data)});
    },
    async deleteClaim(_repo,path,_branch,sha) {
      if(failDeleteOnce) {
        failDeleteOnce=false;
        throw new GitHubError(409);
      }
      if(files.get(path)?.sha!==sha)throw new GitHubError(409);
      files.delete(path);
    },
    async getPullRequest(repo,number) {
      const record=pullRequests.get(repo)?.get(number);
      if(!record)throw new Error('Unknown synthetic pull request.');
      return copy(record.pr);
    },
    async getPullRequestFiles(repo,number) {
      const record=pullRequests.get(repo)?.get(number);
      if(!record)throw new Error('Unknown synthetic changed-file list.');
      return copy(record.files);
    },
    async getOpenPullRequests(repo) {
      return [...(pullRequests.get(repo)?.values()||[])]
        .filter(entry=>entry.pr.state==='open')
        .map(entry=>copy(entry.pr));
    }
  };
  return {
    api,files,
    failReleaseOnce(){failDeleteOnce=true;},
    registerSyntheticDelivery(task,i){
      const number=21+i;
      const upstreamPr=pullRequests.get(task.repository).get(task.upstream_pr).pr;
      const head=HASH(300+i);
      addPr(task.repository,{
        number,state:'open',draft:true,changed_files:1,
        head:{ref:'agent/synthetic-'+i,sha:head,
          repo:{full_name:task.repository}},
        base:{ref:task.upstream_branch,sha:upstreamPr.head.sha,
          repo:{full_name:task.repository}}
      },[{filename:task.resource_scope.roots[0],status:'added'}]);
      return {number,head};
    },
    addCompetingDraft(task,deliveryNumber){
      const original=pullRequests.get(task.repository).get(deliveryNumber).pr;
      addPr(task.repository,{
        number:99,state:'open',draft:true,changed_files:1,
        head:{ref:'agent/competing-fixture',sha:HASH(999),
          repo:{full_name:task.repository}},
        base:copy(original.base)
      },[{filename:task.resource_scope.roots[0],status:'added'}]);
    },
    removeCompetingDraft(task){
      pullRequests.get(task.repository).delete(99);
    },
    count(prefix){
      return [...files.keys()].filter(path=>path.startsWith(prefix+'/')).length;
    },
    noteExternalCalls(){externalCalls++;},
    externalCalls(){return externalCalls;}
  };
}

/**
 * Rehearses 2 agents through real queue, claim, handoff, scope/collision
 * audits, submission and release functions. External PR creation and test
 * execution are NOT simulated as real-world effects; PR metadata is fixture.
 */
export async function runOfflineTwoAgentRehearsal() {
  const tasks=syntheticTasks(),config=syntheticConfig();
  const mock=makeSyntheticGitHub(tasks);
  const args=session=>({api:mock.api,config,tasks,session,role:'developer'});

  const claims=await Promise.all(SESSIONS.slice(0,2).map(session=>claimNext(args(session))));
  ensure(claims.every(x=>x.result==='acquired'),'both independent initial claims must succeed.');
  const claimedKeys=claims.map(x=>x.claim.target_repository+'#'+x.claim.issue_number);
  ensure(new Set(claimedKeys).size===2,'both sessions must own distinct tasks.');
  ensure(mock.count('claims')===2&&mock.count('resources')===2,
    'two live issue locks and resource locks are required.');

  const thirdBefore=await claimNext(args(SESSIONS[2]));
  ensure(thirdBefore.result==='no-task','third synthetic agent cannot steal a task.');

  const deliveries=[];
  for(let i=0;i<2;i++) {
    const claim=claims[i].claim;
    const task=tasks.find(t=>t.repository===claim.target_repository&&
      t.issue===claim.issue_number);
    ensure(!!task,'claimed task must belong to synthetic catalog.');
    const delivery=mock.registerSyntheticDelivery(task,tasks.indexOf(task));
    const saved=await handoff({
      api:mock.api,config,repo:task.repository,issue:task.issue,
      session:SESSIONS[i],branchName:'agent/offline-synthetic',
      headSha:delivery.head,
      summary:'Synthetic draft PR and scope evidence for local offline rehearsal.',
      now:()=> '2026-01-01T00:00:00.000Z'
    });
    ensure(saved.result==='handoff-saved','owner handoff must be persisted.');
    deliveries.push({task,session:SESSIONS[i],delivery});
  }

  // The first agent must be unable to submit while a second open PR touches
  // its exact allowed file. Retain ownership and lock for safe recovery.
  const first=deliveries[0],second=deliveries[1];
  mock.addCompetingDraft(first.task,first.delivery.number);
  let conflictRejected=false;
  try {
    await submit({
      api:mock.api,config,tasks,repo:first.task.repository,
      issue:first.task.issue,session:first.session,prNumber:first.delivery.number,
      confirm:true
    });
  } catch(e) {
    conflictRejected=/competing\/open PRs/.test(e.message);
  }
  ensure(conflictRejected,'conflicting draft PR must block delivery.');
  const afterConflict=await status({
    api:mock.api,config,repo:first.task.repository,issue:first.task.issue
  });
  ensure(afterConflict.status==='claimed'&&afterConflict.claim.session_id===first.session,
    'a blocked submission must preserve original ownership and lock.');
  mock.removeCompetingDraft(first.task);

  const delivered=await submit({
    api:mock.api,config,tasks,repo:first.task.repository,
    issue:first.task.issue,session:first.session,prNumber:first.delivery.number,
    confirm:true,now:()=> '2026-01-01T00:00:00.000Z'
  });
  ensure(delivered.result==='submitted','first submission after conflict recovery.');

  // Simulate a GitHub compare-and-swap conflict during release AFTER the
  // submitted marker is safely stored. The same owner must be able to retry.
  mock.failReleaseOnce();
  let interruptedReleaseRejected=false;
  try {
    await submit({
      api:mock.api,config,tasks,repo:second.task.repository,
      issue:second.task.issue,session:second.session,prNumber:second.delivery.number,
      confirm:true,now:()=> '2026-01-01T00:00:00.000Z'
    });
  } catch(e) {
    interruptedReleaseRejected=/Claim changed concurrently/.test(e.message);
  }
  ensure(interruptedReleaseRejected,'release race must fail without erasing the marker.');
  ensure(mock.files.has(submissionKey(second.task.repository,second.task.issue))&&
    mock.files.has(taskKey(second.task.repository,second.task.issue))&&
    mock.files.has(resourceKey(second.task.repository,second.task.resource_scope.id)),
    'interrupted release must retain the owner claim, resource and submitted marker.');

  const retried=await submit({
    api:mock.api,config,tasks,repo:second.task.repository,
    issue:second.task.issue,session:second.session,prNumber:second.delivery.number,
    confirm:true,now:()=> '2026-01-01T00:00:00.000Z'
  });
  ensure(retried.result==='submitted','original owner must finish retry safely.');
  ensure(mock.count('submissions')===2&&mock.count('claims')===0&&
    mock.count('resources')===0,'all submitted markers remain and all locks release.');

  const after=await claimNext(args(SESSIONS[2]));
  ensure(after.result==='no-task','submitted tasks cannot be reassigned.');
  ensure(mock.externalCalls()===0,'no external requests may occur.');

  return {
    schema_version:'1-offline-two-agent-rehearsal',
    mode:'synthetic-in-memory-only',
    github_requests:0,
    real_pull_requests_created:0,
    code_changes_performed:0,
    live_tests_executed:0,
    agents_started_in_parallel:2,
    independently_claimed_tasks:2,
    exclusive_issue_and_resource_locks_verified:true,
    third_agent_denied:true,
    competing_pr_submission_blocked:conflictRejected,
    original_owner_retained_on_conflict:true,
    competing_pr_recovery_submitted:true,
    interrupted_release_blocked:interruptedReleaseRejected,
    original_owner_retry_succeeded:true,
    submitted_markers:mock.count('submissions'),
    remaining_issue_claims:mock.count('claims'),
    remaining_resource_locks:mock.count('resources'),
    submitted_tasks_reoffered:false,
    real_private_ledger_verified:false,
    real_multi_agent_pilot_proven:false,
    result:'synthetic-rehearsal-pass'
  };
}
