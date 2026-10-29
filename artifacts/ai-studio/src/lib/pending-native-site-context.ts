import {db} from './store';
import {getJob} from './production';
import {hash,text,ProductionError} from './production-contract';
import {canonicalNativeReturn as canonical,feedbackForReturn,normalizePendingNativeRevision} from './native-draft-revision-handoff';
import {MINICPM_JOB,assertNativeApprovedScript,nativeScopeContext,assertNativeDemonstration} from './native-return-context';
import {VERSION_BASE_SQL,versionBaseArgs,versionNodesRaw,type VersionRecord} from './approved-native-version-context';
import type {SiteArchiveActor} from './site-file-archive';

export const PENDING_NATIVE_ROLES=['video','cover_3_4','cover_4_3','promotion'] as const;
type FeedbackIdentity={id:string;revision:number;content_hash:string;decision:string;note:string;reviewer:string};
export type PendingNativeRecord={schema:'pending-native-site-draft-v1';pending_id:string;job_id:string;owner_id:string;request_hash:string;status:'staging'|'returned'|'cancelled';request:ReturnType<typeof normalizePendingNativeRevision>;binding:VersionRecord['binding'];snapshot:VersionRecord['snapshot'];scope_id:string;scope_hash:string;created_at:string;continuation:FeedbackIdentity;feedback:FeedbackIdentity;returned_at?:string;cancelled_at?:string;cancel_note?:string;milestone_ids?:Record<string,string>;archives?:Record<string,string>};
const keyOf=(id:string,pending:string)=>'pending_native_site_v1:'+id+':'+pending;
export async function pendingOwner(id:string,actor:SiteArchiveActor){
 if(id!==MINICPM_JOB)throw new ProductionError('此待审核站内回传仅限当前MiniCPM任务',403);
 const row=await db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string;is_test:number}>();
 if(!row?.owner_id||row.is_test||!actor||('owner_id'in actor?actor.owner_id!==row.owner_id:actor.trusted_owner_service!==true))throw new ProductionError('待审核回传的真实所有者不匹配',403);
 return row.owner_id;
}
export function pendingGuard(p:PendingNativeRecord,raw?:string){
 // Share only the mechanical immutable-snapshot CAS. No APV approval,
 // completed-job gate, owner review or APV endpoint is used here.
 const sql=VERSION_BASE_SQL.replace("j.status='completed'","j.status='approved'")+" AND j.revision=2 AND EXISTS(SELECT 1 FROM production_reviews continuation WHERE continuation.id=? AND continuation.job_id=j.id AND continuation.revision=? AND continuation.content_hash=? AND continuation.decision='media_rework_requested' AND continuation.reviewer=j.owner_id AND continuation.note=?) AND EXISTS(SELECT 1 FROM production_reviews feedback WHERE feedback.id=? AND feedback.job_id=j.id AND feedback.revision=? AND feedback.content_hash=? AND feedback.decision=? AND feedback.reviewer=? AND feedback.note=?)"+(raw===undefined?'':" AND EXISTS(SELECT 1 FROM app_state pending WHERE pending.key=? AND pending.value=?)");
 return{sql,args:[...versionBaseArgs(p),p.continuation.id,p.continuation.revision,p.continuation.content_hash,p.continuation.note,p.feedback.id,p.feedback.revision,p.feedback.content_hash,p.feedback.decision,p.feedback.reviewer,p.feedback.note,...(raw===undefined?[]:[keyOf(p.job_id,p.pending_id),raw])]};
}
async function current(id:string,p:PendingNativeRecord){
 const j=await getJob(id);if(j.revision!==2||j.status!=='approved'||j.review_mode!=='node'||j.approved_revision!==2||j.approved_hash!==p.binding.script_hash||j.mode_epoch!==p.binding.mode_epoch||j.contract_hash!==p.binding.contract_hash||j.source_snapshot!==p.snapshot.source||j.skill_snapshot!==p.snapshot.skill||j.updated_at!==p.snapshot.updated_at||j.reworks!==p.snapshot.reworks||j.ai_calls!==p.snapshot.ai_calls||j.attempt!==p.snapshot.attempt||j.error!==p.snapshot.error||j.review_note!==p.snapshot.review_note||versionNodesRaw(j)!==p.snapshot.nodes_raw||j.publication_reports.length)throw new ProductionError('待审核回传的稿件、旧节点或继续决定已变化，旧文件保留',409);
 await assertNativeApprovedScript(j);const scope=await nativeScopeContext(j);if(scope.owner!==p.owner_id||scope.scope_id!==p.scope_id||scope.scope_hash!==p.scope_hash||scope.scope_raw!==p.snapshot.scope_raw)throw new ProductionError('本人私有制作范围已变化',409);
 for(const saved of [p.continuation,p.feedback]){const actual=await db().prepare('SELECT id,revision,content_hash,decision,note,reviewer FROM production_reviews WHERE id=? AND job_id=?').bind(saved.id,id).first<FeedbackIdentity>();if(!actual||canonical(actual)!==canonical(saved))throw new ProductionError('原返工或本人继续记录已变化',409);}
 return j;
}
export async function readPendingNativeRecord(id:string,pending:unknown,actor:SiteArchiveActor,staging=false){
 const owner=await pendingOwner(id,actor);if(typeof pending!=='string'||!/^nsd_[a-f0-9]{64}$/.test(pending))throw new ProductionError('待审核回传身份无效',400);
 const key=keyOf(id,pending),row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key).first<{value:string}>();if(!row)throw new ProductionError('待审核原生回传不存在',404);
 const p=JSON.parse(row.value) as PendingNativeRecord;if(p.schema!=='pending-native-site-draft-v1'||p.job_id!==id||p.owner_id!==owner||p.pending_id!==pending)throw new ProductionError('待审核回传归属不符',403);
 if(staging){if(p.status!=='staging')throw new ProductionError('本待审核文件集合已提交，不能追加或覆盖',409);await current(id,p);const guard=pendingGuard(p,row.value);if(!await db().prepare('SELECT j.id FROM production_jobs j WHERE j.id=? AND '+guard.sql).bind(id,...guard.args).first())throw new ProductionError('已有执行/审核租约或状态变化，先读回',409);}
 return{key,raw:row.value,p};
}
export async function beginPendingNativeSiteDraft(id:string,b:Record<string,unknown>,actor:SiteArchiveActor){
 const owner=await pendingOwner(id,actor),allowed=['action','id','request_id','revision','script_hash','mode_epoch','contract_hash','scope_id','scope_hash','base_milestone_id','base_artifact_version','base_artifact_hash','base_sha256','base_report_sha256','feedback_review_id','feedback_note_sha256','sha256','size_bytes','duration','quality_approved','publication_authorized','new_paid_calls','project_id','timeline_id','render_id','file_name','source','qa','demonstration_check'];
 if(Object.keys(b).some(k=>!allowed.includes(k)))throw new ProductionError('待审核回传不接收Library、APV或成片批准字段',400);
 const request=normalizePendingNativeRevision(b);if(request.revision!==2)throw new ProductionError('仅接当前MiniCPM批准稿v2',409);
 const requestHash=await hash(canonical({request,contract_hash:b.contract_hash,scope_id:b.scope_id,scope_hash:b.scope_hash})),pending_id='nsd_'+await hash(canonical([id,request.request_id]));
 const existing=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(keyOf(id,pending_id)).first<{value:string}>();if(existing){const old=JSON.parse(existing.value) as PendingNativeRecord;if(old.owner_id!==owner||old.request_hash!==requestHash)throw new ProductionError('待审核request_id不可改绑另一成片',409);return{pending:old,replayed:true,quality_approved:false,publication_authorized:false};}
 const j=await getJob(id);await assertNativeApprovedScript(j);const scope=await nativeScopeContext(j);
 if(j.status!=='approved'||j.review_mode!=='node'||j.revision!==2||j.approved_hash!==request.script_hash||j.mode_epoch!==request.mode_epoch||j.contract_hash!==b.contract_hash||j.reworks>2||j.publication_reports.length||scope.owner!==owner||scope.scope_id!==b.scope_id||scope.scope_hash!==b.scope_hash)throw new ProductionError('须先由真实本人在页面恢复返工并确认当前私有制作范围',409);
 const base=await db().prepare('SELECT * FROM production_milestones WHERE id=? AND job_id=?').bind(request.base_milestone_id,id).first<Parameters<typeof feedbackForReturn>[2]>();
 const latest=j.milestones.filter(m=>m.node==='video'&&m.revision===2).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(!base||base.id!==latest?.id||base.status!=='revise'||base.node!=='video'||base.revision!==2||base.mode_epoch!==request.mode_epoch||base.artifact_version!==request.base_artifact_version||base.artifact_hash!==request.base_artifact_hash||await hash(base.artifact)!==request.base_artifact_hash)throw new ProductionError('只能交回当前精确打回视频的新版本',409);
 const prior=JSON.parse(base.artifact),report=JSON.parse(base.report||'null');
 if(prior.sha256!==request.base_sha256||prior.qa?.project_id!==request.project_id||prior.sha256===request.sha256||j.milestones.some(m=>m.node==='video'&&m.revision===2&&(()=>{const a=JSON.parse(m.artifact);return a.sha256===request.sha256||a.provider_job_id===request.render_id||a.qa?.render_id===request.render_id})()))throw new ProductionError('须使用同一原生工程的新真实文件和新完成render，不能回收旧身份',409);
 const feedbackRow=j.reviews.find(r=>r.id===request.feedback_review_id),pause=feedbackRow?.decision==='reported_owner_video_feedback'?'聊天返工已登记，保留原视频；等待具备原生ChatCut工具的会话，先交付真实预览帧再合成新草稿':'外部节点返工待人工交回新产物；不会重复调用付费服务';
 const feedback=await feedbackForReturn(id,request,base,owner,report?.reason,pause);
 const continuationRows=(await db().prepare("SELECT id,revision,content_hash,decision,note,reviewer FROM production_reviews WHERE job_id=? AND revision=2 AND decision='media_rework_requested' AND reviewer=? AND content_hash=? ORDER BY created_at DESC,id DESC").bind(id,owner,base.artifact_hash).all<FeedbackIdentity>()).results;
 const continuation=continuationRows.find(r=>{try{const n=JSON.parse(r.note);return n.node==='video'&&n.milestone_id===base.id&&n.artifact_hash===base.artifact_hash&&n.reason===j.review_note&&j.error===null}catch{return false}});
 if(!continuation)throw new ProductionError('缺少真实本人针对当前打回节点的继续返工记录',409);
 await assertNativeDemonstration(j,request);
 const candidate_id='native_video_'+await hash(id+request.sha256+request.script_hash),p:PendingNativeRecord={schema:'pending-native-site-draft-v1',pending_id,job_id:id,owner_id:owner,request_hash:requestHash,status:'staging',request,binding:{revision:2,script_hash:request.script_hash,mode_epoch:request.mode_epoch,contract_hash:j.contract_hash,candidate_id,candidate_sha256:request.sha256,project_id:request.project_id,timeline_id:request.timeline_id},scope_id:scope.scope_id,scope_hash:scope.scope_hash,created_at:new Date().toISOString(),snapshot:{source:j.source_snapshot,skill:j.skill_snapshot,scope_raw:scope.scope_raw,nodes_raw:versionNodesRaw(j),updated_at:j.updated_at,reworks:j.reworks,ai_calls:j.ai_calls,attempt:j.attempt,error:j.error,review_note:j.review_note},continuation,feedback:{id:feedback.id,revision:feedback.revision,content_hash:feedback.content_hash,decision:feedback.decision,note:feedback.note,reviewer:feedback.reviewer}};
 const raw=canonical(p),guard=pendingGuard(p),result=await db().prepare('INSERT INTO app_state(key,value) SELECT ?,? FROM production_jobs j WHERE j.id=? AND '+guard.sql+" AND NOT EXISTS(SELECT 1 FROM app_state other WHERE other.key>=? AND other.key<? AND json_extract(other.value,'$.status')='staging') ON CONFLICT(key) DO NOTHING").bind(keyOf(id,pending_id),raw,id,...guard.args,'pending_native_site_v1:'+id+':','pending_native_site_v1:'+id+';').run();
 if(!result.meta.changes)throw new ProductionError('已有待审核回传或并发状态变化；先读回，不重复制作',409);
 return{pending:p,replayed:false,quality_approved:false,publication_authorized:false};
}
export async function cancelPendingNativeSiteDraft(id:string,b:Record<string,unknown>,actor:SiteArchiveActor){
 if(Object.keys(b).some(k=>!['action','id','pending_id','note'].includes(k)))throw new ProductionError('取消待审核回传字段无效',400);
 const value=await readPendingNativeRecord(id,b.pending_id,actor),p=value.p,note=text(b.note,2000);
 if(p.status==='returned')throw new ProductionError('已提交待审节点不可取消；请保留并使用正式节点审稿',409);
 if(p.status==='cancelled'){if(p.cancel_note!==note)throw new ProductionError('已保存的取消理由不可覆盖',409);return{pending:p,replayed:true};}
 const next=canonical({...p,status:'cancelled',cancelled_at:new Date().toISOString(),cancel_note:note}),rid='native_site_cancel_'+await hash(p.pending_id),record=canonical({pending_id:p.pending_id,reason:note,bytes_preserved:true,quality_approved:false,publication_authorized:false,new_paid_calls:0});
 const result=await db().batch([db().prepare('UPDATE app_state SET value=? WHERE key=? AND value=? AND EXISTS(SELECT 1 FROM production_jobs WHERE id=? AND owner_id=?)').bind(next,value.key,value.raw,id,p.owner_id),db().prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,?,2,?,'native_site_draft_cancelled',?,?,? WHERE EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?) ON CONFLICT(id) DO NOTHING").bind(rid,id,p.request_hash,record,p.owner_id,new Date().toISOString(),value.key,next)]);
 if(!result[0].meta.changes)throw new ProductionError('待审回传状态并发变化，先读回',409);
 return{pending:(await readPendingNativeRecord(id,p.pending_id,actor)).p,replayed:false};
}
