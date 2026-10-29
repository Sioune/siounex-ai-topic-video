// Only these original, owner-authored records are projected. Queue, rework,
// AI review and derived summaries are intentionally not copied into a new store.
export const OWNER_FEEDBACK_SQL=`
SELECT r.id,r.job_id,r.revision,r.content_hash,r.decision,r.note,r.reviewer,r.created_at,
       j.owner_id,t.title,'script' AS kind,NULL AS artifact_version
FROM production_reviews r JOIN production_jobs j ON j.id=r.job_id
JOIN topics t ON t.id=j.topic_id
JOIN production_drafts d ON d.job_id=r.job_id AND d.revision=r.revision AND d.content_hash=r.content_hash
WHERE j.owner_id=? AND j.is_test=0 AND r.reviewer=j.owner_id AND r.decision='script_feedback'
UNION ALL
SELECT r.id,r.job_id,r.revision,r.content_hash,r.decision,r.note,r.reviewer,r.created_at,
       j.owner_id,t.title,'video' AS kind,m.artifact_version
FROM production_reviews r JOIN production_jobs j ON j.id=r.job_id
JOIN topics t ON t.id=j.topic_id
JOIN production_milestones m ON m.job_id=r.job_id AND m.revision=r.revision AND m.artifact_hash=r.content_hash AND m.node='video'
WHERE j.owner_id=? AND j.is_test=0 AND r.reviewer=j.owner_id AND (
 (r.id LIKE 'milestone_review_%' AND r.decision IN ('revise','pause')) OR
 (r.decision='media_rework_requested' AND EXISTS(SELECT 1 FROM production_reviews original
  WHERE original.id=json_extract(CASE WHEN json_valid(r.note) THEN r.note ELSE '{}' END,'$.feedback_id')
  AND original.job_id=r.job_id AND original.revision=r.revision AND original.content_hash=r.content_hash
  AND original.reviewer=j.owner_id AND original.decision='revise' AND original.id LIKE 'milestone_review_%'
  AND json_extract(CASE WHEN json_valid(original.note) THEN original.note ELSE '{}' END,'$.actor')=j.owner_id)))
UNION ALL
SELECT r.id,r.job_id,r.revision,r.content_hash,r.decision,r.note,r.reviewer,r.created_at,
       j.owner_id,t.title,'preview' AS kind,NULL AS artifact_version
FROM production_reviews r JOIN production_jobs j ON j.id=r.job_id
JOIN topics t ON t.id=j.topic_id
JOIN app_state p ON p.key='wip_video_v1:'||json_extract(CASE WHEN json_valid(r.note) THEN r.note ELSE '{}' END,'$.preview_id')
WHERE j.owner_id=? AND j.is_test=0 AND r.reviewer=j.owner_id AND r.decision='human_preview_feedback'
 AND json_valid(p.value)
 AND json_extract(CASE WHEN json_valid(p.value) THEN p.value ELSE '{}' END,'$.id')=json_extract(CASE WHEN json_valid(r.note) THEN r.note ELSE '{}' END,'$.preview_id')
 AND json_extract(CASE WHEN json_valid(p.value) THEN p.value ELSE '{}' END,'$.job_id')=r.job_id AND json_extract(CASE WHEN json_valid(p.value) THEN p.value ELSE '{}' END,'$.owner_id')=j.owner_id
 AND json_extract(CASE WHEN json_valid(p.value) THEN p.value ELSE '{}' END,'$.revision')=r.revision AND json_extract(CASE WHEN json_valid(p.value) THEN p.value ELSE '{}' END,'$.sha256')=r.content_hash
 AND json_extract(CASE WHEN json_valid(p.value) THEN p.value ELSE '{}' END,'$.status')='ready'
ORDER BY created_at DESC`;

type Row={id:string;job_id:string;revision:number;content_hash:string;decision:string;note:string;reviewer:string;owner_id:string;created_at:string;title:string;kind:string;artifact_version:number|null};
export type OwnerFeedbackRecord={job_id:string;title:string;revision:number;artifact_version:number|null;kind:'script'|'video'|'preview';note:string;created_at:string;source_ids:string[];sources:{id:string;created_at:string}[];preview_id?:string};
const syntheticLock='逐字保留站内锁定完整原稿，仅制作分镜与素材说明；发现事实、时长或权利问题须暂停并列出理由，不得擅自改写。';
export function projectOwnerFeedback(rows:Row[],owner:string):OwnerFeedbackRecord[]{
 const seen=new Map<string,OwnerFeedbackRecord>();
 for(const r of rows){
  if(!owner||r.owner_id!==owner||r.reviewer!==owner||!r.id||!r.job_id||!Number.isSafeInteger(r.revision))continue;
  let value:any;try{value=JSON.parse(r.note)}catch{continue}
  let note:string;
  if(r.kind==='script'&&r.decision==='script_feedback'&&value?.schema==='siounex-script-feedback-v1'&&value.revision===r.revision&&value.script_hash===r.content_hash&&typeof value.note==='string'&&value.note!==syntheticLock)note=value.note;
  else if(r.kind==='video'&&r.id.startsWith('milestone_review_')&&['revise','pause'].includes(r.decision)&&value?.actor===owner&&value.decision===r.decision&&value.revision===r.revision&&value.artifact_hash===r.content_hash&&typeof value.reason==='string')note=value.reason;
  else if(r.kind==='video'&&r.decision==='media_rework_requested'&&['owner-media-rework-v2','owner-media-rework-legacy-v1'].includes(value?.schema)&&value.node==='video'&&value.revision===r.revision&&value.artifact_hash===r.content_hash&&typeof value.reason==='string')note=value.reason;
  else if(r.kind==='preview'&&r.decision==='human_preview_feedback'&&value?.schema==='human-preview-feedback-v1'&&/^wipv_[a-f0-9]{64}$/.test(value.preview_id||'')&&/^[a-f0-9]{64}$/.test(r.content_hash)&&value.video_sha256===r.content_hash&&typeof value.feedback==='string')note=value.feedback;
  else continue;
  if(!note.trim())continue;
  const key=JSON.stringify([r.job_id,r.kind,r.revision,r.content_hash,r.kind==='preview'?value.preview_id:null,note]);
  const current=seen.get(key);
  if(current){if(!current.source_ids.includes(r.id)){current.source_ids.push(r.id);current.sources.push({id:r.id,created_at:r.created_at});}if(current.artifact_version!==r.artifact_version)current.artifact_version=null;continue;}
  seen.set(key,{job_id:r.job_id,title:r.title,revision:r.revision,artifact_version:r.artifact_version,kind:r.kind as 'script'|'video'|'preview',note,created_at:r.created_at,source_ids:[r.id],sources:[{id:r.id,created_at:r.created_at}],...(r.kind==='preview'?{preview_id:value.preview_id}:{})});
 }
 return [...seen.values()];
}
export async function readOwnerFeedback(database:{prepare:(sql:string)=>{bind:(...args:string[])=>{all:()=>Promise<{results:Row[]}>}}},owner:string){
 const result=await database.prepare(OWNER_FEEDBACK_SQL).bind(owner,owner,owner).all();
 return projectOwnerFeedback(result.results,owner);
}
