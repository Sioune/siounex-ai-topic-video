// SYNTHETIC React/JSDOM fixtures. All HTTP is intercepted; no real task or approval writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React, {act} from 'react';
import {productionFacts} from '../lib/production-facts.mts';
import {productionWorkspacePlacement} from '../lib/production-workspace.mts';
import {cloneUiFixture} from './fixtures/automatic-clone-ui.mjs';

const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=createRequire(process.env.TOPIC_TEST_PACKAGE||new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://synthetic.test/production',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLDetailsElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Element','Node','Event','MouseEvent','KeyboardEvent','HashChangeEvent','MutationObserver','DocumentFragment','CustomEvent','history'])globalThis[key]=dom.window[key];
for(const key of ['requestAnimationFrame','cancelAnimationFrame','getComputedStyle'])globalThis[key]=dom.window[key].bind(dom.window);
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let scrolled=null;HTMLElement.prototype.scrollIntoView=function(){scrolled=this.id;};
const {createRoot}=await import('react-dom/client');
const built=await build({entryPoints:['components/production-desk.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false});
const compiled={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,compiled,compiled.exports);
const ProductionDesk=compiled.exports.default;
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,80));});
const milestone=(node,status,hash)=>({id:'SYNTHETIC-'+node,node,revision:2,mode_epoch:3,artifact_version:1,artifact_hash:hash.repeat(64),artifact:JSON.stringify({qa:{}}),status,report:null});
function job(){return {id:'job_11111111-1111-1111-1111-111111111111',topic_id:'SYNTHETIC-topic',is_test:0,status:'awaiting_review',source_snapshot:JSON.stringify({title:'SYNTHETIC 真正需要审阅的题目',url:'https://example.org/SYNTHETIC',source_id:'SYNTHETIC'}),skill_snapshot:'{}',contract_hash:'c'.repeat(64),revision:2,mode_epoch:3,checkpoint_version:4,checkpoint:'{}',lease_until:null,executor:null,attempt:1,reworks:1,ai_calls:0,error:null,review_note:null,approved_revision:null,approved_hash:null,review_mode:'node',created_at:'2026-10-16T00:00:00Z',updated_at:'2026-10-16T00:00:00Z',intake:null,operations:[],stages:[],publication_reports:[],reviews:[],milestones:[milestone('source','awaiting_human','a'),milestone('script','pending','b')],drafts:[{job_id:'SYNTHETIC',revision:2,content_hash:'d'.repeat(64),content:JSON.stringify({script:'SYNTHETIC 完整口播第一段。\n\n第二段保留原文与结尾提问？',evidence:[{url:'https://example.org/SYNTHETIC',title:'SYNTHETIC 原始材料',sha256:'e'.repeat(64),facts:['SYNTHETIC 可核对事实'],materials:['SYNTHETIC'],limits:['SYNTHETIC rights pending']}],storyboard:[{start:0,end:10,narration:'SYNTHETIC 第一段',visual:'SYNTHETIC 画面',sound:'SYNTHETIC 声音',asset_id:'SYNTHETIC-asset',reason:'SYNTHETIC 计划'}],limits:'SYNTHETIC 尚未批准'})}]};}
async function mount(t,{initial=job(),fetcher,query=true,postError=null}={}){
 document.body.innerHTML='<div id="root"></div>';history.replaceState(null,'',query?'/production?job='+initial?.id:'/production');scrolled=null;
 const writes=[],reads=[],previous=globalThis.fetch;let current=initial;
 globalThis.fetch=async(url,options={})=>{
  assert.equal(typeof url,'string');assert.ok(url.startsWith('/api/'),'No real external HTTP');
  if(options.method==='POST'){const body=JSON.parse(options.body);writes.push(body);return postError?response({error:postError},403):response({job:current});}
  reads.push(url);if(fetcher){const value=await fetcher(url,options);if(value)return value;}
  if(url==='/api/production')return response({jobs:current?[{kind:'production-job-summary-v1',...productionWorkspacePlacement(current),id:current.id,topic_id:current.topic_id,title:JSON.parse(current.source_snapshot).title,is_test:current.is_test,status:current.status,revision:current.revision,mode_epoch:current.mode_epoch,review_mode:current.review_mode,updated_at:current.updated_at,status_label:'SYNTHETIC 当前列表状态',execution_condition:current.status,current_node:null,current_candidate:null}]:[]});
  if(url.startsWith('/api/production?')&&(!url.includes('view=')||url.includes('view=desk')))return response({job:current});
  return response({error:'SYNTHETIC optional input is not available'},503);
 };
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=previous;});
 await act(async()=>root.render(React.createElement(ProductionDesk)));
 return {root,writes,reads,setJob(value){current=value;}};
}
async function click(element){assert.ok(element);await act(async()=>{element.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));element.click();});await settle();}
async function type(element,value){assert.ok(element);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(element=>element.textContent===text);
const tab=text=>[...document.querySelectorAll('[role=tab]')].find(element=>element.textContent===text);

test('current local video never mounts hidden legacy promotion; old copy loads only when opened',async t=>{
 const input=cloneUiFixture(true).job,f=await mount(t,{initial:input});await settle();await click(tab('交付与版本'));
 assert.ok(document.querySelector('[data-legacy-promotion-flow]').hidden);assert.equal(document.getElementById('promotion-delivery'),null);
 assert.equal(f.reads.some(url=>url.startsWith('/api/promo-delivery')),false);assert.equal(f.reads.some(url=>url.startsWith('/api/promotion?')),false);
 const summary=[...document.querySelectorAll('summary')].find(x=>x.textContent==='旧宣发文案版本与生成请求');assert.ok(summary);const details=summary.parentElement;
 await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});await settle();assert.equal(f.reads.filter(url=>url.startsWith('/api/promotion?')).length,1);
});

test('switching away from visible legacy promotion preserves unsaved edits without hidden focus reads',async t=>{
 const input=job(),p={id:'SYNTHETIC-promo',hash:'a'.repeat(64),version:1,binding:{revision:2,script_hash:'d'.repeat(64),mode_epoch:3,video_sha256:null,video_reference:null,skill_hash:null},is_current:true,content:{recommended_title:'SYNTHETIC title',alternate_titles:[],description:'description',cross_platform_description:'copy',hashtags:[],pinned_comment:'comment',cover_title:'title',cover_subtitle:'',moments_copy:'moment',editorial_notes:'note'},source_notes:'notes',review:{status:'awaiting_review',version:0,reason:''}};
 const f=await mount(t,{initial:input,fetcher:url=>url.startsWith('/api/promo-delivery?')?response({packages:[p],current_binding:p.binding}):undefined});await settle();await click(tab('交付与版本'));
 const legacy=document.getElementById('promotion-delivery'),field=legacy.querySelector('textarea');assert.ok(field);await type(field,'SYNTHETIC unsaved legacy edit');await click(tab('稿件与审阅'));const before=f.reads.filter(url=>url.startsWith('/api/promo-delivery?')).length;
 await act(async()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});await settle();assert.equal(f.reads.filter(url=>url.startsWith('/api/promo-delivery?')).length,before);
 await click(tab('交付与版本'));assert.equal(document.getElementById('promotion-delivery'),legacy);assert.equal(legacy.querySelector('textarea'),field);assert.equal(field.value,'SYNTHETIC unsaved legacy edit');
});

test('archived legacy promotion loads only when opened, retains edits when closed, and honors its deep link',async t=>{
 const input=job(),source=cloneUiFixture(true),review='SYNTHETIC-original-review',binding={...source.preparation.plan.binding,revision:input.revision,script_hash:'d'.repeat(64),mode_epoch:input.mode_epoch,contract_hash:input.contract_hash,candidate_id:'native_video_'+'f'.repeat(64),candidate_sha256:'e'.repeat(64)};
 input.id='job_1c2556b8-53d5-4dc0-8d7a-faec60fa36ba';input.status='approved';input.approved_revision=input.revision;input.approved_hash=binding.script_hash;input.media_continuation={scope:{id:'SYNTHETIC-scope'},current_id:'SYNTHETIC-scope',licenses:[]};input.facts={summary:'SYNTHETIC',material_problems:[],candidate_record_id:binding.candidate_id,candidate_video_sha256:binding.candidate_sha256,candidate_owner_review:{id:review,decision:'approved'},site_file_archives:source.preparation.archives.filter(a=>['cover_3_4','cover_4_3','promotion'].includes(a.file.role)).map(a=>{const b=structuredClone(a);delete b.post_video_preparation_id;delete b.quality_review;b.owner_review_id=review;b.binding=binding;return b;})};
 const p={id:'SYNTHETIC-promo',hash:'a'.repeat(64),version:1,binding:{revision:2,script_hash:'d'.repeat(64),mode_epoch:3,video_sha256:null,video_reference:null,skill_hash:null},is_current:true,content:{recommended_title:'SYNTHETIC title',alternate_titles:[],description:'description',cross_platform_description:'copy',hashtags:[],pinned_comment:'comment',cover_title:'title',cover_subtitle:'',moments_copy:'moment',editorial_notes:'note'},source_notes:'notes',review:{status:'awaiting_review',version:0,reason:''}};
 const f=await mount(t,{initial:input,fetcher:url=>url.startsWith('/api/promo-delivery?')?response({packages:[p],current_binding:p.binding}):undefined});await settle();await click(tab('交付与版本'));
 const details=document.querySelector('details[data-historical-library-promotion]');assert.ok(details);assert.equal(details.open,false);assert.equal(document.getElementById('promotion-delivery'),null);assert.equal(f.reads.some(url=>url.startsWith('/api/promo-delivery?')),false);
 await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});await settle();const panel=document.getElementById('promotion-delivery'),field=panel?.querySelector('textarea');assert.ok(field);await type(field,'SYNTHETIC unsaved history');
 await act(async()=>{details.open=false;details.dispatchEvent(new Event('toggle'));});await settle();const before=f.reads.filter(url=>url.startsWith('/api/promo-delivery?')).length;await act(async()=>window.dispatchEvent(new Event('focus')));await settle();assert.equal(f.reads.filter(url=>url.startsWith('/api/promo-delivery?')).length,before);
 await act(async()=>{window.location.hash='promotion-delivery';window.dispatchEvent(new HashChangeEvent('hashchange'));});await settle();assert.equal(details.open,true);assert.equal(document.getElementById('promotion-delivery'),panel);assert.equal(field.value,'SYNTHETIC unsaved history');assert.equal(scrolled,'promotion-delivery');
});

test('compact task only loads full history when opened; stale previous task cannot replace the current history',async t=>{
 const first=job(),second=job();second.id='job_22222222-2222-2222-2222-222222222222';second.source_snapshot=JSON.stringify({title:'SECOND'});
 const snapshot=(j,word)=>({...j,skill_snapshot:JSON.stringify({word}),reviews:[{id:word,decision:'native_preparation_handoff_event',note:word}]});
 const compact=j=>{const v={...j,detail_view:'desk'};delete v.skill_snapshot;return v};let release;
 const f=await mount(t,{initial:compact(first),fetcher:url=>{if(url.startsWith('/api/production?id=')&&!url.includes('view=')){if(url.includes(first.id))return new Promise(resolve=>{release=()=>resolve(response({job:snapshot(first,'FIRST_HISTORY')}))});return response({job:snapshot(second,'SECOND_HISTORY')});}}});
 await settle();assert.ok(f.reads.some(url=>url.includes('view=desk')));assert.equal(f.reads.filter(url=>url.startsWith('/api/production?id=')&&!url.includes('view=')).length,0);
 let summary=[...document.querySelectorAll('summary')].find(x=>x.textContent==='历史版本、审核与恢复检查点'),details=summary.parentElement;
 await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'))});await settle();assert.match(details.textContent,/正在读取完整历史记录/);assert.ok(release);
 f.setJob(compact(second));await act(async()=>{history.pushState(null,'','/production?job='+second.id);window.dispatchEvent(new Event('popstate'))});await settle();
 summary=[...document.querySelectorAll('summary')].find(x=>x.textContent==='历史版本、审核与恢复检查点');details=summary.parentElement;await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'))});await settle();const group=[...details.querySelectorAll('summary')].find(x=>x.textContent.startsWith('审核记录')).parentElement;await act(async()=>{group.open=true;group.dispatchEvent(new Event('toggle'))});await settle();const row=group.querySelector('[data-history-group] details');await act(async()=>{row.open=true;row.dispatchEvent(new Event('toggle'))});await settle();assert.match(row.textContent,/SECOND_HISTORY/);
 await act(async()=>release());await settle();assert.match(row.textContent,/SECOND_HISTORY/);assert.doesNotMatch(details.textContent,/FIRST_HISTORY/);
});

for(const cancelled of [false,true])test('large historical diagnostics stay bounded and preserve every character, including cancelled jobs '+cancelled,async t=>{
 const input=job(),prefix=JSON.stringify({id:'SYNTHETIC-history',decision:'other',note:'😀'},null,2).indexOf('😀'),large='x'.repeat(11999-prefix)+'😀'+'x'.repeat(13000);input.skill_snapshot=JSON.stringify({stored_rule:large});input.reviews=[{id:'SYNTHETIC-history',decision:'other',note:large}];if(cancelled)input.status='cancelled';
 await mount(t,{initial:input});await settle();const label=cancelled?'历史审核、成果与执行记录':'历史版本、审核与恢复检查点',summary=[...document.querySelectorAll('summary')].find(s=>s.textContent===label);assert.ok(summary);const details=summary.parentElement;assert.equal(details.querySelector('[data-historical-diagnostics]'),null);
 await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});await settle();assert.ok(details.querySelector('[data-production-history]'));assert.equal(details.querySelector('pre'),null);
 const group=[...details.querySelectorAll('summary')].find(x=>x.textContent.startsWith('审核记录')).parentElement;await act(async()=>{group.open=true;group.dispatchEvent(new Event('toggle'))});await settle();assert.equal(group.querySelector('pre'),null);const row=group.querySelector('[data-history-group] details');await act(async()=>{row.open=true;row.dispatchEvent(new Event('toggle'))});await settle();
 let combined='';while(true){const pre=row.querySelector('pre');assert.ok(pre.textContent.length<=12000);const end=pre.textContent.charCodeAt(pre.textContent.length-1);assert.ok(!(end>=0xd800&&end<=0xdbff),'page never splits a Unicode character');combined+=pre.textContent;const next=button('下一段',row);if(!next||next.disabled)break;await click(next);}assert.deepEqual(JSON.parse(combined),input.reviews[0]);
 if(!cancelled){const section=[...details.querySelectorAll('summary')].find(x=>x.textContent==='制作规范快照').parentElement;await act(async()=>{section.open=true;section.dispatchEvent(new Event('toggle'))});await settle();let text='';while(true){const pre=section.querySelector('pre');assert.ok(pre.textContent.length<=12000);text+=pre.textContent;const next=button('下一段',section);if(!next||next.disabled)break;await click(next);}assert.deepEqual(JSON.parse(text),JSON.parse(input.skill_snapshot));}
 await act(async()=>{details.open=false;details.dispatchEvent(new Event('toggle'));});await settle();assert.equal(details.querySelector('[data-historical-diagnostics]'),null);
});

test('six-megabyte history uses bounded DOM pages and preserves every saved record across close/reopen',async t=>{
 const input=job(),payload='x'.repeat(10000);input.reviews=Array.from({length:600},(_,i)=>({id:'SYNTHETIC-'+i,decision:'native_preparation_handoff_event',note:payload+i}));
 await mount(t,{initial:input});await settle();const summary=[...document.querySelectorAll('summary')].find(x=>x.textContent==='历史版本、审核与恢复检查点'),details=summary.parentElement;
 const open=async e=>{await act(async()=>{e.open=true;e.dispatchEvent(new Event('toggle'))});await settle()};await open(details);assert.equal(details.querySelectorAll('pre').length,0);assert.ok(details.textContent.length<10000);
 let group=[...details.querySelectorAll('summary')].find(x=>x.textContent.startsWith('审核记录')).parentElement;await open(group);assert.equal(group.querySelectorAll('[data-history-group] > details').length,20);assert.match(group.textContent,/第 1 \/ 30 页/);assert.equal(group.querySelectorAll('pre').length,0);
 await click(button('下一页',group));assert.match(group.textContent,/第 2 \/ 30 页/);let row=group.querySelector('[data-history-group] details');await open(row);assert.deepEqual(JSON.parse(row.querySelector('pre').textContent),input.reviews[20]);assert.ok(row.querySelector('pre').textContent.length<=12000);const pager=group.querySelector('[aria-label="审核记录分页"]'),field=pager.querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'30');field.dispatchEvent(new Event('input',{bubbles:true}))});await settle();await act(async()=>pager.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await settle();assert.match(group.textContent,/第 30 \/ 30 页/);const last=[...group.querySelectorAll('[data-history-group] > details')].at(-1);await open(last);assert.deepEqual(JSON.parse(last.querySelector('pre').textContent),input.reviews[599]);
 await act(async()=>{details.open=false;details.dispatchEvent(new Event('toggle'))});await settle();assert.equal(details.querySelector('[data-production-history]'),null);await open(details);group=[...details.querySelectorAll('summary')].find(x=>x.textContent.startsWith('审核记录')).parentElement;await open(group);assert.match(group.textContent,/第 1 \/ 30 页/);await click(button('下一页',group));row=group.querySelector('[data-history-group] details');await open(row);assert.deepEqual(JSON.parse(row.querySelector('pre').textContent),input.reviews[20]);
});

test('initial deferred read stays loading, then shows an honest empty state without POST',async t=>{
 let release;const fixture=await mount(t,{initial:null,query:false,fetcher:async url=>url==='/api/production'?await new Promise(resolve=>{release=resolve;}):undefined});
 assert.ok(document.querySelector('.production-loading'));assert.doesNotMatch(document.querySelector('.production-result').textContent,/选择一项任务|把一个选题带到这里/);
 await act(async()=>release(response({jobs:[]})));await settle();
 assert.equal(document.querySelector('.production-loading'),null);assert.match(document.querySelector('.production-empty').textContent,/把一个选题带到这里/);assert.deepEqual(fixture.writes,[]);
});

test('initial list and detail start together and a slow detail does not hide the already loaded summary list',async t=>{
 const input=job();let release;const fixture=await mount(t,{initial:input,fetcher:async(url)=>url==='/api/production?id='+input.id+'&view=desk'?await new Promise(resolve=>{release=resolve;}):undefined});await settle();
 assert.ok(fixture.reads.includes('/api/production'));assert.ok(fixture.reads.includes('/api/production?id='+input.id+'&view=desk'));
 assert.equal(document.querySelector('.production-task-items [data-task-select] strong').textContent,JSON.parse(input.source_snapshot).title);assert.equal(document.querySelector('.production-task-items [data-task-select] span').textContent,'SYNTHETIC 当前列表状态');assert.ok(document.querySelector('.production-loading'));
 await act(async()=>release(response({job:input})));await settle();assert.equal(document.querySelector('.production-loading'),null);assert.deepEqual(fixture.writes,[]);
});

test('navigation aborts an older detail read, and even a transport ignoring abort cannot overwrite the newer job',async t=>{
 const first=job(),second={...job(),id:'job_22222222-2222-2222-2222-222222222222',source_snapshot:JSON.stringify({title:'SYNTHETIC 最新选题',url:'https://example.org/latest'})};let release,oldSignal;
 const fixture=await mount(t,{initial:first,fetcher:async(url,options)=>{if(url==='/api/production?id='+first.id+'&view=desk'){oldSignal=options.signal;return await new Promise(resolve=>{release=resolve;});}if(url==='/api/production?id='+second.id+'&view=desk')return response({job:second});}});await settle();
 await act(async()=>{history.pushState(null,'','/production?job='+second.id);window.dispatchEvent(new Event('popstate'));});await settle();assert.equal(oldSignal.aborted,true);assert.equal(document.querySelector('.production-current h2').textContent,'SYNTHETIC 最新选题');
 await act(async()=>release(response({job:first})));await settle();assert.equal(document.querySelector('.production-current h2').textContent,'SYNTHETIC 最新选题');assert.deepEqual(fixture.writes,[]);
});

test('polling shares the active refresh flight and never duplicates its list/detail pair',async t=>{
 const input=job(),originalSet=window.setInterval,originalClear=window.clearInterval;let tick,release;const pending=[];let blocked=false;
 window.setInterval=fn=>{tick=fn;return 123;};window.clearInterval=()=>{};t.after(()=>{window.setInterval=originalSet;window.clearInterval=originalClear;});
 const fixture=await mount(t,{initial:input,fetcher:async url=>blocked?await new Promise(resolve=>{pending.push({url,resolve});release=()=>{for(const p of pending)p.resolve(p.url==='/api/production'?response({jobs:[]}):response({job:input}));};}):undefined});await settle();assert.equal(typeof tick,'function');
 blocked=true;const before=fixture.reads.length;await act(async()=>{tick();tick();});assert.equal(fixture.reads.length-before,2,'two timer ticks share one list/detail pair');await act(async()=>release());await settle();assert.deepEqual(fixture.writes,[]);
});

test('failed list read remains unknown and a read-only retry clears the error',async t=>{
 let attempts=0;const fixture=await mount(t,{initial:null,query:false,fetcher:async url=>url==='/api/production'&&++attempts===1?response({error:'SYNTHETIC disconnected'},503):undefined});await settle();
 assert.match(document.querySelector('.production-page-error').textContent,/disconnected/);assert.equal(document.querySelector('.production-list-heading span').textContent,'未读取');assert.equal(document.querySelector('.production-task-groups'),null);assert.match(document.querySelector('.production-list').textContent,/任务列表未能读取，请重新尝试/);
 await click(button('重新读取与恢复连接'));assert.equal(document.querySelector('.production-page-error'),null);assert.match(document.querySelector('[data-workspace-section="in_progress"]:not([hidden]) .production-group-empty').textContent,/当前没有制作中的任务/);assert.equal(document.querySelector('.production-list-empty a').textContent,'从选题库开始');assert.deepEqual(fixture.writes,[]);
});

test('review starts with the unchanged manuscript and separate source/script gates',async t=>{
 const input=job(),before=structuredClone(input),fixture=await mount(t,{initial:input});await settle();
 assert.equal(document.querySelector('.script-reader-body').textContent,JSON.parse(input.drafts[0].content).script);
 assert.equal(document.querySelector('[data-production-panel=review]').hidden,false);assert.equal(document.querySelector('[data-production-panel=media]').hidden,true);assert.equal(document.querySelector('[data-production-panel=delivery]').hidden,true);
 const cards=document.querySelectorAll('[data-production-panel=review] .production-review-group > .milestone-card');assert.equal(cards.length,2);assert.match(cards[0].textContent,/等待人工审核/);assert.match(cards[1].textContent,/前一节点尚未通过/);
 assert.equal(document.querySelector('.production-current-task').getAttribute('href'),'#source-review');assert.equal(cards[0].id,'source-review');assert.equal(cards[1].id,'script-review');
 assert.equal(document.querySelector('.production-task-management').open,false);assert.deepEqual(input,before);assert.deepEqual(fixture.writes,[]);
});

for(const [status,label]of[['paused','已暂停，需要决定'],['failed','执行失败']])test('SYNTHETIC '+status+' stays primary in detail while the same-version source revise remains visible and unchanged',async t=>{
 const initial=job();initial.status=status;initial.milestones[0].status='revise';initial.error='SYNTHETIC 缺实演，等待本人决定';const before=structuredClone(initial),fixture=await mount(t,{initial});await settle();
 assert.equal(document.querySelector('.production-current .production-status').textContent,label);assert.match(document.querySelector('#source-review').textContent,/已打回返工/);
 assert.match(document.querySelector('.production-current [role=status]').textContent,status==='paused'?/任务已暂停.*等待本人决定/:/本次执行已失败.*核对错误和现有输出/);
 assert.match(document.querySelector('.production-current [role=alert]').textContent,/缺实演/);assert.deepEqual(initial,before);assert.deepEqual(fixture.writes,[]);
});

for(const [status,label]of[['paused','已暂停，需要决定'],['failed','执行失败'],['running','执行器已领单 · 租约有效'],['waiting_executor','等待执行器领取']])test('SYNTHETIC '+status+' cannot be hidden by preserved current candidate owner review evidence',async t=>{
 const initial=job();initial.status=status;initial.lease_until=Date.now()+600000;initial.approved_revision=initial.revision;initial.approved_hash=initial.drafts[0].content_hash;
 initial.facts={candidate_present:true,candidate_record_id:'native_video_'+'f'.repeat(64),candidate_video_sha256:'e'.repeat(64),files_archived:false,video_approval:'not-recorded',summary:'SYNTHETIC 当前成片候选已回传，审核另行记录'};
 initial.facts.candidate_owner_review={id:'SYNTHETIC-owner-review',binding:{revision:initial.revision,script_hash:initial.approved_hash,mode_epoch:initial.mode_epoch,contract_hash:initial.contract_hash,candidate_id:initial.facts.candidate_record_id,candidate_sha256:initial.facts.candidate_video_sha256,project_id:'SYNTHETIC-project',timeline_id:'SYNTHETIC-timeline'},decision:'approved',quote:'SYNTHETIC 普通配音版通过。',reported_at:'2026-10-16T00:00:00Z',source_thread_id:null,sequence:1,source:'owner-oral-report',reviewed_voice_kind:'ordinary-temporary',website_button_clicked:false,formal_milestone_approved:false,quality_approved:false,publication_authorized:false,new_paid_calls:0};
 const before=structuredClone(initial),fixture=await mount(t,{initial});await settle();
 assert.equal(document.querySelector('.production-current .production-status').textContent,label+' · 普通配音版聊天审阅通过 · 待归档');
 assert.match(document.querySelector('.production-current .production-current-summary').textContent,/普通配音版聊天审阅通过 · 待归档.*正式视频节点和发布状态另行记录/);
 assert.equal(document.getElementById('source-review').textContent.includes('等待人工审核'),true,'formal milestone remains distinct from oral candidate review');
 assert.deepEqual(initial,before);assert.deepEqual(fixture.writes,[]);
});

test('periodic backend evidence is readable between checks without an offline or uninstalled claim',async t=>{
 const initial=job(),now=Date.now();initial.runtime={executors:[{executor_id:'windows-topic-periodic-v1',scope:'scheduled-poll',state:'idle',online:false,last_seen:now-180000,last_started_at:now-180000,last_finished_at:now-120000,next_check_at:now+720000,schedule_interval_ms:900000,outcome:'idle'}],isolated_executor_count:1};
 const before=structuredClone(initial),fixture=await mount(t,{initial});await settle();const text=document.querySelector('.production-result').textContent;
 assert.match(text,/后台定时巡检/);assert.match(text,/每15分钟检查/);assert.match(text,/没有可自动领取的任务/);assert.match(text,/下次检查/);assert.match(text,/已排除 1 条隔离测试记录/);assert.doesNotMatch(text,/未安装后台唤醒或常驻服务|执行器离线，任务仍待领取/);assert.deepEqual(initial,before);assert.deepEqual(fixture.writes,[]);
});

test('current blocked preparation exposes its actual failed check beside the task title without any write',async t=>{
 const initial=job(),binding={revision:initial.revision,script_hash:initial.drafts[0].content_hash,mode_epoch:initial.mode_epoch,contract_hash:initial.contract_hash};initial.status='approved';initial.approved_revision=initial.revision;initial.approved_hash=binding.script_hash;
 initial.media_continuation={current_id:'scope-synthetic',scope:{schema:'owner-media-scope-v1',id:'scope-synthetic',scope:'preparation',binding,confirmed_at:'2026-10-16T00:00:00Z',new_paid_authorization:false,publication_authorization:false,quality_approved:false},licenses:[]};
 initial.stages=[{id:'prep-synthetic',stage:'media_inputs',review_revision:initial.revision,review_hash:binding.script_hash,status:'blocked',result:JSON.stringify({schema:'media-input-probe-v1',scope_id:'scope-synthetic',binding,attempt:1,receipt:{schema:'media-input-probe-receipt-v1',status:'blocked',checks:[{code:'voice',passed:false,detail:'SYNTHETIC 当前输入缺少绑定本稿的实际音轨'}]}})}];
 const before=structuredClone(initial),fixture=await mount(t,{initial});await settle();assert.equal(document.querySelector('.production-current .production-status').textContent,'准备检查待补充');assert.match(document.querySelector('.production-current [data-media-production-progress]').textContent,/SYNTHETIC 当前输入缺少绑定本稿的实际音轨/);assert.ok(document.querySelector('.production-current a[href="#media-next-step"]'));assert.deepEqual(initial,before);assert.deepEqual(fixture.writes,[]);
});

for(const [category,explicit,toolRequired]of[['视觉影像',false,false],['AI实用',false,false],['视觉影像',true,true]])test('SYNTHETIC blocked '+category+' material text follows actual source demonstration requirements '+explicit+' without clearing the gate',async t=>{
 const initial=job(),problems=Array.from({length:7},(_,i)=>'SYNTHETIC 第'+(i+1)+'段素材尚未核查');
 initial.source_snapshot=JSON.stringify({...JSON.parse(initial.source_snapshot),category,demonstration_required:explicit});
 const content=JSON.parse(initial.drafts[0].content);Object.assign(content,{media_readiness:{required:false},narration_preflight:{production_ready:false,machine_preflight:'blocked',problems}});initial.drafts[0].content=JSON.stringify(content);
 initial.facts=productionFacts(initial);assert.equal(initial.facts.material_required,true);assert.equal(initial.facts.material_gate,'blocked');
 const before=structuredClone(initial),fixture=await mount(t,{initial});await settle();const text=document.querySelector('[aria-label="任务事实"] [role=status]').textContent;
 assert.match(text,toolRequired?/^真实工具操作素材：待补连续实演/:/^制作素材：待补素材或核查/);assert.match(text,/文字返工可继续，禁止进入媒体合成/);
 for(const problem of problems)assert.ok(text.includes(problem));if(!toolRequired)assert.doesNotMatch(text,/工具操作|连续实演|实际操作语义/);
 assert.equal(initial.facts.script_approved,false);assert.equal(initial.facts.video_approval,'not-recorded');assert.equal(initial.facts.publication_authorization,false);
 assert.deepEqual(initial,before,'a content-type label must preserve draft, material gate, review state and counters');assert.deepEqual(fixture.writes,[]);
});

test('switching tabs retains an unsaved script feedback form and never requests generation',async t=>{
 const fixture=await mount(t);await settle();const input=document.querySelector('[aria-label="口播v2修改意见"]');await type(input,'SYNTHETIC 尚未提交的意见');
 await click(tab('素材与制作'));assert.equal(document.querySelector('[data-production-panel=review]').hidden,true);assert.equal(document.querySelector('[data-production-panel=media]').hidden,false);
 await click(tab('交付与版本'));assert.equal(document.querySelector('[data-production-panel=delivery]').hidden,false);
 await click(tab('稿件与审阅'));assert.equal(document.querySelector('[aria-label="口播v2修改意见"]'),input);assert.equal(input.value,'SYNTHETIC 尚未提交的意见');assert.deepEqual(fixture.writes,[]);
});

test('unvisited media/delivery panels issue no requests, visited panels stay mounted, and a new job starts with a clean visit set',async t=>{
 const first=job(),second={...job(),id:'job_33333333-3333-3333-3333-333333333333'};const fixture=await mount(t,{initial:first});await settle();
 const hiddenRequest=url=>/\/api\/(audio-intake|media-plan|promo-delivery|publications|voice-replacement|production.*view=native_packet)/.test(url);
 assert.equal(fixture.reads.some(hiddenRequest),false);assert.equal(document.getElementById('recording-input'),null);assert.equal(document.getElementById('promotion-delivery'),null);
 await click(tab('素材与制作'));const recording=document.getElementById('recording-input');assert.ok(recording);assert.equal(fixture.reads.some(url=>url.startsWith('/api/audio-intake')),true);
 await click(tab('稿件与审阅'));assert.equal(document.getElementById('recording-input'),recording,'visited panel is hidden without unmounting its forms');assert.equal(document.querySelector('[data-production-panel=media]').hidden,true);
 const before=fixture.reads.length;fixture.setJob(second);await act(async()=>{history.pushState(null,'','/production?job='+second.id);window.dispatchEvent(new Event('popstate'));});await settle();
 assert.equal(document.getElementById('recording-input'),null);assert.equal(document.querySelector('[data-production-panel=review]').hidden,false);assert.equal(fixture.reads.slice(before).some(hiddenRequest),false,'previous job visits cannot mount hidden inputs for a new job');assert.deepEqual(fixture.writes,[]);
});

test('existing media/delivery hash anchors reveal their panel and a technical details ancestor',async t=>{
 const input=job();input.reviews=[{id:'SYNTHETIC-preview',decision:'owned_technical_preview',note:JSON.stringify({asset:{file_name:'SYNTHETIC.mp4',library_file_id:'SYNTHETIC'},binding:{revision:2,script_hash:'not-approved'},qa:{final_duration:{report:{maximum_measured_seconds:10}}},limits:'SYNTHETIC technical only',library_local_metadata_applied:false})}];
 const fixture=await mount(t,{initial:input});await settle();const feedback=document.querySelector('[aria-label="口播v2修改意见"]');await type(feedback,'SYNTHETIC hash导航前尚未提交的意见');const listReads=fixture.reads.filter(url=>url==='/api/production').length;
 for(const [id,panel]of[['technical-video','media'],['recording-input','media'],['media-plan-input','media'],['promotion-delivery','delivery']]){
  await act(async()=>{window.location.hash=id;window.dispatchEvent(new HashChangeEvent('hashchange'));});await settle();assert.equal(document.querySelector('[data-production-panel='+panel+']').hidden,false);assert.equal(scrolled,id);
 }
 assert.equal(document.querySelector('.production-technical').open,true);assert.equal(document.querySelector('[aria-label="口播v2修改意见"]'),feedback);assert.equal(feedback.value,'SYNTHETIC hash导航前尚未提交的意见');assert.equal(fixture.reads.filter(url=>url==='/api/production').length,listReads);assert.deepEqual(fixture.writes,[]);
});

test('source approval and script return keep the exact milestone version/hash/epoch payload',async t=>{
 const input=job(),fixture=await mount(t,{initial:input});await settle();
 await click(button('通过此节点',document.querySelector('[data-production-panel=review]')));
 assert.deepEqual(fixture.writes[0],{action:'milestone_review',id:input.id,milestone_id:'SYNTHETIC-source',revision:2,artifact_hash:'a'.repeat(64),mode_epoch:3,decision:'approve',note:''});
 const updated=structuredClone(input);updated.milestones[0].status='approved';updated.milestones[1].status='awaiting_human';fixture.setJob(updated);await click(button('重新读取与恢复连接'));
 assert.equal(document.querySelector('.production-current-task').getAttribute('href'),'#script-review');
 await type(document.querySelector('[aria-label="打回返工修改意见"]'),'SYNTHETIC 请保留结尾原文');await click(button('打回返工',document.querySelector('[data-production-panel=review]')));
 assert.deepEqual(fixture.writes[1],{action:'milestone_review',id:input.id,milestone_id:'SYNTHETIC-script',revision:2,artifact_hash:'b'.repeat(64),mode_epoch:3,decision:'revise',note:'SYNTHETIC 请保留结尾原文'});
});

test('technical source pause offers same-draft human review while preserving automatic mode',async t=>{
 const input=job();input.review_mode='auto';input.status='paused';input.error='SYNTHETIC CLI 429';input.milestones[0].status='paused';input.milestones[0].report=JSON.stringify({decision:'pause',reason:input.error});input.reviews=[{decision:'ai_review_error',revision:2,content_hash:input.milestones[0].artifact_hash,note:input.milestones[0].report}];
 const fixture=await mount(t,{initial:input});await settle();
 assert.match(document.getElementById('source-review').textContent,/审核未完成.*技术异常/);
 assert.doesNotMatch(document.getElementById('source-review').textContent,/已打回返工/);
 await type(document.querySelector('[aria-label="转人工检查理由"]'),'SYNTHETIC only this text review');
 await click(button('本次人工审稿，后续自动',document.getElementById('source-review')));
 assert.deepEqual(fixture.writes,[{action:'decision',id:input.id,choice:'manual_text',note:'SYNTHETIC only this text review'}]);
 assert.equal(input.review_mode,'auto');
});

test('active manual text override explains that following stages remain automatic',async t=>{
 const input=job();input.review_mode='auto';input.reviews=[{decision:'resume_manual_text',revision:2,note:JSON.stringify({schema:'manual-text-review-v1',keep_automatic_mode:true,binding:{revision:2,mode_epoch:3,nodes:input.milestones.map(m=>({id:m.id,node:m.node,artifact_hash:m.artifact_hash}))}})}];
 const fixture=await mount(t,{initial:input});await settle();assert.match(document.getElementById('source-review').textContent,/后续模式保持自动/);
 await click(button('通过此节点',document.getElementById('source-review')));assert.equal(fixture.writes[0].action,'milestone_review');assert.equal(fixture.writes[0].decision,'approve');
});
test('approved text cannot look awaiting review because its old combined material preflight is blocked',async t=>{
 const input=job(),draft=input.drafts[0],content=JSON.parse(draft.content);content.narration_preflight={production_ready:false,machine_preflight:'blocked',problems:['segments[0] 素材未完成获取与核查']};draft.content=JSON.stringify(content);input.approved_revision=2;input.approved_hash=draft.content_hash;
 const f=await mount(t,{initial:input});await settle();const text=document.querySelector('.script-preflight').textContent;assert.match(text,/本版口播已批准.*不撤销当前批准/);assert.doesNotMatch(text,/待审核|待补素材 \/ 待审核/);assert.deepEqual(f.writes,[]);
});
test('current clear text preflight stays distinct from pending material and node approval',async t=>{
 const input=job(),draft=input.drafts[0],content=JSON.parse(draft.content);content.narration_preflight={production_ready:false,machine_preflight:'blocked',text_preflight:'clear',problems:['segments[0] 素材未完成获取与核查']};draft.content=JSON.stringify(content);
 const f=await mount(t,{initial:input});await settle();assert.match(document.querySelector('.script-preflight').textContent,/文本预检已通过，等待节点审核/);assert.equal(document.querySelector('.script-review-state').textContent,'待审核草稿');assert.deepEqual(f.writes,[]);
});

test('paused ordinary media return exposes its reason field and retains the original recovery binding',async t=>{
 const input=job();input.status='paused';input.milestones.push(milestone('video','revise','f'));const fixture=await mount(t,{initial:input});await settle();await click(tab('素材与制作'));
 const recover=button('按意见继续此节点返工',document.querySelector('[data-production-panel=media]'));assert.equal(recover.disabled,true);await type(document.querySelector('[aria-label="本次媒体返工理由"]'),'SYNTHETIC 核对原文件后接续');await click(recover);
 assert.deepEqual(fixture.writes[0],{action:'media_rework',id:input.id,milestone_id:'SYNTHETIC-video',revision:2,artifact_hash:'f'.repeat(64),mode_epoch:3,note:'SYNTHETIC 核对原文件后接续'});
});

test('a denied approval remains an error after reconciliation reads and does not look approved',async t=>{
 const fixture=await mount(t,{postError:'SYNTHETIC owner approval denied'});await settle();await click(button('通过此节点',document.querySelector('[data-production-panel=review]')));
 assert.match(document.querySelector('.production-page-error').textContent,/owner approval denied/);assert.match(document.getElementById('source-review').textContent,/等待人工审核/);assert.equal(fixture.writes.length,1);
});

function pausedMediaFeedbackJob(){
 const input=job(),video=milestone('video','revise','f'),reason='SYNTHETIC 素材只有会议图片。\n请改用与口播对应的真实剧情片段。';
 input.status='paused';input.review_mode='auto';input.approved_revision=input.revision;input.approved_hash='d'.repeat(64);input.reworks=3;input.error='返工已达2次上限，需人工决定';input.review_note=reason;
 input.milestones.forEach(m=>m.status='approved');video.id='local_review_video_'+'f'.repeat(64);video.artifact=JSON.stringify({storage:'site-private-r2',qa:{owner_voice_used:false,local_review_draft_id:'lrd_'+'d'.repeat(64),voice_kind:'ordinary-review'}});video.report=JSON.stringify({decision:'revise',actor:'SYNTHETIC-owner',reason,revision:video.revision,artifact_hash:video.artifact_hash,mode_epoch:video.mode_epoch});input.milestones.push(video);return input;
}
test('paused media feedback at its default limit has a primary exact-feedback recovery action without resubmitting review',async t=>{
 const input=pausedMediaFeedbackJob(),fixture=await mount(t,{initial:input});await settle();const card=document.querySelector('[data-media-rework-recovery]');assert.ok(card);assert.equal(card.closest('details'),null);assert.equal(card.closest('[data-production-panel]'),null);assert.equal(card.querySelector('blockquote').textContent,input.review_note);assert.match(card.textContent,/默认上限.*累计记录保留/);assert.match(card.textContent,/复用已批准口播和现有音轨、素材/);assert.deepEqual(fixture.writes,[]);
 await click(button('按已保存意见继续自动修改',card));assert.deepEqual(fixture.writes,[{action:'media_rework',id:input.id,milestone_id:'local_review_video_'+'f'.repeat(64),revision:2,artifact_hash:'f'.repeat(64),mode_epoch:3,note:input.review_note}]);assert.match(document.getElementById('production-recovery').textContent,/累计返工 3次/);
});
test('an exhausted external media adapter gives its actual manual return path instead of offering an unsupported automatic run',async t=>{
 const input=pausedMediaFeedbackJob();input.milestones.at(-1).id='SYNTHETIC-external-video';const fixture=await mount(t,{initial:input});await settle();const card=document.querySelector('[data-media-rework-recovery]');assert.ok(card);assert.equal(button('按已保存意见继续自动修改',card),undefined);assert.match(card.textContent,/尚未接通自动回传下一版/);assert.ok(card.querySelector('a[href="#production-recovery"]'));assert.deepEqual(fixture.writes,[]);
});
test('a recovery action never silently substitutes mismatched stored feedback',async t=>{
 const input=pausedMediaFeedbackJob();input.review_note='SYNTHETIC newer feedback';const fixture=await mount(t,{initial:input});await settle();const card=document.querySelector('[data-media-rework-recovery]');assert.ok(card);assert.equal(button('按已保存意见继续自动修改',card),undefined);assert.match(card.textContent,/当前节点与任务反馈不一致/);await click(button('重新读取当前反馈',card));assert.deepEqual(fixture.writes,[]);
});
for(const state of ['published','result_unknown','running_operation','claimed_handoff','obsolete_video'])test('SYNTHETIC '+state+' cannot expose a fresh media rework authorization',async t=>{
 const input=pausedMediaFeedbackJob();if(state==='published')input.publication_reports=[{id:'SYNTHETIC-publication',title:'SYNTHETIC',published_at:null,publication_source:'owner-report',created_at:'2026-10-20T00:00:00Z'}];else if(state==='result_unknown')input.facts={execution_condition:'result_unknown',material_problems:[]};else if(state==='running_operation')input.operations=[{id:'SYNTHETIC-running',revision:2,mode_epoch:3,status:'running',node:'video',plan:'{}',checkpoint:'{}',result:null,lease_until:1}];else if(state==='claimed_handoff')input.facts={native_preparation_handoff:{status:'claimed'},material_problems:[]};else {input.milestones.at(-1).revision=1;input.milestones.push({...milestone('video','awaiting_human','9'),artifact_version:2});}
 const fixture=await mount(t,{initial:input});await settle();assert.equal(document.querySelector('[data-media-rework-recovery]'),null);assert.deepEqual(fixture.writes,[]);
});
test('other paused tasks have a visible link that opens their actual recovery controls',async t=>{
 const input=job();input.status='paused';const fixture=await mount(t,{initial:input});await settle();const link=document.querySelector('.production-current a[href="#production-recovery"]');assert.ok(link);await act(async()=>{history.replaceState(null,'','/production?job='+input.id+'#production-recovery');window.dispatchEvent(new HashChangeEvent('hashchange'));});await settle();assert.equal(document.getElementById('production-recovery').open,true);assert.equal(scrolled,'production-recovery');assert.deepEqual(fixture.writes,[]);
});
function automaticReworkGrantJob(){
 const input=pausedMediaFeedbackJob(),m=input.milestones.at(-1),owner='SYNTHETIC-owner';input.status='approved';input.error=null;input.reviews=[{id:'SYNTHETIC-saved-feedback',revision:input.revision,content_hash:m.artifact_hash,decision:'revise',reviewer:owner,note:m.report},{id:'SYNTHETIC-grant',revision:input.revision,content_hash:m.artifact_hash,decision:'media_rework_requested',reviewer:owner,note:JSON.stringify({schema:'owner-media-rework-v2',node:'video',milestone_id:m.id,artifact_hash:m.artifact_hash,artifact_version:m.artifact_version,revision:input.revision,mode_epoch:input.mode_epoch,contract_hash:input.contract_hash,script_hash:input.approved_hash,feedback_id:'SYNTHETIC-saved-feedback',feedback_report:m.report,reason:input.review_note,cumulative_reworks:input.reworks,max_new_artifact_version:m.artifact_version+1,max_new_versions:1,quality_approval:false,new_paid_authorization:false,publication_authorization:false})}];return input;
}
for(const exact of [true,false])test('saved automatic feedback has a queued next-version status only with its exact current owner grant '+exact,async t=>{
 const input=automaticReworkGrantJob();if(!exact)input.reviews.at(-1).note=input.reviews.at(-1).note.replace('SYNTHETIC-saved-feedback','SYNTHETIC-other-feedback');const fixture=await mount(t,{initial:input});await settle();const header=document.querySelector('.production-current');if(exact){assert.match(header.querySelector('.production-status').textContent,/修改意见已排队，继续自动制作/);assert.match(header.textContent,/后台将继续自动制作下一版，再送你审片/);assert.doesNotMatch(header.textContent,/等待本人决定/);}else assert.doesNotMatch(header.textContent,/修改意见已排队，继续自动制作/);assert.deepEqual(fixture.writes,[]);
});
test('the automatic local video review explains that one feedback submission schedules its next version',async t=>{
 const input=pausedMediaFeedbackJob();input.status='approved';input.milestones.at(-1).status='awaiting_human';input.milestones.at(-1).report=null;const fixture=await mount(t,{initial:input});await settle();await click(tab('素材与制作'));assert.match(document.getElementById('video-review').textContent,/填写修改意见并打回后，后台会按本次意见自动制作下一版/);assert.deepEqual(fixture.writes,[]);
});

function rateLimitedJob(){
 const input=job();Object.assign(input,{revision:0,review_mode:'auto',status:'waiting_executor',drafts:[],milestones:[],error:'Codex CLI CLI_RATE_LIMITED; SYNTHETIC immutable evidence'});
 input.checkpoint=JSON.stringify({cli_failure:{schema:'text-cli-failure-v1',stage:'script',code:'CLI_RATE_LIMITED',binding:{job_id:input.id,revision:input.revision,mode_epoch:input.mode_epoch,contract_hash:input.contract_hash},confirmed_no_result:true,result_unknown:false,output_present:false,process_exited:true,tool_events:0,terminal_rate_limit:true,process_receipt_sha256:'1'.repeat(64),event_log_sha256:'2'.repeat(64),prompt_sha256:'3'.repeat(64),finished_at:new Date(Date.now()-1000).toISOString(),next_retry_at:new Date(Date.now()+600000).toISOString()}});return input;
}

for(const phase of ['first-draft','rewrite','source-review','script-review'])test('verified rate limit truthfully identifies '+phase+' and preserves existing work without asking the owner to retry',async t=>{
 const input=rateLimitedJob(),review=phase.endsWith('-review');
 if(phase!=='first-draft'){const existing=job();input.revision=existing.revision;input.drafts=existing.drafts;if(review){input.status='awaiting_review';input.milestones=existing.milestones;const node=phase.slice(0,-7);for(const m of input.milestones)m.status=m.node===node?'awaiting_ai':'approved';}const checkpoint=JSON.parse(input.checkpoint),failure=checkpoint.cli_failure;failure.stage=review?phase:'script';failure.binding.revision=input.revision;if(review){const m=input.milestones.find(m=>m.node===phase.slice(0,-7));Object.assign(failure.binding,{review_milestone_id:m.id,artifact_hash:m.artifact_hash});}input.checkpoint=JSON.stringify(checkpoint);}
 const before=structuredClone(input),fixture=await mount(t,{initial:input});await settle();const card=document.querySelector('[data-cli-recovery="cooldown"]');assert.ok(card);assert.equal(card.closest('details'),null);
 if(review){assert.match(card.textContent,/本次审核未返回结果，已有口播及已通过节点保留；退避后继续当前审核/);assert.match(card.textContent,/已回传的口播 v2 与已通过节点保留/);assert.doesNotMatch(card.textContent,/没有返回草稿|没有生成新版稿件|首版口播稿尚未回传/);const handoff=document.querySelector('.job-next-step');assert.ok(handoff);assert.match(handoff.textContent,/等待系统完成来源与口播审核/);assert.match(handoff.textContent,/全部通过前不会提前开始媒体制作/);assert.doesNotMatch(handoff.textContent,/缺少录音时先录制|缺少材料会停在此处/);}else{assert.match(card.textContent,/限流.*没有返回草稿/);assert.match(card.textContent,phase==='first-draft'?/首版口播稿尚未回传/:/已回传的口播 v2.*本轮没有生成新版稿件/);}
 assert.match(card.textContent,/最早接续时间/);assert.equal(card.querySelector('time').dateTime,JSON.parse(input.checkpoint).cli_failure.next_retry_at);assert.equal(button('确认接续本任务'),undefined);assert.equal(button('确认恢复（不重置预算）'),undefined);assert.equal(button('重新核对执行状态',card).disabled,false);assert.deepEqual(fixture.writes,[]);
 await click(button('重新核对执行状态',card));assert.deepEqual(fixture.writes,[],'state check is GET only');assert.deepEqual(input,before,'copy changes preserve draft, approvals, failure evidence, cooldown and counts');
});

test('ordinary quota observation alone cannot block other authorized quota or replace the actual failure cooldown',async t=>{
 const input=rateLimitedJob(),reset=new Date(Date.now()+86400000).toISOString();input.cli_capacity={source:'codex-app.get_usage_limits',ordinary_allowed:false,used_percent:100,resets_at:reset,observed_at:new Date().toISOString()};const fixture=await mount(t,{initial:input});await settle();const card=document.querySelector('[data-cli-recovery="cooldown"]');assert.ok(card);assert.match(card.textContent,/模型请求受到限流/);assert.match(card.textContent,/最早接续时间/);assert.equal(card.querySelector('time').dateTime,JSON.parse(input.checkpoint).cli_failure.next_retry_at);assert.notEqual(card.querySelector('time').dateTime,reset);assert.equal(button('确认接续本任务'),undefined);assert.equal(button('确认恢复（不重置预算）'),undefined);assert.deepEqual(fixture.writes,[]);
});

test('unverified CLI exit has Chinese read-only reconciliation and cannot use retry or a mode switch',async t=>{
 const input=rateLimitedJob();input.status='failed';input.checkpoint='{}';input.error='Codex CLI CLI_NONZERO_EXIT; inspect immutable cli-process-exit.json; no automatic retry';const fixture=await mount(t,{initial:input});await settle();const card=document.querySelector('[data-cli-recovery="result-unknown"]');assert.ok(card);assert.match(card.textContent,/核对原始回执与已有产物/);assert.doesNotMatch(card.textContent,/CLI_NONZERO_EXIT|cli-process-exit/);assert.equal(button('确认接续本任务'),undefined);assert.equal(button('确认恢复（不重置预算）'),undefined);assert.equal(document.querySelector('.mode-options').disabled,true);assert.ok(document.querySelector('#production-recovery details pre').textContent.includes(input.error),'technical diagnostics remain preserved in collapsed details');await type(document.querySelector('[aria-label="审核或恢复理由"]'),'SYNTHETIC 只读核对原回执');assert.equal(button('全程转人工节点').disabled,true);await click(button('重新核对执行状态',card));assert.deepEqual(fixture.writes,[]);
});

test('verified owner continuation has an explicit reason gate and uses the actual recovery action once',async t=>{
 const input=rateLimitedJob();input.status='failed';input.review_mode='node';const checkpoint=JSON.parse(input.checkpoint);checkpoint.cli_failure.next_retry_at=new Date(Date.now()-1000).toISOString();input.checkpoint=JSON.stringify(checkpoint);const fixture=await mount(t,{initial:input});await settle();const card=document.querySelector('[data-cli-recovery="manual-retry"]');assert.ok(card);const continueButton=button('确认接续本任务',card);assert.equal(continueButton.disabled,true);assert.match(card.textContent,/填写理由后可确认接续/);await type(card.querySelector('[aria-label="本次安全接续理由"]'),'SYNTHETIC 已核对本次限流无产物，按原任务接续');assert.equal(continueButton.disabled,false);await click(continueButton);assert.deepEqual(fixture.writes,[{action:'decision',id:input.id,choice:'retry',note:'SYNTHETIC 已核对本次限流无产物，按原任务接续'}]);
});

test('selected saved automatic mode stays consistent when its parallel list response still contains the older manual mode',async t=>{
 const input=job();input.review_mode='auto';const fixture=await mount(t,{initial:input,fetcher:async url=>url==='/api/production'?response({jobs:[{...input,...productionWorkspacePlacement(input),title:'SYNTHETIC older list snapshot',review_mode:'node',status_label:'等待审核'}]}):undefined});await settle();assert.match(document.querySelector('.production-task-items small').textContent,/总自动化/);assert.doesNotMatch(document.querySelector('.production-task-items small').textContent,/人工节点/);assert.match(document.querySelector('.production-saved-mode').textContent,/当前已保存：总自动化/);assert.equal(document.querySelectorAll('.mode-options input')[1].checked,true);assert.deepEqual(fixture.writes,[]);
});

test('rejected mode write keeps the saved controls and task label on the previous mode',async t=>{
 const input=job(),fixture=await mount(t,{initial:input,postError:'SYNTHETIC 模式未保存'});await settle();await click(document.querySelectorAll('.mode-options input')[1]);assert.equal(document.querySelectorAll('.mode-options input')[0].checked,true);assert.match(document.querySelector('.production-task-items small').textContent,/人工节点/);assert.match(document.querySelector('.production-saved-mode').textContent,/当前已保存：人工节点/);assert.match(document.querySelector('.production-page-error').textContent,/模式未保存/);assert.deepEqual(fixture.writes,[{action:'mode',id:input.id,mode:'auto',mode_epoch:input.mode_epoch}]);
});

test('an old failed attempt remains historical after the real next draft returns for review',async t=>{
 const input=job();input.review_mode='auto';input.checkpoint=rateLimitedJob().checkpoint;input.status='awaiting_review';input.reviews=[{id:'SYNTHETIC-failed-attempt',decision:'executor_failure_v1',note:JSON.stringify({revision:0,attempt:1,failed_at:'2026-10-20T00:00:00Z',reason:'Codex CLI CLI_RATE_LIMITED; SYNTHETIC immutable evidence'})}];const fixture=await mount(t,{initial:input});await settle();assert.equal(document.querySelector('[data-cli-recovery]'),null);assert.match(document.querySelector('.production-status').textContent,/等待节点审核/);assert.equal(document.querySelector('.script-reader-body').textContent,JSON.parse(input.drafts[0].content).script);assert.ok(document.querySelector('#production-recovery').textContent.includes('执行失败历史'));assert.deepEqual(fixture.writes,[]);
});

function approvedPreparationJob(){
 const input=job();input.status='approved';input.approved_revision=input.revision;input.approved_hash=input.drafts[0].content_hash;input.milestones.forEach(m=>m.status='approved');
 const binding={revision:input.revision,script_hash:input.approved_hash,mode_epoch:input.mode_epoch,contract_hash:input.contract_hash},scope={schema:'owner-media-scope-v1',id:'SYNTHETIC-preparation-scope',scope:'preparation',binding,confirmed_at:'2026-10-20T00:00:00Z',authorization_source:'included-free-preparation',owner_confirmed:false,new_paid_authorization:false,publication_authorization:false,quality_approved:false};
 input.media_continuation={current_id:scope.id,scope,licenses:[]};input.stages=['media_inventory','media_inputs'].map((stage,i)=>({id:'SYNTHETIC-probe-'+i,stage,status:'blocked',review_revision:input.revision,review_hash:input.approved_hash,result:JSON.stringify({schema:'media-input-probe-v1',scope_id:scope.id,binding,attempt:1,receipt:{checks:[{code:'SYNTHETIC-source',passed:false,detail:'SYNTHETIC 真实操作录屏尚未绑定本稿'}]}})}));
 input.facts={candidate_present:false,execution_preparation:null,material_problems:[],native_preparation_handoff:{queue_id:'native_prep_'+'5'.repeat(64),binding:{...binding,scope_id:scope.id,scope:scope.scope},status:'blocked',editing_allowed:false,lease_until:null,lease_expired:false,missing:[{code:'required-demonstration-missing',detail:'SYNTHETIC 需要对应本稿的真实操作录屏'},{code:'preparation-only-scope',detail:'SYNTHETIC 当前仅允许准备，不能剪辑成片'}],checkpoint:{note:'SYNTHETIC 已保存本轮准备回执',artifacts:[]}}};return input;
}

test('approved preparation-only task exposes actual blockers and a real scope preview on the primary card',async t=>{
 const input=approvedPreparationJob(),fixture=await mount(t,{initial:input});await settle();const card=document.querySelector('.production-current [data-media-production-progress]');assert.ok(card);assert.equal(card.closest('details'),null);assert.match(card.textContent,/当前仅做准备，审阅视频待启动/);assert.match(card.textContent,/SYNTHETIC 需要对应本稿的真实操作录屏/);assert.ok(card.querySelector('a[href="#media-plan-input"]'));assert.ok(card.querySelector('a[href="#script-feedback"]'));assert.equal(document.querySelector('.production-saved-mode').textContent,'当前已保存：人工节点');
 await click(button('开始制作审阅视频',card));const preview=card.querySelector('[data-private-video-scope-preview]');assert.ok(preview);assert.equal(button('确认并排队审阅视频制作',preview).disabled,true);assert.deepEqual(fixture.writes,[],'opening the exact preview is read-only');await click(preview.querySelector('input[type=checkbox]'));await click(button('确认并排队审阅视频制作',preview));assert.equal(fixture.writes.length,1);const {request_id,...saved}=fixture.writes[0];assert.match(request_id,/^[a-f0-9-]{36}$/);assert.deepEqual(saved,{action:'media_scope_confirm',id:input.id,binding:input.media_continuation.scope.binding,scope:'private-video',confirmed:true,current_id:input.media_continuation.current_id});
});

test('the media panel replaces empty startup placeholders with current blockers and preserves the actual existing entries',async t=>{
 const input=approvedPreparationJob(),fixture=await mount(t,{initial:input});await settle();await click(tab('素材与制作'));const panel=document.querySelector('[data-production-panel=media]');assert.ok(panel.querySelector('[data-media-production-progress="blocked"]'));assert.doesNotMatch(document.getElementById('video-review').textContent,/等待已授权素材与本机启动/);assert.match(document.getElementById('video-review').textContent,/当前仅做准备/);assert.match(document.getElementById('cover-review').textContent,/封面尚未回传/);assert.ok(document.getElementById('native-preparation-progress'));assert.ok(document.getElementById('media-next-step'));assert.deepEqual(fixture.writes,[]);
});

test('current private video authorization does not ask for the same scope again and a claimed handoff is not called a completed video',async t=>{
 const input=approvedPreparationJob(),scope=input.media_continuation.scope;scope.scope='private-video';scope.owner_confirmed=true;scope.authorization_source='owner-private-video';const h=input.facts.native_preparation_handoff;h.binding.scope='private-video';h.editing_allowed=true;h.status='claimed';h.lease_until=Date.now()+600000;h.missing=[];const fixture=await mount(t,{initial:input});await settle();const card=document.querySelector('.production-current [data-media-production-progress="claimed"]');assert.ok(card);assert.match(card.textContent,/当前执行器正在接手本版准备/);assert.equal(button('开始制作审阅视频',card),undefined);assert.doesNotMatch(card.textContent,/成片已生成|成片已完成|需要再次确认/);assert.deepEqual(fixture.writes,[]);
});

test('expired preparation keeps reconciliation read-only and completed preparation alone never claims a video exists',async t=>{
 const input=approvedPreparationJob(),scope=input.media_continuation.scope;scope.scope='private-video';scope.owner_confirmed=true;scope.authorization_source='owner-private-video';const h=input.facts.native_preparation_handoff;h.binding.scope='private-video';h.editing_allowed=true;h.status='claimed';h.lease_until=Date.now()-1000;h.lease_expired=true;const fixture=await mount(t,{initial:input});await settle();let card=document.querySelector('.production-current [data-media-production-progress="receipt-unknown"]');assert.ok(card);assert.match(card.textContent,/不直接重复制作/);assert.equal(button('开始制作审阅视频',card),undefined);await click(button('重新读取制作进度',card));assert.deepEqual(fixture.writes,[]);h.status='completed';h.lease_expired=false;fixture.setJob(input);await click(button('重新读取与恢复连接'));card=document.querySelector('.production-current [data-media-production-progress="returned"]');assert.ok(card);assert.match(card.textContent,/尚未读到本版成片候选/);assert.doesNotMatch(document.querySelector('.production-current').textContent,/成片已生成，待回传/);assert.deepEqual(fixture.writes,[]);
});

