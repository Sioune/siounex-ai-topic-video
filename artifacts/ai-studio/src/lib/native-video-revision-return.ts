import {db} from './store';
import {getJob} from './production';
import {hash,text,ProductionError} from './production-contract';
import {canonicalNativeReturn as canonical,normalizeNativeRevisionRequest} from './native-draft-revision-handoff';
import {MINICPM_JOB,PROTECTED_VIDEO_JOB,assertNativeApprovedScript,assertNativeDemonstration,nativeScopeContext,nativeOwnerRevisionContext} from './native-return-context';
import {readNativeWorkPacket,nativeSelectionSnapshot,nativeInputSnapshot,NATIVE_INPUT_RECORDS_SQL} from './native-work-packet';
import {CURRENT_OWNER_LICENSE_SQL} from './current-media-operation';
import {editorialMutationGuard} from './owner-editorial-delivery-contract.mts';

const DECISION='native_owner_video_revision_return_v1';
function digest(v:unknown){const s=text(v,64);if(!/^[a-f0-9]{64}$/.test(s))throw new ProductionError('需实际绑定的SHA256',400);return s;}
function request(id:string,b:Record<string,unknown>){
 if(b.action!==undefined&&b.action!=='native_video_revision_return')throw new ProductionError('原生回传action不匹配',400);
 const {contract_hash,scope_id,scope_hash,packet_hash,continuation_review_id,continuation_note_sha256,...native}=b;
 return {...normalizeNativeRevisionRequest(id,{...native,action:'native_draft_revision_return'}),contract_hash:digest(contract_hash),scope_id:text(scope_id,200),scope_hash:digest(scope_hash),packet_hash:digest(packet_hash),
  continuation_review_id:continuation_review_id==null?null:text(continuation_review_id,200),continuation_note_sha256:continuation_note_sha256==null?null:digest(continuation_note_sha256)};
}

// Generic completed-file intake. Owner decisions and existing private scope are
// verified independently; service callers never acquire an owner identity.
export async function returnOwnerNativeVideoRevision(id:string,b:Record<string,unknown>){
 if([MINICPM_JOB,PROTECTED_VIDEO_JOB].includes(id))throw new ProductionError('该视频保留其既有独立制作和回传入口',403);
 const p=request(id,b),requestJson=canonical(p),requestHash=await hash(requestJson),key=await hash(canonical([id,p.request_id])),receiptId='native_owner_revision_'+key,mid='native_owner_video_'+key,candidateId='native_owner_candidate_'+key,archiveId='native_owner_archive_'+key;
 const readReceipt=()=>db().prepare('SELECT * FROM production_reviews WHERE id=? AND job_id=?').bind(receiptId,id).first<{decision:string;content_hash:string;note:string}>();
 const replay=async(row:{decision:string;content_hash:string;note:string})=>{
  const saved=JSON.parse(row.note);
  if(row.decision!==DECISION||row.content_hash!==requestHash||saved.request_hash!==requestHash||canonical(saved.request)!==requestJson||saved.milestone_id!==mid)throw new ProductionError('同一回传request_id不可覆盖另一份成果',409);
  return {job:await getJob(id),replayed:true,milestone_id:mid,artifact_version:saved.artifact_version,candidate_id:candidateId,archive_id:archiveId,receipt_id:receiptId,request_hash:requestHash};
 };
 const existing=await readReceipt();if(existing)return replay(existing);
 const j=await getJob(id);
 let scope:Awaited<ReturnType<typeof nativeScopeContext>>,context:Awaited<ReturnType<typeof nativeOwnerRevisionContext>>,selection:Awaited<ReturnType<typeof nativeSelectionSnapshot>>,inputs:Awaited<ReturnType<typeof nativeInputSnapshot>>;
 let editorialGuard:ReturnType<typeof editorialMutationGuard>|null=null;
 try{
  if(j.is_test||j.review_mode!=='node'||j.revision!==p.revision||j.approved_revision!==p.revision||j.approved_hash!==p.script_hash||j.mode_epoch!==p.mode_epoch||j.contract_hash!==p.contract_hash||j.reworks>2||j.publication_reports?.length)throw new ProductionError('只接收当前本人正式任务、已批准脚本和未发布的有限返工回执',409);
  await assertNativeApprovedScript(j);scope=await nativeScopeContext(j);context=await nativeOwnerRevisionContext(j);
  const {base,feedback,continuation}=context;
  if(scope.scope_id!==p.scope_id||scope.scope_hash!==p.scope_hash||base.id!==p.base_milestone_id||base.artifact_version!==p.base_artifact_version||base.artifact_hash!==p.base_artifact_hash||base.mode_epoch!==p.mode_epoch||await hash(base.artifact)!==p.base_artifact_hash||await hash(base.report||'')!==p.base_report_sha256||feedback.id!==p.feedback_review_id||await hash(feedback.note)!==p.feedback_note_sha256||(continuation?.id||null)!==p.continuation_review_id||(continuation?await hash(continuation.note):null)!==p.continuation_note_sha256)throw new ProductionError('当前脚本、范围、本人返工或继续返工决定已经变化',409);
  selection=await nativeSelectionSnapshot(id);inputs=await nativeInputSnapshot(id,j.revision);
  if((await readNativeWorkPacket(id)).packet.packet_hash!==p.packet_hash)throw new ProductionError('原生交接包已变化；先重新读取绑定，不重复制作',409);
  const editorial=await assertNativeDemonstration(j,p);editorialGuard=editorial?editorialMutationGuard(editorial):null;
  const prior=JSON.parse(base.artifact),qa=prior.qa||{};
  if(prior.sha256!==p.base_sha256||p.project_id!==qa.project_id||p.sha256===p.base_sha256||p.library_file_id===prior.library_file_id&&p.library_version<=Number(prior.library_version))throw new ProductionError('新稿须沿用本任务原生工程，使用不同真实成片和新的Library文件版本',409);
  for(const m of j.milestones||[]){
   if(m.node!=='video'||m.revision!==p.revision)continue;const a=JSON.parse(m.artifact),v=a.qa||{};
   if(a.sha256===p.sha256||a.provider_job_id===p.render_id||v.render_id===p.render_id||v.file_id===p.file_id)throw new ProductionError('不可用历史成片、旧render或不可变file身份冒充新返工',409);
  }
  for(const r of j.reviews||[]){
   if(r.revision!==p.revision)continue;
   if(r.decision==='native_video_candidate'){
    const n=JSON.parse(String(r.note));if(n.script_hash===p.script_hash&&n.sha256===p.sha256&&(n.file_name!==p.file_name||n.size_bytes!==p.size_bytes||n.duration!==p.duration||n.project_id!==p.project_id||n.timeline_id!==p.timeline_id||n.quality_approved!==false||n.publication!==false))throw new ProductionError('同SHA的已有候选文件身份不可改写',409);
   }
   if(r.decision==='native_video_archive_v1'){
    const n=JSON.parse(String(r.note));if(n.file_id===p.file_id&&n.sha256!==p.sha256||n.library_file_id===p.library_file_id&&n.version===p.library_version&&(n.sha256!==p.sha256||n.file_id!==p.file_id))throw new ProductionError('不可重新绑定已有Library文件身份',409);
   }
  }
 }catch(e){const raced=await readReceipt();if(raced)return replay(raced);throw e;}
 const {base,feedback,continuation}=context,version=base.artifact_version+1,at=new Date().toISOString(),token=crypto.randomUUID(),time=Date.now();
 const binding={revision:p.revision,script_hash:p.script_hash,mode_epoch:p.mode_epoch,video_sha256:p.sha256,video_reference:candidateId,skill_hash:JSON.parse(j.skill_snapshot).sha256||null};
 const artifact=canonical({url:'https://chatcut.io/',sha256:p.sha256,provider_job_id:p.render_id,library_file_id:p.library_file_id,library_version:p.library_version,cost:0,verification:'verified-existing-native-owner-revision; independent human review pending',
  ...(p.demonstration_check===undefined?{}:{demonstration_check:p.demonstration_check}),qa:{...p.qa,native_handoff:true,native_revision_handoff:true,native_candidate_id:candidateId,native_revision_receipt_id:receiptId,project_id:p.project_id,timeline_id:p.timeline_id,render_id:p.render_id,file_name:p.file_name,file_id:p.file_id,size_bytes:p.size_bytes,duration_seconds:p.duration,verified_at:p.verified_at,source:p.source,base_milestone_id:base.id,feedback_review_id:feedback.id,quality_approved:false,publication_authorized:false}});
 const artifactHash=await hash(artifact),candidate=canonical({schema:'native-video-candidate-v1',script_hash:p.script_hash,sha256:p.sha256,file_name:p.file_name,size_bytes:p.size_bytes,duration:p.duration,project_id:p.project_id,timeline_id:p.timeline_id,source:p.source,quality_approved:false,publication:false,local_file_verified:true,native_revision_receipt_id:receiptId});
 const archive=canonical({schema:'native-video-library-archive-v1',binding,sha256:p.sha256,materialized_sha256:p.sha256,library_file_id:p.library_file_id,file_id:p.file_id,version:p.library_version,file_name:p.file_name,size_bytes:p.size_bytes,verified_at:p.verified_at,quality_approved:false,publication_authorized:false,site_bytes_stored:false});
 const receipt=canonical({schema:'native-owner-video-revision-return-v1',request:p,request_hash:requestHash,milestone_id:mid,artifact_version:version,candidate_id:candidateId,archive_id:archiveId,commit_token:token,owner_button_clicked:false,quality_approved:false,publication_authorized:false,new_paid_calls:0});
 const gate="j.id=? AND j.owner_id=? AND j.is_test=0 AND j.status=? AND j.review_mode='node' AND j.revision=? AND j.approved_revision=? AND j.approved_hash=? AND j.mode_epoch=? AND j.contract_hash=? AND j.source_snapshot=? AND j.skill_snapshot=? AND j.updated_at=? AND j.reworks=? AND j.ai_calls=? AND j.attempt=? AND j.review_note IS ? AND j.error IS ? AND COALESCE(j.lease_until,0)<=?"+
  " AND old.id=? AND old.node='video' AND old.revision=? AND old.artifact_version=? AND old.artifact_hash=? AND old.artifact=? AND old.report=? AND old.mode_epoch=? AND old.status='revise'"+
  " AND (SELECT MAX(m.artifact_version) FROM production_milestones m WHERE m.job_id=j.id AND m.node='video' AND m.revision=j.revision)=?"+
  " AND f.id=? AND f.revision=? AND f.content_hash=? AND f.note=? AND f.decision='revise' AND f.reviewer=j.owner_id"+
  " AND EXISTS(SELECT 1 FROM app_state s WHERE s.key=? AND s.value=?) AND "+CURRENT_OWNER_LICENSE_SQL+
  (selection.raw===null?" AND NOT EXISTS(SELECT 1 FROM app_state selected WHERE selected.key=?)":" AND EXISTS(SELECT 1 FROM app_state selected WHERE selected.key=? AND selected.value=?)")+
  " AND "+NATIVE_INPUT_RECORDS_SQL+"=?"+
  (continuation?" AND EXISTS(SELECT 1 FROM production_reviews c WHERE c.id=? AND c.job_id=j.id AND c.revision=j.revision AND c.content_hash=? AND c.decision='media_rework_requested' AND c.reviewer=j.owner_id AND c.note=?)":"")+
  " AND NOT EXISTS(SELECT 1 FROM production_milestones h WHERE h.job_id=j.id AND h.node='video' AND h.revision=j.revision AND (json_extract(h.artifact,'$.sha256')=? OR json_extract(h.artifact,'$.provider_job_id')=? OR json_extract(h.artifact,'$.qa.render_id')=? OR json_extract(h.artifact,'$.qa.file_id')=?))"+
  " AND NOT EXISTS(SELECT 1 FROM production_reviews c WHERE c.job_id=j.id AND c.revision=j.revision AND c.decision='native_video_candidate' AND json_extract(c.note,'$.script_hash')=? AND json_extract(c.note,'$.sha256')=? AND (json_extract(c.note,'$.file_name') IS NOT ? OR json_extract(c.note,'$.size_bytes') IS NOT ? OR json_extract(c.note,'$.duration') IS NOT ? OR json_extract(c.note,'$.project_id') IS NOT ? OR json_extract(c.note,'$.timeline_id') IS NOT ? OR json_extract(c.note,'$.quality_approved') IS NOT 0 OR json_extract(c.note,'$.publication') IS NOT 0))"+
  " AND NOT EXISTS(SELECT 1 FROM production_reviews a WHERE a.job_id=j.id AND a.revision=j.revision AND a.decision='native_video_archive_v1' AND (json_extract(a.note,'$.file_id')=? AND json_extract(a.note,'$.sha256') IS NOT ? OR json_extract(a.note,'$.library_file_id')=? AND json_extract(a.note,'$.version')=? AND (json_extract(a.note,'$.sha256') IS NOT ? OR json_extract(a.note,'$.file_id') IS NOT ?)))"+
  " AND NOT EXISTS(SELECT 1 FROM production_operations o WHERE o.job_id=j.id AND o.status IN ('running','prepared') AND (o.lease_until IS NULL OR o.lease_until>?))"+
  " AND NOT EXISTS(SELECT 1 FROM production_stages s WHERE s.job_id=j.id AND s.stage IN ('media_inventory','media_inputs') AND s.status='running' AND (json_extract(s.result,'$.lease_until') IS NULL OR json_extract(s.result,'$.lease_until')>?))"+
  " AND NOT EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=j.id AND (m.review_until>? OR m.status='ai_running' AND m.review_until IS NULL))"+
  " AND NOT EXISTS(SELECT 1 FROM production_data_videos v WHERE v.job_id=j.id AND v.published_at IS NOT NULL AND (v.owner_id IS NULL OR v.owner_id=j.owner_id))"+(editorialGuard?' AND '+editorialGuard.sql:'');
 const args=[id,scope.owner,j.status,p.revision,p.revision,p.script_hash,p.mode_epoch,p.contract_hash,j.source_snapshot,j.skill_snapshot,j.updated_at,j.reworks,j.ai_calls,j.attempt,j.review_note,j.error,time,base.id,p.revision,base.artifact_version,base.artifact_hash,base.artifact,base.report,p.mode_epoch,base.artifact_version,feedback.id,p.revision,base.artifact_hash,feedback.note,'media_scope_v1:'+id,scope.scope_raw,'series_selection_v1:'+id,...(selection.raw===null?[]:[selection.raw]),inputs.raw,
  ...(continuation?[continuation.id,base.artifact_hash,continuation.note]:[]),p.sha256,p.render_id,p.render_id,p.file_id,p.script_hash,p.sha256,p.file_name,p.size_bytes,p.duration,p.project_id,p.timeline_id,p.file_id,p.sha256,p.library_file_id,p.library_version,p.sha256,p.file_id,time,time,time,...(editorialGuard?editorialGuard.args:[])];
 const won="EXISTS(SELECT 1 FROM production_reviews r WHERE r.id=? AND r.job_id=? AND r.content_hash=? AND r.note=?)",wonArgs=[receiptId,id,requestHash,receipt];
 const results=await db().batch([
  db().prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,j.id,j.revision,?,?,?,'verified-existing-native-owner-revision',? FROM production_jobs j JOIN production_milestones old ON old.job_id=j.id JOIN production_reviews f ON f.job_id=j.id WHERE "+gate+" ON CONFLICT(id) DO NOTHING").bind(receiptId,requestHash,DECISION,receipt,at,...args),
  db().prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) SELECT ?,?,'video',?,?,?,?,'awaiting_human',?,?,? WHERE "+won).bind(mid,id,p.revision,version,artifactHash,artifact,p.mode_epoch,at,at,...wonArgs),
  ...[[candidateId,'native_video_candidate',candidate],[archiveId,'native_video_archive_v1',archive]].map(([rid,decision,note])=>db().prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,?,?,?,?,?,'verified-existing-native-owner-revision',? WHERE "+won).bind(rid,id,p.revision,p.sha256,decision,note,at,...wonArgs)),
  db().prepare("UPDATE production_milestones SET status='invalidated',review_token_hash=NULL,review_until=NULL,updated_at=? WHERE job_id=? AND revision=? AND node IN ('promotion','delivery') AND "+won).bind(at,id,p.revision,...wonArgs),
  db().prepare("UPDATE production_jobs SET status='approved',error=NULL,updated_at=? WHERE id=? AND "+won).bind(at,id,...wonArgs)
 ]);
 const saved=await readReceipt();if(!saved)throw new ProductionError('回传时版本、范围、反馈或租约并发变化；先读回再决定',409);
 return {...await replay(saved),replayed:!results[0].meta.changes};
}
