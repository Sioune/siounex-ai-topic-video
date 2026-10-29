import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{safeFailure,writePeriodicResult}from'../scripts/periodic-diagnostics.mjs';
import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {safeBusinessFailure,writePeriodicFailure,writePeriodicJobResult,readPeriodicJobResults} from '../scripts/periodic-diagnostics.mjs';
import {writePeriodicWorkstationEvent,readPeriodicWorkstationEvents,safeWorkstationSnapshot,writePeriodicWorkstationSnapshot,readPeriodicWorkstationPhase} from '../scripts/periodic-diagnostics.mjs';
import {createProductionWorkstations,PRODUCTION_STATIONS} from '../scripts/production-workstations.mjs';
test('live station projection includes a waiting job without treating it as running or clearing the held station',async t=>{
 const {id}=runFixture(t),states=[],stations=createProductionWorkstations({onState:state=>{states.push(state);writePeriodicWorkstationSnapshot(id,{...state,token:'DO_NOT_KEEP'});}});let release;const held=new Promise(resolve=>{release=resolve;});
 const a=stations.run('voice','job_11111111-1111-4111-8111-111111111111',()=>held),b=stations.run('voice','job_22222222-2222-4222-8222-222222222222',()=>42);
 assert.match(readPeriodicWorkstationPhase(id),/配音.*排队 1 项/);assert.equal(states.at(-1).active_count,1);assert.equal(states.at(-1).waiting_count,1);assert.ok(!readPeriodicWorkstationPhase(id).includes('DO_NOT_KEEP'));
 await stations.run('archive','job_33333333-3333-4333-8333-333333333333',()=>{});assert.match(readPeriodicWorkstationPhase(id),/配音.*排队 1 项/);
 release();await Promise.all([a,b]);await stations.drain();assert.equal(readPeriodicWorkstationPhase(id),'工位已空闲；核对后续任务');
});
test('the known source-range validation code is preserved without recording the raw failure body',()=>{
 assert.deepEqual(safeFailure(Object.assign(Error('AUTO_MATERIAL_ACTUAL_VIDEO_RANGE_REQUIRED secret'),{code:'AUTO_MATERIAL_ACTUAL_VIDEO_RANGE_REQUIRED'})),{code:'AUTO_MATERIAL_ACTUAL_VIDEO_RANGE_REQUIRED'});
});
test('desktop CLI identity and configuration failures survive diagnostics without leaking details',()=>{for(const code of ['NATIVE_PRODUCTION_CLI_DESCRIPTOR_INVALID','NATIVE_PRODUCTION_CLI_MANIFEST_INVALID','NATIVE_PRODUCTION_CLI_SCOPE_INVALID','NATIVE_PRODUCTION_CLI_IDENTITY_CHANGED','NATIVE_PRODUCTION_CLI_UNAVAILABLE']){assert.deepEqual(safeFailure(Object.assign(Error('private detail'),{code})),{code});assert.deepEqual(safeBusinessFailure({status:'scheduled-pass-failed',failure:{code,private:'do not record'}}),{code});}});
test('six real workstations include copy while legacy five-station observations remain unchanged',async t=>{
 const {id,dir}=runFixture(t),stations=createProductionWorkstations({onEvent:e=>writePeriodicWorkstationEvent(id,e)});let release;const held=new Promise(resolve=>{release=resolve});
 const work=PRODUCTION_STATIONS.map((station,n)=>stations.run(station,'job_'+String(n+1).padStart(8,'0')+'-0000-4000-8000-'+String(n+1).padStart(12,'0'),()=>held));
 await Promise.resolve();const current=stations.snapshot();assert.equal(current.active_count,PRODUCTION_STATIONS.length);assert.equal(current.max_active,PRODUCTION_STATIONS.length);assert.equal(current.stations.copy.capacity,1);assert.deepEqual(safeWorkstationSnapshot(current),current);
 writePeriodicResult(id,{phase:'returned',workstations:current});const saved=JSON.parse(fs.readFileSync(path.join(dir,'autonomous-pass-result.json')));assert.deepEqual(saved.workstations,current);assert.equal(saved.workstation_events.filter(e=>e.station==='copy').length,1);
 const legacy=structuredClone(current);delete legacy.stations.copy;legacy.active_count--;legacy.max_active--;const bytes=JSON.stringify(legacy);assert.deepEqual(safeWorkstationSnapshot(legacy),legacy);assert.equal(Object.hasOwn(safeWorkstationSnapshot(legacy).stations,'copy'),false);assert.equal(JSON.stringify(legacy),bytes);assert.equal(safeWorkstationSnapshot({...legacy,max_active:PRODUCTION_STATIONS.length}),null);assert.equal(safeWorkstationSnapshot({...current,stations:{...current.stations,copy:null}}),null);
 release();await Promise.all(work);assert.equal((await stations.drain()).active_count,0);
});
test('failure evidence has stable safe codes and never copies response bodies, commands or bearer',()=>{
 const secret='token_DO_NOT_RECORD';assert.deepEqual(safeFailure(Error('Executor HTTP 403: '+secret)),{code:'SITE_HTTP_403'});assert.deepEqual(safeFailure(Error('Unexpected token '+secret)),{code:'INPUT_OR_RESPONSE_JSON_INVALID'});assert.deepEqual(safeFailure(Error(secret)),{code:'UNCLASSIFIED_FAILURE'});assert.deepEqual(safeFailure(Error('Saved prompt mismatch')), {code:'IMMUTABLE_CALL_RECONCILIATION_REQUIRED'});
});
test('the narration timing failure remains actionable through periodic diagnostics without retaining raw error details',()=>{
 const code='AUTO_MATERIAL_NARRATION_TIMING_CHANGED',error=Object.assign(Error(code+' SYNTHETIC_DO_NOT_RECORD'),{code});assert.deepEqual(safeFailure(error),{code});assert.deepEqual(safeBusinessFailure({status:'scheduled-pass-failed',failure:{code,phase:'native-preparation',raw:'SYNTHETIC_DO_NOT_RECORD'}}),{code,phase:'native-preparation'});
});
test('local clone render checkpoints retain their specific failure without exposing filesystem details',()=>{
 for(const code of ['AUTOMATIC_CLONE_LOCAL_RESULT_UNKNOWN','AUTOMATIC_CLONE_LOCAL_RECONCILIATION_REQUIRED','AUTOMATIC_CLONE_RENDER_DEFERRED']){
  assert.deepEqual(safeFailure(Error(code+' SYNTHETIC_PRIVATE_PATH token_DO_NOT_RECORD')),{code});
  assert.deepEqual(safeBusinessFailure({status:'scheduled-pass-failed',failure:{code,raw:'SYNTHETIC_PRIVATE_PATH'}}),{code});
 }
});
test('caption failures and bounded producer phases survive projection while raw details remain private',t=>{
 const {id}=runFixture(t),code='PRIVATE_CAPTION_PAGINATION_UNBREAKABLE_WORD',phase='ordinary-audio-and-editable-project';assert.deepEqual(safeFailure(Error(code+' SYNTHETIC_DO_NOT_RECORD')),{code});writePeriodicJobResult(id,{phase:'job-returned',execution_phase:phase,failure:{code,phase,message:'SYNTHETIC_DO_NOT_RECORD'},error:'Bearer SYNTHETIC_DO_NOT_RECORD'});const [event]=readPeriodicJobResults(id);assert.equal(event.execution_phase,phase);assert.deepEqual(event.failure,{code,phase});assert.equal(JSON.stringify(event).includes('SYNTHETIC_DO_NOT_RECORD'),false);
 writePeriodicJobResult(id,{phase:'job-returned',execution_phase:'SYNTHETIC_DO_NOT_RECORD',failure:{code,phase:'SYNTHETIC_DO_NOT_RECORD'}});const unsafe=readPeriodicJobResults(id).find(e=>e.event_id!==event.event_id);assert.equal(unsafe.execution_phase,undefined);assert.deepEqual(unsafe.failure,{code});
});

test('every normalized failure remains a safe child failure code, including CHILD_WORKFLOW_FAILED',()=>{
 for(const text of ['Workflow stopped; inspect immutable receipts','Unexpected token secret','Input closed secret','Saved prompt mismatch','Frozen material changed','Job is not claimable','Codex CLI failed','全文不符','Executor HTTP 403: secret','CLI_RATE_LIMITED','secret']){const safe=safeFailure(Error(text));assert.deepEqual(safeFailure(safe),safe);assert.deepEqual(safeBusinessFailure({status:'scheduled-pass-failed',failure:{...safe,phase:'site-queue-pass',message:'DO_NOT_KEEP'}}),{...safe,phase:'site-queue-pass'});}
 assert.deepEqual(safeBusinessFailure({status:'scheduled-pass-failed',failure:{code:'CHILD_WORKFLOW_FAILED',phase:'site-queue-pass'}}),{code:'CHILD_WORKFLOW_FAILED',phase:'site-queue-pass'});assert.equal(safeBusinessFailure({status:'scheduled-pass-failed',failure:{code:'UNKNOWN_RAW_SECRET'}}),null);
});

function runFixture(t){const id='2026-10-21T00-00-00.000Z-'+randomUUID(),dir=path.resolve('.sites-runtime/periodic-runs',id);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return{id,dir};}
test('workstation history proves overlapping stages with safe immutable identity and no payloads',async t=>{
 const {id,dir}=runFixture(t),a='job_11111111-1111-4111-8111-111111111111',b='job_22222222-2222-4222-8222-222222222222',secret='SYNTHETIC_DO_NOT_RECORD';
 const stations=createProductionWorkstations({onEvent:e=>writePeriodicWorkstationEvent(id,{...e,token:secret})});let release;
 const voice=stations.run('voice',a,()=>new Promise(resolve=>{release=resolve}));await Promise.resolve();
 await stations.run('archive',b,async()=>assert.equal(stations.snapshot().stations.voice.active,a));release();await voice;const snapshot=await stations.drain();
 assert.equal(snapshot.observed_parallel,true);assert.deepEqual(safeWorkstationSnapshot({...snapshot,token:secret}),snapshot);
 const events=readPeriodicWorkstationEvents(id);assert.equal(events.length,4);assert.equal(JSON.stringify(events).includes(secret),false);
 writePeriodicResult(id,{phase:'returned',workstations:{...snapshot,token:secret}});const saved=JSON.parse(fs.readFileSync(path.join(dir,'autonomous-pass-result.json')));assert.deepEqual(saved.workstations,snapshot);assert.equal(saved.workstation_events.length,4);assert.equal(JSON.stringify(saved).includes(secret),false);
 assert.equal(writePeriodicWorkstationEvent(id,{event:'started',station:secret,job_id:a,time:Date.now()}),null);
 assert.equal(safeWorkstationSnapshot({...snapshot,stations:{...snapshot.stations,voice:{...snapshot.stations.voice,active:secret}}}),null);
 const first=path.join(dir,'workstation-events',fs.readdirSync(path.join(dir,'workstation-events'))[0]),raw=JSON.parse(fs.readFileSync(first));raw.token=secret;fs.writeFileSync(first,JSON.stringify(raw));assert.throws(()=>readPeriodicWorkstationEvents(id),/Changed workstation event/);
});
test('immutable per-job failures survive later selection and final child failure instead of being overwritten',t=>{
 const {id,dir}=runFixture(t),a='job_11111111-1111-4111-8111-111111111111',b='job_22222222-2222-4222-8222-222222222222';writePeriodicResult(id,{phase:'selected',job_id:a,revision:1,mode_epoch:2,kind:'native-preparation-handoff'});const first=writePeriodicJobResult(id,{phase:'job-failed',job_id:a,queue_id:'native_prep_'+'a'.repeat(64),status:'private-review-result-unknown',failure:{code:'AUTO_MATERIAL_RESULT_RECONCILIATION_REQUIRED',phase:'native-preparation'},claim_state:'unknown',generation_state:'unknown',reconciliation_required:true}),files=new Map(fs.readdirSync(path.join(dir,'job-events')).map(n=>[n,createHash('sha256').update(fs.readFileSync(path.join(dir,'job-events',n))).digest('hex')]));writePeriodicResult(id,{phase:'selected',job_id:b,revision:2,mode_epoch:2,kind:'review'});const failure=writePeriodicFailure(id,Error('Workflow stopped; DO_NOT_RECORD_RAW_ERROR'));
 assert.deepEqual(failure,{code:'CHILD_WORKFLOW_FAILED',phase:'site-queue-pass'});const snapshot=JSON.parse(fs.readFileSync(path.join(dir,'autonomous-pass-result.json')));assert.equal(snapshot.job_id,b);assert.equal(snapshot.failure.code,'CHILD_WORKFLOW_FAILED');assert.equal(snapshot.job_events.length,4);assert.equal(snapshot.job_events.find(e=>e.event_id===first.event_id).failure.code,'AUTO_MATERIAL_RESULT_RECONCILIATION_REQUIRED');assert.equal(snapshot.job_events.find(e=>e.event_id===first.event_id).claimed,undefined,'unknown is not relabeled as an unclaimed call');assert.equal(snapshot.job_events.find(e=>e.event_id===first.event_id).generation_state,'unknown');for(const[n,h]of files)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir,'job-events',n))).digest('hex'),h);assert.ok(!JSON.stringify(snapshot).includes('DO_NOT_RECORD_RAW_ERROR'));
});
test('job journal keeps only bounded identity, enum, boolean and safe failure fields, never raw result or credentials',t=>{
 const {id}=runFixture(t),secret='SYNTHETIC_TOKEN_DO_NOT_RECORD';writePeriodicJobResult(id,{job_id:'job_11111111-1111-4111-8111-111111111111',phase:'job-returned',status:'private-review-result-unknown',kind:'native-preparation-handoff',failure:{code:'CHILD_WORKFLOW_FAILED',phase:'site-queue-pass',message:secret,result:{token:secret}},token:secret,stderr:secret,command:secret,reason:secret,raw_error:secret,claimed:'unknown',generation_state:'unknown',quality_approved:true,publication_authorized:true,new_paid_calls:9});const [e]=readPeriodicJobResults(id);assert.equal(e.claimed,undefined);assert.equal(e.generation_state,'unknown');assert.equal(e.quality_approved,false);assert.equal(e.publication_authorized,false);assert.equal(e.new_paid_calls,0);assert.ok(!JSON.stringify(e).includes(secret));assert.deepEqual(e.failure,{code:'CHILD_WORKFLOW_FAILED',phase:'site-queue-pass'});
});
test('job events have unique exclusive files and modified event bytes are never trusted as prior evidence',t=>{const {id,dir}=runFixture(t);for(let n=0;n<20;n++)writePeriodicJobResult(id,{job_id:'job_11111111-1111-4111-8111-111111111111',phase:'job-returned',revision:n,status:'local-review-returned'});const events=readPeriodicJobResults(id);assert.equal(new Set(events.map(e=>e.event_id)).size,20);assert.equal(fs.readdirSync(path.join(dir,'job-events')).length,20);const file=path.join(dir,'job-events',fs.readdirSync(path.join(dir,'job-events'))[0]),v=JSON.parse(fs.readFileSync(file));v.stderr='SYNTHETIC_UNTRUSTED';fs.writeFileSync(file,JSON.stringify(v));assert.throws(()=>readPeriodicJobResults(id),/Changed periodic diagnostic/);});

test('promotion completion and confirmed 429 return statuses survive safe per-job projection',t=>{
 const {id}=runFixture(t),package_id='promo_11111111-1111-4111-8111-111111111111';
 for(const status of ['ready','promotion-technical-retry-pending','promotion-result-unknown','promotion-invalid-result','promotion-original-session-pending'])writePeriodicJobResult(id,{phase:'job-returned',kind:'promotion-package',status,package_id,confirmed_no_result:status==='promotion-technical-retry-pending',result_unknown:status==='promotion-result-unknown',http_status:429,next_retry_at:'2026-10-22T00:00:00.000Z',failure:{code:'CLI_RATE_LIMITED',phase:'promotion-generation',message:'SYNTHETIC_DO_NOT_RECORD'},token:'SYNTHETIC_DO_NOT_RECORD'});
 const events=readPeriodicJobResults(id);assert.equal(events.length,5);for(const e of events){assert.ok(e.status);assert.equal(e.package_id,package_id);assert.equal(e.http_status,429);assert.deepEqual(e.failure,{code:'CLI_RATE_LIMITED',phase:'promotion-generation'});assert.equal(JSON.stringify(e).includes('SYNTHETIC_DO_NOT_RECORD'),false);}const deferred=events.find(e=>e.status==='promotion-technical-retry-pending');assert.equal(deferred.confirmed_no_result,true);assert.equal(deferred.result_unknown,false);assert.equal(deferred.next_retry_at,'2026-10-22T00:00:00.000Z');
});
test('correlation is bounded to owned run directory and successful business failure changes scheduler exit status',()=>{
 const id='2000-01-01T00-00-00.000Z-00000000-0000-0000-0000-000000000001';writePeriodicResult(id,{phase:'failed',failure:{code:'CLI_FAILED_OR_DEADLINE'}});const r=JSON.parse(fs.readFileSync('.sites-runtime/periodic-runs/'+id+'/autonomous-pass-result.json'));assert.equal(r.run_id,id);assert.equal(r.failure.code,'CLI_FAILED_OR_DEADLINE');assert.throws(()=>writePeriodicResult('../../escape',{}));const wrapper=fs.readFileSync('scripts/native-scheduled-worker.mjs','utf8');assert.ok(wrapper.includes('process.exitCode=2'));assert.ok(wrapper.includes('runId:run_id'));assert.ok(fs.readFileSync('scripts/bounded-workflow-child.mjs','utf8').includes('periodic_run_id:runId'));
});

test('historical six-station snapshots remain readable without inventing narration',()=>{
 const stations=createProductionWorkstations();const current=stations.snapshot();delete current.stations.narration;
 assert.deepEqual(safeWorkstationSnapshot(current),current);assert.equal(Object.hasOwn(safeWorkstationSnapshot(current).stations,'narration'),false);
 delete current.stations.copy;assert.deepEqual(safeWorkstationSnapshot(current),current);
});
