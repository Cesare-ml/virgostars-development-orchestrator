import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGitHubClient, GitHubError } from '../src/github.mjs';

test('claim uses create-only GitHub Contents operation', async () => {
 let data;
 const api=makeGitHubClient({token:'unit-test',fetchImpl:async(_url,options)=>{
  data=JSON.parse(options.body);
  return {ok:true,status:201,json:async()=>({})};
 }});
 await api.createClaim('Cesare-ml/virgostars-development-orchestrator',
  'claims/Cesare-ml__astrological-charts/issue-42.json','coordination/claims',
  {target_repository:'Cesare-ml/astrological-charts',issue_number:42});
 assert.equal(data.branch,'coordination/claims');
 assert.equal(Object.hasOwn(data,'sha'),false);
});
test('permission failures never look like missing claims',async()=>{
 const api=makeGitHubClient({token:'unit-test',fetchImpl:async()=>({ok:false,status:403})});
 await assert.rejects(()=>api.getClaim('a/b','claims/x.json','coordination/claims'),GitHubError);
});
