// Intercepted responses and synthetic review data; no live network or approval.
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {build} from 'esbuild';import React,{act} from 'react';
import {cloneUiFixture,ID} from './fixtures/automatic-clone-ui.mjs';
const require=createRequire(new URL('../package.json',import.meta.url)),{JSDOM}=createRequire(process.env.TOPIC_TEST_PACKAGE||new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom'),dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://synthetic.test/production',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','HTMLDetailsElement','Element','Node','Event','MouseEvent','MutationObserver','DocumentFragment','CustomEvent'])globalThis[k]=dom.window[k];Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client'),built=await build({stdin:{contents:"export {default as Component} from './components/post-video-preparation';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false}),module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);const {Component}=module.exports;
const copy=x=>JSON.parse(JSON.stringify(x)),defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}},settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,10))}),checkbox=()=>document.querySelector('input[type=checkbox]'),approve=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='二次审核通过并入片仓');
async function mount(t,{initialPending=false}={}){
 document.body.innerHTML='<div id="root"></div>';const input=cloneUiFixture(true),prior=globalThis.fetch,oldSet=window.setInterval,oldClear=window.clearInterval,queue=[],writes=[];let timer,current=copy(input.preparation);const first=initialPending?defer():null;if(first)queue.push(first.promise);
 window.setInterval=fn=>{timer=fn;return 1};window.clearInterval=()=>{};
 globalThis.fetch=async(url,options={})=>{const b=options.body?JSON.parse(options.body):null;if(b?.action==='post_video_preparation_read'){const next=queue.shift();return next?await next:Response.json(current);}if(b?.action==='post_video_preparation_approve'){writes.push(b);const next=queue.shift();return next?await next:Response.json({job:input.job});}return new Response('SYNTHETIC',{headers:{'Content-Type':'text/plain'}});};
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=prior;window.setInterval=oldSet;window.clearInterval=oldClear;});
 await act(async()=>root.render(React.createElement(Component,{job:input.job})));if(!initialPending)await settle();
 return{input,root,writes,queue,first,tick:async()=>{await act(async()=>timer());},setCurrent:v=>{current=copy(v)}};
}
async function check(){assert.equal(checkbox().disabled,false);await act(async()=>checkbox().click());assert.equal(checkbox().checked,true);assert.equal(approve().disabled,false);}

test('initial read blocks confirmation, while an in-flight background refresh does not prevent one exact approval',async t=>{
 const f=await mount(t,{initialPending:true});assert.equal(checkbox().disabled,true);assert.equal(approve().disabled,true);
 await act(async()=>f.first.resolve(Response.json(f.input.preparation)));await check();
 const refresh=defer(),approval=defer();f.queue.push(refresh.promise,approval.promise);await f.tick();assert.equal(checkbox().disabled,false);assert.equal(approve().disabled,false);
 await act(async()=>approve().click());assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0],{action:'post_video_preparation_approve',id:ID,plan_id:f.input.preparation.plan.plan_id,expected_version:3,confirmation:true});assert.equal(approve().disabled,true);assert.equal(checkbox().disabled,true);
 await act(async()=>approval.resolve(Response.json({job:f.input.job})));await act(async()=>refresh.resolve(Response.json(f.input.preparation)));await settle();
});

test('temporary read failure preserves the reviewed materials and shows a useful error; explicit access failure invalidates them',async t=>{
 const f=await mount(t);await check();f.queue.push(Promise.resolve(Response.json({error:'SYNTHETIC 暂时无法读取'},{status:503})));await f.tick();await settle();assert.match(document.querySelector('[role=alert]').textContent,/暂时无法读取/);assert.equal(checkbox().checked,true);assert.equal(approve().disabled,false);
 f.queue.push(Promise.reject(Error('SYNTHETIC 网络中断')));await f.tick();await settle();assert.match(document.querySelector('[role=alert]').textContent,/网络中断/);assert.equal(approve().disabled,false);
 f.queue.push(Promise.resolve(Response.json({error:'SYNTHETIC 身份失效'},{status:403})));await f.tick();await settle();assert.match(document.querySelector('[role=alert]').textContent,/身份失效/);assert.equal(checkbox().disabled,true);assert.equal(approve().disabled,true);
});

test('an explicit stale result or a changed plan version requires a new confirmation',async t=>{
 const f=await mount(t);await check();const stale=copy(f.input.preparation);stale.is_current=false;f.setCurrent(stale);await f.tick();await settle();assert.equal(checkbox().disabled,true);assert.equal(approve().disabled,true);
 f.setCurrent(f.input.preparation);await f.tick();await settle();assert.equal(checkbox().checked,false);await check();
 const newer=copy(f.input.preparation);newer.plan.version++;f.setCurrent(newer);await f.tick();await settle();assert.equal(checkbox().disabled,false);assert.equal(checkbox().checked,false);assert.equal(approve().disabled,true);
});

test('a new video version discards the old confirmation and ignores the old in-flight response',async t=>{
 const f=await mount(t);await check();const old=defer(),next=defer();f.queue.push(old.promise,next.promise);await f.tick();
 const newerJob=copy(f.input.job),newer=copy(f.input.preparation);newerJob.milestones[0].artifact_hash='f'.repeat(64);newer.plan.base_video.artifact_hash='f'.repeat(64);
 await act(async()=>f.root.render(React.createElement(Component,{job:newerJob})));assert.equal(checkbox().disabled,true);assert.equal(approve().disabled,true);
 await act(async()=>old.resolve(Response.json(f.input.preparation)));assert.equal(checkbox().disabled,true);assert.equal(approve().disabled,true);
 await act(async()=>next.resolve(Response.json(newer)));await settle();assert.equal(checkbox().disabled,false);assert.equal(checkbox().checked,false);assert.equal(approve().disabled,true);
});

