// SYNTHETIC isolated SQLite + intercepted identity. No real owner, media or HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
const JOB='job_44444444-4444-4444-4444-444444444444',OWNER='SYNTHETIC-oral-owner',AT='2026-10-17T00:00:00Z';
const PROJECT='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',TIMELINE='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const sha=v=>createHash('sha256').update(v).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
const built=await build({stdin:{contents:[
 "export {getJob} from './lib/production';",
 "export {registerNativePromoVideo} from './lib/promo-delivery';",
 "export {readNativeWorkPacket} from './lib/native-work-packet';",
 "export {confirmMediaScope} from './lib/media-continuation';",
 "export {recordNativeCandidateFeedback} from './lib/native-candidate-feedback';",
 "export {recordNativeCandidateVoiceProvenance} from './lib/native-candidate-voice';",
 "export {effectiveCandidateVoiceKind,currentCandidateVoiceProvenance,CANDIDATE_VOICE_SCHEMA} from './lib/native-candidate-voice-contract.mts';",
 "export {currentCandidateOwnerReview} from './lib/native-candidate-feedback-contract.mts';",
 "export * as route from './app/api/executor/route';"
].join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-candidate-feedback',setup(b){
 b.onResolve({filter:/^(?:\.\/store|@\/lib\/store)$/},()=>({path:'db',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__candidateFeedbackDb} export function siteArchiveBucket(){throw new Error("SYNTHETIC candidate-feedback tests cannot access storage")}'}));
 b.onResolve({filter:/^@\/lib\/api$/},()=>({path:'api',namespace:'identity'}));
 b.onLoad({filter:/.*/,namespace:'identity'},()=>({contents:"export async function identity(req){return req.headers.get('x-synthetic-owner')||null}export const json=(body,status=200)=>Response.json(body,{status});"}));
}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
const tables=['production_jobs','production_drafts','production_reviews','production_milestones','production_operations','production_stages','app_state','production_data_videos'];
const snapshot=sql=>clone(Object.fromEntries(tables.map(table=>[table,sql.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()])));
const code=n=>error=>{assert.equal(error.status,n,error.message);return true;};
async function fixture(t){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 let hook,voiceHook;class S{constructor(query,args=[]){this.query=query;this.args=args;}bind(...args){return new S(this.query,args);}async first(){return sql.prepare(this.query).get(...this.args)||null;}async all(){return{results:sql.prepare(this.query).all(...this.args)};}async run(){if(hook&&this.query.includes("'reported-owner-candidate'")){const f=hook;hook=null;await f();}if(voiceHook&&this.query.includes('INSERT INTO production_reviews')&&this.args.includes('native_candidate_voice_provenance')){const f=voiceHook;voiceHook=null;await f();}return{meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}}
 const db={prepare:q=>new S(q),beforeFeedbackInsert:f=>{hook=f;},beforeVoiceInsert:f=>{voiceHook=f;},batch:async ss=>{sql.exec('BEGIN');try{const rows=ss.map(s=>({meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}}));sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 globalThis.__candidateFeedbackDb=db;t.after(()=>{sql.close();delete globalThis.__candidateFeedbackDb;});
 sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES('synthetic-feedback','https://example.org/SYNTHETIC','fixture','fixture','SYNTHETIC','SYNTHETIC','fixture','now','视觉影像',0,'m','h','a','m','r',0,'zh')");
 const content=JSON.stringify({script:'SYNTHETIC exact approved narration',evidence:[],storyboard:[]}),script=sha(content),contract='c'.repeat(64);
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at) VALUES(?,'synthetic-feedback',?,0,'approved',?,?,?,1,1,?,'node',0,0,1,2,'now','now')").run(JOB,OWNER,JSON.stringify({category:'视觉影像',url:'https://example.org/SYNTHETIC'}),JSON.stringify({sha256:'f'.repeat(64)}),contract,script);
 sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,1,'SYNTHETIC-script',?,?,'SYNTHETIC','now')").run(JOB,content,script);
 for(const node of ['source','script'])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,1,?,?,'approved',0,'now','now')").run('SYNTHETIC-'+node,JOB,node,script,content);
 await p.confirmMediaScope(JOB,OWNER,{confirmed:true,binding:{revision:1,script_hash:script,mode_epoch:0,contract_hash:contract},scope:'private-video',current_id:'',request_id:'SYNTHETIC-scope'});sql.exec("UPDATE production_stages SET status='blocked'");
 const candidate={revision:1,script_hash:script,sha256:'a'.repeat(64),file_name:'SYNTHETIC ordinary temporary voice candidate.mp4',size_bytes:12345,duration:54.9,project_id:PROJECT,timeline_id:TIMELINE,source:'SYNTHETIC actual-file metadata fixture; no real export',quality_approved:false,publication:false},registered=await p.registerNativePromoVideo(JOB,candidate);
 const body={action:'native_candidate_feedback',id:JOB,client_receipt_id:'SYNTHETIC-client-1',explicit_user_direction:true,binding:{revision:1,script_hash:script,mode_epoch:0,contract_hash:contract,candidate_id:registered.id,candidate_sha256:candidate.sha256,project_id:PROJECT,timeline_id:TIMELINE},decision:'approved',quote:'SYNTHETIC 用户确认这一版普通配音候选通过。',reported_at:AT,source_thread_id:null,expected_review_id:''};
 return{sql,db,script,contract,candidate,body,candidateId:registered.id};
}
async function rejectUnchanged(f,body,status=409,context={owner_id:OWNER}){const before=snapshot(f.sql);await assert.rejects(()=>p.recordNativeCandidateFeedback(JOB,body,context),code(status));assert.deepEqual(snapshot(f.sql),before);}
const record=(f,body=f.body,context={owner_id:OWNER})=>p.recordNativeCandidateFeedback(JOB,body,context);
async function packet(f){const before=snapshot(f.sql),value=(await p.readNativeWorkPacket(JOB,OWNER)).packet;assert.deepEqual(snapshot(f.sql),before);return value;}
function noSideEffects(before,after){for(const table of tables.filter(t=>t!=='production_reviews'))assert.deepEqual(after[table],before[table],table+' must remain unchanged');for(const row of before.production_reviews)assert.deepEqual(after.production_reviews.find(r=>r.id===row.id),row);}
for(const decision of ['approved','rework-requested'])test('SYNTHETIC '+decision+' records an ordinary-voice owner report without approving a milestone, archiving or spending',async t=>{
 const f=await fixture(t),before=snapshot(f.sql),oldPacket=await packet(f);assert.equal(Object.hasOwn(oldPacket.candidate,'owner_review'),false);
 const result=await record(f,{...f.body,decision}),review=result.job.facts.candidate_owner_review;
 assert.equal(result.replayed,false);assert.equal(review.id,result.review_id);assert.equal(review.decision,decision);assert.deepEqual(review.binding,f.body.binding);assert.equal(review.source,'owner-oral-report');assert.equal(review.source_thread_id,null);assert.equal(review.reviewed_voice_kind,'ordinary-temporary');
 for(const key of ['website_button_clicked','formal_milestone_approved','quality_approved','publication_authorized'])assert.equal(review[key],false);assert.equal(review.new_paid_calls,0);
 assert.equal(result.job.facts.video_approval,'not-recorded');assert.equal(result.job.facts.files_archived,false);assert.equal(result.job.facts.publication_authorization,false);assert.equal(result.job.milestones.filter(m=>m.node==='video').length,0);
 noSideEffects(before,snapshot(f.sql));const next=await packet(f);assert.equal(next.status,'awaiting_candidate_review');assert.deepEqual(next.candidate.owner_review,review);assert.equal(next.candidate.archive_status,'archive_pending');assert.notEqual(next.packet_hash,oldPacket.packet_hash);
 assert.equal(f.sql.prepare('SELECT reviewer FROM production_reviews WHERE id=?').get(result.review_id).reviewer,'reported-owner-candidate');
});
test('SYNTHETIC exact client receipt replay remains read-only and different content cannot reuse its ID',async t=>{
 const f=await fixture(t),first=await record(f),before=snapshot(f.sql);assert.equal((await record(f,clone(f.body))).replayed,true);assert.deepEqual(snapshot(f.sql),before);
 await rejectUnchanged(f,{...f.body,quote:'SYNTHETIC different words'});await rejectUnchanged(f,{...f.body,decision:'rework-requested'});
 assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='reported_owner_candidate_feedback'").get().n,1);assert.equal(first.review_id,(await record(f)).review_id);
});
test('SYNTHETIC a later explicit report appends a new sequence without overwriting earlier approval',async t=>{
 const f=await fixture(t),first=await record(f),old=clone(f.sql.prepare('SELECT * FROM production_reviews WHERE id=?').get(first.review_id));
 const second=await record(f,{...f.body,client_receipt_id:'SYNTHETIC-client-2',expected_review_id:first.review_id,decision:'rework-requested',quote:'SYNTHETIC 开头需要先解释这个功能。'});
 assert.equal(second.job.facts.candidate_owner_review.sequence,2);assert.equal(second.job.facts.candidate_owner_review.decision,'rework-requested');assert.deepEqual(clone(f.sql.prepare('SELECT * FROM production_reviews WHERE id=?').get(first.review_id)),old);
 const before=snapshot(f.sql),replayed=await record(f);assert.equal(replayed.replayed,true);assert.equal(replayed.job.facts.candidate_owner_review.id,second.review_id);assert.deepEqual(snapshot(f.sql),before);
 await rejectUnchanged(f,{...f.body,client_receipt_id:'SYNTHETIC-stale-opinion'});
});

test('SYNTHETIC versioned review requires the same version and voice kind; the legacy writer refuses versioned candidates',async t=>{
 const f=await fixture(t),first=await record(f),j=first.job,candidateRow=j.reviews.find(r=>r.id===f.candidateId),reviewRow=j.reviews.find(r=>r.id===first.review_id),version='apv_'+'e'.repeat(64),baseCandidate=JSON.parse(candidateRow.note),baseReview=JSON.parse(reviewRow.note);
 for(const kind of ['ordinary-temporary','owner-cloned']){
  const candidate={id:f.candidateId,value:{...baseCandidate,approved_native_version_id:version,voice_kind:kind}},review={...baseReview,approved_native_version_id:version,reviewed_voice_kind:kind},job={...j,reviews:[...j.reviews.filter(r=>r.id!==first.review_id),{...reviewRow,note:JSON.stringify(review)}]};
  assert.equal(p.currentCandidateOwnerReview(job,candidate).reviewed_voice_kind,kind);
  for(const changed of [{...review,approved_native_version_id:'apv_'+'f'.repeat(64)},{...review,reviewed_voice_kind:kind==='owner-cloned'?'ordinary-temporary':'owner-cloned'},{...review,approved_native_version_id:undefined}])assert.equal(p.currentCandidateOwnerReview({...job,reviews:[{...reviewRow,note:JSON.stringify(changed)}]},candidate),null);
  f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(candidate.value),f.candidateId);
  await rejectUnchanged(f,{...f.body,client_receipt_id:'SYNTHETIC-legacy-'+kind,expected_review_id:first.review_id});
 }
});
for(const key of ['revision','script_hash','mode_epoch','contract_hash','candidate_id','candidate_sha256','project_id','timeline_id'])test('SYNTHETIC stale '+key+' feedback binding is rejected without writes',async t=>{
 const f=await fixture(t),body=clone(f.body);body.binding[key]=typeof body.binding[key]==='number'?body.binding[key]+1:key==='project_id'||key==='timeline_id'?'dddddddd-dddd-dddd-dddd-dddddddddddd':key==='candidate_id'?'native_video_'+'0'.repeat(64):'0'.repeat(64);await rejectUnchanged(f,body);
});
for(const [key,value]of [['quality_approved',true],['publication_authorized',true],['website_button_clicked',true],['reviewed_voice_kind','owner-clone'],['source','owner-node-approved'],['trusted_owner_service',true]])test('SYNTHETIC extra '+key+' cannot expand a reported candidate review',async t=>{const f=await fixture(t);await rejectUnchanged(f,{...f.body,[key]:value},400);});
for(const [name,change]of [
 ['mode',f=>f.sql.prepare('UPDATE production_jobs SET mode_epoch=1 WHERE id=?').run(JOB)],
 ['contract',f=>f.sql.prepare('UPDATE production_jobs SET contract_hash=? WHERE id=?').run('d'.repeat(64),JOB)],
 ['script',f=>f.sql.prepare('UPDATE production_jobs SET approved_hash=? WHERE id=?').run('d'.repeat(64),JOB)],
 ['revision',f=>f.sql.prepare('UPDATE production_jobs SET revision=2 WHERE id=?').run(JOB)]
])test('SYNTHETIC saved review never transfers across a later '+name+' change and its receipt still safely replays',async t=>{
 const f=await fixture(t),first=await record(f);change(f);const j=await p.getJob(JOB);assert.equal(Object.hasOwn(j.facts,'candidate_owner_review'),false);const next=await packet(f);if(next.candidate)assert.equal(Object.hasOwn(next.candidate,'owner_review'),false);
 const before=snapshot(f.sql),replay=await record(f);assert.equal(replay.replayed,true);assert.equal(replay.review_id,first.review_id);assert.equal(Object.hasOwn(replay.job.facts,'candidate_owner_review'),false);assert.deepEqual(snapshot(f.sql),before);
 await rejectUnchanged(f,{...f.body,client_receipt_id:'SYNTHETIC-new-stale-request'});
});
test('SYNTHETIC a new candidate has no inherited review while the old exact-SHA receipt remains immutable',async t=>{
 const f=await fixture(t),first=await record(f);f.sql.prepare('UPDATE production_reviews SET created_at=? WHERE id=?').run('2026-10-16T00:00:00Z',f.candidateId);
 const second=await p.registerNativePromoVideo(JOB,{...f.candidate,sha256:'b'.repeat(64),project_id:'dddddddd-dddd-dddd-dddd-dddddddddddd'}),j=await p.getJob(JOB);assert.equal(j.facts.candidate_record_id,second.id);assert.equal(Object.hasOwn(j.facts,'candidate_owner_review'),false);assert.equal(Object.hasOwn((await packet(f)).candidate,'owner_review'),false);
 await rejectUnchanged(f,{...f.body,client_receipt_id:'SYNTHETIC-old-candidate-reuse'});const before=snapshot(f.sql);assert.equal((await record(f)).review_id,first.review_id);assert.deepEqual(snapshot(f.sql),before);
});
test('SYNTHETIC direct writes require owner or a server-provided trusted owner-service context',async t=>{
 const f=await fixture(t);await rejectUnchanged(f,f.body,403,null);await rejectUnchanged(f,f.body,403,{owner_id:'SYNTHETIC-other'});await rejectUnchanged(f,f.body,403,{trusted_owner_service:false});
 assert.equal((await record(f,f.body,{trusted_owner_service:true})).job.facts.candidate_owner_review.source,'owner-oral-report');
});
test('SYNTHETIC executor route checks origin identity and cross-owner access, but retains its existing trusted service boundary',async t=>{
 const f=await fixture(t),req=(headers={})=>new Request('https://synthetic.test/api/executor',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(f.body)}),before=snapshot(f.sql);
 assert.equal((await p.route.POST(req({Origin:'https://synthetic.test'}))).status,403);
 assert.equal((await p.route.POST(req({Origin:'https://synthetic.test','x-synthetic-owner':'SYNTHETIC-other'}))).status,403);assert.deepEqual(snapshot(f.sql),before);
 assert.equal((await p.route.POST(req({'sec-fetch-site':'cross-site'}))).status,403);assert.deepEqual(snapshot(f.sql),before);
 const owner=await p.route.POST(req({Origin:'https://synthetic.test','x-synthetic-owner':OWNER}));assert.equal(owner.status,200);const result=await owner.json();assert.equal(result.job.facts.candidate_owner_review.website_button_clicked,false);
 const saved=snapshot(f.sql),service=await p.route.POST(req());assert.equal(service.status,200);assert.equal((await service.json()).replayed,true);assert.deepEqual(snapshot(f.sql),saved);
});
for(const id of ['job_9ef39025-d92e-4770-82d0-05881451c5df','job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee'])test('SYNTHETIC protected job '+id+' refuses ordinary candidate feedback before any lookup or write',async t=>{
 const f=await fixture(t),before=snapshot(f.sql);await assert.rejects(()=>p.recordNativeCandidateFeedback(id,{...f.body,id},{trusted_owner_service:true}),code(403));assert.deepEqual(snapshot(f.sql),before);
});
for(const [name,change]of [
 ['mode',f=>f.sql.prepare('UPDATE production_jobs SET mode_epoch=1 WHERE id=?').run(JOB)],
 ['contract',f=>f.sql.prepare('UPDATE production_jobs SET contract_hash=? WHERE id=?').run('d'.repeat(64),JOB)],
 ['owner',f=>f.sql.prepare('UPDATE production_jobs SET owner_id=? WHERE id=?').run('SYNTHETIC-other',JOB)],
 ['candidate metadata',f=>{const r=f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(f.candidateId),v=JSON.parse(r.note);v.timeline_id='dddddddd-dddd-dddd-dddd-dddddddddddd';f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(v),f.candidateId);}],
 ['formal video node',f=>f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES('SYNTHETIC-racing-video',?,'video',1,1,?,'{}','awaiting_human',0,'now','now')").run(JOB,'d'.repeat(64))]
])test('SYNTHETIC atomic receipt guard rejects a concurrent '+name+' change without partial feedback',async t=>{
 const f=await fixture(t);let raced;f.db.beforeFeedbackInsert(()=>{change(f);raced=snapshot(f.sql);});await assert.rejects(()=>record(f),code(409));assert.deepEqual(snapshot(f.sql),raced);
});
test('SYNTHETIC a concurrently registered newer candidate is preserved and refuses stale feedback',async t=>{
 const f=await fixture(t);let raced;f.db.beforeFeedbackInsert(async()=>{await p.registerNativePromoVideo(JOB,{...f.candidate,sha256:'b'.repeat(64)});raced=snapshot(f.sql);});await assert.rejects(()=>record(f),code(409));assert.deepEqual(snapshot(f.sql),raced);
});
test('SYNTHETIC concurrent identical receipts record exactly once and differing reports cannot overwrite the winner',async t=>{
 const f=await fixture(t),same=await Promise.all([record(f),record(f,clone(f.body))]);assert.equal(same.filter(r=>!r.replayed).length,1);assert.equal(same[0].review_id,same[1].review_id);
 const id=same[0].review_id,b={...f.body,client_receipt_id:'SYNTHETIC-followup-1',expected_review_id:id},c={...b,client_receipt_id:'SYNTHETIC-followup-2',decision:'rework-requested',quote:'SYNTHETIC different current report'},results=await Promise.allSettled([record(f,b),record(f,c)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='reported_owner_candidate_feedback'").get().n,2);
});

async function ownerVoiceInput(f){
 const audioId='audio_intake_'+sha('SYNTHETIC existing owner audio'),audioSha='8'.repeat(64),j=await p.getJob(JOB);
 const input={script_revision:1,script_hash:f.script,mode_epoch:0,file_name:'SYNTHETIC owner audio.mp3',sha256:audioSha,size_bytes:32123,duration_ms:50912,authorization_reference:'SYNTHETIC intentionally ambiguous text; never parsed to infer voice kind'};
 f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES(?,?,1,?,'audio_intake',?,?,'2026-10-17T00:01:00Z')").run(audioId,JOB,f.script,JSON.stringify({input,storage:'browser-local-only',uploaded:false,transcript_verified:false,listened:false}),OWNER);
 return {action:'native_candidate_voice_provenance',id:JOB,client_receipt_id:'SYNTHETIC-owner-voice-1',binding:f.body.binding,voice_kind:'owner-cloned',scope_id:j.media_continuation.current_id,audio_intake_id:audioId,audio_sha256:audioSha,source:'existing-owner-voice-metadata',quality_approved:false,publication_authorized:false,new_paid_calls:0};
}
const voice=(f,b,context={owner_id:OWNER})=>p.recordNativeCandidateVoiceProvenance(JOB,b,context);
async function rejectVoiceUnchanged(f,b,status=409,context={owner_id:OWNER}){const before=snapshot(f.sql);await assert.rejects(()=>voice(f,b,context),code(status));assert.deepEqual(snapshot(f.sql),before);}
test('SYNTHETIC explicit owner voice provenance appends metadata without rewriting candidate, audio, approvals or counters',async t=>{
 const f=await fixture(t),b=await ownerVoiceInput(f),before=snapshot(f.sql),result=await voice(f,b),after=snapshot(f.sql),j=result.job,c={id:f.candidateId,value:JSON.parse(f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(f.candidateId).note)};
 assert.equal(result.replayed,false);assert.equal(result.provenance.schema,p.CANDIDATE_VOICE_SCHEMA);assert.equal(result.provenance.voice_kind,'owner-cloned');assert.equal(result.provenance.audio_sha256,b.audio_sha256);assert.equal(p.effectiveCandidateVoiceKind(j,c),'owner-cloned');
 assert.deepEqual(after.production_reviews.filter(r=>r.id!==result.provenance_id),before.production_reviews);for(const table of tables.filter(t=>t!=='production_reviews'))assert.deepEqual(after[table],before[table]);assert.equal(j.facts.video_approval,'not-recorded');assert.equal(Object.hasOwn(j.facts,'candidate_owner_review'),false);assert.equal(c.value.voice_kind,undefined);
 const saved=JSON.parse(f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(result.provenance_id).note);assert.equal(saved.technical_metadata_only,true);assert.equal(saved.quality_approved,false);assert.equal(saved.formal_milestone_approved,false);assert.equal(saved.publication_authorized,false);assert.equal(saved.actor_kind,'owner');
 const stable=snapshot(f.sql);assert.equal((await voice(f,clone(b))).replayed,true);assert.deepEqual(snapshot(f.sql),stable);await rejectVoiceUnchanged(f,{...b,client_receipt_id:'SYNTHETIC-second-provenance'});await rejectVoiceUnchanged(f,{...b,audio_sha256:'9'.repeat(64)});
});
for(const decision of ['approved','rework-requested'])test('SYNTHETIC non-versioned owner-cloned feedback binds exact technical provenance: '+decision,async t=>{
 const f=await fixture(t),b=await ownerVoiceInput(f),provenance=await voice(f,b),review=await record(f,{...f.body,decision,quote:'SYNTHETIC actual human words only'});
 assert.equal(review.job.facts.candidate_owner_review.reviewed_voice_kind,'owner-cloned');assert.equal(review.job.facts.candidate_owner_review.voice_provenance_id,provenance.provenance_id);assert.equal(review.job.facts.candidate_owner_review.decision,decision);assert.equal(review.job.facts.video_approval,'not-recorded');
 assert.equal(review.job.facts.candidate_owner_review.quality_approved,false);assert.equal(review.job.facts.candidate_owner_review.formal_milestone_approved,false);assert.equal(review.job.facts.candidate_owner_review.website_button_clicked,false);
 const row=review.job.reviews.find(r=>r.id===review.review_id),value=JSON.parse(row.note),candidate={id:f.candidateId,value:JSON.parse(review.job.reviews.find(r=>r.id===f.candidateId).note)};
 for(const changed of [{...value,voice_provenance_id:undefined},{...value,voice_provenance_id:'candidate_voice_'+'0'.repeat(64)},{...value,reviewed_voice_kind:'ordinary-temporary'}])assert.equal(p.currentCandidateOwnerReview({...review.job,reviews:review.job.reviews.map(r=>r.id===row.id?{...r,note:JSON.stringify(changed)}:r)},candidate),null);
});
test('SYNTHETIC audio authorization prose alone never relabels a candidate, and typed candidate owner voice requires provenance',async t=>{
 const f=await fixture(t);await ownerVoiceInput(f);let j=await p.getJob(JOB),candidate={id:f.candidateId,value:JSON.parse(j.reviews.find(r=>r.id===f.candidateId).note)};assert.equal(p.effectiveCandidateVoiceKind(j,candidate),'ordinary-temporary');
 candidate.value.voice_kind='owner-cloned';f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(candidate.value),f.candidateId);j=await p.getJob(JOB);assert.equal(p.effectiveCandidateVoiceKind(j,candidate),null);await rejectUnchanged(f,f.body);
});
for(const key of ['revision','script_hash','mode_epoch','contract_hash','candidate_id','candidate_sha256','project_id','timeline_id'])test('SYNTHETIC owner-voice metadata refuses stale '+key+' binding',async t=>{
 const f=await fixture(t),b=await ownerVoiceInput(f);b.binding=clone(b.binding);b.binding[key]=typeof b.binding[key]==='number'?b.binding[key]+1:key==='project_id'||key==='timeline_id'?'dddddddd-dddd-dddd-dddd-dddddddddddd':key==='candidate_id'?'native_video_'+'0'.repeat(64):'0'.repeat(64);await rejectVoiceUnchanged(f,b);
});
for(const [key,value]of [['scope_id','media_scope_'+'0'.repeat(64)],['audio_intake_id','audio_intake_'+'0'.repeat(64)],['audio_sha256','0'.repeat(64)]])test('SYNTHETIC owner-voice metadata refuses wrong '+key,async t=>{const f=await fixture(t),b=await ownerVoiceInput(f);await rejectVoiceUnchanged(f,{...b,[key]:value});});
for(const [key,value]of [['voice_kind','ordinary-temporary'],['quality_approved',true],['publication_authorized',true],['new_paid_calls',1],['trusted_owner_service',true],['formal_milestone_approved',true],['source','free text inferred clone']])test('SYNTHETIC owner-voice metadata rejects expanded '+key,async t=>{const f=await fixture(t),b=await ownerVoiceInput(f);await rejectVoiceUnchanged(f,{...b,[key]:value},400);});
test('SYNTHETIC owner-voice metadata requires server owner identity or existing trusted service and preserves excluded-job guards',async t=>{
 const f=await fixture(t),b=await ownerVoiceInput(f);for(const context of [null,{owner_id:'SYNTHETIC-other'},{trusted_owner_service:false}])await rejectVoiceUnchanged(f,b,403,context);
 for(const id of ['job_9ef39025-d92e-4770-82d0-05881451c5df','job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee']){const before=snapshot(f.sql);await assert.rejects(()=>p.recordNativeCandidateVoiceProvenance(id,{...b,id},{trusted_owner_service:true}),code(403));assert.deepEqual(snapshot(f.sql),before);}
 const r=await voice(f,b,{trusted_owner_service:true});assert.equal(JSON.parse(f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(r.provenance_id).note).actor_kind,'trusted-owner-service');
});
for(const [name,change]of [
 ['scope',f=>{const row=f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('media_scope_v1:'+JOB),s=JSON.parse(row.value);s.id='media_scope_'+'0'.repeat(64);f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(s),'media_scope_v1:'+JOB);}],
 ['audio',f=>{const row=f.sql.prepare("SELECT id,note FROM production_reviews WHERE decision='audio_intake'").get(),v=JSON.parse(row.note);v.input.sha256='9'.repeat(64);f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(v),row.id);}],
 ['owner',f=>f.sql.prepare('UPDATE production_jobs SET owner_id=? WHERE id=?').run('SYNTHETIC-other',JOB)],
 ['mode',f=>f.sql.prepare('UPDATE production_jobs SET mode_epoch=1 WHERE id=?').run(JOB)],
 ['contract',f=>f.sql.prepare('UPDATE production_jobs SET contract_hash=? WHERE id=?').run('d'.repeat(64),JOB)],
 ['candidate',f=>{const row=f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(f.candidateId),v=JSON.parse(row.note);v.timeline_id='dddddddd-dddd-dddd-dddd-dddddddddddd';f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(v),f.candidateId);}]
])test('SYNTHETIC owner-voice append CAS rejects concurrent '+name+' without partial metadata',async t=>{
 const f=await fixture(t),b=await ownerVoiceInput(f);let raced;f.db.beforeVoiceInsert(()=>{change(f);raced=snapshot(f.sql);});await assert.rejects(()=>voice(f,b),code(409));assert.deepEqual(snapshot(f.sql),raced);
});
for(const [name,change]of [
 ['scope',f=>{const row=f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('media_scope_v1:'+JOB),s=JSON.parse(row.value);s.id='media_scope_'+'0'.repeat(64);f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(s),'media_scope_v1:'+JOB);}],
 ['audio',f=>{const row=f.sql.prepare("SELECT id,note FROM production_reviews WHERE decision='audio_intake'").get(),v=JSON.parse(row.note);v.input.sha256='9'.repeat(64);f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(v),row.id);}],
 ['typed provenance',f=>{const row=f.sql.prepare("SELECT id,note FROM production_reviews WHERE decision='native_candidate_voice_provenance'").get(),v=JSON.parse(row.note);v.audio_sha256='9'.repeat(64);f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(v),row.id);}]
])test('SYNTHETIC owner-cloned feedback CAS rejects concurrent '+name+' and never falls back to ordinary voice',async t=>{
 const f=await fixture(t),b=await ownerVoiceInput(f);await voice(f,b);let raced;f.db.beforeFeedbackInsert(()=>{change(f);raced=snapshot(f.sql);});await assert.rejects(()=>record(f),code(409));assert.deepEqual(snapshot(f.sql),raced);
 const j=await p.getJob(JOB),c={id:f.candidateId,value:JSON.parse(j.reviews.find(r=>r.id===f.candidateId).note)};assert.equal(p.effectiveCandidateVoiceKind(j,c),null);assert.equal(p.currentCandidateVoiceProvenance(j,c),null);await rejectUnchanged(f,f.body);
});
test('SYNTHETIC owner-voice append concurrency records exactly once and conflicting request cannot replace it',async t=>{
 const f=await fixture(t),b=await ownerVoiceInput(f),results=await Promise.all([voice(f,b),voice(f,clone(b))]);assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal(results[0].provenance_id,results[1].provenance_id);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='native_candidate_voice_provenance'").get().n,1);
});
test('SYNTHETIC voice metadata executor action retains origin/owner checks and cannot create an approval',async t=>{
 const f=await fixture(t),b=await ownerVoiceInput(f),req=(headers={})=>new Request('https://synthetic.test/api/executor',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(b)}),before=snapshot(f.sql);
 for(const headers of [{Origin:'https://synthetic.test'},{Origin:'https://synthetic.test','x-synthetic-owner':'SYNTHETIC-other'},{'sec-fetch-site':'cross-site'}]){assert.equal((await p.route.POST(req(headers))).status,403);assert.deepEqual(snapshot(f.sql),before);}
 const response=await p.route.POST(req({Origin:'https://synthetic.test','x-synthetic-owner':OWNER}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.provenance.voice_kind,'owner-cloned');assert.equal(result.job.facts.video_approval,'not-recorded');assert.equal(Object.hasOwn(result.job.facts,'candidate_owner_review'),false);assert.deepEqual(snapshot(f.sql).production_milestones,before.production_milestones);
 const saved=snapshot(f.sql),replay=await p.route.POST(req());assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);assert.deepEqual(snapshot(f.sql),saved);
});
