// New body audio uses one owner-approved pace. Previously frozen v1 proofs
// retain their original duration policy and are never upgraded in place.
import {OWNER_BODY_PACE_TEMPO,OWNER_BODY_PACE_POLICY_SHA256} from './owner-body-pace.mts';
export const CLONE_DURATION_POLICY='owner-fixed-1.15-body-speed-v2';
export const LEGACY_CLONE_DURATION_POLICY='complete-60-to-70-body-speed-v1';
const EPS=1e-7;
function fail(code:string){throw Object.assign(Error(code),{code});}
function blocked(reason:string,detail:string){throw Object.assign(Error(detail),{code:'AUTOMATIC_CLONE_RENDER_BLOCKED',reason_code:reason,detail});}

type DurationInput={raw_body_seconds:number;outro_frames:number;max_tempo?:number;processed_body_seconds?:number|null;tempo_override?:number|null};
export function planCloneDuration({raw_body_seconds:raw,outro_frames:tail,max_tempo=1.3,processed_body_seconds=null,tempo_override=null}:DurationInput){
 if(!Number.isFinite(raw)||raw<=0||!Number.isSafeInteger(tail)||tail<1||tail>=1800)fail('AUTOMATIC_CLONE_AUDIO_DURATION_INVALID');
 if(!Number.isFinite(max_tempo)||max_tempo<1||max_tempo>1.3||max_tempo<OWNER_BODY_PACE_TEMPO-EPS||tempo_override!==null&&(!Number.isFinite(tempo_override)||Math.abs(tempo_override-OWNER_BODY_PACE_TEMPO)>EPS))fail('AUTOMATIC_CLONE_TEMPO_INVALID');
 const tempo=OWNER_BODY_PACE_TEMPO,processed=processed_body_seconds??raw/tempo,maxFrames=1800-tail;
 if(!Number.isFinite(processed)||processed<=0||Math.abs(processed-raw/tempo)>.12)fail('AUTOMATIC_CLONE_PROCESSED_AUDIO_CHANGED');
 const frames=Math.max(90,Math.ceil(processed*30-EPS));
 if(frames>maxFrames)blocked('OWNER_SCRIPT_REVISION_REQUIRED','正文按本人固定1.15倍保音高语速处理后，加完整原片尾仍超过60秒；请调整稿长并重新审核，不逐条提高语速、不截尾、不重录或自动执行Play。');
 return {schema:'automatic-clone-duration-policy-v2' as const,policy:CLONE_DURATION_POLICY,pace_policy_sha256:OWNER_BODY_PACE_POLICY_SHA256,raw_body_seconds:raw,original_outro_frames:tail,source_total_seconds:raw+tail/30,target_total_frames:1800,tempo,processed_body_seconds:processed,body_frames:frames,duration_control:'script-length-at-fixed-pace' as const,source_audio_complete:true,speech_trimmed:false,preserve_pitch:true,body_only:true};
}

// Validation only: this is the exact previous planner, never a new-render mode.
function planLegacyCloneDuration({raw_body_seconds:raw,outro_frames:tail,max_tempo=1.3,processed_body_seconds=null,tempo_override=null}:DurationInput){
 if(!Number.isFinite(raw)||raw<=0||!Number.isSafeInteger(tail)||tail<1||tail>=1800)fail('AUTOMATIC_CLONE_AUDIO_DURATION_INVALID');
 if(!Number.isFinite(max_tempo)||max_tempo<1||max_tempo>1.3)fail('AUTOMATIC_CLONE_TEMPO_INVALID');
 const total=raw+tail/30,maxFrames=1800-tail;
 if(total>70+EPS)blocked('OWNER_SCRIPT_REVISION_REQUIRED','完整本人音轨加原片尾超过70秒；保留原稿、音轨与片尾，需要本人缩稿后重新审核，不重新录音或执行Play。');
 const speed=total>60+EPS||Math.ceil(raw*30-EPS)>maxFrames,targetFrames=Math.min(1680,maxFrames-1);
 const required=speed?Math.max(1,Math.ceil(raw/(targetFrames/30-.04)*1000)/1000):1,tempo=tempo_override??required;
 if(!Number.isFinite(tempo)||tempo<1||Math.abs(tempo-required)>EPS)fail('AUTOMATIC_CLONE_TEMPO_INVALID');
 if(tempo>max_tempo+EPS)blocked('VOICE_OVER_60_SECONDS','完整本人音轨在本次保音高调速上限内仍超过60秒；保留原音轨，不截尾、改稿或重新录音。');
 const processed=processed_body_seconds??raw/tempo;
 if(!Number.isFinite(processed)||processed<=0||Math.abs(processed-raw/tempo)>.12)fail('AUTOMATIC_CLONE_PROCESSED_AUDIO_CHANGED');
 const frames=Math.max(90,Math.ceil(processed*30-EPS));
 if(frames>maxFrames)blocked('VOICE_OVER_60_SECONDS','变速后实测完整本人音轨加原片尾仍超过60秒；保留全部音轨，不截尾或重新录音。');
 return {schema:'automatic-clone-duration-policy-v1' as const,policy:LEGACY_CLONE_DURATION_POLICY,raw_body_seconds:raw,original_outro_frames:tail,source_total_seconds:total,max_source_total_seconds:70,target_total_frames:1800,tempo,processed_body_seconds:processed,body_frames:frames,source_audio_complete:true,speech_trimmed:false,preserve_pitch:true,body_only:true};
}

// Old frozen synchronization receipts did not have this field. A new field,
// when present, must agree with the saved recording and actual final duration.
export function validateCloneDurationPolicy(proof:any,{raw_body_seconds:raw,outro_frames:tail,result_total_seconds:result}:{raw_body_seconds:number;outro_frames:number;result_total_seconds:number}){
 try{
  if(!proof||typeof proof!=='object'||Array.isArray(proof)||!Number.isFinite(raw)||!Number.isFinite(proof.raw_body_seconds)||Math.abs(proof.raw_body_seconds-raw)>.25||!Number.isFinite(result))return false;
  const planner=proof.schema==='automatic-clone-duration-policy-v1'?planLegacyCloneDuration:proof.schema==='automatic-clone-duration-policy-v2'?planCloneDuration:null;if(!planner)return false;
  const expected=planner({raw_body_seconds:proof.raw_body_seconds,outro_frames:tail,processed_body_seconds:proof.processed_body_seconds,tempo_override:proof.tempo});
  const keys=Object.keys(expected);if(Object.keys(proof).length!==keys.length||keys.some(k=>proof[k]!==expected[k as keyof typeof expected]))return false;
  return Math.abs(result-(expected.body_frames+tail)/30)<=.08;
 }catch{return false;}
}
