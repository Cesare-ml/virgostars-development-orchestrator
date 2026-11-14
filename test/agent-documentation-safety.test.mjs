import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('agent instructions route every agent to the runbook and protect the legacy ledger',async()=>{
  const agents=await read('AGENTS.md');
  assert.match(agents,/follows \[`AGENT_START\.md`\]/);
  assert.match(agents,/`coordination\/claims` branch is read-only history/);
  assert.match(agents,/never reassign the seven historical submissions/);
  assert.doesNotMatch(agents,/branch of this repository at `claims\//);
  const runbook=await read('AGENT_START.md');
  assert.match(runbook,/Never write to the legacy `coordination\/claims` branch/);
  assert.match(runbook,/never update or delete/);
});

test('legacy operator guides identify historical tasks and reject public ledger writes',async()=>{
  for(const path of ['docs/legacy/CLI_PRIVATE_PILOT.md','docs/legacy/PRIVATE_PILOT.md']){
    const doc=await read(path);
    assert.match(doc,/historical|Historical/i);
    assert.match(doc,/PRIVATE/);
    assert.match(doc,/PUBLIC/);
    assert.match(doc,/MVP_ACTIVATION\.md/);
    assert.match(doc,/(?:never|forbidden|not authorized|do not).*?(?:public|PUBLIC)/is);
  }
});

test('current alpha guide distinguishes merged CLI from private-ledger activation',async()=>{
  const guide=await read('docs/legacy/FIRST_OWNER_ALPHA.md');
  assert.match(guide,/merged into `main`/);
  assert.match(guide,/no independent PRIVATE destination/i);
  assert.match(guide,/verify-private-activation/);
  const activation=await read('docs/legacy/MVP_ACTIVATION.md');
  assert.match(activation,/PRIVATE/);
  assert.match(activation,/export-verified-ledger/);
  assert.match(activation,/plan-ledger-copy/);
});
