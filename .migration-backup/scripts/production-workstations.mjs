// One finite worker owns these in-process queues. Persistent job claims and
// unknown-result reconciliation remain the responsibility of each consumer.
export const PRODUCTION_STATIONS=Object.freeze(['preparation','voice','render','assets','archive','copy','narration']);
export const PRODUCTION_STATION_MIN_BUDGET_MS=60000;
const MAX_TIMER_MS=2147483647;
const failure=code=>Object.assign(Error(code),{code});

export function createProductionWorkstations({deadline_ms=Infinity,onEvent,onState,beforeStart,now=Date.now}={}){
 if((deadline_ms!==Infinity&&(!Number.isFinite(deadline_ms)||deadline_ms<0))||typeof now!=='function'||onEvent!==undefined&&typeof onEvent!=='function'||onState!==undefined&&typeof onState!=='function'||beforeStart!==undefined&&typeof beforeStart!=='function')throw failure('PRODUCTION_STATION_INPUT_INVALID');
 const queues=new Map(PRODUCTION_STATIONS.map(station=>[station,{active:null,waiting:[],max_active:0,started:0,finished:0,failed:0,deferred:0}]));
 const jobs=new Map(),pending=new Set();let activeCount=0,maxActive=0,budgetTimer=null;
 const time=()=>{const value=now();if(!Number.isFinite(value))throw failure('PRODUCTION_STATION_CLOCK_INVALID');return value;};
 // Validate the injected clock before creating any queued work.
 time();
 const emit=(event,ticket)=>{
  if(onState)try{const result=onState(snapshot());if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});}catch{}
  if(!onEvent||event==='queued')return;
  try{const result=onEvent({event,station:ticket.station,job_id:ticket.job_id,time:time()});if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});}catch{}
 };
 const waitingCount=()=>[...queues.values()].reduce((count,state)=>count+state.waiting.length,0);
 const budgetAvailable=()=>deadline_ms===Infinity||deadline_ms-time()>=PRODUCTION_STATION_MIN_BUDGET_MS;
 const clearBudgetTimer=()=>{if(budgetTimer!==null){clearTimeout(budgetTimer);budgetTimer=null;}};
 function defer(ticket,state){
  jobs.delete(ticket.key);state.deferred++;
  const error=Object.assign(failure('PRODUCTION_STATION_BUDGET_DEFERRED'),{station:ticket.station,job_id:ticket.job_id});
  ticket.reject(error);emit('deferred',ticket);
 }
 function expireWaiting(){
  if(budgetAvailable())return;
  for(const state of queues.values())while(state.waiting.length)defer(state.waiting.shift(),state);
 }
 function armBudgetTimer(){
  clearBudgetTimer();if(deadline_ms===Infinity||waitingCount()===0)return;
  // Exactly 60 seconds is sufficient. Expire one millisecond after that
  // boundary, without touching a function which has already started.
  const delay=Math.max(1,Math.min(MAX_TIMER_MS,deadline_ms-time()-PRODUCTION_STATION_MIN_BUDGET_MS+1));
  budgetTimer=setTimeout(()=>{budgetTimer=null;expireWaiting();armBudgetTimer();},delay);
 }
 function finish(ticket,state,ok,value){
  // A station and job remain held until the actual function promise settles.
  state.active=null;activeCount--;jobs.delete(ticket.key);state[ok?'finished':'failed']++;
  if(ok)ticket.resolve(value);else ticket.reject(value);
  emit(ok?'finished':'failed',ticket);pump(state);
 }
 function pump(state){
  expireWaiting();
  if(!state.active&&state.waiting.length){
   const ticket=state.waiting.shift();state.active=ticket;state.started++;state.max_active=1;activeCount++;maxActive=Math.max(maxActive,activeCount);emit('started',ticket);
   // Deferring invocation to a microtask captures synchronous throws too.
   Promise.resolve().then(async()=>{if(beforeStart)await beforeStart({station:ticket.station,job_id:ticket.job_id});return ticket.fn();}).then(value=>finish(ticket,state,true,value),error=>finish(ticket,state,false,error));
  }
  armBudgetTimer();
 }
 function run(station,job_id,fn,options={}){
  const state=queues.get(station);
  if(!state||typeof job_id!=='string'||!job_id.trim()||job_id!==job_id.trim()||job_id.length>200||/[\x00-\x1f]/.test(job_id)||typeof fn!=='function')return Promise.reject(failure('PRODUCTION_STATION_INPUT_INVALID'));
  // Only the approved-ordinary post-video lane can overlap a clone's own lane.
  const lane=options?.lane;if(lane!==undefined&&(lane!=='approved-ordinary-post-video'||!['assets','archive'].includes(station)))return Promise.reject(failure('PRODUCTION_STATION_INPUT_INVALID'));
  const key=job_id+'\0'+(lane||'default');
  // Includes queued tickets: a job cannot reserve two resources while waiting,
  // and nested calls for the same job reject instead of deadlocking.
  if(jobs.has(key))return Promise.reject(failure('PRODUCTION_STATION_JOB_ACTIVE'));
  let resolve,reject;const result=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const ticket={station,job_id,key,fn,resolve,reject};jobs.set(key,ticket);pending.add(result);
  result.then(()=>pending.delete(result),()=>pending.delete(result));state.waiting.push(ticket);emit('queued',ticket);pump(state);return result;
 }
 function snapshot(){
  return{stations:Object.fromEntries([...queues].map(([station,state])=>[station,{capacity:1,active:state.active?.job_id??null,waiting:state.waiting.map(ticket=>ticket.job_id),max_active:state.max_active,started:state.started,finished:state.finished,failed:state.failed,deferred:state.deferred}])),active_count:activeCount,waiting_count:waitingCount(),max_active:maxActive,observed_parallel:maxActive>1};
 }
 async function drain(){
  for(;;){
   if(pending.size){await Promise.allSettled([...pending]);continue;}
   // Let settlement handlers enqueue an immediately following stage before
   // deciding the entire worker is drained.
   await Promise.resolve();if(!pending.size){clearBudgetTimer();return snapshot();}
  }
 }
 return Object.freeze({run,snapshot,drain});
}

export async function withProductionStation(stations,station,job_id,fn){
 if(typeof fn!=='function')throw failure('PRODUCTION_STATION_INPUT_INVALID');
 if(stations===undefined||stations===null)return fn();
 if(typeof stations.run!=='function')throw failure('PRODUCTION_STATION_INPUT_INVALID');
 return stations.run(station,job_id,fn);
}
