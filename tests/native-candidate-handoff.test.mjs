// SYNTHETIC isolated SQLite. No real candidate, owner, render, Library or HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
const JOB='job_33333333-3333-3333-3333-333333333333',OWNER='SYNTHETIC-candidate-owner',AT='2026-10-17T00:00:00Z';
const PROJECT='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',TIMELINE='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const sha=v=>createHash('sha256').update(v).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const built=await build({stdin:{contents:[
 "export {getJob} from './lib/production';",
 "export {registerNativePromoVideo,promoBinding} from './lib/promo-delivery';",
 "export {recordNativeVideoArchive} from './lib/native-video-archive';",
 "export {readNativeWorkPacket} from './lib/native-work-packet';",
 "export {confirmMediaScope} from './lib/media-continuation';",
 "export {returnNativeDraft} from './lib/native-draft-handoff';",
 "export {decideMilestone} from './lib/milestones';"
].join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-candidate-db',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__nativeCandidateDb} export function siteArchiveBucket(){throw Error("Unexpected storage access in isolated candidate fixture")}'}));
}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
const tables=['production_jobs','production_drafts','production_reviews','production_milestones','production_operations','production_stages','app_state'];
const snapshot=sql=>clone(Object.fromEntries(tables.map(table=>[table,sql.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()])));
async function fixture(t,{id=JOB,scope=true}={}){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 class Statement{constructor(query,args=[]){this.query=query;this.args=args;}bind(...args){return new Statement(this.query,args);}async first(){return sql.prepare(this.query).get(...this.args)||null;}async all(){return {results:sql.prepare(this.query).all(...this.args)};}async run(){return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}}
 const db={prepare:q=>new Statement(q),batch:async ss=>{sql.exec('BEGIN');try{const results=ss.map(s=>({meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}}));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 globalThis.__nativeCandidateDb=db;t.after(()=>{sql.close();delete globalThis.__nativeCandidateDb;});
 sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES('synthetic-candidate','https://example.org/SYNTHETIC','fixture','fixture','SYNTHETIC','SYNTHETIC','fixture','now','视觉影像',0,'m','h','a','m','r',0,'zh')");
 const content=JSON.stringify({script:'SYNTHETIC exact approved narration',evidence:[],storyboard:[]}),script=sha(content),contract='c'.repeat(64);
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at) VALUES(?,'synthetic-candidate',?,0,'approved',?,?,?,1,1,?,'node',0,0,1,2,'now','now')").run(id,OWNER,JSON.stringify({category:'视觉影像',url:'https://example.org/SYNTHETIC'}),JSON.stringify({sha256:'f'.repeat(64)}),contract,script);
 sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,1,'SYNTHETIC-approved-script',?,?,'SYNTHETIC','now')").run(id,content,script);
 for(const node of ['source','script'])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,1,?,?,'approved',0,'now','now')").run('SYNTHETIC-'+node,id,node,script,content);
 if(scope){await p.confirmMediaScope(id,OWNER,{confirmed:true,binding:{revision:1,script_hash:script,mode_epoch:0,contract_hash:contract},scope:'private-video',current_id:'',request_id:'SYNTHETIC-scope'});sql.exec("UPDATE production_stages SET status='blocked'");}
 const body={revision:1,script_hash:script,sha256:'a'.repeat(64),file_name:'SYNTHETIC ordinary review voice candidate.mp4',size_bytes:12345,duration:54.9,project_id:PROJECT,timeline_id:TIMELINE,source:'SYNTHETIC completed local native export; ordinary review voice, not a final approved voice',quality_approved:false,publication:false};
 return {id,sql,script,contract,body,content};
}
async function registered(t,options){const f=await fixture(t,options);f.registered=await p.registerNativePromoVideo(f.id,f.body);return f;}
async function packet(f){const before=snapshot(f.sql),result=(await p.readNativeWorkPacket(f.id,OWNER)).packet;assert.deepEqual(snapshot(f.sql),before,'Packet reads must not claim, archive, insert a milestone or approve');return result;}
function completeReturn(f){const b=f.body;return {...b,mode_epoch:0,quality_approved:false,publication_authorized:false,new_paid_calls:0,library_file_id:'libfile_'+'6'.repeat(32),file_id:'file_'+'7'.repeat(32),library_version:0,verified_at:AT,materialized_sha256:b.sha256,render_id:'cccccccc-cccc-cccc-cccc-cccccccccccc',qa:{semantic_listening_passed:false,recovery_receipt_sha256:'8'.repeat(64),final_duration:{schema:'actual-final-duration-v1',file_sha256:b.sha256,probe_sha256:'9'.repeat(64),checked_at:AT,report:{hard_max_seconds:60,hard_duration_pass:true,maximum_measured_seconds:'54.9',measurements_seconds:{container_duration:'54.9',video_0_playback_end:'54.9',audio_0_playback_end:'54.9'},errors:[]}}}};}

test('SYNTHETIC current locally verified candidate replaces the instruction to make another video without creating a formal review node',async t=>{
 const f=await fixture(t),initial=await packet(f),before=snapshot(f.sql);assert.equal(initial.status,'needs_native_handoff');assert.equal(Object.hasOwn(initial,'candidate'),false);
 const result=await p.registerNativePromoVideo(f.id,f.body),j=await p.getJob(f.id),current=await packet(f);
 assert.equal(current.status,'awaiting_candidate_review');assert.equal(current.label,'已有视频候选，等待归档与本人审阅');
 assert.deepEqual(current.candidate,{record_id:result.id,revision:1,script_hash:f.script,sha256:f.body.sha256,file_name:f.body.file_name,size_bytes:12345,duration:54.9,project_id:PROJECT,timeline_id:TIMELINE,source:f.body.source,archive_status:'archive_pending',quality_approved:false,publication_authorized:false});
 assert.equal(j.facts.candidate_present,true);assert.equal(j.facts.files_archived,false);assert.equal(j.facts.video_approval,'not-recorded');
 assert.equal(current.capabilities.claimed,false);assert.equal(current.capabilities.generation_started,false);assert.equal(current.binding.base_artifact_version,0);
 assert.equal(j.milestones.filter(m=>m.node==='video').length,0);assert.equal(j.operations.length,0);
 const after=snapshot(f.sql);for(const table of ['production_jobs','production_drafts','production_milestones','production_operations','production_stages','app_state'])assert.deepEqual(after[table],before[table]);
 assert.notEqual(current.packet_hash,initial.packet_hash);assert.equal((await packet(f)).packet_hash,current.packet_hash);
});
test('SYNTHETIC an actual archive receipt changes archive state without pretending that a formal video review node exists',async t=>{
 const f=await registered(t),pending=await packet(f),j=await p.getJob(f.id),binding=p.promoBinding(j);
 await p.recordNativeVideoArchive(f.id,{binding,sha256:f.body.sha256,materialized_sha256:f.body.sha256,library_file_id:'libfile_'+'6'.repeat(32),file_id:'file_'+'7'.repeat(32),version:0,file_name:f.body.file_name,size_bytes:f.body.size_bytes,verified_at:AT,quality_approved:false,publication_authorized:false});
 const archived=await packet(f);assert.equal(archived.status,'awaiting_candidate_review');assert.equal(archived.label,'已有归档候选，等待回传视频审核节点');assert.equal(archived.candidate.archive_status,'archived');assert.notEqual(archived.packet_hash,pending.packet_hash);
 const after=await p.getJob(f.id);assert.equal(after.facts.files_archived,true);assert.equal(after.facts.video_approval,'not-recorded');assert.equal(after.milestones.filter(m=>m.node==='video').length,0);
});
for(const [name,mutate] of [
 ['old script',v=>{v.script_hash='0'.repeat(64);}],['malformed SHA',v=>{v.sha256='invalid';}],['unverified local output',v=>{v.local_file_verified=false;}],
 ['wrong schema',v=>{v.schema='SYNTHETIC-other-record';}],['empty file name',v=>{v.file_name='';}],['missing bytes',v=>{v.size_bytes=0;}],['nonfinite duration',v=>{v.duration=null;}]
])test('SYNTHETIC '+name+' cannot masquerade as a current verified native candidate',async t=>{
 const f=await registered(t),r=f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(f.registered.id),v=JSON.parse(r.note);mutate(v);f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(v),f.registered.id);
 const current=await packet(f);assert.equal(Object.hasOwn(current,'candidate'),false);assert.notEqual(current.status,'awaiting_candidate_review');
});
for(const field of ['revision','content_hash','decision'])test('SYNTHETIC mismatched candidate review '+field+' is not a current candidate',async t=>{
 const f=await registered(t);f.sql.prepare('UPDATE production_reviews SET '+field+'=? WHERE id=?').run(field==='revision'?0:field==='content_hash'?'0'.repeat(64):'SYNTHETIC-other-decision',f.registered.id);
 const current=await packet(f);assert.equal(Object.hasOwn(current,'candidate'),false);assert.notEqual(current.status,'awaiting_candidate_review');
});
test('SYNTHETIC a candidate does not erase a withdrawn scope or unapproved script blocker',async t=>{
 const f=await registered(t);f.sql.prepare("UPDATE app_state SET value=? WHERE key=?").run(JSON.stringify({id:'SYNTHETIC-cancel',scope:null}),'media_scope_v1:'+f.id);f.sql.exec("UPDATE production_milestones SET status='awaiting_human' WHERE node='script'");
 const current=await packet(f);assert.equal(current.status,'awaiting_candidate_review');assert.match(current.blockers.join('\n'),/私有视频范围/);assert.match(current.blockers.join('\n'),/来源和脚本节点/);assert.equal(current.candidate.archive_status,'archive_pending');assert.equal(current.binding.scope_id,null);
});
test('SYNTHETIC invalid project metadata remains honest text for a verified local file, never an invented native project',async t=>{
 const f=await registered(t),v=JSON.parse(f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(f.registered.id).note);v.project_id='SYNTHETIC-no-valid-project';v.timeline_id='';f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(v),f.registered.id);
 const current=await packet(f);assert.equal(current.status,'awaiting_candidate_review');assert.equal(current.candidate.project_id,'SYNTHETIC-no-valid-project');assert.equal(current.candidate.timeline_id,'');
});
test('SYNTHETIC replacement candidate changes the packet while preserving the prior candidate receipt',async t=>{
 const f=await registered(t);f.sql.prepare('UPDATE production_reviews SET created_at=? WHERE id=?').run('2026-10-16T00:00:00Z',f.registered.id);const first=await packet(f),old=clone(f.sql.prepare('SELECT * FROM production_reviews WHERE id=?').get(f.registered.id));
 await p.registerNativePromoVideo(f.id,{...f.body,sha256:'b'.repeat(64),project_id:'dddddddd-dddd-dddd-dddd-dddddddddddd'});
 f.sql.prepare('UPDATE production_reviews SET created_at=? WHERE id!=? AND decision=?').run('2026-10-17T01:00:00Z',f.registered.id,'native_video_candidate');
 const second=await packet(f);assert.equal(second.candidate.sha256,'b'.repeat(64));assert.notEqual(second.packet_hash,first.packet_hash);assert.deepEqual(clone(f.sql.prepare('SELECT * FROM production_reviews WHERE id=?').get(f.registered.id)),old);
});
test('SYNTHETIC formal awaiting-human, approved and invalidated video milestones retain their existing precedence',async t=>{
 const f=await registered(t),before=await packet(f),returned=await p.returnNativeDraft(f.id,completeReturn(f)),m=returned.job.milestones.find(m=>m.id===returned.milestone_id);
 const waiting=await packet(f);assert.equal(waiting.status,'awaiting_human');assert.deepEqual(waiting.candidate,{...before.candidate,archive_status:'archived'});
 await p.decideMilestone(f.id,m.id,1,m.artifact_hash,0,'approve',{},OWNER);const approved=await packet(f);assert.equal(approved.status,'native_done');assert.deepEqual(approved.candidate,waiting.candidate);
 f.sql.prepare("UPDATE production_milestones SET status='invalidated' WHERE id=?").run(m.id);assert.equal((await packet(f)).status,'blocked');assert.equal(Object.hasOwn(await packet(f),'candidate'),false);
});
for(const id of ['job_9ef39025-d92e-4770-82d0-05881451c5df','job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee'])test('SYNTHETIC external protected flow '+id+' remains external despite a local candidate row',async t=>{
 const f=await fixture(t,{id,scope:false}),note={schema:'native-video-candidate-v1',...f.body,local_file_verified:true};
 f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES('native_video_SYNTHETIC-external',?,1,?,'native_video_candidate',?,'verified-local-output','now')").run(id,f.body.sha256,JSON.stringify(note));
 const current=await packet(f);assert.equal(current.status,'external_chat_task');assert.equal(Object.hasOwn(current,'candidate'),false);assert.equal(current.label,'已有独立制作会话，本站只读交接信息');
 // Exact v83 core contract for these scope-free external fixtures. A candidate
 // must not add even candidate:null and invalidate an independent chat's hash.
 const oldCore={schema:'native-work-packet-v1',job_id:id,binding:{revision:1,script_hash:f.script,mode_epoch:0,contract_hash:f.contract,skill_hash:'f'.repeat(64),scope_id:null,scope_hash:null,base_milestone_id:null,base_artifact_version:0,base_artifact_hash:null,base_sha256:null,base_report_sha256:null,feedback_review_id:null,feedback_note_sha256:null,continuation_review_id:null,continuation_note_sha256:null},script:{revision:1,content_hash:f.script,text:JSON.parse(f.content).script,content:JSON.parse(f.content)},feedback:null,template:{skill_snapshot:{sha256:'f'.repeat(64)},series:{current:null,choice_current:false}},inputs:{source_snapshot:{category:'视觉影像',url:'https://example.org/SYNTHETIC'},audio_records:[]}};
 assert.equal(current.packet_hash,sha(canonical(oldCore)),'External packet canonical hash must remain identical to the v83 core');
});
