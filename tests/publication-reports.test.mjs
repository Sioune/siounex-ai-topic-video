import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

test('existing publication reports are read-only, job/owner scoped and never register approval',async()=>{
 const d=new DatabaseSync(':memory:');
 for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())d.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args}bind(...args){return new Statement(this.sql,args)}async first(){return d.prepare(this.sql).get(...this.args)||null}async all(){return {results:d.prepare(this.sql).all(...this.args)}}async run(){return {meta:{changes:Number(d.prepare(this.sql).run(...this.args).changes)}}}}
 globalThis.__publicationDb={prepare:sql=>new Statement(sql)};
 await build({entryPoints:['lib/production.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/publication-read-test.mjs',plugins:[{name:'sqlite-read',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function db(){return globalThis.__publicationDb}export function siteArchiveBucket(){throw Error("SYNTHETIC read-only test must not access archive storage")}' }))}}]});
 const {getJob}=await import('../.sites-runtime/publication-read-test.mjs');
 d.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated) VALUES ('topic','https://example.org/read','s','s','t','t','s','now','c',1,'m','h','a','m','r',0)");
 d.exec("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,created_at,updated_at,revision) VALUES ('job','topic','owner',0,'awaiting_review','{}','{}','h','now','now',3)");
 const insert=d.prepare('INSERT INTO production_data_videos(id,owner_id,title,topic_type,published_at,publication_source,job_id,record_hash,request_id,created_at) VALUES (?,?,?,\'tool\',?,\'User self-report; no platform verification or quality approval\',?,?,?,?)');
 for(const [id,owner,job] of [['shared',null,'job'],['own','owner','job'],['private-other','other','job'],['unrelated',null,null]])insert.run(id,owner,id,'2026-10-10T12:22:00.000Z',job,id,id,'now');
 insert.run('undated-draft','owner','undated',null,'job','undated-draft','undated-draft','now');
 const snapshot=()=>JSON.stringify(['production_jobs','production_data_videos','production_reviews','production_milestones'].map(t=>d.prepare('SELECT * FROM '+t).all()));
 const before=snapshot(),job=await getJob('job','owner');
 assert.deepEqual(job.publication_reports.map(r=>r.id).sort(),['own','shared']);
 assert.equal(job.status,'awaiting_review');assert.equal(job.approved_revision,null);assert.equal(job.reviews.length,0);assert.equal(job.milestones.length,0);
 await assert.rejects(()=>getJob('job','other'));assert.equal(snapshot(),before);
 d.close();delete globalThis.__publicationDb;
});
