// SYNTHETIC contract fixtures only. No search, network, model or production calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const built = await build({stdin: {contents: "export * from './lib/research-contract';", resolveDir: process.cwd()}, bundle: true, platform: 'node', format: 'esm', write: false, footer: {js: '//# sourceURL=synthetic-research-contract-under-test.mjs'}});
const p = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
const clone = value => JSON.parse(JSON.stringify(value));
const input = () => ({keywords: 'SYNTHETIC 研究关键词', direction: '核对明确出处、差异和未知事项', clue_url: null});
const source = (id, url) => ({id, url, title: 'SYNTHETIC ' + id + ' original title', publisher: 'SYNTHETIC source publisher', published_at: null, retrieved_at: '2026-10-16T08:00:00Z', summary: 'SYNTHETIC 来源记录摘要，未归档或验收原网页完整字节。', access: 'opened'});
const result = () => ({title: 'SYNTHETIC 中文研究资料文章', summary: '这是一份用于隔离测试的中文资料，不是实际联网研究。', article: '# SYNTHETIC 中文资料\n\n' + '本资料属于合成测试，不代表联网研究或真实产品事实。它用于检查文章与来源绑定，未知发布日期保持未知，不把研究笔记当成原网页字节快照。'.repeat(5) + '\n第一条出处记录 [S1]。第二条独立出处记录 [S2]。', sources: [source('S1', 'https://official.example.org/a'), source('S2', 'https://research.example.com/b')], gaps: ['SYNTHETIC 未核验任何真实产品或媒体'], queries: ['SYNTHETIC official release', 'SYNTHETIC independent paper']});
const provenance = () => ({model: 'SYNTHETIC', started_at: '2026-10-16T08:00:00Z', finished_at: '2026-10-16T08:01:00Z', search_count: 2, opened_urls: result().sources.map(s => s.url), queries: result().queries, prompt_sha256: 'a'.repeat(64), output_sha256: 'b'.repeat(64), events_sha256: 'c'.repeat(64), paid_media_calls: 0});

test('SYNTHETIC research input accepts a concrete direction and a public clue without altering caller data', () => {
  const original = input(), before = clone(original), normalized = p.normalizeResearchInput(original);
  assert.equal(normalized.keywords, original.keywords);
  assert.equal(normalized.direction, original.direction);
  assert.equal(normalized.clue_url, null);
  assert.deepEqual(original, before);
  assert.equal(p.normalizeResearchInput({...original, clue_url: 'https://official.example.org/a'}).clue_url, 'https://official.example.org/a');
});

test('SYNTHETIC blank and oversized research input is rejected before any provider operation', () => {
  assert.throws(() => p.normalizeResearchInput({keywords: '', direction: '', clue_url: null}));
  for (const change of [{keywords: 'x'.repeat(5000)}, {direction: '中'.repeat(20001)}]) assert.throws(() => p.normalizeResearchInput({...input(), ...change}));
  assert.equal(p.normalizeResearchInput({keywords: '', direction: input().direction, clue_url: null}).direction, input().direction);
});

test('SYNTHETIC clue URLs cannot name private, credentialed, non-HTTPS or local network targets', () => {
  for (const clue_url of ['http://official.example.org/a', 'https://user:pass@official.example.org/a', 'https://127.0.0.1/a', 'https://10.1.2.3/a', 'https://172.16.0.1/a', 'https://192.168.1.2/a', 'https://169.254.169.254/a', 'https://[::1]/a', 'https://localhost/a', 'https://internal.local/a', 'file:///C:/SYNTHETIC', 'javascript:alert(1)']) assert.throws(() => p.normalizeResearchInput({...input(), clue_url}), clue_url);
});

test('SYNTHETIC article keeps two distinct opened sources, honest missing dates and explicit gaps', () => {
  const original = result(), before = clone(original), normalized = p.normalizeResearchResult(original);
  assert.equal(normalized.article, original.article);
  assert.equal(normalized.sources.length, 2);
  assert.equal(normalized.sources[0].published_at, null);
  assert.equal(Date.parse(normalized.sources[0].retrieved_at), Date.parse(original.sources[0].retrieved_at));
  assert.deepEqual(normalized.gaps, original.gaps);
  assert.deepEqual(original, before);
});

test('SYNTHETIC short or non-Chinese article, missing citations and unknown citation identifiers cannot masquerade as a finished dossier', () => {
  for (const article of ['短文 [S1] [S2]', 'SYNTHETIC English only. '.repeat(30) + ' [S1] [S2]', result().article.replaceAll('[S2]', ''), result().article + ' Invented reference [S99].']) assert.throws(() => p.normalizeResearchResult({...result(), article}));
});

test('SYNTHETIC the research result cannot smuggle publication, media or quality authorization fields', () => {
  for (const extra of [{quality_approved: true}, {media_authorized: true}, {publication_authorized: true}]) assert.throws(() => p.normalizeResearchResult({...result(), ...extra}));
});

test('SYNTHETIC duplicate IDs, duplicate URLs, one-host stories and unopened references do not satisfy the multi-source requirement', () => {
  const mutations = [
    r => {r.sources[1].id = 'S1';},
    r => {r.sources[1].url = r.sources[0].url;},
    r => {r.sources[1].url = 'https://official.example.org/another';},
    r => {r.sources[1].access = 'search-only';},
    r => {r.sources = r.sources.slice(0, 1);},
    r => {r.sources = Array.from({length: 9}, (_, i) => source('S' + (i + 1), 'https://source' + i + '.example.org/article'));},
  ];
  for (const mutation of mutations) {const r = result(); mutation(r); assert.throws(() => p.normalizeResearchResult(r));}
});

test('SYNTHETIC malformed source metadata and unsafe source URLs are rejected without inventing publication dates', () => {
  for (const change of [{title: ''}, {publisher: ''}, {published_at: 'SYNTHETIC unknown date'}, {retrieved_at: 'not a timestamp'}, {summary: ''}, {summary: 'x'.repeat(1401)}, {url: 'https://172.16.0.1/article'}]) {
    const r = result(); Object.assign(r.sources[0], change); assert.throws(() => p.normalizeResearchResult(r));
  }
});

test('SYNTHETIC structured provenance retains search/open receipts and explicitly records zero paid media calls', () => {
  const value = provenance(), before = clone(value), normalized = p.normalizeResearchProvenance(value);
  assert.equal(normalized.model, value.model);
  assert.equal(normalized.search_count, 2);
  assert.deepEqual(normalized.opened_urls, value.opened_urls);
  assert.equal(normalized.paid_media_calls, 0);
  assert.equal(normalized.events_sha256, value.events_sha256);
  assert.deepEqual(value, before);
});

test('SYNTHETIC missing or inconsistent provenance, fake receipt hashes and media costs cannot finish research', () => {
  for (const change of [{model: ''}, {started_at: 'bad'}, {finished_at: '2026-10-16T07:59:59Z'}, {search_count: 0}, {search_count: 1.5}, {prompt_sha256: 'wrong'}, {output_sha256: ''}, {events_sha256: null}, {opened_urls: ['https://127.0.0.1/internal']}, {paid_media_calls: 1}]) assert.throws(() => p.normalizeResearchProvenance({...provenance(), ...change}));
});

test('SYNTHETIC optional bounded retrieval receipts preserve raw and extracted hashes with distinct scopes', () => {
  const receipt = {url: 'https://official.example.org/a', resolved_url: 'https://official.example.org/current', sha256: 'd'.repeat(64), extract_sha256: 'e'.repeat(64), bytes: 1234, extracted_chars: 432, retrieved_at: '2026-10-16T08:00:00Z', extraction: 'bounded-text'};
  const normalized = p.normalizeResearchProvenance({...provenance(), retrievals: [receipt]});
  assert.deepEqual(normalized.retrievals, [receipt]);
  assert.notEqual(normalized.retrievals[0].sha256, normalized.retrievals[0].extract_sha256);
  for (const change of [{bytes: 2200001}, {extracted_chars: 100001}, {sha256: 'not-a-hash'}, {resolved_url: 'https://169.254.169.254/internal'}, {extraction: 'full-original-archive'}]) assert.throws(() => p.normalizeResearchProvenance({...provenance(), retrievals: [{...receipt, ...change}]}));
});
