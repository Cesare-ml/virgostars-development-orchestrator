import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GitHubError,makeGitHubClient} from '../src/github.mjs';
import {
  inspectPrivateLedger,assertPrivateLedger,guardLegacyLedgerClient
} from '../src/ledger-visibility.mjs';

const REPO='Cesare-ml/virgostars-development-orchestrator';
const config={
  repository_visibility_required:'private',
  claim_store:{repo:REPO,branch:'coordination/claims'}
};
const privateMeta={full_name:REPO,private:true,visibility:'private',
  archived:false,disabled:false};
const publicMeta={...privateMeta,private:false,visibility:'public'};

test('real GitHub PUBLIC metadata fails closed despite legacy private config label',()=>{
  assert.throws(()=>inspectPrivateLedger({config,metadata:publicMeta}),
    /not verified PRIVATE/);
});

test('only the exact configured repository with verified private visibility is acceptable',()=>{
  assert.deepEqual(inspectPrivateLedger({config,metadata:privateMeta}),{
    repo:REPO,private:true,verified:true
  });
  for(const metadata of [
    {...privateMeta,visibility:'public'}, {...privateMeta,visibility:'internal'},
    {...privateMeta,private:false}, {...privateMeta,private:undefined},
    {...privateMeta,full_name:'someone/other'},
    {...privateMeta,archived:true}, {...privateMeta,disabled:true},
    null
  ]) assert.throws(()=>inspectPrivateLedger({config,metadata}),/not verified PRIVATE/);
});

test('legacy config without an explicitly private ledger is never enough to proceed',()=>{
  for(const bad of [
    {...config,repository_visibility_required:'public'},
    {...config,claim_store:{...config.claim_store,branch:'main'}},
    {...config,claim_store:{...config.claim_store,repo:'../etc/passwd'}},
    {...config,claim_store:null},
    {}
  ]) assert.throws(()=>inspectPrivateLedger({config:bad,metadata:privateMeta}),
    /requires a configured private GitHub ledger/);
});

test('GitHub 403, 404 and missing metadata provider never become private approval',async()=>{
  await assert.rejects(()=>assertPrivateLedger({
    api:{getRepository:async()=>{throw new GitHubError(403)}},config
  }),GitHubError);
  await assert.rejects(()=>assertPrivateLedger({
    api:{getRepository:async()=>{throw new GitHubError(404)}},config
  }),GitHubError);
  await assert.rejects(()=>assertPrivateLedger({api:{},config}),
    /Cannot verify private ledger visibility/);
  await assert.rejects(()=>assertPrivateLedger({
    api:{getRepository:async()=>({})},config
  }),/not verified PRIVATE/);
});

test('no read or write to a public claims branch is made through the guarded client',async()=>{
  const executed=[];
  const api={
    async getRepository(repo){executed.push(['visibility',repo]);return publicMeta;},
    async getLedgerSnapshot(){executed.push(['getLedgerSnapshot']);},
    async getClaim(){executed.push(['getClaim']);},
    async createClaim(){executed.push(['createClaim']);},
    async updateClaim(){executed.push(['updateClaim']);},
    async deleteClaim(){executed.push(['deleteClaim']);}
  };
  const guarded=guardLegacyLedgerClient({api,config});
  for(const method of [
    'getLedgerSnapshot','getClaim','createClaim','updateClaim','deleteClaim'
  ]) {
    await assert.rejects(()=>guarded[method](REPO),/not verified PRIVATE/);
  }
  assert.deepEqual(executed.map(entry=>entry[0]),
    Array(5).fill('visibility'));
});

test('guard rechecks visibility before each private ledger operation',async()=>{
  let visible='private';const events=[];
  const api={
    async getRepository(){
      events.push('verify');return {...privateMeta,
        private:visible==='private',visibility:visible};
    },
    async getLedgerSnapshot(){events.push('snapshot');return {entries:[]};},
    async getClaim(){events.push('claim-read');return null;},
    async createClaim(){events.push('write');return {ok:true};},
    async updateClaim(){events.push('update');return {ok:true};},
    async deleteClaim(){events.push('delete');return {ok:true};}
  };
  const guarded=guardLegacyLedgerClient({api,config});
  await assertPrivateLedger({api,config});
  assert.deepEqual(await guarded.createClaim(REPO),{ok:true});
  visible='public';
  await assert.rejects(()=>guarded.getClaim(REPO),/not verified PRIVATE/);
  await assert.rejects(()=>guarded.updateClaim(REPO),/not verified PRIVATE/);
  await assert.rejects(()=>guarded.deleteClaim(REPO),/not verified PRIVATE/);
  assert.deepEqual(events,['verify','verify','write','verify','verify','verify']);
});

test('ledger-guard blocks unexpected repository destinations even when private',async()=>{
  const api={
    getRepository:async()=>privateMeta,
    getLedgerSnapshot:async()=>null,getClaim:async()=>null,
    createClaim:async()=>null,updateClaim:async()=>null,deleteClaim:async()=>null
  };
  const guarded=guardLegacyLedgerClient({api,config});
  await assert.rejects(()=>guarded.createClaim('Cesare-ml/other'),
    /target differs from the reviewed claim store/);
});

test('GitHub metadata preflight uses GET only and rejects unsafe repo names',async()=>{
  const calls=[];
  const api=makeGitHubClient({token:'synthetic',fetchImpl:async(url,opts)=>{
    calls.push({url,method:opts.method});
    return {ok:true,status:200,json:async()=>privateMeta};
  }});
  assert.deepEqual(await api.getRepository(REPO),privateMeta);
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'GET');
  assert.ok(calls[0].url.endsWith('/repos/'+REPO));
  await assert.rejects(()=>api.getRepository('org/evil?per_page=100'),
    /Invalid GitHub repository identifier/);
  assert.equal(calls.length,1);
});

test('public CLI remains unprivileged, and preflight is wired before protected commands',async()=>{
  const script=await readFile(new URL('../bin/vs-agent.mjs',import.meta.url),'utf8');
  const publicStart=script.indexOf("if(command==='public-discover')");
  const privateGuard=script.indexOf('await assertPrivateLedger({api:baseApi,config})');
  const legacyDispatch=script.indexOf("if(command==='discover')");
  assert.ok(publicStart>0);
  assert.ok(privateGuard>publicStart && legacyDispatch>privateGuard);
  assert.match(script,/const api=guardLegacyLedgerClient\(\{api:baseApi,config\}\)/);
});
