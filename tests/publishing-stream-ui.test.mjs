// Synthetic response chunks only. No platform or production writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React,{act} from 'react';
const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=createRequire(process.env.TOPIC_TEST_PACKAGE||new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://synthetic.test/publishing',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','Element','Node','Event','MouseEvent','MutationObserver','DocumentFragment'])globalThis[key]=dom.window[key];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const built=await build({entryPoints:['components/publishing-center.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false}),module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);const Component=module.exports.default;
const dashboard={plan:{enabled:true},connections:[],accounts:[],summary:{ready:3},reserve_queue:[],slots:[],next_slots:[],publications:[],collections:[],policy:{slot_grace_minutes:5}};
test('a saved preparation is shown immediately even if dashboard refresh never completes',async t=>{
 document.body.innerHTML='<div id="root"></div>';const old=globalThis.fetch,at=new Date(Date.now()+3600000).toISOString(),full={...dashboard,preparation:{preparation:null,work:[]},readiness:{scheduled_at:at,ready_by_at:at,phase:'not_prepared',inventory_count:1,total_ready:0,browser_ready:0,requires_attention:false,platforms:[]},native_receipts:[],engagement:[]},saved={preparation:{id:'saved',scheduled_at:at,package_id:'package',job_id:'job',release_id:'release',title:'成功保存的原任务',state:'preparing'},package:{id:'package'},work:[{id:'work',preparation_id:'saved',platform:'douyin',transport:'browser',state:'queued',phase:'waiting_executor'}]};let writes=0;
 globalThis.fetch=async(_url,options={})=>{if(options.method==='POST'){writes++;return Response.json(saved);}if(_url.includes('view=stream'))return Response.json(full);return new Promise(()=>{});};
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=old;});await act(async()=>{root.render(React.createElement(Component));await new Promise(resolve=>setTimeout(resolve,0));});
 await act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.includes('准备下一场')).click();await new Promise(resolve=>setTimeout(resolve,0));});
 assert.equal(writes,1);assert.match(document.body.textContent,/准备任务已保存/);assert.match(document.body.textContent,/成功保存的原任务/);assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent.includes('准备下一场')).disabled,false);
});
test('early core is visible and editable while details load; later data preserves an unsaved choice',async t=>{
 document.body.innerHTML='<div id="root"></div>';const old=globalThis.fetch,encoder=new TextEncoder();let controller;let writes=0;
 const body=new ReadableStream({start(c){controller=c;}});globalThis.fetch=async(_url,options={})=>{if(options.method==='POST')writes++;return new Response(body,{headers:{'Content-Type':'application/x-ndjson'}})};
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=old;});await act(async()=>root.render(React.createElement(Component)));
 await act(async()=>{controller.enqueue(encoder.encode(JSON.stringify({type:'core',dashboard})+'\n'));await new Promise(resolve=>setTimeout(resolve,0));});
 assert.match(document.body.textContent,/计划和储备已读取/);assert.match(document.querySelector('[aria-label="发布运行概况"]').textContent,/3/);assert.equal(document.querySelector('input[type="checkbox"]').disabled,false);assert.equal(document.querySelector('[aria-labelledby="publishing-preparation-title"]'),null);assert.equal(document.querySelector('[aria-labelledby="publishing-posts-title"]'),null);assert.equal(writes,0);
 await act(async()=>document.querySelector('input[type="checkbox"]').click());assert.equal(document.querySelector('input[type="checkbox"]').checked,false);
 await act(async()=>{controller.enqueue(encoder.encode(JSON.stringify({type:'operational',dashboard:{...dashboard,preparation:{preparation:null}}})+'\n'));await new Promise(resolve=>setTimeout(resolve,0));});assert.equal(document.querySelector('[aria-labelledby="publishing-preparation-title"]'),null);
 const now=Date.now(),scheduled=new Date(now-1000).toISOString(),operational={...dashboard,preparation:{preparation:{id:'p',scheduled_at:scheduled,package_id:'pkg',job_id:'job',title:'已准备的作品',release_id:'r',state:'prepared',submission_window:{start:scheduled,end:new Date(now+300000).toISOString()}},work:['douyin','bilibili','kuaishou'].map(platform=>({id:platform,preparation_id:'p',platform,transport:'browser',state:'prepared',phase:'draft_saved'}))},readiness:{scheduled_at:scheduled,ready_by_at:scheduled,phase:'ready',inventory_count:1,total_ready:3,browser_ready:3,requires_attention:false,platforms:[]},native_receipts:[],engagement:[]};
 await act(async()=>{controller.enqueue(encoder.encode(JSON.stringify({type:'operational',dashboard:operational})+'\n'));await new Promise(resolve=>setTimeout(resolve,0));});
 assert.match(document.body.textContent,/发布准备已读取/);const publish=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('发表当期已准备作品'));assert.ok(publish);assert.equal(publish.disabled,false);assert.equal(document.querySelector('[aria-labelledby="publishing-posts-title"]'),null);assert.equal(writes,0);
 await act(async()=>{controller.enqueue(encoder.encode(JSON.stringify({type:'complete',dashboard})+'\n'));controller.close();await new Promise(resolve=>setTimeout(resolve,0));});
 assert.doesNotMatch(document.body.textContent,/计划和储备已读取/);assert.equal(document.querySelector('input[type="checkbox"]').checked,false);assert.ok(document.querySelector('[aria-labelledby="publishing-preparation-title"]'));assert.ok(document.querySelector('[aria-labelledby="publishing-posts-title"]'));assert.equal(writes,0);
});
test('a later details failure keeps core available and never invents preparation status',async t=>{
 document.body.innerHTML='<div id="root"></div>';const old=globalThis.fetch,encoder=new TextEncoder();let controller;const body=new ReadableStream({start(c){controller=c;}});globalThis.fetch=async()=>new Response(body,{headers:{'Content-Type':'application/x-ndjson'}});
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=old;});await act(async()=>root.render(React.createElement(Component)));
 await act(async()=>{controller.enqueue(encoder.encode(JSON.stringify({type:'core',dashboard})+'\n'+JSON.stringify({type:'error',error:'详细回执暂不可用'})+'\n'));controller.close();await new Promise(resolve=>setTimeout(resolve,0));});
 assert.match(document.body.textContent,/详细回执暂不可用/);assert.match(document.querySelector('[aria-label="发布运行概况"]').textContent,/3/);assert.equal(document.querySelector('input[type="checkbox"]').disabled,false);assert.equal(document.querySelector('[aria-labelledby="publishing-preparation-title"]'),null);assert.equal(document.querySelector('[aria-labelledby="publishing-posts-title"]'),null);
});
test('operational data remains usable if unrelated history later fails',async t=>{
 document.body.innerHTML='<div id="root"></div>';const old=globalThis.fetch,encoder=new TextEncoder();let controller;const body=new ReadableStream({start(c){controller=c;}});globalThis.fetch=async()=>new Response(body,{headers:{'Content-Type':'application/x-ndjson'}});
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=old;});await act(async()=>root.render(React.createElement(Component)));
 const now=Date.now(),scheduled=new Date(now-1000).toISOString(),operational={...dashboard,preparation:{preparation:{id:'p',scheduled_at:scheduled,package_id:'pkg',job_id:'job',title:'已准备的作品',release_id:'r',state:'prepared',submission_window:{start:scheduled,end:new Date(now+300000).toISOString()}},work:[{id:'d',preparation_id:'p',platform:'douyin',transport:'browser',state:'prepared',phase:'draft_saved'}]},readiness:{scheduled_at:scheduled,ready_by_at:scheduled,phase:'ready',inventory_count:1,total_ready:1,browser_ready:1,requires_attention:false,platforms:[]},native_receipts:[],engagement:[]};
 await act(async()=>{controller.enqueue(encoder.encode([JSON.stringify({type:'core',dashboard}),JSON.stringify({type:'operational',dashboard:operational}),JSON.stringify({type:'error',error:'历史回执暂不可用'})].join('\n')+'\n'));controller.close();await new Promise(resolve=>setTimeout(resolve,0));});
 assert.match(document.body.textContent,/历史回执暂不可用/);const publish=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('发表当期已准备作品'));assert.ok(publish);assert.equal(publish.disabled,false);assert.equal(document.querySelector('[aria-labelledby="publishing-posts-title"]'),null);
});
test('a manual refresh wins over late chunks from an older initial request',async t=>{
 document.body.innerHTML='<div id="root"></div>';const old=globalThis.fetch,encoder=new TextEncoder();let controller,count=0;const body=new ReadableStream({start(c){controller=c;}});globalThis.fetch=async()=>++count===1?new Response(body,{headers:{'Content-Type':'application/x-ndjson'}}):Response.json({...dashboard,plan:{enabled:false}});
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=old;});await act(async()=>root.render(React.createElement(Component)));
 await act(async()=>{controller.enqueue(encoder.encode(JSON.stringify({type:'core',dashboard})+'\n'));await new Promise(resolve=>setTimeout(resolve,0));});
 const refresh=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('重新读取'));await act(async()=>{refresh.click();await new Promise(resolve=>setTimeout(resolve,0));});assert.equal(document.querySelector('input[type="checkbox"]').checked,false);
 await act(async()=>{controller.enqueue(encoder.encode(JSON.stringify({type:'complete',dashboard})+'\n'));controller.close();await new Promise(resolve=>setTimeout(resolve,0));});assert.equal(document.querySelector('input[type="checkbox"]').checked,false);
});
