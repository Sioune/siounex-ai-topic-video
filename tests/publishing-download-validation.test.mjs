// Synthetic local response bodies and owned temporary files only; never fetches a URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {saveVerifiedArchive,validateExpectedArchive} from '../scripts/publishing-download-validation.mjs';

const bytes=Buffer.from('SYNTHETIC approved archive bytes, never a real video or cover.');
const binding=data=>({expected_sha256:createHash('sha256').update(data).digest('hex'),expected_size_bytes:data.length});
function fixture(t){const root=mkdtempSync(path.join(tmpdir(),'publishing-download-test-'));t.after(()=>{const relative=path.relative(path.resolve(tmpdir()),path.resolve(root));assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(root).startsWith('publishing-download-test-'));rmSync(root,{recursive:true,force:true});});return root;}
function response(data=bytes,overrides={}){const headers=new Headers({'x-asset-sha256':binding(bytes).expected_sha256,'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent('SYNTHETIC-current.bin')});for(const [key,value] of Object.entries(overrides)){if(value===null)headers.delete(key);else headers.set(key,value);}return new Response(data,{headers});}
const leftovers=root=>readdirSync(root).filter(name=>name.includes('.part-'));

test('missing Content-Length succeeds only for the approved exact SHA and positive work-packet byte size',async t=>{
 const root=fixture(t),r=response();assert.equal(r.headers.get('content-length'),null);const saved=await saveVerifiedArchive(r,binding(bytes),root);assert.equal(saved.size_bytes,bytes.length);assert.equal(saved.sha256,binding(bytes).expected_sha256);assert.deepEqual(readFileSync(saved.path),bytes);assert.deepEqual(leftovers(root),[]);
});

test('expected_size_bytes is mandatory, numeric, positive and a safe integer before any download file is created',async t=>{
 const root=fixture(t);for(const size of [undefined,null,0,-1,'60',1.5,Infinity,Number.MAX_SAFE_INTEGER+1]){assert.throws(()=>validateExpectedArchive({...binding(bytes),expected_size_bytes:size}),/positive integer/);await assert.rejects(()=>saveVerifiedArchive(response(),{...binding(bytes),expected_size_bytes:size},root),/positive integer/);}assert.deepEqual(readdirSync(root),[]);
});

test('wrong actual SHA or work-packet size rejects, reports whitelisted facts and deletes only its new temporary file',async t=>{
 const root=fixture(t);for(const [data,expected] of [[Buffer.from('SYNTHETIC different archive'),binding(bytes)],[bytes,{...binding(bytes),expected_size_bytes:bytes.length+1}]]){await assert.rejects(()=>saveVerifiedArchive(response(data),{...expected,site_token:'SYNTHETIC-never-output-token',claim_token:'SYNTHETIC-never-output-claim'},root),error=>{assert.match(error.message,/failed SHA\/length/);assert.match(error.message,/actual_sha256/);assert.match(error.message,/actual_size_bytes/);assert.match(error.message,/expected_size_bytes/);assert.match(error.message,/"header_content_length":null/);assert.doesNotMatch(error.message,/SYNTHETIC-never-output|site_token|claim_token/);return true;});assert.deepEqual(readdirSync(root),[]);}
});

test('identity Content-Length must be valid and match decoded bytes even when both authoritative work-packet checks pass',async t=>{
 const root=fixture(t);for(const length of ['0',String(bytes.length+1),'not-a-size','1, 1','9007199254740992'])await assert.rejects(()=>saveVerifiedArchive(response(bytes,{'content-length':length}),binding(bytes),root),/Content-Length|SHA\/length/);assert.deepEqual(readdirSync(root),[]);const saved=await saveVerifiedArchive(response(bytes,{'content-length':String(bytes.length),'content-encoding':'identity'}),binding(bytes),root);assert.equal(saved.size_bytes,bytes.length);
});

test('encoded transfer Content-Length is not confused with Fetch-decoded archive bytes; SHA and work-packet size remain mandatory',async t=>{
 const root=fixture(t),saved=await saveVerifiedArchive(response(bytes,{'content-length':'9','content-encoding':'gzip'}),binding(bytes),root);assert.equal(saved.size_bytes,bytes.length);assert.deepEqual(readFileSync(saved.path),bytes);await assert.rejects(()=>saveVerifiedArchive(response(bytes,{'content-length':'9','content-encoding':'br'}),{...binding(bytes),expected_size_bytes:bytes.length+1},root),error=>{assert.match(error.message,/encoded-transfer-bytes/);return true;});assert.deepEqual(readFileSync(saved.path),bytes);
});

test('cached bytes must match the same approved SHA and size; correct cache works without Content-Length',async t=>{
 const root=fixture(t),destination=path.join(root,'SYNTHETIC-current.bin');writeFileSync(destination,bytes);const saved=await saveVerifiedArchive(response(),binding(bytes),root);assert.equal(saved.path,destination);assert.equal(saved.size_bytes,bytes.length);for(const expected of [{...binding(bytes),expected_size_bytes:bytes.length+1},{...binding(bytes),expected_sha256:'9'.repeat(64)}]){const r=response(bytes,{'x-asset-sha256':expected.expected_sha256});await assert.rejects(()=>saveVerifiedArchive(r,expected,root),/Existing downloaded file has another binding/);assert.deepEqual(readFileSync(destination),bytes);}assert.deepEqual(leftovers(root),[]);
});

test('different existing cache is never overwritten or deleted, including an attempted new valid download',async t=>{
 const root=fixture(t),destination=path.join(root,'SYNTHETIC-current.bin'),other=Buffer.from('SYNTHETIC another approved binding');writeFileSync(destination,other);await assert.rejects(()=>saveVerifiedArchive(response(),binding(bytes),root),/no overwrite/);assert.deepEqual(readFileSync(destination),other);assert.deepEqual(readdirSync(root),['SYNTHETIC-current.bin']);
});

test('concurrent valid downloads atomically share one verified cache and leave no temporary file',async t=>{
 const root=fixture(t),results=await Promise.all([saveVerifiedArchive(response(),binding(bytes),root),saveVerifiedArchive(response(),binding(bytes),root)]);assert.equal(results[0].path,results[1].path);assert.deepEqual(readFileSync(results[0].path),bytes);assert.deepEqual(readdirSync(root),['SYNTHETIC-current.bin']);
});

test('concurrent downloads of different bindings cannot overwrite or delete the winning cache',async t=>{
 const root=fixture(t),other=Buffer.from('SYNTHETIC distinct complete archive'),otherBinding=binding(other),results=await Promise.allSettled([saveVerifiedArchive(response(),binding(bytes),root),saveVerifiedArchive(response(other,{'x-asset-sha256':otherBinding.expected_sha256}),otherBinding,root)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);const winner=results.find(x=>x.status==='fulfilled').value;assert.equal(binding(readFileSync(winner.path)).expected_sha256,winner.sha256);assert.match(results.find(x=>x.status==='rejected').reason.message,/no overwrite/);assert.deepEqual(readdirSync(root),['SYNTHETIC-current.bin']);
});

test('partial stream failure removes its own partial output and preserves a cache installed by a competitor',async t=>{
 const root=fixture(t),destination=path.join(root,'SYNTHETIC-current.bin');let sent=false;const stream=new ReadableStream({pull(controller){if(!sent){sent=true;controller.enqueue(new Uint8Array(bytes.subarray(0,8)));return;}writeFileSync(destination,bytes);controller.error(Error('SYNTHETIC interrupted local response'));}});await assert.rejects(()=>saveVerifiedArchive(response(stream),binding(bytes),root),/interrupted local response/);assert.ok(existsSync(destination));assert.deepEqual(readFileSync(destination),bytes);assert.deepEqual(leftovers(root),[]);
});

test('response SHA and unsafe filenames cannot select another archive or write outside the owned download root',async t=>{
 const root=fixture(t);await assert.rejects(()=>saveVerifiedArchive(response(bytes,{'x-asset-sha256':'9'.repeat(64)}),binding(bytes),root),/SHA does not match/);for(const name of ['../outside.bin','..\\outside.bin','C:\\outside.bin','%broken'])await assert.rejects(()=>saveVerifiedArchive(response(bytes,{'content-disposition':"attachment; filename*=UTF-8''"+(name==='%broken'?name:encodeURIComponent(name))}),binding(bytes),root),/Unsafe archive filename/);assert.deepEqual(readdirSync(root),[]);
});
