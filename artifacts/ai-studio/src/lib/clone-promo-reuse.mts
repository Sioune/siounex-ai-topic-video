import {automaticCloneProof,automaticCloneVideo} from './automatic-clone-contract.mts';
import {validateNewGeneratedPromoContent,canonicalPromoPolicy} from './promo-content.mjs';
import {hash} from './production-contract';

const parsed=(v:unknown):any=>{try{return typeof v==='string'?JSON.parse(v):v;}catch{return null;}};
const same=(a:unknown,b:unknown)=>canonicalPromoPolicy(a)===canonicalPromoPolicy(b);
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const videoValue=(m:any)=>({milestone_id:m.id,artifact_hash:m.artifact_hash,artifact_version:m.artifact_version,...parsed(m.artifact)});

/** A byte copy of same-script candidate text, never inherited owner approval. */
export async function clonePromoReuseCandidate(job:any,current:any,source:any,owner:string){
 try{
  const proof=automaticCloneProof(job),video=automaticCloneVideo(job),input=parsed(current.input_snapshot),old=parsed(source?.input_snapshot);
  if(!proof||proof.owner_id!==owner||job.owner_id!==undefined&&job.owner_id!==owner||job.status!=='approved'||current.script_hash!==job.approved_hash||!['awaiting_human','approved'].includes(video?.status)||!input||!old)return null;
  const base=job.milestones.find((m:any)=>m.id===proof.request.base.milestone_id&&m.node==='video'&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch);
  const prior=job.milestones.find((m:any)=>m.id===old.video?.milestone_id&&m.node==='video'&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch);
  if(!base||!prior||base.artifact_hash!==proof.request.base.artifact_hash||base.artifact_version!==proof.request.base.artifact_version||await hash(base.artifact)!==base.artifact_hash||parsed(base.artifact)?.sha256!==proof.request.base.video_sha256||prior.artifact_version>base.artifact_version||await hash(prior.artifact)!==prior.artifact_hash||parsed(prior.artifact)?.qa?.voice_kind!=='ordinary-review'||parsed(prior.artifact)?.qa?.owner_voice_used!==false)return null;
  if(source.job_id!==job.id||source.created_by!==owner||source.status!=='ready'||typeof source.content!=='string'||!digest(source.content_hash)||await hash(source.content)!==source.content_hash||source.script_revision!==current.script_revision||source.script_hash!==current.script_hash||source.skill_hash!==current.skill_hash||source.video_binding===current.video_binding||!same(parsed(source.video_binding),videoValue(prior))||!same(old.video,videoValue(prior))||!same(input.video,videoValue(video))||await hash(video.artifact)!==video.artifact_hash)return null;
  if(old.script_revision!==input.script_revision||old.script_hash!==input.script_hash||old.mode_epoch!==input.mode_epoch||old.contract_hash!==input.contract_hash||!same(old.source,input.source)||!same(old.draft,input.draft)||!same(old.skill,input.skill)||!same(old.publishing_policy,input.publishing_policy))return null;
  const content=validateNewGeneratedPromoContent(parsed(source.content));
  // An old file identity or private review URL cannot become a new video's copy.
  if(JSON.stringify(content)!==source.content||/(?:\/api\/(?:site-archive|private-review|technical-preview)\b|chatgpt\.com\/api\/library\/files\/|\b(?:sitefile_|lrd_|local_review_video_)[a-z0-9_-]+|\b[a-f0-9]{64}\b|https?:\/\/[^\s"<>]+\.mp4(?:[?\s"<>]|$))/iu.test(source.content))return null;
  const reviews=job.reviews.filter((r:any)=>r.id===proof.first_review_id||r.decision==='automatic_clone_requested_v1'&&parsed(r.note)?.id===proof.request.id||r.decision==='automatic_clone_returned_v1'&&parsed(r.note)?.request_id===proof.request.id&&parsed(r.note)?.milestone_id===video.id&&parsed(r.note)?.video_sha256===parsed(video.artifact)?.sha256);
  if(reviews.length!==3)return null;
  return{content,proof,reviews,receipt:{schema:'clone-same-script-promo-reuse-v1',source_package_id:source.id,source_content_sha256:source.content_hash,source_input_sha256:await hash(source.input_snapshot),source_video_sha256:old.video.sha256,first_approved_video_sha256:proof.request.base.video_sha256,first_review_id:proof.first_review_id,automatic_clone_request_id:proof.request.id,result_video_sha256:input.video.sha256,result_input_sha256:await hash(current.input_snapshot),script_hash:current.script_hash,exact_content_preserved:true,model_calls:0,new_paid_calls:0,quality_approved:false,owner_approval_inherited:false,publication_authorized:false}};
 }catch{return null;}
}
