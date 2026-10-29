import {TEXT_REVIEW_RETRY_HASH_FIELDS,textReviewRetryBinding} from './text-review-retry-contract.mts';
export const TERMINAL_TEXT_REVIEW_SCHEMA='completed-terminal-text-review-v1';
const sha=(v:any)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
// A bounded CLI can finish its output while its deadline cleanup is running.
// Keep that deadline/unknown record; accept zero only with the original file
// hash and exact terminal-message bytes independently verified.
const terminalExit=(p:any)=>Number.isInteger(p?.original_exit_code)&&(p.original_exit_code!==0||p.original_exit_category==='CLI_DEADLINE_REACHED'&&p.original_timed_out===true&&p.original_output_present===true&&p.original_output_matches_terminal===true&&sha(p.original_output_sha256)&&p.original_output_sha256===p.output_sha256);
export function validTerminalTextReviewProof(j:any,m:any,p:any){
 const b=textReviewRetryBinding(j,m);
 return !!p&&p.schema===TERMINAL_TEXT_REVIEW_SCHEMA&&Object.keys(b).every(k=>p[k]===b[k as keyof typeof b])&&TEXT_REVIEW_RETRY_HASH_FIELDS.every(k=>sha(p[k]))&&sha(p.output_sha256)&&p.completed_terminal_output===true&&p.unique_complete_json===true&&p.read_only===true&&p.original_process_no_longer_running===true&&p.original_result_unknown===true&&p.original_files_preserved===true&&p.observed_tool_calls===0&&p.new_model_calls===0&&terminalExit(p)&&['CLI_DEADLINE_REACHED','CLI_NONZERO_EXIT','CLI_CONNECTION_FAILED'].includes(p.original_exit_category)&&(j.status!=='paused'||j.error===`Codex review ${p.original_exit_category}; inspect immutable cli-process-exit.json; no automatic retry`)&&Number.isFinite(Date.parse(p.original_started_at))&&Number.isFinite(Date.parse(p.verified_at));
}
export function terminalTextReceiptValid(r:any,j:any,m:any,sourceHash:string,skillHash:string){
 const p=r?.terminal_text_review_reconciliation;
 if(!p||r.schema!=='terminal-readonly-text-review-reconciliation-v1'||r.completion_basis!=='unique-terminal-json-and-owned-process-exit'||r.exit_code!==p.original_exit_code||r.process_exit_code!==p.original_exit_code||!terminalExit(p)||r.original_cli_result_unknown!==true||p.schema!==TERMINAL_TEXT_REVIEW_SCHEMA||!['source','script'].includes(m.node)||j.review_mode!=='auto'||m.status!=='ai_running')return false;
 const b={job_id:j.id,milestone_id:m.id,revision:j.revision,mode_epoch:j.mode_epoch,contract_hash:j.contract_hash,artifact_hash:m.artifact_hash,invocation_id:m.invocation_id,attempt:j.attempt,ai_calls:j.ai_calls,source_snapshot_sha256:sourceHash,skill_snapshot_sha256:skillHash};
 return Object.keys(b).every(k=>p[k]===b[k as keyof typeof b])&&TEXT_REVIEW_RETRY_HASH_FIELDS.every(k=>sha(p[k]))&&sha(p.output_sha256)&&p.completed_terminal_output===true&&p.unique_complete_json===true&&p.read_only===true&&p.original_process_no_longer_running===true&&p.original_result_unknown===true&&p.original_files_preserved===true&&p.observed_tool_calls===0&&p.new_model_calls===0&&p.output_sha256===r.output_sha256&&p.original_cache_key===r.prompt_sha256&&p.artifact_json_sha256===r.artifact_json_hash&&j.reviews?.some((v:any)=>v.decision==='ai_review_terminal_output_reconciliation_v1'&&v.reviewer==='verified-owned-terminal-output'&&v.revision===j.revision&&v.content_hash===m.artifact_hash&&v.note===JSON.stringify(p));
}
