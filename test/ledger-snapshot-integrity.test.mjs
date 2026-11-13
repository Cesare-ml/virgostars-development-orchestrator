import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeGitHubClient,inspectLedgerTreeEntries} from '../src/github.mjs';

const HEAD='a'.repeat(40),TREE='b'.repeat(40),ROOT='c'.repeat(40);
const LEDGER='owner/private-ledger-synthetic';
const PATH='claims/example__synthetic/issue-42.json';
const gitSha=bytes=>createHash('sha1')
  .update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const file=(path,bytes)=>({
  path,type:'blob',mode:'100644',sha:gitSha(bytes),size:bytes.length
});
const directory=path=>({path,type:'tree',mode:'040000',sha:ROOT});
const bytes=Buffer.from(JSON.stringify({schema_version:2,state:'claimed',issue_number:42}));
const initial=()=>[
  directory('claims'),directory('claims/example__synthetic'),
  file(PATH,bytes)
];
const copy=x=>structuredClone(x);

test('tree accepts canonical directories and records with no ignored locks',()=>{
  const valid=initial();
  assert.deepEqual(inspectLedgerTreeEntries(valid),[valid[2]]);
  assert.deepEqual(inspectLedgerTreeEntries([]),[]);
});

test('tree rejects symlinks, executable blobs and subtrees at claim paths',()=>{
  for(const variant of [
    {...initial()[2],mode:'120000'},
    {...initial()[2],mode:'100755'},
    {...initial()[2],type:'tree',mode:'040000'},
    {...initial()[0],type:'blob',mode:'100644'}
  ]) {
    const tree=initial();
    tree[variant.path==='claims'?0:2]=variant;
    assert.throws(()=>inspectLedgerTreeEntries(tree),/ledger/i);
  }
});

test('tree rejects case-colliding and noncanonical namespace paths',()=>{
  for(const path of [
    'Claims/example__synthetic/issue-42.json',
    'claims/example__synthetic/issue-042.json',
    'claims/example__synthetic/not-a-claim.json',
    'claims/example__synthetic/issue-42.json/secret',
    'resources/example__synthetic/issue-1.json.bak',
    'submissions/example__synthetic/issue-999999999999999999999.json'
  ]) {
    const tree=[...initial(),file(path,bytes)];
    assert.throws(()=>inspectLedgerTreeEntries(tree),/ledger|record/i,path);
  }
  assert.throws(()=>inspectLedgerTreeEntries([...initial(),copy(initial()[2])]),
    /Duplicate or case-conflicting/);
  assert.throws(()=>inspectLedgerTreeEntries([...initial(),file(PATH.toUpperCase(),bytes)]),
    /Duplicate or case-conflicting/);
});

test('tree rejects unexpected nested folders and unsafe repository directories',()=>{
  const nested=[...initial(),directory('claims/example__synthetic/extra')];
  assert.throws(()=>inspectLedgerTreeEntries(nested),/ledger/i);
  assert.throws(()=>inspectLedgerTreeEntries([
    ...initial(),directory('resources/bad-repository')
  ]),/ledger/i);
});

test('tree rejects oversized or missing metadata before reading bytes',()=>{
  assert.throws(()=>inspectLedgerTreeEntries([{...initial()[2],size:65537}]),/ledger/i);
  assert.throws(()=>inspectLedgerTreeEntries([{...initial()[2],size:null}]),/ledger/i);
  assert.throws(()=>inspectLedgerTreeEntries(Array.from({length:2001},()=>directory('claims'))),
    /inspection limit/);
  assert.throws(()=>inspectLedgerTreeEntries([null]),/metadata/);
});

function syntheticGitHub({tree=initial(),records=new Map([[gitSha(bytes),bytes]]),
                        corruptBlob=null,drift=false,truncated=false}={}) {
  const urls=[],methods=[];
  let refReads=0;
  const fetchImpl=async(url,options)=>{
    urls.push(url);methods.push(options.method);
    let value;
    if(url.endsWith('/git/ref/heads/coordination/claims')) {
      refReads++;
      value={object:{type:'commit',sha:drift&&refReads>1?'d'.repeat(40):HEAD}};
    } else if(url.endsWith('/git/commits/'+HEAD)) {
      value={tree:{sha:TREE}};
    } else if(url.endsWith('/git/trees/'+TREE+'?recursive=1')) {
      value={truncated,tree};
    } else if(url.includes('/git/blobs/')) {
      const sha=url.split('/').at(-1);
      const valueBytes=records.get(sha);
      if(!valueBytes) throw new Error('Unexpected fixture blob request');
      value={sha,size:valueBytes.length,encoding:'base64',
        content:valueBytes.toString('base64')};
      if(corruptBlob)value=corruptBlob(value);
    } else throw new Error('Unexpected fixture endpoint');
    return {ok:true,status:200,json:async()=>value};
  };
  return {api:makeGitHubClient({token:'synthetic-test-token',fetchImpl}),
    urls,methods};
}

test('snapshot pins one commit, verifies exact Git blob content and rechecks ref',async()=>{
  const mock=syntheticGitHub();
  const snapshot=await mock.api.getLedgerSnapshot(LEDGER,'coordination/claims');
  assert.equal(snapshot.head,HEAD);
  assert.equal(snapshot.entries.length,1);
  assert.equal(snapshot.entries[0].path,PATH);
  assert.deepEqual(snapshot.entries[0].data,JSON.parse(bytes.toString('utf8')));
  assert.equal(mock.urls.filter(url=>url.includes('/git/ref/heads/')).length,2);
  assert.ok(mock.methods.every(method=>method==='GET'));
});

test('invalid namespace object is not silently omitted by snapshot fetch',async()=>{
  const tree=initial().map(x=>copy(x));
  tree[2].mode='120000';
  const mock=syntheticGitHub({tree});
  await assert.rejects(
    ()=>mock.api.getLedgerSnapshot(LEDGER,'coordination/claims'),
    /unsafe ledger record object/);
  assert.equal(mock.urls.some(url=>url.includes('/git/blobs/')),false);
});

test('tampered bytes fail exact Git blob hash validation',async()=>{
  const mock=syntheticGitHub({
    corruptBlob:blob=>({...blob,content:Buffer.from('{"state":"forged"}').toString('base64')})
  });
  await assert.rejects(()=>mock.api.getLedgerSnapshot(LEDGER,'coordination/claims'),
    /content length|hash mismatch/);
});

test('malformed base64 and invalid UTF-8 are rejected',async()=>{
  const invalid64=syntheticGitHub({corruptBlob:blob=>({...blob,content:'%%%='})});
  await assert.rejects(()=>invalid64.api.getLedgerSnapshot(LEDGER,'coordination/claims'),
    /Malformed ledger record base64/);

  const raw=Buffer.from([0xff,0xfe,0xfd]);
  const badUtf8=syntheticGitHub({
    tree:[directory('claims'),directory('claims/example__synthetic'),file(PATH,raw)],
    records:new Map([[gitSha(raw),raw]])
  });
  await assert.rejects(()=>badUtf8.api.getLedgerSnapshot(LEDGER,'coordination/claims'),
    /Invalid ledger JSON record/);
});

test('non-object JSON does not count as a valid coordination record',async()=>{
  const raw=Buffer.from('[]');
  const badJson=syntheticGitHub({
    tree:[directory('claims'),directory('claims/example__synthetic'),file(PATH,raw)],
    records:new Map([[gitSha(raw),raw]])
  });
  await assert.rejects(()=>badJson.api.getLedgerSnapshot(LEDGER,'coordination/claims'),
    /must be an object/);
});

test('branch movement during read fails closed',async()=>{
  const mock=syntheticGitHub({drift:true});
  await assert.rejects(()=>mock.api.getLedgerSnapshot(LEDGER,'coordination/claims'),
    /branch moved/);
});

test('truncated Git tree fails closed without fetching record payloads',async()=>{
  const mock=syntheticGitHub({truncated:true});
  await assert.rejects(()=>mock.api.getLedgerSnapshot(LEDGER,'coordination/claims'),
    /truncated or malformed/);
  assert.equal(mock.urls.some(url=>url.includes('/git/blobs/')),false);
});
