// SYNTHETIC React/JSDOM view fixtures and intercepted HTTP only. No real data writes or pixel-layout claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React, {act} from 'react';
import {METRICS, typeComparison} from '../lib/data-contract.mts';

const require = createRequire(new URL('../package.json', import.meta.url));
const {JSDOM} = createRequire(process.env.TOPIC_TEST_PACKAGE || new URL('../.sites-runtime/test-deps/package.json', import.meta.url))('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {url: 'https://synthetic.test/data', pretendToBeVisual: true});
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'DocumentFragment']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', {configurable: true, value: dom.window.navigator});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {createRoot} = await import('react-dom/client');
const built = await build({entryPoints: ['components/data-center.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', loader: {'.css': 'empty'}, write: false});
const compiled = {exports: {}};
new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, compiled, compiled.exports);
const DataCenter = compiled.exports.default;
const empty = () => ({current_videos: [], videos: [], current_relations: [], relations: [], samples: [], evidence: [], observations: [], comparison: typeComparison([], []), logical_counts: {videos: 0, video_revisions: 0, relations: 0, relation_revisions: 0, samples: 0}, review: {histories: [], effective_samples: 0, all_sample_records: 0}, analysis_reports: []});
function populated() {
  const first = {id: 'SYNTHETIC-a-before', title: 'SYNTHETIC historical title', topic_type: 'story', published_at: '2026-10-14T12:00:00Z', publication_source: 'SYNTHETIC manual date, not verified online', supersedes_id: null, duration: 56};
  const current = {...first, id: 'SYNTHETIC-a-current', title: 'SYNTHETIC corrected title', supersedes_id: first.id};
  const other = {...first, id: 'SYNTHETIC-b', title: 'SYNTHETIC second work', supersedes_id: null};
  return {...empty(), videos: [first, current, other], current_videos: [current, other], evidence: [{id: 'SYNTHETIC-evidence', file_name: 'SYNTHETIC-panel.png', sha256: 'a'.repeat(64), size_bytes: 10}], logical_counts: {videos: 2, video_revisions: 3, relations: 0, relation_revisions: 0, samples: 0}, review: {histories: [current, other].map(video => ({video, samples: [], latest: null, prior: null, changes: Object.fromEntries(Object.keys(METRICS).map(k => [k, null])), warning: 'SYNTHETIC no samples'})), effective_samples: 0, all_sample_records: 0}};
}
const response = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});
const settle = () => act(async () => {await new Promise(r => setTimeout(r, 0));});
async function mount(t, fetcher,platform={publications:[],collections:[],connections:[],existing_publications:[],existing_collections:[],existing_candidates:[]},passthroughEvidence=false) {
  document.body.innerHTML = '<div id="root"></div>';
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => {if(String(url).startsWith('/api/data-collections'))return response({collections: []});if(url==='/api/publishing')return response(platform);if(url==='/api/data-center?view=workspace')return fetcher('/api/data-center',options);if(!passthroughEvidence&&String(url).includes('view=evidence_')){const r=await fetcher('/api/data-center',options);if(!r.ok)return r;const d=await r.json();return response({evidence:d.evidence,has_more:false})}if(url==='/api/data-center?view=overview'){const r=await fetcher('/api/data-center',options);if(!r.ok)return r;const d=await r.json();return response({logical_counts:d.logical_counts,review:{effective_samples:d.review.effective_samples,all_sample_records:d.review.all_sample_records},analytics:d.analytics,evidence_count:d.evidence.length,video_record_count:d.videos.length});}return fetcher(url,options);};
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {await act(async () => root.unmount()); globalThis.fetch = previous;});
  await act(async () => root.render(React.createElement(DataCenter)));
  await settle();
  return root;
}
async function input(label, value) {
  const element = document.querySelector('[aria-label="' + label + '"]');
  assert.ok(element, label);
  const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
  });
}
async function submit(form) {await act(async () => {form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));}); await settle();}
async function openTools(){await act(async()=>{const d=document.querySelector('.data-tools');d.open=true;d.dispatchEvent(new Event('toggle'));});await settle();}

test('SYNTHETIC empty records show an honest start state and local section links without duplicate cross-page navigation', async t => {
  let reads = 0;
  await mount(t, async (url, options = {}) => {assert.equal(url, '/api/data-center'); assert.equal(options.method, 'GET'); reads++; return response(empty());});
  assert.equal(reads, 1);
  assert.equal(document.querySelector('#data-original-review'),null);
  await openTools(); assert.equal(reads,3);
  assert.deepEqual([...document.querySelectorAll('.data-overview dd')].map(e => e.textContent), ['0', '0', '0', '0']);
  assert.match(document.querySelector('.data-empty').textContent, /先留下一条真实记录/);
  assert.match(document.getElementById('data-comparison').textContent, /暂无符合 22–26 小时窗口的可比采样/);
  assert.equal(document.querySelector('a[href="/production"]'), null);
  assert.equal(document.querySelector('a[href="/"]'), null);
  for (const link of document.querySelectorAll('.data-section-nav a')) assert.ok(document.querySelector(link.getAttribute('href')));
  assert.equal(document.querySelectorAll('form').length, 3);
  assert.equal(document.querySelector('svg.recharts-surface'), null);
});

test('SYNTHETIC failed reads show unknown counts and retry clears the error without a mutation', async t => {
  let calls = 0;
  await mount(t, async (url, options = {}) => {assert.equal(options.method, 'GET'); calls++; return calls === 1 ? response({error: 'SYNTHETIC unavailable'}, 503) : response(empty());});
  assert.match(document.querySelector('[role="alert"]').textContent, /SYNTHETIC unavailable/);
  assert.deepEqual([...document.querySelectorAll('.data-overview dd')].map(e => e.textContent), ['未读取', '未读取', '未读取', '未读取']);
  await act(async () => document.querySelector('.data-refresh').click()); await settle();
  assert.equal(calls, 2);
  assert.equal(document.querySelector('[role="alert"]'), null);
});

for(const malformed of [{publications:[],collections:[]},{publications:[],collections:[],connections:[],accounts:{}},{publications:[],collections:[],connections:[],existing_publications:{}}])test('SYNTHETIC incomplete platform response is isolated and cannot crash manual records '+Object.keys(malformed).join(','),async t=>{
 await mount(t,async(url,options={})=>{assert.equal(url,'/api/data-center');assert.equal(options.method,'GET');return response(empty());},malformed);
 assert.match(document.querySelector('.platform-performance [role="alert"]').textContent,/平台采集回执不完整/);
 assert.deepEqual([...document.querySelectorAll('.data-overview dd')].map(element=>element.textContent),['0','0','0','0']);
 await openTools(); assert.ok(document.querySelector('.data-empty'));assert.equal(document.querySelector('.platform-performance-overview'),null);
});

test('SYNTHETIC real response counts, history/export/provenance and correction payload survive the design change', async t => {
  const data = populated(), original = structuredClone(data), writes = [];
  await mount(t, async (url, options = {}) => {if (options.method === 'POST') writes.push(JSON.parse(options.body)); return response(data);});
  assert.deepEqual([...document.querySelectorAll('.data-overview dd')].map(e => e.textContent), ['2', '0', '0', '1']);
  assert.match(document.querySelector('.data-overview').textContent, /3 条版本记录/);
  assert.match(document.getElementById('data-review').textContent, /复盘数据尚未回传/);
  await openTools();
  assert.match(document.getElementById('data-original-review').textContent, /SYNTHETIC corrected title/);
  assert.equal(document.querySelector('a[href="/api/data-center?format=history_csv"]').textContent, '下载全部历史 CSV');
  assert.equal(document.querySelector('a[href="/api/data-center?evidence=SYNTHETIC-evidence"]').textContent.trim(), '打开原图');
  const videoHistory=document.querySelector('#video-records details');await act(async()=>{videoHistory.open=true;videoHistory.dispatchEvent(new Event('toggle'))});await settle();
  const record = [...document.querySelectorAll('#video-records .data-record')].find(e => e.querySelector('h3').textContent === 'SYNTHETIC corrected title');
  await act(async () => record.querySelector('button').click());
  await input('正式标题', 'SYNTHETIC next correction');
  await submit(document.querySelector('#video-records form'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].action, 'video');
  assert.equal(writes[0].title, 'SYNTHETIC next correction');
  assert.equal(writes[0].supersedes_id, 'SYNTHETIC-a-current');
  assert.equal(writes[0].published_at, '2026-10-14T12:00:00.000Z');
  assert.equal(writes[0].publication_source, data.current_videos[0].publication_source);
  assert.deepEqual(data, original);
});

test('SYNTHETIC grouped sampling form retains null metrics and binds only the chosen source screenshot', async t => {
  const data = populated(), writes = [];
  const confirmed=[];const onConfirmed=e=>confirmed.push(e.detail);document.addEventListener('studio:form-saved',onConfirmed);t.after(()=>document.removeEventListener('studio:form-saved',onConfirmed));
  await mount(t, async (url, options = {}) => {if (options.method === 'POST') writes.push(JSON.parse(options.body)); return response(data);});
  await openTools();
  await input('采样视频', 'SYNTHETIC-a-current');
  await input('实际采样时间', '2026-10-16T20:00');
  await input('播放量', '428');
  await input('平均观看时长（秒）', '12.78');
  await input('采样说明', 'SYNTHETIC screenshot only, unknown counts kept missing');
  await act(async () => document.querySelector('.data-evidence input[type="checkbox"]').click());
  await submit(document.getElementById('sample-form'));
  assert.equal(writes.length, 1);
  const saved = writes[0];
  assert.equal(saved.action, 'sample');
  assert.equal(saved.video_id, 'SYNTHETIC-a-current');
  assert.equal(saved.sample_kind, 'single_t24');
  assert.equal(saved.observed_at, '2026-10-16T12:00:00.000Z');
  assert.equal(saved.metrics.plays, 428);
  assert.equal(saved.metrics.average_duration, 12.78);
  assert.equal(saved.metrics.likes, null);
  assert.equal(saved.metrics.recommendation_views, null);
  assert.deepEqual(saved.evidence_ids, ['SYNTHETIC-evidence']);
  assert.equal(saved.metadata, undefined);
  assert.deepEqual(confirmed,[document.getElementById('sample-form')]);
});

test('SYNTHETIC recommendation form preserves new-to-old linkage and measured exposure without granting production permissions', async t => {
  const writes = [];
  await mount(t, async (url, options = {}) => {assert.equal(url, '/api/data-center'); if (options.method === 'POST') writes.push(JSON.parse(options.body)); return response(populated());});
  await openTools();
  await input('推荐新片', 'SYNTHETIC-a-current');
  await input('被推荐旧片', 'SYNTHETIC-b');
  await input('曝光起点', '53.2');
  await input('曝光终点', '55.6');
  await input('推荐依据', 'SYNTHETIC observed recommendation, no real media verification');
  await submit(document.querySelector('#data-relations form'));
  assert.equal(writes.length, 1);
  const {request_id, ...saved} = writes[0];
  assert.match(request_id, /^[a-f0-9-]{36}$/);
  assert.deepEqual(saved, {action: 'relation', new_video_id: 'SYNTHETIC-a-current', old_video_id: 'SYNTHETIC-b', exposure_start: 53.2, exposure_end: 55.6, evidence_note: 'SYNTHETIC observed recommendation, no real media verification'});
});
test('deep links open full records on demand and select the requested item',async t=>{const original=dom.window.location.href;dom.window.history.replaceState({},'', '/data?video_id=SYNTHETIC-a-current&section=video-records#video-records');globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);dom.window.HTMLElement.prototype.scrollIntoView=function(){};t.after(()=>dom.window.history.replaceState({},'',original));const data=populated(),reads=[];await mount(t,async(url,options={})=>{reads.push(String(url));return response(data)});await settle();assert.ok(document.querySelector('.data-tools').open);assert.ok(reads.includes('/api/data-center'));assert.equal(document.querySelector('[aria-label="正式标题"]').value,'SYNTHETIC corrected title');});
test('raw sample cards fetch only on demand and continue on the next page',async t=>{const initial=populated(),calls=[];const rows=Array.from({length:21},(_,i)=>({id:'SYNTHETIC-sample-'+i,video_id:'SYNTHETIC-a-current',sample_kind:'single_snapshot',relation_id:null,observed_at:'2026-10-15T12:00:00Z',created_at:'2026-10-15T12:00:00Z',metrics:JSON.stringify({plays:i}),evidence_ids:'[]',note:'SYNTHETIC note '+i}));await mount(t,async(url)=>{calls.push(url);if(String(url).includes('view=samples')){const offset=Number(new URL(url,'https://synthetic.test').searchParams.get('offset'));return response({samples:rows.slice(offset,offset+20),has_more:offset===0})}return response(initial)});await openTools();assert(!calls.some(url=>String(url).includes('view=samples')));const section=[...document.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent.includes('查看原始采样记录'));assert.ok(section);await act(async()=>{section.open=true;section.dispatchEvent(new Event('toggle'))});await settle();assert.equal(section.querySelectorAll('article').length,20);await act(async()=>[...section.querySelectorAll('button')].find(b=>b.textContent.includes('查看更多采样')).click());await settle();assert.equal(section.querySelectorAll('article').length,21);assert(calls.some(url=>String(url).includes('offset=20')));assert.match(document.querySelector('.data-overview').textContent,/2/);});
test('per-video history is loaded and paged only when expanded with corrections retained',async t=>{const initial=populated(),calls=[];initial.histories_paged=true;initial.review.histories[0].sample_count=21;const rows=Array.from({length:21},(_,i)=>({id:'SYNTHETIC-history-'+i,video_id:'SYNTHETIC-a-current',sample_kind:'single_snapshot',observed_at:'2026-10-15T12:00:00Z',created_at:'2026-10-15T12:00:00Z',metrics:{...Object.fromEntries(Object.keys(METRICS).map(k=>[k,null])),plays:i},evidence_ids:'[]',details:{text:'SYNTHETIC detail'},effective:i!==0,anchor_kind:'本片发布时间',anchor:'2026-10-14T12:00:00Z',target_hours:null,actual_hours:24}));await mount(t,async(url)=>{calls.push(url);if(String(url).includes('view=history')){const offset=Number(new URL(url,'https://synthetic.test').searchParams.get('offset'));return response({samples:rows.slice(offset,offset+20),has_more:offset===0})}return response(initial)});await openTools();assert(!calls.some(url=>String(url).includes('view=history')));const history=[...document.querySelectorAll('#data-original-review details')].find(d=>d.querySelector('summary')?.textContent.includes('SYNTHETIC corrected title'));assert.ok(history);assert.match(history.textContent,/21 条记录/);await act(async()=>{history.open=true;history.dispatchEvent(new Event('toggle'))});await settle();assert.equal(history.querySelectorAll('article').length,20);assert.match(history.textContent,/已被更正，保留历史/);await act(async()=>[...history.querySelectorAll('button')].find(b=>b.textContent.includes('查看更多本片采样')).click());await settle();assert.equal(history.querySelectorAll('article').length,21);assert(calls.some(url=>String(url).includes('view=history')&&String(url).includes('offset=20')));assert.ok(history.querySelector('#data-sample-SYNTHETIC-history-20 button'));assert.equal(history.querySelector('#data-sample-SYNTHETIC-history-0 button'),null);const beforeCalls=calls.length,priorRaf=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=cb=>{cb();return 0};document.querySelector('#sample-form').scrollIntoView=()=>{};await act(async()=>history.querySelector('#data-sample-SYNTHETIC-history-20 button').click());await settle();globalThis.requestAnimationFrame=priorRaf;assert.equal(document.querySelector('[aria-label="采样视频"]').value,'SYNTHETIC-a-current');assert.equal(document.querySelector('[aria-label="播放量"]').value,'20');assert.equal(calls.length,beforeCalls);assert.equal(document.querySelector('a[href="/api/data-center?format=history_csv"]').textContent,'下载全部历史 CSV');});
test('historical sample anchor opens its video and locates a later-page record',async t=>{const initial=populated(),calls=[];initial.histories_paged=true;initial.review.histories[0].sample_count=25;const rows=Array.from({length:25},(_,i)=>({id:'SYNTHETIC-anchor-'+i,video_id:'SYNTHETIC-a-current',sample_kind:'single_snapshot',observed_at:'2026-10-15T12:00:00Z',created_at:'2026-10-15T12:00:00Z',metrics:{...Object.fromEntries(Object.keys(METRICS).map(k=>[k,null])),plays:i},evidence_ids:'[]',details:{text:'SYNTHETIC anchor detail '+i},effective:true,anchor_kind:'本片发布时间',anchor:'2026-10-14T12:00:00Z',target_hours:null,actual_hours:24}));const priorRaf=globalThis.requestAnimationFrame,priorCancel=globalThis.cancelAnimationFrame,priorScroll=dom.window.HTMLElement.prototype.scrollIntoView;let scrolled;globalThis.requestAnimationFrame=cb=>{cb();return 1};globalThis.cancelAnimationFrame=()=>{};dom.window.HTMLElement.prototype.scrollIntoView=function(){scrolled=this.id};window.history.replaceState({},'','/data#data-sample-SYNTHETIC-anchor-23');t.after(()=>{window.history.replaceState({},'','/data');globalThis.requestAnimationFrame=priorRaf;globalThis.cancelAnimationFrame=priorCancel;dom.window.HTMLElement.prototype.scrollIntoView=priorScroll});await mount(t,async(url)=>{calls.push(url);const u=new URL(url,'https://synthetic.test');if(u.searchParams.get('view')==='history_location')return response({video_id:'SYNTHETIC-a-current',sample:rows[23]});if(u.searchParams.get('view')==='history'){const offset=Number(u.searchParams.get('offset'));return response({samples:rows.slice(offset,offset+20),has_more:offset===0})}return response(initial)});await settle();await settle();const target=document.getElementById('data-sample-SYNTHETIC-anchor-23');assert.ok(target);assert.equal(target.closest('details').open,true);assert.equal(scrolled,target.id);assert(calls.some(url=>String(url).includes('view=history_location')));assert.equal(calls.filter(url=>String(url).includes('view=history&')).length,1);const history=target.closest('details');await act(async()=>[...history.querySelectorAll('button')].find(b=>b.textContent.includes('查看更多本片采样')).click());await settle();assert.equal(history.querySelectorAll('#data-sample-SYNTHETIC-anchor-23').length,1);assert.equal(history.querySelectorAll('article').length,25);});
test('publication history cards load on demand and a historical record remains correctable',async t=>{const initial=populated(),calls=[],writes=[],rows=Array.from({length:21},(_,i)=>({...initial.videos[0],id:'SYNTHETIC-old-'+i,title:'SYNTHETIC old title '+i}));initial.videos.push(...rows);await mount(t,async(url,options={})=>{calls.push(url);if(options.method==='POST')writes.push(JSON.parse(options.body));const u=new URL(url,'https://synthetic.test');if(u.searchParams.get('view')==='videos'){const offset=Number(u.searchParams.get('offset'));return response({videos:rows.slice(offset,offset+20),has_more:offset===0})}return response(initial)});await openTools();assert(!calls.some(url=>String(url).includes('view=videos')));const history=document.querySelector('#video-records details');await act(async()=>{history.open=true;history.dispatchEvent(new Event('toggle'))});await settle();assert.equal(history.querySelectorAll('article').length,20);await act(async()=>[...history.querySelectorAll('button')].find(b=>b.textContent.includes('查看更多发布记录')).click());await settle();assert.equal(history.querySelectorAll('article').length,21);await act(async()=>history.querySelectorAll('article')[20].querySelector('button').click());assert.equal(document.querySelector('[aria-label="正式标题"]').value,'SYNTHETIC old title 20');await input('正式标题','SYNTHETIC corrected old');await submit(document.querySelector('#video-records form'));assert.equal(writes[0].supersedes_id,'SYNTHETIC-old-20');assert.equal(writes[0].publication_source,rows[20].publication_source);assert(calls.some(url=>String(url).includes('view=videos')&&String(url).includes('offset=20')));});
test('evidence picker pages metadata while keeping older selected screenshots visible',async t=>{const initial=populated(),calls=[],items=Array.from({length:21},(_,i)=>({id:'SYNTHETIC-evidence-'+i,file_name:'SYNTHETIC image '+i,sha256:String(i).padStart(64,'0'),size_bytes:10}));initial.evidence=items;await mount(t,async(url)=>{calls.push(url);const u=new URL(url,'https://synthetic.test');if(u.searchParams.get('view')==='evidence_list'){const offset=Number(u.searchParams.get('offset'));return response({evidence:items.slice(offset,offset+20),has_more:offset===0})}if(u.searchParams.get('view')==='evidence_selection')return response({evidence:items.filter(e=>u.searchParams.getAll('selected').includes(e.id))});return response(initial)},undefined,true);await openTools();const picker=document.querySelector('.data-evidence');assert.equal(picker.querySelectorAll('label').length,20);await act(async()=>[...picker.querySelectorAll('button')].find(b=>b.textContent.includes('查看更多截图')).click());await settle();assert.equal(picker.querySelectorAll('label').length,21);const old=[...picker.querySelectorAll('label')].find(l=>l.textContent.includes('SYNTHETIC image 20'));await act(async()=>old.querySelector('input').click());await settle();assert(old.querySelector('input').checked);assert(calls.some(url=>String(url).includes('selected=SYNTHETIC-evidence-20')));});
test('historical relation records load only when opened and preserve full current selection',async t=>{const initial=populated(),calls=[],rows=Array.from({length:21},(_,i)=>({id:'SYNTHETIC-relation-'+i,new_video_id:'SYNTHETIC-a-current',old_video_id:'SYNTHETIC-b',published_anchor:'2026-10-14T12:00:00Z',exposure_start:1,exposure_end:2,evidence_note:'SYNTHETIC relation note '+i}));initial.relations=rows;initial.current_relations=[rows[0]];await mount(t,async(url)=>{calls.push(url);const u=new URL(url,'https://synthetic.test');if(u.searchParams.get('view')==='relations'){const offset=Number(u.searchParams.get('offset'));return response({relations:rows.slice(offset,offset+20),has_more:offset===0})}return response(initial)});await openTools();assert(!calls.some(url=>String(url).includes('view=relations')));await input('采样用途','relation_baseline');assert.equal(document.querySelector('[aria-label="采样推荐关系"]').options.length,2);const history=document.querySelector('#data-relations details');await act(async()=>{history.open=true;history.dispatchEvent(new Event('toggle'))});await settle();assert.equal(history.querySelectorAll('article').length,20);await act(async()=>[...history.querySelectorAll('button')].find(b=>b.textContent.includes('查看更多关系')).click());await settle();assert.match(history.textContent,/SYNTHETIC relation note 20/);assert(calls.some(url=>String(url).includes('view=relations')&&String(url).includes('offset=20')));});
test('correcting an older sample keeps its off-page evidence selectable',async t=>{const initial=populated(),items=Array.from({length:21},(_,i)=>({id:'SYNTHETIC-ev-'+i,file_name:'SYNTHETIC image '+i,sha256:String(i).padStart(64,'0'),size_bytes:10})),calls=[];initial.evidence=items;initial.review.histories[0].samples=[{id:'SYNTHETIC-old-sample',video_id:'SYNTHETIC-a-current',sample_kind:'single_snapshot',relation_id:null,observed_at:'2026-10-15T12:00:00Z',created_at:'2026-10-15T12:00:00Z',metrics:{...Object.fromEntries(Object.keys(METRICS).map(k=>[k,null])),plays:10},evidence_ids:'["SYNTHETIC-ev-20"]',details:{text:'SYNTHETIC retained'},effective:true,anchor_kind:'本片发布时间',anchor:'2026-10-14T12:00:00Z',target_hours:null,actual_hours:24}];await mount(t,async(url)=>{calls.push(url);const u=new URL(url,'https://synthetic.test');if(u.searchParams.get('view')==='evidence_list')return response({evidence:items.slice(0,20),has_more:true});if(u.searchParams.get('view')==='evidence_selection')return response({evidence:items.filter(e=>u.searchParams.getAll('selected').includes(e.id))});return response(initial)},undefined,true);await openTools();const before=document.querySelector('.data-evidence');assert.equal(before.querySelectorAll('label').length,20);const prior=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=cb=>{cb();return 0};document.querySelector('#sample-form').scrollIntoView=()=>{};await act(async()=>document.querySelector('#data-sample-SYNTHETIC-old-sample button').click());await settle();globalThis.requestAnimationFrame=prior;const selected=[...before.querySelectorAll('label')].find(l=>l.textContent.includes('SYNTHETIC image 20'));assert.ok(selected);assert.equal(selected.querySelector('input').checked,true);assert(calls.some(url=>String(url).includes('selected=SYNTHETIC-ev-20')));});
test('historical analysis body loads only when the report is opened',async t=>{const initial=populated(),calls=[],report={request_id:'SYNTHETIC-report',title:'SYNTHETIC report title',created_at:'2026-10-10T00:00:00Z',markdown:'SYNTHETIC complete historical analysis',attachments:[{library_file_id:'libfile_abcdef',label:'SYNTHETIC report attachment'}]};initial.analysis_reports=[{request_id:report.request_id,title:report.title,created_at:report.created_at,attachments:report.attachments}];await mount(t,async(url)=>{calls.push(url);const u=new URL(url,'https://synthetic.test');if(u.searchParams.get('view')==='report')return response({report});return response(initial)});await openTools();assert(!calls.some(url=>String(url).includes('view=report')));assert(!document.body.textContent.includes(report.markdown));const entry=[...document.querySelectorAll('#data-original-review details')].find(d=>d.querySelector('summary')?.textContent.includes(report.title));assert.ok(entry);await act(async()=>{entry.open=true;entry.dispatchEvent(new Event('toggle'))});await settle();assert.match(entry.textContent,/SYNTHETIC complete historical analysis/);assert.equal(entry.querySelector('a').textContent,'SYNTHETIC report attachment');assert(calls.some(url=>String(url).includes('request_id=SYNTHETIC-report')));});
test('failed data save never marks its unsaved form clean',async t=>{const confirmed=[];const listener=e=>confirmed.push(e.detail);document.addEventListener('studio:form-saved',listener);t.after(()=>document.removeEventListener('studio:form-saved',listener));await mount(t,async(_url,options={})=>options.method==='POST'?response({error:'SYNTHETIC failed save'},503):response(populated()));await openTools();await input('正式标题','SYNTHETIC unsaved title');await submit(document.querySelector('#video-records form'));assert.deepEqual(confirmed,[]);assert.equal(document.querySelector('[aria-label="正式标题"]').value,'SYNTHETIC unsaved title');});
