import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const config=async(name)=>JSON.parse(await readFile(
  new URL('../config/'+name,import.meta.url),'utf8'));

test('public registry contains only explicitly public projects and public-safe fields',async()=>{
  const registry=await config('fleet.json');
  assert.equal(registry.status,'discovery_only');
  assert.ok(Array.isArray(registry.repos));
  assert.ok(registry.repos.length>0);
  const names=new Set();
  for(const repo of registry.repos) {
    assert.equal(repo.visibility,'public');
    assert.equal(repo.opt_in,'pending_owner_approval');
    assert.match(repo.full_name,/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i);
    assert.equal(names.has(repo.full_name.toLowerCase()),false);
    names.add(repo.full_name.toLowerCase());
    assert.deepEqual(Object.keys(repo).sort(),
      ['domain','entry_point','full_name','opt_in','visibility']);
  }
});

test('the public discovery registry cannot export any legacy nonpublic target names',async()=>{
  const registry=await config('fleet.json');
  const legacy=await config('fleet.private.json');
  const publicNames=new Set(registry.repos.map(r=>r.full_name.toLowerCase()));
  const nonpublic=legacy.active_repositories.filter(r=>r.visibility!=='public');
  for(const entry of nonpublic)
    assert.equal(publicNames.has(entry.full_name.toLowerCase()),false);
});

test('public discovery does not authorize automatic claims, deploys or merges',async()=>{
  const registry=await config('fleet.json');
  assert.equal(registry.coordinator_endpoint,null);
  assert.equal(registry.policies.automatic_claims,false);
  assert.equal(registry.policies.allow_automerge,false);
  assert.equal(registry.policies.allow_deploy,false);
  assert.equal(registry.policies.ready_task_source,'GitHub Issues (after manual triage)');
});
