// Fixed existing-account catalog reads. No model turn and no speech generation.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {nativeSpeechConfig,nativeToolPayload,nativeSpeechFailureCode,speechSha} from './native-speech-policy.mjs';

const failure=code=>Object.assign(Error(code),{code});
const exitCode=value=>Number.isInteger(value)?value:null;
const signalName=value=>['SIGABRT','SIGALRM','SIGHUP','SIGINT','SIGKILL','SIGPIPE','SIGQUIT','SIGTERM','SIGUSR1','SIGUSR2','SIGBREAK'].includes(value)?value:null;
const shutdownError=error=>['ENOENT','EACCES','EPERM','ESRCH','ETIMEDOUT','EPIPE','UNKNOWN','ABORT_ERR','ERR_STREAM_DESTROYED','ERR_STREAM_WRITE_AFTER_END'].includes(error?.code)?error.code:'NATIVE_SPEECH_SHUTDOWN_OPERATION_FAILED';
export async function stopOwned(child,{platform=process.platform,spawnTerminator=spawn,timeout_ms=1500}={}){
 const timeout=Math.max(1,Math.min(10000,Number.isFinite(timeout_ms)?Math.floor(timeout_ms):1500));
 const facts={method:platform==='win32'&&Number.isInteger(child.pid)?'taskkill-owned-tree':'owned-child-kill',timeout_ms:timeout,helper_close_observed:false,helper_exit_code:null,helper_signal:null,helper_error_code:null,helper_killed:false,fallback_kill_requested:false,fallback_kill_returned:null,fallback_error_code:null};
 const kill=()=>{facts.fallback_kill_requested=true;try{const result=child.kill();facts.fallback_kill_returned=typeof result==='boolean'?result:null;}catch(error){facts.fallback_error_code=shutdownError(error);}};
 if(facts.method==='owned-child-kill'){kill();return facts;}
 // Retain the awaited finite terminator until its close/error is observed.
 await new Promise(resolve=>{let stop;try{stop=spawnTerminator('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout});}catch(error){facts.helper_error_code=shutdownError(error);kill();resolve();return;}
  stop.once('error',error=>{facts.helper_error_code=shutdownError(error);kill();resolve();});
  stop.once('close',(code,signal)=>{facts.helper_close_observed=true;facts.helper_exit_code=exitCode(code);facts.helper_signal=signalName(signal);facts.helper_killed=stop.killed===true;resolve();});
 });
 return facts;
}
export async function runNativeSpeechRead({dir,deadline_ms=Date.now()+120000,cwd=process.cwd(),cli=path.join(process.env.APPDATA||'','npm/node_modules/@openai/codex/bin/codex.js'),spawnChild=spawn,terminate=stopOwned,clock=Date.now}={}){
 const startedAt=clock(),remaining=Math.min(120000,deadline_ms-startedAt),source='app-server-direct-native-read',events=[],calls=[];
 const diagnostic={code:'NATIVE_SPEECH_PROCESS_RESULT_UNAVAILABLE',source,mode:'read',native_failure:null,cli_failure:null,tool_call_count:0,scope_violation:false,parse_errors:0,thread_id:null,events};
 if(!Number.isFinite(remaining)||remaining<=0)return{diagnostic,account:null,voice:null,speech:null,verified:false};
 let child,buffer='',stderr='',sequence=0,closed=false,closeCode=null,timer,closeResolve,fatal=null,account=null,voice=null,readTimedOut=false;
 const decoder=new StringDecoder('utf8'),pending=new Map(),closedPromise=new Promise(resolve=>{closeResolve=resolve;});
 const cleanupReserve=Math.min(10000,Math.max(1,Math.floor(remaining/3))),stamp=()=>new Date(clock()).toISOString();
 const processReceipt={started_at:new Date(startedAt).toISOString(),deadline_ms:startedAt+remaining,read_deadline_ms:startedAt+remaining-cleanupReserve,cleanup_reserve_ms:cleanupReserve,scope:'owned-child-tree',source,transport:'app-server-stdio'};
 const shutdownFacts={cleanup_started_at:null,cleanup_deadline_ms:null,stdin_eof_requested_at:null,stdin_eof_error_code:null,stdin_finish_at:null,stdout_end_at:null,stderr_end_at:null,child_error_code:null,child_exit_at:null,child_exit_code:null,child_exit_signal:null,child_close_at:null,child_close_code:null,child_close_signal:null,termination_requested_at:null,termination_finished_at:null,termination_error_code:null,termination:null,cleanup_finished_at:null,cleanup_confirmed:false};
 async function waitWithin(promise,deadline){const left=deadline-clock();if(left<=0)return false;let waitTimer;try{return await Promise.race([promise.then(()=>true),new Promise(resolve=>{waitTimer=setTimeout(()=>resolve(false),left);})]);}finally{clearTimeout(waitTimer);}}
 const rejectAll=code=>{fatal??=code;for(const p of pending.values())p.reject(failure(code));pending.clear();};
 function send(value){try{child.stdin.write(JSON.stringify(value)+'\n');}catch{rejectAll('NATIVE_SPEECH_PROCESS_RESULT_UNAVAILABLE');}}
 function rpc(method,params){if(fatal)return Promise.reject(failure(fatal));return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});send({id,method,params});});}
 function receive(chunk){
  buffer+=decoder.write(chunk);if(buffer.length>4000000){buffer='';rejectAll('NATIVE_SPEECH_EVENT_PARSE_FAILED');return;}
  let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.trim())continue;let value;try{value=JSON.parse(line);}catch{diagnostic.parse_errors++;rejectAll('NATIVE_SPEECH_EVENT_PARSE_FAILED');continue;}
   if(!value||typeof value!=='object'||Array.isArray(value)){diagnostic.parse_errors++;rejectAll('NATIVE_SPEECH_EVENT_PARSE_FAILED');continue;}
   if(value.id!==undefined&&typeof value.method==='string'){diagnostic.scope_violation=true;send({id:value.id,error:{code:-32601,message:'Unsupported request in account-read-only operation'}});rejectAll('NATIVE_SPEECH_INTERACTION_REQUIRED');continue;}
   if(value.id===undefined)continue;const p=pending.get(value.id);if(!p){rejectAll('NATIVE_SPEECH_RPC_RESPONSE_UNEXPECTED');continue;}pending.delete(value.id);
   if(value.error){const code=nativeSpeechFailureCode(value.error,'NATIVE_CLI');diagnostic.cli_failure=code;events.push({event:'rpc-error',failure_code:code});p.reject(failure(code));}
   else if(Object.hasOwn(value,'result'))p.resolve(value.result);else p.reject(failure('NATIVE_SPEECH_RPC_RESPONSE_INVALID'));
  }
 }
 function stderrLine(line){const code=nativeSpeechFailureCode(line,'NATIVE_CLI');if(code!=='NATIVE_CLI_FAILED'&&code!=='SKILL_METADATA_WARNING')events.push({event:'child-error',failure_code:code});}
 try{
  child=spawnChild(process.execPath,[cli,'app-server',...nativeSpeechConfig('read').flatMap(value=>['--config',value]),'--config','approval_policy="never"','--listen','stdio://'],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
  if(Number.isInteger(child.pid))processReceipt.pid=child.pid;
  if(dir){fs.mkdirSync(path.join(dir,'process'),{recursive:true});fs.writeFileSync(path.join(dir,'process/process-started.json'),JSON.stringify(processReceipt),{flag:'wx'});}
  child.stdout.on('data',receive);child.stderr.on('data',chunk=>{stderr+=chunk.toString('utf8');let at;while((at=stderr.indexOf('\n'))>=0){stderrLine(stderr.slice(0,at));stderr=stderr.slice(at+1);}if(stderr.length>12000){stderrLine(stderr);stderr='';}});
  for(const stream of [child.stdin,child.stdout,child.stderr])stream.on?.('error',()=>rejectAll('NATIVE_SPEECH_PROCESS_RESULT_UNAVAILABLE'));
  child.stdin.once('finish',()=>{shutdownFacts.stdin_finish_at=stamp();});child.stdout.once('end',()=>{shutdownFacts.stdout_end_at=stamp();});child.stderr.once('end',()=>{shutdownFacts.stderr_end_at=stamp();});
  child.once('exit',(code,signal)=>{shutdownFacts.child_exit_at=stamp();shutdownFacts.child_exit_code=exitCode(code);shutdownFacts.child_exit_signal=signalName(signal);});
  child.once('error',error=>{shutdownFacts.child_error_code=shutdownError(error);rejectAll('NATIVE_SPEECH_PROCESS_RESULT_UNAVAILABLE');});child.once('close',(code,signal)=>{closed=true;closeCode=exitCode(code);shutdownFacts.child_close_at=stamp();shutdownFacts.child_close_code=closeCode;shutdownFacts.child_close_signal=signalName(signal);closeResolve();rejectAll('NATIVE_SPEECH_PROCESS_RESULT_UNAVAILABLE');});
  timer=setTimeout(()=>{readTimedOut=true;rejectAll('NATIVE_SPEECH_PROCESS_DEADLINE');},Math.max(1,processReceipt.read_deadline_ms-clock()));
  await rpc('initialize',{clientInfo:{name:'siounex_native_voice_catalog',version:'1.0.0'}});send({method:'initialized',params:{}});
  const thread=await rpc('thread/start',{cwd,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',model:'gpt-5.6-sol'});
  if(thread?.thread?.ephemeral!==true||typeof thread.thread.id!=='string'||!thread.thread.id)throw failure('NATIVE_SPEECH_EPHEMERAL_REQUIRED');diagnostic.thread_id=thread.thread.id;
  for(const [tool,args]of [['heygen.get_current_user',{}],['heygen.list_voices',{type:'private',limit:20}]]){
   const id=sequence+1,call={tool,status:'in_progress',allowed:true,binding_matched:true};calls.push(call);diagnostic.tool_call_count=calls.length;
   const result=await rpc('mcpServer/tool/call',{threadId:thread.thread.id,server:'codex_apps',tool,arguments:args});
   if(!result||typeof result!=='object'||Array.isArray(result)||!Array.isArray(result.content))throw failure('NATIVE_SPEECH_RPC_RESPONSE_INVALID');
   if(result.isError===true){diagnostic.native_failure=nativeSpeechFailureCode(result);throw failure(diagnostic.native_failure);}
   const payload=nativeToolPayload(result);if(!payload)throw failure('NATIVE_SPEECH_TOOL_RESULT_UNAVAILABLE');call.status='completed';const entry={item_id:'native-rpc-'+id,response_sha256:speechSha(result),request_sha256:speechSha(args),payload};
   events.push({event:'native-rpc-completed',...call,response_sha256:entry.response_sha256,request_sha256:entry.request_sha256});if(tool==='heygen.get_current_user')account=entry;else voice=entry;
  }
  if(fatal)throw failure(fatal);diagnostic.code='NATIVE_SPEECH_TOOL_VERIFIED';
 }catch(error){account=voice=null;diagnostic.code=/^[A-Z][A-Z_]+$/.test(error.code||'')?error.code:'NATIVE_SPEECH_PROCESS_RESULT_UNAVAILABLE';}
 finally{
  clearTimeout(timer);buffer='';if(stderr)stderrLine(stderr);stderr='';
  if(child&&!closed){
   shutdownFacts.cleanup_started_at=stamp();const cleanupDeadline=Math.min(processReceipt.deadline_ms,clock()+10000);shutdownFacts.cleanup_deadline_ms=cleanupDeadline;
   shutdownFacts.stdin_eof_requested_at=stamp();try{child.stdin.end();}catch(error){shutdownFacts.stdin_eof_error_code=shutdownError(error);}
   await waitWithin(closedPromise,Math.min(cleanupDeadline,clock()+Math.min(1000,Math.max(1,Math.floor((cleanupDeadline-clock())/5)))));
   let terminationSettled=true;
   if(!closed&&clock()<cleanupDeadline){
    shutdownFacts.termination_requested_at=stamp();terminationSettled=false;
    const termination=Promise.resolve().then(()=>terminate(child,{timeout_ms:Math.max(1,Math.min(3000,cleanupDeadline-clock()))})).then(facts=>{
     // Only these bounded OS facts may leave RAM; never persist a raw error,
     // command, environment, tool response or caller-supplied result object.
     if(facts&&typeof facts==='object')shutdownFacts.termination={method:['taskkill-owned-tree','owned-child-kill'].includes(facts.method)?facts.method:null,timeout_ms:Number.isInteger(facts.timeout_ms)&&facts.timeout_ms>0&&facts.timeout_ms<=10000?facts.timeout_ms:null,helper_close_observed:facts.helper_close_observed===true,helper_exit_code:exitCode(facts.helper_exit_code),helper_signal:signalName(facts.helper_signal),helper_error_code:facts.helper_error_code?shutdownError({code:facts.helper_error_code}):null,helper_killed:facts.helper_killed===true,fallback_kill_requested:facts.fallback_kill_requested===true,fallback_kill_returned:typeof facts.fallback_kill_returned==='boolean'?facts.fallback_kill_returned:null,fallback_error_code:facts.fallback_error_code?shutdownError({code:facts.fallback_error_code}):null};
    },error=>{shutdownFacts.termination_error_code=shutdownError(error);}).finally(()=>{terminationSettled=true;shutdownFacts.termination_finished_at=stamp();});
    await waitWithin(Promise.all([termination,closedPromise]),cleanupDeadline);
   }
   shutdownFacts.cleanup_confirmed=closed&&terminationSettled&&Date.parse(shutdownFacts.child_close_at)<=cleanupDeadline&&(!shutdownFacts.termination_requested_at||Date.parse(shutdownFacts.termination_finished_at)<=cleanupDeadline);
   if(!shutdownFacts.cleanup_confirmed){account=voice=null;diagnostic.code='NATIVE_SPEECH_CLEANUP_UNCONFIRMED';child.unref?.();child.stdin.destroy?.();child.stdout.destroy?.();child.stderr.destroy?.();}
   shutdownFacts.cleanup_finished_at=stamp();
  }else shutdownFacts.cleanup_confirmed=closed&&Date.parse(shutdownFacts.child_close_at)<=processReceipt.deadline_ms;
  if(diagnostic.code==='NATIVE_SPEECH_TOOL_VERIFIED'&&(diagnostic.scope_violation||diagnostic.parse_errors||fatal&&fatal!=='NATIVE_SPEECH_PROCESS_RESULT_UNAVAILABLE')){account=voice=null;diagnostic.code=fatal||'NATIVE_SPEECH_EVENT_PARSE_FAILED';}
  Object.assign(processReceipt,{finished_at:stamp(),exit_code:closeCode,timed_out:readTimedOut,result_unknown:!!child&&!shutdownFacts.cleanup_confirmed,shutdown:shutdownFacts.cleanup_confirmed?'owned-child-stopped':child?'unconfirmed':'not-started',shutdown_facts:shutdownFacts});
  Object.assign(diagnostic,{process_exited:closed,exit_code:closeCode,timed_out:processReceipt.timed_out,calls});
  if(dir)fs.writeFileSync(path.join(dir,'process/process-exit.json'),JSON.stringify(processReceipt),{flag:'wx'});
 }
 return{diagnostic,account,voice,speech:null,verified:diagnostic.code==='NATIVE_SPEECH_TOOL_VERIFIED'&&!!account&&!!voice};
}
