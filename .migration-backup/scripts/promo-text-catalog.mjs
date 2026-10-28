// Metadata-only admission. No model turn, tool call, browser or global write.
import {spawn} from 'node:child_process';
import {PROMO_TEXT_CONFIG} from './promo-text-child.mjs';

const MAX_OUTPUT_BYTES=16000000;
const SERVER_ID=/^[A-Za-z0-9_-]{1,100}$/;
const PLUGIN_ID=/^[A-Za-z0-9_@.-]{1,200}$/;
const RUNTIME_STATUSES=new Set(['notStarted','starting','connected','authenticationRequired','failed','cancelled','disabled']);
const METADATA_METHODS=new Set(['initialize','thread/start','mcpServerStatus/list']);
const coded=code=>Object.assign(new Error(code),{code});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function terminateOwned(child){
 if(!Number.isSafeInteger(child?.pid)||child.pid<=0)throw coded('PROMO_TEXT_CATALOG_STOP_UNCONFIRMED');
 if(process.platform==='win32')await new Promise(resolve=>{
  const stop=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:1500});
  stop.once('close',resolve);stop.once('error',()=>{child.kill();resolve();});
 });else child.kill();
}

async function catalog({cli,cwd,configs,spawnChild,terminate,deadline_ms}){
 const remaining=deadline_ms-Date.now();if(remaining<=0)throw coded('PROMO_TEXT_CATALOG_DEADLINE');
 const pending=new Map(),decoder=new TextDecoder('utf-8',{fatal:true}),servers=new Map(),cursors=new Set();
 let child,buffer='',bytes=0,stderrBytes=0,stderrTail='',sequence=0,failure=null,closed=false,closeCode=null,eof=false,stopping=false,threadId=null,closeResolve;
 const methods=[];
 const childClosed=new Promise(resolve=>{closeResolve=resolve;});
 function abort(code){failure||=code;for(const request of pending.values())request.reject(coded(failure));pending.clear();}
 function send(value){if(failure)throw coded(failure);try{child.stdin.write(JSON.stringify(value)+'\n');}catch{abort('PROMO_TEXT_CATALOG_STDIO_FAILED');throw coded(failure);}}
 function rpc(method,params){
  if(!METADATA_METHODS.has(method))throw coded('PROMO_TEXT_CATALOG_METHOD_FORBIDDEN');
  if(failure)throw coded(failure);if(closed)throw coded('PROMO_TEXT_CATALOG_CHILD_CLOSED');
  methods.push(method);
  return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});try{send({id,method,params});}catch{pending.delete(id);reject(coded(failure||'PROMO_TEXT_CATALOG_STDIO_FAILED'));}});
 }
 function receive(chunk){
  bytes+=chunk.length;if(bytes>MAX_OUTPUT_BYTES){abort('PROMO_TEXT_CATALOG_OUTPUT_OVERFLOW');return;}
  try{buffer+=decoder.decode(chunk,{stream:true});}catch{abort('PROMO_TEXT_CATALOG_JSON_INVALID');return;}
  let at;while((at=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.trim())continue;
   let value;try{value=JSON.parse(line);}catch{abort('PROMO_TEXT_CATALOG_JSON_INVALID');continue;}
   if(!value||typeof value!=='object'||Array.isArray(value)){abort('PROMO_TEXT_CATALOG_JSON_INVALID');continue;}
   if(Object.hasOwn(value,'id')&&typeof value.method==='string'){
    try{child.stdin.write(JSON.stringify({id:typeof value.id==='string'||Number.isSafeInteger(value.id)?value.id:null,error:{code:-32601,message:'Metadata-only client rejects server requests'}})+'\n');}catch{}
    abort('PROMO_TEXT_CATALOG_SERVER_REQUEST_REJECTED');continue;
   }
   if(Object.hasOwn(value,'id')){
    const request=pending.get(value.id);if(!request){abort('PROMO_TEXT_CATALOG_RESPONSE_UNEXPECTED');continue;}pending.delete(value.id);
    if(Object.hasOwn(value,'error')){request.reject(coded('PROMO_TEXT_CATALOG_RPC_FAILED'));abort('PROMO_TEXT_CATALOG_RPC_FAILED');}
    else if(Object.hasOwn(value,'result'))request.resolve(value.result);
    else{request.reject(coded('PROMO_TEXT_CATALOG_RESPONSE_INVALID'));abort('PROMO_TEXT_CATALOG_RESPONSE_INVALID');}continue;
   }
   if(typeof value.method!=='string'){abort('PROMO_TEXT_CATALOG_NOTIFICATION_INVALID');continue;}
   // Startup and metadata notifications may arrive while MCP initializes.
   // No action or inference lifecycle is permitted in this connection.
   if(/^(?:turn\/|item\/|codex\/event|mcpServer\/tool\/)/.test(value.method)||value.method==='error')abort('PROMO_TEXT_CATALOG_UNEXPECTED_ACTIVITY');
  }
 }
 function flushEof(){if(eof)return;eof=true;try{buffer+=decoder.decode();}catch{abort('PROMO_TEXT_CATALOG_JSON_INVALID');}if(buffer.trim())abort('PROMO_TEXT_CATALOG_EOF_INVALID');buffer='';}
 const timer=setTimeout(()=>abort('PROMO_TEXT_CATALOG_DEADLINE'),Math.max(1,remaining));
 try{
  child=spawnChild(process.execPath,[cli,'app-server',...configs.flatMap(value=>['--config',value]),'--listen','stdio://'],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
  if(!child?.stdin||!child.stdout||!child.stderr)throw coded('PROMO_TEXT_CATALOG_CHILD_INVALID');
  child.stdout.on('data',receive);child.stdout.once('end',flushEof);child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;stderrTail=(stderrTail+chunk.toString('utf8')).slice(-4000);});
  for(const stream of [child.stdin,child.stdout,child.stderr])stream.on('error',()=>abort('PROMO_TEXT_CATALOG_STDIO_FAILED'));
  child.once('error',()=>abort('PROMO_TEXT_CATALOG_START_FAILED'));
  child.once('close',code=>{flushEof();closed=true;closeCode=code;closeResolve();if(!stopping)abort('PROMO_TEXT_CATALOG_CHILD_CLOSED');});
  const initialized=await rpc('initialize',{clientInfo:{name:'siounex_promo_text_catalog',title:'Siounex promotion text catalog',version:'1.0.0'}});
  if(!initialized||typeof initialized!=='object'||Array.isArray(initialized))throw coded('PROMO_TEXT_CATALOG_INITIALIZE_INVALID');
  send({method:'initialized',params:{}});
  const started=await rpc('thread/start',{cwd,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',model:'gpt-5.6-sol'});
  if(started?.thread?.ephemeral!==true||typeof started.thread.id!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(started.thread.id))throw coded('PROMO_TEXT_CATALOG_EPHEMERAL_REQUIRED');
  threadId=started.thread.id;let cursor=null,pages=0;
  do{
   if(++pages>10)throw coded('PROMO_TEXT_CATALOG_PAGE_LIMIT');
   const result=await rpc('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly',limit:100,...(cursor?{cursor}:{})});
   if(!result||!Array.isArray(result.data)||result.data.length>100)throw coded('PROMO_TEXT_CATALOG_SHAPE_INVALID');
   for(const server of result.data){
    if(!server||typeof server!=='object'||!SERVER_ID.test(server.name)||typeof server.name!=='string')throw coded('PROMO_TEXT_CATALOG_SERVER_ID_INVALID');
    if(servers.has(server.name))throw coded('PROMO_TEXT_CATALOG_SERVER_DUPLICATE');
    if(server.pluginId!==undefined&&server.pluginId!==null&&(typeof server.pluginId!=='string'||!PLUGIN_ID.test(server.pluginId)||server.pluginId.includes('..')))throw coded('PROMO_TEXT_CATALOG_PLUGIN_ID_INVALID');
    if(!RUNTIME_STATUSES.has(server.runtimeStatus)||!server.tools||typeof server.tools!=='object'||Array.isArray(server.tools))throw coded('PROMO_TEXT_CATALOG_SHAPE_INVALID');
    servers.set(server.name,{name:server.name,plugin_id:server.pluginId??null,runtime_status:server.runtimeStatus,tool_count:Object.keys(server.tools).length});
   }
   const next=result.nextCursor;if(next!==undefined&&next!==null&&(typeof next!=='string'||!next||next.length>4096))throw coded('PROMO_TEXT_CATALOG_CURSOR_INVALID');
   cursor=next||null;if(cursor){if(cursors.has(cursor))throw coded('PROMO_TEXT_CATALOG_CURSOR_REPEATED');cursors.add(cursor);}
  }while(cursor);
 }catch(error){abort(typeof error?.code==='string'&&/^PROMO_TEXT_CATALOG_[A-Z_]+$/.test(error.code)?error.code:'PROMO_TEXT_CATALOG_FAILED');}
 finally{
  if(child&&!closed){
   stopping=true;try{child.stdin.end();}catch{abort('PROMO_TEXT_CATALOG_STDIO_FAILED');}
   await Promise.race([childClosed,sleep(1500)]);
   if(!closed){try{await Promise.race([Promise.resolve(terminate(child)),sleep(2000)]);}catch{abort('PROMO_TEXT_CATALOG_STOP_UNCONFIRMED');}await Promise.race([childClosed,sleep(500)]);}
   if(!closed){abort('PROMO_TEXT_CATALOG_STOP_UNCONFIRMED');child.unref?.();for(const stream of [child.stdin,child.stdout,child.stderr])stream?.destroy?.();}
  }
  clearTimeout(timer);for(const request of pending.values())request.reject(coded(failure||'PROMO_TEXT_CATALOG_CLOSED'));pending.clear();
 }
 // Only a fixed configuration-error class and an ASCII missing-field name can
 // escape stderr. Raw text, credentials and provider diagnostics are discarded.
 if(!failure&&(!closed||closeCode!==0||!eof))failure='PROMO_TEXT_CATALOG_STOP_UNCONFIRMED';
 if(failure){const missing=/\bmissing field\s+[`'"]([A-Za-z_]{1,80})[`'"]/i.exec(stderrTail);const diagnostic={methods,servers:[...servers.values()],stderr_bytes_discarded:stderrBytes,stderr_category:missing?'CONFIG_MISSING_FIELD':/config|toml|deserializ/i.test(stderrTail)?'CONFIGURATION_FAILURE':'UNCLASSIFIED',...(missing?{missing_field:missing[1]}:{}),owned_process_stopped:closed,process_exit_code:closeCode};stderrTail='';throw Object.assign(coded(failure),{catalog_diagnostic:diagnostic});}
 stderrTail='';
 return [...servers.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

export async function preparePromoTextRuntime({cli,cwd=process.cwd(),spawnChild=spawn,terminate=terminateOwned,deadline_ms=Date.now()+90000}={}){
 if(typeof cli!=='string'||!cli||typeof cwd!=='string'||!cwd||typeof spawnChild!=='function'||typeof terminate!=='function'||!Number.isFinite(deadline_ms)||deadline_ms<=Date.now()||deadline_ms-Date.now()>90000)throw coded('PROMO_TEXT_CATALOG_ARGUMENTS_INVALID');
 let base,verified;
 try{base=await catalog({cli,cwd,configs:PROMO_TEXT_CONFIG,spawnChild,terminate,deadline_ms});}catch(error){error.catalog_phase='discover';throw error;}
 const names=base.map(server=>server.name),configs=[...PROMO_TEXT_CONFIG,...base.map(server=>server.plugin_id?'plugins.'+JSON.stringify(server.plugin_id)+'.mcp_servers.'+server.name+'.enabled=false':'mcp_servers.'+server.name+'.enabled=false')];
 try{verified=await catalog({cli,cwd,configs,spawnChild,terminate,deadline_ms});}catch(error){error.catalog_phase='verify';error.discovered_servers=base;throw error;}
 const active=verified.filter(server=>server.runtime_status!=='disabled'||server.tool_count!==0);
 if(active.length&&active.every(server=>server.plugin_id&&base.some(prior=>prior.name===server.name&&prior.plugin_id===server.plugin_id))){
  // Some bundled plugin runtimes do not honor per-server policy. Only a plugin
  // identified in both actual catalogs can receive this child-only restriction.
  const pluginIds=[...new Set(active.map(server=>server.plugin_id))].sort();configs.push(...pluginIds.map(id=>'plugins.'+JSON.stringify(id)+'.enabled=false'));
  try{verified=await catalog({cli,cwd,configs,spawnChild,terminate,deadline_ms});}catch(error){error.catalog_phase='verify-plugin';error.discovered_servers=base;throw error;}
 }
 if(verified.some(server=>server.runtime_status!=='disabled'||server.tool_count!==0))throw Object.assign(coded('PROMO_TEXT_CATALOG_NOT_DISABLED'),{catalog_phase:'verify',discovered_servers:base,catalog_diagnostic:{servers:verified,disabled_overrides:configs.slice(PROMO_TEXT_CONFIG.length)}});
 return{schema:'promo-pure-text-runtime-v1',configs,disabled_servers:[...new Set([...names,...verified.map(server=>server.name)])].sort(),catalog_verified:true,tool_count:0,model_turns:0,global_config_modified:false};
}
