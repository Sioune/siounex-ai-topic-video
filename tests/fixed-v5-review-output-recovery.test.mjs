// Real frozen Python preflight + production CAS + immutable synthetic CLI cache.
// No model, provider, HTTP, worker, UI, or media execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {createDepthLimitedSqlite} from './helpers/depth-limited-sqlite.mjs';
import {cliContentBudget} from '../lib/cli-content-budget.mts';
import {reviewOutputRecoveryCandidate} from '../lib/review-output-recovery.mts';
import {classifyCliProcess,safeRateLimitFailure} from '../lib/cli-failure-contract.mts';
import {narrationPreflight} from '../scripts/narration-preflight.mjs';
import {findCompletedReviewOutput,reviewExecutionBinding} from '../scripts/completed-review-output.mjs';
import {REVIEW_STAGE_POLICY_VERSION,REVIEW_STAGE_POLICY_SHA256} from '../lib/review-stage-policy.mts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const ID='job_33333333-3333-4333-8333-333333333333',OWNER='SYNTHETIC-fixed-v5-owner';
const SOURCE=JSON.stringify({url:'https://example.org/SYNTHETIC-fixed-v5'});
const SKILL=fs.readFileSync('production/skill-snapshot/snapshot.json','utf8');
const CONTRACT=sha('SYNTHETIC fixed-v5 immutable contract'),sourceSha=sha('SYNTHETIC complete source text');
const ERROR='Cannot approve script with blocked text preflight: segments[1] 缺文字或具体可见画面';
const marker='机器预检（不是语义批准，text_preflight与制作就绪独立）：';
const endMarker='\n不能用补报道署名';
const bundle=await build({
  stdin:{
    contents:"export {getJob,claimJob,submitDraft} from './lib/production';export {claimReview,decideMilestone,pauseReview,recoverCompletedReviewOutput,resumeDecision} from './lib/milestones';export {deferCliReview} from './lib/cli-failure';",
    resolveDir:process.cwd(),
  },
  bundle:true,platform:'node',format:'esm',write:false,
  plugins:[{name:'synthetic-fixed-v5-db',setup(b){
    b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__fixedV5Db}export function siteArchiveBucket(){throw Error("No media bucket in fixed-v5 recovery test")};'}));
  }}],
});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
function draft(){
  const script='这张卡把三个问题摆在了一起。你会先看哪一项？';
  return {
    script,materials:'SYNTHETIC planned source image; recording and rights pending',limits:'SYNTHETIC no production or quality approval',
    evidence:[{url:JSON.parse(SOURCE).url,title:'SYNTHETIC source',published_at:null,retrieved_at:new Date().toISOString(),sha256:sourceSha,facts:['SYNTHETIC fact'],materials:['SYNTHETIC planned picture'],limits:['SYNTHETIC fixture only']}],
    storyboard:[
      {start:0,end:51,narration:script,visual:'计划制作三项问题卡，素材与权利待核查。',asset_id:'image_0'},
      {start:51,end:51+119/30,narration:'',visual:'复用既有v5片尾，保留全部119帧，原速1×，不删帧。',sound:'保留片尾原声；不新增旁白。',asset_id:'existing_v5_outro'},
    ],
    execution:{mode:'codex-cli',executor:'SYNTHETIC fixed-v5 in-memory submit',source_hash:sha(SOURCE),skill_hash:JSON.parse(SKILL).sha256},
  };
}
function approval(m,ordinal){
  const required=m.node==='source'?['source_identity','facts','materials','limits']:['grounding','clarity','specification','limits'];
  return {
    decision:'approve',reason:'SYNTHETIC completed '+m.node+' assessment '+ordinal,
    model:'gpt-5.6-sol',artifact_hash:m.artifact_hash,
    inspected_sources:JSON.parse(m.artifact).evidence.map(e=>e.sha256),
    review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256,
    checks:required.map(criterion=>({criterion,pass:true,reason:'SYNTHETIC current-stage check',evidence:'SYNTHETIC frozen source and draft'})),
    receipt:{exit_code:0,prompt_sha256:sha('SYNTHETIC prompt '+ordinal),output_sha256:sha('SYNTHETIC output '+ordinal),artifact_json_hash:sha(m.artifact),review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256},
  };
}
function rejected(claim,ordinal){
  const j=claim.job,m=claim.milestone;
  const events=[{type:'thread.started',thread_id:'SYNTHETIC-rejected-'+ordinal},{type:'turn.started'},{type:'turn.failed',error:{message:'429 Too Many Requests; Retry-After: 0'}}].map(JSON.stringify).join('\n')+'\n';
  const value={
    schema:'text-cli-failure-v1',stage:'script-review',
    ...classifyCliProcess({exit_code:1,output_present:false,event_log:events}),
    process_receipt_sha256:sha('SYNTHETIC completed rejected process '+ordinal),
    event_log_sha256:sha(events),prompt_sha256:sha('SYNTHETIC rejected prompt '+ordinal),finished_at:new Date().toISOString(),
    execution_binding:{job_id:ID,revision:j.revision,attempt:j.attempt,mode_epoch:j.mode_epoch,contract_hash:j.contract_hash,source_snapshot_sha256:sha(j.source_snapshot),skill_snapshot_sha256:sha(j.skill_snapshot),source_file_sha256:sourceSha,skill_bundle_sha256:JSON.parse(j.skill_snapshot).sha256,ai_calls:j.ai_calls,milestone_id:m.id,artifact_hash:m.artifact_hash,review_invocation_id:claim.invocation_id},
  };
  assert.equal(safeRateLimitFailure(value),true);return value;
}
async function fixture(t,alias=false){
  const engine=await createDepthLimitedSqlite({depth:100}),db=engine.db;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-fixed-v5-review-'));
  globalThis.__fixedV5Db=db;
  t.after(async()=>{delete globalThis.__fixedV5Db;await engine.close();fs.rmSync(root,{recursive:true,force:true})});
  for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())await engine.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
  const at=new Date().toISOString();
  await db.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated) VALUES('SYNTHETIC-fixed-v5','https://example.org/SYNTHETIC-fixed-v5','S','S','S','S','S',?,'S',0,'S','S','S','S','S',0)").bind(at).run();
  await db.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,review_mode,mode_epoch,source_snapshot,skill_snapshot,contract_hash,checkpoint,created_at,updated_at) VALUES(?,'SYNTHETIC-fixed-v5',?,0,'waiting_executor','auto',0,?,?,?,'{}',?,?)").bind(ID,OWNER,SOURCE,SKILL,CONTRACT,at,at).run();
  const content=draft();if(alias)Object.assign(content.storyboard[1],{asset_id:'existing_v5_outro_119f',visual:'完整保留既有原v5片尾119帧，1×原速，不截断、不重设计。',sound:'保留片尾完整原声1×；正文BGM在片尾前结束。'});
  const first=await api.claimJob('SYNTHETIC submit only',ID),submitted=await api.submitDraft(ID,first.lease_token,0,'SYNTHETIC-fixed-v5-draft',content);
  const source=submitted.job.milestones.find(m=>m.node==='source'),sourceClaim=await api.claimReview(ID,source.id,'SYNTHETIC-source-call-1');
  await api.decideMilestone(ID,source.id,1,source.artifact_hash,0,'approve',approval(source,1),'codex-cli',sourceClaim.review_token);
  for(let ordinal=2;ordinal<=8;ordinal++){
    const current=await api.getJob(ID),script=current.milestones.find(m=>m.node==='script'),claim=await api.claimReview(ID,script.id,'SYNTHETIC-script-call-'+ordinal);
    await api.deferCliReview(ID,script.id,claim.review_token,rejected(claim,ordinal));
  }
  // Preserve the real seven accepted rejection notes. The remaining historical
  // claims are raw accounting, never fabricated zero-result discounts.
  await db.prepare('UPDATE production_jobs SET ai_calls=12,attempt=3,reworks=2 WHERE id=?').bind(ID).run();
  const before=await api.getJob(ID),script=before.milestones.find(m=>m.node==='script');
  const last=await api.claimReview(ID,script.id,'SYNTHETIC-script-call-13');
  await api.pauseReview(ID,script.id,ERROR,last.review_token);
  const job=await api.getJob(ID),milestone=job.milestones.find(m=>m.node==='script');
  const frontstage=narrationPreflight(job,JSON.parse(milestone.artifact),{root:path.join(root,'preflight')});
  assert.equal(frontstage.text_preflight,'clear');
  assert.equal(frontstage.production_ready,false);
  assert.deepEqual(frontstage.deferred_non_narrated_segments.map(s=>({index:s.index,asset_id:s.asset_id})),[{index:1,asset_id:alias?'existing_v5_outro_119f':'existing_v5_outro'}]);
  assert.equal(frontstage.text_problems.length,0);
  const preflightInput=JSON.parse(fs.readFileSync(path.join(root,'preflight',fs.readdirSync(path.join(root,'preflight'))[0],'input.json'),'utf8'));
  assert.equal(preflightInput.segments.length,1);assert.equal(preflightInput.segments[0].text,draft().script);
  return {engine,db,root,job,milestone,frontstage};
}
function cache(f){
  const {job,milestone,frontstage}=f;
  const old={...frontstage,text_preflight:'blocked',text_problems:['segments[1] 缺文字或具体可见画面'],problems:[...frontstage.problems,'segments[1] 缺文字或具体可见画面']};
  delete old.deferred_non_narrated_segments;delete old.storyboard_segments_version;
  const prefix='SYNTHETIC immutable prompt prefix\n'+marker,suffix=endMarker+'；SYNTHETIC immutable suffix';
  const oldPrompt=prefix+JSON.stringify(old)+suffix,currentPrompt=prefix+JSON.stringify(frontstage)+suffix;
  const choices=['SYNTHETIC-artifact',sourceSha],sourceHashes=[sourceSha],imageHashes=[];
  const key=sha(oldPrompt+'\nreview-evidence-schema-v3\n'+JSON.stringify(choices));
  const root=path.join(f.root,'completed-cache'),dir=path.join(root,key),bytes=new Map();
  const rawReport=approval(milestone,13);delete rawReport.receipt;
  const output=JSON.stringify(rawReport);
  const events=[{type:'thread.started',thread_id:'SYNTHETIC-original-thread'},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:output}},{type:'turn.completed'}].map(JSON.stringify).join('\n')+'\n';
  const started_at=new Date(Date.now()-10000).toISOString(),process={
    scope:'owned-cli-child-tree',pid:2147483500,started_at,finished_at:new Date(Date.now()-5000).toISOString(),
    prompt_sha256:sha(oldPrompt),image_sha256:[],model:'gpt-5.6-sol',
    exit_code:0,error_code:'CLI_COMPLETED',signal:null,spawn_error:null,timed_out:false,
    termination_unconfirmed:false,result_unknown:false,confirmed_no_result:false,output_present:true,
    tool_events:0,output_sha256:sha(output),event_log_sha256:sha(events),
  };
  const execution={
    exit_code:0,prompt_sha256:key,output_sha256:sha(output),artifact_json_hash:sha(milestone.artifact),
    source_hashes:sourceHashes,image_hashes:imageHashes,
    review_binding:reviewExecutionBinding(job,milestone),cli_process:process,
  };
  const put=(name,value)=>{
    const file=path.join(dir,name),valueBytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value));
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,valueBytes,{flag:'wx'});bytes.set(file,valueBytes);return file;
  };
  put('prompt.txt',oldPrompt);put('output.json',output);put('execution.json',execution);
  put('started.json',{prompt_sha256:key,model:'gpt-5.6-sol',invocation_id:milestone.invocation_id});
  put('cli-process/cli-process-started.json',{...process,finished_at:undefined});
  put('cli-process/cli-owned-child.json',{scope:process.scope,pid:process.pid,parent_pid:2147483501,started_at});
  put('cli-process/cli-events.log',events);put('cli-process/cli-process-exit.json',process);
  const options={root,job,milestone,currentPrompt,frontstage,choices,sourceHashes,imageHashes};
  return {dir,bytes,options,execution,output,oldPrompt,process,find:()=>findCompletedReviewOutput(options)};
}
async function immutable(db){
  return {
    drafts:JSON.stringify((await db.prepare('SELECT * FROM production_drafts WHERE job_id=?').bind(ID).all()).results),
    source:JSON.stringify((await db.prepare("SELECT * FROM production_milestones WHERE job_id=? AND node='source'").bind(ID).all()).results),
    failures:JSON.stringify((await db.prepare("SELECT * FROM production_reviews WHERE job_id=? AND decision IN ('cli_review_failure_v1','ai_review_error') ORDER BY id").bind(ID).all()).results),
  };
}
const budget=job=>{const b=cliContentBudget(job);assert.equal(b.raw_ai_calls,13);assert.equal(b.zero_result_review_calls,7);assert.equal(b.content_ai_calls,6);assert.equal(b.raw_attempts,3);assert.equal(b.reworks,2);return b};

for(const alias of [false,true])test('raw13 with seven accepted429s reconciles the completed fixed-v5 result through real CAS and regular approval at depth100,119f alias='+alias,async t=>{
  const f=await fixture(t,alias),c=cache(f),before=await immutable(f.db);
  budget(f.job);assert.equal(reviewOutputRecoveryCandidate(f.job)?.id,f.milestone.id);
  const found=c.find();assert.equal(found.proof.new_model_calls,0);assert.equal(found.output.decision,'approve');
  const lease=await api.recoverCompletedReviewOutput(ID,f.milestone.id,found.proof);
  assert.equal(lease.new_model_calls,0);assert.equal(lease.reconciliation_only,true);
  const running=await api.getJob(ID);budget(running);assert.equal(running.status,'awaiting_review');
  const m=running.milestones.find(m=>m.id===f.milestone.id);
  assert.equal(m.invocation_id,f.milestone.invocation_id);assert.equal(m.status,'ai_running');
  const result=await api.decideMilestone(ID,m.id,m.revision,m.artifact_hash,m.mode_epoch,'approve',{
    ...found.output,receipt:{...found.receipt,review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256},
  },'codex-cli',lease.review_token);
  budget(result);assert.equal(result.status,'approved');assert.equal(result.approved_revision,1);
  assert.equal(result.approved_hash,result.drafts[0].content_hash);
  assert.deepEqual(await immutable(f.db),before);
  for(const [file,bytes] of c.bytes)assert.deepEqual(fs.readFileSync(file),bytes,path.basename(file)+' changed');
  assert.equal((await f.db.prepare("SELECT count(*) AS n FROM production_reviews WHERE decision='ai_review_output_reconciliation_v1'").first()).n,1);
  assert.equal(await f.engine.getExpressionDepth(),100);
  await assert.rejects(()=>api.recoverCompletedReviewOutput(ID,m.id,found.proof));
});

test('an explicit later owner stop cannot be turned into a fixed-v5 output recovery',async t=>{
  const f=await fixture(t),c=cache(f),found=c.find(),before=await immutable(f.db);
  await api.resumeDecision(ID,OWNER,'stop','SYNTHETIC owner stopped this original review');
  const stopped=await api.getJob(ID);assert.equal(reviewOutputRecoveryCandidate(stopped),null);
  await assert.rejects(()=>api.recoverCompletedReviewOutput(ID,f.milestone.id,found.proof));
  budget(await api.getJob(ID));assert.deepEqual(await immutable(f.db),before);
  assert.equal((await f.db.prepare("SELECT count(*) AS n FROM production_reviews WHERE decision='ai_review_output_reconciliation_v1'").first()).n,0);
});
for(const kind of ['updated-at','artifact','invocation','owner-stop']){
  test('completed fixed-v5 output recovery loses concurrent '+kind+' CAS without a new audit',async t=>{
    const f=await fixture(t),found=cache(f).find(),original=f.db.batch;let raced=false;
    f.db.batch=async statements=>{
      f.db.batch=original;raced=true;
      if(kind==='updated-at')await f.db.prepare('UPDATE production_jobs SET updated_at=? WHERE id=?').bind('SYNTHETIC concurrent state',ID).run();
      if(kind==='artifact')await f.db.prepare('UPDATE production_milestones SET artifact_hash=? WHERE id=?').bind('0'.repeat(64),f.milestone.id).run();
      if(kind==='invocation')await f.db.prepare("UPDATE production_milestones SET invocation_id='SYNTHETIC-other-original' WHERE id=?").bind(f.milestone.id).run();
      if(kind==='owner-stop')await f.db.prepare("UPDATE production_jobs SET error='已停止：SYNTHETIC concurrent owner' WHERE id=?").bind(ID).run();
      return original(statements);
    };
    await assert.rejects(()=>api.recoverCompletedReviewOutput(ID,f.milestone.id,found.proof));
    assert.equal(raced,true);budget(await api.getJob(ID));
    assert.equal((await f.db.prepare("SELECT count(*) AS n FROM production_reviews WHERE decision='ai_review_output_reconciliation_v1'").first()).n,0);
    assert.equal((await api.getJob(ID)).status,'paused');
  });
}
for(const kind of ['artifact','output','unknown-exit','process-event','prompt-outside-preflight']){
  test('cached fixed-v5 recovery rejects changed '+kind+' and never asks for a fresh model call',async t=>{
    const f=await fixture(t),c=cache(f),before=await immutable(f.db);
    if(kind==='artifact')c.options.milestone={...f.milestone,artifact:f.milestone.artifact+' '};
    if(kind==='output')fs.appendFileSync(path.join(c.dir,'output.json'),' ');
    if(kind==='unknown-exit'){
      const process={...c.process,result_unknown:true};
      fs.writeFileSync(path.join(c.dir,'cli-process/cli-process-exit.json'),JSON.stringify(process));
      fs.writeFileSync(path.join(c.dir,'execution.json'),JSON.stringify({...c.execution,cli_process:process}));
    }
    if(kind==='process-event')fs.appendFileSync(path.join(c.dir,'cli-process/cli-events.log'),JSON.stringify({type:'item.completed',item:{type:'mcp_tool_call'}})+'\n');
    if(kind==='prompt-outside-preflight')c.options.currentPrompt='SYNTHETIC changed source instruction\n'+c.options.currentPrompt;
    assert.throws(c.find,/COMPLETED_REVIEW_/);budget(await api.getJob(ID));
    assert.deepEqual(await immutable(f.db),before);
    assert.equal((await f.db.prepare("SELECT count(*) AS n FROM production_reviews WHERE decision='ai_review_output_reconciliation_v1'").first()).n,0);
  });
}



test('completed source review survives transport failure and reuses exact original result without another model call',async t=>{
 const engine=await createDepthLimitedSqlite({depth:100}),db=engine.db,root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-source-recovery-'));globalThis.__fixedV5Db=db;
 t.after(async()=>{delete globalThis.__fixedV5Db;await engine.close();fs.rmSync(root,{recursive:true,force:true})});
 for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())await engine.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
 const at=new Date().toISOString();
 await db.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated) VALUES('SYNTHETIC-fixed-v5','https://example.org/SYNTHETIC-fixed-v5','S','S','S','S','S',?,'S',0,'S','S','S','S','S',0)").bind(at).run();
 await db.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,review_mode,mode_epoch,source_snapshot,skill_snapshot,contract_hash,checkpoint,created_at,updated_at) VALUES(?,'SYNTHETIC-fixed-v5',?,0,'waiting_executor','auto',0,?,?,?,'{}',?,?)").bind(ID,OWNER,SOURCE,SKILL,CONTRACT,at,at).run();
 const first=await api.claimJob('SYNTHETIC',ID),submitted=await api.submitDraft(ID,first.lease_token,0,'SYNTHETIC-source-draft',draft()),m=submitted.job.milestones.find(x=>x.node==='source'),claim=await api.claimReview(ID,m.id,'SYNTHETIC-original-source-call');
 await api.pauseReview(ID,m.id,'NATIVE_PRODUCTION_TOOL_FAILED',claim.review_token);
 const job=await api.getJob(ID),milestone=job.milestones.find(x=>x.id===m.id);assert.equal(reviewOutputRecoveryCandidate(job)?.id,m.id);
 const prompt='SYNTHETIC exact source prompt',choices=['source evidence'],sourceHashes=[sourceSha],imageHashes=[],key=sha(prompt+'\nreview-evidence-schema-v3\n'+JSON.stringify(choices));
 const dir=path.join(root,key),raw=approval(milestone,1);delete raw.receipt;const output=JSON.stringify(raw),events=[{type:'thread.started'},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:output}},{type:'turn.completed'}].map(JSON.stringify).join('\n')+'\n',schema='SYNTHETIC schema';
 const proc={scope:'owned-cli-child-tree',pid:123,started_at:at,finished_at:at,prompt_sha256:sha(prompt),image_sha256:[],model:'gpt-5.6-sol',exit_code:0,error_code:'CLI_COMPLETED',signal:null,spawn_error:null,timed_out:false,termination_unconfirmed:false,result_unknown:false,output_present:true,tool_events:0,output_sha256:sha(output),event_log_sha256:sha(events)};
 const binding=reviewExecutionBinding(job,milestone),execution={exit_code:0,prompt_sha256:key,output_sha256:sha(output),artifact_json_hash:sha(milestone.artifact),source_hashes:sourceHashes,image_hashes:imageHashes,review_binding:binding,cli_process:proc};
 const put=(n,v)=>{let f=path.join(dir,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof v==='string'?v:JSON.stringify(v))};
 put('prompt.txt',prompt);put('output.json',output);put('execution.json',execution);put('schema.json',schema);put('review-execution-intent.json',{schema:'review-execution-intent-v1',binding,prompt_sha256:sha(prompt),schema_sha256:sha(schema)});put('cli-process/cli-process-exit.json',proc);put('cli-process/cli-events.log',events);
 const options={root,job,milestone,currentPrompt:prompt,frontstage:null,choices,sourceHashes,imageHashes};
 const found=findCompletedReviewOutput(options);assert.equal(found.proof.new_model_calls,0);assert.equal(found.output.decision,'approve');
 assert.throws(()=>findCompletedReviewOutput({...options,currentPrompt:prompt+'changed'}),/COMPLETED_REVIEW_/);
 const intent=path.join(dir,'review-execution-intent.json'),original=fs.readFileSync(intent);fs.writeFileSync(intent,JSON.stringify({schema:'review-execution-intent-v1',binding:{...binding,invocation_id:'other'},prompt_sha256:sha(prompt),schema_sha256:sha(schema)}));assert.throws(()=>findCompletedReviewOutput(options),/COMPLETED_REVIEW_INTENT_CHANGED/);fs.writeFileSync(intent,original);
 assert.equal(reviewOutputRecoveryCandidate({...job,error:'已停止'}) ,null);
 assert.equal(reviewOutputRecoveryCandidate({...job,reviews:[...job.reviews,{decision:'human_review',revision:1,created_at:new Date(Date.now()+1000).toISOString()}]}),null);
 const schemaFile=path.join(dir,'schema.json');fs.writeFileSync(schemaFile,schema+'changed');assert.throws(()=>findCompletedReviewOutput(options),/COMPLETED_REVIEW_INTENT_CHANGED/);fs.writeFileSync(schemaFile,schema);
 const lease=await api.recoverCompletedReviewOutput(ID,m.id,found.proof);assert.equal(lease.new_model_calls,0);const current=await api.getJob(ID),node=current.milestones.find(x=>x.id===m.id);const after=await api.decideMilestone(ID,m.id,1,m.artifact_hash,0,'approve',{...found.output,receipt:{...found.receipt,review_stage_policy_version:REVIEW_STAGE_POLICY_VERSION,review_stage_policy_sha256:REVIEW_STAGE_POLICY_SHA256}},'codex-cli',lease.review_token);
 assert.equal(after.milestones.find(x=>x.id===m.id).status,'approved');assert.equal(after.ai_calls,1);assert.equal(after.drafts.length,1);assert.equal(after.milestones.find(x=>x.node==='script').status,'awaiting_ai');
});
