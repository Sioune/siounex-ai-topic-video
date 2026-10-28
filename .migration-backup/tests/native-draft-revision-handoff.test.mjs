// SYNTHETIC isolated SQLite fixtures only. These tests do not inspect real media,
// contact ChatCut/Library, report a real user decision, or claim media quality approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

const JOB = 'job_9ef39025-d92e-4770-82d0-05881451c5df';
const OWNER = 'SYNTHETIC-fixture-owner';
const OLD_SHA = 'a'.repeat(64);
const NEW_SHA = 'b'.repeat(64);
const THIRD_SHA = 'c'.repeat(64);
const PROJECT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TIMELINE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RENDER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const AT = '2026-10-14T00:00:00Z';
const digest = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const migrations = fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()
  .map(f => fs.readFileSync('drizzle/' + f, 'utf8'));

// The in-memory adapter implements the D1 surface used by the production code.
// beforeBatch runs after the handler reads its state, immediately before its CAS.
function adapter(sql) {
  let beforeBatch;
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return {results: sql.prepare(this.query).all(...this.args)}; }
    async run() { return {meta: {changes: Number(sql.prepare(this.query).run(...this.args).changes)}}; }
  }
  return {
    prepare: query => new Statement(query),
    beforeNextBatch: fn => { beforeBatch = fn; },
    async batch(statements) {
      if (beforeBatch) { const fn = beforeBatch; beforeBatch = undefined; fn(); }
      sql.exec('BEGIN');
      try {
        const result = statements.map(s => ({meta: {changes: Number(sql.prepare(s.query).run(...s.args).changes)}}));
        sql.exec('COMMIT');
        return result;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
}

// Build in memory: the test creates no generated files and adds no dependencies.
const built = await build({
  stdin: {contents: [
    "export {returnNativeDraftRevision} from './lib/native-draft-revision-handoff';",
    "export {returnNativeDraft} from './lib/native-draft-handoff';",
    "export {recordReportedVideoFeedback} from './lib/reported-video-feedback';",
    "export {getJob} from './lib/production';",
    "export {decideMilestone} from './lib/milestones';",
    "export {productionFacts} from './lib/production-facts.mts';",
    "export {promoBinding,listPromoDeliveries,registerNativePromoVideo} from './lib/promo-delivery';",
  ].join('\n'), resolveDir: process.cwd()},
  bundle: true, platform: 'node', format: 'esm', write: false,
  footer: {js: '//# sourceURL=synthetic-native-revision-bundle.mjs'},
  plugins: [{name: 'synthetic-revision-db', setup(builder) {
    builder.onResolve({filter: /^\.\/store$/}, () => ({path: 'fixture-db', namespace: 'synthetic'}));
    builder.onLoad({filter: /.*/, namespace: 'synthetic'}, () => ({
      contents: 'export function db(){return globalThis.__syntheticNativeRevisionDb} export function siteArchiveBucket(){throw Error("Unexpected SYNTHETIC archive access")}',
    }));
  }}],
});
const p = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));

function finalDuration(sha, duration = '54.9') {
  return {schema: 'actual-final-duration-v1', file_sha256: sha, probe_sha256: 'd'.repeat(64), checked_at: AT,
    report: {hard_max_seconds: 60, hard_duration_pass: true, maximum_measured_seconds: duration,
      measurements_seconds: {container_duration: duration, video_0_playback_end: duration, audio_0_playback_end: duration}, errors: []}};
}
function nativeBody(script, sha = NEW_SHA) {
  return {revision: 2, script_hash: script, mode_epoch: 0, sha256: sha, size_bytes: 12345, duration: 54.9,
    quality_approved: false, publication_authorized: false, new_paid_calls: 0,
    library_file_id: 'libfile_' + 'd'.repeat(32), file_id: 'file_' + 'e'.repeat(32), library_version: 0,
    verified_at: AT, materialized_sha256: sha, project_id: PROJECT, timeline_id: TIMELINE, render_id: RENDER,
    file_name: 'SYNTHETIC-DO-NOT-DELIVER.mp4', source: 'SYNTHETIC completed render and probe fixture; no real media inspected',
    qa: {semantic_listening_passed: false, recovery_receipt_sha256: 'f'.repeat(64), final_duration: finalDuration(sha),
      preview_proof: {schema: 'actual-native-preview-v1', source: 'native-timeline-preview', project_id: PROJECT,
        timeline_id: TIMELINE, render_id: RENDER, video_sha256: sha, receipt_sha256: '1'.repeat(64), checked_at: AT,
        frames: [{role: 'opening', time_seconds: 0.5, image_sha256: '2'.repeat(64)},
          {role: 'core', time_seconds: 20, image_sha256: '3'.repeat(64)},
          {role: 'ending', time_seconds: 53, image_sha256: '4'.repeat(64)}]}}};
}

// Complete schema-shaped SYNTHETIC evidence, never a claim that actual footage
// was recorded/reviewed. It exists only inside this isolated database test.
function syntheticDemonstrationCheck() {
  const video = '9'.repeat(64), opening = 'a1'.repeat(32), core = 'b2'.repeat(32);
  return {schema: 'actual-tool-demonstration-v1', semantic_review: 'actual-file-reviewed',
    files: [{kind: 'recorded-tool-session', sha256: video, size_bytes: 12345, duration_seconds: 20,
      checked_at: AT, full_decode: true, actual_tool: 'SYNTHETIC test tool; no real session recorded',
      visible_action_result: 'SYNTHETIC action and output fixture; no real inspection claim', simulated_ui: false,
      frame_hashes: [opening, core], frames: [
        {file: 'SYNTHETIC-NOT-A-REAL-FILE/opening.png', sha256: opening, source_second: 0},
        {file: 'SYNTHETIC-NOT-A-REAL-FILE/core.png', sha256: core, source_second: 10}]}],
    mapping: [{segment: 'opening-0-3', file_sha256: video, source_in: 0, source_out: 3},
      {segment: 'core-operation', file_sha256: video, source_in: 10, source_out: 15}]};
}

const TABLES = ['production_jobs', 'production_drafts', 'production_milestones', 'production_reviews',
  'production_operations', 'production_stages', 'production_promo_packages', 'production_data_videos', 'app_state'];
function snapshot(sql) { return clone(Object.fromEntries(TABLES.map(t => [t, sql.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]))); }
function row(sql, table, id) { return clone(sql.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id)); }
function expectStatus(status) { return error => { assert.equal(error.status, status, error.message); return true; }; }
async function fixture(t, {ownerFeedback = false, downstream = false, requiredDemo = false, declaredBlocked = false} = {}) {
  const sql = new DatabaseSync(':memory:');
  for (const migration of migrations) sql.exec(migration);
  const db = adapter(sql);
  globalThis.__syntheticNativeRevisionDb = db;
  t.after(() => { sql.close(); delete globalThis.__syntheticNativeRevisionDb; });
  sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES ('synthetic-revision-topic','https://example.org/SYNTHETIC-revision','fixture','fixture','SYNTHETIC revision QA','SYNTHETIC','fixture','now','fixture',0,'fixture','fixture','fixture','fixture','fixture',0,'zh')");
  const content = JSON.stringify({script: 'SYNTHETIC approved script; no real content claim', limits: 'QA ONLY', storyboard: [],
    ...(requiredDemo ? {demonstration_check: syntheticDemonstrationCheck()} : {}),
    ...(declaredBlocked ? {production_ready: false} : {})});
  const script = digest(content);
  sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,checkpoint_version,checkpoint,created_at,updated_at) VALUES (?,'synthetic-revision-topic',?,1,'approved','{}',?,'SYNTHETIC-contract',2,2,?,'node',0,2,1,5,7,?,'now','now')")
    .run(JOB, OWNER, JSON.stringify({sha256: '5'.repeat(64)}), script, JSON.stringify({synthetic: true, preserve: 'checkpoint'}));
  if (requiredDemo) sql.prepare('UPDATE production_jobs SET source_snapshot=? WHERE id=?')
    .run(JSON.stringify({demonstration_required: true, synthetic: true}), JOB);
  if (declaredBlocked) sql.prepare('UPDATE production_jobs SET source_snapshot=? WHERE id=?')
    .run(JSON.stringify({category: '视觉影像', synthetic: true}), JOB);
  sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES (?,2,'SYNTHETIC-script',?,?,'SYNTHETIC-software-QA','now')").run(JOB, content, script);
  const scope = JSON.stringify({id: 'SYNTHETIC-existing-scope', scope: {schema: 'owner-media-scope-v1', id: 'SYNTHETIC-existing-scope',
    binding: {revision: 2, script_hash: script, mode_epoch: 0}, scope: 'preparation', new_paid_authorization: false,
    publication_authorization: false, quality_approved: false}});
  sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('media_scope_v1:' + JOB, scope);
  sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('SYNTHETIC-unrelated-sentinel', '{"preserve":true}');
  const original = nativeBody(script, OLD_SHA);
  if(requiredDemo||declaredBlocked)original.demonstration_check=syntheticDemonstrationCheck();
  original.library_file_id = 'libfile_' + '6'.repeat(32); original.file_id = 'file_' + '7'.repeat(32);
  original.render_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  original.qa.preview_proof.render_id = original.render_id;
  const first = await p.returnNativeDraft(JOB, original);
  const baseId = first.milestone_id;
  let feedbackId;
  if (ownerFeedback) {
    const feedback = 'SYNTHETIC direct owner change request; no real owner claim';
    const base = row(sql, 'production_milestones', baseId);
    const report = JSON.stringify({decision: 'revise', actor: OWNER, revision: 2, artifact_hash: base.artifact_hash,
      mode_epoch: 0, reason: feedback});
    feedbackId = 'SYNTHETIC-owner-feedback';
    sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES (?,?,2,?,'revise',?,?,'now')")
      .run(feedbackId, JOB, base.artifact_hash, report, OWNER);
    sql.prepare("UPDATE production_milestones SET status='revise',report=? WHERE id=?").run(report, baseId);
    sql.prepare("UPDATE production_jobs SET status='paused',review_note=?,error='外部节点返工待人工交回新产物；不会重复调用付费服务' WHERE id=?").run(feedback, JOB);
  } else {
    const feedback = await p.recordReportedVideoFeedback(JOB, {request_id: 'SYNTHETIC-feedback',
      source_thread_id: '01a119fc-87ed-7316-b59f-cf4ba175a015', explicit_user_direction: true,
      feedback: 'SYNTHETIC isolated revision request; no actual user approval or media inspection',
      candidate_sha256: OLD_SHA, artifact_version: 1, revision: 2, mode_epoch: 0});
    feedbackId = feedback.review_id;
  }
  const base = row(sql, 'production_milestones', baseId), feedback = row(sql, 'production_reviews', feedbackId);
  if (downstream) {
    for (const node of ['promotion', 'delivery']) sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES (?,?,?,2,1,?,'{}','approved',0,'now','now')")
      .run('SYNTHETIC-' + node, JOB, node, digest(node));
    // A cover does not depend on video and must retain its own approval/history.
    sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES ('SYNTHETIC-cover',?,'cover',2,1,?,'{}','approved',0,'now','now')").run(JOB, digest('cover'));
    const oldPromo = JSON.stringify({schema: 'promo-delivery-v1', version: 1, parent_id: null,
      binding: p.promoBinding(first.job), content: {}, source_notes: 'SYNTHETIC old package', assets: [],
      source: 'SYNTHETIC', video_quality_approved: false, publication_authorized: false, cost: 0});
    sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES ('SYNTHETIC-old-promo-package',?,2,?,'promo_delivery_v1',?,'SYNTHETIC','now')").run(JOB, digest(oldPromo), oldPromo);
    sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('promo_delivery_review_v1:SYNTHETIC-old-promo-package',
      JSON.stringify({version: 1, status: 'approved', video_quality_approved: false, publication_authorized: false}));
  }
  const body = {...nativeBody(script), request_id: 'SYNTHETIC-revision-request', base_milestone_id: baseId,
    base_artifact_version: 1, base_artifact_hash: base.artifact_hash, base_sha256: OLD_SHA,
    base_report_sha256: digest(base.report), feedback_review_id: feedbackId, feedback_note_sha256: digest(feedback.note)};
  return {sql, db, script, body, base, feedback, scope, baseId, feedbackId};
}
async function rejectedUnchanged(f, body, status = 409, id = JOB) {
  const before = snapshot(f.sql);
  await assert.rejects(() => p.returnNativeDraftRevision(id, body), expectStatus(status));
  assert.deepEqual(snapshot(f.sql), before, 'a rejected request must not mutate any fixture state');
}
async function rejectedV2Fixture(t) {
  const f = await fixture(t);
  const v2 = await p.returnNativeDraftRevision(JOB, f.body);
  const feedback = await p.recordReportedVideoFeedback(JOB, {request_id: 'SYNTHETIC-v2-feedback',
    source_thread_id: '01a119fc-87ed-7316-b59f-cf4ba175a015', explicit_user_direction: true,
    feedback: 'SYNTHETIC new rejection of v2; preserve historical v1 and v2', candidate_sha256: NEW_SHA,
    artifact_version: 2, revision: 2, mode_epoch: 0});
  f.baseId = v2.milestone_id; f.feedbackId = feedback.review_id;
  f.base = row(f.sql, 'production_milestones', f.baseId); f.feedback = row(f.sql, 'production_reviews', f.feedbackId);
  f.body = {...nativeBody(f.script, THIRD_SHA), request_id: 'SYNTHETIC-v3-request', base_milestone_id: f.baseId,
    base_artifact_version: 2, base_artifact_hash: f.base.artifact_hash, base_sha256: NEW_SHA,
    base_report_sha256: digest(f.base.report), feedback_review_id: f.feedbackId, feedback_note_sha256: digest(f.feedback.note)};
  f.body.render_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'; f.body.qa.preview_proof.render_id = f.body.render_id;
  f.body.library_file_id = 'libfile_' + '8'.repeat(32); f.body.file_id = 'file_' + '8'.repeat(32);
  return f;
}
function assertPending(result, f, expectedVersion = 2) {
  assert.equal(result.artifact_version, expectedVersion);
  const m = result.job.milestones.find(m => m.id === result.milestone_id);
  assert.equal(m.node, 'video'); assert.equal(m.revision, 2); assert.equal(m.artifact_version, expectedVersion);
  assert.equal(m.status, 'awaiting_human'); assert.equal(m.mode_epoch, 0);
  const artifact = JSON.parse(m.artifact);
  assert.equal(artifact.sha256, f.body.sha256); assert.equal(artifact.qa.quality_approved, false);
  assert.equal(artifact.qa.publication_authorized, false); assert.equal(artifact.qa.semantic_listening_passed, false);
  const facts = result.job.facts;
  assert.equal(facts.candidate_video_sha256, f.body.sha256); assert.equal(facts.candidate_record_id, result.candidate_id);
  assert.equal(facts.native_video_archive.id, result.archive_id); assert.equal(facts.native_video_archive.sha256, f.body.sha256);
  assert.equal(facts.files_archived, true); assert.equal(facts.video_approval, 'not-recorded');
  assert.equal(facts.website_video_button_clicked, false); assert.equal(facts.publication_authorization, false);
  assert.equal(facts.publication_recorded, false); assert.equal(facts.complete_package_archived, false);
  assert.deepEqual(p.promoBinding(result.job), {revision: 2, script_hash: f.script, mode_epoch: 0,
    video_sha256: f.body.sha256, video_reference: result.candidate_id, skill_hash: '5'.repeat(64)});
}

test('SYNTHETIC v1 revise becomes a new v2 pending review without changing script, counters, scope or old rows', async t => {
  const f = await fixture(t), before = snapshot(f.sql);
  const result = await p.returnNativeDraftRevision(JOB, f.body);
  assert.equal(result.replayed, false); assertPending(result, f);
  assert.equal(result.job.status, 'approved'); assert.equal(result.job.error, null);
  const after = snapshot(f.sql);
  const permitted = new Set(['status', 'error', 'review_note', 'updated_at']);
  for (const [key, value] of Object.entries(before.production_jobs[0])) if (!permitted.has(key)) {
    assert.deepEqual(after.production_jobs[0][key], value, 'job field must be preserved: ' + key);
  }
  assert.equal(result.job.revision, 2); assert.equal(result.job.approved_revision, 2);
  assert.equal(result.job.approved_hash, f.script); assert.equal(result.job.reworks, 2); assert.equal(result.job.ai_calls, 1);
  assert.equal(result.job.attempt, 5); assert.equal(result.job.checkpoint_version, 7);
  assert.deepEqual(after.production_drafts, before.production_drafts); assert.deepEqual(after.app_state, before.app_state);
  assert.deepEqual(after.production_operations, before.production_operations); assert.deepEqual(after.production_stages, before.production_stages);
  assert.deepEqual(after.production_promo_packages, before.production_promo_packages);
  assert.deepEqual(after.production_data_videos, before.production_data_videos);
  assert.deepEqual(row(f.sql, 'production_milestones', f.baseId), f.base);
  for (const review of before.production_reviews) assert.deepEqual(row(f.sql, 'production_reviews', review.id), review);
  assert.equal(after.production_milestones.length, before.production_milestones.length + 1);
  assert.equal(after.production_reviews.length, before.production_reviews.length + 3);
  assert.equal(row(f.sql, 'production_reviews', result.candidate_id).decision, 'native_video_candidate');
  assert.equal(row(f.sql, 'production_reviews', result.archive_id).decision, 'native_video_archive_v1');
  assert.match(result.request_hash, /^[a-f0-9]{64}$/);
  const receipt = row(f.sql, 'production_reviews', result.receipt_id);
  assert.equal(receipt.reviewer, 'verified-existing-native-revision');
  assert.equal(receipt.decision, 'native_draft_revision_return_v1');
  assert.notEqual(receipt.decision, 'approve'); assert.notEqual(receipt.reviewer, OWNER);
  assert.equal(after.production_reviews.some(r => r.decision === 'approve' || r.decision === 'owner_publication_report'), false);
});

test('SYNTHETIC exact replay is immutable, including after script/mode/state advance', async t => {
  const f = await fixture(t), first = await p.returnNativeDraftRevision(JOB, f.body), before = snapshot(f.sql);
  const replay = await p.returnNativeDraftRevision(JOB, clone(f.body));
  assert.equal(replay.replayed, true); assert.equal(replay.milestone_id, first.milestone_id);
  assert.equal(replay.request_hash, first.request_hash); assert.deepEqual(snapshot(f.sql), before);
  const reordered = Object.fromEntries(Object.entries(clone(f.body)).reverse());
  reordered.qa = Object.fromEntries(Object.entries(reordered.qa).reverse());
  assert.equal((await p.returnNativeDraftRevision(JOB, reordered)).replayed, true);
  assert.deepEqual(snapshot(f.sql), before);
  f.sql.prepare("UPDATE production_jobs SET revision=3,approved_revision=NULL,approved_hash=NULL,mode_epoch=1,status='paused' WHERE id=?").run(JOB);
  const history = snapshot(f.sql), historicalReplay = await p.returnNativeDraftRevision(JOB, clone(f.body));
  assert.equal(historicalReplay.replayed, true); assert.equal(historicalReplay.milestone_id, first.milestone_id);
  assert.equal(historicalReplay.artifact_version, 2); assert.deepEqual(snapshot(f.sql), history);
});

test('SYNTHETIC concurrent identical requests insert exactly one version and replay the winner', async t => {
  const f = await fixture(t), results = await Promise.all([p.returnNativeDraftRevision(JOB, clone(f.body)), p.returnNativeDraftRevision(JOB, clone(f.body))]);
  assert.equal(results.filter(r => !r.replayed).length, 1); assert.equal(results.filter(r => r.replayed).length, 1);
  assert.equal(results[0].milestone_id, results[1].milestone_id); assert.equal(results[0].request_hash, results[1].request_hash);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_milestones WHERE node='video'").get().n, 2);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM production_reviews').get().n, 6);
});

test('SYNTHETIC competing new candidates cannot both replace the same rejected base', async t => {
  const f = await fixture(t), other = clone(f.body);
  other.request_id = 'SYNTHETIC-competing-request'; other.sha256 = THIRD_SHA; other.materialized_sha256 = THIRD_SHA;
  other.qa.final_duration.file_sha256 = THIRD_SHA; other.qa.preview_proof.video_sha256 = THIRD_SHA;
  const results = await Promise.allSettled([p.returnNativeDraftRevision(JOB, f.body), p.returnNativeDraftRevision(JOB, other)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const failed = results.find(r => r.status === 'rejected'); assert.equal(failed.reason.status, 409);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_milestones WHERE node='video'").get().n, 2);
  assert.deepEqual(row(f.sql, 'production_milestones', f.baseId), f.base);
});

test('SYNTHETIC concurrent different payloads with the same request ID cannot overwrite the winner', async t => {
  const f = await fixture(t), different = clone(f.body); different.file_name = 'SYNTHETIC-competing-name.mp4';
  const results = await Promise.allSettled([p.returnNativeDraftRevision(JOB, f.body), p.returnNativeDraftRevision(JOB, different)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_milestones WHERE node='video'").get().n, 2);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM production_reviews').get().n, 6);
  assert.deepEqual(row(f.sql, 'production_milestones', f.baseId), f.base);
});

test('SYNTHETIC a saved request ID cannot be reused for different metadata or QA proof', async t => {
  const f = await fixture(t); await p.returnNativeDraftRevision(JOB, f.body);
  for (const change of [b => { b.file_name = 'SYNTHETIC-changed.mp4'; }, b => { b.file_id = 'file_' + '6'.repeat(32); },
    b => { b.qa.preview_proof.receipt_sha256 = '7'.repeat(64); }, b => { b.feedback_note_sha256 = '8'.repeat(64); }]) {
    const body = clone(f.body); change(body); await rejectedUnchanged(f, body);
  }
});

test('SYNTHETIC script, mode, base and feedback bindings must all match', async t => {
  const f = await fixture(t);
  for (const [key, value] of Object.entries({revision: 1, script_hash: '0'.repeat(64), mode_epoch: 1,
    base_milestone_id: 'SYNTHETIC-other', base_artifact_version: 2, base_artifact_hash: '0'.repeat(64),
    base_sha256: '0'.repeat(64), base_report_sha256: '0'.repeat(64), feedback_review_id: 'SYNTHETIC-other',
    feedback_note_sha256: '0'.repeat(64)})) await rejectedUnchanged(f, {...clone(f.body), [key]: value});
  await rejectedUnchanged(f, f.body, 403, 'job_2df7013c-4568-4420-9671-15ea454c093a');
  await rejectedUnchanged(f, f.body, 403, 'job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee');
});

test('SYNTHETIC unchanged bytes, costs and invented approval are rejected', async t => {
  const f = await fixture(t), same = clone(f.body);
  same.sha256 = OLD_SHA; same.materialized_sha256 = OLD_SHA; same.qa.final_duration.file_sha256 = OLD_SHA;
  same.qa.preview_proof.video_sha256 = OLD_SHA;
  await rejectedUnchanged(f, same);
  for (const [key, value] of [['new_paid_calls', 1], ['quality_approved', true], ['publication_authorized', true]]) {
    await rejectedUnchanged(f, {...clone(f.body), [key]: value}, 400);
  }
  const listened = clone(f.body); listened.qa.semantic_listening_passed = true; await rejectedUnchanged(f, listened, 400);
});

test('SYNTHETIC Library and materialization metadata must bind exact returned bytes', async t => {
  const f = await fixture(t);
  for (const [key, value] of [['library_file_id', 'file_' + 'd'.repeat(32)], ['file_id', 'libfile_' + 'e'.repeat(32)],
    ['library_version', -1], ['library_version', 0.5], ['verified_at', 'SYNTHETIC-invalid'],
    ['materialized_sha256', THIRD_SHA], ['size_bytes', 0], ['size_bytes', 1.1]]) {
    await rejectedUnchanged(f, {...clone(f.body), [key]: value}, 400);
  }
  const oldArtifact = JSON.parse(f.base.artifact), reusedFile = clone(f.body), reusedVersion = clone(f.body);
  reusedFile.file_id = oldArtifact.qa.file_id; await rejectedUnchanged(f, reusedFile, 409);
  reusedVersion.library_file_id = oldArtifact.library_file_id; reusedVersion.library_version = oldArtifact.library_version;
  await rejectedUnchanged(f, reusedVersion, 409);
});

test('SYNTHETIC native revision stays in the original project', async t => {
  const f = await fixture(t), b = clone(f.body);
  b.project_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'; b.qa.preview_proof.project_id = b.project_id;
  await rejectedUnchanged(f, b, 409);
});

test('SYNTHETIC v3 cannot recycle a historical v1 video SHA, render or immutable file', async t => {
  const f = await rejectedV2Fixture(t), history = snapshot(f.sql);
  const reusedSha = clone(f.body); reusedSha.sha256 = OLD_SHA; reusedSha.materialized_sha256 = OLD_SHA;
  reusedSha.qa.final_duration.file_sha256 = OLD_SHA; reusedSha.qa.preview_proof.video_sha256 = OLD_SHA;
  await rejectedUnchanged(f, reusedSha, 409);
  const reusedRender = clone(f.body); reusedRender.render_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  reusedRender.qa.preview_proof.render_id = reusedRender.render_id; await rejectedUnchanged(f, reusedRender, 409);
  const reusedFile = clone(f.body); reusedFile.file_id = 'file_' + '7'.repeat(32); await rejectedUnchanged(f, reusedFile, 409);
  assert.deepEqual(snapshot(f.sql), history);
  const valid = await p.returnNativeDraftRevision(JOB, f.body); assertPending(valid, f, 3);
  for (const old of history.production_milestones) assert.deepEqual(row(f.sql, 'production_milestones', old.id), old);
});

test('SYNTHETIC pre-registered candidate metadata is immutable and must agree with the returned file', async t => {
  for (const consistent of [true, false]) await t.test(consistent ? 'matching metadata is preserved' : 'conflicting metadata rejects', async sub => {
    const f = await fixture(sub);
    const registered = await p.registerNativePromoVideo(JOB, {revision: 2, script_hash: f.script, sha256: NEW_SHA,
      size_bytes: consistent ? f.body.size_bytes : f.body.size_bytes + 1, duration: f.body.duration,
      quality_approved: false, publication: false, file_name: f.body.file_name,
      project_id: f.body.project_id, timeline_id: f.body.timeline_id, source: f.body.source});
    const prior = row(f.sql, 'production_reviews', registered.id);
    if (consistent) {
      const result = await p.returnNativeDraftRevision(JOB, f.body); assertPending(result, f);
      assert.notEqual(result.candidate_id, registered.id);
      assert.deepEqual(row(f.sql, 'production_reviews', registered.id), prior);
    } else await rejectedUnchanged(f, f.body, 409);
  });
});

test('SYNTHETIC native previews require opening, core and ending bound to this render and video', async t => {
  const f = await fixture(t);
  const mutations = [b => { delete b.qa.preview_proof; }, b => { b.qa.preview_proof.frames = []; },
    b => { b.qa.preview_proof.frames.pop(); }, b => { b.qa.preview_proof.video_sha256 = THIRD_SHA; },
    b => { b.qa.preview_proof.project_id = RENDER; }, b => { b.qa.preview_proof.timeline_id = RENDER; },
    b => { b.qa.preview_proof.render_id = PROJECT; }, b => { b.qa.preview_proof.source = 'SYNTHETIC-estimate'; },
    b => { b.qa.preview_proof.receipt_sha256 = 'invalid'; }, b => { b.qa.preview_proof.checked_at = 'invalid'; },
    b => { b.qa.preview_proof.frames[0].time_seconds = 3; }, b => { b.qa.preview_proof.frames[1].time_seconds = -1; },
    b => { b.qa.preview_proof.frames[2].time_seconds = b.duration; }, b => { b.qa.preview_proof.frames[1].image_sha256 = 'invalid'; },
    b => { b.qa.preview_proof.frames[1].time_seconds = 2; }, b => { b.qa.preview_proof.frames[2].time_seconds = 20; },
    b => { b.qa.preview_proof.frames[1].image_sha256 = b.qa.preview_proof.frames[0].image_sha256; }];
  for (const change of mutations) { const b = clone(f.body); change(b); await rejectedUnchanged(f, b, 400); }
});

test('SYNTHETIC final duration rejects 60 exactly, any overrun and incomplete or mismatched probe proof', async t => {
  const f = await fixture(t);
  const mutations = [b => { b.duration = 60; }, b => { b.duration = 60.00001; },
    b => { delete b.qa.final_duration; }, b => { b.qa.final_duration.file_sha256 = THIRD_SHA; },
    b => { b.qa.final_duration.probe_sha256 = 'invalid'; }, b => { b.qa.final_duration.report.hard_duration_pass = false; },
    b => { b.qa.final_duration.report.errors = ['SYNTHETIC probe error']; },
    b => { delete b.qa.final_duration.report.measurements_seconds.audio_0_playback_end; },
    b => { delete b.qa.final_duration.report.measurements_seconds.video_0_playback_end; },
    b => { delete b.qa.final_duration.report.measurements_seconds.container_duration; },
    b => { b.qa.final_duration.report.maximum_measured_seconds = '60'; },
    b => { b.qa.final_duration.report.maximum_measured_seconds = '60.000000000000000000001'; },
    b => { b.qa.final_duration.report.maximum_measured_seconds = '55'; },
    b => { b.qa.final_duration.report.measurements_seconds.container_duration = '54.8'; },
    b => { b.qa.final_duration.report.measurements_seconds.audio_0_playback_end = '60'; },
    b => { b.qa.final_duration.report.measurements_seconds.video_0_playback_end = '60.000000000000000000001'; }];
  for (const change of mutations) { const b = clone(f.body); change(b); await rejectedUnchanged(f, b, 400); }
  const b = clone(f.body); b.duration = 59.999;
  b.qa.final_duration = finalDuration(NEW_SHA, '59.999');
  b.qa.preview_proof.frames[2].time_seconds = 59;
  assert.equal((await p.returnNativeDraftRevision(JOB, b)).artifact_version, 2);
});

test('SYNTHETIC active job, media and review leases prevent returning a new version', async t => {
  const f = await fixture(t);
  f.sql.prepare('UPDATE production_jobs SET lease_until=?,lease_hash=? WHERE id=?').run(Date.now() + 600000, 'SYNTHETIC-live', JOB);
  await rejectedUnchanged(f, f.body);
  f.sql.prepare('UPDATE production_jobs SET lease_until=NULL,lease_hash=NULL WHERE id=?').run(JOB);
  for (const [status, lease] of [['running', Date.now() + 600000], ['prepared', Date.now() + 600000], ['running', null], ['prepared', null]]) {
    f.sql.prepare("INSERT INTO production_operations(id,job_id,node,revision,script_hash,mode_epoch,base_artifact_version,input_hash,plan,status,lease_until,created_at,updated_at) VALUES ('SYNTHETIC-operation',?,'video',2,?,0,1,'SYNTHETIC-input','{}',?,?,'now','now')").run(JOB, f.script, status, lease);
    await rejectedUnchanged(f, f.body);
    f.sql.prepare("DELETE FROM production_operations WHERE id='SYNTHETIC-operation'").run();
  }
  f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,review_until,created_at,updated_at) VALUES ('SYNTHETIC-live-review',?,'cover',2,1,?,'{}','ai_running',0,?,'now','now')").run(JOB, digest('SYNTHETIC-review'), Date.now() + 600000);
  await rejectedUnchanged(f, f.body);
  f.sql.prepare("UPDATE production_milestones SET review_until=NULL WHERE id='SYNTHETIC-live-review'").run();
  await rejectedUnchanged(f, f.body);
  f.sql.prepare("DELETE FROM production_milestones WHERE id='SYNTHETIC-live-review'").run();
  for (const stage of ['media_inventory', 'media_inputs']) {
    f.sql.prepare("INSERT INTO production_stages(id,job_id,stage,review_revision,review_hash,status,result,updated_at) VALUES ('SYNTHETIC-preparation',?,?,2,?,'running',?,'now')")
      .run(JOB, stage, f.script, JSON.stringify({lease_until: Date.now() + 600000, synthetic: true}));
    await rejectedUnchanged(f, f.body);
    f.sql.prepare("DELETE FROM production_stages WHERE id='SYNTHETIC-preparation'").run();
  }
});

test('SYNTHETIC a direct owner revise record supports replacement without transferring approval', async t => {
  const f = await fixture(t, {ownerFeedback: true}), before = snapshot(f.sql);
  const result = await p.returnNativeDraftRevision(JOB, f.body); assertPending(result, f);
  assert.deepEqual(row(f.sql, 'production_reviews', f.feedbackId), f.feedback);
  assert.deepEqual(row(f.sql, 'production_milestones', f.baseId), f.base);
  assert.equal(snapshot(f.sql).production_reviews.filter(r => r.reviewer === OWNER).length,
    before.production_reviews.filter(r => r.reviewer === OWNER).length);
});

test('SYNTHETIC older feedback cannot release a different pause or impersonate the owner', async t => {
  const f = await fixture(t);
  f.sql.prepare("UPDATE production_jobs SET review_note='SYNTHETIC newer pause' WHERE id=?").run(JOB);
  await rejectedUnchanged(f, f.body);
  f.sql.prepare('UPDATE production_jobs SET review_note=? WHERE id=?').run(JSON.parse(f.feedback.note).feedback, JOB);
  f.sql.prepare("UPDATE production_jobs SET error='SYNTHETIC unrelated pause' WHERE id=?").run(JOB);
  await rejectedUnchanged(f, f.body);
  f.sql.prepare('UPDATE production_jobs SET error=? WHERE id=?').run('聊天返工已登记，保留原视频；等待具备原生ChatCut工具的会话，先交付真实预览帧再合成新草稿', JOB);
  f.sql.prepare("UPDATE production_reviews SET reviewer='SYNTHETIC-impostor' WHERE id=?").run(f.feedbackId);
  await rejectedUnchanged(f, f.body);
});

test('SYNTHETIC video replacement invalidates downstream approvals while preserving the cover and old video', async t => {
  const f = await fixture(t, {downstream: true});
  const cover = row(f.sql, 'production_milestones', 'SYNTHETIC-cover');
  const oldPromotion = row(f.sql, 'production_milestones', 'SYNTHETIC-promotion');
  const oldDelivery = row(f.sql, 'production_milestones', 'SYNTHETIC-delivery');
  const oldPromo = row(f.sql, 'production_reviews', 'SYNTHETIC-old-promo-package');
  const result = await p.returnNativeDraftRevision(JOB, f.body); assertPending(result, f);
  assert.equal(row(f.sql, 'production_milestones', 'SYNTHETIC-promotion').status, 'invalidated');
  assert.equal(row(f.sql, 'production_milestones', 'SYNTHETIC-delivery').status, 'invalidated');
  assert.equal(row(f.sql, 'production_milestones', 'SYNTHETIC-promotion').artifact, oldPromotion.artifact);
  assert.equal(row(f.sql, 'production_milestones', 'SYNTHETIC-delivery').artifact_hash, oldDelivery.artifact_hash);
  assert.deepEqual(row(f.sql, 'production_milestones', 'SYNTHETIC-cover'), cover);
  assert.deepEqual(row(f.sql, 'production_milestones', f.baseId), f.base);
  const promo = await p.listPromoDeliveries(JOB);
  assert.equal(promo.packages[0].is_current, false);
  assert.equal(promo.packages[0].review.status, 'approved', 'historical promo review remains historical');
  assert.equal(promo.current_binding.video_sha256, NEW_SHA);
  assert.deepEqual(row(f.sql, 'production_reviews', 'SYNTHETIC-old-promo-package'), oldPromo);
});

test('SYNTHETIC a prior oral approval cannot authorize the replacement video or a complete package', async t => {
  const f = await fixture(t);
  const note = JSON.stringify({assets: [{node: 'video', sha256: OLD_SHA}, {node: 'complete_bundle', sha256: THIRD_SHA}],
    owner_video_approval: {source: 'owner-oral-report', video_sha256: OLD_SHA, website_button_clicked: false}});
  f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES ('SYNTHETIC-prior-oral-approval',?,2,?,'private_publicity_files',?,'SYNTHETIC','2026-10-01T00:00:00Z')").run(JOB, f.script, note);
  const before = row(f.sql, 'production_reviews', 'SYNTHETIC-prior-oral-approval');
  const result = await p.returnNativeDraftRevision(JOB, f.body); assertPending(result, f);
  assert.deepEqual(row(f.sql, 'production_reviews', 'SYNTHETIC-prior-oral-approval'), before);
});

test('SYNTHETIC CAS rejects state changes between validation and insert with no partial handoff', async t => {
  const cases = [
    ['job epoch', f => f.sql.prepare('UPDATE production_jobs SET mode_epoch=1 WHERE id=?').run(JOB)],
    ['job status', f => f.sql.prepare("UPDATE production_jobs SET status='running' WHERE id=?").run(JOB)],
    ['job approved hash', f => f.sql.prepare('UPDATE production_jobs SET approved_hash=? WHERE id=?').run(THIRD_SHA, JOB)],
    ['source now requires actual tool footage', f => f.sql.prepare('UPDATE production_jobs SET source_snapshot=? WHERE id=?').run(JSON.stringify({demonstration_required: true, synthetic: true}), JOB)],
    ['job pause reason', f => f.sql.prepare("UPDATE production_jobs SET review_note='SYNTHETIC newer reason' WHERE id=?").run(JOB)],
    ['base status', f => f.sql.prepare("UPDATE production_milestones SET status='paused' WHERE id=?").run(f.baseId)],
    ['base report', f => f.sql.prepare("UPDATE production_milestones SET report='{}' WHERE id=?").run(f.baseId)],
    ['feedback note', f => f.sql.prepare("UPDATE production_reviews SET note='{}' WHERE id=?").run(f.feedbackId)],
    ['feedback reviewer', f => f.sql.prepare("UPDATE production_reviews SET reviewer='SYNTHETIC-impostor' WHERE id=?").run(f.feedbackId)],
    ['live job lease', f => f.sql.prepare('UPDATE production_jobs SET lease_until=?,lease_hash=? WHERE id=?').run(Date.now() + 600000, 'SYNTHETIC-live', JOB)],
    ['live media lease', f => f.sql.prepare("INSERT INTO production_operations(id,job_id,node,revision,script_hash,mode_epoch,base_artifact_version,input_hash,plan,status,lease_until,created_at,updated_at) VALUES ('SYNTHETIC-racing-operation',?,'video',2,?,0,1,'SYNTHETIC-racing-input','{}','prepared',?,'now','now')").run(JOB, f.script, Date.now() + 600000)],
    ['live preparation lease', f => f.sql.prepare("INSERT INTO production_stages(id,job_id,stage,review_revision,review_hash,status,result,updated_at) VALUES ('SYNTHETIC-racing-preparation',?,'media_inputs',2,?,'running',?,'now')").run(JOB, f.script, JSON.stringify({lease_until: Date.now() + 600000}))],
    ['newer version', f => f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES ('SYNTHETIC-racer',?,'video',2,2,?,'{}','awaiting_human',0,'now','now')").run(JOB, THIRD_SHA)],
  ];
  for (const [name, mutation] of cases) await t.test(name, async sub => {
    const f = await fixture(sub); let raced;
    f.db.beforeNextBatch(() => { mutation(f); raced = snapshot(f.sql); });
    await assert.rejects(() => p.returnNativeDraftRevision(JOB, f.body), expectStatus(409));
    assert.ok(raced, 'race hook must execute after validation');
    assert.deepEqual(snapshot(f.sql), raced, 'CAS loser must preserve only the independent raced state');
  });
});

test('SYNTHETIC latest version wins facts and promo binding even when review timestamps tie or history is reordered', async t => {
  const f = await fixture(t), result = await p.returnNativeDraftRevision(JOB, f.body);
  for (const reversed of [false, true]) {
    const job = clone(result.job);
    job.reviews = job.reviews.map(r => ({...r, created_at: AT}));
    job.milestones = job.milestones.map(m => ({...m, created_at: AT}));
    job.reviews.push({id: 'SYNTHETIC-detached-newer-candidate', revision: 2, decision: 'native_video_candidate',
      created_at: '2099-01-01T00:00:00Z', note: JSON.stringify({script_hash: f.script, sha256: THIRD_SHA})});
    if (reversed) { job.reviews.reverse(); job.milestones.reverse(); }
    const facts = p.productionFacts(job), binding = p.promoBinding(job);
    assert.equal(facts.candidate_video_sha256, NEW_SHA); assert.equal(binding.video_sha256, NEW_SHA);
    assert.equal(facts.candidate_record_id, result.candidate_id); assert.equal(binding.video_reference, result.candidate_id);
    assert.equal(facts.native_video_archive.id, result.archive_id); assert.equal(facts.video_approval, 'not-recorded');
  }
});

test('SYNTHETIC required tool footage rejects missing or incomplete demonstration proof without writing', async t => {
  const f = await fixture(t, {requiredDemo: true});
  await rejectedUnchanged(f, f.body, 409);
  const invalid = [
    {schema: 'actual-tool-demonstration-v1', files: []},
    {schema: 'actual-tool-demonstration-v1', files: [null]},
  ];
  for (const change of [c => { c.files[0].simulated_ui = true; }, c => { c.files[0].full_decode = false; },
    c => { c.files[0].actual_tool = ''; }, c => { c.files[0].visible_action_result = ''; },
    c => { c.files[0].frames[0].file = ''; }, c => { c.files[0].frame_hashes = []; },
    c => { c.mapping = c.mapping.filter(m => m.segment !== 'opening-0-3'); },
    c => { c.mapping[1].file_sha256 = '0'.repeat(64); }, c => { c.semantic_review = 'not-reviewed'; }]) {
    const check = syntheticDemonstrationCheck(); change(check); invalid.push(check);
  }
  for (const demonstration_check of invalid) await rejectedUnchanged(f, {...clone(f.body), demonstration_check}, 409);
});

test('SYNTHETIC complete tool footage proof reaches the video artifact and only its owner can approve', async t => {
  const f = await fixture(t, {requiredDemo: true}); f.body.demonstration_check = syntheticDemonstrationCheck();
  const result = await p.returnNativeDraftRevision(JOB, f.body); assertPending(result, f);
  const m = result.job.milestones.find(m => m.id === result.milestone_id), artifact = JSON.parse(m.artifact);
  assert.deepEqual(artifact.demonstration_check, f.body.demonstration_check);
  assert.deepEqual(JSON.parse(row(f.sql, 'production_reviews', result.receipt_id).note).request.demonstration_check,
    f.body.demonstration_check);
  const beforeNonOwner = snapshot(f.sql);
  await assert.rejects(() => p.decideMilestone(JOB, m.id, 2, m.artifact_hash, 0, 'approve', {}, 'SYNTHETIC-other-user'), expectStatus(403));
  assert.deepEqual(snapshot(f.sql), beforeNonOwner);
  const approved = await p.decideMilestone(JOB, m.id, 2, m.artifact_hash, 0, 'approve', {}, OWNER);
  assert.equal(approved.milestones.find(x => x.id === m.id).status, 'approved');
  assert.equal(approved.facts.video_approval, 'owner-node-approved');
  assert.equal(approved.facts.publication_authorization, false); assert.equal(approved.publication_reports.length, 0);
  assert.equal(approved.revision, 2); assert.equal(approved.approved_hash, f.script);
  assert.equal(approved.reworks, 2); assert.equal(approved.ai_calls, 1);
  assert.deepEqual(row(f.sql, 'production_milestones', f.baseId), f.base);
  assert.equal(row(f.sql, 'production_milestones', m.id).artifact, m.artifact, 'owner review cannot rewrite submitted evidence');
  const audit = f.sql.prepare("SELECT * FROM production_reviews WHERE decision='approve'").all();
  assert.equal(audit.length, 1); assert.equal(audit[0].reviewer, OWNER);
});

test('SYNTHETIC material-required blocked draft also needs complete proof for a non-tool source category', async t => {
  const f = await fixture(t, {declaredBlocked: true});
  const before = snapshot(f.sql), job = await p.getJob(JOB);
  assert.equal(JSON.parse(job.source_snapshot).category, '视觉影像'); assert.equal(job.facts.material_required, true);
  await rejectedUnchanged(f, f.body, 409);
  f.body.demonstration_check = syntheticDemonstrationCheck();
  const result = await p.returnNativeDraftRevision(JOB, f.body); assertPending(result, f);
  assert.deepEqual(JSON.parse(result.job.milestones.find(m => m.id === result.milestone_id).artifact).demonstration_check,
    f.body.demonstration_check);
  assert.deepEqual(snapshot(f.sql).production_drafts, before.production_drafts);
});

test('SYNTHETIC historical replay remains read-only when source later requires demonstration proof', async t => {
  const f = await fixture(t), first = await p.returnNativeDraftRevision(JOB, f.body);
  f.sql.prepare('UPDATE production_jobs SET source_snapshot=? WHERE id=?')
    .run(JSON.stringify({category: 'AI实用', demonstration_required: true, synthetic: true}), JOB);
  const before = snapshot(f.sql), replay = await p.returnNativeDraftRevision(JOB, clone(f.body));
  assert.equal(replay.replayed, true); assert.equal(replay.milestone_id, first.milestone_id);
  assert.equal(replay.request_hash, first.request_hash); assert.deepEqual(snapshot(f.sql), before);
  // Replaying history does not disable the actual owner-approval demonstration gate.
  const m = replay.job.milestones.find(m => m.id === replay.milestone_id);
  await assert.rejects(() => p.decideMilestone(JOB, m.id, 2, m.artifact_hash, 0, 'approve', {}, OWNER), expectStatus(409));
  assert.deepEqual(snapshot(f.sql), before);
  await rejectedUnchanged(f, {...clone(f.body), demonstration_check: syntheticDemonstrationCheck()}, 409);
});
