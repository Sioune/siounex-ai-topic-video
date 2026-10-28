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
async function mount(t, fetcher,platform={publications:[],collections:[],connections:[],existing_publications:[],existing_collections:[],existing_candidates:[]}) {
  document.body.innerHTML = '<div id="root"></div>';
  const previous = globalThis.fetch;
  globalThis.fetch = (url, options) => String(url).startsWith('/api/data-collections') ? Promise.resolve(response({collections: []})) : url==='/api/publishing' ? Promise.resolve(response(platform)) : fetcher(url, options);
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

test('SYNTHETIC empty records show an honest start state and local section links without duplicate cross-page navigation', async t => {
  let reads = 0;
  await mount(t, async (url, options = {}) => {assert.equal(url, '/api/data-center'); assert.equal(options.method, 'GET'); reads++; return response(empty());});
  assert.equal(reads, 1);
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
 assert.ok(document.querySelector('.data-empty'));assert.equal(document.querySelector('.platform-performance-overview'),null);
});

test('SYNTHETIC real response counts, history/export/provenance and correction payload survive the design change', async t => {
  const data = populated(), original = structuredClone(data), writes = [];
  await mount(t, async (url, options = {}) => {if (options.method === 'POST') writes.push(JSON.parse(options.body)); return response(data);});
  assert.deepEqual([...document.querySelectorAll('.data-overview dd')].map(e => e.textContent), ['2', '0', '0', '1']);
  assert.match(document.querySelector('.data-overview').textContent, /3 条版本记录/);
  assert.match(document.getElementById('data-review').textContent, /复盘数据尚未回传/);
  assert.match(document.getElementById('data-original-review').textContent, /SYNTHETIC corrected title/);
  assert.equal(document.querySelector('a[href="/api/data-center?format=history_csv"]').textContent, '下载全部历史 CSV');
  assert.equal(document.querySelector('a[href="/api/data-center?evidence=SYNTHETIC-evidence"]').textContent.trim(), '打开原图');
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
  await mount(t, async (url, options = {}) => {if (options.method === 'POST') writes.push(JSON.parse(options.body)); return response(data);});
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
});

test('SYNTHETIC recommendation form preserves new-to-old linkage and measured exposure without granting production permissions', async t => {
  const writes = [];
  await mount(t, async (url, options = {}) => {assert.equal(url, '/api/data-center'); if (options.method === 'POST') writes.push(JSON.parse(options.body)); return response(populated());});
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
