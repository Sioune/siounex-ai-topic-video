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
    "export * from './lib/pending-native-site-context';",
    "export * from './lib/pending-native-site-return';",
    "export * from './lib/site-file-archive';",
    "export {confirmMediaScope} from './lib/media-continuation';",
    "export {continueMediaRework} from './lib/milestones';",
    "export {readNativeWorkPacket} from './lib/native-work-packet';",
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
      contents: 'export function db(){return globalThis.__syntheticNativeRevisionDb} export function siteArchiveBucket(){return globalThis.__syntheticPendingR2}',
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
    ...(declaredBlocked ? {production_ready: false,narration_preflight:{machine_preflight:'blocked',problems:['SYNTHETIC historical missing input']}} : {})});
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

class R2 {
  map=new Map();
  async get(key){const value=this.map.get(key);if(!value)return null;const bytes=Buffer.from(value.bytes);return{customMetadata:value.customMetadata,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>bytes.toString('utf8')};}
  async put(key,value,options={}){if(options.onlyIf?.get('If-None-Match')==='*'&&this.map.has(key))return null;this.map.set(key,{bytes:typeof value==='string'?Buffer.from(value):Buffer.from(value),customMetadata:options.customMetadata||{}});return{key};}
}
const actor={owner_id:OWNER};
async function pendingFixture(t){
  const f=await fixture(t,{requiredDemo:true,declaredBlocked:true});
  f.sql.prepare('UPDATE production_jobs SET is_test=0,reworks=1,contract_hash=? WHERE id=?').run('e'.repeat(64),JOB);
  for(const node of ['source','script'])f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,2,1,?,?,'approved',0,'now','now')").run('SYNTHETIC-'+node,JOB,node,f.script,JSON.stringify({synthetic:true}));
  await p.continueMediaRework(JOB,OWNER,f.baseId,2,f.base.artifact_hash,0,'SYNTHETIC real owner continuation fixture');
  const binding={revision:2,script_hash:f.script,mode_epoch:0,contract_hash:'e'.repeat(64)};
  await p.confirmMediaScope(JOB,OWNER,{confirmed:true,binding,scope:'private-video',current_id:'SYNTHETIC-existing-scope',request_id:'SYNTHETIC-owner-private-scope'});
  f.sql.exec("UPDATE production_stages SET status='blocked'");
  const scope=(await p.getJob(JOB)).media_continuation.scope;
  f.bytes=Buffer.alloc(524301,9);f.bytes.writeUInt32BE(24,0);f.bytes.write('ftyp',4);
  const sha=digest(f.bytes),b=clone(f.body);
  for(const key of ['library_file_id','file_id','library_version','verified_at','materialized_sha256'])delete b[key];
  b.sha256=sha;b.size_bytes=f.bytes.length;b.qa.final_duration.file_sha256=sha;b.qa.preview_proof.video_sha256=sha;
  b.contract_hash=binding.contract_hash;b.scope_id=scope.id;b.scope_hash=digest(JSON.stringify(scope,Object.keys(scope).sort()));
  // Production canonicalization sorts nested object keys, independently of fixture insertion order.
  const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  b.scope_hash=digest(canonical(scope));b.demonstration_check=syntheticDemonstrationCheck();f.body=b;
  globalThis.__syntheticPendingR2=new R2();t.after(()=>delete globalThis.__syntheticPendingR2);
  return f;
}
async function begin(f){return (await p.beginPendingNativeSiteDraft(JOB,f.body,actor)).pending;}
function png(width,height){const bytes=Buffer.alloc(80,7);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);return bytes;}
async function uploadRole(f,draft,role){
  const bytes=role==='video'?f.bytes:role==='cover_3_4'?png(300,400):role==='cover_4_3'?png(400,300):Buffer.from('SYNTHETIC promotion draft, pending independent owner review');
  const body={pending_native_request_id:draft.pending_id,request_id:'SYNTHETIC-'+role,binding:draft.binding,owner_review_id:null,scope_id:draft.scope_id,scope_hash:draft.scope_hash,file:{role,sha256:digest(bytes),size_bytes:bytes.length,file_name:role==='video'?f.body.file_name:'SYNTHETIC-'+role+(role==='promotion'?'.txt':'.png'),mime_type:role==='video'?'video/mp4':role==='promotion'?'text/plain':'image/png'}};
  const a=(await p.startSiteArchive(JOB,body,actor)).archive;
  assert.equal(a.owner_review_id,null);assert.equal(a.quality_review,'awaiting-human');assert.equal(a.version_request_id,undefined);
  for(let i=0;i<a.part_count;i++){const part=bytes.subarray(i*524288,(i+1)*524288);await p.putSiteArchivePart(JOB,{site_archive_id:a.site_archive_id,part:i,chunk_base64:part.toString('base64'),chunk_sha256:digest(part)},actor);}
  await p.finalizeSiteArchive(JOB,{site_archive_id:a.site_archive_id},actor);
  const downloaded=[];for(let i=0;i<a.part_count;i++){const part=await p.readSiteArchivePart(JOB,{site_archive_id:a.site_archive_id,part:i},actor);downloaded.push(Buffer.from(part.chunk_base64,'base64'));}
  assert.equal(digest(Buffer.concat(downloaded)),digest(bytes));
  await p.confirmSiteArchive(JOB,{site_archive_id:a.site_archive_id,materialized_sha256:digest(bytes),size_bytes:bytes.length,verified_at:AT},actor);
  return a.site_archive_id;
}
async function allFiles(f,draft){const ids={};for(const role of ['video','cover_3_4','cover_4_3','promotion'])ids[role]=await uploadRole(f,draft,role);return ids;}

test('real-shaped owner continuation and scope allow four Site files to become new pending nodes without Library IDs or approval',async t=>{
 const f=await pendingFixture(t),before=await p.getJob(JOB),draft=await begin(f),ids=await allFiles(f,draft);
 const result=await p.returnPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id},actor),j=result.job;
 assert.equal(j.status,'approved');assert.equal(j.reworks,1);assert.equal(j.facts.video_approval,'not-recorded');assert.equal(j.facts.candidate_owner_review,undefined);
 assert.equal(j.facts.files_archived,true);assert.equal(j.facts.site_file_archives.length,4);assert.equal(j.facts.complete_package_archived,false);
 assert.equal(j.facts.material_gate,'native-completed-awaiting-review');assert.equal(j.facts.native_completion_evidence.preparation_probes_rewritten,false);assert.ok(j.facts.draft_material_preflight.length>0);
 for(const field of ['source_snapshot','skill_snapshot','drafts','revision','approved_revision','approved_hash','mode_epoch','contract_hash','attempt','ai_calls','reworks','series'])assert.deepEqual(j[field],before[field],field);
 for(const old of before.milestones)assert.deepEqual(j.milestones.find(m=>m.id===old.id),old);
 for(const [node,status]of [['video','awaiting_human'],['cover','awaiting_human'],['promotion','pending']]){const m=j.milestones.filter(m=>m.node===node).sort((a,b)=>b.artifact_version-a.artifact_version)[0];assert.equal(m.status,status);assert.equal(m.report,null);}
 const video=JSON.parse(j.milestones.find(m=>m.id===result.pending.milestone_ids.video).artifact);assert.equal(video.provider_job_id,RENDER);assert.equal(video.qa.native_render_id,RENDER);assert.equal(video.library_file_id,undefined);
 assert.equal((await p.readNativeWorkPacket(JOB,OWNER)).packet.status,'awaiting_human');
 assert.equal((await p.returnPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id},actor)).replayed,true);
 const download=await p.readSiteArchiveFile(JOB,ids.video,OWNER);assert.equal(digest(Buffer.from(await new Response(download.body).arrayBuffer())),digest(f.bytes));
 await assert.rejects(()=>p.readSiteArchiveFile(JOB,ids.video,'SYNTHETIC-other-owner'),expectStatus(403));
});

for(const [name,change,status]of [
 ['null native render',b=>{b.render_id=null},400],['wrong revision',b=>{b.revision=3},409],['fake Library identity',b=>{b.library_file_id='libfile_'+'1'.repeat(32)},400],
 ['scope hash changed',b=>{b.scope_hash='0'.repeat(64)},409],['quality approval',b=>{b.quality_approved=true},400],['mismatched exact preview',b=>{b.qa.preview_proof.video_sha256='0'.repeat(64)},400],
 ['past render recycled',b=>{b.render_id='dddddddd-dddd-dddd-dddd-dddddddddddd';b.qa.preview_proof.render_id=b.render_id},409],
])test('pending begin rejects '+name+' without mutating fixtures',async t=>{const f=await pendingFixture(t),b=clone(f.body);change(b);const before=snapshot(f.sql);await assert.rejects(()=>p.beginPendingNativeSiteDraft(JOB,b,actor),expectStatus(status));assert.deepEqual(snapshot(f.sql),before);});

test('owner scope and same owner are independently required',async t=>{const f=await pendingFixture(t);await assert.rejects(()=>p.beginPendingNativeSiteDraft(JOB,f.body,{owner_id:'SYNTHETIC-other'}),expectStatus(403));f.sql.prepare('DELETE FROM app_state WHERE key=?').run('media_scope_v1:'+JOB);await assert.rejects(()=>begin(f),expectStatus(409));});

test('missing four confirmations cannot create pending nodes',async t=>{const f=await pendingFixture(t),draft=await begin(f);await uploadRole(f,draft,'video');const before=snapshot(f.sql);await assert.rejects(()=>p.returnPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id},actor),expectStatus(409));assert.deepEqual(snapshot(f.sql),before);});

test('feedback identity changes during staging invalidate archive and return guards',async t=>{const f=await pendingFixture(t),draft=await begin(f);await allFiles(f,draft);f.sql.prepare('UPDATE production_reviews SET reviewer=? WHERE id=?').run('SYNTHETIC-other-owner',f.feedbackId);await assert.rejects(()=>p.returnPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id},actor),expectStatus(409));assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_milestones WHERE job_id=? AND node='video'").get(JOB).n,1);});

test('a concurrent base or feedback change before commit cannot apply dependent mutations',async t=>{const f=await pendingFixture(t),draft=await begin(f);await allFiles(f,draft);f.db.beforeNextBatch(()=>f.sql.prepare('UPDATE production_reviews SET content_hash=? WHERE id=?').run('0'.repeat(64),f.feedbackId));await assert.rejects(()=>p.returnPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id},actor),expectStatus(409));assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_reviews WHERE decision='native_site_draft_return_v1'").get().n,0);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_milestones WHERE node='video'").get().n,1);});

test('dependent node insert failure rolls the complete return transaction back',async t=>{const f=await pendingFixture(t),draft=await begin(f);await allFiles(f,draft);f.sql.exec("CREATE TRIGGER SYNTHETIC_fail_pending BEFORE INSERT ON production_milestones WHEN NEW.node='cover' BEGIN SELECT RAISE(ABORT,'SYNTHETIC rollback'); END");const before=snapshot(f.sql);await assert.rejects(()=>p.returnPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id},actor),/SYNTHETIC rollback/);assert.deepEqual(snapshot(f.sql),before);});

test('historical confirmed Site bytes remain owner-readable after subsequent scope and revision change',async t=>{const f=await pendingFixture(t),draft=await begin(f),ids=await allFiles(f,draft);await p.returnPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id},actor);f.sql.prepare('UPDATE production_jobs SET revision=3,mode_epoch=1 WHERE id=?').run(JOB);f.sql.prepare('DELETE FROM app_state WHERE key=?').run('media_scope_v1:'+JOB);const file=await p.readSiteArchiveFile(JOB,ids.video,OWNER);assert.equal(digest(Buffer.from(await new Response(file.body).arrayBuffer())),digest(f.bytes));assert.equal((await p.returnPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id},actor)).replayed,true);});

test('explicit soft cancellation releases a stale staging slot while preserving old bytes and rejection history',async t=>{
 const f=await pendingFixture(t),draft=await begin(f),sid=await uploadRole(f,draft,'video');f.sql.prepare("UPDATE production_jobs SET updated_at='SYNTHETIC-later-change' WHERE id=?").run(JOB);
 const newer=clone(f.body);newer.request_id='SYNTHETIC-retry-after-change';await assert.rejects(()=>p.beginPendingNativeSiteDraft(JOB,newer,actor),expectStatus(409));
 const cancelled=await p.cancelPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id,note:'SYNTHETIC cancel stale staged handoff; retain bytes'},actor);assert.equal(cancelled.pending.status,'cancelled');
 const old=await p.readSiteArchiveFile(JOB,sid,OWNER);assert.equal(digest(Buffer.from(await new Response(old.body).arrayBuffer())),digest(f.bytes));
 const next=await p.beginPendingNativeSiteDraft(JOB,newer,actor);assert.notEqual(next.pending.pending_id,draft.pending_id);assert.equal(next.pending.status,'staging');
 assert.deepEqual(row(f.sql,'production_milestones',f.baseId),f.base);assert.equal(row(f.sql,'production_jobs',JOB).reworks,1);
});

test('real owner node decisions remain necessary and promote the prepared promotion only after video and covers pass',async t=>{
 const f=await pendingFixture(t),draft=await begin(f);await allFiles(f,draft);const result=await p.returnPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id},actor);
 await assert.rejects(()=>p.cancelPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id,note:'SYNTHETIC cannot cancel returned'},actor),expectStatus(409));
 let j=result.job;for(const node of ['video','cover']){const m=j.milestones.find(m=>m.id===result.pending.milestone_ids[node]);await assert.rejects(()=>p.decideMilestone(JOB,m.id,2,m.artifact_hash,0,'approve',{},'SYNTHETIC-other-owner'),expectStatus(403));j=await p.decideMilestone(JOB,m.id,2,m.artifact_hash,0,'approve',{},OWNER);}
 assert.equal(j.milestones.find(m=>m.id===result.pending.milestone_ids.promotion).status,'awaiting_human');assert.equal(j.facts.video_approval,'owner-node-approved');assert.equal(j.status,'approved');assert.equal(j.facts.complete_package_archived,false);assert.equal(j.reworks,1);
});
