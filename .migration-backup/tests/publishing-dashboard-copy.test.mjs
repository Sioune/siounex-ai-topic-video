import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{contents:`export {currentPlatformCopyReviews} from './lib/publishing-dashboard-copy';export {platformCopyReview,decidePlatformCopy} from './lib/publishing-copy-review';`,resolveDir:root},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'store',namespace:'fixture'}));
 b.onResolve({filter:/platform-promotion-drafts\.json$/},()=>({path:'seeds',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='store'?`export function db(){return globalThis.__dashboardCopy.db}`:`export default {schema:'fixture',strategy_version:'fixture',get drafts(){return globalThis.__dashboardCopy.seeds}}`}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('batch dashboard keeps current decisions and owner checks; chunks never truncate',async t=>{
 const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE production_jobs(id TEXT PRIMARY KEY,owner_id TEXT,is_test INTEGER);CREATE TABLE production_milestones(id TEXT PRIMARY KEY,job_id TEXT,artifact_hash TEXT,artifact TEXT,status TEXT)`);
 const owner='owner',job='job',hash='a'.repeat(64),promo={role:'promotion',milestone_id:'node',artifact_hash:'hash',sha256:hash};
 const binding={job_id:job,materials:[promo]};const platforms=Object.fromEntries(['douyin','wechat_channels','bilibili','kuaishou','xiaohongshu'].map(p=>[p,{title:p,description:p,tags:[],approach:p}]));
 class Statement{constructor(q,args=[]){this.q=q;this.args=args}bind(...args){return new Statement(this.q,args)}async first(){return sql.prepare(this.q).get(...this.args)||null}async run(){return {meta:{changes:Number(sql.prepare(this.q).run(...this.args).changes)}}}}
 let batches=0;globalThis.__dashboardCopy={seeds:[{job_id:job,source_promotion_sha256:hash,platforms}],db:{prepare:q=>new Statement(q),batch:async stmts=>{batches++;return stmts.map(s=>({results:sql.prepare(s.q).all(...s.args)}))}}};t.after(()=>{sql.close();delete globalThis.__dashboardCopy});
 sql.prepare('INSERT INTO production_jobs VALUES (?,?,?)').run(job,owner,0);sql.prepare('INSERT INTO production_milestones VALUES (?,?,?,?,?)').run('node',job,'hash',JSON.stringify({text:'original'}),'approved');
 const reserve={status:'ready',binding,title:'topic'},expected=await api.platformCopyReview(owner,binding,'topic','original');
 assert.deepEqual(await api.currentPlatformCopyReviews(owner,[reserve]),[expected]);
 await api.decidePlatformCopy(owner,binding,{copy_hash:expected.copy_hash,decision:'revise',reason:'owner feedback'},'original');
 const revised=await api.platformCopyReview(owner,binding,'topic','original');assert.equal(revised.status,'revise');
 const rows=await api.currentPlatformCopyReviews(owner,[...Array(41).fill(reserve),{...reserve,status:'published'}]);assert.equal(rows.length,41);assert.deepEqual(rows[0],revised);assert.deepEqual(rows[40],revised);assert.equal(batches,3);
 await assert.rejects(api.currentPlatformCopyReviews('other',[reserve]),e=>e.status===404);
 sql.prepare("UPDATE production_milestones SET status='superseded'").run();await assert.rejects(api.currentPlatformCopyReviews(owner,[reserve]),e=>e.status===409);
 sql.prepare("UPDATE production_milestones SET status='approved',artifact_hash='wrong'").run();await assert.rejects(api.currentPlatformCopyReviews(owner,[reserve]),e=>e.status===409);
});
