// The owner permits complete 60–70 second drafts to fit by speeding only the
// measured body. This contract never changes script text, material playback or
// the pinned ending; recordings longer than 70 seconds still need a new script.
import {createHash} from 'node:crypto';
import oldOutros from '../production/outro-v5-assets.json' with {type:'json'};
import currentOutros from '../production/outro-v6-assets.json' with {type:'json'};
export const BODY_RETIMING_POLICY='complete-measured-body-60-to-70-seconds-v1';
export const BODY_RETIMING_SCHEMA='measured-private-body-retiming-v1';
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>0;
const fail=()=>{throw Object.assign(Error('PRIVATE_BODY_RETIMING_PROOF_INVALID'),{code:'PRIVATE_BODY_RETIMING_PROOF_INVALID'});};
export function planMeasuredBodyRetiming({body_frames,outro_frames}){
 if(!integer(body_frames)||!integer(outro_frames)||outro_frames>=1800)fail();
 const source_total_frames=body_frames+outro_frames,base={policy:BODY_RETIMING_POLICY,source_body_frames:body_frames,source_total_frames,outro_frames};
 if(source_total_frames<=1800)return{...base,action:'unchanged',target_body_frames:body_frames,additional_tempo:1};
 if(source_total_frames>2100)return{...base,action:'script-revision-required',target_body_frames:null,additional_tempo:null};
 const target_body_frames=Math.min(1680,1800-outro_frames-1),safeSeconds=target_body_frames/30-.02,additional_tempo=Math.ceil((body_frames/30)/safeSeconds*10000)/10000;
 if(target_body_frames<1||additional_tempo<=1||additional_tempo>1.3)fail();
 return{...base,action:'retime',target_body_frames,additional_tempo};
}
export function allocateRetimedSegments(segments,resultFrames){
 if(!Array.isArray(segments)||!segments.length||segments.length>32||!integer(resultFrames)||resultFrames<segments.length)fail();
 let prior=0;for(const [index,s] of segments.entries()){if(s.index!==index||s.start_frame!==prior||!integer(s.end_frame)||s.end_frame<=prior)fail();prior=s.end_frame;}
 const sourceFrames=prior;let cursor=0;
 return segments.map((s,index)=>{const end=index===segments.length-1?resultFrames:Math.max(cursor+1,Math.min(resultFrames-(segments.length-index-1),Math.round(s.end_frame*resultFrames/sourceFrames))),row={...s,start_frame:cursor,end_frame:end};cursor=end;return row;});
}
export function retimeMeasuredCues(cues,sourceFrames,resultFrames){
 if(!Array.isArray(cues)||!integer(sourceFrames)||!integer(resultFrames))fail();
 const ratio=resultFrames/sourceFrames;return cues.map(c=>{if(typeof c.text!=='string'||!Number.isFinite(c.start_seconds)||!Number.isFinite(c.end_seconds)||c.start_seconds<0||c.end_seconds<=c.start_seconds||c.end_seconds>sourceFrames/30+.08)fail();return{...c,start_seconds:c.start_seconds*ratio,end_seconds:Math.min(resultFrames/30,c.end_seconds*ratio),alignment:'estimated-page-timing',retimed_from_alignment:c.alignment,word_alignment_verified:false,independent_asr_performed:false,body_clock_transform:{schema:BODY_RETIMING_SCHEMA,source_body_frames:sourceFrames,result_body_frames:resultFrames}};});
}
export function validateProjectBodyRetiming(project){
 const r=project?.body_retiming;if(!r)return false;
 if(r.schema!==BODY_RETIMING_SCHEMA||r.policy!==BODY_RETIMING_POLICY||r.fps!==30||r.script_text_sha256!==project.script_text_sha256||!digest(r.script_text_sha256)||r.script_text_sha256!==createHash('sha256').update(project.script||'').digest('hex')||!digest(r.source_voice_sha256)||!digest(r.result_voice_sha256)||r.result_voice_sha256!==project.voice?.sha256||r.source_voice_sha256===r.result_voice_sha256||r.result_body_frames!==project.body_frames||r.outro_sha256!==project.outro?.sha256||!digest(r.outro_sha256)||r.outro_frames!==(project.outro_frames??project.outro?.frames)||!integer(r.result_body_frames)||r.result_body_frames+r.outro_frames>1800||r.new_speech_calls!==0||r.original_events_unchanged!==true||r.outro_unchanged!==true||r.source_material_speed!==1||r.speech_trimmed!==false)fail();
 const plan=planMeasuredBodyRetiming({body_frames:r.source_body_frames,outro_frames:r.outro_frames});if(plan.action!=='retime'||r.source_total_frames!==plan.source_total_frames||r.result_body_frames>plan.target_body_frames||!Number.isFinite(r.additional_tempo)||r.additional_tempo<plan.additional_tempo||r.additional_tempo>1.3||!integer(r.complete_retimed_samples)||r.padded_result_samples!==r.result_body_frames*1600||r.complete_retimed_samples>r.padded_result_samples||r.padded_result_samples-r.complete_retimed_samples>=1600)fail();
 const actual=project.source_to_timeline;if(!Array.isArray(actual)||!Array.isArray(r.segments)||actual.length!==r.segments.length||!actual.length||actual.length>32)fail();
 let sourceCursor=0,resultCursor=0;for(const [index,s]of actual.entries()){const old=r.segments[index],effective=Number((old?.previous_source_speed*r.additional_tempo).toFixed(12));if(!old||old.index!==index||s.index!==index||old.source_start_frame!==sourceCursor||!integer(old.source_end_frame)||old.source_end_frame<=sourceCursor||old.result_start_frame!==resultCursor||old.result_start_frame!==s.start_frame||old.result_end_frame!==s.end_frame||!integer(s.end_frame)||s.end_frame<=resultCursor||!digest(old.source_audio_sha256)||old.result_audio_sha256!==s.audio?.sha256||!digest(old.result_audio_sha256)||!Number.isFinite(old.previous_source_speed)||old.previous_source_speed<1||old.previous_source_speed>1.3||old.effective_source_speed!==effective||!Number.isFinite(s.source_speed)||Math.abs(s.source_speed-effective)>1e-9||s.body_retiming?.additional_tempo!==r.additional_tempo||s.body_retiming?.previous_source_speed!==old.previous_source_speed||s.body_retiming?.source_audio_sha256!==old.source_audio_sha256||s.body_retiming?.source_events_sha256!==old.source_events_sha256||(s.text?!digest(old.source_events_sha256):old.source_events_sha256!==null)||old.event_clock?.raw_events_unchanged!==true||s.raw_audio_sha256!==(old.raw_audio_sha256??null)||s.padding_only!==true)fail();sourceCursor=old.source_end_frame;resultCursor=s.end_frame;}
 if(sourceCursor!==r.source_body_frames||resultCursor!==r.result_body_frames||!Array.isArray(project.caption_cues)||project.caption_cues.some(c=>c.word_alignment_verified===true||!Number.isFinite(c.start_seconds)||!Number.isFinite(c.end_seconds)||c.start_seconds<0||c.end_seconds<=c.start_seconds||c.end_seconds>project.body_frames/30+.002))fail();
 return true;
}
// An owner-authorized V5→V6 tail replacement changes only the tail binding.
// Validate the complete old proof first; no atempo, TTS or audio rewrite here.
export function rebindPreservedBodyRetiming(project,outro){
 if(!project.body_retiming)return null;validateProjectBodyRetiming(project);
 const previous=structuredClone(project.body_retiming);if(previous.outro_sha256===outro.sha256)return previous;
 const variant=Object.keys(oldOutros.variants).find(k=>oldOutros.variants[k].sha256===project.outro.sha256);
 if(!variant||currentOutros.variants[variant].sha256!==outro.sha256||outro.version!=='v6'||previous.outro_frames!==119||currentOutros.variants[variant].frames!==119)fail();
 return {...previous,outro_sha256:outro.sha256,outro_rebinding:{schema:'preserved-body-current-outro-binding-v1',previous_proof:previous,previous_proof_sha256:createHash('sha256').update(JSON.stringify(previous)).digest('hex'),source_outro_sha256:project.outro.sha256,result_outro_sha256:outro.sha256,body_voice_sha256:project.voice.sha256,body_frames:project.body_frames,body_audio_reprocessed:false,new_speech_calls:0,original_tail_frames:119}};
}
