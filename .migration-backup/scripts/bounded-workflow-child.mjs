import {WORKSTATION_FLOW} from './production-flow-lifecycle.mjs';
import {safeFailure} from './periodic-diagnostics.mjs';
import {spawn}from'node:child_process';import fs from'node:fs';import path from'node:path';import{randomUUID,createHash}from'node:crypto';
// Kill only the child PID created here and its descendants, never another task.
export async function ownedFiniteChild(args,{input,deadline=Date.now()+1800000,metadataDir,stdout,stderr,runId=process.env.SIOUNEX_PERIODIC_RUN_ID}={}){
 const remaining=deadline-Date.now();if(!Number.isFinite(remaining)||remaining<=0||remaining>1800000)throw Error('Foreground deadline exhausted or invalid; no child started');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:process.cwd(),windowsHide:true,env:{...process.env,...(runId?{SIOUNEX_PERIODIC_RUN_ID:runId}:{})},stdio:['pipe',stdout?'pipe':'inherit',stderr?'pipe':'inherit']});let expired=false;
  if(stdout)child.stdout.on('data',stdout);if(stderr)child.stderr.on('data',stderr);
  const started={...(runId?{periodic_run_id:runId}:{}),pid:child.pid,started_at:new Date().toISOString(),deadline_ms:deadline,scope:'owned-child-tree'};
  if(metadataDir){fs.mkdirSync(metadataDir,{recursive:true});fs.writeFileSync(path.join(metadataDir,'process-started.json'),JSON.stringify(started),{flag:'wx'});}
  const timer=setTimeout(()=>{expired=true;if(process.platform==='win32'&&Number.isInteger(child.pid)){const stop=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});stop.once('error',()=>child.kill());}else child.kill();},remaining);
  child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('close',code=>{clearTimeout(timer);const receipt={...started,finished_at:new Date().toISOString(),exit_code:code,timed_out:expired,result_unknown:expired||code!==0};if(metadataDir)fs.writeFileSync(path.join(metadataDir,'process-exit.json'),JSON.stringify(receipt),{flag:'wx'});expired?reject(Object.assign(Error('Foreground deadline reached; owned process stopped. Result unknown: reconcile immutable receipts before retry.'),{code:'FOREGROUND_TIMEOUT',receipt})):resolve(receipt);});child.stdin.end(input);
 });
}
// Admission stops accepting new work; an already started owned child finishes
// naturally. Credentials remain on stdin and never enter process metadata.
export async function ownedNaturalChild(args,{input,metadataDir,stdout,stderr,runId=process.env.SIOUNEX_PERIODIC_RUN_ID,admissionDeadline,productionLifecycle}={}){
 const flow=productionLifecycle===WORKSTATION_FLOW;if(productionLifecycle!==undefined&&!flow)throw Error('Invalid natural child lifecycle');
 if(!flow&&(!Number.isFinite(admissionDeadline)||admissionDeadline<=0))throw Error('Natural child requires a finite admission deadline; no child started');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:process.cwd(),windowsHide:true,env:{...process.env,...(runId?{SIOUNEX_PERIODIC_RUN_ID:runId}:{})},stdio:['pipe',stdout?'pipe':'inherit',stderr?'pipe':'inherit']});
  if(stdout)child.stdout.on('data',stdout);if(stderr)child.stderr.on('data',stderr);
  const started={...(runId?{periodic_run_id:runId}:{}),pid:child.pid,started_at:new Date().toISOString(),completion_policy:'natural',deadline_ms:null,admission_deadline_ms:flow?null:admissionDeadline,...(flow?{production_lifecycle:WORKSTATION_FLOW}:{}),scope:'owned-child-tree'};
  if(metadataDir){fs.mkdirSync(metadataDir,{recursive:true});fs.writeFileSync(path.join(metadataDir,'process-started.json'),JSON.stringify(started),{flag:'wx'});}
  child.once('error',reject);child.once('close',(code,signal)=>{const receipt={...started,finished_at:new Date().toISOString(),exit_code:code,...(signal?{signal}:{}),timed_out:false,result_unknown:code!==0};if(metadataDir)fs.writeFileSync(path.join(metadataDir,'process-exit.json'),JSON.stringify(receipt),{flag:'wx'});resolve(receipt);});child.stdin.end(input);
 });
}
export function workflowChildFailure(stderr,receipt){
 const text=String(stderr||'').slice(-16000),cause=/Expression tree is too large \(maximum depth \d+\)/i.test(text)?'D1_EXPRESSION_DEPTH_EXCEEDED':/\bD1_ERROR\b/.test(text)?'D1_REQUEST_FAILED':null,http=/Executor (?:HTTP|response missing or incomplete JSON \(HTTP) (\d{3})/.exec(text),safe=safeFailure(text).code,code=http?'SITE_HTTP_'+http[1]:safe!=='UNCLASSIFIED_FAILURE'?safe:'CHILD_WORKFLOW_FAILED';
 return{schema:'workflow-child-failure-v1',code,...(cause?{cause_code:cause}:{}),...(http?{http_status:Number(http[1])}:{}),stderr_scope:'bounded-tail-16000-characters',stderr_sha256:createHash('sha256').update(text).digest('hex'),exit_code:receipt.exit_code,timed_out:receipt.timed_out===true,result_unknown:true,...(receipt.periodic_run_id?{periodic_run_id:receipt.periodic_run_id}:{}),pid:receipt.pid,started_at:receipt.started_at,finished_at:receipt.finished_at};
}
export async function boundedWorkflowChild(config,{naturalChild=ownedNaturalChild,finiteChild=ownedFiniteChild}={}){
 let tail='',errors='';const dir=path.resolve('.sites-runtime/foreground-processes',randomUUID()),options={input:JSON.stringify(config)+'\n',metadataDir:dir,runId:config.run_id||process.env.SIOUNEX_PERIODIC_RUN_ID,stdout:b=>{tail=(tail+b.toString('utf8')).slice(-16000)},stderr:b=>{errors=(errors+b.toString('utf8')).slice(-16000)}},receipt=config.production_completion_policy==='natural'?await naturalChild(['scripts/production-workflow-executor.mjs'],{...options,admissionDeadline:config.admission_deadline_ms,productionLifecycle:config.production_lifecycle}):await finiteChild(['scripts/production-workflow-executor.mjs'],{...options,deadline:config.foreground_deadline_ms??Date.now()+1800000});if(receipt.exit_code!==0){const failure=workflowChildFailure(errors,receipt);errors='';tail='';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'workflow-failure.json'),JSON.stringify(failure,null,2),{flag:'wx',mode:0o600});throw Object.assign(Error(failure.cause_code?'Workflow stopped: '+failure.cause_code+'; inspect workflow-failure.json':'Workflow stopped; inspect workflow-failure.json before retry'),{code:failure.code,diagnostic:failure,receipt});}errors='';
 for(const line of tail.split(/\r?\n/).reverse()){try{const value=JSON.parse(line);if(value.workflow_result===true)return value;}catch{}}
}
