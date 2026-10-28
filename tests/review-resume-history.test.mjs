import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
test('manual recovery changes only current artifact version and preserves rejected history',async t=>{
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 class Statement{constructor(query,args=[]){this.query=query;this.args=args;}bind(...args){return new Statement(this.query,args);}async first(){return sql.prepare(this.query).get(...this.args)||null;}async all(){return{results:sql.prepare(this.query).all(...this.args)};}async run(){return{meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}}
 globalThis.__resumeHistoryDB={prepare:query=>new Statement(query),async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};t.after(()=>{sql.close();delete globalThis.__resumeHistoryDB;});
 const bundled=await build({stdin:{contents:"export {resumeDecision} from './lib/milestones';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'synthetic-history-store',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'store',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:'export function db(){return globalThis.__resumeHistoryDB}export function siteArchiveBucket(){throw Error("SYNTHETIC history test must not access R2")}'}));}}]});
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
 sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk) VALUES('topic','https://synthetic.invalid/history','synthetic','synthetic','SYNTHETIC','SYNTHETIC','S','before','S',0,'S','S','S','S','S')");
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,created_at,updated_at) VALUES('job','topic','owner',0,'paused','{}','{}',?,1,1,?,'auto',4,'before','before')").run('c'.repeat(64),'b'.repeat(64));
 for(const [id,version,status,epoch]of [['old',1,'revise',3],['current',2,'paused',4]])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,'job','cover',1,?,?,'{}',?,?,'before','before')").run(id,version,String(version).repeat(64),status,epoch);
 const history=sql.prepare("SELECT * FROM production_milestones WHERE id='old'").get();
 const job=await api.resumeDecision('job','owner','manual','SYNTHETIC owner reviewed existing call receipts');
 assert.equal(job.review_mode,'node');assert.equal(job.mode_epoch,5);assert.equal(job.approved_hash,'b'.repeat(64));
 assert.deepEqual(sql.prepare("SELECT * FROM production_milestones WHERE id='old'").get(),history);
 const current=sql.prepare("SELECT status,mode_epoch FROM production_milestones WHERE id='current'").get();assert.equal(current.status,'awaiting_human');assert.equal(current.mode_epoch,5);
 assert.equal(sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='resume_manual'").get().n,1);
});
