import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeGitHubClient} from '../src/github.mjs';

// Synthetic GitHub Git Database responses: no network or real ledger data.
const repo='example-synthetic/private-ledger',commit='a'.repeat(40);
const tree='b'.repeat(40),recordPath='claims/example__synthetic/issue-123.json';
const record={state:'claimed',target_repository:'example/synthetic',issue_number:123};
const hash=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const ok=data=>({ok:true,status:200,json:async()=>data});
const defaultBytes=Buffer.from(JSON.stringify(record));
const entry=(path=recordPath,bytes=defaultBytes)=>({
  path,mode:'100644',type:'blob',sha:hash(bytes),size:bytes.length
});
const directory=path=>({path,mode:'040000',type:'tree',sha:tree});
function synthetic({entries=[directory('claims'),directory('claims/example__synthetic'),entry()],
  bytes=defaultBytes,blobChanges={},truncated=false}={}) {
  const calls=[];
  const api=makeGitHubClient({token:'synthetic-only',fetchImpl:async(url,options)=>{
    calls.push({url,method:options.method});
    if(url.includes('/git/ref/heads/'))return ok({object:{sha:commit}});
    if(url.includes('/git/commits/'))return ok({tree:{sha:tree}});
    if(url.includes('/git/trees/'))return ok({truncated,tree:entries});
    if(url.includes('/git/blobs/')){
      const selected=entries.find(item=>url.endsWith('/'+item.sha));
      return ok({...{sha:selected?.sha,size:bytes.length,encoding:'base64',
        content:bytes.toString('base64')},...blobChanges});
    }
    throw new Error('Unexpected URL in fixture: '+url);
  }});
  return {api,calls};
}
const read=async api=>api.getLedgerSnapshot(repo,'coordination/claims');

test('well-formed pinned tree permits expected folders and unrelated public files',async()=>{
  const x=synthetic({entries:[
    directory('claims'),directory('claims/example__synthetic'),entry(),
    {path:'README.md',mode:'100644',type:'blob',sha:'f'.repeat(40),size:4}
  ]});
  const result=await read(x.api);
  assert.deepEqual(result.entries,[{path:recordPath,sha:hash(defaultBytes),data:record}]);
  assert.equal(x.calls.length,4);
  assert.ok(x.calls.every(c=>c.method==='GET'));
});
test('unknown reserved-path records, gitlinks and symbolic links fail BEFORE blob reads',async()=>{
  const weird=[
    {...entry(),path:'claims/example__synthetic/other.json'},
    {...entry(),path:'claims/example__synthetic/issue-123.json/extra'},
    {...entry(),mode:'120000'},
    {...entry(),type:'commit',mode:'160000'},
    {...directory('claims/example__synthetic/issue-123.json'),mode:'040000'},
    {...directory('Claims')},
    {...entry(),path:'submissions/example__synthetic/issue-0.json'}
  ];
  for(const file of weird) {
    const x=synthetic({entries:[directory('claims'),file]});
    await assert.rejects(()=>read(x.api),
      /Ledger contains unexpected record path, mode or metadata/);
    assert.equal(x.calls.filter(c=>c.url.includes('/git/blobs/')).length,0);
  }
});
test('case aliases for the same reserved record fail before data reads',async()=>{
  const x=synthetic({entries:[entry(),{...entry(),path:recordPath.toUpperCase()}]});
  await assert.rejects(()=>read(x.api),/duplicate or case-conflicting/);
  assert.equal(x.calls.filter(c=>c.url.includes('/git/blobs/')).length,0);
});
test('non-blob record bytes, SHA mismatch and corrupt base64 stop pinned snapshot',async()=>{
  const cases=[
    {blobChanges:{sha:'e'.repeat(40)}},
    {blobChanges:{size:defaultBytes.length+1}},
    {blobChanges:{content:'!invalid+base64!'}},
    {bytes:Buffer.from(JSON.stringify({...record,issue_number:999}))},
    {bytes:Buffer.from([0xff,0xfe,0xfd])}
  ];
  for(const config of cases) {
    const x=synthetic(config);
    await assert.rejects(()=>read(x.api),
      /Git blob metadata differs|Invalid Git blob base64|Git blob content does not match|Ledger record is not valid/);
  }
});
test('valid hash but invalid JSON fails closed instead of yielding phantom empty state',async()=>{
  const bytes=Buffer.from('not json');
  const x=synthetic({entries:[entry(recordPath,bytes)],bytes});
  await assert.rejects(()=>read(x.api),/Ledger record is not valid UTF-8 JSON/);
});
test('truncated or structurally malformed tree cannot be used for fleet readiness',async()=>{
  const x=synthetic({truncated:true});
  await assert.rejects(()=>read(x.api),/truncated or malformed/);
});
