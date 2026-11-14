import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOwnerTaskCatalog, loadHistoricalPilotTasks,
  OWNER_SELF_REPOSITORY
} from '../src/owner-task-catalog.mjs';
import {loadPilotConfig} from '../src/registry.mjs';

const SELF='Cesare-ml/virgostars-development-orchestrator';
const CHARTS='Cesare-ml/astrological-charts';
const task=(repository,issue,root,id)=>({
  repository,issue,status:'ready',role:'developer',access:'write',
  pilot_wave:3,title:'Owner-approved independent bounded test',
  scope:[root],resource_scope:{id,roots:[root]},
  upstream_pr:133,upstream_branch:'feat/synthetic-reviewed-upstream'
});
const catalog=tasks=>({
  schema_version:'1-owner-task-catalog',
  status:'owner-curated-local',tasks
});

test('historical first-five repositories stay eligible and public source joins owner fleet',async()=>{
  const legacy=await loadHistoricalPilotTasks();
  assert.equal(legacy.length,7);
  const config=await loadPilotConfig({
    repository:undefined,acknowledgedRepository:undefined
  });
  assert.equal(OWNER_SELF_REPOSITORY,SELF);
  assert.equal(config.status,'PRIVATE_PILOT_NO_PUBLIC_ONBOARDING');
  assert.equal(config.claim_store.repo,SELF);
  assert.equal(config.repository_visibility_required,'private');
  assert.equal(config.active_repositories.length,6);
  const enabled=config.active_repositories.filter(x=>x.pilot_enabled);
  assert.equal(enabled.length,6);
  assert.equal(enabled.filter(x=>x.full_name===SELF && x.visibility==='public').length,1);
  for(const old of legacy) {
    assert.ok(enabled.some(x=>x.full_name===old.repository));
  }
});

test('owner can curate two independent developer tasks including orchestrator itself',async()=>{
  const legacy=await loadHistoricalPilotTasks();
  const tasks=[
    task(SELF,40001,'test/new-self-only-pilot.test.mjs','self-test-pilot'),
    task(CHARTS,40002,'tests/new-chart-only-pilot.test.mjs','chart-test-pilot')
  ];
  assert.deepEqual(validateOwnerTaskCatalog(catalog(tasks),legacy),tasks);
});

test('two distinct orchestrator partitions work if their allowed paths do not overlap',async()=>{
  const legacy=await loadHistoricalPilotTasks();
  const tasks=[
    task(SELF,40001,'test/agent-alpha-a.test.mjs','alpha-partition-a'),
    task(SELF,40002,'test/agent-alpha-b.test.mjs','alpha-partition-b')
  ];
  assert.deepEqual(validateOwnerTaskCatalog(catalog(tasks),legacy),tasks);
  tasks[1].resource_scope.roots=['test/agent-alpha-a.test.mjs'];
  assert.throws(()=>validateOwnerTaskCatalog(catalog(tasks),legacy),
    /invalid or overlapping/);
});

test('reject case-only repository aliases and arbitrary unlisted repos',async()=>{
  const legacy=await loadHistoricalPilotTasks();
  for(const altered of [SELF.toUpperCase(),'someone/other']) {
    const tasks=[task(altered,40001,'test/new-self-only.test.mjs','self-pilot')];
    assert.throws(()=>validateOwnerTaskCatalog(catalog(tasks),legacy),
      /Owner task catalog blocked/);
  }
});

test('historic seven issue keys still cannot be replayed after self onboarding',async()=>{
  const legacy=await loadHistoricalPilotTasks();
  const old=legacy.find(x=>x.repository===CHARTS);
  const tasks=[task(old.repository,old.issue,'tests/new-owner.test.mjs','new-owner')];
  assert.throws(()=>validateOwnerTaskCatalog(catalog(tasks),legacy),
    /may not reuse/);
});

test('self writing tasks still need explicit reviewed upstream PR and partition',async()=>{
  const legacy=await loadHistoricalPilotTasks();
  for(const key of ['upstream_pr','upstream_branch','resource_scope']) {
    const proposed=task(SELF,40001,'test/new-self-only.test.mjs','self-pilot');
    delete proposed[key];
    assert.throws(()=>validateOwnerTaskCatalog(catalog([proposed]),legacy),
      /write tasks require/);
  }
});
