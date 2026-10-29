import {db} from './store';
import {hash,ProductionError} from './production-contract';
import type {getJob} from './production';
import {canonicalNativeReturn} from './native-draft-revision-handoff';
import {requiresToolDemonstration,toolDemonstrationProblems} from './tool-demonstration.mjs';
import {readCurrentEditorialDelivery,hasOwnerEditorialDeliveryClassification} from './owner-editorial-delivery';
import {editorialDeliveryAuthorityRequired} from './owner-editorial-delivery-contract.mts';
import {OWNER_LOCAL_MEDIA_REWORK_PAUSE} from './owner-media-rework-contract.mts';

export const MINICPM_JOB='job_d3fcbbde-fb72-46b9-a64d-e3315c0a20cf';
export const PROTECTED_VIDEO_JOB='job_e13e8b19-aa0a-4840-abc9-333eefc91b05';
export type NativeScopeContext={owner:string;scope_id:string;scope_hash:string;scope_raw:string;scope:Record<string,unknown>};
type NativeReturnJob=Awaited<ReturnType<typeof getJob>>;

// Receipt intake verifies existing owner authority; it never creates that authority.
export async function nativeScopeContext(j:NativeReturnJob):Promise<NativeScopeContext>{
 const ownership=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(j.id).first<{owner_id:string|null}>();
 const state=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('media_scope_v1:'+j.id).first<{value:string}>();
 let scope:Record<string,unknown>|null=null;
 try{scope=JSON.parse(state?.value||'null')?.scope||null}catch{}
 const b=scope?.binding as Record<string,unknown>|undefined;
 if(!ownership?.owner_id||!scope||scope.scope!=='private-video'||scope.owner_confirmed===false||scope.new_paid_authorization!==false||scope.publication_authorization!==false||scope.quality_approved!==false||!b||b.revision!==j.revision||b.script_hash!==j.approved_hash||b.mode_epoch!==j.mode_epoch||b.contract_hash!==j.contract_hash)throw new ProductionError('需本人当前版本的私有视频范围；已完成文件回传不会授予制作、收费或发布权限',409);
 const record=await db().prepare("SELECT note FROM production_reviews WHERE id=? AND job_id=? AND revision=? AND content_hash=? AND decision='media_scope' AND reviewer=?").bind(String(scope.id),j.id,j.revision,j.approved_hash,ownership.owner_id).first<{note:string}>();
 if(!record||canonicalNativeReturn(JSON.parse(record.note))!==canonicalNativeReturn(scope))throw new ProductionError('当前媒体范围缺少真实所有者确认记录',409);
 for(const m of j.intake?.proposal.media||[]){if(j.media_continuation?.licenses.some(l=>l.library_file_id===m.library_file_id&&l.sha256===m.sha256&&l.status==='denied'))throw new ProductionError('此原片已有本人明确禁止使用记录',409);}
 return {owner:ownership.owner_id,scope_id:String(scope.id),scope_hash:await hash(canonicalNativeReturn(scope)),scope_raw:state!.value,scope};
}

export async function assertNativeApprovedScript(j:NativeReturnJob){
 const draft=j.drafts?.find(d=>d.revision===j.revision&&d.content_hash===j.approved_hash);
 if(j.approved_revision!==j.revision||!j.approved_hash||!draft)throw new ProductionError('当前完整脚本和批准哈希未绑定',409);
 const source=j.milestones?.find(m=>m.node==='source'&&m.revision===j.revision),script=j.milestones?.find(m=>m.node==='script'&&m.revision===j.revision);
 if(source&&source.status!=='approved'||script&&(script.status!=='approved'||script.artifact_hash!==j.approved_hash))throw new ProductionError('当前来源和脚本节点尚未全部通过',409);
 if(!source||!script){
  const legacy=await db().prepare("SELECT r.id FROM production_reviews r JOIN production_jobs j ON j.id=r.job_id WHERE r.job_id=? AND r.revision=? AND r.content_hash=? AND r.decision='approve' AND r.reviewer=j.owner_id").bind(j.id,j.revision,j.approved_hash).first();
  if(!legacy)throw new ProductionError('缺少来源、脚本节点批准或真实本人既有批准记录',409);
 }
 return draft;
}

export async function assertNativeDemonstration(j:NativeReturnJob,value:Record<string,unknown>){
 // Preserve this independently authorized delivery classification and its CAS
 // guard before considering the generic source's demonstration requirement.
 const editorial=await readCurrentEditorialDelivery(j,String(value.sha256||''));
 if(editorial){const qa=value.qa as Record<string,unknown>|undefined;if(qa?.editorial_delivery_authorization_id!==undefined&&qa.editorial_delivery_authorization_id!==editorial.id)throw new ProductionError('成片回执引用的官方演示解读授权已变化',409);return editorial;}
 if(editorialDeliveryAuthorityRequired(j,value,await hasOwnerEditorialDeliveryClassification(j)))throw new ProductionError('本条官方演示解读须保留当前精确视频、来源和私有范围的本人授权；缺失、撤回或变化后不能沿用',409);
 // In node mode the owner judges the actual video; an automatic demonstration
 // assessment must not prevent the video from reaching that review.
 if(j.review_mode==='node')return;
 // Static case explanation remains independent from an explicitly requested
 // recorded tool session; the category alone does not impose one.
 if(!requiresToolDemonstration(JSON.parse(j.source_snapshot))&&value.demonstration_check===undefined)return;
 let issues:string[];try{issues=toolDemonstrationProblems(value)}catch{throw new ProductionError('实际操作演示回执结构无效',409)}
 if(issues.length)throw new ProductionError(issues.join('；'),409);
}

export async function nativeOwnerRevisionContext(j:NativeReturnJob){
 const base=j.milestones?.filter(m=>m.node==='video'&&m.revision===j.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(!base||base.status!=='revise')throw new ProductionError('当前成片尚未由本人明确打回',409);
 let report:Record<string,unknown>;try{report=JSON.parse(base.report||'null')}catch{throw new ProductionError('原成片返工报告无效',409)}
 const owner=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(j.id).first<{owner_id:string|null}>();
 if(!owner?.owner_id||!report||report.decision!=='revise'||report.actor!==owner.owner_id||report.revision!==j.revision||report.mode_epoch!==j.mode_epoch||report.artifact_hash!==base.artifact_hash||typeof report.reason!=='string'||!report.reason.trim())throw new ProductionError('成片返工须保留真实本人、当前版本和模式绑定',409);
 const feedback=await db().prepare("SELECT * FROM production_reviews WHERE job_id=? AND revision=? AND content_hash=? AND decision='revise' AND reviewer=? AND note=? ORDER BY created_at DESC,id DESC LIMIT 1").bind(j.id,j.revision,base.artifact_hash,owner.owner_id,base.report).first<{id:string;note:string;reviewer:string}>();
 if(!feedback)throw new ProductionError('缺少该成片的真实本人审核决定',409);
 let continuation:{id:string;note:string;reviewer:string}|null=null;
 if(j.status==='paused'){
  if(j.review_note!==report.reason||!['外部节点返工待人工交回新产物；不会重复调用付费服务',OWNER_LOCAL_MEDIA_REWORK_PAUSE].includes(j.error||''))throw new ProductionError('当前暂停并非此成片返工；先由本人处理该暂停原因',409);
 }else if(j.status==='approved'){
  const rows=(await db().prepare("SELECT id,note,reviewer FROM production_reviews WHERE job_id=? AND revision=? AND content_hash=? AND decision='media_rework_requested' AND reviewer=? ORDER BY created_at DESC,id DESC").bind(j.id,j.revision,base.artifact_hash,owner.owner_id).all<{id:string;note:string;reviewer:string}>()).results;
  continuation=rows.find(r=>{try{const n=JSON.parse(r.note);return n.node==='video'&&n.milestone_id===base.id&&n.artifact_hash===base.artifact_hash&&n.reason===j.review_note&&j.error===null}catch{return false}})||null;
  if(!continuation)throw new ProductionError('恢复后的返工须绑定本人已保存的继续返工决定',409);
 }else throw new ProductionError('当前任务不接收此视频返工回执',409);
 return {base,feedback,continuation,report,owner:owner.owner_id};
}
