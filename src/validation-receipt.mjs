import {randomUUID} from 'node:crypto';
import {open,writeFile,link,unlink} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {
  PILOT_REPO,PILOT_BRANCH,MAX_SNAPSHOT_BYTES,MAX_SNAPSHOT_FILES
} from './native-check.mjs';

export const RECEIPT_SCHEMA='virgostars-native-validation-receipt/v1';
const SHA=/^[0-9a-f]{40}$/i;
const TIMESTAMP=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const fields=[
  'schema','repository','branch','head_sha','tree_sha','verified_files',
  'verified_bytes','node_version','command','exit_code','tests_passed',
  'completed_at','unsigned','independent_review','merge_authorized'
];
function reject(message){throw new Error('Invalid native validation receipt: '+message);}
function sha(x){return typeof x==='string'&&SHA.test(x);}
function exactFields(record){
  return record&&typeof record==='object'&&!Array.isArray(record) &&
    Object.keys(record).length===fields.length &&
    fields.every(key=>Object.hasOwn(record,key));
}
function assertReceipt(data,expectedSha=null) {
  if(!exactFields(data))reject('unexpected, missing, or extra fields');
  if(data.schema!==RECEIPT_SCHEMA ||
     data.repository!==PILOT_REPO || data.branch!==PILOT_BRANCH)
    reject('unexpected schema/repository/branch');
  if(!sha(data.head_sha)||!sha(data.tree_sha) ||
     data.head_sha!==data.head_sha.toLowerCase()||
     data.tree_sha!==data.tree_sha.toLowerCase())
    reject('invalid Git commit/tree hash');
  if(expectedSha!==null&&(!sha(expectedSha)||
     data.head_sha!==expectedSha.toLowerCase()))
    reject('commit SHA does not match expected review target');
  if(!Number.isSafeInteger(data.verified_files)||data.verified_files<2||
     data.verified_files>MAX_SNAPSHOT_FILES ||
     !Number.isSafeInteger(data.verified_bytes)||data.verified_bytes<1||
     data.verified_bytes>MAX_SNAPSHOT_BYTES)
    reject('invalid verified snapshot counts');
  if(typeof data.node_version!=='string'||
     !/^v\d+\.\d+\.\d+$/.test(data.node_version))
    reject('invalid Node version');
  if(data.command!=='npm run check'||
     !Number.isSafeInteger(data.exit_code)||data.exit_code<0||
     data.exit_code>255||typeof data.tests_passed!=='boolean'||
     data.tests_passed!==(data.exit_code===0))
    reject('inconsistent native test command, exit code or outcome');
  if(typeof data.completed_at!=='string'||!TIMESTAMP.test(data.completed_at)||
     Number.isNaN(Date.parse(data.completed_at))||
     new Date(data.completed_at).toISOString()!==data.completed_at)
    reject('invalid completion timestamp');
  if(data.unsigned!==true ||
     data.independent_review!=='pending' ||
     data.merge_authorized!==false)
    reject('untrusted approval or signature claim');
  return data;
}

/** An unsigned, explicitly self-reported evidence receipt, NOT PR approval. */
export function buildNativeValidationReceipt(snapshot,{
  nodeVersion=process.version,completedAt=new Date().toISOString()
}={}) {
  if(!snapshot||!snapshot.tests||snapshot.tests.native!==true ||
     snapshot.repository!==PILOT_REPO||snapshot.branch!==PILOT_BRANCH ||
     snapshot.tests.command!=='npm run check')
    reject('expected a completed pinned native npm run check result');
  const receipt={
    schema:RECEIPT_SCHEMA,
    repository:PILOT_REPO,
    branch:PILOT_BRANCH,
    head_sha:snapshot.head_sha,
    tree_sha:snapshot.tree_sha,
    verified_files:snapshot.verified_files,
    verified_bytes:snapshot.verified_bytes,
    node_version:nodeVersion,
    command:'npm run check',
    exit_code:snapshot.tests.exit_code,
    tests_passed:snapshot.tests.passed,
    completed_at:completedAt,
    unsigned:true,
    independent_review:'pending',
    merge_authorized:false
  };
  return assertReceipt(receipt);
}

export function inspectNativeValidationReceipt(data,{expectedSha=null}={}) {
  const receipt=assertReceipt(data,expectedSha);
  return {
    receipt_valid:true,
    commit_matches_requested_sha:expectedSha!==null,
    recorded_tests_passed:receipt.tests_passed,
    recorded_exit_code:receipt.exit_code,
    recorded_head_sha:receipt.head_sha,
    recorded_tree_sha:receipt.tree_sha,
    recorded_at:receipt.completed_at,
    independently_authenticated:false,
    native_tests_independently_reproduced:false,
    merge_authorized:false,
    caution:'Unsigned local evidence; independently reproduce native tests and review code.'
  };
}

function receiptPath(filename) {
  if(typeof filename!=='string'||!filename.trim()||filename.includes('\0'))
    reject('a local destination path is required');
  const resolved=resolve(filename);
  if(!basename(resolved).toLowerCase().endsWith('.json'))
    reject('destination must be a .json file');
  return resolved;
}

/** Atomic no-overwrite publish via same-directory hardlink. */
export async function saveNativeValidationReceipt(filename,data) {
  const target=receiptPath(filename);
  assertReceipt(data);
  const temporary=join(dirname(target),'.vs-native-receipt-'+randomUUID()+'.tmp');
  try {
    const bytes=JSON.stringify(data,null,2)+'\n';
    await writeFile(temporary,bytes,{flag:'wx',mode:0o600,encoding:'utf8'});
    await link(temporary,target); // EEXIST blocks overwrite even on Windows.
  } finally {
    await unlink(temporary).catch(e=>{if(e?.code!=='ENOENT')throw e;});
  }
  return target;
}

/** Bounded read-only examination, no trust in the receipt's assertions. */
export async function readNativeValidationReceipt(filename,{expectedSha}={}) {
  if(!sha(expectedSha))reject('offline review requires --sha COMMIT_SHA');
  const target=receiptPath(filename);
  // Read at most 4 KiB + 1 byte. Do not load an attacker-controlled large
  // file into memory merely to reject it after reading.
  const handle=await open(target,'r');
  let contents;
  try {
    const buffer=Buffer.alloc(4097);
    const {bytesRead}=await handle.read(buffer,0,buffer.length,0);
    if(bytesRead>4096)reject('receipt exceeds size limit');
    contents=buffer.subarray(0,bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
  let parsed;
  try {parsed=JSON.parse(contents);}
  catch {reject('not valid JSON');}
  return inspectNativeValidationReceipt(parsed,{expectedSha});
}
