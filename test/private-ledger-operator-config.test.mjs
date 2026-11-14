import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadPilotConfig} from '../src/registry.mjs';
import {PUBLIC_COORDINATOR} from '../src/private-ledger-preflight.mjs';

test('legacy default config remains unchanged and points to BLOCKED public history',async()=>{
  const c=await loadPilotConfig({repository:undefined,acknowledgedRepository:undefined});
  assert.equal(c.claim_store.repo,PUBLIC_COORDINATOR);
  assert.equal(c.repository_visibility_required,'private');
  assert.equal(c.claim_store.branch,'coordination/claims');
});

test('operator override is process-local and requires both exact matching variables',async()=>{
  const target='example/private-coordinator';
  const c=await loadPilotConfig({repository:target,acknowledgedRepository:target});
  assert.equal(c.claim_store.repo,target);
  assert.equal(c.repository_visibility_required,'private');
  const onDisk=JSON.parse(await readFile(
    new URL('../config/fleet.private.json',import.meta.url),'utf8'));
  assert.equal(onDisk.claim_store.repo,PUBLIC_COORDINATOR);
  for(const params of [
    {repository:target,acknowledgedRepository:'example/elsewhere'},
    {repository:target,acknowledgedRepository:undefined},
    {repository:undefined,acknowledgedRepository:target},
    {repository:PUBLIC_COORDINATOR,acknowledgedRepository:PUBLIC_COORDINATOR},
    {repository:'example/private..other',acknowledgedRepository:'example/private..other'}
  ]) await assert.rejects(()=>loadPilotConfig(params),/activation blocked/);
});

test('public discovery with injected owner-private overrides stays tokenless and public-only',()=>{
  const script=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env,VS_PRIVATE_LEDGER_REPO:'example/secret-ledger',
    VS_PRIVATE_LEDGER_APPROVED_REPO:'example/secret-ledger'};
  delete env.GITHUB_TOKEN;
  const result=spawnSync(process.execPath,[script,'public-discover'],{
    encoding:'utf8',env,timeout:15000
  });
  assert.equal(result.status,0,result.stderr);
  assert.doesNotMatch(result.stdout,/secret-ledger|example\/|PRIVATE_PILOT|GITHUB_TOKEN/);
  assert.equal(JSON.parse(result.stdout).write_claims_enabled,false);
});

test('activation check cannot silently pass or write without authorization',()=>{
  const script=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};
  delete env.GITHUB_TOKEN;
  const result=spawnSync(process.execPath,[script,
    'verify-private-activation','example/private-coordinator'],{
    encoding:'utf8',env,timeout:15000
  });
  assert.equal(result.status,1);
  assert.match(result.stderr,/GITHUB_TOKEN is required/);
  assert.equal(result.stdout,'');
});

test('guard is located before private coordination dispatch',async()=>{
  const cli=await readFile(new URL('../bin/vs-agent.mjs',import.meta.url),'utf8');
  const start=cli.indexOf("if(command==='verify-private-activation')");
  const guard=cli.indexOf('await assertPrivateLedgerActivation({api:baseApi,config})');
  const operations=cli.indexOf("if(command==='discover')");
  assert.ok(start>0&&start<guard&&guard<operations);
});
