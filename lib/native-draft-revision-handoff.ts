import {db} from './store';
import {getJob} from './production';
import {hash,text,ProductionError} from './production-contract';
import {assertFinalDuration,type FinalDurationProof} from './final-media-contract';
import {requiresToolDemonstration,toolDemonstrationProblems} from './tool-demonstration.mjs';

const TARGET='job_9ef39025-d92e-4770-82d0-05881451c5df';
const FEEDBACK_THREAD='01a119fc-87ed-7316-b59f-cf4ba175a015';
const RECEIPT_DECISION='native_draft_revision_return_v1';
const DELEGATED_PAUSE='聊天返工已登记，保留原视频；等待具备原生ChatCut工具的会话，先交付真实预览帧再合成新草稿';
const OWNER_PAUSE='外部节点返工待人工交回新产物；不会重复调用付费服务';
type Json=string|number|boolean|null|Json[]|{[key:string]:Json};
type Review={id:string;job_id:string;revision:number;content_hash:string;decision:string;note:string;reviewer:string};
type Base={id:string;job_id:string;node:string;revision:number;artifact_version:number;artifact_hash:string;artifact:string;status:string;mode_epoch:number;report:string|null};
type Saved={schema:string;job_id:string;request_hash:string;request:Json;milestone_id:string;artifact_version:number;candidate_id:string;archive_id:string;commit_token:string};

// Only JSON values are accepted, and object-key order does not change request identity.
function canonical(value:unknown):string{
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
 throw new ProductionError('Revision return accepts finite JSON values only',400);
}
function object(value:unknown,message:string,status=400):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ProductionError(message,status);
 return value as Record<string,unknown>;
}
function parse(value:string|null,message:string){
 try{return object(JSON.parse(value||'null'),message,409)}catch(e){if(e instanceof ProductionError)throw e;throw new ProductionError(message,409)}
}
function digest(value:unknown){const v=text(value,64);if(!/^[a-f0-9]{64}$/.test(v))throw new ProductionError('SHA256 must be 64 lowercase hex characters',400);return v;}
function integer(value:unknown,minimum:number){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<minimum)throw new ProductionError('Revision/version must be a safe integer',400);return value;}
function stamp(value:unknown){const s=text(value,50);if(!Number.isFinite(Date.parse(s)))throw new ProductionError('Verified receipt timestamp required',400);return s;}
function nativeId(value:unknown){const v=text(value,100);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v))throw new ProductionError('Native project, timeline and render identity required',400);return v;}
function validateDuration(value:unknown,sha:string,duration:number){
 assertFinalDuration(value,sha);
 const proof=value as FinalDurationProof,measurements=Object.values(proof.report.measurements_seconds).map(Number),maximum=Number(proof.report.maximum_measured_seconds);
 if(measurements.some(n=>!Number.isFinite(n)||n<=0||n>=60)||!Number.isFinite(maximum)||maximum>=60||maximum!==Math.max(...measurements)||duration!==Number(proof.report.measurements_seconds.container_duration)||Math.abs(duration-maximum)>1/24)throw new ProductionError('All actual final media measurements must be strictly below 60 seconds and match file metadata within one 24fps frame',400);
}
function normalizeRequest(id:string,b:Record<string,unknown>){
 const allowed=new Set(['action','id','request_id','revision','script_hash','mode_epoch','base_milestone_id','base_artifact_version','base_artifact_hash','base_sha256','base_report_sha256','feedback_review_id','feedback_note_sha256','sha256','size_bytes','duration','quality_approved','publication_authorized','new_paid_calls','library_file_id','file_id','library_version','verified_at','materialized_sha256','project_id','timeline_id','render_id','file_name','source','qa','demonstration_check']);
 if(Object.keys(b).some(k=>!allowed.has(k))||b.id!==undefined&&b.id!==id||b.action!==undefined&&b.action!=='native_draft_revision_return')throw new ProductionError('Unsupported revision return fields or transport binding',400);
 const sha=digest(b.sha256),revision=integer(b.revision,1),epoch=integer(b.mode_epoch,0),size=integer(b.size_bytes,1),duration=b.duration;
 if(typeof duration!=='number'||!Number.isFinite(duration)||duration<=0||duration>=60||b.quality_approved!==false||b.publication_authorized!==false||b.new_paid_calls!==0)throw new ProductionError('Only an existing verified draft below 60 seconds, without fees, approval or publication, may return',400);
 const qa=object(b.qa,'Actual native revision QA receipts required');
 if(qa.semantic_listening_passed!==false||['quality_approved','publication','publication_authorized'].some(k=>qa[k]!==undefined&&qa[k]!==false)||['cost','new_paid_calls'].some(k=>qa[k]!==undefined&&qa[k]!==0))throw new ProductionError('Revision metadata cannot grant quality approval, publication or new fees',400);
 digest(qa.recovery_receipt_sha256);validateDuration(qa.final_duration,sha,duration);
 const library=text(b.library_file_id,100),file=text(b.file_id,100),project=nativeId(b.project_id),timeline=nativeId(b.timeline_id),render=nativeId(b.render_id);
 if(!/^libfile_[a-f0-9]{32}$/.test(library)||!/^file_[a-f0-9]{32}$/.test(file)||b.materialized_sha256!==sha)throw new ProductionError('Actually materialized Library file identity and SHA required',400);
 const preview=object(qa.preview_proof,'Actual native preview proof required');
 if(preview.schema!=='actual-native-preview-v1'||preview.source!=='native-timeline-preview'||preview.project_id!==project||preview.timeline_id!==timeline||preview.render_id!==render||preview.video_sha256!==sha)throw new ProductionError('Preview must bind this exact project, timeline, completed render and video SHA',400);
 digest(preview.receipt_sha256);stamp(preview.checked_at);
 if(!Array.isArray(preview.frames)||preview.frames.length<3||preview.frames.length>24)throw new ProductionError('Opening, core and ending preview frames required',400);
 const frames=preview.frames.map(v=>{
  const f=object(v,'Actual preview frame record required'),time=f.time_seconds;
  if(!['opening','core','ending'].includes(String(f.role))||typeof time!=='number'||!Number.isFinite(time)||time<0||time>=duration||f.role==='opening'&&time>=3||f.role==='core'&&time<3||f.role==='ending'&&time<Math.max(0,duration-4))throw new ProductionError('Preview frames must identify actual opening, core and ending times',400);
  digest(f.image_sha256);return f;
 });
 if(['opening','core','ending'].some(role=>!frames.some(f=>f.role===role))||new Set(frames.map(f=>f.image_sha256)).size!==frames.length||new Set(frames.map(f=>f.time_seconds)).size!==frames.length)throw new ProductionError('Distinct opening, core and ending preview frames required',400);
 return {
  request_id:text(b.request_id,120),revision,script_hash:digest(b.script_hash),mode_epoch:epoch,
  base_milestone_id:text(b.base_milestone_id,200),base_artifact_version:integer(b.base_artifact_version,1),base_artifact_hash:digest(b.base_artifact_hash),base_sha256:digest(b.base_sha256),base_report_sha256:digest(b.base_report_sha256),
  feedback_review_id:text(b.feedback_review_id,200),feedback_note_sha256:digest(b.feedback_note_sha256),
  sha256:sha,size_bytes:size,duration,quality_approved:false,publication_authorized:false,new_paid_calls:0,
  library_file_id:library,file_id:file,library_version:integer(b.library_version,0),verified_at:stamp(b.verified_at),materialized_sha256:sha,
  project_id:project,timeline_id:timeline,render_id:render,file_name:text(b.file_name,240),source:text(b.source,2000),qa:JSON.parse(canonical(qa)) as Record<string,Json>,
  ...(b.demonstration_check===undefined?{}:{demonstration_check:JSON.parse(canonical(b.demonstration_check)) as Json})
 };
}

// Shared receipt validation; the MiniCPM-specific authorization below stays isolated.
export {canonical as canonicalNativeReturn,normalizeRequest as normalizeNativeRevisionRequest};

export async function feedbackForReturn(id:string,p:Pick<ReturnType<typeof normalizeRequest>,'feedback_review_id'|'revision'|'feedback_note_sha256'|'base_report_sha256'|'script_hash'|'mode_epoch'|'base_artifact_version'|'base_sha256'|'base_artifact_hash'>,base:Base,owner:string|null,reviewNote:string|null,error:string|null){
 const row=await db().prepare('SELECT * FROM production_reviews WHERE id=? AND job_id=?').bind(p.feedback_review_id,id).first<Review>();
 if(!row||row.revision!==p.revision||await hash(row.note)!==p.feedback_note_sha256||await hash(base.report||'')!==p.base_report_sha256)throw new ProductionError('Exact original video feedback and report required',409);
 const note=parse(row.note,'Original feedback is invalid'),report=parse(base.report,'Current video revision report required');
 if(report.decision!=='revise')throw new ProductionError('Only the currently rejected video may return',409);
 if(row.decision==='reported_owner_video_feedback'){
  if(row.reviewer!=='delegated-user-voice'||row.content_hash!==p.script_hash||note.actor!=='delegated-user-voice'||note.source_thread_id!==FEEDBACK_THREAD||note.revision!==p.revision||note.mode_epoch!==p.mode_epoch||note.artifact_version!==p.base_artifact_version||note.candidate_sha256!==p.base_sha256||note.owner_button_clicked!==false||note.quality_approved!==false||note.publication!==false||note.native_edit_authorized!==true||note.preview_before_new_draft!==true||note.script_changes_allowed!==false||note.approved_source_project_changes_allowed!==false||note.zero_new_fee_only!==true||note.new_generation_allowed!==false||note.new_payment_allowed!==false||report.review_id!==row.id||report.source!=='delegated-user-voice'||report.reason!==note.feedback||report.owner_button_clicked!==false||report.quality_approved!==false||report.publication!==false||reviewNote!==note.feedback||error!==DELEGATED_PAUSE)throw new ProductionError('Feedback must be the precise delegated revision pause for this video',409);
 }else if(row.decision==='revise'){
  if(!owner||row.reviewer!==owner||row.content_hash!==p.base_artifact_hash||row.note!==base.report||note.actor!==owner||note.revision!==p.revision||note.artifact_hash!==p.base_artifact_hash||note.mode_epoch!==p.mode_epoch||typeof note.reason!=='string'||!note.reason.trim()||reviewNote!==note.reason||error!==OWNER_PAUSE)throw new ProductionError('An actual owner milestone rejection must bind the exact current video and pause',409);
 }else throw new ProductionError('Only recorded delegated feedback or actual owner milestone rejection is accepted',409);
 return row;
}

// Same real native-export/preview requirements as the legacy Library return,
// without manufacturing Library identities for a Site-private pending draft.
export function normalizePendingNativeRevision(b:Record<string,unknown>){
 const sha=digest(b.sha256),revision=integer(b.revision,1),mode_epoch=integer(b.mode_epoch,0),size_bytes=integer(b.size_bytes,1),duration=b.duration;
 if(typeof duration!=='number'||!Number.isFinite(duration)||duration<=0||duration>=60||b.quality_approved!==false||b.publication_authorized!==false||b.new_paid_calls!==0)throw new ProductionError('Only a real unapproved native draft below 60 seconds without new fees may return',400);
 const qa=object(b.qa,'Actual native export QA required');
 if(qa.semantic_listening_passed!==false||['quality_approved','publication','publication_authorized'].some(k=>qa[k]!==undefined&&qa[k]!==false)||['cost','new_paid_calls'].some(k=>qa[k]!==undefined&&qa[k]!==0))throw new ProductionError('Native QA cannot grant approval, publication or fees',400);
 digest(qa.recovery_receipt_sha256);validateDuration(qa.final_duration,sha,duration);
 const project_id=nativeId(b.project_id),timeline_id=nativeId(b.timeline_id),render_id=nativeId(b.render_id),preview=object(qa.preview_proof,'Actual native preview required');
 if(preview.schema!=='actual-native-preview-v1'||preview.source!=='native-timeline-preview'||preview.project_id!==project_id||preview.timeline_id!==timeline_id||preview.render_id!==render_id||preview.video_sha256!==sha)throw new ProductionError('Native preview must bind the real completed render and exact MP4',400);
 digest(preview.receipt_sha256);stamp(preview.checked_at);
 if(!Array.isArray(preview.frames)||preview.frames.length<3||preview.frames.length>24)throw new ProductionError('Opening/core/ending native preview required',400);
 const frames=preview.frames.map(value=>{const f=object(value,'Actual preview frame required'),time=f.time_seconds;if(!['opening','core','ending'].includes(String(f.role))||typeof time!=='number'||!Number.isFinite(time)||time<0||time>=duration||f.role==='opening'&&time>=3||f.role==='core'&&time<3||f.role==='ending'&&time<duration-4)throw new ProductionError('Actual native preview time invalid',400);digest(f.image_sha256);return f;});
 if(['opening','core','ending'].some(role=>!frames.some(f=>f.role===role))||new Set(frames.map(f=>f.image_sha256)).size!==frames.length||new Set(frames.map(f=>f.time_seconds)).size!==frames.length)throw new ProductionError('Distinct actual native preview roles required',400);
 return {request_id:text(b.request_id,120),revision,mode_epoch,script_hash:digest(b.script_hash),base_milestone_id:text(b.base_milestone_id,200),base_artifact_version:integer(b.base_artifact_version,1),base_artifact_hash:digest(b.base_artifact_hash),base_sha256:digest(b.base_sha256),base_report_sha256:digest(b.base_report_sha256),feedback_review_id:text(b.feedback_review_id,200),feedback_note_sha256:digest(b.feedback_note_sha256),sha256:sha,size_bytes,duration,project_id,timeline_id,render_id,file_name:text(b.file_name,240),source:text(b.source,2000),qa:JSON.parse(canonical(qa)) as Record<string,Json>,quality_approved:false as const,publication_authorized:false as const,new_paid_calls:0,...(b.demonstration_check===undefined?{}:{demonstration_check:JSON.parse(canonical(b.demonstration_check)) as Json})};
}

// Receives an already completed file. It never invokes ChatCut, creates an operation,
// authorizes production, records an owner click, or copies a previous video approval.
export async function returnNativeDraftRevision(id:string,b:Record<string,unknown>){
 if(id!==TARGET)throw new ProductionError('Native revision return is limited to the MiniCPM task',403);
 const p=normalizeRequest(id,b),requestJson=canonical(p),requestHash=await hash(requestJson),requestKey=await hash(canonical([id,p.request_id])),receiptId='native_revision_receipt_'+requestKey;
 const milestoneId='native_draft_revision_'+requestKey,candidateId='native_video_revision_'+requestKey,archiveId='native_archive_revision_'+requestKey,artifactVersion=p.base_artifact_version+1;
 if(!Number.isSafeInteger(artifactVersion))throw new ProductionError('Artifact version overflow',400);
 const receiptRow=()=>db().prepare('SELECT * FROM production_reviews WHERE id=? AND job_id=?').bind(receiptId,id).first<Review>();
 const replay=async(row:Review)=>{
  const saved=parse(row.note,'Saved revision receipt is invalid') as unknown as Saved;
  if(row.decision!==RECEIPT_DECISION||row.content_hash!==requestHash||saved.schema!=='native-draft-revision-return-v1'||saved.job_id!==id||saved.request_hash!==requestHash||canonical(saved.request)!==requestJson||saved.milestone_id!==milestoneId||saved.artifact_version!==artifactVersion||saved.candidate_id!==candidateId||saved.archive_id!==archiveId)throw new ProductionError('Request ID is immutable and already bound to different revision content',409);
  return {job:await getJob(id),replayed:true,milestone_id:saved.milestone_id,artifact_version:saved.artifact_version,candidate_id:saved.candidate_id,archive_id:saved.archive_id,receipt_id:receiptId,request_hash:requestHash};
 };
 // A committed historical request is read-only replayable even after mode/version changes.
 const old=await receiptRow();if(old)return replay(old);
 const j=await getJob(id),base=await db().prepare('SELECT * FROM production_milestones WHERE id=? AND job_id=?').bind(p.base_milestone_id,id).first<Base>(),ownership=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string|null}>();
 if(j.status!=='paused'||j.review_mode!=='node'||j.revision!==p.revision||j.approved_revision!==p.revision||j.approved_hash!==p.script_hash||j.mode_epoch!==p.mode_epoch||j.reworks>2||!base||base.node!=='video'||base.revision!==p.revision||base.artifact_version!==p.base_artifact_version||base.artifact_hash!==p.base_artifact_hash||base.mode_epoch!==p.mode_epoch||base.status!=='revise'||j.milestones?.some(m=>m.node==='video'&&m.revision===p.revision&&m.artifact_version>p.base_artifact_version)){
  const raced=await receiptRow();if(raced)return replay(raced);
  throw new ProductionError('Current approved script, rejected video, revision pause and manual mode must match',409);
 }
 const previous=parse(base.artifact,'Original video artifact is invalid'),previousQa=object(previous.qa||{},'Original video QA is invalid',409);
 if(previous.sha256!==p.base_sha256||await hash(base.artifact)!==p.base_artifact_hash||p.project_id!==previousQa.project_id||p.sha256===p.base_sha256||p.render_id===previous.provider_job_id||p.render_id===previousQa.render_id||p.file_id===previousQa.file_id||p.library_file_id===previous.library_file_id&&p.library_version<=Number(previous.library_version))throw new ProductionError('A revision must stay in the original native project and use different verified video bytes, render and immutable Library file identity',409);
 for(const m of j.milestones||[]){
  if(m.node!=='video'||m.revision!==p.revision)continue;
  const a=parse(m.artifact,'Historical video artifact is invalid'),qa=object(a.qa||{},'Historical video QA is invalid',409);
  if(p.sha256===a.sha256||p.render_id===a.provider_job_id||p.render_id===qa.render_id||p.file_id===qa.file_id)throw new ProductionError('Historical video bytes, completed renders and immutable file identities cannot be recycled as a new revision',409);
 }
 for(const r of j.reviews||[]){
  if(r.revision!==p.revision||!['native_video_candidate','native_video_archive_v1'].includes(String(r.decision)))continue;
  const v=parse(String(r.note),'Historical native video identity is invalid');
  if(r.decision==='native_video_candidate'&&v.script_hash===p.script_hash&&v.sha256===p.sha256&&(v.file_name!==p.file_name||v.size_bytes!==p.size_bytes||v.duration!==p.duration||v.project_id!==p.project_id||v.timeline_id!==p.timeline_id||v.quality_approved!==false||v.publication!==false))throw new ProductionError('An existing candidate with this SHA must have the same immutable actual file metadata',409);
  if(r.decision==='native_video_archive_v1'&&(v.file_id===p.file_id&&v.sha256!==p.sha256||v.library_file_id===p.library_file_id&&v.version===p.library_version&&(v.sha256!==p.sha256||v.file_id!==p.file_id)))throw new ProductionError('An immutable historical Library identity cannot be rebound to different bytes',409);
 }
 const feedback=await feedbackForReturn(id,p,base,ownership?.owner_id||null,j.review_note,j.error);
 if(requiresToolDemonstration(parse(j.source_snapshot,'Original source snapshot is invalid'))||j.facts?.material_required===true){
  let issues:string[];
  try{issues=toolDemonstrationProblems(p)}catch{throw new ProductionError('Actual tool demonstration receipt is structurally invalid',409)}
  if(issues.length)throw new ProductionError(issues.join('；'),409);
 }
 const skillHash=parse(j.skill_snapshot,'Frozen skill snapshot is invalid').sha256||null,at=new Date().toISOString(),commitToken=crypto.randomUUID();
 const binding={revision:p.revision,script_hash:p.script_hash,mode_epoch:p.mode_epoch,video_sha256:p.sha256,video_reference:candidateId,skill_hash:skillHash};
 const artifact=canonical({url:'https://chatcut.io/',sha256:p.sha256,provider_job_id:p.render_id,library_file_id:p.library_file_id,library_version:p.library_version,cost:0,verification:'verified-existing-native-revision; human semantic review pending',...(p.demonstration_check===undefined?{}:{demonstration_check:p.demonstration_check}),qa:{...p.qa,native_handoff:true,native_revision_handoff:true,native_candidate_id:candidateId,native_revision_receipt_id:receiptId,base_milestone_id:base.id,base_artifact_version:base.artifact_version,base_artifact_hash:base.artifact_hash,feedback_review_id:feedback.id,project_id:p.project_id,timeline_id:p.timeline_id,render_id:p.render_id,file_name:p.file_name,file_id:p.file_id,verified_at:p.verified_at,size_bytes:p.size_bytes,duration_seconds:p.duration,source:p.source,publication_authorized:false,quality_approved:false}}),artifactHash=await hash(artifact);
 const candidateNote=canonical({schema:'native-video-candidate-v1',script_hash:p.script_hash,sha256:p.sha256,file_name:p.file_name,size_bytes:p.size_bytes,duration:p.duration,project_id:p.project_id,timeline_id:p.timeline_id,source:p.source,quality_approved:false,publication:false,local_file_verified:true,native_revision_receipt_id:receiptId,base_milestone_id:base.id,feedback_review_id:feedback.id});
 const archiveNote=canonical({schema:'native-video-library-archive-v1',binding,sha256:p.sha256,materialized_sha256:p.materialized_sha256,library_file_id:p.library_file_id,file_id:p.file_id,version:p.library_version,file_name:p.file_name,size_bytes:p.size_bytes,verified_at:p.verified_at,quality_approved:false,publication_authorized:false,site_bytes_stored:false,native_revision_receipt_id:receiptId});
 const receiptNote=canonical({schema:'native-draft-revision-return-v1',job_id:id,request_hash:requestHash,request:p,milestone_id:milestoneId,artifact_version:artifactVersion,candidate_id:candidateId,archive_id:archiveId,commit_token:commitToken,quality_approved:false,publication_authorized:false,new_paid_calls:0,owner_button_clicked:false});
 const time=Date.now();
 const gate=`j.id=? AND j.revision=? AND j.approved_revision=? AND j.approved_hash=? AND j.mode_epoch=? AND j.review_mode='node' AND j.status='paused' AND j.reworks=? AND j.reworks<=2 AND j.ai_calls=? AND j.attempt=? AND j.contract_hash=? AND j.skill_snapshot=? AND j.source_snapshot=? AND j.owner_id IS ? AND j.review_note IS ? AND j.error IS ? AND j.updated_at=? AND COALESCE(j.lease_until,0)<=?
 AND base.id=? AND base.node='video' AND base.revision=? AND base.artifact_version=? AND base.artifact_hash=? AND base.artifact=? AND base.mode_epoch=? AND base.status='revise' AND base.report=?
 AND (SELECT MAX(latest.artifact_version) FROM production_milestones latest WHERE latest.job_id=j.id AND latest.node='video' AND latest.revision=j.revision)=?
 AND feedback.id=? AND feedback.revision=? AND feedback.content_hash=? AND feedback.decision=? AND feedback.note=? AND feedback.reviewer=?
 AND NOT EXISTS(SELECT 1 FROM production_milestones history WHERE history.job_id=j.id AND history.node='video' AND history.revision=j.revision AND (json_extract(history.artifact,'$.sha256')=? OR json_extract(history.artifact,'$.provider_job_id')=? OR json_extract(history.artifact,'$.qa.render_id')=? OR json_extract(history.artifact,'$.qa.file_id')=?))
 AND NOT EXISTS(SELECT 1 FROM production_reviews candidate WHERE candidate.job_id=j.id AND candidate.revision=j.revision AND candidate.decision='native_video_candidate' AND json_extract(candidate.note,'$.script_hash')=? AND json_extract(candidate.note,'$.sha256')=? AND (json_extract(candidate.note,'$.file_name') IS NOT ? OR json_extract(candidate.note,'$.size_bytes') IS NOT ? OR json_extract(candidate.note,'$.duration') IS NOT ? OR json_extract(candidate.note,'$.project_id') IS NOT ? OR json_extract(candidate.note,'$.timeline_id') IS NOT ? OR json_extract(candidate.note,'$.quality_approved') IS NOT 0 OR json_extract(candidate.note,'$.publication') IS NOT 0))
 AND NOT EXISTS(SELECT 1 FROM production_reviews archive WHERE archive.job_id=j.id AND archive.revision=j.revision AND archive.decision='native_video_archive_v1' AND (json_extract(archive.note,'$.file_id')=? AND json_extract(archive.note,'$.sha256') IS NOT ? OR json_extract(archive.note,'$.library_file_id')=? AND json_extract(archive.note,'$.version')=? AND (json_extract(archive.note,'$.sha256') IS NOT ? OR json_extract(archive.note,'$.file_id') IS NOT ?)))
 AND NOT EXISTS(SELECT 1 FROM production_operations op WHERE op.job_id=j.id AND op.status IN ('running','prepared') AND (op.lease_until IS NULL OR op.lease_until>?))
 AND NOT EXISTS(SELECT 1 FROM production_stages ps WHERE ps.job_id=j.id AND ps.stage IN ('media_inventory','media_inputs') AND ps.status='running' AND CASE WHEN json_valid(ps.result) THEN COALESCE(json_extract(ps.result,'$.lease_until'),?+1)>? ELSE 1 END)
 AND NOT EXISTS(SELECT 1 FROM production_milestones review WHERE review.job_id=j.id AND (review.review_until>? OR review.status='ai_running' AND review.review_until IS NULL))`;
 const gateArgs=[id,p.revision,p.revision,p.script_hash,p.mode_epoch,j.reworks,j.ai_calls,j.attempt,j.contract_hash,j.skill_snapshot,j.source_snapshot,ownership?.owner_id||null,j.review_note,j.error,j.updated_at,time,base.id,p.revision,p.base_artifact_version,p.base_artifact_hash,base.artifact,p.mode_epoch,base.report,p.base_artifact_version,feedback.id,p.revision,feedback.content_hash,feedback.decision,feedback.note,feedback.reviewer,p.sha256,p.render_id,p.render_id,p.file_id,p.script_hash,p.sha256,p.file_name,p.size_bytes,p.duration,p.project_id,p.timeline_id,p.file_id,p.sha256,p.library_file_id,p.library_version,p.sha256,p.file_id,time,time,time,time];
 // A per-attempt token, rather than a timestamp, gates every dependent statement.
 // A simultaneous duplicate can read the winner but cannot re-apply its state changes.
 const won="EXISTS(SELECT 1 FROM production_reviews receipt WHERE receipt.id=? AND receipt.job_id=? AND receipt.content_hash=? AND receipt.note=?)",wonArgs=[receiptId,id,requestHash,receiptNote];
 const results=await db().batch([
  db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,j.id,j.revision,?,?,?,'verified-existing-native-revision',? FROM production_jobs j JOIN production_milestones base ON base.job_id=j.id JOIN production_reviews feedback ON feedback.job_id=j.id WHERE ${gate} ON CONFLICT(id) DO NOTHING`).bind(receiptId,requestHash,RECEIPT_DECISION,receiptNote,at,...gateArgs),
  db().prepare(`INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) SELECT ?,?,'video',?,?,?,?,'awaiting_human',?,?,? WHERE ${won}`).bind(milestoneId,id,p.revision,artifactVersion,artifactHash,artifact,p.mode_epoch,at,at,...wonArgs),
  ...[[candidateId,'native_video_candidate',candidateNote],[archiveId,'native_video_archive_v1',archiveNote]].map(([rid,decision,note])=>db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,?,?,?, ?,?,'verified-existing-native-revision',? WHERE ${won}`).bind(rid,id,p.revision,p.sha256,decision,note,at,...wonArgs)),
  db().prepare(`UPDATE production_milestones SET status='invalidated',review_token_hash=NULL,review_until=NULL,updated_at=? WHERE job_id=? AND revision=? AND node IN ('promotion','delivery') AND ${won}`).bind(at,id,p.revision,...wonArgs),
  db().prepare(`UPDATE production_jobs SET status='approved',error=NULL,updated_at=? WHERE id=? AND ${won}`).bind(at,id,...wonArgs)
 ]);
 const saved=await receiptRow();if(!saved)throw new ProductionError('Revision return raced with a newer binding or active lease; reread before retry',409);
 const response=await replay(saved);return {...response,replayed:!results[0].meta.changes};
}
