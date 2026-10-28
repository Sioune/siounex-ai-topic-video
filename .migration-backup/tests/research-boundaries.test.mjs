// SYNTHETIC isolated SQLite, RSS and import fixtures. No live requests, model,
// production state, real media verification or user decisions are performed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {assertD1PatternLimit} from './research-d1-fixture.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const OWNER = 'SYNTHETIC-research-owner';
const source = {id: 'SYNTHETIC-feed', name: 'SYNTHETIC 中文来源', url: 'https://official.example.org/feed', hosts: ['official.example.org'], language: 'zh', aiOnly: true};
globalThis.__researchBoundarySources = [source];
const built = await build({stdin: {contents: ["export * from './lib/research';", "export {refreshFeeds} from './lib/store';", "export {ingest,validateEntries} from './lib/editorial';", "export {createJob,getJob} from './lib/production';", "export {materializeSource} from './lib/dispatch';", "export {saveProvidedSource} from './lib/source-input';"].join('\n'), resolveDir: process.cwd()}, bundle: true, platform: 'node', format: 'esm', write: false, footer: {js: '//# sourceURL=synthetic-research-boundaries-under-test.mjs'}, plugins: [{name: 'synthetic-research-boundaries', setup(b) {
  b.onResolve({filter: /^cloudflare:workers$/}, () => ({path: 'env', namespace: 'fixture'}));
  b.onResolve({filter: /sources\.json$/}, () => ({path: 'sources', namespace: 'fixture'}));
  b.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({contents: args.path === 'env' ? 'export const env={get DB(){return globalThis.__researchBoundaryDb}}' : 'export default globalThis.__researchBoundarySources'}));
}}]});
const p = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
const migrations = fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort().map(f => fs.readFileSync('drizzle/' + f, 'utf8'));
function fixture(t) {
  const sql = new DatabaseSync(':memory:'); for (const migration of migrations) sql.exec(migration);
  class Statement {constructor(query, args = []) {this.query = query; this.args = args;} bind(...args) {return new Statement(this.query, args);} async first() {assertD1PatternLimit(this.query, this.args); return sql.prepare(this.query).get(...this.args) || null;} async all() {assertD1PatternLimit(this.query, this.args); return {results: sql.prepare(this.query).all(...this.args)};} async run() {assertD1PatternLimit(this.query, this.args); return {meta: {changes: Number(sql.prepare(this.query).run(...this.args).changes)}};}}
  globalThis.__researchBoundaryDb = {prepare: query => new Statement(query), async batch(statements) {for (const s of statements) assertD1PatternLimit(s.query, s.args); sql.exec('BEGIN'); try {const results = statements.map(s => ({meta: {changes: Number(sql.prepare(s.query).run(...s.args).changes)}})); sql.exec('COMMIT'); return results;} catch (e) {sql.exec('ROLLBACK'); throw e;}}};
  sql.prepare("INSERT INTO app_state VALUES('seeds_v1','SYNTHETIC no real seeds')").run();
  const oldFetch = globalThis.fetch; globalThis.fetch = async () => {throw Error('SYNTHETIC fixture forbids network');};
  t.after(() => {sql.close(); delete globalThis.__researchBoundaryDb; globalThis.fetch = oldFetch;});
  return {sql};
}
function result() {return {title: 'SYNTHETIC 人工智能研究资料文章', summary: '这是一份带出处的合成研究资料，不代表真实联网调查。'.repeat(3), article: '# SYNTHETIC 资料\n\n' + '本资料属于合成测试，不代表联网研究或真实产品事实。它用于检查文章与来源绑定，未知发布日期保持未知，不把研究笔记当成原网页字节快照。'.repeat(5) + '\n出处记录 [S1] 和另一条独立出处 [S2]。', sources: [{id: 'S1', url: 'https://official.example.org/same-story', title: 'SYNTHETIC first source', publisher: 'SYNTHETIC publisher one', published_at: null, retrieved_at: '2026-10-16T08:00:00Z', summary: 'SYNTHETIC first research source note', access: 'opened'}, {id: 'S2', url: 'https://research.example.com/b', title: 'SYNTHETIC second source', publisher: 'SYNTHETIC publisher two', published_at: null, retrieved_at: '2026-10-16T08:00:00Z', summary: 'SYNTHETIC second source note', access: 'opened'}], gaps: ['SYNTHETIC 未实测'], queries: ['SYNTHETIC original release']};}
async function readyTopic(f) {
  const r = result(), created = await p.createResearch(OWNER, {request_id: 'SYNTHETIC-create', input: {keywords: 'SYNTHETIC 人工智能', direction: '来源核对', clue_url: null}}), claim = await p.claimResearch(created.research.id, {request_id: 'SYNTHETIC-claim', executor: 'SYNTHETIC'});
  await p.completeResearch(created.research.id, {request_id: 'SYNTHETIC-complete', lease_token: claim.lease_token, result: r, provenance: {model: 'SYNTHETIC', started_at: '2026-10-16T08:00:00Z', finished_at: '2026-10-16T08:01:00Z', search_count: 1, opened_urls: r.sources.map(s => s.url), queries: r.queries, prompt_sha256: 'a'.repeat(64), output_sha256: 'b'.repeat(64), events_sha256: 'c'.repeat(64), paid_media_calls: 0}});
  const used = await p.useResearch(created.research.id, OWNER, {request_id: 'SYNTHETIC-use', version: 1, article_sha256: sha(r.article)});
  return {research: created.research.id, topic: f.sql.prepare('SELECT * FROM topics WHERE id=?').get(used.topic.id), result: r};
}
function protectedRows(f, id) {return clone({topic: f.sql.prepare('SELECT * FROM topics WHERE id=?').get(id), research: f.sql.prepare("SELECT key,value FROM app_state WHERE key LIKE 'research_%' ORDER BY key").all(), jobs: f.sql.prepare('SELECT * FROM production_jobs ORDER BY id').all(), favorites: f.sql.prepare('SELECT * FROM favorites ORDER BY user_id,topic_id').all(), dispositions: f.sql.prepare('SELECT * FROM dispositions ORDER BY user_id,topic_id').all()});}
function externalEntry(r, changes = {}) {return {url: r.sources[0].url, source: 'SYNTHETIC 外部中文报道', title: r.title, summary: '人工智能工具更新的中文来源报道，用于测试真实的导入与去重边界。'.repeat(4), angle: 'SYNTHETIC 不覆盖研究综合稿', materials: 'SYNTHETIC 未观看任何媒体', risk: 'SYNTHETIC 本机测试，未核验真实产品', published_at: new Date(Date.now() - 3600000).toISOString(), ...changes};}

test('SYNTHETIC matching feed title and related source URL cannot replace a selected research topic or its frozen production snapshot', async t => {
  const f = fixture(t), ready = await readyTopic(f);
  await p.createJob(ready.topic.id, OWNER);
  f.sql.prepare('INSERT INTO favorites VALUES(?,?,?)').run(OWNER, ready.topic.id, 'SYNTHETIC retain');
  f.sql.prepare('INSERT INTO dispositions VALUES(?,?,?,?)').run(OWNER, ready.topic.id, 'rejected', 'SYNTHETIC retain');
  const before = protectedRows(f, ready.topic.id), entry = externalEntry(ready.result); let reads = 0;
  globalThis.fetch = async url => {reads++; assert.equal(url, source.url); return new Response('<rss><channel><item><title>' + entry.title + '</title><link>' + entry.url + '</link><pubDate>' + new Date(entry.published_at).toUTCString() + '</pubDate><description>' + entry.summary + '</description></item></channel></rss>');};
  const refresh = await p.refreshFeeds(); assert.equal(reads, 1); assert.equal(refresh.added, 1); assert.equal(refresh.updated, 0);
  assert.deepEqual(protectedRows(f, ready.topic.id), before);
  const external = f.sql.prepare('SELECT * FROM topics WHERE url=?').get(entry.url);
  assert.ok(external); assert.notEqual(external.id, ready.topic.id); assert.equal(external.source_id, source.id);
});

test('SYNTHETIC similar editorial import adds an external topic while explicit research-ID replacement rejects the complete batch', async t => {
  const f = fixture(t), ready = await readyTopic(f), before = protectedRows(f, ready.topic.id), entry = externalEntry(ready.result);
  const rejected = p.validateEntries([{...entry, url: 'https://official.example.org/SYNTHETIC-first'}, {...entry, existing_id: ready.topic.id}]);
  await assert.rejects(() => p.ingest(rejected), /研究/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM topics').get().n, 1);
  assert.deepEqual(protectedRows(f, ready.topic.id), before);
  f.sql.prepare("UPDATE app_state SET value='0' WHERE key='refresh_lock'").run();
  const imported = await p.ingest(p.validateEntries([entry])); assert.equal(imported.added, 1); assert.equal(imported.updated, 0);
  assert.deepEqual(protectedRows(f, ready.topic.id), before);
  assert.equal(f.sql.prepare('SELECT source_id FROM topics WHERE url=?').get(entry.url).source_id, 'editorial-zh');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n, 0);
});

test('SYNTHETIC owner-provided full text cannot replace or silently override a frozen research dossier', async t => {
  const f = fixture(t), ready = await readyTopic(f), j = (await p.createJob(ready.topic.id, OWNER)).job, before = protectedRows(f, ready.topic.id);
  const body = {revision: j.revision, mode_epoch: j.mode_epoch, contract_hash: j.contract_hash, source_snapshot_hash: sha(j.source_snapshot), content: 'SYNTHETIC replacement owner-provided text. '.repeat(20)};
  await assert.rejects(() => p.saveProvidedSource(j.id, OWNER, body), error => error.status === 409);
  assert.deepEqual(protectedRows(f, ready.topic.id), before);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM app_state WHERE key LIKE 'source_input_v1:%'").get().n, 0);
  const material = await p.materializeSource(j.id, j.revision, j.mode_epoch, j.contract_hash, async () => {throw Error('SYNTHETIC no fetch expected');});
  assert.ok(material.content.includes(ready.result.article)); assert.ok(!material.content.includes(body.content));
});
