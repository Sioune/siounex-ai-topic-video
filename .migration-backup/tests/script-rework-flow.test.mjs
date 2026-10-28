// SYNTHETIC :memory: integration fixtures. No network, real CLI/model, media,
// visitor identity, owner decision or production-state change is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {savedFeedbackForGeneration} from '../scripts/feedback-rework.mjs';
import {scriptPrompt} from '../scripts/script-prompt.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const frozen = JSON.parse(fs.readFileSync('production/skill-snapshot/snapshot.json', 'utf8'));
const migrations = fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort().map(f => fs.readFileSync('drizzle/' + f, 'utf8'));
const built = await build({stdin: {contents: [
  "export {saveScriptFeedback} from './lib/script-feedback';",
  "export {claimJob,getJob,submitDraft,reviewJob,reopenJob} from './lib/production';",
  "export {decideMilestone,setMode,resumeDecision,recordDraft,claimReview} from './lib/milestones';",
  "export {nextWork} from './lib/dispatch';",
  "export {activeScriptLock,lockSegments} from './lib/script-lock.mts';",
  "export {feedbackReworkBinding} from './lib/script-feedback-contract';",
].join('\n'), resolveDir: process.cwd()}, bundle: true, platform: 'node', format: 'esm', write: false,
footer: {js: '//# sourceURL=synthetic-script-rework-flow.mjs'}, plugins: [{name: 'isolated-db', setup(b) {
  b.onResolve({filter: /^\.\/store$/}, () => ({path: 'db', namespace: 'fixture'}));
  b.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: 'export function db(){return globalThis.__scriptReworkFlowDb} export function siteArchiveBucket(){throw Error("SYNTHETIC script rework must not access private archive storage")}'}));
}}]});
const p = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
function fixture(t, {legacy = false, reworks = 0} = {}) {
  const sql = new DatabaseSync(':memory:'); for (const migration of migrations) sql.exec(migration);
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return {results: sql.prepare(this.query).all(...this.args)}; }
    async run() { return {meta: {changes: Number(sql.prepare(this.query).run(...this.args).changes)}}; }
  }
  let beforeBatch;
  globalThis.__scriptReworkFlowDb = {prepare: q => new Statement(q), async batch(statements) {
    if (beforeBatch) { const hook = beforeBatch; beforeBatch = undefined; hook(); }
    sql.exec('BEGIN'); try {
      const result = statements.map(s => ({meta: {changes: Number(sql.prepare(s.query).run(...s.args).changes)}}));
      sql.exec('COMMIT'); return result;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  }};
  t.after(() => { sql.close(); delete globalThis.__scriptReworkFlowDb; });
  const id = 'SYNTHETIC-script-rework-flow', source = JSON.stringify({url: 'https://example.org/SYNTHETIC-script-rework-flow'});
  sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES ('SYNTHETIC-topic','https://example.org/SYNTHETIC-topic','test','test','SYNTHETIC','SYNTHETIC','SYNTHETIC','now','test',0,'test','test','test','test','test',0,'zh')");
  sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,reworks,created_at,updated_at) VALUES (?,'SYNTHETIC-topic','owner',1,'awaiting_review',?,?,?,1,?,'now','now')")
    .run(id, source, JSON.stringify(frozen), 'a'.repeat(64), reworks);
  const content = JSON.stringify(output({source_snapshot: source}, 'SYNTHETIC initial script'));
  sql.prepare("INSERT INTO production_drafts VALUES (?,1,'SYNTHETIC-initial',?,?,'SYNTHETIC-test','now')").run(id, content, sha(content));
  return {sql, id, hash: sha(content), legacy, beforeBatch: fn => { beforeBatch = fn; }};
}
function output(job, script = 'SYNTHETIC revised narration') {
  const feedback = savedFeedbackForGeneration({...job, drafts: job.drafts || [], reviews: job.reviews || []});
  const lock = p.activeScriptLock({...job, revision: job.revision || 1, mode_epoch: job.mode_epoch || 0, contract_hash: job.contract_hash || '', drafts: job.drafts || []});
  return {script: lock?.text || script, storyboard: lock ? p.lockSegments(lock.text).map(narration => ({narration})) : [],
    materials: 'SYNTHETIC source materials', limits: 'SYNTHETIC; no actual work claim',
    evidence: [{url: JSON.parse(job.source_snapshot).url, title: 'SYNTHETIC source', published_at: null,
      retrieved_at: '2026-10-14T00:00:00Z', sha256: 'b'.repeat(64), facts: ['SYNTHETIC fact'], materials: ['SYNTHETIC'], limits: ['SYNTHETIC']}],
    execution: {mode: 'operator-assisted', executor: 'SYNTHETIC-test', source_hash: sha(job.source_snapshot), skill_hash: frozen.sha256,
      ...(feedback ? {feedback} : {}), ...(lock ? {script_lock: lock} : {})}};
}
async function ready(f) { if (!f.legacy) { const d = (await p.getJob(f.id)).drafts[0]; await p.recordDraft(f.id, 1, d.content_hash, d.content); } return p.getJob(f.id); }
async function decide(job, node, decision = 'approve', reason = '') {
  const m = job.milestones.find(m => m.node === node && m.revision === job.revision);
  return p.decideMilestone(job.id, m.id, m.revision, m.artifact_hash, m.mode_epoch, decision, {reason}, 'owner');
}
function feedbackBody(job, note) { const d = job.drafts.find(d => d.revision === job.revision); return {revision: job.revision, content_hash: d.content_hash, mode_epoch: job.mode_epoch, note}; }

test('SYNTHETIC approve -> reopen with exact feedback -> new revision -> approve closes the website loop', async t => {
  const f = fixture(t); let job = await ready(f); job = await decide(job, 'source'); job = await decide(job, 'script');
  assert.equal(job.status, 'approved'); const old = f.sql.prepare('SELECT * FROM production_drafts').get();
  const note = 'SYNTHETIC replace the ending with one specific question and keep the verified facts';
  job = await p.reopenJob(f.id, 'owner', job.revision, job.approved_hash, note);
  assert.equal(job.status, 'waiting_executor'); assert.equal(job.reworks, 1); assert.equal(job.approved_hash, null);
  assert.ok(job.milestones.every(m => m.revision !== 1 || m.status === 'invalidated'));
  const feedback = savedFeedbackForGeneration(job); assert.equal(feedback.note, note); assert.ok(p.feedbackReworkBinding(job));
  const prompt = scriptPrompt(job, Buffer.from('<html><title>SYNTHETIC</title><article>SYNTHETIC verifiable source fixture.</article></html>'), {feedback});
  assert.ok(prompt.prompt.includes(JSON.stringify(note).slice(1, -1))); assert.equal(prompt.manifest.feedback_sha256, sha(note));
  const claim = await p.claimJob('SYNTHETIC-test', f.id), draft = output(claim.job);
  const submitted = await p.submitDraft(f.id, claim.lease_token, 1, 'SYNTHETIC-reopened-v2', draft);
  assert.equal(submitted.job.revision, 2); assert.equal(submitted.job.approved_hash, null);
  assert.equal((await p.submitDraft(f.id, 'expired', 1, 'SYNTHETIC-reopened-v2', draft)).replayed, true);
  job = await decide(submitted.job, 'source'); job = await decide(job, 'script');
  assert.equal(job.status, 'approved'); assert.equal(job.approved_revision, 2); assert.equal(job.reworks, 1);
  assert.equal(job.ai_calls, 0); assert.equal(job.operations.length, 0); assert.equal(job.publication_reports.length, 0);
  assert.deepEqual(f.sql.prepare('SELECT * FROM production_drafts WHERE revision=1').get(), old);
});

test('SYNTHETIC NodeReview rejection is queued once, consumed exactly and cannot bypass the queue receipt', async t => {
  const f = fixture(t); let job = await ready(f); job = await decide(job, 'source');
  const note = 'SYNTHETIC fix this precise statement'; job = await decide(job, 'script', 'revise', note);
  assert.equal(job.reworks, 1); assert.equal(savedFeedbackForGeneration(job).note, note);
  const repeated = await decide(job, 'script', 'revise', note); assert.equal(repeated.reworks, 1);
  assert.equal(repeated.reviews.filter(r => r.decision === 'script_feedback_rework').length, 1);
  const claim = await p.claimJob('SYNTHETIC-test', f.id), draft = output(claim.job), invalid = structuredClone(draft);
  delete invalid.execution.feedback;
  await assert.rejects(() => p.submitDraft(f.id, claim.lease_token, 1, 'SYNTHETIC-no-binding', invalid), /反馈/);
  job = (await p.submitDraft(f.id, claim.lease_token, 1, 'SYNTHETIC-node-v2', draft)).job;
  assert.equal(job.status, 'awaiting_review'); job = await decide(job, 'source'); job = await decide(job, 'script');
  assert.equal(job.approved_revision, 2); assert.equal(job.reworks, 1);
});

test('SYNTHETIC a returned full script stays verbatim through ordinary NodeReview rejection and the next revision', async t => {
  const f = fixture(t); let job = await ready(f);
  const original = 'SYNTHETIC exact opening!\nSYNTHETIC exact ending?';
  job = (await p.saveScriptFeedback(f.id, 'owner', {...feedbackBody(job, 'SYNTHETIC keep the full original'), locked_script: original})).job;
  let claim = await p.claimJob('SYNTHETIC-test', f.id);
  job = (await p.submitDraft(f.id, claim.lease_token, 1, 'SYNTHETIC-lock-v2', output(claim.job))).job;
  assert.equal(p.activeScriptLock(job).text, original); job = await decide(job, 'source');
  job = await decide(job, 'script', 'revise', 'SYNTHETIC improve the visual plan without changing a narration character');
  assert.equal(job.reworks, 2); assert.equal(p.activeScriptLock(job).source_revision, 2);
  claim = await p.claimJob('SYNTHETIC-test', f.id); const draft = output(claim.job), invalid = structuredClone(draft);
  invalid.script = 'SYNTHETIC forbidden rewrite';
  await assert.rejects(() => p.submitDraft(f.id, claim.lease_token, 2, 'SYNTHETIC-rewrite', invalid), /锁定全文/);
  job = (await p.submitDraft(f.id, claim.lease_token, 2, 'SYNTHETIC-lock-v3', draft)).job;
  assert.equal(JSON.parse(job.drafts[0].content).script, original); job = await decide(job, 'source'); job = await decide(job, 'script');
  assert.equal(job.status, 'approved'); assert.equal(job.reworks, 2);
  await assert.rejects(() => p.reopenJob(f.id, 'owner', 3, job.approved_hash, 'SYNTHETIC third change'), /预算/);
  assert.equal((await p.getJob(f.id)).reworks, 2);
});

test('SYNTHETIC old epoch feedback remains immutable while fresh current-mode feedback can be claimed and submitted', async t => {
  const f = fixture(t); let job = await ready(f);
  job = (await p.saveScriptFeedback(f.id, 'owner', feedbackBody(job, 'SYNTHETIC old epoch correction'))).job;
  const old = job.reviews.find(r => r.decision === 'script_feedback_rework');
  job = await p.setMode(f.id, 'owner', 'auto', 0); job = await p.resumeDecision(f.id, 'owner', 'stop', 'SYNTHETIC stop old-mode request');
  job = await p.resumeDecision(f.id, 'owner', 'manual', 'SYNTHETIC explicit manual takeover');
  assert.equal(job.mode_epoch, 2); assert.throws(() => savedFeedbackForGeneration(job));
  job = (await p.saveScriptFeedback(f.id, 'owner', feedbackBody(job, 'SYNTHETIC fresh current-mode correction'))).job;
  assert.equal(job.reworks, 2); assert.equal(savedFeedbackForGeneration(job).note, 'SYNTHETIC fresh current-mode correction');
  assert.equal(p.feedbackReworkBinding(job).mode_epoch, 2);
  const claim = await p.claimJob('SYNTHETIC-test', f.id); assert.ok(claim.job);
  job = (await p.submitDraft(f.id, claim.lease_token, 1, 'SYNTHETIC-new-epoch-v2', output(claim.job))).job;
  assert.equal(job.revision, 2); assert.equal(job.mode_epoch, 2);
  assert.equal(job.reviews.find(r => r.id === old.id).note, old.note);
});

test('SYNTHETIC historical review uses the same queue and cannot bypass the exhausted rework budget', async t => {
  for (const reworks of [1, 2]) await t.test('existing reworks ' + reworks, async sub => {
    const f = fixture(sub, {legacy: true, reworks}), job = await ready(f);
    if (reworks === 2) {
      await assert.rejects(() => p.reviewJob(f.id, 'owner', 1, f.hash, 'revise', 'SYNTHETIC extra revision'), /预算/);
      const blocked = await p.getJob(f.id); assert.equal(blocked.reworks, 2); assert.equal(blocked.status, 'awaiting_review');
      assert.equal(blocked.reviews.filter(r => r.decision === 'script_feedback_rework').length, 0);
      assert.equal((await p.claimJob('SYNTHETIC-test', f.id)).job, null);
    } else {
      const queued = await p.reviewJob(f.id, 'owner', 1, f.hash, 'revise', 'SYNTHETIC precise legacy correction');
      assert.equal(queued.reworks, 2); assert.equal(savedFeedbackForGeneration(queued).note, 'SYNTHETIC precise legacy correction');
      assert.ok((await p.claimJob('SYNTHETIC-test', f.id)).job);
    }
  });
});

test('SYNTHETIC a review-state race preserves the owner opinion without queuing or spending a rework', async t => {
  const f = fixture(t); let job = await ready(f); job = await decide(job, 'source');
  const m = job.milestones.find(m => m.node === 'script' && m.revision === 1);
  f.beforeBatch(() => { f.sql.prepare("UPDATE production_milestones SET status='approved' WHERE id=?").run(m.id); });
  await assert.rejects(() => decide(job, 'script', 'revise', 'SYNTHETIC racing correction'), /意见已保存/);
  const after = await p.getJob(f.id);
  assert.equal(after.status, 'awaiting_review'); assert.equal(after.reworks, 0);
  assert.equal(after.reviews.filter(r => r.decision === 'script_feedback').length, 1);
  assert.equal(after.reviews.filter(r => r.decision === 'script_feedback_rework').length, 0);
  assert.equal(after.milestones.find(x => x.id === m.id).status, 'approved');
});

test('SYNTHETIC changing mode on unclaimed feedback returns to review and fresh owner feedback completes the real loop', async t => {
  const f = fixture(t); let job = await ready(f);
  job = (await p.saveScriptFeedback(f.id, 'owner', feedbackBody(job, 'SYNTHETIC pending unclaimed correction'))).job;
  const old = job.reviews.find(r => r.decision === 'script_feedback_rework'), counters = {reworks: job.reworks, attempt: job.attempt, ai_calls: job.ai_calls, checkpoint_version: job.checkpoint_version};
  job = await p.setMode(f.id, 'owner', 'auto', 0);
  assert.equal(job.status, 'awaiting_review'); assert.equal(job.mode_epoch, 1);
  for (const [key, value] of Object.entries(counters)) assert.equal(job[key], value, 'mode change must not spend or reset ' + key);
  assert.equal(job.reviews.find(r => r.id === old.id).note, old.note);
  assert.equal((await p.claimJob('SYNTHETIC-must-wait', f.id)).job, null);
  assert.equal((await p.nextWork(f.id)).job, null, 'do not review old script automatically instead of consuming fresh owner feedback');
  const source = job.milestones.find(m => m.node === 'source' && m.revision === 1);
  await assert.rejects(() => p.claimReview(f.id, source.id, 'SYNTHETIC-invalid-old-mode-review'), /模式/);
  assert.equal((await p.getJob(f.id)).ai_calls, counters.ai_calls);
  job = (await p.saveScriptFeedback(f.id, 'owner', feedbackBody(job, 'SYNTHETIC explicit current-mode correction'))).job;
  assert.equal(job.status, 'waiting_executor'); assert.equal(savedFeedbackForGeneration(job).note, 'SYNTHETIC explicit current-mode correction');
  assert.equal((await p.nextWork(f.id)).kind, 'text');
  const claim = await p.claimJob('SYNTHETIC-current-mode', f.id); assert.ok(claim.job);
  job = (await p.submitDraft(f.id, claim.lease_token, 1, 'SYNTHETIC-mode-change-v2', output(claim.job))).job;
  assert.equal(job.revision, 2); assert.equal(job.reviews.find(r => r.id === old.id).note, old.note);
  job = await p.setMode(f.id, 'owner', 'node', 1); job = await decide(job, 'source'); job = await decide(job, 'script');
  assert.equal(job.status, 'approved'); assert.equal(job.approved_revision, 2); assert.equal(job.reworks, 2); assert.equal(job.ai_calls, 0);
});

test('SYNTHETIC a live job lease appearing during mode change blocks its CAS without resetting feedback or budget', async t => {
  const f = fixture(t); let job = await ready(f);
  job = (await p.saveScriptFeedback(f.id, 'owner', feedbackBody(job, 'SYNTHETIC pending correction'))).job;
  const milestones = f.sql.prepare('SELECT * FROM production_milestones ORDER BY id').all();
  const queue = job.reviews.find(r => r.decision === 'script_feedback_rework');
  f.beforeBatch(() => { f.sql.prepare('UPDATE production_jobs SET lease_until=?,lease_hash=? WHERE id=?').run(Date.now() + 600000, 'SYNTHETIC-racing-live-lease', f.id); });
  await assert.rejects(() => p.setMode(f.id, 'owner', 'auto', 0), /模式/);
  const after = await p.getJob(f.id); assert.equal(after.mode_epoch, 0); assert.equal(after.status, 'waiting_executor');
  assert.equal(after.reworks, 1); assert.equal(after.attempt, 0); assert.equal(after.ai_calls, 0);
  assert.equal(after.reviews.find(r => r.id === queue.id).note, queue.note);
  assert.deepEqual(f.sql.prepare('SELECT * FROM production_milestones ORDER BY id').all(), milestones);
});

test('SYNTHETIC the final reserved rework cannot change mode and its original queue remains executable', async t => {
  const f = fixture(t, {reworks: 1}); let job = await ready(f);
  job = (await p.saveScriptFeedback(f.id, 'owner', feedbackBody(job, 'SYNTHETIC final reserved correction'))).job;
  assert.equal(job.reworks, 2); assert.equal(job.status, 'waiting_executor');
  const snapshot = () => JSON.stringify({jobs: f.sql.prepare('SELECT * FROM production_jobs').all(),
    milestones: f.sql.prepare('SELECT * FROM production_milestones ORDER BY id').all(), reviews: f.sql.prepare('SELECT * FROM production_reviews ORDER BY id').all()});
  const before = snapshot();
  await assert.rejects(() => p.setMode(f.id, 'owner', 'auto', 0), /最后一次返工已排队.*保持当前审核模式/);
  assert.equal(snapshot(), before); assert.equal((await p.nextWork(f.id)).kind, 'text');
  const claim = await p.claimJob('SYNTHETIC-final-rework', f.id); assert.ok(claim.job);
  assert.equal(claim.job.mode_epoch, 0); assert.equal(savedFeedbackForGeneration(claim.job).note, 'SYNTHETIC final reserved correction');
  job = (await p.submitDraft(f.id, claim.lease_token, 1, 'SYNTHETIC-final-budget-v2', output(claim.job))).job;
  assert.equal(job.reworks, 2); job = await decide(job, 'source'); job = await decide(job, 'script'); assert.equal(job.status, 'approved');
});

test('SYNTHETIC final-budget reservation appearing during mode validation is stopped by the SQL CAS', async t => {
  const f = fixture(t); let job = await ready(f);
  job = (await p.saveScriptFeedback(f.id, 'owner', feedbackBody(job, 'SYNTHETIC reserved correction'))).job;
  const milestones = f.sql.prepare('SELECT * FROM production_milestones ORDER BY id').all();
  const queue = job.reviews.find(r => r.decision === 'script_feedback_rework');
  f.beforeBatch(() => { f.sql.prepare('UPDATE production_jobs SET reworks=2 WHERE id=?').run(f.id); });
  await assert.rejects(() => p.setMode(f.id, 'owner', 'auto', 0), /最后一次返工已排队/);
  const after = await p.getJob(f.id); assert.equal(after.mode_epoch, 0); assert.equal(after.status, 'waiting_executor'); assert.equal(after.reworks, 2);
  assert.equal(after.reviews.find(r => r.id === queue.id).note, queue.note);
  assert.deepEqual(f.sql.prepare('SELECT * FROM production_milestones ORDER BY id').all(), milestones);
  assert.equal((await p.nextWork(f.id)).kind, 'text'); assert.ok((await p.claimJob('SYNTHETIC-final-budget-CAS', f.id)).job);
});

test('SYNTHETIC a concurrently created final feedback queue also preserves the current executable mode', async t => {
  const f = fixture(t, {reworks: 1}); await ready(f);
  const note = 'SYNTHETIC concurrent final reservation', feedbackId = 'SYNTHETIC-concurrent-owner-feedback', queueId = 'SYNTHETIC-concurrent-feedback-queue';
  f.beforeBatch(() => {
    const opinion = JSON.stringify({schema: 'siounex-script-feedback-v1', note, revision: 1, script_hash: f.hash,
      mode_epoch: 0, approval: false, rework_started: false, source_dependency_preserved: true});
    const queue = JSON.stringify({schema: 'siounex-feedback-rework-v1', feedback_id: feedbackId,
      feedback_note_sha256: sha(note), source_revision: 1, source_hash: f.hash, mode_epoch: 0, target_revision: 2,
      contract_hash: 'a'.repeat(64), source_dependency_preserved: true, quality_approval: false,
      new_paid_authorization: false, publication_authorization: false});
    f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES (?,?,1,?,'script_feedback',?,'owner','now')").run(feedbackId, f.id, f.hash, opinion);
    f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES (?,?,1,?,'script_feedback_rework',?,'site-feedback-queue','now')").run(queueId, f.id, f.hash, queue);
    f.sql.prepare("UPDATE production_jobs SET status='waiting_executor',reworks=2,review_note=? WHERE id=?").run(note, f.id);
  });
  await assert.rejects(() => p.setMode(f.id, 'owner', 'auto', 0), /最后一次返工已排队/);
  const after = await p.getJob(f.id); assert.equal(after.mode_epoch, 0); assert.equal(after.review_mode, 'node');
  assert.equal(after.status, 'waiting_executor'); assert.equal(after.reworks, 2);
  assert.equal(savedFeedbackForGeneration(after).queue_id, queueId); assert.equal((await p.nextWork(f.id)).kind, 'text');
  assert.ok((await p.claimJob('SYNTHETIC-concurrent-final-reservation', f.id)).job);
});

test('SYNTHETIC dispatch and claim skip stale or corrupt feedback so an older blocked task cannot starve another job', async t => {
  const mutations = [
    ['stale mode', (f, queue) => f.sql.prepare('UPDATE production_jobs SET mode_epoch=1 WHERE id=?').run(f.id)],
    ['broken JSON', (f, queue) => f.sql.prepare("UPDATE production_reviews SET note='SYNTHETIC not JSON' WHERE id=?").run(queue.id)],
    ['wrong queue schema', (f, queue) => f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify({...JSON.parse(queue.note), schema: 'SYNTHETIC-invalid'}), queue.id)],
    ['wrong original opinion owner', (f, queue) => f.sql.prepare("UPDATE production_reviews SET reviewer='SYNTHETIC-other-owner' WHERE id=?").run(JSON.parse(queue.note).feedback_id)],
  ];
  for (const [name, mutate] of mutations) await t.test(name, async sub => {
    const f = fixture(sub); let job = await ready(f);
    job = (await p.saveScriptFeedback(f.id, 'owner', feedbackBody(job, 'SYNTHETIC queued correction'))).job;
    const queue = job.reviews.find(r => r.decision === 'script_feedback_rework');
    f.sql.prepare("UPDATE production_jobs SET is_test=0,created_at='0000' WHERE id=?").run(f.id); mutate(f, queue);
    const other = 'job_11111111-1111-1111-1111-111111111111';
    f.sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES ('SYNTHETIC-ready-topic','https://example.org/SYNTHETIC-ready','test','test','SYNTHETIC','SYNTHETIC','SYNTHETIC','now','test',0,'test','test','test','test','test',0,'zh')");
    f.sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,created_at,updated_at) VALUES (?,'SYNTHETIC-ready-topic','owner',0,'waiting_executor',?,?,?,0,'9999','now')")
      .run(other, JSON.stringify({url: 'https://example.org/SYNTHETIC-ready'}), JSON.stringify(frozen), 'c'.repeat(64));
    const oldQueueNote = f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(queue.id).note;
    assert.equal((await p.nextWork()).job.id, other);
    assert.equal((await p.claimJob('SYNTHETIC-no-repeat', f.id)).job, null);
    const unchanged = await p.getJob(f.id); assert.equal(unchanged.attempt, 0); assert.equal(unchanged.reworks, 1);
    assert.equal(f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(queue.id).note, oldQueueNote);
    assert.equal((await p.claimJob('SYNTHETIC-other-job', other)).job.id, other);
  });
});
