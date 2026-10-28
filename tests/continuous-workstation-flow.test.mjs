// Orchestration doubles only; no real job, provider, speech, media or browser.
import test from 'node:test';import assert from 'node:assert/strict';
import {autonomousPass} from '../scripts/production-autonomous-pass.mjs';
import {siteQueuePass} from '../scripts/site-queue-pass.mjs';
import {WORKSTATION_FLOW,waitForFlowActivity} from '../scripts/production-flow-lifecycle.mjs';
import {createProductionWorkstations} from '../scripts/production-workstations.mjs';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const job=i=>({id:'job_'+String(i+1).padStart(8,'0')+'-0000-4000-8000-'+String(i+1).padStart(12,'0'),is_test:0,status:'approved',review_mode:'auto',revision:1,approved_revision:1,approved_hash:'a'.repeat(64),mode_epoch:0,contract_hash:'b'.repeat(64),milestones:[],drafts:[],reviews:[]});
const native=i=>({job:job(i),kind:'native-preparation-handoff',native_preparation:{job_id:job(i).id,queue_id:'native_prep_'+String(i+1).padStart(64,'0'),binding:{scope:'private-video'},missing:[]}});
const returned=s=>({job_id:s.job.id,queue_id:s.native_preparation.queue_id,status:'local-review-returned',claimed:true,generation_started:false,video_generated:true,quality_approved:false,publication_authorized:false});
const config={execute:true,production_completion_policy:'natural',production_lifecycle:WORKSTATION_FLOW};
async function until(predicate){for(let i=0;i<1000;i++){if(predicate())return;await new Promise(r=>setTimeout(r,2));}assert.fail('Expected independent stage progress');}

test('a deployed release closes new admission while a held render finishes naturally exactly once',async()=>{
 const held=gate(),entered=gate();let dispatches=0,renders=0,finished=false;
 const pass=autonomousPass(config,{workstations:createProductionWorkstations(),call:async body=>{assert.equal(body.action,'dispatch_next');if(++dispatches===1)return native(0);return{job:null,executor_reload_required:true};},continuePrivate:async(s,{workstations})=>{await workstations.run('render',s.job.id,async()=>{renders++;entered.resolve();await held.promise;});return returned(s);}}).then(result=>{finished=true;return result;});
 await entered.promise;await new Promise(r=>setImmediate(r));assert.equal(dispatches,2);assert.equal(finished,false);held.resolve();const result=await pass;
 assert.equal(renders,1);assert.equal(result.workstations.active_count,0);assert.equal(result.workstations.waiting_count,0);assert.equal(result.productions[0].status,'local-review-returned');
});
test('a failed native job is attempted once per flow despite checkpoint version changes, while other work proceeds and the next run can retry',async t=>{
 const held=gate();let offeredHeld=false,offeredOther=false,attempts=0,version=1,observedExclusion=false,independent=0,pass;
 t.after(async()=>{held.resolve();await pass;});
 pass=autonomousPass(config,{workstations:createProductionWorkstations(),waitForActivity:(active,o)=>waitForFlowActivity(active,{...o,poll_ms:2}),call:async body=>{
  assert.equal(body.action,'dispatch_next');if(body.exclude_job_ids.includes(job(0).id))observedExclusion=true;
  if(!body.exclude_job_ids.includes(job(0).id)){if(attempts>3)throw Error('failed job was repeatedly admitted');const s=native(0);s.native_preparation.version=version;return s;}
  if(!offeredHeld){offeredHeld=true;return native(1);}
  if(attempts&&observedExclusion&&!offeredOther){offeredOther=true;return native(2);}
  return {job:null,native_preparation_waiting:[]};
 },continuePrivate:async s=>{
  if(s.job.id===job(0).id){attempts++;version++;return {job_id:s.job.id,queue_id:s.native_preparation.queue_id,status:'private-review-result-unknown',claimed:true,generation_started:true};}
  if(s.job.id===job(1).id)await held.promise;else independent++;
  return returned(s);
 }});
 await until(()=>independent===1);assert.equal(attempts,1);assert.equal(observedExclusion,true);held.resolve();await pass;assert.equal(attempts,1);
 let offered=false,nextAttempts=0;await autonomousPass(config,{call:async body=>{if(!offered&&!body.exclude_job_ids.includes(job(0).id)){offered=true;return native(0);}return{job:null,native_preparation_waiting:[]};},continuePrivate:async s=>{nextAttempts++;return {job_id:s.job.id,queue_id:s.native_preparation.queue_id,status:'private-review-result-unknown'};}});assert.equal(nextAttempts,1);
});
test('after the old admission boundary, idle stations admit new jobs and hand the same job onward while a long voice is still active',async t=>{
 const held=gate(),stations=createProductionWorkstations(),calls=[],done=[];let offered=false,arrived=false,bStage='none',clock=Date.now(),pass;
 t.mock.method(Date,'now',()=>clock);t.after(async()=>{held.resolve();await pass;});
 const extra=Array.from({length:18},(_,i)=>({job:job(i+2),kind:'preparation',stage_id:'SYNTHETIC-preparation-'+i}));
 pass=autonomousPass({...config,admission_deadline_ms:clock+600000},{workstations:stations,waitForActivity:async active=>{if(!arrived){arrived=true;bStage='preparation';clock+=900000;return;}await waitForFlowActivity(active,{poll_ms:2});},call:async body=>{
  assert.equal(body.action,'dispatch_next');assert.ok(body.exclude_job_ids.length<=64);
  if(!offered){offered=true;return native(0);}
  if(arrived&&extra.length)return extra.shift();
  if(bStage==='preparation'&&!body.exclude_job_ids.includes(job(1).id))return{job:job(1),kind:'preparation',stage_id:'SYNTHETIC-same-job-prepare'};
  if(bStage==='render'&&!body.exclude_job_ids.includes(job(1).id))return native(1);
  return{job:null,native_preparation_waiting:[]};
 },prepare:async s=>{calls.push(s.stage_id);if(s.job.id===job(1).id){bStage='render';return{persisted:true};}return{persisted:false};},continuePrivate:async(s,{workstations})=>{
  if(s.job.id===job(0).id)await workstations.run('voice',s.job.id,()=>held.promise);
  else{await workstations.run('render',s.job.id,async()=>{assert.equal(stations.snapshot().stations.voice.active,job(0).id);done.push('render');});await workstations.run('archive',s.job.id,async()=>done.push('archive'));bStage='done';}
  return returned(s);
 }});
 await until(()=>bStage==='done');assert.deepEqual(done,['render','archive']);assert.equal(calls.length,19);assert.equal(new Set(calls).size,19);assert.equal(stations.snapshot().stations.voice.active,job(0).id);held.resolve();const result=await pass;assert.ok(result.dispatch_count>16);assert.equal(result.admission_closed,false);assert.equal(result.production_lifecycle,WORKSTATION_FLOW);assert.ok(result.workstations.observed_parallel);
});
test('a non-idle research request cannot monopolize the production pass or delay a ready production stage',async t=>{
 const held=gate(),productionDone=gate();let researchCalls=0,rendered=false,offered=false,pass;
 t.after(async()=>{held.resolve();await pass;});
 pass=siteQueuePass(config,{research:async()=>{researchCalls++;if(researchCalls===1){await held.promise;return{status:'keyword-research-returned',research_id:'SYNTHETIC-research'};}return{status:'research-idle'};},production:(c,options)=>autonomousPass(c,{...options,waitForActivity:(active,o)=>waitForFlowActivity(active,{...o,poll_ms:2}),call:async body=>{assert.equal(body.action,'dispatch_next');if(!offered){offered=true;return native(1);}return{job:null,native_preparation_waiting:[]};},continuePrivate:async s=>{rendered=true;productionDone.resolve();return returned(s);}})});
 await productionDone.promise;assert.equal(rendered,true);assert.equal(researchCalls,1);held.resolve();const result=await pass;assert.ok(result.productions.some(p=>p.status==='local-review-returned'));assert.ok(result.research_results.some(r=>r.status==='keyword-research-returned'));assert.equal(result.productions.some(p=>p.quality_approved),false);
});
