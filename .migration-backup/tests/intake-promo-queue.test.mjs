// Isolated SYNTHETIC SQLite fixtures. No accounts, production jobs, media or network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

const sha = value => createHash('sha256').update(value).digest('hex');
const built = await build({
  stdin: {contents: [
    "export {proposeIntake,acceptedIntake} from './lib/production-intake';",
    "export {acceptIntake} from './lib/production-intake-actions';",
    "export {createJob,getJob} from './lib/production';",
    "export {requestPromo,claimPromo} from './lib/promo-packages';",
    "export {nextWork} from './lib/dispatch';",
    "export {findOwnerTopicJob} from './lib/production-topic';",
    "export {GET as productionGET} from './app/api/production/route';",
  ].join('\n'), resolveDir: process.cwd()},
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{name: 'synthetic-intake-promo-db', setup(b) {
    b.onResolve({filter: /^@\/lib\/api$/}, () => ({path: 'fixture-api', namespace: 'synthetic-api'}));
    b.onLoad({filter: /.*/, namespace: 'synthetic-api'}, () => ({
      contents: "export async function identity(){return globalThis.__syntheticTopicOwner||null} export const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});",
    }));
    b.onResolve({filter: /^\.\/store$/}, () => ({path: 'fixture-db', namespace: 'synthetic'}));
    b.onLoad({filter: /.*/, namespace: 'synthetic'}, () => ({
      contents: 'export function db(){return globalThis.__syntheticIntakePromoDb} export function siteArchiveBucket(){throw Error("SYNTHETIC intake/promo tests must not access archive storage")}',
    }));
  }}],
});
const p = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
const migrations = fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort().map(f => fs.readFileSync('drizzle/' + f, 'utf8'));
const OWNER = 'SYNTHETIC-owner';

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  for (const migration of migrations) sql.exec(migration);
  let batchHook, queryHook;
  async function before(query) {
    if (queryHook?.match(query)) { const hook = queryHook; queryHook = undefined; await hook.run(); }
  }
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { await before(this.query); return sql.prepare(this.query).get(...this.args) || null; }
    async all() { await before(this.query); return {results: sql.prepare(this.query).all(...this.args)}; }
    async run() { await before(this.query); return {meta: {changes: Number(sql.prepare(this.query).run(...this.args).changes)}}; }
  }
  const adapter = {
    prepare: query => new Statement(query),
    beforeNextBatch: hook => { batchHook = hook; },
    beforeQuery: (match, run) => { queryHook = {match, run}; },
    async batch(statements) {
      if (batchHook) { const hook = batchHook; batchHook = undefined; await hook(); }
      sql.exec('BEGIN');
      try {
        const rows = [];
        for (const statement of statements) rows.push(await statement.run());
        sql.exec('COMMIT'); return rows;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  globalThis.__syntheticIntakePromoDb = adapter;
  t.after(() => { sql.close(); delete globalThis.__syntheticIntakePromoDb; delete globalThis.__syntheticTopicOwner; });
  const topicId = 'SYNTHETIC-topic';
  sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES (?,?,'qbitai-zh','SYNTHETIC','SYNTHETIC isolated test','SYNTHETIC','SYNTHETIC','now','视觉影像',0,'SYNTHETIC','SYNTHETIC','SYNTHETIC','SYNTHETIC','SYNTHETIC',0,'zh')")
    .run(topicId, 'https://www.qbitai.com/SYNTHETIC-not-a-real-article');
  return {sql, adapter, topicId};
}

async function intakeFixture(t) {
  const f = fixture(t);
  const input = {topic_id: f.topicId, goal: 'SYNTHETIC original proposal', rights_status: 'rights_pending',
    rights_note: 'SYNTHETIC no media or publication authorization', source_urls: [],
    media: [{library_file_id: 'libfile_' + '1'.repeat(32), sha256: 'a'.repeat(64), bytes: 123, duration: 10,
      width: 300, height: 400, fps: 24, role: 'SYNTHETIC', observations: 'SYNTHETIC fixture', verification: 'SYNTHETIC metadata only'}]};
  const proposal = (await p.proposeIntake(input)).proposal;
  const job = (await p.createJob(f.topicId, OWNER, false, 'node', 'paused')).job;
  return {...f, proposal, job};
}

async function promoFixture(t, status = 'awaiting_review') {
  const f = fixture(t), job = (await p.createJob(f.topicId, OWNER, true, 'node', 'paused')).job;
  const content = JSON.stringify({script: 'SYNTHETIC script only', materials: 'SYNTHETIC', limits: 'SYNTHETIC', evidence: [], storyboard: []});
  const hash = sha(content);
  f.sql.prepare('UPDATE production_jobs SET revision=1,status=?,approved_revision=?,approved_hash=?,updated_at=? WHERE id=?')
    .run(status, status === 'approved' || status === 'completed' ? 1 : null, status === 'approved' || status === 'completed' ? hash : null, 'SYNTHETIC-initial', job.id);
  f.sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES (?,1,'SYNTHETIC-draft',?,?,'SYNTHETIC','now')")
    .run(job.id, content, hash);
  return {...f, jobId: job.id};
}

test('SYNTHETIC concurrent intake confirmation with a different goal cannot report the winner as its own command', async t => {
  const f = await intakeFixture(t); let winner;
  f.adapter.beforeNextBatch(async () => {
    winner = await p.acceptIntake(f.topicId, f.proposal.version, OWNER, 'SYNTHETIC competing goal B');
  });
  await assert.rejects(() => p.acceptIntake(f.topicId, f.proposal.version, OWNER, 'SYNTHETIC outer goal A'),
    error => error.status === 409);
  assert.equal(winner.job.intake.proposal.goal, 'SYNTHETIC competing goal B');
  const accepted = await p.acceptedIntake(f.job.id);
  assert.equal(accepted.command_hash, winner.job.intake.command_hash);
  assert.equal(accepted.proposal.goal, 'SYNTHETIC competing goal B');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_reviews WHERE decision='intake_accepted'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT attempt FROM production_jobs WHERE id=?').get(f.job.id).attempt, 0);
});

test('SYNTHETIC concurrent identical intake confirmation still replays one immutable acceptance', async t => {
  const f = await intakeFixture(t), goal = 'SYNTHETIC identical command';
  f.adapter.beforeNextBatch(() => p.acceptIntake(f.topicId, f.proposal.version, OWNER, goal));
  const result = await p.acceptIntake(f.topicId, f.proposal.version, OWNER, goal);
  assert.equal(result.replayed, true); assert.equal(result.job.intake.proposal.goal, goal);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_reviews WHERE decision='intake_accepted'").get().n, 1);
});

test('SYNTHETIC paused, failed and revising jobs cannot queue or claim new promo generation', async t => {
  for (const status of ['paused', 'failed', 'waiting_executor', 'running']) await t.test(status, async sub => {
    const f = await promoFixture(sub), queued = await p.requestPromo(f.jobId, OWNER, 'SYNTHETIC-original-request');
    f.sql.prepare('UPDATE production_jobs SET status=?,updated_at=? WHERE id=?').run(status, 'SYNTHETIC-blocked', f.jobId);
    const before = f.sql.prepare('SELECT * FROM production_promo_packages').all();
    assert.notEqual((await p.nextWork(f.jobId)).kind, 'promotion-package');
    await assert.rejects(() => p.claimPromo(queued.package.id, 'SYNTHETIC-no-model-call'), error => error.status === 409);
    await assert.rejects(() => p.requestPromo(f.jobId, OWNER, 'SYNTHETIC-new-request'), error => error.status === 409);
    assert.deepEqual(f.sql.prepare('SELECT * FROM production_promo_packages').all(), before);
    assert.equal((await p.requestPromo(f.jobId, OWNER, 'SYNTHETIC-original-request')).replayed, true, 'an exact saved request may still be read back');
  });
});

test('SYNTHETIC a pause after claim validation wins the SQL CAS and leaves the request queued', async t => {
  const f = await promoFixture(t), queued = await p.requestPromo(f.jobId, OWNER, 'SYNTHETIC-request');
  let raced = false;
  f.adapter.beforeQuery(query => query.startsWith("UPDATE production_promo_packages SET status='running'"), () => {
    raced = true;
    f.sql.prepare("UPDATE production_jobs SET status='paused',updated_at='SYNTHETIC-raced-pause' WHERE id=?").run(f.jobId);
  });
  await assert.rejects(() => p.claimPromo(queued.package.id, 'SYNTHETIC-raced-claim'), error => error.status === 409);
  assert.equal(raced, true);
  const saved = f.sql.prepare('SELECT status,lease_hash,lease_until,invocation_id FROM production_promo_packages WHERE id=?').get(queued.package.id);
  assert.equal(saved.status, 'queued'); assert.equal(saved.lease_hash, null); assert.equal(saved.lease_until, null); assert.equal(saved.invocation_id, null);
});

test('SYNTHETIC awaiting-review, approved and completed jobs retain eligible promo generation', async t => {
  for (const status of ['awaiting_review', 'approved', 'completed']) await t.test(status, async sub => {
    const f = await promoFixture(sub, status), queued = await p.requestPromo(f.jobId, OWNER, 'SYNTHETIC-request');
    const selection = await p.nextWork(f.jobId);
    assert.equal(selection.kind, 'promotion-package'); assert.equal(selection.package_id, queued.package.id);
    const claimed = await p.claimPromo(queued.package.id, 'SYNTHETIC-one-call');
    assert.equal(claimed.package.status, 'running'); assert.ok(claimed.lease_token);
    await assert.rejects(() => p.claimPromo(queued.package.id, 'SYNTHETIC-duplicate'), error => error.status === 409);
  });
});

test('SYNTHETIC topic entry returns only the signed-in owner task and its accepted command', async t => {
  const f = await intakeFixture(t), goal = 'SYNTHETIC owner-edited frozen goal';
  const accepted = await p.acceptIntake(f.topicId, f.proposal.version, OWNER, goal);
  await p.proposeIntake({...f.proposal, expected_version: f.proposal.version, goal: 'SYNTHETIC newer unaccepted proposal'});
  globalThis.__syntheticTopicOwner = OWNER;
  const response = await p.productionGET(new Request('https://site.test/api/production?topic_id=' + encodeURIComponent(f.topicId)));
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const value = await response.json();
  assert.equal(value.job.id, accepted.job.id); assert.equal(value.job.intake.proposal.goal, goal);
  assert.equal(value.job.intake.command_hash, accepted.job.intake.command_hash);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM production_jobs').get().n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_reviews WHERE decision='intake_accepted'").get().n, 1);
});

test('SYNTHETIC topic entry hides cross-owner tasks, including shared test jobs, and missing topics', async t => {
  const f = await promoFixture(t);
  globalThis.__syntheticTopicOwner = 'SYNTHETIC-other-owner';
  const hidden = await p.productionGET(new Request('https://site.test/api/production?topic_id=' + encodeURIComponent(f.topicId)));
  assert.equal(hidden.status, 200); assert.deepEqual(await hidden.json(), {job: null});
  assert.equal(await p.findOwnerTopicJob(f.topicId, 'SYNTHETIC-other-owner'), null);
  globalThis.__syntheticTopicOwner = OWNER;
  const missing = await p.productionGET(new Request('https://site.test/api/production?topic_id=SYNTHETIC-missing'));
  assert.equal(missing.status, 200); assert.deepEqual(await missing.json(), {job: null});
  assert.equal((await p.findOwnerTopicJob(f.topicId, OWNER)).id, f.jobId);
});

test('SYNTHETIC topic entry requires login and rejects ambiguous or empty lookup', async t => {
  const f = fixture(t);
  globalThis.__syntheticTopicOwner = null;
  const unauthenticated = await p.productionGET(new Request('https://site.test/api/production?topic_id=' + f.topicId));
  assert.equal(unauthenticated.status, 401); assert.equal('job' in await unauthenticated.json(), false);
  globalThis.__syntheticTopicOwner = OWNER;
  assert.equal((await p.productionGET(new Request('https://site.test/api/production?topic_id='))).status, 400);
  assert.equal((await p.productionGET(new Request('https://site.test/api/production?topic_id=' + f.topicId + '&id=SYNTHETIC-ambiguous'))).status, 400);
});
