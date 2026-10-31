import type {CandidateReviewBinding,CandidateReviewReference} from './native-candidate-feedback-contract.mts';

export const CANDIDATE_VOICE_DECISION='native_candidate_voice_provenance';
export const CANDIDATE_VOICE_SCHEMA='native-candidate-voice-provenance-v1';
export type CandidateVoiceJob={id?:string;revision:number;approved_revision?:number|null;approved_hash:string|null;mode_epoch?:number;contract_hash?:string;reviews?:Record<string,unknown>[];media_continuation?:{current_id?:string;scope?:unknown}};
export type CandidateVoiceProvenance={id:string;schema:typeof CANDIDATE_VOICE_SCHEMA;binding:CandidateReviewBinding;voice_kind:'owner-cloned';scope_id:string;audio_intake_id:string;audio_sha256:string;source:'existing-owner-voice-metadata';quality_approved:false;publication_authorized:false;new_paid_calls:0};
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const obj=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
export function candidateVoiceBinding(j:CandidateVoiceJob,c:CandidateReviewReference):CandidateReviewBinding|null{
 const v=c.value;
 if(!j.id||j.approved_revision!==j.revision||!Number.isSafeInteger(j.revision)||j.revision<1||!digest(j.approved_hash)||!Number.isSafeInteger(j.mode_epoch)||Number(j.mode_epoch)<0||!digest(j.contract_hash)||!/^native_video_[a-f0-9]{64}$/.test(c.id)||v.schema!=='native-video-candidate-v1'||v.script_hash!==j.approved_hash||!digest(v.sha256)||v.local_file_verified!==true||v.quality_approved!==false||v.publication!==false||!uuid(v.project_id)||!uuid(v.timeline_id))return null;
 return {revision:j.revision,script_hash:j.approved_hash!,mode_epoch:j.mode_epoch!,contract_hash:j.contract_hash!,candidate_id:c.id,candidate_sha256:v.sha256 as string,project_id:v.project_id as string,timeline_id:v.timeline_id as string};
}
export function candidateVoiceScopeMatches(j:CandidateVoiceJob,b:CandidateReviewBinding,scopeId:unknown){
 const scope=obj(j.media_continuation?.scope),scopeBinding=obj(scope?.binding);
 return typeof scopeId==='string'&&/^media_scope_[a-f0-9]{64}$/.test(scopeId)&&j.media_continuation?.current_id===scopeId&&scope?.id===scopeId&&scope.schema==='owner-media-scope-v1'&&scope.scope==='private-video'&&scope.new_paid_authorization===false&&scope.publication_authorization===false&&scope.quality_approved===false&&!!scopeBinding&&['revision','script_hash','mode_epoch','contract_hash'].every(k=>scopeBinding[k]===b[k as keyof CandidateReviewBinding]);
}
export function candidateVoiceAudioMatches(j:CandidateVoiceJob,b:CandidateReviewBinding,intakeId:unknown,audioSha:unknown){
 if(typeof intakeId!=='string'||!/^audio_intake_[a-f0-9]{64}$/.test(intakeId)||!digest(audioSha))return false;
 const row=j.reviews?.find(r=>r.id===intakeId&&r.decision==='audio_intake'&&r.revision===j.revision&&r.content_hash===b.script_hash);
 try{const note=row&&obj(JSON.parse(String(row.note))),input=obj(note?.input);return !!input&&input.script_revision===b.revision&&input.script_hash===b.script_hash&&input.mode_epoch===b.mode_epoch&&input.sha256===audioSha&&Number.isSafeInteger(input.size_bytes)&&Number(input.size_bytes)>0&&Number.isSafeInteger(input.duration_ms)&&Number(input.duration_ms)>0;}catch{return false;}
}
// This is typed technical provenance, never an approval or a free-text classifier.
export function currentCandidateVoiceProvenance(j:CandidateVoiceJob,c:CandidateReviewReference,binding=candidateVoiceBinding(j,c)):CandidateVoiceProvenance|null{
 if(!binding||c.value.approved_native_version_id!==undefined)return null;
 const rows=(j.reviews||[]).filter(r=>r.decision===CANDIDATE_VOICE_DECISION&&r.revision===j.revision&&r.content_hash===binding.candidate_sha256).flatMap(r=>{try{
  const v=JSON.parse(String(r.note));
  if(!/^candidate_voice_[a-f0-9]{64}$/.test(String(r.id))||v.schema!==CANDIDATE_VOICE_SCHEMA||!obj(v.binding)||Object.keys(v.binding).length!==Object.keys(binding).length||Object.keys(binding).some(k=>v.binding[k]!==binding[k as keyof CandidateReviewBinding])||v.voice_kind!=='owner-cloned'||v.source!=='existing-owner-voice-metadata'||!['owner','trusted-owner-service'].includes(v.actor_kind)||v.technical_metadata_only!==true||v.quality_approved!==false||v.formal_milestone_approved!==false||v.publication_authorized!==false||v.new_paid_calls!==0||!candidateVoiceScopeMatches(j,binding,v.scope_id)||!candidateVoiceAudioMatches(j,binding,v.audio_intake_id,v.audio_sha256))return [];
  return [{id:String(r.id),schema:CANDIDATE_VOICE_SCHEMA as typeof CANDIDATE_VOICE_SCHEMA,binding,voice_kind:'owner-cloned' as const,scope_id:v.scope_id as string,audio_intake_id:v.audio_intake_id as string,audio_sha256:v.audio_sha256 as string,source:'existing-owner-voice-metadata' as const,quality_approved:false as const,publication_authorized:false as const,new_paid_calls:0 as const}];
 }catch{return[];}});
 // More than one provenance event is a conflict, not permission to choose one.
 return rows.length===1?rows[0]:null;
}
export function effectiveCandidateVoiceKind(j:CandidateVoiceJob,c:CandidateReviewReference,binding=candidateVoiceBinding(j,c)):'ordinary-temporary'|'owner-cloned'|null{
 if(!binding)return null;
 const version=c.value.approved_native_version_id;
 if(version!==undefined)return /^apv_[a-f0-9]{64}$/.test(String(version))&&['ordinary-temporary','owner-cloned'].includes(String(c.value.voice_kind))?c.value.voice_kind as 'ordinary-temporary'|'owner-cloned':null;
 const provenance=currentCandidateVoiceProvenance(j,c,binding);
 if(provenance)return provenance.voice_kind;
 // An invalid/stale typed event must not silently fall back to temporary voice.
 const hasProvenance=(j.reviews||[]).some(r=>{if(r.decision!==CANDIDATE_VOICE_DECISION)return false;try{return JSON.parse(String(r.note)).binding?.candidate_id===c.id;}catch{return r.content_hash===binding.candidate_sha256;}});
 if(hasProvenance)return null;
 return c.value.voice_kind===undefined||c.value.voice_kind==='ordinary-temporary'?'ordinary-temporary':null;
}
