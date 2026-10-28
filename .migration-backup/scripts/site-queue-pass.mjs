import fs from 'node:fs';
import {createFlowExecutor} from './flow-executor-call.mjs';
import {WORKSTATION_FLOW} from './production-flow-lifecycle.mjs';
import {concurrentSiteQueue} from './concurrent-site-queue.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readHiddenJsonInput} from './hidden-json-input.mjs';
import {executeResearch} from './research-codex-executor.mjs';
import {autonomousPass,autonomousPassDiagnostics} from './production-autonomous-pass.mjs';
import {periodicBusinessResult} from './native-site-token.mjs';
import {writePeriodicFailure,writePeriodicResult} from './periodic-diagnostics.mjs';

// A keyword request consumes its own finite scheduled pass. It never falls
// through into production after searching, completing, failing, or cancelling.
export async function siteQueuePass(config,{research=executeResearch,production=autonomousPass}={}){
  if(config.execute!==true)throw Error('Explicit authorized execute:true required');
  if(config.production_lifecycle===WORKSTATION_FLOW&&!config.research_id){
    const executor=typeof config.token==='string'?createFlowExecutor({token:config.token,project_id:JSON.parse(fs.readFileSync('.openai/hosting.json','utf8')).project_id}):null;
    try{const returned=await concurrentSiteQueue(config,{research,production,productionOptions:executor?{call:executor.call}:{}});writePeriodicResult(config.run_id||process.env.SIOUNEX_PERIODIC_RUN_ID,autonomousPassDiagnostics(returned));return returned;}finally{await executor?.close();}
  }
  const result=await research(config);
  if(result.status!=='research-idle'||config.research_id)return result;
  const returned=await production(config),business=periodicBusinessResult(returned);
  writePeriodicResult(config.run_id||process.env.SIOUNEX_PERIODIC_RUN_ID,{...autonomousPassDiagnostics(returned),...Object.fromEntries(['package_id','http_status','confirmed_no_result','result_unknown','next_retry_at','executions','deferred_promotions'].filter(key=>business[key]!==undefined).map(key=>[key,business[key]]))});
  return returned;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const config=JSON.parse(await readHiddenJsonInput());process.stdin.destroy();console.log(JSON.stringify(await siteQueuePass({...config,native_voice_bridge:true})));}catch(error){const failure=writePeriodicFailure(process.env.SIOUNEX_PERIODIC_RUN_ID,error);console.log(JSON.stringify({status:'scheduled-pass-failed',failure}));process.exitCode=1;}
}
