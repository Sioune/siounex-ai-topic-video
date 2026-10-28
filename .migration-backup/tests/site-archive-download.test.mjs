import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import fs from 'node:fs';
import migrations from '../production/cover-branding-migrations.json' with {type:'json'};

test('Site archive GET/HEAD authenticates a real owner, streams bytes, and handles browser ranges privately',async()=>{
 const d=new DatabaseSync(':memory:');d.exec("CREATE TABLE production_jobs(id TEXT PRIMARY KEY,owner_id TEXT);INSERT INTO production_jobs VALUES('fixture','owner'),('other-job','other')");
 globalThis.__siteArchiveDb={prepare(sql){return{bind(...args){return{async first(){return d.prepare(sql).get(...args)||null}}}}}};
 globalThis.__siteArchiveHeaders=new Headers();globalThis.__siteArchiveMetaReads=0;globalThis.__siteArchiveByteReads=0;globalThis.__siteArchiveEnv={};
 globalThis.__siteArchiveBytes=Uint8Array.from({length:10},(_,i)=>i+1);
 globalThis.__siteArchiveRecord={site_archive_id:'sitefile_'+'a'.repeat(64),file:{role:'video',mime_type:'video/mp4',file_name:"普通审阅片('v2').mp4",sha256:'b'.repeat(64),size_bytes:10}};
 fs.mkdirSync('.sites-runtime',{recursive:true});
 await build({stdin:{contents:"export {GET,HEAD} from './app/api/site-archive/route';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/site-archive-download-test.mjs',plugins:[{name:'isolated-site-archive',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare',namespace:'fixture'}));
  b.onResolve({filter:/^(next\/headers|next\/navigation)$/},a=>({path:a.path,namespace:'fixture'}));
  b.onResolve({filter:/^(?:@\/lib\/|\.\/)(store|site-file-archive)$/},a=>({path:a.path.split('/').pop(),namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:({
   'next/headers':'export async function headers(){return globalThis.__siteArchiveHeaders}',
   cloudflare:'export const env=globalThis.__siteArchiveEnv;',
   'next/navigation':'export function redirect(){throw Error("unused")}',
   store:'export function db(){return globalThis.__siteArchiveDb}',
   'site-file-archive':`import{ProductionError}from'@/lib/production-contract';export async function getSiteArchiveMetadata(id,sid,owner){globalThis.__siteArchiveMetaReads++;if(sid!==globalThis.__siteArchiveRecord.site_archive_id)throw new ProductionError('missing',404);return structuredClone(globalThis.__siteArchiveRecord)}export async function readSiteArchiveFile(id,sid,owner,range){globalThis.__siteArchiveByteReads++;globalThis.__siteArchiveRange=range;if(globalThis.__siteArchiveRace)throw new ProductionError('绑定已变',409);if(globalThis.__siteArchiveUnexpected)throw Error('SYNTHETIC-SECRET-DO-NOT-EXPOSE');const archive=structuredClone(globalThis.__siteArchiveRecord),bytes=range?globalThis.__siteArchiveBytes.slice(range.offset,range.offset+range.length):globalThis.__siteArchiveBytes;return{archive,body:new ReadableStream({start(c){c.enqueue(bytes);c.close()}})}}export async function openSiteArchiveForRead(id,sid,owner){const archive=await getSiteArchiveMetadata(id,sid,owner);return{archive,read:range=>readSiteArchiveFile(id,sid,owner,range)}}`
  })[a.path]}));
 }}]});
 const {GET,HEAD}=await import('../.sites-runtime/site-archive-download-test.mjs');
 const url='https://private.example/api/site-archive?id=fixture&archive='+globalThis.__siteArchiveRecord.site_archive_id;
 for(const headers of [{},{'OAI-Sites-Authorization':'Bearer SYNTHETIC-SERVICE'},{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.org'}]){
  const r=await GET(new Request(url,{headers}));assert.equal(r.status,401);assert.equal(globalThis.__siteArchiveMetaReads,0);assert.equal(globalThis.__siteArchiveByteReads,0);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 }
 globalThis.__siteArchiveHeaders=new Headers({'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.org'});
 assert.equal((await GET(new Request(url))).status,403);assert.equal(globalThis.__siteArchiveMetaReads,0);
 globalThis.__siteArchiveHeaders=new Headers({'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.org'});
 assert.equal((await GET(new Request(url.replace('id=fixture','id=other-job')))).status,403);
 assert.equal((await GET(new Request(url.replace('archive=sitefile_','archive=not-found-')))).status,404);
 let response=await GET(new Request(url));assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),globalThis.__siteArchiveBytes);assert.match(response.headers.get('content-disposition'),/^inline;/);assert.match(response.headers.get('content-disposition'),/%27v2%27/);assert.equal(response.headers.get('content-type'),'video/mp4');assert.equal(response.headers.get('content-length'),'10');assert.equal(response.headers.get('accept-ranges'),'bytes');assert.equal(response.headers.get('x-asset-sha256'),'b'.repeat(64));
 for(const [value,start,end]of [['bytes=0-0',0,0],['bytes=3-6',3,6],['bytes=7-',7,9],['bytes=-3',7,9],['bytes=-20',0,9],['bytes=8-999',8,9]]){
  response=await GET(new Request(url,{headers:{Range:value}}));assert.equal(response.status,206,value);assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/10`);assert.equal(response.headers.get('content-length'),String(end-start+1));assert.deepEqual(new Uint8Array(await response.arrayBuffer()),globalThis.__siteArchiveBytes.slice(start,end+1));
 }
 for(const value of ['bytes=10-','bytes=5-4','bytes=-0','bytes=-','bytes=0-1,3-4','items=0-1','bytes=9007199254740993-','bytes=0-9007199254740993','bytes=-9007199254740993','bytes= 0-1']){
  const before=globalThis.__siteArchiveByteReads;response=await GET(new Request(url,{headers:{Range:value}}));assert.equal(response.status,416,value);assert.equal(response.headers.get('content-range'),'bytes */10');assert.equal(response.headers.get('content-length'),'0');assert.equal(await response.text(),'');assert.equal(globalThis.__siteArchiveByteReads,before);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('cache-control'),/no-store/);
 }
 const beforeHead=globalThis.__siteArchiveByteReads;response=await HEAD(new Request(url,{method:'HEAD',headers:{Range:'bytes=-2'}}));assert.equal(response.status,206);assert.equal(response.headers.get('content-length'),'2');assert.equal(await response.text(),'');assert.equal(globalThis.__siteArchiveByteReads,beforeHead);
 for(const [role,mime,expected]of [['source_bundle','application/zip','attachment'],['complete_bundle','application/zip','attachment'],['promotion','text/plain','attachment'],['cover_3_4','image/png','inline']]){
  Object.assign(globalThis.__siteArchiveRecord.file,{role,mime_type:mime});response=await GET(new Request(url));assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),new RegExp('^'+expected+';'));assert.equal(response.headers.get('content-type'),mime+(mime==='text/plain'?'; charset=utf-8':''));
 }
 response=await GET(new Request(url+'&download=1'));assert.match(response.headers.get('content-disposition'),/^attachment;/);
 globalThis.__siteArchiveRace=true;response=await GET(new Request(url));assert.equal(response.status,409);assert.match(response.headers.get('cache-control'),/no-store/);delete globalThis.__siteArchiveRace;
 globalThis.__siteArchiveUnexpected=true;response=await GET(new Request(url));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/SECRET/);
 delete globalThis.__siteArchiveUnexpected;
 const migration=migrations.migrations[0],cover=migration.covers[0];d.prepare('INSERT INTO production_jobs VALUES(?,?)').run(migration.job_id,'owner');globalThis.__siteArchiveRecord={status:'confirmed',site_archive_id:cover.source_archive_id,binding:migration.original_binding,file:{role:cover.role,sha256:cover.source_sha256}};
 const brandedUrl='https://private.example/api/site-archive?id='+migration.job_id+'&archive='+cover.site_archive_id;
 const originalFetch=globalThis.fetch;try{globalThis.fetch=async req=>{assert.equal(new URL(req.url).origin,'https://private.example');assert.equal(new URL(req.url).pathname,cover.asset_path);return new Response(fs.readFileSync('public'+cover.asset_path));};response=await GET(new Request(brandedUrl));assert.equal(response.status,200);assert.equal(response.headers.get('x-asset-sha256'),cover.sha256);assert.match(response.headers.get('cache-control'),/private, no-store/);}finally{globalThis.fetch=originalFetch;}
 globalThis.__siteArchiveHeaders=new Headers({'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.org'});assert.equal((await GET(new Request(brandedUrl))).status,403);
 globalThis.__siteArchiveHeaders=new Headers({'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.org'});let assetReads=0;const actualBytes=fs.readFileSync('public'+cover.asset_path);globalThis.__siteArchiveEnv.ASSETS={async fetch(req){assetReads++;assert.equal(new URL(req.url).pathname,cover.asset_path);return new Response(actualBytes);}};
 response=await HEAD(new Request(brandedUrl,{method:'HEAD'}));assert.equal(response.status,200);assert.equal(response.headers.get('x-asset-sha256'),cover.sha256);assert.equal(assetReads,0);
 response=await GET(new Request(brandedUrl+'&download=1'));assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array(actualBytes));assert.equal(response.headers.get('x-asset-sha256'),cover.sha256);assert.match(response.headers.get('content-disposition'),/^attachment;/);
 globalThis.__siteArchiveRecord.file.sha256='changed';assert.equal((await GET(new Request(brandedUrl))).status,409);globalThis.__siteArchiveRecord.file.sha256=cover.source_sha256;globalThis.__siteArchiveEnv.ASSETS.fetch=async()=>new Response('wrong bytes');assert.equal((await GET(new Request(brandedUrl))).status,503);
 d.close();for(const key of Object.keys(globalThis).filter(x=>x.startsWith('__siteArchive')))delete globalThis[key];
});

