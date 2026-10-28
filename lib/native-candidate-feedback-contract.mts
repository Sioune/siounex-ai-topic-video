import {currentCandidateVoiceProvenance,effectiveCandidateVoiceKind,type CandidateVoiceJob} from './native-candidate-voice-contract.mts';
export const CANDIDATE_OWNER_REVIEW_DECISION='reported_owner_candidate_feedback';
export const CANDIDATE_OWNER_REVIEW_SCHEMA='owner-native-candidate-review-v1';
export const CANDIDATE_REVIEW_EXCLUDED_JOBS=['job_9ef39025-d92e-4770-82d0-05881451c5df','job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee'];
export type CandidateReviewBinding={revision:number;script_hash:string;mode_epoch:number;contract_hash:string;candidate_id:string;candidate_sha256:string;project_id:string;timeline_id:string};
export type NativeCandidateOwnerReview={id:string;binding:CandidateReviewBinding;decision:'approved'|'rework-requested';quote:string;reported_at:string;source_thread_id:string|null;sequence:number;source:'owner-oral-report';reviewed_voice_kind:'ordinary-temporary'|'owner-cloned';voice_provenance_id?:string;website_button_clicked:false;formal_milestone_approved:false;quality_approved:false;publication_authorized:false;new_paid_calls:0};
export type CandidateReviewJob=CandidateVoiceJob;
export type CandidateReviewReference={id:string;value:Record<string,unknown>};
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const candidateReviewUuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function candidateReviewBinding(j:CandidateReviewJob,c:CandidateReviewReference):CandidateReviewBinding|null{
 const v=c.value;if(!j.id||CANDIDATE_REVIEW_EXCLUDED_JOBS.includes(j.id)||j.approved_revision!==j.revision||!digest(j.approved_hash)||!Number.isInteger(j.mode_epoch)||Number(j.mode_epoch)<0||!digest(j.contract_hash)||!/^native_video_[a-f0-9]{64}$/.test(c.id)||v.schema!=='native-video-candidate-v1'||v.script_hash!==j.approved_hash||!digest(v.sha256)||v.local_file_verified!==true||v.quality_approved!==false||v.publication!==false||!candidateReviewUuid(v.project_id)||!candidateReviewUuid(v.timeline_id))return null;
 return {revision:j.revision,script_hash:j.approved_hash!,mode_epoch:j.mode_epoch!,contract_hash:j.contract_hash!,candidate_id:c.id,candidate_sha256:v.sha256 as string,project_id:v.project_id,timeline_id:v.timeline_id};
}
export function currentCandidateOwnerReview(j:CandidateReviewJob,c:CandidateReviewReference|null|undefined):NativeCandidateOwnerReview|null{
 if(!c)return null;const binding=candidateReviewBinding(j,c);if(!binding)return null;
 const version=c.value.approved_native_version_id;
 if(version!==undefined&&(!/^apv_[a-f0-9]{64}$/.test(String(version))||!['ordinary-temporary','owner-cloned'].includes(String(c.value.voice_kind))))return null;
 const voiceKind=effectiveCandidateVoiceKind(j,c,binding),voiceProvenance=version===undefined?currentCandidateVoiceProvenance(j,c,binding):null;
 if(!voiceKind)return null;
 const rows=(j.reviews||[]).filter(r=>r.decision===CANDIDATE_OWNER_REVIEW_DECISION&&r.revision===j.revision&&r.content_hash===binding.candidate_sha256).flatMap(r=>{try{
  const v=JSON.parse(String(r.note));if(v.schema!==CANDIDATE_OWNER_REVIEW_SCHEMA||!v.binding||Object.keys(binding).some(k=>v.binding[k]!==binding[k as keyof CandidateReviewBinding])||!['approved','rework-requested'].includes(v.decision)||typeof v.quote!=='string'||!v.quote.trim()||v.quote.length>4000||!Number.isFinite(Date.parse(v.reported_at))||v.source!=='owner-oral-report'||v.reviewed_voice_kind!==voiceKind||(version!==undefined?(v.approved_native_version_id!==version):(v.approved_native_version_id!==undefined||(voiceProvenance?v.voice_provenance_id!==voiceProvenance.id:v.voice_provenance_id!==undefined)))||v.website_button_clicked!==false||v.formal_milestone_approved!==false||v.quality_approved!==false||v.publication_authorized!==false||v.new_paid_calls!==0||!Number.isSafeInteger(v.sequence)||v.sequence<1)return[];
  return[{id:String(r.id),binding,decision:v.decision,quote:v.quote,reported_at:v.reported_at,source_thread_id:typeof v.source_thread_id==='string'?v.source_thread_id:null,sequence:v.sequence,source:'owner-oral-report' as const,reviewed_voice_kind:voiceKind,...(voiceProvenance?{voice_provenance_id:voiceProvenance.id}:{}),website_button_clicked:false as const,formal_milestone_approved:false as const,quality_approved:false as const,publication_authorized:false as const,new_paid_calls:0 as const}];
 }catch{return[];}});
 return rows.sort((a,b)=>b.sequence-a.sequence||(a.id<b.id?1:a.id>b.id?-1:0))[0]||null;
}
