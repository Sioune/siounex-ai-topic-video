import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runNativeSpeechRead,stopOwned} from '../scripts/native-speech-read-direct.mjs';
import {HEYGEN_CONNECTOR_ID} from '../scripts/native-speech-policy.mjs';
const secret='SYNTHETIC_PRIVATE_ACCOUNT_OR_SIGNED_URL_DO_NOT_PERSIST';
function fixture(t,{response,thread={id:'synthetic-catalog-thread',ephemeral:true},onMessage,onEnd,onTerminate,stall=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-catalog-direct-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const child=new EventEmitter();child.pid=77111;child.stdout=new EventEmitter();child.stderr=new EventEmitter();const messages=[],spawns=[],terminated=[];let closed=false;
 const emit=value=>child.stdout.emit('data',Buffer.from(typeof value==='string'?value:JSON.stringify(value)+'\n'));
 const close=(code=0,signal=null)=>{if(!closed){closed=true;child.emit('exit',code,signal);child.stdout.emit('end');child.stderr.emit('end');child.emit('close',code,signal);}};
 child.stdin=Object.assign(new EventEmitter(),{write(bytes){for(const line of String(bytes).trim().split('\n')){const message=JSON.parse(line);messages.push(message);queueMicrotask(()=>{if(closed)return;if(onMessage?.(message,{child,emit})===true)return;if(stall)return;if(message.method==='initialize')emit({id:message.id,result:{userAgent:'synthetic'}});else if(message.method==='thread/start')emit({id:message.id,result:{thread}});else if(message.method==='mcpServer/tool/call'){const result=response?.(message)??{content:[],structuredContent:message.params.tool==='heygen.get_current_user'?{private_account:secret,wallet:null}:{voices:[{id:'synthetic-private-voice',type:'private',default_engine:'elevenlabs',private_label:secret}]}};emit({id:message.id,result});}});}return true;},end(){queueMicrotask(()=>{child.stdin.emit('finish');if(onEnd)onEnd({child,emit,close});else close();});}});
 return{dir,child,messages,spawns,terminated,close,options:{dir,cli:'synthetic-cli.js',deadline_ms:Date.now()+1500,spawnChild(command,args,options){spawns.push({command,args,options});return child;},async terminate(owned,options){terminated.push(owned);if(onTerminate)return onTerminate(owned,options,{child,emit,close});queueMicrotask(close);}}};
}
function safeFiles(f,result){assert.equal(JSON.stringify(result.diagnostic).includes(secret),false);for(const file of fs.readdirSync(f.dir,{recursive:true})){const target=path.join(f.dir,file);if(fs.statSync(target).isFile())assert.equal(fs.readFileSync(target).includes(Buffer.from(secret)),false,target);}}
function exactReads(f){const reads=f.messages.filter(m=>m.method==='mcpServer/tool/call');assert.ok(reads.length<=2);for(const read of reads){assert.equal(read.params.server,'codex_apps');assert.equal(read.params.threadId,'synthetic-catalog-thread');assert.ok(['heygen.get_current_user','heygen.list_voices'].includes(read.params.tool));assert.deepEqual(read.params.arguments,read.params.tool==='heygen.get_current_user'?{}:{type:'private',limit:20});}assert.equal(f.messages.some(m=>m.method?.startsWith('turn/')||m.params?.tool==='heygen.create_speech'),false);return reads;}
test('catalog read directly calls exactly the two original native reads without a model turn or persisted private results',async t=>{
 const f=fixture(t),r=await runNativeSpeechRead(f.options);assert.equal(r.verified,true);assert.equal(r.diagnostic.code,'NATIVE_SPEECH_TOOL_VERIFIED');assert.equal(r.diagnostic.source,'app-server-direct-native-read');assert.equal(r.account.payload.private_account,secret);assert.equal(r.voice.payload.voices[0].id,'synthetic-private-voice');assert.equal(r.diagnostic.tool_call_count,2);assert.equal(exactReads(f).length,2);assert.deepEqual(f.messages.filter(m=>m.method).map(m=>m.method),['initialize','initialized','thread/start','mcpServer/tool/call','mcpServer/tool/call']);const start=f.messages.find(m=>m.method==='thread/start');assert.equal(start.params.ephemeral,true);assert.equal(start.params.sandbox,'read-only');assert.equal(start.params.approvalPolicy,'never');safeFiles(f,r);
 const args=f.spawns[0].args,table=args.find(a=>a.startsWith(`apps.${HEYGEN_CONNECTOR_ID}.tools=`));assert.deepEqual([...table.matchAll(/"([^"]+)"=\{enabled=true\}/g)].map(m=>m[1]),['heygen.get_current_user','heygen.list_voices']);assert.equal(args.includes('exec'),false);
});
test('a non-ephemeral thread is refused before any catalog call',async t=>{const f=fixture(t,{thread:{id:'synthetic-catalog-thread',ephemeral:false}}),r=await runNativeSpeechRead(f.options);assert.equal(r.verified,false);assert.equal(r.account,null);assert.equal(exactReads(f).length,0);safeFiles(f,r);});
test('a failed or rate-limited account read cannot proceed to voice lookup or release account data',async t=>{
 const f=fixture(t,{response:()=>({content:[{type:'text',text:'HTTP 429 Too Many Requests '+secret}],isError:true})}),r=await runNativeSpeechRead(f.options);assert.equal(r.verified,false);assert.equal(r.diagnostic.code,'NATIVE_TOOL_RATE_LIMITED');assert.equal(r.account,null);assert.equal(r.voice,null);assert.equal(exactReads(f).length,1);safeFiles(f,r);
});
test('server interaction requests are rejected even if the original read later returns private data',async t=>{
 const f=fixture(t,{onMessage(m,{emit}){if(m.method!=='mcpServer/tool/call')return;emit({id:99,method:'mcpServer/elicitation/request',params:{message:secret}});emit({id:m.id,result:{content:[],structuredContent:{private_account:secret}}});return true;}}),r=await runNativeSpeechRead(f.options);assert.equal(r.verified,false);assert.equal(r.account,null);assert.equal(r.voice,null);assert.equal(exactReads(f).length,1);assert.equal(f.messages.find(m=>m.id===99)?.result?.action,undefined);safeFiles(f,r);
});
for(const [name,event]of [['malformed','{not-json}\n'],['null','null\n'],['EPIPE',null]])test('a '+name+' read failure never enters a model turn or speech tool',async t=>{
 const f=fixture(t,{onMessage(m,{emit,child}){if(m.method!=='initialize')return;if(name==='EPIPE')child.stdin.emit('error',Error('write EPIPE '+secret));else emit(event);return true;}}),r=await runNativeSpeechRead(f.options);assert.equal(r.verified,false);assert.equal(r.account,null);assert.equal(exactReads(f).length,0);safeFiles(f,r);
});
test('catalog deadline stops only the owned child without retrying a read',async t=>{const f=fixture(t,{stall:true,onEnd(){}}),r=await runNativeSpeechRead({...f.options,deadline_ms:Date.now()+300});assert.equal(r.verified,false);assert.equal(r.diagnostic.code,'NATIVE_SPEECH_PROCESS_DEADLINE');assert.ok(f.terminated.length>0);assert.ok(f.terminated.every(c=>c===f.child));assert.equal(f.spawns.length,1);assert.equal(exactReads(f).length,0);safeFiles(f,r);});

const receipt=f=>JSON.parse(fs.readFileSync(path.join(f.dir,'process/process-exit.json'),'utf8'));
const safeTermination={method:'taskkill-owned-tree',timeout_ms:3000,helper_close_observed:true,helper_exit_code:0,helper_signal:null,helper_error_code:null,helper_killed:false,fallback_kill_requested:false,fallback_kill_returned:null,fallback_error_code:null};

test('a normal catalog reserves ten seconds inside the original two-minute deadline and first completes graceful EOF',async t=>{
 const deadline=Date.now()+120000,f=fixture(t),r=await runNativeSpeechRead({...f.options,deadline_ms:deadline}),p=receipt(f),s=p.shutdown_facts;
 assert.equal(r.verified,true);assert.equal(p.cleanup_reserve_ms,10000);assert.equal(p.read_deadline_ms,p.deadline_ms-10000);assert.ok(p.deadline_ms<=deadline);assert.equal(f.terminated.length,0);assert.ok(s.stdin_eof_requested_at);assert.ok(s.stdin_finish_at);assert.ok(s.stdout_end_at);assert.ok(s.stderr_end_at);assert.ok(s.child_exit_at);assert.ok(s.child_close_at);assert.equal(s.child_exit_code,0);assert.equal(s.child_close_code,0);assert.equal(s.termination_requested_at,null);assert.equal(s.cleanup_confirmed,true);assert.ok(s.cleanup_deadline_ms<=p.deadline_ms);safeFiles(f,r);
});

test('an actual close beyond the old two-second cleanup window is confirmed within the same bounded attempt',async t=>{
 let terminationOptions;const started=Date.now(),f=fixture(t,{onEnd({child,close}){child.emit('exit',0,null);setTimeout(close,2250);},onTerminate(owned,options){assert.equal(owned,f.child);terminationOptions=options;return{...safeTermination,timeout_ms:options.timeout_ms};}}),r=await runNativeSpeechRead({...f.options,deadline_ms:started+7000}),p=receipt(f),s=p.shutdown_facts;
 assert.equal(r.verified,true);assert.equal(r.diagnostic.code,'NATIVE_SPEECH_TOOL_VERIFIED');assert.ok(Date.now()-started>=2200);assert.ok(Date.now()<=started+7000);assert.equal(f.terminated.length,1);assert.ok(terminationOptions.timeout_ms>1500&&terminationOptions.timeout_ms<=3000);assert.equal(s.termination.method,'taskkill-owned-tree');assert.equal(s.termination.helper_exit_code,0);assert.ok(Date.parse(s.child_close_at)-Date.parse(s.child_exit_at)>=2200);assert.equal(s.cleanup_confirmed,true);assert.equal(p.shutdown,'owned-child-stopped');assert.equal(p.result_unknown,false);assert.equal(exactReads(f).length,2);assert.equal(f.spawns.length,1);safeFiles(f,r);
});

test('an exit without close remains unknown despite two successful RPCs and a completed owned-tree terminator',async t=>{
 const started=Date.now(),f=fixture(t,{onEnd({child}){child.emit('exit',0,null);},onTerminate(){return safeTermination;}}),r=await runNativeSpeechRead({...f.options,deadline_ms:started+180}),p=receipt(f),s=p.shutdown_facts;
 assert.equal(r.verified,false);assert.equal(r.account,null);assert.equal(r.voice,null);assert.equal(r.diagnostic.code,'NATIVE_SPEECH_CLEANUP_UNCONFIRMED');assert.equal(exactReads(f).length,2);assert.equal(r.diagnostic.calls.every(c=>c.status==='completed'),true);assert.ok(s.child_exit_at);assert.equal(s.child_exit_code,0);assert.equal(s.child_close_at,null);assert.equal(s.child_close_code,null);assert.equal(s.termination.helper_close_observed,true);assert.equal(s.cleanup_confirmed,false);assert.equal(p.exit_code,null);assert.equal(p.result_unknown,true);assert.equal(p.timed_out,false);assert.equal(p.shutdown,'unconfirmed');assert.ok(Date.now()-started<1000);safeFiles(f,r);
});

test('an unresolved termination operation cannot outlive the original deadline or produce a successful cleanup',async t=>{
 const started=Date.now(),f=fixture(t,{onEnd({close}){setTimeout(close,110);},onTerminate(){return new Promise(()=>{});}}),r=await runNativeSpeechRead({...f.options,deadline_ms:started+180}),p=receipt(f),s=p.shutdown_facts;
 assert.equal(r.verified,false);assert.equal(r.diagnostic.code,'NATIVE_SPEECH_CLEANUP_UNCONFIRMED');assert.equal(r.account,null);assert.equal(r.voice,null);assert.ok(s.child_close_at);assert.ok(s.termination_requested_at);assert.equal(s.termination_finished_at,null);assert.equal(s.cleanup_confirmed,false);assert.equal(p.exit_code,0);assert.equal(p.result_unknown,true);assert.equal(p.shutdown,'unconfirmed');assert.ok(Date.now()-started<1000);safeFiles(f,r);
});

for(const kind of ['parse','scope','unexpected-rpc'])test('a '+kind+' failure received during EOF cleanup cannot be hidden by a later confirmed close',async t=>{
 const f=fixture(t,{onEnd({emit,close}){if(kind==='parse')emit('{not-json}\n');else if(kind==='scope')emit({id:999,method:'mcpServer/elicitation/request',params:{message:secret}});else emit({id:999,result:{content:[]}});close();}}),r=await runNativeSpeechRead(f.options),p=receipt(f);
 assert.equal(r.verified,false);assert.equal(r.account,null);assert.equal(r.voice,null);assert.equal(p.shutdown_facts.cleanup_confirmed,true);assert.notEqual(r.diagnostic.code,'NATIVE_SPEECH_TOOL_VERIFIED');safeFiles(f,r);
});

test('termination facts are an allowlisted projection and never persist arbitrary error or caller result content',async t=>{
 const f=fixture(t,{onEnd(){},onTerminate(owned,options,{close}){queueMicrotask(close);return{...safeTermination,helper_error_code:secret,fallback_error_code:secret,method:secret,private_account:secret,env:{SECRET:secret}};}}),r=await runNativeSpeechRead({...f.options,deadline_ms:Date.now()+300}),p=receipt(f);
 assert.equal(r.verified,true);assert.equal(p.shutdown_facts.termination.method,null);assert.equal(p.shutdown_facts.termination.helper_error_code,'NATIVE_SPEECH_SHUTDOWN_OPERATION_FAILED');assert.equal(p.shutdown_facts.termination.fallback_error_code,'NATIVE_SPEECH_SHUTDOWN_OPERATION_FAILED');safeFiles(f,r);
});

test('an owned-tree termination rejection records only a fixed error and keeps missing close unknown',async t=>{
 const f=fixture(t,{onEnd(){},onTerminate(){throw Object.assign(Error(secret),{code:secret});}}),r=await runNativeSpeechRead({...f.options,deadline_ms:Date.now()+160}),p=receipt(f);
 assert.equal(r.verified,false);assert.equal(p.shutdown_facts.termination_error_code,'NATIVE_SPEECH_SHUTDOWN_OPERATION_FAILED');assert.ok(p.shutdown_facts.termination_finished_at);assert.equal(p.shutdown_facts.cleanup_confirmed,false);assert.equal(p.result_unknown,true);safeFiles(f,r);
});

test('the existing Windows stop helper returns real exit, signal and kill facts without changing its owned PID arguments',async()=>{
 let args,options;const facts=await stopOwned({pid:2147483000,kill(){throw Error('must not fall back');}},{platform:'win32',timeout_ms:2700,spawnTerminator(command,actual,opts){assert.equal(command,'taskkill');args=actual;options=opts;const helper=Object.assign(new EventEmitter(),{killed:true});queueMicrotask(()=>helper.emit('close',128,'SIGTERM'));return helper;}});
 assert.deepEqual(args,['/PID','2147483000','/T','/F']);assert.deepEqual(options,{windowsHide:true,stdio:'ignore',timeout:2700});assert.equal(facts.method,'taskkill-owned-tree');assert.equal(facts.helper_close_observed,true);assert.equal(facts.helper_exit_code,128);assert.equal(facts.helper_signal,'SIGTERM');assert.equal(facts.helper_killed,true);assert.equal(facts.fallback_kill_requested,false);
});

test('a failed terminating-helper spawn preserves safe OS error and fallback result without leaking a raw exception',async()=>{
 let killed=0;const facts=await stopOwned({pid:2147483000,kill(){killed++;return true;}},{platform:'win32',spawnTerminator(){throw Object.assign(Error(secret),{code:'EACCES',detail:secret});}});
 assert.equal(killed,1);assert.equal(facts.helper_error_code,'EACCES');assert.equal(facts.fallback_kill_requested,true);assert.equal(facts.fallback_kill_returned,true);assert.equal(JSON.stringify(facts).includes(secret),false);
});
