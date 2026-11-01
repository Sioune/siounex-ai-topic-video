import {resolveNativeProductionCli,nativeProductionCliOptions} from './resolve-native-production-cli.mjs';
import runtimePolicy from '../production/native-runtime-policy.json' with {type:'json'};
import {StringDecoder} from 'node:string_decoder';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const PROJECT='appgprj_8f3ab93a1fb6107ad01eef60d3bb28f2',TOOL='ai.production_runtime_request';
const coded=(code)=>Object.assign(Error(code),{code});
const DIAGNOSTIC_ACTIONS=new Set(['read','dispatch_next','native_preparation_read','native_preparation_ensure','native_preparation_claim','native_preparation_progress','local_review_draft_read','local_review_draft_begin','local_review_draft_return','site_archive_read_part','site_archive_start','site_archive_part','site_archive_finalize','site_archive_confirm','promo_list','post_video_preparation_read','post_video_preparation_begin','post_video_preparation_complete']);
// Never retain upstream text, which may contain credentials, request payloads or private content.
export function nativeRpcDiagnostic(error,method){
 const text=typeof error?.message==='string'?error.message:'';
 const status=/\bHTTP(?:\s+status)?[\s:=()]+([1-5][0-9]{2})\b/i.exec(text);
 const category=/\b(?:timed?\s*out|timeout|deadline exceeded)\b/i.test(text)?'timeout':/\b(?:connection closed|transport closed|connection reset|econnreset|econnrefused|socket hang up)\b/i.test(text)?'connection':/\b(?:rate limit|too many requests)\b/i.test(text)?'rate_limit':/\b(?:unauthorized|unauthenticated|authentication required|forbidden)\b/i.test(text)?'authorization':'other';
 return {method:['initialize','thread/start','mcpServerStatus/list','app/list','config/mcpServer/reload','mcpServer/tool/call'].includes(method)?method:'other',...(Number.isSafeInteger(error?.code)&&Math.abs(error.code)<=100000?{rpc_code:error.code}:{}),...(status?{http_status:Number(status[1])}:{}),category};
}
export function createNativeProductionTransport({cwd=process.cwd(),timeoutMs=120000}={}, {spawnChild=spawn,resolveCli=()=>resolveNativeProductionCli(nativeProductionCliOptions(cwd))}={}){
 if(JSON.parse(fs.readFileSync(path.join(cwd,'.openai/hosting.json'))).project_id!==PROJECT)throw coded('NATIVE_PRODUCTION_SITE_BINDING');
 let child,started,closed=false,retired=false,activeCalls=0,sequence=0,buffer='',threadId,closePromise;const pending=new Map(),decoder=new StringDecoder('utf8');
 const fail=error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error)}pending.clear()};
 const send=v=>child.stdin.write(JSON.stringify(v)+'\n');
 const rpc=(method,params,action)=>new Promise((resolve,reject)=>{const id=++sequence,safeAction=DIAGNOSTIC_ACTIONS.has(action)?action:undefined,timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(coded('NATIVE_PRODUCTION_RESULT_UNKNOWN'),{rpc_diagnostic:{...nativeRpcDiagnostic({message:'timeout'},method),...(safeAction?{action:safeAction}:{})}}))},timeoutMs);pending.set(id,{resolve,reject,timer,method,action:safeAction});send({id,method,params})});
 async function start(){
  const cli=resolveCli();
  child=spawnChild(cli.cli_path,['app-server','--config','features.apps=true','--config','approval_policy="never"','--listen','stdio://'],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
  for(const s of [child.stdin,child.stdout,child.stderr])s.on('error',()=>fail(coded('NATIVE_PRODUCTION_RESULT_UNKNOWN')));
  child.on('error',()=>fail(coded('NATIVE_PRODUCTION_START_FAILED')));child.stderr.on('data',()=>{});
  child.on('close',()=>fail(coded('NATIVE_PRODUCTION_RESULT_UNKNOWN')));
  child.stdout.on('data',chunk=>{buffer+=decoder.write(chunk);if(Buffer.byteLength(buffer)>12000000){buffer='';fail(coded('NATIVE_PRODUCTION_RESPONSE_LIMIT'));return}let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);let v;try{v=JSON.parse(line)}catch{fail(coded('NATIVE_PRODUCTION_RPC_INVALID'));continue}if(v.id!==undefined&&v.method){send({id:v.id,error:{code:-32601,message:'Interactive approval must remain with the owner'}});fail(coded('NATIVE_PRODUCTION_INTERACTION_REQUIRED'));continue}const p=pending.get(v.id);if(p){pending.delete(v.id);clearTimeout(p.timer);v.error?p.reject(Object.assign(coded('NATIVE_PRODUCTION_TOOL_FAILED'),{rpc_diagnostic:{...nativeRpcDiagnostic(v.error,p.method),...(p.action?{action:p.action}:{})}})):p.resolve(v.result)}}});
  await rpc('initialize',{clientInfo:{name:'siounex_normal_production',version:'1.0.0'}});send({method:'initialized',params:{}});
  const t=await rpc('thread/start',{cwd,ephemeral:true,approvalPolicy:'never',sandbox:'read-only'});if(t.thread?.ephemeral!==true)throw coded('NATIVE_PRODUCTION_EPHEMERAL_REQUIRED');threadId=t.thread.id;
  const catalog=async()=>{let cursor=null;for(let i=0;i<10;i++){const r=await rpc('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly',limit:100,...(cursor?{cursor}:{})});if((r.data||[]).some(s=>s.name==='codex_apps'&&Object.entries(s.tools||{}).some(([key,x])=>(x.name||key)===TOOL&&x.inputSchema?.properties?.runtime_protocol?.enum?.includes(2))))return true;cursor=r.nextCursor||r.next_cursor;if(!cursor)break}return false};
  if(!await catalog()){await rpc('app/list',{threadId,forceRefetch:true,limit:100});await rpc('config/mcpServer/reload');if(!await catalog())throw coded('NATIVE_PRODUCTION_TOOL_UNAVAILABLE');}
 }
 const close=()=>closePromise??=(async()=>{closed=true;fail(coded('NATIVE_PRODUCTION_CLOSED'));if(!child)return;child.stdin.end();if(process.platform==='win32'&&Number.isInteger(child.pid))await new Promise(resolve=>{const p=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:3000});p.once('error',resolve);p.once('close',resolve)});else child.kill();buffer='';})();
 return{async call(body){if(closed||retired)throw coded('NATIVE_PRODUCTION_NOT_SENT');activeCalls++;started??=start();try{await started;const r=await rpc('mcpServer/tool/call',{threadId,server:'codex_apps',tool:TOOL,arguments:{request_json:JSON.stringify(body?.action==='dispatch_next'?{...body,executor_release:runtimePolicy.executor_release}:body),runtime_protocol:2}},body?.action);if(r.isError)throw coded('NATIVE_PRODUCTION_TOOL_REJECTED');const value=JSON.parse(r.content?.find(x=>x.type==='text')?.text||'null');if(!Number.isInteger(value?.status)||value.status<200||value.status>599||!value.body)throw coded('NATIVE_PRODUCTION_RESPONSE_INVALID');return value;}catch(e){retired=true;throw e;}finally{activeCalls--;if(retired&&!activeCalls)await close();}},close};
}
export function createExecutorTransport({createTransport=createNativeProductionTransport,enabled=()=>process.env.SIOUNEX_PRIVATE_PRODUCTION_MCP==='1',fetchPublic=(...args)=>globalThis.fetch(...args)}={}){
let shared=null,holders=0,idle;const connections=new Set();
function connection(){let resolve;const row={client:createTransport(),active:0,retired:false,closing:false,done:new Promise(r=>{resolve=r}),resolve:()=>resolve()};connections.add(row);return row;}
function closeDrained(row){
 if(row.active||row.closing)return;row.closing=true;
 // A failed request retires admission, not another request's in-flight RPC.
 // Closing errors must not replace the already observed business result.
 Promise.resolve().then(()=>row.client.close()).catch(()=>{}).finally(()=>{connections.delete(row);row.resolve();});
}
// Normal flows own their connection until completion. Long material/model work
// must not turn every heartbeat into another cold MCP startup.
function hold(){
 if(!enabled())return()=>{};
 holders++;let released=false;
 return()=>{if(released)return;released=true;holders--;if(!holders)return close()};
}
async function fetch(url,options){
 if(!enabled()||String(url)!=='https://siounex-ai-topic-library.siounexzhao.chatgpt.site/api/executor')return fetchPublic(url,options);
 if(options?.method!=='POST'||options.redirect!=='error'||typeof options.body!=='string')throw coded('NATIVE_PRODUCTION_REQUEST_SCOPE');
 for(let admission=0;admission<2;admission++){
  clearTimeout(idle);shared??=connection();const current=shared;current.active++;
  try{const r=await current.client.call(JSON.parse(options.body));return Response.json(r.body,{status:r.status});}
  catch(error){current.retired=true;if(shared===current)shared=null;
   // Only the client's synchronous pre-send admission refusal is retryable.
   // A sent RPC rejected by close, timeout, or any other error stays unknown.
   if(error?.code!=='NATIVE_PRODUCTION_NOT_SENT'||admission!==0)throw error;
  }
  finally{current.active--;if(current.retired){closeDrained(current);if(!current.active)await current.done;}else if(!current.active&&!holders){idle=setTimeout(()=>{if(!current.active&&!holders&&shared===current){shared=null;current.retired=true;closeDrained(current)}},2000);}}
 }
}
async function close(){clearTimeout(idle);shared=null;const rows=[...connections];for(const row of rows){row.retired=true;closeDrained(row)}await Promise.all(rows.map(row=>row.done));}
return{fetch,hold,close};
}
const executor=createExecutorTransport();
export const holdNativeProductionTransport=()=>executor.hold();
export const executorFetch=(...args)=>executor.fetch(...args);
export const closeNativeProductionTransport=()=>executor.close();
