// Studio-only transport. Keep the real owner thread/turn alive for official
// end-of-turn cleanup; never close a tab from another session or by guessed ID.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {createHash} from 'node:crypto';
import {isNativeMetadataWarning} from './native-speech-policy.mjs';
import {cleanupCollector,ownedPageCleanupPrompt} from './heygen-studio-owned-page-cleanup.mjs';
import {STUDIO_DIRECT_BROWSER_SELECT_CODE,STUDIO_DIRECT_BROWSER_INVENTORY_CODE,STUDIO_DIRECT_CREATE_CODE,STUDIO_DIRECT_PROJECTS_READ_CODE,studioDirectNavigationCode,studioDirectInventoryCode,parseStudioDirectBrowserInventory,parseStudioDirectCreatedTab,parseStudioDirectInventory,parseStudioDirectTargetPage} from './heygen-studio-direct-bootstrap.mjs';

export const STUDIO_TEMP_PAGE_MARK='STUDIO_TEMP_PAGE_V1:';
const coded=code=>Object.assign(Error(code),{code});
const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(v);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function boundedWait(promise,ms){let timer;try{await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(resolve,Math.max(1,ms));})]);}finally{clearTimeout(timer);}}
export async function terminateOwned(child,{platform=process.platform,spawnTerminator=spawn}={}){
 // This finite child is awaited. Its handle must remain referenced through a
 // timeout-triggered kill until close/error settles and final receipts flush.
 if(platform==='win32'&&Number.isInteger(child.pid))await new Promise(resolve=>{const p=spawnTerminator('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:1500});p.once('close',resolve);p.once('error',()=>{child.kill();resolve();});});
 else child.kill();
}
function legacyItem(item){
 const types={mcpToolCall:'mcp_tool_call',agentMessage:'agent_message',commandExecution:'command_execution',fileChange:'file_change',dynamicToolCall:'dynamic_tool_call',collabToolCall:'collab_tool_call',webSearch:'web_search',imageView:'image_view',enteredReviewMode:'entered_review_mode',exitedReviewMode:'exited_review_mode',contextCompaction:'context_compaction'};
 return{...item,type:types[item.type]||item.type,...(item.status==='inProgress'?{status:'in_progress'}:{})};
}
function configArgs(args){
 if(!Array.isArray(args)||typeof args[0]!=='string'||args[1]!=='exec')throw coded('STUDIO_TRANSPORT_ARGS_INVALID');
 const config=[];for(let i=2;i<args.length;i++)if(args[i]==='--config'){if(typeof args[i+1]!=='string')throw coded('STUDIO_TRANSPORT_ARGS_INVALID');config.push('--config',args[++i]);}
 // A child-only restriction, independently verified against the native catalog.
 if(!config.includes('mcp_servers.node_repl.enabled=false'))throw coded('STUDIO_TRANSPORT_NODE_RESTRICTION_REQUIRED');
 return[args[0],'app-server',...config,'--listen','stdio://'];
}
export async function studioAppServerChild(args,{input,deadline,metadataDir,stdout=()=>{},stderr=()=>{},runId=process.env.SIOUNEX_PERIODIC_RUN_ID,transportScope,spawnChild=spawn,terminate=terminateOwned,now=Date.now,cleanupReserveMs=210000,cliIdentity}={}){
 const startedAt=now(),remaining=deadline-startedAt;
 if(typeof input!=='string'||!Number.isFinite(remaining)||remaining<=0||remaining>1800000)throw coded('STUDIO_TRANSPORT_DEADLINE_INVALID');
 const appArgs=configArgs(args),nativeEntry=/\.exe$/i.test(appArgs[0]),entrypointKind=nativeEntry?'native':'javascript',reserve=Math.min(cleanupReserveMs,Math.max(100,remaining/3)),softDeadline=deadline-reserve;
 if(nativeEntry&&(!path.isAbsolute(appArgs[0])&&!path.win32.isAbsolute(appArgs[0])||/[\0\r\n]/.test(appArgs[0])))throw coded('STUDIO_TRANSPORT_NATIVE_CLI_PATH_INVALID');
 let safeCliIdentity;
 if(cliIdentity!==undefined){
  if(!cliIdentity||typeof cliIdentity!=='object'||Array.isArray(cliIdentity)||Object.keys(cliIdentity).sort().join()!==['version','source_identity_sha256','entrypoint_kind'].sort().join()||typeof cliIdentity.version!=='string'||cliIdentity.version.length>128||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/.test(cliIdentity.version)||!/^[a-f0-9]{64}$/.test(cliIdentity.source_identity_sha256||'')||cliIdentity.entrypoint_kind!==entrypointKind)throw coded('STUDIO_TRANSPORT_CLI_IDENTITY_INVALID');
  safeCliIdentity={version:cliIdentity.version,source_identity_sha256:cliIdentity.source_identity_sha256,entrypoint_kind:cliIdentity.entrypoint_kind};
 }
 const pending=new Map(),decoder=new StringDecoder('utf8'),methods=[],registrations=[],notificationCounts={},directTools=[],directBootstrap=transportScope?.direct_bootstrap===true;let pendingCreatedPage=null,directInventory=null,directBrowser=null,directTarget=null;
 const cuaDiagnostics={schema:'studio-cua-call-diagnostics-v1',limit:256,truncated:false,dropped_events:0,started_events:0,completed_events:0,records:[]},cuaDiagnosticRows=new Map();
 if(directBootstrap&&!['projects','pending-preparation'].includes(transportScope.direct_target_kind))throw coded('STUDIO_DIRECT_TARGET_INVALID');
 const directCodes=directBootstrap?[STUDIO_DIRECT_BROWSER_SELECT_CODE,STUDIO_DIRECT_BROWSER_INVENTORY_CODE,STUDIO_DIRECT_CREATE_CODE,studioDirectInventoryCode(transportScope),studioDirectNavigationCode(transportScope.direct_target_kind),STUDIO_DIRECT_PROJECTS_READ_CODE]:[];
 let child,sequence=0,buffer='',eofFlushed=false,closed=false,closeCode=null,threadId=null,turnId=null,turnStatus=null,terminalMethod=null,terminal=false,expired=false,interruptSent=false,hookCompleted=false,parseErrors=0,serverRequests=0,errorCode=null,inputEchoId=null,inputEchoStarted=false,inputEchoCompleted=false,abortResolve,turnResolve,closeResolve,directPrelude=null;
 const inputSha=createHash('sha256').update(input).digest('hex');
 const aborted=new Promise(resolve=>abortResolve=resolve),turnDone=new Promise(resolve=>turnResolve=resolve),childDone=new Promise(resolve=>closeResolve=resolve);
 const started={...(runId?{periodic_run_id:runId}:{}),started_at:new Date(startedAt).toISOString(),deadline_ms:deadline,soft_deadline_ms:softDeadline,scope:'owned-child-tree',transport:'studio-app-server-stdio',...(safeCliIdentity?{cli_identity:safeCliIdentity}:{})};
 const write=(name,value)=>{if(metadataDir){fs.mkdirSync(metadataDir,{recursive:true});fs.writeFileSync(path.join(metadataDir,name),JSON.stringify(value,null,2),{flag:'wx'});}};
 const emit=value=>{try{stdout(Buffer.from(JSON.stringify(value)+'\n'));}catch{abort('STUDIO_TRANSPORT_OUTPUT_FAILED');}};
 function abort(code){errorCode||=code;abortResolve();for(const p of pending.values())p.reject(coded(code));pending.clear();}
 function send(value){try{child.stdin.write(JSON.stringify(value)+'\n');}catch{abort('STUDIO_TRANSPORT_STDIO_FAILED');}}
 function rpc(method,params,timeout=Math.max(1,softDeadline-now())){methods.push(method);return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(coded('STUDIO_TRANSPORT_RPC_TIMEOUT'));},Math.max(1,timeout));pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});send({id,method,params});});}
 const isCuaJs=item=>item?.type==='mcpToolCall'&&['cua_repl','mcp__cua_repl'].includes(item.server)&&item.tool==='js';
 function recordCuaCall(method,item,phase){
  if(!['item/started','item/completed'].includes(method)||!isCuaJs(item))return;
  const starting=method==='item/started',itemId=safeId(item.id)?item.id:null,key=itemId===null?null:phase+'\0'+itemId;
  cuaDiagnostics[starting?'started_events':'completed_events']++;
  let record=key===null?null:cuaDiagnosticRows.get(key);
  if(starting||!record||record.completed_at!==null){
   if(cuaDiagnostics.records.length>=cuaDiagnostics.limit){cuaDiagnostics.truncated=true;cuaDiagnostics.dropped_events++;return;}
   record={item_id:itemId,phase,started_at:null,completed_at:null,timeout_ms:null,completed_timeout_ms:null,code_sha256:null,completed_code_sha256:null,started_status:null,completed_status:null,result_is_error:null,api_names:[],completed_api_names:[]};
   cuaDiagnostics.records.push(record);if(key!==null)cuaDiagnosticRows.set(key,record);
  }
  const args=item.arguments,code=typeof args?.code==='string'?args.code:null,timeout=typeof args?.timeout_ms==='number'&&Number.isFinite(args.timeout_ms)?args.timeout_ms:null;
  const status=['inProgress','in_progress','completed','failed','cancelled','canceled','interrupted'].includes(item.status)?item.status:null;
  const hash=code===null?null:createHash('sha256').update(code).digest('hex'),apis=[];
  if(code!==null)for(const match of code.matchAll(/\b(getState|getBrowser|nameSession|getTab|createBrowserTab|listBrowsers|listTabs|getTabs|goto|getAXState|domSnapshot|evaluate|snapshot|click|fill)\s*\(/g)){if(!apis.includes(match[1]))apis.push(match[1]);if(apis.length===16)break;}
  if(starting)Object.assign(record,{started_at:new Date(now()).toISOString(),timeout_ms:timeout,code_sha256:hash,started_status:status,api_names:apis});
  else Object.assign(record,{completed_at:new Date(now()).toISOString(),completed_timeout_ms:timeout,completed_code_sha256:hash,completed_status:status,result_is_error:typeof item.result?.isError==='boolean'?item.result.isError:null,completed_api_names:apis});
 }
 function startDirect(item){
  if(!directBootstrap)return;
  if(item?.type==='mcpToolCall'&&['cua_repl','mcp__cua_repl'].includes(item.server)&&!isCuaJs(item)){abort('STUDIO_DIRECT_BOOTSTRAP_ORDER_INVALID');return;}
  if(!isCuaJs(item))return;
  // The documented initial inventory call is a valid entry point. It is read
  // only and does not select, create or claim any page.
  if(!directTools.length&&!directPrelude&&item.arguments?.code==='await cua.getState();'){directPrelude={id:item.id,completed:false};return;}
  if(directPrelude&&!directPrelude.completed){abort('STUDIO_DIRECT_BOOTSTRAP_ORDER_INVALID');return;}
  if(directTools.some(t=>t.id===item.id)){abort('STUDIO_DIRECT_BOOTSTRAP_ORDER_INVALID');return;}
  const index=directTools.length,valid=!errorCode&&!(index>0&&index<=6&&!directTools[index-1].completed||index<6&&(item.arguments?.code!==directCodes[index]||item.arguments?.timeout_ms!==60000)||index===2&&!directBrowser||index===3&&!pendingCreatedPage||index>=4&&registrations.length!==1||index>5&&(!directTarget||/\bcua\.createBrowserTab\s*\(/.test(item.arguments?.code||'')));
  directTools.push({id:item.id,code:item.arguments?.code,timeout_ms:typeof item.arguments?.timeout_ms==='number'&&Number.isFinite(item.arguments.timeout_ms)?item.arguments.timeout_ms:null,completed:false,valid});
  if(!valid)abort('STUDIO_DIRECT_BOOTSTRAP_ORDER_INVALID');
 }
 function register(item){
  if(!isCuaJs(item))return;
  if(directBootstrap&&directPrelude?.id===item.id){if(directPrelude.completed||item.arguments?.code!=='await cua.getState();'||item.status!=='completed'||item.result?.isError===true){abort('STUDIO_DIRECT_BOOTSTRAP_FAILED');return;}directPrelude.completed=true;return;}
  const directIndex=directBootstrap?directTools.findIndex(t=>t.id===item.id):-1;
  if(directIndex>=0)directTools[directIndex].completed_timeout_ms=typeof item.arguments?.timeout_ms==='number'&&Number.isFinite(item.arguments.timeout_ms)?item.arguments.timeout_ms:null;
  if(directBootstrap&&directIndex>=0&&directIndex<6){
   if(!directTools[directIndex].valid||item.arguments?.timeout_ms!==60000||item.arguments?.code!==directCodes[directIndex]||item.arguments?.code!==directTools[directIndex].code||directIndex>0&&!directTools[directIndex-1].completed||directTools[directIndex].completed||item.status!=='completed'||item.result?.isError===true){abort('STUDIO_DIRECT_BOOTSTRAP_FAILED');return;}
   if(directIndex===0){directTools[directIndex].completed=true;return;}
   if(directIndex===1){directBrowser=parseStudioDirectBrowserInventory(item.result);if(!directBrowser){abort('STUDIO_DIRECT_BROWSER_IDENTITY_INVALID');return;}directTools[directIndex].completed=true;return;}
   if(directIndex===2){
    const created=parseStudioDirectCreatedTab(item.result);if(!created||(item.result?.content||[]).some(c=>typeof c.text==='string'&&c.text.includes(STUDIO_TEMP_PAGE_MARK))){abort('STUDIO_DIRECT_CREATE_IDENTITY_INVALID');return;}
    pendingCreatedPage={schema:'studio-temp-page-pending-v1',request_id:transportScope.request_id,attempt_id:transportScope.attempt_id,tab_id:created.tab_id,browser_id:directBrowser.browser_id,created_temporary_page:true,inventory_mode:'chrome-list-tabs',source:'verified-chrome-blank-create',browser_inventory_sha256:directBrowser.inventory_sha256,create_response_sha256:createHash('sha256').update(JSON.stringify(item.result)).digest('hex')};
    directTools[directIndex].completed=true;
    try{write('temporary-page-pending.json',{...pendingCreatedPage,owner_thread_id:threadId,owner_turn_id:turnId});}catch{abort('STUDIO_TEMP_PAGE_REGISTRATION_WRITE_FAILED');}return;
   }
   if(directIndex===3){directInventory=parseStudioDirectInventory(item.result,pendingCreatedPage,directBrowser);if(!directInventory||!directInventory.generic_editor_absent){abort('STUDIO_DIRECT_INVENTORY_INVALID');return;}}
   if(directIndex===4){directTools[directIndex].completed=true;return;}
   if(directIndex===5){directTarget=parseStudioDirectTargetPage(item.result,pendingCreatedPage,{kind:transportScope.direct_target_kind});if(!directTarget){abort('STUDIO_DIRECT_TARGET_IDENTITY_INVALID');return;}directTools[directIndex].completed=true;return;}
  }
  if(item.status!=='completed')return;
  for(const c of item.result?.content||[]){if(c.type!=='text'||typeof c.text!=='string')continue;const count=c.text.split(STUDIO_TEMP_PAGE_MARK).length-1;if(!count)continue;if(count!==1){abort('STUDIO_TEMP_PAGE_REGISTRATION_INVALID');continue;}
   const tail=c.text.slice(c.text.indexOf(STUDIO_TEMP_PAGE_MARK)+STUDIO_TEMP_PAGE_MARK.length).trim();let v;try{v=JSON.parse(tail);}catch{abort('STUDIO_TEMP_PAGE_REGISTRATION_INVALID');continue;}
   if(!v||Array.isArray(v)||Object.keys(v).sort().join()!==['attempt_id','browser_id','created_temporary_page','request_id','schema','tab_id'].sort().join()||v.schema!=='studio-temp-page-v1'||v.created_temporary_page!==true||!safeId(v.tab_id)||!safeId(v.browser_id)||v.request_id!==transportScope?.request_id||v.attempt_id!==transportScope?.attempt_id||registrations.length||directBootstrap&&(directIndex!==3||!directInventory||v.tab_id!==pendingCreatedPage?.tab_id||v.browser_id!==directInventory.browser_id)){abort('STUDIO_TEMP_PAGE_REGISTRATION_INVALID');continue;}
   registrations.push({...v,...(directBootstrap?{inventory_mode:'chrome-list-tabs',direct_inventory_sha256:directInventory.inventory_sha256}:{}),registered_at:new Date(now()).toISOString(),ttl_deadline_ms:softDeadline});
   try{write('temporary-page-registration.json',{...registrations[0],owner_thread_id:threadId,owner_turn_id:turnId});}catch{abort('STUDIO_TEMP_PAGE_REGISTRATION_WRITE_FAILED');}
  }
  if((/\bcua\.createBrowserTab\s*\(/.test(item.arguments?.code||'')||directBootstrap&&directIndex===3)&&registrations.length!==1)abort('STUDIO_TEMP_PAGE_REGISTRATION_MISSING');
  if(directBootstrap&&directIndex>=0&&registrations.length===1)directTools[directIndex].completed=true;
 }
 function receive(chunk){
  buffer+=decoder.write(chunk);if(buffer.length>16000000){abort('STUDIO_TRANSPORT_OUTPUT_OVERFLOW');return;}let at;
  while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.trim())continue;let v;try{v=JSON.parse(line);}catch{parseErrors++;abort('STUDIO_TRANSPORT_JSON_INVALID');continue;}
   if(!v||typeof v!=='object'||Array.isArray(v)){parseErrors++;abort('STUDIO_TRANSPORT_JSON_INVALID');continue;}
   if(v.id!==undefined&&typeof v.method==='string'){serverRequests++;send({id:v.id,error:{code:-32601,message:'Studio driver rejects approvals and client tool requests'}});abort('STUDIO_TRANSPORT_INTERACTION_REJECTED');continue;}
   if(v.id!==undefined){const p=pending.get(v.id);if(!p){abort('STUDIO_TRANSPORT_RESPONSE_UNEXPECTED');continue;}pending.delete(v.id);if(v.error){if(!ownedCleanup)emit({type:'error',message:typeof v.error.message==='string'?v.error.message:'Native app-server RPC failed'});p.reject(coded('STUDIO_TRANSPORT_RPC_FAILED'));}else if(Object.hasOwn(v,'result'))p.resolve(v.result);else p.reject(coded('STUDIO_TRANSPORT_RESPONSE_INVALID'));continue;}
   if(typeof v.method!=='string'){abort('STUDIO_TRANSPORT_NOTIFICATION_INVALID');continue;}notificationCounts[v.method]=(notificationCounts[v.method]||0)+1;
   const p=v.params||{};
   recordCuaCall(v.method,p.item,ownedCleanup&&p.turnId!==turnId?'cleanup':'original');
   if(ownedCleanup){if(/^item\//.test(v.method)&&p.turnId===turnId){emit({type:v.method.replace('/','.'),item:legacyItem(p.item)});abort('STUDIO_TRANSPORT_ACTIVITY_AFTER_TERMINAL');}else ownedCleanup.receive(v);continue;}
   if(v.method==='turn/started'){if(p.threadId!==threadId||!safeId(p.turn?.id)||turnId&&turnId!==p.turn.id){abort('STUDIO_TRANSPORT_BINDING_CHANGED');continue;}turnId=p.turn.id;emit({type:'turn.started'});}
   else if(['item/started','item/completed','item/updated'].includes(v.method)){if(p.threadId!==threadId||p.turnId!==turnId||!p.item||typeof p.item.type!=='string'){abort('STUDIO_TRANSPORT_BINDING_CHANGED');continue;}
    if(p.item.type==='userMessage'){
     const i=p.item,c=i.content?.[0],valid=!terminal&&safeId(i.id)&&(!inputEchoId||inputEchoId===i.id)&&Object.keys(i).every(k=>['id','type','content','clientId'].includes(k))&&(i.clientId===undefined||i.clientId===null)&&Array.isArray(i.content)&&i.content.length===1&&c?.type==='text'&&c.text===input&&Object.keys(c).every(k=>['type','text','text_elements'].includes(k))&&(c.text_elements===undefined||Array.isArray(c.text_elements)&&c.text_elements.length===0)&&v.method!=='item/updated'&&(v.method==='item/started'?!inputEchoStarted:inputEchoStarted&&!inputEchoCompleted);
     if(valid){inputEchoId=i.id;if(v.method==='item/started')inputEchoStarted=true;else inputEchoCompleted=true;continue;}
     abort('STUDIO_TRANSPORT_INPUT_ECHO_INVALID');
    }
    if(terminal)abort('STUDIO_TRANSPORT_ACTIVITY_AFTER_TERMINAL');if(v.method==='item/started')startDirect(p.item);if(v.method==='item/completed')register(p.item);emit({type:v.method.replace('/','.'),item:legacyItem(p.item)});}
   else if(v.method==='turn/completed'){if(p.threadId!==threadId||p.turn?.id!==turnId){abort('STUDIO_TRANSPORT_BINDING_CHANGED');continue;}terminal=true;terminalMethod=v.method;turnStatus=p.turn.status;emit(turnStatus==='completed'?{type:'turn.completed',usage:p.turn.usage||{}}:{type:'turn.failed',error:{message:p.turn.error?.message||'Native Studio turn '+String(turnStatus)}});turnResolve();}
   else if(v.method==='warning'){const message=typeof p.message==='string'?p.message:'Native app-server warning';emit(isNativeMetadataWarning(message)?{type:'item.completed',item:{id:'app-server-warning-'+notificationCounts[v.method],type:'error',message}}:{type:'error',message});}
   else if(v.method==='error')emit({type:'error',message:p.error?.message||p.message||'Native app-server error'});
   // Deltas and status notifications are not actions. Every full typed item is
   // forwarded above, including foreign tools, errors and their complete result.
  }
 }
 function flushEof(){if(eofFlushed)return;eofFlushed=true;receive(Buffer.from('\n'));const tail=decoder.end();if(tail.trim()||buffer.trim()){parseErrors++;abort('STUDIO_TRANSPORT_JSON_INVALID');}}
 let softTimer,hardTimer,ownedCleanup=null,absenceVerified=false;
 try{
  child=spawnChild(nativeEntry?appArgs[0]:process.execPath,nativeEntry?appArgs.slice(1):appArgs,{cwd:process.cwd(),windowsHide:true,env:{...process.env,...(runId?{SIOUNEX_PERIODIC_RUN_ID:runId}:{})},stdio:['pipe','pipe','pipe']});if(Number.isInteger(child.pid))started.pid=child.pid;write('process-started.json',started);
  child.stdout.on('data',receive);child.stdout.once('end',flushEof);child.stderr.on('data',stderr);for(const s of [child.stdin,child.stdout,child.stderr])s.on?.('error',()=>abort('STUDIO_TRANSPORT_STDIO_FAILED'));child.once('error',()=>abort('STUDIO_TRANSPORT_START_FAILED'));child.once('close',code=>{flushEof();closed=true;closeCode=code;closeResolve();if(!terminal)abort('STUDIO_TRANSPORT_CHILD_CLOSED');});
  softTimer=setTimeout(()=>{expired=true;abortResolve();},Math.max(1,softDeadline-now()));hardTimer=setTimeout(()=>abort('STUDIO_TRANSPORT_HARD_DEADLINE'),Math.max(1,deadline-now()));
  await rpc('initialize',{clientInfo:{name:'siounex_studio_browser_driver',version:'1.0.0'}});send({method:'initialized',params:{}});
  const t=await rpc('thread/start',{cwd:process.cwd(),ephemeral:true,approvalPolicy:'never',sandbox:'read-only',model:'gpt-5.6-sol'});if(t?.thread?.ephemeral!==true||!safeId(t.thread.id))throw coded('STUDIO_TRANSPORT_EPHEMERAL_REQUIRED');threadId=t.thread.id;write('app-server-thread.json',{thread_id:threadId,ephemeral:true,created_at:new Date(now()).toISOString()});emit({type:'thread.started',thread_id:threadId});
  // A bounded UI phase must not inherit the desktop's ultra reasoning setting.
  const tr=await rpc('turn/start',{threadId,effort:'low',input:[{type:'text',text:input}]});if(!safeId(tr?.turn?.id)||turnId&&turnId!==tr.turn.id)throw coded('STUDIO_TRANSPORT_TURN_INVALID');turnId=tr.turn.id;write('app-server-turn.json',{thread_id:threadId,turn_id:turnId,reasoning_effort:'low',started_at:new Date(now()).toISOString(),soft_deadline_ms:softDeadline});
  await Promise.race([turnDone,aborted]);
  if(directBootstrap&&pendingCreatedPage&&registrations.length!==1)errorCode||='STUDIO_DIRECT_INVENTORY_REQUIRED';
  if(directBootstrap&&(!directTarget||directTools.slice(0,6).filter(t=>t.completed).length!==6))errorCode||='STUDIO_DIRECT_BOOTSTRAP_INCOMPLETE';
 }catch(e){errorCode||=e.code||'STUDIO_TRANSPORT_FAILED';}
 finally{
  clearTimeout(softTimer);
  // Interrupt while this actual owner session is alive. The official terminal
  // path closes its unmarked created tabs and releases borrowed tabs.
  if(child&&!closed&&threadId&&turnId&&!terminal){interruptSent=true;try{await rpc('turn/interrupt',{threadId,turnId},Math.max(1,Math.min(3000,deadline-now())));const left=Math.max(1,deadline-now()),cleanupMargin=Math.min(120000,Math.max(500,left/4));await boundedWait(turnDone,Math.max(1,Math.min(90000,left-cleanupMargin)));}catch{errorCode||='STUDIO_TRANSPORT_INTERRUPT_UNCONFIRMED';}}
  // A real second turn supplies CUA metadata and retains the original handle.
  // Its tools are separately checked and never become media/readback evidence.
  const cleanupPage=registrations[0]||pendingCreatedPage;
  if(child&&!closed&&terminal&&threadId&&cleanupPage){
   let done;const cleanupDone=new Promise(resolve=>{done=resolve;});ownedCleanup=cleanupCollector({threadId,page:cleanupPage,onDone:done});
   try{
    if(deadline-now()<1000)throw coded('STUDIO_TRANSPORT_CLEANUP_BUDGET_EXHAUSTED');
    const result=await rpc('turn/start',{threadId,effort:'low',input:[{type:'text',text:ownedPageCleanupPrompt(cleanupPage)}]},Math.max(1,deadline-now()-500));
    if(result?.turn?.id!==ownedCleanup.state.turn_id&&ownedCleanup.state.turn_id!==null)throw coded('STUDIO_TRANSPORT_CLEANUP_BINDING_CHANGED');
    ownedCleanup.state.turn_id??=result?.turn?.id;
    await boundedWait(cleanupDone,deadline-now()-5000);
    if(!ownedCleanup.state.terminal&&ownedCleanup.state.turn_id){await rpc('turn/interrupt',{threadId,turnId:ownedCleanup.state.turn_id},Math.max(1,Math.min(1000,deadline-now())));await Promise.race([cleanupDone,sleep(Math.max(1,Math.min(1000,deadline-now())))]);}
    absenceVerified=ownedCleanup.verified();
   }catch{absenceVerified=false;}
   write('studio-owned-page-cleanup.json',{schema:'studio-owned-page-cleanup-v1',original_turn_id:turnId,thread_id:threadId,...ownedCleanup.state,temporary_page_absence_verified:absenceVerified});
   if(!absenceVerified)errorCode||='STUDIO_TRANSPORT_CLEANUP_UNCONFIRMED';
  }
  if(child&&!closed&&terminal&&threadId&&turnId){try{const r=await rpc('mcpServer/tool/call',{threadId,server:'cua_repl',tool:'turn_ended',arguments:{hook_event_name:terminalMethod,session_id:threadId,turn_id:turnId}},Math.max(1,Math.min(6000,deadline-now())));hookCompleted=r?.isError!==true&&Array.isArray(r?.content);if(!hookCompleted)errorCode||='STUDIO_TRANSPORT_CLEANUP_UNCONFIRMED';}catch{errorCode||='STUDIO_TRANSPORT_CLEANUP_UNCONFIRMED';}}
  if(child&&!closed){child.stdin.end();await Promise.race([childDone,sleep(Math.max(1,Math.min(1500,deadline-now())))]);if(!closed){try{await terminate(child);await Promise.race([childDone,sleep(500)]);}catch{}if(!closed){child.unref?.();for(const s of [child.stdin,child.stdout,child.stderr])s.destroy?.();}}}
  clearTimeout(hardTimer);for(const p of pending.values())p.reject(coded('STUDIO_TRANSPORT_CLOSED'));pending.clear();buffer='';
 }
 if(ownedCleanup){absenceVerified=ownedCleanup.verified();if(!absenceVerified)errorCode||='STUDIO_TRANSPORT_CLEANUP_UNCONFIRMED';}
 const cleanup=terminal&&hookCompleted&&(!registrations.length&&!pendingCreatedPage||absenceVerified),ok=turnStatus==='completed'&&!expired&&!errorCode&&closed&&closeCode===0&&cleanup;
 const receipt={...started,finished_at:new Date(now()).toISOString(),exit_code:ok?0:1,timed_out:expired,result_unknown:!ok,termination_unconfirmed:!!child&&!closed,thread_id:threadId,turn_id:turnId,lifecycle_cleanup_completed:cleanup,lifecycle_cleanup_acknowledged:terminal&&hookCompleted,temporary_page_absence_verified:absenceVerified};
 write('studio-lifecycle.json',{schema:'studio-browser-lifecycle-v1',thread_id:threadId,turn_id:turnId,turn_status:turnStatus,terminal_received:terminal,terminal_method:terminalMethod,soft_ttl_expired:expired,interrupt_sent:interruptSent,turn_ended_completed:hookCompleted,temporary_page_absence_verified:absenceVerified,cleanup_turn_id:ownedCleanup?.state.turn_id||null,input_echo:{input_sha256:inputSha,item_id:inputEchoId,started:inputEchoStarted,completed:inputEchoCompleted},owned_process_stopped:closed,process_exit_code:closeCode,...(safeCliIdentity?{cli_identity:safeCliIdentity}:{}),temporary_pages:registrations,cua_call_diagnostics:cuaDiagnostics,...(directBootstrap?{direct_browser:directBrowser,direct_bootstrap_calls:directTools.slice(0,6).map(t=>({item_id:safeId(t.id)?t.id:null,timeout_ms:t.timeout_ms,completed_timeout_ms:t.completed_timeout_ms??null,completed:t.completed})),direct_bootstrap_completed:!!directTarget&&directTools.slice(0,6).filter(t=>t.completed).length===6}:{}),...(pendingCreatedPage?{pending_created_page:pendingCreatedPage,direct_inventory_verified:!!directInventory&&directInventory.generic_editor_absent===true}:{}),parse_errors:parseErrors,server_requests_rejected:serverRequests,error_code:errorCode,methods,notification_counts:notificationCounts});write('process-exit.json',receipt);
 if(!ok)throw Object.assign(coded(errorCode||(expired?'STUDIO_TRANSPORT_RESULT_UNKNOWN':'STUDIO_TRANSPORT_FAILED')),{receipt});
 return receipt;
}
