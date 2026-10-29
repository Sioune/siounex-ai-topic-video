'use client';
import {useEffect,useState} from 'react';
import type {ProductionJob} from '@/lib/production-contract';
import type {NativeCandidateOwnerReview} from '@/lib/native-candidate-feedback-contract.mts';
import {SiteArchiveFiles,currentSiteVideoMilestone,hasCurrentFinalRetention} from './site-archive-files';
type Packet={status:string;label:string;blockers:string[];binding:{revision:number;base_artifact_version:number};packet_hash:string;candidate?:{record_id:string;sha256:string;file_name:string;duration:number;project_id:string;timeline_id:string;voice_kind?:'ordinary-temporary'|'owner-cloned';approved_native_version_id?:string;delivery_method?:'local-audio-only-finishing';delivery_id?:string;native_render_id?:null;archive_status:'archive_pending'|'archived';owner_review?:NativeCandidateOwnerReview}|null;capabilities:{claimed:boolean;native_editor_connected:boolean}};
export function nativeReviewVoiceLabel(review:Pick<NativeCandidateOwnerReview,'reviewed_voice_kind'>):string{return review.reviewed_voice_kind==='owner-cloned'?'本人声音版':'普通配音版';}
export function currentCandidateOwnerReview(job:ProductionJob,candidate?:NonNullable<Packet['candidate']>):NativeCandidateOwnerReview|null{
 const review=candidate?candidate.owner_review:job.facts?.candidate_owner_review;
 if(!review||typeof review.id!=='string'||!review.id||typeof review.quote!=='string'||!review.quote.trim()||!['approved','rework-requested'].includes(review.decision)||review.source!=='owner-oral-report'||!['ordinary-temporary','owner-cloned'].includes(review.reviewed_voice_kind)||review.website_button_clicked!==false||review.formal_milestone_approved!==false||review.quality_approved!==false||review.publication_authorized!==false||review.new_paid_calls!==0)return null;
 const b=review.binding;
 if(!b||job.approved_revision!==job.revision||!job.approved_hash||b.revision!==job.revision||b.script_hash!==job.approved_hash||b.mode_epoch!==job.mode_epoch||b.contract_hash!==job.contract_hash||!job.facts?.candidate_record_id?.startsWith('native_video_')||b.candidate_id!==job.facts.candidate_record_id||b.candidate_sha256!==job.facts.candidate_video_sha256)return null;
 if(candidate&&(b.candidate_id!==candidate.record_id||b.candidate_sha256!==candidate.sha256||b.project_id!==candidate.project_id||b.timeline_id!==candidate.timeline_id||candidate.voice_kind&&candidate.voice_kind!==review.reviewed_voice_kind||job.facts.candidate_owner_review&&review.id!==job.facts.candidate_owner_review.id))return null;
 return review;
}
export function candidateOwnerReviewSummary(job:ProductionJob):string|null{
 const review=currentCandidateOwnerReview(job);if(!review||job.facts?.video_approval==='owner-node-approved')return null;
 const voice=nativeReviewVoiceLabel(review);return review.decision==='rework-requested'?voice+'需修改':job.facts?.files_archived?voice+'聊天审阅通过 · 已归档':voice+'聊天审阅通过 · 待归档';
}
export function NativeCandidateOwnerReviewNotice({review,archived,formalStatus}:{review:NativeCandidateOwnerReview;archived:boolean;formalStatus?:string}){
 const ownerVoice=review.reviewed_voice_kind==='owner-cloned',voice=nativeReviewVoiceLabel(review);
 const formal=formalStatus==='approved'?(ownerVoice?'文件已归档，本人的聊天审片确认已回传正式视频节点。':'文件已归档，正式视频节点已通过本人审核。'):formalStatus==='awaiting_human'?'文件已归档，正式视频节点已回传，待本人审片。':formalStatus==='revise'?'文件已归档，正式视频节点已打回。':null;
 return <section aria-label={ownerVoice?'当前本人声音候选聊天审阅':'当前普通配音候选聊天审阅'}><h4>{voice} · 本人聊天审阅：{review.decision==='approved'?'通过':'需修改'}</h4><p>本人原话：</p><blockquote style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{review.quote}</blockquote><p>{formal||(archived?'文件已归档，正式视频节点仍按独立状态审核。':'文件待归档，正式视频审核节点尚待回传。')}{ownerVoice&&formalStatus==='approved'?'这条记录来自制作对话中的既有确认；未记录网站按钮点击。发布状态另行记录。':'聊天审阅记录不等于正式节点批准，发布状态另行记录。'}</p></section>;
}
export default function NativeHandoff({job}:{job:ProductionJob}){
 const [packet,setPacket]=useState<Packet|null>(null),[error,setError]=useState('');
 const ready=job.approved_revision===job.revision&&!!job.approved_hash;
 const videoState=(job.milestones||[]).filter(m=>m.node==='video'&&m.revision===job.revision).map(m=>[m.id,m.artifact_version,m.status,m.mode_epoch].join(':')).sort().join('|');
 useEffect(()=>{setPacket(null);setError('');if(!ready)return;let alive=true;
  fetch('/api/production?id='+encodeURIComponent(job.id)+'&view=native_packet',{cache:'no-store'}).then(async response=>{const value=await response.json() as {packet:Packet;error?:string};if(!response.ok)throw Error(value.error||'制作交接状态读取失败');if(alive){setPacket(value.packet);setError('');}}).catch(e=>{if(alive)setError(e.message)});
  return()=>{alive=false};
 },[ready,job.id,job.revision,job.mode_epoch,job.updated_at,job.facts?.candidate_record_id,job.facts?.candidate_video_sha256,job.facts?.files_archived,job.facts?.candidate_owner_review?.id,videoState]);
 if(!ready)return null;
 const candidate=packet&&['awaiting_candidate_review','awaiting_human','native_done'].includes(packet.status)?packet.candidate:null;
 const ownerReview=candidate?currentCandidateOwnerReview(job,candidate):null;
 const siteMilestone=currentSiteVideoMilestone(job);
 const completed=job.status==='completed'&&siteMilestone?.status==='approved'&&(job.facts?.complete_package_archived===true||job.facts?.release_package_ready===true);
 const completedLabel=completed?(currentCandidateOwnerReview(job)?.reviewed_voice_kind==='owner-cloned'?'本人声音版已归档，交付已完成':'本版成片已归档，交付已完成'):null;
 const editor=candidate&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(candidate.project_id)?'https://app.chatcut.io/editor/'+candidate.project_id:null;
 return <section className="job-next-step" aria-label="原生视频制作交接"><h3>原生视频制作交接</h3>
  {error?<p role="alert">{error}。请重新读取任务；旧状态不作为已开工证明。</p>:packet?<><p role="status">{completedLabel||(ownerReview?nativeReviewVoiceLabel(ownerReview)+(ownerReview.decision==='rework-requested'?'需修改':candidate?.archive_status==='archived'?'聊天审阅通过 · 已归档':'聊天审阅通过 · 待归档'):packet.label)}</p>{!completed&&packet.blockers.length>0&&<ul>{packet.blockers.map((item,i)=><li key={i}>{item}</li>)}</ul>}
   {candidate&&!completed?<div><p>{candidate.file_name} · {candidate.duration}秒</p>{candidate.voice_kind&&<p data-native-candidate-voice>声音：{candidate.voice_kind==='owner-cloned'?'本人声音版':'普通配音版'}</p>}{siteMilestone&&<p><a className="text-link" href="#video-review">查看成片审核节点与修改意见 →</a></p>}{ownerReview?<><NativeCandidateOwnerReviewNotice review={ownerReview} archived={candidate.archive_status==='archived'} formalStatus={siteMilestone?.status}/><p>{ownerReview.decision==='rework-requested'?'制作会话应按本次原话修改；当前文件和意见保留，修改后的候选需重新回传审阅。':siteMilestone?'本版已回传正式视频节点；按当前节点状态继续，无需重复制作或回传。':'当前候选可继续归档与回传，无需因登记聊天审阅重复制作。'}</p></>:<p>{siteMilestone?siteMilestone.status==='approved'?'本版成片已通过当前正式视频节点，封面与宣发按各自节点继续。':siteMilestone.status==='revise'?'本版成片已打回，请按当前修改意见继续。':'本版已回传正式视频审核节点，当前仍按节点状态等待本人审片。':candidate.archive_status==='archived'?'候选已归档，仍需按当前绑定回传正式视频审核节点。':'已有真实本地候选，文件归档与正式视频审核节点尚待回传。'}当前候选无需重复制作；范围确认和本人审片仍分别保留。</p>}<small style={{overflowWrap:'anywhere'}}>候选SHA256：{candidate.sha256}</small>{editor?<p><a href={editor} target="_blank" rel="noopener noreferrer">打开候选的 ChatCut 工程</a></p>:candidate.project_id?<p>工程ID：<code style={{overflowWrap:'anywhere'}}>{candidate.project_id}</code></p>:null}{candidate.timeline_id&&<p>时间线ID：<code style={{overflowWrap:'anywhere'}}>{candidate.timeline_id}</code></p>}</div>:completed?<p>本版成片与完整交付包已回站，下载见下方。{hasCurrentFinalRetention(job)?'历史哈希与审核意见保留于历史记录。':'旧版文件和审核意见保留于历史记录。'}</p>:<p>批准稿 v{packet.binding.revision}、模板、往期快照和返工意见随任务绑定。具备原生工具的制作会话可直接读取本任务，并按绑定版本回传；网站不会自动启动编辑器或代替你审片。</p>}
   {packet.candidate?.delivery_method==='local-audio-only-finishing'&&packet.candidate.native_render_id===null&&/^site_delivery_[a-f0-9]{64}$/.test(packet.candidate.delivery_id||'')&&<p data-local-audio-delivery>本地音轨混合成品，保留ChatCut可编辑工程。最终文件来源与工程编辑记录分别保存。</p>}
   <details><summary>查看交接版本核对信息</summary><p>当前视频产物版本：{packet.binding.base_artifact_version||'尚无正式视频审核节点'}{!candidate&&!completed&&<> · {packet.capabilities.claimed?'已领取':'尚未领取'}</>}。</p><small>交接校验：{packet.packet_hash}</small></details></>:<p>正在核对批准稿、返工意见和媒体范围…</p>}
  <SiteArchiveFiles job={job} compact/>
 </section>;
}
