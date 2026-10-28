// SYNTHETIC, isolated SQLite only. No real media, owner action, tools or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
const JOB='job_11111111-1111-1111-1111-111111111111',OWNER='SYNTHETIC-owner',AT='2026-10-14T00:00:00Z',PROJECT='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',TIMELINE='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const sha=v=>createHash('sha256').update(v).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
const buildResult=await build({stdin:{contents:[
 "export {getJob} from './lib/production';","export {returnNativeDraft} from './lib/native-draft-handoff';",
 "export {returnOwnerNativeVideoRevision} from './lib/native-video-revision-return';","export {readNativeWorkPacket} from './lib/native-work-packet';",
 "export {decideMilestone,continueMediaRework,submitMilestone} from './lib/milestones';","export {confirmMediaScope} from './lib/media-continuation';",
 "export {nextWork} from './lib/dispatch';","export {executionBinding} from './lib/production-queue-contract';",
 "export * as route from './app/api/production/route';"
].join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-native-owner',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__nativeOwnerDb} export function siteArchiveBucket(){throw Error("Unexpected SYNTHETIC archive access")}'}));
 b.onResolve({filter:/^@\/lib\/api$/},()=>({path:'api',namespace:'api'}));
 b.onLoad({filter:/.*/,namespace:'api'},()=>({contents:"export async function identity(req){return req.headers.get('x-synthetic-owner')||null}export const json=(body,status=200)=>Response.json(body,{status});"}));
}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(buildResult.outputFiles[0].contents).toString('base64'));
function demonstration(){
 const video='9'.repeat(64),a='1'.repeat(64),b='2'.repeat(64);
 return {schema:'actual-tool-demonstration-v1',semantic_review:'actual-file-reviewed',files:[{kind:'recorded-tool-session',sha256:video,size_bytes:123,duration_seconds:20,checked_at:AT,full_decode:true,actual_tool:'SYNTHETIC tool fixture',visible_action_result:'SYNTHETIC action/output fixture',simulated_ui:false,frame_hashes:[a,b],frames:[{file:'SYNTHETIC/open.png',sha256:a,source_second:0},{file:'SYNTHETIC/core.png',sha256:b,source_second:10}]}],mapping:[{segment:'opening-0-3',file_sha256:video,source_in:0,source_out:3},{segment:'core-operation',file_sha256:video,source_in:10,source_out:15}]};
}
function media(script,old=false){
 const digest=(old?'a':'b').repeat(64),render=(old?'dddddddd-dddd-dddd-dddd-dddddddddddd':'cccccccc-cccc-cccc-cccc-cccccccccccc');
 return {revision:1,script_hash:script,mode_epoch:0,sha256:digest,size_bytes:12345,duration:54.9,quality_approved:false,publication_authorized:false,new_paid_calls:0,library_file_id:'libfile_'+(old?'6':'d').repeat(32),file_id:'file_'+(old?'7':'e').repeat(32),library_version:0,verified_at:AT,materialized_sha256:digest,project_id:PROJECT,timeline_id:TIMELINE,render_id:render,file_name:'SYNTHETIC-NOT-A-DELIVERABLE.mp4',source:'SYNTHETIC completed-file receipt; no actual media inspection',demonstration_check:demonstration(),qa:{semantic_listening_passed:false,recovery_receipt_sha256:'f'.repeat(64),final_duration:{schema:'actual-final-duration-v1',file_sha256:digest,probe_sha256:'3'.repeat(64),checked_at:AT,report:{hard_max_seconds:60,hard_duration_pass:true,maximum_measured_seconds:'54.9',measurements_seconds:{container_duration:'54.9',video_0_playback_end:'54.9',audio_0_playback_end:'54.9'},errors:[]}},preview_proof:{schema:'actual-native-preview-v1',source:'native-timeline-preview',project_id:PROJECT,timeline_id:TIMELINE,render_id:render,video_sha256:digest,receipt_sha256:'4'.repeat(64),checked_at:AT,frames:[{role:'opening',time_seconds:0.5,image_sha256:'5'.repeat(64)},{role:'core',time_seconds:20,image_sha256:'6'.repeat(64)},{role:'ending',time_seconds:53,image_sha256:'8'.repeat(64)}]}}};
}
const tables=['production_jobs','production_drafts','production_reviews','production_milestones','production_operations','production_stages','app_state','production_data_videos'];
function snapshot(sql){return clone(Object.fromEntries(tables.map(t=>[t,sql.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()])));}
const status=n=>e=>{assert.equal(e.status,n,e.message);return true};
async function fixture(t,{first=true,rejected=true,continued=false}={}){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 let hook;class S{constructor(q,a=[]){this.q=q;this.a=a}bind(...a){return new S(this.q,a)}async first(){return sql.prepare(this.q).get(...this.a)||null}async all(){return {results:sql.prepare(this.q).all(...this.a)}}async run(){return {meta:{changes:Number(sql.prepare(this.q).run(...this.a).changes)}}}}
 const db={prepare:q=>new S(q),beforeBatch:f=>{hook=f},batch:async ss=>{if(hook){const f=hook;hook=null;f()}sql.exec('BEGIN');try{const r=ss.map(s=>({meta:{changes:Number(sql.prepare(s.q).run(...s.a).changes)}}));sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__nativeOwnerDb=db;t.after(()=>{sql.close();delete globalThis.__nativeOwnerDb});
 sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES('synthetic-native-owner','https://example.org/SYNTHETIC-native','fixture','fixture','SYNTHETIC','SYNTHETIC','fixture','now','AI实用',0,'m','h','a','m','r',0,'zh')");
 const content=JSON.stringify({script:'SYNTHETIC approved narration',limits:'SYNTHETIC isolated software QA',evidence:[],storyboard:[]}),script=sha(content),contract='c'.repeat(64),skill=JSON.stringify({sha256:'f'.repeat(64),template:'SYNTHETIC frozen template'});
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at) VALUES(?,'synthetic-native-owner',?,0,'approved',?, ?,?,1,1,?,'node',0,0,1,2,'now','now')").run(JOB,OWNER,JSON.stringify({category:'AI实用',demonstration_required:true,url:'https://example.org/SYNTHETIC-native'}),skill,contract,script);
 sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,1,'SYNTHETIC-script',?,?,'SYNTHETIC','now')").run(JOB,content,script);
 for(const node of ['source','script'])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,1,?,?,'approved',0,'now','now')").run('SYNTHETIC-'+node,JOB,node,script,content);
 await p.confirmMediaScope(JOB,OWNER,{confirmed:true,binding:{revision:1,script_hash:script,mode_epoch:0,contract_hash:contract},scope:'private-video',current_id:'',request_id:'SYNTHETIC-scope'});
 sql.exec("UPDATE production_stages SET status='ready'");
 let base,firstResult;if(first){firstResult=await p.returnNativeDraft(JOB,media(script,true));base=firstResult.job.milestones.find(m=>m.id===firstResult.milestone_id);
  if(rejected){await p.decideMilestone(JOB,base.id,1,base.artifact_hash,0,'revise',{reason:'SYNTHETIC owner layout change'},OWNER);if(continued)await p.continueMediaRework(JOB,OWNER,base.id,1,base.artifact_hash,0,'SYNTHETIC owner continues exact completed-file rework');}
 }
 const packet=(await p.readNativeWorkPacket(JOB,OWNER)).packet,b=packet.binding;
 const body={...media(script),request_id:'SYNTHETIC-owner-return',contract_hash:contract,scope_id:b.scope_id,scope_hash:b.scope_hash,packet_hash:packet.packet_hash,
  base_milestone_id:b.base_milestone_id,base_artifact_version:b.base_artifact_version,base_artifact_hash:b.base_artifact_hash,base_sha256:b.base_sha256,base_report_sha256:b.base_report_sha256,feedback_review_id:b.feedback_review_id,feedback_note_sha256:b.feedback_note_sha256,
  ...(b.continuation_review_id?{continuation_review_id:b.continuation_review_id,continuation_note_sha256:b.continuation_note_sha256}:{})};
 return {sql,db,script,contract,packet,body,base,firstResult};
}
async function rejectsUnchanged(f,body,code=409){const before=snapshot(f.sql);await assert.rejects(()=>p.returnOwnerNativeVideoRevision(JOB,body),status(code));assert.deepEqual(snapshot(f.sql),before);}

test('SYNTHETIC approved new owner topic has a stable read-only native packet without an operation or claim',async t=>{
 const f=await fixture(t,{first:false}),before=snapshot(f.sql),again=(await p.readNativeWorkPacket(JOB,OWNER)).packet;
 assert.equal(again.status,'needs_native_handoff');assert.equal(again.script.text,'SYNTHETIC approved narration');assert.equal(again.packet_hash,f.packet.packet_hash);
 assert.equal(again.capabilities.claimed,false);assert.equal(again.capabilities.native_editor_connected,false);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_operations').get().n,0);assert.deepEqual(snapshot(f.sql),before);
 const response=await p.route.GET(new Request('https://example.org/api/production?id='+JOB+'&view=native_packet',{headers:{'x-synthetic-owner':OWNER}}));assert.equal(response.status,200);
 assert.equal((await p.route.GET(new Request('https://example.org/api/production?id='+JOB+'&view=native_packet'))).status,401);
 assert.equal((await p.route.GET(new Request('https://example.org/api/production?id='+JOB+'&view=native_packet',{headers:{'x-synthetic-owner':'SYNTHETIC-other'}}))).status,404);
 assert.deepEqual(snapshot(f.sql),before);
});
test('SYNTHETIC ordinary first return enforces owner scope and demonstration, preserves top-level proof and replays after rejection',async t=>{
 const f=await fixture(t,{first:false}),missing=media(f.script,true);delete missing.demonstration_check;let before=snapshot(f.sql);
 await assert.rejects(()=>p.returnNativeDraft(JOB,missing),status(409));assert.deepEqual(snapshot(f.sql),before);
 const result=await p.returnNativeDraft(JOB,media(f.script,true)),m=result.job.milestones.find(m=>m.id===result.milestone_id);
 assert.deepEqual(JSON.parse(m.artifact).demonstration_check,demonstration());
 await p.decideMilestone(JOB,m.id,1,m.artifact_hash,0,'revise',{reason:'SYNTHETIC exact owner change'},OWNER);before=snapshot(f.sql);
 assert.equal((await p.returnNativeDraft(JOB,media(f.script,true))).replayed,true);assert.deepEqual(snapshot(f.sql),before);
});
test('SYNTHETIC preparation-only scope cannot receive an ordinary first video or manufacture production authority',async t=>{
 const f=await fixture(t,{first:false}),s=f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('media_scope_v1:'+JOB),v=JSON.parse(s.value);v.scope.scope='preparation';f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(v),'media_scope_v1:'+JOB);
 const before=snapshot(f.sql);await assert.rejects(()=>p.returnNativeDraft(JOB,media(f.script,true)),status(409));assert.deepEqual(snapshot(f.sql),before);
});
test('SYNTHETIC generic media milestone keeps demonstration evidence through owner review',async t=>{
 const f=await fixture(t,{first:false}),body={url:'https://example.org/SYNTHETIC.mp4',sha256:f.body.sha256,provider_job_id:'SYNTHETIC-existing-render',cost:0,qa:f.body.qa};
 await assert.rejects(()=>p.submitMilestone(JOB,'video',1,0,'SYNTHETIC-result',body),status(409));
 const j=await p.submitMilestone(JOB,'video',1,0,'SYNTHETIC-result',{...body,demonstration_check:demonstration()}),m=j.milestones.find(m=>m.node==='video');
 assert.deepEqual(JSON.parse(m.artifact).demonstration_check,demonstration());assert.equal((await p.decideMilestone(JOB,m.id,1,m.artifact_hash,0,'approve',{},OWNER)).facts.video_approval,'owner-node-approved');
});
for(const continued of [false,true])test('SYNTHETIC generic owner revision from '+(continued?'actual owner continuation':'exact owner rejection pause')+' creates v2 without rewriting v1, script, scope or counters',async t=>{
 const f=await fixture(t,{continued}),before=snapshot(f.sql),result=await p.returnOwnerNativeVideoRevision(JOB,f.body),m=result.job.milestones.find(m=>m.id===result.milestone_id);
 assert.equal(result.artifact_version,2);assert.equal(m.status,'awaiting_human');assert.equal(result.job.status,'approved');assert.equal(result.job.revision,1);assert.equal(result.job.approved_hash,f.script);assert.equal(result.job.facts.video_approval,'not-recorded');
 assert.deepEqual(clone(f.sql.prepare('SELECT * FROM production_milestones WHERE id=?').get(f.base.id)),before.production_milestones.find(m=>m.id===f.base.id));
 for(const k of ['attempt','reworks','ai_calls','approved_revision','approved_hash'])assert.equal(result.job[k],before.production_jobs[0][k]);assert.deepEqual(snapshot(f.sql).app_state,before.app_state);assert.deepEqual(snapshot(f.sql).production_drafts,before.production_drafts);
 await assert.rejects(()=>p.decideMilestone(JOB,m.id,1,m.artifact_hash,0,'approve',{},'SYNTHETIC-other'),status(403));
 const replayBefore=snapshot(f.sql);assert.equal((await p.returnOwnerNativeVideoRevision(JOB,clone(f.body))).replayed,true);assert.deepEqual(snapshot(f.sql),replayBefore);
 await rejectsUnchanged(f,{...f.body,source:'SYNTHETIC different request content'});
});
test('SYNTHETIC identical concurrent owner returns have exactly one receipt winner and no copied approval',async t=>{
 const f=await fixture(t),results=await Promise.all([p.returnOwnerNativeVideoRevision(JOB,f.body),p.returnOwnerNativeVideoRevision(JOB,clone(f.body))]);
 assert.equal(results[0].milestone_id,results[1].milestone_id);assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_milestones WHERE node='video'").get().n,2);
});
test('SYNTHETIC different concurrent completed files cannot both replace one owner-rejected base',async t=>{
 const f=await fixture(t),other=clone(f.body);other.request_id='SYNTHETIC-competing-return';other.sha256='c'.repeat(64);other.materialized_sha256=other.sha256;other.file_id='file_'+'f'.repeat(32);other.library_file_id='libfile_'+'1'.repeat(32);other.render_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';other.qa.final_duration.file_sha256=other.sha256;other.qa.preview_proof.video_sha256=other.sha256;other.qa.preview_proof.render_id=other.render_id;
 const result=await Promise.allSettled([p.returnOwnerNativeVideoRevision(JOB,f.body),p.returnOwnerNativeVideoRevision(JOB,other)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.status,409);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_milestones WHERE node='video'").get().n,2);
});
test('SYNTHETIC committed owner receipt remains read-only replayable after a later script, mode and scope change',async t=>{
 const f=await fixture(t),first=await p.returnOwnerNativeVideoRevision(JOB,f.body);
 f.sql.prepare("UPDATE production_jobs SET revision=2,approved_revision=NULL,approved_hash=NULL,mode_epoch=1,status='paused',error='SYNTHETIC later pause' WHERE id=?").run(JOB);
 f.sql.prepare("UPDATE app_state SET value='{}' WHERE key=?").run('media_scope_v1:'+JOB);const before=snapshot(f.sql);
 const replay=await p.returnOwnerNativeVideoRevision(JOB,clone(f.body));assert.equal(replay.milestone_id,first.milestone_id);assert.equal(replay.replayed,true);assert.deepEqual(snapshot(f.sql),before);
});
test('SYNTHETIC owner continuation cannot be reused after its exact saved decision changes',async t=>{
 const f=await fixture(t,{continued:true});let raced;
 f.db.beforeBatch(()=>{f.sql.prepare("UPDATE production_reviews SET note='{}' WHERE id=?").run(f.body.continuation_review_id);raced=snapshot(f.sql)});
 await assert.rejects(()=>p.returnOwnerNativeVideoRevision(JOB,f.body),status(409));assert.deepEqual(snapshot(f.sql),raced);
});
test('SYNTHETIC owner receipt rejects stale binding, missing proof, fabricated approval, wrong owner feedback and protected tasks',async t=>{
 const f=await fixture(t);for(const change of [b=>{b.packet_hash='0'.repeat(64)},b=>{b.scope_hash='0'.repeat(64)},b=>{b.contract_hash='0'.repeat(64)},b=>{b.base_artifact_hash='0'.repeat(64)},b=>{b.feedback_review_id='SYNTHETIC-unrelated'},b=>{delete b.demonstration_check},b=>{b.quality_approved=true},b=>{b.new_paid_calls=1},b=>{b.project_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';b.qa.preview_proof.project_id=b.project_id}]){
  const b=clone(f.body);change(b);await rejectsUnchanged(f,b,b.quality_approved||b.new_paid_calls?400:409);
 }
 const before=snapshot(f.sql);for(const id of ['job_9ef39025-d92e-4770-82d0-05881451c5df','job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee'])await assert.rejects(()=>p.returnOwnerNativeVideoRevision(id,f.body),status(403));assert.deepEqual(snapshot(f.sql),before);
 f.sql.prepare("UPDATE production_reviews SET reviewer='SYNTHETIC-impostor' WHERE id=?").run(f.body.feedback_review_id);await rejectsUnchanged(f,f.body);
});
test('SYNTHETIC owner receipt CAS protects scope cancellation, newer versions, feedback and live leases',async t=>{
 for(const [name,change]of [
  ['scope',f=>f.sql.prepare("UPDATE app_state SET value='{}' WHERE key=?").run('media_scope_v1:'+JOB)],
  ['feedback',f=>f.sql.prepare("UPDATE production_reviews SET note='{}' WHERE id=?").run(f.body.feedback_review_id)],
  ['job lease',f=>f.sql.prepare('UPDATE production_jobs SET lease_until=? WHERE id=?').run(Date.now()+600000,JOB)],
  ['review lease',f=>f.sql.prepare('UPDATE production_milestones SET review_until=? WHERE id=?').run(Date.now()+600000,f.base.id)],
  ['media lease',f=>f.sql.prepare("INSERT INTO production_operations(id,job_id,node,revision,script_hash,mode_epoch,base_artifact_version,input_hash,plan,status,lease_until,created_at,updated_at) VALUES('SYNTHETIC-live-op',?,'video',1,?,0,1,?,'{}','running',?,'now','now')").run(JOB,f.script,'1'.repeat(64),Date.now()+600000)],
  ['preparation lease',f=>f.sql.prepare("UPDATE production_stages SET status='running',result=? WHERE stage='media_inputs'").run(JSON.stringify({lease_until:Date.now()+600000}))],
  ['new template selection',f=>f.sql.prepare("INSERT INTO app_state(key,value) VALUES(?,?)").run('series_selection_v1:'+JOB,JSON.stringify({current:{id:'SYNTHETIC-new-selection',mode_epoch:0,template:{id:'SYNTHETIC-layout'}},history:[]}))],
  ['new audio',f=>f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES('SYNTHETIC-racing-audio',?,1,?,'audio_intake',?,?,'now')").run(JOB,f.script,JSON.stringify({input:{script_hash:f.script,sha256:'8'.repeat(64)}}),OWNER)],
  ['new prepared materials',f=>f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES('SYNTHETIC-racing-materials',?,1,?,'preparation_materials_v1',?,?,'now')").run(JOB,f.script,JSON.stringify({schema:'SYNTHETIC',assets:[]}),OWNER)],
  ['newer version',f=>f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES('SYNTHETIC-newer',?,'video',1,2,?,'{}','awaiting_human',0,'now','now')").run(JOB,'3'.repeat(64))]
 ])await t.test(name,async sub=>{const f=await fixture(sub);let raced;f.db.beforeBatch(()=>{change(f);raced=snapshot(f.sql)});await assert.rejects(()=>p.returnOwnerNativeVideoRevision(JOB,f.body),status(409));assert.ok(raced);assert.deepEqual(snapshot(f.sql),raced);});
});
for(const first of [true,false])test('SYNTHETIC '+(first?'first':'continued revision')+' intake CAS refuses a new owner license denial without discarding the independent decision',async t=>{
 const f=await fixture(t,{first:!first,continued:!first}),library='libfile_'+'4'.repeat(32),mediaSha='5'.repeat(64),intake={proposal:{media:[{library_file_id:library,sha256:mediaSha}],goal:'SYNTHETIC'},contract_hash:f.contract,text_authorized:true};
 f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES('SYNTHETIC-racing-intake',?,0,?,'intake_accepted',?,?,'now')").run(JOB,'1'.repeat(64),JSON.stringify(intake),OWNER);
 if(!first)f.body.packet_hash=(await p.readNativeWorkPacket(JOB,OWNER)).packet.packet_hash;
 let raced;f.db.beforeBatch(()=>{f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES('SYNTHETIC-racing-denial',?,1,?,'media_license',?,?,'now')").run(JOB,f.script,JSON.stringify({library_file_id:library,sha256:mediaSha,status:'denied'}),OWNER);raced=snapshot(f.sql)});
 await assert.rejects(()=>first?p.returnNativeDraft(JOB,media(f.script,true)):p.returnOwnerNativeVideoRevision(JOB,f.body),status(409));assert.deepEqual(snapshot(f.sql),raced);
});
test('SYNTHETIC frozen selection and bound inputs are stable while an unrelated template catalog grows',async t=>{
 const f=await fixture(t),ledger={current:{id:'SYNTHETIC-frozen-selection',mode_epoch:0,template:{id:'SYNTHETIC-layout',version:1},history:{selected:[]}},history:[]};
 f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run('series_selection_v1:'+JOB,JSON.stringify(ledger));
 f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES('SYNTHETIC-bound-audio',?,1,?,'audio_intake',?,?,'now')").run(JOB,f.script,JSON.stringify({input:{script_hash:f.script,sha256:'8'.repeat(64),note:'测试引号 \" 与换行\n'}}),OWNER);
 const packet=(await p.readNativeWorkPacket(JOB,OWNER)).packet;f.body.packet_hash=packet.packet_hash;
 f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run('series_catalog_v1:'+OWNER,JSON.stringify({revision:99,templates:[]}));
 assert.equal((await p.readNativeWorkPacket(JOB,OWNER)).packet.packet_hash,packet.packet_hash);
 const result=await p.returnOwnerNativeVideoRevision(JOB,f.body);assert.equal(result.artifact_version,2);
});
test('SYNTHETIC an existing frozen selection cannot change between owner packet check and receipt commit',async t=>{
 const f=await fixture(t),key='series_selection_v1:'+JOB,ledger={current:{id:'SYNTHETIC-existing-selection',mode_epoch:0,template:{id:'SYNTHETIC-layout'}},history:[]};
 f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run(key,JSON.stringify(ledger));f.body.packet_hash=(await p.readNativeWorkPacket(JOB,OWNER)).packet.packet_hash;
 let raced;f.db.beforeBatch(()=>{ledger.current.id='SYNTHETIC-changed-selection';f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(ledger),key);raced=snapshot(f.sql)});
 await assert.rejects(()=>p.returnOwnerNativeVideoRevision(JOB,f.body),status(409));assert.deepEqual(snapshot(f.sql),raced);
});
test('SYNTHETIC obsolete queued media is preserved but never selected after first video or scope epoch changes',async t=>{
 const f=await fixture(t,{rejected:false}),j=await p.getJob(JOB);
 const plan=JSON.stringify({cost:0}),insert=f.sql.prepare("INSERT INTO production_operations(id,job_id,node,revision,script_hash,mode_epoch,base_artifact_version,input_hash,plan,status,created_at,updated_at) VALUES('SYNTHETIC-old-op',?,'video',1,?,0,0,?,?,'queued','now','now')");
 insert.run(JOB,f.script,'1'.repeat(64),plan);const before=snapshot(f.sql);assert.equal((await p.nextWork()).job,null);assert.equal(p.executionBinding({...j,operations:[clone(f.sql.prepare('SELECT * FROM production_operations').get())]}),null);assert.deepEqual(snapshot(f.sql),before);
 f.sql.prepare("UPDATE production_operations SET base_artifact_version=1 WHERE id='SYNTHETIC-old-op'").run();assert.equal((await p.nextWork()).operation_id,'SYNTHETIC-old-op');
 const s=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('media_scope_v1:'+JOB).value);s.scope.binding.mode_epoch=99;f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(s),'media_scope_v1:'+JOB);const stale=snapshot(f.sql);assert.equal((await p.nextWork()).job,null);assert.deepEqual(snapshot(f.sql),stale);
});
test('SYNTHETIC latest owner license denial makes a current queued operation unselectable without changing its history',async t=>{
 const f=await fixture(t,{rejected:false}),library='libfile_'+'4'.repeat(32),fileSha='5'.repeat(64),scope=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('media_scope_v1:'+JOB).value).scope;
 const intake={proposal:{media:[{library_file_id:library,sha256:fileSha}],goal:'SYNTHETIC'},contract_hash:f.contract,text_authorized:true};
 f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES('SYNTHETIC-intake',?,0,?,'intake_accepted',?,?,'now')").run(JOB,'1'.repeat(64),JSON.stringify(intake),OWNER);
 const plan=JSON.stringify({media_scope_id:scope.id,cost:0});
 f.sql.prepare("INSERT INTO production_operations(id,job_id,node,revision,script_hash,mode_epoch,base_artifact_version,input_hash,plan,status,created_at,updated_at) VALUES('SYNTHETIC-licensed-op',?,'video',1,?,0,1,?,?,'queued','now','now')").run(JOB,f.script,'1'.repeat(64),plan);
 assert.equal((await p.nextWork()).operation_id,'SYNTHETIC-licensed-op');
 f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES('SYNTHETIC-denial',?,1,?,'media_license',?,?,'now')").run(JOB,f.script,JSON.stringify({library_file_id:library,sha256:fileSha,status:'denied'}),OWNER);
 const before=snapshot(f.sql);assert.equal((await p.nextWork()).job,null);assert.equal(p.executionBinding(await p.getJob(JOB)),null);assert.deepEqual(snapshot(f.sql),before);
});
test('SYNTHETIC approved video packet reports completion of owner review instead of a pending review',async t=>{
 const f=await fixture(t,{rejected:false}),m=f.firstResult.job.milestones.find(m=>m.id===f.base.id);
 await p.decideMilestone(JOB,m.id,1,m.artifact_hash,0,'approve',{},OWNER);assert.equal((await p.readNativeWorkPacket(JOB,OWNER)).packet.status,'native_done');
});
