// SYNTHETIC full-migration SQLite only. No live tasks, network, model/CLI,
// media preparation, visual inspection, publishing or paid calls.
import {APPROVED_PRODUCTION_AUTHORIZATION} from '../lib/approved-production-policy.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const sha=s=>createHash('sha256').update(s).digest('hex'),clone=structuredClone,OWNER='SYNTHETIC-preparation-owner',AT='2026-10-17T01:00:00Z';
const compiled=await build({stdin:{contents:["export {nextWork} from './lib/dispatch';","export {getJob,createJob,claimJob,submitDraft} from './lib/production';","export {decideMilestone} from './lib/milestones';","export {saveScriptFeedback} from './lib/script-feedback';","export {registerFreePreparation,claimPreparation,completePreparation,cancelMediaScope} from './lib/media-continuation';","export {scopeBinding} from './lib/media-continuation-contract';","export * from './lib/preparation-registration-contract.mts';"].join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,footer:{js:'//# sourceURL=synthetic-preparation-registration-under-test.mjs'},plugins:[{name:'SYNTHETIC-db',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__preparationRegistrationDb};export function siteArchiveBucket(){throw Error("Unexpected archive access")}'}))}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
const migrations=fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort().map(x=>fs.readFileSync('drizzle/'+x,'utf8'));
const receipt=(kind,status='blocked')=>({schema:'media-input-probe-receipt-v1',kind,status,checks:[{code:'SYNTHETIC-technical-only',passed:status==='ready',detail:'SYNTHETIC fixture, not actual source/media inspection'}],cost:0,visual_inspected:false,audio_listened:false,quality_approved:false,publication:false});
function fixture(t){
 const sql=new DatabaseSync(':memory:');migrations.forEach(m=>sql.exec(m));let beforeBatch=null,beforeRegistrationRows=null,n=0;
 class S{constructor(query,args=[]){this.query=query;this.args=args}bind(...args){return new S(this.query,args)}async first(){return sql.prepare(this.query).get(...this.args)||null}async all(){const results=sql.prepare(this.query).all(...this.args);if(beforeRegistrationRows&&this.query.includes('SELECT j.id,j.owner_id')){const hook=beforeRegistrationRows;beforeRegistrationRows=null;await hook()}return{results}}async run(){return{meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}}}}
 globalThis.__preparationRegistrationDb={prepare:q=>new S(q),async batch(statements){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;await hook()}sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}};
 t.after(()=>{sql.close();delete globalThis.__preparationRegistrationDb});
 function topic(){const id='SYNTHETIC-topic-'+ ++n;sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES (?,?,'SYNTHETIC','SYNTHETIC','SYNTHETIC approved topic','SYNTHETIC','SYNTHETIC',?,'行业动态',0,'SYNTHETIC','SYNTHETIC','SYNTHETIC','SYNTHETIC','SYNTHETIC',0,'zh')").run(id,'https://example.org/'+id,AT);return id}
 function seed({id,revision=1,epoch=0,created=AT}={}){const topicId=topic();id||='job_00000000-0000-4000-8000-'+String(n).padStart(12,'0');const draft={script:'SYNTHETIC approved text only; no video exists.',evidence:[],materials:'SYNTHETIC',limits:'SYNTHETIC no media approval'},content=JSON.stringify(draft),hash=sha(content);sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,reworks,ai_calls,attempt,created_at,updated_at) VALUES (?,?,?,0,'approved',?,'{}',?,?,?,?,'node',?,2,8,6,?,?)").run(id,topicId,OWNER,JSON.stringify({url:'https://example.org/'+topicId,title:'SYNTHETIC',category:'行业动态'}),'b'.repeat(64),revision,revision,hash,epoch,created,created);sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES (?,?,?,?,?,'SYNTHETIC',?)").run(id,revision,'SYNTHETIC-submission-'+id,content,hash,AT);for(const node of ['source','script'])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,report,created_at,updated_at) VALUES (?,?,?,?,?,?,'approved',?,?,?,?)").run('SYNTHETIC-'+node+'-'+id,id,node,revision,hash,JSON.stringify(draft),epoch,JSON.stringify({decision:'approve',actor:OWNER,quality_scope:'SYNTHETIC text fixture only'}),AT,AT);return{id,topic:topicId,revision,hash,epoch,contract:'b'.repeat(64)}}
 function scope(j,{binding={revision:j.revision,script_hash:j.hash,mode_epoch:j.epoch,contract_hash:j.contract},id='SYNTHETIC-scope-'+j.id,scope='preparation',...extra}={}){const value={id,scope:{schema:'owner-media-scope-v1',id,binding,scope,confirmed_at:AT,new_paid_authorization:false,publication_authorization:false,quality_approved:false,...extra}};sql.prepare('INSERT OR REPLACE INTO app_state(key,value) VALUES (?,?)').run('media_scope_v1:'+j.id,JSON.stringify(value));return value}
 function stage(j,{kind='media_inventory',status='blocked',revision=j.revision,attempt=2,scopeId='SYNTHETIC-scope',epoch=j.epoch}={}){const value={schema:'media-input-probe-v1',scope_id:scopeId,binding:{revision,script_hash:j.hash,mode_epoch:epoch,contract_hash:j.contract},attempt};if(status==='running'){value.lease_hash='SYNTHETIC';value.lease_until=Date.now()-1}sql.prepare('INSERT INTO production_stages(id,job_id,stage,review_revision,review_hash,status,result,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('SYNTHETIC-stage-'+j.id+'-'+kind+'-'+revision,j.id,kind,revision,j.hash,status,JSON.stringify(value),AT)}
 function operation(j,{status='running',node='video',revision=j.revision,lease=Date.now()-1}={}){sql.prepare("INSERT INTO production_operations(id,job_id,node,revision,script_hash,mode_epoch,base_artifact_version,input_hash,plan,status,lease_until,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,'{}',?,?,?,?)").run('SYNTHETIC-operation-'+j.id,j.id,node,revision,j.hash,j.epoch,'c'.repeat(64),status,lease,AT,AT)}
 function review(j,decision,note={}){sql.prepare('INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES (?,?,?,?,?,?,?,?)').run('SYNTHETIC-review-'+j.id+'-'+decision,j.id,j.revision,j.hash,decision,JSON.stringify(note),OWNER,AT)}
 function published(j){sql.prepare("INSERT INTO production_data_videos(id,owner_id,title,topic_type,published_at,publication_source,job_id,record_hash,request_id,created_at) VALUES (?,?,'SYNTHETIC','SYNTHETIC',?,'SYNTHETIC',?,?,?,?)").run('SYNTHETIC-pub-'+j.id,OWNER,AT,j.id,'d'.repeat(64),'SYNTHETIC-pub-'+j.id,AT)}
 const snapshot=()=>clone(Object.fromEntries(['production_jobs','production_drafts','production_milestones','production_operations','production_reviews','production_stages','production_data_videos','dispositions','app_state'].map(table=>[table,sql.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()])));
 return{sql,topic,seed,scope,stage,operation,review,published,snapshot,beforeBatch:hook=>{beforeBatch=hook},beforeRegistrationRows:hook=>{beforeRegistrationRows=hook}};
}

test('SYNTHETIC explicit Chongzhen owner hold skips queued probes, native handoffs and text without changing stored missing evidence',async t=>{
 const f=fixture(t),held=f.seed({id:'job_3c14fe6f-44b0-472c-8455-e75040b695bb'}),ready=f.seed();
 await p.registerFreePreparation(held.id,{binding:p.scopeBinding(await p.getJob(held.id)),automatic:true});
 let before=f.snapshot();assert.equal((await p.nextWork()).job.id,ready.id);assert.deepEqual(f.snapshot(),before);
 f.sql.prepare("UPDATE production_stages SET status='blocked' WHERE job_id=?").run(held.id);before=f.snapshot();assert.equal((await p.nextWork()).job.id,ready.id);assert.deepEqual(f.snapshot(),before);
 f.sql.prepare("UPDATE production_jobs SET status='paused' WHERE id=?").run(ready.id);before=f.snapshot();const waiting=await p.nextWork();assert.equal(waiting.job,null);assert.ok(!(waiting.native_preparation_waiting||[]).some(h=>h.job_id===held.id));assert.deepEqual(f.snapshot(),before);
 f.sql.prepare("UPDATE production_jobs SET status='waiting_executor',attempt=0,ai_calls=0 WHERE id=?").run(held.id);before=f.snapshot();assert.equal((await p.nextWork()).job,null);assert.deepEqual(f.snapshot(),before);
});

test('SYNTHETIC legacy MiniCPM current owner text feedback reaches the normal claim and node review, never old media approval',async t=>{
 const f=fixture(t),j=f.seed({id:p.PREPARATION_REGISTRATION_EXCLUSIONS[0],revision:2});
 f.sql.prepare('UPDATE production_jobs SET reworks=1,attempt=4,ai_calls=0 WHERE id=?').run(j.id);
 const saved=await p.saveScriptFeedback(j.id,OWNER,{revision:j.revision,content_hash:j.hash,mode_epoch:j.epoch,note:'SYNTHETIC update history layout and use current outro',origin:{kind:'reopen'}});
 assert.equal(saved.queued,true);assert.equal(saved.job.status,'waiting_executor');assert.equal(saved.job.revision,2);assert.equal(saved.job.approved_revision,null);assert.equal(saved.job.review_mode,'node');assert.ok(saved.job.milestones.every(m=>m.status==='invalidated'));
 const before=f.snapshot(),selected=await p.nextWork();assert.equal(selected.kind,'text');assert.equal(selected.job.id,j.id);assert.deepEqual(f.snapshot(),before);assert.equal((await p.nextWork(undefined,[j.id])).job,null);
 const opinion=f.sql.prepare("SELECT id FROM production_reviews WHERE job_id=? AND decision='script_feedback'").get(j.id);
 f.sql.prepare("UPDATE production_reviews SET reviewer='SYNTHETIC-other' WHERE id=?").run(opinion.id);assert.equal((await p.nextWork()).job,null);f.sql.prepare('UPDATE production_reviews SET reviewer=? WHERE id=?').run(OWNER,opinion.id);
 const claimed=await p.claimJob('SYNTHETIC existing feedback executor',j.id);assert.equal(claimed.job.id,j.id);assert.equal(claimed.job.review_mode,'node');assert.equal(claimed.job.approved_revision,null);assert.equal(claimed.job.approved_hash,null);assert.equal(claimed.job.reworks,2);assert.ok(claimed.job.milestones.every(m=>m.status==='invalidated'));
});

test('SYNTHETIC real manual source/script approval selects registration read-only, then owner-authorized private scope creates only two technical checks before production',async t=>{
 const f=fixture(t),topic=f.topic(),created=(await p.createJob(topic,OWNER)).job,claim=await p.claimJob('SYNTHETIC text fixture',created.id),draft={script:'SYNTHETIC source grounded narration.',materials:'SYNTHETIC no actual media',limits:'No visual, audio, paid or publication approval',evidence:[{url:JSON.parse(created.source_snapshot).url,title:'SYNTHETIC original',published_at:null,retrieved_at:AT,sha256:'a'.repeat(64),facts:['SYNTHETIC'],materials:['SYNTHETIC'],limits:['SYNTHETIC']}],execution:{mode:'operator-assisted',executor:'SYNTHETIC',source_hash:sha(created.source_snapshot),skill_hash:JSON.parse(created.skill_snapshot).sha256}};
 let j=(await p.submitDraft(created.id,claim.lease_token,0,'SYNTHETIC-original',draft)).job;
 for(const node of ['source','script']){const m=j.milestones.find(m=>m.node===node);j=await p.decideMilestone(j.id,m.id,j.revision,m.artifact_hash,j.mode_epoch,'approve',{},OWNER)}
 assert.equal(j.status,'approved');const before=f.snapshot(),selected=await p.nextWork();assert.equal(selected.kind,'preparation-registration');assert.equal(selected.job.id,j.id);assert.deepEqual(selected.binding,p.scopeBinding(j));assert.equal(selected.execution_started,false);assert.equal(selected.new_paid_calls,0);assert.equal(selected.quality_approval,false);assert.equal(selected.publication_authorization,false);assert.equal(selected.automatic_trigger,false);assert.deepEqual(f.snapshot(),before);
 const saved=await p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true});assert.equal(saved.replayed,false);assert.equal(saved.job.media_continuation.scope.authorization_source,'owner-private-video');assert.equal(saved.job.media_continuation.scope.owner_confirmed,true);assert.equal(saved.job.media_continuation.scope.scope,'private-video');assert.equal(saved.job.media_continuation.scope.authorization_reference,APPROVED_PRODUCTION_AUTHORIZATION);assert.equal(saved.job.media_continuation.scope.new_paid_authorization,false);assert.equal(saved.job.media_continuation.scope.publication_authorization,false);assert.equal(saved.job.media_continuation.scope.quality_approved,false);
 assert.deepEqual(f.snapshot().production_jobs,before.production_jobs);assert.deepEqual(f.snapshot().production_drafts,before.production_drafts);assert.deepEqual(f.snapshot().production_milestones,before.production_milestones);assert.equal(f.snapshot().production_operations.length,0);assert.deepEqual(saved.job.stages.map(s=>[s.stage,s.status,JSON.parse(s.result).attempt]).sort(),[['media_inputs','queued',0],['media_inventory','queued',0]]);
 const after=f.snapshot();assert.equal((await p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true})).replayed,true);assert.deepEqual(f.snapshot(),after);
 for(const status of ['blocked','ready']){const next=await p.nextWork();assert.equal(next.kind,'preparation');const active=await p.claimPreparation(j.id,next.stage_id,'SYNTHETIC-'+status);await p.completePreparation(j.id,next.stage_id,active.lease_token,receipt(active.kind,status))}
 const final=f.snapshot();assert.equal((await p.nextWork()).kind,'native-preparation-handoff');assert.equal((await p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true})).replayed,true);assert.deepEqual(f.snapshot(),final);assert.deepEqual(final.production_jobs,before.production_jobs);assert.equal(final.production_reviews.filter(r=>r.decision==='media_scope').length,1);assert.ok(final.production_stages.every(s=>JSON.parse(s.result).attempt===1));assert.ok(final.production_milestones.every(m=>['source','script'].includes(m.node)));
});

test('SYNTHETIC oldest eligible registration respects exclude IDs, preserves exhausted unrelated budgets and never enters engineering test selection',async t=>{
 const f=fixture(t),first=f.seed({created:'2026-10-16T00:00:00Z'}),second=f.seed(),engineering=f.seed();f.sql.prepare('UPDATE production_jobs SET is_test=1 WHERE id=?').run(engineering.id);const before=f.snapshot();
 assert.equal((await p.nextWork()).job.id,first.id);assert.equal((await p.nextWork(undefined,[first.id])).job.id,second.id);assert.equal((await p.nextWork(undefined,[first.id,second.id])).job,null);assert.equal((await p.nextWork(engineering.id)).job,null);assert.deepEqual(f.snapshot(),before);
 const selected=await p.nextWork();assert.equal(selected.job.attempt,6);assert.equal(selected.job.reworks,2);assert.equal(selected.job.ai_calls,8);await p.registerFreePreparation(first.id,{binding:selected.binding,automatic:true});assert.deepEqual(f.snapshot().production_jobs,before.production_jobs);
});

test('full-auto fresh jobs register zero-fee private production and reach the native video queue without a second scope button',async t=>{
 const f=fixture(t),j=f.seed();f.sql.prepare("UPDATE production_jobs SET review_mode='auto' WHERE id=?").run(j.id);const before=f.snapshot(),selected=await p.nextWork();assert.equal(selected.kind,'preparation-registration');assert.equal(selected.automatic_private_video,true);assert.deepEqual(f.snapshot(),before);
 const saved=await p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true}),s=saved.job.media_continuation.scope;assert.equal(s.scope,'private-video');assert.equal(s.owner_confirmed,true);assert.equal(s.authorization_reference,'owner-selected-full-auto-zero-fee-v1');assert.equal(s.new_paid_authorization,false);assert.equal(s.publication_authorization,false);assert.equal(s.quality_approved,false);
 const audit=f.snapshot().production_reviews.find(r=>r.id===s.id);assert.equal(audit.reviewer,OWNER);assert.equal(JSON.parse(audit.note).authorization_reference,'owner-selected-full-auto-zero-fee-v1');
 for(let n=0;n<2;n++){const work=await p.nextWork();assert.equal(work.kind,'preparation');const claim=await p.claimPreparation(j.id,work.stage_id,'SYNTHETIC-auto-'+n);await p.completePreparation(j.id,work.stage_id,claim.lease_token,receipt(claim.kind,'ready'));}
 const work=await p.nextWork();assert.equal(work.kind,'native-preparation-handoff');assert.equal(work.native_preparation.binding.scope,'private-video');
 const stable=f.snapshot();assert.equal((await p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true})).replayed,true);assert.deepEqual(f.snapshot(),stable);
});
test('legacy internal inventory-only auto scope upgrades once; manual preparation and unknown native runs remain unchanged',async t=>{
 for(const blocked of [null,'manual','unknown','cancelled']){const f=fixture(t),j=f.seed();f.sql.prepare("UPDATE production_jobs SET review_mode='auto' WHERE id=?").run(j.id);const old=f.scope(j,{authorization_source:blocked==='manual'?undefined:'included-free-preparation',owner_confirmed:false});f.stage(j,{kind:'media_inputs'});
  if(blocked==='unknown')f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('native_preparation_handoff_v1:'+j.id,JSON.stringify({status:'claimed',lease_until:0,binding:{scope:'preparation'}}));
  if(blocked==='cancelled')f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify({id:'cancelled',scope:null}),'media_scope_v1:'+j.id);
  const selected=await p.nextWork();if(blocked){assert.notEqual(selected.kind,'preparation-registration');continue;}
  assert.equal(selected.automatic_private_video,true);const saved=await p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true});assert.notEqual(saved.job.media_continuation.current_id,old.id);assert.equal(saved.job.media_continuation.scope.scope,'private-video');assert.equal(JSON.parse(saved.job.stages.find(s=>s.stage==='media_inputs').result).attempt,2);
 }
});
test('auto scope registration revalidates the owner mode at its write boundary',async t=>{const f=fixture(t),j=f.seed();f.sql.prepare("UPDATE production_jobs SET review_mode='auto' WHERE id=?").run(j.id);const selected=await p.nextWork();f.beforeBatch(()=>f.sql.prepare("UPDATE production_jobs SET review_mode='node' WHERE id=?").run(j.id));await assert.rejects(()=>p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true}),/并发/);assert.equal(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('media_scope_v1:'+j.id),undefined);});

const blockers=[
 ['MiniCPM',f=>{const j=f.seed({id:p.PREPARATION_REGISTRATION_EXCLUSIONS[0],revision:2});f.sql.prepare("UPDATE production_jobs SET status='paused' WHERE id=?").run(j.id);return j}],
 ['Claude',f=>f.seed({id:p.PREPARATION_REGISTRATION_EXCLUSIONS[1]})],
 ['engineering fixture',(f,j)=>f.sql.prepare('UPDATE production_jobs SET is_test=1 WHERE id=?').run(j.id)],
 ['no owner',(f,j)=>f.sql.prepare('UPDATE production_jobs SET owner_id=NULL WHERE id=?').run(j.id)],
 ['not approved',(f,j)=>f.sql.prepare("UPDATE production_jobs SET status='paused' WHERE id=?").run(j.id)],
 ['stale approval',(f,j)=>f.sql.prepare('UPDATE production_jobs SET approved_revision=0 WHERE id=?').run(j.id)],
 ['no approved draft',(f,j)=>f.sql.prepare('DELETE FROM production_drafts WHERE job_id=?').run(j.id)],
 ['draft hash differs',(f,j)=>f.sql.prepare("UPDATE production_drafts SET content_hash=? WHERE job_id=?").run('f'.repeat(64),j.id)],
 ['invalid draft body',(f,j)=>f.sql.prepare("UPDATE production_drafts SET content='{}' WHERE job_id=?").run(j.id)],
 ['published',(f,j)=>f.published(j)],
 ['produced topic',(f,j)=>f.sql.prepare("INSERT INTO dispositions(user_id,topic_id,status,updated_at) VALUES (?,?,'produced',?)").run(OWNER,j.topic,AT)],
 ['current video milestone',(f,j)=>f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES (?,?,'video',?,?,'{}','awaiting_human',?,?,?)").run('SYNTHETIC-video-'+j.id,j.id,j.revision,j.hash,j.epoch,AT,AT)],
 ...['native_video_candidate','native_video_archive_v1','private_publicity_files','media_preparation'].map(decision=>['existing '+decision,(f,j)=>f.review(j,decision)]),
 ['completed video operation',(f,j)=>f.operation(j,{status:'completed'})],
 ...['queued','running','prepared','paused','failed'].map(status=>['unsettled operation '+status,(f,j)=>f.operation(j,{status})]),
 ['expired historical operation',(f,j)=>f.operation(j,{revision:0,status:'running'})],
 ...['queued','blocked','ready','running'].map(status=>['partial current preparation '+status,(f,j)=>f.stage(j,{status})]),
 ['live job lease',(f,j)=>f.sql.prepare('UPDATE production_jobs SET lease_hash=?,lease_until=? WHERE id=?').run('SYNTHETIC',Date.now()+600000,j.id)],
 ['expired unknown job lease',(f,j)=>f.sql.prepare('UPDATE production_jobs SET lease_hash=?,lease_until=0 WHERE id=?').run('SYNTHETIC',j.id)],
 ['lease hash without lease',(f,j)=>f.sql.prepare('UPDATE production_jobs SET lease_hash=? WHERE id=?').run('SYNTHETIC',j.id)],
 ['approved job with error',(f,j)=>f.sql.prepare("UPDATE production_jobs SET error='SYNTHETIC unknown result' WHERE id=?").run(j.id)],
 ['scope withdrawal',(f,j)=>f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('media_scope_v1:'+j.id,JSON.stringify({id:'SYNTHETIC-cancel',scope:null}))],
 ['deleted withdrawal state',(f,j)=>f.review(j,'media_scope_cancel',{schema:'media-scope-cancel-v1'})],
 ['malformed scope',(f,j)=>f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('media_scope_v1:'+j.id,'{SYNTHETIC invalid JSON')],
 ['unknown scope object',(f,j)=>f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('media_scope_v1:'+j.id,'{}')],
 ['current scope missing stages',(f,j)=>f.scope(j)],
 ['same-generation mismatching hash',(f,j)=>f.scope(j,{binding:{revision:j.revision,script_hash:'e'.repeat(64),mode_epoch:j.epoch,contract_hash:j.contract}})],
 ['future scope',(f,j)=>f.scope(j,{binding:{revision:j.revision+1,script_hash:j.hash,mode_epoch:j.epoch,contract_hash:j.contract}})],
 ['unapproved script milestone',(f,j)=>f.sql.prepare("UPDATE production_milestones SET status='awaiting_human' WHERE job_id=? AND node='script'").run(j.id)],
 ['stale text milestone epoch',(f,j)=>f.sql.prepare("UPDATE production_milestones SET mode_epoch=1 WHERE job_id=? AND node='script'").run(j.id)],
 ['partial text milestones',(f,j)=>f.sql.prepare("DELETE FROM production_milestones WHERE job_id=? AND node='script'").run(j.id)]
];
for(const [name,mutate] of blockers)test('SYNTHETIC registration safely skips '+name+' without changing any row',async t=>{const f=fixture(t);let j;if(['MiniCPM','Claude'].includes(name))j=mutate(f);else{j=f.seed();mutate(f,j)}const before=f.snapshot(),selected=await p.nextWork();assert.notEqual(selected.kind,'preparation-registration');if(['MiniCPM','Claude'].includes(name))assert.equal(selected.job,null);assert.deepEqual(f.snapshot(),before)});

test('SYNTHETIC new approved revision can register after an older scope while preserving historical attempts and all old rows',async t=>{
 const f=fixture(t),j=f.seed({revision:2}),oldBinding={revision:1,script_hash:'e'.repeat(64),mode_epoch:0,contract_hash:j.contract},old=f.scope(j,{binding:oldBinding});for(const [kind,status,attempt] of [['media_inventory','blocked',3],['media_inputs','ready',2]])f.stage(j,{kind,status,attempt,revision:1,scopeId:old.id});const before=f.snapshot(),selection=await p.nextWork();assert.equal(selection.kind,'preparation-registration');assert.equal(selection.binding.revision,2);assert.deepEqual(f.snapshot(),before);
 const result=await p.registerFreePreparation(j.id,{binding:selection.binding,automatic:true});assert.equal(result.replayed,false);assert.equal(result.job.stages.filter(s=>s.review_revision===2&&s.status==='queued').length,2);assert.deepEqual(f.snapshot().production_stages.filter(s=>s.review_revision===1),before.production_stages);assert.deepEqual(f.snapshot().production_jobs,before.production_jobs);
});

test('SYNTHETIC concurrent existing registration CAS has one audit winner and does not touch approvals, scopes or preparation attempts twice',async t=>{
 const f=fixture(t),j=f.seed(),selected=await p.nextWork(),before=f.snapshot(),results=await Promise.all([p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true}),p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true})]);assert.ok(results.every(r=>r.job.media_continuation.scope.id===results[0].job.media_continuation.scope.id));assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='media_scope'").get().n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_stages').get().n,2);assert.deepEqual(f.snapshot().production_jobs,before.production_jobs);assert.equal((await p.nextWork()).kind,'preparation');
});

test('SYNTHETIC selection rechecks a concurrent scope cancellation and skips the changed candidate without writes',async t=>{
 const f=fixture(t),j=f.seed(),other=f.seed();f.beforeRegistrationRows(()=>{f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('media_scope_v1:'+j.id,JSON.stringify({id:'SYNTHETIC-concurrent-withdrawal',scope:null}))});const selected=await p.nextWork();assert.equal(selected.kind,'preparation-registration');assert.equal(selected.job.id,other.id);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_reviews').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_stages').get().n,0);
});

for(const change of ['mode','withdrawal'])test('SYNTHETIC existing registration CAS rejects '+change+' changed after selection without partial preparation writes',async t=>{
 const f=fixture(t),j=f.seed(),selected=await p.nextWork();f.beforeBatch(()=>{if(change==='mode')f.sql.prepare('UPDATE production_jobs SET mode_epoch=1 WHERE id=?').run(j.id);else f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('media_scope_v1:'+j.id,JSON.stringify({id:'SYNTHETIC-CAS-withdrawal',scope:null}))});await assert.rejects(()=>p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true}),error=>error.status===409);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_stages').get().n,0);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='media_scope'").get().n,0);if(change==='withdrawal')assert.equal(JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('media_scope_v1:'+j.id).value).scope,null);
});

const registrationRaces=[
 ['native candidate',(f,j)=>f.review(j,'native_video_candidate',{script_hash:j.hash,sha256:'a'.repeat(64)})],
 ['current video milestone',(f,j)=>f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES (?,?,'video',?,?,'{}','awaiting_human',?,?,?)").run('SYNTHETIC-race-video-'+j.id,j.id,j.revision,j.hash,j.epoch,AT,AT)],
 ['unknown expired operation',(f,j)=>f.operation(j,{status:'running',lease:0})],
 ['unknown paused operation',(f,j)=>f.operation(j,{status:'paused'})],
 ['new publication',(f,j)=>f.published(j)],
 ['new partial blocked stage',(f,j)=>f.stage(j,{status:'blocked',attempt:2})],
 ['owner private-video scope',(f,j)=>f.scope(j,{id:'SYNTHETIC-owner-new-private',scope:'private-video'})],
 ['test flag',(f,j)=>f.sql.prepare('UPDATE production_jobs SET is_test=1 WHERE id=?').run(j.id)]
];
for(const[name,change]of registrationRaces)test('SYNTHETIC automatic registration SQL CAS refuses '+name+' inserted after its precheck',async t=>{
 const f=fixture(t),j=f.seed(),selected=await p.nextWork();let raced;
 f.beforeBatch(()=>{change(f,j);raced=f.snapshot()});
 await assert.rejects(()=>p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true}),error=>error.status===409);
 assert.deepEqual(f.snapshot(),raced,'the automatic attempt must preserve the concurrent record and write no scope, review or stages');
});

test('SYNTHETIC automatic registration precheck refuses a candidate added after selection and exact existing private scope replay never narrows it',async t=>{
 const f=fixture(t),candidate=f.seed(),selected=await p.nextWork();f.review(candidate,'native_video_candidate',{script_hash:candidate.hash,sha256:'a'.repeat(64)});const before=f.snapshot();await assert.rejects(()=>p.registerFreePreparation(candidate.id,{binding:selected.binding,automatic:true}),error=>error.status===409);assert.deepEqual(f.snapshot(),before);
 const privateJob=f.seed(),state=f.scope(privateJob,{scope:'private-video'});f.stage(privateJob,{status:'ready',scopeId:state.id,attempt:3});const bound=p.scopeBinding(await p.getJob(privateJob.id)),privateBefore=f.snapshot(),replay=await p.registerFreePreparation(privateJob.id,{binding:bound,automatic:true});assert.equal(replay.replayed,true);assert.equal(replay.job.media_continuation.scope.scope,'private-video');assert.deepEqual(f.snapshot(),privateBefore);
});

test('SYNTHETIC same-millisecond automatic CAS loser cannot reset the winning probes or erase their completed receipts',async t=>{
 const f=fixture(t),j=f.seed(),selected=await p.nextWork(),OriginalDate=Date,fixed=OriginalDate.now();let winner,saved;
 globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return OriginalDate.now()}};
 try{
  f.beforeBatch(async()=>{
   winner=await p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true});
   for(const stage of winner.job.stages){const claim=await p.claimPreparation(j.id,stage.id,'SYNTHETIC-winner-'+stage.stage);await p.completePreparation(j.id,stage.id,claim.lease_token,receipt(claim.kind,'blocked'))}
   saved=f.snapshot();
  });
  const loser=await p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true});
  assert.equal(winner.replayed,false);assert.equal(loser.replayed,true);assert.deepEqual(f.snapshot(),saved);assert.ok(saved.production_stages.every(s=>s.status==='blocked'&&JSON.parse(s.result).attempt===1&&JSON.parse(s.result).receipt.status==='blocked'));assert.equal(saved.production_reviews.filter(r=>r.decision==='media_scope').length,1);
 }finally{globalThis.Date=OriginalDate}
});

test('SYNTHETIC automatic endpoints exclude protected/missing/partial work while the legacy explicit API remains available',async t=>{
 const f=fixture(t),mini=f.seed({id:p.PREPARATION_REGISTRATION_EXCLUSIONS[0]}),partial=f.seed();f.stage(partial,{status:'ready',attempt:3});f.sql.prepare("UPDATE production_milestones SET status='awaiting_human' WHERE job_id=? AND node='source'").run(mini.id);
 for(const j of [mini,partial]){const before=f.snapshot(),binding=p.scopeBinding(await p.getJob(j.id));await assert.rejects(()=>p.registerFreePreparation(j.id,{binding,automatic:true}),error=>error.status===409);assert.deepEqual(f.snapshot(),before)}
 // Existing independent/manual clients omit automatic. Preserve that contract;
 // this is a synthetic Mini identity row and never a call to the actual task.
 const before=f.snapshot().production_jobs,result=await p.registerFreePreparation(mini.id,{binding:p.scopeBinding(await p.getJob(mini.id))});assert.equal(result.replayed,false);assert.equal(result.job.media_continuation.scope.registration_attempt_id,undefined);assert.deepEqual(f.snapshot().production_jobs,before);assert.equal((await p.nextWork()).job,null,'protected queued probes are also excluded from automatic selection');
});

test('SYNTHETIC actual getJob passes the same current scope into facts, and cannot inherit ready receipts after a mode change',async t=>{
 const f=fixture(t),j=f.seed(),selected=await p.nextWork(),saved=await p.registerFreePreparation(j.id,{binding:selected.binding,automatic:true});
 for(const stage of saved.job.stages){const claim=await p.claimPreparation(j.id,stage.id,'SYNTHETIC-ready-'+stage.stage);await p.completePreparation(j.id,stage.id,claim.lease_token,receipt(claim.kind,'ready'))}
 const current=await p.getJob(j.id);assert.equal(current.media_continuation.scope.id,saved.job.media_continuation.scope.id);assert.equal(current.facts.material_gate,'evidence-bound');assert.equal(current.facts.publication_authorization,false);assert.equal(current.facts.candidate_present,false);assert.equal(current.facts.video_approval,'not-recorded');
 f.sql.prepare('UPDATE production_jobs SET mode_epoch=mode_epoch+1 WHERE id=?').run(j.id);const before=f.snapshot(),stale=await p.getJob(j.id);assert.notEqual(stale.facts.material_gate,'evidence-bound');assert.equal((await p.nextWork()).job,null);assert.deepEqual(f.snapshot(),before);
});

function changeScope(f,j,change){const key='media_scope_v1:'+j.id,value=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get(key).value);change(value);f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(value),key)}
function changeQueuedResults(f,j,change){for(const stage of f.sql.prepare('SELECT * FROM production_stages WHERE job_id=?').all(j.id)){const value=JSON.parse(stage.result);change(value);f.sql.prepare('UPDATE production_stages SET result=? WHERE id=?').run(JSON.stringify(value),stage.id)}}
const staleQueueCases=[
 ['new job contract',(f,j)=>f.sql.prepare('UPDATE production_jobs SET contract_hash=? WHERE id=?').run('e'.repeat(64),j.id)],
 ['missing scope contract',(f,j)=>changeScope(f,j,v=>delete v.scope.binding.contract_hash)],
 ['wrong scope revision',(f,j)=>changeScope(f,j,v=>v.scope.binding.revision=0)],
 ['string scope epoch',(f,j)=>changeScope(f,j,v=>v.scope.binding.mode_epoch=String(j.epoch))],
 ['unknown scope schema',(f,j)=>changeScope(f,j,v=>v.scope.schema='SYNTHETIC-unknown')],
 ['different scope id',(f,j)=>changeScope(f,j,v=>v.scope.id='SYNTHETIC-different')],
 ['unknown scope purpose',(f,j)=>changeScope(f,j,v=>v.scope.scope='SYNTHETIC-unknown')],
 ['scope approval claim',(f,j)=>changeScope(f,j,v=>v.scope.quality_approved=true)],
 ['stage wrong contract',(f,j)=>changeQueuedResults(f,j,v=>v.binding.contract_hash='e'.repeat(64))],
 ['stage wrong revision',(f,j)=>changeQueuedResults(f,j,v=>v.binding.revision=0)],
 ['stage wrong script',(f,j)=>changeQueuedResults(f,j,v=>v.binding.script_hash='f'.repeat(64))],
 ['stage string epoch',(f,j)=>changeQueuedResults(f,j,v=>v.binding.mode_epoch=String(j.epoch))],
 ['stage unknown schema',(f,j)=>changeQueuedResults(f,j,v=>v.schema='SYNTHETIC-unknown')],
 ['stage string attempt',(f,j)=>changeQueuedResults(f,j,v=>v.attempt='0')],
 ['stage invalid JSON',(f,j)=>f.sql.prepare("UPDATE production_stages SET result='{SYNTHETIC invalid' WHERE job_id=?").run(j.id)],
 ['scope invalid JSON',(f,j)=>f.sql.prepare("UPDATE app_state SET value='{SYNTHETIC invalid' WHERE key=?").run('media_scope_v1:'+j.id)],
 ['published queued job',(f,j)=>f.published(j)],
 ['produced queued topic',(f,j)=>f.sql.prepare("INSERT INTO dispositions(user_id,topic_id,status,updated_at) VALUES (?,?,'produced',?)").run(OWNER,j.topic,AT)]
];
for(const[name,change]of staleQueueCases)test('SYNTHETIC stale preparation queue '+name+' never starves another valid queue or rewrites historical stages',async t=>{
 const f=fixture(t),stale=f.seed(),valid=f.seed();
 for(const j of [stale,valid])await p.registerFreePreparation(j.id,{binding:p.scopeBinding(await p.getJob(j.id)),automatic:true});
 f.sql.prepare("UPDATE production_stages SET updated_at='2000-01-01' WHERE job_id=?").run(stale.id);f.sql.prepare("UPDATE production_stages SET updated_at='2020-01-01' WHERE job_id=?").run(valid.id);change(f,stale);
 const before=f.snapshot(),selected=await p.nextWork();assert.equal(selected.kind,'preparation');assert.equal(selected.job.id,valid.id);assert.deepEqual(f.snapshot(),before);
 f.sql.prepare("UPDATE production_stages SET status='blocked' WHERE job_id=?").run(valid.id);const onlyStale=f.snapshot();const native=await p.nextWork();assert.equal(native.kind,'native-preparation-handoff');assert.equal(native.job.id,valid.id);assert.deepEqual(f.snapshot(),onlyStale);
});
