// Real migrated SQLite, synthetic jobs only. No provider calls or live tasks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {executorResponse} from '../scripts/executor-response.mjs';
const OWNER='SYNTHETIC-cancel-owner',ID='job_aaaaaaaa-1111-4111-8111-111111111111',AT='2026-10-23T00:00:00.000Z',HASH='a'.repeat(64);
const bundle=await build({stdin:{contents:"export * from './lib/production-cancel';export {getJob,listJobSummaries,claimJob} from './lib/production';export {nextWork} from './lib/dispatch';export {setMode,resumeDecision} from './lib/milestones';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-cancel-db',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__cancelDB}export function siteArchiveBucket(){throw Error("No live files in cancellation test")}'}));}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
function fixture(t,status='waiting_executor'){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 class S{constructor(q,args=[]){this.q=q;this.args=args}bind(...args){return new S(this.q,args)}async first(){return sql.prepare(this.q).get(...this.args)||null}async all(){return{results:sql.prepare(this.q).all(...this.args)}}async run(){if(/^\s*SELECT\b/i.test(this.q))return{results:sql.prepare(this.q).all(...this.args),meta:{changes:0}};return{meta:{changes:Number(sql.prepare(this.q).run(...this.args).changes)}}}}
 globalThis.__cancelDB={prepare:q=>new S(q),batch:async ss=>{sql.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};t.after(()=>{sql.close();delete globalThis.__cancelDB});
 sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated) VALUES('SYNTHETIC-topic','https://example.org/cancel','S','S','SYNTHETIC title','S','S',?,'视觉影像',0,'S','S','S','S','S',0)").run(AT);
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,status,source_snapshot,skill_snapshot,contract_hash,revision,mode_epoch,created_at,updated_at) VALUES(?,'SYNTHETIC-topic',?,?,?, '{}',?,1,2,?,?)").run(ID,OWNER,status,JSON.stringify({title:'SYNTHETIC title',url:'https://example.org/cancel'}),HASH,AT,AT);
 sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,1,'S',?,?,'S',?)").run(ID,JSON.stringify({script:'SYNTHETIC saved script'}),HASH,AT);
 sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES('SYNTHETIC-ms',?,'source',1,?,'{}','awaiting_ai',2,?,?)").run(ID,HASH,AT,AT);
 return sql;
}
const binding={revision:1,mode_epoch:2,reason:'SYNTHETIC 缺少合适素材'};
test('the owner cancels active work without waiting for its lease, retains artifacts and creates one durable decision',async t=>{
 const sql=fixture(t,'running');sql.prepare('UPDATE production_jobs SET lease_hash=?,lease_until=? WHERE id=?').run(HASH,Date.now()+600000,ID);
 const drafts=sql.prepare('SELECT * FROM production_drafts').all(),ms=sql.prepare('SELECT * FROM production_milestones').all();
 const result=await api.cancelProduction(ID,OWNER,binding);assert.equal(result.cancelled,true);assert.equal(result.replayed,false);assert.equal(result.job.status,'cancelled');assert.equal(result.job.lease_until,null);assert.equal(sql.prepare('SELECT lease_hash FROM production_jobs').get().lease_hash,null);
 assert.deepEqual(sql.prepare('SELECT * FROM production_drafts').all(),drafts);assert.deepEqual(sql.prepare('SELECT * FROM production_milestones').all(),ms);
 assert.equal((await api.cancelProduction(ID,OWNER,{...binding,reason:'cannot overwrite original reason'})).replayed,true);
 const audits=sql.prepare("SELECT * FROM production_reviews WHERE decision='production_cancelled'").all();assert.equal(audits.length,1);assert.equal(audits[0].note,binding.reason);assert.equal(audits[0].reviewer,OWNER);
 assert.equal((await api.listJobSummaries(OWNER))[0].workspace_section,'cancelled');assert.equal((await api.listJobSummaries(OWNER))[0].status_label,'已取消制作');
});
test('cancellation rejects another owner, stale version and invalid reason without changing the job',async t=>{
 const sql=fixture(t);await assert.rejects(api.cancelProduction(ID,'SYNTHETIC-other',binding),e=>e.status===403);await assert.rejects(api.cancelProduction(ID,OWNER,{...binding,revision:0}),e=>e.status===409);await assert.rejects(api.cancelProduction(ID,OWNER,{...binding,reason:3}),e=>e.status===400);assert.equal(sql.prepare('SELECT status FROM production_jobs').get().status,'waiting_executor');assert.equal(sql.prepare('SELECT count(*) n FROM production_reviews').get().n,0);
});
test('completed and warehouse-frozen jobs cannot be cancelled',async t=>{
 const sql=fixture(t,'completed');await assert.rejects(api.cancelProduction(ID,OWNER,binding),e=>e.status===409);sql.prepare("UPDATE production_jobs SET status='approved'").run();sql.prepare("INSERT INTO publishing_reserve(id,owner_id,job_id,binding,binding_hash,title,approved_at,status,created_at,updated_at) VALUES('SYNTHETIC-reserve',?,?,'{}',?,'SYNTHETIC',?,'ready',?,?)").run(OWNER,ID,HASH,AT,AT,AT);await assert.rejects(api.cancelProduction(ID,OWNER,binding),e=>e.status===409);assert.equal(sql.prepare('SELECT status FROM production_jobs').get().status,'approved');
});
test('an actual publication prevents cancellation even if an old production status still says approved',async t=>{
 const sql=fixture(t,'approved');sql.prepare("INSERT INTO production_data_videos(id,owner_id,job_id,title,topic_type,published_at,publication_source,record_hash,request_id,created_at) VALUES('SYNTHETIC-published',?,?,'SYNTHETIC','visual',?,'SYNTHETIC observed publication','SYNTHETIC-hash','SYNTHETIC-request',?)").run(OWNER,ID,AT,AT);await assert.rejects(api.cancelProduction(ID,OWNER,binding),e=>e.status===409);assert.equal(sql.prepare('SELECT status FROM production_jobs').get().status,'approved');
});
test('cancelled work is neither dispatched nor claimable; late job and child callbacks cannot revive it',async t=>{
 const sql=fixture(t);await api.cancelProduction(ID,OWNER,binding);await assert.rejects(api.assertProductionNotCancelled(ID),e=>e.code==='PRODUCTION_CANCELLED');
 assert.equal((await api.nextWork()).job,null);assert.equal((await api.claimJob('SYNTHETIC-executor',ID)).job,null);
 assert.throws(()=>sql.prepare("UPDATE production_jobs SET status='approved'").run(),/PRODUCTION_CANCELLED/);
 assert.throws(()=>sql.prepare("UPDATE production_milestones SET status='approved'").run(),/PRODUCTION_CANCELLED/);
 assert.throws(()=>sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,2,'late','{}',?,'late',?)").run(ID,HASH,AT),/PRODUCTION_CANCELLED/);
 await assert.rejects(api.setMode(ID,OWNER,'auto',2));await assert.rejects(api.resumeDecision(ID,OWNER,'retry','SYNTHETIC stale retry'));assert.equal(sql.prepare('SELECT status FROM production_jobs').get().status,'cancelled');
});
test('executor transport distinguishes an owner cancellation from a failed or unknown call',async()=>{
 await assert.rejects(executorResponse(new Response(JSON.stringify({error:'已取消',code:'PRODUCTION_CANCELLED'}),{status:409})),e=>e.code==='PRODUCTION_CANCELLED'&&e.status===409);
});
