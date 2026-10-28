// SYNTHETIC post-video materials regression. Isolated migrated SQLite + in-memory R2 only. The real job identity is a constant-under-test; no live API, real owner, real audio/video or production approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const ID='job_c3adf563-321c-4bac-b807-b1e749681c82',OWNER='SYNTHETIC-site-owner',AT='2026-10-17T00:00:00.000Z',PROJECT='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',TIMELINE='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',PART=524288;
const hash=b=>createHash('sha256').update(b).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
const built=await build({stdin:{contents:["export * from './lib/site-file-archive';","export {getJob} from './lib/production';","export {confirmMediaScope} from './lib/media-continuation';","export {registerNativePromoVideo} from './lib/promo-delivery';","export {recordNativeCandidateVoiceProvenance} from './lib/native-candidate-voice';","export {recordNativeCandidateFeedback} from './lib/native-candidate-feedback';","export {readNativeWorkPacket} from './lib/native-work-packet';","export {returnNativeDraft} from './lib/native-draft-handoff';","export {submitMilestone,decideMilestone} from './lib/milestones';","export * as route from './app/api/executor/route';"].join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'SYNTHETIC-site-r2',setup(b){b.onResolve({filter:/^(?:\.\/store|@\/lib\/store)$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/^db$/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__siteArchiveDB} export function siteArchiveBucket(){return globalThis.__siteArchiveR2}'}));b.onResolve({filter:/^@\/lib\/api$/},()=>({path:'identity',namespace:'fixture'}));b.onLoad({filter:/identity/,namespace:'fixture'},()=>({contents:"export async function identity(req){return req.headers.get('x-synthetic-owner')||null}export const json=(body,status=200)=>Response.json(body,{status});"}));}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
class R2{
 map=new Map();puts=0;hook=null;
 async get(key){const x=this.map.get(key);if(!x)return null;const bytes=Buffer.from(x.bytes);return{customMetadata:x.customMetadata,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>bytes.toString('utf8')};}
 async put(key,value,options={}){this.puts++;if(this.hook){const h=this.hook;this.hook=null;await h(key);}if(options.onlyIf?.get('If-None-Match')==='*'&&this.map.has(key))return null;const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(value);this.map.set(key,{bytes:Buffer.from(bytes),customMetadata:options.customMetadata||{}});return{key,size:bytes.length};}
}
const tables=['production_jobs','production_drafts','production_reviews','production_milestones','production_operations','production_stages','app_state'];
const snapshot=sql=>clone(Object.fromEntries(tables.map(t=>[t,sql.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()])));
const status=n=>e=>{assert.equal(e.status,n,e.message);return true};
async function fixture(t){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 let hook;class S{constructor(q,args=[]){this.q=q;this.args=args;}bind(...args){return new S(this.q,args);}async first(){return sql.prepare(this.q).get(...this.args)||null;}async all(){return{results:sql.prepare(this.q).all(...this.args)};}async run(){if(hook){const h=hook;hook=null;await h(this.q);}return{meta:{changes:Number(sql.prepare(this.q).run(...this.args).changes)}};}}
 const db={prepare:q=>new S(q),beforeMutation:f=>hook=f,beforeBatch:null,batch:async ss=>{if(db.beforeBatch){const h=db.beforeBatch;db.beforeBatch=null;await h(ss);}sql.exec('BEGIN');try{const results=ss.map(s=>({meta:{changes:Number(sql.prepare(s.q).run(...s.args).changes)}}));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const r2=new R2();globalThis.__siteArchiveDB=db;globalThis.__siteArchiveR2=r2;t.after(()=>{sql.close();delete globalThis.__siteArchiveDB;delete globalThis.__siteArchiveR2;});
 sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES('site-synthetic','https://example.org/SYNTHETIC-site','fixture','fixture','SYNTHETIC','SYNTHETIC','fixture','now','视觉影像',0,'m','h','a','m','r',0,'zh')");
 const content=JSON.stringify({script:'SYNTHETIC approved exact script',evidence:[],storyboard:[]}),script='d9d74b6682cc75f06575925b1b946038fb72ac37dd21225f61b55ba2c023de4a',contract='65e245fe5e4d5babb9e881ad45b286f22255a5ed6a49c501f998ec1bf740ac61',source=JSON.stringify({url:'https://example.org/SYNTHETIC-site',category:'视觉影像'});
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at) VALUES(?,'site-synthetic',?,0,'approved',?,?,?,3,3,?,'node',0,1,2,3,'now','now')").run(ID,OWNER,source,JSON.stringify({sha256:'f'.repeat(64)}),contract,script);
 sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,3,'SYNTHETIC',?,?,'SYNTHETIC','now')").run(ID,content,script);
 for(const node of ['source','script'])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,3,?,?,'approved',0,'now','now')").run('SYNTHETIC-'+node,ID,node,script,content);
 await p.confirmMediaScope(ID,OWNER,{confirmed:true,binding:{revision:3,script_hash:script,mode_epoch:0,contract_hash:contract},scope:'private-video',current_id:'',request_id:'SYNTHETIC-scope'});sql.exec("UPDATE production_stages SET status='blocked'");
 const bytes=Buffer.alloc(PART+57,7);bytes.writeUInt32BE(24,0);bytes.write('ftyp',4);
 const native={revision:3,script_hash:script,sha256:hash(bytes),size_bytes:bytes.length,duration:54.9,file_name:'SYNTHETIC-ordinary.mp4',project_id:PROJECT,timeline_id:TIMELINE,source:'SYNTHETIC completed file metadata, not a real export',quality_approved:false,publication:false},candidate=await p.registerNativePromoVideo(ID,native);
 const binding={revision:3,script_hash:script,mode_epoch:0,contract_hash:contract,candidate_id:candidate.id,candidate_sha256:native.sha256,project_id:PROJECT,timeline_id:TIMELINE};
 const audioId='audio_intake_'+'1'.repeat(64),audioSha='2'.repeat(64);
 sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES(?,?,3,?,'audio_intake',?,'SYNTHETIC','now')").run(audioId,ID,script,JSON.stringify({input:{script_revision:3,script_hash:script,mode_epoch:0,sha256:audioSha,size_bytes:5000,duration_ms:50913}}));
 const current=await p.getJob(ID),voice=await p.recordNativeCandidateVoiceProvenance(ID,{client_receipt_id:'SYNTHETIC-owner-voice',binding,voice_kind:'owner-cloned',scope_id:current.media_continuation.current_id,audio_intake_id:audioId,audio_sha256:audioSha,source:'existing-owner-voice-metadata',quality_approved:false,publication_authorized:false,new_paid_calls:0},{owner_id:OWNER});
 const packet=(await p.readNativeWorkPacket(ID,OWNER)).packet,body={request_id:'SYNTHETIC-video-1',binding,owner_review_id:null,pending_candidate_id:candidate.id,scope_id:packet.binding.scope_id,scope_hash:packet.binding.scope_hash,file:{role:'video',sha256:native.sha256,size_bytes:bytes.length,file_name:native.file_name,mime_type:'video/mp4'}};
 return{sql,db,r2,bytes,body,binding,native,script,contract,voiceId:voice.provenance_id,audioId};
}
const actor={owner_id:OWNER};
async function upload(f,body=f.body,bytes=f.bytes){const started=await p.startSiteArchive(ID,body,actor),sid=started.archive.site_archive_id;for(let n=0;n<started.archive.part_count;n++){const part=bytes.subarray(n*PART,(n+1)*PART);await p.putSiteArchivePart(ID,{site_archive_id:sid,part:n,chunk_base64:part.toString('base64'),chunk_sha256:hash(part)},actor);}return sid;}
async function sealed(f,body=f.body,bytes=f.bytes){const sid=await upload(f,body,bytes);await p.finalizeSiteArchive(ID,{site_archive_id:sid},actor);return sid;}
async function confirmed(f,body=f.body,bytes=f.bytes){const sid=await sealed(f,body,bytes),pieces=[];for(let n=0;n<Math.ceil(bytes.length/PART);n++){const x=await p.readSiteArchivePart(ID,{site_archive_id:sid,part:n},actor);pieces.push(Buffer.from(x.chunk_base64,'base64'));assert.equal(hash(pieces.at(-1)),x.chunk_sha256);}const actual=Buffer.concat(pieces);assert.equal(hash(actual),body.file.sha256);await p.confirmSiteArchive(ID,{site_archive_id:sid,materialized_sha256:hash(actual),size_bytes:actual.length,verified_at:AT},actor);return sid;}
function returnBody(f,sid){return{revision:3,script_hash:f.script,mode_epoch:0,sha256:hash(f.bytes),size_bytes:f.bytes.length,duration:54.9,site_archive_id:sid,project_id:PROJECT,timeline_id:TIMELINE,render_id:'cccccccc-cccc-cccc-cccc-cccccccccccc',file_name:f.native.file_name,quality_approved:false,publication_authorized:false,new_paid_calls:0,qa:{voice_kind:'owner-cloned',voice_provenance_id:f.voiceId,semantic_listening_passed:false,recovery_receipt_sha256:'d'.repeat(64),final_duration:{schema:'actual-final-duration-v1',file_sha256:hash(f.bytes),probe_sha256:'e'.repeat(64),checked_at:AT,report:{hard_max_seconds:60,hard_duration_pass:true,maximum_measured_seconds:'54.9',measurements_seconds:{container_duration:'54.9',video_0_playback_end:'54.9',audio_0_playback_end:'54.9'},errors:[]}}}};}

async function postFixture(t){
 const f=await fixture(t),sid=await confirmed(f),returned=await p.returnNativeDraft(ID,returnBody(f,sid),actor),video=returned.job.milestones.find(m=>m.node==='video');
 await p.decideMilestone(ID,video.id,3,video.artifact_hash,0,'approve',{},OWNER);
 const j=await p.getJob(ID),approved=j.milestones.find(m=>m.id===video.id),review=j.reviews.find(r=>r.decision==='approve'&&r.note===approved.report&&r.content_hash===video.artifact_hash);
 return{...f,videoSid:sid,video:approved,videoReview:review.id};
}
function png(width,height){const b=Buffer.alloc(40);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);return b;}
const promotionText='# SYNTHETIC 宣发稿\n\n这是隔离测试，绝不是生产意见或发布。';
function postBody(f,role,bytes,name=role+'.txt',request='SYNTHETIC-post-'+role){return{request_id:request,binding:f.binding,owner_review_id:f.videoReview,post_video_delivery_id:f.video.id,scope_id:f.body.scope_id,scope_hash:f.body.scope_hash,file:{role,sha256:hash(bytes),size_bytes:bytes.length,file_name:name,mime_type:role.startsWith('cover_')?'image/png':['complete_bundle','source_bundle'].includes(role)?'application/zip':'text/plain'}};}
async function materials(f){const bytes3=png(300,400),bytes4=png(400,300),md=Buffer.from(promotionText),s3=await confirmed(f,postBody(f,'cover_3_4',bytes3,'SYNTHETIC-cover3.png'),bytes3),s4=await confirmed(f,postBody(f,'cover_4_3',bytes4,'SYNTHETIC-cover4.png'),bytes4),sp=await confirmed(f,postBody(f,'promotion',md,'SYNTHETIC-promotion.md'),md);return{s3,s4,sp,bytes3,bytes4,md};}
async function submitCover(f,m){const j=await p.submitMilestone(ID,'cover',3,0,'SYNTHETIC-cover-submit',{url:'https://synthetic.test/api/site-file-download?archive='+m.s3,sha256:hash(m.bytes3),provider_job_id:'SYNTHETIC-existing-AIGC-two-covers',cost:0,qa:{post_video_delivery_id:f.video.id,site_archive_ids:{cover_3_4:m.s3,cover_4_3:m.s4}}},0);return j.milestones.find(x=>x.node==='cover');}
async function submitPromotion(f,m){const j=await p.submitMilestone(ID,'promotion',3,0,'SYNTHETIC-promotion-submit',{text:promotionText,limits:JSON.stringify({schema:'site-promotion-file-v1',site_archive_id:m.sp,sha256:hash(m.md)})},0);return j.milestones.find(x=>x.node==='promotion');}
async function approve(f,m){return p.decideMilestone(ID,m.id,3,m.artifact_hash,0,'approve',{},OWNER);}

test('SYNTHETIC post-video two covers and MD complete real seal/readback/confirm while video approval stays intact',async t=>{
 const f=await postFixture(t),before=f.sql.prepare('SELECT reworks,ai_calls,attempt FROM production_jobs WHERE id=?').get(ID),m=await materials(f),j=await p.getJob(ID),files=j.facts.site_file_archives;
 assert.equal(j.facts.video_approval,'owner-node-approved');assert.equal(j.facts.complete_package_archived,false);assert.equal(files.find(a=>a.file.role==='video').site_archive_id,f.videoSid);
 for(const role of ['cover_3_4','cover_4_3','promotion']){const a=files.find(a=>a.file.role===role);assert.equal(a.post_video_delivery_id,f.video.id);assert.equal(a.owner_review_id,f.videoReview);assert.equal(a.quality_review,'awaiting-human');assert.equal(a.quality_approved,false);assert.equal(a.publication_authorized,false);assert.equal(a.post_video_material_reviews,undefined);}
 const download=await p.readSiteArchiveFile(ID,m.sp,OWNER);assert.equal(Buffer.from(await new Response(download.body).arrayBuffer()).toString('utf8'),promotionText);assert.equal(j.milestones.filter(x=>['cover','promotion'].includes(x.node)).length,0);assert.deepEqual(f.sql.prepare('SELECT reworks,ai_calls,attempt FROM production_jobs WHERE id=?').get(ID),before);
 const cover=await submitCover(f,m);assert.equal(cover.status,'awaiting_human');assert.equal((await p.getJob(ID)).milestones.find(x=>x.node==='video').status,'approved');await assert.rejects(()=>submitPromotion(f,m),status(409));
});
test('SYNTHETIC complete ZIP is blocked until exact cover and promotion have genuine owner approvals',async t=>{
 const f=await postFixture(t),m=await materials(f),zip=Buffer.from('PK\x03\x04SYNTHETIC-complete-package'),b=postBody(f,'complete_bundle',zip,'SYNTHETIC-complete.zip'),before=snapshot(f.sql);
 await assert.rejects(()=>p.startSiteArchive(ID,b,actor),status(409));assert.deepEqual(snapshot(f.sql),before);
 const cover=await submitCover(f,m);await assert.rejects(()=>p.startSiteArchive(ID,b,actor),status(409));await approve(f,cover);await assert.rejects(()=>p.startSiteArchive(ID,b,actor),status(409));const promotion=await submitPromotion(f,m);await assert.rejects(()=>p.startSiteArchive(ID,b,actor),status(409));await approve(f,promotion);
 const sid=await confirmed(f,b,zip),a=await p.getSiteArchiveMetadata(ID,sid,OWNER),j=await p.getJob(ID);assert.equal(a.quality_approved,false);assert.equal(a.quality_review,undefined);assert.ok(a.post_video_material_reviews.cover.startsWith('milestone_review_'));assert.ok(a.post_video_material_reviews.promotion.startsWith('milestone_review_'));assert.equal(j.facts.complete_package_archived,true);assert.equal(j.status,'approved');assert.equal(j.publication_reports.length,0);assert.equal(j.milestones.some(x=>x.node==='delivery'),false);
});
test('SYNTHETIC metadata alone, a report without its owner audit, or a stale voice cannot unlock post-video uploads',async t=>{
 const f=await fixture(t),sid=await confirmed(f),ret=await p.returnNativeDraft(ID,returnBody(f,sid),actor),video=ret.job.milestones.find(m=>m.node==='video');Object.assign(f,{video,videoReview:'SYNTHETIC-fake-review'});const b=postBody(f,'promotion',Buffer.from(promotionText));let before=snapshot(f.sql);await assert.rejects(()=>p.startSiteArchive(ID,b,actor),status(409));assert.deepEqual(snapshot(f.sql),before);
 await p.decideMilestone(ID,video.id,3,video.artifact_hash,0,'approve',{},OWNER);const j=await p.getJob(ID),v=j.milestones.find(m=>m.id===video.id),review=j.reviews.find(r=>r.note===v.report&&r.decision==='approve');f.video=v;f.videoReview=review.id;
 f.sql.prepare('DELETE FROM production_reviews WHERE id=?').run(review.id);before=snapshot(f.sql);await assert.rejects(()=>p.startSiteArchive(ID,postBody(f,'promotion',Buffer.from(promotionText)),actor),status(409));assert.deepEqual(snapshot(f.sql),before);
});
for(const field of ['revision','script_hash','mode_epoch','contract_hash','candidate_id','candidate_sha256','project_id','timeline_id'])test('SYNTHETIC post-video stale '+field+' request cannot reserve storage',async t=>{
 const f=await postFixture(t),b=postBody(f,'promotion',Buffer.from(promotionText));b.binding=clone(b.binding);b.binding[field]=typeof b.binding[field]==='number'?b.binding[field]+1:'changed';const before=snapshot(f.sql);await assert.rejects(()=>p.startSiteArchive(ID,b,actor),status(409));assert.deepEqual(snapshot(f.sql),before);
});
test('SYNTHETIC post-video discriminator cannot mix old branches, replace video, cross owner, or change frozen task',async t=>{
 const f=await postFixture(t),b=postBody(f,'promotion',Buffer.from(promotionText)),before=snapshot(f.sql);
 for(const extra of [{pending_candidate_id:f.binding.candidate_id},{version_request_id:'apv_'+'a'.repeat(64)},{pending_native_request_id:'nsd_'+'a'.repeat(64)},{final_native_request_id:'nfinal_'+'a'.repeat(64)}])await assert.rejects(()=>p.startSiteArchive(ID,{...b,...extra},actor),status(400));
 await assert.rejects(()=>p.startSiteArchive(ID,{...b,file:{...f.body.file}},actor),status(400));await assert.rejects(()=>p.startSiteArchive(ID,b,{owner_id:'SYNTHETIC-other'}),status(403));await assert.rejects(()=>p.startSiteArchive('job_1c2556b8-53d5-4dc0-8d7a-faec60fa36ba',b,actor),status(403));assert.deepEqual(snapshot(f.sql),before);
});
for(const [name,mutate]of [
 ['video approval',f=>f.sql.prepare("UPDATE production_milestones SET status='awaiting_human' WHERE id=?").run(f.video.id)],
 ['owner approval audit',f=>f.sql.prepare('DELETE FROM production_reviews WHERE id=?').run(f.videoReview)],
 ['scope',f=>f.sql.prepare("UPDATE app_state SET value=json_set(value,'$.scope.scope','preparation') WHERE key=?").run('media_scope_v1:'+ID)],
 ['audio',f=>f.sql.prepare("UPDATE production_reviews SET note=json_set(note,'$.input.sha256',?) WHERE id=?").run('9'.repeat(64),f.audioId)],
 ['owner',f=>f.sql.prepare('UPDATE production_jobs SET owner_id=? WHERE id=?').run('SYNTHETIC-other',ID)]
])test('SYNTHETIC post-video start CAS rejects concurrent '+name+' without partial reservation',async t=>{
 const f=await postFixture(t),b=postBody(f,'promotion',Buffer.from(promotionText));let raced;f.db.beforeMutation(()=>{mutate(f);raced=snapshot(f.sql);});await assert.rejects(()=>p.startSiteArchive(ID,b,actor),status(409));assert.deepEqual(snapshot(f.sql),raced);
});
test('SYNTHETIC complete ZIP cannot substitute a cover reference or misbound promotion text after approval',async t=>{
 const f=await postFixture(t),m=await materials(f),cover=await submitCover(f,m);await approve(f,cover);const promotion=await submitPromotion(f,m);await approve(f,promotion);
 const original=f.sql.prepare('SELECT artifact FROM production_milestones WHERE id=?').get(cover.id).artifact,ca=JSON.parse(original);ca.qa.site_archive_ids.cover_4_3=m.s3;const changed=JSON.stringify(ca),changedHash=hash(changed),report=JSON.stringify({decision:'approve',actor:OWNER,revision:3,artifact_hash:changedHash,mode_epoch:0});f.sql.prepare('UPDATE production_milestones SET artifact=?,artifact_hash=?,report=? WHERE id=?').run(changed,changedHash,report,cover.id);f.sql.prepare("UPDATE production_reviews SET content_hash=?,note=? WHERE content_hash=? AND decision='approve'").run(changedHash,report,cover.artifact_hash);
 const zip=Buffer.from('PK\x03\x04SYNTHETIC');await assert.rejects(()=>p.startSiteArchive(ID,postBody(f,'complete_bundle',zip),actor),status(409));
});
test('SYNTHETIC complete ZIP start CAS freezes the exact confirmed material states',async t=>{
 const f=await postFixture(t),m=await materials(f),cover=await submitCover(f,m);await approve(f,cover);const promotion=await submitPromotion(f,m);await approve(f,promotion);
 const zip=Buffer.from('PK\x03\x04SYNTHETIC'),b=postBody(f,'complete_bundle',zip);let raced;
 f.db.beforeMutation(()=>{f.sql.prepare("UPDATE app_state SET value=json_set(value,'$.archive.file.sha256',?) WHERE key=?").run('9'.repeat(64),'site_archive_v1:'+m.s4);raced=snapshot(f.sql);});await assert.rejects(()=>p.startSiteArchive(ID,b,actor),status(409));assert.deepEqual(snapshot(f.sql),raced);
});
test('SYNTHETIC post-video finalize cannot seal bytes after a newer unapproved cover appears',async t=>{
 const f=await postFixture(t),bytes=Buffer.from(promotionText),b=postBody(f,'promotion',bytes),sid=await upload(f,b,bytes);
 f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES('SYNTHETIC-later-cover',?,'cover',3,1,?,'{}','awaiting_human',0,'now','now')").run(ID,'9'.repeat(64));const before=snapshot(f.sql);await assert.rejects(()=>p.finalizeSiteArchive(ID,{site_archive_id:sid},actor),status(409));assert.deepEqual(snapshot(f.sql),before);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='site_file_archive_v1' AND content_hash=?").get(hash(bytes)).n,0);
});
