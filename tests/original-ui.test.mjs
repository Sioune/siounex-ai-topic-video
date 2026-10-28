// Isolated browser-DOM workflow tests. All API requests are intercepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React,{act} from 'react';

const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=createRequire(new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom');
const built=await build({entryPoints:['components/original-desk.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',write:false,plugins:[{name:'isolated-ui',setup(b){b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));b.onResolve({filter:/production-desk$/},()=>({path:'production-stub',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:"export function ProductionAction(){return null}",loader:'js'}))}}]});
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);const OriginalDesk=module.exports.default;
const clone=value=>structuredClone(value),at='2026-10-24T03:00:00Z',hash='a'.repeat(64);
function record(id='original_A'){
 const fields={title:'SYNTHETIC 原创报道',summary:'SYNTHETIC 界面验证摘要',draft:'完整草稿\n<script>not executed</script>\n保留结尾\n',pending_claims:'所有产品功能待核。',verified_notes:'',history_note:'说明日期不是公开发布日期。'};
 return {schema:'owner-original-v1',id,owner_id:'SYNTHETIC-owner',original_text:'\n完整产品说明\n  保留空白\n',original_sha256:hash,description_date:'2026-10-23',source_refs:[],created_at:at,updated_at:at,version:1,topic:{id:'t_'+hash.slice(0,24),url:'https://SYNTHETIC.test/originals?id='+id},versions:[{...fields,version:1,created_at:at,draft_sha256:hash}]};
}
let createRoot;
async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5))});await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5))})}
async function setup(t,{records=[],url='https://SYNTHETIC.test/originals',handler,pending}={}){
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url,pretendToBeVisual:true}),win=dom.window,calls=[];
 for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Element','Node','NodeFilter','Event','MouseEvent','KeyboardEvent','CustomEvent','MutationObserver','DocumentFragment'])globalThis[key]=win[key];
 for(const key of Object.getOwnPropertyNames(win).filter(key=>/^(HTML|SVG|FocusEvent|PointerEvent)/.test(key)))if(win[key])globalThis[key]=win[key];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:win.navigator});globalThis.getComputedStyle=win.getComputedStyle.bind(win);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};globalThis.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};win.HTMLElement.prototype.scrollIntoView=()=>{};
 if(pending)win.sessionStorage.setItem('siounex-originals-pending-v1',JSON.stringify(pending));
 let state=clone(records);const oldFetch=globalThis.fetch;
 const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 globalThis.fetch=async(url,init={})=>{const parsed=new URL(url,'https://SYNTHETIC.test'),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;calls.push({url:String(url),method,body});if(handler){const value=await handler({url:parsed,method,body,calls,state,response,setState:value=>{state=clone(value)}});if(value!==undefined)return value}assert.equal(parsed.pathname,'/api/originals');assert.equal(method,'GET');return parsed.searchParams.has('id')?response({original:clone(state.find(item=>item.id===parsed.searchParams.get('id')))}):response({originals:clone(state)})};
 if(!createRoot)({createRoot}=await import('react-dom/client'));const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(OriginalDesk)));await settle();
 t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=oldFetch;dom.window.close()});
 return {calls,get state(){return state},set state(value){state=clone(value)}};
}
const button=text=>[...document.querySelectorAll('button')].find(value=>value.textContent.trim()===text);
async function click(element){assert.ok(element);await act(async()=>element.click());await settle()}
async function input(selector,value){const element=document.querySelector(selector);assert.ok(element);await act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))});await settle()}
async function compose(){await input('[aria-label="原创报道标题"]','SYNTHETIC 原创报道');await input('[aria-label="原创选题摘要"]','SYNTHETIC 摘要');await input('[aria-label="完整原始产品说明"]','\n完整原文\n  空白保留\n');await input('[aria-label="原创完整草稿"]','\n完整草稿\n<script>not executed</script>\n')}

test('original intake starts read-only and an explicit double-submit preserves full text in one request',async t=>{
 let posted;
 const f=await setup(t,{handler:({method,body,response,setState})=>{if(method==='POST'){posted=clone(body);const r=record();r.original_text=body.input.original_text;r.versions[0]={...r.versions[0],...body.input};setState([r]);return response({original:r})}}});
 assert(f.calls.every(call=>call.method==='GET'));assert.equal(document.querySelector('.production-start'),null);
 await compose();await input('[aria-label="Library来源文件记录"]','libfile_SYNTHETIC | 0 | 原始材料.txt');await act(async()=>{const form=document.querySelector('form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});await settle();
 assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(posted.input.original_text,'\n完整原文\n  空白保留\n');assert.equal(posted.input.draft,'\n完整草稿\n<script>not executed</script>\n');assert.equal(posted.input.description_date,null);assert.deepEqual(posted.input.source_refs,[{library_file_id:'libfile_SYNTHETIC',version:0,file_name:'原始材料.txt'}]);assert.equal(posted.input.verified_notes,'');assert.equal(document.querySelector('[data-original-draft] script'),null);assert.match(document.querySelector('[data-original-draft]').textContent,/<script>not executed<\/script>/);assert.equal(document.querySelector('[data-original-text]').textContent,posted.input.original_text);assert.equal(document.querySelector('.production-start'),null);assert.match(document.querySelector('[role="status"]').textContent,/未启动制作/);
});

test('dirty editing is protected and a concurrency conflict retains text until the owner updates the save base',async t=>{
 const first=record(),second=record('original_B');second.versions[0].title='另一份材料';let attempts=0;
 const f=await setup(t,{records:[first,second],url:'https://SYNTHETIC.test/originals?id=original_A',handler:({method,body,state,response,setState})=>{if(method==='POST'){assert.equal(body.action,'edit');if(attempts++===0){const next=clone(state[0]);next.version=2;next.versions.push({...clone(next.versions[0]),version:2,title:'另一窗口已保存'});setState([next,state[1]]);return response({error:'版本冲突，请读取最新版本'},409)}assert.equal(body.expected_version,2);const next=clone(state[0]);next.version=3;next.versions.push({...body.input,version:3,created_at:at,draft_sha256:'b'.repeat(64)});setState([next,state[1]]);return response({original:next})}}});
 await click(button('编辑并另存'));await input('[aria-label="原创完整草稿"]','SYNTHETIC 我的未保存编辑');await click([...document.querySelectorAll('.research-history-list button')].find(value=>value.textContent.includes('另一份材料')));assert.match(document.querySelector('[role="alert"]').textContent,/未保存/);assert.equal(document.querySelector('[aria-label="原创完整草稿"]').value,'SYNTHETIC 我的未保存编辑');
 await click(button('另存草稿版本'));assert.equal(document.querySelector('[aria-label="原创完整草稿"]').value,'SYNTHETIC 我的未保存编辑');assert.equal(button('另存草稿版本').disabled,true);await click(button('保留编辑，更新保存基准'));await click(button('另存草稿版本'));assert.equal(f.state[0].versions.length,3);assert.equal(f.state[0].original_text,first.original_text);assert.equal(f.state[0].versions[0].draft,first.versions[0].draft);assert.equal(f.state[0].topic.id,first.topic.id);assert.equal(f.state[0].versions[2].draft,'SYNTHETIC 我的未保存编辑');
});

test('lost create receipt uses a readback and replays the same request id without automatic retry',async t=>{
 const ids=[];let attempts=0;
 const f=await setup(t,{handler:({method,body,response,setState})=>{if(method==='POST'){ids.push(body.request_id);const r=record();setState([r]);if(attempts++===0)throw Error('SYNTHETIC lost receipt');return response({original:r,replayed:true})}}});await compose();await click(button('保存原创材料与选题'));assert.equal(ids.length,1);assert.equal(button('重试同一请求').disabled,true);const saved=JSON.parse(window.sessionStorage.getItem('siounex-originals-pending-v1'));assert.equal(saved.body.request_id,ids[0]);await click(button('先读回状态'));assert.equal(ids.length,1);await click(button('重试同一请求'));assert.deepEqual(ids,[ids[0],ids[0]]);assert.equal(f.state.length,1);assert.equal(window.sessionStorage.getItem('siounex-originals-pending-v1'),null);
});

test('a pending request survives reload and cannot submit again before explicit readback',async t=>{
 const pending={kind:'create',body:{action:'create',request_id:'SYNTHETIC-stable-request',input:{title:'SYNTHETIC 原始请求',original_text:'原始请求全文'}}};
 const f=await setup(t,{records:[record()],pending,handler:({method,body,response})=>{if(method==='POST'){assert.deepEqual(body,pending.body);return response({original:record(),replayed:true})}}});assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.equal(button('重试同一请求').disabled,true);await click(button('先读回状态'));await click(button('重试同一请求'));assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(document.querySelector('.research-uncertain'),null);
});
