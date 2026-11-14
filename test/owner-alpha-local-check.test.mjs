import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assessOwnerAlphaLocalSetup} from '../src/owner-alpha-local-check.mjs';

const goodEnv = () => ({
  VS_PRIVATE_LEDGER_REPO: 'private-owner/private-coordination',
  VS_PRIVATE_LEDGER_APPROVED_REPO: 'private-owner/private-coordination',
  VS_PRIVATE_TASKS_FILE: '/private/do-not-print/owner-tasks.json',
  VS_PRIVATE_TASKS_APPROVED_SHA256: 'a'.repeat(64),
  GITHUB_TOKEN: 'SECRET_NEVER_PRINT'
});
const twoWriters = () => [{access: 'write'}, {access: 'write'}];
const validateSelection = ({repository, acknowledgedRepository}) => {
  if (repository !== acknowledgedRepository ||
      repository === 'Cesare-ml/virgostars-development-orchestrator')
    throw new Error('PRIVATE_REPO_SECRET_LEAK');
  return repository;
};
const run = (env, overrides={}) => assessOwnerAlphaLocalSetup({
  env, nodeVersion: '22.16.0', validateSelection,
  loadApprovedTasks: async () => twoWriters(), ...overrides
});

test('no local configuration: reports blockers without loading any task files', async () => {
  let reads = 0;
  const result = await run({}, {loadApprovedTasks:async () => {reads++; throw Error('should not read');}});
  assert.equal(reads, 0);
  assert.equal(result.result, 'blocked');
  assert.equal(result.private_ledger_verified, false);
  assert.equal(result.github_requests, 0);
  assert.equal(result.ready_to_launch, false);
  assert.deepEqual(result.blockers, [
    'LOCAL_GITHUB_TOKEN_MISSING',
    'OWNER_TASK_APPROVAL_MISSING',
    'PRIVATE_LEDGER_SELECTION_MISSING'
  ]);
});

test('valid local inputs permit only a later remote doctor, never launch', async () => {
  const result = await run(goodEnv());
  assert.equal(result.result, 'local-preflight-pass');
  assert.equal(result.eligible_for_remote_alpha_doctor, true);
  assert.equal(result.configured_write_tasks, 2);
  assert.equal(result.private_ledger_verified, false);
  assert.equal(result.historical_submissions_verified, false);
  assert.equal(result.real_multi_chat_pilot_proven, false);
  assert.equal(result.merge_authorized, false);
  assert.equal(result.ready_to_launch, false);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_NEVER_PRINT|private-owner|owner-tasks\.json|aaaaaa/);
});

test('mismatched and public ledger selection fail closed and redact validation errors', async () => {
  const mismatch=goodEnv(); mismatch.VS_PRIVATE_LEDGER_APPROVED_REPO='another/private-repo';
  const x=await run(mismatch);
  assert.ok(x.blockers.includes('PRIVATE_LEDGER_SELECTION_INVALID'));
  assert.doesNotMatch(JSON.stringify(x), /another\/private-repo|PRIVATE_REPO_SECRET_LEAK/);
  const pub=goodEnv();
  pub.VS_PRIVATE_LEDGER_REPO='Cesare-ml/virgostars-development-orchestrator';
  pub.VS_PRIVATE_LEDGER_APPROVED_REPO=pub.VS_PRIVATE_LEDGER_REPO;
  const y=await run(pub);
  assert.ok(y.blockers.includes('PRIVATE_LEDGER_SELECTION_INVALID'));
});

test('wrong SHA, invalid catalog and only one writer are all blocked', async () => {
  const wrong=goodEnv(); wrong.VS_PRIVATE_TASKS_APPROVED_SHA256='BAD-SHA';
  const r=await run(wrong,{loadApprovedTasks:()=>{throw Error('MUST_NOT_OPEN');}});
  assert.ok(r.blockers.includes('OWNER_TASK_APPROVAL_SHA_INVALID'));
  const invalid=await run(goodEnv(),{loadApprovedTasks:async()=>{throw Error('PRIVATE_TASK_PATH_LEAK');}});
  assert.ok(invalid.blockers.includes('OWNER_TASK_FILE_OR_APPROVAL_INVALID'));
  assert.doesNotMatch(JSON.stringify(invalid),/PRIVATE_TASK_PATH_LEAK/);
  const one=await run(goodEnv(),{loadApprovedTasks:async()=>[{access:'write'},{access:'read'}]});
  assert.ok(one.blockers.includes('TWO_WRITE_TASKS_REQUIRED'));
  assert.equal(one.private_task_file_validated,true);
  assert.equal(one.eligible_for_remote_alpha_doctor,false);
});

test('unsupported Node major and malformed validator are rejected', async () => {
  const old=await run(goodEnv(),{nodeVersion:'18.20.1'});
  assert.ok(old.blockers.includes('NODE_20_OR_NEWER_REQUIRED'));
  await assert.rejects(
    assessOwnerAlphaLocalSetup({env:goodEnv(),validateSelection:null,loadApprovedTasks:()=>[]}),
    /offline preflight validators/
  );
});

test('real CLI without owner config is network-free, redacted and returns exit 2', () => {
  const script=fileURLToPath(new URL('../scripts/check-owner-alpha-local.mjs',import.meta.url));
  const clean={PATH:process.env.PATH || '',SystemRoot:process.env.SystemRoot || '',
    WINDIR:process.env.WINDIR || '',PATHEXT:process.env.PATHEXT || ''};
  const cmd=spawnSync(process.execPath,[script],{
    env:clean,encoding:'utf8',timeout:15000,maxBuffer:16384,windowsHide:true
  });
  assert.equal(cmd.status,2,cmd.stderr);
  assert.equal(cmd.stderr,'');
  assert.equal(JSON.parse(cmd.stdout).result,'blocked');
  assert.equal(JSON.parse(cmd.stdout).github_requests,0);
  assert.doesNotMatch(cmd.stdout,/GITHUB_TOKEN=|VS_PRIVATE_LEDGER_REPO=|secret/i);
});

test('real CLI rejects arguments without echoing them', () => {
  const script=fileURLToPath(new URL('../scripts/check-owner-alpha-local.mjs',import.meta.url));
  const cmd=spawnSync(process.execPath,[script,'DONT_PRINT_THIS'],{
    env:{PATH:process.env.PATH || '',SystemRoot:process.env.SystemRoot || ''},
    encoding:'utf8',timeout:15000,windowsHide:true
  });
  assert.equal(cmd.status,1);
  assert.equal(cmd.stdout,'');
  assert.doesNotMatch(cmd.stderr,/DONT_PRINT_THIS/);
});
