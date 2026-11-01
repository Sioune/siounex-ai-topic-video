// Read existing owner opinions as context; never queues rework or grants approval.
export function savedOwnerFeedbackHistory(job){
 // getJob already scopes reviews to its job and omits their redundant job_id.
 return (job.reviews||[]).filter(r=>r.decision==='script_feedback'&&(r.job_id===undefined||r.job_id===job.id)&&typeof r.reviewer==='string'&&r.reviewer).flatMap(r=>{let v;try{v=JSON.parse(r.note)}catch{return []}return v?.schema==='siounex-script-feedback-v1'&&Number.isSafeInteger(r.revision)&&r.revision<=job.revision&&v.revision===r.revision&&v.script_hash===r.content_hash&&Number.isSafeInteger(v.mode_epoch)&&v.mode_epoch<=job.mode_epoch&&typeof v.note==='string'&&v.note.trim()&&v.note.length<=4000?[{feedback_id:r.id,source_revision:r.revision,source_hash:r.content_hash,created_at:r.created_at,note:v.note}]:[]}).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||a.feedback_id.localeCompare(b.feedback_id));
}
export const savedOwnerFeedbackInstruction='本人已保存的修改意见跨稿保留，后续明确意见优先；本轮AI退回理由不能替代本人意见。逐项核对口播是否已解决这些意见，未解决应改稿或如实说明，不能编造提示词、复现步骤或实测结果。';
