import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {sourceVideoDuration,prepareAutomaticVideoMedia} from '../scripts/automatic-material-video.mjs';
import {command,probe} from '../scripts/media-adapter.mjs';
import {motionSampleFrames,motionRecipeContext} from '../scripts/content-motion-qa.mjs';
import {motionShotIssues,motionSha as sha} from '../lib/content-motion-contract.mts';
import {savePreviousMotionInputs,reusableCompletedMotionSelection,validateMotionSelection,motionPlanPrompt} from '../scripts/content-motion-plan.mjs';
import {motionClosingTasks} from '../scripts/content-motion-tail-task.mjs';
import {rejectedMotionSourceRanges,rejectedMotionRange} from '../scripts/content-motion-source-gaps.mjs';
const binding={revision:1,mode_epoch:0,script_hash:sha('SYNTHETIC script'),contract_hash:sha('SYNTHETIC contract'),scope_id:'SYNTHETIC scope'};
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-motion-recovery-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('629 actual compiled frames use the video clock despite a millisecond movie-header duration; missing frames remain rejected',()=>{
 const media={schema:'verified-content-motion-sequence-v1',frames:629},probe={format:{duration:'20.966'},streams:[{codec_type:'video',duration:'20.966667',r_frame_rate:'30/1',nb_frames:'629'}]};
 assert.equal(sourceVideoDuration(probe,media),629/30);assert.equal(sourceVideoDuration(probe,{}),20.966667);
 assert.throws(()=>sourceVideoDuration({...probe,streams:[{...probe.streams[0],nb_frames:'628'}]},media),/AUTO_VIDEO_COMPILED_TIMING_CHANGED/);
 assert.throws(()=>sourceVideoDuration({...probe,streams:[{...probe.streams[0],duration:'20.9'}]},media),/AUTO_VIDEO_COMPILED_TIMING_CHANGED/);
});
test('real FFmpeg 629-frame sequence is fully decoded and reviewed against its exact 30fps clock',async t=>{
 const root=temp(t),dir=path.join(root,'SYNTHETIC-job');fs.mkdirSync(dir);const file=path.join(dir,'SYNTHETIC-629-frames.mp4');await command('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc2=s=64x36:r=30','-frames:v','629','-an','-c:v','libx264','-preset','ultrafast','-video_track_timescale','30000','-n',file]);
 const p=await probe(file);assert.equal(Number(p.streams.find(s=>s.codec_type==='video').nb_frames),629);
 const media={schema:'verified-content-motion-sequence-v1',asset_id:'synthetic_629',kind:'video',file,frames:629,sha256:sha(fs.readFileSync(file)),size_bytes:fs.statSync(file).size},reviewed=await prepareAutomaticVideoMedia(media,{root,jobDir:dir});assert.equal(reviewed.video_review.duration_seconds,629/30);assert.equal(reviewed.video_review.full_decode,true);assert.equal(reviewed.video_review.semantic_approval,false);
});
test('tiny real export intervals sample their complete frames; a single-frame interval cannot count as dynamic',()=>{
 assert.deepEqual(motionSampleFrames({start_frame:90,end_frame:92}),[90,91]);assert.deepEqual(motionSampleFrames({start_frame:92,end_frame:93}),[92]);
 for(const frames of [3,4,9,30]){const s=motionSampleFrames({start_frame:10,end_frame:10+frames});assert.equal(s.length,3);assert.ok(s.every(n=>n>=10&&n<10+frames));}
 const shot=(index,start,end)=>({index,task_index:0,kind:'video',source_sha256:sha('original'+index),source_start_frame:0,source_available_frames:300,rate:1,role:'core',relevance:'supporting',visible_content:'SYNTHETIC real motion',supports_narration:'SYNTHETIC',start_frame:start,end_frame:end,measured_motion:true,observation:{classification:'moving-content',what_changed:'SYNTHETIC',meaningful_change:true,text_only:false,relevance:'supporting',frame_sha256:[sha('a'),sha('b')]}});
 const first=shot(0,0,1);first.observation.frame_sha256=[sha('single actual frame')];const result=motionShotIssues([first,shot(1,1,300)],300,{observed:true});assert.deepEqual(result.issues,[]);assert.equal(result.metrics.dynamic_frames,299);assert.equal(result.metrics.still_frames,1);
});
test('a partial review batch gets whole-shot context, while a complete shot needs no duplicate context images',()=>{
 const shots=Array.from({length:12},(_,index)=>({index,recipe_index:0})),inspection=shots.map(s=>({index:s.index,samples:[{file:'a'+s.index},{file:'b'+s.index},{file:'c'+s.index}]}));
 assert.deepEqual(motionRecipeContext(shots,inspection,shots.slice(4,8)).map(s=>s.index),[0,6,11]);assert.deepEqual(motionRecipeContext(shots,inspection,shots),[]);
});
test('an exact completed corrected selection is reused by its original input without reissuing the model',t=>{
 const root=temp(t),inputHash=sha('plan'),dir=path.join(root,inputHash),prompt='SYNTHETIC original input';fs.mkdirSync(dir);
 function completed(where,text,value,extra={}){fs.mkdirSync(where,{recursive:true});const bytes=JSON.stringify(value);fs.writeFileSync(path.join(where,'prompt.txt'),text);fs.writeFileSync(path.join(where,'selection.json'),bytes);fs.writeFileSync(path.join(where,'selection-started.json'),JSON.stringify({input_hash:inputHash,binding,started_at:'2026-10-24T00:00:00Z',...extra}));fs.writeFileSync(path.join(where,'selection-receipt.json'),JSON.stringify({input_hash:inputHash,binding,prompt_sha256:sha(text),output_sha256:sha(bytes),finished_at:'2026-10-24T00:01:00Z',process:{error_code:'CLI_COMPLETED',exit_code:0},...extra}));return sha(bytes);}
 const original=completed(dir,prompt,{valid:false}),correction=path.join(dir,'correction-1');completed(correction,prompt+' known correction',{valid:true},{original_output_sha256:original});
 const result=reusableCompletedMotionSelection({parent:root,binding,prompt,validate:v=>{if(!v.valid)throw Object.assign(Error('invalid'),{code:'MOTION_CONTENT_GAPS'});}});assert.deepEqual(result,{dir:correction,inputHash,completedCorrection:true});
 assert.equal(reusableCompletedMotionSelection({parent:root,binding,prompt:prompt+' new facts',validate:()=>{}}),null);
});
test('reusing a completed plan saves every different prior input under its actual SHA and leaves the legacy snapshot intact',t=>{
 const dir=temp(t),target=path.join(dir,'material-inputs.json'),legacy=path.join(dir,'previous-material-inputs.json');fs.writeFileSync(legacy,'SYNTHETIC immutable legacy');fs.writeFileSync(target,'SYNTHETIC prior A');const a=savePreviousMotionInputs(dir,target);assert.equal(savePreviousMotionInputs(dir,target),a);fs.writeFileSync(target,'SYNTHETIC prior B');const b=savePreviousMotionInputs(dir,target);assert.notEqual(a,b);assert.equal(fs.readFileSync(a,'utf8'),'SYNTHETIC prior A');assert.equal(fs.readFileSync(legacy,'utf8'),'SYNTHETIC immutable legacy');
});
test('silent final narration accepts related continuous context footage without requiring a new fact',()=>{
 const task=motionClosingTasks([{index:0},{index:1}],[{narration:'原话'},{narration:'',visual:'相关收束'}])[1];assert.equal(task.silent_closing,true);
 const media={kind:'video',asset_id:'v',sha256:sha('real clip'),video_review:{duration_seconds:20,frames:[{frame_id:'f'}]}},value={short_title:'相关收束',segments:[{index:1,shots:[{kind:'video',asset_id:'v',frames:150,source_start_frame:0,role:'context',relevance:'supporting',visible_content:'相关连续实录',supports_narration:'延续前段',frame_ids:['f']}]}]};
 assert.equal(validateMotionSelection(value,{tasks:[task],timing:{1:150},current_timing:{1:100},media:[media],script:'原话'}).length,1);
 assert.throws(()=>validateMotionSelection(value,{tasks:[{index:1}],timing:{1:150},current_timing:{1:100},media:[media],script:'原话'}),e=>e.code==='MOTION_TASK_HAS_ONLY_BACKGROUND');
});
test('positive failed original ranges are excluded before compile; unknown observations and unchanged feedback remain independent',t=>{
 const dir=temp(t),hash=sha('failed export'),faildir=path.join(dir,'content-motion','export-gaps',hash);fs.mkdirSync(faildir,{recursive:true});fs.writeFileSync(path.join(faildir,'gaps.json'),JSON.stringify({feedback_sha256:sha('feedback'),missing:[{code:'MOTION_EXPORTED_TEXT_CARD',source_sha256:sha('clip'),source_start_frame:30,source_end_frame:60,detail:'实际文字卡'},{code:'MOTION_INTERVAL_NEEDS_REPLACEMENT',classification:'unknown',source_sha256:sha('clip'),source_start_frame:90,source_end_frame:120}]}));
 const ranges=rejectedMotionSourceRanges({jobDir:dir,feedback_sha256:sha('feedback')});assert.equal(ranges.length,1);assert.deepEqual(rejectedMotionSourceRanges({jobDir:dir,feedback_sha256:sha('other')}),[]);
 const media={kind:'video',asset_id:'v',sha256:sha('clip'),video_review:{duration_seconds:20,frames:[{frame_id:'f'}]}},shot={kind:'video',asset_id:'v',frames:90,source_start_frame:0,role:'core',relevance:'supporting',visible_content:'SYNTHETIC',supports_narration:'SYNTHETIC',frame_ids:['f']},value={short_title:'原片检查',segments:[{index:0,shots:[shot]}]},options={tasks:[{index:0}],timing:[90],media:[media],script:'SYNTHETIC',rejected_ranges:ranges};
 assert.throws(()=>validateMotionSelection(value,options),e=>e.code==='MOTION_KNOWN_FAILED_SOURCE_RANGE');shot.source_start_frame=60;assert.equal(validateMotionSelection(value,options).length,1);
 const prompt=motionPlanPrompt({...options,current_timing:[90]});assert.match(prompt,/不得选择kind=mechanism/);assert.match(prompt,/forbidden_original_ranges/);assert.match(prompt,/source_start_frame/);
});
test('unrelated footage is rejected only for its observed task; missing old task bindings never become global bans',t=>{
 const dir=temp(t),faildir=path.join(dir,'content-motion','export-gaps',sha('failed export')),source_sha256=sha('clip');fs.mkdirSync(faildir,{recursive:true});
 const rows=[{classification:'unrelated',task_index:0,source_start_frame:0,source_end_frame:30},{classification:'unrelated',task_index:2,source_start_frame:0,source_end_frame:30},{classification:'unrelated',source_start_frame:60,source_end_frame:90},{classification:'decorative-motion',task_index:0,source_start_frame:90,source_end_frame:120},{classification:'text-only',task_index:0,source_start_frame:120,source_end_frame:150},{classification:'unknown',task_index:0,source_start_frame:150,source_end_frame:180}];
 fs.writeFileSync(path.join(faildir,'gaps.json'),JSON.stringify({feedback_sha256:sha('feedback'),missing:rows.map(r=>({code:'MOTION_INTERVAL_NEEDS_REPLACEMENT',source_sha256,...r}))}));
 const ranges=rejectedMotionSourceRanges({jobDir:dir,feedback_sha256:sha('feedback')}),shot=(task_index,source_start_frame)=>({task_index,source_start_frame,frames:30});
 assert.equal(ranges.length,4);assert.equal(ranges.filter(r=>r.classification==='unrelated').length,2);
 assert.ok(rejectedMotionRange(shot(0,0),source_sha256,ranges));assert.ok(rejectedMotionRange(shot(2,0),source_sha256,ranges));assert.equal(rejectedMotionRange(shot(1,0),source_sha256,ranges),undefined);
 assert.equal(rejectedMotionRange(shot(0,60),source_sha256,ranges),undefined);assert.equal(rejectedMotionRange(shot(1,60),source_sha256,[{source_sha256,...rows[2]}]),undefined);
 assert.ok(rejectedMotionRange(shot(1,90),source_sha256,ranges));assert.ok(rejectedMotionRange(shot(1,120),source_sha256,ranges));assert.equal(rejectedMotionRange(shot(0,150),source_sha256,ranges),undefined);
});
