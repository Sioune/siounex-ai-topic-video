// Read-only progress shared by the compact list and the separately read detail.
// No label here authorizes a retry, voice generation, approval or warehouse move.
import {AUTOMATIC_CLONE_SCHEMA,AUTOMATIC_CLONE_VOICE,automaticCloneVideo,automaticCloneCurrentAudioResult} from './automatic-clone-contract.mts';
import {sanitizeClonePreparationDiagnostic} from './automatic-clone-retry-contract.mts';
type Row=Record<string,any>;
export type AutomaticCloneProgress={request_id:string|null;stage:string;label:string;phase:string;reason:string;next_step:string;first_review_at:string|null;created_at:string|null;updated_at:string|null;failure_code:string|null;failure_count:number|null;last_failed_at:string|null;next_retry_at:string|null};
const date=(v:any)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
const code=(v:any)=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{1,99}$/.test(v)?v:null;
const phases:Record<string,string>={prepare:'工作室草稿准备', 'recover-preparation':'原工作室草稿核对'};
export function cloneProgressDisplay({stage,reason,request,first_review_at}:{stage:string;reason?:string|null;request?:Row|null;first_review_at?:string|null}):AutomaticCloneProgress|null{
 if(!['cost_check_pending','blocked','queued','running','audio_ready','provider_unknown','provider_failed'].includes(stage))return null;
 const studio=request?.acquisition_method==='heygen_studio_audio_preview'||/STUDIO_PREVIEW_/.test(String(reason||'')),retry=request?.preparation_retry;
 const validRetry=['cost_check_pending','blocked','queued'].includes(stage)&&request?.provider_call_started!==true&&!request?.provider_result&&retry&&['prepare','recover-preparation'].includes(retry.phase)&&code(retry.failure_code)&&Number.isSafeInteger(retry.consecutive_count)&&retry.consecutive_count>0&&retry.consecutive_count<=1000&&date(retry.last_failed_at)&&date(retry.next_retry_at)&&Date.parse(retry.next_retry_at)>Date.parse(retry.last_failed_at)&&Date.parse(retry.next_retry_at)-Date.parse(retry.last_failed_at)<=1800000&&/^[a-f0-9]{64}$/.test(retry.implementation_sha256||'');
 const failure_code=validRetry?retry.failure_code:(String(reason||'').match(/\b(?:STUDIO_PREVIEW_[A-Z0-9_]+|NATIVE_SPEECH_[A-Z0-9_]+)\b/)||[])[0]||null;
 let label='本人换声待接续',phase=studio?'工作室试听准备':'声音连接核对',why='尚未取得已确认可用的本人音轨。',next='原执行器沿同一请求接续；首次审片结果继续保留。';
 if(stage==='blocked'){
  label='本人换声受阻';phase=validRetry?phases[retry.phase]:studio?'工作室页面准备受阻':'声音连接核验受阻';
  why=/BROWSER_UI_ERROR/.test(failure_code||'')?'工作室页面操作未完成，尚未取得本人音轨。':/TAB_UNAVAILABLE/.test(failure_code||'')?'工作室页面连接不可用，尚未取得本人音轨。':'本次换声准备未完成，尚未取得本人音轨。';
  next=validRetry?'按已记录时间核对原草稿并接续；无需重新首审或创建新请求。':'先修复当前工作室连接与草稿定位，再沿原请求接续；无需重新首审。';
 }else if(stage==='queued'){label='本人换声已排队';why='等待原执行器接续当前已审全文。';}
 else if(stage==='running'){label='本人换声处理中';phase=studio?'工作室试听与音轨回读':'原声音调用核对';why=request?.provider_call_started===true?'原试听调用已登记，等待可用音轨回执。':'已领取当前换声请求，尚未取得本人音轨。';}
 else if(stage==='audio_ready'){
  label='本人音轨已取得，等待同步成片';phase='音画字幕同步与回传';why='本人音轨已回传，声音版成片仍需完成同步并回站。';next='完成同步后回传本人声音版，继续第二次人工审片。';
  const render=request?.render_progress,audio=request?automaticCloneCurrentAudioResult(request):null;
  if(request?.status==='audio_ready'&&render?.schema==='automatic-clone-render-progress-v1'&&render.quality_approved===false&&render.audio_sha256===audio?.audio_sha256&&/^[a-f0-9]{64}$/.test(render.audio_sha256||'')&&typeof render.first_review_id==='string'&&render.first_review_id===request.first_review_id&&/^[a-f0-9]{64}$/.test(render.base_video_sha256||'')&&render.base_video_sha256===request.base?.video_sha256&&date(render.updated_at)&&['qa-blocked','materials-blocked','materials-ready','rendering'].includes(render.phase)&&(render.phase!=='qa-blocked'||/^[a-f0-9]{64}$/.test(render.gap_sha256||'')&&/^[a-f0-9]{64}$/.test(render.failed_video_sha256||''))){
   why=sanitizeClonePreparationDiagnostic(render.reason||'本人音轨已保存，正在处理当前画面。').slice(0,1200);
   if(render.phase==='qa-blocked'){label='本人音轨已保存，成片质检未通过';phase='补充动态画面';next='沿同一音轨和批准全文补镜头，重新通过质检后回传二审。';}
   else if(render.phase==='materials-blocked'){label='本人音轨已保存，等待补齐动态素材';phase='补充动态素材';next='继续围绕具体缺镜寻找相关视频；保留完整音轨，无需重新试听。';}
   else if(render.phase==='materials-ready'){label='动态素材已准备，等待同步成片';phase='画面修复已准备';next='复用当前本人音轨和新材料制作，并完成整片质检。';}
   else{label='本人声音版已进入合成，结果待核对';phase='音画字幕同步';why='最后记录已进入合成，等待原结果回读。'+why;next='核对合成结果后继续整片质检和本人二审；文件生成不等于通过审核。';}
  }
 }
 else if(stage==='provider_unknown'){label='本人换声结果待核对';phase='核对原试听结果';why='原调用尚无已确认可用音轨，结果保持未知。';next=studio?'先核对原草稿与音轨；有效缓存直接复用，确认当前无有效音轨后按已授权规则必要重新试听。原调用历史保留。':'仅核对原草稿、原音轨与回执，不重新生成来替代未知结果。';}
 else if(stage==='provider_failed'){label='本人换声调用失败';phase='处理已确认的原调用失败';why='原调用已明确失败，尚未取得可用本人音轨。';next='保留原失败证据，按当前已确认的接续方式处理。';}
 if(validRetry&&typeof retry.diagnostic==='string'&&retry.diagnostic.trim())why+=' 最近失败：'+sanitizeClonePreparationDiagnostic(retry.diagnostic).slice(0,240);
 return {request_id:/^acl_[a-f0-9]{64}$/.test(request?.id||'')?request!.id:null,stage,label,phase,reason:why,next_step:next,first_review_at:date(first_review_at),created_at:date(request?.created_at),updated_at:date(request?.updated_at),failure_code,failure_count:validRetry?retry.consecutive_count:null,last_failed_at:validRetry?retry.last_failed_at:null,next_retry_at:validRetry?retry.next_retry_at:null};
}
export function currentAutomaticCloneProgress(job:Row,p:Row|null):AutomaticCloneProgress|null{
 const m=automaticCloneVideo(job),owner=job.owner_id;
 if(job.is_test||job.status!=='approved'||job.publication_reports?.some((r:Row)=>date(r.published_at))||!owner||!p||p.schema!==AUTOMATIC_CLONE_SCHEMA||p.job_id!==job.id||p.owner_id!==owner||p.status==='superseded'||p.superseded_by||p.voice_id!==AUTOMATIC_CLONE_VOICE.id||p.binding?.revision!==job.revision||p.binding?.script_hash!==job.approved_hash||p.binding?.mode_epoch!==job.mode_epoch||p.binding?.contract_hash!==job.contract_hash||p.scope_id!==job.media_continuation?.current_id||p.base?.milestone_id!==m?.id||p.base?.artifact_hash!==m?.artifact_hash||m?.status!=='approved')return null;
 let artifact;try{artifact=JSON.parse(m.artifact);}catch{return null;}if(artifact?.qa?.voice_kind!=='ordinary-review'||artifact.sha256!==p.base.video_sha256)return null;
 const first=job.reviews?.find((r:Row)=>r.id===p.first_review_id&&r.decision==='approve'&&r.revision===job.revision&&r.reviewer===owner&&r.content_hash===m.artifact_hash&&r.note===m.report);if(!first)return null;
 return cloneProgressDisplay({stage:p.status,reason:p.reason,request:p,first_review_at:first.created_at});
}
export function cloneWaitingLabel(p:AutomaticCloneProgress,now=Date.now()){
 const from=Date.parse(p.first_review_at||p.created_at||'');if(!Number.isFinite(from)||!Number.isFinite(now)||now<from)return null;
 const minutes=Math.floor((now-from)/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),rest=minutes%60;
 return '首审通过后已等待 '+(days?days+'天 '+hours+'小时':hours?hours+'小时 '+rest+'分钟':minutes+'分钟');
}
export function cloneRetryLabel(p:AutomaticCloneProgress,now=Date.now()){
 if(!p.next_retry_at)return null;const scheduled=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(p.next_retry_at));
 return Date.parse(p.next_retry_at)>now?'下次接续：北京时间 '+scheduled:'接续时间已到（北京时间 '+scheduled+'），等待原执行器读回';
}
