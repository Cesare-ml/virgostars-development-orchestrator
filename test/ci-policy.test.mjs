import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflowUrl=new URL('../.github/workflows/node-ci.yml',import.meta.url);
const readWorkflow=()=>readFile(workflowUrl,'utf8');

test('public CI runs full Node 20/22 suite on PRs and declared pushes',async()=>{
  const y=await readWorkflow();
  assert.match(y,/^name: Node\.js CI$/m);
  assert.match(y,/^on:\n  push:\n    branches:\n      - main\n  pull_request:\n  workflow_dispatch:/m);
  assert.match(y,/^\s+node: \[20, 22\]$/m);
  assert.match(y,/^\s+run: npm run check$/m);
  assert.match(y,/^\s+timeout-minutes: 15$/m);
  assert.match(y,/^\s+fail-fast: false$/m);
});

test('CI uses least privilege and does not give checkout persistent credentials',async()=>{
  const y=await readWorkflow();
  assert.match(y,/^permissions:\n  contents: read$/m);
  assert.match(y,/^\s+persist-credentials: false$/m);
  assert.match(y,/^  cancel-in-progress: true$/m);
  assert.doesNotMatch(y,/^\s+(?:id-token|actions|packages|deployments|issues|pull-requests|contents): write$/m);
  assert.doesNotMatch(y,/\$\{\{\s*(?:secrets|vars)\./i);
  assert.doesNotMatch(y,/\b(?:GITHUB_TOKEN|GH_TOKEN|OPENAI_API_KEY|AWS_ACCESS_KEY_ID)\b/);
  assert.doesNotMatch(y,/\b(?:pull_request_target|workflow_run|repository_dispatch|schedule)\s*:/);
  assert.doesNotMatch(y,/\b(?:npm publish|gh pr merge|git push|workflow_dispatch.*token)\b/i);
});

test('public workflow pins trusted actions to exact upstream commit hashes',async()=>{
  const y=await readWorkflow();
  assert.match(y,/uses: actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6/);
  assert.match(y,/uses: actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6/);
  const actions=[...y.matchAll(/^\s+uses:\s+(\S+)/gm)].map(x=>x[1]);
  assert.equal(actions.length,2);
  for(const spec of actions)
    assert.match(spec,/^actions\/(?:checkout|setup-node)@[0-9a-f]{40}$/);
});

test('public CI stays offline from private fleet and never runs privileged agent CLI',async()=>{
  const y=await readWorkflow();
  assert.doesNotMatch(y,/\b(?:audit-collisions|fleet-status|claim-next|submit --|verify:private)\b/);
  assert.doesNotMatch(y,/^\s*(?:env|environment|secrets|services|container):/m);
  assert.doesNotMatch(y,/\b(?:curl|wget|git clone|ssh|gh api)\b/i);
  assert.doesNotMatch(y,/^\s+uses:\s+[^ ]*upload-artifact/m);
  assert.match(y,/^\s+run: npm run check$/m);
});
