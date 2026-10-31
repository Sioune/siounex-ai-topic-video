import {latestVideoMilestone} from './current-video.mts';
import {currentOwnerMediaRework,localAutomaticVideoReworkSupported} from './owner-media-rework-contract.mts';
import type {ProductionJob} from './production-contract';
import type {AutomaticCloneProgress} from './automatic-clone-progress.mts';

export type ProductionWorkspaceSection='published'|'completed'|'in_progress'|'cancelled';
export type ProductionWorkspacePlacement={workspace_section:ProductionWorkspaceSection;workspace_badge:string;publication_count:number};

function currentOwnerApproval(job:ProductionJob&{owner_id?:string|null},node:string){
 const owner=job.owner_id,m=(job.milestones||[]).filter(m=>m.node===node&&m.revision===job.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(!owner||!m||m.status!=='approved'||m.mode_epoch!==job.mode_epoch)return false;
 try{const report=JSON.parse(m.report||'null');if(report?.decision!=='approve'||report.actor!==owner||report.revision!==job.revision||report.mode_epoch!==job.mode_epoch||report.artifact_hash!==m.artifact_hash)return false;
  return (job.reviews||[]).some(r=>r.decision==='approve'&&r.revision===job.revision&&r.content_hash===m.artifact_hash&&r.reviewer===owner&&r.note===m.report);
 }catch{return false;}
}
// Read-only list placement. A returned/archived file is still production until
// the owner accepts the current video and final delivery is fully archived.
export function productionWorkspacePlacement(job:ProductionJob&{owner_id?:string|null},deliveryComplete=false,cloneProgress:AutomaticCloneProgress|null=null):ProductionWorkspacePlacement{
 const publicationCount=(job.publication_reports||[]).filter(p=>typeof p.published_at==='string'&&Number.isFinite(Date.parse(p.published_at))).length;
 if(publicationCount)return {workspace_section:'published',workspace_badge:'已登记发布',publication_count:publicationCount};
 if(job.status==='cancelled')return {workspace_section:'cancelled',workspace_badge:'已取消制作',publication_count:0};
 const f=job.facts,video=latestVideoMilestone(job),returned=f?.candidate_owner_review?.decision==='rework-requested';
 const currentClip=job.approved_revision===job.revision&&!!job.approved_hash&&f?.candidate_present===true&&f.files_archived===true&&/^[a-f0-9]{64}$/.test(f.candidate_video_sha256||'')&&!returned&&(!video||video.mode_epoch===job.mode_epoch&&['awaiting_human','approved'].includes(video.status));
 const finalOwnerAccepted=currentClip&&deliveryComplete&&job.status==='completed'&&(f?.complete_package_archived===true||f?.release_package_ready===true)&&f.video_approval==='owner-node-approved'&&video?.status==='approved'&&currentOwnerApproval(job,'video')&&currentOwnerApproval(job,'delivery');
 if(finalOwnerAccepted)return {workspace_section:'completed',workspace_badge:'交付完成，待发布',publication_count:0};
 const currentCandidate=job.approved_revision===job.revision&&!!job.approved_hash&&f?.candidate_present===true&&/^[a-f0-9]{64}$/.test(f.candidate_video_sha256||'')&&(!video||video.mode_epoch===job.mode_epoch&&!['invalidated','superseded'].includes(video.status));
 let badge=currentCandidate?(returned||video?.status==='revise'?'成片需修改':'成片待本人审核'):'';
 if(currentCandidate&&job.status==='approved'&&video?.status==='revise'&&localAutomaticVideoReworkSupported(video)&&currentOwnerMediaRework(job,video)){
  const h=f?.native_preparation_handoff;
  badge=h?.reconciliation&&h.reconciliation.state!=='resolved'?'修改调用待核对':h?.missing?.some(m=>m.code.startsWith('site-checkpoint:'))?'修改成片待回传':h?.lease_expired?'修改调用待核对':h?.status==='claimed'?'修改制作中':h?.status==='blocked'?'修改待接续':'修改已排队';
 }
 if(currentCandidate&&!returned&&f?.video_approval==='owner-node-approved'&&currentOwnerApproval(job,'video')){
  let voiceKind:string|undefined;try{voiceKind=JSON.parse(video!.artifact).qa?.voice_kind}catch{}
  badge=voiceKind==='ordinary-review'?'普通版已通过，待本人换声':'成片已审，待交付';
 }
 if(cloneProgress&&job.status==='approved'&&!returned&&video?.status==='approved')badge=cloneProgress.label;
 return {workspace_section:'in_progress',workspace_badge:badge,publication_count:0};
}
