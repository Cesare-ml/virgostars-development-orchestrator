import {GitHubError} from './github.mjs';
import {claimNext} from './queue.mjs';
import {handoff,submissionKey,taskKey} from './claims.mjs';
import {resourceKey} from './resources.mjs';
import {submit} from './submissions.mjs';

// Entirely synthetic. Real GitHub transport, credentials, files and production
// project identifiers MUST NOT be used by this offline scalability test.
const REPOS=Object.freeze([
  'example-synthetic/charts','example-synthetic/functions',
  'example-synthetic/ephemeris','example-synthetic/events',
  'example-synthetic/desktop'
]);
const LEDGER='example-synthetic/private-ledger';
const BRANCH='coordination/claims';
const HASH=n=>n.toString(16).padStart(40,'0');
const copy=value=>structuredClone(value);
const session=i=>'chat-'+i.toString(16).padStart(8,'0')+
  '-0000-4000-8000-'+i.toString(16).padStart(12,'0');

function expect(ok,reason) {
  if(!ok)throw new Error('Offline fleet stress failed: '+reason);
}

export function validateFleetSize(value) {
  if(!Number.isSafeInteger(value)||value<2||value>40)
    throw new Error('Offline fleet size must be an integer between 2 and 40.');
  return value;
}

/** Batch sizes are a bounded, synthetic arrival schedule (not timers). */
export function validateArrivalBatches(batches,agents) {
  validateFleetSize(agents);
  if(batches===null || batches===undefined) return [agents];
  if(!Array.isArray(batches)||batches.length<2||batches.length>40||
    batches.some(size=>!Number.isSafeInteger(size)||size<1||size>40))
    throw new Error('Arrival batches must be 2..40 positive integer sizes.');
  if(batches.reduce((sum,size)=>sum+size,0)!==agents)
    throw new Error('Arrival batch sizes must sum to the total agent count.');
  return [...batches];
}

/** Only a completed, non-final synthetic wave may trigger a state reopen. */
export function validateReopenAfterWave(value,batches) {
  if(value===null||value===undefined) return null;
  if(!Number.isSafeInteger(value)||value<1||value>=batches.length)
    throw new Error('Reopen-after-wave must be a wave index from 1 to batch count minus 1.');
  return value;
}

function makeTasks(n) {
  return Array.from({length:n},(_,i)=>{
    const repository=REPOS[i%REPOS.length];
    const file='tests/synthetic-fleet-'+i+'.test.mjs';
    return {
      repository,issue:2001+i,title:'Synthetic development assignment',
      status:'ready',role:'developer',access:'write',pilot_wave:3,
      scope:[file],
      resource_scope:{id:'fleet-'+i,roots:[file]},
      upstream_pr:501+i,upstream_branch:'feature/synthetic-base-'+i
    };
  });
}

function inMemoryAdapter(tasks,snapshot=null) {
  // Snapshot clones represent synthetic persisted GitHub Contents records.
  // Building a fresh adapter discards client state but preserves the mock ledger.
  const ledger=new Map(snapshot?copy(snapshot.records):[]);
  const pulls=new Map();
  let seq=snapshot?.seq??0;
  let attemptedWrites=snapshot?.attemptedWrites??0;
  const key=(repo,number)=>repo+'#'+number;
  const addPR=(repo,pr,files)=>{
    pulls.set(key(repo,pr.number),{pr:copy(pr),files:copy(files)});
  };
  for(let i=0;i<tasks.length;i++) {
    const task=tasks[i];
    addPR(task.repository,{
      number:task.upstream_pr,state:'open',draft:true,
      changed_files:0,
      head:{ref:task.upstream_branch,sha:HASH(101+i),
        repo:{full_name:task.repository}},
      base:{ref:'main',sha:HASH(201+i),repo:{full_name:task.repository}}
    },[]);
  }
  const checkLedger=(repo,branch)=>{
    if(repo!==LEDGER||branch!==BRANCH)
      throw new Error('Invalid synthetic ledger target.');
  };
  const api={
    async getIssue(repo,number){
      expect(tasks.some(t=>t.repository===repo&&t.issue===number),
        'unexpected synthetic issue');
      return {number,state:'open'};
    },
    async getClaim(repo,path,branch){
      checkLedger(repo,branch);
      return ledger.has(path)?copy(ledger.get(path)):null;
    },
    async createClaim(repo,path,branch,data){
      checkLedger(repo,branch);attemptedWrites++;
      if(ledger.has(path))throw new GitHubError(422);
      ledger.set(path,{sha:HASH(++seq),data:copy(data)});
    },
    async updateClaim(repo,path,branch,sha,data){
      checkLedger(repo,branch);attemptedWrites++;
      if(ledger.get(path)?.sha!==sha)throw new GitHubError(409);
      ledger.set(path,{sha:HASH(++seq),data:copy(data)});
    },
    async deleteClaim(repo,path,branch,sha){
      checkLedger(repo,branch);attemptedWrites++;
      if(ledger.get(path)?.sha!==sha)throw new GitHubError(409);
      ledger.delete(path);
    },
    async getPullRequest(repo,number){
      const result=pulls.get(key(repo,number));
      if(!result)throw new Error('Unknown synthetic PR.');
      return copy(result.pr);
    },
    async getPullRequestFiles(repo,number){
      const result=pulls.get(key(repo,number));
      if(!result)throw new Error('Unknown synthetic PR file list.');
      return copy(result.files);
    },
    async getOpenPullRequests(repo){
      return [...pulls.values()]
        .filter(({pr})=>pr.state==='open'&&pr.head.repo.full_name===repo)
        .map(({pr})=>copy(pr));
    }
  };
  function registerDelivery(task){
    const i=task.issue-2001;
    const upstream=pulls.get(key(task.repository,task.upstream_pr)).pr;
    const delivery={
      number:1001+i,state:'open',draft:true,changed_files:1,
      head:{ref:'agent/synthetic-'+i,sha:HASH(301+i),
        repo:{full_name:task.repository}},
      base:{ref:task.upstream_branch,sha:upstream.head.sha,
        repo:{full_name:task.repository}}
    };
    addPR(task.repository,delivery,[
      {filename:task.resource_scope.roots[0],status:'added'}
    ]);
    return {number:delivery.number,headSha:delivery.head.sha};
  }
  function count(prefix) {
    return [...ledger.keys()].filter(x=>x.startsWith(prefix+'/')).length;
  }
  const reopen=()=>inMemoryAdapter(tasks,{
    records:[...ledger.entries()].map(([path,record])=>[path,copy(record)]),
    seq,attemptedWrites
  });
  return {api,registerDelivery,ledger,count,reopen,writes:()=>attemptedWrites};
}

/**
 * Stress only the actual cooperative claim/queue/handoff/PR audit/submit
 * functions, against a single-event-loop memory adapter. NO remote GitHub
 * atomicity or concurrent browser session guarantees are implied.
 */
export async function runOfflineFleetStress({agents=40,batches=null,reopenAfterWave=null}={}) {
  const n=validateFleetSize(agents);
  const arrivalBatches=validateArrivalBatches(batches,n);
  const reopenIndex=validateReopenAfterWave(reopenAfterWave,arrivalBatches);
  const tasks=makeTasks(n);
  let mock=inMemoryAdapter(tasks);
  const config={
    claim_store:{repo:LEDGER,branch:BRANCH},
    active_repositories:REPOS.map(full_name=>({
      full_name,pilot_enabled:true
    }))
  };
  const args=id=>({api:mock.api,config,tasks,session:session(id),
    role:'developer'});

  // Each batch starts while all earlier batches still own their claims.
  // Every session uses the real claim-next code against the SAME ledger.
  const attempts=[];
  let nextSession=1;
  let earlierResumes=0;
  let reopenedSessionResumes=0;
  for(const [waveIndex,size] of arrivalBatches.entries()) {
    const batch=await Promise.all(Array.from({length:size},(_,i)=>
      claimNext(args(nextSession+i))));
    nextSession+=size;
    expect(batch.every(result=>result.result==='acquired'),
      'a batch failed to acquire its independent synthetic tasks.');
    const earlier=[...attempts];
    attempts.push(...batch);

    expect(mock.count('claims')===attempts.length &&
      mock.count('resources')===attempts.length,
    'later batch changed the expected count of live locks.');
    if(earlier.length) {
      // Resuming a chat must return its ORIGINAL assignment, not a new one.
      const resumed=await Promise.all(earlier.map(result=>claimNext({
        api:mock.api,config,tasks,session:result.claim.session_id,
        role:'developer'
      })));
      expect(resumed.every((result,i)=>result.result==='already-owned' &&
        result.claim.session_id===earlier[i].claim.session_id &&
        result.claim.target_repository===earlier[i].claim.target_repository &&
        result.claim.issue_number===earlier[i].claim.issue_number &&
        result.claim.resource_scope_id===earlier[i].claim.resource_scope_id),
      'a new batch displaced or reassigned an earlier session.');
      earlierResumes+=resumed.length;
      expect(mock.count('claims')===attempts.length &&
        mock.count('resources')===attempts.length,
      'resuming earlier sessions must not acquire extra locks.');
    }
    if(reopenIndex===waveIndex+1) {
      const previous=mock;
      const countBefore=previous.count('claims');
      const resourceCountBefore=previous.count('resources');
      mock=previous.reopen();
      expect(mock!==previous && mock.api!==previous.api,
        'new synthetic client must not reuse the original adapter.');
      expect(mock.count('claims')===countBefore &&
        mock.count('resources')===resourceCountBefore &&
        mock.count('submissions')===0,
        'simulated reopening lost claims, resources or marker state.');
      // Recovered sessions have no client object from the previous wave;
      // they supply only the original session ID to a fresh API adapter.
      const recovered=await Promise.all(attempts.map(r=>claimNext({
        api:mock.api,config,tasks,session:r.claim.session_id,
        role:'developer'
      })));
      expect(recovered.every((r,i)=>r.result==='already-owned' &&
        r.claim.session_id===attempts[i].claim.session_id &&
        r.claim.target_repository===attempts[i].claim.target_repository &&
        r.claim.issue_number===attempts[i].claim.issue_number &&
        r.claim.resource_scope_id===attempts[i].claim.resource_scope_id),
        'reopened synthetic client changed session ownership.');
      reopenedSessionResumes=recovered.length;
      expect(mock.count('claims')===countBefore &&
        mock.count('resources')===resourceCountBefore,
        'reopened session recovery created duplicate locks.');
    }
  }
  expect(attempts.every(r=>r.result==='acquired'),
    'all assigned synthetic sessions must acquire exactly one task.');
  const owners=attempts.map(r=>r.claim);
  expect(new Set(owners.map(o=>o.target_repository+'#'+o.issue_number)).size===n,
    'a task was claimed twice.');
  expect(new Set(owners.map(o=>o.session_id)).size===n,
    'a session acquired more than one task.');
  expect(new Set(owners.map(o=>
    o.target_repository+'#'+o.resource_scope_id)).size===n,
    'two writers share one resource partition.');
  expect(mock.count('claims')===n&&mock.count('resources')===n,
    'issue and resource lock counts mismatch.');

  const excess=await Promise.all(Array.from({length:3},(_,i)=>
    claimNext(args(n+i+1))));
  expect(excess.every(x=>x.result==='no-task'),
    'over-capacity contenders must receive no-task.');

  const deliveries=await Promise.all(owners.map(async o=>{
    const task=tasks.find(t=>t.repository===o.target_repository&&
      t.issue===o.issue_number);
    expect(!!task,'cannot resolve claimed synthetic task.');
    const delivery=mock.registerDelivery(task);
    const result=await handoff({
      api:mock.api,config,repo:task.repository,issue:task.issue,
      session:o.session_id,
      summary:'Offline synthetic handoff and draft PR evidence only.',
      branchName:'agent/offline-fleet',
      headSha:delivery.headSha,
      now:()=> '2026-01-01T00:00:00.000Z'
    });
    expect(result.result==='handoff-saved','handoff not saved.');
    return {task,session:o.session_id,delivery};
  }));

  const submitted=await Promise.all(deliveries.map(async d=>
    submit({
      api:mock.api,config,tasks,
      repo:d.task.repository,issue:d.task.issue,session:d.session,
      prNumber:d.delivery.number,confirm:true,
      now:()=> '2026-01-01T00:00:00.000Z'
    })
  ));
  expect(submitted.every(x=>x.result==='submitted'),
    'not all synthetic submissions completed.');
  expect(mock.count('submissions')===n,
    'missing or duplicated submitted markers.');
  expect(mock.count('claims')===0&&mock.count('resources')===0,
    'locks remain after successful synthetic delivery.');
  for(const t of tasks) {
    expect(mock.ledger.has(submissionKey(t.repository,t.issue)),
      'synthetic task completion marker lost.');
    expect(!mock.ledger.has(taskKey(t.repository,t.issue)),
      'synthetic issue lock remains.');
    expect(!mock.ledger.has(resourceKey(t.repository,t.resource_scope.id)),
      'synthetic resource lock remains.');
  }
  const reoffer=await Promise.all(Array.from({length:3},(_,i)=>
    claimNext(args(n+i+4))));
  expect(reoffer.every(x=>x.result==='no-task'),
    'synthetic submitted tasks were incorrectly reoffered.');

  return {
    schema_version:'1-offline-fleet-stress',
    mode:'synthetic-single-process-only',
    requested_agents:n,
    arrival_batch_sizes:arrivalBatches,
    adapter_reopened_after_wave:reopenIndex,
    reopened_session_resumes_verified:reopenedSessionResumes,
    earlier_session_resumes_verified:earlierResumes,
    earlier_claims_preserved:true,
    simulated_repositories:REPOS.length,
    unique_claims:n,
    unique_resource_locks:n,
    excess_contenders_denied:excess.length,
    synthetic_stacked_pr_submissions:n,
    submitted_markers:n,
    remaining_issue_claims:mock.count('claims'),
    remaining_resource_locks:mock.count('resources'),
    completed_tasks_reoffered:false,
    synthetic_ledger_mutations:mock.writes(),
    real_github_requests:0,
    real_private_ledger_verified:false,
    real_multi_chat_concurrency_proven:false,
    automatic_merges_or_deploys:0,
    verdict:'synthetic-stress-pass'
  };
}
