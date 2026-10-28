// SYNTHETIC first-candidate regression. Isolated migrated SQLite + in-memory R2 only. The real job identity is a constant-under-test; no live API, real owner, real audio/video or production approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const ID='job_c3adf563-321c-4bac-b807-b1e749681c82',OWNER='SYNTHETIC-site-owner',AT='2026-10-17T00:00:00.000Z',PROJECT='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',TIMELINE='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',PART=524288;
const hash=b=>createHash('sha256').update(b).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
const built=await build({stdin:{contents:["export * from './lib/site-file-archive';","export {getJob} from './lib/production';","export {confirmMediaScope} from './lib/media-continuation';","export {registerNativePromoVideo} from './lib/promo-delivery';","export {recordNativeCandidateVoiceProvenance} from './lib/native-candidate-voice';","export {recordNativeCandidateFeedback} from './lib/native-candidate-feedback';","export {readNativeWorkPacket} from './lib/native-work-packet';","export {returnNativeDraft} from './lib/native-draft-handoff';","export {decideMilestone} from './lib/milestones';","export * as route from './app/api/executor/route';"].join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'SYNTHETIC-site-r2',setup(b){b.onResolve({filter:/^(?:\.\/store|@\/lib\/store)$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/^db$/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__siteArchiveDB} export function siteArchiveBucket(){return globalThis.__siteArchiveR2}'}));b.onResolve({filter:/^@\/lib\/api$/},()=>({path:'identity',namespace:'fixture'}));b.onLoad({filter:/identity/,namespace:'fixture'},()=>({contents:"export async function identity(req){return req.headers.get('x-synthetic-owner')||null}export const json=(body,status=200)=>Response.json(body,{status});"}));}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
class R2{
 map=new Map();puts=0;hook=null;
 async get(key){const x=this.map.get(key);if(!x)return null;const bytes=Buffer.from(x.bytes);return{customMetadata:x.customMetadata,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>bytes.toString('utf8')};}
 async put(key,value,options={}){this.puts++;if(this.hook){const h=this.hook;this.hook=null;await h(key);}if(options.onlyIf?.get('If-None-Match')==='*'&&this.map.has(key))return null;const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(value);this.map.set(key,{bytes:Buffer.from(bytes),customMetadata:options.customMetadata||{}});return{key,size:bytes.length};}
}
const tables=['production_jobs','production_drafts','production_reviews','production_milestones','production_operations','production_stages','app_state'];
const snapshot=sql=>clone(Object.fromEntries(tables.map(t=>[t,sql.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()])));
const status=n=>e=>{assert.equal(e.status,n,e.message);return true};
async function fixture(t,target={}){
 const jobId=target.id||ID,revision=target.revision||3;
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 let hook;class S{constructor(q,args=[]){this.q=q;this.args=args;}bind(...args){return new S(this.q,args);}async first(){return sql.prepare(this.q).get(...this.args)||null;}async all(){return{results:sql.prepare(this.q).all(...this.args)};}async run(){if(hook){const h=hook;hook=null;await h(this.q);}return{meta:{changes:Number(sql.prepare(this.q).run(...this.args).changes)}};}}
 const db={prepare:q=>new S(q),beforeMutation:f=>hook=f,beforeBatch:null,batch:async ss=>{if(db.beforeBatch){const h=db.beforeBatch;db.beforeBatch=null;await h(ss);}sql.exec('BEGIN');try{const results=ss.map(s=>({meta:{changes:Number(sql.prepare(s.q).run(...s.args).changes)}}));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const r2=new R2();globalThis.__siteArchiveDB=db;globalThis.__siteArchiveR2=r2;t.after(()=>{sql.close();delete globalThis.__siteArchiveDB;delete globalThis.__siteArchiveR2;});
 sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES('site-synthetic','https://example.org/SYNTHETIC-site','fixture','fixture','SYNTHETIC','SYNTHETIC','fixture','now','视觉影像',0,'m','h','a','m','r',0,'zh')");
 const content=JSON.stringify({script:'SYNTHETIC approved exact script',evidence:[],storyboard:[]}),script=target.script||'d9d74b6682cc75f06575925b1b946038fb72ac37dd21225f61b55ba2c023de4a',contract=target.contract||'65e245fe5e4d5babb9e881ad45b286f22255a5ed6a49c501f998ec1bf740ac61',source=JSON.stringify({url:'https://example.org/SYNTHETIC-site',category:target.category||'视觉影像',...(target.demonstration_required===true?{demonstration_required:true}:{})});
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at) VALUES(?,'site-synthetic',?,0,'approved',?,?,?,?,?,?,'node',0,1,2,3,'now','now')").run(jobId,OWNER,source,JSON.stringify({sha256:'f'.repeat(64)}),contract,revision,revision,script);
 sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,?,'SYNTHETIC',?,?,'SYNTHETIC','now')").run(jobId,revision,content,script);
 for(const node of ['source','script'])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,?,?,?,'approved',0,'now','now')").run('SYNTHETIC-'+node,jobId,node,revision,script,content);
 await p.confirmMediaScope(jobId,OWNER,{confirmed:true,binding:{revision,script_hash:script,mode_epoch:0,contract_hash:contract},scope:'private-video',current_id:'',request_id:'SYNTHETIC-scope'});sql.exec("UPDATE production_stages SET status='blocked'");
 const bytes=Buffer.alloc(PART+57,7);bytes.writeUInt32BE(24,0);bytes.write('ftyp',4);
 const native={revision,script_hash:script,sha256:hash(bytes),size_bytes:bytes.length,duration:54.9,file_name:'SYNTHETIC-ordinary.mp4',project_id:PROJECT,timeline_id:TIMELINE,source:'SYNTHETIC completed file metadata, not a real export',quality_approved:false,publication:false},candidate=await p.registerNativePromoVideo(jobId,native);
 const binding={revision,script_hash:script,mode_epoch:0,contract_hash:contract,candidate_id:candidate.id,candidate_sha256:native.sha256,project_id:PROJECT,timeline_id:TIMELINE};
 const audioId='audio_intake_'+'1'.repeat(64),audioSha='2'.repeat(64);
 sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES(?,?,?,?,'audio_intake',?,'SYNTHETIC','now')").run(audioId,jobId,revision,script,JSON.stringify({input:{script_revision:revision,script_hash:script,mode_epoch:0,sha256:audioSha,size_bytes:5000,duration_ms:50913}}));
 const current=await p.getJob(jobId),voice=await p.recordNativeCandidateVoiceProvenance(jobId,{client_receipt_id:'SYNTHETIC-owner-voice',binding,voice_kind:'owner-cloned',scope_id:current.media_continuation.current_id,audio_intake_id:audioId,audio_sha256:audioSha,source:'existing-owner-voice-metadata',quality_approved:false,publication_authorized:false,new_paid_calls:0},{owner_id:OWNER});
 const packet=(await p.readNativeWorkPacket(jobId,OWNER)).packet,body={request_id:'SYNTHETIC-video-1',binding,owner_review_id:null,pending_candidate_id:candidate.id,scope_id:packet.binding.scope_id,scope_hash:packet.binding.scope_hash,file:{role:'video',sha256:native.sha256,size_bytes:bytes.length,file_name:native.file_name,mime_type:'video/mp4'}};
 return{id:jobId,revision,sql,db,r2,bytes,body,binding,native,script,contract,voiceId:voice.provenance_id,audioId};
}
const actor={owner_id:OWNER};
async function upload(f,body=f.body,bytes=f.bytes){const started=await p.startSiteArchive(f.id,body,actor),sid=started.archive.site_archive_id;for(let n=0;n<started.archive.part_count;n++){const part=bytes.subarray(n*PART,(n+1)*PART);await p.putSiteArchivePart(f.id,{site_archive_id:sid,part:n,chunk_base64:part.toString('base64'),chunk_sha256:hash(part)},actor);}return sid;}
async function sealed(f,body=f.body,bytes=f.bytes){const sid=await upload(f,body,bytes);await p.finalizeSiteArchive(f.id,{site_archive_id:sid},actor);return sid;}
async function confirmed(f,body=f.body,bytes=f.bytes){const sid=await sealed(f,body,bytes),pieces=[];for(let n=0;n<Math.ceil(bytes.length/PART);n++){const x=await p.readSiteArchivePart(f.id,{site_archive_id:sid,part:n},actor);pieces.push(Buffer.from(x.chunk_base64,'base64'));assert.equal(hash(pieces.at(-1)),x.chunk_sha256);}const actual=Buffer.concat(pieces);assert.equal(hash(actual),body.file.sha256);await p.confirmSiteArchive(f.id,{site_archive_id:sid,materialized_sha256:hash(actual),size_bytes:actual.length,verified_at:AT},actor);return sid;}
function returnBody(f,sid){return{revision:f.revision,script_hash:f.script,mode_epoch:0,sha256:hash(f.bytes),size_bytes:f.bytes.length,duration:54.9,site_archive_id:sid,project_id:PROJECT,timeline_id:TIMELINE,render_id:'cccccccc-cccc-cccc-cccc-cccccccccccc',file_name:f.native.file_name,quality_approved:false,publication_authorized:false,new_paid_calls:0,qa:{voice_kind:'owner-cloned',voice_provenance_id:f.voiceId,semantic_listening_passed:false,recovery_receipt_sha256:'d'.repeat(64),final_duration:{schema:'actual-final-duration-v1',file_sha256:hash(f.bytes),probe_sha256:'e'.repeat(64),checked_at:AT,report:{hard_max_seconds:60,hard_duration_pass:true,maximum_measured_seconds:'54.9',measurements_seconds:{container_duration:'54.9',video_0_playback_end:'54.9',audio_0_playback_end:'54.9'},errors:[]}}}};}
test('SYNTHETIC first owner-voice candidate is archived and returned to real review node without approval',async t=>{
 const f=await fixture(t),original=f.sql.prepare('SELECT * FROM production_jobs WHERE id=?').get(ID),beforeCandidate=f.sql.prepare("SELECT note FROM production_reviews WHERE id=?").get(f.binding.candidate_id).note;
 assert.equal((await p.getJob(ID)).facts.video_approval,'not-recorded');
 const sid=await confirmed(f),a=await p.getSiteArchiveMetadata(ID,sid,OWNER);
 assert.equal(a.pending_candidate_id,f.binding.candidate_id);assert.equal(a.owner_review_id,null);assert.equal(a.quality_review,'awaiting-human');assert.equal(a.voice_provenance_id,f.voiceId);
 const packet=(await p.readNativeWorkPacket(ID,OWNER)).packet;assert.equal(packet.candidate.voice_kind,'owner-cloned');assert.equal(packet.candidate.voice_provenance_id,f.voiceId);assert.equal((await p.getJob(ID)).facts.files_archived,true);
 const returned=await p.returnNativeDraft(ID,returnBody(f,sid),actor),m=returned.job.milestones.find(m=>m.node==='video'),artifact=JSON.parse(m.artifact);
 assert.equal(m.status,'awaiting_human');assert.equal(artifact.qa.pending_candidate_id,f.binding.candidate_id);assert.equal(artifact.qa.voice_kind,'owner-cloned');assert.equal(artifact.qa.voice_provenance_id,f.voiceId);assert.equal(returned.job.facts.video_approval,'not-recorded');assert.equal(returned.job.publication_reports.length,0);
 assert.deepEqual(f.sql.prepare('SELECT * FROM production_jobs WHERE id=?').get(ID),original);assert.equal(f.sql.prepare("SELECT note FROM production_reviews WHERE id=?").get(f.binding.candidate_id).note,beforeCandidate);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_reviews WHERE decision IN ('reported_owner_candidate_feedback','approve')").get().n,0);
 assert.equal((await p.returnNativeDraft(ID,returnBody(f,sid),actor)).replayed,true);
 const r=await p.readSiteArchiveFile(ID,sid,OWNER,{offset:500000,length:100});assert.deepEqual(Buffer.from(await new Response(r.body).arrayBuffer()),f.bytes.subarray(500000,500100));
 await assert.rejects(()=>p.startSiteArchive(ID,{...f.body,request_id:'SYNTHETIC-new-upload'},actor),status(409));
});
test('SYNTHETIC first owner video rejects fake review, alternate roles, missing provenance and foreign owner',async t=>{
 const f=await fixture(t),before=snapshot(f.sql);
 for(const body of [{...f.body,owner_review_id:'candidate_owner_review_fake'},{...f.body,file:{...f.body.file,role:'complete_bundle',mime_type:'application/zip'}},{...f.body,pending_native_request_id:'nsd_'+'f'.repeat(64)}])await assert.rejects(()=>p.startSiteArchive(ID,body,actor));
 await assert.rejects(()=>p.startSiteArchive(ID,f.body,{owner_id:'SYNTHETIC-other'}),status(403));assert.deepEqual(snapshot(f.sql),before);assert.equal(f.r2.puts,0);
 f.sql.prepare('DELETE FROM production_reviews WHERE id=?').run(f.voiceId);
 await assert.rejects(()=>p.startSiteArchive(ID,f.body,actor),status(409));assert.equal(f.r2.puts,0);
});
for(const field of ['revision','script_hash','mode_epoch','contract_hash','candidate_id','candidate_sha256','project_id','timeline_id'])test('SYNTHETIC stale first-candidate '+field+' rejected before upload',async t=>{
 const f=await fixture(t),body=clone(f.body);body.binding[field]=typeof body.binding[field]==='number'?body.binding[field]+1:'changed';const before=snapshot(f.sql);await assert.rejects(()=>p.startSiteArchive(ID,body,actor),status(409));assert.deepEqual(snapshot(f.sql),before);assert.equal(f.r2.puts,0);
});
test('SYNTHETIC first candidate CAS freezes audio source and no-video gate',async t=>{
 const f=await fixture(t),beforeCount=f.sql.prepare("SELECT COUNT(*) n FROM app_state WHERE key LIKE 'site_archive_v1:%'").get().n;
 f.db.beforeMutation(()=>f.sql.prepare("UPDATE production_reviews SET note=json_set(note,'$.input.sha256',?) WHERE id=?").run('9'.repeat(64),f.audioId));
 await assert.rejects(()=>p.startSiteArchive(ID,f.body,actor),status(409));assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM app_state WHERE key LIKE 'site_archive_v1:%'").get().n,beforeCount);assert.equal(f.r2.puts,0);
});
test('SYNTHETIC confirmed video is immutable and playback does not grant approval',async t=>{
 const f=await fixture(t),sid=await confirmed(f),before=snapshot(f.sql);const r=await p.readSiteArchiveFile(ID,sid,OWNER);assert.equal(hash(Buffer.from(await new Response(r.body).arrayBuffer())),hash(f.bytes));assert.deepEqual(snapshot(f.sql),before);
 await assert.rejects(()=>p.readSiteArchiveFile(ID,sid,'SYNTHETIC-other'),status(403));
 await assert.rejects(()=>p.returnNativeDraft(ID,{...returnBody(f,sid),qa:{...returnBody(f,sid).qa,voice_kind:'ordinary-temporary'}},actor),status(409));
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_milestones WHERE node='video'").get().n,0);
});
test('SYNTHETIC concurrent video node prevents reserving a first-candidate upload',async t=>{
 const f=await fixture(t);
 f.db.beforeMutation(()=>f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES('SYNTHETIC-racing-video',?,'video',3,?,'{}','awaiting_human',0,'now','now')").run(ID,'7'.repeat(64)));
 await assert.rejects(()=>p.startSiteArchive(ID,f.body,actor),status(409));
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM app_state WHERE key LIKE 'site_archive_v1:%'").get().n,0);assert.equal(f.r2.puts,0);
});

const FIRST_REVIEW_CASES=[
 {label:'GLM-Legal',id:'job_b7dcd6bf-682d-429f-9016-7c9f3df41c16',revision:1,script:'8580f6bbad4bdca0c07af05915e61ed734b3fd6c8d492e5c9a21ef92937594fa',contract:'670a348cda9d5941d4a7ac66ba00f1c0ce6388cb0d80fc6bdd595da7315bba6f'},
 {label:'refund',id:'job_38fd8bfd-2949-4d26-8b67-d07a03e6f0b0',revision:1,script:'c1eb8ebb836302272fabc9b31f9db756ec076f2387bdb0b2ca13fbcf3a8ec5ab',contract:'9d2868f931b066b12f8d7d0a7cabdd9306a76c39ba3e3d86ab3b03db25dbdc27'},
 {label:'DeepSeek',id:'job_ed3c8123-59ed-4948-9d99-fdb7067ee522',revision:1,script:'18050f4876ebf14998b69e2b9e183ab4b1332d6f0d4fae6e8030f27ee7e694d3',contract:'e8bc99b09a4df6745474336f3c5ab195d014f275ceabffd7158f29bb945059fd'},
];
for(const target of FIRST_REVIEW_CASES)test('SYNTHETIC '+target.label+' first review completes R2, readback, projection and awaiting-human handoff without approval',async t=>{
 const f=await fixture(t,target),original=f.sql.prepare('SELECT * FROM production_jobs WHERE id=?').get(f.id),sid=await confirmed(f),archive=await p.getSiteArchiveMetadata(f.id,sid,OWNER);
 assert.equal(archive.pending_candidate_id,f.binding.candidate_id);assert.equal(archive.owner_review_id,null);assert.equal(archive.quality_review,'awaiting-human');assert.equal(archive.quality_approved,false);
 const before=(await p.getJob(f.id));assert.equal(before.facts.files_archived,true);assert.equal(before.facts.native_video_archive.site_archive_id,sid);assert.equal(before.facts.site_file_archives[0].site_archive_id,sid);assert.equal(before.facts.video_approval,'not-recorded');
 const returned=await p.returnNativeDraft(f.id,returnBody(f,sid),actor),node=returned.job.milestones.find(m=>m.node==='video'),value=JSON.parse(node.artifact);
 assert.equal(node.status,'awaiting_human');assert.equal(node.revision,1);assert.equal(value.qa.native_candidate_id,f.binding.candidate_id);assert.equal(value.qa.voice_kind,'owner-cloned');assert.equal(value.qa.voice_provenance_id,f.voiceId);assert.equal(value.qa.quality_approved,false);
 assert.equal(returned.job.facts.files_archived,true);assert.equal(returned.job.facts.video_approval,'not-recorded');assert.equal(returned.job.publication_reports.length,0);
 assert.deepEqual(f.sql.prepare('SELECT * FROM production_jobs WHERE id=?').get(f.id),original);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_reviews WHERE decision IN ('reported_owner_candidate_feedback','approve')").get().n,0);
 assert.equal((await p.returnNativeDraft(f.id,returnBody(f,sid),actor)).replayed,true);
 const range=await p.readSiteArchiveFile(f.id,sid,OWNER,{offset:123,length:987});assert.deepEqual(Buffer.from(await new Response(range.body).arrayBuffer()),f.bytes.subarray(123,1110));
 await assert.rejects(()=>p.startSiteArchive(f.id,{...f.body,request_id:'SYNTHETIC-another-file'},actor),status(409));
 // A frozen historical record stays owner-readable without becoming current authority.
 f.sql.prepare("UPDATE production_jobs SET mode_epoch=1 WHERE id=?").run(f.id);
 assert.equal((await p.getJob(f.id)).facts.site_file_archives,undefined);
 assert.equal((await p.getSiteArchiveMetadata(f.id,sid,OWNER)).site_archive_id,sid);
 await assert.rejects(()=>p.readSiteArchiveFile(f.id,sid,'SYNTHETIC-other-owner'),status(403));
});

const driftCases=[
 ['script',f=>f.sql.prepare("UPDATE production_jobs SET approved_hash=? WHERE id=?").run('0'.repeat(64),f.id)],
 ['contract',f=>f.sql.prepare("UPDATE production_jobs SET contract_hash=? WHERE id=?").run('0'.repeat(64),f.id)],
 ['mode',f=>f.sql.prepare("UPDATE production_jobs SET review_mode='auto' WHERE id=?").run(f.id)],
 ['scope',f=>f.sql.prepare("UPDATE app_state SET value=json_set(value,'$.scope.binding.mode_epoch',1) WHERE key=?").run('media_scope_v1:'+f.id)],
 ['audio',f=>f.sql.prepare("UPDATE production_reviews SET note=json_set(note,'$.input.sha256',?) WHERE id=?").run('0'.repeat(64),f.audioId)],
 ['voice',f=>f.sql.prepare("DELETE FROM production_reviews WHERE id=?").run(f.voiceId)],
 ['candidate',f=>f.sql.prepare("UPDATE production_reviews SET note=json_set(note,'$.sha256',?) WHERE id=?").run('0'.repeat(64),f.binding.candidate_id)],
 ['owner',f=>f.sql.prepare("UPDATE production_jobs SET owner_id='SYNTHETIC-other-owner' WHERE id=?").run(f.id)],
 ['video',f=>f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES('SYNTHETIC-racing-new-video',?,'video',?,?,'{}','awaiting_human',0,'now','now')").run(f.id,f.revision,'7'.repeat(64))],
];
for(const target of FIRST_REVIEW_CASES)for(const phase of ['part','finalize','readpart','confirm'])for(const [name,change]of driftCases)test('SYNTHETIC '+target.label+' '+phase+' rejects changed '+name+' without another write',async t=>{
 const f=await fixture(t,target),sid=phase==='part'?(await p.startSiteArchive(f.id,f.body,actor)).archive.site_archive_id:phase==='finalize'?await upload(f):await sealed(f);
 change(f);const before=snapshot(f.sql),puts=f.r2.puts;
 if(phase==='part'){const chunk=f.bytes.subarray(0,PART);await assert.rejects(()=>p.putSiteArchivePart(f.id,{site_archive_id:sid,part:0,chunk_base64:chunk.toString('base64'),chunk_sha256:hash(chunk)},actor));}
 if(phase==='finalize')await assert.rejects(()=>p.finalizeSiteArchive(f.id,{site_archive_id:sid},actor));
 if(phase==='readpart')await assert.rejects(()=>p.readSiteArchivePart(f.id,{site_archive_id:sid,part:0},actor));
 if(phase==='confirm')await assert.rejects(()=>p.confirmSiteArchive(f.id,{site_archive_id:sid,materialized_sha256:hash(f.bytes),size_bytes:f.bytes.length,verified_at:AT},actor));
 assert.deepEqual(snapshot(f.sql),before);assert.equal(f.r2.puts,puts);
});
for(const target of FIRST_REVIEW_CASES)test('SYNTHETIC '+target.label+' first-intake CAS freezes current audio before reserving metadata',async t=>{
 const f=await fixture(t,target);f.db.beforeMutation(()=>f.sql.prepare("UPDATE production_reviews SET note=json_set(note,'$.input.sha256',?) WHERE id=?").run('0'.repeat(64),f.audioId));
 await assert.rejects(()=>p.startSiteArchive(f.id,f.body,actor),status(409));assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM app_state WHERE key LIKE 'site_archive_v1:%'").get().n,0);assert.equal(f.r2.puts,0);
});
for(const target of FIRST_REVIEW_CASES)test('SYNTHETIC '+target.label+' first intake cannot substitute oral approval, temporary voice or post-video context',async t=>{
 const f=await fixture(t,target),before=snapshot(f.sql);
 for(const body of [{...f.body,owner_review_id:'SYNTHETIC-oral-approval'},{...f.body,post_video_delivery_id:'native_draft_'+'e'.repeat(64)},{...f.body,file:{...f.body.file,role:'complete_bundle',mime_type:'application/zip'}}])await assert.rejects(()=>p.startSiteArchive(f.id,body,actor));
 assert.deepEqual(snapshot(f.sql),before);assert.equal(f.r2.puts,0);
 const sid=await confirmed(f),body=returnBody(f,sid);await assert.rejects(()=>p.returnNativeDraft(f.id,{...body,qa:{...body.qa,voice_kind:'ordinary-temporary'}},actor),status(409));
 await assert.rejects(()=>p.returnNativeDraft(f.id,{...body,qa:{...body.qa,voice_provenance_id:'candidate_voice_'+'e'.repeat(64)}},actor),status(409));
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_milestones WHERE node='video'").get().n,0);
});
test('SYNTHETIC GLM actual-tool demonstration hard gate remains after a fully confirmed first-review archive',async t=>{
 const f=await fixture(t,{...FIRST_REVIEW_CASES[0],category:'AI实用',demonstration_required:true}),sid=await confirmed(f),before=snapshot(f.sql);
 await assert.rejects(()=>p.returnNativeDraft(f.id,returnBody(f,sid),actor),e=>{assert.equal(e.status,409);assert.match(e.message,/真实调用界面及实际干活连续视频/);return true;});
 assert.deepEqual(snapshot(f.sql),before);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM production_milestones WHERE node='video'").get().n,0);
});
test('SYNTHETIC first-intake extension does not authorize an arbitrary job or old ordinary archive job without its review',async t=>{
 const f=await fixture(t,{...FIRST_REVIEW_CASES[1],id:'job_11111111-1111-4111-8111-111111111111'}),before=snapshot(f.sql);
 await assert.rejects(()=>p.startSiteArchive(f.id,f.body,actor),status(403));assert.deepEqual(snapshot(f.sql),before);assert.equal(f.r2.puts,0);
});
