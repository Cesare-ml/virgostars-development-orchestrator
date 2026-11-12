import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPilotConfig, loadPilotTasks} from '../src/registry.mjs';
import {resourceKey, validateTaskCatalog} from '../src/resources.mjs';

test('the second developer wave is scoped to exactly two approved tasks',async()=>{
 const config=await loadPilotConfig();
 const tasks=await loadPilotTasks();
 assert.equal(tasks.length,7);
 assert.doesNotThrow(()=>validateTaskCatalog(tasks));
 const initial=tasks.filter(t=>t.role==='reviewer');
 const wave2=tasks.filter(t=>t.role==='developer' && t.pilot_wave===2);
 assert.equal(initial.length,5);
 assert.ok(initial.every(t=>t.access==='read'));
 assert.equal(wave2.length,2);
 assert.ok(wave2.every(t=>t.status==='ready'&&t.access==='write'));
 assert.ok(wave2.every(t=>config.active_repositories.some(
   r=>r.full_name===t.repository&&r.pilot_enabled)));
 assert.notEqual(wave2[0].repository,wave2[1].repository);
});

test('developer tasks never grant whole-directory edits',async()=>{
 const tasks=await loadPilotTasks();
 const wave2=tasks.filter(t=>t.pilot_wave===2);
 const found=new Set();
 for(const task of wave2) {
   assert.equal(task.resource_scope.roots.length,task.scope.length);
   assert.ok(task.resource_scope.roots.every(root=>!root.endsWith('/')
     && !root.includes('*') && !root.includes('..')));
   const uniquePath=resourceKey(task.repository,task.resource_scope.id);
   assert.ok(!found.has(uniquePath));
   found.add(uniquePath);
   assert.ok(Number.isSafeInteger(task.upstream_pr)&&task.upstream_pr>0);
   assert.ok(task.upstream_branch.startsWith('feat/') ||
     task.upstream_branch.startsWith('agent/'));
 }
});

test('the approved pilot write paths are exact and not shared',async()=>{
 const tasks=await loadPilotTasks();
 const functionTask=tasks.find(t=>t.repository==='Cesare-ml/astrological-functions'&&t.issue===5);
 const chartsTask=tasks.find(t=>t.repository==='Cesare-ml/astrological-charts'&&t.issue===25);
 assert.deepEqual(functionTask.resource_scope.roots,[
  'src/ephemeris-provider.js','test/pilot-provider-consumer-smoke.test.mjs'
 ]);
 assert.deepEqual(chartsTask.resource_scope.roots,[
  'tests/pilot-axis-canvas.browser.test.mjs'
 ]);
 const identities=tasks.map(t=>t.repository+'#'+t.issue);
 assert.equal(new Set(identities).size,tasks.length);
});
