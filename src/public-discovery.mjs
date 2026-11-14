import {readFile} from 'node:fs/promises';

const REPO=/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const PROJECT_KEYS=['domain','entry_point','full_name','opt_in','visibility'];
const REQUIRED_POLICIES={
  automatic_claims:false,
  allow_automerge:false,
  allow_deploy:false,
  outsider_contribution:'fork_pr_only'
};

const fail=reason=>{throw new Error('Public discovery is unavailable: '+reason);};
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exactKeys=(obj,keys)=>
  isObject(obj)&&Object.keys(obj).length===keys.length&&
  keys.every(key=>Object.hasOwn(obj,key));

/**
 * Only explicitly public project metadata may leave this boundary.
 * No legacy pilot file, remote API, GitHub token, task claim or submission
 * is required for discovery. Discovery is NOT permission to work on a repo.
 */
export function buildPublicDiscovery(registry) {
  if(!isObject(registry)||registry.schema_version!=='0.1-draft'||
     registry.status!=='discovery_only'||
     registry.coordinator_endpoint!==null)
    fail('catalog must remain discovery-only with no coordinator endpoint.');
  if(!isObject(registry.policies)||
     Object.entries(REQUIRED_POLICIES).some(([k,v])=>registry.policies[k]!==v))
    fail('unsafe contribution policy.');
  if(!Array.isArray(registry.repos)||registry.repos.length<1||
     registry.repos.length>25)
    fail('invalid repository list.');
  const names=new Set();
  const repositories=registry.repos.map(project=>{
    if(!exactKeys(project,PROJECT_KEYS)||
       typeof project.full_name!=='string'||
       !REPO.test(project.full_name) ||
       project.full_name.includes('..')||
       project.visibility!=='public' ||
       project.opt_in!=='pending_owner_approval'||
       project.entry_point!=='AGENTS.md' ||
       typeof project.domain!=='string' ||
       project.domain.length<2 || project.domain.length>120||
       !/^[A-Za-z0-9][A-Za-z0-9 .,/()+:-]*$/.test(project.domain))
      fail('invalid or unapproved public project entry.');
    const folded=project.full_name.toLowerCase();
    if(names.has(folded))fail('duplicate public repository.');
    names.add(folded);
    return {
      full_name:project.full_name,
      domain:project.domain,
      entry_point:project.entry_point,
      contribution_status:'pending_owner_approval'
    };
  });
  repositories.sort((a,b)=>a.full_name.localeCompare(b.full_name,'en'));
  return {
    schema_version:'1-public-discovery',
    mode:'read-only',
    repository_visibility:'public',
    owner_approval_required:true,
    write_claims_enabled:false,
    automatic_merge:false,
    automatic_deploy:false,
    contribution_method:'fork_pr_only_after_owner_approval',
    repositories
  };
}

export async function loadPublicDiscovery() {
  // Intentionally DO NOT read fleet.private.json or pilot-tasks.json.
  const catalog=JSON.parse(await readFile(
    new URL('../config/fleet.json',import.meta.url),'utf8'));
  return buildPublicDiscovery(catalog);
}
