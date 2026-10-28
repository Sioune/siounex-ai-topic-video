import test from 'node:test';
import assert from 'node:assert/strict';
import {isStudioDirectoryDiscovery,studioBrowserEvents} from '../scripts/heygen-studio-browser-discovery.mjs';

const digest='a'.repeat(64);
const boundaries=()=>[
 {event:'thread.started',item_id:null,item_type:null,tool:null,status:null,response_sha256:null},
 {event:'turn.started',item_id:null,item_type:null,tool:null,status:null,response_sha256:null},
];
const directory=(item_id='directory-1')=>[
 {event:'item.started',item_id,item_type:'mcp_tool_call',tool:'other',mcp_server:'codex',mcp_tool:'list_mcp_resources',status:'in_progress',response_sha256:null},
 {event:'item.completed',item_id,item_type:'mcp_tool_call',tool:'other',mcp_server:'codex',mcp_tool:'list_mcp_resources',status:'completed',response_sha256:digest},
];
const browser=(item_id='browser-1')=>[
 {event:'item.started',item_id,item_type:'mcp_tool_call',tool:'cua_repl.js',mcp_server:'cua_repl',mcp_tool:'js',status:'in_progress',response_sha256:null,api_calls:['getState']},
 {event:'item.completed',item_id,item_type:'mcp_tool_call',tool:'cua_repl.js',mcp_server:'cua_repl',mcp_tool:'js',status:'completed',response_sha256:'b'.repeat(64),api_calls:['getState']},
];
const terminal=()=>({event:'turn.completed',item_id:null,item_type:null,tool:null,status:null,response_sha256:null});
function stream(prefix=directory()) {return [...boundaries(),...prefix,...browser(),terminal()];}
function changedDirectory(change) {const rows=directory();change(rows);return stream(rows);}

test('only the exact projected Codex directory identity receives the exception',()=>{
 assert.equal(isStudioDirectoryDiscovery(directory()[0]),true);
 for(const event of [null,{},...[
  ['item_type','custom_tool_call'],['tool','codex.list_mcp_resources'],
  ['mcp_server','other'],['mcp_server','Codex'],['mcp_tool','list_mcp_resource_templates'],
  ['mcp_tool','list_mcp_resources_extra'],['mcp_tool','list_mcp'],
  ['mcp_server',null],['mcp_tool',null],
 ].map(([key,value])=>({...directory()[0],[key]:value}))])assert.equal(isStudioDirectoryDiscovery(event),false);
});

test('a complete discovery prefix is removed while all browser evidence remains intact',()=>{
 const input=stream(),before=structuredClone(input),result=studioBrowserEvents(input);
 assert.ok(result);
 assert.deepEqual(result.events,[...input.slice(0,2),...input.slice(4)]);
 assert.equal(result.discovery_count,1);
 assert.equal(result.tool_call_count,2);
 assert.equal(result.browser_tool_call_count,1);
 assert.deepEqual(input,before);
 assert.equal(result.events[2],input[4]);
 assert.equal(result.events.some(event=>isStudioDirectoryDiscovery(event)),false);
});

test('separate complete directory calls can precede the first browser call',()=>{
 const result=studioBrowserEvents(stream([...directory('directory-1'),...directory('directory-2')]));
 assert.ok(result);
 assert.equal(result.discovery_count,2);
 assert.equal(result.tool_call_count,3);
 assert.equal(result.browser_tool_call_count,1);
 assert.deepEqual(result.events,[...boundaries(),...browser(),terminal()]);
});

test('directory discovery alone never creates browser evidence',()=>{
 const input=[...boundaries(),...directory(),terminal()],result=studioBrowserEvents(input);
 assert.ok(result);
 assert.equal(result.discovery_count,1);
 assert.equal(result.tool_call_count,1);
 assert.equal(result.browser_tool_call_count,0);
 assert.deepEqual(result.events,[...boundaries(),terminal()]);
});

test('a stream without discovery preserves existing CUA validation responsibility',()=>{
 const input=[...boundaries(),...browser(),terminal()];
 input[3].status='failed';
 input[3].diagnostic='SYNTHETIC actual browser permission denied';
 input[3].failure_class='security-rejection';
 const result=studioBrowserEvents(input);
 assert.ok(result);
 assert.deepEqual(result.events,input);
 assert.equal(result.discovery_count,0);
 assert.equal(result.tool_call_count,1);
 assert.equal(result.browser_tool_call_count,1);
});

for(const [label,make] of [
 ['after the first browser call',()=>[...boundaries(),...browser(),...directory(),terminal()]],
 ['interleaved with the first browser call',()=>[...boundaries(),directory()[0],browser()[0],directory()[1],browser()[1],terminal()]],
 ['started after browser completion',()=>[...boundaries(),...browser(),...directory(),terminal()]],
])test('directory discovery is refused '+label,()=>assert.equal(studioBrowserEvents(make()),null));

for(const [label,change] of [
 ['failed completion',rows=>rows[1].status='failed'],
 ['in-progress completion',rows=>rows[1].status='in_progress'],
 ['wrong start status',rows=>rows[0].status='completed'],
 ['missing completion',rows=>rows.pop()],
 ['missing start',rows=>rows.shift()],
 ['reversed pair',rows=>rows.reverse()],
 ['updated event instead of start',rows=>rows[0].event='item.updated'],
 ['wrong terminal event',rows=>rows[1].event='item.updated'],
 ['missing response hash',rows=>delete rows[1].response_sha256],
 ['invalid response hash',rows=>rows[1].response_sha256='a'.repeat(63)],
 ['non-hex response hash',rows=>rows[1].response_sha256='g'.repeat(64)],
 ['completion diagnostic',rows=>rows[1].diagnostic='SYNTHETIC permission denied'],
 ['start diagnostic',rows=>rows[0].diagnostic='SYNTHETIC access denied'],
 ['failure classification',rows=>rows[1].failure_class='ui-result-unknown'],
 ['claimed security failure',rows=>rows[1].failure_class='security-rejection'],
 ['browser API on start',rows=>rows[0].api_calls=['getState']],
 ['browser API on completion',rows=>rows[1].api_calls=['evaluate']],
 ['malformed API metadata',rows=>rows[1].api_calls='getState'],
 ['wrong server',rows=>rows.forEach(row=>row.mcp_server='other')],
 ['wrong method',rows=>rows.forEach(row=>row.mcp_tool='list_mcp_resource_templates')],
 ['partially named method',rows=>rows.forEach(row=>row.mcp_tool='list_mcp')],
 ['null server identity',rows=>rows.forEach(row=>row.mcp_server=null)],
 ['null method identity',rows=>rows.forEach(row=>row.mcp_tool=null)],
 ['missing server identity',rows=>rows.forEach(row=>delete row.mcp_server)],
 ['missing method identity',rows=>rows.forEach(row=>delete row.mcp_tool)],
 ['identity mismatch between rows',rows=>rows[1].mcp_tool='list_mcp_resource_templates'],
 ['unknown tool',rows=>rows.forEach(row=>row.tool='other-tool')],
 ['non-MCP wrapper',rows=>rows.forEach(row=>row.item_type='custom_tool_call')],
 ['missing item id',rows=>rows.forEach(row=>delete row.item_id)],
 ['unsafe item id',rows=>rows.forEach(row=>row.item_id='directory/unsafe')],
 ['oversized item id',rows=>rows.forEach(row=>row.item_id='d'.repeat(201))],
 ['different completion id',rows=>rows[1].item_id='directory-2'],
 ['duplicate id with another pair',rows=>rows.push(...directory())],
 ['duplicate id with browser call',rows=>rows.forEach(row=>row.item_id='browser-1')],
])test('directory exception rejects '+label,()=>assert.equal(studioBrowserEvents(changedDirectory(change)),null));

test('a second unrelated tool is never hidden by a valid directory prefix',()=>{
 const input=stream();
 input.splice(4,0,{event:'item.completed',item_id:'unknown-1',item_type:'mcp_tool_call',tool:'other',mcp_server:'unknown',mcp_tool:'read',status:'completed',response_sha256:digest});
 assert.equal(studioBrowserEvents(input),null);
});

test('non-array streams are rejected without manufacturing an empty browser proof',()=>{
 for(const input of [null,undefined,{},'[]'])assert.equal(studioBrowserEvents(input),null);
 const result=studioBrowserEvents([]);
 assert.deepEqual(result,{events:[],discovery_count:0,tool_call_count:0,browser_tool_call_count:0});
});
