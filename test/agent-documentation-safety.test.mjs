import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('agent instructions prohibit new operational claims on the public repository',async()=>{
  const agents=await read('AGENTS.md');
  assert.match(agents,/Mandatory safety policy \(2026-11-14\)/);
  assert.match(agents,/separate GitHub PRIVATE repository/);
  assert.match(agents,/Never use this public source repository for claims/);
  assert.match(agents,/seven submissions are already recorded/);
  assert.doesNotMatch(agents,/branch of this repository at `claims\//);
});

test('legacy operator guides identify historical tasks and reject public ledger writes',async()=>{
  for(const path of ['docs/CLI_PRIVATE_PILOT.md','docs/PRIVATE_PILOT.md']){
    const doc=await read(path);
    assert.match(doc,/historical|Historical/i);
    assert.match(doc,/PRIVATE/);
    assert.match(doc,/PUBLIC/);
    assert.match(doc,/MVP_ACTIVATION\.md/);
    assert.match(doc,/(?:never|forbidden|not authorized|do not).*?(?:public|PUBLIC)/is);
  }
});

test('current alpha guide distinguishes merged CLI from private-ledger activation',async()=>{
  const guide=await read('docs/FIRST_OWNER_ALPHA.md');
  assert.match(guide,/merged into `main`/);
  assert.match(guide,/no independent PRIVATE destination/i);
  assert.match(guide,/verify-private-activation/);
  const activation=await read('docs/MVP_ACTIVATION.md');
  assert.match(activation,/PRIVATE/);
  assert.match(activation,/export-verified-ledger/);
  assert.match(activation,/plan-ledger-copy/);
});
