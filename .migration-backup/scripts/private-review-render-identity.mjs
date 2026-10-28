// A measured narration timeline does not freeze the renderer or the ending.
import fs from 'node:fs';
import path from 'node:path';
import spacedIdentity from '../production/template-layout-identity.json' with {type:'json'};
import {createHash} from 'node:crypto';
import {TITLE_LAYOUT_VERSION} from '../production/unified-runtime/title-layout-v3.mjs';
import {CAPTION_LAYOUT_VERSION} from './private-review-caption-layout.mjs';
import {LOWER_SLOT_LAYOUT_VERSION} from '../production/unified-runtime/node-stage-layout.mjs';
import {originalOutroFrames} from '../lib/outro-contract.mts';
import {completedPendingPrivateRenderTarget} from '../lib/pending-technical-refresh.mts';
import {validatePrivateRenderRuntime} from './private-render-runtime.mjs';
export function currentPrivateRenderIdentity(profile){return {schema:'private-render-identity-v1',caption_layout_version:CAPTION_LAYOUT_VERSION,caption_layout_sha256:createHash('sha256').update(fs.readFileSync(new URL('./private-review-caption-layout.mjs',import.meta.url))).digest('hex'),title_layout_version:TITLE_LAYOUT_VERSION,title_layout_sha256:createHash('sha256').update(fs.readFileSync(new URL('../production/unified-runtime/title-layout-v3.mjs',import.meta.url))).digest('hex'),lower_slot_layout_version:profile===spacedIdentity.profile?spacedIdentity.version:LOWER_SLOT_LAYOUT_VERSION,lower_slot_layout_sha256:profile===spacedIdentity.profile?spacedIdentity.sha256:createHash('sha256').update(fs.readFileSync(new URL('../production/unified-runtime/node-stage-layout.mjs',import.meta.url))).digest('hex')};}
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function inspectCompletedPendingPrivateRender(project,{job,producer_receipt:r,root}={}){
 try{
  if(!completedPendingPrivateRenderTarget(project?.render_identity,job)||!root||r?.schema!=='private-review-producer-receipt-v1'||r.status!=='files-ready'||r.audio_generated!==true||r.video_generated!==true||r.qa?.full_decode!==true||r.qa?.audio_decoded!==true||r.new_paid_calls!==0||r.quality_approved!==false||r.publication_authorized!==false||!Array.isArray(r.missing)||r.missing.length||!Array.isArray(r.gaps)||r.gaps.length||!Array.isArray(r.files))return null;
  const base=fs.realpathSync(root),dir=fs.realpathSync(r.output_dir||r.output_directory),inside=file=>{const p=fs.realpathSync(file);if(!p.startsWith(base+path.sep)||!fs.statSync(p).isFile())throw Error('COMPLETED_PRIVATE_RENDER_FILE_SCOPE');return p;};
  if(!dir.startsWith(base+path.sep))return null;
  const receiptFile=inside(path.join(dir,'producer-receipt.json')),receiptBytes=fs.readFileSync(receiptFile);if(canonical(JSON.parse(receiptBytes))!==canonical(r))return null;
  if(!['revision','script_hash','mode_epoch','contract_hash'].every(k=>r.binding?.[k]===(k==='script_hash'?job.approved_hash:job[k]))||r.binding?.scope_id!==job.media_continuation?.current_id||r.binding.scope_id!==project.binding?.scope_id||canonical(r.binding)!==canonical(project.binding)||r.input_hash!==project.input_hash)return null;
  const m=job.milestones.filter(m=>m.node==='video'&&m.revision===job.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0],a=JSON.parse(m.artifact),q=a.qa;if(sha(m.artifact)!==m.artifact_hash)return null;
  const files={};for(const role of ['video','project','voice','render_receipt']){const refs=r.files.filter(f=>f.role===role);if(refs.length!==1)return null;const ref=refs[0],file=inside(ref.path||ref.file),bytes=fs.readFileSync(file);if(bytes.length!==ref.size_bytes||sha(bytes)!==ref.sha256)return null;files[role]={...ref,file,bytes};}
  if(files.video.sha256!==a.sha256||r.video_sha256!==a.sha256||files.project.sha256!==q.project_sha256||files.voice.sha256!==q.audio_sha256||files.render_receipt.sha256!==q.render_receipt_sha256||canonical(JSON.parse(files.project.bytes))!==canonical(project)||project.body_frames!==project.render_identity.body_frames||privateBodyVisualHash(project)!==project.render_identity.body_visual_sha256||r.body_frames!==project.body_frames||r.total_frames!==project.body_frames+119||!Number.isFinite(r.duration_seconds)||Math.abs(r.duration_seconds-r.total_frames/30)>.08||project.outro?.version!=='v5'||project.outro_frames!==119||project.outro.sha256!==q.outro_sha256||r.qa.outro_sha256!==q.outro_sha256||r.qa.outro_frames!==119||r.qa.outro_version!=='v5')return null;
  validatePrivateRenderRuntime(project,path.dirname(files.project.file),{legacyProjectSha256:files.project.sha256});
  if(sha(fs.readFileSync(receiptFile))!==sha(receiptBytes))return null;
  return{schema:'completed-pending-private-render-compatibility-v1',input_hash:r.input_hash,producer_receipt_sha256:sha(receiptBytes),project_sha256:files.project.sha256,video_sha256:files.video.sha256,audio_sha256:files.voice.sha256,render_receipt_sha256:files.render_receipt.sha256,pending_video:{id:m.id,artifact_hash:m.artifact_hash,artifact_version:m.artifact_version},retained_render_identity:project.render_identity};
 }catch{return null;}
}
export function privateTechnicalChanges(project,inputs,{completed_pending_render}={}){
 const current=currentPrivateRenderIdentity(project?.layout_profile),old=project?.render_identity;
 const completed=inspectCompletedPendingPrivateRender(project,completed_pending_render),layout=!completed&&!!project?.stage_display_title&&!!project?.outro?.sha256&&Number.isSafeInteger(project.body_frames)&&Object.entries(current).some(([key,value])=>key!=='schema'&&old?.[key]!==value);
 const previous=project?.outro,next=inputs?.outro;
 const outro=!!previous?.sha256&&(next?.version==='v6'?previous.version!=='v6':next?.version==='v5'&&!['v5','v6'].includes(previous.version))&&[119,120].includes(originalOutroFrames(previous,project.outro_frames))&&originalOutroFrames(next)===119&&previous.sha256!==next.sha256;
 return {layout,outro,current,previous:old||null,compatible_completed_render:completed};
}

export function privateBodyVisualHash(project){const clean=m=>!m?null:m.kind==='image-sequence'?{kind:m.kind,items:m.items.map(clean)}:{kind:m.kind,asset_id:m.asset_id,sha256:m.sha256,display_crop:m.display_crop??null,...(m.kind==='video'?{start_seconds:Number(m.start_seconds||0)}:{}),...(m.kind==='article-quote'?{text:m.text,source_document_sha256:m.source_document_sha256??null}:{})};return createHash('sha256').update(JSON.stringify(project.source_to_timeline.map(row=>({start_frame:row.start_frame,end_frame:row.end_frame,media:clean(row.media)})),(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)).digest('hex');}
