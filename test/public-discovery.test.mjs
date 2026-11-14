import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildPublicDiscovery,loadPublicDiscovery} from '../src/public-discovery.mjs';

const path=(name)=>new URL('../config/'+name,import.meta.url);
const file=async name=>JSON.parse(await readFile(path(name),'utf8'));
const clone=x=>structuredClone(x);

test('public discovery is a strict owner-approval-required read-only projection',async()=>{
  const source=await file('fleet.json');
  const view=buildPublicDiscovery(source);
  assert.equal(view.schema_version,'1-public-discovery');
  assert.equal(view.repository_visibility,'public');
  assert.equal(view.mode,'read-only');
  assert.equal(view.owner_approval_required,true);
  assert.equal(view.write_claims_enabled,false);
  assert.equal(view.automatic_merge,false);
  assert.equal(view.automatic_deploy,false);
  assert.equal(view.contribution_method,'fork_pr_only_after_owner_approval');
  assert.equal(view.repositories.length,source.repos.length);
  assert.deepEqual(view,await loadPublicDiscovery());
  for(const project of view.repositories)
    assert.deepEqual(Object.keys(project).sort(),
      ['contribution_status','domain','entry_point','full_name']);
});

test('no nonpublic legacy pilot projects appear in public discovery',async()=>{
  const view=await loadPublicDiscovery();
  const old=await file('fleet.private.json');
  const entries=new Set(view.repositories.map(x=>x.full_name.toLowerCase()));
  for(const r of old.active_repositories.filter(x=>x.visibility!=='public'))
    assert.equal(entries.has(r.full_name.toLowerCase()),false);
  const json=JSON.stringify(view);
  assert.doesNotMatch(json,/session_id|resource_scope|submission|issue_number|GITHUB_TOKEN/);
});

test('unexpected project keys, nonpublic visibility and unapproved enrollment fail closed',async()=>{
  const source=await file('fleet.json');
  for(const changed of [
    {...source.repos[0],visibility:'private'},
    {...source.repos[0],opt_in:'approved'},
    {...source.repos[0],token:'fake-secret'},
    {...source.repos[0],entry_point:'../secrets.json'},
    {...source.repos[0],domain:'Public\nsecret'},
    {...source.repos[0],full_name:'../other'}
  ]) {
    const catalog=clone(source);
    catalog.repos[0]=changed;
    assert.throws(()=>buildPublicDiscovery(catalog),/Public discovery is unavailable/);
  }
});

test('duplicate names ignoring case and unbounded catalogs are rejected',async()=>{
  const source=await file('fleet.json');
  const dup=clone(source);
  dup.repos.push({...dup.repos[0],full_name:dup.repos[0].full_name.toUpperCase()});
  assert.throws(()=>buildPublicDiscovery(dup),/duplicate public repository/);
  const none=clone(source);none.repos=[];
  assert.throws(()=>buildPublicDiscovery(none),/invalid repository list/);
  const many=clone(source);many.repos=Array.from({length:26},(_,i)=>({
    ...many.repos[0],full_name:'valid/example-'+i
  }));
  assert.throws(()=>buildPublicDiscovery(many),/invalid repository list/);
});

test('automatic claims, deploys, merges or a public coordinator endpoint block discovery',async()=>{
  const source=await file('fleet.json');
  for(const [key,value] of [
    ['automatic_claims',true],['allow_automerge',true],
    ['allow_deploy',true],['outsider_contribution','direct_push']
  ]) {
    const c=clone(source);c.policies[key]=value;
    assert.throws(()=>buildPublicDiscovery(c),/unsafe contribution policy/);
  }
  const endpoint=clone(source);endpoint.coordinator_endpoint='https://example.invalid/api';
  assert.throws(()=>buildPublicDiscovery(endpoint),/discovery-only/);
});

test('the public CLI works with no GitHub token and does not expose private state',async()=>{
  const script=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};delete env.GITHUB_TOKEN;delete env.GH_TOKEN;
  const result=spawnSync(process.execPath,[script,'public-discover'],{
    encoding:'utf8',env,timeout:15000
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stderr,'');
  const output=JSON.parse(result.stdout);
  assert.deepEqual(output,await loadPublicDiscovery());
  assert.equal(output.write_claims_enabled,false);
  assert.doesNotMatch(result.stdout,/GITHUB_TOKEN|PRIVATE_PILOT|claims\/|submissions\//);
});

test('public mode refuses flags and does not fall into authenticated legacy commands',async()=>{
  const script=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};delete env.GITHUB_TOKEN;
  const result=spawnSync(process.execPath,[script,'public-discover','--confirm'],{
    encoding:'utf8',env,timeout:15000
  });
  assert.equal(result.status,1);
  assert.match(result.stderr,/Public-discover takes no arguments/);
  assert.doesNotMatch(result.stderr,/GITHUB_TOKEN is required/);
});

test('top-level catalog metadata, unexpected roles and hidden private fields fail closed',async()=>{
  const source=await file('fleet.json');
  const cases=[
    c=>{c.internal_tasks=[{repo:'private/example'}];},
    c=>{c.private_repos=['private/target'];},
    c=>{c.visibility_note='Unexpected alternate enrollment note';},
    c=>{c.roles.push('owner');},
    c=>{c.roles[0]='owner';},
    c=>{c.roles[0]=c.roles[1];},
    c=>{delete c.visibility_note;},
    c=>{delete c.policies;}
  ];
  for(const change of cases) {
    const catalog=clone(source);
    change(catalog);
    assert.throws(()=>buildPublicDiscovery(catalog),/Public discovery is unavailable/);
  }
  // The role declaration is a set; harmless ordering changes do not alter policy.
  const reordered=clone(source);
  reordered.roles.reverse();
  assert.deepEqual(buildPublicDiscovery(reordered),buildPublicDiscovery(source));
});

test('unrecognized or drifted public policy fields fail closed before projection',async()=>{
  const source=await file('fleet.json');
  const changes=[
    c=>{c.policies.allow_direct_push=true;},
    c=>{c.policies.allow_github_actions=false;},
    c=>{c.policies.ready_task_source='Private agent queue';},
    c=>{c.policies.automatic_claims='false';},
    c=>{c.policies.outsider_contribution='fork_pr_only';delete c.policies.allow_automerge;},
    c=>{c.policies=null;}
  ];
  for(const change of changes) {
    const catalog=clone(source);
    change(catalog);
    assert.throws(()=>buildPublicDiscovery(catalog),/Public discovery is unavailable/);
  }
});
