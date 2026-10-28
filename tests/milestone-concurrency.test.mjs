// Isolated SQLite interleavings: no live owner decision, model or media call.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {REVIEW_STAGE_POLICY_VERSION,REVIEW_STAGE_POLICY_SHA256} from '../lib/review-stage-policy.mts';
const sha=s=>createHash('sha256').update(s).digest('hex');
const built=await build({stdin:{contents:"export {getJob} from './lib/production';export {decideMilestone,resumeDecision,claimReview} from './lib/milestones';export {completeOperation} from './lib/media-operations';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'SYNTHETIC-review-race',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__milestoneRaceDB} export function siteArchiveBucket(){throw Error("No SYNTHETIC R2 access expected")}'}));}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
function fixture(t,{source='awaiting_human',script='pending',status='awaiting_review',mode='node'}={}){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 class S{constructor(q,args=[]){this.q=q;this.args=args}bind(...args){return new S(this.q,args)}async first(){return sql.prepare(this.q).get(...this.args)||null}async all(){return{results:sql.prepare(this.q).all(...this.args)}}async run(){return{meta:{changes:Number(sql.prepare(this.q).run(...this.args).changes)}}}}
 let hook,writeHook;globalThis.__milestoneRaceDB={prepare:q=>{if(writeHook&&q.startsWith('UPDATE production_jobs SET')){const run=writeHook;writeHook=null;run()}return new S(q)},async batch(ss){if(hook){const run=hook;hook=null;run()}sql.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 t.after(()=>{sql.close();delete globalThis.__milestoneRaceDB});
 const id='SYNTHETIC-race',content=JSON.stringify({script:'SYNTHETIC text',evidence:[],materials:'pending actual material',limits:'SYNTHETIC'}),hash=sha(content);
 sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES('SYNTHETIC-topic','https://example.org/SYNTHETIC','S','S','S','S','S','before','S',0,'S','S','S','S','S',0,'zh')");
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,review_mode,source_snapshot,skill_snapshot,contract_hash,revision,created_at,updated_at) VALUES(?,'SYNTHETIC-topic','owner',0,?,?,'{}','{}',?,1,'before','before')").run(id,status,mode,'c'.repeat(64));
 sql.prepare("INSERT INTO production_drafts VALUES(?,1,'SYNTHETIC-submit',?,?,'SYNTHETIC','before')").run(id,content,hash);
 for(const [node,nodeStatus]of [['source',source],['script',script]])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,?,1,?,?,?,0,'before','before')").run('SYNTHETIC-'+node,id,node,hash,content,nodeStatus);
 return{sql,id,hash,beforeBatch:fn=>{hook=fn},beforeRecoveryWrite:fn=>{writeHook=fn}};
}
async function decide(f,node='source'){const j=await api.getJob(f.id),m=j.milestones.find(m=>m.node===node);return api.decideMilestone(j.id,m.id,m.revision,m.artifact_hash,m.mode_epoch,'approve',{},'owner')}
test('same original AI review accepts verified terminal-output provenance without pretending a missing process exit was zero',async t=>{
 const f=fixture(t,{source:'awaiting_ai',mode:'auto'}),lease=await api.claimReview(f.id,'SYNTHETIC-source','SYNTHETIC-original-call'),j=await api.getJob(f.id),m=j.milestones.find(m=>m.node==='source'),binding={job_id:j.id,milestone_id:m.id,revision:j.revision,mode_epoch:j.mode_epoch,contract_hash:j.contract_hash,artifact_hash:m.artifact_hash,invocation_id:m.invocation_id,ai_calls:j.ai_calls,attempt:j.attempt,source_snapshot_sha256:sha(j.source_snapshot),skill_snapshot_sha256:sha(j.skill_snapshot)},proof={schema:'verified-terminal-review-output-v1',binding,parent_exit:{scope:'owned-child-tree',pid:12345,timed_out:true,result_unknown:true,finished_at:new Date().toISOString()},completed_terminal_output:true,new_model_calls:0,tool_events:0,original_cli_exit_receipt_missing:true};for(const k of ['prompt_sha256','schema_sha256','output_sha256','event_log_sha256','cli_started_sha256','cli_owned_sha256','parent_started_sha256','parent_exit_sha256'])proof[k]='a'.repeat(64);
 const receipt={schema:'terminal-review-output-reconciliation-v1',exit_code:null,process_exit_code:null,completion_basis:'terminal-event-and-owned-parent-exit',original_cli_exit_receipt_missing:true,interrupted_review_reconciliation:proof,prompt_sha256:'b'.repeat(64),output_sha256:proof.output_sha256,artifact_json_hash:sha(m.artifact),review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256},report={decision:'approve',reason:'SYNTHETIC original model result',model:'gpt-5.6-sol',artifact_hash:m.artifact_hash,review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256,inspected_sources:[],checks:['source_identity','facts','materials','limits'].map(criterion=>({criterion,pass:true,reason:'SYNTHETIC',evidence:'SYNTHETIC'})),receipt};
 const bad=structuredClone(report);bad.receipt.interrupted_review_reconciliation.binding.invocation_id='SYNTHETIC-different-call';await assert.rejects(()=>api.decideMilestone(j.id,m.id,m.revision,m.artifact_hash,m.mode_epoch,'approve',bad,'codex-cli',lease.review_token),/CLI执行回执/);
 const saved=await api.decideMilestone(j.id,m.id,m.revision,m.artifact_hash,m.mode_epoch,'approve',report,'codex-cli',lease.review_token);assert.equal(saved.ai_calls,1);assert.equal(saved.milestones.find(m=>m.node==='source').status,'approved');assert.equal(saved.milestones.find(m=>m.node==='script').status,'awaiting_ai');assert.equal(JSON.parse(saved.milestones.find(m=>m.node==='source').report).receipt.exit_code,null);assert.equal(saved.reviews.find(r=>r.decision==='approve').reviewer,'codex-cli');
});
for(const change of ['newer artifact','queued rework','mode','owner'])test('atomic node approval rejects concurrent '+change,async t=>{
 const f=fixture(t);f.beforeBatch(()=>{
  if(change==='newer artifact')f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) SELECT 'SYNTHETIC-new-source',job_id,node,revision,2,?,artifact,'awaiting_human',mode_epoch,'race','race' FROM production_milestones WHERE node='source'").run('d'.repeat(64));
  if(change==='queued rework')f.sql.prepare("UPDATE production_jobs SET status='waiting_executor' WHERE id=?").run(f.id);
  if(change==='mode')f.sql.prepare("UPDATE production_jobs SET review_mode='auto' WHERE id=?").run(f.id);
  if(change==='owner')f.sql.prepare("UPDATE production_jobs SET owner_id='OTHER' WHERE id=?").run(f.id);
 });
 await assert.rejects(()=>decide(f),/节点已审核或版本变化/);
 assert.equal(f.sql.prepare("SELECT status FROM production_milestones WHERE id='SYNTHETIC-source'").get().status,'awaiting_human');
 assert.equal(f.sql.prepare("SELECT status FROM production_milestones WHERE id='SYNTHETIC-script'").get().status,'pending');assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='approve'").get().n,0);
});
test('script approval rechecks the current source dependency inside its atomic write',async t=>{
 const f=fixture(t,{source:'approved',script:'awaiting_human'});f.beforeBatch(()=>f.sql.prepare("UPDATE production_milestones SET status='invalidated' WHERE node='source'").run());
 await assert.rejects(()=>decide(f,'script'),/节点已审核或版本变化/);const j=await api.getJob(f.id);assert.equal(j.approved_hash,null);assert.equal(j.status,'awaiting_review');assert.equal(j.milestones.find(m=>m.node==='script').status,'awaiting_human');assert.equal(j.reviews.filter(r=>r.decision==='approve').length,0);
});
for(const change of ['owner stop','contract','newer artifact'])test('AI review claim does not consume a call after concurrent '+change,async t=>{
 const f=fixture(t,{source:'awaiting_ai',mode:'auto'});f.beforeBatch(()=>{
  if(change==='owner stop')f.sql.prepare("UPDATE production_jobs SET status='paused' WHERE id=?").run(f.id);
  if(change==='contract')f.sql.prepare("UPDATE production_jobs SET contract_hash=? WHERE id=?").run('e'.repeat(64),f.id);
  if(change==='newer artifact')f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) SELECT 'SYNTHETIC-new-source',job_id,node,revision,2,?,artifact,'awaiting_ai',mode_epoch,'race','race' FROM production_milestones WHERE node='source'").run('d'.repeat(64));
 });
 await assert.rejects(()=>api.claimReview(f.id,'SYNTHETIC-source','SYNTHETIC-invocation'));
 assert.equal(f.sql.prepare('SELECT ai_calls FROM production_jobs WHERE id=?').get(f.id).ai_calls,0);assert.equal(f.sql.prepare("SELECT status FROM production_milestones WHERE id='SYNTHETIC-source'").get().status,'awaiting_ai');
});
test('server media completion enforces actual production quality evidence before preparing or accepting a real-job result',async t=>{
 const f=fixture(t,{source:'approved',script:'approved',status:'approved'}),token='SYNTHETIC-operation-token',id='SYNTHETIC-video-operation',inputHash='a'.repeat(64),videoHash='b'.repeat(64);
 f.sql.prepare('UPDATE production_jobs SET approved_revision=revision,approved_hash=? WHERE id=?').run(f.hash,f.id);
 f.sql.prepare("INSERT INTO production_operations(id,job_id,node,revision,script_hash,mode_epoch,base_artifact_version,input_hash,plan,status,lease_hash,lease_until,invocation_id,created_at,updated_at) VALUES(?,?,'video',1,?,0,0,?,?,'running',?,?,?,'before','before')").run(id,f.id,f.hash,inputHash,JSON.stringify({inputs:[{role:'production_quality',sha256:'e'.repeat(64)}]}),sha(token),Date.now()+60000,'SYNTHETIC-invocation');
 const duration={schema:'actual-final-duration-v1',file_sha256:videoHash,probe_sha256:'f'.repeat(64),checked_at:'2026-10-20T00:00:00Z',report:{hard_max_seconds:60,hard_duration_pass:true,maximum_measured_seconds:'45',measurements_seconds:{container_duration:'45',video_0_playback_end:'45',audio_0_playback_end:'45'},errors:[]}};
 const result={cost:0,publication:false,input_hash:inputHash,artifact:{cost:0,url:'https://example.org/SYNTHETIC.mp4',sha256:videoHash,provider_job_id:id,qa:{final_duration:duration}},receipt:{exit_code:0,operation_id:id,input_hash:inputHash,revision:1,script_hash:f.hash,files:[{role:'video',sha256:videoHash}]},assets:[{role:'video',sha256:videoHash,library_file_id:'libfile_'+videoHash,version:0}]};
 await assert.rejects(()=>api.completeOperation(f.id,id,token,result),/matching actual four-principle QA report/);
 const operation=f.sql.prepare('SELECT status,result FROM production_operations WHERE id=?').get(id);assert.equal(operation.status,'running');assert.equal(operation.result,null);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_milestones WHERE node='video'").get().n,0);
});
const recoveryRaces={
 owner:f=>f.sql.prepare("UPDATE production_jobs SET owner_id='OTHER' WHERE id=?").run(f.id),
 revision:f=>f.sql.prepare('UPDATE production_jobs SET revision=2 WHERE id=?').run(f.id),
 mode:f=>f.sql.prepare("UPDATE production_jobs SET mode_epoch=1,review_mode='node' WHERE id=?").run(f.id),
 status:f=>f.sql.prepare("UPDATE production_jobs SET status='completed' WHERE id=?").run(f.id),
 contract:f=>f.sql.prepare('UPDATE production_jobs SET contract_hash=? WHERE id=?').run('e'.repeat(64),f.id),
 'job lease':f=>f.sql.prepare("UPDATE production_jobs SET status='running',lease_hash='SYNTHETIC-new-lease',lease_until=? WHERE id=?").run(Date.now()+60000,f.id),
 'review lease':f=>f.sql.prepare("UPDATE production_milestones SET status='ai_running',review_until=? WHERE node='source'").run(Date.now()+60000),
 'preparation lease':f=>f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run('native_preparation_handoff_v1:'+f.id,JSON.stringify({status:'claimed',lease_until:Date.now()+60000})),
 'artifact':f=>f.sql.prepare('UPDATE production_milestones SET artifact_hash=? WHERE node=\'source\'').run('d'.repeat(64)),
};
for(const choice of ['manual','stop'])for(const [label,mutate]of Object.entries(recoveryRaces))test(choice+' recovery rejects concurrent '+label+' without changing that state or writing a decision',async t=>{
 const f=fixture(t,{source:'paused',status:'paused',mode:'auto'});let snapshot;
 f.beforeRecoveryWrite(()=>{mutate(f);snapshot=JSON.stringify({jobs:f.sql.prepare('SELECT * FROM production_jobs').all(),milestones:f.sql.prepare('SELECT * FROM production_milestones').all()})});
 await assert.rejects(()=>api.resumeDecision(f.id,'owner',choice,'SYNTHETIC explicit owner decision'));
 assert.equal(JSON.stringify({jobs:f.sql.prepare('SELECT * FROM production_jobs').all(),milestones:f.sql.prepare('SELECT * FROM production_milestones').all()}),snapshot);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision=?").get('resume_'+choice).n,0);
});
for(const choice of ['manual','stop'])test('explicit '+choice+' commits exactly one owner audit with the transition and preserves budgets/text',async t=>{
 const f=fixture(t,{source:'paused',status:'paused',mode:'auto'}),before=await api.getJob(f.id),note='SYNTHETIC owner inspected the saved receipt';
 const after=await api.resumeDecision(f.id,'owner',choice,note);assert.equal(after.status,choice==='manual'?'awaiting_review':'paused');assert.equal(after.review_mode,choice==='manual'?'node':'auto');assert.equal(after.mode_epoch,before.mode_epoch+(choice==='manual'?1:0));
 for(const key of ['reworks','attempt','ai_calls','approved_hash','approved_revision','revision','source_snapshot','skill_snapshot'])assert.equal(after[key],before[key]);
 const audits=after.reviews.filter(r=>r.decision==='resume_'+choice);assert.equal(audits.length,1);assert.equal(audits[0].reviewer,'owner');assert.equal(audits[0].revision,before.revision);assert.equal(audits[0].note,note);assert.equal(after.error,choice==='stop'?'已停止：'+note:null);
 assert.equal(after.milestones.find(m=>m.node==='source').status,choice==='manual'?'awaiting_human':'paused');assert.equal(after.milestones.find(m=>m.node==='script').status,'pending');
});
for(const choice of ['manual','stop'])test(choice+' decision rolls back its audit when the transition write fails',async t=>{
 const f=fixture(t,{source:'paused',status:'paused',mode:'auto'}),before=JSON.stringify({jobs:f.sql.prepare('SELECT * FROM production_jobs').all(),milestones:f.sql.prepare('SELECT * FROM production_milestones').all()});
 f.sql.exec("CREATE TRIGGER SYNTHETIC_recovery_abort BEFORE UPDATE ON production_jobs BEGIN SELECT RAISE(ABORT,'SYNTHETIC write failure'); END");
 await assert.rejects(()=>api.resumeDecision(f.id,'owner',choice,'SYNTHETIC no partial audit'),/SYNTHETIC write failure/);
 assert.equal(JSON.stringify({jobs:f.sql.prepare('SELECT * FROM production_jobs').all(),milestones:f.sql.prepare('SELECT * FROM production_milestones').all()}),before);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision=?").get('resume_'+choice).n,0);
});
test('manual recovery clears only an expired executor lease and leaves its attempt budget intact',async t=>{
 const f=fixture(t,{source:'paused',status:'running',mode:'auto'});f.sql.prepare("UPDATE production_jobs SET lease_hash='SYNTHETIC-expired',lease_until=0,attempt=3 WHERE id=?").run(f.id);
 const j=await api.resumeDecision(f.id,'owner','manual','SYNTHETIC expired call receipt inspected');assert.equal(j.status,'awaiting_review');assert.equal(j.attempt,3);assert.equal(j.lease_until,null);assert.equal(f.sql.prepare('SELECT lease_hash FROM production_jobs WHERE id=?').get(f.id).lease_hash,null);
});
