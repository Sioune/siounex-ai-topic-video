import type {ProductionJob} from './production-contract';
import {ProductionError} from './production-contract';
// Both dispatch and claim use alias j. Historical modes are immutable records;
// only a current, owner-bound queue may make its source revision executable.
const queueJson="CASE WHEN json_valid(q.note) THEN q.note ELSE '{}' END",opinionJson="CASE WHEN json_valid(opinion.note) THEN opinion.note ELSE '{}' END";
export const CURRENT_FEEDBACK_GUARD_SQL=`(NOT EXISTS(SELECT 1 FROM production_reviews q WHERE q.job_id=j.id AND q.decision='script_feedback_rework' AND q.revision=j.revision) OR EXISTS(SELECT 1 FROM production_reviews q JOIN production_reviews opinion ON opinion.id=json_extract(${queueJson},'$.feedback_id') AND opinion.job_id=j.id AND opinion.decision='script_feedback' JOIN production_drafts draft ON draft.job_id=j.id AND draft.revision=j.revision WHERE q.job_id=j.id AND q.decision='script_feedback_rework' AND q.revision=j.revision AND json_extract(${queueJson},'$.schema')='siounex-feedback-rework-v1' AND json_extract(${queueJson},'$.source_revision')=j.revision AND json_extract(${queueJson},'$.target_revision')=j.revision+1 AND json_extract(${queueJson},'$.mode_epoch')=j.mode_epoch AND json_extract(${queueJson},'$.contract_hash')=j.contract_hash AND json_extract(${queueJson},'$.source_hash')=draft.content_hash AND q.content_hash=draft.content_hash AND opinion.revision=j.revision AND opinion.content_hash=draft.content_hash AND opinion.reviewer=j.owner_id AND json_extract(${opinionJson},'$.mode_epoch')=j.mode_epoch AND json_extract(${opinionJson},'$.revision')=j.revision AND json_extract(${opinionJson},'$.script_hash')=draft.content_hash AND json_extract(${opinionJson},'$.note')=j.review_note))`;
export type FeedbackReworkBinding={locked_script_sha256?:string;schema:'siounex-feedback-rework-v1';feedback_id:string;feedback_note_sha256:string;source_revision:number;source_hash:string;mode_epoch:number;target_revision:number;contract_hash:string;source_dependency_preserved:true;quality_approval:false;new_paid_authorization:false;publication_authorization:false};
export function feedbackReworkBinding(job:ProductionJob):({queue_id:string}&FeedbackReworkBinding)|null{
 for(const r of job.reviews||[]){if(r.decision!=='script_feedback_rework')continue;let v:FeedbackReworkBinding;try{v=JSON.parse(String(r.note))}catch{throw new ProductionError('返工队列记录损坏，需要人工核对')}
  if(v.schema!=='siounex-feedback-rework-v1')throw new ProductionError('返工队列协议无效');
  if(v.source_revision<job.revision||v.mode_epoch!==job.mode_epoch)continue;
  const draft=job.drafts?.find(d=>d.revision===job.revision);
  if(v.source_revision!==job.revision||v.target_revision!==job.revision+1||v.mode_epoch!==job.mode_epoch||v.source_hash!==draft?.content_hash||v.contract_hash!==job.contract_hash)throw new ProductionError('已保存返工的版本或模式已失效，不能执行旧请求');
  return {queue_id:String(r.id),...v};
 }
 if((job.reviews||[]).some(r=>r.decision==='script_feedback_rework'&&JSON.parse(String(r.note)).source_revision===job.revision))throw new ProductionError('已保存返工的模式已失效，需在当前模式重新提交意见');
 return null;
}
