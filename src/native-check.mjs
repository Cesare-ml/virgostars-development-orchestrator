import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, sep} from 'node:path';
import {spawnSync} from 'node:child_process';

export const PILOT_REPO='Cesare-ml/virgostars-development-orchestrator';
export const PILOT_BRANCH='feat/distributed-agent-coordination-v0';
export const MAX_SNAPSHOT_FILES=150;
export const MAX_SNAPSHOT_BYTES=3_000_000;
const MAX_FILE_BYTES=512_000;
const SHA=/^[0-9a-f]{40}$/i;
const SAFE_PART=/^[A-Za-z0-9_.-]+$/;
const WIN_RESERVED=/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
const B64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const sha=val=>typeof val==='string'&&SHA.test(val);
const fail=message=>{throw new Error(message)};

export function safeTrackedPath(path) {
  if(typeof path!=='string'||path.length<1||path.length>400||
    path.startsWith('/')||path.includes('\\')||path.includes(':'))
    return false;
  return path.split('/').every(part=>SAFE_PART.test(part)&&
    part!=='.'&&part!=='..'&&part.toLowerCase()!=='.git'&&
    !part.endsWith('.')&&!WIN_RESERVED.test(part));
}

/** Reject untrusted git tree features before any file writes. */
export function inspectSnapshotTree(data) {
  if(!data||data.truncated!==false||!Array.isArray(data.tree)||
     !sha(data.sha))fail('Missing, malformed or truncated Git tree.');
  if(data.tree.length>MAX_SNAPSHOT_FILES*3)
    fail('Git tree exceeds the private pilot entry limit.');
  const files=[],seen=new Set(),fileDirs=new Set();
  let total=0;
  for(const item of data.tree) {
    if(!item||!safeTrackedPath(item.path))
      fail('Unsafe file or directory path in Git tree.');
    const folded=item.path.toLowerCase();
    if(seen.has(folded))fail('Duplicate or case-colliding Git tree path.');
    seen.add(folded);
    if(item.type==='tree' && item.mode==='040000') {
      fileDirs.add(folded);
      continue;
    }
    if(item.type!=='blob'||!['100644','100755'].includes(item.mode)||
       !sha(item.sha)||!Number.isSafeInteger(item.size)||item.size<0||
       item.size>MAX_FILE_BYTES)
      fail('Unsupported Git object, symlink, executable type or file size.');
    total+=item.size;
    if(total>MAX_SNAPSHOT_BYTES)fail('Git snapshot exceeds size limit.');
    files.push({path:item.path,sha:item.sha.toLowerCase(),
      size:item.size,mode:item.mode});
    if(files.length>MAX_SNAPSHOT_FILES)fail('Git snapshot has too many files.');
  }
  for(const f of files) {
    const parts=f.path.toLowerCase().split('/');
    for(let i=1;i<parts.length;i++) {
      const parent=parts.slice(0,i).join('/');
      // Git cannot contain a regular blob and its child path, but an
      // adversarial tree payload must not be allowed to overwrite one.
      if(files.some(x=>x.path.toLowerCase()===parent))
        fail('Regular file would collide with child path.');
    }
  }
  if(!files.some(f=>f.path==='package.json')||
     !files.some(f=>f.path==='bin/vs-agent.mjs'))
    fail('Snapshot is missing required private orchestrator entrypoints.');
  return files;
}

export function decodeVerifiedBlob(data,file) {
  if(!data||!sha(data.sha)||data.sha.toLowerCase()!==file.sha||
     data.encoding!=='base64'||!Number.isSafeInteger(data.size)||
     data.size!==file.size||typeof data.content!=='string')
    fail('Git blob metadata does not match pinned tree.');
  const encoded=data.content.replace(/\s+/g,'');
  if(!B64.test(encoded))fail('Invalid Git blob base64.');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length!==file.size)fail('Git blob size mismatch.');
  const actual=createHash('sha1')
    .update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(actual!==file.sha)fail('Git blob SHA-1 mismatch: '+file.path);
  return bytes;
}

/** Performs only known GitHub REST GET requests. Never logs the private token. */
export function createReadOnlyGitHubApi({
  token,fetchImpl=globalThis.fetch,apiRoot='https://api.github.com'
}={}) {
  if(typeof token!=='string'||!token.trim())
    fail('GITHUB_TOKEN required for authenticated private snapshot validation.');
  if(apiRoot!=='https://api.github.com')
    fail('Only the official GitHub API host is permitted.');
  if(typeof fetchImpl!=='function')fail('Fetch implementation is unavailable.');
  const headers={
    'Accept':'application/vnd.github+json',
    'Authorization':'Bearer '+token,
    'X-GitHub-Api-Version':'2022-11-28'
  };
  async function read(path) {
    const response=await fetchImpl(apiRoot+'/repos/'+PILOT_REPO+path,
      {method:'GET',headers,signal:AbortSignal.timeout(30000)});
    if(!response?.ok)
      fail('GitHub read denied or unavailable (HTTP '+(response?.status??'unknown')+').');
    return response.json();
  }
  return {
    getBranch:()=>read('/git/ref/heads/'+PILOT_BRANCH),
    getCommit:id=>sha(id)?read('/git/commits/'+id):fail('Invalid commit SHA.'),
    getTree:id=>sha(id)?read('/git/trees/'+id+'?recursive=1'):fail('Invalid Git tree SHA.'),
    getBlob:id=>sha(id)?read('/git/blobs/'+id):fail('Invalid Git blob SHA.')
  };
}

/** Download pinned tree content and verify every file byte before running. */
export async function writeVerifiedSnapshot({api,root,expectedSha=null}) {
  if(!api||typeof root!=='string'||!root)
    fail('Snapshot API and temporary checkout directory required.');
  const ref=await api.getBranch();
  const head=ref?.object?.sha;
  if(ref?.object?.type!=='commit'||!sha(head))
    fail('GitHub branch does not point to a verified commit SHA.');
  if(expectedSha && (!sha(expectedSha)||head.toLowerCase()!==expectedSha.toLowerCase()))
    fail('Branch HEAD differs from requested SHA: do not run stale tests.');
  const commit=await api.getCommit(head);
  if(!commit||commit.sha!==head||!sha(commit.tree?.sha))
    fail('Git commit/tree metadata does not match the pinned branch.');
  const tree=await api.getTree(commit.tree.sha);
  if(tree?.sha!==commit.tree.sha)
    fail('Returned Git tree SHA does not match the pinned commit.');
  const files=inspectSnapshotTree(tree);
  // Every blob is validated *before* writing to the temporary checkout.
  // Four concurrent reads reduce API load without excessive parallelism.
  for(let i=0;i<files.length;i+=4) {
    const batch=files.slice(i,i+4);
    const contents=await Promise.all(batch.map(async file=>
      decodeVerifiedBlob(await api.getBlob(file.sha),file)));
    for(let j=0;j<batch.length;j++) {
      const file=batch[j],destination=join(root,...file.path.split('/'));
      if(!destination.startsWith(root+sep))fail('Snapshot path escaped temporary root.');
      await mkdir(dirname(destination),{recursive:true});
      await writeFile(destination,contents[j],{flag:'wx',mode:0o600});
    }
  }
  return {repository:PILOT_REPO,branch:PILOT_BRANCH,
    head_sha:head,tree_sha:commit.tree.sha,verified_files:files.length,
    verified_bytes:files.reduce((n,f)=>n+f.size,0)};
}

export function nativeTestEnvironment(env=process.env) {
  const allow=new Set(['PATH','PATHEXT','SYSTEMROOT','WINDIR','COMSPEC',
    'HOME','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','TMPDIR',
    'PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','NPM_CONFIG_CACHE']);
  const safe={CI:'true',FORCE_COLOR:'0'};
  for(const [key,value] of Object.entries(env))
    if(allow.has(key.toUpperCase())&&typeof value==='string')
      safe[key]=value;
  return safe;
}

export function runNativeSuite({root,spawnImpl=spawnSync,env=process.env,
  platform=process.platform,timeoutMs=180000}) {
  if(typeof root!=='string'||!root)fail('Native test root is required.');
  const command=platform==='win32'?'npm.cmd':'npm';
  const child=spawnImpl(command,['run','check'],{
    cwd:root,timeout:timeoutMs,
    stdio:'inherit',shell:platform==='win32',
    env:nativeTestEnvironment(env)
  });
  if(child?.error)fail('Native test runner failed: '+child.error.message);
  if(!Number.isSafeInteger(child?.status))
    fail('Native test runner terminated without a test exit status.');
  return {command:'npm run check',exit_code:child.status,
    passed:child.status===0,native:true};
}

export async function validatePinnedSnapshot({
  api,expectedSha=null,keep=false,
  testRunner=runNativeSuite,temporaryRoot=tmpdir()
}) {
  const root=await mkdtemp(join(temporaryRoot,'vs-pilot-check-'));
  let preserved=false;
  try {
    const snapshot=await writeVerifiedSnapshot({api,root,expectedSha});
    const tests=await testRunner({root});
    preserved=keep===true;
    return {...snapshot,tests,
      temporary_checkout:preserved?root:null,
      note:'Node native tests were executed from individually SHA-verified GitHub blob bytes.'};
  } finally {
    if(!preserved)await rm(root,{recursive:true,force:true});
  }
}
