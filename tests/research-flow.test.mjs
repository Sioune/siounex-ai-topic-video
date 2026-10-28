// SYNTHETIC full-migration :memory: SQLite integration tests. No network, real CLI,
// model, media, production task or owner decision is executed or claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {dispatch} from '../scripts/production-dispatch-executor.mjs';
import {sourceEvidence} from '../scripts/source-evidence.mjs';
import {assertD1PatternLimit} from './research-d1-fixture.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const OWNER = 'SYNTHETIC-research-owner', OTHER = 'SYNTHETIC-other-owner';
const built = await build({stdin: {contents: ["export * from './lib/research';", "export {createJob,getJob,claimJob,submitDraft} from './lib/production';", "export {materializeSource,nextWork} from './lib/dispatch';", "export {GET as researchGET,POST as researchPOST} from './app/api/research/route';"].join('\n'), resolveDir: process.cwd()}, bundle: true, platform: 'node', format: 'esm', write: false, footer: {js: '//# sourceURL=synthetic-research-flow-under-test.mjs'}, plugins: [{name: 'synthetic-research-db', setup(b) {
  b.onResolve({filter: /^\.\/store$/}, () => ({path: 'db', namespace: 'fixture'}));
  b.onResolve({filter: /(?:^|\/)chatgpt-auth$/}, () => ({path: 'auth', namespace: 'fixture'}));
  b.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({contents: args.path === 'auth' ? 'export async function getChatGPTUser(){return globalThis.__researchBrowserOwner?{userId:globalThis.__researchBrowserOwner}:null}' : 'export function db(){return globalThis.__researchFixtureDb} export function siteArchiveBucket(){throw Error("SYNTHETIC research-flow fixture has no archive bucket; archive operations are outside this test")}'}));
}}]});
const p = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
const migrations = fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort().map(f => fs.readFileSync('drizzle/' + f, 'utf8'));
const record = value => value.research || value;
const input = () => ({keywords: 'SYNTHETIC 研究方向', direction: '核对出处、可确认的差异与未知事项', clue_url: null});
function result(label = 'first') {return {title: 'SYNTHETIC 中文资料 ' + label, summary: 'SYNTHETIC：中文综合资料，仅用于本机隔离验证。', article: '# SYNTHETIC 研究资料 ' + label + '\n\n' + '本资料属于合成测试，不代表联网研究或真实产品事实。它用于检查文章与来源绑定，未知发布日期保持未知，不把研究笔记当成原网页字节快照。'.repeat(5) + '\n第一条出处记录 [S1]。第二条独立出处记录 [S2]。', sources: [{id: 'S1', url: 'https://official.example.org/a', title: 'SYNTHETIC first original title', publisher: 'SYNTHETIC official source', published_at: null, retrieved_at: '2026-10-16T08:00:00Z', summary: 'SYNTHETIC 第一条原始研究笔记，未归档完整网页字节。', access: 'opened'}, {id: 'S2', url: 'https://research.example.com/b', title: 'SYNTHETIC second original title', publisher: 'SYNTHETIC independent source', published_at: '2026-10-14T09:00:00Z', retrieved_at: '2026-10-16T08:00:01Z', summary: 'SYNTHETIC 第二条独立研究笔记，摘要和日期不得与第一条混用。', access: 'opened'}], gaps: ['SYNTHETIC 未核验真实产品或媒体'], queries: ['SYNTHETIC official release', 'SYNTHETIC independent paper']};}
const provenance = r => ({model: 'SYNTHETIC', started_at: '2026-10-16T08:00:00Z', finished_at: '2026-10-16T08:01:00Z', search_count: 2, opened_urls: r.sources.map(s => s.url), queries: r.queries, prompt_sha256: 'a'.repeat(64), output_sha256: 'b'.repeat(64), events_sha256: 'c'.repeat(64), paid_media_calls: 0});
function fixture(t) {
  const sql = new DatabaseSync(':memory:'); for (const migration of migrations) sql.exec(migration);
  let batchHook, statementHook;
  const queries = [];
  async function before(query, args) {assertD1PatternLimit(query, args); queries.push({query, args}); if (statementHook) {const hook = statementHook; statementHook = undefined; await hook(query, args);}}
  class Statement {
    constructor(query, args = []) {this.query = query; this.args = args;}
    bind(...args) {return new Statement(this.query, args);}
    async first() {await before(this.query, this.args); return sql.prepare(this.query).get(...this.args) || null;}
    async all() {await before(this.query, this.args); return {results: sql.prepare(this.query).all(...this.args)};}
    async run() {await before(this.query, this.args); return {meta: {changes: Number(sql.prepare(this.query).run(...this.args).changes)}};}
  }
  const db = {prepare: query => new Statement(query), async batch(statements) {
    if (batchHook) {const hook = batchHook; batchHook = undefined; await hook();}
    for (const s of statements) {assertD1PatternLimit(s.query, s.args); queries.push({query: s.query, args: s.args});}
    sql.exec('BEGIN'); try {const results = statements.map(s => ({meta: {changes: Number(sql.prepare(s.query).run(...s.args).changes)}})); sql.exec('COMMIT'); return results;} catch (e) {sql.exec('ROLLBACK'); throw e;}
  }};
  globalThis.__researchFixtureDb = db;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {throw Error('Forbidden network operation in SYNTHETIC research fixture');};
  t.after(() => {sql.close(); delete globalThis.__researchFixtureDb; delete globalThis.__researchBrowserOwner; globalThis.fetch = oldFetch;});
  return {sql, db, queries, beforeBatch: fn => {batchHook = fn;}, beforeStatement: fn => {statementHook = fn;}};
}
function snapshot(f) {return clone(Object.fromEntries(f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name}) => [name, f.sql.prepare('SELECT * FROM "' + name + '" ORDER BY rowid').all()])));}
async function rejectsUnchanged(f, task, statuses = [400, 403, 404, 409]) {const before = snapshot(f); await assert.rejects(task, error => statuses.includes(error.status)); assert.deepEqual(snapshot(f), before);}
async function queued(f, request_id = 'SYNTHETIC-create') {return record(await p.createResearch(OWNER, {request_id, input: input()}));}
async function finished(f, suffix = '') {const j = await queued(f, 'SYNTHETIC-create' + suffix), claim = await p.claimResearch(j.id, {request_id: 'SYNTHETIC-claim' + suffix, executor: 'SYNTHETIC researcher'}), r = result(); const body = {request_id: 'SYNTHETIC-complete' + suffix, lease_token: claim.lease_token, result: r, provenance: provenance(r)}; return {research: record(await p.completeResearch(j.id, body)), claim, body, result: r};}
function rawResearch(f, id) {const row = f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('research_v1:' + id); return {raw: row.value, value: JSON.parse(row.value)};}
function mutate(f, id, fn) {const current = rawResearch(f, id); fn(current.value); f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(current.value), 'research_v1:' + id);}
function latestTopic(f) {return f.sql.prepare('SELECT * FROM topics ORDER BY rowid DESC LIMIT 1').get();}
function rateLimitDiagnostic(j,patch={}){return {schema:'text-cli-failure-v1',stage:'keyword-discovery',code:'CLI_RATE_LIMITED',confirmed_no_result:true,result_unknown:false,output_present:false,process_exited:true,tool_events:0,terminal_rate_limit:true,process_receipt_sha256:'d'.repeat(64),event_log_sha256:'e'.repeat(64),prompt_sha256:'f'.repeat(64),finished_at:new Date().toISOString(),retry_after_seconds:120,research_binding:{id:j.id,input_hash:j.input_hash,attempt:j.attempt,version:j.version},...patch};}
async function use(f, research, suffix = '') {const latest = f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('research_version_v1:' + research.id + ':' + research.version); const v = JSON.parse(latest.value); return p.useResearch(research.id, OWNER, {request_id: 'SYNTHETIC-use' + suffix, version: research.version, article_sha256: v.article_sha256});}

test('SYNTHETIC D1 fixture enforces the 50-byte LIKE/GLOB limit including UTF-8 and the former 67-byte UUID pattern', async t => {
  const f = fixture(t), oldPattern = 'research_version_v1:research_00000000-0000-0000-0000-000000000000:%';
  f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('SYNTHETIC-present-row', '{}');
  assert.equal(Buffer.byteLength(oldPattern), 67);
  await assert.rejects(() => f.db.prepare('SELECT value FROM app_state WHERE key LIKE ?').bind(oldPattern).all(), /D1_ERROR.*50 bytes/);
  await assert.rejects(() => f.db.prepare('SELECT value FROM app_state WHERE key GLOB ?').bind('字'.repeat(17)).all(), /D1_ERROR.*50 bytes/);
  assert.throws(() => assertD1PatternLimit("SELECT value FROM app_state WHERE key LIKE '" + 'x'.repeat(51) + "'"), /50 bytes/);
  await f.db.prepare('SELECT ? AS ignored FROM app_state WHERE key LIKE ?').bind('x'.repeat(70), 'x'.repeat(50)).all();
  await f.db.prepare("SELECT '?' AS ignored FROM app_state WHERE key GLOB ?").bind('x'.repeat(50)).all();
});

test('SYNTHETIC D1-safe version reads skip version-zero scans, use key ranges for ready records and preserve the original create receipt', async t => {
  const f = fixture(t), body = {request_id: 'SYNTHETIC-original-create-receipt', input: {keywords: 'roadster 特斯拉', direction: '', clue_url: null}};
  const created = await p.createResearch(OWNER, body), id = created.research.id;
  assert.equal(created.research.version, 0); assert.deepEqual(created.research.versions, []);
  await p.getResearch(id, OWNER); await p.listResearch(OWNER); await p.nextResearch();
  assert.equal(f.queries.some(s => s.args.some(a => typeof a === 'string' && a.startsWith('research_version_v1:'))), false, 'version zero must not query immutable version rows');
  const claim = await p.claimResearch(id, {request_id: 'SYNTHETIC-D1-claim', executor: 'SYNTHETIC'}), r = result();
  await p.completeResearch(id, {request_id: 'SYNTHETIC-D1-complete', lease_token: claim.lease_token, result: r, provenance: provenance(r)});
  const before = snapshot(f), replay = await p.createResearch(OWNER, body), detail = await p.getResearch(id, OWNER), listed = await p.listResearch(OWNER);
  assert.equal(replay.replayed, true); assert.equal(replay.research.id, id); assert.equal(replay.research.version, 1);
  assert.deepEqual(detail.versions.map(v => v.version), [1]); assert.deepEqual(listed[0].versions.map(v => v.version), [1]);
  assert.deepEqual(snapshot(f), before);
  const ranges = f.queries.filter(s => /key\s*>=\s*\?\s+AND\s+key\s*<\s*\?/i.test(s.query));
  assert.ok(ranges.length >= 3); assert.ok(ranges.every(s => s.args[0] === 'research_version_v1:' + id + ':' && s.args[1] === s.args[0] + '\uffff'));
  assert.equal(f.queries.some(s => /(?:LIKE|GLOB)\s*\?/i.test(s.query)), false);
});

test('SYNTHETIC create requests replay once, isolate owners and reject different input under the same request ID', async t => {
  const f = fixture(t), body = {request_id: 'SYNTHETIC-create', input: input()};
  const [one, two] = await Promise.all([p.createResearch(OWNER, body), p.createResearch(OWNER, body)]);
  assert.equal(record(one).id, record(two).id);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM app_state WHERE key LIKE 'research_v1:%'").get().n, 1);
  await rejectsUnchanged(f, () => p.createResearch(OWNER, {...body, input: {...input(), direction: 'SYNTHETIC different direction'}}), [409]);
  const theirs = record(await p.createResearch(OTHER, body)); assert.notEqual(theirs.id, record(one).id);
  await rejectsUnchanged(f, () => p.getResearch(record(one).id, OTHER), [403, 404]);
  assert.equal(record(one).status, 'queued');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n, 0);
});

test('SYNTHETIC real browser routes preserve identity and same-origin checks and never trust a forged body owner', async t => {
  const f = fixture(t), origin = 'https://synthetic.test', body = {action: 'create', request_id: 'SYNTHETIC-http-create', owner_id: OTHER, input: input()};
  const post = (payload = body, headers = {}) => p.researchPOST(new Request(origin + '/api/research', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin, ...headers}, body: JSON.stringify(payload)}));
  const before = snapshot(f);
  assert.equal((await p.researchGET(new Request(origin + '/api/research'))).status, 401);
  assert.equal((await post()).status, 403); assert.deepEqual(snapshot(f), before);
  globalThis.__researchBrowserOwner = OWNER;
  assert.equal((await post(body, {Origin: 'https://different.test'})).status, 403); assert.deepEqual(snapshot(f), before);
  const response = await post(); assert.equal(response.status, 200); const owned = (await response.json()).research;
  assert.equal(owned.owner_id, OWNER);
  const theirs = record(await p.createResearch(OTHER, {request_id: 'SYNTHETIC-http-other', input: input()}));
  const listed = await p.researchGET(new Request(origin + '/api/research')); const text = await listed.text();
  assert.ok(text.includes(owned.id)); assert.ok(!text.includes(theirs.id));
  assert.equal((await p.researchGET(new Request(origin + '/api/research?id=' + theirs.id))).status, 403);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n, 0);
});

test('SYNTHETIC research claim is exclusive and incomplete, canceled or expired work cannot return an article', async t => {
  const f = fixture(t), j = await queued(f);
  const claims = await Promise.allSettled([p.claimResearch(j.id, {request_id: 'SYNTHETIC-claim-one', executor: 'SYNTHETIC one'}), p.claimResearch(j.id, {request_id: 'SYNTHETIC-claim-two', executor: 'SYNTHETIC two'})]);
  assert.equal(claims.filter(r => r.status === 'fulfilled').length, 1);
  const claim = claims.find(r => r.status === 'fulfilled').value, r = result();
  await rejectsUnchanged(f, () => p.completeResearch(j.id, {request_id: 'SYNTHETIC-bad-lease', lease_token: 'SYNTHETIC invalid', result: r, provenance: provenance(r)}), [409]);
  await p.cancelResearch(j.id, OWNER, {request_id: 'SYNTHETIC-cancel', expected_version: 0});
  await rejectsUnchanged(f, () => p.completeResearch(j.id, {request_id: 'SYNTHETIC-after-cancel', lease_token: claim.lease_token, result: r, provenance: provenance(r)}), [409]);
  assert.equal((await p.getResearch(j.id, OWNER)).version, 0);
});

test('SYNTHETIC exact completion replays without adding a version and conflicting completion cannot overwrite immutable provenance', async t => {
  const f = fixture(t), done = await finished(f), before = snapshot(f);
  const replay = await p.completeResearch(done.research.id, done.body);
  assert.equal(replay.replayed, true); assert.deepEqual(snapshot(f), before);
  await rejectsUnchanged(f, () => p.completeResearch(done.research.id, {...done.body, result: result('different')}), [409]);
  const changedSource = clone(done.result); changedSource.sources[0].summary += ' SYNTHETIC changed note';
  await rejectsUnchanged(f, () => p.completeResearch(done.research.id, {...done.body, result: changedSource}), [409]);
  assert.equal((await p.getResearch(done.research.id, OWNER)).version, 1);
});

test('SYNTHETIC completion verifies opened URLs against provenance and refuses unsupported citations without partial writes', async t => {
  const f = fixture(t), j = await queued(f), claim = await p.claimResearch(j.id, {request_id: 'SYNTHETIC-claim', executor: 'SYNTHETIC'}), r = result();
  await rejectsUnchanged(f, () => p.completeResearch(j.id, {request_id: 'SYNTHETIC-incomplete-open', lease_token: claim.lease_token, result: r, provenance: {...provenance(r), opened_urls: [r.sources[0].url]}}));
  await rejectsUnchanged(f, () => p.completeResearch(j.id, {request_id: 'SYNTHETIC-fake-citation', lease_token: claim.lease_token, result: {...r, article: r.article + ' [S99]'}, provenance: provenance(r)}));
  assert.equal((await p.getResearch(j.id, OWNER)).version, 0);
});

test('SYNTHETIC a lease that expires cannot heartbeat or commit, and expiry does not add an immutable version', async t => {
  const f = fixture(t), j = await queued(f), claim = await p.claimResearch(j.id, {request_id: 'SYNTHETIC-expiring-claim', executor: 'SYNTHETIC'}), r = result();
  const realNow = Date.now, afterExpiry = realNow() + 700000;
  Date.now = () => afterExpiry;
  try {
    await rejectsUnchanged(f, () => p.heartbeatResearch(j.id, {request_id: 'SYNTHETIC-late-heartbeat', lease_token: claim.lease_token}), [409]);
    await rejectsUnchanged(f, () => p.completeResearch(j.id, {request_id: 'SYNTHETIC-late-complete', lease_token: claim.lease_token, result: r, provenance: provenance(r)}), [409]);
  } finally {Date.now = realNow;}
  assert.equal(f.sql.prepare("SELECT count(*) n FROM app_state WHERE key LIKE 'research_version_v1:%'").get().n, 0);
});

test('SYNTHETIC SQL-time lease expiry blocks complete, fail and heartbeat even after valid preflight', async t => {
  for (const operation of ['complete', 'fail', 'heartbeat']) await t.test(operation, async sub => {
    const f = fixture(sub), j = await queued(f), claim = await p.claimResearch(j.id, {request_id: 'SYNTHETIC-sql-time-claim', executor: 'SYNTHETIC'});
    const expiry = Date.now() + 1000;
    mutate(f, j.id, value => {value.lease_until = expiry;});
    const before = snapshot(f); let delayed = false;
    const delay = async () => {delayed = true; await new Promise(resolve => setTimeout(resolve, Math.max(1, expiry - Date.now() + 50)));};
    if (operation === 'heartbeat') {
      const hook = async query => {if (!/^UPDATE app_state SET value=/i.test(query)) {f.beforeStatement(hook); return;} await delay();};
      f.beforeStatement(hook);
    } else f.beforeBatch(delay);
    const r = result(), body = {request_id: 'SYNTHETIC-sql-time-' + operation, lease_token: claim.lease_token, result: r, provenance: provenance(r), error: 'SYNTHETIC preflight valid but committed after expiry'};
    const run = operation === 'complete' ? () => p.completeResearch(j.id, body) : operation === 'fail' ? () => p.failResearch(j.id, body) : () => p.heartbeatResearch(j.id, body);
    await assert.rejects(run, error => error.status === 409);
    assert.equal(delayed, true, 'must reach the SQL boundary with a valid preflight lease');
    assert.ok(Date.now() >= expiry); assert.deepEqual(snapshot(f), before);
  });
});

test('SYNTHETIC failure/retry preserves attempts and a previous claim or token cannot authorize another run', async t => {
  const f = fixture(t), j = await queued(f), oldClaimBody = {request_id: 'SYNTHETIC-original-claim', executor: 'SYNTHETIC original'}, claim = await p.claimResearch(j.id, oldClaimBody);
  const fail = {request_id: 'SYNTHETIC-fail', lease_token: claim.lease_token, error: 'SYNTHETIC unavailable source, no real search was called'};
  await p.failResearch(j.id, fail); const failed = snapshot(f);
  assert.equal((await p.failResearch(j.id, fail)).replayed, true); assert.deepEqual(snapshot(f), failed);
  await rejectsUnchanged(f, () => p.retryResearch(j.id, OTHER, {request_id: 'SYNTHETIC-cross-retry', expected_version: 0}), [403, 404]);
  const retried = record(await p.retryResearch(j.id, OWNER, {request_id: 'SYNTHETIC-retry', expected_version: 0})); assert.equal(retried.attempt, 1);
  const fresh = await p.claimResearch(j.id, {request_id: 'SYNTHETIC-new-claim', executor: 'SYNTHETIC second'}); assert.equal(record(fresh).attempt, 2);
  assert.notEqual(fresh.lease_token, claim.lease_token);
  await rejectsUnchanged(f, () => p.claimResearch(j.id, oldClaimBody), [409]);
  const r = result();
  await rejectsUnchanged(f, () => p.completeResearch(j.id, {request_id: 'SYNTHETIC-old-return', lease_token: claim.lease_token, result: r, provenance: provenance(r)}), [409]);
  const current = record(await p.completeResearch(j.id, {request_id: 'SYNTHETIC-new-return', lease_token: fresh.lease_token, result: r, provenance: provenance(r)}));
  assert.equal(current.version, 1); assert.equal(current.attempt, 2);
  await rejectsUnchanged(f, () => p.claimResearch(j.id, {request_id: 'SYNTHETIC-new-claim', executor: 'SYNTHETIC second'}), [409]);
});

test('SYNTHETIC research retries preserve the three-claim budget instead of resetting attempts', async t => {
  const f = fixture(t), j = await queued(f);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const claim = await p.claimResearch(j.id, {request_id: 'SYNTHETIC-budget-claim-' + attempt, executor: 'SYNTHETIC'});
    assert.equal(record(claim).attempt, attempt);
    await p.failResearch(j.id, {request_id: 'SYNTHETIC-budget-fail-' + attempt, lease_token: claim.lease_token, error: 'SYNTHETIC failure without a real search'});
    const retry = () => p.retryResearch(j.id, OWNER, {request_id: 'SYNTHETIC-budget-retry-' + attempt, expected_version: 0});
    if (attempt < 3) assert.equal(record(await retry()).attempt, attempt);
    else await rejectsUnchanged(f, retry, [409]);
  }
  assert.equal((await p.nextResearch()).research, null);
  assert.equal((await p.getResearch(j.id, OWNER)).attempt, 3);
});

test('SYNTHETIC heartbeat CAS cannot resurrect a concurrently cancelled research lease', async t => {
  const f = fixture(t), j = await queued(f), claim = await p.claimResearch(j.id, {request_id: 'SYNTHETIC-heartbeat-claim', executor: 'SYNTHETIC'}); let afterCancel;
  const hook = async query => {
    if (!/^UPDATE app_state SET value=/i.test(query)) {f.beforeStatement(hook); return;}
    await p.cancelResearch(j.id, OWNER, {request_id: 'SYNTHETIC-heartbeat-cancel', expected_version: 0}); afterCancel = snapshot(f);
  };
  f.beforeStatement(hook);
  await assert.rejects(() => p.heartbeatResearch(j.id, {lease_token: claim.lease_token}), error => error.status === 409);
  assert.ok(afterCancel); assert.deepEqual(snapshot(f), afterCancel);
});

test('SYNTHETIC cancellation between completion preflight and SQL commit wins without an orphan article or receipt', async t => {
  const f = fixture(t), j = await queued(f), claim = await p.claimResearch(j.id, {request_id: 'SYNTHETIC-racing-claim', executor: 'SYNTHETIC'}), r = result();
  let afterCancel;
  f.beforeBatch(async () => {await p.cancelResearch(j.id, OWNER, {request_id: 'SYNTHETIC-racing-cancel', expected_version: 0}); afterCancel = snapshot(f);});
  await assert.rejects(() => p.completeResearch(j.id, {request_id: 'SYNTHETIC-racing-complete', lease_token: claim.lease_token, result: r, provenance: provenance(r)}), error => error.status === 409);
  assert.ok(afterCancel); assert.deepEqual(snapshot(f), afterCancel);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM app_state WHERE key LIKE 'research_version_v1:%'").get().n, 0);
});

test('SYNTHETIC editing appends an immutable version and owner/stale-version protections preserve both histories', async t => {
  const f = fixture(t), done = await finished(f), key = 'research_version_v1:' + done.research.id + ':1';
  const original = f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(key).value;
  await rejectsUnchanged(f, () => p.editResearch(done.research.id, OTHER, {request_id: 'SYNTHETIC-cross-owner', expected_version: 1, result: result('cross owner')}), [403, 404]);
  const body = {request_id: 'SYNTHETIC-edit', expected_version: 1, result: result('edited')};
  const next = record(await p.editResearch(done.research.id, OWNER, body)); assert.equal(next.version, 2);
  assert.equal(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(key).value, original);
  const before = snapshot(f); assert.equal((await p.editResearch(done.research.id, OWNER, body)).replayed, true); assert.deepEqual(snapshot(f), before);
  await rejectsUnchanged(f, () => p.editResearch(done.research.id, OWNER, {...body, request_id: 'SYNTHETIC-stale', result: result('stale')}), [409]);
  await rejectsUnchanged(f, () => p.editResearch(done.research.id, OWNER, {...body, result: result('changed replay')}), [409]);
});

test('SYNTHETIC competing edits cannot both create version two, and exact historical completion cannot roll back the winner', async t => {
  const f = fixture(t), done = await finished(f); let afterWinner;
  f.beforeBatch(async () => {await p.editResearch(done.research.id, OWNER, {request_id: 'SYNTHETIC-winning-edit', expected_version: 1, result: result('winner')}); afterWinner = snapshot(f);});
  await assert.rejects(() => p.editResearch(done.research.id, OWNER, {request_id: 'SYNTHETIC-losing-edit', expected_version: 1, result: result('loser')}), error => error.status === 409);
  assert.ok(afterWinner); assert.deepEqual(snapshot(f), afterWinner);
  assert.equal((await p.getResearch(done.research.id, OWNER)).version, 2);
  const replay = await p.completeResearch(done.research.id, done.body); assert.equal(replay.replayed, true);
  assert.deepEqual(snapshot(f), afterWinner);
});

test('SYNTHETIC use is owner-bound, hash-bound and idempotent under concurrency; it never starts production', async t => {
  const f = fixture(t), done = await finished(f), body = {request_id: 'SYNTHETIC-use-once', version: 1, article_sha256: sha(done.result.article)};
  await rejectsUnchanged(f, () => p.useResearch(done.research.id, OTHER, body), [403, 404]);
  await rejectsUnchanged(f, () => p.useResearch(done.research.id, OWNER, {...body, article_sha256: '0'.repeat(64)}), [409]);
  const outcomes = await Promise.all([p.useResearch(done.research.id, OWNER, body), p.useResearch(done.research.id, OWNER, body)]);
  assert.ok(outcomes.some(value => value.replayed === true));
  assert.equal(f.sql.prepare('SELECT count(*) n FROM topics').get().n, 1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n, 0);
  assert.equal((await p.nextWork()).job, null);
  const topic = latestTopic(f); assert.match(topic.id, /^t_[a-f0-9]{24}$/);
  await rejectsUnchanged(f, () => p.createJob(topic.id, OTHER), [403, 404, 409]);
});

test('SYNTHETIC each source note has a distinct immutable hash and is not mislabeled as an original webpage byte archive', async t => {
  const f = fixture(t), done = await finished(f), stored = JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('research_version_v1:' + done.research.id + ':1').value);
  assert.equal(stored.source_notes.length, 2);
  assert.equal(new Set(stored.source_notes.map(s => s.note_sha256)).size, 2);
  for (const s of stored.source_notes) {assert.equal(s.kind, 'research-source-note'); assert.match(s.note_sha256, /^[a-f0-9]{64}$/); assert.ok(done.result.sources.some(source => source.id === s.id && source.url === s.url));}
  await use(f, done.research); const j = (await p.createJob(latestTopic(f).id, OWNER)).job;
  const material = await p.materializeSource(j.id, 0, 0, j.contract_hash, async () => {throw Error('No fetch expected');});
  for (const s of stored.source_notes) assert.ok(JSON.stringify(material).includes(s.note_sha256));
  assert.match(JSON.stringify(material), /research-source-note/);
});

test('SYNTHETIC using a version adds only a topic; a later article edit cannot rewrite an already frozen production source', async t => {
  const f = fixture(t), done = await finished(f);
  await use(f, done.research); const topic = latestTopic(f);
  assert.equal(topic.source_id, 'research-synthesis');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n, 0);
  const j = (await p.createJob(topic.id, OWNER)).job, frozen = j.source_snapshot;
  assert.equal(j.review_mode, 'node'); assert.equal(j.approved_hash, null);
  const research = JSON.parse(frozen).research; assert.ok(research); assert.equal(research.version, 1);
  assert.equal(research.article_sha256, sha(done.result.article));
  const edited = record(await p.editResearch(done.research.id, OWNER, {request_id: 'SYNTHETIC-edit-after-job', expected_version: 1, result: result('newer')}));
  await use(f, edited, '-version-two'); const secondTopic = latestTopic(f);
  assert.notEqual(secondTopic.id, topic.id); assert.notEqual(secondTopic.url, topic.url);
  const secondJob = (await p.createJob(secondTopic.id, OWNER)).job, secondSnapshot = JSON.parse(secondJob.source_snapshot);
  assert.notEqual(secondJob.id, j.id);
  assert.equal(secondSnapshot.research.version, 2);
  assert.equal(secondSnapshot.research.article_sha256, sha(result('newer').article));
  assert.equal(secondSnapshot.research.result.article, result('newer').article);
  assert.equal(f.sql.prepare('SELECT url FROM topics WHERE id=?').get(topic.id).url, topic.url);
  assert.equal((await p.getJob(j.id, OWNER)).source_snapshot, frozen);
  let fetches = 0;
  const material = await p.materializeSource(j.id, 0, 0, j.contract_hash, async () => {fetches++; throw Error('Research material must not fetch');});
  assert.equal(fetches, 0); assert.equal(material.complete_response, true);
  assert.ok(material.content.includes(done.result.article));
  assert.ok(!material.content.includes(result('newer').article));
  assert.equal(material.sha256, sha(material.content));
  assert.equal(material.source_snapshot_hash, sha(frozen));
  for (const s of done.result.sources) {assert.ok(material.content.includes(s.url)); assert.ok(material.content.includes(s.publisher)); assert.ok(material.content.includes(s.summary));}
  assert.match(JSON.stringify(material), /research/);
});

test('SYNTHETIC a research-derived draft still returns to human source and script gates without approvals or media operations', async t => {
  const f = fixture(t), done = await finished(f); await use(f, done.research); const topic = latestTopic(f), j = (await p.createJob(topic.id, OWNER)).job;
  const snapshot = JSON.parse(j.source_snapshot), skill = JSON.parse(j.skill_snapshot);
  const material = await p.materializeSource(j.id, 0, 0, j.contract_hash, async () => {throw Error('No network expected');});
  const claim = await p.claimJob('SYNTHETIC mocked script executor', j.id);
  const draft = {script: 'SYNTHETIC 本机测试口播，等待人工审稿，不是真实制作。', materials: 'SYNTHETIC no real media inspected', limits: 'SYNTHETIC sources are fixture notes only', evidence: [{url: snapshot.url, title: done.result.title, published_at: null, retrieved_at: '2026-10-16T08:01:00Z', sha256: material.sha256, facts: ['SYNTHETIC synthesized dossier'], materials: ['SYNTHETIC text only'], limits: ['Not an original publisher document']}], execution: {mode: 'operator-assisted', executor: 'SYNTHETIC mocked executor', source_hash: sha(j.source_snapshot), skill_hash: skill.sha256}};
  await rejectsUnchanged(f, () => p.submitDraft(j.id, claim.lease_token, 0, 'SYNTHETIC-missing-source-notes', draft), [409]);
  draft.evidence.push(...snapshot.research.source_notes.map(note => {const source = done.result.sources.find(source => source.id === note.id); return {url: source.url, title: source.title, published_at: source.published_at, retrieved_at: source.retrieved_at, sha256: note.note_sha256, kind: 'research-source-note', facts: [source.summary], materials: ['SYNTHETIC attributed text note'], limits: ['Exact note hash; not an original webpage byte archive']};}));
  for (const [label, mutation] of [
    ['wrong-note-hash', value => {value.evidence[1].sha256 = 'f'.repeat(64);}],
    ['synthesis-hash-as-original', value => {for (const evidence of value.evidence.slice(1)) evidence.sha256 = material.sha256;}],
    ['article-hash-as-packet', value => {value.evidence[0].sha256 = sha(done.result.article);}],
  ]) {const changed = clone(draft); mutation(changed); await rejectsUnchanged(f, () => p.submitDraft(j.id, claim.lease_token, 0, 'SYNTHETIC-' + label, changed), [409]);}
  const submitted = (await p.submitDraft(j.id, claim.lease_token, 0, 'SYNTHETIC-draft-submit', draft)).job;
  assert.equal(submitted.status, 'awaiting_review'); assert.equal(submitted.approved_hash, null);
  assert.equal(submitted.milestones.find(m => m.node === 'source').status, 'awaiting_human');
  assert.equal(submitted.milestones.find(m => m.node === 'script').status, 'pending');
  assert.equal(submitted.ai_calls, 0); assert.equal(submitted.operations.length, 0);
});

test('SYNTHETIC actual finite dispatch supplies immutable per-source note files and returns a multi-source draft to human review without fetching images', async t => {
  const f = fixture(t), q = record(await p.createResearch(OWNER, {request_id: 'SYNTHETIC-dispatch-create', input: {...input(), clue_url: 'https://www.youtube.com/watch?v=SYNTHETIC'}}));
  const claim = await p.claimResearch(q.id, {request_id: 'SYNTHETIC-dispatch-claim', executor: 'SYNTHETIC researcher'}), r = result('dispatch');
  r.article += '\n<img src="https://untrusted.example.net/SYNTHETIC.png"><video src="https://untrusted.example.net/SYNTHETIC.mp4"></video>';
  const completed = record(await p.completeResearch(q.id, {request_id: 'SYNTHETIC-dispatch-complete', lease_token: claim.lease_token, result: r, provenance: provenance(r)}));
  await use(f, completed, '-dispatch');
  const j = (await p.createJob(latestTopic(f).id, OWNER)).job, frozen = JSON.parse(j.source_snapshot).research;
  assert.equal(frozen.video_clue_watched, false);
  assert.equal(frozen.input.clue_url, 'https://www.youtube.com/watch?v=SYNTHETIC');
  const parent = path.resolve('.sites-runtime'); fs.mkdirSync(parent, {recursive: true});
  const localRoot = fs.mkdtempSync(path.join(parent, 'research-flow-'));
  t.after(() => {const resolved = path.resolve(localRoot); assert.equal(path.dirname(resolved), parent); assert.ok(path.basename(resolved).startsWith('research-flow-')); fs.rmSync(resolved, {recursive: true, force: true});});
  const events = []; let imagePreparations = 0, runs = 0, captured, submitted;
  const call = async body => {
    events.push(body);
    assert.equal(body.action, 'dispatch_source', 'exact selection must never rescan or schedule unrelated tasks');
    assert.equal(body.id, j.id);
    return {source: await p.materializeSource(body.id, body.revision, body.mode_epoch, body.contract_hash, async () => {throw Error('SYNTHETIC research dispatch must not fetch');})};
  };
  const outcome = await dispatch({execute: true, materialize_linked_images: true}, {selection: {job: j, kind: 'text'}, call, root: localRoot,
    prepareImages: async () => {imagePreparations++; throw Error('SYNTHETIC research HTML must not trigger media preparation');},
    run: async config => {
      runs++; captured = config;
      assert.equal(config.job_id, j.id);
      assert.equal(config.source_url, JSON.parse(j.source_snapshot).url);
      const bytes = fs.readFileSync(config.source_file), metadata = sourceEvidence(bytes, JSON.parse(j.source_snapshot)), brief = JSON.parse(fs.readFileSync(config.production_brief_file, 'utf8'));
      assert.ok(bytes.toString('utf8').includes(r.article));
      assert.equal(metadata.published_at, null, 'synthesis compilation time must not impersonate an original publication date');
      assert.equal(metadata.video_clue_watched, false);
      assert.deepEqual(metadata.media_references, []);
      assert.match(metadata.source_kind, /research-synthesis/);
      assert.equal(brief.research_binding.version, 1);
      assert.equal(brief.research_binding.article_sha256, sha(r.article));
      assert.equal(brief.research_binding.video_clue_watched, false);
      assert.equal(brief.evidence.length, 2);
      assert.deepEqual(brief.images, []);
      for (const evidence of brief.evidence) {
        const original = r.sources.find(source => source.url === evidence.url), note = frozen.source_notes.find(source => source.id === evidence.id);
        assert.ok(original); assert.ok(note);
        assert.equal(evidence.kind, 'research-source-note');
        assert.equal(evidence.sha256, note.note_sha256);
        assert.equal(sha(fs.readFileSync(evidence.file)), note.note_sha256);
        assert.deepEqual(JSON.parse(fs.readFileSync(evidence.file, 'utf8')), original);
        assert.equal(evidence.published_at, original.published_at);
        assert.equal(evidence.retrieved_at, original.retrieved_at);
        assert.match(evidence.limits.join(' '), /不是外站原网页字节/);
      }
      const productionClaim = await p.claimJob('SYNTHETIC mock model, no real CLI', j.id);
      assert.ok(productionClaim.job);
      const articleEvidence = {url: config.source_url, title: metadata.title, published_at: null, retrieved_at: frozen.created_at, sha256: sha(bytes), facts: ['SYNTHETIC synthesis record only'], materials: ['SYNTHETIC no media'], limits: ['Not an original publisher article'], source_metadata: metadata};
      const draft = {script: 'SYNTHETIC 口播预稿，只供本机测试，等待本人审稿。', materials: 'SYNTHETIC source notes only', limits: 'No original-page byte verification or video viewing claimed', evidence: [articleEvidence, ...brief.evidence.map(({file: _file, id: _id, ...evidence}) => evidence)], execution: {mode: 'operator-assisted', executor: 'SYNTHETIC mock runner', source_hash: sha(j.source_snapshot), skill_hash: JSON.parse(j.skill_snapshot).sha256}};
      submitted = (await p.submitDraft(j.id, productionClaim.lease_token, 0, 'SYNTHETIC-dispatch-script-return', draft)).job;
    }});
  assert.equal(outcome.status, 'finite-workflow-returned');
  assert.equal(runs, 1); assert.equal(imagePreparations, 0);
  assert.deepEqual(events.map(e => e.action), ['dispatch_source']);
  assert.equal(submitted.status, 'awaiting_review');
  assert.equal(submitted.milestones.find(m => m.node === 'source').status, 'awaiting_human');
  assert.equal(submitted.milestones.find(m => m.node === 'script').status, 'pending');
  assert.equal(submitted.ai_calls, 0); assert.equal(submitted.approved_hash, null); assert.equal(submitted.operations.length, 0);
  const sourceGate = JSON.parse(submitted.milestones.find(m => m.node === 'source').artifact);
  for (const source of r.sources) assert.ok(JSON.stringify(sourceGate).includes(source.url));
  const beforeTamper = snapshot(f), brief = JSON.parse(fs.readFileSync(captured.production_brief_file, 'utf8'));
  fs.appendFileSync(brief.evidence[0].file, '\nSYNTHETIC changed cache');
  await assert.rejects(() => dispatch({execute: true}, {selection: {job: j, kind: 'text'}, call: async () => {throw Error('SYNTHETIC immutable cache must not refetch');}, root: localRoot, run: async () => {runs++;}}), /research note cache changed/i);
  assert.equal(runs, 1); assert.deepEqual(snapshot(f), beforeTamper);
});


test('SYNTHETIC actual zero-result research429 preserves three-claim budget and next/claim share the real cooldown',async t=>{
 const f=fixture(t),q=await queued(f,'SYNTHETIC-429-create'),first=await p.claimResearch(q.id,{request_id:'SYNTHETIC-429-claim1',executor:'SYNTHETIC'}),d=rateLimitDiagnostic(first.research);
 const saved=await p.failResearch(q.id,{request_id:'SYNTHETIC-429-fail1',lease_token:first.lease_token,error:'SYNTHETIC429',diagnostic:d});assert.equal(saved.research.status,'queued');assert.equal(saved.research.attempt,1);assert.equal(saved.research.cli_failure.next_retry_ms,Date.parse(d.finished_at)+120000);assert.equal((await p.nextResearch()).research,null);await rejectsUnchanged(f,()=>p.claimResearch(q.id,{request_id:'SYNTHETIC-too-soon',executor:'SYNTHETIC'}),[409]);
 mutate(f,q.id,j=>{j.cli_failure.next_retry_ms=Date.now()-1000;});assert.equal((await p.nextResearch()).research.id,q.id);const second=await p.claimResearch(q.id,{request_id:'SYNTHETIC-429-claim2',executor:'SYNTHETIC'});assert.equal(second.research.attempt,2);
 const bad=rateLimitDiagnostic(second.research,{research_binding:{...rateLimitDiagnostic(second.research).research_binding,input_hash:'0'.repeat(64)}});await rejectsUnchanged(f,()=>p.failResearch(q.id,{request_id:'SYNTHETIC-wrong-binding',lease_token:second.lease_token,error:'SYNTHETIC',diagnostic:bad}),[409]);
 mutate(f,q.id,j=>{j.attempt=3;});const last=await p.getResearch(q.id),exhausted=await p.failResearch(q.id,{request_id:'SYNTHETIC-429-last',lease_token:second.lease_token,error:'SYNTHETIC429',diagnostic:rateLimitDiagnostic(last,{retry_after_seconds:0})});assert.equal(exhausted.research.status,'failed');assert.equal(exhausted.research.attempt,3);assert.equal(exhausted.research.cli_failures.length,2);assert.equal((await p.nextResearch()).research,null);
});

test('SYNTHETIC tool/unknown/output research failure never autoqueues or borrows an older safe failure',async t=>{
 const f=fixture(t),q=await queued(f,'SYNTHETIC-unknown-create'),claim=await p.claimResearch(q.id,{request_id:'SYNTHETIC-unknown-claim',executor:'SYNTHETIC'}),unknown=rateLimitDiagnostic(claim.research,{confirmed_no_result:false,result_unknown:true,tool_events:1,output_present:true});
 const saved=await p.failResearch(q.id,{request_id:'SYNTHETIC-unknown-fail',lease_token:claim.lease_token,error:'CLI_NONZERO_EXIT original output unknown',diagnostic:unknown});assert.equal(saved.research.status,'failed');assert.equal(saved.research.attempt,1);assert.equal((await p.nextResearch()).research,null);await rejectsUnchanged(f,()=>p.retryResearch(q.id,OWNER,{request_id:'SYNTHETIC-unknown-retry',expected_version:0}),[409]);
});


test('SYNTHETIC exact preclaim cache-block removes an unknown queue item without consuming budget and rejects stale snapshots',async t=>{
 const f=fixture(t),q=await queued(f,'SYNTHETIC-cache-block-create'),binding={id:q.id,input_hash:q.input_hash,attempt:q.attempt,version:q.version,expected_updated_at:q.updated_at};
 await rejectsUnchanged(f,()=>p.blockResearchCache(q.id,{request_id:'SYNTHETIC-stale-cache-block',binding:{...binding,input_hash:'0'.repeat(64)},reason:'SYNTHETIC mismatch'}),[409]);
 const body={request_id:'SYNTHETIC-cache-block',binding,reason:'SYNTHETIC original invocation has no terminal receipt'},saved=await p.blockResearchCache(q.id,body);assert.equal(saved.research.status,'failed');assert.equal(saved.research.attempt,0);assert.equal(saved.research.cache_block.model_called,false);assert.equal((await p.nextResearch()).research,null);assert.equal((await p.blockResearchCache(q.id,body)).replayed,true);await rejectsUnchanged(f,()=>p.retryResearch(q.id,OWNER,{request_id:'SYNTHETIC-cache-block-retry',expected_version:0}),[409]);
});
