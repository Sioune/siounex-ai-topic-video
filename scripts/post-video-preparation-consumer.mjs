import {brandCoverReferences} from './brand-cover-references.mjs';
// Continue an exact returned local video into candidate covers/copy/delivery.
// No new speech, media purchase, final quality approval or publication.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {buildPostVideoAssets} from './post-video-assets.mjs';
import {reusePostVideoAigcCoverSources} from './post-video-reused-covers.mjs';
import {withLocalUploadLock} from './local-upload-lock.mjs';
import {createSiteUploadProgress} from './site-upload-progress.mjs';
import {runSiteArchiveParts} from './site-archive-batch.mjs';
import {validateAigcCoverReceipt} from '../lib/post-video-aigc-cover-contract.mts';
import {currentOwnerPrivateVideoScope} from '../lib/private-video-scope.mts';
import {RELEASE_PACKAGE_V2,validateReleasePackageManifest} from '../lib/release-package-contract.mts';
import {withProductionStation} from './production-workstations.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),roles=['cover_3_4','cover_4_3','promotion','complete_bundle'];
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function exactFile(ref,root){const file=fs.realpathSync(ref?.file||ref?.path||'');if(!file.startsWith(fs.realpathSync(root)+path.sep)||!fs.statSync(file).isFile())throw Error('POST_VIDEO_LOCAL_FILE_SCOPE');const bytes=fs.readFileSync(file);if(bytes.length!==ref.size_bytes||sha(bytes)!==ref.sha256)throw Error('POST_VIDEO_LOCAL_BYTES_CHANGED');return {...ref,file,path:file,bytes};}
function requestPath(file,root,{exists=true}={}){const base=fs.realpathSync(root),absolute=path.resolve(file),relative=path.relative(base,absolute);if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw Error('POST_VIDEO_AIGC_FILE_SCOPE');let current=base;for(const segment of relative.split(path.sep)){current=path.join(current,segment);if(fs.existsSync(current)){if(fs.lstatSync(current).isSymbolicLink())throw Error('POST_VIDEO_AIGC_FILE_LINK');}else if(exists)throw Error('POST_VIDEO_AIGC_FILE_MISSING');}return absolute;}
function requestBytes(file,root){const scoped=requestPath(file,root),s=fs.statSync(scoped);if(!s.isFile()||s.size<1||s.size>100000)throw Error('POST_VIDEO_AIGC_MANIFEST_SIZE');return fs.readFileSync(scoped);}
export function postVideoLocalSources(job,plan,{root=process.cwd()}={}){
 let cloneId=null;try{cloneId=JSON.parse(job.milestones?.find(m=>m.id===plan.base_video.id)?.artifact||'{}').qa?.automatic_clone_request_id||null;}catch{throw Error('POST_VIDEO_CURRENT_LOCAL_RECEIPT_MISSING');}
 const parent=cloneId?path.resolve(root,'.sites-runtime/automatic-clone-renders'):path.resolve(root,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision,'private-review');
 if(!fs.existsSync(parent))throw Error('POST_VIDEO_CURRENT_LOCAL_PROJECT_MISSING');
 for(const entry of fs.readdirSync(parent,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^[a-f0-9]{64}$/.test(d.name))){
  const receipt=path.join(parent,entry.name,'producer-receipt.json');if(!fs.existsSync(receipt))continue;const r=JSON.parse(fs.readFileSync(receipt,'utf8'));
  if(!r.video_generated||r.files?.find(f=>f.role==='video')?.sha256!==plan.base_video.sha256)continue;
  if(cloneId&&(r.automatic_clone_request_id!==cloneId||r.owner_voice_used!==true||r.voice_kind!=='owner-cloned')||!cloneId&&r.automatic_clone_request_id)throw Error('POST_VIDEO_CLONE_PROJECT_BINDING_CHANGED');
  if(['revision','script_hash','mode_epoch','contract_hash'].some(k=>r.binding?.[k]!==plan.binding[k])||r.binding?.scope_id!==plan.scope_id)throw Error('POST_VIDEO_PROJECT_BINDING_CHANGED');
  const get=role=>exactFile(r.files.find(f=>f.role===role),root),video=get('video'),project_archive=plan.delivery_mode==='results-only'?null:get('project_archive'),producer_project=get('project');
  if(video.size_bytes!==plan.base_video.size_bytes||project_archive&&(project_archive.sha256!==plan.project_archive?.sha256||project_archive.size_bytes!==plan.project_archive?.size_bytes))throw Error('POST_VIDEO_ARCHIVE_BINDING_CHANGED');
  return{video,project_archive,producer_project};
 }
 // The normal owner-feedback correction has its own genuine result record and
 // project identity. It is not a private-review producer receipt.
 if(!cloneId&&plan.delivery_mode==='results-only'){
  for(const kind of ['owner-feedback-correction','owner-feedback-outro']){
  const corrections=path.resolve(root,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision,kind);
  if(fs.existsSync(corrections))for(const entry of fs.readdirSync(corrections,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^[a-f0-9]{64}$/.test(d.name))){
   const resultFile=path.join(corrections,entry.name,'correction-result.json');if(!fs.existsSync(resultFile))continue;
   const r=JSON.parse(fs.readFileSync(resultFile,'utf8'));if(r.schema!=='owner-feedback-correction-result-v1'||r.input_hash!==entry.name||r.video_generated!==true||r.audio_generated!==true||!Array.isArray(r.missing)||r.missing.length||r.files?.find(f=>f.role==='video')?.sha256!==plan.base_video.sha256)continue;
   if(['revision','script_hash','mode_epoch','contract_hash'].some(k=>r.binding?.[k]!==plan.binding[k])||r.binding?.scope_id!==plan.scope_id)throw Error('POST_VIDEO_CORRECTION_BINDING_CHANGED');
   const get=role=>{const list=r.files.filter(f=>f.role===role);if(list.length!==1)throw Error('POST_VIDEO_CORRECTION_ROLE_CHANGED');return exactFile(list[0],root)},video=get('video'),producer_project=get('project'),correctionReceipt=get('render_receipt'),voice=get('voice'),p=JSON.parse(producer_project.bytes.toString('utf8'));
   if(video.size_bytes!==plan.base_video.size_bytes||plan.binding.project_id!=='local:'+producer_project.sha256||plan.binding.timeline_id!=='local:'+correctionReceipt.sha256||p.schema!=='owner-feedback-correction-project-v1'||p.job_id!==job.id||canonical(p.binding)!==canonical(r.binding)||p.original_voice_sha256!==voice.sha256)throw Error('POST_VIDEO_CORRECTION_IDENTITY_CHANGED');
   for(const originalDir of fs.readdirSync(parent,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^[a-f0-9]{64}$/.test(d.name))){
    const f=path.join(parent,originalDir.name,'producer-receipt.json');if(!fs.existsSync(f))continue;const original=JSON.parse(fs.readFileSync(f,'utf8')),ref=original.files?.find(x=>x.role==='project');
    if(ref?.sha256!==p.original_project_sha256||original.files?.find(x=>x.role==='video')?.sha256!==p.original_video_sha256||original.files?.find(x=>x.role==='voice')?.sha256!==p.original_voice_sha256)continue;
    const original_producer_project=exactFile(ref,root);return{video,project_archive:null,producer_project,original_producer_project,correction_receipt:correctionReceipt};
   }
   throw Error('POST_VIDEO_CORRECTION_ORIGINAL_PROJECT_MISSING');
  }
  }
 }
 throw Error('POST_VIDEO_CURRENT_LOCAL_RECEIPT_MISSING');
}
const releaseExpectations=plan=>({...(plan.delivery_mode?{delivery_mode:plan.delivery_mode}:{}),job_id:plan.job_id,binding:plan.binding,video:plan.base_video,project_archive:plan.project_archive,files:plan.files,promo_content_hash:plan.promo_content_hash,release_policy:plan.release_policy});
const prepared=r=>{try{return r?.is_current!==false&&r?.plan?.status==='prepared'&&(r.plan.package_kind===undefined||r.plan.package_kind===RELEASE_PACKAGE_V2&&!!validateReleasePackageManifest(r.plan.release_manifest,releaseExpectations(r.plan)))&&!!validateAigcCoverReceipt(r.plan.aigc_covers,r.plan.cover_request,r.plan.files)&&roles.every(role=>r.archives?.some(a=>a.file.role===role&&a.status==='confirmed'&&a.file.sha256===r.plan.files?.[role]?.sha256));}catch{return false}};
export async function postVideoAigcCoverSources(job,plan,{root=process.cwd(),call,deadline_ms=Infinity,promotion=null,generateCovers=async config=>(await import('./native-aigc-cover-executor.mjs')).executeNativeAigcCovers(config)}={}){
 if(plan.cover_request?.reuse_source)return reusePostVideoAigcCoverSources(job,plan,{root,call});
 if(!plan.cover_request)return{ready:false,status:'post-video-aigc-cover-waiting',reason:'当前旧材料包不符合AIGC封面要求，请重新取得当前生成请求；不会降级为视频取帧或截图拼图。'};
 const dir=requestPath(path.resolve(root,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision,'aigc-covers',plan.cover_request.request_id),root,{exists:false});fs.mkdirSync(dir,{recursive:true});const manifest_file=path.join(dir,'covers.json'),request_file=path.join(dir,'request.json'),draft=job.drafts.find(d=>d.revision===job.revision&&d.content_hash===job.approved_hash),source=JSON.parse(job.source_snapshot),request={request:plan.cover_request,title:source.title,script:JSON.parse(draft.content).script,source_title:source.title,source_summary:source.summary||null,cover_title:promotion?.cover_title||null,cover_subtitle:promotion?.cover_subtitle||null,cover_editorial_notes:promotion?.editorial_notes||null,...(plan.cover_request.brand_edit_source?{brand_edit_references:await brandCoverReferences(job,plan,{root,call})}:{})},bytes=Buffer.from(JSON.stringify(request,null,2));
 if(fs.existsSync(request_file)){if(sha(requestBytes(request_file,root))!==sha(bytes))throw Error('POST_VIDEO_AIGC_REQUEST_CHANGED');}else fs.writeFileSync(request_file,bytes,{flag:'wx'});
 let generation=null;if(!fs.existsSync(manifest_file)){generation=await generateCovers({request_file,root,deadline_ms});if(!fs.existsSync(manifest_file))return{ready:false,status:generation?.status||'post-video-aigc-cover-waiting',request_id:plan.cover_request.request_id,request_file,reason:generation?.reason||'等待内置image_gen完成两种独立构图AIGC封面；不使用截图或拼图替代。',generation};}
 const raw=JSON.parse(requestBytes(manifest_file,root).toString('utf8'));validateAigcCoverReceipt(raw,plan.cover_request);const aigc_covers={...raw,covers:raw.covers.map(c=>{const scoped=requestPath(path.resolve(root,c.file),root),f=exactFile({...c,file:scoped},root);if(!f.file.startsWith(dir+path.sep))throw Error('POST_VIDEO_AIGC_FILE_OUTSIDE_REQUEST');return{...c,file:f.file};})};return{ready:true,aigc_covers,manifest_file,generation};
}
export async function runPostVideoPreparation(selection,{call,root=process.cwd(),buildAssets=buildPostVideoAssets,sources=postVideoLocalSources,coverSources=postVideoAigcCoverSources,generateCovers,deadline_ms=Infinity,now=Date.now,workstations}={}){
 const id=selection.job.id;let planId=null,phase='current-state';if(deadline_ms!==Infinity&&(!Number.isFinite(deadline_ms)||deadline_ms<0))throw Error('POST_VIDEO_INVALID_DEADLINE');
 const budget=(reserve=60000)=>{if(deadline_ms-now()<reserve)throw Object.assign(Error('POST_VIDEO_TRANSFER_BUDGET_DEFERRED'),{code:'POST_VIDEO_TRANSFER_BUDGET_DEFERRED'})},step=async b=>{phase=b.action;budget();return call(b)};
 try{
 const {job}=await step({action:'read',id});if(!job||job.id!==id||!(job.review_mode==='auto'||job.review_mode==='node'&&currentOwnerPrivateVideoScope(job)))throw Error('POST_VIDEO_CURRENT_AUTO_OR_OWNER_PRIVATE_NODE_REQUIRED');
 const ensured=await step({action:'post_video_preparation_ensure',id}),plan=ensured.plan;planId=plan.plan_id;
 if(plan.package_kind!==undefined&&plan.package_kind!==RELEASE_PACKAGE_V2)throw Error('POST_VIDEO_PACKAGE_KIND_UNSUPPORTED');const release=plan.package_kind===RELEASE_PACKAGE_V2;
 const read=()=>step({action:'post_video_preparation_read',id,plan_id:plan.plan_id});let state=await read();
 if(prepared(state))return{status:'post-video-prepared',job_id:id,plan_id:plan.plan_id,archives:state.archives.map(a=>({id:a.site_archive_id,role:a.file.role,status:a.status})),reused:true,new_paid_calls:0,quality_approved:false,publication_authorized:false};
 const promos=await step({action:'promo_list',id}),promo=promos.packages.find(p=>p.id===plan.promo_package_id);
 if(!promo||promo.status!=='ready')return{status:'post-video-copy-waiting',job_id:id,plan_id:plan.plan_id,package_id:plan.promo_package_id,promo_status:promo?.status||'missing',reason:promo?.error||null,new_paid_calls:0,publication_authorized:false};
 if(!promo.is_current||typeof promo.content!=='string'||sha(promo.content)!==promo.content_hash)throw Error('POST_VIDEO_CURRENT_PROMOTION_CHANGED');
 const currentStage=async()=>{
  if(!workstations)return;
  const latest=(await step({action:'read',id})).job;
  if(!latest||['id','revision','approved_hash','approved_revision','mode_epoch','contract_hash','review_mode','status'].some(k=>latest[k]!==job[k]))throw Error('POST_VIDEO_STAGE_BINDING_CHANGED');
  const observed=await read();if(observed.is_current===false||['plan_id','binding','base_video','project_archive','promo_package_id','delivery_mode'].some(k=>canonical(observed.plan?.[k])!==canonical(plan[k])))throw Error('POST_VIDEO_STAGE_BINDING_CHANGED');
  const currentPromo=(await step({action:'promo_list',id})).packages?.find(p=>p.id===promo.id);
  if(currentPromo?.status!=='ready'||currentPromo.is_current!==true||currentPromo.content_hash!==promo.content_hash||sha(currentPromo.content)!==promo.content_hash)throw Error('POST_VIDEO_CURRENT_PROMOTION_CHANGED');
 };
 // Source buffers stay inside this stage. A job waiting for archive capacity
 // retains file identities, rather than a second in-memory engineering ZIP.
 phase='local-assets';const {cover,assets}=await withProductionStation(workstations,'assets',id,async()=>{
  await currentStage();
  phase='local-sources';budget();const local=sources(job,plan,{root});
  phase='native-aigc-covers';const cover=await coverSources(job,plan,{root,call:step,deadline_ms,promotion:JSON.parse(promo.content),...(generateCovers?{generateCovers}:{})});
  if(!cover.ready)return{cover};
  phase='local-assets';budget(120000);const assets=await buildAssets({job,...(plan.delivery_mode?{delivery_mode:plan.delivery_mode}:{}),binding:{...plan.binding,scope_id:plan.scope_id},cover_request:plan.cover_request,aigc_covers:cover.aigc_covers,title:String(JSON.parse(job.source_snapshot).title),...local,promotion:JSON.parse(promo.content),promotion_content_hash:promo.content_hash,voice_kind:JSON.parse(job.milestones.find(m=>m.id===plan.base_video.id).artifact).qa.voice_kind,...(release?{package_kind:RELEASE_PACKAGE_V2,release_binding:plan.binding,release_video:plan.base_video,release_project_archive:plan.project_archive,release_policy:plan.release_policy}:{})},{root});budget();
  return{cover,assets};
 });
 if(!cover.ready)return{...cover,...(cover.status==='native-aigc-covers-deferred'&&cover.generation?.budget_exhausted===true?{status:'post-video-upload-deferred',phase,budget_exhausted:true,resume_same_archives:true}:{}),...(cover.status==='native-aigc-covers-deferred'&&cover.generation?.confirmed_no_result===true&&cover.generation?.phase==='native-image-rate-limit'?{phase:'native-image-rate-limit',confirmed_no_result:true,next_retry_at:cover.generation.next_retry_at,reconciliation:cover.generation.reconciliation}:{}),job_id:id,plan_id:plan.plan_id,new_paid_calls:0,quality_approved:false,publication_authorized:false};
 if(assets.job_id!==id||assets.promotion_content_hash!==promo.content_hash)throw Error('POST_VIDEO_ASSET_RESULT_CHANGED');
 if(release!==!!assets.package_kind||release&&assets.package_kind!==RELEASE_PACKAGE_V2)throw Error('POST_VIDEO_RELEASE_KIND_CHANGED');
 phase='site_archive_start';const result=await withProductionStation(workstations,'archive',id,async()=>{await currentStage();return withLocalUploadLock(assets.output_dir,{inputHash:assets.input_hash,jobId:id,binding:{...plan.binding,scope_id:plan.scope_id,scope:'private-video'}},async()=>{
  const files=Object.fromEntries(roles.map(role=>{const f=exactFile(assets.files.find(f=>f.role===role),root);return[role,f]})),metadata=Object.fromEntries(roles.map(role=>{const f=files[role];return[role,{sha256:f.sha256,size_bytes:f.size_bytes,file_name:f.file_name,mime_type:f.mime_type,...(f.width?{width:f.width,height:f.height}:{})}]}));
  if(release)validateReleasePackageManifest(assets.release_manifest,{...releaseExpectations(plan),files:metadata,promo_content_hash:promo.content_hash});
  const checkpoint=createSiteUploadProgress(assets.output_dir,{namespace:'post-video',job_id:id,transfer_id:plan.plan_id,input_hash:assets.input_hash,binding:{...plan.binding,scope_id:plan.scope_id},files:metadata});
  state=await read();if(prepared(state))return{status:'post-video-prepared',reused:true};
  try{await step({action:'post_video_preparation_begin',id,plan_id:plan.plan_id,expected_version:state.plan.version,promo_package_id:promo.id,promo_content_hash:promo.content_hash,files:metadata,aigc_covers:assets.aigc_covers,...(release?{release_manifest:assets.release_manifest}:{})});}catch(e){if(e.code==='POST_VIDEO_TRANSFER_BUDGET_DEFERRED')throw e;const observed=await read();if(observed.plan?.status!=='staging'||canonical(observed.plan.files)!==canonical(metadata)||observed.plan.promo_content_hash!==promo.content_hash||canonical(observed.plan.aigc_covers)!==canonical(assets.aigc_covers)||release&&(observed.plan.package_kind!==RELEASE_PACKAGE_V2||canonical(observed.plan.release_manifest)!==canonical(assets.release_manifest)))throw e;}
  state=await read();if(state.is_current===false||canonical(state.plan.files)!==canonical(metadata)||release&&(state.plan.package_kind!==RELEASE_PACKAGE_V2||canonical(state.plan.release_manifest)!==canonical(assets.release_manifest)))throw Error('POST_VIDEO_STAGING_CHANGED');
  for(const role of roles){const f=files[role];let archive=state.archives.find(a=>a.file.role===role);
   if(!archive){try{const {width,height,...archiveFile}=metadata[role];({archive}=await step({action:'site_archive_start',id,request_id:'post-video-file-'+sha(plan.plan_id+'\n'+role),post_video_preparation_id:plan.plan_id,binding:plan.binding,owner_review_id:null,scope_id:plan.scope_id,scope_hash:plan.scope_hash,file:{role,...archiveFile}}));}catch(e){if(e.code==='POST_VIDEO_TRANSFER_BUDGET_DEFERRED')throw e;state=await read();archive=state.archives.find(a=>a.file.role===role);if(!archive)throw e;}}
   if(archive.file.sha256!==f.sha256||archive.file.size_bytes!==f.size_bytes)throw Error('POST_VIDEO_ARCHIVE_CHANGED');
   const progress=checkpoint.forArchive(role,archive);
   if(archive.status==='uploading'){await runSiteArchiveParts(archive.part_count,async n=>{const bytes=f.bytes.subarray(n*archive.part_size,(n+1)*archive.part_size);if(progress.uploaded(n,bytes))return;const ack=await step({action:'site_archive_part',id,site_archive_id:archive.site_archive_id,part:n,chunk_base64:bytes.toString('base64'),chunk_sha256:sha(bytes)});if(ack.part!==n||ack.site_archive_id!==undefined&&ack.site_archive_id!==archive.site_archive_id)throw Error('POST_VIDEO_PART_ACK_CHANGED');progress.acknowledgeUpload(n,bytes);},{beforeStart:()=>budget()});({archive}=await step({action:'site_archive_finalize',id,site_archive_id:archive.site_archive_id}));}
   if(archive.status!=='confirmed'){const chunks=await runSiteArchiveParts(archive.part_count,async n=>{const expected=f.bytes.subarray(n*archive.part_size,(n+1)*archive.part_size),cached=progress.cachedReadback(n,expected);if(cached)return cached;const r=await step({action:'site_archive_read_part',id,site_archive_id:archive.site_archive_id,part:n}),bytes=Buffer.from(r.chunk_base64,'base64');if(r.part!==n||r.site_archive_id!==archive.site_archive_id||bytes.length!==r.size_bytes||sha(bytes)!==r.chunk_sha256)throw Error('POST_VIDEO_PART_READBACK_CHANGED');if(!bytes.equals(expected))throw Error('POST_VIDEO_FULL_READBACK_CHANGED');progress.rememberReadback(n,bytes,expected);return bytes;},{beforeStart:()=>budget()});const bytes=Buffer.concat(chunks);if(bytes.length!==f.size_bytes||sha(bytes)!==f.sha256)throw Error('POST_VIDEO_FULL_READBACK_CHANGED');await step({action:'site_archive_confirm',id,site_archive_id:archive.site_archive_id,materialized_sha256:f.sha256,size_bytes:f.size_bytes,verified_at:new Date().toISOString()});}
   state=await read();
  }
  try{await step({action:'post_video_preparation_complete',id,plan_id:plan.plan_id,expected_version:state.plan.version});}catch(e){if(e.code==='POST_VIDEO_TRANSFER_BUDGET_DEFERRED')throw e;if(!prepared(await read()))throw e;}
  const saved=await read();if(!prepared(saved))throw Error('POST_VIDEO_RETURN_UNCONFIRMED');fs.writeFileSync(path.join(assets.output_dir,'site-preparation-return.json'),JSON.stringify(saved,null,2));return{status:'post-video-prepared',archives:saved.archives.map(a=>({id:a.site_archive_id,role:a.file.role,status:a.status}))};
 },{onConflict:async()=>prepared(await read())?{status:'post-video-prepared',reused:true,read_only_reconciled:true}:{status:'post-video-upload-waiting',retry_without_reconciliation:false}});});
 return{...result,job_id:id,plan_id:plan.plan_id,new_paid_calls:0,quality_approved:false,publication_authorized:false};
 }catch(e){if(!['POST_VIDEO_TRANSFER_BUDGET_DEFERRED','PRODUCTION_STATION_BUDGET_DEFERRED'].includes(e.code))throw e;return{status:'post-video-upload-deferred',job_id:id,plan_id:planId,phase,budget_exhausted:true,resume_same_archives:true,model_calls:0,new_paid_calls:0,quality_approved:false,publication_authorized:false};}
}
