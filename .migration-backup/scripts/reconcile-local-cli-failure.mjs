import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {classifyCliProcess,safeRateLimitFailure} from '../lib/cli-failure-contract.mts';
import {cliFailureReconciliationBinding} from '../lib/cli-reconciliation-selection.mts';
import {cliFailureDiagnostic} from './cli-failure-recovery.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
function files(root,depth=0){
 if(depth>8)throw Error('CLI reconciliation state exceeds known directory depth');if(!fs.existsSync(root))return[];if(fs.lstatSync(root).isSymbolicLink())throw Error('Linked CLI reconciliation state');
 return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>{const f=path.join(root,e.name);if(e.isSymbolicLink())throw Error('Linked CLI reconciliation state');return e.isDirectory()?files(f,depth+1):[f]});
}
// Inspect only the selected job's original process/cache trees. No process,
// source request, generation, rendering or browser action is started here.
export function inspectLocalCliFailure(job,{root=process.cwd()}={}){
 const binding=cliFailureReconciliationBinding(job);if(!binding)return null;
 const f=JSON.parse(job.checkpoint).cli_failure;
 if(f.binding.source_hash!==sha(job.source_snapshot)||f.binding.skill_hash!==sha(job.skill_snapshot))return null;
 const executionRoot=path.resolve(root,'.sites-runtime/executions',job.id),cacheRoot=path.resolve(root,'.sites-runtime/generation-calls',job.id,'revision-'+(job.revision+1));
 const realRoot=fs.realpathSync(root);for(const directory of [executionRoot,cacheRoot])if(fs.existsSync(directory)&&!fs.realpathSync(directory).startsWith(realRoot+path.sep))return null;
 const executionFiles=files(executionRoot),cacheFiles=files(cacheRoot),starts=executionFiles.filter(p=>path.basename(p)==='cli-process-started.json'),prompts=cacheFiles.filter(p=>path.basename(p)==='prompt.txt');
 if(!starts.length||!prompts.length||cacheFiles.some(p=>path.basename(p)==='cli-output.json')||executionFiles.filter(p=>path.basename(p)==='cli-process-exit.json').length!==starts.length||executionFiles.filter(p=>path.basename(p)==='cli-owned-child.json').length!==starts.length)return null;
 let matched=null;
 for(const startedFile of starts){
  const dir=path.dirname(startedFile),exitFile=path.join(dir,'cli-process-exit.json'),ownFile=path.join(dir,'cli-owned-child.json'),logFile=path.join(dir,'cli-events.log');
  if([exitFile,ownFile,logFile].some(p=>!fs.existsSync(p)))return null;
  const start=read(startedFile),exitBytes=fs.readFileSync(exitFile),exit=JSON.parse(exitBytes),own=read(ownFile),events=fs.readFileSync(logFile);
  if(start.scope!=='owned-cli-child-tree'||exit.scope!==start.scope||own.scope!==start.scope||own.pid!==exit.pid||own.started_at!==exit.started_at||start.started_at!==exit.started_at||start.prompt_sha256!==exit.prompt_sha256||exit.termination_unconfirmed||exit.output_present!==false||exit.event_log_sha256&&exit.event_log_sha256!==sha(events))return null;
  const promptFile=prompts.find(p=>sha(fs.readFileSync(p))===exit.prompt_sha256);if(!promptFile)return null;
  const classified=classifyCliProcess({exit_code:exit.exit_code,spawn_error:exit.spawn_error,timed_out:exit.timed_out,termination_unconfirmed:exit.termination_unconfirmed,output_present:false,event_log:events.toString('utf8')});
  if(classified.code!=='CLI_RATE_LIMITED'||classified.confirmed_no_result!==true)return null;
  if(sha(exitBytes)!==f.process_receipt_sha256)continue;
  const d=cliFailureDiagnostic({metadataDir:dir,output:path.join(path.dirname(promptFile),'cli-output.json'),prompt:fs.readFileSync(promptFile,'utf8'),job,sourceSha:JSON.parse(job.checkpoint).source_sha256});
  if(!safeRateLimitFailure(d)||d.event_log_sha256!==f.event_log_sha256||d.prompt_sha256!==f.prompt_sha256||d.finished_at!==f.finished_at||canonical(d.execution_binding)!==canonical(f.execution_binding))return null;
  matched=d;
 }
 // A later cache invocation without its terminal owned process is unknown.
 for(const markerFile of cacheFiles.filter(p=>path.basename(p)==='invocation-started.json')){
  const marker=read(markerFile);if(path.dirname(markerFile)!==cacheRoot&&!marker.metadata_dir)return null;
  if(marker.metadata_dir){const own=path.resolve(root,marker.metadata_dir);if(!own.startsWith(executionRoot+path.sep)||!starts.includes(path.join(own,'cli-process-started.json'))||!fs.existsSync(path.join(own,'cli-process-exit.json')))return null;}
 }
 return matched?{binding,diagnostic:matched}:null;
}
export async function reconcileLocalCliFailure(selection,{call,root=process.cwd()}={}){
 const job=selection.job,expected=cliFailureReconciliationBinding(job),current=(await call({action:'read',id:job.id})).job;
 if(!expected||JSON.stringify(expected)!==JSON.stringify(cliFailureReconciliationBinding(current)))return{status:'cli-failure-reconciliation-required',job_id:job.id,new_model_calls:0,retry_without_reconciliation:false};
 let proof;try{proof=inspectLocalCliFailure(current,{root})}catch{proof=null;}
 if(!proof)return{status:'cli-failure-reconciliation-required',job_id:job.id,new_model_calls:0,retry_without_reconciliation:false};
 const saved=await call({action:'cli_failure_reconcile',id:job.id,...proof}),after=saved.job,receipt=after&&JSON.parse(after.checkpoint||'{}').cli_failure;
 if(after?.id!==job.id||after.attempt!==job.attempt||after.revision!==job.revision||after.mode_epoch!==job.mode_epoch||after.contract_hash!==job.contract_hash||!['waiting_executor','failed'].includes(after.status)||!safeRateLimitFailure(receipt)||receipt.process_receipt_sha256!==proof.diagnostic.process_receipt_sha256)throw Error('CLI reconciliation result unconfirmed; inspect original task');
 return{status:after.status==='waiting_executor'?'cli-failure-reconciled':'cli-failure-reconciled-budget-exhausted',job_id:job.id,confirmed_no_result:true,result_unknown:false,new_model_calls:0,budget_reset:false,original_receipts_retained:true,...(after.status==='failed'?{budget_exhausted:true}:{})};
}
