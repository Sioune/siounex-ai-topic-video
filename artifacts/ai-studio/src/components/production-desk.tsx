'use client';
import ContentMotionStatus from './content-motion-status';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './ui/dialog';
import LocalReviewDraftPreview,{currentLocalReviewDraft} from './local-review-draft';
import {currentLocalPostVideoArchives} from '@/lib/local-post-video-archives.mts';
import './production-design.css';
import {manualTextReviewAvailable,currentManualTextReview} from '@/lib/manual-text-review.mts';
import {localAutomaticVideoReworkSupported,currentOwnerMediaRework,localClonedVideoReworkUnsupported,OWNER_LOCAL_CLONE_REWORK_PAUSE} from '@/lib/owner-media-rework-contract.mts';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './ui/tabs';
import SourceInput from './source-input';
import {SOURCE_INPUT_REQUIRED} from '@/lib/source-input-contract.mts';
import NativeHandoff,{currentCandidateOwnerReview,candidateOwnerReviewSummary,NativeCandidateOwnerReviewNotice} from './native-handoff';
import {NativeVideoArchive,NativeVideoVersions} from './native-video-archive';
import {visibleSiteArchives,currentSiteVideoMilestone,siteMaterialReviewStatus,CurrentSiteMaterialPreview} from './site-archive-files';
import {validSiteArchive,currentPostVideoApproval,postVideoArchiveJobMatches,type SiteFileArchive} from '@/lib/site-file-archive-contract.mts';
import {ExecutionFailures,ExecutionError} from './execution-failures';
import {ExecutionRecovery,cliRecoveryLabels} from './execution-recovery';
import {cliFailureRecovery} from '@/lib/cli-failure-contract.mts';
import {executionDisplay,executionStatusLabel,executorConnectionDetail} from '@/lib/execution-display.mts';
import {requiresToolDemonstration} from '@/lib/tool-demonstration.mts';
import AutomaticClone,{useAutomaticClone,automaticCloneStatus} from './automatic-clone';
import {automaticCloneProof,automaticCloneSecondApproved} from '@/lib/automatic-clone-contract.mts';
import {cloneWaitingLabel,cloneRetryLabel} from '@/lib/automatic-clone-progress.mts';
import ProductionIntake,{ConfirmedIntake,readTopicProductionJob,canConfirmExistingIntake} from './production-intake';
import {SeriesLibrary} from './series-library';
import {lazy,Suspense,useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react';

import ProductionHandoff from './production-handoff';
import {completedProductionDelivery,productionNextStep} from '@/lib/production-handoff';
import ScriptFeedback from './script-feedback';
import ScriptLock from './script-lock';
import NodeReview from './node-review';
import ScriptView from './script-view';
import {MediaProductionProgress,currentMediaProductionProgress} from './media-production-progress';
import {scopeBinding,bindingMatches,privateVideoScopeAuthorized} from '@/lib/media-continuation-contract';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {STAGE_LABELS,type ProductionJob,type DraftContent} from '@/lib/production-contract';
import type {ProductionJobSummary} from '@/lib/production';
import ProductionHistory from './production-history';
const PromoDelivery=lazy(()=>import('@/components/promo-delivery'));
const PostVideoPreparation=lazy(()=>import('./post-video-preparation'));
const VoiceReplacement=lazy(()=>import('./voice-replacement'));
const PrivateReview=lazy(()=>import('./private-review'));
const TechnicalPreviewCard=lazy(()=>import('./technical-preview'));
const PromoPackage=lazy(()=>import('./promo-package'));
const MediaPlanner=lazy(()=>import('./media-planner'));
const AudioIntake=lazy(()=>import('./audio-intake'));
const MediaContinuation=lazy(()=>import('./media-continuation'));
const PublicationReports=lazy(()=>import('./publication-reports'));
const PublicationActions=lazy(()=>import('./publication-actions'));
const MediaPreparation=lazy(()=>import('./media-preparation'));
const PublicityAssetFiles=lazy(()=>import('./publicity-files'));
const VerifiedMediaPreview=lazy(()=>import('./verified-media-preview'));
// Retry hash navigation after a deferred panel has actually mounted.
function DeferredPanel({children,onReady}:{children:ReactNode;onReady:()=>void}){useEffect(()=>{onReady()},[onReady]);return <>{children}</>}
// Closed historical sections keep previously entered text, but do not mount
// their network clients until the person actually opens the section.
function HistoricalPromoDelivery({jobId,active}:{jobId:string;active:boolean}){
 const [open,setOpen]=useState(false),[seen,setSeen]=useState(false);
 useEffect(()=>{if(!active)return;const reveal=()=>{if(window.location.hash==='#promotion-delivery'){setOpen(true);setSeen(true);}};reveal();window.addEventListener('hashchange',reveal);return()=>window.removeEventListener('hashchange',reveal);},[active]);
 useEffect(()=>{if(!active||!open||!seen||window.location.hash!=='#promotion-delivery')return;const frame=requestAnimationFrame(()=>document.getElementById('promotion-delivery')?.scrollIntoView({block:'start'}));return()=>cancelAnimationFrame(frame);},[active,open,seen]);
 return <details open={open} data-historical-library-promotion onToggle={event=>{const next=event.currentTarget.open;setOpen(next);if(next)setSeen(true);}}><summary>历史 Library 宣发交付记录</summary>{seen&&<PromoDelivery jobId={jobId} active={active&&open}/>}</details>;
}
function HistoricalPromoPackage({jobId,revision}:{jobId:string;revision:number}){
 const [seen,setSeen]=useState(false);
 return <details onToggle={event=>{if(event.currentTarget.open)setSeen(true);}}><summary>旧宣发文案版本与生成请求</summary>{seen&&<PromoPackage jobId={jobId} revision={revision}/>}</details>;
}
function HistoricalDiagnostics({job,cancelled=false}:{job:ProductionJob;cancelled?:boolean}){
 const [open,setOpen]=useState(false),[full,setFull]=useState<ProductionJob|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const compact=(job as ProductionJob&{detail_view?:string}).detail_view==='desk';
 useEffect(()=>{if(!open||!compact)return;const controller=new AbortController();setFull(null);setError('');api(undefined,job.id,controller.signal,true).then(d=>{if(!controller.signal.aborted){if(d.job?.id!==job.id||d.job.revision!==job.revision||d.job.mode_epoch!==job.mode_epoch)throw Error('任务版本已变化，请重新读取后查看');setFull(d.job);}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'历史记录读取失败')});return()=>controller.abort();},[open,compact,job.id,job.revision,job.mode_epoch,attempt]);
 const shown=compact?(full?.id===job.id&&full.revision===job.revision&&full.mode_epoch===job.mode_epoch?full:null):job;
 return <details onToggle={event=>setOpen(event.currentTarget.open)}><summary>{cancelled?'历史审核、成果与执行记录':'历史版本、审核与恢复检查点'}</summary>{open&&(error?<p role="alert">{error} <button type="button" onClick={()=>setAttempt(v=>v+1)}>重新读取历史记录</button></p>:!shown?<p role="status">正在读取完整历史记录…</p>:<ProductionHistory key={shown.id+'-'+shown.revision+'-'+shown.mode_epoch} job={shown} cancelled={cancelled}/>)}</details>;
}
type ProductionPanel='review'|'media'|'delivery';
function anchorPanel(id:string):ProductionPanel|null{
 if(['native-video-archive','promotion-delivery','promotion-review','delivery-review','publication-followup','post-video-preparation','final-review-confirmation'].includes(id))return 'delivery';
 if(['cover-review','video-review','recording-input','media-plan-input','media-next-step','voice-replacement','native-preparation-progress','execution-preparation-progress','automatic-clone','technical-video','private-review-video'].includes(id))return 'media';
 if(['source-review','script-review','script-feedback'].includes(id))return 'review';
 return null;
}
const labels:Record<string,string>={cancelled:'已取消制作',completed:'交付已核验',waiting_executor:'等待执行器领取',running:'执行器已领单',awaiting_review:'等待节点审核',approved:'口播稿已批准',failed:'执行失败',paused:'已暂停，需要决定',awaiting_ai:'等待AI审核',awaiting_human:'等待人工审核',ai_running:'AI正在审核',pending:'等待前一节点',revise:'已打回返工'};
const nodes:Record<string,string>={source:'来源与事实核验',script:'口播稿与分镜',cover:'封面',video:'成片画面与声音',promotion:'宣发文案',delivery:'交付检查'};
const ordinaryVoiceArchiveJobs=new Set(['job_1c2556b8-53d5-4dc0-8d7a-faec60fa36ba','job_79fcd694-545b-4423-971c-984d95b5511c']);
export function currentProductionMilestone(job:ProductionJob,node:string){return(job.milestones||[]).filter(m=>m.node===node&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch&&!['invalidated','superseded'].includes(m.status)).sort((a,b)=>b.artifact_version-a.artifact_version)[0];}
export function localCoverPreparationStatus(job:ProductionJob){
 const current=currentLocalReviewDraft(job);if(!current||current.milestone.status==='revise'||!['approved','completed'].includes(job.status)||job.approved_revision!==job.revision||currentProductionMilestone(job,'cover'))return null;
 const prepared=currentLocalPostVideoArchives(job);if(!prepared&&job.review_mode!=='auto')return null;
 return prepared?'prepared':'pending';
}
export function LocalCoverPreparation({job}:{job:ProductionJob}){
 const status=localCoverPreparationStatus(job);if(!status)return null;
 return <div data-local-cover-preparation={status}><p>{status==='prepared'?'本版双比例 AIGC 封面已备齐，待本人最终审核。':'本版封面候选随成片交付材料自动准备，当前状态见「交付与版本」。'}</p><p><a className="text-link" href="#post-video-preparation">查看本版封面、宣发与交付材料 →</a></p></div>;
}
export function currentMediaReworkRecovery(job:ProductionJob){
 if(job.status!=='paused'||job.approved_revision!==job.revision||!job.approved_hash||job.publication_reports?.length||job.facts?.publication_recorded||job.facts?.execution_condition==='result_unknown')return null;
 if(job.operations?.some(op=>op.revision===job.revision&&op.mode_epoch===job.mode_epoch&&['running','prepared'].includes(op.status))||job.milestones?.some(m=>m.revision===job.revision&&m.mode_epoch===job.mode_epoch&&m.status==='ai_running')||job.facts?.native_preparation_handoff?.status==='claimed')return null;
 const candidates=['video','cover','promotion'].map(node=>currentProductionMilestone(job,node)).filter(m=>m?.status==='revise');
 const feedback=candidates.flatMap(m=>{if(!m)return [];try{const artifact=JSON.parse(m.artifact);if(artifact.qa?.native_handoff||localClonedVideoReworkUnsupported(m))return [];const automaticSupported=localAutomaticVideoReworkSupported(m),supported=job.reworks<=2||automaticSupported;const report=JSON.parse(m.report||'null'),reason=typeof report?.reason==='string'?report.reason.trim():'';if(report?.decision!=='revise'||report.revision!==m.revision||report.artifact_hash!==m.artifact_hash||report.mode_epoch!==m.mode_epoch||!reason)return [];return [{milestone:m,reason,matches:reason===job.review_note?.trim(),supported,automaticSupported}];}catch{return []}});
 return feedback.find(value=>value.matches)||(feedback.length===1?feedback[0]:null);
}
export function currentAutomaticMediaRework(job:ProductionJob){
 if(job.status!=='approved'||!['auto','node'].includes(job.review_mode)||job.approved_revision!==job.revision||!job.approved_hash||job.publication_reports?.length||job.facts?.publication_recorded||job.facts?.execution_condition==='result_unknown')return null;
 const m=currentProductionMilestone(job,'video');if(!m||!localAutomaticVideoReworkSupported(m))return null;
 try{const owner=JSON.parse(m.report||'null')?.actor;if(typeof owner!=='string'||!owner)return null;return currentOwnerMediaRework({...job,owner_id:owner},m,owner)?m:null;}catch{return null;}
}
function completedNativeFinalDelivery(job:ProductionJob):boolean{
 if(job.is_test||!completedProductionDelivery(job)||['source','script','cover','promotion'].some(node=>currentProductionMilestone(job,node)?.status!=='approved'))return false;
 const files=visibleSiteArchives(job),source=files.find(a=>a.file.role==='source_bundle'),complete=files.find(a=>a.file.role==='complete_bundle');
 if(!source||!complete||files.length!==6||!/^nfinal_[a-f0-9]{64}$/.test(source.final_native_request_id||'')||source.final_native_request_id!==complete.final_native_request_id)return false;
 try{const video=JSON.parse(currentProductionMilestone(job,'video')!.artifact);return video.qa?.final_native_id===source.final_native_request_id&&video.qa?.voice_kind==='owner-cloned'&&video.qa?.website_button_clicked===false;}catch{return false;}
}
export function archivedOrdinaryVideoStatus(job:ProductionJob):string|null{
 if(completedNativeFinalDelivery(job))return '本人声音版 · 交付已完成';
 if(!ordinaryVoiceArchiveJobs.has(job.id)||job.is_test||!['approved','awaiting_human','completed'].includes(job.status)||job.facts?.video_approval!=='owner-node-approved'||job.facts.files_archived!==true)return null;
 const review=currentCandidateOwnerReview(job);if(review?.decision!=='approved')return null;
 // listJobs exposes these current, server-validated archive facts without the detail-only scope/milestones.
 const archive=job.facts.site_file_archives?.find(a=>validSiteArchive(a)&&a.file.role==='video'&&a.status==='confirmed'&&a.materialized_sha256===a.file.sha256&&a.file.sha256===job.facts?.candidate_video_sha256&&a.owner_review_id===review.id&&Object.entries(review.binding).every(([key,value])=>a.binding[key as keyof typeof a.binding]===value));
 if(!archive)return null;
 if(job.media_continuation&&!visibleSiteArchives(job).some(a=>a.site_archive_id===archive.site_archive_id))return null;
 if(job.milestones&&currentSiteVideoMilestone(job)?.status!=='approved')return null;
 const voicePrefix=review.reviewed_voice_kind==='owner-cloned'?'本人声音版 · ':'';
 if(job.status==='completed')return voicePrefix+'交付已完成';
 const delivery=job.milestones?.filter(m=>m.node==='delivery'&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 return voicePrefix+(delivery?.status==='awaiting_human'?'等待交付审核':'成片已通过，待交付');
}
function pendingNativeCandidateSummary(job:ProductionJob):string|null{
 const facts=job.facts;
 if(job.status!=='approved'||job.approved_revision!==job.revision||!job.approved_hash||!facts?.candidate_present||facts.files_archived!==false||facts.video_approval!=='not-recorded'||!/^native_video_[a-f0-9]{64}$/.test(facts.candidate_record_id||'')||!/^[a-f0-9]{64}$/.test(facts.candidate_video_sha256||'')||currentCandidateOwnerReview(job)||job.milestones?.some(m=>m.node==='video'&&m.revision===job.revision))return null;
 const record=job.reviews?.find(r=>r.id===facts.candidate_record_id&&r.decision==='native_video_candidate'&&r.revision===job.revision&&r.content_hash===facts.candidate_video_sha256);
 try{const value=JSON.parse(String(record?.note));return value.schema==='native-video-candidate-v1'&&value.script_hash===job.approved_hash&&value.sha256===facts.candidate_video_sha256&&value.local_file_verified===true&&value.quality_approved===false&&value.publication===false?'本版成片候选待审，待归档与本人审阅':null;}catch{return null;}
}
export function pendingArchivedCandidateReviewStatus(job:ProductionJob):string|null{
 if(job.is_test||job.facts?.files_archived!==true)return null;
 const milestone=currentSiteVideoMilestone(job);
 if(!milestone||milestone.status!=='awaiting_human'||milestone.revision!==job.revision||milestone.mode_epoch!==job.mode_epoch)return null;
 return visibleSiteArchives(job).some(a=>a.file.role==='video'&&a.pending_candidate_id===job.facts?.candidate_record_id)?'成片待本人审核':null;
}
export function postVideoMaterialReviewStatus(job:ProductionJob):string|null{
 const video=currentSiteVideoMilestone(job);if(video?.status!=='approved')return null;
 const files=visibleSiteArchives(job).filter(a=>a.post_video_delivery_id);if(!files.length)return null;
 const deliveryStatus=postVideoDeliveryReviewStatus(job,video,files);if(deliveryStatus)return deliveryStatus;
 const covers=files.filter(a=>a.file.role.startsWith('cover_')),promotion=files.filter(a=>a.file.role==='promotion');
 const coverPair=['cover_3_4','cover_4_3'].every(role=>covers.some(a=>a.file.role===role));
 if(covers.some(a=>siteMaterialReviewStatus(job,a)==='revise'))return '封面需修改';
 if(coverPair&&covers.every(a=>siteMaterialReviewStatus(job,a)==='awaiting_human'))return '封面待本人审核';
 if(promotion.some(a=>siteMaterialReviewStatus(job,a)==='revise'))return '宣发需修改';
 if(coverPair&&covers.every(a=>siteMaterialReviewStatus(job,a)==='approved')&&promotion.some(a=>siteMaterialReviewStatus(job,a)==='awaiting_human'))return '宣发待本人审核';
 return '成片已通过，封面与宣发按节点继续';
}
function postVideoDeliveryReviewStatus(job:ProductionJob,video:NonNullable<ReturnType<typeof currentSiteVideoMilestone>>,files:SiteFileArchive[]):string|null{
 if(!postVideoArchiveJobMatches(job)||job.is_test)return null;
 const bundle=files.find(a=>a.file.role==='complete_bundle'&&a.post_video_delivery_id===video.id),delivery=(job.milestones||[]).filter(m=>m.node==='delivery'&&m.revision===job.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(!bundle||!delivery||delivery.mode_epoch!==job.mode_epoch||!['awaiting_human','approved'].includes(delivery.status))return null;
 try{
  // getJob omits owner_id. This current video report is also tied to the real
  // owner approval referenced by every server-validated post-video archive.
  const owner=JSON.parse(video.report||'null')?.actor;if(typeof owner!=='string'||!owner)return null;
  const context={...job,owner_id:owner},approvals={video:currentPostVideoApproval(context,'video'),cover:currentPostVideoApproval(context,'cover'),promotion:currentPostVideoApproval(context,'promotion')};
  if(!approvals.video||approvals.video.milestone.id!==video.id||!approvals.cover||!approvals.promotion||bundle.owner_review_id!==approvals.video.review_id||bundle.post_video_material_reviews?.cover!==approvals.cover.review_id||bundle.post_video_material_reviews?.promotion!==approvals.promotion.review_id)return null;
  const allFiles=visibleSiteArchives(job),roles=['video','cover_3_4','cover_4_3','promotion'] as const,artifact=JSON.parse(delivery.artifact),limits=JSON.parse(artifact.limits);
  if(limits?.schema!=='site-private-delivery-v1'||limits.secondary_download_verified!==true||limits.external_publication!==false||limits.new_paid_calls!==0||limits.project_id!==bundle.binding.project_id||limits.timeline_id!==bundle.binding.timeline_id)return null;
  const sameFile=(ref:Record<string,unknown>|undefined,file:SiteFileArchive)=>ref?.site_archive_id===file.site_archive_id&&ref.sha256===file.file.sha256&&ref.size_bytes===file.file.size_bytes;
  if(!sameFile(limits.complete_bundle,bundle)||!roles.every(role=>{const file=allFiles.find(a=>a.file.role===role);return !!file&&sameFile(limits.archives?.[role],file)&&(role==='video'||file.post_video_delivery_id===video.id&&siteMaterialReviewStatus(job,file)==='approved');}))return null;
  if(!(['video','cover','promotion'] as const).every(node=>{const approval=approvals[node]!,reference=limits.approvals?.[node],audit=job.reviews?.find(r=>r.id===approval.review_id);return reference?.milestone_id===approval.milestone.id&&reference.artifact_hash===approval.milestone.artifact_hash&&reference.review_id===approval.review_id&&typeof reference.reviewed_at==='string'&&Number.isFinite(Date.parse(reference.reviewed_at))&&reference.reviewed_at===audit?.created_at;}))return null;
  if(delivery.status==='awaiting_human')return '等待交付审核';
  return completedProductionDelivery(job)&&currentPostVideoApproval(context,'delivery')?.milestone.id===delivery.id?'交付已完成':null;
 }catch{return null;}
}
async function api(body?:unknown,id?:string,signal?:AbortSignal,full=false){const r=await fetch('/api/production'+(id?'?id='+encodeURIComponent(id)+(full?'':'&view=desk'):''),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});const d=await r.json() as {error?:string;jobs:ProductionJobSummary[];job:ProductionJob};if(!r.ok)throw Error(d.error||'读取失败');return d;}
function currentProducerReceipt(job:ProductionJob){
 const scope=job.media_continuation?.scope,h=job.facts?.native_preparation_handoff;
 if(!scope||scope.schema!=='owner-media-scope-v1'||scope.id!==job.media_continuation?.current_id||!privateVideoScopeAuthorized(scope,job.review_mode)||!bindingMatches(job,scope.binding)||h?.binding?.scope!=='private-video'||h.binding.scope_id!==scope.id||!bindingMatches(job,h.binding))return false;
 const prefix='.sites-runtime/authorized-inputs/'+job.id+'/revision-'+job.revision+'/private-review/';
 return h.checkpoint?.artifacts?.some(a=>a.kind==='local-file'&&a.purpose==='render-receipt'&&a.file.startsWith(prefix)&&a.file.endsWith('/producer-receipt.json')&&/^[a-f0-9]{64}$/.test(a.sha256)&&a.size_bytes>0)===true;
}
export function HistoricalPreparation({archived,produced=false,children}:{archived:boolean;produced?:boolean;children:ReactNode}){return archived||produced?<details className="production-technical" data-historical-preparation><summary>{archived?'历史准备记录（已有归档成片，无需重复制作）':'历史准备检查，以当前执行回执为准'}</summary><p>{archived?'以下是本版制作前保存的准备检查与输入记录；其中的旧缺项不是当前归档成片的新制作指令。当前成片与正式审核节点显示在上方。':'当前版本与授权范围已有实际制作产物回执。下列原始准备检查仅供回看，保留当时未通过的结果；当前制作状态和待办以上方执行回执为准，不表示这些旧缺项仍在阻塞。'}</p>{children}</details>:<>{children}</>;}
const workspaceSections=[{id:'published',label:'已发布',empty:'还没有发布记录',description:'站内已登记发布的任务'}, {id:'completed',label:'已完成片仓',empty:'还没有已审核完成的成片',description:'本人审核通过且完整交付已归档，等待发布'}, {id:'in_progress',label:'制作中',empty:'当前没有制作中的任务',description:'取材、制作、返工与待本人审片的任务'}, {id:'cancelled',label:'已取消',empty:'还没有取消制作的任务',description:'已退出制作队列；稿件、成果与记录保留'}] as const;
export function productionModeLabel(value:string){return value==='auto'?'总自动化':value==='node'?'人工节点':'审核模式待确认';}
export function ProductionTaskGroups({jobs,selectedId,busy,onSelect,onCancel}:{jobs:ProductionJobSummary[];selectedId:string|null;busy:boolean;onSelect:(id:string)=>void;onCancel?:(job:ProductionJobSummary)=>void}){
 const [active,setActive]=useState<(typeof workspaceSections)[number]['id']>('in_progress'),tabsId=useId();
 const selectedSection=jobs.find(job=>job.id===selectedId)?.workspace_section;
 useEffect(()=>{if(selectedId&&selectedSection)setActive(selectedSection);},[selectedId,selectedSection]);
 return <div className="production-task-groups"><div className="production-section-tabs" role="tablist" aria-label="制作任务分区">{workspaceSections.map((section,index)=><button key={section.id} type="button" role="tab" id={tabsId+'-tab-'+section.id} aria-selected={active===section.id} aria-controls={tabsId+'-panel-'+section.id} tabIndex={active===section.id?0:-1} onClick={()=>setActive(section.id)} onKeyDown={event=>{const next=event.key==='ArrowRight'?(index+1)%workspaceSections.length:event.key==='ArrowLeft'?(index+workspaceSections.length-1)%workspaceSections.length:event.key==='Home'?0:event.key==='End'?workspaceSections.length-1:null;if(next===null)return;event.preventDefault();setActive(workspaceSections[next].id);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}}><span>{section.label}</span><span className="production-section-count" aria-label={section.label+'数量'}>{jobs.filter(job=>(job.workspace_section||'in_progress')===section.id).length}</span></button>)}</div>{workspaceSections.map(section=>{const items=jobs.filter(job=>(job.workspace_section||'in_progress')===section.id);return <section key={section.id} className="production-task-group" role="tabpanel" id={tabsId+'-panel-'+section.id} aria-labelledby={tabsId+'-tab-'+section.id} tabIndex={0} hidden={active!==section.id} data-workspace-section={section.id}><p className="production-group-description">{section.description}</p><div className="production-task-items">{items.length?items.map(job=><div key={job.id} className="production-task-item"><button data-task-select className={selectedId===job.id?'active':''} aria-current={selectedId===job.id?'true':undefined} disabled={busy} onClick={()=>onSelect(job.id)}><strong>{job.title}</strong>{job.workspace_badge&&<span className="production-task-badge">{job.workspace_badge}</span>}<span>{job.status_label}</span>{job.clone_progress&&<small data-clone-list-progress>{cloneWaitingLabel(job.clone_progress)}{job.clone_progress.failure_count?<> · 连续 {job.clone_progress.failure_count} 次未完成</>:null}<br/>{cloneRetryLabel(job.clone_progress)||job.clone_progress.next_step}</small>}<small>稿 v{job.revision} · {productionModeLabel(job.review_mode)}{job.is_test?' · 验收测试数据':''}</small></button>{section.id==='in_progress'&&job.status!=='completed'&&onCancel&&<button type="button" className="production-task-cancel" disabled={busy} aria-label={'取消制作：'+job.title} onClick={()=>onCancel(job)}>取消制作</button>}</div>):<p className="production-group-empty">{section.empty}</p>}</div></section>;})}</div>;
}
function currentLocalReviewRework(job:ProductionJob,current:ReturnType<typeof currentLocalReviewDraft>){
 const h=job.facts?.native_preparation_handoff,b=h?.base_video,m=current?.milestone,scope=job.media_continuation?.scope;
 if(!h||!b||!m||m.status!=='revise'||job.status!=='approved'||job.approved_revision!==job.revision||!['queued','claimed','blocked','completed'].includes(h.status)||b.id!==m.id||b.artifact_hash!==m.artifact_hash||b.artifact_version!==m.artifact_version||h.binding.revision!==job.revision||h.binding.script_hash!==job.approved_hash||h.binding.mode_epoch!==job.mode_epoch||h.binding.contract_hash!==job.contract_hash||h.binding.scope!=='private-video'||h.binding.scope_id!==scope?.id||scope.id!==job.media_continuation?.current_id)return null;
 return h;
}
function ModeOptions({value,onChange,disabled}:{value:string;onChange:(mode:string)=>void;disabled:boolean}){return <fieldset className="mode-options" disabled={disabled}><legend>审核模式</legend><label><input type="radio" name="review-mode" checked={value==='node'} onChange={()=>onChange('node')}/> 节点模式 · 每个节点交给我审核</label><label><input type="radio" name="review-mode" checked={value==='auto'} onChange={()=>onChange('auto')}/> 总自动化 · AI通过后继续，打回后有限返工</label><small>总自动化接续素材、普通审阅版、双封面和分平台宣发；普通版首次通过后换用本人既有声音，再由你二审，新版成片与完整包核验后入库。新增支付上限为零，对外发布另按授权执行。</small></fieldset>}
export function ProductionAction({topicId,disposition}:{topicId:string;disposition?:string}){
 const [job,setJob]=useState<ProductionJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mode,setMode]=useState('node'),[checking,setChecking]=useState(true),[lookupAttempt,setLookupAttempt]=useState(0);
 useEffect(()=>{let alive=true;setChecking(true);setError('');setJob(null);readTopicProductionJob(topicId).then(value=>{if(alive)setJob(value)}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setChecking(false)});return()=>{alive=false}},[topicId,lookupAttempt]);
 async function create(){setBusy(true);setError('');try{const d=await api({action:'create',topic_id:topicId,mode});setJob(d.job)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="production-start"><h3>确定制作</h3><p>保存来源和制作规范，建立唯一任务，按里程碑审查真实产物。</p>{checking?<p>正在读取此选题已有任务…</p>:!error&&(job&&!canConfirmExistingIntake(job)?<><p>{labels[job.status]||job.status}</p>{job.intake&&<ConfirmedIntake value={job.intake}/>}<a href={'/production?job='+encodeURIComponent(job.id)} className="text-link">打开已有任务与成果 →</a></>:<ProductionIntake topicId={topicId} existingJob={job} onRegistered={setJob} fallback={<><ModeOptions value={mode} onChange={setMode} disabled={busy}/><Button onClick={create} disabled={busy||['produced','rejected'].includes(disposition||'')}>{busy?'正在保存…':'确定制作 · 建立任务'}</Button></>}/>)}{error&&<div><p role="alert">{error}</p><Button variant="outline" disabled={busy||checking} onClick={()=>setLookupAttempt(v=>v+1)}>重新读取已有任务</Button><p><a href={'/signin-with-chatgpt?return_to='+encodeURIComponent('/production?topic='+topicId)}>登录后继续</a></p></div>}<small>任务和检查点保存在网站，关闭页面不会丢失。本机执行器按既有周期检查授权队列，人工审核与缺素材时暂停。</small></section>;
}
// The lightweight clone poll can observe a new result before the main job poll.
// Refresh only that current result, once; regular polling retains retry coverage.
export function automaticCloneMainJobRefreshKey(job:ProductionJob|null,value:ReturnType<typeof useAutomaticClone>['value']):string|null{
 const c=value?.clone,r=value?.request;if(!job||!c||!['awaiting_second_review','approved'].includes(c.stage)||!/^acl_[a-f0-9]{64}$/.test(c.request_id||'')||!/^[a-f0-9]{64}$/.test(c.result_video_sha256||''))return null;
 if(r&&(r.job_id!==job.id||r.id!==c.request_id||r.binding.revision!==job.revision||r.binding.mode_epoch!==job.mode_epoch||r.binding.script_hash!==job.approved_hash||r.binding.contract_hash!==job.contract_hash))return null;
 if(currentLocalReviewDraft(job)?.sha256===c.result_video_sha256&&(c.stage!=='approved'||automaticCloneSecondApproved(job)))return null;
 return[job.id,job.revision,job.mode_epoch,job.approved_hash,job.contract_hash,c.request_id,c.result_video_sha256,c.stage].join(':');
}
export default function ProductionDesk(){
 const navigationSearch=useRef<string|null>(null);
 const [panel,setPanel]=useState<ProductionPanel>('review'),[loading,setLoading]=useState(true);
 const [visitedPanels,setVisitedPanels]=useState<{jobId:string|null;panels:ProductionPanel[]}>({jobId:null,panels:['review']});
 const [showTests,setShowTests]=useState(false);const [intakeTopic,setIntakeTopic]=useState<string|null>(null);
 const [jobs,setJobs]=useState<ProductionJobSummary[]>([]),[selected,setSelected]=useState<ProductionJob|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[listLoading,setListLoading]=useState(true);
 const [cancelTarget,setCancelTarget]=useState<ProductionJobSummary|null>(null),[cancelReason,setCancelReason]=useState('');
 const reads=useRef<{sequence:number;controller:AbortController|null;promise:Promise<void>|null}>({sequence:0,controller:null,promise:null});
 // Navigation and writes supersede old reads; the timer shares this same
 // single flight. An old response can never replace a newly selected job.
 const refresh=useCallback((id?:string,replace=true):Promise<void>=>{
  if(!replace&&reads.current.promise)return reads.current.promise;
  reads.current.controller?.abort();const controller=new AbortController(),sequence=++reads.current.sequence;reads.current.controller=controller;
  const current=()=>!controller.signal.aborted&&reads.current.sequence===sequence;
  const list=api(undefined,undefined,controller.signal).then(d=>{if(current()){setJobs(d.jobs);setListLoading(false);if(!id)setLoading(false);}});
  const detail=id?api(undefined,id,controller.signal).then(d=>{if(current()){setSelected(d.job);setLoading(false);}}):Promise.resolve();
  const promise=Promise.all([list,detail]).then(()=>{if(current())setError('');}).catch(e=>{if(current())throw e;}).finally(()=>{if(current()){setLoading(false);setListLoading(false);reads.current.promise=null;}});
  reads.current.promise=promise;return promise;
 },[]);
 useEffect(()=>{const update=()=>{if(navigationSearch.current===window.location.search)return;navigationSearch.current=window.location.search;setLoading(true);const params=new URLSearchParams(window.location.search);setIntakeTopic(params.get('topic'));const id=params.get('job');if(!id)setSelected(null);refresh(id||undefined).catch(e=>setError(e.message));};queueMicrotask(update);window.addEventListener('popstate',update);return ()=>window.removeEventListener('popstate',update)},[refresh]);

 useEffect(()=>()=>{reads.current.sequence++;reads.current.controller?.abort();},[]);
 useEffect(()=>{if(!selected?.id||busy)return;let alive=true;const id=selected.id;const timer=window.setInterval(()=>{if(document.hidden)return;refresh(id,false).catch(e=>{if(alive)setError('状态更新失败，连接可能中断；旧状态不是正在执行的证明。可点重新读取。'+(e instanceof Error?e.message:''));});},8000);return()=>{alive=false;window.clearInterval(timer);};},[selected?.id,busy,refresh]);
 const choosePanel=useCallback((next:ProductionPanel)=>{setPanel(next);setVisitedPanels(current=>({jobId:selected?.id||null,panels:current.jobId===selected?.id?[...new Set([...current.panels,next])]:[next]}));},[selected?.id]);
 const activePanel=visitedPanels.jobId===selected?.id?panel:'review';
 const panelMounted=(value:ProductionPanel)=>activePanel===value||visitedPanels.jobId===selected?.id&&visitedPanels.panels.includes(value);
 const revealHash=useCallback(()=>{
  let id:string;try{id=decodeURIComponent(window.location.hash.slice(1))}catch{return}if(!id)return;
  const target=document.getElementById(id);
  const owner=target?.closest<HTMLElement>('[data-production-panel]')?.dataset.productionPanel||anchorPanel(id);
  if(owner==='review'||owner==='media'||owner==='delivery')choosePanel(owner);
  requestAnimationFrame(()=>{const visibleTarget=document.getElementById(id);if(!visibleTarget)return;if(visibleTarget instanceof HTMLDetailsElement)visibleTarget.open=true;for(let element=visibleTarget.parentElement;element;element=element.parentElement)if(element instanceof HTMLDetailsElement)element.open=true;visibleTarget.scrollIntoView({block:'start'});});
 },[choosePanel]);
 useEffect(()=>{let initial:ProductionPanel='review';try{initial=anchorPanel(decodeURIComponent(window.location.hash.slice(1)))||'review'}catch{}choosePanel(initial);const frame=requestAnimationFrame(revealHash);window.addEventListener('hashchange',revealHash);return()=>{cancelAnimationFrame(frame);window.removeEventListener('hashchange',revealHash)}},[selected?.id,revealHash,choosePanel]);

 async function load(id:string){setBusy(true);setLoading(true);setError('');try{history.pushState(null,'','?job='+encodeURIComponent(id));navigationSearch.current=window.location.search;await refresh(id);setNote('');}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function action(body:unknown){if(busy)return;setBusy(true);setError('');try{await api(body);await refresh(selected?.id);setNote('')}catch(e){await refresh(selected?.id).catch(()=>{});setError((e as Error).message)}finally{setBusy(false)}}
 async function confirmCancellation(){if(!cancelTarget||busy)return;setBusy(true);setError('');try{await api({action:'cancel_production',id:cancelTarget.id,revision:cancelTarget.revision,mode_epoch:cancelTarget.mode_epoch,reason:cancelReason});setCancelTarget(null);setCancelReason('');await refresh(selected?.id);}catch(e){await refresh(selected?.id).catch(()=>{});setError((e as Error).message);}finally{setBusy(false);}}
 const receipts=selected?.reviews?.filter(r=>r.decision==='external_delivery'&&r.revision===selected.revision)||[];
 const candidateOwnerReview=selected?currentCandidateOwnerReview(selected):null;
 const candidateReviewSummary=selected?candidateOwnerReviewSummary(selected):null;
 const archivedSiteVideo=selected?visibleSiteArchives(selected).some(a=>a.file.role==='video'):false;
 const localReviewDraft=selected?currentLocalReviewDraft(selected):null;
 const [legacyVisitedJob,setLegacyVisitedJob]=useState<string|null>(null);
 useEffect(()=>{if(selected?.id&&!localReviewDraft&&panelMounted('delivery'))setLegacyVisitedJob(selected.id);},[selected?.id,localReviewDraft?.sha256,activePanel,visitedPanels]);
 const automaticClone=useAutomaticClone(selected?.status==='cancelled'?null:selected),cloneProof=selected?automaticCloneProof(selected):null;
 const cloneResultReloads=useRef(new Set<string>()),cloneResultRefreshKey=automaticCloneMainJobRefreshKey(selected,automaticClone.value);
 useEffect(()=>{
  if(!selected||busy||loading||!cloneResultRefreshKey||new URLSearchParams(window.location.search).get('job')!==selected.id||cloneResultReloads.current.has(cloneResultRefreshKey))return;
  const id=selected.id,key=cloneResultRefreshKey;let alive=true;cloneResultReloads.current.add(key);if(cloneResultReloads.current.size>32)cloneResultReloads.current.delete(cloneResultReloads.current.values().next().value!);
  void refresh(id,false).catch(e=>{if(alive&&new URLSearchParams(window.location.search).get('job')===id)setError('新成片已回传，任务详情尚未更新；可重新读取。'+(e instanceof Error?e.message:''));});
  return()=>{alive=false;};
 },[selected?.id,busy,loading,cloneResultRefreshKey,refresh]);
 const automaticMediaRework=selected?currentAutomaticMediaRework(selected):null;
 const localReviewRework=selected?currentLocalReviewRework(selected,localReviewDraft):null;
 const localReworkLabel=localReviewRework?localReviewRework.status==='queued'?'素材返工待领取':localReviewRework.status==='claimed'?(localReviewRework.lease_expired?'素材返工回执待核对':'素材返工已领取'):localReviewRework.status==='blocked'?'素材返工待补充':'素材返工准备已回传':null;
 const nativeFinalDelivered=!!selected&&completedNativeFinalDelivery(selected);
 const postVideoMaterialsStatus=selected?postVideoMaterialReviewStatus(selected):null;
 const archivedSiteMaterials=!!selected&&(nativeFinalDelivered||(ordinaryVoiceArchiveJobs.has(selected.id)||!!postVideoMaterialsStatus)&&['cover_3_4','cover_4_3','promotion'].every(role=>visibleSiteArchives(selected).some(a=>a.file.role===role)));
 const archivedVideoStatus=selected?archivedOrdinaryVideoStatus(selected):null;
 const completedDelivery=selected?(postVideoArchiveJobMatches(selected)?postVideoMaterialsStatus==='交付已完成':completedProductionDelivery(selected)):false;
 const pendingCandidateSummary=selected?pendingNativeCandidateSummary(selected):null;
 const pendingArchivedReviewStatus=selected?pendingArchivedCandidateReviewStatus(selected):null;
 const localReviewStatus=automaticClone.supported&&selected?(completedDelivery?'交付已完成':automaticCloneStatus(selected,automaticClone)):localReviewDraft?(localReviewDraft.milestone.status==='approved'?'成片已通过本人审核':localReviewDraft.milestone.status==='revise'?'成片需修改':'成片待本人审核'):null;
 const cloneExecutionBlocked=automaticClone.supported&&!!automaticClone.value?.clone&&['blocked','provider_failed','provider_unknown'].includes(automaticClone.value.clone.stage);
 const localReviewSummary=localReviewRework?'已批准口播与已有音轨保留。'+localReworkLabel+'；旧版成片已打回并保留为历史，当前准备与缺项见「素材与制作」。':automaticMediaRework?'本次修改意见已保存并排队，后台将继续自动制作下一版，再送你审片；旧版与反馈保留。':automaticClone.supported?'普通版首次审片与本人声音版第二次审片分别保存；首次通过不直接入库。以当前本人声音版、新 SHA 与完整交付包的核验结果继续，发布另行记录。':localReviewDraft?(localReviewDraft.milestone.status==='approved'?'本版审阅视频已通过本人审核，后续封面与宣发按各自节点继续。发布状态另行记录。':localReviewDraft.milestone.status==='revise'?'本版审阅视频已打回修改，当前文件和审核意见保留。':'实际审阅视频已回传，等待本人视听审核。来源与口播稿批准继续保留。'):null;
 const cliRecovery=selected?cliFailureRecovery(selected):null;
 const mediaProgress=selected?currentMediaProductionProgress(selected):null;
 const producedPreparation=!!selected&&currentProducerReceipt(selected);
 const executionLabel=selected?executionStatusLabel(selected):null,evidenceLabel=archivedVideoStatus||postVideoMaterialsStatus||pendingArchivedReviewStatus||candidateReviewSummary||pendingCandidateSummary;
 const detailStatus=(cliRecovery?cliRecoveryLabels[cliRecovery.state]:null)||localReworkLabel|| (automaticMediaRework?'修改意见已排队，继续自动制作':cloneExecutionBlocked?localReviewStatus:localReviewStatus?(archivedVideoStatus||postVideoMaterialsStatus||localReviewStatus):mediaProgress?mediaProgress.label:selected?(executionLabel?(evidenceLabel?executionLabel+' · '+evidenceLabel:executionLabel):evidenceLabel||executionDisplay(selected).label||labels[selected.status]||selected.status):'');
 const stoppedMessage=cliRecovery?null:selected?.status==='paused'?'任务已暂停，已有节点、产物与审核记录保留，等待本人决定后继续。':selected?.status==='failed'?'本次执行已失败，已有节点、产物与审核记录保留，请先核对错误和现有输出。':null;
 const mediaReworkRecovery=selected?currentMediaReworkRecovery(selected):null;
 const cloneReworkBlocked=!!selected&&!!selected.milestones?.some(m=>m.revision===selected.revision&&m.mode_epoch===selected.mode_epoch&&m.status==='revise'&&localClonedVideoReworkUnsupported(m));
 const draft=selected?.drafts?.[0];let content:DraftContent|null=null;try{if(draft)content=JSON.parse(draft.content)}catch{}
 let toolDemonstrationRequired=false;try{if(selected)toolDemonstrationRequired=requiresToolDemonstration(JSON.parse(selected.source_snapshot))}catch{}
 function renderMilestones(wanted:string[]){if(!selected)return null;return <section className="production-review-group">{wanted.includes('source')&&<details><summary>来源与口播的审核规则</summary><p>来源核对身份、日期、事实依据和未知边界；口播核对事实、选题重点、表达及60秒时长规划。拟题可以与原文标题不同，不能把未完成的实测写成已经证实的结论。</p><p>缺录屏、音轨、封面或成片，只记录后续素材与制作待办，不因此退回来源和口播。限流、连接失败表示审核未完成；同版人工批准继续有效。</p></details>}{Object.entries(nodes).filter(([node])=>wanted.includes(node)).map(([node,label])=>{const m=currentProductionMilestone(selected,node),localCover=node==='cover'&&localCoverPreparationStatus(selected);return <section className="milestone-card" key={node} id={node+'-review'} style={{scrollMarginTop:24}}><h4>{label}</h4>{localCover?<LocalCoverPreparation job={selected}/>:<p>{m?(m.status==='approved'?'本节点已通过':labels[m.status]||m.status)+' · 稿v'+m.revision+' / 产物v'+m.artifact_version:node==='source'||node==='script'?(selected.approved_revision?'历史人工批准保留':'等待真实产物'):mediaProgress?(node==='cover'?'本版封面尚未回传，随成片后续材料继续准备':mediaProgress.label):'等待已授权素材与本机启动'}</p>}{!m&&mediaProgress&&['cover','video'].includes(node)&&<a className="text-link" href={mediaProgress.href}>查看当前取材、制作待办与接续入口 →</a>}{m?.status==='pending'&&<p>前一节点尚未通过。本节点暂不能批准或打回；已显示的口播稿仍可在上方保存修改意见。</p>}{m&&<>{currentManualTextReview(selected)&&['source','script'].includes(m.node)&&<p>本版来源与口播由你人工审阅，通过后继续一站到底；后续模式保持自动。</p>}{m.status==='paused'&&selected.reviews?.some(r=>r.decision==='ai_review_error'&&r.revision===m.revision&&r.content_hash===m.artifact_hash)&&<p role="status">审核未完成：审核执行发生技术异常，尚无内容不通过结论。原稿和失败记录均保留。</p>}<CurrentSiteMaterialPreview job={selected} milestone={m}/><details><summary>高级诊断：节点原始数据与哈希</summary><pre>{m.artifact}</pre><small>SHA256 {m.artifact_hash}</small></details>{m.report&&<details><summary>审核理由与检查依据</summary><pre>{JSON.stringify(JSON.parse(m.report),null,2)}</pre></details>}{m.status==='awaiting_human'&&!(m.node==='video'&&JSON.parse(m.artifact).qa?.voice_replacement_id)&&<NodeReview key={m.id} milestone={m} allowApprove={!(m.node==='video'&&automaticClone.supported&&cloneProof)} approveLabel={m.node==='video'&&automaticClone.supported?(cloneProof?'本人声音版通过，完成第二次审片':'普通版通过，继续换本人声音'):undefined} approvalNote={m.node==='video'&&automaticClone.supported?(cloneProof?'本人声音版的第二次审核与新版完整包确认合并在「交付与版本」；当前可填写修改意见，普通版首次批准不能替代二审。':'首次通过确认普通版画面、全文与节奏，并接续现有 Siounex口播 换声；本人声音版仍须另一次审片，不在此完成入库。'):undefined} automaticRework={selected.review_mode==='auto'&&localAutomaticVideoReworkSupported(m)} busy={busy||['waiting_executor','running'].includes(selected.status)} decide={(decision,reason)=>action({action:'milestone_review',id:selected.id,milestone_id:m.id,revision:m.revision,artifact_hash:m.artifact_hash,mode_epoch:m.mode_epoch,decision,note:reason})}/>}{m.node==='video'&&automaticClone.supported&&cloneProof&&m.status==='awaiting_human'&&<a className="text-link" href="#post-video-preparation">审阅本人声音版与新版完整包，一次二审后入库 →</a>}{m.status==='revise'&&JSON.parse(m.artifact).qa?.native_handoff&&<p>原生成片已打回，旧版与意见保留。由已授权原生会话按本版意见制作并回传新视频，保留当前暂停状态。</p>}{m.status==='revise'&&localClonedVideoReworkUnsupported(m)&&<div data-clone-rework-blocked><p role="status">{OWNER_LOCAL_CLONE_REWORK_PAUSE}</p><p>请在当前 Codex 制作对话中说明“按站内本人声音版修改意见接续”。修改意见见本节点审核记录。</p>{localReviewDraft&&<p><a className="text-link" href={'/api/site-archive?id='+encodeURIComponent(selected.id)+'&archive='+encodeURIComponent(localReviewDraft.video)}>下载当前本人声音版 MP4</a>{localReviewDraft.project&&<>{' · '}<a className="text-link" href={'/api/site-archive?id='+encodeURIComponent(selected.id)+'&archive='+encodeURIComponent(localReviewDraft.project)}>下载当前工程与音轨 ZIP</a></>}</p>}</div>}{m.status==='revise'&&!localClonedVideoReworkUnsupported(m)&&!JSON.parse(m.artifact).qa?.native_handoff&&selected.status==='paused'&&['cover','video','promotion'].includes(m.node)&&!mediaReworkRecovery&&<><label>本次返工理由<Textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={4000} disabled={busy} aria-label="本次媒体返工理由"/></label><Button disabled={busy||!note.trim()} onClick={()=>action({action:'media_rework',id:selected.id,milestone_id:m.id,revision:m.revision,artifact_hash:m.artifact_hash,mode_epoch:m.mode_epoch,note})}>按意见继续此节点返工</Button></>}{m.status==='paused'&&<><label>转人工检查的理由<Textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={4000} disabled={busy} aria-label="转人工检查理由"/></label><Button disabled={busy||!note.trim()} onClick={()=>action({action:'decision',id:selected.id,choice:selected.review_mode==='auto'&&['source','script'].includes(m.node)?'manual_text':'manual',note})}>{selected.review_mode==='auto'&&['source','script'].includes(m.node)?'本次人工审稿，后续自动':'确认转人工检查'}</Button></>}</>}</section>})}<small>来源与口播审核通过后继续准备素材；素材待补不撤销本版批准。新草稿仍需重新审核。连续自动返工默认最多2次；达到上限后可按已保存意见决定再做一版，未知调用结果先核对。</small></section>;}
 // The selected detail is the saved mode shown by this page's controls.
 // A parallel list read must not label that same task with an older mode.
 const visibleJobs=jobs.filter(job=>showTests||!job.is_test).map(job=>job.id===selected?.id?{...job,review_mode:selected.review_mode}:job);
 const reviewTask=selected&&!['waiting_executor','running'].includes(selected.status)?Object.keys(nodes).map(node=>currentProductionMilestone(selected,node)).find(m=>m?.status==='awaiting_human'&&!(m.node==='video'&&JSON.parse(m.artifact).qa?.voice_replacement_id)):null;
 const reviewTaskLabel:Record<string,string>={source:'核验来源',script:'审核口播',cover:'审核封面',video:'审阅成片',promotion:'审阅宣发',delivery:'检查交付'};
 return <div className="production-page">
  <header className="production-heading"><div><h1>制作工作台</h1><p>读稿、审阅，接着完成下一步。</p></div><Button variant="outline" disabled={busy||loading} onClick={()=>refresh(selected?.id).catch(e=>setError(e.message))}>重新读取与恢复连接</Button></header>
  {intakeTopic&&<ProductionIntake topicId={intakeTopic} onRegistered={job=>{setSelected(job);history.pushState(null,'','?job='+job.id);navigationSearch.current=window.location.search;setIntakeTopic(null);refresh(job.id).catch(e=>setError(e.message))}}/>}
  {error&&<p className="production-page-error" role="alert">{error}</p>}
  <Dialog open={!!cancelTarget} onOpenChange={open=>{if(!open&&!busy)setCancelTarget(null);}}><DialogContent><DialogHeader><DialogTitle>取消制作</DialogTitle><DialogDescription>“{cancelTarget?.title}”将退出制作队列，不再继续找素材、写稿或制作。已有稿件、成果和记录保留，可在“已取消”中查看。</DialogDescription></DialogHeader><label htmlFor="production-cancel-reason">取消原因（选填）</label><textarea id="production-cancel-reason" rows={3} maxLength={1000} placeholder="例如：选题不合适，或缺少合适素材" value={cancelReason} disabled={busy} onChange={event=>setCancelReason(event.target.value)}/><DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setCancelTarget(null)}>保留制作</Button><Button disabled={busy} onClick={confirmCancellation}>{busy?'正在取消…':'确认取消制作'}</Button></DialogFooter></DialogContent></Dialog>
  <div className="production-layout">
   <aside className="production-list" aria-label="制作任务"><div className="production-list-heading"><h2>我的任务</h2><span>{listLoading?'…':error&&!jobs.length?'未读取':visibleJobs.length}</span></div><label className="test-toggle"><input type="checkbox" checked={showTests} onChange={event=>setShowTests(event.target.checked)}/> 显示隔离验收任务</label>
    {listLoading?<p role="status">正在读取制作任务…</p>:error&&!visibleJobs.length?<p>任务列表未能读取，请重新尝试。</p>:<><ProductionTaskGroups jobs={visibleJobs} selectedId={selected?.id||null} busy={busy} onSelect={load} onCancel={job=>{setCancelReason('');setCancelTarget(job);}}/>{!visibleJobs.length&&<div className="production-list-empty"><a className="text-link" href="/">从选题库开始</a></div>}</>}
   </aside>
   <article className="production-result" aria-busy={loading||busy} onClickCapture={event=>{if(event.target instanceof Element&&event.target.closest('a[href^="#"]'))requestAnimationFrame(revealHash)}}>
    {loading?<div className="production-loading" role="status"><p>正在读取任务与已保存的成果…</p><div/><div/><div/></div>:selected?.status==='cancelled'?<section className="production-cancelled-record"><span className="production-status">已取消制作</span><h2>{JSON.parse(selected.source_snapshot).title}</h2><p>此任务已退出制作队列，后续自然轮不会继续取材或制作。</p><p>取消原因：{String(selected.reviews?.find(r=>r.decision==='production_cancelled')?.note||'本人取消制作')}</p><p>已有稿件、成果和记录继续保留。</p><LocalReviewDraftPreview job={selected}/>{selected.drafts?.map(d=><details key={d.revision}><summary>已保存稿件 v{d.revision}</summary><pre className="production-saved-script">{JSON.parse(d.content).script}</pre></details>)}<HistoricalDiagnostics key={'diagnostics-'+selected.id} job={selected} cancelled/></section>:selected?<>
     <header className="production-current"><div className="production-current-meta"><span className="production-status">{detailStatus}</span><span>口播 v{selected.revision}{selected.is_test?' · 隔离验收测试':''}</span></div><h2>{JSON.parse(selected.source_snapshot).title}</h2><p className="production-saved-mode">当前已保存：{productionModeLabel(selected.review_mode)}{busy?' · 正在处理操作，等待保存结果':''}</p>
      {(selected.facts||localReviewSummary)&&<p className="production-current-summary">{cloneExecutionBlocked?'普通版首次审片已通过；当前本人换声受阻，尚未完成声音版二审。首次批准保留，按下方具体失败继续原请求，无需重新首审。':localReviewRework?localReviewSummary:postVideoMaterialsStatus==='交付已完成'?'本版成片、双封面、宣发和完整交付包已完成审核并归档。发布状态另行记录。':postVideoMaterialsStatus==='等待交付审核'?'本版成片、双封面与宣发已通过；完整交付包已归档，等待交付审核。':postVideoMaterialsStatus?'本版成片已通过。封面与宣发分别按当前节点审核；文件归档不代替质量认可或发布登记。':localReviewSummary|| (pendingArchivedReviewStatus?'完整成片已归档并回传当前审核节点，等待本人审片。后续制作按本次审核结果继续。':candidateOwnerReview?.reviewed_voice_kind==='owner-cloned'&&archivedVideoStatus?'本人声音版已确认；当前成片、交付包与正式节点已回传，发布状态另行记录。':candidateReviewSummary?candidateReviewSummary+'；正式视频节点和发布状态另行记录。':selected.facts?.summary)}</p>}
      {!cliRecovery&&!mediaProgress&&!localReviewDraft&&!archivedVideoStatus&&!pendingArchivedReviewStatus&&!postVideoMaterialsStatus&&(pendingCandidateSummary||executionDisplay(selected).message)&&(!candidateReviewSummary||executionDisplay(selected).activeLease||executionDisplay(selected).expired)&&<p className="production-current-summary" role="status">{pendingCandidateSummary||executionDisplay(selected).message}</p>}
      {stoppedMessage&&<p className="production-current-summary" role="status">{stoppedMessage}</p>}
      {reviewTask&&<a className="production-current-task" href={reviewTask.node==='video'&&automaticClone.supported&&cloneProof?'#post-video-preparation':'#'+reviewTask.node+'-review'}>当前待办：{reviewTask.node==='video'&&automaticClone.supported?(cloneProof?'本人声音版二审':'普通版首次审片'):reviewTaskLabel[reviewTask.node]} →</a>}{automaticClone.supported&&!reviewTask&&<a className="production-current-task" href="#automatic-clone">查看本人换声与二次审核进度 →</a>}
      {selected.facts?.execution_condition==='result_unknown'&&<p role="alert">执行租约已过期，结果未知。先核对输出及回执，禁止直接重做。</p>}
      {selected.error&&!cliRecovery&&<ExecutionError reason={selected.error===SOURCE_INPUT_REQUIRED?'来源准备暂停，请查看下方正文／配图的具体读取结果':selected.error}/>}
      {cliRecovery&&<ExecutionRecovery job={selected} busy={busy||loading} note={note} onNote={setNote} onRefresh={()=>refresh(selected.id).catch(e=>setError(e.message))} onContinue={()=>action({action:'decision',id:selected.id,choice:'retry',note})}/>}
      {mediaProgress&&<MediaProductionProgress job={selected} busy={busy||loading} onRefresh={()=>refresh(selected.id).catch(e=>setError(e.message))} onStartVideo={request_id=>action({action:'media_scope_confirm',id:selected.id,binding:scopeBinding(selected),request_id,scope:'private-video',confirmed:true,current_id:selected.media_continuation?.current_id||''})}/>}
      {mediaReworkRecovery&&<section className="production-rework-recovery" aria-label="继续已保存的媒体修改" data-media-rework-recovery><h3>接着完成本次修改</h3><p>{selected.reworks>2?(mediaReworkRecovery.automaticSupported?'自动返工已到默认上限。你可以授权按本次反馈再做一版，累计记录保留。':'本节点已到默认连续返工上限，下一步由已授权制作会话回传修改后的文件。'):'本次修改意见已经保存，可以直接继续当前任务。'}</p><p>已保存的{nodes[mediaReworkRecovery.milestone.node]}修改意见：</p><blockquote>{mediaReworkRecovery.reason}</blockquote><p>{mediaReworkRecovery.automaticSupported?'继续后复用已批准口播和现有音轨、素材，完成下一版后回到这里等你审片。':'按已保存意见继续当前节点返工，由已授权制作会话回传修改后的文件，随后重新审阅。'}</p>{mediaReworkRecovery.matches&&mediaReworkRecovery.supported?<Button disabled={busy} onClick={()=>action({action:'media_rework',id:selected.id,milestone_id:mediaReworkRecovery.milestone.id,revision:mediaReworkRecovery.milestone.revision,artifact_hash:mediaReworkRecovery.milestone.artifact_hash,mode_epoch:mediaReworkRecovery.milestone.mode_epoch,note:mediaReworkRecovery.reason})}>{busy?'正在保存继续决定…':mediaReworkRecovery.automaticSupported?'按已保存意见继续自动修改':'按已保存意见继续此节点返工'}</Button>:!mediaReworkRecovery.matches?<><p role="alert">当前节点与任务反馈不一致，请重新读取后核对本次意见。</p><Button variant="outline" disabled={busy||loading} onClick={()=>refresh(selected.id).catch(e=>setError(e.message))}>重新读取当前反馈</Button></>:<><p>此节点尚未接通自动回传下一版；达到默认自动上限后，需要由已授权制作会话继续制作并回传。</p><a className="production-current-task" href="#production-recovery">查看本机制作与回传记录 →</a></>}<a className="text-link" href={'#'+mediaReworkRecovery.milestone.node+'-review'}>查看本版文件与审核记录 →</a></section>}
      {stoppedMessage&&!mediaReworkRecovery&&<a className="production-current-task" href="#production-recovery">查看暂停原因与恢复操作 →</a>}
     </header>
     <Tabs value={activePanel} onValueChange={value=>choosePanel(value as ProductionPanel)} className="production-tabs">
      <ContentMotionStatus job={selected}/><TabsList variant="line" className="production-panel-tabs" aria-label="制作内容"><TabsTrigger value="review">稿件与审阅</TabsTrigger><TabsTrigger value="media">素材与制作</TabsTrigger><TabsTrigger value="delivery">交付与版本</TabsTrigger></TabsList>
      <TabsContent value="review" forceMount hidden={activePanel!=='review'} data-production-panel="review" className="production-panel">{panelMounted('review')&&<>
       <SourceInput key={'source-'+selected.id+'-'+selected.revision+'-'+selected.mode_epoch} job={selected} onSaved={j=>setSelected(current=>current?.id===j.id?j:current)}/>
       {content&&draft&&<><ScriptView job={selected} draft={draft} content={content}><ScriptFeedback key={selected.id+'-'+draft.revision+'-'+selected.mode_epoch} job={selected} onSaved={j=>setSelected(current=>current?.id===j.id?j:current)}/><details className="script-lock-options"><summary>使用完整原稿锁稿</summary><ScriptLock key={'lock-'+selected.id+'-'+draft.revision+'-'+selected.mode_epoch} job={selected} onSaved={j=>setSelected(current=>current?.id===j.id?j:current)}/></details></ScriptView></>}
       {!content&&<div className="production-empty-draft"><h3>稿件还未回传</h3><p>{executionDisplay(selected).emptyDraftMessage}</p></div>}
       <div className="production-section-heading"><h3>来源与稿件审核</h3><p>先核对来源，再分别确认口播与分镜。</p></div>
       {renderMilestones(['source','script'])}
       {content&&draft?<>{selected.status==='awaiting_review'&&!receipts.length&&!selected.milestones?.length&&selected.review_mode==='node'&&<div className="review-actions"><Button disabled={busy} onClick={()=>action({action:'review',id:selected.id,revision:draft.revision,content_hash:draft.content_hash,decision:'approve',note:''})}>审核历史口播稿</Button><label>历史稿返工意见<Textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={4000} disabled={busy} aria-label="历史口播稿返工意见"/></label><Button variant="outline" disabled={busy||!note.trim()} onClick={()=>action({action:'review',id:selected.id,revision:draft.revision,content_hash:draft.content_hash,decision:'revise',note})}>打回历史口播稿</Button></div>}</>:<p>{executionDisplay(selected).emptyDraftMessage}</p>}
       <HistoricalPreparation archived={false} produced={producedPreparation&&productionNextStep(selected).kind==='materials'}><ProductionHandoff job={selected} busy={busy} onContinue={binding=>action({action:'continue',id:selected.id,binding})}/></HistoricalPreparation>
      </>}</TabsContent>
      <TabsContent value="media" forceMount hidden={activePanel!=='media'} data-production-panel="media" className="production-panel">{panelMounted('media')&&<Suspense fallback={<p role="status">正在载入素材与制作…</p>}><DeferredPanel onReady={revealHash}>
       <MediaProductionProgress job={selected} busy={busy||loading} onRefresh={()=>refresh(selected.id).catch(e=>setError(e.message))} onStartVideo={request_id=>action({action:'media_scope_confirm',id:selected.id,binding:scopeBinding(selected),request_id,scope:'private-video',confirmed:true,current_id:selected.media_continuation?.current_id||''})}/>
       {localReviewRework?<details className="production-technical" data-rejected-local-review><summary>旧版审阅视频（已打回，供核对）</summary><LocalReviewDraftPreview key={selected.id+'-'+selected.revision} job={selected}/></details>:<LocalReviewDraftPreview key={selected.id+'-'+selected.revision} job={selected}/>}
       {selected.facts?.candidate_record_id?.startsWith('native_video_')&&!selected.facts.files_archived?<><section className="milestone-card"><h3>{candidateOwnerReview?'当前视频候选待归档':'当前视频候选待归档与审阅'}</h3>{candidateOwnerReview?<NativeCandidateOwnerReviewNotice review={candidateOwnerReview} archived={false}/>:<p>本地视频候选已登记，文件尚未完成站内归档，也未代替本人审片。历史候选的批准和下载包不能沿用到当前候选。</p>}<small>当前候选SHA256：{selected.facts.candidate_video_sha256}</small></section><details><summary>历史视频候选</summary><PrivateReview job={selected}/></details></>:<PrivateReview job={selected}/>}
       {candidateOwnerReview&&selected.facts?.files_archived&&<section className="milestone-card"><h3>当前候选的聊天审阅记录</h3><NativeCandidateOwnerReviewNotice review={candidateOwnerReview} archived={true} formalStatus={archivedSiteVideo?currentSiteVideoMilestone(selected)?.status:undefined}/></section>}
       <NativeVideoVersions job={selected}/>
       <AutomaticClone job={selected} state={automaticClone}/>{!automaticClone.supported&&!(selected.review_mode==='auto'&&localReviewDraft)&&!ordinaryVoiceArchiveJobs.has(selected.id)&&<VoiceReplacement job={selected} onChanged={()=>refresh(selected.id).catch(e=>setError(e.message))}/>}
       {renderMilestones(['cover','video'])}
       {archivedSiteVideo&&!localReviewDraft&&<NativeHandoff job={selected}/>}
       <HistoricalPreparation archived={(archivedSiteVideo||!!localReviewDraft)&&!localReviewRework} produced={producedPreparation}>
       <MediaContinuation key={selected.id+'-'+selected.revision+'-'+selected.mode_epoch} job={selected} onSaved={j=>setSelected(current=>current?.id===j.id?j:current)}/>
       <MediaPreparation job={selected}/>
       {(!archivedSiteVideo||!!localReviewDraft)&&<NativeHandoff job={selected}/>}
       <div id="recording-input"><AudioIntake key={'audio-'+selected.id} jobId={selected.id} revision={selected.revision} epoch={selected.mode_epoch}/></div><div id="media-plan-input"><MediaPlanner key={'media-plan-'+selected.id} jobId={selected.id} revision={selected.revision} epoch={selected.mode_epoch}/></div>
       <SeriesLibrary key={selected.id} jobId={selected.id} revision={selected.revision} epoch={selected.mode_epoch} initial={selected.series} onSaved={async()=>{const d=await api(undefined,selected.id);setSelected(current=>current?.id===d.job.id?d.job:current);}}/>
       </HistoricalPreparation>
       <details className="production-technical"><summary>技术合成验证与历史素材</summary><TechnicalPreviewCard job={selected}/>
        <details><summary>历史素材回传</summary><PublicityAssetFiles job={selected}/></details>
       </details>
      </DeferredPanel></Suspense>}</TabsContent>
      <TabsContent value="delivery" forceMount hidden={activePanel!=='delivery'} data-production-panel="delivery" className="production-panel">{panelMounted('delivery')&&<Suspense fallback={<p role="status">正在载入交付与版本…</p>}><DeferredPanel onReady={revealHash}>
       <PostVideoPreparation key={'post-video-'+selected.id} job={selected} onApproved={async()=>{await refresh(selected.id)}}/>
       <div hidden={!!localReviewDraft} data-legacy-promotion-flow>
       {(!localReviewDraft||legacyVisitedJob===selected.id)&&<>{archivedSiteMaterials?<><p data-current-site-promotion>本版封面及宣发已存入本站私有归档，正式审核及下载见下方。<a className="text-link" href="#native-video-archive">查看本站归档文件 →</a></p>{nativeFinalDelivered?<details data-historical-library-promotion><summary>历史 Library 宣发交付记录</summary><p>仅保留历史审计摘要；当前成品及完整交付包使用下方本站归档。</p><pre>{JSON.stringify(selected.reviews?.filter(r=>['promo_delivery_v1','external_delivery','private_publicity_files'].includes(String(r.decision)))||[],null,2)}</pre></details>:<HistoricalPromoDelivery key={'history-'+selected.id} jobId={selected.id} active={activePanel==='delivery'&&!localReviewDraft}/>}</>:<PromoDelivery key={'delivery-'+selected.id} jobId={selected.id} active={activePanel==='delivery'&&!localReviewDraft}/>}
       {renderMilestones(['promotion','delivery'])}</>}
       </div>
       <NativeVideoArchive job={selected}/>
       <PublicationActions key={'publication-'+selected.id} jobId={selected.id} onChanged={()=>refresh(selected.id)}/>
       <PublicationReports reports={selected.publication_reports||[]}/>
       <section data-historical-external-receipts={archivedSiteMaterials||undefined}><h3>{archivedSiteMaterials?'历史外部交付回执（本站归档见上方）':'真实交付回执'}</h3>{archivedSiteMaterials&&<p>以下仅保留外部制作的历史回执；当前本站归档文件与正式审核状态见上方。</p>}{receipts.map(r=>{const d=JSON.parse(String(r.note));return <div key={String(r.id)} className="milestone-card"><p>真实成果已回传 · 绑定口播稿v{String(r.revision)} · {d.duration}秒 · {selected.publication_reports?.length?'此制作回执未包含后来登记的发布情况':'此回执未记录对外发布'}</p><p>{d.limits}</p>{!nativeFinalDelivered&&r.id===receipts[0]?.id&&<VerifiedMediaPreview assets={d.assets}/>} {d.assets.map((a:{node:string;library_file_id:string;version:number;file_name:string;sha256:string})=><p key={a.library_file_id}>{!nativeFinalDelivered&&r.id===receipts[0]?.id?<a target="_blank" rel="noopener noreferrer" href={'https://chatgpt.com/api/library/files/'+a.library_file_id+'/download'}>打开Library当前文件：{a.file_name}</a>:<span>{a.file_name}（历史绑定，不提供当前文件冒充旧版）</span>} · 回执绑定文件版本{a.version}<small>文件可能在Library继续更新；审核前核对SHA256：{a.sha256}</small></p>)}<details><summary>制作与质量检查回执（声音未试听）</summary><pre>{JSON.stringify(d,null,2)}</pre></details>{nativeFinalDelivered?<p>历史交付回执，仅保留审核记录；当前交付见本站正式归档。</p>:r.id!==receipts[0]?.id?<p>历史交付回执，仅供追溯；当前审核使用最新回执。</p>:selected.approved_revision!==selected.revision?<><p>对话中已批准本版口播稿。网站需用你的登录身份登记既有批准，成片仍须独立审核。</p><Button disabled={busy} onClick={()=>action({action:'sync_existing_approval',id:selected.id,receipt_id:r.id})}>用登录身份同步既有稿件批准记录</Button></>:<Button variant="outline" disabled={busy} onClick={()=>action({action:'sync_existing_approval',id:selected.id,receipt_id:r.id})}>恢复交付节点记录（不重新制作）</Button>}</div>})}{!receipts.length&&<p>尚无外部交付回执。</p>}</section>
       <HistoricalPromoPackage key={'promo-'+selected.id} jobId={selected.id} revision={selected.revision}/>
       <details><summary>外部制作请求与回传记录</summary><section><h3>外部制作请求与真实回传</h3>{Object.entries(STAGE_LABELS).map(([stage,label])=>{const record=selected.stages?.find(s=>s.stage===stage&&s.review_revision===selected.approved_revision);return <div className="stage-line" key={stage}><b>{label}</b><span>{record?.result?'外部成果已回传，需审核':record?'请求已保存，执行器尚未接通':'未启动'}</span>{record?.result&&<a href={JSON.parse(record.result).url} target="_blank" rel="noopener noreferrer">打开真实成果</a>}<Button variant="outline" disabled={busy||selected.status!=='approved'} onClick={()=>action({action:'stage',id:selected.id,stage,revision:selected.approved_revision,content_hash:selected.approved_hash})}>保存请求</Button></div>})}<small>保存请求不会收费或发布。质量批准与付费/发布授权分开。</small></section></details>
      </DeferredPanel></Suspense>}</TabsContent>
     </Tabs>
     <details className="production-task-management" id="production-recovery"><summary>任务设置、恢复与执行记录</summary>
      <p>任务 {selected.id}{selected.is_test?' · 隔离验收测试':''}</p><p>执行 {selected.attempt}/6 · 累计返工 {selected.reworks}次（默认自动上限2次） · AI审核 {selected.ai_calls}/8</p>
      {selected.intake&&<ConfirmedIntake value={selected.intake}/>}
      {selected.facts?.editorial_delivery&&<section className="milestone-card" aria-label="官方演示解读交付"><h3>{selected.facts.editorial_delivery.label}</h3><p>{selected.facts.editorial_delivery.description}</p><p>本版由本人确认按官方演示解读交付，不记作本人实操或独立能力测试。</p></section>}
      {selected.facts&&<section className="milestone-card" aria-label="任务事实"><h3>{candidateReviewSummary||selected.facts.summary}</h3>{selected.facts.material_required&&<p role="status">{toolDemonstrationRequired?'真实工具操作素材':'制作素材'}：{completedDelivery?'当前成片与完整交付已通过正式节点并归档；制作前缺口保留为历史':selected.facts.material_gate==='native-completed-awaiting-review'?'原生制作已实际完成并归档，成片按当前正式节点审阅；制作前缺口保留为历史':selected.facts.editorial_delivery?(toolDemonstrationRequired?'本版已确认按官方演示解读交付，原实操预检保留为历史':'本版已确认按官方演示解读交付，原素材预检保留为历史'):selected.facts.material_gate==='blocked'?(toolDemonstrationRequired?'待补连续实演；文字返工可继续，禁止进入媒体合成':'待补素材或核查；文字返工可继续，禁止进入媒体合成'):(toolDemonstrationRequired?'视频与取帧已绑定，仍需核对实际操作语义':'素材已绑定，仍需核查画面、声音与使用范围')}。{!completedDelivery&&!selected.facts.editorial_delivery&&selected.facts.material_problems.join('；')}</p>}<p>口播稿：{selected.facts.script_approved?'已批准':'未批准'} · 成片：{selected.facts.video_approval==='owner-node-approved'?'当前视频节点已在本站通过':selected.facts.video_approval==='owner-oral-reported'?'用户口头确认通过':candidateOwnerReview?candidateOwnerReview.decision==='approved'?'普通配音候选聊天审阅通过，正式节点仍待审':'普通配音候选需修改，正式节点未批准':selected.facts.candidate_present?'独立待审':'尚无候选'}</p><p>文件归档：{selected.facts.files_archived?'已绑定固定版本':'未完成'} · 完整ZIP：{selected.facts.complete_package_archived?'已绑定固定版本':'未完成'}{selected.facts.release_package_ready===true&&<> · 发布包已完成</>} · 发布登记：{selected.facts.publication_recorded?'另有发布记录':'未登记'}</p><p>口头确认不会冒充网站按钮审批，也不授权外部发布。旧暂停操作仍保留其真实失败状态。</p>{selected.facts.execution_condition==='result_unknown'&&<p role="alert">执行租约已过期，结果未知。先核对输出及回执，禁止直接重做。</p>}</section>}
      <section className="milestone-card"><h3>执行器连接</h3>{mediaProgress?<p role="status">{mediaProgress.message}</p>:!archivedVideoStatus&&!pendingArchivedReviewStatus&&!postVideoMaterialsStatus&&(pendingCandidateSummary||executionDisplay(selected).message)&&<p role="status">{pendingCandidateSummary||executionDisplay(selected).message}</p>}<p>{executionDisplay(selected).connection}</p>{selected.runtime?.executors.map(x=><p key={String(x.executor_id)}>{String(x.executor_id)} · {executorConnectionDetail(x)}{x.phase?' 当前记录：'+String(x.phase)+'。':''}</p>)}{!!selected.runtime?.isolated_executor_count&&<small>已排除 {selected.runtime.isolated_executor_count} 条隔离测试记录；这些心跳不代表真实后台或本任务已领单。</small>}<p>前台在线心跳与后台定时巡检分别显示。是否已领单、已产出或待人工审阅，以本任务的租约、真实产物和审核记录为准。</p></section>
      <ExecutionFailures job={selected}/>
      <ModeOptions value={selected.review_mode} disabled={busy||cliRecovery?.result_unknown===true||selected.status==='running'||selected.milestones?.some(m=>m.status==='ai_running')===true} onChange={mode=>action({action:'mode',id:selected.id,mode,mode_epoch:selected.mode_epoch})}/>{selected.error&&<ExecutionError reason={selected.error===SOURCE_INPUT_REQUIRED?'来源准备暂停，请查看下方正文／配图的具体读取结果':selected.error}/>}<label>审核或恢复理由<Textarea disabled={busy} aria-label="审核或恢复理由" value={note} onChange={e=>setNote(e.target.value)} placeholder="写下修改意见、核验依据或恢复决定的理由" maxLength={2000}/></label><p>填写理由后才能提交人工决定；当前记录未变化前，按钮不会执行。</p>{selected.status!=='paused'&&selected.status!=='completed'&&<Button variant="outline" disabled={busy||!note.trim()||selected.status==='running'} onClick={()=>action({action:'decision',id:selected.id,choice:'stop',note})}>设为备用（可恢复）</Button>}{['failed','paused','running'].includes(selected.status)&&<div className="review-actions">{manualTextReviewAvailable(selected)&&<Button disabled={busy||!note.trim()} onClick={()=>action({action:'decision',id:selected.id,choice:'manual_text',note})}>本次人工审稿，后续自动</Button>}{!cloneReworkBlocked&&<Button variant="outline" disabled={busy||!note.trim()||cliRecovery?.result_unknown===true} onClick={()=>action({action:'decision',id:selected.id,choice:'manual',note})}>全程转人工节点</Button>}{!cloneReworkBlocked&&!cliRecovery&&<Button variant="outline" disabled={busy||!note.trim()} onClick={()=>action({action:'decision',id:selected.id,choice:'retry',note})}>确认恢复（不重置预算）</Button>}<Button variant="outline" disabled={busy||!note.trim()} onClick={()=>action({action:'decision',id:selected.id,choice:'stop',note})}>停止并保留历史</Button></div>}
 {selected.approved_revision===selected.revision&&selected.approved_hash&&<Button variant="outline" disabled={busy||!note.trim()} onClick={()=>action({action:'reopen',id:selected.id,revision:selected.revision,content_hash:selected.approved_hash,note})}>修改已批准稿件（后续批准失效）</Button>}
      <section><h3>本机制作与恢复</h3><p>网站保存版本与待办。定时检查负责可执行的授权待办；原生制作会话仍需接手。真实领取和成果回传后才表示对应步骤已执行。断线、缺实演素材或归档失败会保留检查点并等待接续，不自行重复生成或收费。</p>{selected.operations?.map(op=>{const r=op.result?JSON.parse(op.result):null;return <div className="milestone-card" key={op.id}><h4>{nodes[op.node]||op.node}</h4><p>{selected.facts?.operations.find(x=>x.id===op.id)?.execution_condition==='result_unknown'?'租约超时，结果未知；请核对现有文件与回执':({queued:'已排队，等待制作程序启动',running:'已领取；本机执行或等待归档接力',prepared:'成果回执已保存，正在恢复节点回传',completed:'成果已回传，不代表质量通过',paused:'已暂停，需要核对回执',abandoned:'已结束；保留全部历史'} as Record<string,string>)[op.status]||op.status} · 稿v{op.revision}</p>{JSON.parse(op.plan).test_only&&<p>隔离技术验收：这些文件不是选题成果，不会批准稿件或推进制作节点。</p>}{op.error&&<ExecutionError reason={op.error}/>}{op.status==='paused'&&<div className="review-actions"><Button disabled={busy||!note.trim()} onClick={()=>action({action:'operation_decision',id:selected.id,operation_id:op.id,checkpoint_version:op.checkpoint_version,choice:'resume_receipt',note})}>核对完整回执后恢复接力</Button><Button variant="outline" disabled={busy||!note.trim()} onClick={()=>action({action:'operation_decision',id:selected.id,operation_id:op.id,checkpoint_version:op.checkpoint_version,choice:'abandon',note})}>结束此操作并保留文件</Button></div>}{r?.assets?.map((a:{library_file_id:string;file_name:string;version:number;sha256:string})=><p key={a.library_file_id}><a href={'https://chatgpt.com/api/library/files/'+a.library_file_id+'/download'} target="_blank" rel="noopener noreferrer">{a.file_name}</a> · 文件版本{a.version}<small>核对SHA256 {a.sha256}</small></p>)}<details><summary>已保存的检查点与执行回执</summary><pre>{JSON.stringify({checkpoint:JSON.parse(op.checkpoint),result:r},null,2)}</pre></details></div>})}{!selected.operations?.length&&<p>尚无绑定本机素材的制作操作；执行器先核对已有文件与授权。</p>}</section>
      <HistoricalDiagnostics key={'diagnostics-'+selected.id} job={selected}/>
      <div className="production-notice">站内待办由已配置的执行器按周期检查；原生视频仍需具备工具的制作会话接手。领取、准备和成片回传分别记录，人工审核不会自行通过。缺连续实演素材或定时Library归档能力时，媒体制作暂停；封面AI审核须实际看图。成片声音和连续画面理解仍待人工，不会把技术解码当作听过或看懂。</div>
     </details>
    </>:error?<div className="production-empty"><h2>任务暂时未能读取</h2><p>已保存的稿件和审核记录仍保留。可重新读取后继续。</p></div>:<div className="production-empty"><h2>{visibleJobs.length?'选择一项任务，开始审阅':'把一个选题带到这里'}</h2><p>{visibleJobs.length?'从左侧选择任务，查看当前稿件、制作状态与交付版本。':'在选题库确认制作后，这里会保存稿件、审阅意见和真实成果。'}</p>{!visibleJobs.length&&<a className="text-link" href="/">去选题库挑选题</a>}</div>}
   </article>
  </div>
 </div>;
}
