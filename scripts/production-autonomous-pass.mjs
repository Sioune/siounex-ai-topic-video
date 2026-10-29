import {executorFetch as fetch} from './native-production-transport.mjs';
import {WORKSTATION_FLOW,waitForFlowActivity} from './production-flow-lifecycle.mjs';
import {isTitleRuntimeRecoveryCandidate} from '../lib/private-title-recovery-selection.mts';
import {createNativeVoice} from './native-speech-bridge.mjs';
import {createStudioPreviewVoice} from './heygen-studio-preview-bridge.mjs';
import {runAutomaticClone} from './automatic-clone-consumer.mjs';
import{runUnattendedMedia}from'./unattended-media-executor.mjs';
import{writePeriodicResult,writePeriodicJobResult,safeFailure,writePeriodicWorkstationEvent,writePeriodicWorkstationSnapshot,safeWorkstationSnapshot}from'./periodic-diagnostics.mjs';
import {createProductionWorkstations,withProductionStation} from './production-workstations.mjs';
import{periodicBusinessResult}from'./native-site-token.mjs';
import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
import{runPreparation}from'./media-input-probe.mjs';
import {registerMissingPreparation} from './register-missing-preparation.mjs';
import {reconcileLocalCliFailure} from './reconcile-local-cli-failure.mjs';
import {runNativePreparation} from './native-preparation-consumer.mjs';
import {runPrivateReviewContinuation} from './private-review-continuation.mjs';
import {isResourcePreclaimCandidate} from './private-review-preclaim-failure.mjs';
import {isPreproductionNarrationCandidate} from '../lib/private-preproduction-selection.mts';
import {isMaterialAcquisitionResumeCandidate} from '../lib/private-material-acquisition-selection.mts';
import {isCaptionPaginationCandidate} from '../lib/private-caption-recovery-selection.mts';
import {isFrameBudgetRecoveryCandidate} from '../lib/private-frame-budget-selection.mts';
import {isWorkstationWaitCandidate} from '../lib/private-workstation-selection.mts';
import {nativeReconciliationHolds,completedSelectionReadbackCandidate} from '../lib/native-preclaim-reconciliation.mts';
import {recordPrivateStageFailure} from './private-stage-diagnostics.mjs';
import {authorizedLegacyPrivateRework} from '../lib/native-preparation-contract.mts';
import {runPostVideoPreparation} from './post-video-preparation-consumer.mjs';
// One admission pass for a native Scheduled agent. Admitted production drains
// naturally; only new selections stop at the patrol's admission boundary.
import fs from'node:fs';import path from'node:path';import{readHiddenJsonInput}from'./hidden-json-input.mjs';import{executorResponse,executorTimeoutMs}from'./executor-response.mjs';import{dispatch}from'./production-dispatch-executor.mjs';import{checkToolDemonstration}from'./tool-demonstration-preflight.mjs';
function resumableWaitingPrivate(h){
 if(h.binding?.scope!=='private-video'||!/^native_prep_[a-f0-9]{64}$/.test(h.queue_id||'')||!['queued','completed','blocked','claimed'].includes(h.status))return false;
 if(nativeReconciliationHolds(h.reconciliation))return completedSelectionReadbackCandidate(h)||['queued','blocked'].includes(h.status)&&h.lease_until==null&&h.reconciliation?.phase==='automatic-material-selection';
 if(h.status==='blocked'&&h.lease_until!=null||h.status==='claimed'&&(!Number.isSafeInteger(h.lease_until)||h.lease_until>Date.now()))return false;
 if(h.status==='claimed'&&!h.base_video&&!h.base_pending_video&&!h.checkpoint?.artifacts?.some(a=>a.kind==='local-file'&&a.file?.endsWith('/producer-receipt.json')))return false;
 const b=h.base_video,base=b&&Object.keys(b).length===3&&/^local_review_video_[a-f0-9]{64}$/.test(b.id||'')&&/^[a-f0-9]{64}$/.test(b.artifact_hash||'')&&Number.isSafeInteger(b.artifact_version)&&b.artifact_version>0;
 const knownVisual=h.status==='blocked'&&h.lease_until==null&&h.missing?.some(m=>String(m.detail||m.code||'').includes('Prepared actual frame count differs; never hand off a truncated plane'))===true;
 return h.status==='claimed'||!!base||knownVisual||isMaterialAcquisitionResumeCandidate(h)||isResourcePreclaimCandidate(h)||isPreproductionNarrationCandidate(h)||isTitleRuntimeRecoveryCandidate(h)||isCaptionPaginationCandidate(h)||isFrameBudgetRecoveryCandidate(h)||isWorkstationWaitCandidate(h)||h.status!=='queued'&&h.checkpoint?.artifacts?.some(a=>a.file?.endsWith('/producer-receipt.json'))===true;
}
function currentNodes(job){const latest=new Map();for(const m of job.milestones||[])if(m.revision===job.revision&&m.mode_epoch===job.mode_epoch&&(!latest.has(m.node)||Number(m.artifact_version||0)>Number(latest.get(m.node).artifact_version||0)))latest.set(m.node,m);return [...latest.values()].sort((a,b)=>a.node.localeCompare(b.node));}
function currentWorkflowRead(before,after){
 if(!after||after.id!==before.id||after.is_test||!Number.isSafeInteger(after.revision)||after.revision<before.revision||after.mode_epoch!==before.mode_epoch||after.contract_hash!==before.contract_hash||!['auto','node'].includes(after.review_mode)||after.review_mode!==before.review_mode||!Array.isArray(after.milestones)||!['waiting_executor','awaiting_review','approved','paused','failed','completed','cancelled'].includes(after.status))return false;
 if(after.status==='approved'&&(after.approved_revision!==after.revision||!/^[a-f0-9]{64}$/.test(after.approved_hash||'')||!['source','script'].every(node=>currentNodes(after).some(m=>m.node===node&&m.status==='approved'&&m.artifact_hash===after.approved_hash))))return false;
 return true;
}
const workflowIdentity=job=>JSON.stringify([job.status,job.revision,job.mode_epoch,job.approved_revision,job.approved_hash,job.updated_at,currentNodes(job).map(m=>[m.id,m.node,m.status,m.artifact_hash,m.artifact_version,m.updated_at])]);
const humanOrStopped=job=>!['waiting_executor','awaiting_review','approved','completed'].includes(job.status)||job.review_mode==='node'&&job.status!=='approved'&&job.status!=='completed'||currentNodes(job).some(m=>['awaiting_human','revise','paused'].includes(m.status));
function blockedDiagnostic(b){const result={job_id:b.job_id,reason:b.reason};for(const key of ['confirmed_no_result','result_unknown','http_status','next_retry_at','package_id','retry_state'])if(b[key]!==undefined)result[key]=b[key];return result;}
export async function autonomousPass(c,{call,execute=dispatch,prepare=runPreparation,consume=runNativePreparation,continuePrivate=runPrivateReviewContinuation,postVideo=runPostVideoPreparation,media=runUnattendedMedia,archiveCapability,postAsset,clone=runAutomaticClone,nativeVoice,studioPreviewVoice,renderClone,workstations,externalPending=()=>false,externalWake=()=>null,waitForActivity=waitForFlowActivity}={}){
 if(c.execute!==true)throw Error('Explicit authorized execute:true required');if(c.foreground_deadline_ms!==undefined&&(!Number.isFinite(c.foreground_deadline_ms)||c.foreground_deadline_ms<0))throw Error('Invalid inherited foreground deadline');if(c.admission_deadline_ms!==undefined&&(!Number.isFinite(c.admission_deadline_ms)||c.admission_deadline_ms<0))throw Error('Invalid production admission deadline');if(c.production_completion_policy!==undefined&&c.production_completion_policy!=='natural')throw Error('Invalid production completion policy');
 if(c.production_lifecycle!==undefined&&c.production_lifecycle!==WORKSTATION_FLOW)throw Error('Invalid production lifecycle');
 const flow=c.production_lifecycle===WORKSTATION_FLOW;if(flow&&c.production_completion_policy!=='natural')throw Error('Workstation flow requires natural stage completion');
 const origin='https://siounex-ai-topic-library.siounexzhao.chatgpt.site',start=Date.now(),natural=c.production_completion_policy==='natural',admissionDeadline=flow?Infinity:Math.min(start+600000,c.admission_deadline_ms??c.foreground_deadline_ms??Infinity),deadline=natural?Infinity:admissionDeadline,blocked=[],preparations=[],handoffs=[],consumption=[],productions=[],executions=[],jobResults=[],terminalResults=[];
 const runId=c.run_id||process.env.SIOUNEX_PERIODIC_RUN_ID,stations=workstations||createProductionWorkstations({deadline_ms:deadline,beforeStart:async({job_id})=>{const current=await call({action:'read',id:job_id});if(current.job?.status==='cancelled')throw Object.assign(Error('PRODUCTION_CANCELLED'),{code:'PRODUCTION_CANCELLED',job_id});},onEvent:event=>writePeriodicWorkstationEvent(runId,event),onState:state=>writePeriodicWorkstationSnapshot(runId,state)});
 const station=(name,id,fn)=>withProductionStation(stations,name,id,fn);let budgetDeferred=false,stopScheduling=false;
 // A failed/unknown native operation may advance its checkpoint version even
 // though it made no useful progress. Do not treat that version bump as a new
 // attempt during this same coordinator run; the next scheduled run can retry.
 const retryNextPass=new Set();
 const deferNativeFailure=(id,status)=>{if(['native-preparation-result-unknown','private-review-result-unknown','private-review-upload-result-unknown','private-review-upload-rejected','private-review-materials-blocked'].includes(status))retryNextPass.add(id);};
 const handoffResult=waiting=>{const all=[...handoffs,...waiting].filter((v,i,a)=>a.findIndex(x=>x.queue_id===v.queue_id)===i),first=all[0];return {status:all.length?'needs-native-handoff':'private-review-production-returned',job_id:first?.job_id||productions[0]?.job_id,queue_id:first?.queue_id,handoff_status:first?.status,waiting_for:first?.waiting_for,missing:first?.missing||[],handoffs:all,preparations,productions,executions,blocked,claimed:consumption.some(v=>v.claimed===true),generation_started:productions.some(v=>v.generation_started===true),automatic_editor_launch:false,new_paid_calls:0,publication_authorized:false};};
 if(!call)call=async b=>executorResponse(await fetch(origin+'/api/executor',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+c.token},body:JSON.stringify(b),redirect:'error',signal:AbortSignal.timeout(executorTimeoutMs(b.action,deadline))}));
 if(c.native_voice_bridge===true&&nativeVoice===undefined)nativeVoice=createNativeVoice({root:process.cwd(),deadline_ms:deadline});
 if(c.native_voice_bridge===true&&studioPreviewVoice===undefined)studioPreviewVoice=createStudioPreviewVoice({root:process.cwd(),deadline_ms:deadline,call,readPreparedOwner:async({job_id})=>{
  if(!/^job_[a-f0-9-]{36}$/.test(job_id||''))throw Error('STUDIO_PREPARED_OWNER_JOB_INVALID');
  if(Date.now()+5000>=deadline)return null;
  // Authenticated identity metadata only; this never starts or retries media.
  const [owned,clone]=await Promise.all([call({action:'read',id:job_id}),call({action:'automatic_clone_read',id:job_id})]);
  if(owned.job?.id!==job_id||clone.request?.job_id!==job_id)throw Error('STUDIO_PREPARED_OWNER_READ_CHANGED');
  return{job:owned.job,request:clone.request,authenticated_owner_scope:true};
 }});
 if(c.native_voice_bridge===true&&renderClone===undefined)renderClone=async input=>{const renderer=await import('./automatic-clone-render.mjs');return renderer.renderClone({...input,call});};
 const recordJob=(selection,result)=>{writePeriodicJobResult(c.run_id||process.env.SIOUNEX_PERIODIC_RUN_ID,{phase:'job-returned',job_id:selection.job.id,revision:selection.job.revision,mode_epoch:selection.job.mode_epoch,kind:selection.kind||'native-preparation-handoff',queue_id:result.queue_id,package_id:result.package_id,plan_id:result.plan_id,stage:result.stage,status:result.status,confirmed_no_result:result.confirmed_no_result,result_unknown:result.result_unknown,http_status:result.http_status,execution_phase:result.phase,failure:result.failure||(result.error?{...safeFailure({message:result.error}),phase:result.phase}:undefined),claimed:result.claimed,generation_started:result.generation_started,audio_generated:result.audio_generated,video_generated:result.video_generated,retry_without_reconciliation:result.retry_without_reconciliation,claim_state:result.claim_state,generation_state:result.generation_state,next_retry_at:result.next_retry_at});return result;};
 const isolatedNative=async(selection,fn)=>{try{return await fn(selection,{call,deadline_ms:deadline,workstations:stations});}catch(error){if(['PRODUCTION_CANCELLED','PRODUCTION_STATION_BUDGET_DEFERRED'].includes(error?.code))throw error;recordPrivateStageFailure(error,{run_id:c.run_id||process.env.SIOUNEX_PERIODIC_RUN_ID,job_id:selection.job.id});const failure={...safeFailure(error),phase:'native-preparation'},h=selection.native_preparation,q=h?.queue_id||h?.handoff?.queue_id;if(!/^native_prep_[a-f0-9]{64}$/.test(q||''))throw error;writePeriodicResult(c.run_id||process.env.SIOUNEX_PERIODIC_RUN_ID,{phase:'job-failed',job_id:selection.job.id,kind:'native-preparation-handoff',failure,reconciliation_required:true});return{status:h.binding?.scope==='private-video'?'private-review-result-unknown':'native-preparation-result-unknown',...(h.binding?.scope==='private-video'?{}:{generation_started:false}),job_id:selection.job.id,queue_id:q,failure,phase:'native-preparation',claim_state:'unknown',generation_state:'unknown',retry_without_reconciliation:false};}};
 const executeSelected=async selection=>{
  const j=selection.job;writePeriodicResult(c.run_id||process.env.SIOUNEX_PERIODIC_RUN_ID,{phase:'selected',job_id:j.id,revision:j.revision,mode_epoch:j.mode_epoch,kind:selection.kind});if(j.id==='job_00000000-0000-4000-8000-000000000003'||j.is_test)throw Error('Protected/test production exclusion violated');
   if(selection.kind==='cli-failure-reconciliation'){const result=await reconcileLocalCliFailure(selection,{call});recordJob(selection,result);executions.push(result);if(result.status==='cli-failure-reconciled')return{redispatch:true};blocked.push({job_id:j.id,reason:result.status,reconciliation_only:true});return;}
   if(selection.kind==='native-preparation-handoff'){const native=selection.native_preparation;if(!native||native.job_id!==j.id)throw Error('Exact native preparation handoff required');const privateVideo=native.binding?.scope==='private-video',result=await isolatedNative(selection,privateVideo?continuePrivate:consume);if(result.job_id!==j.id||!privateVideo&&result.generation_started!==false)throw Error('Native preparation return must bind its exact allowed scope');recordJob(selection,result);deferNativeFailure(j.id,result.status);consumption.push(result);if(privateVideo)productions.push(result);if(result.budget_exhausted===true&&result.resume_same_archives===true){if(!privateVideo)budgetDeferred=true;if(Date.now()+60000>=deadline){budgetDeferred=true;stopScheduling=true;}return;}if(result.status==='local-review-returned'){blocked.push({job_id:j.id,reason:'actual-private-video-awaiting-human',claimed:result.claimed===true});return {stage_complete:true};}if(result.status==='private-review-upload-rejected'){blocked.push({job_id:j.id,reason:result.status,detail:result.error,claimed:result.claimed===true});handoffs.push({job_id:j.id,queue_id:result.queue_id,status:'blocked',waiting_for:'local-return-contract-fix',missing:[{code:result.status,detail:result.error}],persisted:false});return;}if(['native-preparation-result-unknown','private-review-result-unknown','private-review-upload-result-unknown'].includes(result.status)){if(!/^native_prep_[a-f0-9]{64}$/.test(result.queue_id||''))throw Error('Unknown preparation result lacks its exact queue');blocked.push({job_id:j.id,reason:result.status,claimed:result.claimed===true,...(result.failure?{failure:result.failure}:{})});handoffs.push({job_id:j.id,queue_id:result.queue_id,status:'result-unknown',execution_state:'receipt-reconciliation-required',waiting_for:'original-session-receipt-reconciliation',missing:native.missing||[],persisted:false});return;}const saved=result.handoff?result:await call({action:'native_preparation_read',id:j.id});if(!saved.handoff?.queue_id)throw Error('Native preparation persistence unconfirmed');handoffs.push({job_id:j.id,...saved.handoff});return;}
   if(selection.kind==='automatic-clone'){
    // An approved ordinary video can prepare its own materials while the Studio
    // voice workstation is busy. Each stage independently rereads its plan and
    // the site guards bind uploads to that exact video; neither stage approves it.
    const next={...selection,kind:'post-video-preparation'},latest=(j.milestones||[]).filter(m=>m.node==='video'&&m.revision===j.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];let ordinary=false;try{ordinary=latest?.status==='approved'&&JSON.parse(latest.artifact).qa?.voice_kind==='ordinary-review';}catch{}
    const concurrent=j.review_mode==='node'&&j.status==='approved'&&ordinary&&['blocked','queued','cost_check_pending'].includes(selection.automatic_clone?.status)&&selection.automatic_clone?.reconciliation_only!==true;
    const preparePost=async()=>{if(Date.now()+60000>=deadline)return{status:'post-video-upload-deferred',job_id:j.id,phase:'after-clone-before-post-video-preparation',budget_exhausted:true,resume_same_archives:true,local_files_retained:true,generation_started:false,new_paid_calls:0,quality_approved:false,publication_authorized:false};try{const p=await postVideo(next,{call,deadline_ms:deadline,workstations:stations});if(p?.job_id!==j.id)throw Error('POST_VIDEO_RETURNED_OTHER_JOB');return p;}catch(error){return{status:'post-video-preparation-failed',job_id:j.id,phase:'post-video-preparation',failure:safeFailure(error),local_files_retained:true,retry_without_reconciliation:false,generation_state:'unknown',new_paid_calls:0,quality_approved:false,publication_authorized:false};}};
    const early=concurrent?preparePost():null;let result;try{result=await clone(selection,{call,nativeVoice,studioPreviewVoice,renderClone,deadline_ms:deadline,workstations:stations});}catch(error){if(early)await early;throw error;}if(result.job_id!==j.id){if(early)await early;throw Error('AUTOMATIC_CLONE_RETURNED_OTHER_JOB');}recordJob(selection,result);productions.push({...result,stage:'automatic-clone'});blocked.push({job_id:j.id,reason:result.status,claimed:result.claimed===true});
    const recordPost=prepared=>{recordJob(next,prepared);productions.push({...prepared,stage:'post-video-preparation',after_clone_request_id:result.request_id});if(prepared.status!=='post-video-prepared')blocked.push({job_id:j.id,reason:prepared.status,phase:prepared.phase,claimed:false,...(prepared.budget_exhausted===true?{budget_exhausted:true}:{}),...(prepared.failure?{failure:prepared.failure}:{})});};
    if(early)recordPost(await early);
    // A newly returned voice version needs its own correctly bound materials.
    if(result.status==='automatic-clone-awaiting-second-review'||!early&&result.status==='automatic-clone-native-handoff-required'&&result.claimed===false&&result.generation_started===false)recordPost(await preparePost());
    return;
   }
   if(selection.kind==='post-video-preparation'){const result=await postVideo(selection,{call,deadline_ms:deadline,workstations:stations});if(result.job_id!==j.id)throw Error('Post-video preparation returned another job');recordJob(selection,result);productions.push(result);if(result.budget_exhausted===true&&result.resume_same_archives===true){if(Date.now()+60000>=deadline){budgetDeferred=true;stopScheduling=true;return;}blocked.push({job_id:j.id,reason:result.status,phase:result.phase,claimed:false,budget_exhausted:true});return;}blocked.push({job_id:j.id,reason:result.status,claimed:false});return;}
   if(selection.kind==='preparation-registration'){await station('preparation',j.id,()=>registerMissingPreparation(selection,{call}));return {redispatch:true};}
  if(['voice-cost-check','voice-replacement'].includes(selection.kind)){const result={status:'native-voice-handoff-required',job_id:j.id,request_id:selection.voice_request_id,kind:selection.kind,claimed:false,reason:'The current voice request needs its connected native session; retain it and continue independent work.'};recordJob(selection,result);productions.push(result);blocked.push({job_id:j.id,reason:result.status,claimed:false});return;}if(selection.kind==='preparation'){const result=await station('preparation',j.id,()=>prepare(selection,{call,deadline_ms:deadline}));preparations.push({...result,job_id:j.id});return {redispatch:!!selection.stage_id&&result.persisted===true};}
  const folder=path.resolve('.sites-runtime/authorized-inputs',j.id,'revision-'+j.revision),manifest=path.join(folder,'ready.json');let ready=null;if(fs.existsSync(manifest)){ready=JSON.parse(fs.readFileSync(manifest));if(ready.revision!==j.revision||ready.mode_epoch!==j.mode_epoch||ready.contract_hash!==j.contract_hash)throw Error('Approved local input manifest stale; no execution');}
  let brief=null,briefFile=ready?.production_brief_file;if(briefFile){const actual=fs.realpathSync(briefFile);if(!actual.startsWith(fs.realpathSync(process.cwd())+path.sep))throw Error('Brief outside authorized checkout');brief=JSON.parse(fs.readFileSync(actual));}
  if(j.intake){
   if(j.intake.text_authorized!==true||j.intake.contract_hash!==j.contract_hash)throw Error('No current Site text authorization');
   const siteDir=path.resolve('.sites-runtime','site-intake-inputs',j.id,j.intake.command_hash);fs.mkdirSync(siteDir,{recursive:true});
   briefFile=path.join(siteDir,'site-brief.json');brief={evidence:[],images:[],user_requirements:{stage:'Site-confirmed text and storyboard only; return to human; rights_pending forbids media and publication',goal:j.intake.proposal.goal,site_instruction:j.intake,media_reports:j.intake.proposal.media,limits:'Material reports are recorded by remote producer; do not claim local audiovisual inspection or independent latency tests'}};fs.writeFileSync(briefFile,JSON.stringify(brief,null,2));
  }

  if(selection.kind==='media'){
   const op=j.operations.find(x=>x.id===selection.operation_id);if(op?.node==='video'){const material=await checkToolDemonstration(j,brief);if(material.blocked){blocked.push({job_id:j.id,reason:'continuous-tool-demonstration-missing',problems:material.problems,claimed:false});return;}}if(!op||JSON.parse(op.plan).cost!==0)throw Error('No exact zero-new-fee media operation');if(!ready?.input_root||ready.script_hash!==op.script_hash||ready.operation_id!==op.id||ready.input_hash!==op.input_hash||ready.media_scope_id!==JSON.parse(op.plan).media_scope_id){const receipt=await call({action:'executor_media_block',id:j.id,operation_id:op.id,input_hash:op.input_hash,code:'READY_MANIFEST_MISSING'});blocked.push({job_id:j.id,reason:'exact-authorized-input-root-missing',claimed:false,persisted:receipt.persisted});return;}let capability=archiveCapability; if(capability===undefined){try{const probe=JSON.parse(fs.readFileSync('.sites-runtime/native-library-archive-capability.json'));capability=probe.available===true&&probe.schema==='actual-native-library-save-v1'&&probe.library_file_id?.startsWith('libfile_');}catch{capability=false;}}const cachedHandoff=fs.existsSync(path.resolve('.sites-runtime/media-operations',op.id,'library-handoff.json'));if(capability!==true&&!cachedHandoff){const receipt=await call({action:'executor_media_block',id:j.id,operation_id:op.id,input_hash:op.input_hash,code:'NATIVE_LIBRARY_NOT_EXPOSED'});blocked.push({job_id:j.id,reason:'native-library-not-exposed',claimed:false,persisted:receipt.persisted});return;}if(op.node==='video'&&JSON.parse(op.plan).delivery_assets!=='video-only'){const receipt=await call({action:'executor_media_block',id:j.id,operation_id:op.id,input_hash:op.input_hash,code:'PREPARED_BATCH_REQUIRED'});blocked.push({job_id:j.id,reason:'prepared-library-batch-required',claimed:false,persisted:receipt.persisted});return;}
   const inputRoot=fs.realpathSync(ready.input_root);if(!inputRoot.startsWith(fs.realpathSync(process.cwd())+path.sep))throw Error('Media input root outside authorized checkout');for(const input of JSON.parse(op.plan).inputs){const file=fs.realpathSync(path.resolve(inputRoot,input.file));if(!file.startsWith(inputRoot+path.sep)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==input.sha256)throw Error('Frozen media input changed before claim');}const result=await media({job:j,operation:op,inputRoot,deadline},{call,workstations:stations,postAsset:postAsset|| (async b=>executorResponse(await fetch(origin+'/api/publicity-assets',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+c.token},body:JSON.stringify(b),redirect:'error',signal:AbortSignal.timeout(30000)})))});recordJob(selection,result);return {terminal:{status:'unattended-media-returned',job_id:j.id,result,after:result.budget_exhausted===true?j:(await call({action:'read',id:j.id})).job,blocked,executions}};
  }
 const result=await station(selection.kind==='promotion-package'?'copy':'preparation',j.id,()=>execute({...c,execute:true,production_brief_file:briefFile,cover_file:ready?.cover_file,materialize_linked_images:true,...(natural?{admission_deadline_ms:flow?undefined:admissionDeadline}:{}),foreground_deadline_ms:natural?undefined:deadline},{call,selection}));recordJob(selection,result);
  if(result.status==='text-workflow-budget-deferred'){
   if(Date.now()+60000>=deadline){budgetDeferred=true;stopScheduling=true;return;}
   blocked.push({job_id:j.id,reason:result.status,phase:result.phase,claimed:false,reconciliation_only:false});return;
  }
  if(result.status==='review-result-reconciliation-required'){blocked.push({job_id:j.id,reason:result.status,claimed:false,reconciliation_only:true});return;}
  if(selection.kind==='promotion-package'&&result.status==='promotion-technical-retry-pending'&&result.confirmed_no_result===true&&result.result_unknown===false&&result.retry_state?.result_unknown===false&&(result.retry_state.known_retryable===true||result.retry_state.exhausted===true)){blocked.push({job_id:j.id,reason:result.status,claimed:false,reconciliation_only:false,package_id:result.package_id,confirmed_no_result:true,result_unknown:false,http_status:result.http_status,next_retry_at:result.next_retry_at||result.retry_state.retry_after_at||null,retry_state:result.retry_state});return;}
  if(selection.kind==='promotion-package'&&result.model_calls===0&&['promotion-result-unknown','promotion-invalid-result','promotion-original-session-pending'].includes(result.status)){blocked.push({job_id:j.id,reason:result.status,claimed:false,reconciliation_only:true,package_id:selection.package_id});return;}
  if(result.status==='text-cli-deferred'){blocked.push({job_id:j.id,reason:result.reason,next_retry_at:result.next_retry_at,claimed:true,reconciliation_only:false});return;}
  if(result.status==='needs-source-input'){blocked.push({job_id:j.id,reason:result.reason||'source-unavailable',...(result.diagnostic?{diagnostic:result.diagnostic}:{}),claimed:false,persisted:result.persisted});return;}
  const after=(await call({action:'read',id:j.id})).job;
  // Only durable, current success may re-enter the central dispatcher. That
  // dispatcher owns the next authorized stage; no producer is called directly.
  if(['text','review','review-output-reconciliation'].includes(selection.kind)&&result.status==='finite-workflow-returned'&&currentWorkflowRead(j,after)){
   const progressed=workflowIdentity(j)!==workflowIdentity(after);
   if(progressed){executions.push({job_id:j.id,kind:selection.kind,status:result.status,revision:after.revision,mode_epoch:after.mode_epoch,persisted:true});terminalResults.push({status:'bounded-pass-returned',job_id:j.id,result,after:{id:after.id,status:after.status,revision:after.revision}});}
   if(humanOrStopped(after)||!progressed)blocked.push({job_id:j.id,reason:humanOrStopped(after)?'current-human-decision-or-stop':'workflow-state-unchanged',claimed:false});
   return {redispatch:progressed&&!humanOrStopped(after)};
  }
  if(selection.kind==='promotion-package'&&result.status==='ready'&&currentWorkflowRead(j,after)){
   const saved=(await call({action:'promo_list',id:j.id})).packages?.find(p=>p.id===selection.package_id);
   if(result.package_id===selection.package_id&&saved?.status==='ready'&&saved.is_current===true&&saved.script_revision===after.revision&&saved.script_hash===after.approved_hash&&/^[a-f0-9]{64}$/.test(result.content_sha256||'')&&saved.content_hash===result.content_sha256){
    executions.push({job_id:j.id,kind:selection.kind,status:'ready',revision:after.revision,mode_epoch:after.mode_epoch,package_id:saved.id,content_sha256:saved.content_hash,persisted:true});
    if(humanOrStopped(after))blocked.push({job_id:j.id,reason:'current-human-decision-or-stop',claimed:false});
    return {redispatch:!humanOrStopped(after)};
   }
   return {terminal:{status:'bounded-pass-returned',job_id:j.id,result:{...result,status:'promotion-result-unknown',cached_output:true,retry_without_reconciliation:false},after,blocked,executions}};
  }
  return {terminal:{status:'bounded-pass-returned',job_id:j.id,result,after,blocked,executions}};
 };
 const executeWaiting=async selection=>{
  const {job,native_preparation:h}=selection,r=await isolatedNative(selection,continuePrivate);
  if(r.job_id!==h.job_id||r.queue_id!==h.queue_id||r.handoff&&r.handoff.queue_id!==h.queue_id)throw Error('Private continuation must bind its exact waiting queue');
  recordJob(selection,r);deferNativeFailure(job.id,r.status);productions.push(r);consumption.push(r);
  if(r.budget_exhausted===true&&r.resume_same_archives===true&&Date.now()+60000>=deadline){budgetDeferred=true;stopScheduling=true;}
  if(r.status==='private-review-upload-rejected'){blocked.push({job_id:job.id,reason:r.status,detail:r.error,claimed:r.claimed===true});handoffs.push({job_id:job.id,queue_id:h.queue_id,status:'blocked',waiting_for:'local-return-contract-fix',missing:[{code:r.status,detail:r.error}],persisted:false});}
  if(['private-review-result-unknown','private-review-upload-result-unknown'].includes(r.status)){blocked.push({job_id:job.id,reason:r.status,claimed:r.claimed===true,...(r.failure?{failure:r.failure}:{})});handoffs.push({job_id:job.id,queue_id:h.queue_id,status:'result-unknown',execution_state:'receipt-reconciliation-required',waiting_for:'original-session-receipt-reconciliation',missing:h.missing||[],persisted:false});}
  if(r.status==='local-review-returned')return {stage_complete:true};
 };
 // Selection stays serial. Only independent, already-authorized jobs overlap;
 // stage consumers own their workstation boundaries and revalidate their CAS.
 const active=new Map(),processed=new Set(),seen=new Set(),admittedJobs=new Set();let idle=null,waitingStarted=0,scanCount=0,dispatchFailure=null,eligibilityEpoch=0;
 const excluded=()=>[...new Set([...processed,...active.keys(),...retryNextPass,...(flow?[]:[...blocked.map(x=>x.job_id),...handoffs.map(x=>x.job_id)])])];
 const wake=()=>waitForActivity([...active.values()],{external:externalWake()});
 const nextCycle=()=>{processed.clear();waitingStarted=0;};
 const identity=selection=>JSON.stringify([selection.job.id,selection.kind||null,workflowIdentity(selection.job),selection.stage_id,selection.operation_id,selection.package_id,selection.voice_request_id,selection.native_preparation?.queue_id||selection.native_preparation?.handoff?.queue_id,flow?(selection.native_preparation?.handoff||selection.native_preparation)?.version:null,flow?(selection.native_preparation?.handoff||selection.native_preparation)?.reconciliation?.fingerprint:null]);
 const assertAllowed=job=>{if(!job?.id||job.id==='job_00000000-0000-4000-8000-000000000003'||job.is_test)throw Error('Protected/test production exclusion violated');};
 const launch=(selection,waiting=false)=>{
  const id=selection.job.id;admittedJobs.add(id);processed.add(id);seen.add(identity(selection));
  // Keep rejection handlers on every job immediately; no detached production
  // survives pass completion, an exception, or a scheduler budget decision.
  const promise=Promise.resolve().then(()=>waiting?executeWaiting(selection):executeSelected(selection)).then(outcome=>{
   if(outcome?.terminal)terminalResults.push(outcome.terminal);
   if(flow&&outcome?.stage_complete){processed.delete(id);eligibilityEpoch++;}
   else if(outcome?.redispatch&&!blocked.some(x=>x.job_id===id)&&!handoffs.some(x=>x.job_id===id)&&processed.delete(id))eligibilityEpoch++;
   jobResults.push({job_id:id,kind:selection.kind||'native-preparation-handoff',status:outcome?.terminal?.result?.status||outcome?.terminal?.status||'stage-settled'});
  }).catch(error=>{
   if(error?.code==='PRODUCTION_CANCELLED'){jobResults.push({job_id:id,kind:selection.kind,status:'production-cancelled'});writePeriodicJobResult(runId,{phase:'job-returned',job_id:id,kind:selection.kind,status:'production-cancelled'});return;}
   const failure=safeFailure(error),deferred=error?.code==='PRODUCTION_STATION_BUDGET_DEFERRED';
   const status=deferred?'scheduled-budget-deferred':'scheduled-pass-failed';
   if(deferred){budgetDeferred=true;stopScheduling=true;}
   if(!deferred){if(selection.kind==='native-preparation-handoff')retryNextPass.add(id);blocked.push({job_id:id,reason:status,failure,reconciliation_only:true,claim_state:'unknown',generation_state:'unknown',retry_without_reconciliation:false});}
   jobResults.push({job_id:id,kind:selection.kind||'native-preparation-handoff',status,...(!deferred?{failure,claim_state:'unknown',generation_state:'unknown'}:{budget_exhausted:true}),retry_without_reconciliation:false});
   writePeriodicJobResult(runId,{phase:deferred?'job-returned':'job-failed',job_id:id,kind:selection.kind,status,...(!deferred?{failure,reconciliation_required:true,claim_state:'unknown',generation_state:'unknown'}:{budget_exhausted:true}),retry_without_reconciliation:false});
  }).finally(()=>active.delete(id));
  active.set(id,promise);
 };
 try{
  while((flow||scanCount<16)&&!stopScheduling&&Date.now()+60000<admissionDeadline){
   if(flow&&excluded().length>=48){if(retryNextPass.size>=48){stopScheduling=true;break;}await wake();nextCycle();}
   const dispatchEpoch=eligibilityEpoch;let selection;try{selection=await call({action:'dispatch_next',exclude_job_ids:excluded()});}catch(error){if(!flow||!active.size&&!externalPending())throw error;writePeriodicJobResult(runId,{phase:'failed',status:'scheduled-pass-failed',failure:safeFailure(error)});await wake();nextCycle();continue;}scanCount++;if(selection.executor_reload_required){stopScheduling=true;break;}
   if(stopScheduling||Date.now()+60000>=admissionDeadline){if(!natural)budgetDeferred=true;break;}
   if(!selection.job){
    idle=selection;if(eligibilityEpoch!==dispatchEpoch)continue;const waiting=selection.native_preparation_waiting||[];
    for(const h of waiting){
     if(waitingStarted>=2||!flow&&admittedJobs.size>=16||stopScheduling||Date.now()+60000>=admissionDeadline)break;
     if(excluded().includes(h.job_id)||!resumableWaitingPrivate(h))continue;
     const {job}=await call({action:'read',id:h.job_id});if(stopScheduling||Date.now()+60000>=admissionDeadline){if(!natural)budgetDeferred=true;break;}if(!job||job.id!==h.job_id)throw Error('Exact waiting native preparation job required');assertAllowed(job);
     if(job.id==='job_00000000-0000-4000-8000-000000000004'&&!authorizedLegacyPrivateRework(job))throw Error('Protected/test production exclusion violated');
     const candidate={job,kind:'native-preparation-handoff',native_preparation:h};if(seen.has(identity(candidate)))continue;
     waitingStarted++;launch(candidate,true);
    }
    // This idle read may have excluded a stage which became durably eligible
    // while the request was in flight. Refresh once for that new evidence,
    // instead of waiting for an unrelated slow workstation to finish.
    if(eligibilityEpoch!==dispatchEpoch)continue;
    if(flow&&(active.size||externalPending())){await wake();nextCycle();continue;}
    if(active.size){await Promise.race(active.values());continue;}
    break;
   }
   assertAllowed(selection.job);const id=selection.job.id;
   if(!flow&&!admittedJobs.has(id)&&admittedJobs.size>=16)break;
   if(excluded().includes(id)||seen.has(identity(selection))){if(flow){processed.add(id);continue;}if(!active.size)break;await new Promise(resolve=>setImmediate(resolve));continue;}
   launch(selection);
   // Let immediately settled read-only stages publish their durable next-stage
   // eligibility, while a real provider/render/upload wait never blocks polling.
   await new Promise(resolve=>setImmediate(resolve));
  }
 }catch(error){dispatchFailure=error;}
 finally{await Promise.allSettled([...active.values()]);await stations.drain();}
 if(dispatchFailure)throw dispatchFailure;
 const waiting=idle?.native_preparation_waiting||[],remaining=waiting.filter(h=>!handoffs.some(p=>p.queue_id===h.queue_id)&&!productions.some(p=>p.job_id===h.job_id&&p.status==='local-review-returned')).map(h=>{const p=productions.findLast(p=>p.job_id===h.job_id&&p.handoff?.queue_id===h.queue_id);return p?{job_id:h.job_id,...p.handoff}:h});
 let result=handoffs.length||remaining.length||productions.length?{...handoffResult(remaining),...(terminalResults.at(-1)||{})}:terminalResults.at(-1)||{status:idle?(preparations.length?'preparation-pass-returned':'idle-or-blocked'):'bounded-scan-limit',preparations,executions,blocked,reason:idle?.reason||null,automatic_trigger:'Must be corroborated by native schedule run, not this field'};
 if(budgetDeferred||!natural&&Date.now()+60000>=admissionDeadline)result={...result,status:'scheduled-budget-deferred'};
 result={...result,preparations,executions,blocked,...(natural?{production_completion_policy:'natural',...(flow?{production_lifecycle:WORKSTATION_FLOW,dispatch_lifecycle:'continuous-station-and-stage-wake',admission_boundary_used:false}:{}),admission_closed:!flow&&Date.now()+60000>=admissionDeadline}:{}),...(productions.length?{productions}:{}),...(terminalResults.length?{terminal_results:terminalResults}:{}),job_results:jobResults,dispatch_count:scanCount,workstations:safeWorkstationSnapshot(stations.snapshot())};
 writePeriodicResult(runId,{...autonomousPassDiagnostics(result),reason:result.reason||idle?.reason||null});return result;
}
export function autonomousPassDiagnostics(result){const business=periodicBusinessResult(result);return{phase:'returned',status:result.status,...(result.production_completion_policy==='natural'?{production_completion_policy:'natural',...(result.production_lifecycle===WORKSTATION_FLOW?{production_lifecycle:WORKSTATION_FLOW,dispatch_lifecycle:result.dispatch_lifecycle,admission_boundary_used:false}:{}),admission_closed:result.admission_closed===true}:{}),job_id:result.job_id||null,queue_id:result.queue_id||null,handoff_status:result.handoff_status||null,waiting_for:result.waiting_for||null,missing:result.missing||[],revision:result.after?.revision||null,reason:result.reason||null,blocked:result.blocked?.map(blockedDiagnostic)||[],executions:business.executions||[],preparations:result.preparations?.map(x=>({job_id:x.job_id,stage_id:x.stage_id,status:x.status,persisted:x.persisted===true}))||[],...(Array.isArray(result.handoffs)?{handoffs:business.handoffs||result.handoffs}:{}),...(Array.isArray(result.productions)?{productions:business.productions||[]}:{}),claimed:business.claimed===true,generation_started:business.generation_started===true,audio_generated:business.audio_generated===true,video_generated:business.video_generated===true,completed:business.completed,in_progress:business.in_progress===true,completed_meaning:'single-bounded-pass-returned; not quality approval',quality_approved:false,publication_authorized:false,business_outcome:business.outcome,...(Array.isArray(business.job_results)?{job_results:business.job_results}:{}),...(result.workstations?{workstations:safeWorkstationSnapshot(result.workstations)}:{})};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){let runId=process.env.SIOUNEX_PERIODIC_RUN_ID;try{const c=JSON.parse(await readHiddenJsonInput());runId=c.run_id||runId;process.stdin.destroy();const result=await autonomousPass({...c,native_voice_bridge:true});writePeriodicResult(c.run_id||process.env.SIOUNEX_PERIODIC_RUN_ID,autonomousPassDiagnostics(result));console.log(JSON.stringify(result))}catch(e){writePeriodicResult(runId,{phase:'failed',failure:safeFailure(e)});console.error(e.message);process.exitCode=1;}}
