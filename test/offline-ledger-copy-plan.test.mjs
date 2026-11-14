import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm,stat,lstat,open,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  planCopyOnlyImport,planLocalCopyOnlyImport,
  fingerprintSubmissionInventory,assertFrozenSubmissionInventory,
  sameManifestFileSnapshot
} from '../src/offline-ledger-copy-plan.mjs';

const SOURCE='Cesare-ml/virgostars-development-orchestrator';
const SOURCE_HEAD='6a6e8f2562b101f6bdfe207397521cf0f5ca1ebf';
const SOURCE_TREE='892d39e23da8f6b4b16c9f2a8099df717b4221e7';
const DEST='owner/private-ledger-fixture';
const HEAD='c'.repeat(40),TREE='d'.repeat(40);

function gitSha(bytes) {
  return createHash('sha1').update('blob '+bytes.length+'\0')
    .update(bytes).digest('hex');
}
function entry(i,changes={}) {
  const payload={
    state:'submitted',target_repository:'Cesare-ml/astrological-charts',
    issue_number:i,session_id:'synthetic-session-'+i,...changes
  };
  const bytes=Buffer.from(JSON.stringify(payload)+'\n');
  return {
    path:'submissions/Cesare-ml__astrological-charts/issue-'+i+'.json',
    git_blob_sha:gitSha(bytes),
    content_base64:bytes.toString('base64')
  };
}
const clone=x=>structuredClone(x);
function fixture({branch=true}={}) {
  return {
    schema_version:'1-offline-ledger-backups',
    source:{repository:SOURCE,head_sha:SOURCE_HEAD,
      tree_sha:SOURCE_TREE,records:Array.from({length:7},(_,i)=>entry(i+1))},
    destination:{repository:DEST,head_sha:branch?HEAD:null,
      tree_sha:branch?TREE:null,records:[]}
  };
}
async function tmp(t,manifest=fixture()) {
  const dir=await mkdtemp(join(tmpdir(),'vs-copy-plan-'));
  t.after(()=>rm(dir,{force:true,recursive:true}));
  const file=join(dir,'private-records.json');
  const data=JSON.stringify(manifest,null,2)+'\n';
  await writeFile(file,data,{mode:0o600});
  return {file,dir,data};
}
function changedEntry(i,changes) {return entry(i,changes);}

test('seven immutable submitted records stage into empty existing private branch',()=>{
  const plan=planCopyOnlyImport(fixture());
  assert.equal(plan.schema_version,'1-offline-private-copy-plan');
  assert.equal(plan.immutable_public_checkpoint_matched,true);
  assert.equal(plan.git_blob_integrity_checked,true);
  assert.equal(plan.required_historical_submissions,7);
  assert.equal(plan.submissions_already_identical,0);
  assert.equal(plan.submissions_to_copy,7);
  assert.equal(plan.submissions_conflicting,0);
  assert.equal(plan.destination_only_submissions,0);
  assert.equal(plan.destination_branch_present,true);
  assert.deepEqual(plan.blockers,[]);
  assert.equal(plan.eligible_for_independent_owner_review,true);
  assert.equal(plan.live_github_metadata_verified,false);
  assert.equal(plan.private_visibility_verified,false);
  assert.equal(plan.git_repository_mirror_backup_verified,false);
  assert.equal(plan.changes_to_local_or_remote_data,0);
  assert.equal(plan.import_performed,false);
  assert.equal(plan.approval_granted,false);
});

test('partial exact private copies are recognized without overwriting existing entries',()=>{
  const manifest=fixture();
  manifest.destination.records=manifest.source.records.slice(0,4).map(clone);
  const plan=planCopyOnlyImport(manifest);
  assert.equal(plan.submissions_already_identical,4);
  assert.equal(plan.submissions_to_copy,3);
  assert.deepEqual(plan.blockers,[]);
  assert.equal(plan.eligible_for_independent_owner_review,true);
  manifest.destination.records=manifest.source.records.map(clone);
  const all=planCopyOnlyImport(manifest);
  assert.equal(all.submissions_already_identical,7);
  assert.equal(all.submissions_to_copy,0);
});

test('destination branch must exist before copy-only import is reviewed for activation',()=>{
  const plan=planCopyOnlyImport(fixture({branch:false}));
  assert.equal(plan.destination_branch_present,false);
  assert.deepEqual(plan.blockers,['PRIVATE_COORDINATION_BRANCH_NOT_YET_CREATED']);
  assert.equal(plan.eligible_for_independent_owner_review,false);
  assert.equal(plan.submissions_to_copy,7);
});

test('byte-different existing marker and destination-only record are explicit blockers',()=>{
  const manifest=fixture();
  manifest.destination.records=[
    changedEntry(1,{session_id:'different-synthetic-session'}),
    entry(20)
  ];
  const plan=planCopyOnlyImport(manifest);
  assert.equal(plan.submissions_conflicting,1);
  assert.equal(plan.destination_only_submissions,1);
  assert.equal(plan.submissions_to_copy,6);
  assert.equal(plan.eligible_for_independent_owner_review,false);
  assert.deepEqual(plan.blockers,[
    'DIFFERENT_BYTES_AT_EXISTING_SUBMISSION_PATH',
    'UNREVIEWED_DESTINATION_ONLY_SUBMISSIONS'
  ]);
});

test('out-of-checkpoint source head or tree and missing historic records fail closed',()=>{
  for(const mutation of [
    m=>{m.source.head_sha='f'.repeat(40);},
    m=>{m.source.tree_sha='f'.repeat(40);},
    m=>{m.source.records.pop();},
    m=>{m.source.records.push(entry(8));},
    m=>{m.source.records[1].path=m.source.records[0].path;}
  ]) {
    const m=fixture();mutation(m);
    assert.throws(()=>planCopyOnlyImport(m));
  }
});

test('malformed or deceptive source record metadata and Git hashes fail closed',()=>{
  const mutations=[
    m=>{m.source.records[0]=entry(1,{state:'claimed'});},
    m=>{m.source.records[0]=entry(1,{target_repository:'someone/else'});},
    m=>{m.source.records[0]=entry(1,{issue_number:99});},
    m=>{m.source.records[0].git_blob_sha='0'.repeat(40);},
    m=>{m.source.records[0].path='claims/Cesare-ml__astrological-charts/issue-1.json';},
    m=>{m.source.records[0].path='submissions/Cesare-ml__astrological-charts/issue-01.json';}
  ];
  for(const mutation of mutations) {
    const m=fixture();mutation(m);
    assert.throws(()=>planCopyOnlyImport(m));
  }
});

test('an active destination resource or claim is never a safe import plan',()=>{
  for(const prefix of ['claims','resources']) {
    const m=fixture();
    const e=entry(7);
    e.path=prefix+'/Cesare-ml__astrological-charts/'+
      (prefix==='claims'?'issue-7.json':'resource.json');
    m.destination.records=[e];
    assert.throws(()=>planCopyOnlyImport(m),/active claims or resource locks/);
  }
});

test('owner-local reader rejects invented self-consistent historical blobs without modifying input',async t=>{
  const {file,data}=await tmp(t);
  const before=await readFile(file);
  await assert.rejects(()=>planLocalCopyOnlyImport(file),
    /record inventory does not match frozen public Git tree/);
  assert.deepEqual(await readFile(file),before);
  assert.equal(createHash('sha256').update(data).digest('hex'),
    createHash('sha256').update(before).digest('hex'));
});

test('frozen inventory digest is deterministic but binds paths and Git blob SHA',()=>{
  const records=fixture().source.records;
  const digest=fingerprintSubmissionInventory(records);
  assert.match(digest,/^[0-9a-f]{64}$/);
  assert.equal(digest,fingerprintSubmissionInventory([...records].reverse()));
  const different=clone(records);
  different[0].git_blob_sha='0'.repeat(40);
  assert.notEqual(digest,fingerprintSubmissionInventory(different));
  assert.throws(()=>assertFrozenSubmissionInventory(records),
    /record inventory does not match frozen public Git tree/);
});

// Public Git tree metadata only, without historical record JSON or sessions.
// Verified against recursive tree 892d39e23da8f6b4b16c9f2a8099df717b4221e7.
test('all seven frozen public blob identities match the independently pinned digest',()=>{
  const entries=[
    ['submissions/Cesare-ml__VirgoStars-Ephemeris/issue-85.json','f9473289a4caaba499244c72b7accc7fad16c312'],
    ['submissions/Cesare-ml__VirgoStars-Event-Ephemeris/issue-10.json','6fc7c653c07e2e82a2be151bb4d785f99d395d95'],
    ['submissions/Cesare-ml__astrological-charts/issue-23.json','ac8b5677d9bf2576a35f0ed92e67ebf352b5f1cb'],
    ['submissions/Cesare-ml__astrological-charts/issue-25.json','6092968aaeac28e38197e55bdc6d8fa59dc30463'],
    ['submissions/Cesare-ml__astrological-functions/issue-4.json','f999a0a28392b62a161ded680c78fa8fa7fdc1e4'],
    ['submissions/Cesare-ml__astrological-functions/issue-5.json','32bedddce0663c11a086d0d5bdce375a99975ac9'],
    ['submissions/Cesare-ml__virgostars-desktop/issue-34.json','aba1b2854a65b5081593c93a34ab8e1995480f5e']
  ].map(([path,git_blob_sha])=>({path,git_blob_sha}));
  assert.equal(entries.length,7);
  assert.equal(fingerprintSubmissionInventory(entries),
    '3404e286d189a8860f692f1f23b5373488e033c7c62a2384a1679821ede31d83');
  assert.equal(assertFrozenSubmissionInventory(entries),true);
  const altered=clone(entries);
  altered[6].path=altered[6].path.replace('34.json','35.json');
  assert.throws(()=>assertFrozenSubmissionInventory(altered),
    /record inventory does not match frozen public Git tree/);
});

test('manifest file identity detects inode, device and timestamp swaps before reading',()=>{
  const initial={
    dev:3,ino:17,size:256,mtimeMs:11,ctimeMs:12,
    isFile:()=>true,isSymbolicLink:()=>false
  };
  assert.equal(sameManifestFileSnapshot(initial,{...initial}),true);
  for(const mutation of [
    {ino:18},{dev:4},{size:257},{mtimeMs:13},{ctimeMs:14},
    {isFile:()=>false}
  ]) {
    assert.equal(sameManifestFileSnapshot(initial,{...initial,...mutation}),false);
  }
  assert.equal(sameManifestFileSnapshot(
    {...initial,isSymbolicLink:()=>true},initial),false);
  assert.equal(sameManifestFileSnapshot(initial,null),false);
});

test('owner local manifest lstat matches opened descriptor for regular files',async t=>{
  const {file}=await tmp(t);
  const before=await lstat(file);
  const handle=await open(file,'r');
  try {
    const opened=await handle.stat();
    assert.equal(sameManifestFileSnapshot(before,opened),true);
    const read=await handle.readFile();
    const after=await handle.stat();
    assert.equal(read.length,opened.size);
    assert.equal(sameManifestFileSnapshot(opened,after),true);
  } finally {
    await handle.close();
  }
});

test('local file reader rejects relative, in-checkout and symlink paths',async t=>{
  const {file,dir}=await tmp(t);
  await assert.rejects(()=>planLocalCopyOnlyImport('./file.json'),
    /absolute owner-local/);
  const checkout=fileURLToPath(new URL('../config/pilot-tasks.json',import.meta.url));
  await assert.rejects(()=>planLocalCopyOnlyImport(checkout),
    /outside the public checkout/);
  const alias=join(dir,'link.json');
  await symlink(file,alias);
  await assert.rejects(()=>planLocalCopyOnlyImport(alias),/not a symlink/);
});

test('CLI refuses forged backup and keeps output private even with private env vars',async t=>{
  const {file}=await tmp(t);
  const script=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env,
    VS_PRIVATE_LEDGER_REPO:'invalid-local-private-destination',
    VS_PRIVATE_TASKS_FILE:'invalid-local-private-file'};
  delete env.GITHUB_TOKEN;
  const run=spawnSync(process.execPath,[script,'plan-ledger-copy',file],{
    encoding:'utf8',env,timeout:15000
  });
  assert.equal(run.status,1,run.stderr);
  assert.equal(run.stdout,'');
  assert.match(run.stderr,/record inventory does not match frozen public Git tree/);
  assert.doesNotMatch(run.stderr,
    /owner\/private|synthetic-session|astrological-charts|Cesare-ml__|invalid-local|issue-1\.json/);
});

test('CLI blocks fake source before branch planning and rejects extra flags',async t=>{
  const {file}=await tmp(t,fixture({branch:false}));
  const script=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env};delete env.GITHUB_TOKEN;
  const blocked=spawnSync(process.execPath,[script,'plan-ledger-copy',file],{
    encoding:'utf8',env,timeout:15000
  });
  assert.equal(blocked.status,1,blocked.stderr);
  assert.equal(blocked.stdout,'');
  assert.match(blocked.stderr,/record inventory does not match frozen public Git tree/);
  const illegal=spawnSync(process.execPath,[script,'plan-ledger-copy',file,'--confirm'],{
    encoding:'utf8',env,timeout:15000
  });
  assert.equal(illegal.status,1);
  assert.match(illegal.stderr,/one absolute local JSON manifest path/);
  assert.equal(illegal.stdout,'');
});
