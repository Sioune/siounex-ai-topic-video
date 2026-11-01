// Only a new text review may follow this evidence. The old remote result stays unknown.
export const TEXT_REVIEW_RETRY_SCHEMA='expired-readonly-text-review-retry-v1';
export const TEXT_REVIEW_RETRY_HASH_FIELDS=['source_snapshot_sha256','skill_snapshot_sha256','artifact_json_sha256','original_report_sha256','original_cache_key','prompt_sha256','schema_sha256','intent_sha256','started_sha256','owned_process_sha256','process_exit_sha256','event_log_sha256'] as const;
const digest=(v:any)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function systemTextReviewFailure(job:any,m:any){
 if(job.status!=='paused'||m?.status!=='paused'||m.review_until!=null||!/^Codex review CLI_(?:NONZERO_EXIT|DEADLINE_REACHED|CONNECTION_FAILED|AUTHENTICATION_REQUIRED|MODEL_UNAVAILABLE|MODEL_DISCOVERY_FAILED); inspect immutable cli-process-exit\.json; no automatic retry$/.test(job.error||''))return null;
 try{const report=JSON.parse(m.report);if(report.decision!=='pause'||report.reason!==job.error)return null;return job.reviews?.find((r:any)=>r.decision==='ai_review_error'&&r.reviewer==='codex-cli'&&r.revision===job.revision&&r.content_hash===m.artifact_hash&&r.note===m.report&&r.created_at===m.updated_at)||null}catch{return null}
}
export function currentTextReviewRetry(job:any,milestone:any,now=Date.now()){
 if(job?.is_test!==0||job.review_mode!=='auto'||job.lease_hash!=null||job.lease_until!=null||job.publication_reports?.length||job.operations?.some((o:any)=>['running','prepared'].includes(o.status)))return false;
 if(!milestone||!['source','script'].includes(milestone.node)||milestone.revision!==job.revision||milestone.mode_epoch!==job.mode_epoch||!milestone.invocation_id||!Number.isFinite(Date.parse(milestone.updated_at)))return false;
 const expired=job.status==='awaiting_review'&&!job.error&&milestone.status==='ai_running'&&Number.isFinite(milestone.review_until)&&milestone.review_until<now;
 if(!expired&&!systemTextReviewFailure(job,milestone))return false;
 return !job.milestones?.some((m:any)=>m.node===milestone.node&&m.revision===job.revision&&m.artifact_version>milestone.artifact_version);
}
export function textReviewRetryBinding(job:any,m:any){return {job_id:job.id,milestone_id:m.id,revision:job.revision,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash,artifact_hash:m.artifact_hash,invocation_id:m.invocation_id,attempt:job.attempt,ai_calls:job.ai_calls,job_updated_at:job.updated_at,milestone_updated_at:m.updated_at,review_until:m.review_until,job_status:job.status,job_error:job.error??null,milestone_status:m.status,failure_review_id:systemTextReviewFailure(job,m)?.id||null};}
export function validTextReviewRetryProof(job:any,m:any,p:any){
 const binding=textReviewRetryBinding(job,m);
 return p?.schema===TEXT_REVIEW_RETRY_SCHEMA&&Object.entries(binding).every(([k,v])=>p[k]===v)&&TEXT_REVIEW_RETRY_HASH_FIELDS.every(k=>digest(p[k]))&&p.read_only===true&&p.original_process_no_longer_running===true&&p.local_output_present===false&&p.completed_local_result_present===false&&p.original_result_unknown===true&&p.original_files_preserved===true&&p.observed_tool_calls===0&&p.new_model_calls===0&&!Object.hasOwn(p,'confirmed_no_result')&&Number.isInteger(p.original_exit_code)&&p.original_exit_code!==0&&['CLI_NONZERO_EXIT','CLI_DEADLINE_REACHED','CLI_CONNECTION_FAILED','CLI_AUTHENTICATION_REQUIRED','CLI_MODEL_UNAVAILABLE','CLI_MODEL_DISCOVERY_FAILED'].includes(p.original_exit_category)&&(job.status!=='paused'||job.error===`Codex review ${p.original_exit_category}; inspect immutable cli-process-exit.json; no automatic retry`)&&typeof p.original_started_at==='string'&&Number.isFinite(Date.parse(p.original_started_at))&&typeof p.verified_at==='string'&&Number.isFinite(Date.parse(p.verified_at));
}
