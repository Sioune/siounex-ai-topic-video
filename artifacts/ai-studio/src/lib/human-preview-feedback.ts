import {db} from './store';
import {getJob} from './production';
import {decideMilestone,continueMediaRework,type PreviewFeedbackGuard} from './milestones';

// Only a decision actually recorded by the owner for the exact currently
// returned video may become a formal node decision. This never invents one.
export async function reconcileHumanPreviewFeedback(id:string,owner:string){
 const job=await getJob(id,owner);if(job.is_test||job.review_mode!=='node')return {state:'not-applicable'};
 const latest=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('wip_video_latest_v1:'+id).first<{value:string}>();if(!latest)return {state:'no-preview'};
 const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('wip_video_v1:'+latest.value).first<{value:string}>();if(!row)return {state:'preview-missing'};
 let p:any;try{p=JSON.parse(row.value)}catch{return {state:'preview-invalid'}}
 if(p.id!==latest.value||p.job_id!==id||p.owner_id!==owner||p.status!=='ready'||p.revision!==job.revision||!/^[a-f0-9]{64}$/.test(p.sha256||''))return {state:'preview-changed'};
 const feedback=await db().prepare("SELECT id,note,created_at FROM production_reviews WHERE job_id=? AND reviewer=? AND revision=? AND content_hash=? AND decision='human_preview_feedback' AND json_valid(note) AND json_extract(note,'$.schema')='human-preview-feedback-v1' AND json_extract(note,'$.preview_id')=? ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(id,owner,p.revision,p.sha256,p.id).first<{id:string;note:string;created_at:string}>();if(!feedback)return {state:'no-feedback'};
 let f:any;try{f=JSON.parse(feedback.note)}catch{return {state:'feedback-invalid'}}
 if(f.preview_id!==p.id||f.video_sha256!==p.sha256||!['approve','revise'].includes(f.decision)||typeof f.feedback!=='string'||f.feedback.length>4000||f.decision==='revise'&&!f.feedback.trim())return {state:'feedback-invalid'};
 const guard:PreviewFeedbackGuard={preview_id:p.id,preview_raw:row.value,feedback_id:feedback.id,feedback_note:feedback.note,feedback_created_at:feedback.created_at,video_sha256:p.sha256};
 const m=job.milestones?.filter(x=>x.node==='video'&&x.revision===job.revision&&x.mode_epoch===job.mode_epoch).sort((a,b)=>b.artifact_version-a.artifact_version)[0];let a:any;try{a=m&&JSON.parse(m.artifact)}catch{return {state:'formal-video-invalid'}}
 if(!m||a?.sha256!==p.sha256)return {state:'waiting-for-same-video',feedback_id:feedback.id};
 let previous:any=null;try{previous=m.report&&JSON.parse(m.report)}catch{}
 if(m.status!=='awaiting_human'){
  if(previous?.preview_feedback_id!==feedback.id||previous?.preview_id!==p.id||previous?.preview_video_sha256!==p.sha256||previous?.decision!==f.decision||previous?.actor!==owner)return {state:'formal-node-already-decided',feedback_id:feedback.id};
  if(f.decision==='revise'&&m.status==='revise')return continueRecordedRework(id,owner,m,f,feedback.id,guard);
  return {state:'linked',decision:f.decision,feedback_id:feedback.id,replayed:true};
 }
 if(job.status!=='approved')return {state:'waiting-for-eligible-job',feedback_id:feedback.id};
 // A live native handoff is allowed to finish and persist its original result.
 // In particular, do not pause the job underneath its current lease.
 const handoff=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('native_preparation_handoff_v1:'+id).first<{value:string}>();if(handoff){let h:any;try{h=JSON.parse(handoff.value)}catch{return {state:'waiting-for-inflight',feedback_id:feedback.id}}if(h.status==='claimed')return {state:'waiting-for-inflight',feedback_id:feedback.id};}
 await decideMilestone(id,m.id,m.revision,m.artifact_hash,m.mode_epoch,f.decision,{reason:f.feedback,preview_feedback_id:feedback.id,preview_id:p.id,preview_video_sha256:p.sha256,preview_feedback:f.feedback},owner,undefined,guard);
 if(f.decision==='revise')return continueRecordedRework(id,owner,m,f,feedback.id,guard);
 return {state:'linked',decision:f.decision,feedback_id:feedback.id,replayed:false};
}
async function continueRecordedRework(id:string,owner:string,m:any,f:any,feedbackId:string,guard:PreviewFeedbackGuard){
 try{await continueMediaRework(id,owner,m.id,m.revision,m.artifact_hash,m.mode_epoch,f.feedback,guard);return {state:'rework-queued',decision:'revise',feedback_id:feedbackId};}
 catch(error){return {state:'feedback-recorded-rework-pending',decision:'revise',feedback_id:feedbackId,reason:error instanceof Error?error.message:'返工待接续'};}
}

export async function tryReconcileHumanPreviewFeedback(id:string,owner:string){try{return await reconcileHumanPreviewFeedback(id,owner)}catch(error){return {state:'reconciliation-pending',reason:error instanceof Error?error.message:'本人意见待接续'};}}
