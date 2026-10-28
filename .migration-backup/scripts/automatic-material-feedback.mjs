import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function materialFeedbackBinding(job){
 const latest=(job.milestones||[]).filter(m=>m.node==='video'&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch&&!['invalidated','superseded'].includes(m.status)).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(latest?.status!=='revise')return null;
 try{const report=JSON.parse(latest.report||'null');if(report?.decision!=='revise'||report.reason!==job.review_note||report.revision!==job.revision||report.mode_epoch!==job.mode_epoch||report.artifact_hash!==latest.artifact_hash)return null;
  const review=(job.reviews||[]).find(r=>r.decision==='revise'&&r.revision===job.revision&&r.content_hash===latest.artifact_hash&&r.note===latest.report&&r.reviewer===report.actor);
  return {milestone_id:latest.id,artifact_hash:latest.artifact_hash,artifact_version:latest.artifact_version,revision:latest.revision,mode_epoch:latest.mode_epoch,feedback_review_id:review?.id||null,report_sha256:sha(latest.report)};
 }catch{return null;}
}
export function requireMaterialBudget(deadline_ms=Infinity,clock=Date.now,minimum=60000,phase='automatic-material-preparation'){
 if(Number.isFinite(deadline_ms)&&deadline_ms-clock()<minimum)throw Object.assign(Error('PRIVATE_CONTINUATION_BUDGET_DEFERRED'),{code:'PRIVATE_CONTINUATION_BUDGET_DEFERRED',phase});
}
// These constraints describe the owner's saved editing request. They never
// change the approved narration or grant publication/paid generation rights.
export function materialFeedbackRequirements(feedback){
 const note=typeof feedback==='string'?feedback.trim():'';
 const moving=/(?:片段|动态画面|剧情视频|连续视频|原片|视频剪辑|动画视频)/.test(note),request=/(?:选|用|换|改|加|找|补|放|要|希望|更好|不更好)/.test(note);
 return {feedback_sha256:sha(typeof feedback==='string'?feedback:''),require_video:moving&&request,reject_editorial_cards:/口播要点|(?:不要|别用|去掉|为什么还有|删除).{0,12}(?:文字卡|解读卡)/.test(note),reject_meeting_stills:/(?:开大会|会场|会议|发布会)/.test(note)&&/(?:不要|别用|太差|都是|一塌糊涂|看不到|换|改|片段)/.test(note),note};
}
export function meetingStill(media){return media?.kind==='image'&&/(?:会场|会议现场|发布会|大会现场|舞台|讲台|大屏|参会人群|听众|展区|现场展板|展会全景)/.test((media.visible_observations||[]).join(' '));}
export function feedbackSelectionProblems(requirements,selected){
 const problems=[];
 if(requirements.reject_editorial_cards&&selected.some(m=>m?.kind==='article-quote'&&m.source_kind==='approved-narration-editorial-card'))problems.push({code:'owner-feedback-editorial-cards-rejected',detail:'本人已要求移除口播要点或文字卡，本轮须使用贴合内容的实际画面，不能再次选用口播解读卡。'});
 if(requirements.require_video&&!selected.some(m=>m?.kind==='video'))problems.push({code:'owner-feedback-video-clips-required',detail:'本次反馈要求加入真实视频片段；当前选择仍全是静态图片，不能视为已完成本次修改。'});
 if(requirements.reject_meeting_stills&&selected.some(meetingStill))problems.push({code:'owner-feedback-meeting-stills-rejected',detail:'本次反馈已拒绝会场、讲台或大屏静图，当前选择仍包含这类材料。'});
 return problems;
}
