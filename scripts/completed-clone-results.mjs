// Reuse a completed result by its current owner/request/audio binding. No ZIP,
// source media, process control, render, provider call, or mutation is needed.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {automaticCloneAudioProjection,automaticCloneAudioEvidence} from '../lib/automatic-clone-contract.mts';
import {validateCloneDurationPolicy} from '../lib/automatic-clone-duration.mts';

const digest=/^[a-f0-9]{64}$/,sha=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const fail=code=>{throw Object.assign(Error(code),{code});};
function inside(root,file){const p=path.relative(root,file);return p!==''&&!path.isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+path.sep);}
function bytes(root,file,max=250000000){const at=path.resolve(file);if(!inside(root,at))fail('AUTOMATIC_CLONE_FILE_SCOPE');let cursor=root;for(const part of path.relative(root,at).split(path.sep)){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())fail('AUTOMATIC_CLONE_FILE_SCOPE');}const s=fs.statSync(at);if(!s.isFile()||s.size<1||s.size>max)fail('AUTOMATIC_CLONE_FILE_SCOPE');return fs.readFileSync(at);}
function json(root,file){return JSON.parse(bytes(root,file,8388608).toString('utf8').replace(/^\uFEFF/,''));}
function checked(root,out,ref){const file=path.resolve(root,ref?.file||ref?.path||'');if(!inside(out,file)||!digest.test(ref?.sha256||''))fail('AUTOMATIC_CLONE_FILE_REFERENCE_INVALID');const b=bytes(root,file);if(sha(b)!==ref.sha256||b.length!==ref.size_bytes)fail('AUTOMATIC_CLONE_BYTES_CHANGED');return{file,bytes:b,sha256:ref.sha256};}
// A newer selection does not invalidate already completed export bytes. Recover
// only an immutable prior repair proof with the exact current approval/audio
// binding; every render/file check below and actual-export QA still applies.
function completedPriorRepair(root,job,r,result,current){
 const id=result.visual_repair_identity;if(!digest.test(id||'')||!current.proof?.binding)fail('AUTOMATIC_CLONE_VISUAL_REPAIR_PRIOR_UNCLASSIFIED');
 const dir=path.join(root,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision,'automatic-clone',r.id,'visual-repair'),file=path.join(dir,'ready',id+'.json');if(!fs.existsSync(file))fail('AUTOMATIC_CLONE_VISUAL_REPAIR_PRIOR_UNCLASSIFIED');
 const proof=json(root,file),{identity,...body}=proof;
 if(identity!==id||sha(canonical(body))!==id||proof.schema!=='clone-visual-repair-ready-v1'||canonical(proof.binding)!==canonical(current.proof.binding)||proof.quality_approved!==false||proof.new_speech_calls!==0||proof.new_paid_calls!==0||proof.publication_authorized!==false||!digest.test(proof.manifest?.sha256||'')||!digest.test(proof.material_set_hash||'')||!digest.test(proof.timing_sha256||''))fail('AUTOMATIC_CLONE_VISUAL_REPAIR_PRIOR_UNCLASSIFIED');
 const prior=checked(root,path.join(dir,'failures'),proof.failure),failure=JSON.parse(prior.bytes);
 if(failure.schema!=='clone-visual-repair-failure-v1'||canonical(failure.binding)!==canonical(proof.binding)||failure.quality_approved!==false)fail('AUTOMATIC_CLONE_VISUAL_REPAIR_PRIOR_UNCLASSIFIED');
 // material-inputs.json is a moving selection pointer. Do not restore it or
 // require old source planes for a finished render; its original hash stays
 // in this immutable proof and the exported project retains its shot recipe.
}
const binding=(a,b)=>a&&b&&['revision','mode_epoch','script_hash','contract_hash'].every(k=>a[k]===b[k]);
function oldPaceCompleted(root,out,result,r){
 if(result.owner_voice_used!==true||result.voice_kind!=='owner-cloned'||result.video_generated!==true||result.new_paid_calls!==0||result.quality_approved!==false||!Array.isArray(result.files)||result.qa?.clone_sync?.base_video_sha256!==r.base.video_sha256||result.qa.clone_sync.audio_sha256!==r.provider_result.audio_sha256)fail('AUTOMATIC_CLONE_LOCAL_RESULT_UNKNOWN');
 const videos=result.files.filter(f=>f.role==='video'),receipts=result.files.filter(f=>f.role==='render_receipt');
 if(videos.length!==1||receipts.length!==1)fail('AUTOMATIC_CLONE_LOCAL_RESULT_UNKNOWN');
 const video=checked(root,out,videos[0]),receipt=checked(root,out,receipts[0]),file=path.join(out,'render-completed.json');
 if(!fs.existsSync(file))fail('AUTOMATIC_CLONE_LOCAL_RESULT_UNKNOWN');const completed=json(root,file),completedVideo=completed.files?.filter(f=>f.role==='video')||[],completedReceipt=completed.files?.filter(f=>['provenance','render_receipt'].includes(f.role))||[];
 if(result.video_sha256!==video.sha256||completed.video_generated!==true||completed.video_sha256!==video.sha256||completedVideo.length!==1||completedReceipt.length!==1)fail('AUTOMATIC_CLONE_LOCAL_RESULT_UNKNOWN');
 const actualVideo=checked(root,out,completedVideo[0]),actualReceipt=checked(root,out,completedReceipt[0]);
 if(actualVideo.file!==video.file||actualVideo.sha256!==video.sha256||actualReceipt.file!==receipt.file||actualReceipt.sha256!==receipt.sha256)fail('AUTOMATIC_CLONE_LOCAL_RESULT_UNKNOWN');
 return true;
}
export function findCompletedCloneResult({root,job,request:r,script,speech,pace_policy_sha256,visual_repair=null}){
 r=automaticCloneAudioProjection(r);if(r?.studio_preview_generation_head&&!automaticCloneAudioEvidence(r,r.provider_result))fail('AUTOMATIC_CLONE_GENERATION_AUDIO_REQUIRED');
 if(!digest.test(pace_policy_sha256||''))fail('AUTOMATIC_CLONE_PACE_POLICY_REQUIRED');
 root=fs.realpathSync(root);const parent=path.join(root,'.sites-runtime/automatic-clone-renders');if(!fs.existsSync(parent))return null;
 const dirs=fs.readdirSync(parent,{withFileTypes:true}).filter(e=>digest.test(e.name));if(dirs.length>256)fail('AUTOMATIC_CLONE_COMPLETED_RESULT_SCAN_LIMIT');const matches=[];
 for(const entry of dirs){
  if(entry.isSymbolicLink())fail('AUTOMATIC_CLONE_FILE_SCOPE');if(!entry.isDirectory())continue;const out=path.join(parent,entry.name),receiptFile=path.join(out,'producer-receipt.json'),startFile=path.join(out,'producer-started.json');
  if(!fs.existsSync(startFile))continue;const start=json(root,startFile);if(start.automatic_clone_request_id!==r.id)continue;if(r.studio_preview_generation_head){const h=r.studio_preview_generation_head;if(start.generation_id!==h.generation_id)continue;if(start.generation_header_sha256!==h.header_sha256)fail('AUTOMATIC_CLONE_CACHED_RESULT_CHANGED');}
  if(!binding(start.binding,r.binding))fail('AUTOMATIC_CLONE_CACHED_RESULT_CHANGED');
  if(!fs.existsSync(receiptFile)){const projectFile=path.join(out,'editable-project.json');if(fs.existsSync(projectFile)&&json(root,projectFile).owner_body_pace_policy_sha256!==pace_policy_sha256)continue;fail('AUTOMATIC_CLONE_LOCAL_RESULT_UNKNOWN');}
  const result=json(root,receiptFile);if(visual_repair){if((result.owner_body_pace_policy_sha256===undefined||digest.test(result.owner_body_pace_policy_sha256||'')&&result.owner_body_pace_policy_sha256!==pace_policy_sha256)&&result.schema==='private-review-producer-receipt-v1'&&result.status==='files-ready'&&result.input_hash===entry.name&&result.automatic_clone_request_id===r.id&&binding(result.binding,r.binding)&&oldPaceCompleted(root,out,result,r))continue;const rejected=visual_repair.excluded_receipts?.find(ref=>path.resolve(ref.file)===receiptFile&&ref.video_sha256===result.video_sha256);if(rejected&&sha(bytes(root,receiptFile,8388608))===rejected.sha256&&fs.statSync(receiptFile).size===rejected.size_bytes)continue;if(result.visual_repair_identity!==visual_repair.identity)completedPriorRepair(root,job,r,result,visual_repair);}if(r.studio_preview_generation_head&&(result.generation_id!==r.studio_preview_generation_head.generation_id||result.generation_header_sha256!==r.studio_preview_generation_head.header_sha256))fail('AUTOMATIC_CLONE_CACHED_RESULT_CHANGED');if(result.owner_body_pace_policy_sha256!==pace_policy_sha256)continue;const q=result.qa?.clone_sync;
  if(result.schema!=='private-review-producer-receipt-v1'||result.status!=='files-ready'||result.input_hash!==entry.name||result.automatic_clone_request_id!==r.id||result.source_word_timestamps_sha256!==(r.provider_result.word_timestamps_sha256||null)||!binding(result.binding,r.binding)||result.owner_voice_used!==true||result.voice_kind!=='owner-cloned'||result.video_generated!==true||result.new_paid_calls!==0||result.quality_approved!==false||!Array.isArray(result.files)||q?.base_video_sha256!==r.base.video_sha256||q.audio_sha256!==r.provider_result.audio_sha256||q.caption_audio_sha256!==r.provider_result.audio_sha256||q.full_decode!==true)fail('AUTOMATIC_CLONE_CACHED_RESULT_CHANGED');
  const refs={};for(const role of ['video','voice','project','render_receipt','clone-sync-map']){const rows=result.files.filter(f=>f.role===role);if(rows.length!==1)fail('AUTOMATIC_CLONE_CACHED_RESULT_CHANGED');refs[role]=checked(root,out,rows[0]);}
  if(refs.video.sha256!==result.video_sha256||refs.video.sha256===r.base.video_sha256||refs.voice.sha256!==r.provider_result.audio_sha256||refs.project.sha256!==q.result_timeline_sha256||refs['clone-sync-map'].sha256!==q.sync_map_sha256||result.qa.final_duration?.file_sha256!==refs.video.sha256)fail('AUTOMATIC_CLONE_CACHED_RESULT_CHANGED');
  const p=JSON.parse(refs.project.bytes),sync=JSON.parse(refs['clone-sync-map'].bytes),duration=Number(result.qa.final_duration?.report?.measurements_seconds?.container_duration);
  if(p.job_id!==job.id||p.input_hash!==entry.name||p.owner_body_pace_policy_sha256!==pace_policy_sha256||!binding(p.binding,r.binding)||p.script!==script||p.script_text_sha256!==sha(script)||p.automatic_clone_request_id!==r.id||p.clone_source_audio_sha256!==r.provider_result.audio_sha256||p.owner_voice_used!==true||p.voice_kind!=='owner-cloned'||p.gaps?.length||sync.owner_body_pace_policy_sha256!==pace_policy_sha256||sync.request_id!==r.id||!binding(sync.binding,r.binding)||sync.base_video_sha256!==r.base.video_sha256||sync.raw_audio_sha256!==r.provider_result.audio_sha256||sync.script_text_sha256!==sha(script)||sync.speech_text_sha256!==sha(speech)||sync.result_timeline_sha256!==refs.project.sha256||!Number.isFinite(duration)||duration<=0||duration>60.1)fail('AUTOMATIC_CLONE_CACHED_RESULT_CHANGED');
  if(!same(p.clone_duration_policy,q.duration_policy)||!same(sync.duration_policy,q.duration_policy)||!validateCloneDurationPolicy(q.duration_policy,{raw_body_seconds:r.provider_result.duration_seconds,outro_frames:p.outro_frames,result_total_seconds:duration}))fail('AUTOMATIC_CLONE_CACHED_RESULT_CHANGED');
  const completed=json(root,path.join(out,'render-completed.json')),renderStart=json(root,path.join(out,'render-started.json'));
  if(completed.video_generated!==true||completed.video_sha256!==refs.video.sha256||!completed.files?.some(f=>f.role==='video'&&f.sha256===refs.video.sha256)||!completed.files?.some(f=>['provenance','render_receipt'].includes(f.role)&&f.sha256===refs.render_receipt.sha256)||renderStart.audio_sha256!==r.provider_result.audio_sha256||!digest.test(renderStart.project_sha256||'')||!/^render-owner-[a-f0-9-]{36}\.json$/.test(renderStart.owner_file||''))fail('AUTOMATIC_CLONE_CACHED_RESULT_CHANGED');
  const ownerBytes=bytes(root,path.join(out,renderStart.owner_file),64000),owner=JSON.parse(ownerBytes);if(sha(ownerBytes)!==renderStart.owner_sha256||owner.schema!=='automatic-clone-local-render-owner-v1'||owner.job_id!==job.id||owner.request_id!==r.id||!binding(owner.binding,r.binding)||owner.input_hash!==entry.name||owner.audio_sha256!==r.provider_result.audio_sha256||!digest.test(owner.renderer_sha256||'')||!['milestone_id','artifact_hash','artifact_version','video_sha256','local_draft_id'].every(k=>same(owner.base?.[k],r.base?.[k])))fail('AUTOMATIC_CLONE_CACHED_RESULT_CHANGED');
  matches.push({...result,files:result.files.filter(f=>!['project_archive','archive-readback'].includes(f.role)),delivery_mode:'results-only',reused:true});
 }
 if(matches.length>1)fail('AUTOMATIC_CLONE_COMPLETED_RESULT_AMBIGUOUS');return matches[0]||null;
}
