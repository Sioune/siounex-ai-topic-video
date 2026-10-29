import {isFixedOutroSegment} from './storyboard-segments.mts';
import {cliContentBudget,CLI_CONTENT_LIMITS} from './cli-content-budget.mts';
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function reviewOutputRecoveryCandidate(j:any){
 const budget=cliContentBudget(j);
 // This reuses one already completed result and consumes no new call. Keep
 // raw counters intact; only the accepted zero-result ledger is discounted.
 if(j.review_mode!=='auto'||j.status!=='paused'||!Number.isInteger(j.ai_calls)||j.ai_calls<1||budget.content_ai_calls>CLI_CONTENT_LIMITS.aiCalls||j.reworks>CLI_CONTENT_LIMITS.reworks||!Number.isInteger(j.attempt)||budget.content_attempts>CLI_CONTENT_LIMITS.attempts||j.publication_reports?.length||j.lease_hash||j.lease_until!=null)return null;
 // A completed source review can be reused after an internal transport failure.
 // The exact original invocation must still be the current paused node; no
 // later user or system review decision may supersede the recorded failure.
 if(j.error==='NATIVE_PRODUCTION_TOOL_FAILED'){
  const m=j.milestones?.filter((x:any)=>x.revision===j.revision&&x.node==='source').sort((a:any,b:any)=>b.artifact_version-a.artifact_version)[0];
  if(!m||m.status!=='paused'||m.mode_epoch!==j.mode_epoch||!m.invocation_id||m.review_token_hash||m.review_until!=null)return null;
  try{const report=JSON.parse(m.report),failure=j.reviews?.find((r:any)=>r.revision===j.revision&&r.content_hash===m.artifact_hash&&r.decision==='ai_review_error'&&r.reviewer==='codex-cli'&&r.note===m.report);if(report.decision!=='pause'||report.reason!==j.error||!report.operation_id||!failure||j.reviews.some((r:any)=>r!==failure&&r.created_at>=failure.created_at&&r.revision===j.revision&&!['series_selection'].includes(r.decision)))return null;return m;}catch{return null;}
 }
 const match=/^Cannot approve script with blocked text preflight: segments\[(\d+)\] 缺文字或具体可见画面$/.exec(j.error||'');if(!match)return null;
 const m=j.milestones?.filter((m:any)=>m.revision===j.revision&&m.node==='script').sort((a:any,b:any)=>b.artifact_version-a.artifact_version)[0];
 if(!m||m.status!=='paused'||m.mode_epoch!==j.mode_epoch||!m.invocation_id||m.review_token_hash||m.review_until!=null)return null;
 try{const report=JSON.parse(m.report),artifact=JSON.parse(m.artifact),index=Number(match[1]),story=artifact.storyboard,s=story?.[index];if(report.decision!=='pause'||report.reason!==j.error||!report.operation_id||!Array.isArray(story)||!isFixedOutroSegment(s,index,story)||typeof s.narration!=='string'||s.narration.trim()||typeof s.visual!=='string'||!s.visual.trim())return null;
  if(!j.reviews?.some((r:any)=>r.revision===j.revision&&r.content_hash===m.artifact_hash&&r.decision==='ai_review_error'&&r.reviewer==='codex-cli'&&r.note===m.report))return null;
  return m;
 }catch{return null;}
}
export const REVIEW_OUTPUT_RECOVERY_HASH_FIELDS=['failed_report_sha256','artifact_json_sha256','source_snapshot_sha256','skill_snapshot_sha256','original_prompt_sha256','original_cache_key','process_receipt_sha256','event_log_sha256','output_sha256','execution_receipt_sha256','preflight_input_sha256'] as const;
export function validReviewOutputRecoveryProof(j:any,m:any,p:any){
 return !!p&&p.schema==='completed-review-output-recovery-v1'&&p.job_id===j.id&&p.milestone_id===m.id&&p.revision===j.revision&&p.mode_epoch===j.mode_epoch&&p.contract_hash===j.contract_hash&&p.artifact_hash===m.artifact_hash&&p.invocation_id===m.invocation_id&&p.ai_calls===j.ai_calls&&p.attempt===j.attempt&&p.job_updated_at===j.updated_at&&p.milestone_updated_at===m.updated_at&&p.completed_original_output===true&&p.tool_events===0&&p.new_model_calls===0&&REVIEW_OUTPUT_RECOVERY_HASH_FIELDS.every(k=>digest(p[k]));
}
