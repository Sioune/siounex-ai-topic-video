// A rejected transport request is an audited invocation, but not a content decision.
// This module is client safe. Authoritative writes additionally CAS the exact DB snapshot.
import {ownerFeedbackContinuation} from './owner-feedback-continuation.mts';
export const CLI_CONTENT_LIMITS={attempts:6,aiCalls:8,reworks:2} as const;
export const CLI_TRANSPORT_HELD_JOB_IDS=['job_e13e8b19-aa0a-4840-abc9-333eefc91b05','job_3fc559eb-354e-48e3-a718-8a89b2e6e170'] as const;
const parsed=(v:any)=>{try{return typeof v==='string'?JSON.parse(v):v}catch{return null}};
const sha=(v:any)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v:any,min=0)=>Number.isSafeInteger(v)&&v>=min;
const date=(v:any)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const reviewStages=['source-review','script-review','cover-review','promotion-review','delivery-review'];
// D1 limits expression depth to 100. Flat left-associated boolean chains can
// exceed that limit when this correlated ledger is embedded in a claim guard.
function sqlBoolean(parts:string[],operator:'AND'|'OR'):string{
 if(parts.length===0)return operator==='AND'?'1':'0';
 if(parts.length===1)return `(${parts[0]})`;
 const middle=Math.floor(parts.length/2);return `(${sqlBoolean(parts.slice(0,middle),operator)} ${operator} ${sqlBoolean(parts.slice(middle),operator)})`;
}
const failure=(r:any)=>parsed(r?.note)||r?.failure;
function record(job:any,r:any,kind:'review'|'generation'){
 const f=failure(r),b=f?.binding,x=f?.execution_binding,ordinal=kind==='review'?b?.ai_calls:b?.attempt;
 const trusted=(r?.reviewer??r?.reviewer_kind)==='verified-owned-cli-exit'&&r?.decision===(kind==='review'?'cli_review_failure_v1':'cli_execution_failure_v1');
 if(!trusted||!integer(ordinal,1)||ordinal>(kind==='review'?job.ai_calls:job.attempt))return null;
 const sourceFields=['source_hash','skill_hash'],executionFields=['source_file_sha256','skill_bundle_sha256'];
 const valid=!!f&&f.schema==='text-cli-failure-v1'&&f.code==='CLI_RATE_LIMITED'&&f.confirmed_no_result===true&&f.result_unknown===false&&f.output_present===false&&f.process_exited===true&&f.tool_events===0&&f.terminal_rate_limit===true&&
  ['process_receipt_sha256','event_log_sha256','prompt_sha256'].every(k=>sha(f[k]))&&date(f.finished_at)&&date(r.created_at)&&Date.parse(f.finished_at)<=Date.parse(r.created_at)+60000&&
  !!b&&!!x&&b.job_id===job.id&&x.job_id===job.id&&integer(b.revision)&&b.revision<=job.revision&&r.revision===b.revision&&x.revision===b.revision&&integer(b.mode_epoch)&&b.mode_epoch<=job.mode_epoch&&integer(x.mode_epoch)&&x.mode_epoch<=b.mode_epoch&&
  b.contract_hash===job.contract_hash&&x.contract_hash===b.contract_hash&&sha(b.contract_hash)&&integer(b.attempt)&&b.attempt<=job.attempt&&x.attempt===b.attempt&&sourceFields.every(k=>sha(b[k]))&&x.source_snapshot_sha256===b.source_hash&&x.skill_snapshot_sha256===b.skill_hash&&executionFields.every(k=>sha(x[k]))&&
  (kind==='review'?reviewStages.includes(f.stage)&&x.mode_epoch===b.mode_epoch&&x.ai_calls===ordinal&&typeof b.review_milestone_id==='string'&&!!b.review_milestone_id&&x.milestone_id===b.review_milestone_id&&sha(b.artifact_hash)&&r.content_hash===b.artifact_hash&&x.artifact_hash===b.artifact_hash&&typeof b.review_invocation_id==='string'&&!!b.review_invocation_id&&x.review_invocation_id===b.review_invocation_id:f.stage==='script'&&r.content_hash===b.contract_hash);
 const invocation=kind==='review'?b?.review_invocation_id:null;
 const fingerprint=JSON.stringify([f?.process_receipt_sha256,f?.event_log_sha256,f?.prompt_sha256,b?.job_id,b?.revision,b?.mode_epoch,b?.contract_hash,b?.attempt,b?.source_hash,b?.skill_hash,b?.review_milestone_id??null,b?.artifact_hash??null,invocation,x?.source_file_sha256,x?.skill_bundle_sha256,x?.mode_epoch]);
 return{r,f,b,ordinal,valid,fingerprint,receipt:f?.process_receipt_sha256,event:f?.event_log_sha256,invocation};
}
function ledger(job:any,kind:'review'|'generation'){
 const groups=new Map<number,ReturnType<typeof record>[]>();
 for(const r of job?.reviews||[]){const v=record(job,r,kind);if(v)groups.set(v.ordinal,[...(groups.get(v.ordinal)||[]),v]);}
 const unique=[...groups.values()].filter(v=>v.every(x=>x?.valid)&&new Set(v.map(x=>x?.fingerprint)).size===1).map(v=>v[0]!);
 return unique.filter(v=>!unique.some(other=>other.ordinal!==v.ordinal&&(other.receipt===v.receipt||other.event===v.event||kind==='review'&&other.invocation===v.invocation)));
}
export function cliContentBudget(job:any){
 const valid=integer(job?.attempt)&&integer(job?.ai_calls)&&integer(job?.reworks),generation=valid?ledger(job,'generation'):[],reviews=valid?ledger(job,'review'):[];
 const content_attempts=valid?job.attempt-generation.length:Infinity,content_ai_calls=valid?job.ai_calls-reviews.length:Infinity;
 const extension=ownerFeedbackContinuation(job),reworks_limit=extension?.reworks??CLI_CONTENT_LIMITS.reworks,attempt_limit=extension?.max_attempts??CLI_CONTENT_LIMITS.attempts,review_limit=extension?.max_ai_calls??CLI_CONTENT_LIMITS.aiCalls;
 return{schema:'cli-content-budget-v1',raw_attempts:job?.attempt,raw_ai_calls:job?.ai_calls,reworks:job?.reworks,reworks_limit,attempt_limit,review_limit,zero_result_generation_attempts:generation.length,zero_result_review_calls:reviews.length,content_attempts,content_ai_calls,generation_available:valid&&content_attempts<attempt_limit&&job.reworks<=reworks_limit,review_available:valid&&content_ai_calls<review_limit&&job.reworks<=reworks_limit};
}
// Mirrors the strict accepted-record ledger for read-only selection and atomic SQL gates.
// No caller-supplied alias or value enters SQL.
export function cliContentCountSql(alias='j',kind:'review'|'generation'='review'){
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)||!['review','generation'].includes(kind))throw Error('Invalid content budget SQL scope');
 const j=alias,n="CASE WHEN json_valid(r.note) THEN r.note ELSE '{}' END",v=(p:string)=>`json_extract(${n},'$.${p}')`,ty=(p:string)=>`json_type(${n},'$.${p}')`,b=(p:string)=>v('binding.'+p),x=(p:string)=>v('execution_binding.'+p),hex=(p:string)=>`(typeof(${p})='text' AND length(${p})=64 AND ${p} NOT GLOB '*[^0-9a-f]*')`,int=(p:string,min=0)=>`(typeof(${p})='integer' AND ${p}>=${min})`,ord=b(kind==='review'?'ai_calls':'attempt'),raw=kind==='review'?'ai_calls':'attempt';
 const conditions=[...['binding.revision','binding.mode_epoch','binding.attempt','execution_binding.revision','execution_binding.mode_epoch','execution_binding.attempt',...(kind==='review'?['binding.ai_calls','execution_binding.ai_calls']:[])].map(p=>`${ty(p)}='integer'`),`${v('schema')}='text-cli-failure-v1'`,`${v('code')}='CLI_RATE_LIMITED'`,`${ty('confirmed_no_result')}='true'`,`${ty('result_unknown')}='false'`,`${ty('output_present')}='false'`,`${ty('process_exited')}='true'`,`${v('tool_events')}=0`,`${ty('tool_events')}='integer'`,`${ty('terminal_rate_limit')}='true'`,...['process_receipt_sha256','event_log_sha256','prompt_sha256'].map(p=>hex(v(p))),`julianday(${v('finished_at')}) IS NOT NULL`,`julianday(r.created_at) IS NOT NULL`,`julianday(${v('finished_at')})<=julianday(r.created_at)+60.0/86400`,`${b('job_id')}=${j}.id`,`${x('job_id')}=${j}.id`,int(b('revision')),`${b('revision')}<=${j}.revision`,`r.revision=${b('revision')}`,`${x('revision')}=${b('revision')}`,int(b('mode_epoch')),`${b('mode_epoch')}<=${j}.mode_epoch`,int(x('mode_epoch')),`${x('mode_epoch')}<=${b('mode_epoch')}`,`${b('contract_hash')}=${j}.contract_hash`,hex(b('contract_hash')),`${x('contract_hash')}=${b('contract_hash')}`,int(b('attempt')),`${b('attempt')}<=${j}.attempt`,`${x('attempt')}=${b('attempt')}`,hex(b('source_hash')),hex(b('skill_hash')),`${x('source_snapshot_sha256')}=${b('source_hash')}`,`${x('skill_snapshot_sha256')}=${b('skill_hash')}`,hex(x('source_file_sha256')),hex(x('skill_bundle_sha256'))];
 if(kind==='review')conditions.push(`${v('stage')} IN (${reviewStages.map(s=>`'${s}'`).join(',')})`,`${x('mode_epoch')}=${b('mode_epoch')}`,`${x('ai_calls')}=${ord}`,`typeof(${b('review_milestone_id')})='text' AND length(${b('review_milestone_id')})>0`,`${x('milestone_id')}=${b('review_milestone_id')}`,hex(b('artifact_hash')),`r.content_hash=${b('artifact_hash')}`,`${x('artifact_hash')}=${b('artifact_hash')}`,`typeof(${b('review_invocation_id')})='text' AND length(${b('review_invocation_id')})>0`,`${x('review_invocation_id')}=${b('review_invocation_id')}`);
 else conditions.push(`${v('stage')}='script'`,`r.content_hash=${b('contract_hash')}`);
 const invocation=kind==='review'?b('review_invocation_id'):'NULL',proof=`json_array(${[v('process_receipt_sha256'),v('event_log_sha256'),v('prompt_sha256'),b('job_id'),b('revision'),b('mode_epoch'),b('contract_hash'),b('attempt'),b('source_hash'),b('skill_hash'),b('review_milestone_id'),b('artifact_hash'),invocation,x('source_file_sha256'),x('skill_bundle_sha256'),x('mode_epoch')].join(',')})`;
 const ledgerGuard=sqlBoolean([`r.job_id=${j}.id`,"r.reviewer='verified-owned-cli-exit'",`r.decision='${kind==='review'?'cli_review_failure_v1':'cli_execution_failure_v1'}'`,int(ord,1),`${ord}<=${j}.${raw}`],'AND'),sameProvenance=sqlBoolean(['o.receipt=a.receipt','o.event=a.event',...(kind==='review'?['o.invocation=a.invocation']:[])],'OR');
 return `(${j}.${raw}-(WITH ledger AS (SELECT ${ord} ordinal,${v('process_receipt_sha256')} receipt,${v('event_log_sha256')} event,${invocation} invocation,${proof} proof,CASE WHEN ${sqlBoolean(conditions,'AND')} THEN 1 ELSE 0 END valid FROM production_reviews r WHERE ${ledgerGuard}), accepted AS (SELECT ordinal,MIN(receipt) receipt,MIN(event) event,MIN(invocation) invocation FROM ledger GROUP BY ordinal HAVING MIN(valid)=1 AND COUNT(DISTINCT proof)=1) SELECT COUNT(*) FROM accepted a WHERE NOT EXISTS(SELECT 1 FROM accepted o WHERE o.ordinal!=a.ordinal AND ${sameProvenance})))`;
}
export function cliTransportRecoveryCandidate(job:any,nowMs=Date.now()){
 if(!job||CLI_TRANSPORT_HELD_JOB_IDS.includes(job.id)||job.is_test||job.review_mode!=='auto'||!['paused','failed'].includes(job.status)||!String(job.error||'').startsWith('CLI_RATE_LIMITED')||Number(job.lease_until)>nowMs||job.publication_reports?.length)return null;
 const f=parsed(job.checkpoint)?.cli_failure,b=f?.binding,budget=cliContentBudget(job),review=!!b?.review_milestone_id,entries=ledger(job,review?'review':'generation'),accepted=entries.find(e=>e.receipt===f?.process_receipt_sha256&&e.event===f?.event_log_sha256&&e.ordinal===(review?job.ai_calls:job.attempt));
 if(!accepted||JSON.stringify(accepted.f)!==JSON.stringify(f)||!date(f.recorded_at)||job.updated_at!==f.recorded_at||!date(f.next_retry_at)||Date.parse(f.next_retry_at)>nowMs||b.revision!==job.revision||b.mode_epoch!==job.mode_epoch||b.contract_hash!==job.contract_hash||b.attempt!==job.attempt||review&&!budget.review_available||!review&&!budget.generation_available)return null;
 if((job.reviews||[]).some((r:any)=>date(r.created_at)&&Date.parse(r.created_at)>=Date.parse(f.recorded_at)&&['pause','resume_stop','resume_manual','resume_manual_text','revise','script_feedback_rework','media_rework_requested'].includes(r.decision)))return null;
 if(job.milestones?.some((m:any)=>m.status==='ai_running')||job.operations?.some((o:any)=>['running','prepared'].includes(o.status))||job.stages?.some((s:any)=>['running','preparing'].includes(s.status)))return null;
 let m:any=null;if(review){m=job.milestones?.find((v:any)=>v.id===b.review_milestone_id);const report=parsed(m?.report);if(!m||m.status!=='paused'||m.review_until!=null||m.review_token_hash!=null||m.revision!==job.revision||m.mode_epoch!==job.mode_epoch||m.artifact_hash!==b.artifact_hash||m.invocation_id!==b.review_invocation_id||job.milestones.some((v:any)=>v.node===m.node&&v.revision===m.revision&&v.artifact_version>m.artifact_version)||report?.decision!=='defer'||report.content_quality_decision!==false||report.reason!=='CLI_RATE_LIMITED'||report.process_receipt_sha256!==f.process_receipt_sha256)return null;}
 else if(job.drafts?.some((d:any)=>d.revision>job.revision))return null;
 return{schema:'cli-transport-budget-resume-v1',job_id:job.id,revision:job.revision,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash,attempt:job.attempt,ai_calls:job.ai_calls,reworks:job.reworks,checkpoint_version:job.checkpoint_version,expected_updated_at:job.updated_at,failure_review_id:accepted.r.id,process_receipt_sha256:f.process_receipt_sha256,event_log_sha256:f.event_log_sha256,prompt_sha256:f.prompt_sha256,review_milestone_id:m?.id??null,artifact_hash:m?.artifact_hash??null,artifact_version:m?.artifact_version??null,review_invocation_id:m?.invocation_id??null};
}
