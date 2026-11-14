import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBackupRefName, verifyBackupRefPairs, inspectPrivateBackupRef
} from '../src/private-backup-ref-gate.mjs';
import {FROZEN_PUBLIC_LEDGER_HEAD}
  from '../src/private-ledger-activation.mjs';

const SOURCE = 'Cesare-ml/virgostars-development-orchestrator';
const DEST = 'example/owner-private';
const BACKUP = 'backup/reviewed-checkpoint';
const DEST_HEAD = 'b'.repeat(40);
const SOURCE_TREE = 'a'.repeat(40);
const DEST_TREE = 'c'.repeat(40);
const DATA_SHA = 'd'.repeat(40);
const ref = sha => ({object: {type: 'commit', sha}});
const clone = value => structuredClone(value);
const records = () => Array.from({length:7}, (_,i) => ({
  path:'submissions/example__project/issue-'+(i+1)+'.json',
  sha:DATA_SHA, data:{state:'submitted',issue_number:i+1}
}));
const blob = value => ({
  path:value.path, type:'blob', mode:'100644',
  size:100, sha:value.sha
});

function fixture({backupHead=DEST_HEAD, privateVisibility=true} = {}) {
  const calls = [];
  let backupReads = 0;
  const sourceRecords = records();
  const privateRecords = records();
  const api = {
    async getRepository(repo) {
      calls.push('meta');
      return repo===SOURCE
        ? {full_name:SOURCE,private:false,visibility:'public'}
        : {full_name:DEST,private:privateVisibility,
           visibility:privateVisibility?'private':'public',
           archived:false,disabled:false};
    },
    async getBranchRef(repo,branch) {
      calls.push('ref');
      if(repo===SOURCE)return ref(FROZEN_PUBLIC_LEDGER_HEAD);
      if(branch===BACKUP) {
        backupReads++;
        return ref(typeof backupHead==='function'
          ? backupHead(backupReads) : backupHead);
      }
      return ref(DEST_HEAD);
    },
    async getGitCommit(repo) {
      calls.push('commit');
      return repo===SOURCE
        ? {sha:FROZEN_PUBLIC_LEDGER_HEAD,tree:{sha:SOURCE_TREE}}
        : {sha:DEST_HEAD,tree:{sha:DEST_TREE}};
    },
    async getGitTree(repo) {
      calls.push('tree');
      return repo===SOURCE
        ? {sha:SOURCE_TREE,truncated:false,tree:[
            {path:'README.md',type:'blob',mode:'100644',size:20,
             sha:'e'.repeat(40)},
            ...sourceRecords.map(blob)]}
        : {sha:DEST_TREE,truncated:false,tree:privateRecords.map(blob)};
    },
    async getLedgerSnapshot(repo) {
      calls.push('snapshot');
      return repo===SOURCE
        ? {head:FROZEN_PUBLIC_LEDGER_HEAD,entries:clone(sourceRecords)}
        : {head:DEST_HEAD,entries:clone(privateRecords)};
    }
  };
  return {api,calls};
}

const check = (api, extra={}) => inspectPrivateBackupRef({
  api, repository: DEST, acknowledgedRepository: DEST, backupBranch: BACKUP,
  ...extra
});

test('accept only constrained backup/ branch names',()=>{
  assert.equal(validateBackupRefName(BACKUP),BACKUP);
  for(const name of [
    'main','coordination/claims','refs/heads/backup/a','backup/',
    'backup/../claims','backup/.hidden','backup//same','backup/a b',
    'backup/x?foo','BACKUP/--',null,'backup/x'.repeat(40)
  ]) assert.throws(()=>validateBackupRefName(name),/checkpoint blocked/);
});

test('compare stable identical Git commit refs',()=>{
  assert.equal(verifyBackupRefPairs(
    {active:ref(DEST_HEAD),backup:ref(DEST_HEAD)},
    {active:ref(DEST_HEAD),backup:ref(DEST_HEAD)}
  ),true);
});

test('different active and backup commits fail closed',()=>{
  assert.throws(()=>verifyBackupRefPairs(
    {active:ref(DEST_HEAD),backup:ref('f'.repeat(40))},
    {active:ref(DEST_HEAD),backup:ref('f'.repeat(40))}
  ),/does not match/);
});

test('branch ref movement, missing SHA and malformed ref are rejected',()=>{
  const pair={active:ref(DEST_HEAD),backup:ref(DEST_HEAD)};
  assert.throws(()=>verifyBackupRefPairs(pair,{
    active:ref('f'.repeat(40)),backup:ref(DEST_HEAD)
  }),/branch moved/);
  assert.throws(()=>verifyBackupRefPairs(pair,{
    active:ref(DEST_HEAD),backup:ref('f'.repeat(40))
  }),/branch moved/);
  assert.throws(()=>verifyBackupRefPairs(pair,{
    active:{object:{type:'tag',sha:DEST_HEAD}},backup:ref(DEST_HEAD)
  }),/invalid or missing/);
});

test('matching private checkpoint returns private-safe read-only aggregate',async()=>{
  const {api,calls}=fixture();
  const result=await check(api);
  assert.equal(result.backup_ref_matches_active_commit,true);
  assert.equal(result.historical_submissions_preserved,7);
  assert.equal(result.branch_refs_stable_during_check,true);
  assert.equal(result.complete_git_history_backup_verified,false);
  assert.equal(result.ready_to_launch,false);
  assert.equal(result.private_records_modified,false);
  assert.ok(calls.includes('snapshot'));
  assert.deepEqual(Object.keys(api).filter(k=>/post|put|delete|create|update/i.test(k)),[]);
  assert.doesNotMatch(JSON.stringify(result),/example\/|backup\/|[a-f0-9]{40}/);
});

test('wrong approved private repo selection blocks before all API calls',async()=>{
  const {api,calls}=fixture();
  await assert.rejects(()=>check(api,{
    acknowledgedRepository:'example/other'
  }),/activation blocked/);
  assert.equal(calls.length,0);
});

test('wrong backup commit blocks after historical activation',async()=>{
  const {api}=fixture({backupHead:'f'.repeat(40)});
  await assert.rejects(()=>check(api),/does not match/);
});

test('backup branch movement on second scan blocks',async()=>{
  const {api}=fixture({backupHead:n=>n===1?DEST_HEAD:'f'.repeat(40)});
  await assert.rejects(()=>check(api),/branch moved/);
});

test('public destination blocks even when the backup ref matches',async()=>{
  const {api}=fixture({privateVisibility:false});
  await assert.rejects(()=>check(api),/PRIVATE|private/i);
});

test('missing read-only branch access blocks',async()=>{
  await assert.rejects(()=>check({}),/unavailable/);
});
