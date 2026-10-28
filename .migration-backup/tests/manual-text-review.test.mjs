// Isolated SQLite regression fixtures; no real owner approval, model or media call.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {REVIEW_STAGE_POLICY_VERSION,REVIEW_STAGE_POLICY_SHA256} from '../lib/review-stage-policy.mts';
const sha=s=>createHash('sha256').update(s).digest('hex');
const result=await build({stdin:{contents:"export {getJob} from './lib/production';export {resumeDecision,decideMilestone,setMode,claimReview} from './lib/milestones';export * from './lib/manual-text-review.mts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'isolated-db',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__manualTextDb} export function siteArchiveBucket(){throw Error("SYNTHETIC R2 not expected")}'}));}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
function fixture(t){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 class S{constructor(q,a=[]){this.q=q;this.a=a}bind(...a){return new S(this.q,a)}async first(){return sql.prepare(this.q).get(...this.a)||null}async all(){return {results:sql.prepare(this.q).all(...this.a)}}async run(){return {meta:{changes:Number(sql.prepare(this.q).run(...this.a).changes)}}}}
 let hook;globalThis.__manualTextDb={prepare:q=>new S(q),async batch(ss){if(hook){const h=hook;hook=null;h()}sql.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 t.after(()=>{sql.close();delete globalThis.__manualTextDb});
 sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES ('SYNTHETIC-topic','https://example.org/SYNTHETIC','test','test','SYNTHETIC','SYNTHETIC','SYNTHETIC','now','test',0,'test','test','test','test','test',0,'zh')");
 const id='SYNTHETIC-manual-text',content=JSON.stringify({script:'SYNTHETIC approved-text fixture',materials:'pending footage',limits:'not a real result',evidence:[]}),h=sha(content);
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,review_mode,source_snapshot,skill_snapshot,contract_hash,revision,attempt,reworks,ai_calls,error,created_at,updated_at) VALUES (?,'SYNTHETIC-topic','owner',0,'paused','auto','{}','{}',?,1,1,0,1,'SYNTHETIC CLI 429','before','before')").run(id,'a'.repeat(64));
 sql.prepare('INSERT INTO production_drafts VALUES (?,1,?,?,?,?,?)').run(id,'SYNTHETIC-draft',content,h,'SYNTHETIC','before');
 for(const [node,status] of [['source','paused'],['script','pending']])sql.prepare('INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,report,created_at,updated_at) VALUES (?,?,?,1,?,?,?,0,?,\'before\',\'before\')').run('SYNTHETIC-'+node,id,node,h,JSON.stringify({script:'SYNTHETIC text',evidence:[],materials:'pending',limits:'not tested'}),status,node==='source'?JSON.stringify({decision:'pause',reason:'SYNTHETIC CLI 429'}):null);
 return {sql,id,h,beforeBatch:fn=>{hook=fn}};
}
async function approve(j,node,actor='owner'){const m=j.milestones.find(m=>m.node===node&&m.revision===j.revision);return p.decideMilestone(j.id,m.id,m.revision,m.artifact_hash,m.mode_epoch,'approve',{},actor)}
test('manual text takeover keeps auto, respects dependencies and preserves budgets through both approvals',async t=>{
 const f=fixture(t),before=await p.getJob(f.id);await assert.rejects(()=>approve(before,'source'));
 let j=await p.resumeDecision(f.id,'owner','manual_text','SYNTHETIC inspect this draft only');
 assert.equal(j.review_mode,'auto');assert.equal(j.mode_epoch,0);assert.equal(j.status,'awaiting_review');assert.equal(p.currentManualTextReview(j),true);
 assert.equal(j.milestones.find(m=>m.node==='source').status,'awaiting_human');assert.equal(j.milestones.find(m=>m.node==='script').status,'pending');
 await assert.rejects(()=>approve(j,'script'));await assert.rejects(()=>approve(j,'source','other-owner'));
 const old=before.milestones.find(m=>m.node==='source');await assert.rejects(()=>p.decideMilestone(f.id,old.id,1,old.artifact_hash,1,'approve',{},'owner'));
 j=await approve(j,'source');assert.equal(j.milestones.find(m=>m.node==='script').status,'awaiting_human');
 await assert.rejects(()=>p.claimReview(f.id,'SYNTHETIC-script','SYNTHETIC no repeat model'));
 j=await approve(j,'script');assert.equal(j.review_mode,'auto');assert.equal(j.status,'approved');assert.equal(j.approved_hash,f.h);assert.equal(j.approved_revision,1);
 for(const k of ['attempt','reworks','ai_calls'])assert.equal(j[k],before[k]);
 assert.equal(j.reviews.filter(r=>r.decision==='resume_manual_text').length,1);
 assert.equal(j.reviews.filter(r=>r.decision==='approve').length,2);
 assert.equal(j.operations.length,0);assert.equal(j.milestones.some(m=>m.node==='video'),false);
 const replay=await p.resumeDecision(f.id,'owner','manual_text','SYNTHETIC do not reset approved draft');assert.equal(replay.mode_epoch,0);assert.equal(replay.reviews.length,j.reviews.length);
});
test('manual text takeover cannot override an active review or another owner',async t=>{
 const f=fixture(t);await assert.rejects(()=>p.resumeDecision(f.id,'other-owner','manual_text','SYNTHETIC forbidden'));
 f.sql.prepare("UPDATE production_milestones SET status='ai_running',review_until=? WHERE node='source'").run(Date.now()+60000);
 await assert.rejects(()=>p.resumeDecision(f.id,'owner','manual_text','SYNTHETIC active review'));
 assert.equal((await p.getJob(f.id)).mode_epoch,0);
});
test('concurrent mode change rejects takeover without touching milestones or writing an audit',async t=>{
 const f=fixture(t);f.beforeBatch(()=>f.sql.prepare("UPDATE production_jobs SET mode_epoch=2 WHERE id=?").run(f.id));
 await assert.rejects(()=>p.resumeDecision(f.id,'owner','manual_text','SYNTHETIC race'));
 assert.equal(f.sql.prepare('SELECT mode_epoch FROM production_milestones LIMIT 1').get().mode_epoch,0);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='resume_manual_text'").get().n,0);
});
test('same-mode human takeover cancels expired AI token without invalidating the template epoch',async t=>{
 const f=fixture(t),token='SYNTHETIC-old-AI-token';f.sql.prepare("UPDATE production_milestones SET status='ai_running',review_token_hash=?,review_until=? WHERE node='source'").run(sha(token),Date.now()-1);
 const j=await p.resumeDecision(f.id,'owner','manual_text','SYNTHETIC explicit receipt-inspected takeover');assert.equal(j.mode_epoch,0);assert.equal(j.review_mode,'auto');
 const m=j.milestones.find(m=>m.node==='source');await assert.rejects(()=>p.decideMilestone(f.id,m.id,1,m.artifact_hash,0,'approve',{},'codex-cli',token),/AI审核租约失效/);
 assert.equal(f.sql.prepare("SELECT review_token_hash FROM production_milestones WHERE node='source'").get().review_token_hash,null);
});
for(const race of [false,true])test('native preparation claim blocks review/mode changes '+(race?'during CAS':'before mutation'),async t=>{
 const f=fixture(t),claim=()=>f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('native_preparation_handoff_v1:'+f.id,JSON.stringify({status:'claimed',lease_until:Date.now()+60000}));
 if(race)f.beforeBatch(claim);else claim();await assert.rejects(()=>p.resumeDecision(f.id,'owner','manual_text','SYNTHETIC wait for preparation'));
 assert.equal((await p.getJob(f.id)).status,'paused');assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='resume_manual_text'").get().n,0);
});
test('same manual audit cannot approve a replaced artifact or a later revision',async t=>{
 const f=fixture(t);let j=await p.resumeDecision(f.id,'owner','manual_text','SYNTHETIC exact scope');
 f.sql.prepare("UPDATE production_milestones SET artifact_hash=? WHERE node='source'").run('b'.repeat(64));j=await p.getJob(f.id);
 assert.equal(p.currentManualTextReview(j),false);await assert.rejects(()=>approve(j,'source'));
 assert.equal(p.currentManualTextReview({...j,revision:2}),false);
});
test('permanent manual mode remains an explicit separate decision',async t=>{
 const f=fixture(t),j=await p.resumeDecision(f.id,'owner','manual','SYNTHETIC permanent node mode');
 assert.equal(j.review_mode,'node');assert.equal(p.currentManualTextReview(j),false);
});
test('server rejects obsolete stage policy without creating content rejection or rework',async t=>{
 const f=fixture(t);f.sql.prepare("UPDATE production_jobs SET status='awaiting_review',error=NULL WHERE id=?").run(f.id);f.sql.prepare("UPDATE production_milestones SET status='awaiting_ai' WHERE node='source'").run();
 const lease=await p.claimReview(f.id,'SYNTHETIC-source','SYNTHETIC-policy-check'),m=lease.milestone;
 const report={model:'gpt-5.6-sol',artifact_hash:m.artifact_hash,checks:['source_identity','facts','materials','limits'].map(criterion=>({criterion,pass:true,reason:'SYNTHETIC text reviewed',evidence:'SYNTHETIC'})),inspected_sources:[],reason:'SYNTHETIC',receipt:{exit_code:0,prompt_sha256:'b'.repeat(64),output_sha256:'c'.repeat(64),artifact_json_hash:sha(m.artifact)}};
 await assert.rejects(()=>p.decideMilestone(f.id,m.id,1,m.artifact_hash,0,'approve',report,'codex-cli',lease.review_token),/未使用当前分阶段规则/);
 assert.equal((await p.getJob(f.id)).reworks,0);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='revise'").get().n,0);
 report.review_stage_policy_version=REVIEW_STAGE_POLICY_VERSION;report.review_stage_policy_sha256=REVIEW_STAGE_POLICY_SHA256;Object.assign(report.receipt,{review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256});
 const j=await p.decideMilestone(f.id,m.id,1,m.artifact_hash,0,'approve',report,'codex-cli',lease.review_token);assert.equal(j.milestones.find(m=>m.node==='source').status,'approved');
});
