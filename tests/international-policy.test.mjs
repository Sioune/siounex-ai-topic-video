// SYNTHETIC policy and HTTP fixtures only. No real feeds, tasks, media, model or network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundled = await build({
  stdin: {contents: [
    "export * from './lib/collection-policy';",
    "export {readSourceText,parseFeed,filterTopics} from './lib/feed';",
    "export {findDuplicate} from './lib/dedupe';",
  ].join('\n'), resolveDir: process.cwd()},
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const p = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
const now = Date.parse('2026-10-16T08:00:00Z');
const source = {id: 'SYNTHETIC-official', name: 'SYNTHETIC official', url: 'https://official.example.org/feed', hosts: ['official.example.org'], language: 'en', aiOnly: true};
const item = (changes = {}) => ({url: 'https://official.example.org/SYNTHETIC', title: 'Introducing Zephyrcanvas', summary: 'SYNTHETIC original feed text.', published: '2026-10-16T07:00:00Z', ...changes});

test('SYNTHETIC official AI source can retain a product title without an AI keyword; general research still requires AI relevance', () => {
  const announcement = item({title: 'A useful new canvas', summary: ''});
  assert.equal(p.eligibleItems(source, [announcement], now).length, 1);
  const general = {...source, id: 'SYNTHETIC-general', aiOnly: false};
  assert.equal(p.eligibleItems(general, [announcement], now).length, 0);
  assert.equal(p.eligibleItems(general, [item({title: 'AI assistants for a reproducible science workflow'})], now).length, 1);
  for (const title of [
    'Machine learning for reproducible science',
    'Improving neural networks with a stable objective',
    'Reinforcement learning with sparse rewards',
    'Large language models under distribution shift',
    'Diffusion models with precise frame control',
  ]) assert.equal(p.eligibleItems(general, [item({title})], now).length, 1, title);
  assert.equal(p.eligibleItems(source, [item({title: 'Quarterly results and valuation update'})], now).length, 0);
});

test('SYNTHETIC collection rejects missing, invalid, stale and future publication dates and retains the exact thirty-day boundary', () => {
  for (const published of [null, '', 'SYNTHETIC no date', new Date(now - 30 * 86400000 - 1).toISOString(), new Date(now + 1).toISOString()]) {
    assert.deepEqual(p.eligibleItems(source, [item({published})], now), [], String(published));
  }
  const boundary = item({published: new Date(now - 30 * 86400000).toISOString()});
  assert.deepEqual(p.eligibleItems(source, [boundary], now), [boundary]);
  const recent = item({url: source.url + '/recent', published: new Date(now).toISOString()});
  assert.deepEqual(p.eligibleItems(source, [boundary, recent], now), [recent, boundary]);
});

test('SYNTHETIC English source text stays in English and a missing summary has an explicit fallback without invented translation', () => {
  const english = item({summary: 'SYNTHETIC original English summary, preserved verbatim.'});
  assert.equal(p.sourceLanguage(source, english), 'en');
  assert.equal(p.sourceBrief(english, 'en'), english.summary);
  assert.equal(p.sourceBrief(item({summary: ''}), 'en'), '该订阅未提供摘要，请打开外文原文核读。');
  assert.match(p.sourceRisk('en'), /未自动翻译/);
  assert.match(p.sourceRisk('en'), /未逐篇深度核读/);
  assert.equal(p.eligibleItems({...source, language: 'zh'}, [english], now).length, 0);
});

test('SYNTHETIC international and Chinese collection share one fifty-item China-calendar-day window', () => {
  assert.equal(p.DAILY_TOPIC_LIMIT, 50);
  const before = p.dailyWindow(Date.parse('2026-10-15T15:59:59.999Z'));
  const after = p.dailyWindow(Date.parse('2026-10-15T16:00:00.000Z'));
  assert.deepEqual(before, {day: '2026-10-15', start: '2026-10-14T16:00:00.000Z', end: '2026-10-15T16:00:00.000Z'});
  assert.deepEqual(after, {day: '2026-10-16', start: '2026-10-15T16:00:00.000Z', end: '2026-10-16T16:00:00.000Z'});
});

test('SYNTHETIC same-source relative HTTPS redirect retains the complete final body', async () => {
  const calls = [], body = '<rss><channel><title>SYNTHETIC full final feed</title></channel></rss>';
  const read = await p.readSourceText(source.url, source, async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    return calls.length === 1 ? new Response(null, {status: 301, headers: {location: '/rss/current.xml'}}) : new Response(body);
  });
  assert.deepEqual(calls, [source.url, 'https://official.example.org/rss/current.xml']);
  assert.equal(read, body);
});

test('SYNTHETIC cross-source, HTTP, credential, unconfigured subdomain and private redirect targets never get fetched', async t => {
  for (const target of [
    'https://another-approved-source.example.org/feed',
    'http://official.example.org/insecure',
    'https://user:pass@official.example.org/private',
    'https://sub.official.example.org/feed',
    'https://127.0.0.1/internal',
    'https://10.0.0.1/internal',
    'https://[::1]/internal',
    'https://localhost/internal',
    'https://internal.local/feed',
  ]) await t.test(target, async () => {
    const calls = [];
    await assert.rejects(() => p.readSourceText(source.url, source, async url => {
      calls.push(url);
      return new Response(null, {status: 302, headers: {location: target}});
    }), /白名单/);
    assert.deepEqual(calls, [source.url]);
  });
});

test('SYNTHETIC source redirect loops stop after three followed redirects; three redirects may still reach a final response', async () => {
  let calls = 0;
  await assert.rejects(() => p.readSourceText(source.url, source, async () => {
    calls++;
    return new Response(null, {status: 307, headers: {location: '/feed'}});
  }), /重定向过多/);
  assert.equal(calls, 4);
  calls = 0;
  const text = await p.readSourceText(source.url, source, async () => {
    calls++;
    return calls <= 3 ? new Response(null, {status: 308, headers: {location: '/hop-' + calls}}) : new Response('SYNTHETIC final body');
  });
  assert.equal(calls, 4);
  assert.equal(text, 'SYNTHETIC final body');
});

test('SYNTHETIC redirect without a location fails visibly instead of reading its body as a feed', async () => {
  let calls = 0;
  await assert.rejects(() => p.readSourceText(source.url, source, async () => {
    calls++;
    return new Response('SYNTHETIC redirect body is not a feed', {status: 301});
  }), /缺少目标/);
  assert.equal(calls, 1);
});

test('SYNTHETIC RSS item hosts use the same exact source whitelist as full-source reads', () => {
  const xml = '<rss><channel>' + [
    ['Allowed article', 'https://official.example.org/article'],
    ['Unconfigured subdomain', 'https://sub.official.example.org/article'],
    ['Another configured source', 'https://another-approved-source.example.org/article'],
    ['Private target', 'https://127.0.0.1/article'],
  ].map(([title, url]) => `<item><title>${title}</title><link>${url}</link><pubDate>Fri, 16 Oct 2026 07:00:00 GMT</pubDate></item>`).join('') + '</channel></rss>';
  assert.deepEqual(p.parseFeed(xml, source, now).map(row => row.url), ['https://official.example.org/article']);
});

test('SYNTHETIC unrelated English articles with an identical generic feed summary remain separate while URL identity still replays', () => {
  const summary = 'SYNTHETIC original research demonstration for developers with detailed examples and reproducible software.';
  const previous = {id: 'SYNTHETIC-old', url: 'https://official.example.org/orchid', title: 'Introducing Orchidvoice', original_title: 'Introducing Orchidvoice', summary, published_at: '2026-10-16T07:00:00Z', related_urls: '[]'};
  const candidate = {url: 'https://official.example.org/zephyr', title: 'Introducing Zephyrcanvas', summary, published_at: '2026-10-16T07:01:00Z'};
  assert.equal(p.findDuplicate(candidate, [previous]), undefined);
  assert.equal(p.findDuplicate({...candidate, url: previous.url}, [previous]), previous);
  assert.equal(p.findDuplicate({...candidate, title: previous.title}, [previous]), previous);
});

test('SYNTHETIC pending international topics are visible in the shared pool while disposition filters stay effective', () => {
  const base = {id: 'SYNTHETIC-foreign', title: 'SYNTHETIC English article', original_title: 'SYNTHETIC English article', summary: '', source: 'SYNTHETIC official', angle: '', category: '视觉影像', material: '待核实', content_lang: 'en', published_at: '2026-10-16T07:00:00Z', score: 60, disposition: 'pending'};
  const filter = {q: '', category: 'all', time: 'all', material: 'all', tab: 'all', sort: 'score'};
  assert.deepEqual(p.filterTopics([base], filter, now), [base]);
  assert.deepEqual(p.filterTopics([{...base, disposition: 'rejected'}], filter, now), []);
  assert.equal(p.filterTopics([{...base, disposition: 'produced'}], {...filter, tab: 'produced'}, now).length, 1);
});
