// Observed scheduler runs only. This module never claims work or starts a timer job.
export function scheduledPresence({call,runId,startedAt,now=Date.now,heartbeatMs=15000,scheduleMs=180000,setTimer=setInterval,clearTimer=clearInterval,onFailure=()=>{},readProgress=()=>null}){
 if(typeof call!=='function'||!runId||!Number.isFinite(startedAt)||!Number.isInteger(heartbeatMs)||heartbeatMs<1000||!Number.isSafeInteger(scheduleMs)||scheduleMs<60000||scheduleMs>86400000||typeof readProgress!=='function')throw Error('Invalid scheduled presence binding');
 let timer=null,pending=null,started=false,closed=false,finished=false;
 const report=extra=>call({action:'executor_heartbeat',executor_id:'windows-topic-periodic-v1',session_id:runId,scope:'scheduled-poll',capabilities:['text','review'],job_id:null,pid:null,schedule_interval_ms:scheduleMs,last_started_at:startedAt,...extra});
 const activePhase=()=>{try{const p=readProgress();return typeof p==='string'&&p.length<=160?p:'checking-authorized-queue';}catch{return 'checking-authorized-queue';}};
 async function pulse(){if(!started||closed||pending)return;pending=report({state:'active',phase:activePhase()}).catch(onFailure);try{await pending;}finally{pending=null;}}
 return {
  async start(){if(started||closed)throw Error('Scheduled presence already started or closed');try{await report({state:'active',phase:activePhase()});}catch(error){onFailure(error);return false;}started=true;timer=setTimer(()=>{void pulse()},heartbeatMs);timer?.unref?.();return true;},
  pulse,
  async finish(outcome){if(finished)return;closed=true;if(timer!==null)clearTimer(timer);if(pending)await pending;if(!started)return;const ended=now(),next=startedAt+(Math.floor(Math.max(0,ended-startedAt)/scheduleMs)+1)*scheduleMs;await report({state:'idle',phase:'waiting-next-scheduled-check',last_finished_at:ended,next_check_at:next,outcome});finished=true;},
  close(){closed=true;if(timer!==null)clearTimer(timer);}
 };
}
