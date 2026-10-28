import {executorFetch as fetch} from './native-production-transport.mjs';
import {runAutomaticClone} from './automatic-clone-consumer.mjs';
import {cliFailureRecovery,safeRateLimitFailure} from '../lib/cli-failure-contract.mts';
import {executorResponse} from './executor-response.mjs';
import {boundedWorkflowChild} from './bounded-workflow-child.mjs';
// One finite invocation; native wake transport is deliberately not installed here.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {linkedSourceImages,deferredSourceImages} from './source-materials.mjs';
import {executePromo} from './production-promo-executor.mjs';
import {runPostVideoPreparation} from './post-video-preparation-consumer.mjs';
import {registerMissingPreparation} from './register-missing-preparation.mjs';
import {runPreparation} from './media-input-probe.mjs';
import {prepareContentSupport,restoreContentSupportBrief} from './content-support.mjs';
import {researchSourceBundle} from './research-source-bundle.mjs';
import {originalSourceBundle} from './original-source-bundle.mjs';
import {sourceDiagnostic,sourceReviewNote} from '../lib/source-input-contract.mts';
const sha=x=>createHash('sha256').update(x).digest('hex');
const retryIdentity=/^source_retry_[a-f0-9-]{36}$/;
function preparationPaths(job,root){
 const bound={revision:job.revision,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash,source_snapshot_hash:sha(job.source_snapshot)},provided=(job.reviews||[]).find(r=>r.decision==='source_input_saved'&&/^[a-f0-9]{64}$/.test(String(r.content_hash))),base=path.resolve(root,job.id,job.contract_hash,...(provided?['provided-'+provided.content_hash]:[]));
 const retries=(job.reviews||[]).filter(r=>r.decision==='source_input_retry'&&retryIdentity.test(String(r.id))).filter(r=>{const note=sourceReviewNote(r,bound,false);return note?.schema==='source-input-retry-v2'&&note.retry_id===r.id;});
 const current=retries.find(r=>sourceReviewNote(r,bound)),generation=id=>path.join(base,'preparation-'+id),candidates=[...retries.map(r=>generation(r.id)),base];
 // A confirmed source receipt is immutable and remains usable after a script
 // revision or mode change. An explicit pre-generation retry may bypass only an
 // unconfirmed partial directory, never a mismatching confirmed receipt.
 for(const dir of candidates){const file=path.join(dir,'source.txt'),receiptPath=path.join(dir,'source-receipt.json');if(!fs.existsSync(receiptPath))continue;const receipt=JSON.parse(fs.readFileSync(receiptPath));if(receipt.source_snapshot_hash!==bound.source_snapshot_hash||receipt.url!==JSON.parse(job.source_snapshot).url||!fs.existsSync(file)||receipt.sha256!==sha(fs.readFileSync(file)))throw Error('Frozen material changed; reconcile before generation');return {dir,file,receiptPath,receipt,imageRetry:current||retries[0]};}
 const fresh=current&&job.revision===0&&job.attempt===0&&!(job.drafts||[]).length,dir=fresh?generation(current.id):base;return {dir,file:path.join(dir,'source.txt'),receiptPath:path.join(dir,'source-receipt.json'),receipt:null,imageRetry:current||retries[0]};
}
function preparationDiagnostic(error,stage,host){
 const structured=sourceDiagnostic(error?.source_diagnostic||error?.diagnostic);if(structured?.stage===stage)return structured;
 const code=typeof error?.code==='string'?error.code:typeof error?.reason==='string'?error.reason:'',status=Number(error?.status),fallback=sourceDiagnostic({stage,code,retryable:error?.retryable!==false,...(Number.isInteger(status)&&status>=100&&status<=599?{status}:{}),...(host?{host}:{})});
 return fallback||{stage,code:stage==='images'?'image-unavailable':'source-unavailable',retryable:true,...(host?{host}:{})};
}
async function input(){return new Promise((resolve,reject)=>{let s='';const tty=process.stdin.isTTY;const done=e=>{process.stdin.off('data',data);process.stdin.off('end',end);if(tty)process.stdin.setRawMode(false);process.stdin.pause();e?reject(e):resolve(s)};function data(x){s+=x;if(s.includes('\u0003'))done(Error('Cancelled'));else if(s.length>16000)done(Error('Input too large'));else if(/[\r\n]/.test(s))done()}function end(){done()}if(tty)process.stdin.setRawMode(true);console.log('Ready for finite dispatch JSON on hidden stdin.');process.stdin.setEncoding('utf8');process.stdin.on('data',data);process.stdin.once('end',end);process.stdin.resume()})}
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
export function newCliTransportFailure(before,current,startedAt){
 const old=parse(before?.checkpoint)?.cli_failure,f=parse(current?.checkpoint)?.cli_failure,b=f?.binding,review=!!b?.review_milestone_id;
 if(!safeRateLimitFailure(f)||current?.id!==before?.id||b?.job_id!==current.id||b.revision!==current.revision||b.mode_epoch!==current.mode_epoch||b.contract_hash!==current.contract_hash||b.attempt!==current.attempt||f.process_receipt_sha256===old?.process_receipt_sha256||!Number.isFinite(startedAt)||Date.parse(f.finished_at)<startedAt-60000)return false;
 if(review?!(b.ai_calls===current.ai_calls&&b.ai_calls>before.ai_calls):!(b.attempt>before.attempt))return false;
 return(current.reviews||[]).some(r=>{const note=parse(r.note);return r.reviewer==='verified-owned-cli-exit'&&r.revision===current.revision&&r.content_hash===(review?b.artifact_hash:b.contract_hash)&&safeRateLimitFailure(note)&&r.decision===(review?'cli_review_failure_v1':'cli_execution_failure_v1')&&Date.parse(r.created_at)>=startedAt-60000&&note?.process_receipt_sha256===f.process_receipt_sha256&&note.event_log_sha256===f.event_log_sha256&&note.prompt_sha256===f.prompt_sha256&&['job_id','revision','mode_epoch','contract_hash','attempt','ai_calls','review_milestone_id','artifact_hash','review_invocation_id'].every(k=>note.binding?.[k]===b[k]);});
}
export async function dispatch(config,{call,selection,run=runChild,prepareImages=linkedSourceImages,prepare=runPreparation,prepareSupport=prepareContentSupport,root='.sites-runtime/dispatch-sources'}={}){
 if(!call){const origin=config.origin||'https://siounex-ai-topic-library.siounexzhao.chatgpt.site';if(origin!=='https://siounex-ai-topic-library.siounexzhao.chatgpt.site'&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Unexpected dispatch destination');call=async body=>{const r=await fetch(origin+'/api/executor',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+config.token},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});return executorResponse(r)};}
 const selected=selection??await call({action:'dispatch_next',...(config.test_job_id?{test_job_id:config.test_job_id}:{})});if(!selected.job)return {status:'idle',reason:selected.reason,automatic_trigger:false};
 let job=selected.job;if(config.execute!==true)return {status:'ready-to-start',job_id:job.id,kind:selected.kind,revision:job.revision,scope:job.is_test?'explicit-test':'authorized-production',automatic_trigger:false,execution_started:false};
 if(job.id==='job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee')throw Error('Protected video job never dispatched');
 if(selected.cli_transport_recovery){const result=await call({action:'cli_transport_resume',id:job.id,binding:selected.cli_transport_recovery}),current=result.job||(await call({action:'read',id:job.id})).job;if(current?.id!==job.id||current.revision!==job.revision||current.mode_epoch!==job.mode_epoch||!['waiting_executor','awaiting_review','approved'].includes(current.status))throw Error('CLI transport metadata recovery was not confirmed; no source fetch or model call');job=current;}
 if(selected.kind==='promotion-package')return executePromo({...config,job_id:job.id,package_id:selected.package_id});
 if(selected.kind==='automatic-clone')return runAutomaticClone(selected,{call,deadline_ms:config.foreground_deadline_ms});
 if(selected.kind==='post-video-preparation')return runPostVideoPreparation(selected,{call,deadline_ms:config.foreground_deadline_ms});
 if(selected.kind==='media')return {status:'needs-media-handoff',job_id:job.id,operation_id:selected.operation_id,reason:'Existing authorized input_root and Library handoff are required; no blind media generation',execution_started:false,automatic_trigger:false};
 if(selected.kind==='preparation-registration')return registerMissingPreparation(selected,{call});
 if(selected.kind==='preparation')return {status:'preparation-receipt-returned',job_id:job.id,result:await prepare(selected,{call}),generation_started:false,new_paid_calls:0,quality_approved:false,publication_authorized:false};
 if(!['text','review','review-output-reconciliation'].includes(selected.kind))return {status:'unsupported-queue-kind',job_id:job.id,reason:'Unsupported queue step; no source fetch, model or claim started',execution_started:false,automatic_trigger:false};
 const review=job.milestones?.find(m=>m.id===selected.milestone_id);
 if(review?.node==='cover'){
  if(!config.cover_file||!fs.existsSync(config.cover_file))return {status:'needs-cover-file',job_id:job.id,reason:'Exact local cover image required before reserving an AI review; no call or claim started',execution_started:false,automatic_trigger:false};
  if(sha(fs.readFileSync(config.cover_file))!==JSON.parse(review.artifact).sha256)throw Error('Cover bytes changed; no review reservation');
 }
 if(!/^job_[a-f0-9-]{36}$/.test(job.id)||!/^[a-f0-9]{64}$/.test(job.contract_hash))throw Error('Invalid frozen job identity');
 const prepared=preparationPaths(job,root),{dir,file,receiptPath}=prepared;fs.mkdirSync(dir,{recursive:true});let receipt=prepared.receipt;
 if(selected.kind==='review-output-reconciliation'&&!receipt)return {status:'review-output-reconciliation-required',job_id:job.id,reason:'COMPLETED_REVIEW_SOURCE_CACHE_MISSING',execution_started:false,new_model_calls:0};
 if(!receipt){if(fs.existsSync(file))throw Error('Unconfirmed source material exists; no overwrite or silent refetch');let response;try{response=await call({action:'dispatch_source',id:job.id,revision:job.revision,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash});}catch(error){if(error.code!=='EXECUTOR_REQUEST_REJECTED'||!/^Executor HTTP (400|422):/.test(error.message))throw error;const diagnostic=preparationDiagnostic(error,'text',new URL(JSON.parse(job.source_snapshot).url).hostname),blocked=await call({action:'source_input_block',id:job.id,revision:job.revision,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash,source_snapshot_hash:sha(job.source_snapshot),expected_updated_at:job.updated_at,diagnostic});return {status:'needs-source-input',job_id:job.id,reason:diagnostic.code,diagnostic,persisted:blocked.persisted,execution_started:false,automatic_trigger:false};}const source=response.source;if(!source||source.source_snapshot_hash!==sha(job.source_snapshot)||sha(source.content)!==source.sha256||source.url!==JSON.parse(job.source_snapshot).url||source.complete_response!==true)throw Error('Source provenance incomplete');fs.writeFileSync(file,source.content,{flag:'wx'});receipt={...source};delete receipt.content;fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2),{flag:'wx'});}
 const args={...config,job_id:job.id,source_file:file,source_url:receipt.url},imageDirectory=path.join(dir,'source-images',...(prepared.imageRetry?['preparation-'+prepared.imageRetry.id]:[]));
 if(selected.kind==='review-output-reconciliation'){args.reconcile_review_output=true;const brief=path.join(imageDirectory,'source-brief.json');if(!args.production_brief_file&&fs.existsSync(brief))args.production_brief_file=brief;args.materialize_linked_images=false;}
 const research=researchSourceBundle(job,path.join(dir,'research-notes'),config.production_brief_file);if(research)args.production_brief_file=research;
 const original=originalSourceBundle(job,path.join(dir,'original-notes'),args.production_brief_file);if(original)args.production_brief_file=original;
 if(selected.kind!=='review-output-reconciliation'&&config.materialize_linked_images===true&&!args.production_brief_file){const directory=imageDirectory;let images;try{images=await prepareImages({job,sourceFile:file,directory});}catch(error){images={needs_materials:true,diagnostic:preparationDiagnostic(error,'images')};}if(images.needs_materials){const diagnostic=preparationDiagnostic(images,'images');images=deferredSourceImages({job,sourceFile:file,directory,diagnostic});args.pending_source_materials=images.pending_materials;}if(images.brief_file)args.production_brief_file=images.brief_file;}
 if(selected.kind==='text'&&job.status==='waiting_executor'&&!job.is_test&&config.materialize_linked_images===true){const support=await prepareSupport({job,sourceFile:file,directory:path.join(dir,'content-support'),briefFile:args.production_brief_file||null});args.production_brief_file=support.brief_file;}
 if(['review','review-output-reconciliation'].includes(selected.kind)){const restored=restoreContentSupportBrief({job,sourceFile:file,directory:path.join(dir,'content-support'),briefFile:args.production_brief_file||null});if(restored)args.production_brief_file=restored;}
 delete args.test_job_id;const workflowStarted=Date.now();try{const work=await run(args);if(work?.status==='workflow-stage-budget-deferred')return {...work,status:'text-workflow-budget-deferred',execution_started:false,source_sha256:receipt.sha256,automatic_trigger:false};if(work?.status==='review-result-reconciliation-required')return {...work,execution_started:false,source_sha256:receipt.sha256,automatic_trigger:false};}catch(error){if(selected.kind==='review-output-reconciliation')return {status:'review-output-reconciliation-required',job_id:job.id,reason:'COMPLETED_REVIEW_RECONCILIATION_NOT_CONFIRMED',execution_started:false,new_model_calls:0};let current;try{current=(await call({action:'read',id:job.id})).job;}catch{throw error;}const recovery=cliFailureRecovery(current);if(newCliTransportFailure(job,current,workflowStarted)&&['waiting_executor','awaiting_review','approved'].includes(current.status)&&recovery?.confirmed_no_result&&['cooldown','ready'].includes(recovery.state))return{status:'text-cli-deferred',job_id:job.id,reason:recovery.code,next_retry_at:recovery.next_retry_at,model_result_unknown:false,execution_started:true,new_paid_calls:0,automatic_trigger:false};throw error;}return {status:'finite-workflow-returned',job_id:job.id,source_sha256:receipt.sha256,automatic_trigger:false,scope:'Workflow stops at human decision, bounded rework, or unsupported media; not a wake daemon'};
}
async function runChild(config){return boundedWorkflowChild(config)}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(await dispatch(JSON.parse(await input()))))}finally{process.stdin.removeAllListeners('end');process.stdin.destroy()}}
