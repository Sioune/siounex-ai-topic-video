import {db} from './store';
import {getJob} from './production';
import {hash,ProductionError,text} from './production-contract';
import {canonicalNativeReturn} from './native-draft-revision-handoff';
import {candidateReviewBinding,CANDIDATE_REVIEW_EXCLUDED_JOBS,type CandidateReviewBinding} from './native-candidate-feedback-contract.mts';
import {CANDIDATE_VOICE_DECISION,CANDIDATE_VOICE_SCHEMA,candidateVoiceAudioMatches,candidateVoiceScopeMatches,currentCandidateVoiceProvenance} from './native-candidate-voice-contract.mts';

type Context={owner_id:string}|{trusted_owner_service:true};
function parseRequest(b:Record<string,unknown>){
 const keys=['action','id','client_receipt_id','binding','voice_kind','scope_id','audio_intake_id','audio_sha256','source','quality_approved','publication_authorized','new_paid_calls'];
 if(Object.keys(b).some(k=>!keys.includes(k))||b.action!==undefined&&b.action!=='native_candidate_voice_provenance'||b.voice_kind!=='owner-cloned'||b.source!=='existing-owner-voice-metadata'||b.quality_approved!==false||b.publication_authorized!==false||b.new_paid_calls!==0)throw new ProductionError('声音来源登记仅允许已有本人音轨的明确类型元数据，不构成审批或收费授权',400);
 const client=text(b.client_receipt_id,120),binding=b.binding as CandidateReviewBinding,fields=['revision','script_hash','mode_epoch','contract_hash','candidate_id','candidate_sha256','project_id','timeline_id'];
 if(!/^[A-Za-z0-9._:-]+$/.test(client)||!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).length!==fields.length||fields.some(k=>!(k in binding))||!Number.isSafeInteger(binding.revision)||binding.revision<1||!Number.isSafeInteger(binding.mode_epoch)||binding.mode_epoch<0||fields.filter(k=>!['revision','mode_epoch'].includes(k)).some(k=>typeof binding[k as keyof CandidateReviewBinding]!=='string'))throw new ProductionError('声音来源需完整当前候选绑定与客户端回执',400);
 if(typeof b.scope_id!=='string'||!/^media_scope_[a-f0-9]{64}$/.test(b.scope_id)||typeof b.audio_intake_id!=='string'||!/^audio_intake_[a-f0-9]{64}$/.test(b.audio_intake_id)||typeof b.audio_sha256!=='string'||!/^[a-f0-9]{64}$/.test(b.audio_sha256))throw new ProductionError('声音来源需精确私有范围、录音登记ID与真实音轨SHA256',400);
 return {client_receipt_id:client,binding,voice_kind:'owner-cloned' as const,scope_id:b.scope_id,audio_intake_id:b.audio_intake_id,audio_sha256:b.audio_sha256,source:'existing-owner-voice-metadata' as const,quality_approved:false as const,publication_authorized:false as const,new_paid_calls:0 as const};
}
export const candidateVoiceReviewSnapshot=(rows:Record<string,unknown>[],revision:number,decision:string)=>JSON.stringify(rows.filter(r=>r.revision===revision&&r.decision===decision).map(r=>({id:r.id,revision:r.revision,content_hash:r.content_hash,note:r.note,created_at:r.created_at})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||(String(a.id)<String(b.id)?1:String(a.id)>String(b.id)?-1:0)));
export const candidateVoiceReviewSql=(decision:string)=>`(SELECT COALESCE(json_group_array(json_object('id',r.id,'revision',r.revision,'content_hash',r.content_hash,'note',r.note,'created_at',r.created_at)),'[]') FROM (SELECT id,revision,content_hash,note,created_at FROM production_reviews WHERE job_id=j.id AND revision=j.revision AND decision='${decision}' ORDER BY created_at DESC,id DESC) r)`;

// Owner/trusted-service context is supplied by the executor boundary, not JSON.
// Existing candidate and audio records remain immutable; this adds one typed event.
export async function recordNativeCandidateVoiceProvenance(id:string,b:Record<string,unknown>,context:Context){
 if(CANDIDATE_REVIEW_EXCLUDED_JOBS.includes(id))throw new ProductionError('此独立任务不使用候选声音补充入口',403);
 if(!context||!('owner_id'in context)&&!('trusted_owner_service'in context&&context.trusted_owner_service===true))throw new ProductionError('仅本人或可信本人服务可登记声音来源',403);
 const ownership=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string|null}>();
 if(!ownership?.owner_id||'owner_id'in context&&context.owner_id!==ownership.owner_id)throw new ProductionError('声音来源任务归属不匹配',403);
 const input=parseRequest(b);if(b.id!==undefined&&b.id!==id)throw new ProductionError('声音来源任务ID不匹配',400);
 const requestHash=await hash(canonicalNativeReturn(input)),rid='candidate_voice_'+await hash(id+'\n'+ownership.owner_id+'\n'+input.client_receipt_id);
 const old=await db().prepare('SELECT job_id,note FROM production_reviews WHERE id=?').bind(rid).first<{job_id:string;note:string}>();
 if(old){if(old.job_id!==id||JSON.parse(old.note).request_hash!==requestHash)throw new ProductionError('同一声音来源回执不可覆盖',409);return {provenance_id:rid,replayed:true,job:await getJob(id)};}
 const j=await getJob(id),row=j.reviews.find(r=>r.id===j.facts.candidate_record_id&&r.decision==='native_video_candidate'&&r.revision===j.revision);
 let candidate:{id:string;value:Record<string,unknown>}|null=null;try{if(row)candidate={id:String(row.id),value:JSON.parse(String(row.note))};}catch{}
 const actual=candidate&&candidateReviewBinding(j,candidate);
 if(j.is_test||!candidate||!actual||row?.content_hash!==actual.candidate_sha256||j.facts.candidate_video_sha256!==actual.candidate_sha256||canonicalNativeReturn(actual)!==canonicalNativeReturn(input.binding)||candidate.value.approved_native_version_id!==undefined||candidate.value.voice_kind!==undefined&&candidate.value.voice_kind!=='owner-cloned'||!candidateVoiceScopeMatches(j,actual,input.scope_id)||!candidateVoiceAudioMatches(j,actual,input.audio_intake_id,input.audio_sha256))throw new ProductionError('候选、音轨、私有范围或当前稿件已变化，拒绝绑定旧来源',409);
 if(j.reviews.some(r=>{if(r.decision!==CANDIDATE_VOICE_DECISION)return false;try{return JSON.parse(String(r.note)).binding?.candidate_id===candidate!.id;}catch{return r.content_hash===actual.candidate_sha256;}}))throw new ProductionError('此候选已有声音来源登记，不可覆盖；请读取当前来源',409);
 const scope=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('media_scope_v1:'+id).first<{value:string}>();
 if(!scope||JSON.parse(scope.value).id!==input.scope_id||canonicalNativeReturn(JSON.parse(scope.value).scope)!==canonicalNativeReturn(j.media_continuation.scope))throw new ProductionError('当前私有范围状态不匹配',409);
 const record={schema:CANDIDATE_VOICE_SCHEMA,...input,request_hash:requestHash,actor_kind:'owner_id'in context?'owner':'trusted-owner-service',technical_metadata_only:true,formal_milestone_approved:false},note=canonicalNativeReturn(record),now=new Date().toISOString();
 const decisions=['native_video_candidate','audio_intake',CANDIDATE_VOICE_DECISION],snapshots=decisions.map(d=>candidateVoiceReviewSnapshot(j.reviews,j.revision,d));
 const result=await db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,j.id,j.revision,?,?,?, ?,? FROM production_jobs j WHERE j.id=? AND j.owner_id=? AND j.is_test=0 AND j.revision=? AND j.approved_revision=j.revision AND j.approved_hash=? AND j.mode_epoch=? AND j.contract_hash=? AND EXISTS(SELECT 1 FROM app_state s WHERE s.key=? AND s.value=?) AND ${decisions.map(d=>candidateVoiceReviewSql(d)+'=?').join(' AND ')} ON CONFLICT(id) DO NOTHING`).bind(rid,actual.candidate_sha256,CANDIDATE_VOICE_DECISION,note,'owner_id'in context?context.owner_id:'trusted-owner-voice-metadata',now,id,ownership.owner_id,actual.revision,actual.script_hash,actual.mode_epoch,actual.contract_hash,'media_scope_v1:'+id,scope.value,...snapshots).run();
 if(!result.meta.changes){const saved=await db().prepare('SELECT note FROM production_reviews WHERE id=? AND job_id=?').bind(rid,id).first<{note:string}>();if(!saved||JSON.parse(saved.note).request_hash!==requestHash)throw new ProductionError('声音来源绑定出现并发变化，未追加旧元数据',409);}
 const job=await getJob(id);return {provenance_id:rid,replayed:!result.meta.changes,provenance:currentCandidateVoiceProvenance(job,candidate),job};
}
