// Synthetic React/JSDOM responses only. No production task, file or approval writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React,{act} from 'react';
const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=createRequire(process.env.TOPIC_TEST_PACKAGE||new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://synthetic.test/production',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Element','Node','Event','MouseEvent'])globalThis[key]=dom.window[key];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const{createRoot}=await import('react-dom/client');
const built=await build({entryPoints:['components/media-planner.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}),module={exports:{}};
new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);const Planner=module.exports.default;
const ID='job_77777777-7777-4777-8777-777777777777';
function state(revision,epoch=1){return{binding:{script_revision:revision,script_hash:String(revision).repeat(64),mode_epoch:epoch},script:'SYNTHETIC script '+revision,saved:null,candidates:null,current:false,issues:[],confirmed:false};}
async function mount(t){
 document.body.innerHTML='<div id="root"></div>';const prior=globalThis.fetch,reads=[],root=createRoot(document.getElementById('root'));
 globalThis.fetch=(url,options={})=>{assert.equal(url,'/api/media-plan?id='+ID);assert.notEqual(options.method,'POST');return new Promise(resolve=>reads.push({resolve,options}));};
 t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=prior});
 const render=async(revision,epoch=1)=>{await act(async()=>root.render(React.createElement(Planner,{jobId:ID,revision,epoch})))};
 await render(1);return{reads,render};
}
test('delayed previous revision response cannot replace the latest plan or its binding',async t=>{
 const{reads,render}=await mount(t);assert.match(document.body.textContent,/正在读取本版素材方案/);assert.doesNotMatch(document.body.textContent,/尚无当前口播稿/);
 await render(2);assert.equal(reads.length,2);
 await act(async()=>reads[1].resolve(Response.json(state(2))));assert.match(document.body.textContent,/绑定口播 v2/);
 await act(async()=>reads[0].resolve(Response.json(state(1))));assert.match(document.body.textContent,/绑定口播 v2/);assert.doesNotMatch(document.body.textContent,/绑定口播 v1/);
});
test('mode change removes old binding controls until the current read resolves',async t=>{
 const{reads,render}=await mount(t);await act(async()=>reads[0].resolve(Response.json(state(1,1))));assert.match(document.body.textContent,/绑定口播 v1/);
 await render(1,2);assert.match(document.body.textContent,/正在读取本版素材方案/);assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent==='核对材料后确认方案'),false);
 await act(async()=>reads[1].resolve(Response.json(state(1,2))));assert.ok([...document.querySelectorAll('button')].some(button=>button.textContent==='核对材料后确认方案'));
});
test('failed read is a recoverable read error rather than a missing-script diagnosis',async t=>{
 const{reads}=await mount(t);await act(async()=>reads[0].resolve(Response.json({error:'SYNTHETIC connection interrupted'},{status:503})));
 assert.match(document.querySelector('[role="alert"]').textContent,/SYNTHETIC connection interrupted/);assert.doesNotMatch(document.body.textContent,/尚无当前口播稿/);
 await act(async()=>document.querySelector('button').click());assert.equal(reads.length,2);assert.match(document.body.textContent,/正在读取本版素材方案/);
 await act(async()=>reads[1].resolve(Response.json(state(1))));assert.equal(document.querySelector('[role="alert"]'),null);assert.match(document.body.textContent,/绑定口播 v1/);
});
