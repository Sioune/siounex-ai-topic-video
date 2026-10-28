import {executorFetch as fetch} from './native-production-transport.mjs';
import {cliContentBudget,cliTransportRecoveryCandidate} from '../lib/cli-content-budget.mts';
import {executorResponse} from './executor-response.mjs';
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {reviewText,digest} from './milestone-cli.mjs';
import {reviewOutputRecoveryCandidate} from '../lib/review-output-recovery.mts';
import {workflowStageBudget,workflowBudgetDeferred} from './workflow-stage-budget.mjs';
import {readHiddenJsonInput} from './hidden-json-input.mjs';
async function generate(config){const code=await new Promise((resolve,reject)=>{const c=spawn(process.execPath,['scripts/production-codex-executor.mjs'],{cwd:process.cwd(),windowsHide:true,stdio:['pipe','inherit','inherit']});c.once('error',reject);c.once('close',resolve);c.stdin.end(JSON.stringify(config)+'\n')});if(code!==0)throw Error('Generation stopped; read checkpoint and reconcile receipt');}
export async function runProductionWorkflow(config,{call,review=reviewText,generateText=generate,now=Date.now,sources:givenSources,emit=()=>{}}={}){
 const origin=config.origin||'https://siounex-ai-topic-library.siounexzhao.chatgpt.site';if(!/^https:\/\/siounex-ai-topic-library\.siounexzhao\.chatgpt\.site$/.test(origin)&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Unexpected destination');
 if(!call)call=async body=>executorResponse(await fetch(origin+'/api/executor',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+config.token},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)}));
 const sources=givenSources||[{url:config.source_url,sha256:digest(fs.readFileSync(config.source_file)),file:config.source_file}];
 if(!givenSources&&config.production_brief_file){const b=JSON.parse(fs.readFileSync(config.production_brief_file));sources.push(...b.evidence.map(x=>({url:x.url,sha256:x.sha256,file:x.file})),...(b.images||[]).map(x=>({kind:'image',url:x.url,sha256:x.sha256,file:x.file})));}
 const maxSteps=config.max_steps===undefined?16:Number(config.max_steps);if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>16)throw Error('max_steps must be 1–16');
 for(let step=0;step<maxSteps;step++){
  const j=(await call({action:'read',id:config.job_id})).job,deadline=config.foreground_deadline_ms??Infinity;
  if(config.reconcile_review_output===true){const budget=workflowStageBudget('reconciliation',deadline,now());if(!budget.can_start)return workflowBudgetDeferred(j,'reconciliation',budget);const ms=reviewOutputRecoveryCandidate(j);if(!ms)throw Error('COMPLETED_REVIEW_CURRENT_RECOVERY_SCOPE_INVALID');const report=await review({milestone:ms,job:j,sources,imageFile:config.cover_file,reconcileOutputOnly:true,foreground_deadline_ms:deadline}),proof=report.completed_output_recovery;const lease=await call({action:'review_output_recover',id:j.id,milestone_id:ms.id,proof});await call({action:'review_result',id:j.id,milestone_id:ms.id,revision:ms.revision,artifact_hash:ms.artifact_hash,mode_epoch:ms.mode_epoch,review_token:lease.review_token,decision:report.decision,report});return {workflow_result:true,status:'completed-review-output-reconciled',job_id:j.id,milestone_id:ms.id,new_model_calls:0};}
  const transport=cliTransportRecoveryCandidate(j,now());if(transport){await call({action:'cli_transport_resume',id:j.id,binding:transport});continue;}
  if(j.status==='waiting_executor'||j.status==='running'&&Number(j.lease_until)<now()){
   if(!cliContentBudget(j).generation_available||j.reworks>2)return {workflow_result:true,status:'budget-exhausted',job_id:j.id};
   const budget=workflowStageBudget('generation',deadline,now());if(!budget.can_start)return workflowBudgetDeferred(j,'generation',budget);
   await generateText({...config,submission_id:`workflow-${j.mode_epoch}-revision-${j.revision+1}`});continue;
  }
  const ms=j.milestones?.find(m=>m.revision===j.revision&&['awaiting_ai','ai_running'].includes(m.status));
  if(j.review_mode!=='auto'||!ms)return {workflow_result:true,status:j.status,mode:j.review_mode,job_id:j.id,reason:'Current human decision or next adapter required',automatic_trigger:false,paid_calls:0};
  const stage=ms.status==='ai_running'?'reconciliation':'review',budget=workflowStageBudget(stage,deadline,now());if(!budget.can_start)return workflowBudgetDeferred(j,stage,budget);
  const invocation=ms.status==='ai_running'?ms.invocation_id:`review-${digest(ms.id+':'+ms.artifact_hash+':'+ms.mode_epoch)}-call-${j.ai_calls+1}`;
  let originalReport=null;
  if(ms.status==='ai_running')try{originalReport=await review({milestone:ms,job:j,sources,imageFile:config.cover_file,reviewClaim:{invocation_id:invocation,reconciliation_only:true},foreground_deadline_ms:deadline});}catch{return {workflow_result:true,status:'review-result-reconciliation-required',job_id:j.id,revision:j.revision,milestone_id:ms.id,invocation_id:invocation,claimed:false,new_model_calls:0,retry_without_reconciliation:false};}
  const lease=ms.status==='ai_running'?await call({action:'review_recover',id:j.id,milestone_id:ms.id,invocation_id:invocation}):await call({action:'review_claim',id:j.id,milestone_id:ms.id,invocation_id:invocation});
  try{const report=originalReport||await review({milestone:ms,job:lease.job||j,sources,imageFile:config.cover_file,reviewClaim:lease,foreground_deadline_ms:deadline});const result=await call({action:'review_result',id:j.id,milestone_id:ms.id,revision:ms.revision,artifact_hash:ms.artifact_hash,mode_epoch:ms.mode_epoch,review_token:lease.review_token,decision:report.decision,report});emit({node:ms.node,revision:ms.revision,decision:report.decision,status:result.job.status});}
  catch(e){if(lease.reconciliation_only===true)throw e;try{await call({action:'review_fail',id:j.id,milestone_id:ms.id,review_token:lease.review_token,error:String(e.message).slice(0,2000),...(e.cli_failure?{diagnostic:e.cli_failure}:{})})}catch{}throw e;}
 }
 return {workflow_result:true,status:'workflow-step-limit',job_id:config.job_id};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{const config=JSON.parse(await readHiddenJsonInput());process.stdin.destroy();console.log(JSON.stringify(await runProductionWorkflow(config,{emit:v=>console.log(JSON.stringify(v))})));}catch(e){console.error(e.message);process.exitCode=1;}
