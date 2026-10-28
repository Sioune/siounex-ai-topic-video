// SYNTHETIC isolated SQLite + mocked source reads/runners. No network or model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {dispatch as dispatchUnderTest} from '../scripts/production-dispatch-executor.mjs';
// These source-cache tests explicitly isolate content research. The complete
// support path has its own injected web/CLI/actual-FFmpeg tests.
const dispatch=(config,deps)=>dispatchUnderTest(config,{...deps,prepareSupport:async({briefFile})=>({brief_file:briefFile})});
import {autonomousPass} from '../scripts/production-autonomous-pass.mjs';
import {executorResponse} from '../scripts/executor-response.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const TEXT = 'SYNTHETIC full original source text. This is a test fixture, not an inspected article. '.repeat(8);
const OWNER = 'SYNTHETIC-source-owner';
const built = await build({
  stdin: {contents: [
    "export {createJob,getJob} from './lib/production';",
    "export {materializeSource,nextWork} from './lib/dispatch';",
    "export {saveProvidedSource,readProvidedSource,blockSourceInput,retrySourceInput,SOURCE_INPUT_REQUIRED} from './lib/source-input';",
  ].join('\n'), resolveDir: process.cwd()},
  bundle: true, platform: 'node', format: 'esm', write: false,
  footer: {js: '//# sourceURL=synthetic-source-input-flow.mjs'},
  plugins: [{name: 'synthetic-source-db', setup(b) {
    b.onResolve({filter: /^\.\/store$/}, () => ({path: 'db', namespace: 'fixture'}));
    b.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: 'export function db(){return globalThis.__syntheticSourceDb} export function siteArchiveBucket(){throw Error("SYNTHETIC source-input fixture has no archive bucket; archive operations are outside this test")}'}));
  }}],
});
const p = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
const migrations = fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort().map(f => fs.readFileSync('drizzle/' + f, 'utf8'));
const tables = ['production_jobs', 'production_drafts', 'production_reviews', 'production_milestones', 'production_operations', 'production_stages', 'app_state'];

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  for (const migration of migrations) sql.exec(migration);
  let hook;
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return {results: sql.prepare(this.query).all(...this.args)}; }
    async run() { return {meta: {changes: Number(sql.prepare(this.query).run(...this.args).changes)}}; }
  }
  const db = {prepare: query => new Statement(query), beforeBatch: fn => { hook = fn; }, async batch(statements) {
    if (hook) { const fn = hook; hook = undefined; await fn(); }
    sql.exec('BEGIN');
    try { const result = statements.map(s => ({meta: {changes: Number(sql.prepare(s.query).run(...s.args).changes)}})); sql.exec('COMMIT'); return result; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  }};
  globalThis.__syntheticSourceDb = db;
  const runtimeRoot = path.resolve('.sites-runtime'); fs.mkdirSync(runtimeRoot, {recursive: true});
  const localRoot = fs.mkdtempSync(path.join(runtimeRoot, 'source-input-flow-'));
  t.after(() => {
    sql.close(); delete globalThis.__syntheticSourceDb;
    const resolved = path.resolve(localRoot);
    assert.equal(path.dirname(resolved), runtimeRoot); assert.ok(path.basename(resolved).startsWith('source-input-flow-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  });
  let count = 0;
  async function job(url = 'https://official.example.org/SYNTHETIC-full-article') {
    count++; const topic = 'SYNTHETIC-source-topic-' + count;
    sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES (?,?,'editorial-zh','SYNTHETIC','SYNTHETIC source','SYNTHETIC','SYNTHETIC','now','视觉影像',0,'SYNTHETIC','SYNTHETIC','SYNTHETIC','SYNTHETIC','SYNTHETIC',0,'zh')").run(topic, url);
    const created = await p.createJob(topic, OWNER, false, 'node');
    sql.prepare('UPDATE production_jobs SET created_at=?,updated_at=? WHERE id=?').run('2026-10-0' + count + 'T00:00:00Z', 'SYNTHETIC-initial-' + count, created.job.id);
    return p.getJob(created.job.id, OWNER);
  }
  return {sql, db, localRoot, job};
}
function snapshot(f) { return clone(Object.fromEntries(tables.map(table => [table, f.sql.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]))); }
function bound(j) { return {revision: j.revision, mode_epoch: j.mode_epoch, contract_hash: j.contract_hash, source_snapshot_hash: sha(j.source_snapshot)}; }
function blockBody(j) { return {...bound(j), expected_updated_at: j.updated_at}; }
const noFetch = async () => { throw Error('Forbidden network invocation in SYNTHETIC test'); };
async function rejectsUnchanged(f, task, status = 409) {
  const before = snapshot(f); await assert.rejects(task, error => error.status === status); assert.deepEqual(snapshot(f), before);
}

test('SYNTHETIC unsupported source pauses before claim, then owner full text is frozen and reused across revisions/modes', async t => {
  const f = fixture(t), j = await f.job(); let reads = 0;
  await assert.rejects(() => p.materializeSource(j.id, 0, 0, j.contract_hash, async () => { reads++; throw Error('No fetch expected'); }), error => error.status === 400);
  assert.equal(reads, 0);
  const blocked = await p.blockSourceInput(j.id, blockBody(j)); assert.equal(blocked.persisted, true);
  const pause = await p.getJob(j.id, OWNER); assert.equal(pause.status, 'paused'); assert.equal(pause.error, p.SOURCE_INPUT_REQUIRED); assert.equal(pause.attempt, 0);
  assert.equal((await p.nextWork()).job, null);
  const saved = await p.saveProvidedSource(j.id, OWNER, {...bound(pause), content: TEXT});
  assert.equal(saved.job.status, 'waiting_executor'); assert.equal(saved.job.error, null); assert.equal(saved.job.attempt, 0);
  const source = await p.materializeSource(j.id, 0, 0, j.contract_hash, noFetch);
  assert.equal(source.content, TEXT); assert.equal(source.sha256, sha(TEXT)); assert.equal(source.provided_by_owner, true); assert.equal(source.complete_response, true);
  assert.match(source.scope, /Owner-provided/);
  const beforeReplay = snapshot(f); assert.equal((await p.saveProvidedSource(j.id, OWNER, {...bound(saved.job), content: TEXT})).replayed, true); assert.deepEqual(snapshot(f), beforeReplay);
  await rejectsUnchanged(f, () => p.saveProvidedSource(j.id, OWNER, {...bound(saved.job), content: TEXT + ' different'}));
  f.sql.prepare("UPDATE production_jobs SET revision=1,mode_epoch=1,status='awaiting_review',updated_at='SYNTHETIC-new-script' WHERE id=?").run(j.id);
  const current = await p.getJob(j.id, OWNER), reused = await p.materializeSource(j.id, 1, 1, j.contract_hash, noFetch);
  assert.equal(reused.content, TEXT); assert.equal((await p.readProvidedSource(current)).sha256, sha(TEXT));
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_reviews WHERE decision='source_input_saved'").get().n, 1);
});

test('SYNTHETIC wrong owner, short text, stale binding, live lease and prior execution cannot write source inputs', async t => {
  const cases = [
    ['wrong owner', () => {}, (j) => ({...bound(j), content: TEXT}), 'SYNTHETIC-other-owner', 403],
    ['short text', () => {}, (j) => ({...bound(j), content: 'short'}), OWNER, 400],
    ['stale binding', () => {}, (j) => ({...bound(j), mode_epoch: 1, content: TEXT}), OWNER, 409],
    ['live lease', (f, j) => f.sql.prepare('UPDATE production_jobs SET lease_until=?,lease_hash=? WHERE id=?').run(Date.now() + 600000, 'SYNTHETIC-live', j.id), (j) => ({...bound(j), content: TEXT}), OWNER, 409],
    ['previous attempt', (f, j) => f.sql.prepare('UPDATE production_jobs SET attempt=1 WHERE id=?').run(j.id), (j) => ({...bound(j), content: TEXT}), OWNER, 409],
    ['existing draft', (f, j) => { f.sql.prepare("UPDATE production_jobs SET revision=1,status='awaiting_review' WHERE id=?").run(j.id); f.sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES (?,1,'SYNTHETIC-old','{}',?,'SYNTHETIC','now')").run(j.id, 'a'.repeat(64)); }, (j) => ({...bound(j), content: TEXT}), OWNER, 409],
  ];
  for (const [name, mutation, body, owner, status] of cases) await t.test(name, async sub => {
    const f = fixture(sub), original = await f.job(); mutation(f, original); const j = await p.getJob(original.id, OWNER);
    await rejectsUnchanged(f, () => p.saveProvidedSource(j.id, owner, body(j)), status);
  });
});

test('SYNTHETIC concurrent same source replays once; competing contents cannot both freeze the source', async t => {
  for (const same of [true, false]) await t.test(same ? 'same bytes' : 'different bytes', async sub => {
    const f = fixture(sub), j = await f.job(), first = {...bound(j), content: TEXT}, second = {...bound(j), content: same ? TEXT : TEXT + ' SYNTHETIC competing full text'};
    const results = await Promise.allSettled([p.saveProvidedSource(j.id, OWNER, first), p.saveProvidedSource(j.id, OWNER, second)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, same ? 2 : 1);
    if (!same) assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM app_state WHERE key LIKE 'source_input_v1:%'").get().n, 1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_reviews WHERE decision='source_input_saved'").get().n, 1);
    assert.equal((await p.getJob(j.id, OWNER)).attempt, 0);
  });
});

test('SYNTHETIC source-save CAS loser cannot release a later pause or rewrite a progressed job', async t => {
  const f = fixture(t), j = await f.job(); let raced;
  f.db.beforeBatch(async () => {
    await p.saveProvidedSource(j.id, OWNER, {...bound(j), content: TEXT});
    f.sql.prepare("UPDATE production_jobs SET revision=1,mode_epoch=1,status='paused',error='SYNTHETIC owner pause',updated_at='SYNTHETIC-new-state' WHERE id=?").run(j.id);
    raced = snapshot(f);
  });
  const replay = await p.saveProvidedSource(j.id, OWNER, {...bound(j), content: TEXT});
  assert.equal(replay.replayed, true); assert.equal(replay.job.status, 'paused'); assert.equal(replay.job.revision, 1); assert.deepEqual(snapshot(f), raced);
});

test('SYNTHETIC a changed binding rejects source-save/block/retry CAS with no partial transaction', async t => {
  for (const kind of ['save', 'block', 'retry']) await t.test(kind, async sub => {
    const f = fixture(sub), original = await f.job();
    if (kind === 'retry') await p.blockSourceInput(original.id, blockBody(original));
    const j = await p.getJob(original.id, OWNER); let raced;
    f.db.beforeBatch(() => { f.sql.prepare("UPDATE production_jobs SET mode_epoch=1,status='paused',error='SYNTHETIC unrelated newer pause',updated_at='SYNTHETIC-race' WHERE id=?").run(j.id); raced = snapshot(f); });
    const action = kind === 'save' ? () => p.saveProvidedSource(j.id, OWNER, {...bound(j), content: TEXT}) : kind === 'block' ? () => p.blockSourceInput(j.id, blockBody(j)) : () => p.retrySourceInput(j.id, OWNER, bound(j));
    await assert.rejects(action, error => error.status === 409); assert.ok(raced); assert.deepEqual(snapshot(f), raced);
  });
});

test('SYNTHETIC source block exact replay is read-only; retry restores only this owner source-input pause', async t => {
  const f = fixture(t), j = await f.job(), request = blockBody(j);
  await p.blockSourceInput(j.id, request); const paused = await p.getJob(j.id, OWNER);
  const before = snapshot(f); assert.equal((await p.blockSourceInput(j.id, request)).replayed, true); assert.deepEqual(snapshot(f), before);
  await rejectsUnchanged(f, () => p.retrySourceInput(j.id, 'SYNTHETIC-other-owner', bound(paused)), 403);
  f.sql.prepare("UPDATE production_jobs SET error='SYNTHETIC distinct manual pause' WHERE id=?").run(j.id);
  await rejectsUnchanged(f, () => p.retrySourceInput(j.id, OWNER, bound(paused)));
  const changed = snapshot(f); await p.blockSourceInput(j.id, request); assert.deepEqual(snapshot(f), changed, 'old source-block receipt must not replace a newer pause');
  f.sql.prepare('UPDATE production_jobs SET error=? WHERE id=?').run(p.SOURCE_INPUT_REQUIRED, j.id);
  const restored = await p.retrySourceInput(j.id, OWNER, bound(await p.getJob(j.id, OWNER)));
  assert.equal(restored.job.status, 'waiting_executor'); assert.equal(restored.job.error, null); assert.equal(restored.job.attempt, 0);
  await rejectsUnchanged(f, () => p.retrySourceInput(j.id, OWNER, bound(restored.job)));
});

async function siteCall(f, fetcher, events, body) {
  events.push(body);
  try {
    if (body.action === 'dispatch_next') return p.nextWork(undefined, body.exclude_job_ids || []);
    if (body.action === 'read') return {job: await p.getJob(body.id)};
    if (body.action === 'dispatch_source') return {source: await p.materializeSource(body.id, body.revision, body.mode_epoch, body.contract_hash, fetcher)};
    if (body.action === 'source_input_block') return p.blockSourceInput(body.id, body);
    throw Error('Unexpected SYNTHETIC request: ' + body.action);
  } catch (error) {
    if (typeof error.status !== 'number') throw error;
    return executorResponse(Response.json({error: error.message}, {status: error.status}));
  }
}

test('SYNTHETIC unreadable full source persists 400/422 blockers and skips them for the next ready job', async t => {
  for (const kind of ['unsupported-origin', 'unavailable-source']) await t.test(kind, async sub => {
    const f = fixture(sub), badUrl = kind === 'unsupported-origin' ? 'https://official.example.org/SYNTHETIC-bad' : 'https://www.qbitai.com/SYNTHETIC-bad';
    const blocked = await f.job(badUrl), ready = await f.job('https://www.qbitai.com/SYNTHETIC-ready');
    const events = [], runs = [], fetches = [];
    const fetcher = async url => {
      fetches.push(url);
      if (url === badUrl && kind === 'unavailable-source') throw Error('SYNTHETIC unavailable source');
      if (url === badUrl && kind === 'unsupported-linked-image') return new Response('<title>SYNTHETIC</title><img src="https://image.example.org/SYNTHETIC.png">' + TEXT);
      assert.equal(url, JSON.parse(ready.source_snapshot).url); return new Response(TEXT);
    };
    const call = body => siteCall(f, fetcher, events, body);
    const run = async config => { runs.push(config.job_id); assert.equal(fs.readFileSync(config.source_file, 'utf8'), TEXT); f.sql.prepare("UPDATE production_jobs SET status='awaiting_review',updated_at='SYNTHETIC-mocked-runner' WHERE id=?").run(config.job_id); };
    const prepareImages = async ({sourceFile}) => fs.readFileSync(sourceFile, 'utf8').includes('<img') ? {needs_materials: true, diagnostic: {stage: 'images', code: 'image-host', retryable: false}} : {brief_file: null, image_count: 0};
    const result = await autonomousPass({execute: true}, {call, execute: (config, options) => dispatch(config, {...options, root: f.localRoot, run, prepareImages})});
    assert.deepEqual(runs, [ready.id]); assert.equal(result.status, 'bounded-pass-returned');
    const sourceBlocks=result.blocked.filter(x=>x.job_id===blocked.id); assert.equal(sourceBlocks.length,1); assert.equal(sourceBlocks[0].persisted,true); assert.ok(result.blocked.some(x=>x.job_id===ready.id&&x.reason==='current-human-decision-or-stop'),'Human review remains an explicit stop after the successful text return');
    const current = await p.getJob(blocked.id, OWNER); assert.equal(current.status, 'paused'); assert.equal(current.error, p.SOURCE_INPUT_REQUIRED); assert.equal(current.attempt, 0);
    const scans = events.filter(e => e.action === 'dispatch_next'); assert.deepEqual(scans[1].exclude_job_ids, [blocked.id]);
    assert.ok(events.every(e => ['dispatch_next', 'dispatch_source', 'source_input_block', 'read'].includes(e.action)));
    if (kind === 'unsupported-origin') assert.ok(!fetches.includes(badUrl));
    if (kind === 'unsupported-linked-image') {
      assert.ok(!fetches.includes('https://image.example.org/SYNTHETIC.png'));
      const supplied = await p.saveProvidedSource(blocked.id, OWNER, {...bound(current), content: TEXT});
      const resumed = await dispatch({execute: true, materialize_linked_images: true}, {selection: {job: supplied.job, kind: 'text'}, call, root: f.localRoot, run, prepareImages});
      assert.equal(resumed.status, 'finite-workflow-returned'); assert.equal(runs.at(-1), blocked.id);
      assert.equal(fetches.filter(url => url === badUrl).length, 1, 'provided full text uses a separate frozen cache without refetching the blocked HTML');
    }
  });
});

test('SYNTHETIC unknown 503 dispatch response never records a source pause or starts a runner', async t => {
  const f = fixture(t), j = await f.job(); const before = snapshot(f), events = []; let runs = 0;
  await assert.rejects(() => dispatch({execute: true}, {selection: {job: j, kind: 'text'}, root: f.localRoot,
    call: async body => { events.push(body); return executorResponse(Response.json({error: 'SYNTHETIC result unknown'}, {status: 503})); },
    run: async () => { runs++; }}), error => error.code === 'EXECUTOR_RESULT_UNKNOWN');
  assert.equal(runs, 0); assert.deepEqual(events.map(e => e.action), ['dispatch_source']); assert.deepEqual(snapshot(f), before);
});

test('SYNTHETIC image acquisition failure retains its exact gap while readable text reaches its own workflow', async t => {
  const f = fixture(t), j = await f.job('https://www.qbitai.com/SYNTHETIC-image-error');
  const events = []; let preparations = 0, runs = 0;
  const result = await dispatch({execute: true, materialize_linked_images: true}, {
    selection: {job: j, kind: 'text'}, root: f.localRoot,
    call: body => siteCall(f, async () => new Response(TEXT), events, body),
    prepareImages: async () => { preparations++; throw Error('SYNTHETIC image download or decode failure'); },
    run: async config => { runs++; const brief=JSON.parse(fs.readFileSync(config.production_brief_file,'utf8')); assert.deepEqual(brief.images,[]); assert.equal(brief.source_sha256,sha(TEXT)); assert.equal(brief.pending_materials[0].diagnostic.code,'image-unavailable'); assert.equal(brief.pending_materials[0].visual_inspection,'not-performed'); assert.match(brief.user_requirements.limits,/no image was viewed/i); },
  });
  assert.equal(preparations, 1); assert.equal(runs, 1);
  assert.equal(result.status, 'finite-workflow-returned');
  assert.equal(events.filter(e => e.action === 'source_input_block').length, 0);
  const saved = await p.getJob(j.id, OWNER);
  assert.equal(saved.status, 'waiting_executor'); assert.equal(saved.error, null); assert.equal(saved.attempt, 0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_reviews WHERE decision='source_input_block'").get().n, 0);
});


test('SYNTHETIC an image-host rejection is retained for later materials without another fetch, fabricated image or text pause',async t=>{const f=fixture(t),j=await f.job('https://www.qbitai.com/SYNTHETIC-image-policy'),events=[];let runs=0,sourceReads=0,images=0;const result=await dispatch({execute:true,materialize_linked_images:true},{selection:{job:j,kind:'text'},root:f.localRoot,call:b=>siteCall(f,async()=>{sourceReads++;return new Response(TEXT)},events,b),prepareImages:async()=>{images++;return{needs_materials:true,diagnostic:{stage:'images',code:'image-host',retryable:false}}},run:async config=>{runs++;const b=JSON.parse(fs.readFileSync(config.production_brief_file,'utf8'));assert.deepEqual(b.images,[]);assert.deepEqual(b.evidence,[]);assert.equal(b.pending_materials[0].diagnostic.code,'image-host');assert.equal(b.pending_materials[0].requires_acquisition,true);assert.equal(b.pending_materials[0].resolve_at,'material-preparation-after-script-approval');}});assert.equal(result.status,'finite-workflow-returned');assert.equal(runs,1);assert.equal(sourceReads,1);assert.equal(images,1);assert.ok(events.every(e=>e.action==='dispatch_source'));assert.equal((await p.getJob(j.id,OWNER)).status,'waiting_executor');});
