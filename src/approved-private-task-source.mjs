import {loadOwnerTasks,loadHistoricalPilotTasks}
  from './owner-task-catalog.mjs';
import {readVerifiedPrivateGitHubCatalog}
  from './private-github-catalog-preflight.mjs';

const SHA1=/^[0-9a-f]{40}$/;
const SHA256=/^[0-9a-f]{64}$/;

const LOCAL=['VS_PRIVATE_TASKS_FILE','VS_PRIVATE_TASKS_APPROVED_SHA256'];
const REMOTE=['VS_OWNER_CATALOG_APPROVED_MAIN_SHA',
  'VS_OWNER_CATALOG_APPROVED_SHA256'];

function blocked() {
  throw new Error('Owner task source blocked: complete, mutually exclusive owner approval required.');
}

/**
 * The original seven submissions are a legacy *read-only* fallback, never
 * a replacement for missing approval. Mixed/incomplete modes are invalid.
 * This selector does not inspect a file or make any GitHub API request.
 */
export function selectOwnerTaskSource(env=process.env) {
  if(!env||typeof env!=='object'||Array.isArray(env))blocked();
  const set=key=>Object.hasOwn(env,key) && env[key]!==undefined;
  const local=LOCAL.some(set),remote=REMOTE.some(set);
  if(local&&remote)blocked();
  if(local) {
    if(!LOCAL.every(k=>set(k)&&typeof env[k]==='string'&&env[k].length>0) ||
       !SHA256.test(env.VS_PRIVATE_TASKS_APPROVED_SHA256))blocked();
    return {mode:'owner-local'};
  }
  if(remote) {
    if(!REMOTE.every(k=>set(k)&&typeof env[k]==='string') ||
       !SHA1.test(env.VS_OWNER_CATALOG_APPROVED_MAIN_SHA) ||
       !SHA256.test(env.VS_OWNER_CATALOG_APPROVED_SHA256))blocked();
    return {mode:'owner-private-github',
      approvedMainSha:env.VS_OWNER_CATALOG_APPROVED_MAIN_SHA,
      approvedSha256:env.VS_OWNER_CATALOG_APPROVED_SHA256};
  }
  return {mode:'historical-submitted-only'};
}

/**
 * Load the same runtime task objects from a pinned, independently approved
 * private GitHub main or the original owner-local SHA-verified source.
 * No private task content is ever logged by this helper.
 */
export async function loadApprovedPrivateTaskSource({
  api,config,env=process.env
}={}) {
  const selected=selectOwnerTaskSource(env);
  if(selected.mode==='owner-local') {
    const tasks=await loadOwnerTasks({
      file:env.VS_PRIVATE_TASKS_FILE,
      approvedSha256:env.VS_PRIVATE_TASKS_APPROVED_SHA256
    });
    return {mode:selected.mode,tasks};
  }
  if(selected.mode==='historical-submitted-only')
    return {mode:selected.mode,tasks:await loadHistoricalPilotTasks()};

  const repository=env.VS_PRIVATE_LEDGER_REPO;
  const acknowledgedRepository=env.VS_PRIVATE_LEDGER_APPROVED_REPO;
  if(config?.claim_store?.repo!==repository ||
     config?.claim_store?.branch!=='coordination/claims' ||
     config?.repository_visibility_required!=='private')
    blocked();
  const verified=await readVerifiedPrivateGitHubCatalog({
    api,repository,acknowledgedRepository,
    approvedMainSha:selected.approvedMainSha,
    approvedSha256:selected.approvedSha256,
    legacyTasks:await loadHistoricalPilotTasks()
  });
  return {mode:selected.mode,tasks:verified.tasks,
    approvedMainSha:selected.approvedMainSha};
}

/**
 * Remote mode only: check the approved PRIVATE main ref immediately before
 * EACH GitHub Contents mutation. Layer this on top of the existing
 * per-operation PRIVATE ledger visibility guard. GitHub cannot atomically
 * check two branches and commit the lock; stop on ambiguity.
 */
export function guardPinnedOwnerCatalogWrites({
  api,refApi,repository,approvedMainSha
}) {
  if(!SHA1.test(approvedMainSha||'') ||
     typeof repository!=='string'||!repository ||
     typeof refApi?.getOwnerCatalogRef!=='function')
    blocked();
  const guarded={...api};
  for(const method of ['createClaim','updateClaim','deleteClaim']) {
    if(typeof api?.[method]!=='function')blocked();
    guarded[method]=async (...args)=>{
      if(args[0]!==repository)blocked();
      const ref=await refApi.getOwnerCatalogRef(repository);
      if(ref?.object?.type!=='commit'||
         ref.object.sha!==approvedMainSha)blocked();
      return api[method](...args);
    };
  }
  return guarded;
}
