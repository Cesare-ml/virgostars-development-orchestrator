import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceKey, resourceMatches, validateTaskCatalog} from '../src/resources.mjs';

const repo='Cesare-ml/astrological-charts';
const write=(issue,id,roots)=>
  ({repository:repo,issue,role:'developer',status:'ready',access:'write',
    resource_scope:{id,roots}});
const read={repository:repo,issue:1,role:'reviewer',status:'ready',access:'read'};

test('single resource ID is stable, namespaced by repository',()=>{
 assert.equal(resourceKey(repo,'three-core'),
  'resources/Cesare-ml__astrological-charts/three-core.json');
 assert.throws(()=>resourceKey('../repo','core'),/Invalid/);
 assert.throws(()=>resourceKey(repo,'../../core'),/Invalid/);
});

test('distinct write partitions must not have overlapping file roots',()=>{
 assert.throws(()=>validateTaskCatalog([
   write(2,'renderer',['src/three/']),
   write(3,'everything',['src/'])
 ]),/Overlapping write paths/);
 assert.throws(()=>validateTaskCatalog([
   write(2,'renderer',['Src/Three/']),
   write(3,'everything',['src/three/canvas/'])
 ]),/Overlapping write paths/);
});

test('disjoint scopes and multiple tasks in one shared partition are allowed',()=>{
 assert.doesNotThrow(()=>validateTaskCatalog([
   read,write(2,'renderer',['src/render/','test/render/']),
   write(3,'renderer',['src/render/glyphs/']),
   write(4,'i18n',['src/i18n/','test/i18n/'])
 ]));
});

test('case aliases of one GitHub repository cannot split a shared resource lock',()=>{
 const differentlyCased=repo.toLowerCase();
 // The existing lock-key format preserves repository spelling; treating these
 // as separate curated targets would allow distinct resource files to exist.
 assert.notEqual(resourceKey(repo,'renderer'),resourceKey(differentlyCased,'renderer'));
 assert.throws(()=>validateTaskCatalog([
   write(2,'renderer',['src/render/']),
   {...write(3,'renderer',['src/render/subdir/']),repository:differentlyCased}
 ]),/Conflicting repository capitalization/);
 // This also applies to reviewer tasks, preventing inconsistent claim paths.
 assert.throws(()=>validateTaskCatalog([
   read,
   {...read,repository:differentlyCased,issue:99}
 ]),/Conflicting repository capitalization/);
 // One canonical spelling across different issues remains valid, including
 // legitimate different scopes serialized by the SAME partition ID.
 assert.doesNotThrow(()=>validateTaskCatalog([
   write(2,'renderer',['src/render/']),
   write(3,'renderer',['src/render/subdir/'])
 ]));
 // Distinct repositories are not accidentally considered aliases.
 assert.doesNotThrow(()=>validateTaskCatalog([
   write(2,'renderer',['src/render/']),
   {...write(3,'renderer',['src/render/']),repository:'other-org/astrological-charts'}
 ]));
});

test('no access inference, malformed paths, and multiple IDs are rejected',()=>{
 assert.throws(()=>validateTaskCatalog([{...read,access:undefined}]),/explicitly read or write/);
 assert.throws(()=>validateTaskCatalog([write(2,'core',[String.fromCharCode(46,46,47)+'private/'])]),/valid partition/);
 assert.throws(()=>validateTaskCatalog([write(2,'core',['src/**/'])]),/valid partition/);
 assert.throws(()=>validateTaskCatalog([write(2,'core',[])]),/valid partition/);
 assert.throws(()=>validateTaskCatalog([{...read,resource_scope:{id:'core'}}]),/Read-only/);
 assert.throws(()=>validateTaskCatalog([write(2,'core',['src/']),write(2,'core',['test/'])]),/Duplicate/);
 assert.throws(()=>validateTaskCatalog([{
   ...write(2,'core',['src/']),resource_scope:[
     {id:'core',roots:['src/']},{id:'test',roots:['test/']}
   ]}]),/one valid partition/);
});

test('resource matching checks both owner and task, not only session',()=>{
 const claim={target_repository:repo,issue_number:2,session_id:'chat-a',resource_scope_id:'core',resource_roots:['src/']};
 const resource={data:{kind:'write-resource',target_repository:repo,issue_number:2,
    session_id:'chat-a',resource_scope_id:'core',resource_roots:['src/']}};
 assert.ok(resourceMatches(resource,claim));
 assert.equal(resourceMatches(resource,{...claim,issue_number:3}),false);
 assert.equal(resourceMatches(resource,{...claim,session_id:'chat-b'}),false);
});
