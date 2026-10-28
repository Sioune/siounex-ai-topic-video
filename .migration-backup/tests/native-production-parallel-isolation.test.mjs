import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {createExecutorTransport,createNativeProductionTransport} from '../scripts/native-production-transport.mjs';
const url='https://siounex-ai-topic-library.siounexzhao.chatgpt.site/api/executor',deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const post=(client,body)=>client.fetch(url,{method:'POST',redirect:'error',body:JSON.stringify(body)});
test('a failed workstation retires admission without closing a parallel in-flight success or replaying either request',async()=>{
 const requests=[],closed=[],failed=deferred(),other=deferred();let created=0;
 const client=createExecutorTransport({enabled:()=>true,createTransport:()=>{const id=++created;return{call(body){requests.push({id,action:body.action});if(id===1)return body.action==='checkpoint'?failed.promise:other.promise;return Promise.resolve({status:200,body:{independent_read:true}})},close(){closed.push(id);if(id===1)other.reject(Error('closed sibling'))}}}});
 const release=client.hold(),first=post(client,{action:'checkpoint',id:'original-a'}),sibling=post(client,{action:'read',id:'original-b'}).then(x=>x.json(),error=>({error:error.message}));
 try{
  failed.reject(Error('NATIVE_PRODUCTION_RESULT_UNKNOWN'));await assert.rejects(first,/RESULT_UNKNOWN/);assert.deepEqual(closed,[]);
  assert.deepEqual(await(await post(client,{action:'read',id:'original-a'})).json(),{independent_read:true});assert.equal(created,2);
  other.resolve({status:200,body:{sibling_completed:true}});assert.deepEqual(await sibling,{sibling_completed:true});
  assert.deepEqual(closed,[1]);assert.deepEqual(requests,[{id:1,action:'checkpoint'},{id:1,action:'read'},{id:2,action:'read'}]);
 }finally{other.resolve({status:200,body:{}});await release()}assert.deepEqual(closed,[1,2]);
});
test('explicit flow shutdown drains admitted requests and closes each connection once',async()=>{
 const first=deferred(),second=deferred(),calls=[],closed=[];
 const client=createExecutorTransport({enabled:()=>true,createTransport:()=>({call(body){calls.push(body.action);return body.action==='read'?first.promise:second.promise},close(){closed.push(true)}})});
 const a=post(client,{action:'read'}),b=post(client,{action:'checkpoint'});let finished=false;const closing=client.close().then(()=>{finished=true});
 await Promise.resolve();assert.equal(finished,false);assert.equal(closed.length,0);
 first.resolve({status:200,body:{first:true}});assert.equal((await a).status,200);assert.equal(closed.length,0);
 second.resolve({status:409,body:{code:'ORIGINAL_CONFLICT'}});assert.equal((await b).status,409);await closing;
 assert.equal(finished,true);assert.equal(closed.length,1);assert.deepEqual(calls,['read','checkpoint']);
});
function rpcPair(){
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();let killed=0;const tools=[],ready=deferred();
 child.kill=()=>{killed++;child.emit('close',0)};
 const emit=value=>queueMicrotask(()=>child.stdout.write(JSON.stringify(value)+'\n'));
 child.stdin=new Writable({write(chunk,_encoding,done){
  for(const line of chunk.toString().trim().split('\n')){const m=JSON.parse(line);if(!m.id)continue;
   if(m.method==='mcpServer/tool/call'){tools.push(m);if(tools.length===2)ready.resolve();continue}
   const result=m.method==='thread/start'?{thread:{id:'synthetic-isolation',ephemeral:true}}:m.method==='mcpServerStatus/list'?{data:[{name:'codex_apps',tools:{'ai.production_runtime_request':{inputSchema:{properties:{runtime_protocol:{enum:[2]}}}}}}]}:{};
   emit({id:m.id,result});
  }done();
 }});
 return{tools,ready:ready.promise,emit,get killed(){return killed},transport:createNativeProductionTransport({cwd:process.cwd(),timeoutMs:1000},{resolveCli:()=>({cli_path:"SYNTHETIC-official-native-cli"}),spawnChild:()=>child})};
}
test('a request-scoped JSON-RPC error leaves another response deliverable before the owned child closes',async()=>{
 const f=rpcPair(),a=f.transport.call({action:'checkpoint',id:'original-a'}),b=f.transport.call({action:'read',id:'original-b'}).then(x=>x,error=>({failure:error.code}));
 try{
  await f.ready;f.emit({id:f.tools[0].id,error:{code:-32001,message:'synthetic request failure'}});
  await assert.rejects(a,/NATIVE_PRODUCTION_TOOL_FAILED/);assert.equal(f.killed,0);
  await assert.rejects(f.transport.call({action:'checkpoint',id:'original-a'}),/CLOSED/);
  f.emit({id:f.tools[1].id,result:{content:[{type:'text',text:JSON.stringify({status:200,body:{same_inflight_read:true}})}]}});
  assert.deepEqual(await b,{status:200,body:{same_inflight_read:true}});assert.equal(f.killed,1);
  assert.equal(f.tools.length,2);assert.deepEqual(f.tools.map(x=>JSON.parse(x.params.arguments.request_json).action),['checkpoint','read']);
 }finally{await f.transport.close()}
});
