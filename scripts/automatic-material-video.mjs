// Technical evidence from exact local source bytes. Frame selection is not a
// semantic, rights, official-source, or final quality approval.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const implementation=sha(fs.readFileSync(new URL(import.meta.url)));
const fail=code=>{throw Object.assign(Error(code),{code})};
const inside=(base,file)=>{const rel=path.relative(base,file);return rel!==''&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep)};
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
function safePath(file,base,{exists=true}={}){
 const absolute=path.resolve(file);if(!inside(base,absolute))fail('AUTO_VIDEO_FILE_SCOPE');
 let cursor=base;for(const part of path.relative(base,absolute).split(path.sep)){cursor=path.join(cursor,part);if(fs.existsSync(cursor)){if(fs.lstatSync(cursor).isSymbolicLink())fail('AUTO_VIDEO_SYMLINK');}else if(exists)fail('AUTO_VIDEO_FILE_MISSING');}
 if(exists&&(!inside(base,fs.realpathSync(absolute))||fs.realpathSync(absolute).toLowerCase()!==absolute.toLowerCase()))fail('AUTO_VIDEO_FILE_SCOPE');return absolute;
}
function readFile(file,base,max){const actual=safePath(file,base),stat=fs.statSync(actual);if(!stat.isFile()||stat.size<1||stat.size>max)fail('AUTO_VIDEO_BYTE_LIMIT');return {file:actual,bytes:fs.readFileSync(actual)};}
function writeExact(file,bytes,base){safePath(file,base,{exists:false});try{fs.writeFileSync(file,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||sha(readFile(file,base,4000000).bytes)!==sha(bytes))fail('AUTO_VIDEO_CACHE_CHANGED');}}
function processResult(result,phase){if(result?.error?.code==='ETIMEDOUT'||result?.signal==='SIGTERM'||result?.signal==='SIGKILL')fail('AUTO_VIDEO_'+phase+'_TIMEOUT');if(result?.status!==0||result?.error)fail('AUTO_VIDEO_'+phase+'_FAILED');return result;}
const runOptions={windowsHide:true,maxBuffer:4000000};
function requireBudget(deadline_ms,now,minimum){if(Number.isFinite(deadline_ms)&&deadline_ms-now()<minimum)throw Object.assign(Error('PRIVATE_CONTINUATION_BUDGET_DEFERRED'),{code:'PRIVATE_CONTINUATION_BUDGET_DEFERRED',phase:'automatic-video-review'});}
function samplingRequest(media){
 const values=media.sampling_seconds;if(values===undefined)return [];
 if(!Array.isArray(values)||values.length>12||values.some((s,i)=>typeof s!=='number'||!Number.isFinite(s)||s<0||s>=7200||i>0&&s<=values[i-1]))fail('AUTO_VIDEO_SAMPLING_SECONDS_INVALID');
 return [...values];
}
function secondsFor(duration,focus=[]){
 // Keep the final sample inside the file, and retain source seconds rather
 // than inventing new frames for a very short/static video.
 const tail=Math.max(0,duration-Math.min(.1,duration/2));
 if(focus.some(s=>s>=duration))fail('AUTO_VIDEO_SAMPLING_SECONDS_INVALID');
 const defaults=duration<=30?[0,2,5,9,14,tail].filter(s=>s>=0&&s<duration):Array.from({length:12},(_,i)=>tail*i/11);
 const unique=[...new Set([...defaults.map(s=>Number(s.toFixed(6))),...focus])].sort((a,b)=>a-b);
 if(unique.length<2)fail('AUTO_VIDEO_TOO_SHORT_FOR_REVIEW');if(unique.length>24)fail('AUTO_VIDEO_SAMPLING_SECONDS_INVALID');return unique;
}
function samplingIdentity(duration,focus){return{schema:'source-video-sampling-v2',strategy:duration<=30?'legacy-short-v1':'whole-duration-uniform-v1',requested_seconds:focus,source_seconds:secondsFor(duration,focus),maximum_frames:24};}
// Different hint/implementation keys must not hide an unfinished same-source
// invocation. Technical success receipts remain history, never semantic grants.
function pendingSourceReview(parent,base,media,currentOutput,ownLock=null){
 if(!fs.existsSync(parent))return;
 safePath(parent,base);
 const entries=fs.readdirSync(parent,{withFileTypes:true});if(entries.length>128)fail('AUTO_VIDEO_REVIEW_HISTORY_LIMIT');
 let checkedBytes=0;
 for(const entry of entries){
  const dir=path.join(parent,entry.name);if(entry.isSymbolicLink())fail('AUTO_VIDEO_SYMLINK');if(!entry.isDirectory())continue;safePath(dir,base);
  const lock=path.join(dir,'.decode.lock');if(lock===ownLock)continue;
  const locked=fs.existsSync(lock),file=path.join(dir,'video-review.json');
  if(!fs.existsSync(file)){if(locked)fail('AUTO_VIDEO_REVIEW_ALREADY_RUNNING');continue;}
  // The current selected cache keeps its original strict cache-change errors.
  if(dir===currentOutput&&!locked)continue;
  let complete=false;try{
   const saved=JSON.parse(readFile(file,base,1000000).bytes);
   complete=saved.schema==='actual-source-video-review-v1'&&/^[a-f0-9]{64}$/.test(saved.implementation_sha256||'')&&saved.source_sha256===media.sha256&&saved.source_size_bytes===media.size_bytes&&saved.source_kind==='published-source-clip'&&Number.isFinite(saved.duration_seconds)&&saved.duration_seconds>0&&saved.duration_seconds<=7200&&saved.full_decode===true&&saved.semantic_approval===false&&saved.quality_approved===false&&saved.publication_authorized===false&&Array.isArray(saved.frames)&&saved.frames.length>=2&&saved.frames.length<=24;
   if(complete){const ids=new Set();for(const [i,frame]of saved.frames.entries()){
    if(typeof frame.source_second!=='number'||!Number.isFinite(frame.source_second)||frame.source_second<0||frame.source_second>=saved.duration_seconds||i>0&&frame.source_second<=saved.frames[i-1].source_second||ids.has(frame.frame_id)||frame.frame_id!=='source-frame-'+sha(media.sha256+'\n'+frame.source_second)){complete=false;break;}
    const stat=fs.statSync(safePath(frame.file,base));checkedBytes+=stat.size;if(checkedBytes>64000000)fail('AUTO_VIDEO_REVIEW_HISTORY_LIMIT');
    const bytes=readFile(frame.file,base,4000000).bytes;if(bytes.length!==frame.size_bytes||sha(bytes)!==frame.sha256||bytes.length<24||!bytes.subarray(0,8).equals(PNG)){complete=false;break;}ids.add(frame.frame_id);
   }}
  }catch(error){if(error.code==='AUTO_VIDEO_REVIEW_HISTORY_LIMIT')throw error;complete=false;}
  // A fully verified success may have crashed just before releasing its old
  // lock. Keep that historical lock untouched, but do not call it unknown.
  if(!complete)fail(locked?'AUTO_VIDEO_REVIEW_ALREADY_RUNNING':'AUTO_VIDEO_REVIEW_RECONCILIATION_REQUIRED');
 }
}
export function sourceVideoDuration(probe,media){
 const stream=probe.streams?.find(s=>s.codec_type==='video'),streamSeconds=Number(stream?.duration),containerSeconds=Number(probe.format?.duration);
 const observed=Number.isFinite(streamSeconds)&&streamSeconds>0?streamSeconds:containerSeconds;
 // MP4 movie headers can quantize 629/30 video seconds to 20.966. A locally
 // compiled 30fps sequence has already verified every part's exact frame count.
 // Use that clock only when this probe independently confirms the same count;
 // a genuinely short original may not borrow a rounding tolerance.
 if(media?.schema==='verified-content-motion-sequence-v1'&&Number.isSafeInteger(media.frames)&&media.frames>0){
  if(stream?.r_frame_rate!=='30/1'||Number(stream.nb_frames)!==media.frames||!Number.isFinite(observed)||Math.abs(observed-media.frames/30)>.001)fail('AUTO_VIDEO_COMPILED_TIMING_CHANGED');
  return media.frames/30;
 }
 return observed;
}
function cachedReview(file,base,media,duration,sampling){
 if(!fs.existsSync(file))return null;
 const raw=readFile(file,base,1000000).bytes,value=JSON.parse(raw);
 if(value.schema!=='actual-source-video-review-v1'||value.implementation_sha256!==implementation||value.source_sha256!==media.sha256||value.source_size_bytes!==media.size_bytes||value.full_decode!==true||value.source_kind!=='published-source-clip'||value.duration_seconds!==duration||value.semantic_approval!==false||value.quality_approved!==false||value.publication_authorized!==false||canonical(value.sampling)!==canonical(sampling)||!Array.isArray(value.frames)||value.frames.length<2||value.frames.length>24||canonical(value.frames.map(f=>f.source_second))!==canonical(sampling.source_seconds))fail('AUTO_VIDEO_CACHE_CHANGED');
 const ids=new Set();for(const frame of value.frames){const bytes=readFile(frame.file,base,4000000).bytes;if(ids.has(frame.frame_id)||frame.frame_id!=='source-frame-'+sha(media.sha256+'\n'+frame.source_second)||bytes.length!==frame.size_bytes||sha(bytes)!==frame.sha256||bytes.length<24||!bytes.subarray(0,8).equals(PNG))fail('AUTO_VIDEO_CACHE_CHANGED');ids.add(frame.frame_id);}
 return value;
}
export async function prepareAutomaticVideoMedia(media,{root=process.cwd(),jobDir,run=spawnSync,deadline_ms=Infinity,now=Date.now}={}){
 const base=fs.realpathSync(root);if(fs.lstatSync(path.resolve(root)).isSymbolicLink()||typeof jobDir!=='string')fail('AUTO_VIDEO_JOB_SCOPE');
 const directory=safePath(jobDir,base);if(!fs.statSync(directory).isDirectory())fail('AUTO_VIDEO_JOB_SCOPE');
 if(!media||media.kind!=='video'||typeof media.file!=='string'||!/^\w/.test(media.asset_id||'')||!/^[a-f0-9]{64}$/.test(media.sha256||''))fail('AUTO_VIDEO_INPUT_INVALID');
 const focus=samplingRequest(media);
 const source=readFile(media.file,directory,300000000),size=source.bytes.length;
 if(!Number.isSafeInteger(media.size_bytes)||size!==media.size_bytes||sha(source.bytes)!==media.sha256)fail('AUTO_VIDEO_SOURCE_CHANGED');
 const parent=path.join(directory,'automatic-video-review',media.sha256),key=focus.length?sha(canonical({implementation,sampling_seconds:focus})):implementation,output=path.join(parent,key);safePath(output,base,{exists:false});const receiptFile=path.join(output,'video-review.json');
 pendingSourceReview(parent,directory,media,output);
 // A fresh review reserves the full bounded probe/decode/frame sequence before
 // creating a lock. A durable same-byte receipt only needs a bounded probe.
 requireBudget(deadline_ms,now,fs.existsSync(receiptFile)?25000:180000);
 const probeResult=processResult(run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',source.file],{...runOptions,encoding:'utf8',timeout:10000}),'PROBE');
 let probe;try{probe=JSON.parse(probeResult.stdout);}catch{fail('AUTO_VIDEO_PROBE_INVALID');}
 const stream=probe.streams?.find(s=>s.codec_type==='video'),duration=sourceVideoDuration(probe,media);
 if(!stream||!Number.isInteger(stream.width)||!Number.isInteger(stream.height)||stream.width<16||stream.height<16||stream.width>8192||stream.height>8192||!Number.isFinite(duration)||duration<=0||duration>7200)fail('AUTO_VIDEO_PROBE_INVALID');
 const sampling=samplingIdentity(duration,focus),prior=cachedReview(receiptFile,directory,media,duration,sampling);if(prior)return {...media,file:source.file,video_review:prior};
 if(sampling.source_seconds.length>6)requireBudget(deadline_ms,now,180000+(sampling.source_seconds.length-6)*10000);
 fs.mkdirSync(output,{recursive:true});safePath(output,base);
 const lock=path.join(output,'.decode.lock');let lockFd;
 try{
  try{lockFd=fs.openSync(lock,'wx');fs.writeFileSync(lockFd,canonical({source_sha256:media.sha256,implementation_sha256:implementation,sampling_seconds:focus,invocation:randomUUID()}));}
  catch(e){if(e.code==='EEXIST')fail('AUTO_VIDEO_REVIEW_ALREADY_RUNNING');throw e;}
  // Double-check after locking our key: two different fresh hint keys cannot
  // both pass their initial unlocked scan and then launch FFmpeg concurrently.
  pendingSourceReview(parent,directory,media,output,lock);
  requireBudget(deadline_ms,now,105000+Math.max(0,sampling.source_seconds.length-6)*10000);
  processResult(run('ffmpeg',['-v','error','-xerror','-nostdin','-protocol_whitelist','file,pipe','-i',source.file,'-map','0:v:0','-an','-f','null','-'],{...runOptions,timeout:90000}),'FULL_DECODE');
  const frames=[];for(const second of sampling.source_seconds){
   requireBudget(deadline_ms,now,25000);
   const result=processResult(run('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file,pipe','-ss',String(second),'-i',source.file,'-map','0:v:0','-frames:v','1','-vf','scale=640:-2','-f','image2pipe','-vcodec','png','pipe:1'],{...runOptions,timeout:10000}),'FRAME');
   const bytes=Buffer.isBuffer(result.stdout)?result.stdout:Buffer.from(result.stdout||'');if(bytes.length<24||bytes.length>4000000||!bytes.subarray(0,8).equals(PNG))fail('AUTO_VIDEO_FRAME_INVALID');
   const file=path.join(output,'frame-'+String(second).replace('.','_')+'.png');writeExact(file,bytes,directory);frames.push({frame_id:'source-frame-'+sha(media.sha256+'\n'+second),file,sha256:sha(bytes),size_bytes:bytes.length,source_second:second});
  }
  if(sha(readFile(source.file,directory,300000000).bytes)!==media.sha256)fail('AUTO_VIDEO_SOURCE_CHANGED');
  const video_review={schema:'actual-source-video-review-v1',implementation_sha256:implementation,full_decode:true,source_kind:'published-source-clip',duration_seconds:duration,source_sha256:media.sha256,source_size_bytes:size,sampling,frames,semantic_approval:false,quality_approved:false,publication_authorized:false};
  writeExact(receiptFile,Buffer.from(JSON.stringify(video_review,null,2)),directory);return {...media,file:source.file,video_review};
 }finally{if(lockFd!==undefined){fs.closeSync(lockFd);fs.unlinkSync(lock);}}
}
