import {safeFailure} from './periodic-diagnostics.mjs';
import {FLOW_POLL_MS} from './production-flow-lifecycle.mjs';
// One research slot runs independently of production. Neither a long research
// call nor a ready research result takes the entire production coordinator.
export async function concurrentSiteQueue(config,{research,production,productionOptions={},poll_ms=FLOW_POLL_MS}={}){
 let stopping=false,researchRunning=false,researchIdle=false,currentResearch=null,wakeSleep=null;
 const results=[];
 const pause=()=>new Promise(resolve=>{const timer=setTimeout(()=>{wakeSleep=null;resolve();},poll_ms);wakeSleep=()=>{clearTimeout(timer);wakeSleep=null;resolve();};});
 const pump=(async()=>{
  while(!stopping){
   researchRunning=true;
   currentResearch=Promise.resolve().then(()=>research(config,productionOptions));
   let result;try{result=await currentResearch;}catch(error){result={status:'research-flow-failed',failure:safeFailure(error)};}
   finally{researchRunning=false;currentResearch=null;}
   researchIdle=['research-idle','research-flow-failed'].includes(result?.status);
   results.push({status:result?.status,research_id:result?.research_id||null,...(result?.failure?{failure:result.failure}:{})});if(results.length>32)results.shift();
   if(stopping)break;
   // Completed requests can yield the next request immediately. Idle/unknown
   // observations wait for a poll; existing claim guards still own any retry.
   if(result?.status!=='keyword-research-returned')await pause();
  }
 })();
 let returned;
 // A read-only queue probe after an observed empty queue is not an active
 // research job. Otherwise polling can keep an idle production pass alive
 // forever, preventing the scheduled executor from loading deployed repairs.
 try{returned=await production(config,{...productionOptions,externalPending:()=>researchRunning&&!researchIdle,externalWake:()=>currentResearch});}
 finally{stopping=true;wakeSleep?.();await pump;}
 return{...returned,research_results:results};
}
