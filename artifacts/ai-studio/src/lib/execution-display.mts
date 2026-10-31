type Executor={online:boolean;executor_id?:string;last_seen?:number;state?:string;scope?:string;is_test?:boolean|number;schedule_interval_ms?:number|null;last_started_at?:number|null;last_finished_at?:number|null;next_check_at?:number|null;outcome?:string|null};
type Binding={revision?:number;script_hash?:string;mode_epoch?:number;contract_hash?:string};
type Executable={status:string;revision?:number;approved_revision?:number|null;approved_hash?:string|null;mode_epoch?:number;contract_hash?:string;lease_until?:number|null;runtime?:{executors?:Executor[];isolated_executor_count?:number};media_continuation?:{current_id?:string;scope?:{id:string;binding:Binding}|null};facts?:{native_preparation_handoff?:{status:string;binding:Binding&{scope?:string;scope_id?:string};lease_until?:number|null;missing?:{code:string;detail?:string}[]}|null};milestones?:{node:string;revision:number;mode_epoch:number;status:string;artifact_version:number}[];stages?:{stage:string;status:string;review_revision:number;review_hash?:string;result:string|null}[];publication_reports?:unknown[];operations?:{revision:number;mode_epoch:number;script_hash:string;status:string}[]};
const realExecutor=(value:Executor)=>!value.is_test&&value.scope!=='isolated-test'&&!/(?:^|[-_])(?:isolated|qa|test)(?:[-_]|$)/i.test(value.executor_id||'');
const validTime=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const time=(value:number)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(value);
const outcomeLabels:Record<string,string>={idle:'没有可自动领取的任务',completed:'已完成本轮处理','in-progress':'本轮已保存进度，下次巡检继续',blocked:'有待补充或人工决定的事项',failed:'本轮执行失败','result-unknown':'结果待核对'};
function pollingState(value:Executor,now:number){
 if(value.state==='stopped')return 'stopped';
 const interval=value.schedule_interval_ms;
 if(!validTime(interval)||interval<60000||interval>86400000)return 'unconfirmed';
 if(value.state==='active')return validTime(value.last_seen)&&now-value.last_seen<=interval+120000?'checking':'overdue';
 return validTime(value.last_finished_at)&&validTime(value.next_check_at)?now<=value.next_check_at+120000?'waiting':'overdue':'unconfirmed';
}
export function executorConnectionDetail(value:Executor,now=Date.now()){
 if(!realExecutor(value))return '隔离测试记录，不代表真实后台或本任务已领单。';
 if(value.scope==='scheduled-poll'){
  const state=pollingState(value,now),every=validTime(value.schedule_interval_ms)?Math.round(value.schedule_interval_ms/60000)+'分钟':'约定周期';
  const finished=validTime(value.last_finished_at)?'最近完成 '+time(value.last_finished_at)+'，'+(outcomeLabels[value.outcome||'']||'结果未确认')+'。':'尚无巡检结束回执。';
  const next=validTime(value.next_check_at)?'下次检查 '+time(value.next_check_at)+'。':'';
  return '后台定时巡检 · 每'+every+'检查。'+finished+next+(state==='overdue'?'巡检回执已逾期，请核对后台。':state==='checking'?'本轮巡检已启动，等待结束回执。':state==='stopped'?'已收到停止报告。':state==='unconfirmed'?'巡检状态待确认。':'处于两次巡检之间。');
 }
 const online=value.online&&value.state!=='stopped'&&(value.last_seen===undefined||now-value.last_seen<=45000);
 return (online?'前台执行会话在线':'前台执行会话暂无有效在线心跳')+(validTime(value.last_seen)?'，最近心跳 '+time(value.last_seen):'')+'。';
}
function currentProductionDisplay(job:Executable,now:number){
 const h=job.facts?.native_preparation_handoff,s=job.media_continuation?.scope,b=h?.binding;
 if(job.status!=='approved'||job.approved_revision!==job.revision||!h||!s||s.id!==job.media_continuation?.current_id||b?.scope!=='private-video'||b.scope_id!==s.id||b.revision!==job.revision||b.script_hash!==job.approved_hash||b.mode_epoch!==job.mode_epoch||b.contract_hash!==job.contract_hash||s.binding.revision!==b.revision||s.binding.script_hash!==b.script_hash||s.binding.mode_epoch!==b.mode_epoch||s.binding.contract_hash!==b.contract_hash)return null;
 const video=job.milestones?.filter(m=>m.node==='video'&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(h.status==='completed')return video&&['awaiting_human','approved'].includes(video.status)?{label:video.status==='approved'?'成片已审':'成片待审',message:'当前成片已回传网站，可在成片仓查看；旧准备检查仅保留为历史。'}:{label:'成片已生成，待回传',message:'本机已完成本版制作，正在等待网站归档与回传确认；不需要重新提供音轨或素材。'};
 if(h.status==='claimed')return validTime(h.lease_until)&&h.lease_until>now?{label:'正在自动制作',message:'本版取材、字幕或剪辑已领取，已有音轨和素材会继续复用；旧准备缺项不代表当前停工。'}:{label:'制作结果待核对',message:'本轮制作租约已到期，将先核对已保存的工程和文件，再恢复可确认的后续步骤。'};
 if(h.status==='queued')return{label:'自动制作已排队',message:'来源和口播批准已保留，等待后台继续取材与剪辑，无需重复确认已完成的步骤。'};
 if(h.status==='blocked'){
  const error=h.missing?.find(m=>m.code.startsWith('local-production:'));
  if(error){
   if(/\bTITLE_CANNOT_FIT_WITHOUT_TEXT_CHANGE\b/.test(error.code+' '+(error.detail||'')))return{label:'排版异常，待恢复',message:'排版程序未能容纳文字；保留已批准内容，复用可用文件继续制作，无需重复送审。'};
   return{label:'制作异常，待恢复',message:'当前停点是制作程序异常；后台会先核对并复用可用文件，已批准的来源和口播无需重复送审。'};
  }
  if(h.missing?.some(m=>m.code==='owner-gameplay-comparison-required'||m.code==='required-demonstration-missing'))return{label:'等待实测素材',message:'本条明确要求真实操作或试玩对照，缺少的实际记录仍需补齐。'};
  return{label:'自动选材待继续',message:'后续取材和剪辑仍待接续；已批准来源和口播保持有效，后台会复用现有可用材料。'};
 }
 return null;
}
function preparationDisplay(job:Executable,now:number){
 const current=currentProductionDisplay(job,now);if(current)return current;
 if(job.status!=='approved'||!job.revision||job.approved_revision!==job.revision||!job.approved_hash||job.publication_reports?.length)return null;
 const scope=job.media_continuation?.scope;if(!scope||job.media_continuation?.current_id!==scope.id)return null;
 const matches=(binding:Binding|undefined|null)=>!!binding&&binding.revision===job.revision&&binding.script_hash===job.approved_hash&&binding.mode_epoch===job.mode_epoch&&binding.contract_hash===job.contract_hash;
 if(!matches(scope.binding)||job.operations?.some(value=>value.revision===job.revision&&value.mode_epoch===job.mode_epoch&&value.script_hash===job.approved_hash&&['queued','running','prepared'].includes(value.status)))return null;
 const stages=(job.stages||[]).flatMap(stage=>{if(!['media_inventory','media_inputs'].includes(stage.stage)||stage.review_revision!==job.revision||stage.review_hash!==job.approved_hash)return [];try{const result=JSON.parse(stage.result||'null');return result?.schema==='media-input-probe-v1'&&result.scope_id===scope.id&&matches(result.binding||{})?[{stage,result}]:[]}catch{return []}});
 const running=stages.find(value=>value.stage.status==='running');
 if(running)return validTime(running.result.lease_until)&&running.result.lease_until>now?{label:'准备检查进行中',message:'已领取本版素材准备检查；这不是成片制作，也不代表画面或声音已获批准。'}:{label:'准备检查租约已过期',message:'准备检查尚未确认结束，先核对本轮技术回执；未知结果不能直接重做。'};
 const blocked=stages.find(value=>value.stage.status==='blocked');
 if(blocked){const receipt=blocked.result.receipt,detail=receipt?.schema==='media-input-probe-receipt-v1'&&receipt.status==='blocked'&&Array.isArray(receipt.checks)?receipt.checks.find((check:{passed?:boolean;detail?:unknown})=>check.passed===false&&typeof check.detail==='string'&&check.detail.trim())?.detail:null;return {label:'准备检查待补充',message:typeof detail==='string'?detail:'本版准备检查已有阻塞回执，请打开素材准备查看需要补充的项目。'};}
 if(stages.some(value=>value.stage.status==='queued'))return {label:'准备检查已排队',message:'口播稿批准已保留，本版免费准备检查等待后台巡检领取；尚未开始成片制作。'};
 if(['media_inventory','media_inputs'].every(kind=>stages.some(value=>value.stage.stage===kind&&value.stage.status==='ready')))return {label:'准备检查已回传',message:'本版两项技术检查已回传，成片制作仍需符合当前范围、素材与审核条件。'};
 if(stages.length)return {label:'准备检查尚未完整',message:'本版只收到部分准备节点记录，请核对缺失的素材清单或制作输入检查。'};
 return null;
}
export function executionDisplay(j:Executable,now=Date.now()){
 const executors=(j.runtime?.executors||[]).filter(realExecutor),expired=j.status==='running'&&(!Number.isFinite(j.lease_until)||Number(j.lease_until)<=now),activeLease=j.status==='running'&&!expired;
 const online=executors.some(e=>e.online&&e.state!=='stopped'&&(e.scope!=='scheduled-poll'||e.state==='active')&&(e.last_seen===undefined||e.last_seen<=now+30000&&now-e.last_seen<=45000));
 const scheduled=executors.filter(value=>value.scope==='scheduled-poll').sort((a,b)=>(b.last_started_at||b.last_seen||0)-(a.last_started_at||a.last_seen||0))[0],poll=scheduled?pollingState(scheduled,now):null,preparation=preparationDisplay(j,now);
 const background=poll==='waiting'?'后台已完成最近一轮巡检，正等待下一次定时检查；巡检间隔不代表离线。':poll==='checking'?'后台巡检已启动，尚未收到本轮结束回执；不代表本任务已经领单。':poll==='overdue'?'后台巡检回执已逾期；先核对定时执行记录。':poll==='stopped'?'后台已报告停止；请核对调度状态。':scheduled?'已有后台登记，但巡检回执尚不完整。':null;
 const connection=activeLease?'本任务已领单，租约有效；草稿和执行回执尚需分别核对。':background|| (online?'已有前台执行会话在线；本任务进度以领取与回执为准。':'暂未收到真实执行器的有效心跳或定时巡检回执；任务状态以已保存的领取、产物和审核记录为准。');
 const emptyDraftMessage=expired?'尚无真实草稿回传；租约已过期，先核对已有输出与回执。':activeLease?(j.revision===0?'执行器已领单，首稿尚未回传。':'执行器已领单，本次草稿尚未回传。'):j.status==='waiting_executor'?'尚无真实草稿，等待执行器领取。':'尚无可展示的真实草稿，请核对当前任务状态与已保存回执。';
 const queuedLabel=poll==='waiting'?'等待下次后台巡检':poll==='checking'?'后台正在巡检 · 本任务尚未领单':poll==='overdue'?'等待执行器领取 · 巡检回执已逾期':j.runtime&&!online?'等待执行器领取 · 暂无有效执行器回执':null;
 const queuedMessage=background?background+' 网站已保存待执行请求，是否领取取决于当前授权、素材和审核条件。':'网站已保存待执行请求；尚无有效执行器回执，不能据此认定任务已开始或后台未安装。';
 return {expired,activeLease,online,scheduled:scheduled||null,poll_state:poll,connection,emptyDraftMessage,label:expired?'租约已过期 · 结果待核对':activeLease?'执行器已领单 · 租约有效':preparation?.label||(j.status==='waiting_executor'?queuedLabel:null),message:expired?'租约已过期；页面上的旧“已领取”不代表仍在执行。先核对已有产物与回执，未知结果禁止自动重跑。':activeLease?'本任务已领单，租约有效，等待草稿或执行回执。'+(!online?'尚未收到独立的执行器在线心跳。':''):preparation?.message||(j.status==='waiting_executor'?queuedMessage:null)};
}
/** Task execution state is primary; review and archive facts remain separate context. */
export function executionStatusLabel(j:Executable,now=Date.now()):string|null{
 if(j.status==='paused')return '已暂停，需要决定';
 if(j.status==='failed')return '执行失败';
 if(j.status==='running'||j.status==='waiting_executor')return executionDisplay(j,now).label||(j.status==='running'?'执行器已领单':'等待执行器领取');
 return null;
}
