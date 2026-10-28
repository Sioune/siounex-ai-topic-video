import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import React,{act} from 'react';
import {defaultView,NAV_KEY,navigationUrl,readEntry,viewFromUrl} from '../lib/topic-navigation.ts';
const requireTest=createRequire(process.env.TOPIC_TEST_PACKAGE||new URL('../.sites-runtime/test-deps/package.json',import.meta.url));
const {JSDOM}=requireTest('jsdom');
const A='t_'+'a'.repeat(24),B='t_'+'b'.repeat(24),C='t_'+'c'.repeat(24);
let dom,root,current,scrollY=0,rootElement;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function setup(url='https://topic.test/'){
 dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url,pretendToBeVisual:true});
 for(const k of ['window','document','HTMLElement','HTMLInputElement','Element','Node','NodeFilter','Event','MouseEvent','KeyboardEvent','CustomEvent','MutationObserver','DocumentFragment'])globalThis[k]=dom.window[k];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
 globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.requestAnimationFrame=cb=>dom.window.requestAnimationFrame(cb);globalThis.cancelAnimationFrame=id=>dom.window.cancelAnimationFrame(id);
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;scrollY=0;Object.defineProperty(dom.window,'scrollY',{get:()=>scrollY});Object.defineProperty(dom.window,'innerWidth',{value:393});Object.defineProperty(dom.window,'innerHeight',{value:852});
 dom.window.scrollTo=(a,b)=>{scrollY=typeof a==='object'?a.top||0:b||0};dom.window.history.scrollRestoration='auto';
 rootElement=document.getElementById('root');
}
setup();
const {createRoot}=await import('react-dom/client');
const {useTopicNavigation}=await import('../.sites-runtime/navigation-under-test.mjs');
const ids=new Set([A,B,C]);
function Harness({knownIds=ids}){const nav=useTopicNavigation(knownIds);current=nav;return React.createElement('main',{},React.createElement('input',{id:'topic-search'}),...[A,B,C].map(id=>React.createElement('article',{'data-topic-id':id,key:id},React.createElement('button',{className:'card-main','data-open':id,onClick:()=>nav.openDetail(id)},id))),nav.detail?React.createElement('section',{className:'topic-detail-sheet',role:'dialog'},React.createElement('button',{'data-close':'list',onClick:nav.closeDetail},'返回列表'),React.createElement('button',{'data-close':'x',onClick:nav.closeDetail},'关闭详情')):null)}
async function mount(knownIds=ids){root=createRoot(rootElement);await act(async()=>{root.render(React.createElement(React.StrictMode,{},React.createElement(Harness,{knownIds})));await sleep(0)});await settle()}
async function settle(){await act(async()=>{await sleep(50)});await act(async()=>{await sleep(25)})}
async function action(fn){await act(async()=>{fn();await sleep(10)});await settle()}
async function unmount(){await act(async()=>root.unmount());assert.equal(window.history.scrollRestoration,'auto')}
function state(){return readEntry(window.history.state)}
function clickOpen(id){document.querySelector(`[data-open="${id}"]`).click()}
function clickClose(){document.querySelector('[data-close="list"]').click()}
const passed=[];
// Parser preserves unrelated URL state and safely handles malformed topic ids.
assert.deepEqual(viewFromUrl(new URL('https://topic.test/?q=%E6%9C%BA%E5%99%A8%E4%BA%BA&tab=saved&time=7&sort=evil')),{...defaultView,q:'机器人',tab:'saved',time:'7'});
assert.equal(navigationUrl('https://topic.test/?external=keep#section',{...defaultView,q:'声音'},A),'/?external=keep&q=%E5%A3%B0%E9%9F%B3&topic='+A+'#section');
assert.equal(readEntry({[NAV_KEY]:{version:1}}),null);passed.push('URL parsing / unrelated query and hash / invalid state');
// A real earlier history entry must remain reachable after repeated detail cycles.
window.history.replaceState({frameworkMarker:'keep'},'','/before');window.history.pushState({frameworkMarker:'keep'},'','/?external=keep#section');
await mount();const baseLength=window.history.length;assert.equal(baseLength,2);assert.equal(window.history.state.frameworkMarker,'keep');
await action(()=>{current.setFilter('q','声音');current.setFilter('category','声音音乐');current.setFilter('time','7');current.setFilter('material','有演示线索');current.setFilter('sort','score');current.setFilter('tab','saved')});
await action(()=>current.setLimit(36));scrollY=1470;await action(()=>window.dispatchEvent(new Event('scroll')));
const wantedView={...current.view};await action(()=>{clickOpen(A);clickOpen(A)});assert.equal(window.history.length,baseLength+1);assert.equal(current.detail,A);assert.equal(state().list.limit,36);assert.equal(state().list.scrollY,1470);assert(window.location.search.includes('external=keep'));assert.equal(window.location.hash,'#section');passed.push('User open pushes exactly one detail entry with filters, page limit, scroll and focus');
await action(()=>window.history.back());assert.equal(current.detail,null);assert.deepEqual(current.view,wantedView);assert.equal(current.limit,36);assert.equal(scrollY,1470);assert.equal(document.activeElement.closest('[data-topic-id]')?.dataset.topicId,A);passed.push('History back restores list snapshot and focus');
await action(()=>window.history.forward());assert.equal(current.detail,A);assert.equal(state().kind,'detail');passed.push('History forward reopens same detail');
await action(()=>{current.closeDetail();current.closeDetail()});assert.equal(current.detail,null);assert.equal(window.location.pathname,'/');assert.equal(current.closing,false);passed.push('Double close issues one back, stays on list');
for(let i=0;i<20;i++){await action(()=>clickOpen(i%2?A:B));await action(()=>clickClose());assert.equal(current.detail,null)}assert.equal(window.history.length,baseLength+1);await action(()=>window.history.back());assert.equal(window.location.pathname,'/before');passed.push('20 repeated open-close cycles do not stack duplicate list history');
await unmount();dom.window.close();
// Refresh/remount keeps the existing parent marker and adds no history entry.
setup();await mount();scrollY=890;await action(()=>current.setLimit(54));await action(()=>clickOpen(A));const count=window.history.length,parent=state().parentListId;await unmount();await mount();assert.equal(current.detail,A);assert.equal(window.history.length,count);assert.equal(state().parentListId,parent);await action(()=>clickClose());assert.equal(current.detail,null);assert.equal(current.limit,54);assert.equal(scrollY,890);passed.push('Detail reload/remount keeps parent, loaded count and list scroll without extra push');
await action(()=>clickOpen(A));await action(()=>current.openDetail(B));assert.equal(window.history.length,count);assert.equal(current.detail,B);await action(()=>window.history.back());assert.equal(current.detail,null);await action(()=>window.history.forward());assert.equal(current.detail,B);passed.push('Switching A to B replaces one detail entry');
await unmount();dom.window.close();
// Direct links do not manufacture history or trap users; explicit close remains in Site.
setup('https://topic.test/?q=AI&topic='+A+'&external=keep#notes');await mount();assert.equal(current.detail,A);assert.equal(state().parentListId,null);assert.equal(window.history.length,1);await action(()=>clickClose());assert.equal(current.detail,null);assert.equal(window.history.length,1);assert.equal(current.view.q,'AI');assert.equal(window.location.search,'?q=AI&external=keep');assert.equal(window.location.hash,'#notes');passed.push('Direct deep link closes with replace; preserves filters and unrelated URL state');
await unmount();dom.window.close();
setup('https://topic.test/?topic=bad-id&q=AI');await mount();assert.equal(current.detail,null);assert(!window.location.search.includes('topic'));assert(current.notice);assert.equal(window.history.length,1);await unmount();dom.window.close();
setup('https://topic.test/?topic='+A);await mount(null);assert.equal(current.detail,A);await act(async()=>root.render(React.createElement(Harness,{knownIds:new Set([B])})));await settle();assert.equal(current.detail,null);assert(current.notice);passed.push('Invalid/missing topic exits safely only after data is ready');await unmount();dom.window.close();
setup();await mount();await action(()=>clickOpen(A));await action(()=>{window.history.back();});await action(()=>window.history.forward());assert.equal(current.detail,A);assert.equal(pendingDialogCount(),1);await action(()=>window.dispatchEvent(new Event('pageshow')));assert.equal(current.detail,A);assert.equal(window.history.length,2);passed.push('Rapid traversal and pageshow do not duplicate history/listeners');await unmount();dom.window.close();
function pendingDialogCount(){return document.querySelectorAll('[role=dialog]').length}
console.log('PASS '+passed.length+' navigation groups:\n- '+passed.join('\n- '));
console.log('Boundary: JSDOM + real React hooks + same-document History API, viewport numbers and scrolling are simulated. No Safari/Android native gesture or pixel-layout claim.');
