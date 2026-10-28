// SYNTHETIC real list/getJob/API reads against fully migrated in-memory SQLite. No live tasks or HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
const OWNER='SYNTHETIC-list-owner',OTHER='SYNTHETIC-other-owner',JOB='job_44444444-4444-4444-4444-444444444444';
const PROJECT='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',TIMELINE='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const columns='review_mode,mode_epoch,reworks,ai_calls,id,topic_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,checkpoint_version,checkpoint,lease_until,executor,attempt,error,review_note,approved_revision,approved_hash,created_at,updated_at';
const sha=value=>createHash('sha256').update(value).digest('hex'),clone=value=>JSON.parse(JSON.stringify(value));
const built=await build({stdin:{contents:[
 "export {listJobs,listJobSummaries,getJob} from './lib/production';",
 "export {registerNativePromoVideo} from './lib/promo-delivery';",
 "export {promoBinding} from './lib/promo-delivery';",
 "export {recordNativeVideoArchive} from './lib/native-video-archive';",
 "export {confirmMediaScope} from './lib/media-continuation';",
 "export {recordNativeCandidateFeedback} from './lib/native-candidate-feedback';",
 "export * as route from './app/api/production/route';"
].join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-list-db',setup(b){
 b.onResolve({filter:/^(?:\.\/store|@\/lib\/store)$/},()=>({path:'db',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export function db(){return globalThis.__productionListDb}export function siteArchiveBucket(){throw Error('SYNTHETIC list read must never touch R2')}"}));
 b.onResolve({filter:/^@\/lib\/api$/},()=>({path:'api',namespace:'identity'}));
 b.onLoad({filter:/.*/,namespace:'identity'},()=>({contents:"export async function identity(req){return req.headers.get('x-synthetic-owner')||null}export const json=(body,status=200)=>Response.json(body,{status});"}));
}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
async function fixture(t){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 const queries=[];let afterListRead,readBarrier;
 class Statement{constructor(query,args=[]){this.query=query;this.args=args;}bind(...args){return new Statement(this.query,args);}async first(){queries.push(this.query);if(readBarrier)await readBarrier(this.query);return sql.prepare(this.query).get(...this.args)||null;}async all(){queries.push(this.query);if(readBarrier)await readBarrier(this.query);const results=sql.prepare(this.query).all(...this.args);if(afterListRead&&this.query.includes('AS candidate_feedback_present')){const hook=afterListRead;afterListRead=null;await hook();}return{results};}async run(){queries.push(this.query);return{meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}}
 globalThis.__productionListDb={prepare:query=>new Statement(query),batch:async statements=>{sql.exec('BEGIN');try{const result=statements.map(s=>({meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}}));sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 t.after(()=>{sql.close();delete globalThis.__productionListDb;});
 const content=JSON.stringify({script:'SYNTHETIC approved manuscript',evidence:[],storyboard:[]}),script=sha(content),contract='c'.repeat(64);
 let n=0;function add({id='job_synthetic_'+(++n),owner=OWNER,isTest=0}={}){
  const topic='topic_'+id;
  sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES(?,?,'fixture','fixture',?,?,'fixture','now','视觉影像',0,'m','h','a','m','r',0,'zh')").run(topic,'https://example.org/'+topic,'SYNTHETIC '+id,'SYNTHETIC '+id);
  sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at) VALUES(?,?,?,?,'approved',?,?,?,1,1,?,'node',0,0,1,2,?,?)").run(id,topic,owner,isTest,JSON.stringify({title:'SYNTHETIC '+id,category:'视觉影像',url:'https://example.org/'+topic}),JSON.stringify({sha256:'f'.repeat(64)}),contract,script,'2026-10-17T00:00:00Z','2026-10-17T00:00:00Z');
  sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,1,?,?,?,'SYNTHETIC','now')").run(id,'SYNTHETIC-script-'+id,content,script);
  for(const node of ['source','script'])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,1,?,?,'approved',0,'now','now')").run(id+'-'+node,id,node,script,content);
  return id;
 }
 add({id:JOB});
 await p.confirmMediaScope(JOB,OWNER,{confirmed:true,binding:{revision:1,script_hash:script,mode_epoch:0,contract_hash:contract},scope:'private-video',current_id:'',request_id:'SYNTHETIC-scope'});sql.exec("UPDATE production_stages SET status='blocked'");
 const candidate={revision:1,script_hash:script,sha256:'a'.repeat(64),file_name:'SYNTHETIC ordinary voice.mp4',size_bytes:12345,duration:54.9,project_id:PROJECT,timeline_id:TIMELINE,source:'SYNTHETIC fixture only; no real export',quality_approved:false,publication:false};
 const registered=await p.registerNativePromoVideo(JOB,candidate);
 const body={action:'native_candidate_feedback',id:JOB,client_receipt_id:'SYNTHETIC-list-feedback',explicit_user_direction:true,binding:{revision:1,script_hash:script,mode_epoch:0,contract_hash:contract,candidate_id:registered.id,candidate_sha256:candidate.sha256,project_id:PROJECT,timeline_id:TIMELINE},decision:'approved',quote:'SYNTHETIC 普通配音版通过。',reported_at:'2026-10-17T00:00:00Z',source_thread_id:null,expected_review_id:''};
 const snapshot=()=>clone(Object.fromEntries(sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,sql.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()])));
 return{sql,queries,add,script,contract,candidate,candidateId:registered.id,body,snapshot,raw:()=>clone(sql.prepare(`SELECT ${columns} FROM production_jobs WHERE owner_id=? OR is_test=1 ORDER BY created_at DESC LIMIT 100`).all(OWNER)),afterListRead:hook=>{afterListRead=hook;},barrier:hook=>{readBarrier=hook;},record:async()=>p.recordNativeCandidateFeedback(JOB,body,{owner_id:OWNER})};
}
const detailReads=f=>f.queries.filter(query=>query.startsWith('SELECT review_mode,mode_epoch,')&&query.includes('FROM production_jobs WHERE id=?')).length;
test('SYNTHETIC list snapshot excludes historical manuscript bodies while detail retains them',async t=>{
 const f=await fixture(t);await f.record();const before=(await p.listJobSummaries(OWNER)).find(row=>row.id===JOB);
 const oldContent=JSON.stringify({script:'SYNTHETIC old draft '.repeat(50000)});
 f.sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,0,'SYNTHETIC-old',?,?,'SYNTHETIC','old')").run(JOB,oldContent,sha(oldContent));
 f.queries.length=0;const after=(await p.listJobSummaries(OWNER)).find(row=>row.id===JOB);assert.deepEqual(after,before);
 const listQuery=f.queries.find(query=>query.includes('AS drafts_raw'));assert.ok(listQuery);
 const fetched=f.sql.prepare(listQuery).all(OWNER).find(row=>row.id===JOB);const selected=JSON.parse(fetched.drafts_raw);
 assert.deepEqual(selected.map(d=>d.revision),[1]);assert.ok(!fetched.drafts_raw.includes('SYNTHETIC old draft'));
 assert.equal((await p.getJob(JOB,OWNER)).drafts.find(d=>d.revision===0).content,oldContent);
});
test('SYNTHETIC summary skips large handoff audit history without changing state; full detail retains every event',async t=>{
 const f=await fixture(t);await f.record();const before=await p.listJobSummaries(OWNER);
 const insert=f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES(?,?,1,?,'native_preparation_handoff_event',?,'bounded-native-preparation',?)");
 for(let i=0;i<600;i++)insert.run('SYNTHETIC-handoff-'+i,JOB,f.script,JSON.stringify({schema:'native-preparation-handoff-event-v1',event:i%2?'claim':'blocked',version:i+1,checkpoint:{artifacts:Array.from({length:48},(_,n)=>({file:'fixture-'+n,sha256:'a'.repeat(64)}))}}),'2026-10-17T00:'+String(Math.floor(i/60)).padStart(2,'0')+':'+String(i%60).padStart(2,'0')+'Z');
 f.queries.length=0;const after=await p.listJobSummaries(OWNER);assert.deepEqual(after,before);
 const query=f.queries.find(q=>q.includes(' AS reviews_raw'));assert.ok(query);const compact=f.sql.prepare(query).all(OWNER).find(r=>r.id===JOB).reviews_raw;
 const previous=f.sql.prepare(query.replace(" AND decision<>'native_preparation_handoff_event'",'')).all(OWNER).find(r=>r.id===JOB).reviews_raw;
 assert.equal(JSON.parse(previous).filter(x=>x.decision==='native_preparation_handoff_event').length,600);assert.ok(previous.length>3000000);assert.ok(compact.length<10000);
 assert.equal((await p.getJob(JOB,OWNER)).reviews.filter(x=>x.decision==='native_preparation_handoff_event').length,600);
});
test('SYNTHETIC desk detail removes only historical handoff events and skill snapshot, preserving facts and owner access',async t=>{
 const f=await fixture(t);await f.record();
 f.sql.prepare('UPDATE production_jobs SET skill_snapshot=? WHERE id=?').run(JSON.stringify({text:'large skill'.repeat(20000)}),JOB);
 const add=f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES(?,?,1,?,'native_preparation_handoff_event',?,'bounded-native-preparation',?)");
 for(let i=0;i<600;i++)add.run('SYNTHETIC-detail-event-'+i,JOB,f.script,JSON.stringify({schema:'native-preparation-handoff-event-v1',checkpoint:{artifacts:Array.from({length:48},(_,n)=>({file:'fixture-'+n,sha256:'a'.repeat(64)}))}}),'2026-10-17T00:'+String(Math.floor(i/60)).padStart(2,'0')+':'+String(i%60).padStart(2,'0')+'Z');
 const req=(url,owner=OWNER)=>new Request(url,{headers:{'x-synthetic-owner':owner}}),url='https://synthetic.test/api/production?id='+JOB;
 const fullResponse=await p.route.GET(req(url)),deskResponse=await p.route.GET(req(url+'&view=desk'));assert.equal(fullResponse.status,200);assert.equal(deskResponse.status,200);
 const full=(await fullResponse.json()).job,desk=(await deskResponse.json()).job;
 assert.equal(desk.detail_view,'desk');assert.equal(Object.hasOwn(desk,'skill_snapshot'),false);assert.ok(JSON.stringify(full).length>3000000);assert.ok(JSON.stringify(desk).length<50000);
 assert.equal(full.reviews.filter(r=>r.decision==='native_preparation_handoff_event').length,600);assert.equal(desk.reviews.some(r=>r.decision==='native_preparation_handoff_event'),false);
 const {skill_snapshot,reviews,...otherFull}=full,{detail_view,reviews:deskReviews,...otherDesk}=desk;
 assert.deepEqual(otherDesk,otherFull);assert.deepEqual(deskReviews,reviews.filter(r=>r.decision!=='native_preparation_handoff_event'));
 assert.equal((await p.route.GET(req(url+'&view=desk',OTHER))).status,404);assert.equal((await p.route.GET(new Request(url+'&view=desk'))).status,401);
});
test('SYNTHETIC getJob starts every independent owner/facts/detail read before any finishes, retaining the exact full result',async t=>{
 const f=await fixture(t);await f.record();const expected=await p.getJob(JOB,OWNER),releases=[];f.queries.length=0;
 f.barrier(query=>query.startsWith('SELECT '+columns+' FROM production_jobs WHERE id=?')?undefined:new Promise(resolve=>releases.push(resolve)));
 const pending=p.getJob(JOB,OWNER);await new Promise(resolve=>setImmediate(resolve));assert.equal(releases.length,13,'all 13 independent readers begin without serially waiting for owner, presence, milestones, scope, intake, series or CLI capacity');
 f.barrier(null);for(const release of releases)release();assert.deepEqual(await pending,expected);const before=f.queries.length;await assert.rejects(()=>p.getJob(JOB,OTHER),/任务不存在/);assert.equal(f.queries.length-before,1,'unauthorized callers cannot start child reads');
});
test('SYNTHETIC GET summaries stay small and use two read queries for one or 42 owner jobs, never R2 or detail hydration',async t=>{
 const f=await fixture(t);const review=await f.record();f.sql.prepare('UPDATE production_jobs SET skill_snapshot=?,checkpoint=? WHERE id=?').run('SYNTHETIC-LARGE-SKILL'.repeat(20000),'SYNTHETIC-LARGE-CHECKPOINT'.repeat(20000),JOB);
 const read=async()=>{f.queries.length=0;const r=await p.route.GET(new Request('https://synthetic.test/api/production',{headers:{'x-synthetic-owner':OWNER}}));assert.equal(r.status,200);const body=await r.json();assert.equal(f.queries.length,2);assert.equal(detailReads(f),0);return body.jobs;};
 const before=f.snapshot(),one=await read(),row=one[0];assert.equal(row.kind,'production-job-summary-v1');assert.equal(row.title,'SYNTHETIC '+JOB);assert.equal(row.current_candidate.review_id,review.review_id);assert.equal(row.current_candidate.review_decision,'approved');assert.match(row.status_label,/普通配音版聊天审阅通过/);assert.equal(Buffer.byteLength(JSON.stringify(one))<1500,true);assert.deepEqual(f.snapshot(),before);
 for(let i=0;i<40;i++)f.add();f.add({id:'SYNTHETIC-shared-summary',owner:OTHER,isTest:1});f.add({id:'SYNTHETIC-private-summary',owner:OTHER});const many=await read();assert.equal(many.length,42);assert.equal(many.some(r=>r.id==='SYNTHETIC-private-summary'),false);
 for(const value of many)for(const forbidden of ['source_snapshot','skill_snapshot','checkpoint','facts','reviews','drafts','milestones','operations','series','media_continuation','owner_id','lease_hash'])assert.equal(Object.hasOwn(value,forbidden),false,forbidden);
 assert.equal((await p.route.GET(new Request('https://synthetic.test/api/production'))).status,401);
 const privateDetail=await p.route.GET(new Request('https://synthetic.test/api/production?id='+JOB,{headers:{'x-synthetic-owner':OTHER}}));assert.equal(privateDetail.status,404);
 const detail=await p.route.GET(new Request('https://synthetic.test/api/production?id='+JOB,{headers:{'x-synthetic-owner':OWNER}}));assert.equal(detail.status,200);assert.equal((await detail.json()).job.skill_snapshot.includes('SYNTHETIC-LARGE-SKILL'),true,'getJob remains the full detail API');
});
test('SYNTHETIC summary preserves actual current candidate rework and current formal node review states',async t=>{
 const f=await fixture(t);await f.record();const feedback=f.sql.prepare("SELECT id,note FROM production_reviews WHERE job_id=? AND decision='reported_owner_candidate_feedback'").get(JOB),value=JSON.parse(feedback.note);value.decision='rework-requested';f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(value),feedback.id);
 let row=(await p.listJobSummaries(OWNER)).find(r=>r.id===JOB);assert.equal(row.current_candidate.review_decision,'rework-requested');assert.match(row.status_label,/需修改/);
 const artifact=JSON.stringify({sha256:f.candidate.sha256,library_file_id:'libfile_'+'e'.repeat(32),qa:{native_candidate_id:f.candidateId}});
 f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES('SYNTHETIC-summary-video',?,'video',1,1,?,?,'awaiting_human',0,'2026-10-17T01:00:00Z','now')").run(JOB,sha(artifact),artifact);
 row=(await p.listJobSummaries(OWNER)).find(r=>r.id===JOB);assert.equal(row.current_node.node,'video');assert.equal(row.status_label,'成片待本人审核');
 f.sql.prepare("UPDATE production_milestones SET status='revise' WHERE id='SYNTHETIC-summary-video'").run();row=(await p.listJobSummaries(OWNER)).find(r=>r.id===JOB);assert.equal(row.status_label,'成片需修改');assert.equal(row.current_node.status,'revise');
});

test('SYNTHETIC workspace summary separates current archived clips from rejected versions and real publication records without extra detail reads',async t=>{
 const f=await fixture(t);await f.record();
 let row=(await p.listJobSummaries(OWNER)).find(row=>row.id===JOB);assert.equal(row.workspace_section,'in_progress','an unarchived candidate is still production');
 const binding=p.promoBinding(await p.getJob(JOB,OWNER));
 await p.recordNativeVideoArchive(JOB,{binding,sha256:f.candidate.sha256,materialized_sha256:f.candidate.sha256,library_file_id:'libfile_'+'1'.repeat(32),file_id:'file_'+'2'.repeat(32),version:1,size_bytes:f.candidate.size_bytes,file_name:'SYNTHETIC archived.mp4',verified_at:'2026-10-17T01:00:00Z',quality_approved:false,publication_authorized:false});
 const artifact=JSON.stringify({sha256:f.candidate.sha256,library_file_id:'libfile_'+'1'.repeat(32),qa:{native_candidate_id:f.candidateId}});
 f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES('SYNTHETIC-workspace-video',?,'video',1,1,?,?,'awaiting_human',0,'2026-10-17T01:00:00Z','now')").run(JOB,sha(artifact),artifact);
 f.queries.length=0;row=(await p.listJobSummaries(OWNER)).find(row=>row.id===JOB);assert.equal(row.workspace_section,'in_progress');assert.equal(row.workspace_badge,'成片待本人审核');assert.equal(row.publication_count,0);assert.equal(f.queries.length,2);assert.equal(detailReads(f),0);
 f.sql.prepare("UPDATE production_milestones SET status='approved' WHERE id='SYNTHETIC-workspace-video'").run();row=(await p.listJobSummaries(OWNER)).find(row=>row.id===JOB);assert.equal(row.workspace_section,'in_progress');assert.equal(row.workspace_badge,'成片待本人审核');
 f.sql.prepare("UPDATE production_milestones SET status='revise' WHERE id='SYNTHETIC-workspace-video'").run();row=(await p.listJobSummaries(OWNER)).find(row=>row.id===JOB);assert.equal(row.workspace_section,'in_progress','retaining a rejected MP4 does not fill the completed store');
 f.sql.prepare("INSERT INTO production_data_videos(id,owner_id,title,topic_type,published_at,publication_source,job_id,record_hash,request_id,created_at) VALUES('SYNTHETIC-workspace-pub',?,'SYNTHETIC','other','2026-10-17T01:05:00Z','SYNTHETIC owner report',?,'SYNTHETIC-hash','SYNTHETIC-pub-request','now')").run(OWNER,JOB);
 const before=f.snapshot();row=(await p.listJobSummaries(OWNER)).find(row=>row.id===JOB);assert.equal(row.workspace_section,'published','actual registered publication has priority, preserving current version status separately');assert.equal(row.workspace_badge,'已登记发布');assert.equal(row.publication_count,1);assert.deepEqual(f.snapshot(),before);
 f.sql.prepare("UPDATE production_data_videos SET owner_id=? WHERE id='SYNTHETIC-workspace-pub'").run(OTHER);row=(await p.listJobSummaries(OWNER)).find(row=>row.id===JOB);assert.equal(row.workspace_section,'in_progress');assert.equal(row.publication_count,0,'another owner publication cannot leak into this read model');
});
test('SYNTHETIC current source revise remains secondary to stopped, waiting and actual lease status without changing any saved record',async t=>{
 const f=await fixture(t),review=await f.record();f.sql.prepare("UPDATE production_milestones SET status='revise' WHERE job_id=? AND node='source'").run(JOB);
 f.sql.prepare('UPDATE production_jobs SET reworks=1 WHERE id=?').run(JOB);
 const cases=[
  ['paused',Date.now()+600000,'已暂停，需要决定'],['failed',Date.now()+600000,'执行失败'],
  ['waiting_executor',Date.now()+600000,'等待执行器领取 · 暂无有效执行器回执'],
  ['running',Date.now()+600000,'执行器已领单 · 租约有效'],['running',Date.now()-1000,'租约已过期 · 结果待核对']
 ];
 for(const [status,lease,label]of cases){
  f.sql.prepare('UPDATE production_jobs SET status=?,lease_until=? WHERE id=?').run(status,lease,JOB);const before=f.snapshot();
  const row=(await p.listJobSummaries(OWNER)).find(r=>r.id===JOB);
  assert.equal(row.status,status);assert.equal(row.status_label,label+' · 来源需修改');
  assert.equal(row.execution_condition,status==='running'&&lease<Date.now()?'result_unknown':status);
  assert.deepEqual(row.current_node,{node:'source',status:'revise',artifact_version:1});
  assert.deepEqual(row.current_candidate,{id:f.candidateId,sha256:f.candidate.sha256,review_decision:'approved',review_id:review.review_id});
  assert.deepEqual(f.snapshot(),before,'summary read must preserve the whole DB, including counters, owner review and checkpoints');
  assert.deepEqual(Object.fromEntries(Object.entries(f.raw().find(r=>r.id===JOB)).filter(([key])=>['attempt','reworks','ai_calls'].includes(key))),{reworks:1,ai_calls:1,attempt:2});
 }
 for(const status of ['awaiting_review','approved','completed']){
  f.sql.prepare('UPDATE production_jobs SET status=? WHERE id=?').run(status,JOB);const before=f.snapshot(),row=(await p.listJobSummaries(OWNER)).find(r=>r.id===JOB);
  assert.equal(row.status_label,'来源需修改','existing node/review priorities are unchanged outside execution states');assert.deepEqual(f.snapshot(),before);
 }
});
test('SYNTHETIC paused source review adds node context without repeating the task pause or changing saved state',async t=>{
 const f=await fixture(t),review=await f.record();f.sql.prepare("UPDATE production_milestones SET status='paused' WHERE job_id=? AND node='source'").run(JOB);
 f.sql.prepare("UPDATE production_jobs SET status='paused',error='SYNTHETIC 来源需本人补充' WHERE id=?").run(JOB);const before=f.snapshot();
 const row=(await p.listJobSummaries(OWNER)).find(r=>r.id===JOB);
 assert.equal(row.status_label,'已暂停，需要决定 · 来源审核暂停');assert.equal(row.status_label.split('已暂停，需要决定').length-1,1);
 assert.equal(row.status,'paused');assert.equal(row.execution_condition,'paused');assert.deepEqual(row.current_node,{node:'source',status:'paused',artifact_version:1});
 assert.deepEqual(row.current_candidate,{id:f.candidateId,sha256:f.candidate.sha256,review_decision:'approved',review_id:review.review_id});
 assert.deepEqual(f.snapshot(),before,'labels must not alter task, milestone, owner review, counters or error');
});
for(const [field,sql,value]of[
 ['revision','UPDATE production_jobs SET revision=? WHERE id=?',2],
 ['script','UPDATE production_jobs SET approved_hash=? WHERE id=?','d'.repeat(64)],
 ['epoch','UPDATE production_jobs SET mode_epoch=? WHERE id=?',1],
 ['contract','UPDATE production_jobs SET contract_hash=? WHERE id=?','d'.repeat(64)]
])test('SYNTHETIC summary does not inherit a prior candidate approval after '+field+' changes',async t=>{
 const f=await fixture(t);await f.record();f.sql.prepare(sql).run(value,JOB);const row=(await p.listJobSummaries(OWNER)).find(r=>r.id===JOB);assert.equal(row.current_candidate?.review_id??null,null);assert.equal(row.current_candidate?.review_decision??null,null);assert.doesNotMatch(row.status_label,/聊天审阅通过|交付已完成/);
});
test('LOCAL saved three-job snapshots: summary query validates the genuine archived/review inputs without returning their large bodies',{skip:!process.env.TOPIC_SUMMARY_SNAPSHOT_DIR},async t=>{
 const f=await fixture(t),base=process.env.TOPIC_SUMMARY_SNAPSHOT_DIR,ids=['job_38fd8bfd-2949-4d26-8b67-d07a03e6f0b0','job_ed3c8123-59ed-4948-9d99-fdb7067ee522','job_b7dcd6bf-682d-429f-9016-7c9f3df41c16'];
 let originalBytes=0;
 function insert(table,row){const allowed=new Set(f.sql.prepare('PRAGMA table_info('+table+')').all().map(v=>v.name));const keys=Object.keys(row).filter(k=>allowed.has(k));f.sql.prepare('INSERT OR REPLACE INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));}
 for(const id of ids){const j=JSON.parse(fs.readFileSync(base+'/'+id+'.final-a-video-and-publicity.json','utf8')).job;originalBytes+=Buffer.byteLength(JSON.stringify(j));const owner=JSON.parse(j.milestones.find(m=>m.node==='video'&&m.status==='approved').report).actor;f.add({id,owner});const old=f.sql.prepare('SELECT topic_id FROM production_jobs WHERE id=?').get(id);const cols=f.sql.prepare('PRAGMA table_info(production_jobs)').all().map(v=>v.name).filter(k=>k in j&&k!=='id'&&k!=='topic_id');f.sql.prepare('UPDATE production_jobs SET '+cols.map(k=>k+'=?').join(',')+' WHERE id=?').run(...cols.map(k=>j[k]),id);
  for(const [table,rows]of[['production_drafts',j.drafts],['production_stages',j.stages],['production_reviews',j.reviews],['production_milestones',j.milestones],['production_operations',j.operations]]){f.sql.prepare('DELETE FROM '+table+' WHERE job_id=?').run(id);for(const row of rows||[])insert(table,{...row,job_id:id});}
  f.sql.prepare("INSERT OR REPLACE INTO app_state(key,value) VALUES(?,?)").run('media_scope_v1:'+id,JSON.stringify({id:j.media_continuation.current_id,scope:j.media_continuation.scope}));f.sql.prepare('UPDATE production_jobs SET owner_id=? WHERE id=?').run(OWNER,id);f.sql.prepare('UPDATE production_reviews SET reviewer=? WHERE job_id=? AND reviewer=?').run(OWNER,id,owner);
  // Keep the actual owner for the immutable archive facts; then query each
  // owner's rows below. No fixture is ever written to a production database.
  f.sql.prepare('UPDATE production_jobs SET owner_id=? WHERE id=?').run(owner,id);f.sql.prepare('UPDATE production_reviews SET reviewer=? WHERE job_id=? AND reviewer=?').run(owner,id,OWNER);assert.ok(old.topic_id);
 }
 const owners=[...new Set(ids.map(id=>f.sql.prepare('SELECT owner_id FROM production_jobs WHERE id=?').get(id).owner_id))];let summaries=[];for(const owner of owners){f.queries.length=0;summaries.push(...(await p.listJobSummaries(owner)).filter(r=>ids.includes(r.id)));assert.equal(f.queries.length,2);}
 assert.equal(summaries.length,3);for(const row of summaries){assert.equal(row.current_node.node,'cover');assert.equal(row.status_label,'封面待本人审核');assert.ok(row.current_candidate.id.startsWith('native_video_'));}
 const compactBytes=Buffer.byteLength(JSON.stringify(summaries));assert.ok(compactBytes<5000);t.diagnostic(JSON.stringify({saved_detail_bytes:originalBytes,summary_bytes:compactBytes,summary_count:3,queries_per_owner:2,network_calls:0}));
});
test('SYNTHETIC no-feedback production list retains its actual raw column shape, including protected and shared test jobs',async t=>{
 const f=await fixture(t);f.add({id:'job_9ef39025-d92e-4770-82d0-05881451c5df'});f.add({id:'job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee'});f.add({id:'SYNTHETIC-shared-test',owner:OTHER,isTest:1});f.add({id:'SYNTHETIC-private-other',owner:OTHER});
 const before=f.snapshot(),expected=f.raw();f.queries.length=0;const rows=await p.listJobs(OWNER);assert.deepEqual(rows,expected);assert.equal(rows.some(row=>row.id==='SYNTHETIC-private-other'),false);assert.equal(detailReads(f),0);assert.deepEqual(f.snapshot(),before);
 for(const row of rows){assert.deepEqual(Object.keys(row),columns.split(','));assert.equal(Object.hasOwn(row,'candidate_feedback_present'),false);assert.equal(Object.hasOwn(row,'facts'),false);}
});
test('SYNTHETIC legacy listJobs enriches only the owner current-feedback row without changing formal approval, archive or raw neighbors',async t=>{
 const f=await fixture(t);const review=await f.record();for(let i=0;i<40;i++)f.add();const testId=f.add({id:'SYNTHETIC-feedback-test',owner:OTHER,isTest:1});f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES('SYNTHETIC-test-review',?,1,?,'reported_owner_candidate_feedback',?,'SYNTHETIC','now')").run(testId,'a'.repeat(64),JSON.stringify({quote:'SYNTHETIC must not enrich shared test'}));
 const before=f.snapshot(),raw=f.raw();f.queries.length=0;const jobs=await p.listJobs(OWNER);
 assert.equal(jobs.length,raw.length);assert.equal(detailReads(f),1,'do not hydrate all 42 list entries');const row=jobs.find(row=>row.id===JOB);assert.equal(row.facts.candidate_owner_review.id,review.review_id);assert.deepEqual(row.facts.candidate_owner_review.binding,f.body.binding);assert.equal(row.facts.video_approval,'not-recorded');assert.equal(row.facts.files_archived,false);assert.equal(row.facts.publication_authorization,false);
 assert.deepEqual(Object.keys(row).sort(),[...columns.split(','),'facts'].sort());for(const original of raw.filter(row=>row.id!==JOB))assert.deepEqual(jobs.find(row=>row.id===original.id),original);
 assert.equal(Object.hasOwn(row,'reviews'),false);assert.equal(Object.hasOwn(row,'drafts'),false);assert.equal(Object.hasOwn(row,'series'),false);assert.deepEqual(f.snapshot(),before);
});
test('SYNTHETIC legacy listJobs cannot receive another owner private feedback row, while shared tests retain the old raw contract',async t=>{
 const f=await fixture(t);await f.record();const testId=f.add({owner:OWNER,isTest:1}),before=f.snapshot();f.queries.length=0;
 const jobs=await p.listJobs(OTHER);assert.equal(jobs.some(row=>row.id===JOB),false);assert.deepEqual(jobs.map(row=>row.id),[testId]);assert.equal(Object.hasOwn(jobs[0],'facts'),false);assert.equal(detailReads(f),0);assert.deepEqual(f.snapshot(),before);
 assert.equal((await p.route.GET(new Request('https://synthetic.test/api/production'))).status,401);
});
for(const [name,change]of[
 ['revision',f=>f.sql.prepare('UPDATE production_jobs SET revision=2 WHERE id=?').run(JOB)],
 ['script',f=>f.sql.prepare('UPDATE production_jobs SET approved_hash=? WHERE id=?').run('d'.repeat(64),JOB)],
 ['epoch',f=>f.sql.prepare('UPDATE production_jobs SET mode_epoch=1 WHERE id=?').run(JOB)],
 ['contract',f=>f.sql.prepare('UPDATE production_jobs SET contract_hash=? WHERE id=?').run('d'.repeat(64),JOB)],
 ['candidate',async f=>{f.sql.prepare('UPDATE production_reviews SET created_at=? WHERE id=?').run('2000-01-01T00:00:00Z',f.candidateId);await p.registerNativePromoVideo(JOB,{...f.candidate,sha256:'b'.repeat(64)});}],
 ['project',f=>{const row=f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(f.candidateId),value=JSON.parse(row.note);value.project_id='dddddddd-dddd-dddd-dddd-dddddddddddd';f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(value),f.candidateId);}],
 ['timeline',f=>{const row=f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(f.candidateId),value=JSON.parse(row.note);value.timeline_id='dddddddd-dddd-dddd-dddd-dddddddddddd';f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(value),f.candidateId);}]
])test('SYNTHETIC list never inherits feedback after '+name+' changes',async t=>{
 const f=await fixture(t);await f.record();await change(f);const expected=f.raw(),before=f.snapshot();assert.deepEqual(await p.listJobs(OWNER),expected);assert.deepEqual(f.snapshot(),before);
});
test('SYNTHETIC malformed historical feedback does not expand a raw list entry',async t=>{
 const f=await fixture(t);const review=await f.record();f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run('{SYNTHETIC-invalid',review.review_id);const expected=f.raw(),before=f.snapshot();assert.deepEqual(await p.listJobs(OWNER),expected);assert.deepEqual(f.snapshot(),before);
});
test('SYNTHETIC an approved formal video node stays authoritative in the enriched list facts',async t=>{
 const f=await fixture(t);await f.record();const artifact=JSON.stringify({sha256:f.candidate.sha256,library_file_id:'libfile_'+'e'.repeat(32),qa:{native_candidate_id:f.candidateId}});
 f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES('SYNTHETIC-video-node',?,'video',1,1,?,?,'approved',0,'2026-10-17T01:00:00Z','now')").run(JOB,sha(artifact),artifact);
 const before=f.snapshot(),row=(await p.listJobs(OWNER)).find(row=>row.id===JOB);assert.equal(row.facts.candidate_owner_review.decision,'approved');assert.equal(row.facts.video_approval,'owner-node-approved');assert.equal(row.facts.summary,'当前成片已通过本人节点审核');assert.equal(row.facts.publication_authorization,false);assert.deepEqual(f.snapshot(),before);
});
test('SYNTHETIC a concurrent new epoch returns current columns with current feedback rather than borrowing the old list binding',async t=>{
 const f=await fixture(t);const first=await f.record();let afterRace;f.afterListRead(()=>{f.sql.prepare('UPDATE production_jobs SET mode_epoch=1 WHERE id=?').run(JOB);const row=f.sql.prepare('SELECT note FROM production_reviews WHERE id=?').get(first.review_id),value=JSON.parse(row.note);value.binding.mode_epoch=1;f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(value),first.review_id);afterRace=f.snapshot();});
 const row=(await p.listJobs(OWNER)).find(row=>row.id===JOB);assert.equal(row.mode_epoch,1);assert.equal(row.facts.candidate_owner_review.binding.mode_epoch,1);assert.deepEqual(f.snapshot(),afterRace);
});
for(const [name,change]of[
 ['owner transfer',f=>f.sql.prepare('UPDATE production_jobs SET owner_id=? WHERE id=?').run(OTHER,JOB)],
 // Simulate an administrative removal after the first read, outside this read-only request.
 ['removal',f=>{f.sql.exec('PRAGMA foreign_keys=OFF');try{f.sql.prepare('DELETE FROM production_jobs WHERE id=?').run(JOB);}finally{f.sql.exec('PRAGMA foreign_keys=ON');}}]
])test('SYNTHETIC concurrent '+name+' omits an inaccessible row instead of leaking feedback or failing the list',async t=>{
 const f=await fixture(t);await f.record();const other=f.add();let afterRace;f.afterListRead(()=>{change(f);afterRace=f.snapshot();});const rows=await p.listJobs(OWNER);assert.equal(rows.some(row=>row.id===JOB),false);assert.equal(rows.some(row=>row.id===other),true);assert.deepEqual(f.snapshot(),afterRace);
});
test('SYNTHETIC feedback on a job concurrently moved to the shared test scope is never enriched',async t=>{
 const f=await fixture(t);await f.record();const raw=f.raw();let afterRace;f.afterListRead(()=>{f.sql.prepare('UPDATE production_jobs SET is_test=1,owner_id=? WHERE id=?').run(OTHER,JOB);afterRace=f.snapshot();});const row=(await p.listJobs(OWNER)).find(row=>row.id===JOB);assert.equal(Object.hasOwn(row,'facts'),false);assert.deepEqual(row,raw.find(row=>row.id===JOB));assert.deepEqual(f.snapshot(),afterRace);
});

test('SYNTHETIC compact list shows the current clone blocker and retry without N+1 reads or leaking requests',async t=>{
 const f=await fixture(t),mid='SYNTHETIC-clone-base',artifact=JSON.stringify({sha256:f.candidate.sha256,qa:{voice_kind:'ordinary-review',local_review_draft_id:'lrd_'+'1'.repeat(64)}}),hash=sha(artifact),rid='acl_'+'f'.repeat(64),review=JSON.stringify({decision:'approve',actor:OWNER,revision:1,mode_epoch:0,artifact_hash:hash}),created='2026-10-23T04:54:24.000Z';
 f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,report,created_at,updated_at) VALUES(?,?,'video',1,1,?,?,'approved',0,?,?,?)").run(mid,JOB,hash,artifact,review,created,created);
 f.sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES('SYNTHETIC-clone-first',?,1,?,'approve',?,?,?)").run(JOB,hash,review,OWNER,created);
 const scope=JSON.parse(f.sql.prepare("SELECT value FROM app_state WHERE key=?").get('media_scope_v1:'+JOB).value),request={schema:'automatic-local-clone-v1',id:rid,job_id:JOB,owner_id:OWNER,status:'blocked',created_at:created,updated_at:'2026-10-25T05:59:00.000Z',binding:{revision:1,script_hash:f.script,mode_epoch:0,contract_hash:f.contract},scope_id:scope.id,first_review_id:'SYNTHETIC-clone-first',base:{milestone_id:mid,artifact_hash:hash,video_sha256:f.candidate.sha256},voice_id:'e791e6e058f6459cbfb720cd95f24f87',acquisition_method:'heygen_studio_audio_preview',lease_hash:'SYNTHETIC-MUST-NOT-LEAK',reason:'STUDIO_PREVIEW_BROWSER_UI_ERROR',preparation_retry:{phase:'prepare',failure_code:'STUDIO_PREVIEW_BROWSER_UI_ERROR',diagnostic:'SYNTHETIC not visible',consecutive_count:3,last_failed_at:'2026-10-25T05:59:00.000Z',next_retry_at:'2026-10-25T06:05:00.000Z',implementation_sha256:'a'.repeat(64)}};
 const key='automatic_local_clone_v1:'+JOB+':'+rid;f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run(key,JSON.stringify(request));f.queries.length=0;const before=f.snapshot(),row=(await p.listJobSummaries(OWNER)).find(r=>r.id===JOB);assert.equal(f.queries.length,2);assert.equal(row.workspace_badge,'本人换声受阻');assert.match(row.status_label,/工作室草稿准备.*尚未取得本人音轨/);assert.equal(row.clone_progress.first_review_at,created);assert.equal(row.clone_progress.failure_count,3);assert.doesNotMatch(JSON.stringify(row),/MUST-NOT-LEAK|lease_hash|owner_id|preparation_retry/);assert.deepEqual(f.snapshot(),before);
 request.binding.mode_epoch++;f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(request),key);const newer=(await p.listJobSummaries(OWNER)).find(r=>r.id===JOB);assert.equal(newer.clone_progress,undefined);assert.doesNotMatch(newer.status_label,/工作室草稿准备/);
});
