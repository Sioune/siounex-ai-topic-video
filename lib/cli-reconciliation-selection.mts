import {CLI_TRANSPORT_HELD_JOB_IDS} from './cli-content-budget.mts';
import {validCliFailureDiagnostic} from './cli-failure-contract.mts';
const parsed=(v:any)=>{try{return typeof v==='string'?JSON.parse(v):v}catch{return null}};
// A read-only hint for inspecting original local bytes. This never authorizes
// another model call; only the existing server reconciliation CAS can requeue.
export function cliFailureReconciliationBinding(job:any,now=Date.now()){
 const f=parsed(job?.checkpoint)?.cli_failure,b=f?.binding;
 if(!job||!/^job_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(job.id)||CLI_TRANSPORT_HELD_JOB_IDS.includes(job.id)||job.is_test||job.review_mode!=='auto'||job.status!=='failed'||Number(job.lease_until)>now||!validCliFailureDiagnostic(f)||f.stage!=='script'||f.code!=='CLI_MODEL_DISCOVERY_FAILED'||f.result_unknown!==true||f.confirmed_no_result!==false||f.output_present!==false||f.process_exited!==true||f.tool_events!==0)return null;
 if(!b||b.job_id!==job.id||b.revision!==job.revision||b.mode_epoch!==job.mode_epoch||b.contract_hash!==job.contract_hash||b.attempt!==job.attempt||b.review_milestone_id||!Number.isFinite(Date.parse(f.recorded_at))||job.updated_at!==f.recorded_at)return null;
 if(job.drafts?.some((d:any)=>d.revision>=job.revision)||job.milestones?.some((m:any)=>m.revision===job.revision)||job.publication_reports?.length||job.operations?.some((o:any)=>['running','prepared'].includes(o.status))||job.stages?.some((s:any)=>['running','preparing'].includes(s.status)))return null;
 if((job.reviews||[]).some((r:any)=>Date.parse(r.created_at)>=Date.parse(f.recorded_at)&&['pause','resume_stop','resume_manual','resume_manual_text','revise','script_feedback_rework','media_rework_requested'].includes(r.decision)))return null;
 const accepted=(job.reviews||[]).find((r:any)=>r.reviewer==='verified-owned-cli-exit'&&r.decision==='cli_execution_failure_v1'&&r.revision===job.revision&&r.content_hash===job.contract_hash&&r.note&&JSON.stringify(parsed(r.note))===JSON.stringify(f));
 if(!accepted)return null;
 return{job_id:job.id,revision:job.revision,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash,attempt:job.attempt,expected_updated_at:job.updated_at};
}
