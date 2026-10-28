// Actual production APIs over a persistent, depth-100 SQLite :memory: engine.
// All jobs, source text, prompts and receipts below are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {createDepthLimitedSqlite} from './helpers/depth-limited-sqlite.mjs';
import {classifyCliProcess,safeRateLimitFailure} from '../lib/cli-failure-contract.mts';
import {cliContentBudget,cliTransportRecoveryCandidate} from '../lib/cli-content-budget.mts';
import {REVIEW_STAGE_POLICY_VERSION,REVIEW_STAGE_POLICY_SHA256} from '../lib/review-stage-policy.mts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const ID='job_22222222-2222-4222-8222-222222222222',OWNER='SYNTHETIC-depth-owner';
const SOURCE=JSON.stringify({url:'https://example.org/SYNTHETIC-depth'});
const SKILL=JSON.stringify({sha256:'b'.repeat(64)}),CONTRACT='c'.repeat(64);
const sourceSha=sha('SYNTHETIC in-memory source; no downloaded article');
const bundle=await build({
  stdin:{
    contents:"export {getJob,claimJob,submitDraft} from './lib/production';export {claimReview,decideMilestone} from './lib/milestones';export {nextWork} from './lib/dispatch';export {resumeCliTransport,deferCliReview} from './lib/cli-failure';export {executionBinding} from './lib/production-queue-contract';export {requestExecution} from './lib/production-queue';",
    resolveDir:process.cwd(),
  },
  bundle:true,platform:'node',format:'esm',write:false,
  plugins:[{name:'synthetic-depth-limited-db',setup(b){
    b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__cliBudgetDepthDb}export function siteArchiveBucket(){throw Error("No media bucket in SQLite-depth test")};'}));
  }}],
});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));

test('the persistent SQLite engine enforces depth100 and really rejects a150-term serial AND',async t=>{
  const engine=await createDepthLimitedSqlite({depth:100});t.after(()=>engine.close());
  assert.equal(engine.info.expression_depth,100);
  assert.equal(await engine.getExpressionDepth(),100);
  assert.equal(engine.info.database_file,'','the engine must never open a real SQLite file');
  const unsafe='SELECT 1 AS accepted WHERE '+Array.from({length:150},()=>'?=1').join(' AND ');
  await assert.rejects(
    ()=>engine.db.prepare(unsafe).bind(...Array(150).fill(1)).first(),
    error=>error.code==='SQLITE_ERROR'&&/Expression tree is too large.*100/i.test(error.message),
  );
  assert.deepEqual(await engine.db.prepare('SELECT ? AS still_alive').bind('SYNTHETIC').first(),{still_alive:'SYNTHETIC'});
  assert.equal(await engine.getExpressionDepth(),100,'errors must not raise or reset the connection limit');
});

test('the synthetic D1 batch is atomic on the same limited connection',async t=>{
  const engine=await createDepthLimitedSqlite({depth:100});t.after(()=>engine.close());
  const {db}=engine;
  await engine.exec('CREATE TABLE synthetic_atomic(id TEXT PRIMARY KEY, value TEXT NOT NULL);');
  await assert.rejects(()=>db.batch([
    db.prepare('INSERT INTO synthetic_atomic VALUES(?,?)').bind('same','first'),
    db.prepare('INSERT INTO synthetic_atomic VALUES(?,?)').bind('same','conflict'),
  ]),/UNIQUE constraint failed/);
  assert.deepEqual(await db.prepare('SELECT count(*) AS n FROM synthetic_atomic').first(),{n:0});
  const saved=await db.batch([
    db.prepare('INSERT INTO synthetic_atomic VALUES(?,?)').bind('one','SYNTHETIC'),
    db.prepare('SELECT value FROM synthetic_atomic WHERE id=?').bind('one'),
  ]);
  assert.equal(saved[0].meta.changes,1);
  assert.deepEqual(saved[1].results,[{value:'SYNTHETIC'}]);
  assert.equal(await engine.getExpressionDepth(),100);
});

async function fixture(t){
  const engine=await createDepthLimitedSqlite({depth:100});
  globalThis.__cliBudgetDepthDb=engine.db;
  t.after(async()=>{delete globalThis.__cliBudgetDepthDb;await engine.close()});
  assert.equal(await engine.getExpressionDepth(),100);
  assert.equal(engine.info.database_file,'');
  for(const name of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort()){
    await engine.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
  }
  const db=engine.db,at=new Date(Date.now()-10000).toISOString();
  await db.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated) VALUES('SYNTHETIC-depth','https://example.org/SYNTHETIC-depth','S','S','S','S','S',?,'S',0,'S','S','S','S','S',0)").bind(at).run();
  await db.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,review_mode,mode_epoch,source_snapshot,skill_snapshot,contract_hash,checkpoint,revision,attempt,created_at,updated_at) VALUES(?,'SYNTHETIC-depth',?,0,'waiting_executor','auto',0,?,?,?,?,0,0,?,?)")
    .bind(ID,OWNER,SOURCE,SKILL,CONTRACT,JSON.stringify({phase:'source-verified',source_sha256:null}),at,at).run();
  return {engine,db,raw:new Map()};
}
const draft=()=>({
  script:'SYNTHETIC complete wording for a depth-limited production API test.',
  evidence:[{
    url:JSON.parse(SOURCE).url,title:'SYNTHETIC depth source',published_at:null,
    retrieved_at:new Date().toISOString(),sha256:sourceSha,
    facts:['SYNTHETIC source fact'],materials:['SYNTHETIC reference'],limits:['SYNTHETIC test only'],
  }],
  materials:'SYNTHETIC pending materials; no media is generated',
  limits:'SYNTHETIC source and in-memory receipts only',
  execution:{mode:'codex-cli',executor:'SYNTHETIC SQLite-depth fixture',source_hash:sha(SOURCE),skill_hash:JSON.parse(SKILL).sha256},
});
function approval(m,ordinal){
  const required=m.node==='source'?['source_identity','facts','materials','limits']:['grounding','clarity','specification','limits'];
  return {
    reason:'SYNTHETIC structured '+m.node+' review '+ordinal,
    model:'gpt-5.6-sol',artifact_hash:m.artifact_hash,
    review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,
    review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256,
    inspected_sources:JSON.parse(m.artifact).evidence.map(e=>e.sha256),
    checks:required.map(criterion=>({criterion,pass:true,reason:'SYNTHETIC '+criterion,evidence:'SYNTHETIC exact artifact bytes'})),
    receipt:{
      exit_code:0,prompt_sha256:sha('SYNTHETIC prompt '+ordinal),
      output_sha256:sha('SYNTHETIC complete report '+ordinal),artifact_json_hash:sha(m.artifact),
      review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,
      review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256,
    },
  };
}
async function approve(claim,ordinal){
  const m=claim.milestone,j=claim.job;
  return api.decideMilestone(ID,m.id,j.revision,m.artifact_hash,j.mode_epoch,'approve',approval(m,ordinal),'codex-cli',claim.review_token);
}
function strict429(f,claim,ordinal){
  const started_at=new Date(Date.now()-2).toISOString(),finished_at=new Date().toISOString();
  const prompt='SYNTHETIC exact rejected review prompt '+ordinal;
  const process=JSON.stringify({
    scope:'owned-cli-child-tree',pid:20000+ordinal,started_at,finished_at,
    prompt_sha256:sha(prompt),exit_code:1,timed_out:false,termination_unconfirmed:false,output_present:false,
  });
  const events=[
    {type:'thread.started',thread_id:'SYNTHETIC-depth-thread-'+ordinal},
    {type:'turn.started'},
    {type:'error',message:'429 Too Many Requests; Retry-After: 0'},
    {type:'turn.failed',error:{message:'429 Too Many Requests; Retry-After: 0'}},
  ].map(JSON.stringify).join('\n')+'\n';
  const classification=classifyCliProcess({exit_code:1,timed_out:false,termination_unconfirmed:false,output_present:false,event_log:events});
  f.raw.set(ordinal,{prompt,process,events,digest:sha(prompt+process+events)});
  const j=claim.job,m=claim.milestone;
  const value={
    schema:'text-cli-failure-v1',stage:'script-review',...classification,
    process_receipt_sha256:sha(process),event_log_sha256:sha(events),prompt_sha256:sha(prompt),finished_at,
    execution_binding:{
      job_id:ID,revision:j.revision,attempt:j.attempt,mode_epoch:j.mode_epoch,contract_hash:j.contract_hash,
      source_snapshot_sha256:sha(j.source_snapshot),skill_snapshot_sha256:sha(j.skill_snapshot),
      source_file_sha256:sourceSha,skill_bundle_sha256:JSON.parse(j.skill_snapshot).sha256,
      ai_calls:j.ai_calls,milestone_id:m.id,artifact_hash:m.artifact_hash,review_invocation_id:claim.invocation_id,
    },
  };
  assert.equal(safeRateLimitFailure(value),true);
  return value;
}
async function immutableState(db){
  return {
    drafts:JSON.stringify((await db.prepare('SELECT * FROM production_drafts WHERE job_id=? ORDER BY revision').bind(ID).all()).results),
    source:JSON.stringify((await db.prepare("SELECT * FROM production_milestones WHERE job_id=? AND node='source'").bind(ID).all()).results),
    receipts:(await db.prepare("SELECT * FROM production_reviews WHERE job_id=? AND decision IN ('cli_review_failure_v1','approve') ORDER BY id").bind(ID).all()).results,
  };
}
function assertBudget(job,expected){
  const actual=cliContentBudget(job);
  for(const [key,value] of Object.entries(expected))assert.equal(actual[key],value,key);
}

test('depth100 supports actual resume, dispatch, execution request and the ninth real review claim after seven accepted429s',async t=>{
  const f=await fixture(t),{db,engine}=f;
  const generation=await api.claimJob('SYNTHETIC in-memory generation claim',ID);
  assert.equal(generation.job.attempt,1);
  const submitted=await api.submitDraft(ID,generation.lease_token,0,'SYNTHETIC-depth-draft',draft());
  const source=submitted.job.milestones.find(m=>m.node==='source');
  const first=await api.claimReview(ID,source.id,'SYNTHETIC-depth-call-1');
  await approve(first,1);
  for(let ordinal=2;ordinal<=8;ordinal++){
    const job=await api.getJob(ID),script=job.milestones.find(m=>m.node==='script');
    const claim=await api.claimReview(ID,script.id,'SYNTHETIC-depth-call-'+ordinal);
    assert.equal(claim.job.ai_calls,ordinal);
    const accepted=await api.deferCliReview(ID,script.id,claim.review_token,strict429(f,claim,ordinal));
    assert.equal(accepted.replayed,false);
  }
  // Only emulate the old pause policy. Keep the actually accepted diagnostics,
  // draft, source approval and raw counters from the real API chain.
  await db.batch([
    db.prepare("UPDATE production_jobs SET status='paused' WHERE id=?").bind(ID),
    db.prepare("UPDATE production_milestones SET status='paused' WHERE job_id=? AND node='script'").bind(ID),
  ]);
  const paused=await api.getJob(ID),before=await immutableState(db),binding=cliTransportRecoveryCandidate(paused);
  assert.ok(binding);assert.equal(paused.ai_calls,8);
  assert.equal(JSON.parse(paused.checkpoint).source_sha256,null);
  assert.equal(before.receipts.filter(r=>r.decision==='cli_review_failure_v1').length,7);
  assertBudget(paused,{raw_attempts:1,raw_ai_calls:8,zero_result_review_calls:7,content_attempts:1,content_ai_calls:1,reworks:0});
  const resumed=await api.resumeCliTransport(ID,{binding});
  assert.equal(resumed.replayed,false);
  assert.equal((await api.resumeCliTransport(ID,{binding})).replayed,true);
  const current=await api.getJob(ID),script=current.milestones.find(m=>m.node==='script');
  assert.equal(current.status,'awaiting_review');assert.equal(script.status,'awaiting_ai');
  assert.equal(current.checkpoint,paused.checkpoint);
  const selected=await api.nextWork();
  assert.equal(selected.kind,'review');assert.equal(selected.job.id,ID);assert.equal(selected.milestone_id,script.id);
  const requestBinding=api.executionBinding(current);
  assert.equal(requestBinding.kind,'review');assert.equal(requestBinding.target_id,script.id);
  const requested=await api.requestExecution(ID,OWNER,requestBinding);
  assert.equal(requested.queued,true);assert.equal(requested.replayed,false);
  assert.equal((await api.requestExecution(ID,OWNER,requestBinding)).replayed,true);
  const ninth=await api.claimReview(ID,script.id,'SYNTHETIC-depth-call-9');
  assertBudget(ninth.job,{raw_attempts:1,raw_ai_calls:9,zero_result_review_calls:7,content_attempts:1,content_ai_calls:2,reworks:0});
  const completed=await approve(ninth,9);
  assert.equal(completed.status,'approved');assert.equal(completed.approved_revision,1);
  assert.equal(completed.approved_hash,completed.drafts[0].content_hash);
  const after=await immutableState(db);
  assert.equal(after.drafts,before.drafts);assert.equal(after.source,before.source);
  for(const old of before.receipts){
    assert.deepEqual(await db.prepare('SELECT * FROM production_reviews WHERE id=?').bind(old.id).first(),old);
  }
  for(const {prompt,process,events,digest} of f.raw.values())assert.equal(sha(prompt+process+events),digest);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM production_reviews WHERE decision='revise'").first()).n,0);
  assert.equal(await engine.getExpressionDepth(),100,'the whole production chain must stay under the original depth100 limit');
});

