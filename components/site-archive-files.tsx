'use client';
import {useEffect,useState} from 'react';
import {currentBrandCoverId,warehouseBrandCover} from '@/lib/cover-branding.mts';
import {currentJobV6Outro} from '@/lib/outro-upgrade-contract.mts';
import {finalNativeSiteArchivesFromFacts as finalNativeSiteArchives} from '@/lib/native-site-final-view.mts';
import type {ProductionJob,Milestone} from '@/lib/production-contract';
import {validSiteArchive,postVideoArchiveJobMatches,pendingCandidateArchiveJobMatches,type SiteFileArchive} from '@/lib/site-file-archive-contract.mts';

export function hasCurrentFinalRetention(job:ProductionJob):boolean{
 const retention=(job.facts as unknown as {archive_retention?:unknown}|undefined)?.archive_retention;
 return !!retention&&typeof retention==='object'&&(retention as {rule?:unknown}).rule==='current-final-per-role';
}
export function SiteArchiveRetentionNotice({job}:{job:ProductionJob}){
 if(!hasCurrentFinalRetention(job))return null;
 const retention=(job.facts as unknown as {archive_retention:{status?:unknown;protected?:unknown;last_error?:unknown;pending_count?:unknown}}).archive_retention;
 const protectedRecords=Array.isArray(retention.protected)?retention.protected:[];
 const complete=retention.status==='complete'&&protectedRecords.length===0;
 const pendingCount=typeof retention.pending_count==='number'&&Number.isSafeInteger(retention.pending_count)&&retention.pending_count>=0?retention.pending_count:null;
 const error=typeof retention.last_error==='string'?retention.last_error.trim().slice(0,1500):'';
 const status=complete?'complete':protectedRecords.length?'protected':['partial','failed','protected'].includes(String(retention.status))?String(retention.status):'pending';
 return <div data-current-final-retention data-retention-status={status}>
  <p>按项目与成果类型仅保留当前定稿的规则已启用。</p>
  <p>{complete?'网站旧归档清理已核验；历史哈希与审核记录保留。':'规则已启用，旧成果清理待完成。'}{!complete&&retention.status==='partial'?'已完成部分本站旧归档清理。':''}{!complete&&retention.status==='failed'?'最近一次清理未完成。':''}{!complete&&pendingCount!==null?`待处理 ${pendingCount} 项。`:''}</p>
  {protectedRecords.length>0&&<div data-retention-protected><p>部分保留原因（{protectedRecords.length} 项）：</p><ul>{protectedRecords.slice(0,20).map((value,index)=>{const record=value&&typeof value==='object'?value as Record<string,unknown>:{};return <li key={index} style={{overflowWrap:'anywhere'}}>{typeof record.reason==='string'&&record.reason.trim()?record.reason.slice(0,1500):'保留原因待核对'}{typeof record.site_archive_id==='string'&&/^sitefile_[a-f0-9]{64}$/.test(record.site_archive_id)&&<small> · {record.site_archive_id}</small>}</li>;})}</ul>{protectedRecords.length>20&&<p>另有 {protectedRecords.length-20} 项保留记录。</p>}</div>}
  {!complete&&error&&<p data-retention-error>最近清理错误：{error}</p>}
 </div>;
}
export function siteArchiveWasDeleted(job:ProductionJob,archiveId?:string,sha256?:string):boolean{
 if(!hasCurrentFinalRetention(job)||!/^sitefile_[a-f0-9]{64}$/.test(archiveId||'')||!/^[a-f0-9]{64}$/.test(sha256||''))return false;
 const retention=(job.facts as unknown as {archive_retention:{deleted?:unknown}}).archive_retention;
 return Array.isArray(retention.deleted)&&retention.deleted.some(value=>{
  if(!value||typeof value!=='object')return false;const record=value as Record<string,unknown>;
  return record.site_archive_id===archiveId&&record.sha256===sha256&&typeof record.deleted_at==='string'&&Number.isFinite(Date.parse(record.deleted_at))&&/^sitefile_[a-f0-9]{64}$/.test(String(record.current_archive_id||''))&&typeof record.policy_id==='string'&&record.policy_id.length>0;
 });
}
export function visibleSiteArchives(job:ProductionJob):SiteFileArchive[]{
 const finals=finalNativeSiteArchives(job);if(finals.length===6)return finals.filter(a=>!siteArchiveWasDeleted(job,a.site_archive_id,a.file.sha256));
 const facts=job.facts,review=facts?.candidate_owner_review,scope=job.media_continuation?.scope;
 const pendingCandidate=pendingCandidateSiteArchives(job);if(pendingCandidate.length)return[...pendingCandidate,...postVideoDeliverySiteArchives(job,pendingCandidate)];
 if(job.id==='job_d3fcbbde-fb72-46b9-a64d-e3315c0a20cf'&&job.revision===2&&job.approved_revision===2){const m=(job.milestones||[]).filter(m=>m.node==='video'&&m.revision===2&&m.mode_epoch===job.mode_epoch&&!['invalidated','superseded'].includes(m.status)).sort((a,b)=>b.artifact_version-a.artifact_version)[0];try{const v=JSON.parse(m?.artifact||'null'),pending=v?.qa?.pending_native_site_id;if(/^nsd_[a-f0-9]{64}$/.test(pending||'')&&v.qa?.final_native_id===undefined)return(Array.isArray(facts?.site_file_archives)?facts.site_file_archives:[]).filter(a=>validSiteArchive(a)&&a.status==='confirmed'&&!siteArchiveWasDeleted(job,a.site_archive_id,a.file.sha256)&&a.pending_native_request_id===pending&&a.owner_review_id===null&&a.quality_review==='awaiting-human'&&a.materialized_sha256===a.file.sha256&&a.scope_id===scope?.id&&a.binding.script_hash===job.approved_hash&&a.binding.mode_epoch===job.mode_epoch&&a.binding.contract_hash===job.contract_hash&&a.binding.candidate_id===v.qa.native_candidate_id&&a.binding.candidate_sha256===v.sha256);}catch{}}
 if(job.approved_revision!==job.revision||!job.approved_hash||!review||review.decision!=='approved')return[];
 return(Array.isArray(facts?.site_file_archives)?facts.site_file_archives:[]).filter(a=>{if(!validSiteArchive(a)||a.status!=='confirmed'||a.materialized_sha256!==a.file.sha256||siteArchiveWasDeleted(job,a.site_archive_id,a.file.sha256))return false;const b=a.binding;return b.revision===job.revision&&b.script_hash===job.approved_hash&&b.mode_epoch===job.mode_epoch&&b.contract_hash===job.contract_hash&&b.candidate_id===facts?.candidate_record_id&&b.candidate_sha256===facts?.candidate_video_sha256&&a.owner_review_id===review.id&&scope?.id===a.scope_id;});
}
function postVideoDeliverySiteArchives(job:ProductionJob,videoFiles:SiteFileArchive[]):SiteFileArchive[]{
 if(!postVideoArchiveJobMatches(job))return[];
 const milestone=(job.milestones||[]).filter(m=>m.node==='video'&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch&&!['invalidated','superseded'].includes(m.status)).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(!milestone||milestone.status!=='approved'||!milestone.report)return[];
 const video=videoFiles.find(a=>a.file.role==='video');if(!video)return[];
 return(job.facts?.site_file_archives||[]).filter(a=>{
  if(!validSiteArchive(a)||a.post_video_delivery_id!==milestone.id||a.status!=='confirmed'||a.materialized_sha256!==a.file.sha256||!/^[a-f0-9]{64}$/.test(a.manifest_sha256||'')||!Number.isFinite(Date.parse(a.confirmed_at||''))||a.scope_id!==video.scope_id||a.scope_hash!==video.scope_hash||a.voice_provenance_id!==video.voice_provenance_id||a.file.role==='video'||siteArchiveWasDeleted(job,a.site_archive_id,a.file.sha256)||Object.entries(video.binding).some(([key,value])=>a.binding[key as keyof typeof a.binding]!==value))return false;
  const ownerApproval=job.reviews?.some(r=>r.id===a.owner_review_id&&r.decision==='approve'&&r.revision===job.revision&&r.content_hash===milestone.artifact_hash&&r.note===milestone.report);if(!ownerApproval)return false;
  if(a.file.role!=='complete_bundle')return true;
  const refs=a.post_video_material_reviews;if(!refs)return false;
  return(['cover','promotion'] as const).every(node=>{
   const m=(job.milestones||[]).filter(value=>value.node===node&&value.revision===job.revision&&value.mode_epoch===job.mode_epoch).sort((left,right)=>right.artifact_version-left.artifact_version)[0];
   return m?.status==='approved'&&!!m.report&&job.reviews?.some(r=>r.id===refs[node]&&r.decision==='approve'&&r.revision===job.revision&&r.content_hash===m.artifact_hash&&r.note===m.report);
  });
 });
}
// The private file can be inspected before the separate human quality decision.
// It must still match the current candidate, scope and any formal video node.
function pendingCandidateSiteArchives(job:ProductionJob):SiteFileArchive[]{
 const facts=job.facts,scope=job.media_continuation?.scope;
 if(!pendingCandidateArchiveJobMatches(job)||!/^native_video_[a-f0-9]{64}$/.test(facts?.candidate_record_id||'')||!scope||scope.scope!=='private-video'||scope.quality_approved!==false||scope.publication_authorization!==false||scope.new_paid_authorization!==false)return[];
 const current={revision:job.revision,script_hash:job.approved_hash,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash};
 if(Object.entries(current).some(([key,value])=>scope.binding?.[key as keyof typeof scope.binding]!==value))return[];
 const row=job.reviews?.find(r=>r.id===facts!.candidate_record_id&&r.decision==='native_video_candidate'&&r.revision===job.revision&&r.content_hash===facts!.candidate_video_sha256);
 let candidate:Record<string,unknown>;try{candidate=JSON.parse(String(row?.note));}catch{return[];}if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return[];
 const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
 if(candidate.schema!=='native-video-candidate-v1'||candidate.script_hash!==job.approved_hash||candidate.sha256!==facts!.candidate_video_sha256||candidate.local_file_verified!==true||candidate.quality_approved!==false||candidate.publication!==false||!uuid(candidate.project_id)||!uuid(candidate.timeline_id))return[];
 const latest=(job.milestones||[]).filter(m=>m.node==='video'&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 let artifact:{sha256?:string;qa?:Record<string,unknown>}|null=null;
 if(latest){if(!['awaiting_human','approved','revise'].includes(latest.status))return[];try{artifact=JSON.parse(latest.artifact);}catch{return[];}if(!artifact||artifact.sha256!==candidate.sha256||artifact.qa?.native_handoff!==true||artifact.qa.native_candidate_id!==facts!.candidate_record_id||artifact.qa.project_id!==candidate.project_id||artifact.qa.timeline_id!==candidate.timeline_id)return[];}
 return(Array.isArray(facts?.site_file_archives)?facts.site_file_archives:[]).filter(a=>{
  if(!validSiteArchive(a)||a.pending_candidate_id!==facts!.candidate_record_id||a.owner_review_id!==null||a.quality_review!=='awaiting-human'||a.file.role!=='video'||a.status!=='confirmed'||a.materialized_sha256!==a.file.sha256||!/^[a-f0-9]{64}$/.test(a.manifest_sha256||'')||!Number.isFinite(Date.parse(a.confirmed_at||''))||siteArchiveWasDeleted(job,a.site_archive_id,a.file.sha256))return false;
  const b=a.binding;return Object.entries(current).every(([key,value])=>b[key as keyof typeof b]===value)&&b.candidate_id===facts!.candidate_record_id&&b.candidate_sha256===candidate.sha256&&b.project_id===candidate.project_id&&b.timeline_id===candidate.timeline_id&&a.scope_id===scope.id&&a.file.sha256===candidate.sha256&&a.file.size_bytes===candidate.size_bytes&&a.file.file_name===candidate.file_name&&(!artifact||artifact.qa?.site_archive_id===a.site_archive_id&&artifact.qa.voice_kind==='owner-cloned'&&artifact.qa.voice_provenance_id===a.voice_provenance_id);
 });
}
const roleLabel:Record<SiteFileArchive['file']['role'],string>={video:'本版成片 MP4',project_archive:'可编辑工程与音轨 ZIP',complete_bundle:'完整交付包 ZIP',source_bundle:'制作归档包 ZIP',cover_3_4:'3:4 封面原件',cover_4_3:'4:3 封面原件',promotion:'宣发文案',source_notes:'来源说明'};
export function siteMaterialReviewStatus(job:ProductionJob,archive:SiteFileArchive){
 const node=archive.file.role.startsWith('cover_')?'cover':archive.file.role==='promotion'?'promotion':null;if(!node)return null;
 const milestone=(job.milestones||[]).filter(m=>m.node===node&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch).sort((a,b)=>b.artifact_version-a.artifact_version)[0];if(!milestone||['invalidated','superseded'].includes(milestone.status))return null;
 function match(value:unknown,depth=0):boolean{if(!value||typeof value!=='object'||depth>6)return false;const v=value as Record<string,unknown>,file=v.file as Record<string,unknown>|undefined,qa=v.qa as Record<string,unknown>|undefined;if((v.site_archive_id===archive.site_archive_id&&(v.sha256===archive.file.sha256||file?.sha256===archive.file.sha256))||(qa?.site_archive_id===archive.site_archive_id&&v.sha256===archive.file.sha256))return true;return Object.values(v).slice(0,40).some(x=>match(x,depth+1));}
 try{const artifact=JSON.parse(milestone.artifact);if(archive.post_video_delivery_id&&node==='cover'&&artifact.qa?.post_video_delivery_id===archive.post_video_delivery_id&&artifact.qa?.site_archive_ids?.[archive.file.role]===archive.site_archive_id)return milestone.status;if(match(artifact))return milestone.status;if(node==='promotion'&&typeof artifact.limits==='string'){try{const file=JSON.parse(artifact.limits);if(file.schema==='site-promotion-file-v1'&&match(file))return milestone.status;}catch{}}return null;}catch{return null;}
}
export function currentSiteVideoMilestone(job:ProductionJob){const archives=visibleSiteArchives(job).filter(a=>a.file.role==='video');return(job.milestones||[]).filter(m=>{if(m.node!=='video'||m.revision!==job.revision||m.mode_epoch!==job.mode_epoch||['invalidated','superseded'].includes(m.status))return false;try{const a=JSON.parse(m.artifact);return archives.some(v=>v.site_archive_id===a.qa?.site_archive_id&&v.file.sha256===a.sha256);}catch{return false;}}).sort((a,b)=>b.artifact_version-a.artifact_version)[0]||null;}
const privateArchiveHref=(jobId:string,archive:SiteFileArchive)=>'/api/site-archive?id='+encodeURIComponent(jobId)+'&archive='+encodeURIComponent(currentBrandCoverId(jobId,archive.site_archive_id));
function CurrentSiteCoverPreview({jobId,archive}:{jobId:string;archive:SiteFileArchive}){
 const [failed,setFailed]=useState(false),href=privateArchiveHref(jobId,archive),ratio=archive.file.role==='cover_3_4'?'3:4':'4:3';
 return <figure style={{margin:0,minWidth:0}} data-current-cover-role={archive.file.role}>
  <figcaption style={{fontWeight:650,marginBottom:10}}>{ratio} 封面</figcaption>
  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={'放大查看 '+ratio+' 封面'} style={{display:'block',aspectRatio:ratio.replace(':',' / '),background:'var(--muted, #f2f4f8)',borderRadius:12,overflow:'hidden'}}>
   <img src={href} alt={ratio+' 封面 · 当前版本原件'} loading="eager" decoding="async" width={archive.file.width} height={archive.file.height} onError={()=>setFailed(true)} onLoad={()=>setFailed(false)} style={{display:'block',width:'100%',height:'100%',objectFit:'contain'}}/>
  </a>
  {failed&&<p role="alert">封面暂未加载成功，请重新读取或打开原图核对。</p>}
  <p><a className="text-link" href={href} target="_blank" rel="noopener noreferrer">放大查看</a>{' · '}<a className="text-link" href={href+'&download=1'} download={archive.file.file_name}>下载 {ratio} 原图</a></p>
 </figure>;
}
// A review surface shows only the exact files named by its current formal node.
// The shared archive projection first verifies current video, voice, scope and owner approval.
export function CurrentSiteMaterialPreview({job,milestone}:{job:ProductionJob;milestone:Milestone}){
 if(!['cover','promotion'].includes(milestone.node)||!postVideoArchiveJobMatches(job))return null;
 const current=(job.milestones||[]).filter(m=>m.node===milestone.node&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch&&!['invalidated','superseded'].includes(m.status)).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(!current||current.id!==milestone.id||current.artifact_hash!==milestone.artifact_hash||current.artifact!==milestone.artifact||current.status!==milestone.status)return null;
 const video=currentSiteVideoMilestone(job),files=visibleSiteArchives(job);
 const missing=<p role="alert" data-current-material-unavailable>本版材料的归档绑定未能核对，请重新读取后审阅；这里不会显示旧版文件。</p>;
 if(!video||video.status!=='approved')return missing;
 const pick=(role:SiteFileArchive['file']['role'],id:unknown,sha256?:unknown)=>{
  if(typeof id!=='string'||!/^sitefile_[a-f0-9]{64}$/.test(id))return null;
  const found=files.filter(a=>a.site_archive_id===id&&a.file.role===role&&a.post_video_delivery_id===video.id&&(sha256===undefined||a.file.sha256===sha256));
  return found.length===1?found[0]:null;
 };
 try{
  const artifact=JSON.parse(current.artifact);
  if(!artifact||typeof artifact!=='object'||Array.isArray(artifact))return missing;
  if(milestone.node==='promotion'){
   const limits=typeof artifact.limits==='string'?JSON.parse(artifact.limits):null;
   const promotion=limits?.schema==='site-promotion-file-v1'?pick('promotion',limits.site_archive_id,limits.sha256):null;
   if(!promotion||typeof limits.sha256!=='string'||!/^[a-f0-9]{64}$/.test(limits.sha256))return missing;
   return <section data-current-site-material-preview="promotion" aria-label="本版宣发全文预览"><p>请阅读本版完整宣发稿，再单独确认宣发节点。</p><SiteArchiveTextPreview key={promotion.site_archive_id+promotion.file.sha256} src={privateArchiveHref(job.id,promotion)} sha256={promotion.file.sha256} size={promotion.file.size_bytes}/></section>;
  }
  const qa=artifact.qa,ids=qa?.site_archive_ids;
  if(qa?.post_video_delivery_id!==video.id||typeof artifact.sha256!=='string'||!/^[a-f0-9]{64}$/.test(artifact.sha256)||!ids||typeof ids!=='object'||Array.isArray(ids)||Object.keys(ids).sort().join(',')!=='cover_3_4,cover_4_3')return missing;
  const portrait=pick('cover_3_4',ids.cover_3_4,artifact.sha256),landscape=pick('cover_4_3',ids.cover_4_3);
  if(!portrait||!landscape||portrait.site_archive_id===landscape.site_archive_id)return missing;
  const promotion=pick('promotion',qa.promotion_site_archive_id);
  return <section data-current-site-material-preview="cover" aria-label="本版双封面与宣发预览">
   <p>两张封面均完整展示，可点击原图放大查看。封面和宣发稿分别审核。</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))',alignItems:'start',gap:24,maxWidth:'52rem'}}>
    <CurrentSiteCoverPreview key={portrait.site_archive_id} jobId={job.id} archive={portrait}/><CurrentSiteCoverPreview key={landscape.site_archive_id} jobId={job.id} archive={landscape}/>
   </div>
   <div style={{marginTop:20}}><h5>本版宣发稿</h5><p>可先展开阅读全文；封面通过后，宣发稿仍需在宣发节点单独确认。</p>{promotion?<SiteArchiveTextPreview key={promotion.site_archive_id+promotion.file.sha256} src={privateArchiveHref(job.id,promotion)} sha256={promotion.file.sha256} size={promotion.file.size_bytes}/>:missing}</div>
  </section>;
 }catch{return missing;}
}
export function NativeSiteMilestone({job,milestone,historical=false}:{job:ProductionJob;milestone:Milestone;historical?:boolean}){
 let a:{sha256?:string;qa?:{site_archive_id?:string;file_name?:string;voice_kind?:string;approved_native_version_id?:string;pending_native_site_id?:string;final_native_id?:string;owner_review_source?:string;delivery_method?:string;delivery_id?:string;render_id?:string|null;native_render_id?:string|null;project_id?:string}}={};try{a=JSON.parse(milestone.artifact);}catch{}
 const archive=visibleSiteArchives(job).find(v=>v.file.role==='video'&&v.site_archive_id===a.qa?.site_archive_id&&v.file.sha256===a.sha256);
 const retention=hasCurrentFinalRetention(job),deleted=siteArchiveWasDeleted(job,a.qa?.site_archive_id,a.sha256);
 const history=historical||retention&&currentSiteVideoMilestone(job)?.id!==milestone.id;
 const ownerVoice=a.qa?.voice_kind==='owner-cloned'&&(/^apv_[a-f0-9]{64}$/.test(a.qa.approved_native_version_id||'')||/^nfinal_[a-f0-9]{64}$/.test(a.qa.final_native_id||'')||!!archive?.pending_candidate_id);
 const localAudio=a.qa?.delivery_method==='local-audio-only-finishing'&&a.qa.render_id===null&&a.qa.native_render_id===null&&/^site_delivery_[a-f0-9]{64}$/.test(a.qa.delivery_id||'');
 const editor=localAudio&&(!history||!retention)&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(a.qa?.project_id||'')?'https://app.chatcut.io/editor/'+a.qa!.project_id:null;
 const label=milestone.status==='approved'?'视频节点已通过':milestone.status==='awaiting_human'?'待本人审片':milestone.status==='revise'?'已打回':'核对当前审核节点';
 const historyArchiveId=history&&!retention&&/^sitefile_[a-f0-9]{64}$/.test(a.qa?.site_archive_id||'')&&/^[a-f0-9]{64}$/.test(a.sha256||'')?a.qa!.site_archive_id:null;
 const archiveId=deleted||history&&retention?null:archive?.site_archive_id||historyArchiveId;
 const href=archiveId?'/api/site-archive?id='+encodeURIComponent(job.id)+'&archive='+encodeURIComponent(archiveId):null;
 const fileName=archive?.file.file_name||(history?a.qa?.file_name:undefined);
 return <section className="milestone-card" aria-label={history?'历史归档成片':'本站归档成片审核状态'}>
  <h3>{history?'历史成片':ownerVoice?'本人声音版已回站':localAudio?'本地混音成片已回站':'原生成片已回站'} · {history?retention?'保留审核记录':'保留旧版记录':label}</h3>
  <p>批准稿 v{milestone.revision} · 视频产物 v{milestone.artifact_version}{ownerVoice?' · 本人声音版':''} · 本站私有归档。</p>
  {localAudio&&<p data-local-audio-delivery>本地音轨混合成品，保留ChatCut可编辑工程。画面沿用原批准成片，最终音轨在本地混合；本文件未使用ChatCut原生渲染。{editor&&<> <a href={editor} target="_blank" rel="noopener noreferrer">打开可编辑工程</a></>}</p>}
  {fileName&&<p>{fileName}{archive&&<> · {(archive.file.size_bytes/1048576).toFixed(2)} MB</>}</p>}
  {deleted?<p data-archive-retention-cleaned>已按当前定稿保留政策清理；哈希与审核记录保留。当前交付使用上方最新正式成片。</p>:history?<p>{retention?'历史版本仅展示哈希与审核摘要；当前交付使用上方最新正式成片。':'本文件保留用于版本追溯；当前交付使用上方最新正式成片。'}</p>:milestone.status==='approved'?<p>{ownerVoice&&a.qa?.owner_review_source==='owner-oral-report'?'已登记本人在制作对话中的成片确认，并回传正式视频节点。':'当前正式视频节点已通过本人审核。'}封面、宣发稿与对外发布仍按各自状态处理。</p>:milestone.status==='revise'?<p>当前正式视频节点已打回，请按本次意见修改；既有文件保留。</p>:<p>文件与技术检查回执已保存；当前正式视频节点仍待本人独立审核。</p>}
  {href?<p><a href={href} target="_blank" rel="noopener noreferrer">{history?'播放历史成片':'播放本站归档成片'}</a>{' · '}<a href={href} download={fileName}>{history?'下载历史成片':'下载本版成片'}</a></p>:!deleted&&(!history||!retention)&&<p>{history?'历史归档文件仍保留在既有交付记录中。':'当前归档绑定需重新读取，暂不提供旧文件链接。'}</p>}
  {!history&&href&&(a.qa?.pending_native_site_id||archive?.pending_candidate_id)&&<video controls playsInline preload="metadata" src={href} aria-label={archive?.pending_candidate_id?(ownerVoice?'本人声音版成片播放器':'本版成片播放器'):a.qa?.final_native_id?"MiniCPM 本版正式成片播放器":"MiniCPM 本版待审成片播放器"} style={{display:'block',maxWidth:'24rem',width:'100%',maxHeight:'70vh',background:'#111'}}/>}
  {!history&&<p><a className="text-link" href="#video-review">前往视频里程碑审核 →</a></p>}<small style={{overflowWrap:'anywhere'}}>SHA256 {a.sha256}</small>
 </section>;
}
export function SiteArchiveFiles({job,compact=false}:{job:ProductionJob;compact?:boolean}){
 const archives=visibleSiteArchives(job).map(a=>{const found=warehouseBrandCover(job.id,a.site_archive_id);if(!found||found.file.source_sha256!==a.file.sha256)return a;const f=found.file;return {...a,site_archive_id:f.site_archive_id,materialized_sha256:f.sha256,confirmed_at:f.visual_evidence.reviewed_at,file:{...a.file,sha256:f.sha256,size_bytes:f.size_bytes,width:f.width,height:f.height,file_name:f.file_name,mime_type:'image/png' as const}};}).map(a=>{const upgrade=currentJobV6Outro(job),reviewedAt=job.reviews?.find(r=>r.decision==='outro_v6_technical_upgrade_v1'&&r.content_hash===upgrade?.file.sha256)?.created_at;return upgrade&&a.site_archive_id===upgrade.source.archive_id?{...a,site_archive_id:upgrade.file.site_archive_id,materialized_sha256:upgrade.file.sha256,confirmed_at:typeof reviewedAt==='string'?reviewedAt:a.confirmed_at,file:{...a.file,sha256:upgrade.file.sha256,size_bytes:upgrade.file.size_bytes,file_name:upgrade.file.file_name,duration:upgrade.file.duration_seconds}}:a;}),finalDelivery=finalNativeSiteArchives(job).length===6;if(!archives.length)return null;
 const href=(a:SiteFileArchive)=>'/api/site-archive?id='+encodeURIComponent(job.id)+'&archive='+encodeURIComponent(a.site_archive_id);
 return <section className="production-notice" id={compact?'site-archive-handoff':'native-video-archive'} aria-label={compact?'交接中的本站私有归档':'本站私有文件归档'}>
  {compact?<h4>本站私有归档</h4>:<h2>本站私有归档与下载</h2>}
  <p>文件已核验并保存在本站私有归档，仅本人登录后可读取。</p>
  {finalDelivery&&<p data-final-native-delivery>本人声音版成片、两张封面及宣发稿已按制作对话中的明确认可完成私有归档；制作归档包和完整交付包已核验。未记录网站按钮点击，发布状态另行记录。</p>}{!finalDelivery&&archives.some(a=>a.pending_native_request_id)&&<p data-pending-native-review>真实ChatCut原生导出已回站；{currentSiteVideoMilestone(job)?.status==='approved'?'成片节点已通过本人审核，':currentSiteVideoMilestone(job)?.status==='revise'?'成片已打回，保留本版并按意见另交新文件，':'成片待本人审核，'}双封面与宣发按各自节点状态继续，文件保存没有代替本人通过。</p>}
  <SiteArchiveRetentionNotice job={job}/>
  {archives.some(a=>a.pending_candidate_id)&&<p data-pending-candidate-review>{currentSiteVideoMilestone(job)?.status==='approved'?'本版成片节点已通过本人审核。':currentSiteVideoMilestone(job)?.status==='revise'?'本版成片已打回，请按当前修改意见继续。':'完整候选已保存，等待本人审片。'}文件归档与质量审核分别记录；封面、宣发和发布按各自节点继续。</p>}
  {archives.some(a=>a.post_video_delivery_id)&&<p data-post-video-materials>以下封面与宣发文件已保存。{archives.some(a=>a.file.role==='complete_bundle')?'本版完整交付包已归档，审核与文件核验记录分别保留。':'请分别查看当前审核状态；完整交付包须在材料全部获认可后归档。'}</p>}
  {job.facts?.candidate_owner_review?.reviewed_voice_kind==='owner-cloned'&&<p data-current-owner-voice>当前交付为本人声音版；以下为本版成片、制作归档和交付文件。{hasCurrentFinalRetention(job)?'历史版本仅展示审核摘要。':'旧成片保留在历史版本中。'}</p>}
  <ul>{archives.map(a=><li key={a.site_archive_id} style={{marginBottom:'1rem',overflowWrap:'anywhere'}}>
   <strong>{roleLabel[a.file.role]}</strong> · {a.file.file_name} · {(a.file.size_bytes/1048576).toFixed(2)} MB
   {a.pending_candidate_id&&a.file.mime_type==='video/mp4'&&<><video controls playsInline preload="metadata" src={href(a)} aria-label="当前完整候选播放器" style={{display:'block',maxWidth:compact?'20rem':'24rem',width:'100%',maxHeight:'70vh',background:'#111',marginTop:12}}/>{currentSiteVideoMilestone(job)&&<p><a className="text-link" href="#video-review">{currentSiteVideoMilestone(job)?.status==='approved'?'查看已通过的成片审核记录 →':currentSiteVideoMilestone(job)?.status==='revise'?'查看本次成片修改意见 →':'前往成片审核：通过或填写修改意见 →'}</a></p>}</>}
   {a.file.mime_type==='image/png'&&<><p><a href={href(a)} target="_blank" rel="noopener noreferrer"><img src={href(a)} alt={roleLabel[a.file.role]+' · 归档文件预览'} loading="lazy" style={{display:'block',maxWidth:compact?'10rem':'15rem',maxHeight:'18rem',objectFit:'contain'}}/></a></p><p>{warehouseBrandCover(job.id,a.site_archive_id)?'已按本人选定的底部融合品牌组合更新。':<>文件已归档，{siteMaterialReviewStatus(job,a)==='approved'?'本文件已通过本人封面节点审核。':siteMaterialReviewStatus(job,a)==='revise'?'封面节点已打回，请按意见修改。':'封面质量待单独审核。'}</>}</p></>}
   {a.file.role==='promotion'&&<><p>文件已归档，{siteMaterialReviewStatus(job,a)==='approved'?'本文件已通过本人宣发节点审核。':siteMaterialReviewStatus(job,a)==='revise'?'宣发节点已打回，请按意见修改。':'宣发文案待单独审核。'}</p>{a.post_video_delivery_id&&<SiteArchiveTextPreview src={href(a)} sha256={a.file.sha256} size={a.file.size_bytes}/>}</>}
   <p>{a.file.mime_type==='video/mp4'&&<><a className="text-link" href={href(a)} target="_blank" rel="noopener noreferrer">播放本版成片</a>{' · '}</>}<a className="text-link" href={href(a)+(a.file.mime_type==='image/png'?'&download=1':'')} download={a.file.file_name}>下载{roleLabel[a.file.role]}</a></p>
   {!compact&&<details><summary>查看文件核验信息</summary><p>SHA256：{a.file.sha256}</p><p>归档时间：{a.confirmed_at}</p><small>本站归档编号：{a.site_archive_id}</small></details>}
  </li>)}</ul>
  {archives.some(a=>a.file.role==='source_bundle')&&!archives.some(a=>a.file.role==='complete_bundle')&&<p>制作归档包可先下载；完整交付包尚未归档，封面与宣发稿的审核仍分别保留。</p>}
  <p>归档不代替材料质量审核，也不授权对外发布。工程快照与恢复说明的范围以包内清单为准。</p>
 </section>;
}
export function SiteArchiveTextPreview({src,sha256,size}:{src:string;sha256:string;size:number}){
 const [open,setOpen]=useState(false),[content,setContent]=useState<string|null>(null),[error,setError]=useState('');
 useEffect(()=>{if(!open)return;let alive=true;const controller=new AbortController();setContent(null);setError('');
  fetch(src,{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok||response.headers.get('X-Asset-SHA256')!==sha256||!response.headers.get('Content-Type')?.startsWith('text/plain'))throw Error('文案文件未能按当前归档读取');
   const bytes=await response.arrayBuffer();if(bytes.byteLength!==size||size>20000)throw Error('文案文件字节不匹配');const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(digest!==sha256)throw Error('文案文件校验未通过');
   const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(alive)setContent(text);
  }).catch(value=>{if(alive)setError(value instanceof Error?value.message:'文案预览未能读取');});
  return()=>{alive=false;controller.abort();};
 },[open,src,sha256,size]);
 return <details onToggle={event=>setOpen(event.currentTarget.open)} data-site-promotion-preview><summary>查看宣发全文</summary>{error?<p role="alert">{error}。可重新展开重试或下载原件。</p>:content===null?<p role="status">正在读取本版宣发文案…</p>:<pre aria-label="本站宣发全文" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{content}</pre>}</details>;
}
