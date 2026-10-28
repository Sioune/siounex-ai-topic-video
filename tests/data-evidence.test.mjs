// Actual isolated workerd, D1 and R2. All files and identities are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomFillSync} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import fs from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
const OWNER='SYNTHETIC-evidence-owner',OTHER='SYNTHETIC-other-owner',ORIGIN='https://synthetic-evidence.invalid';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function chunk(type,bytes){const body=Buffer.concat([Buffer.from(type),bytes]);let crc=0xffffffff;for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(bytes.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,body,tail]);}
function png(size){const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)randomFillSync(raw,y*(size*4+1)+1,size*4);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const small=png(1),phone=png(650);
test('private phone evidence uses bounded multipart, owner-only R2, immutable replay and verified legacy reads',{timeout:120000},async t=>{
 const source=`import * as upload from './app/api/data-evidence/route';import * as center from './app/api/data-center/route';import {getEvidence,readEvidenceUpload} from './lib/data-evidence';
 export default {async fetch(req,env){globalThis.__evidenceDB=env.DB;globalThis.__evidenceR2=env.BUCKET;const owner=req.headers.get('x-synthetic-trusted-platform-owner');globalThis.__evidencePlatformHeaders=owner?new Headers({'oai-authenticated-user-id':owner,'oai-authenticated-user-email':'synthetic@example.invalid'}):new Headers();const path=new URL(req.url).pathname;if(path==='/bounded-stream'){let reads=0,cancelled=false;const stream=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});try{await readEvidenceUpload(new Request(req.url,{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=synthetic'},body:stream}));return Response.json({unexpected:true},{status:500});}catch(e){return Response.json({error:e.message,reads,cancelled},{status:e.status||500});}}if(path==='/declared-oversized'){const body=new Uint8Array(10*1024*1024+32769),headers=new Headers(req.headers);headers.set('Content-Type','multipart/form-data; boundary=synthetic');headers.set('Content-Length',String(body.byteLength));return upload.POST(new Request(new URL('/api/data-evidence',req.url),{method:'POST',headers,body}));}if(path==='/api/data-evidence')return upload.POST(req);if(path==='/metadata'){try{return Response.json(await getEvidence(owner,new URL(req.url).searchParams.get('id')));}catch(e){return Response.json({error:e.message},{status:e.status||500});}}return req.method==='GET'?center.GET(req):center.POST(req);}};`;
 const compiled=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',target:'es2022',write:false,plugins:[{name:'isolated-evidence',setup(b){
  b.onResolve({filter:/^(?:\.\/store|@\/lib\/store)$/},()=>({path:'store',namespace:'fixture'}));
  b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:({'store':'export function db(){return globalThis.__evidenceDB}export function siteArchiveBucket(){return globalThis.__evidenceR2}','next/headers':'export async function headers(){return globalThis.__evidencePlatformHeaders}','next/navigation':'export function redirect(){throw Error("Unused synthetic redirect")}'}[a.path])}));
 }}]});
 const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],d1Persist:false,r2Persist:false});t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB'),r2=await mf.getR2Bucket('BUCKET');
 for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 const headers=(owner=OWNER,origin=ORIGIN)=>({...owner?{'x-synthetic-trusted-platform-owner':owner}:{},...origin===null?{}:{Origin:origin}});
 const uploadFile=async(bytes=phone,{owner=OWNER,origin=ORIGIN,name='SYNTHETIC-phone.png',type='image/png',capture='2026-10-18T09:00:00+08:00',extraHeaders={}}={})=>{const form=new FormData();form.set('file',new Blob([bytes],{type}),name);if(capture!==null)form.set('captured_at',capture);const encoded=new Request(ORIGIN,{method:'POST',body:form});return mf.dispatchFetch(ORIGIN+'/api/data-evidence',{method:'POST',headers:{...headers(owner,origin),'Content-Type':encoded.headers.get('Content-Type'),...extraHeaders},body:await encoded.arrayBuffer()});};
 const read=(id,owner=OWNER,extraHeaders={})=>mf.dispatchFetch(ORIGIN+'/api/data-center?evidence='+id,{headers:{...headers(owner,null),...extraHeaders}});
 const count=async()=>Number((await db.prepare('SELECT count(*) AS n FROM production_data_evidence').first()).n);
 assert.ok(phone.length>1024*1024,'Actual generated PNG exercises the former 1MiB failure');
 const savedResponse=await uploadFile();assert.equal(savedResponse.status,200,await savedResponse.clone().text());const saved=await savedResponse.json();
 assert.equal(saved.replayed,false);assert.equal(saved.evidence.sha256,sha(phone));assert.equal(saved.evidence.size_bytes,phone.length);assert.equal(saved.evidence.content_type,'image/png');assert.equal(saved.evidence.captured_at,'2026-10-18T01:00:00.000Z');assert.equal(saved.evidence.storage_kind,'r2');
 for(const privateField of ['owner_id','image_base64','storage_key'])assert.equal(Object.hasOwn(saved.evidence,privateField),false);
 const row=await db.prepare('SELECT * FROM production_data_evidence WHERE id=?').bind(saved.evidence.id).first();assert.equal(row.image_base64,'');assert.match(row.storage_key,/^site-private-data-evidence\/v1\/[a-f0-9]{64}\/[a-f0-9]{64}$/);assert.equal((await r2.list()).objects.length,1);
 const original=await read(saved.evidence.id);assert.equal(original.status,200);assert.equal(original.headers.get('Content-Type'),'image/png');assert.equal(original.headers.get('Cache-Control'),'private, no-store');assert.equal(original.headers.get('X-Content-Type-Options'),'nosniff');assert.deepEqual(Buffer.from(await original.arrayBuffer()),phone);
 const metadata=await(await mf.dispatchFetch(ORIGIN+'/metadata?id='+saved.evidence.id,{headers:headers()})).json();assert.deepEqual(metadata,saved.evidence);
 const list=await(await mf.dispatchFetch(ORIGIN+'/api/data-center',{headers:headers()})).json();assert.deepEqual(list.evidence,[saved.evidence]);const otherList=await(await mf.dispatchFetch(ORIGIN+'/api/data-center',{headers:headers(OTHER)})).json();assert.deepEqual(otherList.evidence,[]);
 const replay=await(await uploadFile(phone,{name:'SYNTHETIC-renamed.png',capture:'2026-10-19T00:00:00Z'})).json();assert.equal(replay.replayed,true);assert.deepEqual(replay.evidence,saved.evidence);assert.equal(await count(),1);assert.equal((await r2.list()).objects.length,1);
 const [retryA,retryB]=await Promise.all([uploadFile(small),uploadFile(small)]),concurrent=await Promise.all([retryA.json(),retryB.json()]);assert.equal(concurrent[0].evidence.id,concurrent[1].evidence.id);assert.equal(concurrent.filter(r=>!r.replayed).length,1);
 assert.equal((await read(saved.evidence.id,OTHER)).status,404);assert.equal((await read(saved.evidence.id,null)).status,401);assert.equal((await read(saved.evidence.id,OWNER,{Origin:'https://other.invalid'})).status,403);assert.equal((await read(saved.evidence.id,OWNER,{'Sec-Fetch-Site':'cross-site'})).status,403);
 const independent=await(await uploadFile(phone,{owner:OTHER})).json();assert.notEqual(independent.evidence.id,saved.evidence.id);assert.equal((await read(independent.evidence.id)).status,404);
 const before=await count();
 for(const options of [{owner:null},{origin:null},{origin:'https://other.invalid'},{extraHeaders:{'Sec-Fetch-Site':'cross-site'}},{owner:null,extraHeaders:{'oai-authenticated-user-id':OWNER,'oai-authenticated-user-email':'forged@example.invalid'}}])assert.equal((await uploadFile(small,options)).status,403);
 assert.equal((await uploadFile(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).status,400);
 assert.equal((await uploadFile(small,{type:'image/jpeg'})).status,400);assert.equal((await uploadFile(small,{capture:'tomorrow'})).status,400);
 const maximum=10*1024*1024;
 assert.equal((await uploadFile(Buffer.alloc(maximum+1))).status,413);
 // Exercise an unbounded stream inside the actual Worker: undici's local HTTP
 // bridge can close the upload TCP socket when workerd cancels its request.
 // The reader itself must stop, cancel, and emit 413 without buffering the rest.
 const oversized=await mf.dispatchFetch(ORIGIN+'/bounded-stream',{headers:headers()});assert.equal(oversized.status,413);const bounded=await oversized.json();assert.equal(bounded.cancelled,true);assert.ok(bounded.reads<=12);assert.equal(await count(),before);
 // Construct the declared oversized body inside workerd as well: rejecting it
 // before reading must not race Miniflare's local HTTP upload socket.
 const declared=await mf.dispatchFetch(ORIGIN+'/declared-oversized',{headers:headers()});assert.equal(declared.status,413);assert.equal(await count(),before);
 // Legacy D1 rows are still owner-private and integrity checked.
 const legacyBytes=png(2);await db.prepare("INSERT INTO production_data_evidence(id,owner_id,file_name,content_type,sha256,size_bytes,image_base64,created_at) VALUES('SYNTHETIC-legacy',?,'legacy.png','image/png',?,?,?,'SYNTHETIC')").bind(OWNER,sha(legacyBytes),legacyBytes.length,legacyBytes.toString('base64')).run();
 const legacy=await read('SYNTHETIC-legacy');assert.equal(legacy.status,200);assert.deepEqual(Buffer.from(await legacy.arrayBuffer()),legacyBytes);assert.equal((await read('SYNTHETIC-legacy',OTHER)).status,404);
 await db.prepare("INSERT INTO production_data_evidence(id,owner_id,file_name,content_type,sha256,size_bytes,image_base64,created_at) VALUES('SYNTHETIC-unowned',NULL,'unowned.png','image/png',?,?,?,'SYNTHETIC')").bind(sha(small),small.length,small.toString('base64')).run();assert.equal((await read('SYNTHETIC-unowned')).status,404);
 const altered=Buffer.from(phone);altered[altered.length-1]^=1;await r2.put(row.storage_key,altered);assert.equal((await read(saved.evidence.id)).status,409);await r2.put(row.storage_key,phone);
 await db.prepare("UPDATE production_data_evidence SET sha256=? WHERE id='SYNTHETIC-legacy'").bind('0'.repeat(64)).run();assert.equal((await read('SYNTHETIC-legacy')).status,409);
 const legacyBody={action:'evidence',file_name:'SYNTHETIC-json.png',image_base64:small.toString('base64'),captured_at:null};
 const oldRoute=await mf.dispatchFetch(ORIGIN+'/api/data-center',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify(legacyBody)});assert.equal(oldRoute.status,200);const oldSaved=await oldRoute.json();assert.equal(oldSaved.evidence.storage_kind,'r2');assert.equal((await read(oldSaved.evidence.id)).status,200);
 const tooLargeLegacy=Buffer.alloc(1024*1024+1);small.copy(tooLargeLegacy);const oldTooLarge=await mf.dispatchFetch(ORIGIN+'/api/data-center',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({...legacyBody,image_base64:tooLargeLegacy.toString('base64')})});assert.equal(oldTooLarge.status,413);
 t.diagnostic('Actual isolated workerd multipart + D1/R2: valid >1MiB PNG roundtrip, concurrent replay, strict owner and platform identity, stream limits, legacy D1/R2 compatibility and tamper rejection passed. No hosted credentials or storage were used.');
});
