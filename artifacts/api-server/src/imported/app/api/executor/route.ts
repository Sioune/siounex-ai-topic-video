import {assertProductionNotCancelled} from '@/lib/production-cancel';
import {readStudioPreviewGenerationState,recordStudioPreviewCurrentEffect,claimStudioPreviewGeneration,recordStudioPreviewGenerationEvent} from '@/lib/studio-preview-owner-policy';
import {ensureAutomaticClone,readAutomaticClone,quoteAutomaticClone,claimAutomaticClone,checkpointAutomaticClone,blockAutomaticClone,recordAutomaticCloneAudio,recordAutomaticCloneTerminalFailure,requestStudioPreviewClone,preflightAutomaticClone,recordAutomaticCloneRenderProgress} from '@/lib/automatic-clone';
import {ensurePostVideoPreparation,readPostVideoPreparation,beginPostVideoPreparation,completePostVideoPreparation} from '@/lib/post-video-preparation';
import {beginLocalReviewDraft,readLocalReviewDraftStatus,returnLocalReviewDraft,abandonLocalReviewDraft} from '@/lib/local-review-draft';
import {approveOwnerPostVideo,completeOwnerPostVideoDelivery} from '@/lib/owner-post-video-approval';
import {approveOwnerNativeCurrent} from '@/lib/owner-native-current-approval';
import {saveOwnerEditorialDelivery,revokeOwnerEditorialDelivery} from '@/lib/owner-editorial-delivery';
import {setSiteRetentionPolicy,planSiteRetention,applySiteRetention,readSiteRetention} from '@/lib/site-retention';
import {beginOwnerNativeRevision,readOwnerNativeRevision,commitOwnerNativeRevision} from '@/lib/owner-native-revision-return';
import {beginNativeSiteFinal,readNativeSiteFinal} from '@/lib/native-site-final-context';
import {commitNativeSiteFinal} from '@/lib/native-site-final-commit';
import {beginApprovedNativeVersion,readApprovedNativeVersion,commitApprovedNativeVersion,cancelApprovedNativeVersion} from '@/lib/approved-native-version';
import {ensureNativePreparationHandoff,readNativePreparationHandoff,claimNativePreparationHandoff,progressNativePreparationHandoff,recordNativePreparationReconciliation} from '@/lib/native-preparation-handoff';
import {beginPendingNativeSiteDraft,readPendingNativeRecord,cancelPendingNativeSiteDraft} from '@/lib/pending-native-site-context';
import {returnPendingNativeSiteDraft} from '@/lib/pending-native-site-return';
import{recordPreparationExecution}from'@/lib/preparation-execution';
import{recordPreparationMaterials}from'@/lib/preparation-materials';
import{registerFreePreparation}from'@/lib/media-continuation';
import{recordNativeVideoArchive}from'@/lib/native-video-archive';
import{savePromoDelivery,listPromoDeliveries,registerNativePromoVideo}from'@/lib/promo-delivery';
import{recordReportedVideoFeedback}from'@/lib/reported-video-feedback';
import {returnNativeDraftRevision} from '@/lib/native-draft-revision-handoff';
import {returnOwnerNativeVideoRevision} from '@/lib/native-video-revision-return';
import {readNativeWorkPacket} from '@/lib/native-work-packet';
import {recordNativeCandidateFeedback} from '@/lib/native-candidate-feedback';
import {startSiteArchive,putSiteArchivePart,finalizeSiteArchive,readSiteArchivePart,confirmSiteArchive} from '@/lib/site-file-archive';
import {blockSourceInput} from '@/lib/source-input';
import {sourceDiagnostic} from '@/lib/source-input-contract.mts';
import{authorizeMediaRevision,submitAuthorizedMediaRevision,recordRevisionPromoRequirement,stageRevisionBytes}from'@/lib/authorized-media-revision';
import{quoteVoiceReplacement,claimVoiceReplacement,recoverVoiceReplacement,checkpointVoiceReplacement,failVoiceReplacement,completeVoiceReplacement,readVoiceReplacement}from'@/lib/voice-replacement';
import{finishRecordedOperation}from'@/lib/finish-recorded-operation';
import{recordMediaBlock}from'@/lib/executor-media-block';
import{submitCaptionCorrection}from'@/lib/caption-correction';
import {repairProjectBinding} from '@/lib/operation-preflight-repair';
import {recordTechnicalPreview} from '@/lib/technical-preview';
import {claimPreparation,completePreparation} from '@/lib/media-continuation';
import {saveReportedPublication} from '@/lib/reported-publication';
import {dataExport} from '@/lib/data-export';
import {saveAnalysis} from '@/lib/data-analysis';
import {proposeIntake} from '@/lib/production-intake';
import{executorPresence,reportExecutor}from'@/lib/executor-presence';
import {queueScriptFeedback} from '@/lib/script-feedback-queue';
import {readSeries,saveSeries,recordPublicationEvidence,refreshLegacySeriesHistory} from '@/lib/series';
import {recordPreparation} from '@/lib/media-preparation';
import {bindAudioLibrary} from '@/lib/audio-intake';
import {recordMediaCandidates} from '@/lib/media-plans';
import {saveVideo,saveRelation,saveSample,saveEvidence,getEvidenceBytes,dataCenter} from '@/lib/data-center';
import {db} from '@/lib/store';
import {planOperation,claimOperation,checkpointOperation,completeOperation,pauseOperation} from '@/lib/media-operations';
import {nextWork,materializeSource} from '@/lib/dispatch';
import {recordDelivery} from '@/lib/delivery';
import {listPromos,claimPromo,recoverPromo,completePromo,failPromo,importPromo} from '@/lib/promo-packages';
import {claimReview,recoverReview,recoverCompletedReviewOutput,decideMilestone,pauseReview,submitMilestone} from '@/lib/milestones';
import {identity,json} from '@/lib/api';
import {recordNativeCandidateVoiceProvenance} from '@/lib/native-candidate-voice';
import {getJob,createJob,claimJob,heartbeat,checkpointJob,submitDraft,failJob,stageResult,requestScriptRevision} from '@/lib/production';
import {recordCliCapacity,resumeCliTransport,reconcileCliFailure,deferCliReview} from '@/lib/cli-failure';
import {safeRateLimitFailure} from '@/lib/cli-failure-contract.mts';
import {ProductionError,text} from '@/lib/production-contract';
import {getResearch,nextResearch,claimResearch,heartbeatResearch,completeResearch,failResearch,blockResearchCache} from '@/lib/research';
// Shared production operations behind the EXISTING owner-private Sites dispatch boundary.
// Service callers have no visitor identity; this endpoint never accesses favorites or changes dispositions.
// No tokens are minted here, no persistent credentials, no fees or publishing.
export async function POST(req:Request){
 let requestOwner:string|null=null;if(req.headers.has('origin')){requestOwner=await identity(req,true);if(!requestOwner)return json({error:'身份或来源无效'},403)}else if(req.headers.has('sec-fetch-site')||!req.headers.get('content-type')?.includes('application/json'))return json({error:'服务请求来源无效'},403);
 try{const raw=await req.text();if(raw.length>1550000)throw new ProductionError('请求过大',400);const b=JSON.parse(raw);if(raw.length>180000&&!['data_import_evidence','site_archive_part'].includes(b.action)||b.action==='site_archive_part'&&raw.length>720000)throw new ProductionError('请求过大',400);
 // Fence every job-bound write, including stale claims from the current natural round.
 const productionId=typeof b.id==='string'&&b.id.startsWith('job_')?b.id:typeof b.package_id==='string'?(await db().prepare('SELECT job_id FROM production_promo_packages WHERE id=?').bind(b.package_id).first<{job_id:string}>())?.job_id:null;
 if(productionId&&!['read','native_work_packet_read','automatic_clone_read','studio_preview_generation_read','native_preparation_read','post_video_preparation_read','promo_list','promo_delivery_list','site_retention_read','site_archive_read_part','series_read','data_import_read','data_import_evidence_read'].includes(b.action))await assertProductionNotCancelled(productionId);
 if(b.action==='automatic_clone_render_progress')return json(await recordAutomaticCloneRenderProgress(text(b.id,100),b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));
 if(['studio_preview_generation_read','studio_preview_generation_effect','studio_preview_generation_claim','studio_preview_generation_event'].includes(b.action)){
  const studioId=text(b.id,100),studioActor=requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true as const},{action:_studioAction,id:_studioId,...studioBody}=b;
  if(b.action==='studio_preview_generation_read')return json(await readStudioPreviewGenerationState(studioId,studioBody,studioActor));
  if(b.action==='studio_preview_generation_effect')return json(await recordStudioPreviewCurrentEffect(studioId,studioBody,studioActor));
  if(b.action==='studio_preview_generation_claim')return json(await claimStudioPreviewGeneration(studioId,studioBody,studioActor));
  return json(await recordStudioPreviewGenerationEvent(studioId,studioBody,studioActor));
 }
 if(b.action==='test_create')return json(await createJob(text(b.topic_id,100),null,true));
 if(b.action==='dispatch_next')return json(await nextWork(b.test_job_id?text(b.test_job_id,100):undefined,Array.isArray(b.exclude_job_ids)?b.exclude_job_ids.map((x:unknown)=>text(x,100)):[]));
 // Service requests arrive through this Site's existing owner-private dispatch
 // boundary. Resolve the task's persisted owner; never accept b.owner as identity.
 if(['owner_editorial_delivery','owner_editorial_delivery_revoke'].includes(b.action)){
  const editorialId=text(b.id,100),actual=requestOwner?{owner_id:requestOwner}:await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(editorialId).first<{owner_id:string|null}>();
  if(!actual?.owner_id)throw new ProductionError('交付类型确认缺少真实任务所有者',403);
  return json(await (b.action==='owner_editorial_delivery'?saveOwnerEditorialDelivery:revokeOwnerEditorialDelivery)(editorialId,actual.owner_id,b));
 }
 if(['native_preparation_ensure','native_preparation_read','native_preparation_claim','native_preparation_progress','native_preparation_pause','native_preparation_reconcile_diagnostic'].includes(b.action)){const id=text(b.id,100),actor=requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true as const};if(b.action==='native_preparation_ensure')return json(await ensureNativePreparationHandoff(id,b,actor));if(b.action==='native_preparation_read')return json(await readNativePreparationHandoff(id,actor));if(b.action==='native_preparation_reconcile_diagnostic')return json(await recordNativePreparationReconciliation(id,b,actor));if(b.action==='native_preparation_claim')return json(await claimNativePreparationHandoff(id,b,actor));return json(await progressNativePreparationHandoff(id,{...b,...(b.action==='native_preparation_pause'?{status:'blocked'}:{})},actor));}
 if(b.action==='claim')return json(await claimJob(text(b.executor,120),b.id?text(b.id,100):undefined));
 if(b.action==='executor_status')return json(await executorPresence());if(b.action==='executor_heartbeat')return json({executor:await reportExecutor(b)});
 if(b.action==='intake_propose')return json(await proposeIntake(b.proposal));
 if(b.action==='research_next')return json(await nextResearch());
 if(b.action==='research_read')return json({research:await getResearch(text(b.id,100))});
 if(b.action==='research_claim')return json(await claimResearch(text(b.id,100),b));
 if(b.action==='research_heartbeat')return json(await heartbeatResearch(text(b.id,100),b));
 if(b.action==='research_complete')return json(await completeResearch(text(b.id,100),b));
 if(b.action==='research_fail')return json(await failResearch(text(b.id,100),b));
 if(b.action==='research_cache_block')return json(await blockResearchCache(text(b.id,100),b));
 const id=text(b.id,100);const cloneActor=requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true as const};if(b.action==='automatic_clone_preflight')return json(await preflightAutomaticClone(id,b,cloneActor));if(b.action==='automatic_clone_studio_preview')return json(await requestStudioPreviewClone(id,b,cloneActor));if(b.action==='automatic_clone_ensure')return json(await ensureAutomaticClone(id,cloneActor));if(b.action==='automatic_clone_read')return json(await readAutomaticClone(id,cloneActor));if(b.action==='automatic_clone_quote')return json(await quoteAutomaticClone(id,b,cloneActor));if(b.action==='automatic_clone_claim')return json(await claimAutomaticClone(id,b,cloneActor));if(b.action==='automatic_clone_checkpoint')return json(await checkpointAutomaticClone(id,b,cloneActor));if(b.action==='automatic_clone_block')return json(await blockAutomaticClone(id,b,cloneActor));if(b.action==='automatic_clone_terminal_failure')return json(await recordAutomaticCloneTerminalFailure(id,b,cloneActor));if(b.action==='automatic_clone_audio')return json(await recordAutomaticCloneAudio(id,b,cloneActor));if(b.action==='post_video_preparation_ensure')return json(await ensurePostVideoPreparation(id,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='post_video_preparation_read')return json(await readPostVideoPreparation(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='post_video_preparation_begin')return json(await beginPostVideoPreparation(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='post_video_preparation_complete')return json(await completePostVideoPreparation(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='local_review_draft_begin')return json(await beginLocalReviewDraft(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='local_review_draft_read')return json(await readLocalReviewDraftStatus(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='local_review_draft_return')return json(await returnLocalReviewDraft(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='local_review_draft_abandon')return json(await abandonLocalReviewDraft(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='owner_post_video_approve')return json(await approveOwnerPostVideo(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='owner_post_video_delivery_complete')return json(await completeOwnerPostVideoDelivery(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='owner_native_current_approve')return json(await approveOwnerNativeCurrent(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='owner_native_revision_begin')return json(await beginOwnerNativeRevision(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='owner_native_revision_read')return json(await readOwnerNativeRevision(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='owner_native_revision_commit')return json(await commitOwnerNativeRevision(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='native_site_final_begin')return json(await beginNativeSiteFinal(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='native_site_final_read')return json(await readNativeSiteFinal(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='native_site_final_commit')return json(await commitNativeSiteFinal(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='site_retention_policy_set')return json(await setSiteRetentionPolicy(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='site_retention_plan')return json(await planSiteRetention(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='site_retention_apply')return json(await applySiteRetention(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='site_retention_read')return json(await readSiteRetention(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='native_site_draft_cancel')return json(await cancelPendingNativeSiteDraft(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='native_site_draft_begin')return json(await beginPendingNativeSiteDraft(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='native_site_draft_read')return json({pending:(await readPendingNativeRecord(id,b.pending_id,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true})).p,job:await getJob(id)});if(b.action==='native_site_draft_return')return json(await returnPendingNativeSiteDraft(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='approved_native_version_begin')return json(await beginApprovedNativeVersion(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='approved_native_version_read')return json(await readApprovedNativeVersion(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='approved_native_version_commit')return json(await commitApprovedNativeVersion(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='approved_native_version_cancel')return json(await cancelApprovedNativeVersion(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='native_draft_return')return json(await returnNativeDraft(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));if(b.action==='preparation_execution')return json(await recordPreparationExecution(id,b));if(b.action==='preparation_materials')return json(await recordPreparationMaterials(id,b));if(b.action==='internal_preparation')return json(await registerFreePreparation(id,b));if(b.action==='promo_delivery_list')return json(await listPromoDeliveries(id));if(b.action==='promo_delivery_import')return json(await savePromoDelivery(id,undefined,b));if(b.action==='native_video_archive')return json(await recordNativeVideoArchive(id,b));if(b.action==='native_video_candidate')return json(await registerNativePromoVideo(id,b));
 if(b.action==='reported_video_feedback')return json(await recordReportedVideoFeedback(id,b));
 if(b.action==='native_candidate_voice_provenance')return json(await recordNativeCandidateVoiceProvenance(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));
 if(b.action==='native_candidate_feedback')return json(await recordNativeCandidateFeedback(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));
 if(b.action==='site_archive_start')return json(await startSiteArchive(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));
 if(b.action==='site_archive_part')return json(await putSiteArchivePart(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));
 if(b.action==='site_archive_finalize')return json(await finalizeSiteArchive(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));
 if(b.action==='site_archive_read_part')return json(await readSiteArchivePart(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));
 if(b.action==='site_archive_confirm')return json(await confirmSiteArchive(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));
 if(b.action==='native_draft_revision_return')return json(await returnNativeDraftRevision(id,b));
 if(b.action==='native_video_revision_return')return json(await returnOwnerNativeVideoRevision(id,b));
 if(b.action==='native_work_packet_read')return json(await readNativeWorkPacket(id));
 if(b.action==='source_input_block')return json(await blockSourceInput(id,b));
 if(b.action==='media_revision_blob_part')return json(await stageRevisionBytes(id,b));
 if(b.action==='media_revision_promo_requirement')return json(await recordRevisionPromoRequirement(id,b));
 if(b.action==='media_revision_authorize')return json(await authorizeMediaRevision(id,b));if(b.action==='media_revision_submit')return json(await submitAuthorizedMediaRevision(id,b));
 if(['data_import_evidence','data_import_sample','data_import_analysis','data_import_publication','data_import_read','data_import_evidence_read'].includes(b.action)){
  if(id!=='job_6f01090e-218f-4fc9-bd1c-14984d6c1863')throw new ProductionError('本次已授权的数据导入范围不匹配',403);
  const scope=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string}>();if(!scope?.owner_id)throw new ProductionError('真实任务所有者不可用',409);
  if(b.action==='data_import_evidence')return json(await saveEvidence(scope.owner_id,b));
  if(b.action==='data_import_sample')return json(await saveSample(scope.owner_id,b));
  if(b.action==='data_import_publication')return json(await saveReportedPublication(scope.owner_id,b));
  if(b.action==='data_import_analysis')return json(await saveAnalysis(scope.owner_id,b));
  if(b.action==='data_import_evidence_read'){if(requestOwner&&requestOwner!==scope.owner_id)throw new ProductionError('截图不属于当前登录者',403);const {bytes,evidence}=await getEvidenceBytes(scope.owner_id,text(b.evidence_id,100));return new Response(bytes as Uint8Array<ArrayBuffer>,{headers:{'Content-Type':evidence.content_type,'Content-Length':String(bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
  const data=await dataCenter(scope.owner_id);return b.format?dataExport(data,text(b.format,30)):json(data);
 }
 if(b.action==='preparation_claim')return json(await claimPreparation(id,text(b.stage_id,100),text(b.invocation_id,120)));if(b.action==='preparation_result')return json(await completePreparation(id,text(b.stage_id,100),text(b.lease_token,200),b.receipt));
 if(b.action==='technical_preview_result')return json(await recordTechnicalPreview(id,text(b.request_id,120),b.value));if(b.action==='series_read')return json(await readSeries(id));
 if(b.action==='series_select')return json(await saveSeries(id,undefined,b));
 if(b.action==='series_refresh_legacy_history')return json(await refreshLegacySeriesHistory(id,b,requestOwner?{owner_id:requestOwner}:{trusted_owner_service:true}));
 if(b.action==='series_publication_evidence')return json(await recordPublicationEvidence(id,b));
 if(b.action==='media_preparation')return json(await recordPreparation(id,b.preparation));
 if(b.action==='feedback_enqueue')return json(await queueScriptFeedback(id,text(b.feedback_id,200))); 
 if(b.action==='audio_library_binding')return json(await bindAudioLibrary(id,b));
 if(b.action==='media_candidates')return json(await recordMediaCandidates(id,b));
 if(b.action==='data_import_relation')return json(await saveRelation('',b));
 if(b.action==='data_import_report')return json(await saveVideo(null,{...b,publication_source:text(b.publication_source,2000)}));
 if(b.action==='promo_list')return json(await listPromos(id));
 if(b.action==='promo_claim')return json(await claimPromo(text(b.package_id,100),text(b.invocation_id,120)));
 if(b.action==='promo_recover')return json(await recoverPromo(text(b.package_id,100),text(b.invocation_id,120),b.failure_receipt,b.completed_result_receipt,b.legacy_text_continuation_receipt));
 if(b.action==='promo_complete')return json(await completePromo(text(b.package_id,100),text(b.lease_token,200),b.content,b.receipt));
 if(b.action==='promo_fail')return json(await failPromo(text(b.package_id,100),text(b.lease_token,200),text(b.error,2000)));
 if(b.action==='promo_import')return json(await importPromo(id,text(b.request_id,120),b.content,b.binding,b.provenance));
 if(b.action==='review_output_recover')return json(await recoverCompletedReviewOutput(id,text(b.milestone_id,200),b.proof));
 if(b.action==='dispatch_source')return json({source:await materializeSource(id,Number(b.revision),Number(b.mode_epoch),text(b.contract_hash,64))});
 if(b.action==='voice_read')return json(await readVoiceReplacement(id));if(b.action==='voice_quote')return json(await quoteVoiceReplacement(id,text(b.request_id,120),b.quote));if(b.action==='voice_recover')return json(await recoverVoiceReplacement(id,text(b.request_id,120),text(b.invocation_id,120)));if(b.action==='voice_claim')return json(await claimVoiceReplacement(id,text(b.request_id,120),text(b.invocation_id,120)));if(b.action==='voice_checkpoint')return json(await checkpointVoiceReplacement(id,text(b.request_id,120),text(b.lease_token,200),Number(b.version),b.checkpoint));if(b.action==='voice_fail')return json(await failVoiceReplacement(id,text(b.request_id,120),text(b.lease_token,200),text(b.reason,2000)));if(b.action==='voice_result')return json(await completeVoiceReplacement(id,text(b.request_id,120),text(b.lease_token,200),b.result));if(b.action==='operation_finish_recorded')return json({job:await finishRecordedOperation(id,text(b.operation_id,200))});if(b.action==='executor_media_block')return json(await recordMediaBlock(id,text(b.operation_id,200),text(b.input_hash,64),text(b.code,80)));if(b.action==='caption_correction_submit')return json({job:await submitCaptionCorrection(id,b)});if(b.action==='operation_project_repair')return json(await repairProjectBinding(id,text(b.operation_id,200),b));if(b.action==='operation_plan')return json(await planOperation(id,text(b.node,30),Number(b.revision),text(b.script_hash,64),Number(b.base_artifact_version),b.plan));
 if(b.action==='operation_claim'||b.action==='operation_recover')return json(await claimOperation(id,text(b.operation_id,200),text(b.invocation_id,120),b.action==='operation_recover'));
 if(b.action==='operation_checkpoint')return json({operation:await checkpointOperation(id,text(b.operation_id,200),text(b.lease_token,200),Number(b.checkpoint_version),b.checkpoint)});
 if(b.action==='operation_complete')return json({job:await completeOperation(id,text(b.operation_id,200),text(b.lease_token,200),b.result)});
 if(b.action==='operation_pause')return json({job:await pauseOperation(id,text(b.operation_id,200),text(b.lease_token,200),text(b.reason,2000))});if(b.action==='delivery_result')return json({job:await recordDelivery(id,text(b.submission_id,120),b.delivery)});if(b.action==='read')return json({job:await getJob(id)});
 if(b.action==='review_recover')return json(await recoverReview(id,text(b.milestone_id,200),text(b.invocation_id,120)));if(b.action==='review_claim')return json(await claimReview(id,text(b.milestone_id,200),text(b.invocation_id,120)));if(b.action==='review_result')return json({job:await decideMilestone(id,text(b.milestone_id,200),Number(b.revision),text(b.artifact_hash,64),Number(b.mode_epoch),text(b.decision,20),b.report,'codex-cli',text(b.review_token,200))});if(b.action==='review_fail'){if(safeRateLimitFailure(b.diagnostic)){const failure=await deferCliReview(id,text(b.milestone_id,200),text(b.review_token,200),b.diagnostic);return json({...failure,job:await getJob(id)});}return json({job:await pauseReview(id,text(b.milestone_id,200),text(b.error,2000),text(b.review_token,200))});}if(b.action==='request_revision')return json({job:await requestScriptRevision(id,Number(b.revision),text(b.content_hash,64),text(b.request_id,120),text(b.note,4000),text(b.authorization_reference,300))});
 if(b.action==='milestone_submit')return json({job:await submitMilestone(id,text(b.node,30),Number(b.revision),Number(b.base_artifact_version),text(b.submission_id,120),b.artifact)});if(b.action==='stage_result')return json({job:await stageResult(id,text(b.stage_id,100),b.result)});
 if(b.action==='cli_transport_resume')return json({...await resumeCliTransport(id,b),job:await getJob(id)});
 if(b.action==='cli_capacity_record')return json({...await recordCliCapacity(id,b.observation),job:await getJob(id)});if(b.action==='cli_failure_reconcile')return json({...await reconcileCliFailure(id,b),job:await getJob(id)});
 const token=text(b.lease_token,200);if(b.action==='heartbeat')return json({job:await heartbeat(id,token)});
 if(b.action==='checkpoint')return json({job:await checkpointJob(id,token,Number(b.checkpoint_version),b.checkpoint)});
 if(b.action==='submit')return json(await submitDraft(id,token,Number(b.base_revision),text(b.submission_id,120),b.draft));
 if(b.action==='fail')return json({job:await failJob(id,token,text(b.error,2000),b.diagnostic)});throw new ProductionError('执行协议操作无效',400);
 }catch(e){if(e instanceof ProductionError){const diagnostic=sourceDiagnostic((e as ProductionError&{source_diagnostic?:unknown}).source_diagnostic);return json({error:e.message,...((e as ProductionError&{code?:string}).code==='PRODUCTION_CANCELLED'?{code:'PRODUCTION_CANCELLED'}:{}),...(diagnostic?{source_diagnostic:diagnostic}:{})},e.status);}const failure=e as {name?:string;message?:string;cause?:{message?:string}};console.error('executor',{name:failure?.name||typeof e,message:String(failure?.message||'unknown executor failure').slice(0,800),cause:String(failure?.cause?.message||'').slice(0,800)});return json({error:'执行回传未完成；先读回任务，禁止盲目重试外部收费'},503)}
}
import {returnNativeDraft} from '@/lib/native-draft-handoff';
