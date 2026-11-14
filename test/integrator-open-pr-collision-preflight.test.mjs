import test from 'node:test';
import assert from 'node:assert/strict';
import {auditIntegratorOpenPrCollisions} from '../src/integrator-open-pr-collision-preflight.mjs';

const REPO='Cesare-ml/virgostars-development-orchestrator';
const HEAD='a'.repeat(40),BASE='b'.repeat(40),OTHER='c'.repeat(40);
const clone=v=>structuredClone(v);
function makePr(number,head=OTHER,filename='src/peer-'+number+'.mjs') {
  return {
    number,state:'open',draft:false,merged:false,changed_files:1,
    head:{sha:head,ref:'feat/branch-'+number,repo:{full_name:REPO}},
    base:{sha:BASE,ref:'main',repo:{full_name:REPO}},
    filename
  };
}
function fixture(count=2) {
  const prs=[makePr(12,HEAD,'src/target.mjs')];
  for(let n=13;n<12+count;n++)prs.push(makePr(n));
  const s={
    prs,files:new Map(prs.map(p=>[p.number,[{filename:p.filename,status:'added'}]])),
    requests:[],inventoryReads:0,driftInventory:false,driftDetail:false,
    failingPath:null
  };
  return s;
}
function fakeFetch(s) {
  return async (url,opts)=>{
    const u=new URL(url);
    const path=u.pathname;
    s.requests.push({path,method:opts.method,
      authorization:opts.headers.Authorization,redirect:opts.redirect});
    if(path===s.failingPath) return {ok:false,status:403};
    const prefix='/repos/'+REPO+'/pulls';
    let data;
    if(path===prefix){
      const page=Number(u.searchParams.get('page')||1);
      if(page===1)s.inventoryReads++;
      let prs=s.prs;
      if(s.driftInventory&&s.inventoryReads>=2)
        prs=[...prs,makePr(9999,OTHER,'src/new-pr.mjs')];
      data=prs.slice((page-1)*100,page*100).map(p=>{
        const {filename,...summary}=p;
        return clone(summary);
      });
    } else if(path.startsWith(prefix+'/')){
      const match=path.slice(prefix.length+1).match(/^(\d+)(?:\/files)?$/);
      if(!match)throw Error('unexpected GitHub URL '+path);
      const id=Number(match[1]),pr=s.prs.find(p=>p.number===id);
      if(!pr)throw Error('unexpected PR '+id);
      if(path.endsWith('/files')) {
        const files=s.files.get(id)||[];
        const page=Number(u.searchParams.get('page')||1);
        data=clone(files.slice((page-1)*100,page*100));
      }else {
        const {filename,...detail}=pr;
        data=clone(detail);
        if(s.driftDetail&&id===13)data.head.sha='d'.repeat(40);
      }
    } else throw Error('unexpected path '+path);
    return {ok:true,status:200,json:async()=>data};
  };
}
async function scan(s,overrides={}) {
  return auditIntegratorOpenPrCollisions({
    repository:REPO,prNumber:12,expectedHeadSha:HEAD,
    token:'synthetic-credential',fetchImpl:fakeFetch(s),...overrides
  });
}
test('no competing changed paths stays a non-authorizing candidate',async()=>{
  const s=fixture();
  const x=await scan(s);
  assert.equal(x.verdict,'candidate');
  assert.equal(x.scanned_open_prs,2);
  assert.equal(x.scanned_files,2);
  assert.equal(x.collision_count,0);
  assert.equal(x.merge_authorized,false);
  assert.equal(x.merge_executed,false);
  assert.equal(x.private_integrator_claim_verified,false);
  assert.equal(s.inventoryReads,2);
  assert.ok(s.requests.every(x=>x.method==='GET'&&
    x.authorization==='Bearer synthetic-credential'));
});
test('a normal file collision blocks the same path in two open PRs',async()=>{
  const s=fixture();
  s.files.set(13,[{filename:'src/target.mjs',status:'modified'}]);
  const x=await scan(s);
  assert.equal(x.verdict,'blocked');
  assert.deepEqual(x.collisions,[{
    pr_number:13,head_sha:OTHER,conflicting_paths:['src/target.mjs']
  }]);
  assert.equal(x.merge_authorized,false);
});
test('a rename source collision blocks even with a harmless new name',async()=>{
  const s=fixture();
  s.files.set(13,[{
    filename:'docs/renamed.mjs',status:'renamed',previous_filename:'src/target.mjs'
  }]);
  const x=await scan(s);
  assert.equal(x.verdict,'blocked');
  assert.equal(x.collisions[0].conflicting_paths[0],'src/target.mjs');
});
test('a target rename old path also participates in the collision scan',async()=>{
  const s=fixture();
  s.files.set(12,[{
    filename:'src/new-target.mjs',status:'renamed',previous_filename:'src/old-target.mjs'
  }]);
  s.files.set(13,[{filename:'src/old-target.mjs',status:'modified'}]);
  const x=await scan(s);
  assert.equal(x.verdict,'blocked');
  assert.deepEqual(x.collisions[0].conflicting_paths,['src/old-target.mjs']);
});
test('case-folded paths are overlapping across branches',async()=>{
  const s=fixture();
  s.files.set(13,[{filename:'SRC/TARGET.mjs',status:'modified'}]);
  const x=await scan(s);
  assert.equal(x.collision_count,1);
});
test('101 open PRs are included across both complete pagination passes',async()=>{
  const s=fixture(101);
  const x=await scan(s);
  assert.equal(x.scanned_open_prs,101);
  assert.equal(x.scanned_files,101);
  assert.equal(x.collision_count,0);
  assert.equal(s.requests.filter(x=>x.path==='/repos/'+REPO+'/pulls').length,4);
});
test('more than 200 open PRs blocks instead of trusting a partial inventory',async()=>{
  const s=fixture(201);
  await assert.rejects(()=>scan(s),/Too many open PRs/);
});
test('missing original filename of a rename blocks incomplete file evidence',async()=>{
  const s=fixture();
  s.files.set(13,[{filename:'src/safe.mjs',status:'renamed'}]);
  await assert.rejects(()=>scan(s),/unknown\/unsafe changed-file metadata/);
});
test('truncated file list blocks before any candidate decision',async()=>{
  const s=fixture();s.files.set(13,[]);
  await assert.rejects(()=>scan(s),/incomplete changed-file pagination/);
});
test('two case-equivalent files in one PR block',async()=>{
  const s=fixture();
  s.prs[1].changed_files=2;
  s.files.set(13,[
    {filename:'src/peer.mjs',status:'added'},
    {filename:'SRC/PEER.mjs',status:'modified'}
  ]);
  await assert.rejects(()=>scan(s),/duplicate changed filenames/);
});
test('PR detail HEAD drift from open inventory is fatal',async()=>{
  const s=fixture();s.driftDetail=true;
  await assert.rejects(()=>scan(s),/drifted between inventory and details/);
});
test('new open PR appearing during the scan is a fatal race',async()=>{
  const s=fixture();s.driftInventory=true;
  await assert.rejects(()=>scan(s),/open PR inventory changed/);
});
test('target PR disappearing from initial open inventory blocks',async()=>{
  const s=fixture();s.prs=s.prs.filter(p=>p.number!==12);
  await assert.rejects(()=>scan(s),/target PR not present/);
});
test('target PR head cannot differ from exact owner-pinned expected head',async()=>{
  const s=fixture();
  await assert.rejects(()=>scan(s,{expectedHeadSha:OTHER}),/target PR SHA changed/);
});
test('GitHub permission denial propagates as a non-merging failure',async()=>{
  const s=fixture();s.failingPath='/repos/'+REPO+'/pulls/13/files';
  await assert.rejects(()=>scan(s),err=>{
    assert.match(err.message,/HTTP 403/);
    assert.doesNotMatch(err.message,/synthetic-credential/);
    return true;
  });
});
test('invalid scope fails before GitHub reads',async()=>{
  const s=fixture();
  for(const params of [
    {repository:'unsafe/../repo'},
    {prNumber:0},
    {expectedHeadSha:'bad'}
  ])await assert.rejects(()=>scan(s,params),/missing approved target/);
  assert.equal(s.requests.length,0);
});
