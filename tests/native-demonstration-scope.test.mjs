// SYNTHETIC isolated SQLite contract tests. No real media, owner, tools or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

const JOB='job_22222222-2222-2222-2222-222222222222',OWNER='SYNTHETIC-static-owner',AT='2026-10-17T00:00:00Z';
const PROJECT='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',TIMELINE='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const sha=v=>createHash('sha256').update(v).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
const bundled=await build({stdin:{contents:[
 "export {getJob} from './lib/production';",
 "export {returnNativeDraft} from './lib/native-draft-handoff';",
 "export {returnOwnerNativeVideoRevision} from './lib/native-video-revision-return';",
 "export {readNativeWorkPacket} from './lib/native-work-packet';",
 "export {confirmMediaScope} from './lib/media-continuation';",
 "export {decideMilestone,submitMilestone} from './lib/milestones';"
].join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-static-native-scope',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__staticNativeScopeDb} export function siteArchiveBucket(){throw Error("SYNTHETIC unexpected R2 access")}'}));
}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
const tables=['production_jobs','production_drafts','production_reviews','production_milestones','production_operations','production_stages','app_state'];
const snapshot=sql=>clone(Object.fromEntries(tables.map(table=>[table,sql.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()])));
const status=n=>e=>{assert.equal(e.status,n,e.message);return true;};

function demonstration(){
 const video='9'.repeat(64),opening='1'.repeat(64),core='2'.repeat(64);
 return {schema:'actual-tool-demonstration-v1',semantic_review:'actual-file-reviewed',files:[{
  kind:'recorded-tool-session',sha256:video,size_bytes:123,duration_seconds:20,checked_at:AT,full_decode:true,
  actual_tool:'SYNTHETIC tool',visible_action_result:'SYNTHETIC action/result fixture',simulated_ui:false,
  frame_hashes:[opening,core],frames:[{file:'SYNTHETIC/opening.png',sha256:opening,source_second:0},{file:'SYNTHETIC/core.png',sha256:core,source_second:10}]
 }],mapping:[{segment:'opening-0-3',file_sha256:video,source_in:0,source_out:3},{segment:'core-operation',file_sha256:video,source_in:10,source_out:15}]};
}
function media(script,{second=false,demo=false}={}){
 const digest=(second?'b':'a').repeat(64),render=second?'dddddddd-dddd-dddd-dddd-dddddddddddd':'cccccccc-cccc-cccc-cccc-cccccccccccc';
 return {revision:1,script_hash:script,mode_epoch:0,sha256:digest,size_bytes:12345,duration:54.9,
  quality_approved:false,publication_authorized:false,new_paid_calls:0,
  library_file_id:'libfile_'+(second?'d':'6').repeat(32),file_id:'file_'+(second?'e':'7').repeat(32),library_version:0,
  verified_at:AT,materialized_sha256:digest,project_id:PROJECT,timeline_id:TIMELINE,render_id:render,
  file_name:'SYNTHETIC-NOT-A-REAL-DELIVERABLE.mp4',source:'SYNTHETIC metadata only; no real render or inspection',
  ...(demo?{demonstration_check:demonstration()}:{}),
  qa:{semantic_listening_passed:false,recovery_receipt_sha256:'f'.repeat(64),
   final_duration:{schema:'actual-final-duration-v1',file_sha256:digest,probe_sha256:'3'.repeat(64),checked_at:AT,
    report:{hard_max_seconds:60,hard_duration_pass:true,maximum_measured_seconds:'54.9',measurements_seconds:{container_duration:'54.9',video_0_playback_end:'54.9',audio_0_playback_end:'54.9'},errors:[]}},
   preview_proof:{schema:'actual-native-preview-v1',source:'native-timeline-preview',project_id:PROJECT,timeline_id:TIMELINE,render_id:render,video_sha256:digest,receipt_sha256:'4'.repeat(64),checked_at:AT,
    frames:[{role:'opening',time_seconds:.5,image_sha256:'5'.repeat(64)},{role:'core',time_seconds:20,image_sha256:'6'.repeat(64)},{role:'ending',time_seconds:53,image_sha256:'8'.repeat(64)}]}}
 };
}
async function fixture(t,{category='视觉影像',demonstrationRequired}={}){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 let beforeBatch;class Statement{
  constructor(query,args=[]){this.query=query;this.args=args;}bind(...args){return new Statement(this.query,args);}
  async first(){return sql.prepare(this.query).get(...this.args)||null;}async all(){return {results:sql.prepare(this.query).all(...this.args)};}
  async run(){return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}
 }
 const db={prepare:q=>new Statement(q),beforeBatch:hook=>{beforeBatch=hook;},batch:async statements=>{
  if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook();}sql.exec('BEGIN');try{const results=statements.map(s=>({meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}}));sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}
 }};
 globalThis.__staticNativeScopeDb=db;t.after(()=>{sql.close();delete globalThis.__staticNativeScopeDb;});
 sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES('synthetic-static','https://example.org/SYNTHETIC-static','fixture','fixture','SYNTHETIC','SYNTHETIC','fixture','now',?,0,'m','h','a','m','r',0,'zh')").run(category);
 const content=JSON.stringify({script:'SYNTHETIC exact approved static-image narration',limits:'Still source images only; no actual tool session or dynamic demonstration is claimed.',
  narration_preflight:{machine_preflight:'blocked',problems:['SYNTHETIC static image/audio preparation pending'],material_status:'not-prepared'},
  storyboard:[{start:0,end:50,narration:'SYNTHETIC',visual:'SYNTHETIC static source picture, no simulated operation',asset_id:'SYNTHETIC-image'}],
  evidence:[{url:'https://example.org/SYNTHETIC-static.png',sha256:'8'.repeat(64),facts:['SYNTHETIC still image evidence']}]});
 const script=sha(content),contract='c'.repeat(64),source={category,url:'https://example.org/SYNTHETIC-static',...(demonstrationRequired===undefined?{}:{demonstration_required:demonstrationRequired})};
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at) VALUES(?,'synthetic-static',?,0,'approved',?,?,?,1,1,?,'node',0,0,1,2,'now','now')").run(JOB,OWNER,JSON.stringify(source),JSON.stringify({sha256:'f'.repeat(64),template:'SYNTHETIC frozen template'}),contract,script);
 sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,1,'SYNTHETIC-script',?,?,'SYNTHETIC','now')").run(JOB,content,script);
 for(const node of ['source','script'])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,1,?,?,'approved',0,'now','now')").run('SYNTHETIC-'+node,JOB,node,script,content);
 await p.confirmMediaScope(JOB,OWNER,{confirmed:true,binding:{revision:1,script_hash:script,mode_epoch:0,contract_hash:contract},scope:'private-video',current_id:'',request_id:'SYNTHETIC-scope'});
 // Realistic unresolved preparation receipts remain blocked. They are not video approval.
 sql.exec("UPDATE production_stages SET status='blocked'");
 return {sql,db,script,contract,source};
}
function invariantRows(before,after){
 assert.deepEqual(after.production_drafts,before.production_drafts);assert.deepEqual(after.app_state,before.app_state);assert.deepEqual(after.production_stages,before.production_stages);
 for(const key of ['revision','approved_revision','approved_hash','contract_hash','mode_epoch','attempt','reworks','ai_calls'])assert.equal(after.production_jobs[0][key],before.production_jobs[0][key]);
 for(const node of ['source','script'])assert.deepEqual(after.production_milestones.find(m=>m.node===node),before.production_milestones.find(m=>m.node===node));
}
async function rejectUnchanged(f,body,code=409){const before=snapshot(f.sql);await assert.rejects(()=>p.returnNativeDraft(JOB,body),status(code));assert.deepEqual(snapshot(f.sql),before);}
async function revisionBody(f){
 const packet=(await p.readNativeWorkPacket(JOB,OWNER)).packet,b=packet.binding;
 return {...media(f.script,{second:true}),request_id:'SYNTHETIC-static-revision',packet_hash:packet.packet_hash,contract_hash:f.contract,scope_id:b.scope_id,scope_hash:b.scope_hash,
  base_milestone_id:b.base_milestone_id,base_artifact_version:b.base_artifact_version,base_artifact_hash:b.base_artifact_hash,base_sha256:b.base_sha256,base_report_sha256:b.base_report_sha256,feedback_review_id:b.feedback_review_id,feedback_note_sha256:b.feedback_note_sha256};
}

for(const category of ['视觉影像','互动体验','AI实用'])test('SYNTHETIC '+category+' static draft returns without fabricated tool session while material preflight stays pending',async t=>{
 const f=await fixture(t,{category,demonstrationRequired:false}),job=await p.getJob(JOB),before=snapshot(f.sql);
 assert.equal(job.facts.material_required,true);assert.equal(job.facts.material_gate,'blocked');
 const packet=(await p.readNativeWorkPacket(JOB,OWNER)).packet;assert.equal(packet.receipts.demonstration_required,false);assert.equal(packet.status,'needs_native_handoff');assert.deepEqual(snapshot(f.sql),before);
 const returned=await p.returnNativeDraft(JOB,media(f.script)),milestone=returned.job.milestones.find(m=>m.id===returned.milestone_id),artifact=JSON.parse(milestone.artifact);
 assert.equal(milestone.status,'awaiting_human');assert.equal(returned.job.facts.video_approval,'not-recorded');assert.equal(returned.job.facts.material_gate,'blocked');
 assert.equal(Object.hasOwn(artifact,'demonstration_check'),false);assert.equal(artifact.qa.quality_approved,false);assert.equal(artifact.qa.publication_authorized,false);
 invariantRows(before,snapshot(f.sql));assert.equal(returned.job.operations.length,0);
 const saved=snapshot(f.sql);assert.equal((await p.returnNativeDraft(JOB,media(f.script))).replayed,true);assert.deepEqual(snapshot(f.sql),saved);
 await assert.rejects(()=>p.decideMilestone(JOB,milestone.id,1,milestone.artifact_hash,0,'approve',{},'SYNTHETIC-other-owner'),status(403));assert.deepEqual(snapshot(f.sql),saved);
 const approved=await p.decideMilestone(JOB,milestone.id,1,milestone.artifact_hash,0,'approve',{},OWNER);assert.equal(approved.facts.video_approval,'owner-node-approved');
 assert.equal(approved.facts.material_gate,'blocked');assert.equal(approved.facts.publication_authorization,false);
});

for(const source of [{category:'AI实用',demonstrationRequired:true},{category:'视觉影像',demonstrationRequired:true}])test('SYNTHETIC required demo '+JSON.stringify(source)+' still rejects missing/static/invalid proof without writes',async t=>{
 const f=await fixture(t,source),packet=(await p.readNativeWorkPacket(JOB,OWNER)).packet;assert.equal(packet.receipts.demonstration_required,true);
 await rejectUnchanged(f,media(f.script));await rejectUnchanged(f,{...media(f.script),demonstration_check:{schema:'actual-tool-demonstration-v1',files:[]}});
 const simulated=demonstration();simulated.files[0].simulated_ui=true;await rejectUnchanged(f,{...media(f.script),demonstration_check:simulated});
 const good=await p.returnNativeDraft(JOB,media(f.script,{demo:true})),m=good.job.milestones.find(m=>m.id===good.milestone_id);assert.equal(m.status,'awaiting_human');assert.deepEqual(JSON.parse(m.artifact).demonstration_check,demonstration());
});

for(const [name,mutate,code=409] of [
 ['script hash',b=>{b.script_hash='0'.repeat(64);}],['revision',b=>{b.revision=2;}],['epoch',b=>{b.mode_epoch=1;}],
 ['materialized bytes',b=>{b.materialized_sha256='0'.repeat(64);},400],['Library identity',b=>{b.library_file_id='SYNTHETIC-not-a-Library-file';},400],
 ['native identity',b=>{b.project_id='SYNTHETIC-local-render-is-not-a-native-project';},400],
 ['quality approval',b=>{b.quality_approved=true;},400],['publication',b=>{b.publication_authorized=true;},400],['new fee',b=>{b.new_paid_calls=1;},400],
 ['duration proof',b=>{delete b.qa.final_duration;},400],['exactly sixty',b=>{b.duration=60;},400]
])test('SYNTHETIC static source keeps first-return '+name+' guard',async t=>{const f=await fixture(t),body=media(f.script);mutate(body);await rejectUnchanged(f,body,code);});

for(const scopeState of ['preparation','withdrawn','unconfirmed'])test('SYNTHETIC static source cannot bypass '+scopeState+' owner scope',async t=>{
 const f=await fixture(t),key='media_scope_v1:'+JOB,s=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(key).value);
 if(scopeState==='withdrawn')s.scope=null;else if(scopeState==='unconfirmed')s.scope.owner_confirmed=false;else s.scope.scope='preparation';
 f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(s),key);await rejectUnchanged(f,media(f.script));
});

test('SYNTHETIC static first return cannot commit if source changes to a required-tool source before SQL CAS',async t=>{
 const f=await fixture(t);let raced;f.db.beforeBatch(()=>{f.sql.prepare('UPDATE production_jobs SET source_snapshot=? WHERE id=?').run(JSON.stringify({...f.source,demonstration_required:true}),JOB);raced=snapshot(f.sql);});
 await assert.rejects(()=>p.returnNativeDraft(JOB,media(f.script)),status(409));assert.deepEqual(snapshot(f.sql),raced);
});

test('SYNTHETIC approved static video may be owner-rejected and returned as v2 without pretending to have tool-session evidence',async t=>{
 const f=await fixture(t),first=await p.returnNativeDraft(JOB,media(f.script)),v1=first.job.milestones.find(m=>m.id===first.milestone_id);
 await p.decideMilestone(JOB,v1.id,1,v1.artifact_hash,0,'revise',{reason:'SYNTHETIC static composition correction'},OWNER);
 const body=await revisionBody(f),before=snapshot(f.sql),returned=await p.returnOwnerNativeVideoRevision(JOB,body),v2=returned.job.milestones.find(m=>m.id===returned.milestone_id);
 assert.equal(returned.artifact_version,2);assert.equal(v2.status,'awaiting_human');assert.equal(returned.job.facts.video_approval,'not-recorded');
 assert.equal(Object.hasOwn(JSON.parse(v2.artifact),'demonstration_check'),false);invariantRows(before,snapshot(f.sql));
 assert.deepEqual(clone(f.sql.prepare('SELECT * FROM production_milestones WHERE id=?').get(v1.id)),before.production_milestones.find(m=>m.id===v1.id));
 const saved=snapshot(f.sql);assert.equal((await p.returnOwnerNativeVideoRevision(JOB,clone(body))).replayed,true);assert.deepEqual(snapshot(f.sql),saved);
 const approved=await p.decideMilestone(JOB,v2.id,1,v2.artifact_hash,0,'approve',{},OWNER);assert.equal(approved.facts.video_approval,'owner-node-approved');
});

test('SYNTHETIC explicitly required source keeps the demo gate for owner video revisions',async t=>{
 const f=await fixture(t,{category:'互动体验',demonstrationRequired:true}),first=await p.returnNativeDraft(JOB,media(f.script,{demo:true})),v1=first.job.milestones.find(m=>m.id===first.milestone_id);
 await p.decideMilestone(JOB,v1.id,1,v1.artifact_hash,0,'revise',{reason:'SYNTHETIC owner requests exact revision'},OWNER);
 const body=await revisionBody(f),before=snapshot(f.sql);await assert.rejects(()=>p.returnOwnerNativeVideoRevision(JOB,body),status(409));assert.deepEqual(snapshot(f.sql),before);
 const returned=await p.returnOwnerNativeVideoRevision(JOB,{...body,demonstration_check:demonstration()});assert.equal(returned.artifact_version,2);
});
