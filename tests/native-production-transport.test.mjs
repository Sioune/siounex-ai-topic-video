import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {createNativeProductionTransport,createExecutorTransport,executorFetch} from '../scripts/native-production-transport.mjs';

test('an unavailable pinned production CLI cannot fall back to npm or start a child',async()=>{let spawned=0;const client=createNativeProductionTransport({cwd:process.cwd()},{resolveCli:()=>{throw Object.assign(Error('NATIVE_PRODUCTION_CLI_UNAVAILABLE'),{code:'NATIVE_PRODUCTION_CLI_UNAVAILABLE'})},spawnChild:()=>{spawned++;throw Error('must not spawn')}});await assert.rejects(client.call({action:'read'}),/NATIVE_PRODUCTION_CLI_UNAVAILABLE/);assert.equal(spawned,0);await client.close();});
test('a held failed connection is replaced for independent readback without replaying its unknown mutation',async()=>{
 const requests=[],closed=[];let connections=0;
 const client=createExecutorTransport({enabled:()=>true,createTransport:()=>{const id=++connections;return{call:async body=>{requests.push({id,body});if(id===1)throw Object.assign(Error('NATIVE_PRODUCTION_RESULT_UNKNOWN'),{code:'NATIVE_PRODUCTION_RESULT_UNKNOWN'});return{status:200,body:{observed:true}};},close:async()=>closed.push(id)};}});
 const release=client.hold(),url='https://siounex-ai-topic-library.siounexzhao.chatgpt.site/api/executor';
 const post=body=>client.fetch(url,{method:'POST',redirect:'error',body:JSON.stringify(body)});
 try{await assert.rejects(post({action:'checkpoint',id:'same-original-job'}),/RESULT_UNKNOWN/);assert.equal(connections,1);assert.deepEqual(requests.map(r=>r.body.action),['checkpoint']);
 assert.deepEqual(await(await post({action:'read',id:'same-original-job'})).json(),{observed:true});assert.equal(connections,2);assert.deepEqual(requests.map(r=>r.body.action),['checkpoint','read']);assert.deepEqual(closed,[1]);
 }finally{await release();}assert.deepEqual(closed,[1,2]);
});

function fixture({lost=false,rejected=false,missing=false,rpcError=null}={}){
 const calls=[];let killed=0;
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
 child.kill=()=>{killed++;child.emit('close',0)};
 child.stdin=new Writable({write(chunk,encoding,done){
  for(const line of chunk.toString().trim().split('\n')){
   const message=JSON.parse(line);calls.push(message);if(!message.id)continue;
   let result;
   if(message.method==='initialize')result={};
   else if(message.method==='thread/start')result={thread:{id:'synthetic-ephemeral',ephemeral:true}};
   else if(message.method==='mcpServerStatus/list')result={data:[{name:'codex_apps',tools:missing?{}:{'ai.production_runtime_request':{inputSchema:{type:'object',properties:{runtime_protocol:{enum:[2]}}}}}}]};
   else if(message.method==='mcpServer/tool/call'){
    if(lost)continue;
    result=rejected?{isError:true,content:[{type:'text',text:'denied'}]}:{content:[{type:'text',text:JSON.stringify({status:409,body:{error:'本人已取消，不可重放'}})}]};
   }else result={};
   const bytes=Buffer.from(JSON.stringify(rpcError&&message.method==='mcpServer/tool/call'?{id:message.id,error:rpcError}:{id:message.id,result})+'\n');
   // Split every UTF-8 sequence as a real pipe is allowed to do.
   queueMicrotask(()=>{for(const byte of bytes)child.stdout.write(Buffer.from([byte]))});
  }done();
 }});
 return {calls,get killed(){return killed},transport:createNativeProductionTransport({cwd:process.cwd(),timeoutMs:100},{resolveCli:()=>({cli_path:"SYNTHETIC-official-native-cli"}),spawnChild:()=>child})};
}
test('native client preserves Chinese and business conflicts, calls original request once without a model turn',async()=>{
 const f=fixture();try{
  const body={action:'checkpoint',id:'job_synthetic',request_id:'same-original-request',note:'中文审核意见'};
  const r=await f.transport.call(body);assert.equal(r.status,409);assert.equal(r.body.error,'本人已取消，不可重放');
  const issued=f.calls.filter(c=>c.method==='mcpServer/tool/call');assert.equal(issued.length,1);assert.deepEqual(JSON.parse(issued[0].params.arguments.request_json),body);
  assert.equal(issued[0].params.server,'codex_apps');assert.equal(issued[0].params.tool,'ai.production_runtime_request');assert(!f.calls.some(c=>c.method.startsWith('turn/')));
 }finally{await f.transport.close()}assert.equal(f.killed,1);
});
test('unknown native result is never submitted again and closes only the owned process',async()=>{
 const f=fixture({lost:true});await assert.rejects(f.transport.call({action:'checkpoint',id:'job_synthetic'}),/RESULT_UNKNOWN/);assert.equal(f.calls.filter(c=>c.method==='mcpServer/tool/call').length,1);assert.equal(f.killed,1);await assert.rejects(f.transport.call({action:'checkpoint',id:'job_synthetic'}),/NOT_SENT/);
});
test('missing tool refreshes the official catalog once without executing a mutation',async()=>{
 const f=fixture({missing:true});await assert.rejects(f.transport.call({action:'read',id:'job_synthetic'}),/TOOL_UNAVAILABLE/);assert.equal(f.calls.filter(c=>c.method==='app/list').length,1);assert.equal(f.calls.filter(c=>c.method==='config/mcpServer/reload').length,1);assert.equal(f.calls.filter(c=>c.method==='mcpServer/tool/call').length,0);assert.equal(f.killed,1);
});
test('a rejected native action is not retried',async()=>{const f=fixture({rejected:true});await assert.rejects(f.transport.call({action:'checkpoint',id:'job_synthetic'}),/TOOL_REJECTED/);assert.equal(f.calls.filter(c=>c.method==='mcpServer/tool/call').length,1);assert.equal(f.killed,1)});
test('RPC errors retain only bounded structured diagnostics and do not replay the call',async()=>{
 const f=fixture({rpcError:{code:-32603,message:'HTTP 503: connection closed SECRET_BODY_TOKEN',data:{token:'SECRET_TOKEN'}}});
 let error;try{await f.transport.call({action:'native_preparation_read'});}catch(e){error=e;}
 assert.equal(error.code,'NATIVE_PRODUCTION_TOOL_FAILED');assert.deepEqual(error.rpc_diagnostic,{method:'mcpServer/tool/call',rpc_code:-32603,http_status:503,category:'connection',action:'native_preparation_read'});assert.doesNotMatch(JSON.stringify(error),/SECRET/);assert.equal(f.calls.filter(c=>c.method==='mcpServer/tool/call').length,1);assert.equal(f.killed,1);
});
test('a timed out read records its allowed action without exposing payload',async()=>{const f=fixture({lost:true});let e;try{await f.transport.call({action:'native_preparation_read',private_payload:'SECRET'});}catch(error){e=error;}assert.equal(e.code,'NATIVE_PRODUCTION_RESULT_UNKNOWN');assert.deepEqual(e.rpc_diagnostic,{method:'mcpServer/tool/call',category:'timeout',action:'native_preparation_read'});assert.doesNotMatch(JSON.stringify(e),/SECRET/);});
test('public research fetches keep their existing path when the normal native runtime is enabled',async()=>{
 const previous=globalThis.fetch,env=process.env.SIOUNEX_PRIVATE_PRODUCTION_MCP;let calls=0;globalThis.fetch=async(url)=>{calls++;assert.equal(url,'https://example.org/official-video');return Response.json({public:true})};process.env.SIOUNEX_PRIVATE_PRODUCTION_MCP='1';
 try{assert.equal((await (await executorFetch('https://example.org/official-video')).json()).public,true);assert.equal(calls,1)}finally{globalThis.fetch=previous;if(env===undefined)delete process.env.SIOUNEX_PRIVATE_PRODUCTION_MCP;else process.env.SIOUNEX_PRIVATE_PRODUCTION_MCP=env}
});

test('admission refusal before sending switches connection once; in-flight close is never replayed',async()=>{
 const calls=[],closed=[];let count=0;const c=createExecutorTransport({enabled:()=>true,createTransport:()=>{const id=++count;return{call:async body=>{calls.push({id,body});if(id===1)throw Object.assign(Error('NATIVE_PRODUCTION_NOT_SENT'),{code:'NATIVE_PRODUCTION_NOT_SENT'});return {status:200,body:{ok:true}}},close:async()=>closed.push(id)}}});
 const release=c.hold(),url='https://siounex-ai-topic-library.siounexzhao.chatgpt.site/api/executor',body={action:'site_archive_start',id:'one'};try{const r=await c.fetch(url,{method:'POST',redirect:'error',body:JSON.stringify(body)});assert.deepEqual(await r.json(),{ok:true});assert.deepEqual(calls.map(x=>x.id),[1,2]);}finally{await release();}
 let attempts=0;const d=createExecutorTransport({enabled:()=>true,createTransport:()=>({call:async()=>{attempts++;throw Object.assign(Error('NATIVE_PRODUCTION_CLOSED'),{code:'NATIVE_PRODUCTION_CLOSED'})},close:async()=>{}})});const release2=d.hold();try{await assert.rejects(d.fetch(url,{method:'POST',redirect:'error',body:JSON.stringify(body)}),/CLOSED/);assert.equal(attempts,1)}finally{await release2();}
});
