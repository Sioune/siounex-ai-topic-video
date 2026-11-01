import {executorFetch as fetch} from './native-production-transport.mjs';
import{enforceProductionQuality,requireQualityInput}from'./production-quality-qa.mjs';
import{checkToolDemonstration}from'./tool-demonstration-preflight.mjs';
import {executorResponse} from './executor-response.mjs';
// Finite local execution. Existing credentials enter stdin only; never a daemon.
import fs from 'node:fs';import path from 'node:path';import {renderOperation} from './media-adapter.mjs';
import {readHiddenJsonInput} from './hidden-json-input.mjs';
const readInput=()=>readHiddenJsonInput(process.stdin,{prompt:'Ready for media executor JSON on hidden stdin.'});
const input=await readInput();
const config=JSON.parse(input),origin=config.origin||'https://siounex-ai-topic-library.siounexzhao.chatgpt.site';if(origin!=='https://siounex-ai-topic-library.siounexzhao.chatgpt.site'&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Unexpected destination');
if(config.job_id==='job_e13e8b19-aa0a-4840-abc9-333eefc91b05')throw Error('Claude owner-voice work is isolated in its original task; do not duplicate it');
async function call(body){const r=await fetch(origin+'/api/executor',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${config.token}`},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});return executorResponse(r)}
const job=(await call({action:'read',id:config.job_id})).job;
const proposed=config.operation_id?JSON.parse(job.operations.find(o=>o.id===config.operation_id)?.plan||'{}'):JSON.parse(fs.readFileSync(config.plan_file,'utf8'));if((config.node==='video'||job.operations.find(o=>o.id===config.operation_id)?.node==='video')&&!proposed.test_only){const ready=await checkToolDemonstration(job,{demonstration_check:proposed.demonstration_check});if(ready.blocked){console.log(JSON.stringify({status:'media-materials-blocked',problems:ready.problems,claimed:false}));process.stdin.destroy();process.exit(0);}}
let op=config.operation_id?job.operations.find(x=>x.id===config.operation_id):(await call({action:'operation_plan',id:job.id,node:config.node,revision:job.revision,script_hash:JSON.parse(fs.readFileSync(config.plan_file,'utf8')).test_only?job.drafts[0].content_hash:job.approved_hash,base_artifact_version:config.base_artifact_version,plan:JSON.parse(fs.readFileSync(config.plan_file,'utf8'))})).operation;
if(!op)throw Error('Operation missing');if(op.status!=='completed')requireQualityInput(job,op,{required:false});if(op.status==='completed'){console.log(JSON.stringify({status:'completed',operation_id:op.id,reused:true}));}else{
const invocation=op.invocation_id||'local-'+op.id;
const claimed=await call({action:['running','prepared'].includes(op.status)?'operation_recover':'operation_claim',id:job.id,operation_id:op.id,invocation_id:invocation});
const binding={id:job.id,operation_id:op.id,lease_token:claimed.lease_token};op=claimed.operation;
try{
 if(config.result_file){const result=JSON.parse(fs.readFileSync(config.result_file,'utf8'));result.receipt=await enforceProductionQuality({job,operation:op,inputRoot:config.input_root,receipt:result.receipt,qualityManifestFile:config.quality_manifest_file});result.artifact.qa=result.receipt.qa;const done=await call({action:'operation_complete',...binding,result});console.log(JSON.stringify({status:'result-reported',operation_id:op.id,node:op.node,job_status:done.job.status,human_audio_review_required:op.node==='video',paid_calls:0}));}
 else{const result=await renderOperation({operation:op,job,inputRoot:config.input_root});await call({action:'operation_checkpoint',...binding,checkpoint_version:op.checkpoint_version,checkpoint:{phase:'local-files-ready; waiting existing Library handoff',receipt_path:path.join('.sites-runtime/media-operations',op.id,'receipt.json'),files:result.files.map(f=>({role:f.role,sha256:f.sha256,size_bytes:f.size_bytes})),cost:0,publication:false,qa:result.qa}});console.log(JSON.stringify({status:'local-files-ready',operation_id:op.id,receipt:path.join('.sites-runtime/media-operations',op.id,'receipt.json'),next:'Existing Codex Library connection must archive files and return an exact operation_complete receipt; no autonomous cloud handoff or wake is configured',cost:0,publication:false,reused:!!result.reused}));
  // The finite process keeps its scoped lease in memory while this Codex session
  // uses its existing Library connection. No credential is saved in the receipt.
  let timer;const transfer=await Promise.race([readInput(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Library handoff timed out; saved files remain, reconcile before resuming')),480000)})]).finally(()=>clearTimeout(timer));
  const uploaded=JSON.parse(transfer);if(!uploaded.result)throw Error('Exact Library/operation result required');const done=await call({action:'operation_complete',...binding,result:uploaded.result});console.log(JSON.stringify({status:'result-reported',operation_id:op.id,node:op.node,job_status:done.job.status,quality_approval:false,paid_calls:0}));}
}catch(e){try{await call({action:'operation_pause',...binding,reason:String(e.message).slice(0,2000)})}catch{}throw e}

}
// Natural bounded exit also works with Windows Node24 pipe handles.
process.stdin.removeAllListeners('end');process.stdin.destroy();
