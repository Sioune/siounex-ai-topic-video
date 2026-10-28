// One fixed native Sites read. No model turn, persisted conversation or raw logs.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {credentialConfigArgs,credentialErrorCode,SITE_READ_TOOL} from './native-credential-policy.mjs';
import {nativeSiteToken} from './native-site-token.mjs';

export async function terminateOwned(child,timeout=2000,{platform=process.platform,spawnTerminator=spawn}={}){
 if(platform!=='win32'||!Number.isInteger(child.pid)){child.kill();return;}
 // Both finite completion paths are awaited; neither may drop the final ref.
 await new Promise(resolve=>{let timer;const stop=spawnTerminator('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:Math.max(1,timeout)}),done=()=>{clearTimeout(timer);resolve();};stop.once('error',()=>{child.kill();done();});stop.once('close',done);timer=setTimeout(done,Math.max(1,timeout));});
}
const coded=code=>Object.assign(Error(code),{code});
function safeRpcError(error){const text=typeof error?.message==='string'?error.message:'',status=/\bHTTP(?:\s+status)?[\s:=()]+([1-5][0-9]{2})\b/i.exec(text),category=/\b(?:timeout|timed?\s*out|deadline exceeded)\b/i.test(text)?'timeout':/\b(?:connection closed|transport closed|connection reset|econnreset|econnrefused|socket hang up)\b/i.test(text)?'connection':'other';return{...(Number.isSafeInteger(error?.code)&&Math.abs(error.code)<=100000?{rpc_code:error.code}:{}),...(status?{http_status:Number(status[1])}:{}),category};}
export async function readNativeSiteCredential(projectId,{cwd=process.cwd(),cli=path.join(process.env.APPDATA||'','npm/node_modules/@openai/codex/bin/codex.js'),deadline=Date.now()+120000,metadataDir,spawnChild=spawn,terminate=terminateOwned,now=Date.now}={}){
 const remaining=deadline-now();
 if(typeof projectId!=='string'||!projectId||!Number.isFinite(remaining)||remaining<=0||remaining>120000)throw coded('CREDENTIAL_INVALID_READ_SCOPE');
 const source='app-server-direct-native-read',startedAt=now(),pending=new Map(),decoder=new StringDecoder('utf8');
 let child,sequence=0,buffer='',stderrBuffer='',token=null,response=null,closed=false,closeCode=null,phase='initialize',timer,scopeViolation=false,unknownActivity=false,parseErrors=0,readIssued=false,closeResolve;
 const closedPromise=new Promise(resolve=>{closeResolve=resolve;});
 const calls=[],events=[],processReceipt={started_at:new Date(startedAt).toISOString(),deadline_ms:deadline,scope:'owned-child-tree',transport:'app-server-stdio',source};
 const diagnostic={source,code:'CREDENTIAL_CHILD_START_FAILED',credential_received:false,scope_violation:false,binding_mismatch:false,unknown_activity:false,tool_call_count:0,parse_errors:0,startup:[],events,calls,final_source:'native-rpc-outcome'};
 function rejectPending(error){for(const p of pending.values())p.reject(error);pending.clear();}
 function fail(code){const error=coded(code);rejectPending(error);return error;}
 function send(value){try{child.stdin.write(JSON.stringify(value)+'\n');}catch{fail('CREDENTIAL_CHILD_NONZERO');}}
 function rpc(method,params){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});send({id,method,params});});}
 function stderrLine(line){if(!line.trim())return;const code=credentialErrorCode(line);if(!['CHILD_ERROR','SKILL_METADATA_WARNING'].includes(code))events.push({event:'child-error',error_code:code,startup_observed:false});}
 function receive(chunk){
  buffer+=decoder.write(chunk);
  if(buffer.length>4000000){buffer='';fail('CREDENTIAL_OUTPUT_OVERFLOW');return;}
  let at;while((at=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.trim())continue;
   let value;try{value=JSON.parse(line);}catch{parseErrors++;fail('CREDENTIAL_RPC_JSON_INVALID');continue;}
   if(!value||typeof value!=='object'||Array.isArray(value)){parseErrors++;fail('CREDENTIAL_RPC_JSON_INVALID');continue;}
   if(value.id!==undefined&&typeof value.method==='string'){
    // No approvals, elicitation or additional client-side tools in a fixed read.
    scopeViolation=true;events.push({event:'server-request-rejected'});
    send({id:value.id,error:{code:-32601,message:'Unsupported request in credential-only read'}});
    fail('CREDENTIAL_INTERACTION_REQUIRED');continue;
   }
   if(value.id!==undefined){
    const p=pending.get(value.id);if(!p){unknownActivity=true;fail('CREDENTIAL_RPC_RESPONSE_UNEXPECTED');continue;}
    pending.delete(value.id);
    if(value.error){const category=credentialErrorCode(value.error.message);events.push({event:'rpc-error',error_code:category,...safeRpcError(value.error)});p.reject(coded('CREDENTIAL_'+category));}
    else if(Object.hasOwn(value,'result'))p.resolve(value.result);
    else p.reject(coded('CREDENTIAL_RPC_RESPONSE_INVALID'));
   }
   // Notifications may contain private tool results; never retain or echo them.
  }
 }
 try{
  child=spawnChild(/\.js$/i.test(cli)?process.execPath:cli,[...(/\.js$/i.test(cli)?[cli]:[]),'app-server',...credentialConfigArgs(),'--config','approval_policy="never"','--listen','stdio://'],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
  if(Number.isInteger(child.pid))processReceipt.pid=child.pid;
  if(metadataDir){fs.mkdirSync(metadataDir,{recursive:true});fs.writeFileSync(path.join(metadataDir,'process-started.json'),JSON.stringify(processReceipt),{flag:'wx'});}
  child.stdout.on('data',receive);
  for(const stream of [child.stdin,child.stdout,child.stderr])stream.on?.('error',()=>fail('CREDENTIAL_CHILD_NONZERO'));
  child.stderr.on('data',chunk=>{stderrBuffer+=chunk.toString('utf8');let at;while((at=stderrBuffer.indexOf('\n'))>=0){stderrLine(stderrBuffer.slice(0,at));stderrBuffer=stderrBuffer.slice(at+1);}if(stderrBuffer.length>12000){stderrLine(stderrBuffer);stderrBuffer='';}});
  child.once('error',()=>fail('CREDENTIAL_CHILD_START_FAILED'));
  child.once('close',code=>{closed=true;closeCode=code;closeResolve();rejectPending(coded('CREDENTIAL_CHILD_NONZERO'));});
  // Leave bounded time inside this attempt's deadline for owned-tree cleanup.
  timer=setTimeout(()=>fail('CREDENTIAL_DEADLINE'),Math.max(1,remaining-Math.min(2000,remaining/10)));
  await rpc('initialize',{clientInfo:{name:'siounex_native_credential',version:'1.0.0'}});
  send({method:'initialized',params:{}});
  phase='ephemeral-thread';
  const thread=await rpc('thread/start',{cwd,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',model:'gpt-5.6-sol'});
  if(thread?.thread?.ephemeral!==true||typeof thread.thread.id!=='string'||!thread.thread.id)throw coded('CREDENTIAL_EPHEMERAL_REQUIRED');
  phase='native-tool-read';readIssued=true;
  calls.push({server:'codex_apps',tool:SITE_READ_TOOL,status:'in_progress',allowed:true,binding:'matched'});
  response=await rpc('mcpServer/tool/call',{threadId:thread.thread.id,server:'codex_apps',tool:SITE_READ_TOOL,arguments:{project_id:projectId}});
  if(!response||typeof response!=='object'||Array.isArray(response)||!Array.isArray(response.content))throw coded('CREDENTIAL_RPC_RESPONSE_INVALID');
  calls[0].status=response.isError===true?'failed':'completed';
  if(response?.isError===true)throw coded('CREDENTIAL_NATIVE_READ_FAILED');
  token=nativeSiteToken({type:'mcp_tool_call',status:'completed',server:'codex_apps',tool:SITE_READ_TOOL,arguments:{project_id:projectId},result:response},projectId);
  response=null;
  if(!token)throw coded('CREDENTIAL_TOKEN_MISSING');
  if(scopeViolation||unknownActivity||parseErrors)throw coded('CREDENTIAL_RPC_ACTIVITY_INVALID');
  diagnostic.code='CREDENTIAL_READ_SUCCEEDED';diagnostic.final_source='verified-native-response';
 }catch(error){
  token=null;diagnostic.code=/^CREDENTIAL_[A-Z_]+$/.test(error?.code||'')?error.code:'CREDENTIAL_CHILD_NONZERO';diagnostic.phase=phase;
 }finally{
  clearTimeout(timer);response=null;buffer='';if(stderrBuffer)stderrLine(stderrBuffer);stderrBuffer='';
  if(child&&!closed){
   let cleanupTimer;
   const cleanupMs=Math.max(1,Math.min(2000,deadline-now()));
   try{child.stdin.end();await Promise.race([(async()=>{await terminate(child,cleanupMs);await closedPromise;})(),new Promise(resolve=>{cleanupTimer=setTimeout(resolve,cleanupMs);})]);}catch{closed=false;}finally{clearTimeout(cleanupTimer);}
   if(!closed){token=null;diagnostic.code='CREDENTIAL_CLEANUP_UNCONFIRMED';child.unref?.();child.stdin.destroy?.();child.stdout.destroy?.();child.stderr.destroy?.();}
  }
  buffer='';stderrBuffer='';
  if(token&&(scopeViolation||unknownActivity||parseErrors)){token=null;diagnostic.code='CREDENTIAL_RPC_ACTIVITY_INVALID';}
  diagnostic.credential_received=!!token;diagnostic.scope_violation=scopeViolation;diagnostic.unknown_activity=unknownActivity;diagnostic.parse_errors=parseErrors;diagnostic.tool_call_count=readIssued?1:0;diagnostic.owned_child_stopped=closed;
  if(!token)diagnostic.final_source='native-rpc-outcome';
  diagnostic.final={completed:!!token,blocked:!token,new_fee:false};
  Object.assign(processReceipt,{finished_at:new Date(now()).toISOString(),exit_code:closeCode,timed_out:diagnostic.code==='CREDENTIAL_DEADLINE',result_unknown:diagnostic.code==='CREDENTIAL_DEADLINE'||!!child&&!closed,shutdown:closed?'owned-child-stopped':child?'unconfirmed':'not-started'});
  if(metadataDir)fs.writeFileSync(path.join(metadataDir,'process-exit.json'),JSON.stringify(processReceipt),{flag:'wx'});
 }
 return {token,diagnostic,process:processReceipt};
}
