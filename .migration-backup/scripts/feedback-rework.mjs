import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function feedbackPromptInstruction(feedback){return feedback?'以下为站内保存、绑定来源版本和哈希的本人反馈。逐项解决反馈，并保持本任务冻结的选题、原文、证据及限制；不得把其他任务的要求移植到本任务，也不得把未经验证的内容写成既成事实。\n'+feedback.note+'\n':'';}
export function savedFeedbackForGeneration(job){
 for(const r of job.reviews||[]){if(r.decision!=='script_feedback_rework')continue;const q=JSON.parse(r.note);if(q.source_revision<job.revision||q.mode_epoch!==job.mode_epoch)continue;
  const d=job.drafts.find(d=>d.revision===job.revision),opinion=job.reviews.find(x=>x.id===q.feedback_id&&x.decision==='script_feedback'),v=opinion&&JSON.parse(opinion.note);
  if(q.schema!=='siounex-feedback-rework-v1'||q.source_revision!==job.revision||q.target_revision!==job.revision+1||q.mode_epoch!==job.mode_epoch||q.contract_hash!==job.contract_hash||q.source_hash!==d?.content_hash||!v||v.note!==job.review_note||sha(v.note)!==q.feedback_note_sha256||v.mode_epoch!==job.mode_epoch||opinion.revision!==job.revision||opinion.content_hash!==d.content_hash)throw Error('Saved owner feedback queue is stale or does not match original opinion; no generation');
  return {queue_id:r.id,feedback_id:q.feedback_id,feedback_note_sha256:q.feedback_note_sha256,source_revision:q.source_revision,source_hash:q.source_hash,mode_epoch:q.mode_epoch,note:v.note};
 }
 if((job.reviews||[]).some(r=>r.decision==='script_feedback_rework'&&JSON.parse(r.note).source_revision===job.revision))throw Error('Saved owner feedback queue belongs to an earlier mode; submit current feedback before generation');
 return null;
}
