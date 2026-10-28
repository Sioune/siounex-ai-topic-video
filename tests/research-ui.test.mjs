// Isolated React DOM workflow tests. Every request is intercepted; no network, model or production write.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React,{act} from 'react';
const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=createRequire(new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom');
const built=await build({entryPoints:['components/research-desk.tsx','components/source-input.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',outdir:'SYNTHETIC',write:false,plugins:[{name:'isolated-styles',setup(b){b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}))}}]});
const load=name=>{const record={exports:{}};new Function('require','module','exports',built.outputFiles.find(file=>file.path.endsWith(name+'.js')).text)(require,record,record.exports);return record.exports.default};
const ResearchDesk=load('research-desk'),SourceInput=load('source-input');
const at='2026-10-16T03:00:00Z',hash='a'.repeat(64),clone=value=>structuredClone(value);
const sources=[{id:'S1',url:'https://one.example/research',title:'SYNTHETIC 官方资料',publisher:'一号来源',published_at:null,retrieved_at:at,summary:'这段网页摘要来自隔离测试，不是真实研究结果。',access:'opened'},{id:'S2',url:'https://two.example/report',title:'SYNTHETIC 搜索线索',publisher:'二号来源',published_at:'2026-10-12',retrieved_at:at,summary:'仅搜索摘要的范围必须明确，不能说已阅读全文。',access:'search_snippet'}];
function record(id='research_A',status='ready'){
 const result={title:'SYNTHETIC 可读资料文章',summary:'这是隔离的界面测试摘要。',article:'# 已确认的材料\n\n安全正文 [S1] 与待核实线索 [S2]。<script>never execute</script>\n\n这不是实际研究，只核对界面如何展示带来源的文字。',sources:clone(sources),gaps:['视频线索未观看，车辆表现未实测。'],queries:['SYNTHETIC research query']};
 return {id,owner_id:'SYNTHETIC-owner',input:{keywords:id==='research_A'?'roadster 特斯拉':'另一个测试方向',direction:'核对真实证据范围',clue_url:'https://video.example/watch'},input_hash:hash,request_hash:hash,status,attempt:0,version:status==='ready'?1:0,lease_until:status==='running'?Date.now()+60000:null,error:null,created_at:at,updated_at:at,versions:status==='ready'?[{version:1,result,article_sha256:hash,source_manifest_sha256:hash,source_notes:[],created_at:at,provenance:{},origin:'worker',topic_id:null}]:[],topic_id:null};
}
let createRoot;
const sleep=()=>new Promise(resolve=>setTimeout(resolve,5));
async function settle(){await act(async()=>{await sleep()});await act(async()=>{await sleep()})}
async function setup(t,{records=[],url='https://SYNTHETIC.test/research',handler,element}={}){
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url,pretendToBeVisual:true}),win=dom.window,calls=[],timers=new Map();let timerId=0;
 for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Element','Node','NodeFilter','Event','MouseEvent','KeyboardEvent','CustomEvent','MutationObserver','DocumentFragment'])globalThis[key]=win[key];
 for(const key of Object.getOwnPropertyNames(win).filter(key=>/^(HTML|SVG|FocusEvent|PointerEvent)/.test(key)))if(win[key])globalThis[key]=win[key];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:win.navigator});globalThis.getComputedStyle=win.getComputedStyle.bind(win);globalThis.requestAnimationFrame=cb=>win.requestAnimationFrame(cb);globalThis.cancelAnimationFrame=id=>win.cancelAnimationFrame(id);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};globalThis.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};win.HTMLElement.prototype.scrollIntoView=()=>{};win.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 win.setInterval=(callback,ms)=>{assert.equal(ms,8000);timers.set(++timerId,callback);return timerId};win.clearInterval=id=>timers.delete(id);
 let state=clone(records);const oldFetch=globalThis.fetch;
 const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 globalThis.fetch=async(url,init={})=>{const parsed=new URL(url,'https://SYNTHETIC.test'),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;calls.push({url:String(url),method,body});if(handler){const answer=await handler({url:parsed,method,body,calls,state,response,setState:value=>{state=clone(value)}});if(answer!==undefined)return answer}if(method!=='GET')throw Error('Unexpected SYNTHETIC mutation');if(parsed.pathname==='/api/production')return response({job:null});if(parsed.pathname==='/api/production-intake')return response({proposal:null});assert.equal(parsed.pathname,'/api/research');if(parsed.searchParams.has('id'))return response({research:clone(state.find(value=>value.id===parsed.searchParams.get('id')))});return response({researches:clone(state)})};
 if(!createRoot)({createRoot}=await import('react-dom/client'));const root=createRoot(document.getElementById('root'));await act(async()=>root.render(element||React.createElement(ResearchDesk)));await settle();
 t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=oldFetch;dom.window.close()});
 return {calls,timers,get state(){return state},set state(value){state=clone(value)},async tick(){await act(async()=>{await Promise.all([...timers.values()].map(callback=>callback()))});await settle()}};
}
const button=text=>[...document.querySelectorAll('button')].find(value=>value.textContent.trim()===text);
const history=id=>[...document.querySelectorAll('.research-history-list button')].find(value=>value.textContent.includes(id==='research_A'?'roadster 特斯拉':'另一个测试方向'));
async function click(element){assert.ok(element);await act(async()=>element.click());await settle()}
async function input(selector,value){const element=document.querySelector(selector);assert.ok(element);await act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))});await settle()}
async function changeVersion(value){await act(async()=>{const select=document.querySelector('[aria-label="研究资料版本"]');select.value=String(value);select.dispatchEvent(new Event('change',{bubbles:true}))});await settle()}

test('initial render is GET-only; keywords stay empty, double submit saves one queued request',async t=>{
 let created=0;
 const f=await setup(t,{handler:({method,body,response,setState})=>{if(method==='POST'){assert.equal(body.action,'create');created++;assert.equal(body.input.keywords,'roadster 特斯拉');assert.match(body.request_id,/^[a-f0-9-]{36}$/);const r=record('research_A','queued');setState([r]);return response({research:r,replayed:false})}}});
 assert.equal(document.getElementById('research-keywords').value,'');assert.match(document.getElementById('research-keywords').placeholder,/roadster 特斯拉/);assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
 await input('#research-keywords','roadster 特斯拉');await act(async()=>{const form=document.querySelector('form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});await settle();
 assert.equal(created,1);assert.match(document.querySelector('.research-stage').textContent,/请求已排队/);assert.equal(document.querySelector('.research-article'),null);assert.equal(document.getElementById('research-keywords').value,'');assert.equal(f.timers.size,1);
 assert.match(document.querySelector('.research-notice').textContent,/已保存并排队/);f.state=[record('research_A','running')];await f.tick();assert.equal(document.querySelector('.research-notice'),null);assert.match(document.querySelector('.research-stage').textContent,/执行器已领取请求/);assert.equal(created,1);
});

for(const nextStatus of ['running','ready','failed'])test('retry queue notice expires when polling reads '+nextStatus+' and preserves current record errors',async t=>{
 const r=record('research_A','failed');r.error='SYNTHETIC original failure';
 const f=await setup(t,{records:[r],url:'https://SYNTHETIC.test/research?id=research_A',handler:({method,body,state,response,setState})=>{if(method==='POST'){assert.equal(body.action,'retry');const next={...clone(state[0]),status:'queued',error:null};setState([next]);return response({research:next})}}});
 await click(button('核对后重新排队'));assert.match(document.querySelector('.research-notice').textContent,/重试请求已排队/);const next=record('research_A',nextStatus);if(nextStatus==='failed')next.error='SYNTHETIC new failure must remain visible';f.state=[next];await f.tick();assert.equal(document.querySelector('.research-notice'),null);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(document.querySelector('.research-status').className,'research-status status-'+nextStatus);if(nextStatus==='failed')assert.match(document.querySelector('.research-record-error').textContent,/new failure must remain visible/);
});

test('polling transitions queued/running/ready through GET only; sources, dates and safe citation links reflect the receipt',async t=>{
 const f=await setup(t,{records:[record('research_A','queued')],url:'https://SYNTHETIC.test/research?id=research_A'});
 assert.equal(f.timers.size,1);f.state=[record('research_A','running')];await f.tick();assert.match(document.querySelector('.research-stage').textContent,/执行器已领取请求/);
 f.state=[record()];await f.tick();assert.equal(f.timers.size,0);assert.match(document.querySelector('.research-article-body').textContent,/<script>never execute<\/script>/);assert.equal(document.querySelector('.research-article-body script'),null);
 assert.equal(document.querySelector('.research-article-body a').getAttribute('href'),'#research-source-S1');assert.equal(document.querySelector('#research-source-S1 a').href,'https://one.example/research');assert.match(document.querySelector('#research-source-S1').textContent,/日期未核实/);assert.match(document.querySelector('#research-source-S1').textContent,/已读取网页文字/);assert.match(document.querySelector('#research-source-S2').textContent,/仅搜索摘要/);assert.match(document.querySelector('.research-clue').textContent,/未观看/);assert.equal(document.querySelector('.production-start'),null);assert(f.calls.every(call=>call.method==='GET'));
});

test('dirty edits survive blocked request/version switching and append a new immutable version only on explicit save',async t=>{
 let posted;
 const a=record(),b=record('research_B');
 const f=await setup(t,{records:[a,b],url:'https://SYNTHETIC.test/research?id=research_A',handler:({method,body,state,response,setState})=>{if(method==='POST'){posted=clone(body);assert.equal(body.action,'edit');const next=clone(state[0]);next.version=2;next.versions.push({...clone(next.versions[0]),version:2,result:body.result,origin:'owner-edit',article_sha256:'b'.repeat(64)});setState([next,state[1]]);return response({research:next})}}});
 await click(button('编辑并另存'));const editor=document.querySelector('[aria-label="研究文章正文"]');assert.equal(editor.maxLength,24000);await input('[aria-label="研究文章正文"]',a.versions[0].result.article+'\n\nSYNTHETIC 本人补充 [S1]');await click(history('research_B'));assert.match(document.querySelector('[role="alert"]').textContent,/未保存编辑/);assert.match(document.querySelector('[aria-label="研究文章正文"]').value,/本人补充/);assert.equal(new URL(window.location.href).searchParams.get('id'),'research_A');
 await click(button('另存资料版本'));assert.equal(posted.expected_version,1);assert.match(posted.result.article,/本人补充/);assert.deepEqual(posted.result.sources,a.versions[0].result.sources);assert.equal(f.state[0].versions.length,2);assert.equal(f.state[0].versions[0].result.article,a.versions[0].result.article);assert.match(document.querySelector('.research-article-body').textContent,/本人补充/);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
});

test('save-to-topic requires explicit use with the displayed version/hash; older versions never inherit the last-used topic',async t=>{
 const r=record();r.version=2;r.topic_id='t_'+'b'.repeat(24);r.versions.push({...clone(r.versions[0]),version:2,article_sha256:'b'.repeat(64),topic_id:r.topic_id});let use;
 const f=await setup(t,{records:[r],url:'https://SYNTHETIC.test/research?id=research_A&version=1',handler:({method,body,state,response,setState})=>{if(method==='POST'){assert.equal(body.action,'use');use=body;const next=clone(state[0]),id='t_'+'a'.repeat(24);next.versions[0].topic_id=id;next.topic_id=id;setState([next]);return response({research:next,topic:{id,url:'https://SYNTHETIC.test/research?id=research_A&version=1',title:'SYNTHETIC'},replayed:false})}}});
 assert.equal(document.querySelector('.production-start'),null);assert.equal(f.calls.filter(call=>call.method==='POST').length,0);await click(button('保存为选题材料'));assert.equal(use.version,1);assert.equal(use.article_sha256,hash);assert.equal(document.querySelector('.research-topic-link').getAttribute('href'),'/?topic=t_'+'a'.repeat(24));assert(document.querySelector('.production-start'));assert(f.calls.filter(call=>call.method==='POST').every(call=>call.url==='/api/research'));
 await changeVersion(2);assert.equal(document.querySelector('.research-topic-link').getAttribute('href'),'/?topic=t_'+'b'.repeat(24));
});

test('unknown create outcome uses GET readback and an explicit replay of the same request id, never an automatic second create',async t=>{
 const requestIds=[];let attempts=0;
 const f=await setup(t,{handler:({method,body,response,setState})=>{if(method==='POST'){assert.equal(body.action,'create');requestIds.push(body.request_id);const r=record('research_A','queued');setState([r]);if(++attempts===1)throw Error('SYNTHETIC lost receipt after commit');return response({research:r,replayed:true})}}});
 await input('#research-keywords','roadster 特斯拉');await click(document.querySelector('.research-start'));assert(document.querySelector('.research-uncertain'));assert.equal(button('重试同一请求').disabled,true);assert.equal(attempts,1);await f.tick();assert.equal(attempts,1);await click(button('先读回状态'));assert.equal(attempts,1);assert.equal(button('重试同一请求').disabled,false);await click(button('重试同一请求'));assert.deepEqual(requestIds,[requestIds[0],requestIds[0]]);assert.equal(f.state.length,1);assert.equal(document.querySelector('.research-uncertain'),null);
});

test('an older delayed detail read cannot overwrite the newly selected request',async t=>{
 let resolveA;
 const a=record(),b=record('research_B');b.versions[0].result.title='SYNTHETIC B current article';
 await setup(t,{records:[a,b],handler:({url,method,response})=>{if(method==='GET'&&url.searchParams.get('id')==='research_A')return new Promise(resolve=>{resolveA=()=>resolve(response({research:a}))})}});
 await click(history('research_A'));await click(history('research_B'));assert.match(document.querySelector('.research-article').textContent,/B current article/);await act(async()=>resolveA());await settle();assert.match(document.querySelector('.research-article').textContent,/B current article/);assert.equal(new URL(window.location.href).searchParams.get('id'),'research_B');
});

test('409 editing conflict reads back the newer revision while preserving unsaved content until explicit rebase',async t=>{
 const r=record();let posts=0;
 await setup(t,{records:[r],url:'https://SYNTHETIC.test/research?id=research_A',handler:({method,state,setState})=>{if(method==='POST'){posts++;const next=clone(state[0]);next.version=2;next.versions.push({...clone(next.versions[0]),version:2,origin:'owner-edit'});setState([next]);return new Response(JSON.stringify({error:'SYNTHETIC newer version saved'}),{status:409,headers:{'Content-Type':'application/json'}})}}});
 await click(button('编辑并另存'));await input('[aria-label="研究文章正文"]','SYNTHETIC kept dirty text');await click(button('另存资料版本'));assert.equal(posts,1);assert.equal(document.querySelector('[aria-label="研究文章正文"]').value,'SYNTHETIC kept dirty text');assert.equal(button('另存资料版本').disabled,true);assert(button('更新保存基准，保留编辑'));await click(button('更新保存基准，保留编辑'));assert.equal(button('另存资料版本').disabled,false);
 assert.equal(document.querySelector('[aria-label="研究资料版本"]').value,'1');
});

test('failed/expired work only retries on a click and cancellation retains the saved request without creating production',async t=>{
 const r=record('research_A','failed');r.error='SYNTHETIC source evidence unavailable';
 const f=await setup(t,{records:[r],url:'https://SYNTHETIC.test/research?id=research_A',handler:({method,body,state,response,setState})=>{if(method==='POST'){assert(['retry','cancel'].includes(body.action));const next={...clone(state[0]),status:body.action==='retry'?'queued':'cancelled',error:null};setState([next]);return response({research:next})}}});
 assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.match(document.querySelector('.research-record-error').textContent,/evidence unavailable/);await click(button('核对后重新排队'));assert.match(document.querySelector('.research-stage').textContent,/请求已排队/);await click(button('取消研究请求'));assert.match(document.querySelector('.research-status').textContent,/已取消/);assert.equal(f.state.length,1);assert.deepEqual(f.calls.filter(call=>call.method==='POST').map(call=>call.body.action),['retry','cancel']);assert.equal(document.querySelector('.production-start'),null);
});

test('frozen research production source hides the unrelated original-text form and links the exact saved research version',async t=>{
 const job={id:'SYNTHETIC-job',source_snapshot:JSON.stringify({source_id:'research-synthesis',research:{schema:'frozen-research-source-v1',id:'research_A',version:3}}),revision:0,attempt:0,status:'waiting_executor'};
 const f=await setup(t,{element:React.createElement(SourceInput,{job,onSaved:()=>assert.fail('must not save from frozen research notice')})});
 assert.equal(document.querySelector('textarea'),null);assert.equal(document.querySelector('button'),null);assert.match(document.body.textContent,/冻结研究 v3/);assert.equal(document.querySelector('a').getAttribute('href'),'/research?id=research_A&version=3');assert.equal(f.calls.length,0);
});
