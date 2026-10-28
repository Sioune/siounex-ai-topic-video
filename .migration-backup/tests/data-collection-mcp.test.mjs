import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCollectionMcp} from '../lib/data-collection-mcp.mts';
const request=(method,args={},owner='owner-A')=>new Request('https://studio.example/mcp',{method:'POST',headers:{'content-type':'application/json',...(owner?{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':'owner@example.com'}:{})},body:JSON.stringify({jsonrpc:'2.0',id:7,method,params:args})});
const decode=async response=>(await response.json());
test('only the explicit private V6 staging tool admits bounded media chunks; other controls retain32KiB and caller identity remains mandatory',async()=>{
 let calls=0;const deps={readDue:async()=>({}),markGenerated:async()=>({}),extraTools:[{name:'stage_v6_outro_parts'}],callExtra:async(owner,name,args)=>{calls++;assert.equal(owner,'owner-A');assert.equal(name,'stage_v6_outro_parts');return{accepted_bytes:args.parts[0].chunk_base64.length}}},parts=[{part:0,chunk_base64:'A'.repeat(349528)}];
 const accepted=await handleCollectionMcp(request('tools/call',{name:'stage_v6_outro_parts',arguments:{job_id:'SYNTHETIC',parts}}),deps);assert.equal(accepted.status,200);assert.equal(calls,1);
 assert.equal((await handleCollectionMcp(request('tools/call',{name:'stage_v6_outro_parts',arguments:{job_id:'SYNTHETIC',parts}},null),deps)).status,401);
 assert.equal((await handleCollectionMcp(request('tools/call',{name:'read_due_collection_reminders',arguments:{padding:'A'.repeat(40000)}}),deps)).status,400);
 assert.equal((await handleCollectionMcp(request('tools/call',{name:'stage_v6_outro_parts',arguments:{padding:'A'.repeat(1500001)}}),deps)).status,400);assert.equal(calls,1);
});
test('discovery exposes stateless tools without private data',async()=>{
 const deps={readDue:()=>{throw Error('must not read');},markGenerated:()=>{throw Error('must not write');}};
 const discovery=await decode(await handleCollectionMcp(request('server/discover',{},null),deps));
 assert.deepEqual(discovery.result.supportedVersions,['2026-07-28']);
 const list=await decode(await handleCollectionMcp(request('tools/list',{},null),deps));
 assert.equal(list.result.tools.length,2);assert.equal(list.result.tools[0].annotations.readOnlyHint,true);
});
test('private tool calls require forwarded identity and reject owner argument injection',async()=>{
 let reads=0;
 const deps={readDue:async()=>{reads++;return {reminders:[]};},markGenerated:async()=>({})};
 assert.equal((await handleCollectionMcp(request('tools/call',{name:'read_due_collection_reminders'},null),deps)).status,401);
 const injected=await decode(await handleCollectionMcp(request('tools/call',{name:'read_due_collection_reminders',arguments:{owner:'owner-B'}}),deps));
 assert.equal(injected.error.code,-32602);assert.equal(reads,0);
});
test('due read uses authenticated owner and returns direct phone URL without claiming notification delivery',async()=>{
 let owner;
 const deps={readDue:async value=>{owner=value;return {reminders:[{id:'r1',upload_url:'/data/upload?collection=c1'}]};},markGenerated:async()=>({})};
 const result=await decode(await handleCollectionMcp(request('tools/call',{name:'read_due_collection_reminders'}),deps));
 const value=JSON.parse(result.result.content[0].text);
 assert.equal(owner,'owner-A');assert.equal(value.reminders[0].upload_url,'https://studio.example/data/upload?collection=c1');assert.equal(value.notification_delivery,'not_asserted');
});
test('generation write validates input, passes authenticated owner, and preserves domain failure',async()=>{
 const calls=[];const deps={readDue:async()=>({reminders:[]}),markGenerated:async(...args)=>{calls.push(args);return {notification_delivery:'not_asserted'};}};
 const bad=await decode(await handleCollectionMcp(request('tools/call',{name:'mark_collection_reminders_generated',arguments:{owner:'B',reminder_ids:['r1'],request_id:'once'}}),deps));
 assert.equal(bad.error.code,-32602);assert.equal(calls.length,0);
 await handleCollectionMcp(request('tools/call',{name:'mark_collection_reminders_generated',arguments:{reminder_ids:['r1'],request_id:'once'}}),deps);
 assert.equal(calls[0][0],'owner-A');assert.deepEqual(calls[0][1],{reminder_ids:['r1'],request_id:'once'});
 deps.markGenerated=async()=>{throw Object.assign(new Error('提醒尚未到期'),{status:409});};
 const failed=await decode(await handleCollectionMcp(request('tools/call',{name:'mark_collection_reminders_generated',arguments:{reminder_ids:['r1'],request_id:'once'}}),deps));
 assert.equal(failed.result.isError,true);assert.equal(failed.result.content[0].text,'提醒尚未到期');
});
test('oversize body is rejected before any data operation',async()=>{
 const req=new Request('https://studio.example/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(33000)});
 const response=await handleCollectionMcp(req,{readDue:async()=>assert.fail(),markGenerated:async()=>assert.fail()});
 assert.equal(response.status,400);
});
test('cross-site browser requests and form submissions cannot invoke reminder tools',async()=>{
 const deps={readDue:async()=>assert.fail(),markGenerated:async()=>assert.fail()};
 const cross=request('tools/call',{name:'read_due_collection_reminders'});cross.headers.set('origin','https://other.example');
 assert.equal((await handleCollectionMcp(cross,deps)).status,403);
 const form=new Request('https://studio.example/mcp',{method:'POST',headers:{'content-type':'text/plain'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read_due_collection_reminders'}})});
 assert.equal((await handleCollectionMcp(form,deps)).status,415);
});
