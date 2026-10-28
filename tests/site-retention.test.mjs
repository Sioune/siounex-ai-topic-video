// SYNTHETIC: isolated migrated SQLite and in-memory R2; no real media, HTTP, model or owner action.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const ID='job_1c2556b8-53d5-4dc0-8d7a-faec60fa36ba',OWNER='SYNTHETIC-site-owner',AT='2026-10-17T00:00:00.000Z',PROJECT='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',TIMELINE='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',PART=524288;
const hash=b=>createHash('sha256').update(b).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
const built=await build({stdin:{contents:["export * from './lib/site-retention';","export * from './lib/site-file-archive';","export * from './lib/approved-native-version';","export {submitMilestone} from './lib/milestones';","export {getJob} from './lib/production';","export {confirmMediaScope} from './lib/media-continuation';","export {registerNativePromoVideo} from './lib/promo-delivery';","export {recordNativeCandidateFeedback} from './lib/native-candidate-feedback';","export {readNativeWorkPacket} from './lib/native-work-packet';","export {returnNativeDraft} from './lib/native-draft-handoff';","export {decideMilestone} from './lib/milestones';","export * as route from './app/api/executor/route';"].join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'SYNTHETIC-site-r2',setup(b){b.onResolve({filter:/^(?:\.\/store|@\/lib\/store)$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/^db$/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__siteArchiveDB} export function siteArchiveBucket(){return globalThis.__siteArchiveR2}'}));b.onResolve({filter:/^@\/lib\/api$/},()=>({path:'identity',namespace:'fixture'}));b.onLoad({filter:/identity/,namespace:'fixture'},()=>({contents:"export async function identity(req){return req.headers.get('x-synthetic-owner')||null}export const json=(body,status=200)=>Response.json(body,{status});"}));}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
class R2{
 map=new Map();puts=0;hook=null;deletedKeys=[];deleteCalls=[];headKeys=[];listCalls=[];deleteHook=null;failDeleteOnce=null;retainDeleteKey=null;rejectEmptyDelete=false;
 async delete(keys){const all=Array.isArray(keys)?keys:[keys];this.deleteCalls.push([...all]);if(this.rejectEmptyDelete&&!all.length)throw new Error('SYNTHETIC empty R2 delete rejected');if(this.deleteHook){const hook=this.deleteHook;this.deleteHook=null;await hook(all);}for(const key of all){this.deletedKeys.push(key);if(this.failDeleteOnce&&key.includes(this.failDeleteOnce)){this.failDeleteOnce=null;throw new Error('SYNTHETIC injected physical-delete failure');}if(key!==this.retainDeleteKey)this.map.delete(key);}}
 async head(key){this.headKeys.push(key);const item=this.map.get(key);return item?{key,size:item.bytes.length}:null;}
 async list({prefix='',limit=1000}={}){this.listCalls.push({prefix,limit});const keys=[...this.map.keys()].filter(key=>key.startsWith(prefix)).sort();return{objects:keys.slice(0,limit).map(key=>({key,size:this.map.get(key).bytes.length})),truncated:keys.length>limit};}
 async get(key){const x=this.map.get(key);if(!x)return null;const bytes=Buffer.from(x.bytes);return{customMetadata:x.customMetadata,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>bytes.toString('utf8')};}
 async put(key,value,options={}){this.puts++;if(this.hook){const h=this.hook;this.hook=null;await h(key);}if(options.onlyIf?.get('If-None-Match')==='*'&&this.map.has(key))return null;const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(value);this.map.set(key,{bytes:Buffer.from(bytes),customMetadata:options.customMetadata||{}});return{key,size:bytes.length};}
}
const tables=['production_jobs','production_drafts','production_reviews','production_milestones','production_operations','production_stages','app_state'];
const snapshot=sql=>clone(Object.fromEntries(tables.map(t=>[t,sql.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()])));
const status=n=>e=>{assert.equal(e.status,n,e.message);return true};
async function fixture(t,{videoParts=2}={}){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 let hook;class S{constructor(q,args=[]){this.q=q;this.args=args;}bind(...args){return new S(this.q,args);}async first(){return sql.prepare(this.q).get(...this.args)||null;}async all(){return{results:sql.prepare(this.q).all(...this.args)};}async run(){if(hook){const h=hook;hook=null;await h(this.q);}if(db.beforeRun)await db.beforeRun(this.q,this.args);return{meta:{changes:Number(sql.prepare(this.q).run(...this.args).changes)}};}}
 const db={prepare:q=>new S(q),beforeMutation:f=>hook=f,beforeRun:null,beforeBatch:null,batch:async ss=>{if(db.beforeBatch){const h=db.beforeBatch;db.beforeBatch=null;await h(ss);}sql.exec('BEGIN');try{const results=ss.map(s=>({meta:{changes:Number(sql.prepare(s.q).run(...s.args).changes)}}));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const r2=new R2();globalThis.__siteArchiveDB=db;globalThis.__siteArchiveR2=r2;t.after(()=>{sql.close();delete globalThis.__siteArchiveDB;delete globalThis.__siteArchiveR2;});
 sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES('site-synthetic','https://example.org/SYNTHETIC-site','fixture','fixture','SYNTHETIC','SYNTHETIC','fixture','now','视觉影像',0,'m','h','a','m','r',0,'zh')");
 const content=JSON.stringify({script:'SYNTHETIC approved exact script',evidence:[],storyboard:[]}),script=hash(content),contract='c'.repeat(64),source=JSON.stringify({url:'https://example.org/SYNTHETIC-site',category:'视觉影像'});
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at) VALUES(?,'site-synthetic',?,0,'approved',?,?,?,1,1,?,'node',0,1,2,3,'now','now')").run(ID,OWNER,source,JSON.stringify({sha256:'f'.repeat(64)}),contract,script);
 sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,1,'SYNTHETIC',?,?,'SYNTHETIC','now')").run(ID,content,script);
 for(const node of ['source','script'])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,1,?,?,'approved',0,'now','now')").run('SYNTHETIC-'+node,ID,node,script,content);
 await p.confirmMediaScope(ID,OWNER,{confirmed:true,binding:{revision:1,script_hash:script,mode_epoch:0,contract_hash:contract},scope:'private-video',current_id:'',request_id:'SYNTHETIC-scope'});sql.exec("UPDATE production_stages SET status='blocked'");
 const bytes=Buffer.alloc(PART*(videoParts-1)+57,7);bytes.writeUInt32BE(24,0);bytes.write('ftyp',4);
 const native={revision:1,script_hash:script,sha256:hash(bytes),size_bytes:bytes.length,duration:54.9,file_name:'SYNTHETIC-ordinary.mp4',project_id:PROJECT,timeline_id:TIMELINE,source:'SYNTHETIC completed file metadata, not a real export',quality_approved:false,publication:false},candidate=await p.registerNativePromoVideo(ID,native);
 const binding={revision:1,script_hash:script,mode_epoch:0,contract_hash:contract,candidate_id:candidate.id,candidate_sha256:native.sha256,project_id:PROJECT,timeline_id:TIMELINE};
 const review=await p.recordNativeCandidateFeedback(ID,{client_receipt_id:'SYNTHETIC-pass',explicit_user_direction:true,binding,decision:'approved',quote:'SYNTHETIC ordinary voice candidate passed',reported_at:AT,source_thread_id:null,expected_review_id:''},{owner_id:OWNER});
 const packet=(await p.readNativeWorkPacket(ID,OWNER)).packet,body={request_id:'SYNTHETIC-video-1',binding,owner_review_id:review.review_id,scope_id:packet.binding.scope_id,scope_hash:packet.binding.scope_hash,file:{role:'video',sha256:native.sha256,size_bytes:bytes.length,file_name:native.file_name,mime_type:'video/mp4'}};
 return{sql,db,r2,bytes,body,binding,native,script,contract,reviewId:review.review_id};
}
const actor={owner_id:OWNER};
async function upload(f,body=f.body,bytes=f.bytes){const started=await p.startSiteArchive(ID,body,actor),sid=started.archive.site_archive_id;for(let n=0;n<started.archive.part_count;n++){const part=bytes.subarray(n*PART,(n+1)*PART);await p.putSiteArchivePart(ID,{site_archive_id:sid,part:n,chunk_base64:part.toString('base64'),chunk_sha256:hash(part)},actor);}return sid;}
async function sealed(f,body=f.body,bytes=f.bytes){const sid=await upload(f,body,bytes);await p.finalizeSiteArchive(ID,{site_archive_id:sid},actor);return sid;}
async function confirmed(f,body=f.body,bytes=f.bytes){const sid=await sealed(f,body,bytes),pieces=[];for(let n=0;n<Math.ceil(bytes.length/PART);n++){const x=await p.readSiteArchivePart(ID,{site_archive_id:sid,part:n},actor);pieces.push(Buffer.from(x.chunk_base64,'base64'));assert.equal(hash(pieces.at(-1)),x.chunk_sha256);}const actual=Buffer.concat(pieces);assert.equal(hash(actual),body.file.sha256);await p.confirmSiteArchive(ID,{site_archive_id:sid,materialized_sha256:hash(actual),size_bytes:actual.length,verified_at:AT},actor);return sid;}
function returnBody(f,sid){return{revision:1,script_hash:f.script,mode_epoch:0,sha256:hash(f.bytes),size_bytes:f.bytes.length,duration:54.9,site_archive_id:sid,project_id:PROJECT,timeline_id:TIMELINE,render_id:'cccccccc-cccc-cccc-cccc-cccccccccccc',file_name:f.native.file_name,quality_approved:false,publication_authorized:false,new_paid_calls:0,qa:{semantic_listening_passed:false,recovery_receipt_sha256:'d'.repeat(64),final_duration:{schema:'actual-final-duration-v1',file_sha256:hash(f.bytes),probe_sha256:'e'.repeat(64),checked_at:AT,report:{hard_max_seconds:60,hard_duration_pass:true,maximum_measured_seconds:'54.9',measurements_seconds:{container_duration:'54.9',video_0_playback_end:'54.9',audio_0_playback_end:'54.9'},errors:[]}}}};}

const proof=(sha,seconds)=>({schema:'actual-final-duration-v1',file_sha256:sha,probe_sha256:'e'.repeat(64),checked_at:AT,report:{hard_max_seconds:60,hard_duration_pass:true,maximum_measured_seconds:String(seconds),measurements_seconds:{container_duration:String(seconds),video_0_playback_end:String(seconds),audio_0_playback_end:String(seconds)},errors:[]}});
function png(w,h){const b=Buffer.alloc(40);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b;}
async function completedFixture(t,options={}){
 const f=await fixture(t,options),bytes={video:f.bytes,source_bundle:Buffer.from('PK\x03\x04SYNTHETIC old source'),cover_3_4:png(300,400),cover_4_3:png(400,300),promotion:Buffer.from('SYNTHETIC approved promotion\n'),complete_bundle:Buffer.from('PK\x03\x04SYNTHETIC old complete')},archives={};
 for(const[role,data]of Object.entries(bytes)){const file={role,sha256:hash(data),size_bytes:data.length,file_name:role==='video'?f.native.file_name:'SYNTHETIC-'+role+(role.startsWith('cover')?'.png':role==='promotion'?'.txt':'.zip'),mime_type:role==='video'?'video/mp4':role.startsWith('cover')?'image/png':role==='promotion'?'text/plain':'application/zip'};archives[role]=await confirmed(f,{...f.body,request_id:'SYNTHETIC-old-'+role,file},data);}
 const finish=async(node,artifact)=>{const before=await p.getJob(ID),latest=before.milestones.find(m=>m.node===node),r=await p.submitMilestone(ID,node,1,latest?.artifact_version||0,'SYNTHETIC-old-'+node,artifact,0);const m=r.milestones.find(x=>x.node===node);await p.decideMilestone(ID,m.id,1,m.artifact_hash,0,'approve',{reason:''},OWNER);};
 await p.returnNativeDraft(ID,returnBody(f,archives.video),actor);let j=await p.getJob(ID),video=j.milestones.find(m=>m.node==='video');await p.decideMilestone(ID,video.id,1,video.artifact_hash,0,'approve',{reason:''},OWNER);
 await finish('cover',{url:'https://site.example/cover',sha256:hash(bytes.cover_3_4),provider_job_id:archives.cover_3_4,cost:0,qa:{covers:['cover_3_4','cover_4_3'].map(role=>({site_archive_id:archives[role],sha256:hash(bytes[role])}))}});
 await finish('promotion',{text:bytes.promotion.toString(),limits:JSON.stringify({site_archive_id:archives.promotion,sha256:hash(bytes.promotion)})});
 await finish('delivery',{text:'SYNTHETIC complete old delivery',limits:'SYNTHETIC private only'});
 j=await p.getJob(ID);assert.equal(j.status,'completed');assert.equal(j.facts.site_file_archives.length,6);
 const nextBytes=Buffer.from(f.bytes);nextBytes[50]^=99;const m=j.milestones.find(m=>m.node==='video'),a=JSON.parse(m.artifact),packet=(await p.readNativeWorkPacket(ID,OWNER)).packet;
 const begin={request_id:'SYNTHETIC-owner-voice-final-1',binding:{revision:1,script_hash:f.script,mode_epoch:0,contract_hash:f.contract,scope_id:packet.binding.scope_id,scope_hash:packet.binding.scope_hash},base:{milestone_id:m.id,artifact_version:m.artifact_version,artifact_hash:m.artifact_hash,sha256:a.sha256},video:{sha256:hash(nextBytes),size_bytes:nextBytes.length,duration:40.2,file_name:'SYNTHETIC-new-owner-voice.mp4',project_id:PROJECT,timeline_id:'dddddddd-dddd-dddd-dddd-dddddddddddd',render_id:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'},approval:{decision:'approved',source:'owner-oral-report',reviewed_voice_kind:'owner-cloned',quote:'SYNTHETIC explicit final accepted after watching',reported_at:AT,source_thread_id:null,website_button_clicked:false},qa:{final_duration:proof(hash(nextBytes),40.2),recovery_receipt_sha256:'d'.repeat(64),full_decode_pass:true,script_words_preserved:true,semantic_listening_passed:false},adjustments:{narration:{tempo:1.12,preserve_pitch:true},outro:{frames:120,rate:1},caption:{left:64,top:1100}},carried_materials:Object.fromEntries(['cover_3_4','cover_4_3','promotion'].map(role=>[role,{site_archive_id:archives[role],sha256:hash(bytes[role])}])),publication_authorized:false,new_paid_calls:0,new_generation_authorized:false};
 return{...f,oldJob:j,oldBytes:bytes,oldArchives:archives,nextBytes,begin};
}
async function stageVersion(f){const started=await p.beginApprovedNativeVersion(ID,f.begin,actor),ids={},context=started.archive_context;for(const role of ['video','source_bundle','cover_3_4','cover_4_3','promotion','complete_bundle']){const data=role==='video'?f.nextBytes:['source_bundle','complete_bundle'].includes(role)?Buffer.from('PK\x03\x04SYNTHETIC new '+role):f.oldBytes[role],file={role,sha256:hash(data),size_bytes:data.length,file_name:role==='video'?f.begin.video.file_name:'SYNTHETIC-new-'+role+(role.startsWith('cover')?'.png':role==='promotion'?'.txt':'.zip'),mime_type:role==='video'?'video/mp4':role.startsWith('cover')?'image/png':role==='promotion'?'text/plain':'application/zip'};ids[role]=await confirmed(f,{request_id:'SYNTHETIC-new-'+context.version_request_id+'-'+role,...context,file},data);}return{started,ids};}
function localMix(f){const b=clone(f.begin);b.video={...b.video,render_id:null,delivery_method:'local-audio-only-finishing',local_audio_proof:{schema:'local-audio-only-finishing-v1',base_video_sha256:b.base.sha256,output_video_sha256:b.video.sha256,source_video_stream_sha256:'9'.repeat(64),output_video_stream_sha256:'9'.repeat(64),video_stream_unchanged:true,music_sha256:hash('SYNTHETIC approved music bytes'),music_gain_db:-15,audio_codec:'aac',audio_bitrate_kbps:192,recovery_receipt_sha256:b.qa.recovery_receipt_sha256,checked_at:AT}};return b;}

const ROLES=['video','source_bundle','cover_3_4','cover_4_3','promotion','complete_bundle'];
const policyBody=()=>({request_id:'SYNTHETIC-retain-current-final',confirmed:true,rule:'current-final-per-role',quote:'SYNTHETIC final delivery: retain only the current final artifact per project and role.',reported_at:AT,source:'owner-oral-report',website_button_clicked:false,current_policy_id:''});
const prefixFor=id=>'site-private-archives/v1/'+id+'/';
const keysFor=(f,id)=>[...f.r2.map.keys()].filter(key=>key.startsWith(prefixFor(id)));
async function acceptedFixture(t,{local=false}={}){const f=await completedFixture(t);if(local)f.begin=localMix(f);const {started,ids}=await stageVersion(f);await p.commitApprovedNativeVersion(ID,{version_request_id:started.version.version_id,archives:ids},actor);return{...f,started,ids};}
async function enable(id=ID){return p.setSiteRetentionPolicy(id,policyBody(),actor);}
async function plan(id=ID,extra={}){return(await p.planSiteRetention(id,{request_id:'SYNTHETIC-prune-old',...extra},actor)).plan;}
async function finish(id,first){let current=first;for(let n=0;n<40&&!['complete','protected'].includes(current.status);n++)current=(await p.applySiteRetention(id,{plan_id:current.plan_id,max_objects:16},actor)).plan;assert.ok(['complete','protected'].includes(current.status),current.last_error||current.status);return current;}
async function assertCurrentReadable(f,id=ID){for(const role of ROLES){const file=await p.readSiteArchiveFile(id,f.ids[role],OWNER),actual=Buffer.from(await new Response(file.body).arrayBuffer()),expected=role==='video'?f.nextBytes:['source_bundle','complete_bundle'].includes(role)?Buffer.from('PK\x03\x04SYNTHETIC new '+role):f.oldBytes[role];assert.deepEqual(actual,expected,role);assert.ok(keysFor(f,f.ids[role]).length>=2,role);}}
function rekey(f,next){f.sql.exec('PRAGMA foreign_keys=OFF');for(const table of ['production_drafts','production_reviews','production_milestones','production_operations','production_stages','production_data_videos'])f.sql.prepare('UPDATE '+table+' SET job_id=? WHERE job_id=?').run(next,ID);f.sql.prepare('UPDATE production_jobs SET id=? WHERE id=?').run(next,ID);for(const row of f.sql.prepare('SELECT key,value FROM app_state').all())f.sql.prepare('UPDATE app_state SET key=?,value=? WHERE key=?').run(row.key.replaceAll(ID,next),row.value.replaceAll(ID,next),row.key);}

test('SYNTHETIC no policy grants no deletion capability, including automatic completed-delivery trigger',async t=>{
 const f=await acceptedFixture(t),before=snapshot(f.sql),keys=[...f.r2.map.keys()];
 await assert.rejects(()=>plan(),status(409));await p.triggerSiteRetention(ID);
 assert.deepEqual([...f.r2.map.keys()],keys);assert.equal(f.r2.deletedKeys.length,0);assert.deepEqual(snapshot(f.sql),before);assert.equal((await p.readSiteRetention(ID,{},actor)).policy,null);
});

test('SYNTHETIC retention policy requires the real owner and oral direction, preserves the quote and is immutable per request',async t=>{
 const f=await acceptedFixture(t),body=policyBody(),before=snapshot(f.sql);
 await assert.rejects(()=>p.setSiteRetentionPolicy(ID,body,{owner_id:'SYNTHETIC-other'}),status(403));
 for(const b of [{...body,confirmed:false},{...body,website_button_clicked:true},{...body,source:'website-button'},{...body,rule:'delete-everything'}])await assert.rejects(()=>p.setSiteRetentionPolicy(ID,b,actor),status(400));
 assert.deepEqual(snapshot(f.sql),before);const enabled=await enable();assert.equal(enabled.policy.quote,body.quote);assert.equal(enabled.policy.website_button_clicked,false);assert.equal(Object.hasOwn(enabled.policy,'owner_id'),false);
 assert.equal((await enable()).replayed,true);await assert.rejects(()=>p.setSiteRetentionPolicy(ID,{...body,quote:'SYNTHETIC changed quote'},actor),status(409));await assert.rejects(()=>p.readSiteRetention(ID,{}, {owner_id:'SYNTHETIC-other'}),status(403));assert.equal(f.r2.deletedKeys.length,0);
});

test('SYNTHETIC deletes only six superseded archives, validates head and list, returns 410 and preserves current bytes plus all old audit records',async t=>{
 const f=await acceptedFixture(t);await enable();const milestones=clone(f.sql.prepare('SELECT * FROM production_milestones ORDER BY id').all()),reviews=clone(f.sql.prepare("SELECT * FROM production_reviews WHERE decision NOT LIKE 'site_retention_%' ORDER BY id").all()),prepared=await plan();
 assert.equal(prepared.status,'pending');assert.equal(prepared.candidates.length,6);assert.equal(prepared.pending_count,6);assert.deepEqual(prepared.keep,f.ids);assert.equal(prepared.candidates.some(c=>Object.values(f.ids).includes(c.site_archive_id)),false);
 // Carried cover/promotion bytes are identical; identity, not SHA alone, protects the current copy.
 for(const role of ['cover_3_4','cover_4_3','promotion'])assert.ok(prepared.candidates.some(c=>c.site_archive_id===f.oldArchives[role]&&c.sha256===hash(f.oldBytes[role])));
 const done=await finish(ID,prepared);assert.equal(done.status,'complete');assert.equal(done.pending_count,0);
 for(const old of Object.values(f.oldArchives)){assert.equal(keysFor(f,old).length,0);await assert.rejects(()=>p.readSiteArchiveFile(ID,old,OWNER),status(410));await assert.rejects(()=>p.readSiteArchivePart(ID,{site_archive_id:old,part:0},actor),status(410));await assert.rejects(()=>p.readSiteArchivePart(ID,{site_archive_id:old,part:0},{trusted_owner_service:true}),status(410));assert.ok(f.r2.listCalls.some(v=>v.prefix===prefixFor(old)));}
 assert.ok(f.r2.headKeys.length>=13);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='site_archive_deleted_v1'").get().n,6);
 assert.deepEqual(clone(f.sql.prepare('SELECT * FROM production_milestones ORDER BY id').all()),milestones);assert.deepEqual(clone(f.sql.prepare("SELECT * FROM production_reviews WHERE decision NOT LIKE 'site_retention_%' AND decision<>'site_archive_deleted_v1' ORDER BY id").all()),reviews);
 await assertCurrentReadable(f);const previous=f.r2.deletedKeys.length;assert.equal((await p.applySiteRetention(ID,{plan_id:done.plan_id},actor)).replayed,true);assert.equal(f.r2.deletedKeys.length,previous);
});

test('SYNTHETIC partial physical failure does not report deletion and an idempotent retry finishes without touching current output',async t=>{
 const f=await acceptedFixture(t);await enable();const prepared=await plan(),first=prepared.candidates[0];assert.ok(first);
 f.r2.failDeleteOnce='manifest.json';let failed=(await p.applySiteRetention(ID,{plan_id:prepared.plan_id,max_objects:16},actor)).plan;
 assert.equal(failed.status,'failed');assert.match(failed.last_error,/SYNTHETIC injected/);assert.equal(failed.candidates.find(c=>c.site_archive_id===first.site_archive_id).done,false);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='site_archive_deleted_v1'").get().n,0);
 assert.equal(JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('site_archive_retention_v1:'+first.site_archive_id).value).status,'deleting');await assertCurrentReadable(f);
 const done=await finish(ID,failed);assert.equal(done.status,'complete');await assertCurrentReadable(f);
});

test('SYNTHETIC a retained physical object fails head validation and an extra prefix object fails list validation',async t=>{
 const f=await acceptedFixture(t);await enable();const prepared=await plan(),first=prepared.candidates[0];f.r2.retainDeleteKey=first.keys[0];
 let failed=(await p.applySiteRetention(ID,{plan_id:prepared.plan_id,max_objects:16},actor)).plan;assert.equal(failed.status,'failed');assert.match(failed.last_error,/删除尚未验证/);assert.equal(failed.candidates[0].done,false);
 f.r2.retainDeleteKey=null;const extra=prefixFor(first.site_archive_id)+'SYNTHETIC-extra-object';f.r2.map.set(extra,{bytes:Buffer.from('SYNTHETIC unplanned object'),customMetadata:{}});
 failed=(await p.applySiteRetention(ID,{plan_id:prepared.plan_id,max_objects:16},actor)).plan;assert.equal(failed.status,'failed');assert.match(failed.last_error,/前缀仍有物理对象/);assert.equal(failed.candidates[0].done,false);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='site_archive_deleted_v1'").get().n,0);
 f.r2.map.delete(extra);assert.equal((await finish(ID,failed)).status,'complete');await assertCurrentReadable(f);
});

test('SYNTHETIC per-call physical budget is enforced and partial receipts are truthful',async t=>{
 const f=await acceptedFixture(t);await enable();const prepared=await plan();for(const max_objects of [0,17,1.5])await assert.rejects(()=>p.applySiteRetention(ID,{plan_id:prepared.plan_id,max_objects},actor),status(400));
 const partial=(await p.applySiteRetention(ID,{plan_id:prepared.plan_id,max_objects:1},actor)).plan;assert.equal(f.r2.deletedKeys.length,1);assert.equal(partial.status,'partial');assert.equal(partial.pending_count,6);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='site_archive_deleted_v1'").get().n,0);await assertCurrentReadable(f);
});

test('SYNTHETIC changed current draft/owner/version after planning prevents physical deletion',async t=>{
 const f=await acceptedFixture(t);await enable();const prepared=await plan(),keys=[...f.r2.map.keys()];f.sql.prepare('UPDATE production_jobs SET mode_epoch=mode_epoch+1 WHERE id=?').run(ID);
 await assert.rejects(()=>p.applySiteRetention(ID,{plan_id:prepared.plan_id,max_objects:16},actor),status(409));assert.deepEqual([...f.r2.map.keys()],keys);assert.equal(f.r2.deletedKeys.length,0);
});

test('SYNTHETIC a staged replacement blocks cleanup before any physical operation',async t=>{
 const f=await acceptedFixture(t);await enable();const prepared=await plan();f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run('approved_native_version_v1:'+ID+':apv_'+'1'.repeat(64),JSON.stringify({status:'staging'}));
 await assert.rejects(()=>p.applySiteRetention(ID,{plan_id:prepared.plan_id},actor),status(409));assert.equal(f.r2.deletedKeys.length,0);await assertCurrentReadable(f);
});

test('SYNTHETIC pending MiniCPM cannot be cleaned even with a valid standing owner policy',async t=>{
 const f=await acceptedFixture(t);await enable();const mini='job_9ef39025-d92e-4770-82d0-05881451c5df';rekey(f,mini);f.sql.prepare("UPDATE production_jobs SET status='awaiting_human' WHERE id=?").run(mini);
 await assert.rejects(()=>plan(mini),status(409));assert.equal(f.r2.deletedKeys.length,0);assert.equal([...f.r2.map.keys()].length,26);
});

test('SYNTHETIC current local-audio base is protected until a verified embedded source proof binds the current source ZIP',async t=>{
 const f=await acceptedFixture(t,{local:true});await enable();const noProof=await plan();assert.equal(noProof.protected.length,1);assert.equal(noProof.protected[0].site_archive_id,f.oldArchives.video);assert.match(noProof.protected[0].reason,/原视频尚无当前源包内嵌核验证明/);assert.equal(noProof.candidates.length,5);
 const source=await p.getSiteArchiveMetadata(ID,f.ids.source_bundle,OWNER),dependency_proof={source_bundle_id:f.ids.source_bundle,source_bundle_sha256:source.file.sha256,source_bundle_size_bytes:source.file.size_bytes,embedded_sources:[{path:'sources/SYNTHETIC-base.mp4',sha256:hash(f.bytes),size_bytes:f.bytes.length}],checked_at:AT,zip_crc_passed:true,actual_full_zip_sha256_verified:true};
 for(const change of [{source_bundle_id:f.oldArchives.source_bundle},{source_bundle_sha256:'0'.repeat(64)},{source_bundle_size_bytes:1},{zip_crc_passed:false},{actual_full_zip_sha256_verified:false}])await assert.rejects(()=>plan(ID,{request_id:'SYNTHETIC-bad-proof',dependency_proof:{...dependency_proof,...change}}),status(400));
 const proved=await plan(ID,{request_id:'SYNTHETIC-proved-source',dependency_proof});assert.equal(proved.protected.length,0);assert.equal(proved.candidates.length,6);assert.equal((await finish(ID,proved)).status,'complete');await assert.rejects(()=>p.readSiteArchiveFile(ID,f.oldArchives.video,OWNER),status(410));await assertCurrentReadable(f);
});

test('SYNTHETIC fully approved future project is supported without historical Hesai/Japanese ID whitelists',async t=>{
 const f=await acceptedFixture(t),other='job_01234567-89ab-cdef-0123-456789abcdef';rekey(f,other);await enable(other);const prepared=await plan(other);assert.equal(prepared.candidates.length,6);assert.equal((await finish(other,prepared)).status,'complete');await assertCurrentReadable(f,other);
});

function addCurrentSourceReference(f,archiveId){
 const other='job_9ef39025-d92e-4770-82d0-05881451c5df';
 f.sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES('site-synthetic-shared','https://example.org/SYNTHETIC-shared','shared-fixture','fixture','SYNTHETIC shared','SYNTHETIC shared','fixture','now','视觉影像',0,'m','h','a','m','r',0,'zh')");
 f.sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at) SELECT ?,'site-synthetic-shared',owner_id,0,'awaiting_human',?,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at FROM production_jobs WHERE id=?").run(other,JSON.stringify({kind:'SYNTHETIC current reusable source',site_archive_id:archiveId}),ID);
 return other;
}

test('SYNTHETIC another live project current source protects an exact old archive, including pending MiniCPM',async t=>{
 const f=await acceptedFixture(t);await enable();const other=addCurrentSourceReference(f,f.oldArchives.video),prepared=await plan();
 assert.equal(prepared.candidates.some(c=>c.site_archive_id===f.oldArchives.video),false);assert.ok(prepared.protected.some(c=>c.site_archive_id===f.oldArchives.video&&c.reason.includes(other)));
 const done=await finish(ID,prepared);assert.equal(done.status,'protected');assert.ok(keysFor(f,f.oldArchives.video).length>0);assert.equal(f.r2.deletedKeys.some(k=>k.startsWith(prefixFor(f.oldArchives.video))),false);
 const file=await p.readSiteArchiveFile(ID,f.oldArchives.video,OWNER);assert.equal(hash(Buffer.from(await new Response(file.body).arrayBuffer())),hash(f.bytes));await assertCurrentReadable(f);
});

test('SYNTHETIC a shared current source introduced after planning is rechecked before every physical delete',async t=>{
 const f=await acceptedFixture(t);await enable();const prepared=await plan();assert.equal(prepared.candidates.length,6);const other=addCurrentSourceReference(f,f.oldArchives.video),done=await finish(ID,prepared);
 assert.equal(done.status,'protected');assert.ok(done.protected.some(c=>c.site_archive_id===f.oldArchives.video&&c.reason.includes(other)));assert.ok(keysFor(f,f.oldArchives.video).length>0);assert.equal(f.r2.deletedKeys.some(k=>k.startsWith(prefixFor(f.oldArchives.video))),false);await assertCurrentReadable(f);
});

test('SYNTHETIC successful completed-version commit automatically converges all six old roles across a greater-than-16-part video',async t=>{
 const f=await completedFixture(t,{videoParts:18});assert.equal(Math.ceil(f.bytes.length/PART),18);await enable();const{started,ids}=await stageVersion(f);
 await p.commitApprovedNativeVersion(ID,{version_request_id:started.version.version_id,archives:ids},actor);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='site_archive_deleted_v1'").get().n,6);for(const old of Object.values(f.oldArchives))assert.equal(keysFor(f,old).length,0,old);
 assert.ok(f.r2.deleteCalls.length>6);assert.ok(f.r2.deleteCalls.every(keys=>keys.length>0&&keys.length<=16));const latest=await p.getJob(ID);assert.equal(latest.status,'completed');assert.equal(latest.facts.archive_retention.status,'complete');assert.equal(latest.facts.archive_retention.pending_count,0);await assertCurrentReadable({...f,ids});
});

test('SYNTHETIC a failed final prefix verification resumes metadata only without sending an empty R2 delete',async t=>{
 const f=await acceptedFixture(t);await enable();const prepared=await plan(),first=prepared.candidates[0],extra=prefixFor(first.site_archive_id)+'SYNTHETIC-unexpected';f.r2.rejectEmptyDelete=true;f.r2.map.set(extra,{bytes:Buffer.from('SYNTHETIC extra'),customMetadata:{}});
 const failed=(await p.applySiteRetention(ID,{plan_id:prepared.plan_id,max_objects:16},actor)).plan;assert.equal(failed.status,'failed');assert.equal(failed.candidates[0].removed.length,failed.candidates[0].keys.length);assert.equal(failed.candidates[0].done,false);
 f.r2.map.delete(extra);const done=await finish(ID,failed);assert.equal(done.status,'complete');assert.equal(f.r2.deleteCalls.some(keys=>keys.length===0),false);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='site_archive_deleted_v1'").get().n,6);await assertCurrentReadable(f);
});

test('SYNTHETIC a lost last status audit is repaired by completed-plan replay without deleting bytes twice',async t=>{
 const f=await acceptedFixture(t);await enable();let prepared=await plan();while(prepared.pending_count>1)prepared=(await p.applySiteRetention(ID,{plan_id:prepared.plan_id,max_objects:16},actor)).plan;
 f.db.beforeRun=(query,args)=>{if(query.startsWith('INSERT INTO production_reviews')&&args.includes('site_retention_status_v1')&&args.some(v=>typeof v==='string'&&v.includes('"status":"complete"'))){f.db.beforeRun=null;throw new Error('SYNTHETIC lost final status audit');}};
 await assert.rejects(()=>p.applySiteRetention(ID,{plan_id:prepared.plan_id,max_objects:16},actor),/SYNTHETIC lost final status audit/);const read=await p.readSiteRetention(ID,{plan_id:prepared.plan_id},actor);assert.equal(read.plan.status,'complete');const removed=f.r2.deletedKeys.length;
 const replay=await p.applySiteRetention(ID,{plan_id:prepared.plan_id},actor);assert.equal(replay.replayed,true);assert.equal(replay.plan.status,'complete');assert.equal((await p.getJob(ID)).facts.archive_retention.status,'complete');assert.equal(f.r2.deletedKeys.length,removed);await assertCurrentReadable(f);
});

test('SYNTHETIC a failed plan progress write resumes after lease expiry with one immutable deletion audit',async t=>{
 const f=await acceptedFixture(t);await enable();const prepared=await plan();let injected=false;
 f.db.beforeRun=(query,args)=>{if(!injected&&query.startsWith('UPDATE app_state SET value=? WHERE key=? AND value=?')&&args[1]?.startsWith('site_retention_plan_v1:')&&typeof args[0]==='string'&&!JSON.parse(args[0]).lease_token){injected=true;f.db.beforeRun=null;throw new Error('SYNTHETIC lost plan progress write');}};
 await assert.rejects(()=>p.applySiteRetention(ID,{plan_id:prepared.plan_id,max_objects:16},actor),/SYNTHETIC lost plan progress write/);assert.equal(injected,true);const key='site_retention_plan_v1:'+ID+':'+prepared.plan_id,claimed=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(key).value);assert.ok(claimed.lease_token);claimed.lease_until=Date.now()-1;f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(claimed),key);
 const done=await finish(ID,(await p.readSiteRetention(ID,{plan_id:prepared.plan_id},actor)).plan);assert.equal(done.status,'complete');assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='site_archive_deleted_v1'").get().n,6);await assertCurrentReadable(f);
});

test('SYNTHETIC the atomic cleanup lease blocks a new approved-version stage until it is released',async t=>{
 const f=await acceptedFixture(t);await enable();const prepared=await plan(),job=await p.getJob(ID),m=job.milestones.filter(m=>m.node==='video').sort((a,b)=>b.artifact_version-a.artifact_version)[0],a=JSON.parse(m.artifact);
 const body=clone(f.begin);body.request_id='SYNTHETIC-version-after-cleanup';body.base={milestone_id:m.id,artifact_version:m.artifact_version,artifact_hash:m.artifact_hash,sha256:a.sha256};
 const video=Buffer.from(f.nextBytes);video[55]^=88;body.video.sha256=hash(video);body.video.timeline_id='99999999-9999-9999-9999-999999999999';body.video.render_id='88888888-8888-8888-8888-888888888888';body.qa.final_duration=proof(hash(video),body.video.duration);
 body.carried_materials=Object.fromEntries(['cover_3_4','cover_4_3','promotion'].map(role=>[role,{site_archive_id:f.ids[role],sha256:hash(f.oldBytes[role])}]));
 const key='site_retention_plan_v1:'+ID+':'+prepared.plan_id,record=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(key).value);record.lease_token='SYNTHETIC-active-delete';record.lease_until=Date.now()+120000;f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(record),key);
 await assert.rejects(()=>p.beginApprovedNativeVersion(ID,body,actor),status(409));
 delete record.lease_token;delete record.lease_until;f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(record),key);
 const begun=await p.beginApprovedNativeVersion(ID,body,actor);assert.equal(begun.version.status,'staging');assert.equal(f.r2.deletedKeys.length,0);
});

test('SYNTHETIC an older waiting review remains an audit record and cannot block the latest fully approved delivery cleanup',async t=>{
 const f=await acceptedFixture(t),old=f.oldJob.milestones.find(m=>m.node==='video');
 f.sql.prepare("UPDATE production_milestones SET status='awaiting_human' WHERE id=?").run(old.id);
 await enable();const done=await finish(ID,await plan());assert.equal(done.status,'complete');
 assert.equal(f.sql.prepare('SELECT status FROM production_milestones WHERE id=?').get(old.id).status,'awaiting_human');await assertCurrentReadable(f);
});

test('SYNTHETIC plain app-state timestamps are safe and malformed in-flight records fail closed',async t=>{
 const f=await acceptedFixture(t);await enable();
 f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run('last_refresh','2026-10-17T20:00:00.000Z');
 f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run('seeds_v1','2026-10-10T10:00:00.000Z');
 const prepared=await plan();assert.equal(prepared.status,'pending');
 f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run('pending_native_site_v1:'+ID+':SYNTHETIC-corrupt','not-json');
 await assert.rejects(()=>p.planSiteRetention(ID,{request_id:'SYNTHETIC-corrupt-staging'},actor),status(409));
 await assert.rejects(()=>p.applySiteRetention(ID,{plan_id:prepared.plan_id},actor),status(409));
 assert.equal(f.r2.deletedKeys.length,0);
});

