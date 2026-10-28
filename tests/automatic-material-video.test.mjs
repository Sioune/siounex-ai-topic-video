// Mocked local FFmpeg evidence only; no remote media or real generation.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {prepareAutomaticVideoMedia} from '../scripts/automatic-material-video.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),png=()=>Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40,7)]);
function fixture(t,duration=20){const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-auto-video-')),jobDir=path.join(root,'job');fs.mkdirSync(jobDir);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const bytes=Buffer.from('SYNTHETIC local exact video bytes'),file=path.join(jobDir,'source.mp4');fs.writeFileSync(file,bytes);const calls=[],media={asset_id:'source_video_1',kind:'video',file,sha256:sha(bytes),size_bytes:bytes.length,source_url:'https://example.org/SYNTHETIC-source',rights_status:'unconfirmed'},run=(bin,args,options)=>{calls.push({bin,args,options});if(bin==='ffprobe')return {status:0,stdout:JSON.stringify({streams:[{codec_type:'video',width:1280,height:720}],format:{duration:String(duration)}})};if(args.includes('null'))return {status:0,stdout:Buffer.alloc(0)};return {status:0,stdout:png()};};return {root,jobDir,file,bytes,media,calls,run};}
test('full decode then at most six actual timestamped PNG frames retain exact source provenance and cached bytes',async t=>{const f=fixture(t),value=await prepareAutomaticVideoMedia(f.media,f);assert.equal(value.rights_status,'unconfirmed');assert.equal(value.source_url,f.media.source_url);const r=value.video_review;assert.equal(r.full_decode,true);assert.equal(r.semantic_approval,false);assert.equal(r.duration_seconds,20);assert.deepEqual(r.frames.map(x=>x.source_second),[0,2,5,9,14,19.9]);assert.equal(f.calls[1].args.includes('-xerror'),true);assert.equal(f.calls[1].args.includes('null'),true);for(const c of f.calls){assert.equal(c.options.windowsHide,true);assert.ok(c.options.timeout<=90000);assert.equal(c.args[c.args.indexOf('-protocol_whitelist')+1],'file,pipe');}for(const frame of r.frames){const bytes=fs.readFileSync(frame.file);assert.equal(frame.sha256,sha(bytes));assert.equal(frame.size_bytes,bytes.length);}const firstCount=f.calls.length,cached=await prepareAutomaticVideoMedia(f.media,f);assert.deepEqual(cached.video_review,r);assert.equal(f.calls.length,firstCount+1,'only ffprobe repeats; no duplicate decode or PNG extraction');});
test('short video has distinct in-range samples and never pads with fabricated frames',async t=>{const f=fixture(t,.5),r=(await prepareAutomaticVideoMedia(f.media,f)).video_review;assert.deepEqual(r.frames.map(x=>x.source_second),[0,.4]);assert.ok(r.frames.every(x=>x.source_second<r.duration_seconds));});
test('short GIF sampling stays on the final available frame instead of seeking beyond its PTS',async t=>{const f=fixture(t,.85),run=(bin,args,options)=>bin==='ffmpeg'&&!args.includes('null')&&Number(args[args.indexOf('-ss')+1])>.75?{status:0,stdout:Buffer.alloc(0)}:f.run(bin,args,options),r=(await prepareAutomaticVideoMedia(f.media,{...f,run})).video_review;assert.deepEqual(r.frames.map(x=>x.source_second),[0,.75]);assert.equal(r.full_decode,true);assert.equal(r.semantic_approval,false);});
test('changed SHA, size, outside file or symlink never reaches FFmpeg',async t=>{for(const kind of ['sha','size','outside','symlink'])await t.test(kind,async t=>{const f=fixture(t),m={...f.media};if(kind==='sha')m.sha256='a'.repeat(64);else if(kind==='size')m.size_bytes++;else if(kind==='outside'){m.file=path.join(f.root,'outside.mp4');fs.writeFileSync(m.file,f.bytes);}else{const link=path.join(f.jobDir,'linked.mp4');try{fs.symlinkSync(f.file,link);}catch(e){if(['EPERM','EACCES'].includes(e.code)){t.skip('host disallows synthetic symlink');return;}throw e;}m.file=link;}await assert.rejects(()=>prepareAutomaticVideoMedia(m,f),/AUTO_VIDEO_/);assert.equal(f.calls.length,0);});});
test('full decode timeout or failure cannot leave a success receipt and releases only its own lock',async t=>{for(const kind of ['timeout','failure'])await t.test(kind,async t=>{const f=fixture(t),run=(bin,args,options)=>bin==='ffmpeg'&&args.includes('null')?kind==='timeout'?{status:null,error:{code:'ETIMEDOUT'}}:{status:1,stderr:'SYNTHETIC bad decode'}:f.run(bin,args,options);await assert.rejects(()=>prepareAutomaticVideoMedia(f.media,{...f,run}),new RegExp('AUTO_VIDEO_FULL_DECODE_'+(kind==='timeout'?'TIMEOUT':'FAILED')));const tree=fs.readdirSync(path.join(f.jobDir,'automatic-video-review',f.media.sha256),{recursive:true});assert.equal(tree.some(x=>x.endsWith('video-review.json')||x.endsWith('.decode.lock')),false);});});
test('bad probe or non-PNG frame is rejected without claiming semantic coverage',async t=>{for(const kind of ['probe','frame'])await t.test(kind,async t=>{const f=fixture(t),run=(bin,args,options)=>kind==='probe'&&bin==='ffprobe'?{status:0,stdout:'{"streams":[]}'}:kind==='frame'&&bin==='ffmpeg'&&!args.includes('null')?{status:0,stdout:Buffer.from('not a PNG')}:f.run(bin,args,options);await assert.rejects(()=>prepareAutomaticVideoMedia(f.media,{...f,run}),new RegExp('AUTO_VIDEO_'+kind.toUpperCase()+'_INVALID'));});});
test('cached frame tampering and an existing unknown review lock require reconciliation',async t=>{const f=fixture(t),r=(await prepareAutomaticVideoMedia(f.media,f)).video_review;fs.writeFileSync(r.frames[0].file,'SYNTHETIC tamper');await assert.rejects(()=>prepareAutomaticVideoMedia(f.media,f),/AUTO_VIDEO_CACHE_CHANGED/);fs.writeFileSync(r.frames[0].file,png());const dir=path.dirname(r.frames[0].file);fs.unlinkSync(path.join(dir,'video-review.json'));fs.writeFileSync(path.join(dir,'.decode.lock'),'SYNTHETIC unknown invocation');await assert.rejects(()=>prepareAutomaticVideoMedia(f.media,f),/AUTO_VIDEO_REVIEW_ALREADY_RUNNING/);assert.equal(fs.readFileSync(path.join(dir,'.decode.lock'),'utf8'),'SYNTHETIC unknown invocation');});
test('insufficient fresh budget invokes no child and creates no output lock; exact cache uses only a 25 second probe reserve',async t=>{const f=fixture(t),start=1000;await assert.rejects(()=>prepareAutomaticVideoMedia(f.media,{...f,deadline_ms:start+179999,now:()=>start}),e=>e.code==='PRIVATE_CONTINUATION_BUDGET_DEFERRED'&&e.phase==='automatic-video-review');assert.equal(f.calls.length,0);assert.equal(fs.existsSync(path.join(f.jobDir,'automatic-video-review')),false);const first=await prepareAutomaticVideoMedia(f.media,{...f,deadline_ms:start+180000,now:()=>start});const count=f.calls.length;const cached=await prepareAutomaticVideoMedia(f.media,{...f,deadline_ms:start+25000,now:()=>start});assert.deepEqual(cached.video_review,first.video_review);assert.equal(f.calls.length,count+1);await assert.rejects(()=>prepareAutomaticVideoMedia(f.media,{...f,deadline_ms:start+24999,now:()=>start}),e=>e.code==='PRIVATE_CONTINUATION_BUDGET_DEFERRED');assert.equal(f.calls.length,count+1);});
test('budget recheck before decode or an actual frame yields normally and releases its own lock',async t=>{for(const phase of ['decode','frame'])await t.test(phase,async t=>{const f=fixture(t);let clock=0;const deadline=180000,run=(bin,args,options)=>{const result=f.run(bin,args,options);if(bin==='ffprobe')clock=phase==='decode'?80000:10000;else if(args.includes('null'))clock=160000;return result;};await assert.rejects(()=>prepareAutomaticVideoMedia(f.media,{...f,run,deadline_ms:deadline,now:()=>clock}),e=>e.code==='PRIVATE_CONTINUATION_BUDGET_DEFERRED');assert.equal(f.calls.some(c=>phase==='decode'?c.bin==='ffmpeg':c.bin==='ffmpeg'&&!c.args.includes('null')),false);const output=path.join(f.jobDir,'automatic-video-review',f.media.sha256),tree=fs.readdirSync(output,{recursive:true});assert.equal(tree.some(x=>x.endsWith('.decode.lock')||x.endsWith('video-review.json')),false);});});

test('thirty-second default retains the six legacy sample times',async t=>{
 const f=fixture(t,30),r=(await prepareAutomaticVideoMedia(f.media,f)).video_review;
 assert.deepEqual(r.frames.map(x=>x.source_second),[0,2,5,9,14,29.9]);
 assert.equal(r.sampling.strategy,'legacy-short-v1');
});

test('long default samples the complete duration with twelve real bounded FFmpeg requests',async t=>{
 const f=fixture(t,112.24),r=(await prepareAutomaticVideoMedia(f.media,f)).video_review,seconds=r.frames.map(x=>x.source_second),calls=f.calls.filter(c=>c.bin==='ffmpeg'&&!c.args.includes('null'));
 assert.equal(seconds.length,12);assert.equal(seconds[0],0);assert.equal(seconds.at(-1),112.14);
 assert.ok(seconds.some(s=>s>50&&s<65));assert.ok(seconds.some(s=>s>70&&s<85));assert.ok(seconds.some(s=>s>100));
 assert.ok(Math.max(...seconds.slice(1).map((s,i)=>s-seconds[i]))<10.2);
 assert.deepEqual(calls.map(c=>Number(c.args[c.args.indexOf('-ss')+1])),seconds);
 assert.ok(calls.every(c=>c.args[c.args.indexOf('-i')+1]===f.file));
 assert.equal(r.sampling.strategy,'whole-duration-uniform-v1');
 assert.deepEqual([r.semantic_approval,r.quality_approved,r.publication_authorized],[false,false,false]);
});

test('focus seconds add observed middle/end samples while retaining whole-duration coverage and no semantic grant',async t=>{
 const f=fixture(t,112.24),focus=[11,14,18,22,69,73,77,82,87],media={...f.media,sampling_seconds:focus,semantic_approval:true,video_review:{semantic_approval:true,frames:[{source_second:73}]}},r=(await prepareAutomaticVideoMedia(media,f)).video_review;
 assert.equal(r.frames.length,21);assert.deepEqual(r.sampling.requested_seconds,focus);
 assert.ok(focus.every(s=>r.frames.some(x=>x.source_second===s)));assert.ok(r.frames.some(x=>x.source_second>100));
 assert.equal(f.calls.filter(c=>c.bin==='ffmpeg'&&!c.args.includes('null')).length,r.frames.length);
 assert.deepEqual([r.semantic_approval,r.quality_approved,r.publication_authorized],[false,false,false]);
});

test('twelve focus points cannot push the long source beyond twenty-four actual frames',async t=>{
 const f=fixture(t,120),focus=Array.from({length:12},(_,i)=>i+1),r=(await prepareAutomaticVideoMedia({...f.media,sampling_seconds:focus},f)).video_review;
 assert.equal(r.frames.length,24);assert.ok(r.frames.some(x=>x.source_second>100));
});

for(const [name,focus]of [['too many',Array.from({length:13},(_,i)=>i)],['NaN',[NaN]],['infinite',[Infinity]],['negative',[-1]],['string',['11']],['object',{}],['null',null],['not ordered',[69,11]],['duplicate',[11,11]],['global bound',[7200]]])test('focus rejects '+name+' before any child call',async t=>{
 const f=fixture(t,112.24);await assert.rejects(()=>prepareAutomaticVideoMedia({...f.media,sampling_seconds:focus},f),e=>e.code==='AUTO_VIDEO_SAMPLING_SECONDS_INVALID');assert.equal(f.calls.length,0);
});

for(const second of [112.24,113])test('focus outside the actual '+second+' second source boundary cannot decode or write a success',async t=>{
 const f=fixture(t,112.24);await assert.rejects(()=>prepareAutomaticVideoMedia({...f.media,sampling_seconds:[second]},f),e=>e.code==='AUTO_VIDEO_SAMPLING_SECONDS_INVALID');
 assert.deepEqual(f.calls.map(c=>c.bin),['ffprobe']);assert.equal(fs.existsSync(path.join(f.jobDir,'automatic-video-review')),false);
});

test('focus is a cache identity; exact repeated hints reuse only their own checked PNGs',async t=>{
 const f=fixture(t,112.24),one={...f.media,sampling_seconds:[69,73]},first=(await prepareAutomaticVideoMedia(one,f)).video_review,firstFile=path.join(path.dirname(first.frames[0].file),'video-review.json'),firstBytes=fs.readFileSync(firstFile),count=f.calls.length;
 assert.deepEqual((await prepareAutomaticVideoMedia(one,f)).video_review,first);assert.equal(f.calls.length,count+1);
 const second=(await prepareAutomaticVideoMedia({...f.media,sampling_seconds:[69,77]},f)).video_review;
 assert.notEqual(path.dirname(second.frames[0].file),path.dirname(first.frames[0].file));assert.ok(second.frames.some(x=>x.source_second===77));assert.deepEqual(fs.readFileSync(firstFile),firstBytes);
});

test('empty focus preserves the no-hint short cache and its legacy six frames',async t=>{
 const f=fixture(t),first=(await prepareAutomaticVideoMedia(f.media,f)).video_review,count=f.calls.length;
 assert.deepEqual((await prepareAutomaticVideoMedia({...f.media,sampling_seconds:[]},f)).video_review,first);assert.equal(f.calls.length,count+1);
});

test('a new focus key cannot hide an unknown old implementation lock',async t=>{
 const f=fixture(t,112.24),parent=path.join(f.jobDir,'automatic-video-review',f.media.sha256),old=path.join(parent,'old-implementation');fs.mkdirSync(old,{recursive:true});const lock=path.join(old,'.decode.lock');fs.writeFileSync(lock,'SYNTHETIC unknown original invocation');
 await assert.rejects(()=>prepareAutomaticVideoMedia({...f.media,sampling_seconds:[73]},f),e=>e.code==='AUTO_VIDEO_REVIEW_ALREADY_RUNNING');assert.equal(f.calls.length,0);assert.equal(fs.readFileSync(lock,'utf8'),'SYNTHETIC unknown original invocation');assert.deepEqual(fs.readdirSync(parent),['old-implementation']);
});

test('an old incomplete receipt requires reconciliation even without a lock and cannot be hidden by hints',async t=>{
 const f=fixture(t,112.24),old=path.join(f.jobDir,'automatic-video-review',f.media.sha256,'old-implementation');fs.mkdirSync(old,{recursive:true});const file=path.join(old,'video-review.json'),bytes=Buffer.from(JSON.stringify({schema:'actual-source-video-review-v1',full_decode:false,status:'unknown'}));fs.writeFileSync(file,bytes);
 await assert.rejects(()=>prepareAutomaticVideoMedia({...f.media,sampling_seconds:[73]},f),e=>e.code==='AUTO_VIDEO_REVIEW_RECONCILIATION_REQUIRED');assert.equal(f.calls.length,0);assert.deepEqual(fs.readFileSync(file),bytes);
});

test('a verified completed original receipt permits exact reuse and new hints while its historical lock remains untouched',async t=>{
 const f=fixture(t,112.24),first=(await prepareAutomaticVideoMedia(f.media,f)).video_review,lock=path.join(path.dirname(first.frames[0].file),'.decode.lock'),bytes=Buffer.from('SYNTHETIC completed process before lock release');fs.writeFileSync(lock,bytes);const count=f.calls.length;
 assert.deepEqual((await prepareAutomaticVideoMedia(f.media,f)).video_review,first);assert.equal(f.calls.length,count+1);
 const second=(await prepareAutomaticVideoMedia({...f.media,sampling_seconds:[73]},f)).video_review;assert.ok(second.frames.some(x=>x.source_second===73));assert.deepEqual(fs.readFileSync(lock),bytes);
});

test('a lock with a damaged completed frame stays unresolved when a different focus key is requested',async t=>{
 const f=fixture(t,112.24),first=(await prepareAutomaticVideoMedia(f.media,f)).video_review,lock=path.join(path.dirname(first.frames[0].file),'.decode.lock');fs.writeFileSync(lock,'SYNTHETIC unknown after damage');fs.writeFileSync(first.frames[0].file,'SYNTHETIC damage');const count=f.calls.length;
 await assert.rejects(()=>prepareAutomaticVideoMedia({...f.media,sampling_seconds:[73]},f),e=>e.code==='AUTO_VIDEO_REVIEW_ALREADY_RUNNING');assert.equal(f.calls.length,count);assert.equal(fs.existsSync(lock),true);
});

test('an unknown different key appearing after probe prevents decoding and only the current lock is released',async t=>{
 const f=fixture(t,112.24),old=path.join(f.jobDir,'automatic-video-review',f.media.sha256,'concurrent-key'),run=(bin,args,options)=>{const result=f.run(bin,args,options);if(bin==='ffprobe'){fs.mkdirSync(old,{recursive:true});fs.writeFileSync(path.join(old,'.decode.lock'),'SYNTHETIC other owner');}return result;};
 await assert.rejects(()=>prepareAutomaticVideoMedia({...f.media,sampling_seconds:[73]},{...f,run}),e=>e.code==='AUTO_VIDEO_REVIEW_ALREADY_RUNNING');assert.equal(f.calls.some(c=>c.bin==='ffmpeg'),false);assert.equal(fs.readFileSync(path.join(old,'.decode.lock'),'utf8'),'SYNTHETIC other owner');
 const locks=fs.readdirSync(path.dirname(old),{recursive:true}).filter(f=>f.endsWith('.decode.lock'));assert.deepEqual(locks,[path.join('concurrent-key','.decode.lock')]);
});

test('long sampling reserves its bounded extra frame budget before decode but exact cache still needs only the probe reserve',async t=>{
 const f=fixture(t,112.24),now=()=>0;await assert.rejects(()=>prepareAutomaticVideoMedia(f.media,{...f,now,deadline_ms:239999}),e=>e.code==='PRIVATE_CONTINUATION_BUDGET_DEFERRED');assert.deepEqual(f.calls.map(c=>c.bin),['ffprobe']);assert.equal(fs.existsSync(path.join(f.jobDir,'automatic-video-review')),false);
 const first=(await prepareAutomaticVideoMedia(f.media,{...f,now,deadline_ms:240000})).video_review,count=f.calls.length;assert.deepEqual((await prepareAutomaticVideoMedia(f.media,{...f,now,deadline_ms:25000})).video_review,first);assert.equal(f.calls.length,count+1);
});

test('hinted preparation rechecks the actual source bytes before accepting its technical review',async t=>{
 const f=fixture(t,112.24);let changed=false;const run=(bin,args,options)=>{const result=f.run(bin,args,options);if(bin==='ffmpeg'&&!args.includes('null')&&!changed){changed=true;fs.writeFileSync(f.file,'SYNTHETIC changed source after first extraction');}return result;};
 await assert.rejects(()=>prepareAutomaticVideoMedia({...f.media,sampling_seconds:[73]},{...f,run}),e=>e.code==='AUTO_VIDEO_SOURCE_CHANGED');const tree=fs.readdirSync(path.join(f.jobDir,'automatic-video-review',f.media.sha256),{recursive:true});assert.equal(tree.some(f=>f.endsWith('video-review.json')||f.endsWith('.decode.lock')),false);
});
