import {db} from './store';
import {getJob} from './production';
import {hash,ProductionError,text} from './production-contract';
import {canonicalNativeReturn} from './native-draft-revision-handoff';
import {candidateReviewBinding,currentCandidateOwnerReview,CANDIDATE_OWNER_REVIEW_DECISION,CANDIDATE_OWNER_REVIEW_SCHEMA,CANDIDATE_REVIEW_EXCLUDED_JOBS,type CandidateReviewBinding} from './native-candidate-feedback-contract.mts';
import {CANDIDATE_VOICE_DECISION,currentCandidateVoiceProvenance,effectiveCandidateVoiceKind} from './native-candidate-voice-contract.mts';
type Context={owner_id:string}|{trusted_owner_service:true};
function binding(value:unknown):CandidateReviewBinding{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ProductionError('需当前候选的完整绑定',400);
 const b=value as CandidateReviewBinding,keys=['revision','script_hash','mode_epoch','contract_hash','candidate_id','candidate_sha256','project_id','timeline_id'];
 if(Object.keys(b).length!==keys.length||keys.some(k=>!(k in b))||!Number.isSafeInteger(b.revision)||b.revision<1||!Number.isSafeInteger(b.mode_epoch)||b.mode_epoch<0)throw new ProductionError('候选绑定结构无效',400);
 for(const k of keys.filter(k=>!['revision','mode_epoch'].includes(k)))if(typeof b[k as keyof CandidateReviewBinding]!=='string'||!String(b[k as keyof CandidateReviewBinding]).trim())throw new ProductionError('候选绑定字段缺失',400);
 return b;
}
function request(b:Record<string,unknown>){
 const allowed=new Set(['action','id','client_receipt_id','explicit_user_direction','binding','decision','quote','reported_at','source_thread_id','expected_review_id']);
 if(Object.keys(b).some(k=>!allowed.has(k))||b.action!==undefined&&b.action!=='native_candidate_feedback'||b.explicit_user_direction!==true||!['approved','rework-requested'].includes(String(b.decision)))throw new ProductionError('需明确本人候选审阅决定；不能代点正式审批',400);
 const client=text(b.client_receipt_id,120);if(!/^[A-Za-z0-9._:-]+$/.test(client))throw new ProductionError('客户端回执ID无效',400);
 if(typeof b.quote!=='string'||!b.quote.trim()||b.quote.length>4000||typeof b.reported_at!=='string'||!Number.isFinite(Date.parse(b.reported_at)))throw new ProductionError('须保留本人原话与真实报告时间',400);
 if(b.source_thread_id!==undefined&&b.source_thread_id!==null&&(typeof b.source_thread_id!=='string'||!b.source_thread_id.trim()||b.source_thread_id.length>200))throw new ProductionError('会话来源无效；未知时请传null',400);
 const expected=b.expected_review_id??'';if(typeof expected!=='string'||expected.length>120)throw new ProductionError('原候选审阅记录ID无效',400);
 return {client_receipt_id:client,binding:binding(b.binding),decision:b.decision as 'approved'|'rework-requested',quote:b.quote,reported_at:b.reported_at,source_thread_id:typeof b.source_thread_id==='string'?b.source_thread_id:null,expected_review_id:expected};
}
function reviewSnapshot(rows:Record<string,unknown>[],revision:number,decision:string){
 return JSON.stringify(rows.filter(r=>r.revision===revision&&r.decision===decision).map(r=>({id:r.id,revision:r.revision,content_hash:r.content_hash,note:r.note,created_at:r.created_at})).sort((a,b)=>a.created_at===b.created_at?(String(a.id)<String(b.id)?1:String(a.id)>String(b.id)?-1:0):(String(a.created_at)<String(b.created_at)?1:-1)));
}
const reviewSql=(decision:string)=>`(SELECT COALESCE(json_group_array(json_object('id',r.id,'revision',r.revision,'content_hash',r.content_hash,'note',r.note,'created_at',r.created_at)),'[]') FROM (SELECT id,revision,content_hash,note,created_at FROM production_reviews WHERE job_id=j.id AND revision=j.revision AND decision='${decision}' ORDER BY created_at DESC,id DESC) r)`;
const milestoneSql="(SELECT COALESCE(json_group_array(json_object('id',m.id,'artifact_version',m.artifact_version,'artifact_hash',m.artifact_hash,'artifact',m.artifact,'status',m.status,'mode_epoch',m.mode_epoch)),'[]') FROM (SELECT id,artifact_version,artifact_hash,artifact,status,mode_epoch FROM production_milestones WHERE job_id=j.id AND revision=j.revision AND node='video' ORDER BY artifact_version DESC,id DESC) m)";
// A trusted service context is supplied only by the existing private executor
// boundary, never by the JSON body. This event is a report, not a button click.
export async function recordNativeCandidateFeedback(id:string,b:Record<string,unknown>,context:Context){
 if(CANDIDATE_REVIEW_EXCLUDED_JOBS.includes(id))throw new ProductionError('此独立制作任务不接收普通候选口头反馈',403);
 if(!context||!('owner_id'in context)&&!('trusted_owner_service'in context&&context.trusted_owner_service===true))throw new ProductionError('仅本人或可信本人服务上下文可登记候选反馈',403);
 const ownership=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string|null}>();
 if(!ownership?.owner_id||'owner_id'in context&&context.owner_id!==ownership.owner_id)throw new ProductionError('候选审阅任务归属不匹配',403);
 const input=request(b);if(b.id!==undefined&&b.id!==id)throw new ProductionError('候选回执任务绑定不匹配',400);
 const requestHash=await hash(canonicalNativeReturn(input)),rid='candidate_owner_review_'+await hash(id+'\n'+ownership.owner_id+'\n'+input.client_receipt_id);
 const old=await db().prepare('SELECT job_id,note FROM production_reviews WHERE id=?').bind(rid).first<{job_id:string;note:string}>();
 if(old){if(old.job_id!==id||JSON.parse(old.note).request_hash!==requestHash)throw new ProductionError('同一客户端回执不能覆盖不同候选意见',409);return {review_id:rid,replayed:true,job:await getJob(id)};}
 const j=await getJob(id),row=j.reviews.find(r=>r.id===j.facts.candidate_record_id&&r.decision==='native_video_candidate'&&r.revision===j.revision);
 let candidate:{id:string;value:Record<string,unknown>}|null=null;try{if(row)candidate={id:String(row.id),value:JSON.parse(String(row.note))};}catch{}
 const actual=candidate&&candidateReviewBinding(j,candidate);
 if(j.is_test||!candidate||!actual||row?.content_hash!==actual.candidate_sha256||j.facts.candidate_video_sha256!==actual.candidate_sha256||canonicalNativeReturn(input.binding)!==canonicalNativeReturn(actual))throw new ProductionError('候选、稿件、模式、合同或工程已变化，须重新读取后登记',409);
 if(candidate.value.approved_native_version_id!==undefined)throw new ProductionError('已认可版本需使用版本化回传流程，不能通过候选入口改写审阅',409);
 const voiceKind=effectiveCandidateVoiceKind(j,candidate,actual),voiceProvenance=currentCandidateVoiceProvenance(j,candidate,actual);
 if(!voiceKind)throw new ProductionError('候选声音来源未明确绑定当前音轨与私有范围，须先核对技术元数据',409);
 const previous=currentCandidateOwnerReview(j,candidate);if(input.expected_review_id!==(previous?.id||''))throw new ProductionError('候选已有新审阅记录，重新读取后再补充',409);
 const record={schema:CANDIDATE_OWNER_REVIEW_SCHEMA,client_receipt_id:input.client_receipt_id,request_hash:requestHash,binding:actual,decision:input.decision,quote:input.quote,reported_at:input.reported_at,source_thread_id:input.source_thread_id,sequence:(previous?.sequence||0)+1,previous_review_id:previous?.id||null,source:'owner-oral-report',reviewed_voice_kind:voiceKind,...(voiceProvenance?{voice_provenance_id:voiceProvenance.id}:{}),website_button_clicked:false,formal_milestone_approved:false,quality_approved:false,publication_authorized:false,new_paid_calls:0},note=canonicalNativeReturn(record);
 const nativeSnapshot=reviewSnapshot(j.reviews,j.revision,'native_video_candidate'),feedbackSnapshot=reviewSnapshot(j.reviews,j.revision,CANDIDATE_OWNER_REVIEW_DECISION);
 const msSnapshot=JSON.stringify(j.milestones.filter(m=>m.node==='video'&&m.revision===j.revision).map(m=>({id:m.id,artifact_version:m.artifact_version,artifact_hash:m.artifact_hash,artifact:m.artifact,status:m.status,mode_epoch:m.mode_epoch})).sort((a,b)=>b.artifact_version-a.artifact_version||(a.id<b.id?1:a.id>b.id?-1:0)));
 const voiceSnapshot=reviewSnapshot(j.reviews,j.revision,CANDIDATE_VOICE_DECISION),audioSnapshot=reviewSnapshot(j.reviews,j.revision,'audio_intake');
 const scope=voiceProvenance?await db().prepare('SELECT value FROM app_state WHERE key=?').bind('media_scope_v1:'+id).first<{value:string}>():null;
 if(voiceProvenance&&(!scope||JSON.parse(scope.value).id!==voiceProvenance.scope_id||canonicalNativeReturn(JSON.parse(scope.value).scope)!==canonicalNativeReturn(j.media_continuation.scope)))throw new ProductionError('本人音轨私有范围已变化，未登记旧反馈',409);
 const voiceGuard=voiceProvenance?` AND ${reviewSql('audio_intake')}=? AND EXISTS(SELECT 1 FROM app_state s WHERE s.key=? AND s.value=?)`:'';
 const result=await db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,j.id,j.revision,?,?,?,'reported-owner-candidate',? FROM production_jobs j WHERE j.id=? AND j.owner_id=? AND j.is_test=0 AND j.revision=? AND j.approved_revision=j.revision AND j.approved_hash=? AND j.mode_epoch=? AND j.contract_hash=? AND ${reviewSql('native_video_candidate')}=? AND ${reviewSql(CANDIDATE_OWNER_REVIEW_DECISION)}=? AND ${milestoneSql}=? AND ${reviewSql(CANDIDATE_VOICE_DECISION)}=?${voiceGuard} ON CONFLICT(id) DO NOTHING`).bind(rid,actual.candidate_sha256,CANDIDATE_OWNER_REVIEW_DECISION,note,new Date().toISOString(),id,ownership.owner_id,actual.revision,actual.script_hash,actual.mode_epoch,actual.contract_hash,nativeSnapshot,feedbackSnapshot,msSnapshot,voiceSnapshot,...(voiceProvenance?[audioSnapshot,'media_scope_v1:'+id,scope!.value]:[])).run();
 if(!result.meta.changes){const saved=await db().prepare('SELECT note FROM production_reviews WHERE id=? AND job_id=?').bind(rid,id).first<{note:string}>();if(!saved||JSON.parse(saved.note).request_hash!==requestHash)throw new ProductionError('候选或审阅记录并发变化，未写入旧反馈',409);}
 return {review_id:rid,replayed:!result.meta.changes,job:await getJob(id)};
}
