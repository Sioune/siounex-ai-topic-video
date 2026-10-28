import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import fs from 'node:fs';

test('private media requires authenticated job owner before any byte read',async()=>{
 const d=new DatabaseSync(':memory:');
 d.exec("CREATE TABLE production_jobs(id TEXT PRIMARY KEY,owner_id TEXT,is_test INTEGER);INSERT INTO production_jobs VALUES('fixture','owner',0),('test-fixture','other',1),('unowned',NULL,0)");
 globalThis.__mediaAccessDb={prepare(sql){return{bind(...args){return{async first(){return d.prepare(sql).get(...args)||null}}}}}};
 globalThis.__mediaPlatformHeaders=new Headers();globalThis.__mediaReadCount=0;
 const bytes=new Uint8Array([1,2,3,4]);
 globalThis.__mediaFixture={bytes,meta:{sha256:'synthetic-fixture',file_name:'fixture.mp4'},asset:{mime_type:'video/mp4',sha256:'synthetic-fixture',file_name:'fixture.mp4',version:0}};
 const asset={node:'video',sha256:'synthetic-fixture',file_name:'fixture.mp4'},artifact={sha256:'synthetic-fixture',qa:{base_operation_id:'fixture-operation',delivery_asset:asset,site_playback:{derived_from_sha256:asset.sha256,decoded:true,frames:30,byte_source:'authorized-revision-staging',request_id:'fixture-request',asset,final_duration:{file_sha256:asset.sha256}},final_duration:{report:{measurements_seconds:{video_0_duration:1}}}}};
 globalThis.__mediaJob={operations:[{id:'fixture-operation',status:'completed',revision:1,plan:JSON.stringify({private_review:{kind:'private-review-commentary'}}),result:JSON.stringify({artifact,assets:[asset]})}],milestones:[{node:'video',revision:1,artifact:JSON.stringify(artifact)}]};
 fs.mkdirSync('.sites-runtime',{recursive:true});
 await build({stdin:{contents:"export {GET as pending} from './app/api/pending-revision/route';export {GET as review} from './app/api/private-review/route';export {GET as publicity} from './app/api/publicity-assets/route';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/private-media-access-test.mjs',plugins:[{name:'isolated-media',setup(b){
  b.onResolve({filter:/^(next\/headers|next\/navigation)$/},a=>({path:a.path,namespace:'fixture'}));
  b.onResolve({filter:/(^@\/lib\/|^\.\/)(store|production|authorized-media-revision|publicity-assets)$/},a=>({path:a.path.split('/').pop(),namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:({
   'next/headers':'export async function headers(){return globalThis.__mediaPlatformHeaders}',
   'next/navigation':'export function redirect(){throw Error("unused")}',
   store:'export function db(){return globalThis.__mediaAccessDb}',
   production:'export async function getJob(){return globalThis.__mediaJob}',
   'authorized-media-revision':'export async function readPendingRevisionBytes(){globalThis.__mediaReadCount++;return globalThis.__mediaFixture}',
   'publicity-assets':'export async function getPublicityAsset(){globalThis.__mediaReadCount++;return globalThis.__mediaFixture} export async function materializedPrivateAsset(){globalThis.__mediaReadCount++;return globalThis.__mediaFixture.bytes}export function uploadPrivatePart(){}export function recordPublicityFiles(){}export function discardIncompleteVideoUpload(){}'
  })[a.path]}));
 }}]});
 const routes=await import('../.sites-runtime/private-media-access-test.mjs');let checks=0;
 for(const[name,fn]of Object.entries(routes)){
  const url='https://private.example/api/'+name+'?id=fixture&operation=fixture-operation&request=fixture-request&kind=proxy&record=fixture&asset=video';
  // No HTTP headers, browser-like request, service bearer, and spoofed identity headers cannot create platform identity.
  for(const headers of[{}, {Origin:'https://private.example','Sec-Fetch-Site':'same-origin'}, {'OAI-Sites-Authorization':'Bearer SYNTHETIC-SERVICE'}, {'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.org'}]){
   const before=globalThis.__mediaReadCount,r=await fn(new Request(url,{headers}));assert.equal(r.status,401,name);assert.equal(globalThis.__mediaReadCount,before);checks++;
  }
  globalThis.__mediaPlatformHeaders=new Headers({'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.org'});
  assert.equal((await fn(new Request(url))).status,403);checks++;
  globalThis.__mediaPlatformHeaders=new Headers({'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.org'});
  for(const id of['test-fixture','unowned']){assert.equal((await fn(new Request(url.replace('id=fixture','id='+id)))).status,403);checks++;}
  const r=await fn(new Request(url));assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);checks++;
  if(name!=='publicity'){const ranged=await fn(new Request(url,{headers:{Range:'bytes=1-2'}}));assert.equal(ranged.status,206);assert.deepEqual(new Uint8Array(await ranged.arrayBuffer()),bytes.slice(1,3));checks++;}
  globalThis.__mediaPlatformHeaders=new Headers();
 }
 console.log('PASS '+checks+' isolated route/SQLite checks. Real API identity helper with mocked platform headers; synthetic bytes only. Authenticated browser session not tested.');
 d.close();for(const key of['__mediaAccessDb','__mediaPlatformHeaders','__mediaReadCount','__mediaFixture','__mediaJob'])delete globalThis[key];
});
