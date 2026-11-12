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

test('no access inference, malformed paths, and multiple IDs are rejected',()=>{
 assert.throws(()=>validateTaskCatalog([{...read,access:undefined}]),/explicitly read or write/);
 assert.throws(()=>validateTaskCatalog([write(2,'core',['../private/'])]),/valid partition/);
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
 const claim={target_repository:repo,issue_number:2,session_id:'chat-a',resource_scope_id:'core'};
 const resource={data:{kind:'write-resource',target_repository:repo,issue_number:2,
    session_id:'chat-a',resource_scope_id:'core'}};
 assert.ok(resourceMatches(resource,claim));
 assert.equal(resourceMatches(resource,{...claim,issue_number:3}),false);
 assert.equal(resourceMatches(resource,{...claim,session_id:'chat-b'}),false);
});
