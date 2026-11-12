import test from 'node:test';
import assert from 'node:assert/strict';
import {auditOpenPullRequestCollisions,checkOpenPullRequestCollisions}
  from '../src/pr-collisions.mjs';
import {makeGitHubClient,GitHubError} from '../src/github.mjs';

const R='Cesare-ml/astrological-charts';
const H=n=>String(n).repeat(40);
const task={
  repository:R,issue:25,role:'developer',access:'write',status:'ready',
  upstream_pr:22,upstream_branch:'feat/planet-interactions-transit-aspects-20261110',
  resource_scope:{id:'axis-canvas-pilot',roots:['tests/pilot-axis-canvas.browser.test.mjs']}
};
const upstream={number:22,state:'open',changed_files:40,
  head:{sha:H(2)},base:{sha:H(3),ref:'main'}};
const pr=(number,sha)=>({
  number,state:'open',draft:true,changed_files:1,
  head:{sha},base:{sha:H(2),ref:task.upstream_branch}
});
const a=pr(27,H(4)),b=pr(28,H(5));
const files=new Map([
  [27,[{filename:task.resource_scope.roots[0],status:'added'}]],
  [28,[{filename:task.resource_scope.roots[0],status:'added'}]]
]);

test('two open draft PRs on the same authorized file are a visible conflict',()=>{
  const result=checkOpenPullRequestCollisions({
    task,pullRequests:[upstream,a,b],filesByNumber:files
  });
  assert.equal(result.status,'conflict');
  assert.deepEqual(result.candidates.map(x=>x.number),[27,28]);
  assert.deepEqual(result.occupied_paths,[task.resource_scope.roots[0]]);
  assert.equal(result.approved,false);
});
test('upstream branch PR is excluded as the approved base, one result is a candidate',()=>{
  const result=checkOpenPullRequestCollisions({
    task,pullRequests:[upstream,a],filesByNumber:files
  });
  assert.equal(result.status,'single-candidate');
  assert.equal(result.candidates.length,1);
});
test('unrelated PRs do not overlap while renamed previous path is detected',()=>{
  const extra=pr(29,H(6));
  const unrelated=new Map(files);
  unrelated.set(29,[{filename:'docs/README.md',status:'modified'}]);
  let result=checkOpenPullRequestCollisions({
    task,pullRequests:[upstream,extra],filesByNumber:unrelated
  });
  assert.equal(result.status,'no-open-candidates');
  unrelated.set(29,[{
    filename:'tests/new-elsewhere.mjs',
    previous_filename:task.resource_scope.roots[0],
    status:'renamed'
  }]);
  result=checkOpenPullRequestCollisions({
    task,pullRequests:[upstream,extra],filesByNumber:unrelated
  });
  assert.equal(result.status,'single-candidate');
  assert.equal(result.candidates[0].paths[0].path,task.resource_scope.roots[0]);
});
test('folder scope is case-insensitive and detects nested files',()=>{
  const dir={...task,resource_scope:{id:'renderer',roots:['src/Render/']}};
  const changed=new Map([[27,[{filename:'src/render/MODULE.ts',status:'modified'}]]]);
  const result=checkOpenPullRequestCollisions({task:dir,pullRequests:[a],filesByNumber:changed});
  assert.equal(result.status,'single-candidate');
});
test('missing or incomplete changed-file metadata must never certify no conflict',()=>{
  const invalid=checkOpenPullRequestCollisions;
  assert.throws(()=>invalid({task,pullRequests:[a],filesByNumber:new Map()}),/Incomplete/);
  assert.throws(()=>invalid({
    task,pullRequests:[{...a,changed_files:2}],filesByNumber:files
  }),/Incomplete/);
  assert.throws(()=>invalid({
    task,pullRequests:[a,a],filesByNumber:files
  }),/duplicate/);
});
test('live audit checks PR inventory before and after reading changed files',async()=>{
  const first=[upstream,a,b];
  let reads=0;
  const api={
    async getOpenPullRequests(){reads++;return first;},
    async getPullRequest(_r,n){return first.find(x=>x.number===n);},
    async getPullRequestFiles(_r,n){return files.get(n);}
  };
  const x=await auditOpenPullRequestCollisions({api,tasks:[task],repo:R,issue:25});
  assert.equal(x.status,'conflict');
  assert.equal(x.scanned_open_prs,3);
  assert.equal(reads,2);
  const race={...api,async getOpenPullRequests(){
    reads++;return reads%2===0?[upstream,a]:first;
  }};
  await assert.rejects(
    ()=>auditOpenPullRequestCollisions({api:race,tasks:[task],repo:R,issue:25}),
    /set\/HEAD changed/
  );
});
test('permission failure, read-only task and no task fail closed',async()=>{
  const denied={
    async getOpenPullRequests(){throw new GitHubError(403);}
  };
  await assert.rejects(
    ()=>auditOpenPullRequestCollisions({api:denied,tasks:[task],repo:R,issue:25}),
    GitHubError
  );
  await assert.rejects(
    ()=>auditOpenPullRequestCollisions({api:denied,tasks:[task],repo:R,issue:26}),
    /curated write/
  );
  assert.throws(()=>checkOpenPullRequestCollisions({
    task:{...task,access:'read',resource_scope:undefined},
    pullRequests:[a],filesByNumber:files
  }));
});
test('GitHub open PR pagination is bounded and read only',async()=>{
  const twenty=Array.from({length:100},(_,i)=>({...a,number:i+1}));
  const urls=[];
  const api=makeGitHubClient({token:'synthetic',fetchImpl:async(url,opts)=>{
    urls.push({url,method:opts.method});
    return {ok:true,status:200,json:async()=>
      url.includes('page=1')?twenty:[a,b]};
  }});
  const found=await api.getOpenPullRequests(R);
  assert.equal(found.length,102);
  assert.equal(urls.length,2);
  assert.ok(urls.every(x=>x.method==='GET'));
  const fail=makeGitHubClient({token:'synthetic',fetchImpl:async()=>({
    ok:false,status:403
  })});
  await assert.rejects(()=>fail.getOpenPullRequests(R),GitHubError);
});
