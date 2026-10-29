import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readOwnerFeedback,projectOwnerFeedback} from '../lib/owner-feedback-records.mts';

function setup(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(`CREATE TABLE topics(id TEXT PRIMARY KEY,title TEXT);CREATE TABLE production_jobs(id TEXT PRIMARY KEY,topic_id TEXT,owner_id TEXT,is_test INTEGER);CREATE TABLE production_drafts(job_id TEXT,revision INTEGER,content_hash TEXT);CREATE TABLE production_milestones(job_id TEXT,revision INTEGER,artifact_hash TEXT,node TEXT,artifact_version INTEGER);CREATE TABLE production_reviews(id TEXT PRIMARY KEY,job_id TEXT,revision INTEGER,content_hash TEXT,decision TEXT,note TEXT,reviewer TEXT,created_at TEXT);CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT);`);
 const run=(q,...args)=>sql.prepare(q).run(...args),add=(id,job,rev,hash,decision,note,reviewer='owner',time='2026-10-26T00:00:00Z')=>run('INSERT INTO production_reviews VALUES(?,?,?,?,?,?,?,?)',id,job,rev,hash,decision,JSON.stringify(note),reviewer,time);
 run('INSERT INTO topics VALUES(?,?)','t','原作品');run('INSERT INTO production_jobs VALUES(?,?,?,?)','j','t','owner',0);run('INSERT INTO production_jobs VALUES(?,?,?,?)','other','t','other',0);run('INSERT INTO production_jobs VALUES(?,?,?,?)','test','t','owner',1);
 for(const job of ['j','other','test']){run('INSERT INTO production_drafts VALUES(?,?,?)',job,1,'s');run('INSERT INTO production_milestones VALUES(?,?,?,?,?)',job,1,'v','video',2)}
 const db={prepare:q=>({bind:(...args)=>({all:async()=>({results:sql.prepare(q).all(...args)})})})};return {db,run,add};
}
const script=(note='本人原话')=>({schema:'siounex-script-feedback-v1',note,revision:1,script_hash:'s',mode_epoch:0});
const video=(reason='视频原话')=>({decision:'revise',actor:'owner',revision:1,artifact_hash:'v',reason});
test('owner original script and video notes are live, deduplicated, and retain sources',async t=>{
 const {db,add}=setup(t);add('script_feedback_a','j',1,'s','script_feedback',script('请补充示例步骤'));add('feedback_origin_a','j',1,'s','revise',script('请补充示例步骤'));add('milestone_review_a','j',1,'v','revise',video());add('milestone_review_b','j',1,'v','revise',video());
 const records=await readOwnerFeedback(db,'owner');assert.equal(records.length,2);assert.equal(records.find(x=>x.kind==='script').note,'请补充示例步骤');const v=records.find(x=>x.kind==='video');assert.equal(v.artifact_version,2);assert.deepEqual(v.source_ids.sort(),['milestone_review_a','milestone_review_b']);assert.equal(v.note,'视频原话');
 add('script_feedback_new','j',1,'s','script_feedback',script('将来保存的新意见'));assert.equal((await readOwnerFeedback(db,'owner')).length,3);
});
test('other owners, test jobs, AI, queue, invalid bindings, and automatic script-lock wording are excluded',async t=>{
 const {db,add}=setup(t);add('script_feedback_other','other',1,'s','script_feedback',script(),'other');add('script_feedback_test','test',1,'s','script_feedback',script());add('script_feedback_ai','j',1,'s','script_feedback',script(),'codex-cli');add('queue','j',1,'s','script_feedback_rework',script());add('script_feedback_wrong','j',1,'s','script_feedback',{...script(),script_hash:'changed'});add('script_feedback_lock','j',1,'s','script_feedback',script('逐字保留站内锁定完整原稿，仅制作分镜与素材说明；发现事实、时长或权利问题须暂停并列出理由，不得擅自改写。'));add('milestone_review_ai','j',1,'v','revise',video(),'codex-cli');add('milestone_review_spoof','j',1,'v','revise',{...video(),actor:'codex-cli'});add('milestone_review_wrong','j',1,'v','revise',{...video(),artifact_hash:'changed'});assert.deepEqual(await readOwnerFeedback(db,'owner'),[]);
});
test('same footage hash across distinct video versions is not presented as a known version',async t=>{
 const {db,add,run}=setup(t);run('INSERT INTO production_milestones VALUES(?,?,?,?,?)','j',1,'v','video',3);add('milestone_review_a','j',1,'v','revise',video());const [r]=await readOwnerFeedback(db,'owner');assert.equal(r.artifact_version,null);assert.deepEqual(r.source_ids,['milestone_review_a']);
});
test('an owner continuation note requires an actual linked owner rejection, and matching copies deduplicate',async t=>{
 const {db,add}=setup(t);add('milestone_review_a','j',1,'v','revise',video());
 const continuation={schema:'owner-media-rework-legacy-v1',node:'video',revision:1,artifact_hash:'v',feedback_id:'milestone_review_a',reason:'视频原话'};
 add('media_rework_a','j',1,'v','media_rework_requested',continuation);
 add('media_rework_new','j',1,'v','media_rework_requested',{...continuation,reason:'补充新的本人意见'});
 add('media_rework_spoof','j',1,'v','media_rework_requested',{...continuation,feedback_id:'missing',reason:'不能显示'});
 const records=await readOwnerFeedback(db,'owner');assert.equal(records.length,2);assert.deepEqual(records.find(x=>x.note==='视频原话').source_ids.sort(),['media_rework_a','milestone_review_a']);assert(records.some(x=>x.note==='补充新的本人意见'));
});
test('untrusted rows and malformed reports never yield a record',()=>{assert.deepEqual(projectOwnerFeedback([{id:'script_feedback_x',owner_id:'owner',reviewer:'owner',job_id:'j',revision:1,decision:'script_feedback',note:'not json',content_hash:'s',kind:'script',title:'t',artifact_version:null,created_at:''}], 'owner'),[]);});
test('only actual owner comments on the matching ready preview appear; empty approvals and AI diagnostics do not',async t=>{
 const {db,add,run}=setup(t),pid='wipv_'+'a'.repeat(64),hash='b'.repeat(64);
 run('INSERT INTO app_state VALUES(?,?)','wip_video_v1:'+pid,JSON.stringify({id:pid,job_id:'j',owner_id:'owner',revision:1,sha256:hash,status:'ready'}));
 const note={schema:'human-preview-feedback-v1',preview_id:pid,video_sha256:hash,decision:'revise',feedback:'这处画面请换掉'};
 add('preview_1','j',1,hash,'human_preview_feedback',note);add('preview_copy','j',1,hash,'human_preview_feedback',note);
 add('preview_empty','j',1,hash,'human_preview_feedback',{...note,decision:'approve',feedback:''});add('preview_wrong_hash','j',1,hash,'human_preview_feedback',{...note,video_sha256:'c'.repeat(64)});
 add('preview_ai','j',1,hash,'human_preview_feedback',{...note,feedback:'AI诊断'},'codex-cli');add('preview_missing','j',1,hash,'human_preview_feedback',{...note,preview_id:'wipv_'+'d'.repeat(64)});
 const records=await readOwnerFeedback(db,'owner');assert.equal(records.length,1);assert.equal(records[0].note,note.feedback);assert.equal(records[0].preview_id,pid);assert.deepEqual(records[0].source_ids.sort(),['preview_1','preview_copy']);
});
