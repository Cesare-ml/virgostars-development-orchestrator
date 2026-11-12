import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {
  RECEIPT_SCHEMA,buildNativeValidationReceipt,inspectNativeValidationReceipt,
  readNativeValidationReceipt,saveNativeValidationReceipt
} from '../src/validation-receipt.mjs';

const HEAD='a'.repeat(40),TREE='b'.repeat(40);
const specimen=(patch={})=>({
  repository:'Cesare-ml/virgostars-development-orchestrator',
  branch:'feat/distributed-agent-coordination-v0',
  head_sha:HEAD,tree_sha:TREE,verified_files:50,verified_bytes:250000,
  tests:{command:'npm run check',exit_code:0,passed:true,native:true},
  GITHUB_TOKEN:'never-included',downloadedSource:'never-included',
  ...patch
});
const build=(data=specimen())=>buildNativeValidationReceipt(data,{
  nodeVersion:'v22.16.0',completedAt:'2026-11-12T18:00:00.000Z'
});
test('builds strictly allowlisted unsigned evidence, not a merge approval',()=>{
  const receipt=build();
  assert.equal(receipt.schema,RECEIPT_SCHEMA);
  assert.equal(receipt.head_sha,HEAD);
  assert.equal(receipt.tests_passed,true);
  assert.equal(receipt.exit_code,0);
  assert.equal(receipt.unsigned,true);
  assert.equal(receipt.independent_review,'pending');
  assert.equal(receipt.merge_authorized,false);
  assert.doesNotMatch(JSON.stringify(receipt),/never-included|GITHUB_TOKEN|downloadedSource/);
  const result=inspectNativeValidationReceipt(receipt,{expectedSha:HEAD});
  assert.equal(result.receipt_valid,true);
  assert.equal(result.recorded_tests_passed,true);
  assert.equal(result.independently_authenticated,false);
  assert.equal(result.native_tests_independently_reproduced,false);
  assert.equal(result.merge_authorized,false);
});
test('failed npm exit is explicitly recorded as failed and never reported as passed',()=>{
  const receipt=build(specimen({tests:{
    command:'npm run check',exit_code:7,passed:false,native:true
  }}));
  assert.equal(receipt.tests_passed,false);
  assert.equal(receipt.exit_code,7);
  const review=inspectNativeValidationReceipt(receipt,{expectedSha:HEAD});
  assert.equal(review.recorded_tests_passed,false);
  assert.equal(review.recorded_exit_code,7);
});
test('refuses contradictory, forged or non-native outcomes',()=>{
  assert.throws(()=>build(specimen({tests:{
    command:'npm run check',exit_code:5,passed:true,native:true
  }})),/inconsistent native test/);
  assert.throws(()=>build(specimen({tests:{
    command:'npm run check',exit_code:0,passed:true,native:false
  }})),/completed pinned native/);
  assert.throws(()=>build(specimen({head_sha:'invalid'})),/invalid Git commit/);
  assert.throws(()=>build(specimen({repository:'attacker/other'})),/pinned native/);
});
test('offline receipt verification rejects mismatched SHA, unexpected fields and fake approval',()=>{
  const r=build();
  assert.throws(()=>inspectNativeValidationReceipt(r,{
    expectedSha:'c'.repeat(40)}),/does not match/);
  assert.throws(()=>inspectNativeValidationReceipt({...r,GITHUB_TOKEN:'secret'},{
    expectedSha:HEAD}),/extra fields/);
  assert.throws(()=>inspectNativeValidationReceipt({...r,merge_authorized:true},{
    expectedSha:HEAD}),/untrusted approval/);
  assert.throws(()=>inspectNativeValidationReceipt({...r,tests_passed:false},{
    expectedSha:HEAD}),/inconsistent native test/);
});
test('atomic write, non-overwrite guarantee and no leftover temp files',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'vs-receipt-check-'));
  const path=join(directory,'result.json');
  try {
    await saveNativeValidationReceipt(path,build());
    const actual=JSON.parse(await readFile(path,'utf8'));
    assert.equal(actual.head_sha,HEAD);
    assert.equal((await readNativeValidationReceipt(path,{expectedSha:HEAD})).receipt_valid,true);
    await assert.rejects(()=>saveNativeValidationReceipt(path,build()),e=>e?.code==='EEXIST');
    assert.deepEqual(await readdir(directory),['result.json']);
    assert.equal(JSON.parse(await readFile(path,'utf8')).head_sha,HEAD);
    if(process.platform!=='win32') {
      const info=await stat(path);
      assert.equal(info.mode&0o077,0);
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('bad destination, missing directory and invalid contents cannot produce a success receipt',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'vs-receipt-errors-'));
  try {
    await assert.rejects(()=>saveNativeValidationReceipt(join(directory,'result.txt'),build()),/\.json/);
    await assert.rejects(()=>saveNativeValidationReceipt(
      join(directory,'absent','result.json'),build()),e=>e?.code==='ENOENT');
    assert.deepEqual(await readdir(directory),[]);
    const corrupted=join(directory,'corrupted.json');
    await writeFile(corrupted,'{oops');
    await assert.rejects(()=>readNativeValidationReceipt(corrupted,{expectedSha:HEAD}),/not valid JSON/);
    const oversized=join(directory,'oversized.json');
    await writeFile(oversized,'x'.repeat(5000));
    await assert.rejects(()=>readNativeValidationReceipt(oversized,{expectedSha:HEAD}),/size limit/);
    await assert.rejects(()=>readNativeValidationReceipt(corrupted,{expectedSha:'NOT_SHA'}),/requires --sha/);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('offline CLI reads receipt with no GitHub token or network requests',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'vs-receipt-cli-'));
  const path=join(directory,'operator.json');
  const script=fileURLToPath(new URL('../scripts/verify-pilot.mjs',import.meta.url));
  try {
    await saveNativeValidationReceipt(path,build());
    const env={...process.env};
    delete env.GITHUB_TOKEN;
    const result=spawnSync(process.execPath,[script,
      '--verify-receipt',path,'--sha',HEAD],{
      encoding:'utf8',env,timeout:15000
    });
    assert.equal(result.status,0,result.stderr);
    const reviewed=JSON.parse(result.stdout);
    assert.equal(reviewed.recorded_head_sha,HEAD);
    assert.equal(reviewed.independently_authenticated,false);
    const wrong=spawnSync(process.execPath,[script,
      '--verify-receipt',path,'--sha','c'.repeat(40)],{
      encoding:'utf8',env,timeout:15000
    });
    assert.equal(wrong.status,1);
    assert.match(wrong.stderr,/does not match expected/);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('offline CLI treats a failing native test receipt as exit code 1',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'vs-receipt-fail-'));
  const path=join(directory,'failed.json');
  try {
    await saveNativeValidationReceipt(path,build(specimen({tests:{
      command:'npm run check',exit_code:2,passed:false,native:true
    }})));
    const script=fileURLToPath(new URL('../scripts/verify-pilot.mjs',import.meta.url));
    const result=spawnSync(process.execPath,[script,
      '--verify-receipt',path,'--sha',HEAD],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).recorded_tests_passed,false);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('CLI rejects writing a receipt without GitHub auth and never creates the file',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'vs-receipt-auth-'));
  const file=join(directory,'must-not-appear.json');
  try {
    const script=fileURLToPath(new URL('../scripts/verify-pilot.mjs',import.meta.url));
    const env={...process.env};
    delete env.GITHUB_TOKEN;
    const result=spawnSync(process.execPath,[script,
      '--sha',HEAD,'--receipt',file],{
      encoding:'utf8',env,timeout:15000
    });
    assert.equal(result.status,1);
    assert.match(result.stderr,/GITHUB_TOKEN required/);
    assert.deepEqual(await readdir(directory),[]);
  } finally {await rm(directory,{recursive:true,force:true});}
});
