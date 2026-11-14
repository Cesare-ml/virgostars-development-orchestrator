import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGitHubClient,GitHubError} from '../src/github.mjs';
import {createHash} from 'node:crypto';

const commit='a'.repeat(40),tree='b'.repeat(40);
const path='submissions/Cesare-ml__astrological-charts/issue-23.json';
const marker={state:'submitted',target_repository:'Cesare-ml/astrological-charts',
 issue_number:23,session_id:'chat-test',role:'reviewer'};
const markerBytes=Buffer.from(JSON.stringify(marker));
const blob=createHash('sha1').update('blob '+markerBytes.length+'\0').update(markerBytes).digest('hex');
const ok=x=>({ok:true,status:200,json:async()=>x});
function client({truncated=false,failPath=null}={}) {
 const paths=[];
 const api=makeGitHubClient({token:'unit-test',fetchImpl:async(url,options)=>{
  paths.push({url,method:options.method});
  if(failPath && url.includes(failPath))return {ok:false,status:403};
  if(url.includes('/git/ref/heads/'))return ok({object:{type:'commit',sha:commit}});
  if(url.includes('/git/commits/'))return ok({tree:{sha:tree}});
  if(url.includes('/git/trees/'))return ok({truncated,tree:[
   {path,type:'blob',mode:'100644',sha:blob,size:markerBytes.length},
   {path:'README.md',type:'blob',sha:'f'.repeat(40),size:200}
  ]});
  if(url.includes('/git/blobs/'))return ok({
   sha:blob,size:markerBytes.length,encoding:'base64',content:markerBytes.toString('base64')});
  throw new Error('Unexpected GitHub URL: '+url);
 }});
 return {api,paths};
}
test('fleet ledger snapshot reads every relevant file from same immutable commit',async()=>{
 const {api,paths}=client();
 const result=await api.getLedgerSnapshot('Cesare-ml/virgostars-development-orchestrator','coordination/claims');
 assert.equal(result.head,commit);
 assert.equal(result.entries.length,1);
 assert.equal(result.entries[0].path,path);
 assert.deepEqual(result.entries[0].data,marker);
 assert.equal(paths.length,5);
 assert.equal(paths.filter(x=>x.url.includes('/git/ref/heads/')).length,2);
 assert.ok(paths.every(x=>x.method==='GET'));
 assert.ok(paths.some(x=>x.url.includes('/git/commits/'+commit)));
 assert.ok(paths.some(x=>x.url.includes('/git/blobs/'+blob)));
});
test('truncated tree refuses to report partial fleet state',async()=>{
 const {api}=client({truncated:true});
 await assert.rejects(()=>api.getLedgerSnapshot('a/b','coordination/claims'),/truncated/);
});
test('permission failure stops snapshot rather than pretending empty task list',async()=>{
 const {api}=client({failPath:'/git/blobs/'});
 await assert.rejects(()=>api.getLedgerSnapshot('a/b','coordination/claims'),GitHubError);
});
