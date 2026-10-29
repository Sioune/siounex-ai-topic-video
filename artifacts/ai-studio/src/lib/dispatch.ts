import {currentJobV6Outro} from './outro-upgrade-contract.mts';
import {isCompletedPrivateReturnHandoff,completedPrivateReturnCandidate} from './private-return-selection.mts';
import {isTitleRuntimeRecoveryCandidate} from './private-title-recovery-selection.mts';
import {cliContentCountSql,cliTransportRecoveryCandidate} from './cli-content-budget.mts';
import {currentPrivateRenderTarget} from './pending-technical-refresh.mts';
import {reviewOutputRecoveryCandidate} from './review-output-recovery.mts';
import {nativeReconciliationHolds} from './native-preclaim-reconciliation.mts';
import {isPreproductionNarrationCandidate} from './private-preproduction-selection.mts';
import {isCaptionPaginationCandidate} from './private-caption-recovery-selection.mts';
import {isFrameBudgetRecoveryCandidate} from './private-frame-budget-selection.mts';
import {isNarrationFitRecoveryCandidate} from './private-narration-fit-selection.mts';
import {isWorkstationWaitCandidate} from './private-workstation-selection.mts';
import {authorizedLegacyPrivateRework} from './native-preparation-contract.mts';
import {nextPostVideoPreparation} from './post-video-preparation';
import {cliReadySql} from './cli-failure-contract.mts';
import {nextAutomaticClone} from './automatic-clone';
import{nextVoiceReplacement}from'./voice-replacement';
import {claimableQueuedPromo,reconcilablePromo} from './promo-packages';
import {nextAutomaticPrivatePreparation} from './automatic-private-production';
import {legacyApprovedProductionCandidate} from './approved-production-policy.mts';
import {cliFailureReconciliationBinding} from './cli-reconciliation-selection.mts';
import {nextNativePreparationHandoff,listWaitingNativePreparationHandoffs} from './native-preparation-handoff';
import {INTAKE_TEXT_GUARD_SQL} from './production-intake';
import {CURRENT_FEEDBACK_GUARD_SQL} from './script-feedback-contract';
import {db} from './store';
import {getJob} from './production';
import {hash,ProductionError} from './production-contract';
import {sourceReaderFor} from './source-reader-policy.mts';
import {extractSourceArticle} from './source-document.mts';
import {CURRENT_MEDIA_OPERATION_SQL,currentMediaOperation} from './current-media-operation';
import {normalizeUrl,readSourceDocument} from './feed';
import {readProvidedSource} from './source-input';
import {materializedResearch} from './research';
import {materializedOriginal} from './originals';
import {CURRENT_PREPARATION_QUEUE_SQL,PREPARATION_REGISTRATION_EXCLUSIONS,PREPARATION_REGISTRATION_SQL,preparationRegistrationBinding} from './preparation-registration-contract.mts';
const excludedJob='job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee';
// Explicit owner instruction: AI Chongzhen remains paused until the owner
// provides the real opposite-edict gameplay comparison. This exact hold is
// independent of generic missing-media state and preserves every old receipt.
export const OWNER_PAUSED_PRODUCTION_JOB_IDS=['job_3c14fe6f-44b0-472c-8455-e75040b695bb'] as const;
// Selection is read-only. Actual claim/review/operation CAS remains authoritative.
export async function nextWork(testId?:string,excludeIds:string[]=[]){
 if(excludeIds.length>64||excludeIds.some(id=>!/^job_[a-f0-9-]{36}$/.test(id)))throw new ProductionError('跳过范围无效',400);
 const legacyId=PREPARATION_REGISTRATION_EXCLUSIONS[0],legacy=!testId&&!excludeIds.includes(legacyId)?await db().prepare(`SELECT j.id,j.owner_id,j.status FROM production_jobs j WHERE j.id=? AND j.is_test=0 AND (j.status='approved' OR (j.status='waiting_executor' AND EXISTS(SELECT 1 FROM production_reviews q WHERE q.job_id=j.id AND q.revision=j.revision AND q.decision='script_feedback_rework') AND ${CURRENT_FEEDBACK_GUARD_SQL}))`).bind(legacyId).first<{id:string;owner_id:string;status:string}>():null;
 // A current owner-bound script feedback queue is text work, not permission
 // to reuse invalidated source/script approvals or resume the old video.
 const legacyJob=legacy?{...await getJob(legacy.id),owner_id:legacy.owner_id}:null,legacyRework=legacy?.status==='waiting_executor'||!!legacyJob&&(authorizedLegacyPrivateRework(legacyJob)||legacyApprovedProductionCandidate(legacyJob)),skipIds=[...new Set([...excludeIds,...OWNER_PAUSED_PRODUCTION_JOB_IDS,...(legacyRework?[]:[legacyId])])],exclude=skipIds.length?` AND j.id NOT IN (${skipIds.map(()=>'?').join(',')})`:'';
 // Give one retained narration recovery the fresh foreground budget. Later
 // picks keep the existing order so slow Studio readbacks cannot starve a
 // known local continuation, and recoveries cannot repeatedly jump the queue.
 if(!testId&&!excludeIds.length){for(const native of await listWaitingNativePreparationHandoffs(skipIds)){if(isNarrationFitRecoveryCandidate(native))return {job:await getJob(native.job_id),kind:'native-preparation-handoff',native_preparation:native,reconciliation_only:true,automatic_trigger:false,execution_started:false,new_paid_calls:0};}}
 // A returned owner-voice video finishes its existing preparation before a
 // different Studio clone consumes the next foreground budget. No approval.
 if(!testId){const post=await nextPostVideoPreparation(skipIds,true);if(post)return post;}
 if(!testId){for(const native of await listWaitingNativePreparationHandoffs(skipIds)){if(nativeReconciliationHolds(native.reconciliation)||!isCompletedPrivateReturnHandoff(native))continue;const job=await getJob(native.job_id);if(completedPrivateReturnCandidate(job,native))return{job,kind:'native-preparation-handoff',native_preparation:native,reconciliation_only:true,automatic_trigger:false,execution_started:false,new_paid_calls:0};}}
 if(!testId){const clone=await nextAutomaticClone(skipIds);if(clone)return clone;}
 if(!testId){const rows=(await db().prepare(`SELECT j.id FROM production_jobs j WHERE j.id!=? AND j.is_test=0 ${exclude} AND j.status='failed' AND j.review_mode='auto' AND CASE WHEN json_valid(j.checkpoint) THEN json_extract(j.checkpoint,'$.cli_failure.code')='CLI_MODEL_DISCOVERY_FAILED' ELSE 0 END ORDER BY j.updated_at,j.id LIMIT 16`).bind(excludedJob,...skipIds).all<{id:string}>()).results;for(const row of rows){const job=await getJob(row.id),binding=cliFailureReconciliationBinding(job);if(binding)return{job,kind:'cli-failure-reconciliation',cli_failure_reconciliation:{binding},reconciliation_only:true,automatic_trigger:false,execution_started:false,new_model_calls:0,new_paid_calls:0};}}
 // A server-accepted zero-result transport failure may have hit the former raw counter cap.
 // Selection is a hint only: the normal executor must win the exact metadata-resume CAS.
 const transport=(await db().prepare(`SELECT j.id FROM production_jobs j WHERE j.id!=? AND ${testId?'j.is_test=1 AND j.id=?':'j.is_test=0'} ${exclude} AND j.status IN ('paused','failed') AND j.review_mode='auto' AND substr(j.error,1,length('CLI_RATE_LIMITED'))='CLI_RATE_LIMITED' ORDER BY j.updated_at,j.id LIMIT 16`).bind(excludedJob,...(testId?[testId]:[]),...skipIds).all<{id:string}>()).results;
 for(const row of transport){const job=await getJob(row.id),binding=cliTransportRecoveryCandidate(job);if(binding)return{job,kind:binding.review_milestone_id?'review':'text',milestone_id:binding.review_milestone_id||undefined,cli_transport_recovery:binding,automatic_trigger:false,execution_started:false,new_model_calls:0};}
 // Reconcile already completed review output before starting slow media work.
 const interrupted=(await db().prepare(`SELECT j.id FROM production_jobs j WHERE j.id!=? AND ${testId?'j.is_test=1 AND j.id=?':'j.is_test=0'} ${exclude} AND j.status='paused' AND j.review_mode='auto' AND (substr(j.error,1,length('Cannot approve script with blocked text preflight:'))='Cannot approve script with blocked text preflight:' OR j.error='NATIVE_PRODUCTION_TOOL_FAILED') AND j.ai_calls>=1 AND j.reworks<=2 ORDER BY j.updated_at,j.id LIMIT 16`).bind(excludedJob,...(testId?[testId]:[]),...skipIds).all<{id:string}>()).results;
 for(const row of interrupted){const job=await getJob(row.id),m=reviewOutputRecoveryCandidate(job);if(m)return {job,kind:'review-output-reconciliation',milestone_id:m.id,reconciliation_only:true,automatic_trigger:false,new_model_calls:0};}
 if(!testId){const waiting=await listWaitingNativePreparationHandoffs(skipIds);for(const native of waiting){if(!nativeReconciliationHolds(native.reconciliation)&&(isWorkstationWaitCandidate(native)||isPreproductionNarrationCandidate(native)||isTitleRuntimeRecoveryCandidate(native)||isCaptionPaginationCandidate(native)||isFrameBudgetRecoveryCandidate(native)||native.binding?.scope==='private-video'&&native.base_pending_video&&native.status==='claimed'&&Number.isSafeInteger(native.lease_until)&&Number(native.lease_until)>0&&Number(native.lease_until)<=Date.now()))return {job:await getJob(native.job_id),kind:'native-preparation-handoff',native_preparation:native,reconciliation_only:true,automatic_trigger:false,execution_started:false,new_paid_calls:0};}}
 if(!testId&&!excludeIds.length){const voice=await nextVoiceReplacement();if(voice&&!skipIds.includes(voice.job.id)&&!PREPARATION_REGISTRATION_EXCLUSIONS.some(id=>id===voice.job.id))return voice;}
 if(!testId){const auto=await nextAutomaticPrivatePreparation(skipIds);if(auto)return auto;}
 const preparation=await db().prepare(`SELECT s.id,s.job_id FROM production_stages s JOIN production_jobs j ON j.id=s.job_id JOIN app_state a ON a.key='media_scope_v1:'||j.id WHERE j.id!=? AND ${testId?'j.is_test=1 AND j.id=?':'j.is_test=0'} ${exclude} AND ${CURRENT_PREPARATION_QUEUE_SQL} ORDER BY s.updated_at,s.id LIMIT 1`).bind(excludedJob,...(testId?[testId]:[]),...skipIds).first<{id:string;job_id:string}>();if(preparation)return {job:await getJob(preparation.job_id),kind:'preparation',stage_id:preparation.id,automatic_trigger:false};
 // A current unreviewed technical replacement must precede publicity for its
 // old SHA. Reuse only the proven original producer queue; no synthetic rework.
 if(!testId){const waiting=await listWaitingNativePreparationHandoffs(skipIds);for(const native of waiting){if(!native.base_pending_video||!['completed','blocked'].includes(native.status)||native.lease_until!=null||nativeReconciliationHolds(native.reconciliation))continue;const job=await getJob(native.job_id),m=job.milestones.filter(m=>m.node==='video'&&m.revision===job.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];let qa:any;try{qa=JSON.parse(m?.artifact||'null')?.qa}catch{continue}if(native.technical_noop_current||!qa||currentPrivateRenderTarget(qa.render_identity,{completed_pending_job:job})&&(qa.outro_version==='v6'||!!currentJobV6Outro(job)))continue;return {job,kind:'native-preparation-handoff',native_preparation:native,automatic_trigger:false,execution_started:false,new_paid_calls:0};}}
 // A current exact owner rejection is video work. Old publicity readback must
 // not exclude the entire job before its authorized next version can be selected.
 if(!testId){const native=await nextNativePreparationHandoff(skipIds,true);if(native)return {job:await getJob(native.job_id),kind:'native-preparation-handoff',native_preparation:native,automatic_trigger:false,execution_started:false,new_paid_calls:0};}
 const promos=(await db().prepare(`SELECT p.id,p.job_id FROM production_promo_packages p JOIN production_jobs j ON j.id=p.job_id WHERE j.id!=? AND ${testId?'j.is_test=1 AND j.id=?':'j.is_test=0'} ${exclude} AND j.status IN ('awaiting_review','approved','completed') AND p.status='queued' AND p.script_revision=j.revision ORDER BY p.created_at,p.id LIMIT 32`).bind(excludedJob,...(testId?[testId]:[]),...skipIds).all<{id:string;job_id:string}>()).results;
 for(const promo of promos){const job=await claimableQueuedPromo(promo.id);if(job)return{job,kind:'promotion-package',package_id:promo.id,automatic_trigger:false};}
 const reconcile=(await db().prepare(`SELECT p.id,p.job_id FROM production_promo_packages p JOIN production_jobs j ON j.id=p.job_id WHERE j.id!=? AND ${testId?'j.is_test=1 AND j.id=?':'j.is_test=0'} ${exclude} AND j.status IN ('awaiting_review','approved','completed') AND p.status IN ('failed','running') AND p.invocation_id IS NOT NULL AND (p.status='failed' OR p.lease_until<?) AND p.script_revision=j.revision ORDER BY p.updated_at,p.id LIMIT 32`).bind(excludedJob,...(testId?[testId]:[]),...skipIds,Date.now()).all<{id:string;job_id:string}>()).results;
 for(const promo of reconcile){const job=await reconcilablePromo(promo.id);if(job)return{job,kind:'promotion-package',package_id:promo.id,reconciliation_only:true,waiting_for:'original-completed-result-readback',automatic_trigger:false};}
 if(!testId){const post=await nextPostVideoPreparation(skipIds);if(post)return post;}
 const row=await db().prepare(`SELECT id FROM production_jobs j WHERE id!=? AND ${testId?'is_test=1 AND id=?':'is_test=0'} ${exclude} AND (
 ((status='waiting_executor' OR (status='running' AND lease_until<?)) AND ${cliContentCountSql('j','generation')}<6 AND reworks<=2 AND ${cliReadySql()} AND ${INTAKE_TEXT_GUARD_SQL} AND ${CURRENT_FEEDBACK_GUARD_SQL})
 OR(review_mode='auto' AND status IN ('awaiting_review','approved') AND ${cliReadySql()} AND ${CURRENT_FEEDBACK_GUARD_SQL} AND ${cliContentCountSql('j','review')}<8 AND EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=j.id AND m.revision=j.revision AND m.mode_epoch=j.mode_epoch AND m.status='awaiting_ai' AND m.node IN ('source','script','cover','promotion','delivery')))
 OR(review_mode='auto' AND status IN ('awaiting_review','approved') AND ${cliReadySql()} AND ${CURRENT_FEEDBACK_GUARD_SQL} AND EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=j.id AND m.revision=j.revision AND m.mode_epoch=j.mode_epoch AND m.status='ai_running' AND m.review_until<? AND m.node IN ('source','script','cover','promotion','delivery')))
 OR(status='approved' AND EXISTS(SELECT 1 FROM production_operations o WHERE o.job_id=j.id AND o.revision=j.revision AND o.script_hash=j.approved_hash AND o.mode_epoch=j.mode_epoch AND ${CURRENT_MEDIA_OPERATION_SQL} AND (o.status='queued' OR(o.status IN ('running','prepared') AND o.lease_until<? AND json_extract(o.checkpoint,'$.phase') LIKE 'local-files-ready%' AND json_array_length(json_extract(o.checkpoint,'$.files'))>0))))
 ) ORDER BY COALESCE((SELECT MAX(r.created_at) FROM production_reviews r WHERE r.job_id=j.id AND r.decision='execution_request' AND r.revision=j.revision AND json_extract(r.note,'$.binding.mode_epoch')=j.mode_epoch),'') DESC,created_at,id LIMIT 1`).bind(excludedJob,...(testId?[testId]:[]),...skipIds,Date.now(),Date.now(),Date.now()).first<{id:string}>();
 if(!row){
  // Fill only a missing free-preparation registration after existing executable
  // work. Selection is read-only; the internal_preparation CAS owns all writes.
  if(!testId){const candidates=(await db().prepare(`SELECT j.id,j.owner_id FROM production_jobs j LEFT JOIN app_state registration_scope ON registration_scope.key='media_scope_v1:'||j.id WHERE ${PREPARATION_REGISTRATION_SQL} ${exclude} ORDER BY j.created_at,j.id LIMIT 20`).bind(...skipIds).all<{id:string;owner_id:string}>()).results;
   for(const candidate of candidates){const job=await getJob(candidate.id),binding=preparationRegistrationBinding(job,candidate.owner_id);if(binding)return {job,kind:'preparation-registration',binding,automatic_trigger:false,execution_started:false,new_paid_calls:0,quality_approval:false,publication_authorization:false};}
  }
  if(!testId){const native=await nextNativePreparationHandoff(skipIds);if(native)return {job:await getJob(native.job_id),kind:'native-preparation-handoff',native_preparation:native,automatic_trigger:false,execution_started:false,new_paid_calls:0};}
  const waiting=!testId?await listWaitingNativePreparationHandoffs(skipIds):[];
  return {job:null,reason:waiting.length?'当前准备交接等待已授权原生会话，后台尚未开始媒体制作':'没有可安全自动接手的已授权任务；人工待审、暂停、未知执行与隔离视频不领单',native_preparation_waiting:waiting,automatic_trigger:false};
 }
 const job=await getJob(row.id),operation=job.operations?.find(o=>currentMediaOperation(job,o)&&(o.status==='queued'||['running','prepared'].includes(String(o.status))&&Number(o.lease_until)<Date.now()&&String(JSON.parse(String(o.checkpoint||'{}')).phase).startsWith('local-files-ready')&&JSON.parse(String(o.checkpoint||'{}')).files?.length)),review=job.milestones?.find(m=>m.revision===job.revision&&m.mode_epoch===job.mode_epoch&&(m.status==='awaiting_ai'||m.status==='ai_running'&&Number(m.review_until)<Date.now()));
 return {job,kind:job.status==='waiting_executor'||job.status==='running'?'text':review?'review':'media',operation_id:operation?.id,milestone_id:review?.id,automatic_trigger:false};
}
export async function materializeSource(id:string,revision:number,epoch:number,contract:string,fetcher:typeof fetch=fetch){
 const j=await getJob(id);if(id===excludedJob||j.revision!==revision||j.mode_epoch!==epoch||j.contract_hash!==contract||!(['waiting_executor','awaiting_review','approved'].includes(j.status)||j.status==='running'&&Number(j.lease_until)<Date.now()))throw new ProductionError('任务已变化、待决定或属于隔离视频任务');
 const snapshot=JSON.parse(j.source_snapshot),url=normalizeUrl(snapshot.url);
 const research=await materializedResearch(snapshot);if(research){const current=await getJob(id);if(current.revision!==revision||current.mode_epoch!==epoch||current.contract_hash!==contract||current.status!==j.status)throw new ProductionError('读取期间任务已变化，未领取或调用模型');return {...research,source_snapshot_hash:await hash(j.source_snapshot)};}
 const original=await materializedOriginal(snapshot);if(original){const current=await getJob(id);if(current.revision!==revision||current.mode_epoch!==epoch||current.contract_hash!==contract||current.status!==j.status)throw new ProductionError('读取期间任务已变化，未领取或调用模型');return {...original,source_snapshot_hash:await hash(j.source_snapshot)};}
 const supplied=await readProvidedSource(j);if(supplied)return {url:supplied.url,content:supplied.content,sha256:supplied.sha256,retrieved_at:supplied.saved_at,source_snapshot_hash:await hash(j.source_snapshot),complete_response:true,provided_by_owner:true,scope:'Owner-provided full source text; untrusted material, not an independent fetch or approval'};
 // Editorial and legacy source ids may differ; fallback stays within exact configured hosts.
 const source=url?sourceReaderFor(snapshot.source_id,url):undefined;
 const sourceError=(code:string,message:string,status=422,http?:number)=>Object.assign(new ProductionError(message,status),{source_diagnostic:{stage:'text',code,...(http?{status:http}:{}),...(url?{host:new URL(url).hostname}:{}),retryable:['source-http','source-network'].includes(code)}});
 if(!source||!url||url!==snapshot.url||!source.hosts.includes(new URL(url).hostname))throw sourceError('source-host','此选题的原文站点尚未接入读取；可提供完整原文，已接入站点可直接重试',400);
 let document:Awaited<ReturnType<typeof readSourceDocument>>;
 try{document=await readSourceDocument(url,source,fetcher);}catch(error){const failure=error as {code?:string;status?:number},code=['source-http','source-too-large','source-empty','source-format'].includes(failure.code||'')?failure.code!:'source-network';throw sourceError(code,code==='source-http'?'原文站点返回 HTTP '+failure.status+'，尚未调用模型':'原文读取暂未完成，尚未调用模型',422,failure.status)}
 if(document.content_type&&!/^(?:text\/(?:html|plain)|application\/xhtml\+xml)(?:;|$)/i.test(document.content_type))throw sourceError('source-format','来源未返回文章网页或文字，尚未调用模型');
 let article:ReturnType<typeof extractSourceArticle>;try{article=extractSourceArticle(document.content,{url:document.resolved_url});}catch{throw sourceError('source-format','原文站点返回验证页或不支持的页面格式，尚未调用模型')}
 if(article.text.trim().length<100)throw sourceError('source-empty','页面未取得足够的正文；请确认原文可访问，尚未调用模型');
 // Small legacy responses retain their exact bytes/hash. A large HTML shell is
 // replaced by its complete selected article body, never by a clipped summary.
 const content=document.content.length<=100000&&new TextEncoder().encode(document.content).length<=500000?document.content:article.content,resolvedUrl=document.resolved_url;
 if(new TextEncoder().encode(content).length>500000||content.length>100000)throw sourceError('source-too-large','完整文章正文超出本轮审阅范围；未截断或调用模型',400);
 const current=await getJob(id);if(current.revision!==revision||current.mode_epoch!==epoch||current.contract_hash!==contract||current.status!==j.status)throw new ProductionError('读取期间任务已变化，未领取或调用模型');
 return {url,resolved_url:resolvedUrl,content,sha256:await hash(content),raw_document_sha256:document.raw_sha256,raw_document_bytes:document.byte_length,extraction:content===document.content?'complete-response':article.extraction,article_chars:article.text.length,retrieved_at:new Date().toISOString(),source_snapshot_hash:await hash(j.source_snapshot),complete_response:true,scope:content===document.content?'Complete response from the configured source reader; untrusted material, no script execution or media approval':'Complete selected article body with original image references; scripts and page chrome removed, no truncation; raw response identity recorded separately'};
}
