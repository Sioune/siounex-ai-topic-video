// SYNTHETIC confirmed-state read regression: in-memory SQLite/R2, actual archive
// reader and GET/HEAD route. No live Site, real owner, upload or approval action.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {build} from 'esbuild';
const OWNER='SYNTHETIC-confirmed-reader',AT='2026-10-19T00:00:00.000Z';
const IDS=['job_38fd8bfd-2949-4d26-8b67-d07a03e6f0b0','job_ed3c8123-59ed-4948-9d99-fdb7067ee522','job_b7dcd6bf-682d-429f-9016-7c9f3df41c16','job_c3adf563-321c-4bac-b807-b1e749681c82'];
const hash=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const built=await build({stdin:{contents:"export {getSiteArchiveMetadata,readSiteArchiveFile,readSiteArchivePart} from './lib/site-file-archive';export {pendingCandidateArchiveBinding} from './lib/site-file-archive-contract.mts';export * as downloadRoute from './app/api/site-archive/route';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'isolated-confirmed-reader',setup(b){
 b.onResolve({filter:/^(?:\.\/store|@\/lib\/store)$/},()=>({path:'store',namespace:'confirmed-fixture'}));
 b.onResolve({filter:/^(?:\.\/api|@\/lib\/api)$/},()=>({path:'identity',namespace:'confirmed-fixture'}));
 b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare',namespace:'confirmed-fixture'}));
 b.onLoad({filter:/.*/,namespace:'confirmed-fixture'},a=>({contents:a.path==='store'?'export function db(){return globalThis.__confirmedReadDB}export function siteArchiveBucket(){return globalThis.__confirmedReadR2}':a.path==='cloudflare'?'export const env={}':"export async function identity(){return globalThis.__confirmedReadIdentity||null}export const json=(body,status=200)=>Response.json(body,{status});"}));
}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
const status=n=>e=>{assert.equal(e.status,n,e.message);return true;};
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return (crc^0xffffffff)>>>0;}
function png(){const chunk=(kind,bytes)=>{const type=Buffer.from(kind),out=Buffer.alloc(12+bytes.length);out.writeUInt32BE(bytes.length);type.copy(out,4);bytes.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([type,bytes])),8+bytes.length);return out;};const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(3,0);ihdr.writeUInt32BE(4,4);ihdr[8]=8;ihdr[9]=2;const scan=Buffer.alloc(4*(1+3*3),127);for(let row=0;row<4;row++)scan[row*10]=0;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);}
function fixture(t,id=IDS[0]){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE production_jobs(id TEXT PRIMARY KEY,owner_id TEXT);CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE production_reviews(id TEXT PRIMARY KEY,job_id TEXT,decision TEXT,note TEXT,content_hash TEXT);');
 for(const job of IDS)sql.prepare('INSERT INTO production_jobs VALUES(?,?)').run(job,OWNER);
 sql.prepare('INSERT INTO production_jobs VALUES(?,?)').run('job_ffffffff-ffff-ffff-ffff-ffffffffffff',OWNER);
 const db={prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)||null;}};}};}};
 const map=new Map(),r2={reads:0,async get(key){this.reads++;const found=map.get(key);if(!found)return null;const bytes=Buffer.from(found.bytes);return {customMetadata:found.customMetadata||{},size:bytes.length,text:async()=>bytes.toString('utf8'),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}};
 globalThis.__confirmedReadDB=db;globalThis.__confirmedReadR2=r2;globalThis.__confirmedReadIdentity=OWNER;
 t.after(()=>{sql.close();delete globalThis.__confirmedReadDB;delete globalThis.__confirmedReadR2;delete globalThis.__confirmedReadIdentity;});
 const bytes=png(),binding={...p.pendingCandidateArchiveBinding(id),candidate_id:'native_video_'+hash('SYNTHETIC-'+id),candidate_sha256:hash('SYNTHETIC-video-'+id),project_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',timeline_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'},sid='sitefile_'+hash('SYNTHETIC-confirmed-'+id);
 const file={role:'cover_3_4',mime_type:'image/png',file_name:'SYNTHETIC-cover-3x4.png',sha256:hash(bytes),size_bytes:bytes.length,width:3,height:4},parts=[{part:0,sha256:file.sha256,size_bytes:bytes.length}],post={post_video_delivery_id:'native_draft_'+hash('SYNTHETIC-approved-video-'+id),voice_provenance_id:'candidate_voice_'+hash('SYNTHETIC-owner-voice-'+id),quality_review:'awaiting-human'};
 const archive={schema:'site-private-file-archive-v1',site_archive_id:sid,storage:'site-private-r2',binding,owner_review_id:'SYNTHETIC-video-owner-review',scope_id:'media_scope_'+hash('SYNTHETIC-private-scope-'+id),scope_hash:hash('SYNTHETIC-private-scope-hash-'+id),file,status:'confirmed',part_size:524288,part_count:1,created_at:AT,sealed_at:AT,confirmed_at:AT,materialized_sha256:file.sha256,quality_approved:false,publication_authorized:false,new_paid_calls:0,...post};
 const manifest={schema:'site-private-chunk-manifest-v1',site_archive_id:sid,file,binding,owner_review_id:archive.owner_review_id,scope_id:archive.scope_id,scope_hash:archive.scope_hash,...post,parts,sealed_at:AT};archive.manifest_sha256=hash(canonical(manifest));
 const stored={archive,job_id:id,owner_id:OWNER,request_hash:hash('SYNTHETIC-request'),snapshot:{owner:OWNER},parts};
 sql.prepare('INSERT INTO app_state VALUES(?,?)').run('site_archive_v1:'+sid,canonical(stored));
 const reviewKey='site_archive_confirmed_'+hash(sid);sql.prepare('INSERT INTO production_reviews VALUES(?,?,?,?,?)').run(reviewKey,id,'site_file_archive_v1',canonical({owner_id:OWNER,...archive}),file.sha256);
 map.set('site-private-archives/v1/'+sid+'/manifest.json',{bytes:Buffer.from(canonical(manifest))});map.set('site-private-archives/v1/'+sid+'/part-000',{bytes:Buffer.from(bytes),customMetadata:{sha256:file.sha256,size_bytes:String(bytes.length)}});
 const update=(change,updateAudit=false)=>{const value=JSON.parse(sql.prepare('SELECT value FROM app_state WHERE key=?').get('site_archive_v1:'+sid).value);change(value);sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(canonical(value),'site_archive_v1:'+sid);if(updateAudit)sql.prepare('UPDATE production_reviews SET note=?,content_hash=? WHERE id=?').run(canonical({owner_id:OWNER,...value.archive}),value.archive.file.sha256,reviewKey);};
 return {id,sql,map,r2,bytes,sid,archive,manifest,update,url:'https://synthetic.invalid/api/site-archive?id='+id+'&archive='+sid};
}
const actor={owner_id:OWNER};
test('each owner GET verifies the confirmed manifest once and each requested part once',async t=>{
 const f=fixture(t),start=f.r2.reads,response=await p.downloadRoute.GET(new Request(f.url));
 assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),f.bytes);assert.equal(f.r2.reads-start,2,'one manifest read and one integrity-checked part');
 const beforeHead=f.r2.reads,head=await p.downloadRoute.HEAD(new Request(f.url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal(f.r2.reads-beforeHead,1,'HEAD checks manifest once and does not read a part');
 const beforeRange=f.r2.reads,range=await p.downloadRoute.GET(new Request(f.url,{headers:{Range:'bytes=0-7'}}));assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),f.bytes.subarray(0,8));assert.equal(f.r2.reads-beforeRange,2,'range checks the manifest and requested part once');
});
test('request-local read does not carry authorization to the next request, or skip part integrity',async t=>{
 const f=fixture(t),first=await p.downloadRoute.GET(new Request(f.url));assert.equal(first.status,200);assert.deepEqual(Buffer.from(await first.arrayBuffer()),f.bytes);
 f.sql.prepare('UPDATE production_jobs SET owner_id=? WHERE id=?').run('SYNTHETIC-new-owner',f.id);assert.equal((await p.downloadRoute.GET(new Request(f.url))).status,403);
 f.sql.prepare('UPDATE production_jobs SET owner_id=? WHERE id=?').run(OWNER,f.id);f.map.get('site-private-archives/v1/'+f.sid+'/part-000').bytes[33]^=1;const damaged=await p.downloadRoute.GET(new Request(f.url));assert.equal(damaged.status,200);await assert.rejects(()=>damaged.arrayBuffer(),/完整性/);
});
for(const id of IDS)test('confirmed post-video '+id+' remains readable as real PNG via metadata, stream, read_part, GET and HEAD',async t=>{
 const f=fixture(t,id),before=f.sql.prepare('SELECT value FROM app_state').get().value;
 assert.equal((await p.getSiteArchiveMetadata(id,f.sid,OWNER)).site_archive_id,f.sid);
 const streamed=await p.readSiteArchiveFile(id,f.sid,OWNER);assert.deepEqual(Buffer.from(await new Response(streamed.body).arrayBuffer()),f.bytes);
 const part=await p.readSiteArchivePart(id,{site_archive_id:f.sid,part:0},actor);assert.equal(part.chunk_sha256,hash(f.bytes));assert.deepEqual(Buffer.from(part.chunk_base64,'base64'),f.bytes);
 const get=await p.downloadRoute.GET(new Request(f.url));assert.equal(get.status,200);assert.equal(get.headers.get('content-type'),'image/png');assert.match(get.headers.get('content-disposition'),/^inline;/);assert.equal(get.headers.get('x-asset-sha256'),hash(f.bytes));assert.equal(get.headers.get('content-length'),String(f.bytes.length));assert.match(get.headers.get('cache-control'),/private.*no-store/);assert.equal(get.headers.get('x-content-type-options'),'nosniff');const actual=Buffer.from(await get.arrayBuffer());assert.deepEqual(actual,f.bytes);assert.equal(actual.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const head=await p.downloadRoute.HEAD(new Request(f.url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'image/png');assert.equal(head.headers.get('content-length'),String(f.bytes.length));assert.equal(await head.text(),'');
 const ranged=await p.downloadRoute.GET(new Request(f.url,{headers:{Range:'bytes=0-7'}}));assert.equal(ranged.status,206);assert.equal(ranged.headers.get('content-range'),`bytes 0-7/${f.bytes.length}`);assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),f.bytes.subarray(0,8));
 const download=await p.downloadRoute.GET(new Request(f.url+'&download=1'));assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/^attachment;/);
 assert.equal(f.sql.prepare('SELECT value FROM app_state').get().value,before);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM production_reviews').get().n,1);assert.equal(f.archive.quality_approved,false);assert.equal(f.archive.publication_authorized,false);
});
for(const id of IDS)for(const field of ['revision','script_hash','contract_hash','mode_epoch'])test('confirmed '+id+' rejects wrong frozen '+field,async t=>{
 const f=fixture(t,id);f.update(s=>s.archive.binding[field]=typeof s.archive.binding[field]==='number'?s.archive.binding[field]+1:'0'.repeat(64));
 await assert.rejects(()=>p.getSiteArchiveMetadata(id,f.sid,OWNER),status(403));await assert.rejects(()=>p.readSiteArchiveFile(id,f.sid,OWNER),status(403));await assert.rejects(()=>p.readSiteArchivePart(id,{site_archive_id:f.sid,part:0},actor),status(403));assert.equal((await p.downloadRoute.HEAD(new Request(f.url,{method:'HEAD'}))).status,403);
});
test('confirmed material requires actual private visitor identity and job owner, not a service token',async t=>{
 const f=fixture(t);globalThis.__confirmedReadIdentity=null;for(const headers of [{},{'OAI-Sites-Authorization':'Bearer SYNTHETIC-service'}])assert.equal((await p.downloadRoute.GET(new Request(f.url,{headers}))).status,401);
 globalThis.__confirmedReadIdentity='SYNTHETIC-other-owner';assert.equal((await p.downloadRoute.HEAD(new Request(f.url,{method:'HEAD'}))).status,403);await assert.rejects(()=>p.getSiteArchiveMetadata(f.id,f.sid,'SYNTHETIC-other-owner'),status(403));
 globalThis.__confirmedReadIdentity=OWNER;await assert.rejects(()=>p.getSiteArchiveMetadata(IDS[1],f.sid,OWNER),status(403));await assert.rejects(()=>p.readSiteArchiveFile('job_ffffffff-ffff-ffff-ffff-ffffffffffff',f.sid,OWNER),status(403));
});
for(const field of ['voice_provenance_id','scope_id','scope_hash','owner_review_id','post_video_delivery_id'])test('confirmed metadata rejects forged '+field+' even if its DB audit is rewritten',async t=>{
 const f=fixture(t);f.update(s=>s.archive[field]=field==='voice_provenance_id'?'candidate_voice_'+'9'.repeat(64):field==='post_video_delivery_id'?'native_draft_'+'9'.repeat(64):field==='scope_hash'?'9'.repeat(64):'SYNTHETIC-mismatched',true);
 await assert.rejects(()=>p.getSiteArchiveMetadata(f.id,f.sid,OWNER),status(409));await assert.rejects(()=>p.readSiteArchivePart(f.id,{site_archive_id:f.sid,part:0},actor),status(409));assert.equal((await p.downloadRoute.GET(new Request(f.url))).status,409);
});
test('confirmed metadata still requires original audit, sealed manifest, and intact streamed part bytes',async t=>{
 const f=fixture(t),review=f.sql.prepare('SELECT * FROM production_reviews').get();f.sql.exec('DELETE FROM production_reviews');await assert.rejects(()=>p.getSiteArchiveMetadata(f.id,f.sid,OWNER),status(409));f.sql.prepare('INSERT INTO production_reviews VALUES(?,?,?,?,?)').run(review.id,review.job_id,review.decision,review.note,review.content_hash);
 const key='site-private-archives/v1/'+f.sid+'/manifest.json',original=f.map.get(key);f.map.set(key,{bytes:Buffer.from('{}')});await assert.rejects(()=>p.getSiteArchiveMetadata(f.id,f.sid,OWNER),status(409));f.map.set(key,original);
 f.map.get('site-private-archives/v1/'+f.sid+'/part-000').bytes[33]^=1;const stream=await p.readSiteArchiveFile(f.id,f.sid,OWNER);await assert.rejects(()=>new Response(stream.body).arrayBuffer(),/完整性/);await assert.rejects(()=>p.readSiteArchivePart(f.id,{site_archive_id:f.sid,part:0},actor),status(409));
});
