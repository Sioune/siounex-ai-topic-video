// Historical audio contains a short silent closing slot. Keep its exact audio
// clock; replace obsolete text/branding with related real footage, then append
// the separately pinned V6. Never drop a row from a frozen narration timeline.
export function motionClosingTasks(tasks,storyboard){
 return tasks.map((task,index)=>{
  const s=storyboard[index];if(index!==storyboard.length-1||index<1||typeof s?.narration!=='string'||s.narration.trim())return task;
  // Any frozen, final silent row is a closing picture, including older rows
  // whose visual label is no longer the exact legacy tail/recap wording.
  return {...task,approved_visual:'旧无旁白收束占时：按已保存的去文字卡意见替换为相关真实动态收束镜头；V6独立片尾另行拼接。',silent_closing:true,requires_existing_video:true,previous_narration:storyboard[index-1].narration,question:'用与前段口播直接相关的真实动态镜头作无旁白收束，保留原时长，不新增口播、文字卡或另一段片尾。',search_angles:[storyboard[index-1].narration,'相关公开视频 收束镜头'],allowed_support:['actual-related-video']};
 });
}
