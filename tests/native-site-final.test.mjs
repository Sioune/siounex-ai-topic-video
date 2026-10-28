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
    "export * from './lib/native-site-final-context';",
    "export * from './lib/native-site-final-commit';",
    "export {finalNativeSiteArchivesFromFacts} from './lib/native-site-final-view.mts';",
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
async function pendingFixture(t,{largeSkill=false}={}){
  const f=await fixture(t,{requiredDemo:true,declaredBlocked:true});
  f.sql.prepare('UPDATE production_jobs SET is_test=0,reworks=1,contract_hash=? WHERE id=?').run('e'.repeat(64),JOB);
  for(const node of ['source','script'])f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,2,1,?,?,'approved',0,'now','now')").run('SYNTHETIC-'+node,JOB,node,f.script,JSON.stringify({synthetic:true}));
  await p.continueMediaRework(JOB,OWNER,f.baseId,2,f.base.artifact_hash,0,'SYNTHETIC real owner continuation fixture');
  const binding={revision:2,script_hash:f.script,mode_epoch:0,contract_hash:'e'.repeat(64)};
  await p.confirmMediaScope(JOB,OWNER,{confirmed:true,binding,scope:'private-video',current_id:'SYNTHETIC-existing-scope',request_id:'SYNTHETIC-owner-private-scope'});
  f.sql.exec("UPDATE production_stages SET status='blocked'");
  if(largeSkill){const unit='SYNTHETIC "quoted" \\ source\n',base={sha256:'5'.repeat(64),content:''},target=262000,empty=Buffer.byteLength(JSON.stringify(base)),width=Buffer.byteLength(JSON.stringify(unit))-2,n=Math.floor((target-empty)/width);base.content=unit.repeat(n)+'x'.repeat(target-empty-n*width);const value=JSON.stringify(base);assert.equal(Buffer.byteLength(value),target);f.sql.prepare('UPDATE production_jobs SET skill_snapshot=? WHERE id=?').run(value,JOB);}
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

// SYNTHETIC test approvals are isolated fixtures, never real owner/media approvals.
async function returnedFinalFixture(t,options={}){
 const f=await pendingFixture(t,options),draft=await begin(f),ids=await allFiles(f,draft),returned=await p.returnPendingNativeSiteDraft(JOB,{pending_id:draft.pending_id},actor);
 const j=returned.job;
 f.pending=returned.pending;f.ids=ids;f.expected={};
 for(const node of ['video','cover','promotion']){const m=j.milestones.find(m=>m.id===returned.pending.milestone_ids[node]);f.expected[node]={id:m.id,artifact_hash:m.artifact_hash,artifact_version:m.artifact_version};}
 f.finalBody={request_id:'SYNTHETIC-exact-accepted-final',pending_id:draft.pending_id,expected_milestones:f.expected,approval:{decision:'approved',source:'owner-oral-report',quote:'SYNTHETIC owner accepted video, both covers, promotion; fixture only',reported_at:AT,source_thread_id:null,website_button_clicked:false,reviewed_voice_kind:'owner-cloned'},publication_authorized:false,new_paid_calls:0};
 return f;
}
async function uploadFinalPackage(f,final,role){
 const bytes=Buffer.alloc(600,3);bytes.write('PK\x03\x04',0,'binary');
 const body={...final.archive_context,request_id:'SYNTHETIC-final-'+role,file:{role,sha256:digest(bytes),size_bytes:bytes.length,file_name:'SYNTHETIC-'+role+'.zip',mime_type:'application/zip'}};
 const a=(await p.startSiteArchive(JOB,body,actor)).archive;
 assert.equal(a.final_native_request_id,final.final.final_id);assert.equal(a.owner_review_id,final.final.owner_review_id);assert.equal(a.pending_native_request_id,undefined);
 await p.putSiteArchivePart(JOB,{site_archive_id:a.site_archive_id,part:0,chunk_base64:bytes.toString('base64'),chunk_sha256:digest(bytes)},actor);
 await p.finalizeSiteArchive(JOB,{site_archive_id:a.site_archive_id},actor);
 const part=await p.readSiteArchivePart(JOB,{site_archive_id:a.site_archive_id,part:0},actor);assert.equal(digest(Buffer.from(part.chunk_base64,'base64')),digest(bytes));
 await p.confirmSiteArchive(JOB,{site_archive_id:a.site_archive_id,materialized_sha256:digest(bytes),size_bytes:bytes.length,verified_at:AT},actor);
 return a.site_archive_id;
}
async function finalPackages(f,final){return{...f.ids,source_bundle:await uploadFinalPackage(f,final,'source_bundle'),complete_bundle:await uploadFinalPackage(f,final,'complete_bundle')};}
test('accepted exact Mini draft completes only after both verified packages; preserves prior audits and source/script',async t=>{
 const f=await returnedFinalFixture(t),before=await p.getJob(JOB),old=snapshot(f.sql),final=await p.beginNativeSiteFinal(JOB,f.finalBody,actor);
 assert.equal(final.final.status,'staging');let j=await p.getJob(JOB);assert.equal(j.status,'approved');assert.equal(j.facts.site_file_archives.length,4);assert.equal(j.facts.complete_package_archived,false);
 const ids=await finalPackages(f,final);j=await p.getJob(JOB);assert.equal(j.status,'approved');assert.equal(j.facts.complete_package_archived,false);
 const result=await p.commitNativeSiteFinal(JOB,{final_id:final.final.final_id,archives:ids},actor);j=result.job;
 assert.equal(j.status,'completed');assert.equal(j.owner_id,undefined);assert.equal(p.finalNativeSiteArchivesFromFacts(j).length,6);assert.equal(j.facts.site_file_archives.length,6);assert.equal(j.facts.files_archived,true);assert.equal(j.facts.complete_package_archived,true);assert.equal(j.facts.website_video_button_clicked,false);assert.equal(j.facts.publication_authorization,false);
 assert.equal(j.facts.material_gate,'native-completed-final');assert.deepEqual(j.facts.material_problems,[]);assert.equal(j.facts.candidate_video_sha256,digest(f.bytes));assert.equal(j.facts.video_approval,'owner-node-approved');
 for(const node of ['source','script','video','cover','promotion','delivery']){const ms=j.milestones.filter(m=>m.node===node).sort((a,b)=>b.artifact_version-a.artifact_version);assert.equal(ms[0].status,'approved');}
 for(const m of before.milestones)assert.deepEqual(j.milestones.find(x=>x.id===m.id),m);
 for(const field of ['source_snapshot','skill_snapshot','drafts','revision','approved_revision','approved_hash','mode_epoch','contract_hash','attempt','ai_calls','reworks'])assert.deepEqual(j[field],before[field],field);
 const afterSeries=clone(j.series),beforeSeries=clone(before.series);delete afterSeries.capabilities;delete beforeSeries.capabilities;assert.deepEqual(afterSeries,beforeSeries);
 for(const row of old.production_reviews)assert.deepEqual(clone(f.sql.prepare('SELECT * FROM production_reviews WHERE id=?').get(row.id)),row);
 for(const sid of Object.values(ids)){const file=await p.readSiteArchiveFile(JOB,sid,OWNER),all=Buffer.from(await new Response(file.body).arrayBuffer()),parts=[];for(let part=0;part<file.archive.part_count;part++){const readback=await p.readSiteArchivePart(JOB,{site_archive_id:sid,part},actor);parts.push(Buffer.from(readback.chunk_base64,'base64'));}assert.equal(digest(Buffer.concat(parts)),digest(all));const trusted=await p.readSiteArchivePart(JOB,{site_archive_id:sid,part:0},{trusted_owner_service:true});assert.equal(trusted.chunk_sha256,digest(parts[0]));await assert.rejects(()=>p.readSiteArchivePart(JOB,{site_archive_id:sid,part:0},{owner_id:'SYNTHETIC-other-owner'}),expectStatus(403));}
 const owner=j.reviews.find(r=>r.id===final.final.owner_review_id),note=JSON.parse(owner.note);assert.equal(note.source,'owner-oral-report');assert.equal(note.website_button_clicked,false);assert.equal(note.quote,f.finalBody.approval.quote);
 const committed=JSON.parse(j.milestones.find(m=>m.id===result.final.milestone_ids.delivery).report);assert.equal(committed.source,'verified-private-delivery');
 const replay=await p.commitNativeSiteFinal(JOB,{final_id:final.final.final_id,archives:ids},actor);assert.equal(replay.replayed,true);assert.equal(replay.job.milestones.length,j.milestones.length);
 const read=await p.readNativeSiteFinal(JOB,{final_id:final.final.final_id},actor);assert.equal(read.package_archives.length,2);assert.equal(read.final.status,'committed');
});
for(const [name,mutate]of [['button impersonation',b=>b.approval.website_button_clicked=true],['missing approval source',b=>delete b.approval.source],['paid authority',b=>b.new_paid_calls=1],['external publishing',b=>b.publication_authorized=true],['changed exact video',b=>b.expected_milestones.video.artifact_hash='0'.repeat(64)]])test('final begin rejects '+name,async t=>{const f=await returnedFinalFixture(t),b=clone(f.finalBody);mutate(b);const before=snapshot(f.sql);await assert.rejects(()=>p.beginNativeSiteFinal(JOB,b,actor));assert.deepEqual(snapshot(f.sql),before);});
test('another owner cannot begin or read a final; staging draft cannot masquerade as returned',async t=>{const f=await returnedFinalFixture(t);await assert.rejects(()=>p.beginNativeSiteFinal(JOB,f.finalBody,{owner_id:'SYNTHETIC-other'}),expectStatus(403));const final=await p.beginNativeSiteFinal(JOB,f.finalBody,actor);await assert.rejects(()=>p.readNativeSiteFinal(JOB,{final_id:final.final.final_id},{owner_id:'SYNTHETIC-other'}),expectStatus(403));});
test('same final request is idempotent and cannot rebind changed owner words',async t=>{const f=await returnedFinalFixture(t),a=await p.beginNativeSiteFinal(JOB,f.finalBody,actor),b=await p.beginNativeSiteFinal(JOB,f.finalBody,actor);assert.equal(a.final.final_id,b.final.final_id);assert.equal(b.replayed,true);const changed=clone(f.finalBody);changed.approval.quote+=' changed';await assert.rejects(()=>p.beginNativeSiteFinal(JOB,changed,actor),expectStatus(409));});
test('missing packages, swapped original files and duplicate roles cannot approve current media',async t=>{const f=await returnedFinalFixture(t),final=await p.beginNativeSiteFinal(JOB,f.finalBody,actor),before=snapshot(f.sql);await assert.rejects(()=>p.commitNativeSiteFinal(JOB,{final_id:final.final.final_id,archives:f.ids},actor),expectStatus(400));assert.deepEqual(snapshot(f.sql),before);const ids=await finalPackages(f,final);const swapped={...ids,video:ids.cover_3_4,cover_3_4:ids.video};await assert.rejects(()=>p.commitNativeSiteFinal(JOB,{final_id:final.final.final_id,archives:swapped},actor),expectStatus(409));assert.equal((await p.getJob(JOB)).status,'approved');});
test('current draft mutation between reads and CAS leaves all final nodes absent',async t=>{const f=await returnedFinalFixture(t),final=await p.beginNativeSiteFinal(JOB,f.finalBody,actor),ids=await finalPackages(f,final);f.db.beforeNextBatch(()=>f.sql.prepare("UPDATE production_jobs SET updated_at='SYNTHETIC-race' WHERE id=?").run(JOB));await assert.rejects(()=>p.commitNativeSiteFinal(JOB,{final_id:final.final.final_id,archives:ids},actor),expectStatus(409));assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_milestones WHERE id LIKE 'native_final_%'").get().n,0);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_reviews WHERE decision='native_site_final_commit_v1'").get().n,0);});
test('dependent final insert failure rolls back completion and reported owner audit together',async t=>{const f=await returnedFinalFixture(t),final=await p.beginNativeSiteFinal(JOB,f.finalBody,actor),ids=await finalPackages(f,final);f.sql.exec("CREATE TRIGGER SYNTHETIC_final_fail BEFORE INSERT ON production_milestones WHEN NEW.node='delivery' BEGIN SELECT RAISE(ABORT,'SYNTHETIC final rollback'); END");const before=snapshot(f.sql);await assert.rejects(()=>p.commitNativeSiteFinal(JOB,{final_id:final.final.final_id,archives:ids},actor),/SYNTHETIC final rollback/);assert.deepEqual(snapshot(f.sql),before);});
test('final context cannot upload changed video, covers or promotion and cannot append a third package',async t=>{const f=await returnedFinalFixture(t),final=await p.beginNativeSiteFinal(JOB,f.finalBody,actor);const body={...final.archive_context,request_id:'SYNTHETIC-not-a-package',file:{role:'promotion',sha256:'a'.repeat(64),size_bytes:10,file_name:'SYNTHETIC.txt',mime_type:'text/plain'}};await assert.rejects(()=>p.startSiteArchive(JOB,body,actor));await finalPackages(f,final);body.file={role:'source_bundle',sha256:'b'.repeat(64),size_bytes:20,file_name:'SYNTHETIC.zip',mime_type:'application/zip'};await assert.rejects(()=>p.startSiteArchive(JOB,body,actor),expectStatus(409));});

function finalState(f,final){return f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('native_site_final_v1:'+JOB+':'+final.final.final_id).value;}
function legacyFinalSnapshot(f,final){const raw=finalState(f,final),v=JSON.parse(raw);return{owner:OWNER,source:v.snapshot.source,skill:v.snapshot.skill,scope_raw:v.snapshot.scope_raw,native_raw:'',reviews_raw:'',text_nodes_raw:'',version_key:'native_site_final_v1:'+JOB+':'+v.final_id,version_raw:raw};}
async function legacyStartedPackage(f,final,role='source_bundle'){
 const bytes=Buffer.alloc(524399,3);bytes.write('PK\x03\x04',0,'binary');const body={...final.archive_context,request_id:'SYNTHETIC-legacy-'+role,file:{role,sha256:digest(bytes),size_bytes:bytes.length,file_name:'SYNTHETIC-legacy-'+role+'.zip',mime_type:'application/zip'}},a=(await p.startSiteArchive(JOB,body,actor)).archive,key='site_archive_v1:'+a.site_archive_id,row=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(key).value);row.snapshot=legacyFinalSnapshot(f,final);f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(row),key);return{bytes,body,a,key};
}
test('262KB skill keeps new final archive snapshots compact and preserves the full immutable final/pending CAS',async t=>{const f=await returnedFinalFixture(t,{largeSkill:true}),final=await p.beginNativeSiteFinal(JOB,f.finalBody,actor),raw=finalState(f,final),value=JSON.parse(raw);assert.equal(Buffer.byteLength(value.snapshot.skill),262000);assert.ok(value.pending_raw.length>262000);const sid=await uploadFinalPackage(f,final,'source_bundle'),stored=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('site_archive_v1:'+sid).value);for(const field of ['source','skill','scope_raw','version_raw'])assert.match(stored.snapshot[field],/^sha256:[a-f0-9]{64}$/);assert.ok(Buffer.byteLength(JSON.stringify(stored))<10000);assert.equal(stored.snapshot.owner,OWNER);assert.equal(stored.snapshot.version_key,'native_site_final_v1:'+JOB+':'+final.final.final_id);assert.equal(finalState(f,final),raw);});
test('262KB legacy full snapshots resume partial upload and already-written manifest without reupload, then compact on seal',async t=>{const f=await returnedFinalFixture(t,{largeSkill:true}),final=await p.beginNativeSiteFinal(JOB,f.finalBody,actor),v=await legacyStartedPackage(f,final),raw=finalState(f,final),r2=globalThis.__syntheticPendingR2;for(let part=0;part<v.a.part_count;part++){const bytes=v.bytes.subarray(part*524288,(part+1)*524288);await p.putSiteArchivePart(JOB,{site_archive_id:v.a.site_archive_id,part,chunk_base64:bytes.toString('base64'),chunk_sha256:digest(bytes)},actor);}const keys=[...r2.map.keys()],legacy=f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(v.key).value;assert.ok(Buffer.byteLength(legacy)>1000000);const run=f.db.prepare.bind(f.db);let fail=true;f.db.prepare=q=>{const statement=run(q);if(!q.startsWith('UPDATE app_state SET value='))return statement;const originalBind=statement.bind.bind(statement);statement.bind=(...args)=>{const bound=originalBind(...args),originalRun=bound.run.bind(bound);bound.run=async()=>{if(fail){fail=false;throw new Error('SYNTHETIC first state write failure after immutable R2 manifest');}return originalRun();};return bound;};return statement;};await assert.rejects(()=>p.finalizeSiteArchive(JOB,{site_archive_id:v.a.site_archive_id},actor),/SYNTHETIC first state write/);assert.equal(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(v.key).value,legacy);assert.ok([...r2.map.keys()].some(k=>k.endsWith('/manifest.json')));await p.finalizeSiteArchive(JOB,{site_archive_id:v.a.site_archive_id},actor);const stored=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(v.key).value);assert.equal(stored.archive.status,'sealed');assert.ok(Buffer.byteLength(JSON.stringify(stored))<10000);for(const key of keys)assert.ok(r2.map.has(key));for(let part=0;part<v.a.part_count;part++)await p.readSiteArchivePart(JOB,{site_archive_id:v.a.site_archive_id,part},actor);await p.confirmSiteArchive(JOB,{site_archive_id:v.a.site_archive_id,materialized_sha256:digest(v.bytes),size_bytes:v.bytes.length,verified_at:AT},actor);assert.equal(finalState(f,final),raw);});
for(const [name,mutate]of [['owner',s=>s.owner='SYNTHETIC-other'],['version key',s=>s.version_key+='-changed'],['source bytes',s=>s.source+=' '],['skill bytes',s=>s.skill+=' '],['scope bytes',s=>s.scope_raw+=' '],['full final raw',s=>s.version_raw+=' ']])test('legacy compact matching rejects drift in '+name,async t=>{const f=await returnedFinalFixture(t,{largeSkill:true}),final=await p.beginNativeSiteFinal(JOB,f.finalBody,actor),v=await legacyStartedPackage(f,final),row=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(v.key).value);mutate(row.snapshot);f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(row),v.key);const before=snapshot(f.sql);await assert.rejects(()=>p.finalizeSiteArchive(JOB,{site_archive_id:v.a.site_archive_id},actor),expectStatus(409));assert.deepEqual(snapshot(f.sql),before);});
test('compacted snapshots do not weaken current full final record drift guard',async t=>{const f=await returnedFinalFixture(t,{largeSkill:true}),final=await p.beginNativeSiteFinal(JOB,f.finalBody,actor),v=await legacyStartedPackage(f,final),key='native_site_final_v1:'+JOB+':'+final.final.final_id,record=JSON.parse(finalState(f,final));record.approval.quote+=' SYNTHETIC changed';f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(record),key);await assert.rejects(()=>p.finalizeSiteArchive(JOB,{site_archive_id:v.a.site_archive_id},actor),expectStatus(409));});
