// Local evidence only. This module never starts a process or generates an image.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {cliFailureDiagnostic} from './cli-failure-recovery.mjs';
import {safeRateLimitFailure} from '../lib/cli-failure-contract.mts';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const failure=code=>{throw Object.assign(Error(code),{code});};
function read(file,max=100000000){if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile()||fs.statSync(file).size>max)failure('NATIVE_COVER_PRIOR_RESULT_RECONCILIATION_REQUIRED');return fs.readFileSync(file);}
function equalIntent(dir,intent){if(canonical(JSON.parse(read(path.join(dir,'intent.json'))))!==canonical(intent))failure('NATIVE_COVER_PRIOR_INTENT_CHANGED');}
export function nativeCoverNoResultEvidence(dir,intent,{generatedRoot,now=Date.now(),expectedPrompt}={}){
 try{
  equalIntent(dir,intent);const prompt=read(path.join(dir,'cli-prompt.txt'),1000000),image=read(path.join(dir,'prompt.txt'),1000000),processDir=path.join(dir,'process'),output=path.join(dir,'model-result.json');
  if(sha(image)!==intent.prompt_sha256||image.toString('utf8')!==intent.image_prompt||expectedPrompt&&prompt.toString('utf8')!==expectedPrompt(intent)||fs.existsSync(output)||fs.existsSync(path.join(dir,'native-generated.png'))||fs.existsSync(path.join(dir,'generation-receipt.json')))return null;
  const d=cliFailureDiagnostic({metadataDir:processDir,output,prompt:prompt.toString('utf8')}),exit=JSON.parse(read(path.join(processDir,'cli-process-exit.json')));
  if(!safeRateLimitFailure(d)||!Number.isFinite(Date.parse(exit.started_at))||Date.parse(exit.finished_at)<Date.parse(exit.started_at)||Date.parse(exit.finished_at)>now+30000)return null;
  const events=read(path.join(processDir,'cli-events.log')).toString('utf8').split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)),threads=events.filter(e=>e.type==='thread.started');
  if(threads.length!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(threads[0].thread_id||''))return null;
  const folder=path.join(generatedRoot,threads[0].thread_id);if(fs.existsSync(folder)&&(fs.lstatSync(folder).isSymbolicLink()||!fs.statSync(folder).isDirectory()||fs.readdirSync(folder).length))return null;
  const next_retry_at=new Date(Date.parse(d.finished_at)+Math.max(900000,Math.min(3600000,Number(d.retry_after_seconds||0)*1000))).toISOString();
  return{schema:'native-cover-zero-result-reconciliation-v1',request_id:intent.request_id,request_sha256:intent.request_sha256,role:intent.role,binding:intent.binding,video_sha256:intent.video_sha256,intent_sha256:sha(read(path.join(dir,'intent.json'))),image_prompt_sha256:sha(image),cli_prompt_sha256:sha(prompt),process_receipt_sha256:d.process_receipt_sha256,event_log_sha256:d.event_log_sha256,thread_id:threads[0].thread_id,finished_at:d.finished_at,next_retry_at,code:'CLI_RATE_LIMITED',confirmed_no_result:true,result_unknown:false,tool_events:0,original_files_preserved:true};
 }catch{return null;}
}
// An unknown sibling request is not made safe by a new request/input hash.
// Completed receipts and exact pre-provider parser rejections are checked by
// the executor's existing provenance validators, never by model prose.
export function inspectNativeCoverHistory(historyDir,{generatedRoot,now=Date.now(),completed,argumentRejected,expectedPrompt}={}){
 const attempts=[];let visited=0;
 function walk(dir,packet=null){
  if(++visited>512||fs.lstatSync(dir).isSymbolicLink())failure('NATIVE_COVER_PRIOR_RESULT_RECONCILIATION_REQUIRED');
  const rf=path.join(dir,'request.json');if(fs.existsSync(rf)){const bytes=read(rf,50000);packet={value:JSON.parse(bytes),sha256:sha(bytes)};}
  const f=path.join(dir,'intent.json');if(!fs.existsSync(f)&&['model-result.json','native-generated.png','generation-receipt.json','process'].some(n=>fs.existsSync(path.join(dir,n))))failure('NATIVE_COVER_PRIOR_RESULT_RECONCILIATION_REQUIRED');if(fs.existsSync(f)){
   const intent=JSON.parse(read(f,50000)),r=packet?.value?.request;
   if(!r||intent.request_id!==r.request_id||intent.request_sha256!==packet.sha256||canonical(intent.binding)!==canonical(r.binding)||intent.video_sha256!==r.video_sha256||!['cover_3_4','cover_4_3'].includes(intent.role))failure('NATIVE_COVER_PRIOR_RESULT_RECONCILIATION_REQUIRED');
   if(completed?.(dir,intent))attempts.push({role:intent.role,status:'completed',finished_at:JSON.parse(read(path.join(dir,'generation-receipt.json'))).cover.generated_at});
   else if(!argumentRejected?.(dir,intent)){const proof=nativeCoverNoResultEvidence(dir,intent,{generatedRoot,now,expectedPrompt});if(!proof)failure('NATIVE_COVER_PRIOR_RESULT_RECONCILIATION_REQUIRED');attempts.push({role:intent.role,status:'rate-limited',finished_at:proof.finished_at,proof,directory:dir});}
  }
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())failure('NATIVE_COVER_PRIOR_RESULT_RECONCILIATION_REQUIRED');if(e.isDirectory()&&(/^aigc_cover_[a-f0-9]{64}$/.test(e.name)||['cover_3_4','cover_4_3','correction-1','argument-correction-1','retry-1','retry-2'].includes(e.name)))walk(path.join(dir,e.name),packet);}
 }
 if(fs.existsSync(historyDir))walk(historyDir);return attempts;
}
export function assertNativeCoverRetryAllowed(attempts,role,now=Date.now()){
 const ordered=attempts.filter(a=>a.role===role).toSorted((a,b)=>Date.parse(a.finished_at)-Date.parse(b.finished_at)),lastComplete=ordered.findLastIndex(a=>a.status==='completed'),failed=ordered.slice(lastComplete+1).filter(a=>a.status==='rate-limited');
 if(failed.length>=3)failure('NATIVE_COVER_RETRY_EXHAUSTED');const last=failed.at(-1);if(last&&Date.parse(last.proof.next_retry_at)>now)throw Object.assign(Error('NATIVE_COVER_RATE_LIMITED'),{code:'NATIVE_COVER_RATE_LIMITED',next_retry_at:last.proof.next_retry_at,reconciliation:last.proof});return failed;
}
export function nativeCoverAttemptDirectory(baseDir,intent,{generatedRoot,now=Date.now(),completed,expectedPrompt}={}){
 for(let n=0;n<=2;n++){const dir=n?path.join(baseDir,'retry-'+n):baseDir;if(!fs.existsSync(path.join(dir,'intent.json'))){if(['model-result.json','native-generated.png','generation-receipt.json','process'].some(n=>fs.existsSync(path.join(dir,n))))failure('NATIVE_COVER_PRIOR_RESULT_RECONCILIATION_REQUIRED');return dir;}equalIntent(dir,intent);if(completed?.(dir,intent))return dir;if(!nativeCoverNoResultEvidence(dir,intent,{generatedRoot,now,expectedPrompt}))return dir;}
 failure('NATIVE_COVER_RETRY_EXHAUSTED');
}
