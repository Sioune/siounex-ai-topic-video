// SYNTHETIC in-memory data and owner/archive fixtures only. No remote calls or real publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

const SHA='a'.repeat(64),SCRIPT='b'.repeat(64),ARCHIVE='sitefile_'+'c'.repeat(64),JOB='SYNTHETIC-publication-job',OWNER='SYNTHETIC-owner';
await build({stdin:{contents:"export * from './lib/production-publication';export * from './lib/publication-collections';export {publicationDetails,clickedPublicationDetails,publicationLabel} from './lib/publication-details.mts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/publication-collections-test.mjs',plugins:[{name:'synthetic-publication-boundaries',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'store',namespace:'synthetic'}));
 b.onResolve({filter:/^\.\/production$/},()=>({path:'production',namespace:'synthetic'}));
 b.onResolve({filter:/^\.\/site-file-archive$/},()=>({path:'archive',namespace:'synthetic'}));
 b.onLoad({filter:/.*/,namespace:'synthetic'},args=>({contents:args.path==='store'?'export function db(){return globalThis.__publicationCollections.db}':args.path==='archive'?'export async function getSiteArchiveMetadata(id,sid,owner){const f=globalThis.__publicationCollections;if(owner!==f.owner||sid!==f.archive.site_archive_id)throw Error("SYNTHETIC archive owner mismatch");f.archiveReads++;f.archiveReadHook?.();return structuredClone(f.archive)}':'export async function getJob(id,owner){const f=globalThis.__publicationCollections;if(id!==f.job.id||owner!==f.owner)throw Error("SYNTHETIC job owner mismatch");return structuredClone(f.job)}'}));
}}]});
const api=await import('../.sites-runtime/publication-collections-test.mjs');

function fixture(t){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 class Statement{constructor(query,args=[]){this.query=query;this.args=args}bind(...args){return new Statement(this.query,args)}async first(){return sql.prepare(this.query).get(...this.args)||null}async all(){return {results:sql.prepare(this.query).all(...this.args)}}async run(){return {results:[],meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}}}execute(){return /^\s*SELECT/i.test(this.query)?{results:sql.prepare(this.query).all(...this.args)}:{results:[],meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}}}}
 const db={prepare:query=>new Statement(query),async batch(statements){sql.exec('BEGIN');try{const out=statements.map(statement=>statement.execute());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const stamp=new Date(Date.now()-10*86400000).toISOString();
 sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated) VALUES ('SYNTHETIC-topic','https://synthetic.invalid/topic','synthetic','synthetic','SYNTHETIC video title','synthetic','synthetic',?,'AI实用',1,'m','h','a','m','r',0)").run(stamp);
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,created_at,updated_at) VALUES (?,'SYNTHETIC-topic',?,0,'completed','{}','{}','SYNTHETIC-contract',3,3,?,'node',0,?,?)").run(JOB,OWNER,SCRIPT,stamp,stamp);
 const artifact={sha256:SHA,duration:56,qa:{site_archive_id:ARCHIVE}},milestones=[{id:'SYNTHETIC-video',node:'video',revision:3,mode_epoch:0,artifact_version:1,status:'approved',artifact:JSON.stringify(artifact),artifact_hash:'SYNTHETIC-video-hash'},{id:'SYNTHETIC-delivery',node:'delivery',revision:3,mode_epoch:0,artifact_version:1,status:'approved',artifact:'{}',artifact_hash:'SYNTHETIC-delivery-hash'}];
 for(const m of milestones)sql.prepare('INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(m.id,JOB,m.node,m.revision,m.artifact_version,m.artifact_hash,m.artifact,m.status,m.mode_epoch,stamp,stamp);
 const archive={schema:'site-private-file-archive-v1',site_archive_id:ARCHIVE,storage:'site-private-r2',binding:{revision:3,script_hash:SCRIPT,mode_epoch:0,contract_hash:'SYNTHETIC-contract'},owner_review_id:'SYNTHETIC-review',scope_id:'SYNTHETIC-scope',scope_hash:'d'.repeat(64),file:{role:'video',sha256:SHA,size_bytes:1000,file_name:'SYNTHETIC-final.mp4',mime_type:'video/mp4'},status:'confirmed',part_size:524288,part_count:1,created_at:stamp,materialized_sha256:SHA,quality_approved:false,publication_authorized:false,new_paid_calls:0};
 const job={id:JOB,topic_id:'SYNTHETIC-topic',is_test:0,status:'completed',revision:3,approved_revision:3,approved_hash:SCRIPT,mode_epoch:0,contract_hash:'SYNTHETIC-contract',milestones,facts:{video_approval:'owner-node-approved',files_archived:true,complete_package_archived:true,candidate_video_sha256:SHA,site_file_archives:[archive]}};
 const f={db,sql,job,archive,owner:OWNER,archiveReads:0};globalThis.__publicationCollections=f;t.after(()=>{sql.close();delete globalThis.__publicationCollections;});
 f.protected=()=>JSON.stringify(['production_jobs','production_milestones','production_reviews','production_operations','production_stages'].map(table=>sql.prepare('SELECT * FROM '+table+' ORDER BY id').all()));
 f.publish=(changes={})=>api.publishProduction(OWNER,{job_id:JOB,request_id:'SYNTHETIC-click',...changes});
 f.evidence=(id,owner=OWNER)=>sql.prepare("INSERT INTO production_data_evidence(id,owner_id,file_name,content_type,sha256,size_bytes,image_base64,captured_at,created_at) VALUES (?,?,?,'image/png',?,20,'SYNTHETIC',NULL,?)").run(id,owner,id+'.png',id.padEnd(64,'0'),new Date().toISOString());
 f.sample=(videoId,kind,observed,changes={})=>{const id='SYNTHETIC-sample-'+crypto.randomUUID();sql.prepare('INSERT INTO production_data_samples(id,video_id,sample_kind,relation_id,observed_at,metrics,evidence_ids,note,record_hash,request_id,created_at) VALUES (?,?,?,NULL,?,?,?,?,?,?,?)').run(id,videoId,kind,observed,JSON.stringify(changes.metrics||{plays:12}),'[]',changes.note||'SYNTHETIC real recorded observation',id,id,new Date().toISOString());return id;};
 f.correct=(videoId,published,source)=>{const prior=sql.prepare('SELECT * FROM production_data_videos WHERE id=?').get(videoId),id='SYNTHETIC-correction-'+crypto.randomUUID();sql.prepare('INSERT INTO production_data_videos(id,owner_id,title,topic_type,published_at,publication_source,job_id,supersedes_id,duration,record_hash,request_id,created_at) VALUES (?,?,?,\'other\',?,?,NULL,?,56,?,?,?)').run(id,OWNER,'SYNTHETIC corrected title',published,source??prior.publication_source,videoId,id,id,new Date(Date.now()+1000).toISOString());return id;};
 return f;
}

test('a true delayed target-labelled sample completes its task without treating a late snapshot as strict T24',async t=>{
 const f=fixture(t),published=new Date(Date.now()-72*3600000).toISOString(),result=await f.publish({published_at:published}),video=result.publication.video_id,late=new Date(Date.parse(published)+31*3600000).toISOString();
 f.sample(video,'single_snapshot',late);assert.equal((await api.readPublicationCollections(OWNER)).collections.find(c=>c.target_hours===24).status,'due');
 const sample=f.sample(video,'single_t24',late);const c=(await api.readPublicationCollections(OWNER)).collections.find(c=>c.target_hours===24);assert.equal(c.status,'sampled');assert.deepEqual(c.sample_ids,[sample]);assert.equal((await api.readDueCollectionReminders(OWNER)).reminders.filter(r=>r.target_hours===24).length,0);
});

test('default click records one server time, immutable current video binding and exactly two windows without production mutations',async t=>{
 const f=fixture(t),before=f.protected(),start=Date.now();
 assert.equal((await api.readProductionPublication(OWNER,JOB)).can_publish,true);
 const first=await f.publish(),v=first.publication;
 assert.ok(v);assert.equal(first.replayed,false);assert.equal(first.can_publish,false);assert.equal(v.time_source,'owner_click');assert.ok(Date.parse(v.published_at)>=start);assert.equal(v.video_sha256,SHA);assert.equal(v.site_archive_id,ARCHIVE);assert.equal(f.archiveReads,1);
 assert.deepEqual(first.collections.map(c=>c.target_hours).sort(),[24,48]);
 for(const c of first.collections){assert.equal(Date.parse(c.due_at)-Date.parse(v.published_at),c.target_hours*3600000);assert.equal(c.status,'scheduled');assert.deepEqual(c.evidence,[]);}
 const replay=await f.publish({request_id:'SYNTHETIC-second-click',published_at:new Date(Date.now()-100000).toISOString(),platform:'douyin'});
 assert.equal(replay.replayed,true);assert.deepEqual(replay.publication,v);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_videos').get().n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_collections').get().n,2);assert.equal(f.protected(),before);
 assert.equal((await api.readDueCollectionReminders(OWNER)).reminders.length,0);
});

test('owner, completion, archive binding, platform, future time and missing request reject before publication',async t=>{
 const f=fixture(t);await assert.rejects(()=>api.publishProduction('SYNTHETIC-other',{job_id:JOB,request_id:'SYNTHETIC'}));
 for(const field of [{platform:'__proto__'},{published_at:new Date(Date.now()+3600000).toISOString()},{published_at:'2026-10-18T01:00'},{platform_url:'javascript:alert(1)'},{request_id:''}])await assert.rejects(()=>f.publish(field));
 f.job.status='approved';await assert.rejects(()=>f.publish());f.job.status='completed';f.archive.binding.script_hash='SYNTHETIC-stale';await assert.rejects(()=>f.publish());
 assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_videos').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_collections').get().n,0);
});

test('explicit publication time supports stable concurrent business dedupe and RFC calendar alarms',async t=>{
 const f=fixture(t),published=new Date(Date.now()-2*3600000).toISOString();
 const concurrent=await Promise.all([f.publish({published_at:published,platform:'wechat_channels',platform_url:'https://synthetic.invalid/video'}),f.publish({request_id:'SYNTHETIC-concurrent-first',published_at:published,platform:'wechat_channels',platform_url:'https://synthetic.invalid/video'})]),first=concurrent.find(x=>!x.replayed);
 assert.ok(first);assert.equal(concurrent.filter(x=>x.replayed).length,1);assert.equal(concurrent[0].publication.id,concurrent[1].publication.id);
 assert.equal(first.publication.time_source,'owner_entered');assert.equal(first.publication.published_at,published);assert.equal(first.publication.platform,'wechat_channels');
 const [a,b]=await Promise.all([f.publish({request_id:'SYNTHETIC-A'}),f.publish({request_id:'SYNTHETIC-B'})]);assert.equal(a.publication.id,b.publication.id);
 const ics=await api.collectionCalendar(OWNER,first.publication.video_id,'https://synthetic.invalid');assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,2);assert.equal((ics.match(/BEGIN:VALARM/g)||[]).length,2);assert.match(ics,/TRIGGER:PT0M/);assert.match(ics,/URL:https:\/\/synthetic.invalid\/data\/upload\?collection=/);assert.ok(ics.endsWith('\r\n'));
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75,'RFC byte folding');
});

test('mobile screenshot attachment is owner bound, durable and idempotent without fabricating metrics',async t=>{
 const f=fixture(t),result=await f.publish({published_at:new Date(Date.now()-72*3600000).toISOString()}),collection=result.collections[0];f.evidence('SYNTHETIC-own-image');f.evidence('SYNTHETIC-other-image','SYNTHETIC-other');
 await assert.rejects(()=>api.attachCollectionEvidence('SYNTHETIC-other',{collection_id:collection.id,evidence_id:'SYNTHETIC-own-image'}));await assert.rejects(()=>api.attachCollectionEvidence(OWNER,{collection_id:collection.id,evidence_id:'SYNTHETIC-other-image'}));
 const body={collection_id:collection.id,evidence_id:'SYNTHETIC-own-image'},attached=await api.attachCollectionEvidence(OWNER,body),again=await api.attachCollectionEvidence(OWNER,body);
 assert.equal(attached.replayed,false);assert.equal(again.replayed,true);assert.equal(again.collections[0].status,'uploaded');assert.equal(again.collections[0].evidence[0].captured_at,null);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_samples').get().n,0);
 assert.equal((await api.readDueCollectionReminders(OWNER)).reminders.length,1);assert.equal((await api.readPublicationCollections('SYNTHETIC-other')).collections.length,0);
});

test('reminders expose only due uncollected windows and mark generation once, never external delivery',async t=>{
 const f=fixture(t);await f.publish({published_at:new Date(Date.now()-30*3600000).toISOString()});
 const due=await api.readDueCollectionReminders(OWNER);assert.equal(due.reminders.length,1);assert.equal(due.reminders[0].target_hours,24);
 await assert.rejects(()=>api.markCollectionRemindersGenerated('SYNTHETIC-other',{reminder_ids:[due.reminders[0].id],request_id:'SYNTHETIC-foreign'}));
 const first=await api.markCollectionRemindersGenerated(OWNER,{reminder_ids:[due.reminders[0].id],request_id:'SYNTHETIC-generation'});assert.equal(first.notification_delivery,'not_asserted');assert.equal(first.replayed,false);assert.equal((await api.readDueCollectionReminders(OWNER)).reminders.length,0);
 const again=await api.markCollectionRemindersGenerated(OWNER,{reminder_ids:[due.reminders[0].id],request_id:'SYNTHETIC-retry'});assert.equal(again.replayed,true);assert.equal(again.generated_at,first.generated_at);
 const future=(await api.readPublicationCollections(OWNER)).collections.find(c=>c.target_hours===48),futureId='dcr_'+await crypto.subtle.digest('SHA-256',new TextEncoder().encode(future.id+'\n'+future.due_at)).then(a=>Buffer.from(a).toString('hex'));
 await assert.rejects(()=>api.markCollectionRemindersGenerated(OWNER,{reminder_ids:[futureId],request_id:'SYNTHETIC-future'}));
});

test('publication corrections remap original collections and samples, recompute due times and invalidate stale reminder anchors',async t=>{
 const f=fixture(t),result=await f.publish({published_at:new Date(Date.now()-72*3600000).toISOString()}),initial=result.publication,originals=result.collections.map(c=>c.id).sort(),reminders=(await api.readDueCollectionReminders(OWNER)).reminders;
 await api.markCollectionRemindersGenerated(OWNER,{reminder_ids:[reminders[0].id],request_id:'SYNTHETIC-original-generation'});
 const correctedAt=new Date(Date.now()-60*3600000).toISOString(),id=f.correct(initial.video_id,correctedAt),revised=await api.readProductionPublication(OWNER,JOB);
 assert.equal(revised.publication.video_id,id);assert.equal(revised.publication.published_at,correctedAt);assert.deepEqual(revised.collections.map(c=>c.id).sort(),originals);assert.ok(revised.collections.every(c=>c.video_id===id&&c.generated_at===null));
 assert.equal((await api.readDueCollectionReminders(OWNER)).reminders.length,2);await assert.rejects(()=>api.markCollectionRemindersGenerated(OWNER,{reminder_ids:[reminders[0].id],request_id:'SYNTHETIC-stale-anchor'}));
 const t24=new Date(Date.parse(correctedAt)+24*3600000).toISOString();f.sample(initial.video_id,'single_t24',t24);const current=(await api.readPublicationCollections(OWNER)).collections;assert.equal(current.find(c=>c.target_hours===24).status,'sampled');assert.equal((await api.readDueCollectionReminders(OWNER)).reminders.length,1);
 await f.publish({request_id:'SYNTHETIC-after-correction'});assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_collections').get().n,2);
 f.correct(id,null);const undated=await api.readProductionPublication(OWNER,JOB);assert.equal(undated.can_publish,false);assert.equal(undated.publication.published_at,null);assert.ok(undated.collections.every(c=>c.due_at===null));
});

test('only effective matching actual samples with known metrics stop collection; upload alone stays uploaded',async t=>{
 const f=fixture(t),published=new Date(Date.now()-72*3600000).toISOString(),result=await f.publish({published_at:published}),video=result.publication.video_id,observed=new Date(Date.parse(published)+24*3600000).toISOString();
 f.sample(video,'single_t24',observed,{metrics:{}});f.sample(video,'single_t48',observed);f.sample(video,'single_t24',new Date(Date.parse(published)+8*3600000).toISOString());assert.equal((await api.readDueCollectionReminders(OWNER)).reminders.length,2);
 const valid=f.sample(video,'single_snapshot',observed);assert.equal((await api.readPublicationCollections(OWNER)).collections.find(c=>c.target_hours===24).status,'sampled');
 f.sample(video,'single_snapshot',observed,{metrics:{},note:JSON.stringify({schema:'sample-details-v1',text:'SYNTHETIC correction unknown metrics',supersedes_id:valid})});assert.equal((await api.readDueCollectionReminders(OWNER)).reminders.length,2);
});

test('new owner click source renders a readable label while the original reported source API stays compatible',async t=>{
 const f=fixture(t),result=await f.publish(),raw=f.sql.prepare('SELECT publication_source FROM production_data_videos WHERE id=?').get(result.publication.id).publication_source;
 assert.equal(api.publicationDetails(raw),null);assert.equal(api.clickedPublicationDetails(raw).video.sha256,SHA);assert.match(api.publicationLabel(raw),/本人登记已发布/);assert.match(api.publicationLabel(raw),/默认采用站内登记时间/);
 const old=JSON.stringify({schema:'reported-publication-v1',time_source:'self_reported',precision:'approximate',display_time:'SYNTHETIC around noon'});assert.equal(api.publicationDetails(old).precision,'approximate');assert.match(api.publicationLabel(old),/约时/);
});

test('a changed current video never silently inherits the old publication binding',async t=>{
 const f=fixture(t),first=await f.publish();f.job.facts.candidate_video_sha256='e'.repeat(64);
 const read=await api.readProductionPublication(OWNER,JOB);assert.equal(read.binding_current,false);assert.equal(read.can_publish,false);assert.match(read.reason,/旧成品/);
 const replay=await f.publish({request_id:'SYNTHETIC-new-file-click'});assert.deepEqual(replay.publication,first.publication);assert.equal(replay.binding_current,false);assert.equal(f.archiveReads,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_videos').get().n,1);
});

test('historical publication plan creation is an explicit idempotent action while GET remains read only',async t=>{
 const f=fixture(t),first=await f.publish({published_at:new Date(Date.now()-72*3600000).toISOString()}),original=first.publication;
 f.sql.prepare('DELETE FROM production_data_collections').run();f.sql.prepare('UPDATE production_data_videos SET publication_source=? WHERE id=?').run('SYNTHETIC historical owner report, no archive binding',original.id);
 const corrected=f.correct(original.id,new Date(Date.now()-60*3600000).toISOString()),before=f.protected(),read=await api.readProductionPublication(OWNER,JOB);
 assert.equal(read.collections.length,0);assert.equal(read.binding_current,null);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_collections').get().n,0);
 const ensured=await api.ensureProductionCollections(OWNER,{job_id:JOB,request_id:'SYNTHETIC-ensure'});assert.equal(ensured.collections.length,2);assert.ok(ensured.collections.every(c=>c.video_id===corrected&&c.original_video_id===original.id));assert.equal(ensured.publication.video_id,corrected);
 assert.equal((await api.ensureProductionCollections(OWNER,{job_id:JOB,request_id:'SYNTHETIC-ensure-again'})).replayed,true);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_collections').get().n,2);assert.equal(f.protected(),before);
});

test('a newer delivery version appearing after archive validation prevents a stale publication commit',async t=>{
 const f=fixture(t);f.archiveReadHook=()=>f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES ('SYNTHETIC-new-delivery',?,'delivery',3,2,'SYNTHETIC-new-hash','{}','awaiting_human',0,?,?)").run(JOB,new Date().toISOString(),new Date().toISOString());
 await assert.rejects(()=>f.publish(),/状态已变化/);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_videos').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_collections').get().n,0);
});

test('native success interval writes the approved SHA and exactly two conservative collection windows',async t=>{
 const f=fixture(t),before=f.protected(),native_observation={range_start:'2026-10-10T15:12:56.810127+08:00',range_end:'2026-10-10T15:13:56.858140+08:00',evidence_note:'SYNTHETIC native UI publishing ended; account video visible; owner confirmed.'};
 const first=await f.publish({platform:'wechat_channels',native_observation}),v=first.publication;
 assert.equal(v.time_source,'native_observation');assert.equal(v.published_at,'2026-10-10T07:13:56.859Z');assert.equal(v.exact_platform_published_at,null);assert.deepEqual(v.native_observation,native_observation);assert.equal(v.video_sha256,SHA);
 const source=JSON.parse(f.sql.prepare('SELECT publication_source FROM production_data_videos WHERE id=?').get(v.id).publication_source);
 assert.equal(source.independent_platform_verification,false);assert.deepEqual(source.native_observation,native_observation);assert.equal(source.precision,'observed_interval');
 assert.deepEqual(first.collections.map(c=>c.target_hours).sort(),[24,48]);
 for(const c of first.collections){assert.equal(Date.parse(c.due_at),Date.parse(v.published_at)+c.target_hours*3600000);assert.deepEqual(c.native_observation,native_observation);assert.match(c.collection_anchor_note,/区间上界/);}
 const replay=await f.publish({request_id:'SYNTHETIC-native-retry',platform:'wechat_channels',native_observation});assert.equal(replay.replayed,true);assert.deepEqual(replay.publication,v);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_videos').get().n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_collections').get().n,2);assert.equal(f.protected(),before);
 const calendar=await api.collectionCalendar(OWNER,v.id,'https://synthetic.invalid');assert.match(calendar.replaceAll('\r\n ',''),/区间上界/);
});

test('invalid native intervals and mixed point/interval inputs never create records or collection anchors',async t=>{
 const f=fixture(t),base={range_start:'2026-10-10T07:12:56.810127Z',range_end:'2026-10-10T07:13:56.858140Z',evidence_note:'SYNTHETIC success evidence'};
 for(const native_observation of [{...base,range_end:base.range_start,range_start:base.range_end},{...base,range_end:'2026-10-12T00:00:00Z'},{...base,evidence_note:''}])await assert.rejects(()=>f.publish({platform:'wechat_channels',native_observation}));
 await assert.rejects(()=>f.publish({published_at:'2026-10-10T07:13:00Z',native_observation:base}),/不能同时/);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_videos').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_collections').get().n,0);
});


function setPublicationVideoArtifact(f,artifact){const m=f.job.milestones.find(m=>m.node==='video');m.artifact=JSON.stringify(artifact);f.sql.prepare('UPDATE production_milestones SET artifact=? WHERE id=?').run(m.artifact,m.id);}

test('normal publication registration supports current top-level local-review archive and legacy qa archive without changing production approval',async t=>{for(const shape of ['top-level','top-level-no-qa','legacy-qa'])await t.test(shape,async t=>{const f=fixture(t),artifact={sha256:SHA,duration:56,...(shape==='legacy-qa'?{qa:{site_archive_id:ARCHIVE}}:{site_archive_id:ARCHIVE,...(shape==='top-level'?{qa:{voice_kind:'owner-cloned',project_site_archive_id:'SYNTHETIC-project'}}:{})})};setPublicationVideoArtifact(f,artifact);const before=f.protected(),end=new Date(Date.now()-60000).toISOString(),start=new Date(Date.parse(end)-10000).toISOString(),first=await f.publish({platform:'wechat_channels',native_observation:{range_start:start,range_end:end,evidence_note:'SYNTHETIC one native submit and actual success observation; not an exact platform time'}});assert.equal(first.publication.site_archive_id,ARCHIVE);assert.equal(first.publication.video_sha256,SHA);assert.equal(first.publication.time_source,'native_observation');assert.equal(first.publication.exact_platform_published_at,null);assert.equal(first.collections.length,2);assert.deepEqual(first.collections.map(c=>c.target_hours).sort(),[24,48]);assert.equal(first.publication.native_observation.range_start,start);assert.equal(first.publication.native_observation.range_end,end);assert.equal(f.protected(),before);const replay=await f.publish({request_id:'SYNTHETIC-top-level-retry'});assert.equal(replay.replayed,true);assert.equal(replay.publication.id,first.publication.id);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_videos').get().n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_collections').get().n,2);} )});

test('top-level registration retains archive identity, current SHA, owner and exact version guards',async t=>{for(const fault of ['missing-id','malformed-id','sha','materialized-sha','owner','revision','script','epoch','contract','unconfirmed'])await t.test(fault,async t=>{const f=fixture(t),artifact={sha256:SHA,duration:56,site_archive_id:ARCHIVE,qa:{voice_kind:'owner-cloned'}};if(fault==='missing-id')delete artifact.site_archive_id;if(fault==='malformed-id')artifact.site_archive_id='undefined';setPublicationVideoArtifact(f,artifact);if(fault==='sha')f.archive.file.sha256='d'.repeat(64);if(fault==='materialized-sha')f.archive.materialized_sha256='d'.repeat(64);if(fault==='owner')f.owner='SYNTHETIC-other-owner';if(fault==='revision')f.archive.binding.revision=2;if(fault==='script')f.archive.binding.script_hash='d'.repeat(64);if(fault==='epoch')f.archive.binding.mode_epoch=1;if(fault==='contract')f.archive.binding.contract_hash='SYNTHETIC-wrong-contract';if(fault==='unconfirmed')f.archive.status='pending';await assert.rejects(()=>f.publish({platform:'wechat_channels'}));assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_videos').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_data_collections').get().n,0);} )});
