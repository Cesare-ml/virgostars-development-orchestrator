import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,stat,rm,symlink,readdir,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {stageOwnerLocalMissingSubmissions} from '../src/owner-local-staging.mjs';

const SOURCE='Cesare-ml/virgostars-development-orchestrator';
const SOURCE_HEAD='6a6e8f2562b101f6bdfe207397521cf0f5ca1ebf';
const SOURCE_TREE='892d39e23da8f6b4b16c9f2a8099df717b4221e7';
const PRIVATE='owner/private-ledger-fixture';
const SHA=n=>n.toString(16).padStart(40,'0');
const hash=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const fingerprint=bytes=>createHash('sha256').update(bytes).digest('hex');
function record(i,extra={}) {
  const value={state:'submitted',target_repository:'example-synthetic/alpha-charts',
    issue_number:i,session_id:'confidential-synthetic-'+i,...extra};
  const bytes=Buffer.from(JSON.stringify(value)+'\n');
  return {
    path:'submissions/example-synthetic__alpha-charts/issue-'+i+'.json',
    git_blob_sha:hash(bytes),content_base64:bytes.toString('base64')
  };
}
function fixture({identical=0,branch=true,conflict=false,extra=false}={}) {
  const source=Array.from({length:7},(_,i)=>record(i+1));
  const destination=source.slice(0,identical).map(x=>structuredClone(x));
  if(conflict)destination.push(record(7,{session_id:'tampered'}));
  if(extra)destination.push(record(20));
  return {
    schema_version:'1-offline-ledger-backups',
    source:{repository:SOURCE,head_sha:SOURCE_HEAD,
      tree_sha:SOURCE_TREE,records:source},
    destination:{repository:PRIVATE,head_sha:branch?SHA(100):null,
      tree_sha:branch?SHA(200):null,records:destination}
  };
}
async function prepare(t,opts={}) {
  const dir=await mkdtemp(join(tmpdir(),'vs-private-stage-test-'));
  t.after(async()=>rm(dir,{recursive:true,force:true}));
  const input=join(dir,'private-backup.json');
  const stage=join(dir,'new-staging-folder');
  const manifest=fixture(opts),bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  await writeFile(input,bytes,{mode:0o600});
  return {dir,input,stage,manifest,bytes,approved:fingerprint(bytes)};
}
const invoke=x=>stageOwnerLocalMissingSubmissions({
  manifestFile:x.input,outputDirectory:x.stage,approvedSha256:x.approved,confirm:true
});

test('seven missing records staged byte-exactly with no GitHub calls or overwrite',async t=>{
  const x=await prepare(t);
  const report=await invoke(x);
  assert.equal(report.newly_staged_submissions,7);
  assert.equal(report.previously_identical_submissions,0);
  assert.equal(report.required_historical_submissions,7);
  assert.equal(report.staging_directory_created,true);
  assert.equal(report.github_requests,0);
  assert.equal(report.remote_import_performed,false);
  assert.equal(report.full_git_mirror_verified,false);
  assert.equal(report.permission_to_import_granted,false);
  assert.doesNotMatch(JSON.stringify(report),
    /private-ledger|confidential-synthetic|example-synthetic|issue-[0-9]+/);
  let total=0;
  for(const rec of x.manifest.source.records) {
    const bytes=await readFile(join(x.stage,...rec.path.split('/')));
    const expected=Buffer.from(rec.content_base64,'base64');
    total+=bytes.length;
    assert.deepEqual(bytes,expected);
    assert.equal(hash(bytes),rec.git_blob_sha);
    if(process.platform!=='win32')
      assert.equal((await stat(join(x.stage,...rec.path.split('/')))).mode&0o777,0o600);
  }
  assert.equal(report.bytes_staged,total);
  if(process.platform!=='win32')
    assert.equal((await stat(x.stage)).mode&0o777,0o700);
  assert.deepEqual((await readdir(x.stage)),['submissions']);
  assert.deepEqual(await readFile(x.input),x.bytes);
});

test('partial private destination skips existing identical submissions',async t=>{
  const x=await prepare(t,{identical:4});
  const report=await invoke(x);
  assert.equal(report.previously_identical_submissions,4);
  assert.equal(report.newly_staged_submissions,3);
  for(let i=1;i<=4;i++)
    await assert.rejects(()=>stat(join(x.stage,
      'submissions','example-synthetic__alpha-charts','issue-'+i+'.json')),
      {code:'ENOENT'});
  for(let i=5;i<=7;i++)
    assert.ok((await stat(join(x.stage,'submissions',
      'example-synthetic__alpha-charts','issue-'+i+'.json'))).isFile());
});

test('staging refuses all-identical target, missing branch, extra or conflicting data',async t=>{
  for(const opts of [
    {identical:7},{branch:false},{conflict:true},{extra:true}
  ]) {
    const x=await prepare(t,opts);
    await assert.rejects(()=>invoke(x),/Owner staging blocked/);
    await assert.rejects(()=>stat(x.stage),{code:'ENOENT'});
  }
});

test('owner must supply --confirm and exact reviewed file SHA before any write',async t=>{
  const x=await prepare(t);
  for(const changes of [
    {confirm:false},
    {approvedSha256:'0'.repeat(64)},
    {approvedSha256:x.approved.toUpperCase()},
    {approvedSha256:undefined}
  ]) {
    await assert.rejects(()=>stageOwnerLocalMissingSubmissions({
      manifestFile:x.input,outputDirectory:x.stage,
      approvedSha256:x.approved,confirm:true,...changes
    }),/Owner staging blocked/);
    await assert.rejects(()=>stat(x.stage),{code:'ENOENT'});
  }
  await writeFile(x.input,Buffer.concat([x.bytes,Buffer.from(' ')]));
  await assert.rejects(()=>invoke(x),/fingerprint does not match/);
  await assert.rejects(()=>stat(x.stage),{code:'ENOENT'});
});

test('pre-existing target directory or symlink cannot be overwritten',async t=>{
  const x=await prepare(t);
  await mkdir(x.stage);
  const sentinel=join(x.stage,'sentinel');
  await writeFile(sentinel,'keep my file');
  await assert.rejects(()=>invoke(x),/already exists/);
  assert.equal(await readFile(sentinel,'utf8'),'keep my file');
  const link=join(x.dir,'link-staging');
  await symlink(x.stage,link);
  await assert.rejects(()=>stageOwnerLocalMissingSubmissions({
    manifestFile:x.input,outputDirectory:link,
    approvedSha256:x.approved,confirm:true
  }),/already exists/);
  assert.equal(await readFile(sentinel,'utf8'),'keep my file');
});

test('relative, in-checkout and symlink-parent output locations are blocked',async t=>{
  const x=await prepare(t);
  const root=fileURLToPath(new URL('../config/',import.meta.url));
  const linked=join(x.dir,'linked-parent');
  await symlink(x.dir,linked,'dir');
  for(const output of [
    'relative-staging',
    join(root,'new-private-stage'),
    join(linked,'new-folder')
  ]) {
    await assert.rejects(()=>stageOwnerLocalMissingSubmissions({
      manifestFile:x.input,outputDirectory:output,
      approvedSha256:x.approved,confirm:true
    }),/Owner staging blocked/);
  }
});

test('CLI stages approved backups without token and does not print private paths',async t=>{
  const x=await prepare(t);
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env,VS_PRIVATE_BACKUP_APPROVED_SHA256:x.approved,
    VS_PRIVATE_TASKS_FILE:'not-a-real-task-file'};
  delete env.GITHUB_TOKEN;
  const run=spawnSync(process.execPath,[cli,'stage-ledger-copy',x.input,
    '--output',x.stage,'--confirm'],{env,encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stderr,'');
  const report=JSON.parse(run.stdout);
  assert.equal(report.newly_staged_submissions,7);
  assert.equal(report.github_requests,0);
  assert.doesNotMatch(run.stdout,
    /private-backup|not-a-real|private-ledger|confidential-synthetic|example-synthetic|vs-private-stage-test/);
});

test('CLI refuses no confirmation, unrelated flags or missing approval',async t=>{
  const x=await prepare(t);
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};delete env.GITHUB_TOKEN;
  for(const args of [
    [x.input,'--output',x.stage],
    [x.input,'--output',x.stage,'--confirm','--role','developer'],
    [x.input,'--output',x.stage,'--confirm']
  ]) {
    const out=spawnSync(process.execPath,[cli,'stage-ledger-copy',...args],
      {env,encoding:'utf8',timeout:15000});
    assert.equal(out.status,1);
    assert.equal(out.stdout,'');
    assert.match(out.stderr,/stage-ledger-copy|Owner staging blocked/);
    await assert.rejects(()=>stat(x.stage),{code:'ENOENT'});
  }
});
