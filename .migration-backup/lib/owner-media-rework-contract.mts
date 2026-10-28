// Cumulative historical reworks are an audit count, not a lifetime prohibition
// on a new, explicit owner direction. Each extension is tied to one rejected
// artifact and can produce only its next version; it grants no quality approval.
type Job={revision:number;mode_epoch:number;contract_hash:string;approved_hash:string|null;reworks?:number;owner_id?:string|null;review_note?:string|null;reviews?:any[]};
export const OWNER_LOCAL_MEDIA_REWORK_PAUSE='已保存本人成片修改意见；请点击“按已保存意见继续自动修改”，只制作下一版并重新送审';
export const OWNER_LOCAL_CLONE_REWORK_PAUSE='本人声音版修改意见已保存；当前不支持本人声音版自动重剪。原稿批准、当前本人音轨和工程保留；请回当前 Codex 制作对话按站内意见接续，修改版仍须本人二审。';
export function localClonedVideoReworkUnsupported(m:any){try{const a=JSON.parse(m.artifact),q=a.qa;return m.node==='video'&&a.storage==='site-private-r2'&&/^lrd_[a-f0-9]{64}$/.test(q?.local_review_draft_id||'')&&/^acl_[a-f0-9]{64}$/.test(q?.automatic_clone_request_id||'')&&q.voice_kind==='owner-cloned'&&q.owner_voice_used===true}catch{return false}}
export function localAutomaticVideoReworkSupported(m:any){try{const a=JSON.parse(m.artifact);return m.node==='video'&&/^local_review_video_[a-f0-9]{64}$/.test(m.id)&&a.storage==='site-private-r2'&&/^lrd_[a-f0-9]{64}$/.test(a.qa?.local_review_draft_id||'')&&a.qa.voice_kind==='ordinary-review'&&a.qa.owner_voice_used===false}catch{return false}}
export function currentOwnerMediaFeedback(j:Job,m:any,owner=j.owner_id){
 if(!owner||!m||!['cover','video','promotion'].includes(m.node)||m.status!=='revise'||m.revision!==j.revision||m.mode_epoch!==j.mode_epoch)return null;
 try{const report=JSON.parse(m.report||'null');if(!report||report.decision!=='revise'||report.actor!==owner||report.revision!==j.revision||report.mode_epoch!==j.mode_epoch||report.artifact_hash!==m.artifact_hash||typeof report.reason!=='string'||!report.reason.trim()||report.reason!==j.review_note)return null;
  return j.reviews?.find(r=>r.revision===j.revision&&r.content_hash===m.artifact_hash&&r.decision==='revise'&&r.reviewer===owner&&r.note===m.report)||null;
 }catch{return null}
}
export function currentOwnerMediaRework(j:Job,m:any,owner=j.owner_id){
 const feedback=currentOwnerMediaFeedback(j,m,owner);if(!feedback||!Number.isSafeInteger(j.reworks)||Number(j.reworks)<1)return null;
 return j.reviews?.find(r=>{if(r.revision!==j.revision||r.content_hash!==m.artifact_hash||r.decision!=='media_rework_requested'||r.reviewer!==owner)return false;try{const n=JSON.parse(r.note);return n.schema==='owner-media-rework-v2'&&n.node===m.node&&n.milestone_id===m.id&&n.artifact_hash===m.artifact_hash&&n.artifact_version===m.artifact_version&&n.revision===j.revision&&n.mode_epoch===j.mode_epoch&&n.contract_hash===j.contract_hash&&n.script_hash===j.approved_hash&&n.feedback_id===feedback.id&&n.feedback_report===m.report&&n.reason===j.review_note&&n.cumulative_reworks===j.reworks&&n.max_new_artifact_version===m.artifact_version+1&&n.max_new_versions===1&&n.quality_approval===false&&n.new_paid_authorization===false&&n.publication_authorization===false}catch{return false}})||null;
}
