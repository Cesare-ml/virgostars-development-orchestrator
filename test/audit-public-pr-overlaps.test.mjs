import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  REPOSITORY,DEFAULT_BASE,createPublicGitHubReader,auditPublicPrOverlaps
} from '../scripts/audit-public-pr-overlaps.mjs';

const HASH=n=>n.toString(16).padStart(40,'0');
const pr=(number,base=DEFAULT_BASE)=>({
  number,state:'open',draft:true,changed_files:1,
  head:{sha:HASH(number),ref:'agent/change-'+number},
  base:{sha:HASH(500),ref:base,repo:{full_name:REPOSITORY}}
});
const file=(filename,status='modified',previous_filename=null)=>({
  filename,status,...(previous_filename?{previous_filename}:{})
});
function mock({
  first=[pr(41),pr(42)],
  second=first,
  files={41:[file('src/core.mjs')],42:[file('docs/guide.md')]},
  identity={full_name:REPOSITORY,private:false,visibility:'public',archived:false}
}={}) {
  let scans=0,reads=0;
  return {
    getRepository:async()=>structuredClone(identity),
    listOpenPullRequests:async()=>structuredClone((++scans===1?first:second)),
    listPullRequestFiles:async(number)=>{
      reads++;
      return structuredClone(files[number]);
    },
    stats:()=>({scans,reads})
  };
}

test('clean snapshot is advisory only, never merge authorization',async()=>{
  const api=mock(),result=await auditPublicPrOverlaps({api});
  assert.equal(result.mode,'public-read-only');
  assert.equal(result.base_prs_checked,2);
  assert.equal(result.overlap_pairs,0);
  assert.deepEqual(result.pairs,[]);
  assert.equal(result.complete,true);
  assert.equal(result.git_writes,0);
  assert.equal(result.merge_authorized,false);
  assert.deepEqual(api.stats(),{scans:2,reads:2});
});

test('case-insensitive path collision identifies exact competing PR pair',async()=>{
  const result=await auditPublicPrOverlaps({api:mock({
    files:{41:[file('Src/Core.mjs')],42:[file('src/core.mjs')]}
  })});
  assert.equal(result.overlap_pairs,1);
  assert.deepEqual(result.pairs,[{prs:[41,42],shared_files:['src/core.mjs']}]);
});

test('renamed source paths as well as destinations block competing edits',async()=>{
  const result=await auditPublicPrOverlaps({api:mock({
    files:{41:[file('src/new.mjs','renamed','src/old.mjs')],
      42:[file('src/old.mjs','modified')]}
  })});
  assert.deepEqual(result.pairs[0].shared_files,['src/old.mjs']);
});

test('nonmatching base PRs are excluded from the comparison',async()=>{
  const api=mock({
    first:[pr(41),pr(42,'main'),pr(43)],
    files:{41:[file('src/shared')],43:[file('src/shared')]}
  });
  const result=await auditPublicPrOverlaps({api});
  assert.equal(result.base_prs_checked,2);
  assert.deepEqual(result.pairs[0].prs,[41,43]);
  assert.deepEqual(api.stats(),{scans:2,reads:2});
});

test('newly added PR invalidates the post-file audit snapshot',async()=>{
  await assert.rejects(()=>auditPublicPrOverlaps({
    api:mock({second:[pr(41),pr(42),pr(43)]})
  }),/inventory changed/);
});

test('changed HEAD, base SHA and draft state invalidate snapshot',async()=>{
  for(const altered of [
    {...pr(42),head:{...pr(42).head,sha:HASH(800)}},
    {...pr(42),base:{...pr(42).base,sha:HASH(801)}},
    {...pr(42),draft:false}
  ]) await assert.rejects(()=>auditPublicPrOverlaps({
    api:mock({second:[pr(41),altered]})
  }),/inventory changed/);
});

test('duplicate/invalid inventory and malformed PR metadata fail closed',async()=>{
  for(const first of [
    [pr(41),pr(41)],
    [{...pr(41),head:{...pr(41).head,sha:'invalid'}}],
    [{...pr(41),state:'closed'}],
    [{...pr(41),base:{...pr(41).base,repo:{full_name:'foreign/repo'}}}]
  ]) await assert.rejects(()=>auditPublicPrOverlaps({api:mock({first})}),
    /Duplicate|Incomplete|unsafe/);
});

test('malformed paths and unknown GitHub file statuses are rejected',async()=>{
  for(const changes of [
    [file('../private.txt')],
    [file('src/../other.mjs')],
    [file('src\\win.mjs')],
    [file('src/x','renamed')],
    [file('src/file','unknown')],
    []
  ]) {
    const api=mock({files:{41:changes,42:[file('docs/ok')]}});
    await assert.rejects(()=>auditPublicPrOverlaps({api}),
      /Malformed|missing|Unknown|Incomplete/);
  }
});

test('changed-files count discrepancy fails closed',async()=>{
  const original=pr(41);original.changed_files=2;
  const api=mock({first:[original,pr(42)]});
  await assert.rejects(()=>auditPublicPrOverlaps({api}),/Incomplete changed-file/);
});

test('private, archived, or mismatched repository metadata are blocked',async()=>{
  for(const change of [
    {private:true,visibility:'private'},
    {archived:true},
    {full_name:'another/repository'}
  ]) {
    const api=mock({identity:{
      full_name:REPOSITORY,private:false,visibility:'public',archived:false,...change
    }});
    await assert.rejects(()=>auditPublicPrOverlaps({api}),/Expected public/);
    assert.deepEqual(api.stats(),{scans:0,reads:0});
  }
});

test('reader is GET-only and pagination stops safely on short response',async()=>{
  const requests=[];
  const api=createPublicGitHubReader(async(url,options)=>{
    requests.push({url,options});
    if(url.endsWith('/'))throw new Error('unexpected URL');
    if(url.includes('/pulls/7/files'))return {
      ok:true,json:async()=>[file('src/a.mjs')]
    };
    if(url.includes('/pulls?'))return {ok:true,json:async()=>[pr(7)]};
    if(url.endsWith('/virgostars-development-orchestrator'))
      return {ok:true,json:async()=>({full_name:REPOSITORY,private:false,visibility:'public'})};
    throw new Error('unexpected request');
  });
  assert.equal((await api.listOpenPullRequests()).length,1);
  assert.equal((await api.listPullRequestFiles(7)).length,1);
  await api.getRepository();
  assert.equal(requests.length,3);
  assert.ok(requests.every(x=>x.options.method==='GET'));
  assert.ok(requests.every(x=>!x.options.headers.Authorization));
});

test('reader denies API errors, too many entries and malformed pagination',async()=>{
  const denied=createPublicGitHubReader(async()=>({ok:false,status:403}));
  await assert.rejects(()=>denied.listOpenPullRequests(),/HTTP 403/);
  const excessive=createPublicGitHubReader(async()=>({
    ok:true,json:async()=>Array.from({length:100},(_,i)=>pr(i+1))
  }));
  await assert.rejects(()=>excessive.listOpenPullRequests(),/bound/);
  const malformed=createPublicGitHubReader(async()=>({
    ok:true,json:async()=>({truncated:true})
  }));
  await assert.rejects(()=>malformed.listOpenPullRequests(),/Malformed/);
});

test('invalid base selectors fail before any network request',async()=>{
  for(const base of ['../main','main/../x','/heads/main','main//ref','',null]) {
    const api=mock();
    await assert.rejects(()=>auditPublicPrOverlaps({api,base}),/Invalid public/);
    assert.deepEqual(api.stats(),{scans:0,reads:0});
  }
});

test('CLI help works offline without token or repository disclosure',()=>{
  const script=fileURLToPath(new URL('../scripts/audit-public-pr-overlaps.mjs',import.meta.url));
  const env={...process.env};delete env.GITHUB_TOKEN;delete env.GH_TOKEN;
  const result=spawnSync(process.execPath,[script,'--help'],{
    env,encoding:'utf8',timeout:15000
  });
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/--base PUBLIC_BRANCH/);
  assert.equal(result.stderr,'');
});
