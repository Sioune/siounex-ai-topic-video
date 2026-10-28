import legacyOutroCatalog from '../production/outro-v5-assets.json' with {type:'json'};
import spacedIdentity from '../production/template-layout-identity.json' with {type:'json'};
import outroCatalog from '../production/outro-v6-assets.json' with {type:'json'};
import {defaultOutroAsset,originalOutroFrames,originalOutroSeconds} from './outro-contract.mts';
export const PARAGRAPH_DISPLAY_PREDECESSOR_PRIVATE_RENDER_TARGET={title_layout_version:'balanced-measured-two-line-title-v2',title_layout_sha256:'d7d6ba62d57416a5eae8781ba15039a75cd516ffe7737d613139147f6f3681b3',caption_layout_version:'natural-word-balanced-paginated-captions-v3-paragraph-display',caption_layout_sha256:'a9410394f9887609d5e91aceadbad3656e6c7eefca2972f289de16565c362d85'};
export const HISTORY_COPY_PREDECESSOR_PRIVATE_RENDER_TARGET={...PARAGRAPH_DISPLAY_PREDECESSOR_PRIVATE_RENDER_TARGET,lower_slot_layout_version:'explicit-history-lower-slot-v2',lower_slot_layout_sha256:'1ac739924199aa5e5b0794d0a5aa2fae1dfcdc16c2aa0f20fbf110fcca6c7d27'};
export const CURRENT_PRIVATE_RENDER_TARGET={...HISTORY_COPY_PREDECESSOR_PRIVATE_RENDER_TARGET,title_layout_version:'measured-slot-minimum-title-v3',title_layout_sha256:'651f7ba4afe1df1eea4e3b8fe88edb3e8fdc2b2df1c68fe8a45332755c64cbc5'};
// A deployment may finish while an exact earlier registered render is being
// archived. Accept its real identity; do not relabel it as the current target.
export const PREVIOUS_PRIVATE_RENDER_TARGET={title_layout_version:'balanced-measured-two-line-title-v2',title_layout_sha256:'d7d6ba62d57416a5eae8781ba15039a75cd516ffe7737d613139147f6f3681b3',caption_layout_version:'natural-word-balanced-two-line-captions-v1',caption_layout_sha256:'17b709a72704e62fb79550baaa97fd92178ddcd89798545e876cf6295aa0595a'};
const PARAGRAPH_PREDECESSOR_PRIVATE_RENDER_TARGET={title_layout_version:'balanced-measured-two-line-title-v2',title_layout_sha256:'d7d6ba62d57416a5eae8781ba15039a75cd516ffe7737d613139147f6f3681b3',caption_layout_version:'natural-word-balanced-paginated-captions-v2',caption_layout_sha256:'093a7924917d113364d8d066abe4306b6bb3e39ddc08b72be386db00f43843de'};
export const SPACED_PRIVATE_RENDER_TARGET={...CURRENT_PRIVATE_RENDER_TARGET,lower_slot_layout_version:spacedIdentity.version,lower_slot_layout_sha256:spacedIdentity.sha256};
export const SPACED_HISTORY_COPY_PREDECESSOR_PRIVATE_RENDER_TARGET={...HISTORY_COPY_PREDECESSOR_PRIVATE_RENDER_TARGET,lower_slot_layout_version:spacedIdentity.version,lower_slot_layout_sha256:spacedIdentity.sha256};
export function currentPrivateRenderTarget(value:any,{completed_pending_job}:any={}){return !!value&&([CURRENT_PRIVATE_RENDER_TARGET,SPACED_PRIVATE_RENDER_TARGET].some(target=>Object.entries(target).every(([k,v])=>value[k]===v))||completedPendingPrivateRenderTarget(value,completed_pending_job));}
export function registeredPrivateRenderTarget(value:any){return !!value&&[SPACED_PRIVATE_RENDER_TARGET,CURRENT_PRIVATE_RENDER_TARGET,HISTORY_COPY_PREDECESSOR_PRIVATE_RENDER_TARGET,SPACED_HISTORY_COPY_PREDECESSOR_PRIVATE_RENDER_TARGET,PREVIOUS_PRIVATE_RENDER_TARGET,PARAGRAPH_PREDECESSOR_PRIVATE_RENDER_TARGET,PARAGRAPH_DISPLAY_PREDECESSOR_PRIVATE_RENDER_TARGET].some(target=>Object.entries(target).every(([k,v])=>value[k]===v)&&Object.keys(CURRENT_PRIVATE_RENDER_TARGET).filter(k=>!(k in target)).every(k=>value[k]===undefined));}
const canonical=(v:any)=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const digest=(v:any)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
// This exception describes an actual returned candidate, never a new target or
// a failed render. Preserve its original V2 identity instead of relabelling it.
export function completedPendingPrivateRenderTarget(value:any,j:any):boolean{
 try{
  if(!value||value.schema!=='private-render-identity-v1'||![HISTORY_COPY_PREDECESSOR_PRIVATE_RENDER_TARGET,SPACED_HISTORY_COPY_PREDECESSOR_PRIVATE_RENDER_TARGET].some(t=>Object.entries(t).every(([k,v])=>value[k]===v))||!Number.isSafeInteger(value.body_frames)||value.body_frames<1||!digest(value.body_visual_sha256))return false;
  if(!j||j.status!=='approved'||j.error||!['auto','node'].includes(j.review_mode)||j.approved_revision!==j.revision||!digest(j.approved_hash)||!Number.isSafeInteger(j.revision)||j.revision<1||!Number.isSafeInteger(j.mode_epoch)||j.mode_epoch<0||!digest(j.contract_hash)||j.milestones?.some((m:any)=>m.node==='video'&&m.revision===j.revision&&m.status==='approved'))return false;
  const m=j.milestones?.filter((m:any)=>m.node==='video'&&m.revision===j.revision).sort((a:any,b:any)=>b.artifact_version-a.artifact_version)[0];
  if(!m||m.status!=='awaiting_human'||m.report||m.mode_epoch!==j.mode_epoch||!/^local_review_video_[a-f0-9]{64}$/.test(m.id)||!digest(m.artifact_hash)||!Number.isSafeInteger(m.artifact_version)||m.artifact_version<1)return false;
  const a=JSON.parse(m.artifact),q=a.qa,rid=q?.local_review_draft_id,seconds=Number(q?.final_duration?.report?.measurements_seconds?.container_duration);
  if(a.storage!=='site-private-r2'||!digest(a.sha256)||a.cost!==0||!/^lrd_[a-f0-9]{64}$/.test(rid)||a.provider_job_id!==rid||typeof a.site_archive_id!=='string'||!a.site_archive_id||q.decoded!==true||q.width!==1080||q.height!==1920||q.audio_present!==true||q.voice_kind!=='ordinary-review'||q.owner_voice_used!==false||q.automatic_clone_request_id||q.quality_approved!==false||q.publication_authorized!==false||![q.project_sha256,q.render_receipt_sha256,q.audio_sha256,q.voice_script_text_sha256].every(digest)||canonical(q.render_identity)!==canonical(value))return false;
  if(!['v5','v6'].includes(q.outro_version)||q.outro_frames!==119||!Object.values(q.outro_version==='v5'?legacyOutroCatalog.variants:outroCatalog.variants).some((o:any)=>o.sha256===q.outro_sha256)||!Number.isFinite(q.outro_duration_seconds)||Math.abs(q.outro_duration_seconds-119/30)>.000001||!Number.isFinite(seconds)||Math.abs(seconds-(value.body_frames+119)/30)>.08)return false;
  if(q.delivery_mode==='results-only'?q.project_archive_id!==undefined:typeof q.project_archive_id!=='string')return false;
  return !!j.reviews?.some((r:any)=>{if(r.revision!==j.revision||r.content_hash!==a.sha256||r.decision!=='local_review_draft_return_v1')return false;try{const n=JSON.parse(r.note),b=n.binding;return n.schema==='local-review-draft-return-v1'&&n.local_draft_id===rid&&n.milestone_id===m.id&&b?.revision===j.revision&&b.script_hash===j.approved_hash&&b.mode_epoch===j.mode_epoch&&b.contract_hash===j.contract_hash&&b.candidate_id===rid&&b.candidate_sha256===a.sha256&&n.archives?.video===a.site_archive_id&&n.archives?.project_archive===q.project_archive_id&&n.delivery_mode===q.delivery_mode&&n.quality_approved===false&&n.publication_authorized===false&&n.new_paid_calls===0}catch{return false}});
 }catch{return false;}
}
export function validatePendingTechnicalRefresh(old:any,next:any,technical:any,series:any,catalog:any){
 if(!technical)return false; // Original same-timing display-title path remains compatible.
 const keys=['schema','body_frames','body_visual_sha256','previous_render_identity','result_render_identity','previous_outro','result_outro'];
 if(Object.keys(technical).sort().join()!==keys.sort().join()||technical.schema!=='pending-layout-outro-technical-v1'||!Number.isSafeInteger(technical.body_frames)||technical.body_frames<1||!digest(technical.body_visual_sha256))throw Error('技术刷新正文身份无效');
 const identity=(v:any)=>v&&v.schema==='private-render-identity-v1'&&registeredPrivateRenderTarget(v);
 const before=technical.previous_render_identity,after=technical.result_render_identity;
 if(!identity(after)||canonical(next.qa.render_identity)!==canonical(after)||canonical(old.qa.render_identity??null)!==canonical(before))throw Error('技术刷新布局版本与原候选绑定不符');
 const layout=Object.keys(CURRENT_PRIVATE_RENDER_TARGET).some(k=>before?.[k]!==after[k]);
 const pin=(q:any)=>({sha256:q.outro_sha256,version:q.outro_version||'legacy',frames:q.outro_frames??120,duration_seconds:q.outro_duration_seconds??4});
 const a=pin(old.qa),b=pin(next.qa);
 if(canonical(a)!==canonical(technical.previous_outro)||canonical(b)!==canonical(technical.result_outro))throw Error('技术刷新片尾证明与真实回执不符');
 const outro=canonical(a)!==canonical(b);
 if(outro){const selected=defaultOutroAsset(catalog,series?.template?.tone||'mixed',series?.outro?.terminal_background_tone||series?.template?.terminal_background_tone);if(a.version===selected.version||![119,120].includes(a.frames)||!digest(a.sha256)||b.sha256!==selected.sha256||b.version!==selected.version||b.frames!==originalOutroFrames(selected)||Math.abs(b.duration_seconds-originalOutroSeconds(selected))>.000001)throw Error('技术刷新只允许精确旧版升级为当前v5原件');}
 if(!layout&&!outro)throw Error('技术刷新没有实际布局或片尾版本变化');
 const body=technical.body_frames,oldSeconds=Number(old.video.duration),nextSeconds=Number(next.video.duration);
 if(old.qa.render_identity?.body_frames!==undefined&&old.qa.render_identity.body_frames!==body||after.body_frames!==body||Math.abs(oldSeconds-(body+a.frames)/30)>.08||Math.abs(nextSeconds-(body+b.frames)/30)>.08||before?.body_visual_sha256&&before.body_visual_sha256!==technical.body_visual_sha256||after.body_visual_sha256!==technical.body_visual_sha256)throw Error('技术刷新不能改变正文画面身份或原音画时序');
 return true;
}
