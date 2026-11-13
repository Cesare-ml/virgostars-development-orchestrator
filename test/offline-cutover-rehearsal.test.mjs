import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  REHEARSAL_SCHEMA,rehearseLedgerBackups,rehearseLocalBackupFile
} from '../src/offline-cutover-rehearsal.mjs';

const SOURCE='Cesare-ml/virgostars-development-orchestrator';
const TARGET='test-org/owner-private-ledger';
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),D='d'.repeat(40);
const gitBlob=bytes=>createHash('sha1')
  .update('blob '+bytes.length+'\0').update(bytes).digest('hex');
function record(path,value={schema_version:2,state:'submitted'}) {
  const bytes=Buffer.from(JSON.stringify(value)+'\n','utf8');
  return {path,git_blob_sha:gitBlob(bytes),
    content_base64:bytes.toString('base64')};
}
const s1=()=>record('submissions/source-project/issue-1.json');
const s2=()=>record('submissions/source-project/issue-2.json',
  {state:'submitted',head_sha:A});
function manifest(sourceRecords=[s1(),s2()],targetRecords=[],options={}) {
  return {
    schema_version:REHEARSAL_SCHEMA,
    source:{
      repository:SOURCE,head_sha:A,tree_sha:B,records:sourceRecords
    },
    destination:{
      repository:TARGET,
      head_sha:options.destinationMissing?null:C,
      tree_sha:options.destinationMissing?null:D,
      records:targetRecords
    }
  };
}
test('hash-verified identical local records produce a non-authorizing rehearsal',()=>{
 const p=manifest([s1(),s2()],[s1(),s2()]);
 const r=rehearseLedgerBackups(p);
 assert.equal(r.local_git_blob_integrity_verified,true);
 assert.equal(r.full_backup_verified,false);
 assert.equal(r.live_head_verified,false);
 assert.equal(r.private_visibility_verified,false);
 assert.equal(r.records.identical,2);
 assert.equal(r.records.would_copy,0);
 assert.equal(r.records.conflicting,0);
 assert.equal(r.records.destination_only,0);
 assert.equal(r.ready_to_migrate,false);
 assert.equal(r.writes_enabled,false);
 assert.equal(r.migration_performed,false);
 assert.equal(r.rollback_performed,false);
 assert.ok(r.blockers.includes('REMOTE_COMMIT_TREE_PROVENANCE_NOT_VERIFIED'));
 assert.ok(r.blockers.includes('OWNER_APPROVAL_AND_WRITE_FREEZE_REQUIRED'));
 assert.ok(r.procedure.some(x=>x.includes('restore the previous client configuration')));
});
test('missing, same-path conflicting and destination-only records are distinct counts',()=>{
 const modified=record(s1().path,{state:'other',private_note:'do not print this'});
 const extra=record('submissions/other-project/issue-3.json');
 const report=rehearseLedgerBackups(manifest([s1(),s2()],[modified,extra]));
 assert.deepEqual(report.records.source,{claims:0,resources:0,submissions:2});
 assert.equal(report.records.would_copy,1);
 assert.equal(report.records.conflicting,1);
 assert.equal(report.records.destination_only,1);
 assert.ok(report.blockers.includes('CONFLICTING_RECORD_CONTENTS'));
 assert.ok(report.blockers.includes('DESTINATION_ONLY_RECORDS_REQUIRE_REVIEW'));
 assert.doesNotMatch(JSON.stringify(report),/private_note|do not print this|other-project|source-project|test-org/);
});
test('active claim and resource locks are explicit blockers',()=>{
 const source=[s1(),record('claims/source-project/issue-8.json'),
   record('resources/source-project/renderer.json')];
 const r=rehearseLedgerBackups(manifest(source));
 assert.equal(r.records.source.claims,1);
 assert.equal(r.records.source.resources,1);
 assert.ok(r.blockers.includes('SOURCE_HAS_CLAIMS_OR_RESOURCE_LOCKS'));
 assert.equal(r.ready_to_migrate,false);
});
test('empty source submissions and destination branch not created are blockers',()=>{
 const r=rehearseLedgerBackups(manifest([],[],{destinationMissing:true}));
 assert.ok(r.blockers.includes('SOURCE_HAS_NO_SUBMISSION_RECORDS'));
 assert.ok(r.blockers.includes('DESTINATION_BRANCH_NOT_CREATED'));
 assert.equal(r.ready_to_migrate,false);
});
test('rejects corrupted Git SHA, claimed but invalid tree and malformed content',()=>{
 const broken=s1();broken.content_base64=Buffer.from('{"changed":true}').toString('base64');
 assert.throws(()=>rehearseLedgerBackups(manifest([broken])),/contents do not match/);
 const badRecord={...s1(),git_blob_sha:'bad'};
 assert.throws(()=>rehearseLedgerBackups(manifest([badRecord])),/malformed record/);
 const badTree=manifest();badTree.source.tree_sha='invalid';
 assert.throws(()=>rehearseLedgerBackups(badTree),/invalid pinned Git SHA/);
 const badJson=record('submissions/project/issue-1.json');
 const raw=Buffer.from('not JSON');
 badJson.content_base64=raw.toString('base64');
 badJson.git_blob_sha=gitBlob(raw);
 assert.throws(()=>rehearseLedgerBackups(manifest([badJson])),/not valid JSON/);
});
test('path traversal, symlinks in manifest, Windows paths and case-folded duplicates fail',()=>{
 for(const path of [
  '../private/secret.json','/tmp/project/x.json','C:/temp/file.json',
  'claims\\project\\file.json','submissions//issue.json',
  'submissions/../issue.json','secrets/project/file.json',
  'submissions/.git/config.json','submissions/project/secret.txt'
 ]) {
  assert.throws(()=>rehearseLedgerBackups(manifest([record(path)])),
    /unsafe, unsupported or malformed record/);
 }
 const a=s1(),b={...s1(),path:s1().path.toUpperCase()};
 assert.throws(()=>rehearseLedgerBackups(manifest([a,b])),
   /duplicate or case-colliding/);
});
test('disallows extra keys, unexpected identities, large record inventories',()=>{
 const m=manifest();m.GITHUB_TOKEN='should-not-be-here';
 assert.throws(()=>rehearseLedgerBackups(m),/unexpected local backup manifest schema/);
 const bad=manifest();bad.destination.repository=SOURCE;
 assert.throws(()=>rehearseLedgerBackups(bad),/identity is not allowed/);
 const huge=manifest(Array.from({length:251},(_,i)=>
  record('submissions/project/issue-'+i+'.json')));
 assert.throws(()=>rehearseLedgerBackups(huge),/invalid local record inventory/);
 const extra=manifest();extra.source.records[0].secret='token';
 assert.throws(()=>rehearseLedgerBackups(extra),/malformed record/);
});
test('a missing destination branch cannot claim existing target records',()=>{
 const m=manifest([s1()],[s1()],{destinationMissing:true});
 assert.throws(()=>rehearseLedgerBackups(m),/invalid local record inventory/);
});
test('reads a local backup file and returns only bounded aggregate metadata',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'vs-cutover-local-'));
 try {
  const path=join(directory,'owner-backup.json');
  await writeFile(path,JSON.stringify(manifest()));
  const report=await rehearseLocalBackupFile(path);
  assert.equal(report.records.would_copy,2);
  assert.equal(report.records.identical,0);
  assert.equal(report.ready_to_migrate,false);
  assert.doesNotMatch(JSON.stringify(report),/source-project|issue-1|owner-backup/);
 } finally {await rm(directory,{recursive:true,force:true});}
});
test('offline CLI does not require GitHub token or load the blocked legacy claim store',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'vs-cutover-cli-'));
 const path=join(directory,'synthetic.json');
 try {
  await writeFile(path,JSON.stringify(manifest()));
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};delete env.GITHUB_TOKEN;delete env.GH_TOKEN;
  const run=args=>spawnSync(process.execPath,[cli,...args],
    {env,encoding:'utf8',timeout:15000});
  const valid=run(['rehearse-private-cutover',path]);
  assert.equal(valid.status,0,valid.stderr);
  assert.equal(JSON.parse(valid.stdout).records.would_copy,2);
  assert.doesNotMatch(valid.stdout,/GITHUB_TOKEN|source-project|owner-backup/);
  const flags=run(['rehearse-private-cutover',path,'--confirm']);
  assert.equal(flags.status,1);
  assert.match(flags.stderr,/requires exactly LOCAL_BACKUP/);
  const missing=run(['rehearse-private-cutover',join(directory,'absent.json')]);
  assert.equal(missing.status,1);
  assert.match(missing.stderr,/could not be read safely/);
  assert.doesNotMatch(missing.stderr,/absent\.json/);
 } finally {await rm(directory,{recursive:true,force:true});}
});
test('rejects filesystem symlinks and oversized JSON without printing local path',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'vs-cutover-safety-'));
 try {
  const good=join(directory,'valid.json');
  const alias=join(directory,'alias.json');
  const large=join(directory,'too-large.json');
  await writeFile(good,JSON.stringify(manifest()));
  await symlink(good,alias);
  await writeFile(large,'x'.repeat(2_000_100));
  await assert.rejects(()=>rehearseLocalBackupFile(alias),/bounded regular file/);
  await assert.rejects(()=>rehearseLocalBackupFile(large),/bounded regular file/);
 } finally {await rm(directory,{recursive:true,force:true});}
});
test('rejects unsupported destination shape and non-object JSON contents',()=>{
 const m=manifest();
 m.destination.head_sha=null;
 assert.throws(()=>rehearseLedgerBackups(m),/invalid pinned Git SHA/);
 const bytes=Buffer.from('[]','utf8');
 const item={path:s1().path,git_blob_sha:gitBlob(bytes),
  content_base64:bytes.toString('base64')};
 assert.throws(()=>rehearseLedgerBackups(manifest([item])),/must be a JSON object/);
});
