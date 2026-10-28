// Read-only recovery proof for a completed speech stage whose display pagination failed.
// The producer adopts these exact bytes in a new input-hash directory; this helper
// never claims work, synthesizes speech, adjusts audio, or changes the old tree.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {command} from './media-adapter.mjs';

const CODE='PRIVATE_CAPTION_PAGINATION_UNBREAKABLE_WORD';
const digest=/^[a-f0-9]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const fail=code=>{throw Object.assign(Error(code),{code});};
const time=s=>Date.parse(s);
const prefix='PRIVATE_CAPTION_RECOVERY_';
function read(file){
 try{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>4000000)return null;const bytes=fs.readFileSync(file);return{value:JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),sha256:sha(bytes)};}catch{return null;}
}
function tree(root,dir){
 const relative=path.relative(root,dir);if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))fail(prefix+'DIRECTORY_OUTSIDE_ROOT');
 let current=root;for(const part of relative.split(path.sep)){current=path.join(current,part);const s=fs.lstatSync(current);if(s.isSymbolicLink()||!s.isDirectory())fail(prefix+'DIRECTORY_LINK');}
 if(fs.realpathSync(dir)!==dir)fail(prefix+'DIRECTORY_CHANGED');
 const files=[];let total=0;
 function walk(base,rel=''){
  for(const e of fs.readdirSync(base,{withFileTypes:true})){
   const full=path.join(base,e.name),file=rel+e.name,s=fs.lstatSync(full);if(s.isSymbolicLink())fail(prefix+'LINK_FORBIDDEN');
   if(s.isDirectory()){if(rel||!['speech','steps'].includes(e.name))fail(prefix+'UNKNOWN_DOWNSTREAM_OUTPUT');walk(full,file+'/');continue;}
   total+=s.size;if(!s.isFile()||files.length>=1000||s.size>500000000||total>2000000000)fail(prefix+'TREE_LIMIT');
   const bytes=fs.readFileSync(full);if(bytes.length!==s.size)fail(prefix+'FILE_CHANGED');files.push({file,sha256:sha(bytes),size_bytes:bytes.length});
  }
 }
 walk(dir);return files.sort((a,b)=>a.file.localeCompare(b.file));
}
// RIFF PCM headers give the actual data duration without invoking TTS, a decoder,
// or ffmpeg. Unknown/truncated chunks are rejected rather than guessed.
function pcm(file,{processed=false}={}){
 const b=fs.readFileSync(file);if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.readUInt32LE(4)+8!==b.length)fail(prefix+'PCM_BYTES_INVALID');
 let fmt=null,data=null,offset=12;
 while(offset+8<=b.length){const tag=b.toString('ascii',offset,offset+4),size=b.readUInt32LE(offset+4),start=offset+8,end=start+size;if(end>b.length)fail(prefix+'PCM_BYTES_INVALID');
  if(tag==='fmt '){if(fmt||size<16)fail(prefix+'PCM_FORMAT_INVALID');fmt={format:b.readUInt16LE(start),channels:b.readUInt16LE(start+2),sample_rate:b.readUInt32LE(start+4),byte_rate:b.readUInt32LE(start+8),block_align:b.readUInt16LE(start+12),bits:b.readUInt16LE(start+14)};}
  if(tag==='data'){if(data!==null)fail(prefix+'PCM_FORMAT_INVALID');data=size;}
  offset=end+(size%2);
 }
 if(offset!==b.length||!fmt||data===null||data<=0||fmt.format!==1||![1,2].includes(fmt.channels)||![16,24,32].includes(fmt.bits)||fmt.sample_rate<8000||fmt.sample_rate>192000||fmt.block_align!==fmt.channels*fmt.bits/8||fmt.byte_rate!==fmt.sample_rate*fmt.block_align||data%fmt.block_align||processed&&(fmt.sample_rate!==48000||fmt.channels!==2||fmt.bits!==16))fail(prefix+'PCM_FORMAT_INVALID');
 return{duration:data/fmt.byte_rate,sample_rate:fmt.sample_rate,channels:fmt.channels};
}
function scopeMatches(context,h){
 const j=context.job,b=context.binding,s=j.media_continuation?.scope,expected={revision:j.revision,script_hash:j.approved_hash,mode_epoch:j.mode_epoch,contract_hash:j.contract_hash};
 if(j.is_test||!['auto','node'].includes(j.review_mode)||j.error||j.publication_reports?.length||Number(j.lease_until)>Date.now()||s?.owner_confirmed!==true||s.authorization_source!=='owner-private-video'||s.quality_approved!==false||s.id!==j.media_continuation.current_id||canonical(s.binding)!==canonical(expected)||canonical(b)!==canonical({...expected,scope_id:s.id,scope:'private-video'})||canonical(h.binding)!==canonical(b))fail(prefix+'CURRENT_APPROVAL_OR_SCOPE_CHANGED');
 for(const node of ['source','script']){const m=j.milestones?.filter(m=>m.node===node&&m.revision===j.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];if(m?.status!=='approved'||m.mode_epoch!==j.mode_epoch||m.artifact_hash!==j.approved_hash)fail(prefix+'TEXT_APPROVAL_CHANGED');}
 if(j.milestones?.some(m=>m.node==='video'&&m.revision===j.revision||m.status==='ai_running'||Number(m.review_until)>Date.now())||j.operations?.some(o=>!['completed','abandoned','cancelled'].includes(o.status))||j.stages?.some(s=>s.status==='running'))fail(prefix+'OTHER_WORK_OR_RESULT_PRESENT');
}
export function completedPrivateFailureRun(root,context,h,startedAt,stepEnd){
 const runRoot=path.join(root,'.sites-runtime/periodic-runs');if(!fs.existsSync(runRoot)||fs.lstatSync(runRoot).isSymbolicLink())fail(prefix+'ORIGINAL_RUN_END_UNPROVEN');
 const matches=[];
 for(const entry of fs.readdirSync(runRoot,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.isSymbolicLink())continue;const dir=path.join(runRoot,entry.name),eventDir=path.join(dir,'job-events');
  if(!fs.existsSync(eventDir)||fs.lstatSync(eventDir).isSymbolicLink())continue;
  const proof=read(path.join(dir,'proof.json')),p=proof?.value?.executor_process,exit=read(path.join(dir,'executor/process-exit.json')),x=exit?.value;
  let run_id=proof?.value?.run_id,start=time(p?.started_at),end=time(p?.finished_at),evidence=null;
  if(p&&x&&p.scope==='owned-child-tree'&&x.scope==='owned-child-tree'&&Number.isSafeInteger(p.pid)&&Number.isInteger(p.exit_code)&&p.exit_code===x.exit_code&&p.pid===x.pid&&p.started_at===x.started_at&&p.finished_at===x.finished_at&&![p,x].some(v=>v.termination_unconfirmed===true||v.result_unknown===true||v.timed_out===true||v.spawn_error||v.signal)){
   evidence={kind:'terminated-owned-executor',process_proof_sha256:proof.sha256,process_exit_sha256:exit.sha256};
  }else{
   // A foreground owner-authorized verification has no child executor journal.
   // Its matching immutable start/result/returned proof plus the current process
   // snapshots establish that its finite producer call has already returned.
   const verified=read(path.join(dir,'verification-proof.json')),begin=read(path.join(dir,'verification-start.json')),result=read(path.join(dir,'verification-result.json')),v=verified?.value;
   if(!v||!begin||!result||v.mode!=='owner-authorized-system-verification'||v.run_id!==begin.value.run_id||v.started_at!==begin.value.started_at||begin.value.mode!==v.mode||v.publication_authorized!==false||v.result?.completed!==true||v.result?.in_progress!==false||canonical(v.result)!==canonical(result.value))continue;
   run_id=v.run_id;start=time(v.started_at);end=time(v.finished_at);evidence={kind:'returned-owner-verification',verification_proof_sha256:verified.sha256,verification_start_sha256:begin.sha256,verification_result_sha256:result.sha256};
  }
  if(!evidence||run_id!==entry.name||!Number.isFinite(start)||!Number.isFinite(end)||end<start||end>Date.now()||startedAt<start||stepEnd>end)continue;
  for(const name of fs.readdirSync(eventDir)){
   if(!name.endsWith('.json'))continue;const ref=read(path.join(eventDir,name)),e=ref?.value,observed=time(e?.observed_at);
   if(e?.schema!=='periodic-job-diagnostic-v1'||e.run_id!==run_id||e.job_id!==context.job.id||e.queue_id!==h.queue_id||e.revision!==context.binding.revision||e.mode_epoch!==context.binding.mode_epoch||e.phase!=='job-returned'||e.status!=='private-review-result-unknown'||e.claimed!==true||!Number.isFinite(observed)||observed<stepEnd||observed>end)continue;
   matches.push({run_id,...evidence,event_sha256:ref.sha256,finished_at:new Date(end).toISOString()});
  }
 }
 if(matches.length!==1)fail(prefix+'ORIGINAL_RUN_END_UNPROVEN');return matches[0];
}
async function localProcesses(run){
 if(process.platform!=='win32')fail(prefix+'PROCESS_INSPECTION_UNAVAILABLE');
 const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Select-Object Name,ProcessId,CommandLine) | ConvertTo-Json -Compress"],30000);
 try{const rows=JSON.parse(result.out);return Array.isArray(rows)?rows:rows&&typeof rows==='object'?[rows]:[];}catch{fail(prefix+'PROCESS_INSPECTION_FAILED');}
}

export async function autoKnownCaptionRecovery(config,handoff,{root=process.cwd(),run=command,processSnapshot}={}){
 if(handoff?.status!=='blocked'||handoff.lease_until!==null||!Array.isArray(handoff.missing)||handoff.missing.length!==1||handoff.missing[0]?.code!=='local-production:'+CODE)return null;
 const {validatePrivateProducer,privateProducerInputHash,speechImplementation}=await import('./private-review-producer.mjs');
 const context=validatePrivateProducer(config,{root}),newHash=privateProducerInputHash(config,{root});scopeMatches(context,handoff);
 if(!/^native_prep_[a-f0-9]{64}$/.test(handoff.queue_id||'')||!Number.isSafeInteger(handoff.version)||handoff.version<1)fail(prefix+'HANDOFF_IDENTITY_INVALID');
 const base=path.join(context.root,'.sites-runtime/authorized-inputs',context.job.id,'revision-'+context.job.revision,'private-review');
 if(!fs.existsSync(base))return null;
 const candidates=[];
 for(const entry of fs.readdirSync(base,{withFileTypes:true})){
  if(!digest.test(entry.name)||entry.isSymbolicLink()||!entry.isDirectory())continue;const dir=path.join(base,entry.name),started=read(path.join(dir,'producer-started.json'));
  if(started?.value.input_hash===entry.name&&canonical(started.value.binding)===canonical(context.binding))candidates.push({dir,oldHash:entry.name,started});
 }
 if(!candidates.length)return null;if(candidates.length!==1)fail(prefix+'AMBIGUOUS_OLD_OUTPUT');
 const {dir,oldHash,started}=candidates[0];if(oldHash===newHash)return null;if(fs.existsSync(path.join(base,newHash)))fail(prefix+'NEW_OUTPUT_ALREADY_PRESENT');
 const checkProcesses=async()=>{
  const rows=await(processSnapshot?processSnapshot():localProcesses(run));if(!Array.isArray(rows))fail(prefix+'PROCESS_INSPECTION_FAILED');
  for(const row of rows){const name=String(row.Name||'').toLowerCase(),line=String(row.CommandLine||'').replaceAll('\\','/').toLowerCase();if(Number(row.ProcessId)!==process.pid&&/^(?:ffmpeg|ffprobe|node|python|dotnet)(?:\.exe)?$/.test(name)&&(line.includes(context.job.id.toLowerCase())||line.includes(dir.replaceAll('\\','/').toLowerCase())))fail(prefix+'PROCESS_STILL_ACTIVE');}
 };
 await checkProcesses();
 const files=tree(context.root,dir),byName=new Map(files.map(f=>[f.file,f])),used=new Set(['producer-started.json','approved-script.txt']),requireFile=name=>{const ref=byName.get(name);if(!ref)fail(prefix+'KNOWN_FILE_MISSING');used.add(name);return ref;};
 requireFile('producer-started.json');requireFile('approved-script.txt');const startedAt=time(started.value.started_at);if(!Number.isFinite(startedAt)||fs.readFileSync(path.join(dir,'approved-script.txt'),'utf8')!==context.draft.script)fail(prefix+'ORIGINAL_SCRIPT_CHANGED');
 const stepRows=files.filter(f=>/^steps\/[a-f0-9]{64}\.json$/.test(f.file)).map(f=>({file:f.file,value:read(path.join(dir,f.file))?.value}));let stepEnd=startedAt;
 function step(name,inputs,outputNames){
  const matches=stepRows.filter(s=>s.value?.step===name);if(matches.length!==1)fail(prefix+'STEP_RECEIPT_MISSING');const {file,value:s}=matches[0],markerName='steps/'+s.key+'.started.json',marker=read(path.join(dir,markerName))?.value;
  if(!marker||file!=='steps/'+s.key+'.json'||!digest.test(s.key||'')||s.key!==sha(JSON.stringify({step:marker.step,inputs:marker.inputs,outputs:marker.outputs}))||marker.key!==s.key||marker.step!==name||canonical(marker.inputs)!==canonical(inputs)||canonical(s.inputs)!==canonical(inputs)||canonical(marker.outputs)!==canonical(outputNames.map(n=>path.join(dir,n)))||!Array.isArray(s.outputs)||s.outputs.length!==outputNames.length||!Number.isFinite(time(marker.started_at))||!Number.isFinite(time(s.finished_at))||time(marker.started_at)<startedAt||time(s.finished_at)<time(marker.started_at))fail(prefix+'STEP_INPUT_OR_KEY_CHANGED');
  for(const [i,n]of outputNames.entries()){const f=requireFile(n),r=s.outputs[i];if(r?.role!==name||r.file!==path.join(dir,n)||r.sha256!==f.sha256||r.size_bytes!==f.size_bytes)fail(prefix+'STEP_OUTPUT_CHANGED');}
  requireFile(file);requireFile(markerName);stepEnd=Math.max(stepEnd,time(s.finished_at));return s.key;
 }
 const segments=[];let cursor=0;
 for(const [i,s]of context.story.entries()){
  const text=s.narration||'',baseName='speech/segment-'+String(i).padStart(2,'0');if(!text)fail(prefix+'NON_SPEECH_SEGMENT_UNSUPPORTED');
  requireFile(baseName+'.txt');if(fs.readFileSync(path.join(dir,baseName+'.txt'),'utf8')!==text)fail(prefix+'SEGMENT_TEXT_CHANGED');
  const raw=requireFile(baseName+'.wav'),events=requireFile(baseName+'.events.json'),tempo=requireFile('speech/tempo-'+i+'.wav'),timed=requireFile('speech/timed-'+i+'.wav'),e=read(path.join(dir,events.file))?.value;
  if(e?.schema!=='actual-windows-ordinary-speech-events-v1'||e.implementation!=='local-dotnet-console-v1'||e.voice!=='Microsoft Huihui Desktop'||e.rate!==0||e.owner_clone_used!==false||e.cost!==0||!Array.isArray(e.events)||!e.events.length||e.events.some(v=>{const p=v.Position??v.position,c=v.Count??v.count,t=v.Text??v.text,m=v.Milliseconds??v.milliseconds;return!Number.isSafeInteger(p)||!Number.isSafeInteger(c)||p<0||p>=text.length||c<0||p+c>text.length||!Number.isFinite(m)||m<0||c>0&&t!==text.slice(p,p+c);}))fail(prefix+'EVENT_PROVENANCE_CHANGED');
  const rawInfo=pcm(path.join(dir,raw.file)),tempoInfo=pcm(path.join(dir,tempo.file),{processed:true}),timedInfo=pcm(path.join(dir,timed.file),{processed:true}),tempoRow=stepRows.find(v=>v.value?.step==='tempo-'+i)?.value,ratio=tempoRow?.inputs?.atempo,frames=Math.ceil(tempoInfo.duration*30);if(!tempoRow)fail(prefix+'STEP_RECEIPT_MISSING');
  if(!Number.isFinite(ratio)||ratio<1||ratio>1.3||Math.abs(rawInfo.duration/ratio-tempoInfo.duration)>.15||Math.abs(timedInfo.duration-frames/30)>1/48000)fail(prefix+'PROCESSED_AUDIO_CHANGED');
  const speechKey=step('ordinary-speech-'+i,{text_sha256:sha(text),implementation:speechImplementation()},[raw.file,events.file]),tempoKey=step('tempo-'+i,{audio_sha256:raw.sha256,atempo:ratio,sample_rate:48000,channels:2},[tempo.file]),paddingKey=step('frame-padding-'+i,{audio_sha256:tempo.sha256,frames,sample_rate:48000,channels:2,padding_only:true},[timed.file]);
  segments.push({index:i,text,raw_audio:raw,events,tempo_audio:tempo,timed_audio:timed,source_speed:ratio,raw_duration_seconds:rawInfo.duration,processed_duration_seconds:tempoInfo.duration,frames,start_frame:cursor,end_frame:cursor+frames,step_keys:{speech:speechKey,tempo:tempoKey,padding:paddingKey}});cursor+=frames;
 }
 if(!segments.length||used.size!==files.length||files.some(f=>!used.has(f.file)))fail(prefix+'UNKNOWN_DOWNSTREAM_OUTPUT');
 const processProof=completedPrivateFailureRun(context.root,context,handoff,startedAt,stepEnd);
 await checkProcesses();if(canonical(tree(context.root,dir))!==canonical(files))fail(prefix+'TREE_CHANGED_DURING_CHECK');
 const reason='Known completed speech retained byte-for-byte after caption display pagination failed; prior finite run returned and no relevant process is active.';
 const resume_verified={schema:'verified-private-producer-partial-resume-v1',verification:'actual-byte-checked-known-step-files',known_caption_failure:true,prior_output_dir:dir,old_input_hash:oldHash,new_input_hash:newHash,files,authorization_reference:config.authorization_reference,segments};
 return{schema:'verified-private-caption-pagination-recovery-v1',known_caption_failure:true,error_code:CODE,job_id:context.job.id,queue_id:handoff.queue_id,version:handoff.version,binding:context.binding,prior_input_hash:oldHash,new_input_hash:newHash,prior_output_dir:dir,files,resume_verified,process_proof:processProof,reason,verified_at:new Date().toISOString(),claim_performed:false,files_changed:false,new_speech_calls:0,new_paid_calls:0,speech_regeneration_authorized:false,quality_approved:false,publication_authorized:false};
}
