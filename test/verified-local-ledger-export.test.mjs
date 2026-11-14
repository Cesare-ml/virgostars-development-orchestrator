import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,stat,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GitHubError} from '../src/github.mjs';
import {exportVerifiedLocalLedgerBackup} from '../src/verified-local-ledger-export.mjs';
import {rehearseLedgerBackups} from '../src/offline-cutover-rehearsal.mjs';

const PUBLIC='Cesare-ml/virgostars-development-orchestrator';
const PRIVATE='owner/private-ledger-fixture';
const HEAD='6a6e8f2562b101f6bdfe207397521cf0f5ca1ebf';
const SOURCE_TREE='a'.repeat(40),DEST_HEAD='b'.repeat(40),DEST_TREE='c'.repeat(40);
const sha=bytes=>createHash('sha1').update('blob '+bytes.length+'\0')
  .update(bytes).digest('hex');
const ref=head=>({object:{type:'commit',sha:head}});
const record=(i)=> {
  const bytes=Buffer.from(JSON.stringify({state:'submitted',
    target_repository:'Cesare-ml/astrological-charts',
    issue_number:i,session_id:'confidential-synthetic-'+i})+'\n');
  return {path:'submissions/Cesare-ml__astrological-charts/issue-'+i+'.json',
    type:'blob',mode:'100644',size:bytes.length,sha:sha(bytes),bytes};
};
function fake({privateBranch=false,privateRecords=[],badBlob=false,sourceDrift=false,
  wrongPrivateVisibility=false}={}) {
  const rows=Array.from({length:7},(_,i)=>record(i+1));
  let blobRead=false,remoteWrites=0;
  const sourceRows=[...rows];
  const destRows=[...privateRecords];
  const api={
    async getRepository(repo) {
      if(repo===PUBLIC)return {full_name:PUBLIC,visibility:'public',
        private:false,archived:false,disabled:false};
      if(repo===PRIVATE)return {full_name:PRIVATE,
        visibility:wrongPrivateVisibility?'public':'private',
        private:!wrongPrivateVisibility,archived:false,disabled:false};
      throw new Error('unexpected synthetic repo');
    },
    async getBranchRef(repo) {
      if(repo===PUBLIC)return ref(sourceDrift&&blobRead?'d'.repeat(40):HEAD);
      if(!privateBranch)throw new GitHubError(404);
      return ref(DEST_HEAD);
    },
    async getGitCommit(repo,head) {
      if(repo===PUBLIC) {
        assert.equal(head,HEAD);
        return {sha:head,tree:{sha:SOURCE_TREE}};
      }
      assert.equal(head,DEST_HEAD);
      return {sha:head,tree:{sha:DEST_TREE}};
    },
    async getGitTree(repo,tree) {
      if(repo===PUBLIC)return {sha:SOURCE_TREE,truncated:false,tree:[
        {path:'README.md',sha:'e'.repeat(40),type:'blob',
          mode:'100644',size:60},
        ...sourceRows.map(({bytes,...meta})=>meta)
      ]};
      assert.equal(tree,DEST_TREE);
      return {sha:DEST_TREE,truncated:false,
        tree:destRows.map(({bytes,...meta})=>meta)};
    },
    async getGitBlob(repo,digest) {
      blobRead=true;
      const rowsForRepo=repo===PUBLIC?sourceRows:destRows;
      const found=rowsForRepo.find(x=>x.sha===digest);
      assert.ok(found);
      return {sha:digest,size:found.bytes.length,encoding:'base64',
        content:badBlob&&repo===PUBLIC
          ? Buffer.from('corrupted bytes').toString('base64')
          : found.bytes.toString('base64')+'\n'};
    },
    async createClaim(){remoteWrites++;throw Error('unexpected remote mutation');}
  };
  return {api,rows,writeCount:()=>remoteWrites};
}
async function temp(t) {
  const dir=await mkdtemp(join(tmpdir(),'vs-ledger-owner-export-'));
  t.after(async()=>rm(dir,{recursive:true,force:true}));
  return {dir,file:join(dir,'local-backup.json')};
}
const input=(api,file)=>({
  api,destination:PRIVATE,acknowledgedDestination:PRIVATE,
  output:file,confirm:true
});

test('GET-only export writes verified 7 historical blobs into new private local file',async t=>{
  const {file}=await temp(t),mock=fake();
  const report=await exportVerifiedLocalLedgerBackup(input(mock.api,file));
  assert.equal(report.owner_file_created,true);
  assert.equal(report.source_checkpoint_verified,true);
  assert.equal(report.destination_private_visibility_verified,true);
  assert.equal(report.destination_branch_exists,false);
  assert.equal(report.historical_submissions,7);
  assert.equal(report.destination_records,0);
  assert.equal(report.conflicting_records,0);
  assert.equal(report.github_writes,0);
  assert.equal(report.migration_performed,false);
  assert.equal(report.full_git_repository_backup,false);
  assert.equal(mock.writeCount(),0);
  const bytes=await readFile(file);
  const artifact=JSON.parse(bytes.toString('utf8'));
  assert.equal(artifact.schema_version,'1-offline-ledger-backups');
  assert.equal(artifact.source.records.length,7);
  assert.equal(artifact.destination.head_sha,null);
  const review=rehearseLedgerBackups(artifact);
  assert.equal(review.records.would_copy,7);
  assert.equal(review.local_git_blob_integrity_verified,true);
  assert.equal(review.ready_to_migrate,false);
  assert.doesNotMatch(JSON.stringify(report),/owner\/|confidential-synthetic|local-backup/);
  if(process.platform!=='win32') {
    const mode=(await stat(file)).mode&0o777;
    assert.equal(mode,0o600);
  }
});

test('export compares existing PRIVATE destination submitted blobs by byte exact SHA',async t=>{
  const {file}=await temp(t),m=fake();
  const one=m.rows[0];
  const mock=fake({privateBranch:true,privateRecords:[one]});
  const result=await exportVerifiedLocalLedgerBackup(input(mock.api,file));
  assert.equal(result.destination_branch_exists,true);
  assert.equal(result.destination_records,1);
  assert.equal(result.identical_records,1);
  assert.equal(result.conflicting_records,0);
  const manifest=JSON.parse(await readFile(file,'utf8'));
  assert.equal(manifest.destination.records[0].git_blob_sha,one.sha);
  assert.equal(manifest.destination.head_sha,DEST_HEAD);
  assert.equal(rehearseLedgerBackups(manifest).records.identical,1);
});

test('preexisting output file never overwritten and private source is never accessed',async t=>{
  const {file}=await temp(t);
  await writeFile(file,'OWNER DATA NEVER OVERWRITTEN');
  let githubReads=0;
  const api={getRepository:async()=>{githubReads++;throw Error('must not read');}};
  await assert.rejects(()=>exportVerifiedLocalLedgerBackup(input(api,file)),
    /output already exists/);
  assert.equal(await readFile(file,'utf8'),'OWNER DATA NEVER OVERWRITTEN');
  assert.equal(githubReads,0);
});

test('malformed, symlink and in-checkout output paths are refused before API requests',async t=>{
  const {file,dir}=await temp(t);
  let reads=0;
  const api={getRepository:async()=>{reads++;throw Error('must not read');}};
  for(const path of ['relative-output.json',
    fileURLToPath(new URL('../config/still-no-output.json',import.meta.url))]) {
    await assert.rejects(()=>exportVerifiedLocalLedgerBackup(input(api,path)),
      /absolute JSON|outside the public checkout/);
  }
  const link=join(dir,'symlink.json');
  await writeFile(file,'ALREADY EXISTS');
  await symlink(file,link);
  await assert.rejects(()=>exportVerifiedLocalLedgerBackup(input(api,link)),
    /output already exists/);
  assert.equal(reads,0);
});

test('bad Git blob bytes, source head drift or public destination fail without writing',async t=>{
  const {file}=await temp(t);
  for(const options of [
    {badBlob:true},{sourceDrift:true},{wrongPrivateVisibility:true}
  ]) {
    const mock=fake(options);
    await assert.rejects(()=>exportVerifiedLocalLedgerBackup(input(mock.api,file)));
    await assert.rejects(()=>stat(file),{code:'ENOENT'});
    assert.equal(mock.writeCount(),0);
  }
});

test('missing approval or missing GitHub method blocks without creating files',async t=>{
  const {file}=await temp(t);
  const a=fake();
  await assert.rejects(()=>exportVerifiedLocalLedgerBackup({
    ...input(a.api,file),confirm:false
  }),/explicit --confirm/);
  await assert.rejects(()=>exportVerifiedLocalLedgerBackup({
    ...input(a.api,file),acknowledgedDestination:'owner/wrong-name'
  }),/activation blocked/);
  const api={...a.api};delete api.getGitBlob;
  await assert.rejects(()=>exportVerifiedLocalLedgerBackup(input(api,file)),
    /read-only GitHub methods unavailable/);
  await assert.rejects(()=>stat(file),{code:'ENOENT'});
});

test('CLI no-token run never writes output and gives generic credential error',async t=>{
  const {file}=await temp(t);
  const cli=fileURLToPath(new URL('../bin/vs-agent.mjs',import.meta.url));
  const env={...process.env,VS_PRIVATE_LEDGER_APPROVED_REPO:PRIVATE};
  delete env.GITHUB_TOKEN;
  const x=spawnSync(process.execPath,[cli,
    'export-verified-ledger',PRIVATE,'--output',file,'--confirm'],{
    encoding:'utf8',env,timeout:15000
  });
  assert.equal(x.status,1);
  assert.match(x.stderr,/GITHUB_TOKEN is required/);
  assert.equal(x.stdout,'');
  await assert.rejects(()=>stat(file),{code:'ENOENT'});
});
