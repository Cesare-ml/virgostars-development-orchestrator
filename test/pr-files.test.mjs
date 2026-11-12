import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGitHubClient,GitHubError} from '../src/github.mjs';

const ok=value=>({ok:true,status:200,json:async()=>value});
const hundred=Array.from({length:100},(_,i)=>({
  filename:'test/part-'+i+'.mjs',status:'added'
}));
test('changed-file fetching reads next page and then stops',async()=>{
  const urls=[];
  const api=makeGitHubClient({token:'synthetic-test',fetchImpl:async(url,options)=>{
    urls.push({url,method:options.method});
    if(url.includes('page=1'))return ok(hundred);
    if(url.includes('page=2'))return ok([{filename:'test/final.mjs',status:'added'}]);
    throw new Error('Should not request another page');
  }});
  const result=await api.getPullRequestFiles('owner/repo',9);
  assert.equal(result.length,101);
  assert.equal(urls.length,2);
  assert.ok(urls.every(x=>x.method==='GET'));
});
test('incomplete or unbounded changed-file pages fail closed',async()=>{
  const tooMany=makeGitHubClient({token:'synthetic-test',fetchImpl:async()=>ok(hundred)});
  await assert.rejects(()=>tooMany.getPullRequestFiles('owner/repo',9),/Too many changed files/);
  const malformed=makeGitHubClient({token:'synthetic-test',fetchImpl:async()=>ok({foo:'bar'})});
  await assert.rejects(()=>malformed.getPullRequestFiles('owner/repo',9),/Malformed/);
});
test('403 on later page does not produce partial PR audit results',async()=>{
  const api=makeGitHubClient({token:'synthetic-test',fetchImpl:async url=>
    url.includes('page=1')?ok(hundred):{ok:false,status:403}
  });
  await assert.rejects(()=>api.getPullRequestFiles('owner/repo',9),GitHubError);
});
test('invalid PR number is rejected before a GitHub request',async()=>{
  let called=false;
  const api=makeGitHubClient({token:'synthetic-test',fetchImpl:async()=>{
    called=true;return ok([]);
  }});
  await assert.rejects(()=>api.getPullRequestFiles('owner/repo',0),/Invalid PR number/);
  await assert.rejects(()=>api.getPullRequest('owner/repo',0),/Invalid PR number/);
  assert.equal(called,false);
});
