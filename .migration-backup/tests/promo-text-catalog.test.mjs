// Synthetic JSON-RPC stdio only. Never starts a CLI, model or real MCP server.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {preparePromoTextRuntime} from '../scripts/promo-text-catalog.mjs';
import {PROMO_TEXT_CONFIG} from '../scripts/promo-text-child.mjs';

const server=(name,runtimeStatus='connected',tools={synthetic_tool:{name:'synthetic_tool'}})=>({name,runtimeStatus,tools});
function fixture(cases=[{},{}]){
 const calls=[],children=[],requests=[],rejections=[];let phase=0;
 function spawnChild(command,args,options){
  const index=phase++,config=cases[index]||{},child=new EventEmitter();child.pid=10000+index;child.stdout=new PassThrough();child.stderr=new PassThrough();child.closed=false;child.unref=()=>{};child.kill=()=>close(0);calls.push({command,args,options});children.push(child);let input='';
  const close=code=>{if(child.closed)return;child.closed=true;child.stdout.end();child.stderr.end();queueMicrotask(()=>child.emit('close',code));};child.close=close;
  function emit(value){const bytes=Buffer.from(JSON.stringify(value)+'\n');if(config.split){for(let i=0;i<bytes.length;i+=3)child.stdout.write(bytes.subarray(i,i+3));}else child.stdout.write(bytes);}
  function receive(value){
   requests.push({phase:index,...value});if(Object.hasOwn(value,'error')){rejections.push(value);return;}if(!Object.hasOwn(value,'id'))return;
   if(config.onRequest){const handled=config.onRequest({value,child,emit,index});if(handled)return;}
   if(config.rpcError===value.method){emit({id:value.id,error:{code:-32000,message:'SYNTHETIC private diagnostic must not escape'}});return;}
   if(config.serverRequest===value.method){emit({id:'SYNTHETIC-request',method:'item/commandExecution/requestApproval',params:{secret:'SYNTHETIC hidden'}});return;}
   if(config.invalidJson===value.method){child.stdout.write('{invalid}\n');return;}
   if(config.invalidUtf8===value.method){child.stdout.write(Buffer.from([0xc3,0x28,0x0a]));return;}
   if(config.overflow===value.method){child.stdout.write(Buffer.alloc(16000001,0x20));return;}
   if(config.earlyClose===value.method){close(0);return;}
   if(config.noResponse===value.method)return;
   if(value.method==='initialize'){if(config.stderr)child.stderr.write('SYNTHETIC discarded credentials '+config.stderr);emit({id:value.id,result:{userAgent:'SYNTHETIC 测试'}});return;}
   if(value.method==='thread/start'){emit({id:value.id,result:{thread:{id:'SYNTHETIC-thread-'+index,ephemeral:config.ephemeral!==false}}});return;}
   if(value.method==='mcpServerStatus/list'){
    const pages=config.pages||[{data:config.servers||[server('dynamic_new_server')],nextCursor:null}],page=value.params.cursor?pages[Number(value.params.cursor)]:pages[0];emit({id:value.id,result:page});
    if(config.tail)child.stdout.write(config.tail);if(config.notification)emit({method:config.notification,params:{}});return;
   }
   throw Error('SYNTHETIC unexpected RPC '+value.method);
  }
  child.stdin=new Writable({write(chunk,encoding,done){input+=chunk.toString();let at;while((at=input.indexOf('\n'))>=0){const line=input.slice(0,at);input=input.slice(at+1);if(line.trim()){const value=JSON.parse(line);queueMicrotask(()=>receive(value));}}done();},final(done){if(!config.stayOpen)close(config.exitCode??0);done();}});
  return child;
 }
 const run=extra=>preparePromoTextRuntime({cli:'SYNTHETIC-codex.js',cwd:'SYNTHETIC-cwd',spawnChild,terminate:async child=>{child.terminated=true;child.close(0);},...extra});
 return{calls,children,requests,rejections,run};
}

test('observed unknown MCP names are disabled dynamically and a second metadata catalog proves zero tools',async()=>{
 const f=fixture([{servers:[server('unknown_z-2030'),server('another_server')]},{servers:[server('unknown_z-2030','disabled',{}),server('another_server','disabled',{})]}]),r=await f.run();
 assert.equal(r.schema,'promo-pure-text-runtime-v1');assert.deepEqual(r.configs,[...PROMO_TEXT_CONFIG,'mcp_servers.another_server.enabled=false','mcp_servers.unknown_z-2030.enabled=false']);assert.deepEqual(r.disabled_servers,['another_server','unknown_z-2030']);assert.equal(r.catalog_verified,true);assert.equal(r.tool_count,0);assert.equal(r.model_turns,0);assert.equal(r.global_config_modified,false);assert.equal(f.calls.length,2);assert.ok(f.children.every(c=>c.closed));
 for(let n=0;n<2;n++){
  assert.deepEqual(f.requests.filter(q=>q.phase===n).map(q=>q.method),['initialize','initialized','thread/start','mcpServerStatus/list']);
  const thread=f.requests.find(q=>q.phase===n&&q.method==='thread/start');assert.deepEqual(thread.params,{cwd:'SYNTHETIC-cwd',ephemeral:true,approvalPolicy:'never',sandbox:'read-only',model:'gpt-5.6-sol'});
  assert.deepEqual(f.calls[n].args,['SYNTHETIC-codex.js','app-server',...(n?r.configs:PROMO_TEXT_CONFIG).flatMap(v=>['--config',v]),'--listen','stdio://']);assert.equal(f.calls[n].options.windowsHide,true);
 }
 assert.equal(f.requests.some(q=>/turn\/|tool\/call|config\/.*write/.test(q.method)),false);
});

test('empty verified catalog is accepted without inventing any server name',async()=>{
 const f=fixture([{servers:[server('only_observed')]},{servers:[]}]),r=await f.run();assert.deepEqual(r.disabled_servers,['only_observed']);assert.equal(r.configs.some(v=>v.includes('directsdk')),false);
 const empty=fixture([{servers:[]},{servers:[]}]);assert.deepEqual((await empty.run()).configs,[...PROMO_TEXT_CONFIG]);
});

test('chunked UTF-8, metadata notifications and counted-only stderr do not change the proof',async()=>{
 const f=fixture([{servers:[server('safe')],split:true,stderr:'SYNTHETIC-secret',notification:'mcpServer/startupStatus/updated'},{servers:[server('safe','disabled',{})],split:true}]),r=await f.run();assert.equal(r.catalog_verified,true);assert.equal(JSON.stringify(r).includes('SYNTHETIC-secret'),false);
});

test('both catalogs are fully paginated before acceptance',async()=>{
 const f=fixture([{pages:[{data:[server('one')],nextCursor:'1'},{data:[server('two')],nextCursor:null}]},{pages:[{data:[server('one','disabled',{})],nextCursor:'1'},{data:[server('two','disabled',{})],nextCursor:null}]}]),r=await f.run();assert.deepEqual(r.disabled_servers,['one','two']);assert.equal(f.requests.filter(q=>q.method==='mcpServerStatus/list').length,4);
});

test('actual pluginId selects the official plugin scope instead of inventing a root transport',async()=>{
 const plugin={...server('bundled_server'),pluginId:'observed-plugin@observed-market'},root={...server('root_server'),pluginId:null},f=fixture([{servers:[plugin,root]},{servers:[{...plugin,runtimeStatus:'disabled',tools:{}},{...root,runtimeStatus:'disabled',tools:{}}]}]),r=await f.run();
 assert.ok(r.configs.includes('plugins."observed-plugin@observed-market".mcp_servers.bundled_server.enabled=false'));assert.ok(r.configs.includes('mcp_servers.root_server.enabled=false'));assert.equal(r.configs.includes('mcp_servers.bundled_server.enabled=false'),false);
});
test('a still-connected observed plugin gets one child-only disable and a third independent catalog check',async()=>{
 const plugin={...server('bundled'),pluginId:'observed-plugin@market'},f=fixture([{servers:[plugin]},{servers:[plugin]},{servers:[]}]),r=await f.run();assert.equal(f.calls.length,3);assert.ok(r.configs.includes('plugins."observed-plugin@market".enabled=false'));assert.ok(r.configs.includes('plugins."observed-plugin@market".mcp_servers.bundled.enabled=false'));assert.deepEqual(r.disabled_servers,['bundled']);assert.equal(r.catalog_verified,true);
});
test('a new or changed plugin in the second catalog never receives a guessed disable',async()=>{
 for(const second of [[{...server('new'),pluginId:'new@market'}],[{...server('bundled'),pluginId:'changed@market'}]]){const f=fixture([{servers:[{...server('bundled'),pluginId:'original@market'}]},{servers:second}]);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_NOT_DISABLED'});assert.equal(f.calls.length,2);}
});
test('an observed plugin which remains connected after every supported restriction is rejected',async()=>{
 const plugin={...server('bundled'),pluginId:'observed@market'},f=fixture([{servers:[plugin]},{servers:[plugin]},{servers:[plugin]}]);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_NOT_DISABLED'});assert.equal(f.calls.length,3);assert.equal(f.calls.some(c=>c.args.includes('mcp_servers.bundled.enabled=false')),false);
});
for(const pluginId of ['../bad','x/y','x\\y','x".enabled=true','x\nother','',42,'a'.repeat(201)])test('plugin IDs cannot escape their quoted config key: '+JSON.stringify(pluginId),async()=>{
 const f=fixture([{servers:[{...server('safe'),pluginId}]}]);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_PLUGIN_ID_INVALID'});assert.equal(f.calls.length,1);
});

for(const status of ['connected','notStarted','starting','authenticationRequired','failed','cancelled'])test('second catalog must say disabled, not '+status,async()=>{
 const f=fixture([{servers:[server('same')]},{servers:[server('same',status,{})]}]);await assert.rejects(f.run, {code:'PROMO_TEXT_CATALOG_NOT_DISABLED'});assert.ok(f.children.every(c=>c.closed));
});
test('disabled with retained tools or a newly active server fails closed',async()=>{
 for(const second of [[server('same','disabled')],[server('same','disabled',{}),server('new_after_baseline')]]){const f=fixture([{servers:[server('same')]},{servers:second}]);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_NOT_DISABLED'});}
});

for(const phase of [0,1])for(const method of ['initialize','thread/start','mcpServerStatus/list'])test('RPC failure rejects phase '+phase+' '+method,async()=>{
 const cases=[{servers:[server('safe')]},{servers:[server('safe','disabled',{})]}];cases[phase].rpcError=method;const f=fixture(cases);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_RPC_FAILED'});assert.equal(f.calls.length,phase+1);assert.ok(f.children.every(c=>c.closed));
});

for(const phase of [0,1])test('an ephemeral false thread blocks metadata phase '+phase,async()=>{
 const cases=[{servers:[server('safe')]},{servers:[server('safe','disabled',{})]}];cases[phase].ephemeral=false;const f=fixture(cases);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_EPHEMERAL_REQUIRED'});assert.equal(f.requests.some(q=>q.phase===phase&&q.method==='mcpServerStatus/list'),false);
});

for(const phase of [0,1])for(const method of ['initialize','thread/start','mcpServerStatus/list'])test('server requests are denied at every RPC: phase '+phase+' '+method,async()=>{
 const cases=[{servers:[server('safe')]},{servers:[server('safe','disabled',{})]}];cases[phase].serverRequest=method;const f=fixture(cases);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_SERVER_REQUEST_REJECTED'});assert.equal(f.rejections.length,1);assert.equal(f.rejections[0].error.code,-32601);assert.equal(f.calls.length,phase+1);
});

for(const name of ['has.dot','../path','C:/path','x/y','x\\y','x.enabled=false','x\nother','', 'a'.repeat(101),42,null])test('server IDs cannot inject a config path: '+JSON.stringify(name),async()=>{
 const f=fixture([{servers:[server(name)]}]);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_SERVER_ID_INVALID'});assert.equal(f.calls.length,1);
});

for(const mode of ['invalidJson','invalidUtf8','overflow','earlyClose'])test('stdout protocol failure is closed: '+mode,async()=>{
 const f=fixture([{[mode]:'mcpServerStatus/list'}]);await assert.rejects(f.run,{code:{invalidJson:'PROMO_TEXT_CATALOG_JSON_INVALID',invalidUtf8:'PROMO_TEXT_CATALOG_JSON_INVALID',overflow:'PROMO_TEXT_CATALOG_OUTPUT_OVERFLOW',earlyClose:'PROMO_TEXT_CATALOG_CHILD_CLOSED'}[mode]});assert.equal(f.calls.length,1);
});

test('non-newline EOF is rejected even after a valid final RPC',async()=>{
 const f=fixture([{servers:[server('safe')],tail:'{"id":100,"result":{}}'}]);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_EOF_INVALID'});assert.equal(f.calls.length,1);
});
test('unexpected inference notification is rejected without starting a model',async()=>{
 const f=fixture([{servers:[server('safe')],notification:'turn/started'}]);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_UNEXPECTED_ACTIVITY'});assert.equal(f.requests.some(q=>q.method==='turn/start'),false);
});
test('an unsolicited MCP tool notification is rejected rather than mistaken for metadata',async()=>{
 const f=fixture([{servers:[server('safe')],notification:'mcpServer/tool/call'}]);await assert.rejects(f.run,{code:'PROMO_TEXT_CATALOG_UNEXPECTED_ACTIVITY'});assert.equal(f.requests.some(q=>q.method==='mcpServer/tool/call'),false);
});
test('unexpected responses, malformed payloads and duplicate names never yield a runtime proof',async()=>{
 const cases=[
  {onRequest:({value,emit})=>{emit({id:999,result:{}});return true;}},
  {onRequest:({value,emit})=>{emit({id:value.id});return true;}},
  {onRequest:({value,emit})=>{emit({id:value.id,result:null});return true;}},
  {servers:[server('dup'),server('dup')]},
  {servers:[{name:'safe',runtimeStatus:'disabled',tools:null}]},
  {servers:[server('safe','unknown-status',{})]},
  {pages:[{data:[],nextCursor:123}]},
  {pages:[{data:[],nextCursor:'1'},{data:[],nextCursor:'1'}]}
 ];
 for(const config of cases){const f=fixture([config]);await assert.rejects(f.run,/^Error: PROMO_TEXT_CATALOG_/);assert.equal(f.calls.length,1);}
});
test('deadline, startup errors and nonzero close cannot admit another child',async()=>{
 const timeout=fixture([{noResponse:'initialize'}]);await assert.rejects(()=>timeout.run({deadline_ms:Date.now()+10}),{code:'PROMO_TEXT_CATALOG_DEADLINE'});assert.equal(timeout.calls.length,1);
 const failed=fixture([{exitCode:1}]);await assert.rejects(failed.run,{code:'PROMO_TEXT_CATALOG_STOP_UNCONFIRMED'});assert.equal(failed.calls.length,1);
 await assert.rejects(()=>preparePromoTextRuntime({cli:'synthetic',spawnChild:()=>{throw Error('SYNTHETIC private error');}}),{code:'PROMO_TEXT_CATALOG_FAILED'});
});
test('failed verification exposes only safe metadata and a fixed missing-field category',async()=>{
 const f=fixture([{servers:[{...server('bundled'),pluginId:'actual-plugin@actual-market'}]},{onRequest:({child})=>{child.stderr.write('SYNTHETIC token=PRIVATE missing field `command` in config');child.close(1);return true;}}]);
 await assert.rejects(f.run,error=>{assert.equal(error.catalog_phase,'verify');assert.deepEqual(error.discovered_servers,[{name:'bundled',plugin_id:'actual-plugin@actual-market',runtime_status:'connected',tool_count:1}]);assert.equal(error.catalog_diagnostic.stderr_category,'CONFIG_MISSING_FIELD');assert.equal(error.catalog_diagnostic.missing_field,'command');assert.equal(JSON.stringify(error).includes('PRIVATE'),false);return true;});
});
test('only the spawned child is terminated when it will not close naturally',async()=>{
 const f=fixture([{servers:[server('safe')],stayOpen:true},{servers:[server('safe','disabled',{})]}]);const r=await f.run();assert.equal(r.catalog_verified,true);assert.equal(f.children[0].terminated,true);assert.equal(f.children[1].terminated,undefined);assert.ok(f.children.every(c=>c.closed));
});
test('invalid admission arguments never spawn',async()=>{
 const f=fixture();for(const patch of [{cli:''},{cwd:''},{deadline_ms:NaN},{deadline_ms:Date.now()-1},{deadline_ms:Date.now()+120000}])await assert.rejects(()=>f.run(patch),{code:'PROMO_TEXT_CATALOG_ARGUMENTS_INVALID'});assert.equal(f.calls.length,0);
});
