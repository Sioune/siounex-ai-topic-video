// Synthetic content and injected Codex runner; no model, network, media
// generation or production state. The frozen local Python text checker runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {REVIEW_STAGE_POLICY,REVIEW_STAGE_POLICY_SHA256} from '../scripts/review-stage-policy.mjs';
import {boundedCodexCli as ownedSyntheticChild} from '../scripts/bounded-codex-cli.mjs';
import {validTerminalReviewReceipt} from '../lib/terminal-review-reconciliation.mts';
const sha=value=>createHash('sha256').update(value).digest('hex');
const bundled=await build({entryPoints:['scripts/milestone-cli.mjs'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-text-review-runner',setup(b){
  b.onResolve({filter:/^\.\/bounded-codex-cli\.mjs$/},()=>({path:'SYNTHETIC-no-codex-process',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const boundedCodexCli = options => globalThis.__textStageReviewMock(options);'}));
}}]});
const {reviewText}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
function fixture(t,node='script',changes={}){
  const parent=path.resolve('.sites-runtime');fs.mkdirSync(parent,{recursive:true});const root=fs.mkdtempSync(path.join(parent,'SYNTHETIC-text-stage-'));
  const savedAppData=process.env.APPDATA;process.env.APPDATA=root;
  const fakeCli=path.join(root,'npm/node_modules/@openai/codex/bin/codex.js');fs.mkdirSync(path.dirname(fakeCli),{recursive:true});fs.writeFileSync(fakeCli,'// SYNTHETIC, never executed');
  t.after(()=>{delete globalThis.__textStageReviewMock;if(savedAppData===undefined)delete process.env.APPDATA;else process.env.APPDATA=savedAppData;assert.equal(path.dirname(path.resolve(root)),parent);assert.ok(path.basename(root).startsWith('SYNTHETIC-text-stage-'));fs.rmSync(root,{recursive:true,force:true});});
  const sourceFile=path.join(root,'source.txt'),sourceText='SYNTHETIC article supports the planned story. Actual original headline.';fs.writeFileSync(sourceFile,sourceText);
  const source={url:'https://source.example.org/SYNTHETIC',file:sourceFile,sha256:sha(sourceText)};
  const code=fs.readFileSync('production/skill-snapshots/c3c66b3dd605a86de6237ccd8d21050472bb15c5/scripts/qa_narration.py','utf8');
  const files={'SKILL.md':'SYNTHETIC old frozen skill remains immutable.','references/narration-gate.md':'SYNTHETIC old combined material gate: 素材待补不得通过。','scripts/qa_narration.py':code};
  const job={id:'SYNTHETIC-text-stage-job',source_snapshot:JSON.stringify({url:source.url,title:'SYNTHETIC editorial angle',original_title:'Actual original headline.'}),skill_snapshot:JSON.stringify({files,sha256:sha(JSON.stringify(files)),file_sha256:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,sha(v)]))})};
  const artifact=JSON.stringify({script:'这张卡把三个问题摆在了一起。你会先看哪一项？',storyboard:[{narration:'这张卡把三个问题摆在了一起。',visual:'计划制作三项问题卡，素材待补'}],materials:'SYNTHETIC inventory: article exists, recording not acquired; rights pending.',limits:'SYNTHETIC no actual playback or production approval.',evidence:[{url:source.url,sha256:source.sha256}],...changes});
  return{root,job,sources:[source],milestone:{node,revision:1,artifact,artifact_hash:sha(artifact)}};
}
function report(node,{decision='approve',failed=[]}={}){
  const criteria=node==='source'?['source_identity','facts','materials','limits']:['grounding','clarity','specification','limits'];
  return{decision,reason:'SYNTHETIC current-stage assessment only.',checks:criteria.map(criterion=>({criterion,pass:!failed.includes(criterion),reason:failed.includes(criterion)?'SYNTHETIC unsupported factual assertion.':'SYNTHETIC text scope satisfied; production remains pending.',evidence:'SYNTHETIC'}))};
}
function successfulMock(f,result,inspect=()=>{}){let runs=0;globalThis.__textStageReviewMock=async options=>{runs++;inspect(options);fs.writeFileSync(options.output,JSON.stringify(result));return{exit_code:0,error_code:'CLI_COMPLETED',scope:'SYNTHETIC runner only'};};return()=>runs;}

test('script approval escapes the combined blocked loop while material gates remain pending',async t=>{
  const f=fixture(t),before=f.job.skill_snapshot;
  const runs=successfulMock(f,report('script'),options=>{
    assert.ok(options.prompt.includes('"machine_preflight":"blocked"'));assert.ok(options.prompt.includes('"text_preflight":"clear"'));assert.ok(options.prompt.includes('"production_ready":false'));
    assert.ok(options.prompt.includes('后期制作素材未到位只登记待办'));assert.ok(options.prompt.includes('本次本人已确认的阶段审核政策'));
  });
  const options={...f,root:path.join(f.root,'reviews')},result=await reviewText(options);
  assert.equal(result.decision,'approve');assert.equal(result.production_ready,false);assert.equal(result.review_stage_policy_version,REVIEW_STAGE_POLICY.version);assert.equal(result.receipt.review_stage_policy_sha256,REVIEW_STAGE_POLICY_SHA256);
  assert.equal(f.job.skill_snapshot,before);assert.equal((await reviewText(options)).decision,'approve');assert.equal(runs(),1,'cache reconciles the same invocation without another runner');
});

test('source inventory can pass with explicitly pending recording and rights',async t=>{
  const f=fixture(t,'source');successfulMock(f,report('source'),options=>{
    assert.ok(options.prompt.includes('materials检查素材清单及缺口是否如实记录'));assert.ok(options.prompt.includes('不能仅因二者不同就退回'));
  });
  const old=path.join(f.root,'reviews','SYNTHETIC-old-policy');fs.mkdirSync(old,{recursive:true});fs.writeFileSync(path.join(old,'output.json'),'SYNTHETIC immutable historical failure');
  const result=await reviewText({...f,root:path.join(f.root,'reviews')});assert.equal(result.decision,'approve');assert.equal(result.production_ready,false);
  assert.equal(fs.readFileSync(path.join(old,'output.json'),'utf8'),'SYNTHETIC immutable historical failure');
});

for(const node of ['source','script'])test(node+' review defers stale series/history and material-inventory mismatch to later production',async t=>{
 const f=fixture(t,node,{materials:'SYNTHETIC 最近三期记录含GLM，此处只是制作清单，素材尚未下载。'});f.job.series={choice_current:false,current:{job_id:f.job.id,mode_epoch:-1,template:'SYNTHETIC-DOWNSTREAM-TEMPLATE',history:{selected:[{title:'SYNTHETIC-DOWNSTREAM-HISTORY'}]}}};const before=JSON.stringify(f.job.series);
 successfulMock(f,report(node),options=>{assert.ok(options.prompt.includes('不以模板或片单差异、选择状态过期、素材文件尚不可用作为revise或pause理由'));assert.ok(options.prompt.includes('本次不注入系列快照作比较'));assert.ok(!options.prompt.includes('SYNTHETIC-DOWNSTREAM-TEMPLATE'));assert.ok(!options.prompt.includes('SYNTHETIC-DOWNSTREAM-HISTORY'));assert.ok(!options.prompt.includes('frozen-series-choice'));});
 const result=await reviewText({...f,root:path.join(f.root,'reviews')});assert.equal(result.decision,'approve');assert.equal(result.production_ready,false);assert.equal(JSON.stringify(f.job.series),before,'deferred series records remain immutable');
});

test('downstream production review still requires the exact current series binding',async t=>{const f=fixture(t,'promotion');f.job.series={choice_current:false,current:{job_id:f.job.id,mode_epoch:-1}};let runs=0;globalThis.__textStageReviewMock=async()=>{runs++;throw Error('SYNTHETIC must not run')};await assert.rejects(()=>reviewText({...f,root:path.join(f.root,'reviews')}),/series choice is stale/);assert.equal(runs,0);});

test('an old recovered review cannot start a changed-policy prompt without its exact completed receipt',async t=>{const f=fixture(t,'source');let runs=0;globalThis.__textStageReviewMock=async()=>{runs++;throw Error('SYNTHETIC must not repeat')};await assert.rejects(()=>reviewText({...f,root:path.join(f.root,'reviews'),reviewClaim:{review_token:'SYNTHETIC',invocation_id:'SYNTHETIC-unknown-old-invocation',reconciliation_only:true}}),/reconcile the original invocation without a new model call/);assert.equal(runs,0);});

test('misleading narration and missing visual plan still reject an injected approve',async t=>{
  const f=fixture(t,'script',{script:'据IT之家报道，它已经独立完成了全部任务。'});successfulMock(f,report('script'));
  await assert.rejects(()=>reviewText({...f,root:path.join(f.root,'reviews')}),/blocked text preflight/);
  const g=fixture(t,'script',{storyboard:[]});successfulMock(g,report('script'));
  await assert.rejects(()=>reviewText({...g,root:path.join(g.root,'reviews')}),/缺少逐段真实素材映射/);
});

test('unsupported factual claims remain a real content revise and cannot be approved with a failed check',async t=>{
  const f=fixture(t,'source');successfulMock(f,report('source',{decision:'revise',failed:['facts']}));
  assert.equal((await reviewText({...f,root:path.join(f.root,'reviews')})).decision,'revise');
  const g=fixture(t,'source');successfulMock(g,report('source',{decision:'approve',failed:['facts']}));
  await assert.rejects(()=>reviewText({...g,root:path.join(g.root,'reviews')}),/Inconsistent approval/);
});

test('rate-limit without output is an unfinished review, never a content revise or automatic retry',async t=>{
  const f=fixture(t,'source');let runs=0;globalThis.__textStageReviewMock=async()=>{runs++;return{exit_code:1,error_code:'CLI_NONZERO_EXIT',output_present:false,result_unknown:true,diagnostic:'SYNTHETIC 429 Too Many Requests'};};
  const options={...f,root:path.join(f.root,'reviews')};await assert.rejects(()=>reviewText(options),/Codex review CLI_NONZERO_EXIT/);
  const dirs=fs.readdirSync(options.root,{withFileTypes:true}).filter(x=>x.isDirectory());assert.equal(dirs.length,1);const reviewDir=path.join(options.root,dirs[0].name);
  assert.equal(fs.existsSync(path.join(reviewDir,'receipt.json')),false);assert.equal(fs.existsSync(path.join(reviewDir,'output.json')),false);assert.equal(fs.existsSync(path.join(reviewDir,'started.json')),true);
  await assert.rejects(()=>reviewText(options),/outcome unknown/);assert.equal(runs,1);
});

test('terminal429 review resumes once under a fresh counted claim and reuses its exact completed report',async t=>{
  const f=fixture(t,'source');Object.assign(f.job,{revision:1,mode_epoch:2,contract_hash:'c'.repeat(64),attempt:1,ai_calls:1,status:'awaiting_review',review_mode:'auto'});f.milestone.id='SYNTHETIC-source-milestone';
  const child=path.join(f.root,'SYNTHETIC-owned-child.mjs'),rejection=[{type:'thread.started'},{type:'turn.started'},{type:'item.completed',item:{type:'reasoning',text:'SYNTHETIC no tools'}},{type:'turn.failed',error:{message:'429 Too Many Requests; Retry-After: 0'}}].map(JSON.stringify).join('\n')+'\n';
  fs.writeFileSync(child,"import fs from 'node:fs';process.stdin.resume();process.stdin.on('end',()=>{if(process.argv[3]==='reject'){process.stdout.write("+JSON.stringify(rejection)+");process.exitCode=1}else{fs.writeFileSync(process.argv[2],"+JSON.stringify(JSON.stringify(report('source')))+");process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n')}});");
  let calls=0,failed;
  globalThis.__textStageReviewMock=options=>{calls++;return ownedSyntheticChild({...options,args:[child,options.output,calls===1?'reject':'complete'],timeoutMs:5000});};
  const options={...f,root:path.join(f.root,'reviews'),reviewClaim:{review_token:'SYNTHETIC-first-token',invocation_id:'SYNTHETIC-call-1'}};
  await assert.rejects(()=>reviewText(options),error=>{failed=error;return error.code==='CLI_RATE_LIMITED'&&error.cli_failure.confirmed_no_result===true&&error.cli_failure.result_unknown===false;});
  const original=path.join(options.root,fs.readdirSync(options.root).find(n=>fs.statSync(path.join(options.root,n)).isDirectory()),'cli-process/cli-process-exit.json'),originalBytes=fs.readFileSync(original),d=failed.cli_failure;
  assert.equal(d.execution_binding.ai_calls,1);assert.equal(d.execution_binding.review_invocation_id,'SYNTHETIC-call-1');assert.equal(d.execution_binding.source_file_sha256,f.sources[0].sha256);
  f.job.checkpoint=JSON.stringify({cli_failure:{...d,binding:{job_id:f.job.id,revision:1,mode_epoch:2,contract_hash:f.job.contract_hash,attempt:1,ai_calls:1,review_milestone_id:f.milestone.id,artifact_hash:f.milestone.artifact_hash,source_hash:sha(f.job.source_snapshot),skill_hash:sha(f.job.skill_snapshot)},next_retry_at:d.finished_at}});
  f.job.ai_calls=2;options.reviewClaim={review_token:'SYNTHETIC-second-token',invocation_id:'SYNTHETIC-call-2'};
  const result=await reviewText(options);assert.equal(result.decision,'approve');assert.equal(calls,2);assert.deepEqual(fs.readFileSync(original),originalBytes,'first process receipt remains immutable');
  const base=path.dirname(path.dirname(original)),recovered=path.join(base,'recovery-'+d.process_receipt_sha256,'ai-call-2');assert.equal(fs.existsSync(path.join(recovered,'receipt.json')),true);
  assert.equal((await reviewText(options)).decision,'approve');assert.equal(calls,2,'completed output is reconciled without a third model call');
});

for(const legacy of [false,true])test('a completed '+(legacy?'legacy bound retry':'bound original')+' review survives the fixed-outro preflight correction without another model call',async t=>{
 const tail={start:51,end:55,narration:'',visual:'沿用既有4秒片尾，保留原件。',sound:'无新增旁白；保留片尾原声。',asset_id:''},f=fixture(t,'script',{storyboard:[{start:0,end:51,narration:'这张卡把三个问题摆在了一起。',visual:'计划制作三项问题卡，素材待补'},tail]});
 Object.assign(f.job,{id:'job_22222222-2222-4222-8222-222222222222',owner_id:'SYNTHETIC-owner',revision:1,mode_epoch:2,contract_hash:'c'.repeat(64),ai_calls:5,attempt:4,reworks:0,updated_at:'2026-10-21T06:54:00.000Z',status:'awaiting_review',review_mode:'auto',lease_hash:null,lease_until:null});
 Object.assign(f.milestone,{id:'SYNTHETIC-script-node',artifact_version:1,mode_epoch:2,status:'ai_running',invocation_id:'SYNTHETIC-script-call-5',updated_at:f.job.updated_at,review_until:9999999999999,review_token_hash:'SYNTHETIC'});
 const child=path.join(f.root,'SYNTHETIC-completed-child.mjs');fs.writeFileSync(child,"import fs from 'node:fs';process.stdin.resume();process.stdin.on('end',()=>{if(process.argv[3]==='reject'){process.stdout.write(JSON.stringify({type:'turn.failed',error:{message:'429 Too Many Requests'}})+'\\n');process.exitCode=1}else{fs.writeFileSync(process.argv[2],"+JSON.stringify(JSON.stringify(report('script')))+");process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n')}});");
 let calls=0,oldPrompt,oldKey;globalThis.__textStageReviewMock=options=>{calls++;const marker='机器预检（不是语义批准，text_preflight与制作就绪独立）：',from=options.prompt.indexOf(marker)+marker.length,to=options.prompt.indexOf('\n不能用补报道署名',from),front=JSON.parse(options.prompt.slice(from,to)),old={...front,text_preflight:'blocked',text_problems:['segments[1] 缺文字或具体可见画面'],problems:[...front.problems,'segments[1] 缺文字或具体可见画面']};delete old.deferred_non_narrated_segments;delete old.storyboard_segments_version;oldPrompt=options.prompt.slice(0,from)+JSON.stringify(old)+options.prompt.slice(to);const choices=JSON.parse(fs.readFileSync(options.schemaPath)).properties.checks.items.properties.evidence.enum;oldKey=sha(oldPrompt+'\nreview-evidence-schema-v3\n'+JSON.stringify(choices));return ownedSyntheticChild({...options,prompt:oldPrompt,args:[child,options.output,'complete'],timeoutMs:5000});};
 const options={...f,root:path.join(f.root,'reviews'),reviewClaim:{review_token:'SYNTHETIC-token',invocation_id:f.milestone.invocation_id}};await reviewText(options);const original=path.join(options.root,fs.readdirSync(options.root).find(n=>fs.existsSync(path.join(options.root,n,'execution.json')))),execution=JSON.parse(fs.readFileSync(path.join(original,'execution.json')));execution.prompt_sha256=oldKey;
 let next=path.join(options.root,oldKey);
 if(legacy){const base=next,metadataDir=path.join(base,'cli-process'),failed=await ownedSyntheticChild({prompt:oldPrompt,output:path.join(base,'output.json'),metadataDir,args:[child,path.join(base,'output.json'),'reject'],timeoutMs:5000}),processSha=sha(fs.readFileSync(path.join(metadataDir,'cli-process-exit.json')));f.job.checkpoint=JSON.stringify({cli_failure:{stage:'script-review',prompt_sha256:sha(oldPrompt),process_receipt_sha256:processSha,event_log_sha256:failed.event_log_sha256,binding:{job_id:f.job.id,revision:1,mode_epoch:2,contract_hash:f.job.contract_hash,review_milestone_id:f.milestone.id,artifact_hash:f.milestone.artifact_hash,source_hash:sha(f.job.source_snapshot),skill_hash:sha(f.job.skill_snapshot),ai_calls:4}}});next=path.join(base,'recovery-'+processSha,'ai-call-5');delete execution.review_binding;}
 fs.mkdirSync(path.dirname(next),{recursive:true});fs.renameSync(original,next);fs.writeFileSync(path.join(next,'prompt.txt'),oldPrompt);fs.writeFileSync(path.join(next,'execution.json'),JSON.stringify(execution));fs.unlinkSync(path.join(next,'receipt.json'));const raw=fs.readFileSync(path.join(next,'output.json')),exit=fs.readFileSync(path.join(next,'cli-process/cli-process-exit.json'));
 f.job.status='paused';f.job.error='Cannot approve script with blocked text preflight: segments[1] 缺文字或具体可见画面';Object.assign(f.milestone,{status:'paused',review_until:null,review_token_hash:null,report:JSON.stringify({decision:'pause',reason:f.job.error,operation_id:'SYNTHETIC-failure'})});delete f.job.owner_id;delete f.job.lease_hash;delete f.milestone.review_token_hash;assert.equal(Object.hasOwn(f.job,'owner_id'),false);assert.equal(Object.hasOwn(f.job,'lease_hash'),false);assert.equal(Object.hasOwn(f.milestone,'review_token_hash'),false);f.job.milestones=[f.milestone];f.job.reviews=[{revision:1,content_hash:f.milestone.artifact_hash,decision:'ai_review_error',reviewer:'codex-cli',note:f.milestone.report}];globalThis.__textStageReviewMock=()=>{throw Error('SYNTHETIC existing review must not call the model');};
 const result=await reviewText({...options,reconcileOutputOnly:true});assert.equal(result.decision,'approve');assert.equal(result.completed_output_recovery.new_model_calls,0);assert.equal(result.completed_output_recovery.invocation_id,f.milestone.invocation_id);assert.equal(calls,1);assert.deepEqual(fs.readFileSync(path.join(next,'output.json')),raw);assert.deepEqual(fs.readFileSync(path.join(next,'cli-process/cli-process-exit.json')),exit);
 f.job.status='awaiting_review';f.job.error=null;f.milestone.status='ai_running';f.job.reviews.push({revision:1,content_hash:f.milestone.artifact_hash,decision:'ai_review_output_reconciliation_v1',reviewer:'verified-owned-cli-output',note:JSON.stringify(result.completed_output_recovery)});const resumed=await reviewText({...options,reviewClaim:{invocation_id:f.milestone.invocation_id,reconciliation_only:true}});assert.equal(resumed.decision,'approve');assert.equal(calls,1,'an unknown return response still reconciles the same output after lease recovery');
 fs.appendFileSync(path.join(next,'output.json'),' ');await assert.rejects(()=>reviewText({...options,reconcileOutputOnly:true}),/PROCESS_NOT_PROVEN|FROZEN_INPUT_CHANGED/);assert.equal(calls,1);
});

for(const kind of ['source','script'])test(kind+' complete original turn survives owned-parent interruption without inventing an exit code or calling the model again',async t=>{
 const f=fixture(t,kind);Object.assign(f.job,{id:'job_aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',status:'awaiting_review',review_mode:'auto',revision:1,mode_epoch:0,contract_hash:'c'.repeat(64),attempt:1,ai_calls:1,reworks:0});Object.assign(f.milestone,{id:'ms-'+kind,status:'ai_running',mode_epoch:0,updated_at:new Date(Date.now()-30000).toISOString()});f.milestone.invocation_id='review-'+sha(f.milestone.id+':'+f.milestone.artifact_hash+':0')+'-call-1';
 const options={...f,root:path.join(f.root,'reviews'),reviewClaim:{invocation_id:f.milestone.invocation_id}},raw=JSON.stringify(report(kind));let calls=0,dir,ended;
 globalThis.__textStageReviewMock=async o=>{calls++;dir=path.dirname(o.output);const at=Date.now(),start=new Date(at-20000).toISOString();ended=at-10000;fs.mkdirSync(o.metadataDir,{recursive:true});fs.writeFileSync(o.output,raw);fs.writeFileSync(path.join(o.metadataDir,'cli-process-started.json'),JSON.stringify({started_at:start,scope:'owned-cli-child-tree',model:'gpt-5.6-sol',prompt_sha256:sha(o.prompt),image_sha256:[]}));fs.writeFileSync(path.join(o.metadataDir,'cli-owned-child.json'),JSON.stringify({pid:2147483598,parent_pid:2147483597,started_at:start,scope:'owned-cli-child-tree'}));const events=[{type:'thread.started'},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:raw}},{type:'turn.completed'}].map(JSON.stringify).join('\n')+'\n';fs.writeFileSync(path.join(o.metadataDir,'cli-events.log'),events);fs.utimesSync(o.output,new Date(ended-1000),new Date(ended-1000));fs.utimesSync(path.join(o.metadataDir,'cli-events.log'),new Date(ended-1000),new Date(ended-1000));const parent=path.join(f.root,'foreground-processes','SYNTHETIC');fs.mkdirSync(parent,{recursive:true});const p={pid:2147483597,periodic_run_id:'2026-10-22T00-00-00.000Z-11111111-1111-4111-8111-111111111111',started_at:new Date(at-40000).toISOString(),deadline_ms:ended-1000,scope:'owned-child-tree'};fs.writeFileSync(path.join(parent,'process-started.json'),JSON.stringify(p));fs.writeFileSync(path.join(parent,'process-exit.json'),JSON.stringify({...p,finished_at:new Date(ended).toISOString(),timed_out:true,result_unknown:true,exit_code:1}));throw Error('SYNTHETIC parent stopped after the completed turn')};
 await assert.rejects(()=>reviewText(options),/parent stopped/);assert.equal(calls,1);assert.equal(fs.existsSync(path.join(dir,'receipt.json')),false);
 options.reviewClaim.reconciliation_only=true;const r=await reviewText(options);assert.equal(r.decision,'approve');assert.equal(r.original_invocation_reconciled,true);assert.equal(r.receipt.exit_code,null);assert.equal(r.receipt.process_exit_code,null);assert.equal(r.receipt.interrupted_review_reconciliation.parent_exit.result_unknown,true);assert.equal(fs.existsSync(path.join(dir,'cli-process/cli-process-exit.json')),false);assert.equal(fs.existsSync(path.join(dir,'execution.json')),false);assert.equal(validTerminalReviewReceipt(r.receipt,f.job,f.milestone,sha(f.job.source_snapshot),sha(f.job.skill_snapshot)),true);assert.equal(validTerminalReviewReceipt({...r.receipt,exit_code:0},f.job,f.milestone,sha(f.job.source_snapshot),sha(f.job.skill_snapshot)),false);assert.equal(calls,1);
 f.milestone.updated_at=new Date().toISOString();assert.equal((await reviewText(options)).decision,'approve');assert.equal(calls,1);
 const eventFile=path.join(dir,'cli-process/cli-events.log'),prior=fs.readFileSync(eventFile);fs.writeFileSync(eventFile,prior.toString().replace(/\{"type":"turn.completed"\}\n$/,''));await assert.rejects(()=>reviewText(options),/TERMINAL_OUTPUT_UNPROVEN/);assert.equal(calls,1);fs.writeFileSync(eventFile,prior);fs.utimesSync(eventFile,new Date(ended-1000),new Date(ended-1000));fs.appendFileSync(path.join(dir,'output.json'),' ');await assert.rejects(()=>reviewText(options),/Cached receipt mismatch/);assert.equal(calls,1);
});

test('direct review with insufficient inherited time starts no CLI or immutable invocation marker',async t=>{const f=fixture(t,'source');let calls=0;globalThis.__textStageReviewMock=async()=>{calls++;throw Error('No CLI')};const root=path.join(f.root,'reviews');await assert.rejects(()=>reviewText({...f,root,foreground_deadline_ms:Date.now()+59000}),/WORKFLOW_STAGE_BUDGET_DEFERRED/);assert.equal(calls,0);assert.ok(fs.readdirSync(root).every(name=>!fs.existsSync(path.join(root,name,'started.json'))));});
