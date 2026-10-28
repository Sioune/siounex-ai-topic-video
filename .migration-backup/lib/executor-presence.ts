import {db} from './store';
import {ProductionError,text} from './production-contract';

export const EXECUTOR_TTL_MS=45000;
export const SCHEDULE_GRACE_MS=120000;
type PresenceRecord={last_seen:number;state:string;executor_id?:string;session_id?:string;scope?:string;phase?:string|null;is_test?:boolean|number;schedule_interval_ms?:number|null;last_started_at?:number|null;last_finished_at?:number|null;next_check_at?:number|null;outcome?:string|null;[key:string]:unknown};
const outcomes=['idle','completed','in-progress','blocked','failed','result-unknown'];
const epoch=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
function isolated(value:PresenceRecord){return value.scope==='isolated-test'||value.is_test===true||value.is_test===1||/(?:^|[-_])(?:isolated|qa|test)(?:[-_]|$)/i.test(String(value.executor_id||''));}
function scopeOf(value:PresenceRecord){return isolated(value)?'isolated-test':value.scope==='scheduled-poll'?'scheduled-poll':'finite-foreground';}
function recent(value:PresenceRecord,now:number){return epoch(value.last_seen)&&value.last_seen<=now+30000&&now-value.last_seen<=EXECUTOR_TTL_MS;}

export function presenceProjection(value:PresenceRecord,now=Date.now()){
 const scope=scopeOf(value),is_test=scope==='isolated-test',age_ms=epoch(value.last_seen)?Math.max(0,now-value.last_seen):null;
 const online=!is_test&&recent(value,now)&&value.state!=='stopped'&&(scope!=='scheduled-poll'||value.state==='active');
 const interval=typeof value.schedule_interval_ms==='number'&&value.schedule_interval_ms>=60000&&value.schedule_interval_ms<=86400000?value.schedule_interval_ms:null;
 const next=epoch(value.next_check_at)?value.next_check_at:null,finished=epoch(value.last_finished_at)?value.last_finished_at:null;
 const poll_state=scope!=='scheduled-poll'?null:value.state==='stopped'?'stopped':value.state==='active'?(age_ms!==null&&interval!==null&&age_ms<=interval+SCHEDULE_GRACE_MS?'checking':'overdue'):next!==null&&finished!==null?(now<=next+SCHEDULE_GRACE_MS?'waiting':'overdue'):'unconfirmed';
 const schedule_current=scope==='scheduled-poll'&&(online||poll_state==='waiting');
 const connection=is_test?'isolated-test':value.state==='stopped'?'stopped':online?'connected':scope==='scheduled-poll'?(poll_state==='waiting'?'scheduled':poll_state==='overdue'?'overdue':'unconfirmed'):'offline';
 return {...value,scope,is_test,job_id:is_test?null:value.job_id??null,age_ms,online,connection,poll_state,schedule_current,schedule_interval_ms:interval,last_started_at:epoch(value.last_started_at)?value.last_started_at:null,last_finished_at:finished,next_check_at:next,outcome:outcomes.includes(String(value.outcome))?String(value.outcome):null,automatic_wakeup:schedule_current};
}

export async function executorPresence(){
 const rows=(await db().prepare("SELECT value FROM app_state WHERE key LIKE 'executor_presence_v1:%' LIMIT 8").all<{value:string}>()).results,now=Date.now();
 const entries=rows.flatMap(row=>{try{const value=JSON.parse(row.value);return value&&typeof value==='object'?[presenceProjection(value,now)]:[]}catch{return[]}});
 const executors=entries.filter(value=>!value.is_test);
 return {executors,ttl_ms:EXECUTOR_TTL_MS,schedule_grace_ms:SCHEDULE_GRACE_MS,automatic_wakeup:executors.some(value=>value.schedule_current),isolated_executor_count:entries.length-executors.length};
}

export async function reportExecutor(b:Record<string,unknown>){
 const id=text(b.executor_id,100),session=text(b.session_id,100),now=Date.now();
 if(!/^[a-zA-Z0-9_-]+$/.test(id)||!['active','idle','stopped'].includes(String(b.state))||!Array.isArray(b.capabilities)||b.capabilities.some(value=>!['text','review','media-existing-inputs','native-handoff'].includes(String(value)))||b.scope!==undefined&&!['finite-foreground','scheduled-poll','isolated-test'].includes(String(b.scope)))throw new ProductionError('执行器状态格式无效',400);
 if(b.job_id!==null&&b.job_id!==undefined&&!/^job_[a-f0-9-]+$/.test(String(b.job_id)))throw new ProductionError('运行任务ID无效',400);
 const scope=scopeOf({executor_id:id,scope:String(b.scope||'finite-foreground'),is_test:b.is_test===true||b.is_test===1,last_seen:now,state:String(b.state)}),key='executor_presence_v1:'+id;
 const old=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key).first<{value:string}>();
 const previous=old?JSON.parse(old.value) as PresenceRecord:null;
 if(previous){
  if(scopeOf(previous)!==scope)throw new ProductionError('执行器类型已有记录；请使用独立登记ID');
  const live=recent(previous,now)&&previous.state!=='stopped'&&(scope!=='scheduled-poll'||previous.state==='active');
  if(previous.session_id!==session&&live)throw new ProductionError('此执行器仍有在线会话；不能并发接管');
 }else{
  const count=await db().prepare("SELECT COUNT(*) AS n FROM app_state WHERE key LIKE 'executor_presence_v1:%'").first<{n:number}>();
  if(Number(count?.n)>=8)throw new ProductionError('执行器登记达到上限；保留历史并人工处理');
 }
 let schedule:Record<string,unknown>={};
 if(scope==='scheduled-poll'){
  const interval=b.schedule_interval_ms,started=b.last_started_at,finished=b.last_finished_at??(b.state==='active'?previous?.last_finished_at??null:null),next=b.next_check_at??null,outcome=b.outcome??(b.state==='active'?previous?.outcome??null:null);
  if(typeof interval!=='number'||!Number.isSafeInteger(interval)||interval<60000||interval>86400000||!epoch(started)||started>now+30000||finished!==null&&(!epoch(finished)||finished>now+30000)||next!==null&&(!epoch(next)||next>now+interval+SCHEDULE_GRACE_MS)||outcome!==null&&!outcomes.includes(String(outcome)))throw new ProductionError('定时巡检时间或结果格式无效',400);
  if(b.state==='idle'&&(!epoch(finished)||finished<started||!epoch(next)||next<finished||next>finished+interval+SCHEDULE_GRACE_MS||!outcomes.includes(String(outcome))))throw new ProductionError('巡检结束需保存实际结束时间、结果及下次检查时间',400);
  if(previous?.scope==='scheduled-poll'){
   if(epoch(previous.last_started_at)&&(started<previous.last_started_at||previous.session_id!==session&&started<=previous.last_started_at)||previous.session_id!==session&&epoch(previous.last_finished_at)&&started<previous.last_finished_at)throw new ProductionError('旧巡检不能覆盖较新的执行记录');
   if(previous.session_id===session){
    if(previous.last_started_at!==started||['idle','stopped'].includes(previous.state)&&b.state==='active'||previous.state==='stopped'&&b.state!=='stopped')throw new ProductionError('此轮巡检已结束或绑定发生变化');
    if(previous.state==='idle'&&(finished!==previous.last_finished_at||next!==previous.next_check_at||outcome!==previous.outcome))throw new ProductionError('已结束巡检回执不可改写');
   }
  }
  if(b.state==='active'&&finished!==null&&finished>=started)throw new ProductionError('正在巡检不能同时声称本轮已经结束',400);
  schedule={schedule_interval_ms:interval,last_started_at:started,last_finished_at:finished,next_check_at:next,outcome};
 }
 const value=JSON.stringify({executor_id:id,session_id:session,state:b.state,capabilities:b.capabilities,job_id:scope==='isolated-test'?null:b.job_id||null,phase:typeof b.phase==='string'?b.phase.slice(0,160):null,pid:Number.isInteger(b.pid)?b.pid:null,last_seen:now,scope,is_test:scope==='isolated-test',automatic_wakeup:scope==='scheduled-poll',...schedule});
 const result=await db().prepare("INSERT INTO app_state(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM app_state WHERE key=?) OR (SELECT COUNT(*) FROM app_state WHERE key LIKE 'executor_presence_v1:%')<8 ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE app_state.value=?").bind(key,value,key,old?.value||'').run();
 if(!result.meta.changes)throw new ProductionError('执行器心跳并发冲突，请重新读取');
 return presenceProjection(JSON.parse(value),now);
}
