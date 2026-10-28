// Migrated in-memory SQLite and immutable synthetic receipts only.
// This test never runs a model, worker, network request, UI, or media producer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {cliContentBudget,cliContentCountSql,cliTransportRecoveryCandidate} from '../lib/cli-content-budget.mts';
import {cliReadySql,safeRateLimitFailure} from '../lib/cli-failure-contract.mts';
import {cliFailureDiagnostic} from '../scripts/cli-failure-recovery.mjs';
import {REVIEW_STAGE_POLICY_VERSION,REVIEW_STAGE_POLICY_SHA256} from '../lib/review-stage-policy.mts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const ID='job_11111111-1111-4111-8111-111111111111';
const OWNER='SYNTHETIC-owner';
const SOURCE=JSON.stringify({url:'https://example.org/SYNTHETIC'});
const SKILL=JSON.stringify({sha256:'b'.repeat(64)});
const CONTRACT='c'.repeat(64);
const sourceSha=sha('SYNTHETIC source bytes; no downloaded article');
const protectedIds=[
  'job_3c14fe6f-44b0-472c-8455-e75040b695bb',
  'job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee',
];
const bundle=await build({
  stdin:{
    contents:"export {getJob,claimJob,submitDraft} from './lib/production';export {claimReview,decideMilestone,submitMilestone} from './lib/milestones';export {nextWork} from './lib/dispatch';export {deferCliReview,resumeCliTransport} from './lib/cli-failure';",
    resolveDir:process.cwd(),
  },
  bundle:true,platform:'node',format:'esm',write:false,
  plugins:[{name:'synthetic-cli-transport-db',setup(b){
    b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__cliTransportDb}export function siteArchiveBucket(){throw Error("No media bucket in CLI transport test")};'}));
  }}],
});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));

function fixture(t,id=ID){
  const sql=new DatabaseSync(':memory:');
  for(const name of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort()){
    sql.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
  }
  class Statement{
    constructor(q,args=[]){this.q=q;this.args=args}
    bind(...args){return new Statement(this.q,args)}
    async first(){return sql.prepare(this.q).get(...this.args)||null}
    async all(){return {results:sql.prepare(this.q).all(...this.args)}}
    async run(){return {meta:{changes:Number(sql.prepare(this.q).run(...this.args).changes)}}}
  }
  const db={
    prepare:q=>new Statement(q),
    batch:async statements=>{
      sql.exec('BEGIN');
      try{
        const results=[];
        for(const statement of statements)results.push(await statement.run());
        sql.exec('COMMIT');return results;
      }catch(error){sql.exec('ROLLBACK');throw error}
    },
  };
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-cli-transport-'));
  globalThis.__cliTransportDb=db;
  t.after(()=>{sql.close();delete globalThis.__cliTransportDb;fs.rmSync(root,{recursive:true,force:true})});
  const at=new Date(Date.now()-10000).toISOString();
  sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated) VALUES('SYNTHETIC','https://example.org/SYNTHETIC','S','S','S','S','S',?,'S',0,'S','S','S','S','S',0)").run(at);
  sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,review_mode,mode_epoch,source_snapshot,skill_snapshot,contract_hash,checkpoint,revision,attempt,created_at,updated_at) VALUES(?,'SYNTHETIC',?,0,'waiting_executor','auto',0,?,?,?,?,0,0,?,?)")
    .run(id,OWNER,SOURCE,SKILL,CONTRACT,JSON.stringify({phase:'source-verified',source_sha256:null}),at,at);
  return {id,sql,db,root,files:new Map()};
}
function writeImmutable(f,name,value){
  const file=path.join(f.root,name),bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value));
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,bytes,{flag:'wx'});f.files.set(file,Buffer.from(bytes));return file;
}
function assertRawBytes(f){
  for(const [file,bytes] of f.files)assert.deepEqual(fs.readFileSync(file),bytes,path.relative(f.root,file)+' changed');
}
const draft=()=>({
  script:'SYNTHETIC approved wording. No real narration or media is produced.',
  evidence:[{
    url:JSON.parse(SOURCE).url,title:'SYNTHETIC source',
    published_at:null,retrieved_at:new Date().toISOString(),sha256:sourceSha,
    facts:['SYNTHETIC source fact'],materials:['SYNTHETIC material reference'],limits:['SYNTHETIC fixture only'],
  }],
  materials:'SYNTHETIC material pending; this is a text review, not media approval',
  limits:'SYNTHETIC evidence, no external result',
  execution:{mode:'codex-cli',executor:'SYNTHETIC in-memory submission',source_hash:sha(SOURCE),skill_hash:JSON.parse(SKILL).sha256},
});
function approvedReport(m,ordinal){
  const checks=m.node==='source'?['source_identity','facts','materials','limits']:['grounding','clarity','specification','limits'];
  return {
    reason:'SYNTHETIC structured '+m.node+' approval for test call '+ordinal,
    model:'gpt-5.6-sol',artifact_hash:m.artifact_hash,
    review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,
    review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256,
    inspected_sources:JSON.parse(m.artifact).evidence.map(e=>e.sha256),
    checks:checks.map(criterion=>({criterion,pass:true,reason:'SYNTHETIC '+criterion+' check',evidence:'SYNTHETIC exact artifact bytes'})),
    receipt:{
      exit_code:0,prompt_sha256:sha('SYNTHETIC prompt '+ordinal),
      output_sha256:sha('SYNTHETIC completed review output '+ordinal),
      artifact_json_hash:sha(m.artifact),
      review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,
      review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256,
    },
  };
}
async function approveClaim(f,claim,ordinal){
  const m=claim.milestone,j=claim.job;
  return api.decideMilestone(f.id,m.id,j.revision,m.artifact_hash,j.mode_epoch,'approve',approvedReport(m,ordinal),'codex-cli',claim.review_token);
}
function rejectionReceipt(f,claim,ordinal){
  const m=claim.milestone,prompt='SYNTHETIC exact script-review prompt for ordinal '+ordinal;
  const base='raw/ai-call-'+ordinal,metadataDir=path.join(f.root,base,'cli-process');
  const started_at=new Date(Date.now()-2).toISOString(),finished_at=new Date().toISOString();
  const exit={
    scope:'owned-cli-child-tree',pid:10000+ordinal,started_at,finished_at,
    prompt_sha256:sha(prompt),exit_code:1,timed_out:false,
    termination_unconfirmed:false,output_present:false,
    error_code:'CLI_RATE_LIMITED',result_unknown:false,
  };
  const events=[
    {type:'thread.started',thread_id:'SYNTHETIC-thread-'+ordinal},
    {type:'turn.started'},
    {type:'item.completed',item:{type:'error',message:'Skill description shortened'}},
    {type:'error',message:'429 Too Many Requests; Retry-After: 0'},
    {type:'turn.failed',error:{message:'429 Too Many Requests; Retry-After: 0'}},
  ].map(JSON.stringify).join('\n')+'\n';
  writeImmutable(f,base+'/prompt.txt',prompt);
  writeImmutable(f,base+'/cli-process/cli-process-started.json',exit);
  writeImmutable(f,base+'/cli-process/cli-owned-child.json',{scope:exit.scope,pid:exit.pid,started_at});
  writeImmutable(f,base+'/cli-process/cli-process-exit.json',exit);
  writeImmutable(f,base+'/cli-process/cli-events.log',events);
  const value=cliFailureDiagnostic({
    metadataDir,output:path.join(f.root,base,'output.json'),prompt,
    job:claim.job,sourceSha,stage:'script-review',milestone:m,invocation:claim.invocation_id,
  });
  assert.equal(safeRateLimitFailure(value),true);
  assert.equal(value.execution_binding.ai_calls,ordinal);
  return value;
}
function persistedEvidence(f){
  return {
    drafts:JSON.stringify(f.sql.prepare('SELECT * FROM production_drafts WHERE job_id=? ORDER BY revision').all(f.id)),
    source:JSON.stringify(f.sql.prepare("SELECT * FROM production_milestones WHERE job_id=? AND node='source'").all(f.id)),
    receipts:JSON.stringify(f.sql.prepare("SELECT * FROM production_reviews WHERE job_id=? AND decision IN ('cli_review_failure_v1','approve') ORDER BY id").all(f.id)),
  };
}
async function legacyPausedReview(t,id=ID){
  const f=fixture(t,id);
  const generation=await api.claimJob('SYNTHETIC text submission only',f.id);
  assert.equal(generation.job.attempt,1);
  const submitted=await api.submitDraft(f.id,generation.lease_token,0,'SYNTHETIC-draft',draft());
  assert.equal(submitted.job.revision,1);
  const source=submitted.job.milestones.find(m=>m.node==='source');
  const sourceClaim=await api.claimReview(f.id,source.id,'SYNTHETIC-call-1');
  await approveClaim(f,sourceClaim,1);
  for(let ordinal=2;ordinal<=8;ordinal++){
    const j=await api.getJob(f.id),m=j.milestones.find(m=>m.node==='script');
    const claim=await api.claimReview(f.id,m.id,'SYNTHETIC-call-'+ordinal);
    const receipt=rejectionReceipt(f,claim,ordinal);
    const accepted=await api.deferCliReview(f.id,m.id,claim.review_token,receipt);
    assert.equal(accepted.replayed,false);
  }
  // Emulate the deployed old raw-counter policy only. The seven real accepted
  // defer records, original checkpoint diagnostic, counters and artifacts stay.
  f.sql.prepare("UPDATE production_jobs SET status='paused' WHERE id=?").run(f.id);
  f.sql.prepare("UPDATE production_milestones SET status='paused' WHERE job_id=? AND node='script'").run(f.id);
  f.job=await api.getJob(f.id);
  f.script=f.job.milestones.find(m=>m.node==='script');
  f.before=persistedEvidence(f);
  assert.equal(f.job.ai_calls,8);assert.equal(f.job.attempt,1);assert.equal(f.job.reworks,0);
  assert.equal(f.job.milestones.find(m=>m.node==='source').status,'approved');
  assert.equal(JSON.parse(f.job.checkpoint).source_sha256,null);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='cli_review_failure_v1'").get().n,7);
  return f;
}
function candidateBinding(job){
  const candidate=cliTransportRecoveryCandidate(job);
  assert.ok(candidate,'exact paused server-accepted transport chain must be recoverable');
  assert.equal(candidate.schema,'cli-transport-budget-resume-v1');
  return candidate;
}
function assertBudget(job,expected){
  const b=cliContentBudget(job);
  for(const [key,value] of Object.entries(expected))assert.equal(b[key],value,key);
  return b;
}
function counts(f){
  return {...f.sql.prepare('SELECT attempt,ai_calls,reworks,revision,mode_epoch FROM production_jobs WHERE id=?').get(f.id)};
}
function reviews(f){
  return JSON.stringify(f.sql.prepare('SELECT * FROM production_reviews WHERE job_id=? ORDER BY id').all(f.id));
}
async function assertRefused(f,binding){
  const beforeReviews=reviews(f),beforeCounts=counts(f),before=persistedEvidence(f);
  assert.equal(cliTransportRecoveryCandidate(await api.getJob(f.id)),null);
  await assert.rejects(()=>api.resumeCliTransport(f.id,{binding}));
  assert.deepEqual(counts(f),beforeCounts);assert.equal(reviews(f),beforeReviews);
  assert.deepEqual(persistedEvidence(f),before);assertRawBytes(f);
}

test('accepted source call1 and seven strict zero-result429s resume metadata once, approve call9 and admit the next node',async t=>{
  const f=await legacyPausedReview(t);
  assertBudget(f.job,{
    raw_attempts:1,raw_ai_calls:8,zero_result_generation_attempts:0,zero_result_review_calls:7,
    content_attempts:1,content_ai_calls:1,reworks:0,generation_available:true,review_available:true,
  });
  const binding=candidateBinding(f.job),first=await api.resumeCliTransport(f.id,{binding});
  assert.equal(first.replayed,false);
  const resumed=await api.getJob(f.id),afterRecoveryReviews=reviews(f);
  assert.equal(resumed.status,'awaiting_review');
  assert.equal(resumed.milestones.find(m=>m.node==='script').status,'awaiting_ai');
  assert.equal(resumed.checkpoint,f.job.checkpoint,'metadata resume preserves the original diagnostic bytes');
  assert.equal(resumed.milestones.find(m=>m.node==='script').report,f.script.report);
  assert.deepEqual(persistedEvidence(f),f.before);assertRawBytes(f);
  assert.deepEqual(counts(f),{attempt:1,ai_calls:8,reworks:0,revision:1,mode_epoch:0});
  const second=await api.resumeCliTransport(f.id,{binding});
  assert.equal(second.replayed,true);assert.equal(reviews(f),afterRecoveryReviews);
  const next=await api.nextWork();
  assert.equal(next.kind,'review');assert.equal(next.job.id,f.id);assert.equal(next.milestone_id,f.script.id);
  const call9=await api.claimReview(f.id,f.script.id,'SYNTHETIC-call-9');
  assert.equal(call9.job.ai_calls,9);
  const completed=await approveClaim(f,call9,9);
  assert.equal(completed.status,'approved');assert.equal(completed.approved_revision,1);
  assert.equal(completed.approved_hash,completed.drafts[0].content_hash);
  assertBudget(completed,{raw_attempts:1,raw_ai_calls:9,zero_result_review_calls:7,content_attempts:1,content_ai_calls:2,reworks:0,review_available:true});
  assert.equal(persistedEvidence(f).drafts,f.before.drafts);
  assert.equal(persistedEvidence(f).source,f.before.source);
  for(const old of JSON.parse(f.before.receipts)){
    assert.deepEqual({...f.sql.prepare('SELECT * FROM production_reviews WHERE id=?').get(old.id)},old);
  }
  assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='revise'").get().n,0);
  assertRawBytes(f);
  // Report a synthetic reference, without producing or approving any picture.
  const withCover=await api.submitMilestone(f.id,'cover',1,0,'SYNTHETIC-next-cover',{
    url:'https://example.org/SYNTHETIC-cover.png',sha256:sha('SYNTHETIC image reference'),
    provider_job_id:'SYNTHETIC-no-provider-call',cost:0,
  },0);
  const cover=withCover.milestones.find(m=>m.node==='cover');
  assert.equal(withCover.status,'approved');
  assert.equal(cover.status,'awaiting_ai');
  const gate=f.sql.prepare('SELECT '+cliContentCountSql('j','review')+' AS content_calls, '+cliReadySql('j')+' AS ready FROM production_jobs j WHERE j.id=?').get(f.id);
  assert.equal(gate.content_calls,2,'SQL budget must retain all seven credits after the completed review');
  assert.equal(gate.ready,1,'completed script receipt must unblock later work');
  // Normal dispatch may first register this approved job's free preparation.
  // Its priority does not change the authoritative later-node review budget.
  const call10=await api.claimReview(f.id,cover.id,'SYNTHETIC-call-10');
  assert.equal(call10.job.ai_calls,10);
  assertBudget(call10.job,{zero_result_review_calls:7,content_ai_calls:3,review_available:true});
  assertRawBytes(f);
});

for(const kind of ['owner-stop','owner-pause','owner-review-note']){
  test('metadata transport recovery respects later '+kind,async t=>{
    const f=await legacyPausedReview(t),binding=candidateBinding(f.job);
    const at=new Date(Date.now()+1).toISOString();
    if(kind==='owner-review-note'){
      f.sql.prepare("UPDATE production_jobs SET review_note='SYNTHETIC owner hold',updated_at=? WHERE id=?")
        .run(new Date(Date.parse(f.job.updated_at)+1).toISOString(),f.id);
    }else{
      const decision=kind==='owner-stop'?'resume_stop':'pause';
      const note=JSON.stringify({decision:'pause',reason:'SYNTHETIC owner hold',actor:OWNER,revision:1,mode_epoch:0,artifact_hash:f.script.artifact_hash});
      f.sql.prepare('INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES(?,?,1,?,?,?,?,?)')
        .run('SYNTHETIC-owner-decision',f.id,f.script.artifact_hash,decision,note,OWNER,at);
      f.sql.prepare("UPDATE production_jobs SET error='已停止：SYNTHETIC owner hold' WHERE id=?").run(f.id);
    }
    await assertRefused(f,binding);
  });
}
for(const id of protectedIds){
  test('transport recovery cannot reopen protected job '+id,async t=>{
    // Build the ordinary synthetic chain first, then move all fixture identity
    // and accepted bindings together, with FK checks deferred in this one DB.
    const f=await legacyPausedReview(t),old=f.id;
    f.sql.exec('PRAGMA foreign_keys=OFF');
    for(const table of ['production_jobs','production_drafts','production_milestones','production_reviews']){
      const column=table==='production_jobs'?'id':'job_id';
      f.sql.prepare('UPDATE '+table+' SET '+column+'=? WHERE '+column+'=?').run(id,old);
    }
    const cp=JSON.parse(f.sql.prepare('SELECT checkpoint FROM production_jobs WHERE id=?').get(id).checkpoint);
    cp.cli_failure.binding.job_id=id;cp.cli_failure.execution_binding.job_id=id;
    f.sql.prepare('UPDATE production_jobs SET checkpoint=? WHERE id=?').run(JSON.stringify(cp),id);
    for(const row of f.sql.prepare("SELECT id,note FROM production_reviews WHERE job_id=? AND decision='cli_review_failure_v1'").all(id)){
      const v=JSON.parse(row.note);v.binding.job_id=id;v.execution_binding.job_id=id;
      f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(v),row.id);
    }
    f.sql.exec('PRAGMA foreign_keys=ON');f.id=id;
    const j=await api.getJob(id);
    assert.equal(cliTransportRecoveryCandidate(j),null);
    await assert.rejects(()=>api.resumeCliTransport(id,{binding:{...candidateBinding(f.job),job_id:id}}));
    assert.equal((await api.getJob(id)).status,'paused');assertRawBytes(f);
  });
}
for(const kind of ['job','review','media-operation']){
  test('an active '+kind+' lease blocks metadata-only transport recovery',async t=>{
    const f=await legacyPausedReview(t),binding=candidateBinding(f.job),until=Date.now()+600000;
    if(kind==='job')f.sql.prepare('UPDATE production_jobs SET lease_hash=?,lease_until=? WHERE id=?').run(sha('SYNTHETIC active token'),until,f.id);
    if(kind==='review')f.sql.prepare('UPDATE production_milestones SET review_token_hash=?,review_until=? WHERE id=?').run(sha('SYNTHETIC active token'),until,f.script.id);
    if(kind==='media-operation'){
      const at=new Date().toISOString();
      f.sql.prepare("INSERT INTO production_operations(id,job_id,node,revision,script_hash,mode_epoch,base_artifact_version,input_hash,plan,status,lease_hash,lease_until,created_at,updated_at) VALUES(?,?,'cover',1,?,0,0,?,'{}','running',?,?,?,?)")
        .run('SYNTHETIC-active-operation',f.id,f.script.artifact_hash,sha('SYNTHETIC input'),sha('SYNTHETIC active token'),until,at,at);
    }
    await assertRefused(f,binding);
  });
}
for(const kind of ['unknown','partial-output','tool','not-exited','no-terminal429','wrong-source','wrong-skill','wrong-ordinal','wrong-invocation','no-server-acceptance']){
  test('transport accounting never discounts '+kind+' evidence as an accepted zero-result review',async t=>{
    const f=await legacyPausedReview(t),binding=candidateBinding(f.job);
    const row=f.sql.prepare("SELECT id,note FROM production_reviews WHERE decision='cli_review_failure_v1' AND json_extract(note,'$.binding.ai_calls')=8").get();
    if(kind==='no-server-acceptance'){
      f.sql.prepare("UPDATE production_reviews SET reviewer='SYNTHETIC client-only-claim' WHERE id=?").run(row.id);
    }else{
      const v=JSON.parse(row.note);
      if(kind==='unknown'){v.result_unknown=true;v.confirmed_no_result=false}
      if(kind==='partial-output')v.output_present=true;
      if(kind==='tool')v.tool_events=1;
      if(kind==='not-exited')v.process_exited=false;
      if(kind==='no-terminal429')v.terminal_rate_limit=false;
      if(kind==='wrong-source')v.execution_binding.source_snapshot_sha256='0'.repeat(64);
      if(kind==='wrong-skill')v.execution_binding.skill_snapshot_sha256='0'.repeat(64);
      if(kind==='wrong-ordinal')v.execution_binding.ai_calls=1;
      if(kind==='wrong-invocation')v.execution_binding.review_invocation_id='SYNTHETIC unrelated invocation';
      f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(v),row.id);
    }
    assert.ok(cliContentBudget(await api.getJob(f.id)).zero_result_review_calls<7);
    await assertRefused(f,binding);
  });
}

test('identical accepted audit replay is discounted once; conflicting ordinal evidence is never double credited',async t=>{
  const f=await legacyPausedReview(t),row=f.sql.prepare("SELECT * FROM production_reviews WHERE decision='cli_review_failure_v1' AND json_extract(note,'$.binding.ai_calls')=8").get();
  const insert=f.sql.prepare('INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES(?,?,?,?,?,?,?,?)');
  insert.run('SYNTHETIC-duplicate-safe-record',row.job_id,row.revision,row.content_hash,row.decision,row.note,row.reviewer,row.created_at);
  assertBudget(await api.getJob(f.id),{zero_result_review_calls:7,content_ai_calls:1});
  const altered=JSON.parse(row.note);altered.process_receipt_sha256=sha('SYNTHETIC conflicting receipt');
  f.sql.prepare('UPDATE production_reviews SET note=? WHERE id=?').run(JSON.stringify(altered),'SYNTHETIC-duplicate-safe-record');
  const j=await api.getJob(f.id);
  assert.ok(cliContentBudget(j).zero_result_review_calls<7);
  assert.equal(cliTransportRecoveryCandidate(j),null);
});

for(const kind of ['revision','mode','contract','source','skill','draft','artifact','report','invocation','raw-counter','checkpoint','owner-stop','active-lease']){
  test('metadata resume CAS rejects concurrent '+kind+' without a resume audit or counter reset',async t=>{
    const f=await legacyPausedReview(t),binding=candidateBinding(f.job),original=f.db.prepare;
    const beforeReviews=reviews(f),beforeCounts=counts(f);let changed=false;
    f.db.prepare=q=>{
      if(!changed&&/^INSERT INTO production_reviews/.test(q)){
        changed=true;
        if(kind==='revision')f.sql.prepare('UPDATE production_jobs SET revision=2 WHERE id=?').run(f.id);
        if(kind==='mode')f.sql.prepare('UPDATE production_jobs SET mode_epoch=1 WHERE id=?').run(f.id);
        if(kind==='contract')f.sql.prepare('UPDATE production_jobs SET contract_hash=? WHERE id=?').run('0'.repeat(64),f.id);
        if(kind==='source')f.sql.prepare('UPDATE production_jobs SET source_snapshot=? WHERE id=?').run(JSON.stringify({url:'https://example.org/SYNTHETIC-new'}),f.id);
        if(kind==='skill')f.sql.prepare('UPDATE production_jobs SET skill_snapshot=? WHERE id=?').run(JSON.stringify({sha256:'0'.repeat(64)}),f.id);
        if(kind==='draft')f.sql.prepare('UPDATE production_drafts SET content_hash=? WHERE job_id=?').run('0'.repeat(64),f.id);
        if(kind==='artifact')f.sql.prepare('UPDATE production_milestones SET artifact_hash=? WHERE id=?').run('0'.repeat(64),f.script.id);
        if(kind==='report')f.sql.prepare("UPDATE production_milestones SET report='{}' WHERE id=?").run(f.script.id);
        if(kind==='invocation')f.sql.prepare("UPDATE production_milestones SET invocation_id='SYNTHETIC-new-invocation' WHERE id=?").run(f.script.id);
        if(kind==='raw-counter')f.sql.prepare('UPDATE production_jobs SET ai_calls=9 WHERE id=?').run(f.id);
        if(kind==='checkpoint')f.sql.prepare("UPDATE production_jobs SET checkpoint_version=checkpoint_version+1,checkpoint='{}' WHERE id=?").run(f.id);
        if(kind==='owner-stop')f.sql.prepare("UPDATE production_jobs SET error='已停止：SYNTHETIC concurrent owner' WHERE id=?").run(f.id);
        if(kind==='active-lease')f.sql.prepare('UPDATE production_jobs SET lease_hash=?,lease_until=? WHERE id=?').run(sha('SYNTHETIC concurrent lease'),Date.now()+600000,f.id);
      }
      return original(q);
    };
    await assert.rejects(()=>api.resumeCliTransport(f.id,{binding}));
    assert.equal(changed,true,'test must race the authoritative write, not merely its pre-read');
    assert.equal(reviews(f),beforeReviews);
    const after=counts(f);
    assert.equal(after.attempt,beforeCounts.attempt);assert.equal(after.reworks,beforeCounts.reworks);
    assert.equal(after.ai_calls,kind==='raw-counter'?9:8);
    assert.equal((await api.getJob(f.id)).status,'paused');assertRawBytes(f);
  });
}

test('eight actual content reviews still exhaust the review budget and do not become429 credits',async t=>{
  const f=await legacyPausedReview(t);
  f.sql.prepare("DELETE FROM production_reviews WHERE decision='cli_review_failure_v1'").run();
  f.sql.prepare("UPDATE production_jobs SET ai_calls=8,status='awaiting_review',checkpoint='{}',error=NULL WHERE id=?").run(f.id);
  f.sql.prepare("UPDATE production_milestones SET status='awaiting_ai',report=NULL,invocation_id=NULL WHERE id=?").run(f.script.id);
  const j=await api.getJob(f.id);
  assertBudget(j,{raw_ai_calls:8,zero_result_review_calls:0,content_ai_calls:8,review_available:false});
  assert.equal(cliTransportRecoveryCandidate(j),null);
  await assert.rejects(()=>api.claimReview(f.id,f.script.id,'SYNTHETIC ninth real content call'));
  assert.equal((await api.getJob(f.id)).ai_calls,8);
});

