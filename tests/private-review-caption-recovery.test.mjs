// Synthetic PCM and immutable local receipts only: no speech or provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {autoKnownCaptionRecovery} from '../scripts/private-review-caption-recovery.mjs';
import {privateProducerInputHash,validatePrivateProducer,speechImplementation} from '../scripts/private-review-producer.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const CODE='local-production:PRIVATE_CAPTION_PAGINATION_UNBREAKABLE_WORD';
function wave(seconds,{sampleRate=48000,channels=2}={}){
 const bytes=Math.round(seconds*sampleRate)*channels*2,b=Buffer.alloc(44+bytes);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(bytes,40);return b;
}
function fixture(t,{mode='auto',staleNarration=false,executor=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-caption-recovery-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const put=(name,bytes)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return{file,sha256:sha(bytes),size_bytes:fs.statSync(file).size};};
 const image=put('image.png','SYNTHETIC source image'),outro=put('outro.mp4','SYNTHETIC original outro'),bgm=put('bgm.mp3','SYNTHETIC music');
 const texts=['已审核的第一句。','这是需要完整保留的第二句。','第三句包含abcdefghijklmnopqrstuvwx。','第四句已经批准。','第五句仍用真实原稿。','最后一句不能丢失。'];
 const content=JSON.stringify({script:texts.join(''),storyboard:texts.map((n,i)=>({start:i*3,end:(i+1)*3,narration:staleNarration&&i===0?n.replace('。','！'):n,asset_id:'image_0',visual:'真实来源静态图片'}))});
 const job_id='job_11111111-1111-4111-8111-111111111111',binding={revision:1,script_hash:sha(content),mode_epoch:1,contract_hash:'b'.repeat(64),scope_id:'SYNTHETIC-scope',scope:'private-video'},template={id:'SYNTHETIC',runtime:'casual-tech-safe-v1',runtime_ready:true};
 const history=[0,1,2].map(i=>({id:'SYNTHETIC-history-'+i,title:'SYNTHETIC published '+i,status:'published',evidence:'SYNTHETIC published record',cover:{sha256:image.sha256}}));
 const series={id:'SYNTHETIC-series',job_id,mode_epoch:1,seed:'a'.repeat(32),template,template_hash:sha(JSON.stringify(template)),history:{selected:history},subtitle:{normal_size:76,canvas_width:1080},outro:{existing_only:true},safe_area:{minimum_bottom_clearance:380}};
 const job={id:job_id,status:'approved',review_mode:mode,revision:1,approved_revision:1,approved_hash:binding.script_hash,mode_epoch:1,contract_hash:binding.contract_hash,is_test:0,source_snapshot:JSON.stringify({category:'AI实用',title:'SYNTHETIC explanation'}),drafts:[{revision:1,content_hash:binding.script_hash,content}],media_continuation:{current_id:binding.scope_id,scope:{schema:'owner-media-scope-v1',id:binding.scope_id,scope:'private-video',binding:{revision:1,script_hash:binding.script_hash,mode_epoch:1,contract_hash:binding.contract_hash},owner_confirmed:true,authorization_source:'owner-private-video',new_paid_authorization:false,publication_authorization:false,quality_approved:false}},series:{choice_current:true,current:series},milestones:['source','script'].map(node=>({node,revision:1,mode_epoch:1,artifact_version:1,status:'approved',artifact_hash:binding.script_hash}))};
 const config={job,binding,authorization_reference:binding.scope_id,title:'真实来源',media:[{asset_id:'image_0',kind:'image',...image}],outro,bgm,history:history.map(h=>({...h,cover:image})),voice:{max_tempo:1.15}},context=validatePrivateProducer(config,{root}),newHash=privateProducerInputHash(config,{root}),oldHash=sha('SYNTHETIC prior display implementation');
 const out=path.join(root,'.sites-runtime/authorized-inputs',job_id,'revision-1/private-review',oldHash),write=(name,value)=>{const file=path.join(out,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));return file;};
 const start=Date.now()-60000,iso=ms=>new Date(ms).toISOString();
 write('producer-started.json',{started_at:iso(start),binding,input_hash:oldHash});write('approved-script.txt',context.draft.script);
 const steps=[];
 function addStep(name,inputs,outputs,index){
  const absolute=outputs.map(n=>path.join(out,n)),key=sha(JSON.stringify({step:name,inputs,outputs:absolute})),started_at=iso(start+100+index*1000),finished_at=iso(start+200+index*1000);
  const marker={key,step:name,inputs,outputs:absolute,started_at},receipt={key,step:name,inputs,outputs:absolute.map(file=>({role:name,file,sha256:sha(fs.readFileSync(file)),size_bytes:fs.statSync(file).size})),finished_at};
  write('steps/'+key+'.started.json',marker);write('steps/'+key+'.json',receipt);steps.push({key,marker,receipt});
 }
 for(const [i,s]of context.story.entries()){
  const text=s.narration,base='speech/segment-'+String(i).padStart(2,'0');write(base+'.txt',text);write(base+'.wav',wave(3,{sampleRate:24000,channels:1}));write(base+'.events.json',{schema:'actual-windows-ordinary-speech-events-v1',implementation:'local-dotnet-console-v1',voice:'Microsoft Huihui Desktop',rate:0,cost:0,owner_clone_used:false,events:[{Position:0,Count:text.length,Text:text,Milliseconds:0}]});write('speech/tempo-'+i+'.wav',wave(3));write('speech/timed-'+i+'.wav',wave(3));
  const hash=name=>sha(fs.readFileSync(path.join(out,name)));
  addStep('ordinary-speech-'+i,{text_sha256:sha(text),implementation:speechImplementation()},[base+'.wav',base+'.events.json'],i*3);
  addStep('tempo-'+i,{audio_sha256:hash(base+'.wav'),atempo:1,sample_rate:48000,channels:2},['speech/tempo-'+i+'.wav'],i*3+1);
  addStep('frame-padding-'+i,{audio_sha256:hash('speech/tempo-'+i+'.wav'),frames:90,sample_rate:48000,channels:2,padding_only:true},['speech/timed-'+i+'.wav'],i*3+2);
 }
 const handoff={queue_id:'native_prep_'+'a'.repeat(64),version:3,status:'blocked',lease_until:null,binding,missing:[{code:CODE,detail:'阶段 ordinary-audio-and-editable-project：PRIVATE_CAPTION_PAGINATION_UNBREAKABLE_WORD'}]};
 const run_id=iso(start-1000).replace(/[:.]/g,'-')+'-SYNTHETIC',runDir=path.join(root,'.sites-runtime/periodic-runs',run_id),runPut=(name,data)=>{const file=path.join(runDir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data));};
 if(executor){const process={scope:'owned-child-tree',pid:987654,started_at:iso(start-1000),finished_at:iso(start+30000),exit_code:0};runPut('proof.json',{run_id,executor_process:process});runPut('executor/process-exit.json',process);}
 else{const v={run_id,started_at:iso(start-1000),mode:'owner-authorized-system-verification',browser_ready:false,publication_authorized:false},result={phase:'returned',status:'bounded-pass-returned',completed:true,in_progress:false,blocked:[{job_id,reason:'private-review-result-unknown'}]};runPut('verification-start.json',v);runPut('verification-result.json',result);runPut('verification-proof.json',{...v,result,finished_at:iso(start+30000)});}
 runPut('job-events/SYNTHETIC-returned.json',{schema:'periodic-job-diagnostic-v1',run_id,observed_at:iso(start+25000),job_id,queue_id:handoff.queue_id,revision:1,mode_epoch:1,phase:'job-returned',status:'private-review-result-unknown',claimed:true,generation_started:false});
 let snapshots=0;const auto=extra=>autoKnownCaptionRecovery(config,handoff,{root,run:async()=>{throw Error('No external process may be started by these tests');},processSnapshot:async()=>{snapshots++;return[];},...extra});
 return{root,out,config,context,handoff,oldHash,newHash,steps,runDir,auto,write,snapshots:()=>snapshots};
}

test('known caption failure reuses all six completed speech stages in a new hash with no writes or calls',async t=>{
 const f=fixture(t),before=new Map();for(const dir of ['', 'speech','steps'])for(const name of fs.readdirSync(path.join(f.out,dir),{withFileTypes:true}))if(name.isFile()){const file=path.join(dir,name.name);before.set(file,sha(fs.readFileSync(path.join(f.out,file))));}
 const proof=await f.auto();assert.equal(proof.known_caption_failure,true);assert.equal(proof.prior_input_hash,f.oldHash);assert.equal(proof.new_input_hash,f.newHash);assert.notEqual(proof.prior_input_hash,proof.new_input_hash);assert.equal(proof.resume_verified.verification,'actual-byte-checked-known-step-files');assert.equal(proof.resume_verified.segments.length,6);assert.equal(proof.resume_verified.segments[5].end_frame,540);assert.equal(proof.process_proof.kind,'returned-owner-verification');assert.equal(f.snapshots(),2);assert.equal(proof.files_changed,false);assert.equal(proof.claim_performed,false);assert.equal(proof.new_speech_calls,0);assert.equal(proof.speech_regeneration_authorized,false);assert.equal(proof.publication_authorized,false);
 assert.equal(fs.existsSync(path.join(path.dirname(f.out),f.newHash)),false);assert.equal(proof.files.length,before.size);for(const [file,hash]of before)assert.equal(sha(fs.readFileSync(path.join(f.out,file))),hash);
});

test('node mode and derived current approved narration share the same recovery',async t=>{
 const f=fixture(t,{mode:'node',staleNarration:true,executor:true}),proof=await f.auto();assert.equal(proof.process_proof.kind,'terminated-owned-executor');assert.equal(proof.resume_verified.segments.map(s=>s.text).join(''),f.context.draft.script);assert.ok(f.context.narration_derivation);assert.notEqual(proof.resume_verified.segments[0].text,JSON.parse(f.config.job.drafts[0].content).storyboard[0].narration);
});

test('unknown failures, live leases and unchanged implementation do not enter recovery',async t=>{
 const f=fixture(t);f.handoff.missing=[{code:'local-production:unrecognized',detail:'unknown'}];assert.equal(await f.auto(),null);f.handoff.missing=[{code:CODE}];f.handoff.lease_until=Date.now()+60000;assert.equal(await f.auto(),null);f.handoff.lease_until=null;
 const renamed=path.join(path.dirname(f.out),f.newHash);fs.renameSync(f.out,renamed);const started=JSON.parse(fs.readFileSync(path.join(renamed,'producer-started.json')));started.input_hash=f.newHash;fs.writeFileSync(path.join(renamed,'producer-started.json'),JSON.stringify(started));assert.equal(await f.auto(),null);
});

test('a relevant process in either snapshot prevents adoption',async t=>{
 const f=fixture(t);await assert.rejects(()=>f.auto({processSnapshot:async()=>[{Name:'node.exe',ProcessId:999999,CommandLine:'node producer '+f.config.job.id}]}),/PROCESS_STILL_ACTIVE/);
 let n=0;await assert.rejects(()=>f.auto({processSnapshot:async()=>++n===1?[]:[{Name:'ffmpeg.exe',ProcessId:999999,CommandLine:'ffmpeg -i '+path.join(f.out,'speech/timed-1.wav')}]}),/PROCESS_STILL_ACTIVE/);
 assert.equal(n,2);
});

test('complete original finite run evidence is required, not just absent processes',async t=>{
 const f=fixture(t);fs.unlinkSync(path.join(f.runDir,'verification-result.json'));await assert.rejects(()=>f.auto(),/ORIGINAL_RUN_END_UNPROVEN/);
});

test('executor termination that is unknown cannot replace complete terminal proof',async t=>{
 const f=fixture(t,{executor:true}),file=path.join(f.runDir,'executor/process-exit.json'),x=JSON.parse(fs.readFileSync(file));x.timed_out=true;fs.writeFileSync(file,JSON.stringify(x));await assert.rejects(()=>f.auto(),/ORIGINAL_RUN_END_UNPROVEN/);
});

test('changed segment text and invalid real speech events cannot be reused',async t=>{
 const f=fixture(t);f.write('speech/segment-00.txt','unauthorized changed text');await assert.rejects(()=>f.auto(),/SEGMENT_TEXT_CHANGED/);f.write('speech/segment-00.txt',f.context.story[0].narration);
 const file=path.join(f.out,'speech/segment-00.events.json'),e=JSON.parse(fs.readFileSync(file));e.events[0].Text='invented words';f.write('speech/segment-00.events.json',e);await assert.rejects(()=>f.auto(),/EVENT_PROVENANCE_CHANGED/);
});

test('changed processed bytes or an uncompleted step are never accepted',async t=>{
 const f=fixture(t),file=path.join(f.out,'speech/tempo-0.wav'),bytes=fs.readFileSync(file);bytes[bytes.length-1]=1;fs.writeFileSync(file,bytes);await assert.rejects(()=>f.auto(),/STEP_OUTPUT_CHANGED/);
 fs.writeFileSync(file,wave(3));fs.unlinkSync(path.join(f.out,'steps/'+f.steps[1].key+'.json'));await assert.rejects(()=>f.auto(),/STEP_RECEIPT_MISSING/);
});

test('step inputs and immutable marker keys are checked together',async t=>{
 const f=fixture(t),row=f.steps[1],file=path.join(f.out,'steps/'+row.key+'.started.json'),m=JSON.parse(fs.readFileSync(file));m.inputs.atempo=1.2;fs.writeFileSync(file,JSON.stringify(m));await assert.rejects(()=>f.auto(),/STEP_INPUT_OR_KEY_CHANGED/);
});

test('downstream artifacts, ambiguous old runs and an already begun new output require reconciliation',async t=>{
 const f=fixture(t);f.write('ordinary-narration.wav',wave(18));await assert.rejects(()=>f.auto(),/UNKNOWN_DOWNSTREAM_OUTPUT/);fs.unlinkSync(path.join(f.out,'ordinary-narration.wav'));
 const other=path.join(path.dirname(f.out),'c'.repeat(64));fs.mkdirSync(other);fs.writeFileSync(path.join(other,'producer-started.json'),JSON.stringify({binding:f.config.binding,input_hash:'c'.repeat(64),started_at:new Date().toISOString()}));await assert.rejects(()=>f.auto(),/AMBIGUOUS_OLD_OUTPUT/);fs.rmSync(other,{recursive:true});fs.mkdirSync(path.join(path.dirname(f.out),f.newHash));await assert.rejects(()=>f.auto(),/NEW_OUTPUT_ALREADY_PRESENT/);
});

test('current owner scope and exact handoff binding remain required',async t=>{
 const f=fixture(t);f.config.job.media_continuation.scope.owner_confirmed=false;await assert.rejects(()=>f.auto(),/CURRENT_APPROVAL_OR_SCOPE_CHANGED/);f.config.job.media_continuation.scope.owner_confirmed=true;f.handoff.binding={...f.config.binding,mode_epoch:2};await assert.rejects(()=>f.auto(),/CURRENT_APPROVAL_OR_SCOPE_CHANGED/);
});

test('a malformed or truncated PCM file is not treated as measured audio',async t=>{
 const f=fixture(t);f.write('speech/tempo-0.wav',Buffer.from('RIFFsynthetic but truncated'));await assert.rejects(()=>f.auto(),/PCM_BYTES_INVALID/);
});
