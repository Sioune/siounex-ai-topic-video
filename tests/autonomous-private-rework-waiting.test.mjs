import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {readPeriodicJobResults,writePeriodicFailure} from '../scripts/periodic-diagnostics.mjs';
// Synthetic queue receipts only: no Site mutations, speech, media or uploads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {autonomousPass} from '../scripts/production-autonomous-pass.mjs';
import {siteQueuePass} from '../scripts/site-queue-pass.mjs';

const id='job_aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const queue='native_prep_'+'a'.repeat(64);
const base={id:'local_review_video_'+'b'.repeat(64),artifact_hash:'c'.repeat(64),artifact_version:1};
const handoff=(extra={})=>({job_id:id,queue_id:queue,binding:{scope:'private-video'},base_video:base,status:'blocked',checkpoint:{note:'SYNTHETIC new rework queue',artifacts:[]},missing:[{code:'material:shot-2',detail:'SYNTHETIC current source required'}],...extra});
const returned=h=>({job_id:h.job_id,queue_id:h.queue_id,status:'local-review-returned',local_draft_id:'SYNTHETIC confirmed new return',claimed:true,generation_started:true,video_generated:true});

test('a fresh exact rework base resumes without a producer receipt in the new queue',async()=>{
 for(const status of ['queued','blocked','completed']){
  const h=handoff({status}),calls=[],resumed=[];
  const r=await autonomousPass({execute:true},{call:async b=>{calls.push(b);return b.action==='dispatch_next'?{job:null,native_preparation_waiting:[h]}:{job:{id,is_test:0}};},continuePrivate:async s=>{resumed.push(s);assert.equal(s.native_preparation,h);return returned(h);}});
  assert.equal(resumed.length,1);assert.deepEqual(calls.map(b=>b.action),['dispatch_next','read','dispatch_next']);assert.equal(r.productions[0].status,'local-review-returned');assert.equal(r.handoffs.length,0);assert.equal(r.status,'private-review-production-returned');
 }
});

test('actual scheduled queue entry forwards a receiptless known visual failure to read-only proof before any claim',async()=>{
 const message='Prepared actual frame count differs; never hand off a truncated plane',h=handoff({base_video:null,lease_until:null,missing:[{code:'local-production:frame-count',detail:message}]}),calls=[];let resumed=0;
 const result=await siteQueuePass({execute:true},{research:async()=>({status:'research-idle'}),production:c=>autonomousPass(c,{call:async b=>{calls.push(b.action);return b.action==='dispatch_next'?{job:null,native_preparation_waiting:[h]}:{job:{id,is_test:0}}},continuePrivate:async s=>{resumed++;assert.equal(s.native_preparation,h);assert.deepEqual(calls,['dispatch_next','read']);return returned(h)}})});
 assert.equal(resumed,1);assert.equal(result.productions[0].status,'local-review-returned');assert.deepEqual(calls,['dispatch_next','read','dispatch_next']);
 for(const patch of [{status:'claimed',lease_until:1},{lease_until:Date.now()+10000},{status:'result-unknown'},{missing:[{code:'local-production:unknown',detail:'SYNTHETIC arbitrary failure'}]}]){let runs=0;const observed=await autonomousPass({execute:true},{call:async()=>({job:null,native_preparation_waiting:[{...h,...patch}]}),continuePrivate:async()=>{runs++;throw Error('No active or unknown recovery')}});assert.equal(runs,0);assert.equal(observed.claimed,false);}
});
test('a known pre-caption display failure reaches its read-only audio proof while arbitrary or active failures remain observations',async()=>{
 const h=handoff({base_video:null,lease_until:null,version:3,executor:'finite-local-private-review-v1',invocation_id:'private-review-11111111-1111-4111-8111-111111111111',missing:[{code:'local-production:PRIVATE_CAPTION_PAGINATION_UNBREAKABLE_WORD',detail:'阶段 ordinary-audio-and-editable-project：PRIVATE_CAPTION_PAGINATION_UNBREAKABLE_WORD'}]});let calls=0;const result=await autonomousPass({execute:true},{call:async b=>b.action==='dispatch_next'?{job:null,native_preparation_waiting:[h]}:{job:{id,is_test:0}},continuePrivate:async selection=>{calls++;assert.equal(selection.native_preparation,h);return returned(h);}});assert.equal(calls,1);assert.equal(result.productions[0].status,'local-review-returned');for(const patch of [{lease_until:Date.now()+10000},{executor:'unknown-producer'},{missing:[{code:'local-production:unknown',detail:'ordinary-audio-and-editable-project'}]},{checkpoint:{artifacts:[{kind:'local-file',purpose:'render-receipt'}]}}]){let starts=0;await autonomousPass({execute:true},{call:async()=>({job:null,native_preparation_waiting:[{...h,...patch}]}),continuePrivate:async()=>{starts++;throw Error('Not a safe caption proof candidate');}});assert.equal(starts,0);}
});

test('an exact retained workstation wait is only a selection hint and still requires a current unleased private queue',async()=>{
 const h=handoff({base_video:null,lease_until:null,version:3,executor:'finite-local-private-review-v1',invocation_id:'private-review-11111111-1111-4111-8111-111111111111',missing:[{code:'production-station-budget-deferred',detail:'current_wait_sha256='+'e'.repeat(64)}],checkpoint:{artifacts:[{kind:'local-file',purpose:'render-receipt',file:'SYNTHETIC/workstation-wait-'+'e'.repeat(64)+'.json',sha256:'e'.repeat(64),size_bytes:128}]}});
 let resumed=0;const result=await autonomousPass({execute:true},{call:async b=>b.action==='dispatch_next'?{job:null,native_preparation_waiting:[h]}:{job:{id,is_test:0}},continuePrivate:async(s,{workstations})=>{resumed++;assert.equal(s.native_preparation,h);assert.equal(typeof workstations.run,'function');return returned(h);}});
 assert.equal(resumed,1);assert.equal(result.productions[0].status,'local-review-returned');
 for(const patch of [{lease_until:Date.now()+10000},{missing:[{code:'different-unknown-result'}]},{executor:'unbound-executor'},{checkpoint:{artifacts:[]}}]){let calls=0;await autonomousPass({execute:true},{call:async()=>({job:null,native_preparation_waiting:[{...h,...patch}]}),continuePrivate:async()=>{calls++;throw Error('A hint cannot bypass the original scope and proof validation');}});assert.equal(calls,0);}
});

test('active, expired-claimed, unknown, unbound and receiptless ordinary queues remain observations',async()=>{
 const waiting=[handoff({status:'claimed',lease_until:Date.now()+10000}),handoff({queue_id:'native_prep_'+'d'.repeat(64),status:'claimed',lease_until:1,base_video:null}),handoff({queue_id:'native_prep_'+'e'.repeat(64),status:'result-unknown'}),handoff({queue_id:'native_prep_'+'f'.repeat(64),base_video:null}),handoff({queue_id:'native_prep_'+'1'.repeat(64),base_video:{...base,artifact_hash:'invalid'}}),handoff({queue_id:'native_prep_'+'2'.repeat(64),binding:{scope:'preparation'}})];
 let runs=0;const calls=[];const r=await autonomousPass({execute:true},{call:async b=>{calls.push(b);return{job:null,native_preparation_waiting:waiting};},continuePrivate:async()=>{runs++;throw Error('Must not take over an active/unknown session');}});
 assert.equal(runs,0);assert.deepEqual(calls.map(b=>b.action),['dispatch_next']);assert.equal(r.handoffs.length,waiting.length);assert.equal(r.claimed,false);
});

test('a prior real producer receipt still reconciles and reports the latest persisted missing materials',async()=>{
 const h=handoff({base_video:null,checkpoint:{artifacts:[{file:'.sites-runtime/authorized-inputs/SYNTHETIC/native-production/producer-receipt.json'}]}}),missing=[{code:'material:shot-3',detail:'SYNTHETIC newer actual missing source'}],next={...h,version:4,missing,checkpoint:{artifacts:h.checkpoint.artifacts,note:'SYNTHETIC checked this scan'}};
 const r=await autonomousPass({execute:true},{call:async b=>b.action==='dispatch_next'?{job:null,native_preparation_waiting:[h]}:{job:{id,is_test:0}},continuePrivate:async()=>({job_id:id,queue_id:queue,status:'private-review-materials-blocked',claimed:false,generation_started:false,handoff:next})});
 assert.deepEqual(r.handoffs,[next]);assert.deepEqual(r.missing,missing);assert.equal(r.handoffs[0].version,4);
});

test('an uncertain continuation is exposed as unknown and never retried when the waiting snapshot repeats it',async()=>{
 const h=handoff(),other=handoff({job_id:'job_bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',queue_id:'native_prep_'+'d'.repeat(64)}),calls=[],runs=[];let selected=false;
 const r=await autonomousPass({execute:true},{call:async b=>{calls.push(b);if(b.action==='read')return{job:{id:b.id,is_test:0}};if(!selected){selected=true;return{job:{id,is_test:0},kind:'native-preparation-handoff',native_preparation:h};}return{job:null,native_preparation_waiting:[h,other]};},continuePrivate:async s=>{runs.push(s.job.id);return s.job.id===id?{job_id:id,queue_id:queue,status:'private-review-upload-result-unknown',claimed:false,generation_started:false}:returned(other);}});
 assert.deepEqual(runs,[id,other.job_id]);assert.equal(calls.filter(b=>b.action==='read').length,1);assert.equal(r.handoffs.length,1);assert.equal(r.handoffs[0].status,'result-unknown');assert.equal(r.handoffs[0].waiting_for,'original-session-receipt-reconciliation');assert.equal(r.handoffs[0].persisted,false);
});

test('uncertainty first reached through waiting queues retains its reconciliation state',async()=>{
 const h=handoff();const r=await autonomousPass({execute:true},{call:async b=>b.action==='dispatch_next'?{job:null,native_preparation_waiting:[h]}:{job:{id,is_test:0}},continuePrivate:async()=>({job_id:id,queue_id:queue,status:'private-review-result-unknown',claimed:true,generation_started:false})});
 assert.equal(r.handoffs[0].status,'result-unknown');assert.equal(r.handoffs[0].persisted,false);assert.deepEqual(r.blocked,[{job_id:id,reason:'private-review-result-unknown',claimed:true}]);
});

test('fresh read identity and protected/test exclusions are checked before waiting continuation',async()=>{
 for(const actual of [{id:'different-job',is_test:0},{id,is_test:1}]){
  let runs=0;await assert.rejects(()=>autonomousPass({execute:true},{call:async b=>b.action==='dispatch_next'?{job:null,native_preparation_waiting:[handoff()]}:{job:actual},continuePrivate:async()=>{runs++;}}),/Exact waiting|exclusion/);assert.equal(runs,0);
 }
 for(const protectedId of ['job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee','job_9ef39025-d92e-4770-82d0-05881451c5df']){
  let runs=0;await assert.rejects(()=>autonomousPass({execute:true},{call:async b=>b.action==='dispatch_next'?{job:null,native_preparation_waiting:[handoff({job_id:protectedId})]}:{job:{id:protectedId,is_test:0}},continuePrivate:async()=>{runs++;}}),/exclusion/);assert.equal(runs,0);
 }
});

test('a continuation cannot return another job or queue as the waiting result',async()=>{
 for(const result of [{...returned(handoff()),job_id:'different-job'},{...returned(handoff()),queue_id:'native_prep_'+'e'.repeat(64)},{...returned(handoff()),handoff:{queue_id:'native_prep_'+'e'.repeat(64)}}]){const actual=await autonomousPass({execute:true},{call:async b=>b.action==='dispatch_next'?{job:null,native_preparation_waiting:[handoff()]}:{job:{id,is_test:0}},continuePrivate:async()=>result});assert.equal(actual.blocked[0].reason,'scheduled-pass-failed');assert.deepEqual(actual.productions,[]);assert.equal(actual.job_results.length,1);assert.equal(actual.job_results[0].retry_without_reconciliation,false);}
});

test('one isolated pending-technical failure survives later selected workflow failure without raw error text',async t=>{const run_id=new Date().toISOString().replaceAll(':','-')+'-'+randomUUID(),folder=path.resolve('.sites-runtime/periodic-runs',run_id);t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));let selections=0;const second='job_bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';try{await autonomousPass({execute:true,run_id},{call:async b=>{assert.equal(b.action,'dispatch_next');return selections++===0?{kind:'native-preparation-handoff',job:{id,is_test:0,revision:2,mode_epoch:2},native_preparation:handoff()}:{kind:'review',job:{id:second,is_test:0,revision:2,mode_epoch:2}}},continuePrivate:async()=>{throw Object.assign(Error('PRIVATE_PENDING_ONLY_ONE_TITLE_TECHNICAL_FIX_ALLOWED SENSITIVE-RAW-TEST'),{code:'PRIVATE_PENDING_ONLY_ONE_TITLE_TECHNICAL_FIX_ALLOWED'})},execute:async()=>{throw Error('Workflow stopped SENSITIVE-RAW-TEST')}});assert.fail('must preserve the later workflow failure');}catch(error){writePeriodicFailure(run_id,error);}
 const events=readPeriodicJobResults(run_id),first=events.find(e=>e.job_id===id&&e.phase==='job-failed');assert.equal(first.failure.code,'PRIVATE_PENDING_ONLY_ONE_TITLE_TECHNICAL_FIX_ALLOWED');assert.equal(first.failure.phase,'native-preparation');assert.ok(events.some(e=>e.job_id===second));const latest=JSON.parse(fs.readFileSync(path.join(folder,'autonomous-pass-result.json')));assert.ok(latest.job_events.some(e=>e.job_id===id&&e.failure?.code===first.failure.code));assert.equal(JSON.stringify(events).includes('SENSITIVE-RAW-TEST'),false);
});


test('the exact preproduction punctuation candidate reaches original local zero-output verification, never a generic unknown failure',async()=>{const h=handoff({base_video:null,status:'blocked',lease_until:null,version:3,executor:'finite-local-private-review-v1',invocation_id:'private-review-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',missing:[{code:'local-production:PRIVATE_STORYBOARD_SCRIPT_MISMATCH',detail:'阶段 ordinary-audio-and-editable-project：PRIVATE_STORYBOARD_SCRIPT_MISMATCH'}],checkpoint:{artifacts:[]}});let runs=0;const result=await autonomousPass({execute:true},{call:async b=>b.action==='dispatch_next'?{job:null,native_preparation_waiting:[h]}:{job:{id,is_test:0}},continuePrivate:async selection=>{runs++;assert.equal(selection.native_preparation,h);return{job_id:id,queue_id:queue,status:'private-review-production-deferred',claimed:false,generation_started:false}}});assert.equal(runs,1);assert.equal(result.productions[0].claimed,false);for(const patch of [{missing:[{code:'different',detail:'ordinary-audio-and-editable-project'}]},{checkpoint:{artifacts:[{kind:'local-file',purpose:'authorized-audio',file:'voice.wav'}]}},{status:'claimed',lease_until:Date.now()+10000}]){let retried=0;await autonomousPass({execute:true},{call:async()=>({job:null,native_preparation_waiting:[{...h,...patch}]}),continuePrivate:async()=>{retried++;throw Error('Do not enter unknown generation')}});assert.equal(retried,0);}});
