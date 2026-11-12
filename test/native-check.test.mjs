import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readdir,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  createReadOnlyGitHubApi,decodeVerifiedBlob,inspectSnapshotTree,
  nativeTestEnvironment,runNativeSuite,safeTrackedPath,
  validatePinnedSnapshot,writeVerifiedSnapshot
} from '../src/native-check.mjs';

const HEAD='a'.repeat(40),TREE='b'.repeat(40);
const gitHash=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const txt=s=>Buffer.from(s,'utf8');
const PACKAGE='{"name":"snapshot-fixture","private":true,"type":"module",'+
  '"scripts":{"check":"node --test"}}\n';
const FILES=[
  ['package.json',txt(PACKAGE)],
  ['bin/vs-agent.mjs',txt("process.stdout.write('sample CLI');\n")],
  ['test/pinned.test.mjs',txt(
    "import test from 'node:test';import assert from 'node:assert/strict';"+
    "test('native snapshot is executable',()=>assert.equal(2+3,5));\n")]
];
function fixture(changes={}) {
 const entries=FILES.map(([path,b])=>({
   path,type:'blob',mode:'100644',sha:gitHash(b),size:b.length
 }));
 const blobs=new Map(FILES.map(([_path,b])=>[gitHash(b),b]));
 let reads=0;
 const api={
   get reads(){return reads;},
   async getBranch(){reads++;return {object:{type:'commit',sha:HEAD}};},
   async getCommit(id){reads++;assert.equal(id,HEAD);return {sha:HEAD,tree:{sha:TREE}};},
   async getTree(id){reads++;assert.equal(id,TREE);
     return {sha:TREE,truncated:false,tree:entries};},
   async getBlob(id){reads++;
     const bytes=blobs.get(id);
     if(!bytes)throw new Error('Unexpected blob '+id);
     return {sha:id,encoding:'base64',size:bytes.length,
       content:bytes.toString('base64')};}
 };
 return {...changes,api,entries,blobs};
}
test('rejects traversal, symlinks, Windows reserved paths and duplicate casefold names',()=>{
 for(const path of ['../src/a','/tmp/leak','src\\evil','C:/temp',
   '.git/config','src/CON','src/COM1.txt','src/.','foo//bar',
   'src/with space.js','src/trailing.'])
   assert.equal(safeTrackedPath(path),false,path);
 assert.equal(safeTrackedPath('.github/pull_request_template.md'),true);
 const {entries}=fixture();
 const base={sha:TREE,truncated:false,tree:entries};
 assert.equal(inspectSnapshotTree(base).length,3);
 assert.throws(()=>inspectSnapshotTree({...base,truncated:true}),/truncated/);
 assert.throws(()=>inspectSnapshotTree({...base,tree:[
   ...entries,{...entries[0],path:'PACKAGE.JSON'}]}),/case-colliding/);
 assert.throws(()=>inspectSnapshotTree({...base,tree:[
   ...entries,{...entries[0],path:'src/link',mode:'120000'}]}),/Unsupported/);
});
test('blob SHA-1 and size must match Git tree (including invalid base64)',()=>{
 const file=fixture().entries[0];
 const bytes=FILES[0][1];
 assert.deepEqual(decodeVerifiedBlob({
   sha:file.sha,encoding:'base64',size:file.size,content:bytes.toString('base64')
 },file),bytes);
 assert.throws(()=>decodeVerifiedBlob({
   sha:file.sha,encoding:'base64',size:file.size,content:'???'
 },file),/base64/);
 const corrupted=Buffer.from(bytes);corrupted[0]^=1;
 assert.throws(()=>decodeVerifiedBlob({
   sha:file.sha,encoding:'base64',size:file.size,
   content:corrupted.toString('base64')
 },file),/SHA-1 mismatch/);
});
test('materializes only exact pinned branch HEAD, checks every file',async()=>{
 const {api}=fixture();
 const root=await mkdtemp(join(tmpdir(),'vs-verified-materialize-'));
 try {
   const result=await writeVerifiedSnapshot({api,root,expectedSha:HEAD});
   assert.equal(result.verified_files,3);
   assert.equal(result.head_sha,HEAD);
   assert.deepEqual(await readFile(join(root,'package.json')),FILES[0][1]);
   assert.deepEqual(await readFile(join(root,'test/pinned.test.mjs')),FILES[2][1]);
   assert.ok(api.reads>=6);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('refuses stale branch SHA before fetching or executing files',async()=>{
 const {api}=fixture();
 const root=await mkdtemp(join(tmpdir(),'vs-verified-stale-'));
 try {
   await assert.rejects(()=>writeVerifiedSnapshot({
     api,root,expectedSha:'c'.repeat(40)
   }),/HEAD differs/);
   assert.deepEqual(await readdir(root),[]);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('snapshot failures clean temporary checkout and do not invoke native runner',async()=>{
 const f=fixture();let invoked=false;
 const realGetBlob=f.api.getBlob;
 f.api.getBlob=async id=>{
   const b=await realGetBlob(id);
   return {...b,content:'AA=='};
 };
 const parent=await mkdtemp(join(tmpdir(),'vs-verified-parent-'));
 try {
   await assert.rejects(()=>validatePinnedSnapshot({
     api:f.api,temporaryRoot:parent,
     testRunner:async()=>{invoked=true;return {passed:true};}
   }),/size mismatch/);
   assert.equal(invoked,false);
   assert.deepEqual(await readdir(parent),[]);
 } finally {await rm(parent,{recursive:true,force:true});}
});
test('successful pinned snapshot runs the REAL native Node test via npm',async()=>{
 const {api}=fixture();
 const parent=await mkdtemp(join(tmpdir(),'vs-verified-native-'));
 try {
   const result=await validatePinnedSnapshot({
     api,expectedSha:HEAD,temporaryRoot:parent
   });
   assert.equal(result.tests.native,true);
   assert.equal(result.tests.passed,true);
   assert.equal(result.tests.exit_code,0);
   assert.equal(result.verified_files,3);
   assert.equal(result.temporary_checkout,null);
   assert.deepEqual(await readdir(parent),[]);
 } finally {await rm(parent,{recursive:true,force:true});}
});
test('npm child sees allowlisted environment but no private credentials',()=>{
 const env=nativeTestEnvironment({
   PATH:'/usr/bin',GITHUB_TOKEN:'very-secret',GH_TOKEN:'also-secret',
   USERPROFILE:'C:\\Users\\test',SOME_OTHER_KEY:'private',NODE_OPTIONS:'--inspect'
 });
 assert.equal(env.PATH,'/usr/bin');
 assert.equal(env.GITHUB_TOKEN,undefined);
 assert.equal(env.GH_TOKEN,undefined);
 assert.equal(env.SOME_OTHER_KEY,undefined);
 assert.equal(env.NODE_OPTIONS,undefined);
 assert.equal(env.CI,'true');
 const native=runNativeSuite({root:'/tmp/mock-root',env:{
   PATH:'/usr/bin',GITHUB_TOKEN:'secret'
 },spawnImpl:(_cmd,args,opt)=>{
   assert.deepEqual(args,['run','check']);
   assert.equal(opt.env.GITHUB_TOKEN,undefined);
   assert.equal(opt.env.CI,'true');
   return {status:1};
 }});
 assert.equal(native.passed,false);
 assert.equal(native.exit_code,1);
});
test('read-only GitHub API refuses token omission, bad commit SHA and HTTP 403',async()=>{
 assert.throws(()=>createReadOnlyGitHubApi({token:''}),/GITHUB_TOKEN/);
 const api=createReadOnlyGitHubApi({token:'fixture-token',
   fetchImpl:async()=>({ok:false,status:403})
 });
 await assert.rejects(()=>api.getBranch(),/HTTP 403/);
 assert.throws(()=>api.getBlob('NOT_SHA'),/Invalid Git blob SHA/);
 assert.throws(()=>api.getTree('NOT_SHA'),/Invalid Git tree SHA/);
});


test('Windows runs npm.cmd via the shell with no GitHub token in the child',()=>{
  let called=false;
  const result=runNativeSuite({
    root:'C:\\safe\\pinned',
    platform:'win32',
    env:{PATH:'C:\\Program Files\\nodejs',GITHUB_TOKEN:'private'},
    spawnImpl:(command,args,options)=>{
      called=true;
      assert.equal(command,'npm.cmd');
      assert.deepEqual(args,['run','check']);
      assert.equal(options.shell,true);
      assert.equal(options.cwd,'C:\\safe\\pinned');
      assert.equal(options.env.GITHUB_TOKEN,undefined);
      return {status:0};
    }
  });
  assert.equal(called,true);
  assert.equal(result.passed,true);
});
test('native test failure is reported without accidentally keeping checkout',async()=>{
  const {api}=fixture();
  const parent=await mkdtemp(join(tmpdir(),'vs-verified-failure-'));
  try {
    const result=await validatePinnedSnapshot({
      api,temporaryRoot:parent,
      testRunner:async()=>({native:true,passed:false,exit_code:7})
    });
    assert.equal(result.tests.exit_code,7);
    assert.equal(result.tests.passed,false);
    assert.equal(result.temporary_checkout,null);
    assert.deepEqual(await readdir(parent),[]);
  } finally {await rm(parent,{recursive:true,force:true});}
});
test('GitHub reader never sends a write request or an unpinned repository path',async()=>{
  const inspected=[];
  const api=createReadOnlyGitHubApi({token:'fake-test-token',fetchImpl:async(url,opts)=>{
    inspected.push({url,method:opts.method,authorization:opts.headers.Authorization});
    return {ok:true,status:200,json:async()=>({object:{type:'commit',sha:HEAD}})};
  }});
  const ref=await api.getBranch();
  assert.equal(ref.object.sha,HEAD);
  assert.equal(inspected.length,1);
  assert.equal(inspected[0].method,'GET');
  assert.equal(inspected[0].authorization,'Bearer fake-test-token');
  assert.match(inspected[0].url,/Cesare-ml\/virgostars-development-orchestrator\/git\/ref\/heads\/feat\/distributed-agent-coordination-v0$/);
});
