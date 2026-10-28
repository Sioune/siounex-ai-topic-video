// A live coordinator admits work whenever a station/stage settles or a poll
// finds a new authorized job. This is separate from a finite foreground pass.
export const WORKSTATION_FLOW='workstation-flow-v1';
export const FLOW_POLL_MS=15000;
export async function waitForFlowActivity(active,{external,poll_ms=FLOW_POLL_MS}={}){
 if(!Number.isSafeInteger(poll_ms)||poll_ms<1||poll_ms>60000)throw Error('Invalid flow polling interval');
 let timer;try{await Promise.race([...active,...(external?[Promise.resolve(external).catch(()=>{})]:[]),new Promise(resolve=>{timer=setTimeout(resolve,poll_ms);})]);}finally{clearTimeout(timer);}
}
