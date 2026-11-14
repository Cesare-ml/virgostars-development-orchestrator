import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadHistoricalPilotTasks,validateOwnerTaskCatalog} from '../src/owner-task-catalog.mjs';

const SELF='Cesare-ml/virgostars-development-orchestrator';
const EVENT='Cesare-ml/VirgoStars-Event-Ephemeris';

function writer(repository,issue,id,path,pr,base) {
  return {
    repository,issue,status:'ready',role:'developer',access:'write',
    pilot_wave:3,title:'Synthetic isolated regression task',
    scope:[path],
    resource_scope:{id,roots:[path]},
    upstream_pr:pr,upstream_branch:base,
    instructions:'Only add the exact scoped test file on a new stacked draft PR.'
  };
}
const catalog=tasks=>({
  schema_version:'1-owner-task-catalog',status:'owner-curated-local',tasks
});

test('owner pilot config explicitly enables exactly the five legacy targets and public coordinator',async()=>{
  const config=JSON.parse(await readFile(
    new URL('../config/fleet.private.json',import.meta.url),'utf8'));
  const repos=config.active_repositories.map(x=>x.full_name);
  assert.equal(repos.length,6);
  assert.equal(new Set(repos.map(x=>x.toLowerCase())).size,6);
  assert.equal(repos.filter(x=>x===SELF).length,1);
  assert.ok(config.active_repositories.every(x=>x.pilot_enabled===true));
  // A public DEVELOPMENT target must never become the owner-only claim store.
  assert.equal(config.repository_visibility_required,'private');
  assert.equal(config.claim_store.branch,'coordination/claims');
  assert.equal(config.claim_store.repo,SELF);
});

test('owner-reviewed self and Event writer tasks satisfy the curated allowlist',async()=>{
  const historical=await loadHistoricalPilotTasks();
  assert.equal(historical.length,7);
  const tasks=[
    writer(SELF,136,'self-chatgpt-resume','test/chatgpt-turn-resume.test.mjs',
      126,'feat/offline-two-chat-acceptance-20261114'),
    writer(EVENT,13,'event-chatgpt-utc','python/tests/test_chatgpt_utc_boundaries.py',
      5,'feat/p0-2-rust-workspace')
  ];
  assert.deepEqual(validateOwnerTaskCatalog(catalog(tasks),historical),tasks);
  assert.equal(tasks.some(task=>historical.some(old=>
    old.repository.toLowerCase()===task.repository.toLowerCase()&&old.issue===task.issue)),false);
});

test('allowing the self target does not open the pilot to arbitrary repositories',async()=>{
  const historical=await loadHistoricalPilotTasks();
  const task=writer('somebody/unapproved-project',901,'unknown-new-writer',
    'tests/unapproved.test.mjs',8,'feature/unreviewed');
  assert.throws(()=>validateOwnerTaskCatalog(catalog([task]),historical),
    /outside the approved first fleet/);
});

test('historically submitted issues remain forbidden after the fleet expands',async()=>{
  const historical=await loadHistoricalPilotTasks();
  const old=historical.find(x=>x.repository===EVENT);
  assert.ok(old);
  const task=writer(EVENT,old.issue,'old-event-task','tests/new-event.test.mjs',
    5,'feat/p0-2-rust-workspace');
  assert.throws(()=>validateOwnerTaskCatalog(catalog([task]),historical),
    /may not reuse/);
});
