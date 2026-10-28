// Isolated real SQLite only. No CLI, provider, worker, media, approval or publish.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const sha=x=>createHash('sha256').update(x).digest('hex'),JOB='job_88888888-8888-4888-8888-888888888888',OWNER='SYNTHETIC-text-owner';
const built=await build({stdin:{contents:"export * from './lib/promo-packages';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-text-continuation-db',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/^\.\/production$/},()=>({path:'job',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='db'?'export const db=()=>globalThis.__promoTextContinuation.db;':'export async function getJob(id,owner){const f=globalThis.__promoTextContinuation;if(id!==f.job.id||owner&&owner!==f.owner)throw Error("SYNTHETIC wrong owner");return structuredClone(f.job);}'}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
function fixture(t,{video=true}={}){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 const at=new Date(Date.now()-10000).toISOString(),draft=JSON.stringify({script:'SYNTHETIC frozen source text',storyboard:[],evidence:[]}),script=sha(draft),files={'SKILL.md':'SYNTHETIC frozen skill'},skill={files,sha256:sha(JSON.stringify(files))};
 sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk) VALUES('text-topic','https://example.invalid/text','S','S','S','S','S',?,'视觉影像',0,'S','S','S','S','S')").run(at);
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,review_mode,mode_epoch,created_at,updated_at) VALUES(?,'text-topic',?,1,'approved','{}',?,'SYNTHETIC-contract',1,1,?,'node',0,?,?)").run(JOB,OWNER,JSON.stringify(skill),script,at,at);
 sql.prepare("INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES(?,1,'S',?,?,'S',?)").run(JOB,draft,script,at);
 const job={id:JOB,status:'approved',revision:1,approved_revision:1,approved_hash:script,mode_epoch:0,contract_hash:'SYNTHETIC-contract',updated_at:at,source_snapshot:'{}',skill_snapshot:JSON.stringify(skill),drafts:[{revision:1,content:draft,content_hash:script}],milestones:[],reviews:[]};let hook=null;
 class S{constructor(q,args=[]){this.q=q;this.args=args;}bind(...args){return new S(this.q,args);}async first(){if(hook&&this.q.startsWith('UPDATE production_promo_packages')){const action=hook;hook=null;action();}return sql.prepare(this.q).get(...this.args)||null;}async all(){return{results:sql.prepare(this.q).all(...this.args)};}async run(){return{meta:{changes:Number(sql.prepare(this.q).run(...this.args).changes)}};}}
 const f={sql,job,owner:OWNER,db:{prepare:q=>new S(q)},beforeMutation(fn){hook=fn;},row:id=>sql.prepare('SELECT * FROM production_promo_packages WHERE id=?').get(id)};globalThis.__promoTextContinuation=f;t.after(()=>{sql.close();delete globalThis.__promoTextContinuation;});
 f.addVideo=(id='SYNTHETIC-current-video',version=1)=>{const m={id,node:'video',revision:1,mode_epoch:0,artifact_version:version,artifact_hash:sha(id),artifact:'{}',status:'awaiting_human'};job.milestones.push(m);sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES(?,?,'video',1,?,?,'{}','awaiting_human',0,?,?)").run(id,JOB,version,m.artifact_hash,at,at);};if(video)f.addVideo();
 f.queue=async request=>(await api.requestPromo(JOB,OWNER,request||'SYNTHETIC-stable-request')).package;
 f.unknown=async()=>{const p=await f.queue(),iid='SYNTHETIC-original-invocation',claim=await api.claimPromo(p.id,iid);await api.failPromo(p.id,claim.lease_token,'SYNTHETIC timed-out legacy call; original result remains unknown');return{p,iid,claim};};
 return f;
}
function proof(p,iid,patch={}){return{schema:'promo-legacy-unknown-text-continuation-v1',package_id:p.id,invocation_id:iid,input_sha256:sha(p.input_snapshot),legacy_prompt_sha256:'a'.repeat(64),started_sha256:'b'.repeat(64),process_started_sha256:'c'.repeat(64),process_exit_sha256:'d'.repeat(64),log_sha256:'e'.repeat(64),model:'gpt-5.6-sol',scope:'owned-child-tree',pid:12345,started_at:new Date(Date.now()-5000).toISOString(),finished_at:new Date(Date.now()-1000).toISOString(),exit_code:1,timed_out:true,legacy_result_unknown:true,output_file_present:false,receipt_file_present:false,returned_file_present:false,legacy_tool_activity:'unverified',previous_outcome:'unchanged-unknown',new_execution_scope:'pure-text-no-tools',authorization_basis:'existing-promotion-generation-budget',max_attempts:3,new_paid_media_allowed:false,quality_approved:false,publication_authorized:false,...patch};}
const recover=(p,iid,e)=>api.recoverPromo(p.id,iid,undefined,undefined,e);

test('one legacy unknown is requeued under the same package and budget while its outcome stays unknown',async t=>{
 const f=fixture(t),{p,iid}=await f.unknown(),before=f.row(p.id),prior=JSON.parse(before.receipt),e=proof(p,iid),r=await recover(p,iid,e),saved=f.row(p.id),history=JSON.parse(saved.receipt);
 assert.equal(r.package.id,p.id);assert.equal(r.package.version,p.version);assert.equal(r.package.status,'queued');assert.equal(r.model_calls,0);assert.equal(r.legacy_text_continuation_requeued,true);assert.equal(r.retry_state.attempt_count,1);assert.equal(r.retry_state.result_unknown,true);assert.equal(r.retry_state.known_retryable,false);
 assert.deepEqual(history.attempts[0].legacy_text_continuation,e);delete history.attempts[0].legacy_text_continuation;assert.deepEqual(history,prior,'the old attempt, unknown and timestamps are preserved');
 for(const key of ['id','request_id','invocation_id','version','input_snapshot','video_binding','script_hash','script_revision','skill_hash','content','content_hash'])assert.equal(saved[key],before[key],key);
 assert.equal(saved.lease_hash,null);assert.equal(saved.lease_until,null);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_promo_packages').get().n,1);
});

test('same proof replays idempotently while queued, differing proof is rejected, and claim consumes it once',async t=>{
 const f=fixture(t),{p,iid}=await f.unknown(),e=proof(p,iid);await recover(p,iid,e);const queued=f.row(p.id),reordered=Object.fromEntries(Object.entries(e).reverse());assert.equal((await recover(p,iid,reordered)).replayed,true);assert.deepEqual(f.row(p.id),queued);
 await assert.rejects(()=>recover(p,iid,{...e,log_sha256:'f'.repeat(64)}),/已保存或已消费/);assert.deepEqual(f.row(p.id),queued);
 const claim=await api.claimPromo(p.id,'SYNTHETIC-next-pure-text'),running=f.row(p.id),a=JSON.parse(running.receipt).attempts;assert.equal(a.length,2);assert.equal(a[0].result_unknown,true);assert.deepEqual(a[0].legacy_text_continuation,e);assert.equal(a[1].invocation_id,'SYNTHETIC-next-pure-text');assert.equal(claim.package.status,'running');
 await assert.rejects(()=>recover(p,iid,e),/精确交接/);assert.deepEqual(f.row(p.id),running);await assert.rejects(()=>api.claimPromo(p.id,'SYNTHETIC-third-call'),/已领取或已完成/);
});

test('expired running legacy invocation gains an unknown marker, without inventing a failure or another attempt',async t=>{
 const f=fixture(t),p=await f.queue(),iid='SYNTHETIC-expired',claim=await api.claimPromo(p.id,iid);f.sql.prepare('UPDATE production_promo_packages SET lease_until=? WHERE id=?').run(Date.now()-1,p.id);const prior=JSON.parse(f.row(p.id).receipt),r=await recover(p,iid,proof(p,iid,{timed_out:false,exit_code:1})),a=JSON.parse(r.package.receipt).attempts;
 assert.equal(r.package.status,'queued');assert.equal(a.length,1);assert.equal(a[0].result_unknown,true);assert.equal(a[0].failure,undefined);assert.equal(a[0].claimed_at,prior.attempts[0].claimed_at);assert.equal(r.lease_token,undefined);await assert.rejects(()=>api.failPromo(p.id,claim.lease_token,'late old failure'),/状态已变化/);
});

const badProofs={
 schema:{schema:'promo-known-technical-failure-v1'},package:{package_id:'other-package'},invocation:{invocation_id:'other-invocation'},input:{input_sha256:'0'.repeat(64)},
 model:{model:'other-model'},scope:{scope:'all-processes'},pidZero:{pid:0},pidFraction:{pid:1.5},pidUnsafe:{pid:Number.MAX_SAFE_INTEGER+1},exitZero:{exit_code:0},exitFraction:{exit_code:1.5},exitNull:{exit_code:null},timeoutString:{timed_out:'true'},
 unknown:{legacy_result_unknown:false},output:{output_file_present:true},receipt:{receipt_file_present:true},returned:{returned_file_present:true},toolClaim:{legacy_tool_activity:'none'},outcome:{previous_outcome:'known-failed'},executionScope:{new_execution_scope:'tools'},authorization:{authorization_basis:'new-paid-media'},budget:{max_attempts:4},paidMedia:{new_paid_media_allowed:true},quality:{quality_approved:true},publication:{publication_authorized:true},
 fakeZeroEffects:{paid_media_calls:0},wrongPromptHash:{legacy_prompt_sha256:'x'.repeat(64)},missingStartedHash:{started_sha256:null},missingProcessStart:{process_started_sha256:'a'},badExitHash:{process_exit_sha256:'A'.repeat(64)},badLogHash:{log_sha256:1},invalidStart:{started_at:'invalid'},invalidFinish:{finished_at:'invalid'},startType:{started_at:0},finishType:{finished_at:0},reversedTimes:{started_at:new Date(Date.now()-100).toISOString(),finished_at:new Date(Date.now()-2000).toISOString()},future:{finished_at:new Date(Date.now()+3600000).toISOString()}
};
for(const [name,patch]of Object.entries(badProofs))test('legacy continuation rejects invalid evidence: '+name,async t=>{
 const f=fixture(t),{p,iid}=await f.unknown(),before=f.row(p.id);await assert.rejects(()=>recover(p,iid,proof(p,iid,patch)),/受限纯文本接续证据/);assert.deepEqual(f.row(p.id),before);
});
test('legacy continuation rejects missing fields, arrays, strings and mixed recovery schemas',async t=>{
 const f=fixture(t),{p,iid}=await f.unknown(),e=proof(p,iid),before=f.row(p.id),missing={...e};delete missing.log_sha256;
 for(const value of [null,[],JSON.stringify(e),missing])await assert.rejects(()=>recover(p,iid,value),/受限纯文本接续证据/);
 await assert.rejects(()=>api.recoverPromo(p.id,iid,{},undefined,e),/不能同时/);await assert.rejects(()=>api.recoverPromo(p.id,iid,undefined,{},e),/不能同时/);assert.deepEqual(f.row(p.id),before);
});

for(const mode of ['active','lease-missing','cancelled','ready','superseded','human','content','no-history','unknown-false','known-failure','completed-reconciliation','exhausted'])test('legacy continuation preserves an ineligible original state: '+mode,async t=>{
 const f=fixture(t),{p,iid}=await f.unknown();let row=f.row(p.id),a=JSON.parse(row.receipt);
 if(mode==='active')f.sql.prepare("UPDATE production_promo_packages SET status='running',lease_until=? WHERE id=?").run(Date.now()+60000,p.id);
 if(mode==='lease-missing')f.sql.prepare("UPDATE production_promo_packages SET status='running',lease_until=NULL WHERE id=?").run(p.id);
 if(mode==='cancelled')f.sql.prepare("UPDATE production_promo_packages SET error='用户停止交接；仍保留原未知结果' WHERE id=?").run(p.id);
 if(['ready','superseded'].includes(mode))f.sql.prepare('UPDATE production_promo_packages SET status=? WHERE id=?').run(mode,p.id);
 if(mode==='human')f.sql.prepare("UPDATE production_promo_packages SET origin='human' WHERE id=?").run(p.id);
 if(mode==='content')f.sql.prepare("UPDATE production_promo_packages SET content='{}',content_hash=? WHERE id=?").run(sha('{}'),p.id);
 if(mode==='no-history')a.attempts=[];
 if(mode==='unknown-false')a.attempts[0].result_unknown=false;
 if(mode==='known-failure')a.attempts[0].failure={schema:'promo-known-technical-failure-v1'};
 if(mode==='completed-reconciliation')a.completed_result_reconciliation={schema:'promo-known-completed-result-v1'};
 if(mode==='exhausted'){a.attempts=[{number:1,invocation_id:'SYNTHETIC-prior-1',claimed_at:a.attempts[0].claimed_at},{number:2,invocation_id:'SYNTHETIC-prior-2',claimed_at:a.attempts[0].claimed_at},{...a.attempts[0],number:3}];}
 if(['no-history','unknown-false','known-failure','completed-reconciliation','exhausted'].includes(mode))f.sql.prepare('UPDATE production_promo_packages SET receipt=? WHERE id=?').run(JSON.stringify(a),p.id);
 row=f.row(p.id);await assert.rejects(()=>recover(p,iid,proof(p,iid)));assert.deepEqual(f.row(p.id),row);
});

for(const mode of ['no-video','new-video','script','epoch','contract','skill','policy','paused'])test('legacy continuation requires the same current content and policy: '+mode,async t=>{
 const f=fixture(t,{video:mode!=='no-video'}),{p,iid}=await f.unknown();
 if(mode==='new-video')f.addVideo('SYNTHETIC-new-video',2);
 if(mode==='script')f.job.drafts[0].content_hash='f'.repeat(64);
 if(mode==='epoch')f.job.mode_epoch++;
 if(mode==='contract')f.job.contract_hash='SYNTHETIC-changed';
 if(mode==='skill')f.job.skill_snapshot=JSON.stringify({files:{'SKILL.md':'SYNTHETIC changed'},sha256:'f'.repeat(64)});
 if(mode==='paused')f.job.status='paused';
 if(mode==='policy'){const input=JSON.parse(p.input_snapshot);input.publishing_policy.content_sha256='0'.repeat(64);f.sql.prepare('UPDATE production_promo_packages SET input_snapshot=? WHERE id=?').run(JSON.stringify(input),p.id);}
 const before=f.row(p.id);await assert.rejects(()=>recover(p,iid,proof(p,iid)));assert.deepEqual(f.row(p.id),before);
});

for(const mode of ['video','draft','job-status','job-contract','job-skill','job-source','package-input','package-invocation','receipt','cancel','lease','other-active'])test('CAS rejects a concurrent change before text continuation: '+mode,async t=>{
 const f=fixture(t),{p,iid}=await f.unknown();let afterRace;
 f.beforeMutation(()=>{
  if(mode==='video')f.addVideo('SYNTHETIC-racing-video',2);
  if(mode==='draft')f.sql.prepare('UPDATE production_drafts SET content_hash=? WHERE job_id=?').run('f'.repeat(64),JOB);
  if(mode==='job-status')f.sql.prepare("UPDATE production_jobs SET status='paused' WHERE id=?").run(JOB);
  if(mode==='job-contract')f.sql.prepare("UPDATE production_jobs SET contract_hash='SYNTHETIC-race' WHERE id=?").run(JOB);
  if(mode==='job-skill')f.sql.prepare("UPDATE production_jobs SET skill_snapshot='{}' WHERE id=?").run(JOB);
  if(mode==='job-source')f.sql.prepare("UPDATE production_jobs SET source_snapshot='{\"changed\":true}' WHERE id=?").run(JOB);
  if(mode==='package-input')f.sql.prepare("UPDATE production_promo_packages SET input_snapshot='{}' WHERE id=?").run(p.id);
  if(mode==='package-invocation')f.sql.prepare("UPDATE production_promo_packages SET invocation_id='SYNTHETIC-changed' WHERE id=?").run(p.id);
  if(mode==='receipt')f.sql.prepare("UPDATE production_promo_packages SET receipt='{}' WHERE id=?").run(p.id);
  if(mode==='cancel')f.sql.prepare("UPDATE production_promo_packages SET error='用户停止交接；并发取消' WHERE id=?").run(p.id);
  if(mode==='lease')f.sql.prepare('UPDATE production_promo_packages SET lease_until=? WHERE id=?').run(Date.now()+60000,p.id);
  if(mode==='other-active'){const other={...f.row(p.id),id:'SYNTHETIC-other-promo',version:2,request_id:'SYNTHETIC-other-request',status:'queued',receipt:null,invocation_id:null};const keys=Object.keys(other);f.sql.prepare('INSERT INTO production_promo_packages('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>other[k]));}
  afterRace=f.row(p.id);
 });
 await assert.rejects(()=>recover(p,iid,proof(p,iid)),/并发变化/);assert.deepEqual(f.row(p.id),afterRace);assert.equal(f.row(p.id).status,'failed');
});

test('a continuation from attempt two leaves exactly one final claim and never exceeds three',async t=>{
 const f=fixture(t),{p,iid}=await f.unknown(),a=JSON.parse(f.row(p.id).receipt);a.attempts=[{number:1,invocation_id:'SYNTHETIC-prior',claimed_at:a.attempts[0].claimed_at,result_unknown:true},{...a.attempts[0],number:2}];f.sql.prepare('UPDATE production_promo_packages SET receipt=? WHERE id=?').run(JSON.stringify(a),p.id);
 const e=proof(p,iid);await recover(p,iid,e);const claim=await api.claimPromo(p.id,'SYNTHETIC-final-text');assert.equal(JSON.parse(claim.package.receipt).attempts.length,3);await api.failPromo(p.id,claim.lease_token,'SYNTHETIC final outcome unknown');const before=f.row(p.id);await assert.rejects(()=>recover(p,'SYNTHETIC-final-text',proof(p,'SYNTHETIC-final-text')),/受限纯文本接续证据/);assert.deepEqual(f.row(p.id),before);assert.equal((await api.requestPromo(JOB,OWNER,'SYNTHETIC-stable-request')).package.status,'failed');
});
