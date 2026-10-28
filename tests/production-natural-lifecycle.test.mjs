// Synthetic orchestration only: no real provider, media, worker or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {autonomousPass,autonomousPassDiagnostics} from '../scripts/production-autonomous-pass.mjs';

const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};};
async function eventually(check){for(let n=0;n<200;n++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Synthetic stage did not reach its expected checkpoint');}
const job=i=>({id:'job_'+String(i+1).padStart(8,'0')+'-0000-4000-8000-'+String(i+1).padStart(12,'0'),is_test:0,status:'approved',review_mode:'auto',revision:1,approved_revision:1,approved_hash:'a'.repeat(64),mode_epoch:0,contract_hash:'b'.repeat(64),milestones:[],drafts:[],reviews:[]});
const select=(i,kind='automatic-clone')=>({job:job(i),kind});

test('admitted jobs finish queued voice, render, archive and same-pass post stages after admission closes',async t=>{
 let clock=Date.now();t.mock.method(Date,'now',()=>clock);const admission=clock+120000,gate=deferred(),events=[],queue=[select(0),select(1)];let stations,dispatches=0,settled=false,pass;
 t.after(async()=>{gate.resolve();await pass;});
 pass=autonomousPass({execute:true,production_completion_policy:'natural',admission_deadline_ms:admission},{call:async body=>{assert.equal(body.action,'dispatch_next');dispatches++;return queue.shift()||{job:null,native_preparation_waiting:[]};},clone:async(s,o)=>{
  assert.equal(o.deadline_ms,Infinity);stations=o.workstations;
  await stations.run('voice',s.job.id,async()=>{events.push('voice:'+s.job.id);if(s.job.id===job(0).id)await gate.promise;});
  for(const stage of ['render','archive'])await stations.run(stage,s.job.id,async()=>{events.push(stage+':'+s.job.id);assert.ok(clock>admission);});
  return{job_id:s.job.id,request_id:'SYNTHETIC-original-request',status:'automatic-clone-awaiting-second-review',claimed:true};
 },postVideo:async(s,o)=>{assert.equal(o.deadline_ms,Infinity);return o.workstations.run('assets',s.job.id,async()=>{events.push('post:'+s.job.id);return{job_id:s.job.id,status:'post-video-prepared',quality_approved:false,publication_authorized:false};});}}).then(value=>{settled=true;return value;});
 await eventually(()=>stations?.snapshot().stations.voice.waiting.length===1);clock=admission+600000;assert.equal(settled,false);assert.equal(stations.snapshot().stations.voice.active,job(0).id);gate.resolve();const result=await pass;
 assert.equal(result.production_completion_policy,'natural');assert.equal(result.admission_closed,true);assert.notEqual(result.status,'scheduled-budget-deferred');assert.equal(result.productions.filter(p=>p.status==='post-video-prepared').length,2);assert.equal(result.job_results.length,2);assert.equal(result.workstations.active_count,0);assert.equal(result.workstations.waiting_count,0);assert.equal(result.workstations.stations.voice.max_active,1);assert.equal(events.length,8);assert.ok(dispatches<=3);assert.equal(autonomousPassDiagnostics(result).admission_closed,true);
});

test('a dispatch response arriving after admission closes cannot admit a new job or invent unknown media',async t=>{
 let clock=Date.now();t.mock.method(Date,'now',()=>clock);const admission=clock+120000;let calls=0,touches=0;
 const result=await autonomousPass({execute:true,production_completion_policy:'natural',admission_deadline_ms:admission},{call:async body=>{assert.equal(body.action,'dispatch_next');calls++;clock=admission+1;return select(0);},clone:async()=>{touches++;throw Error('Must not admit new work after cutoff');}});
 assert.equal(calls,1);assert.equal(touches,0);assert.equal(result.admission_closed,true);assert.notEqual(result.status,'scheduled-budget-deferred');assert.deepEqual(result.job_results,[]);assert.deepEqual(result.blocked,[]);assert.equal(result.workstations.active_count,0);
});

test('an admitted ordinary child inherits natural completion without a foreground kill deadline',async t=>{
 let clock=Date.now();t.mock.method(Date,'now',()=>clock);const admission=clock+120000;let calls=0,executed=0;
 const result=await autonomousPass({execute:true,production_completion_policy:'natural',admission_deadline_ms:admission},{call:async body=>{assert.equal(body.action,'dispatch_next');calls++;return select(0,'text');},execute:async config=>{
  executed++;assert.equal(config.production_completion_policy,'natural');assert.equal(config.admission_deadline_ms,admission);assert.equal(config.foreground_deadline_ms,undefined);clock=admission+600000;return{job_id:job(0).id,status:'needs-source-input',reason:'SYNTHETIC-no-new-source',persisted:false};
 }});
 assert.equal(calls,1);assert.equal(executed,1);assert.notEqual(result.status,'scheduled-budget-deferred');assert.equal(result.blocked[0].reason,'SYNTHETIC-no-new-source');assert.equal(result.workstations.stations.preparation.finished,1);
});

test('natural entry normalizes its default admission metadata for an admitted ordinary child',async t=>{
 let clock=Date.now();t.mock.method(Date,'now',()=>clock);const start=clock;let calls=0;
 const result=await autonomousPass({execute:true,production_completion_policy:'natural'},{call:async()=>{calls++;return select(0,'text');},execute:async config=>{assert.equal(config.admission_deadline_ms,start+600000);assert.equal(config.foreground_deadline_ms,undefined);clock+=700000;return{job_id:job(0).id,status:'needs-source-input',reason:'SYNTHETIC-no-source'};}});
 assert.equal(calls,1);assert.equal(result.admission_closed,true);assert.notEqual(result.status,'scheduled-budget-deferred');
});

test('an actual stage failure stays isolated while another admitted job finishes beyond admission',async t=>{
 let clock=Date.now();t.mock.method(Date,'now',()=>clock);const admission=clock+120000,gate=deferred(),queue=[select(0),select(1,'post-video-preparation')];let stations,pass;
 t.after(async()=>{gate.resolve();await pass;});
 pass=autonomousPass({execute:true,production_completion_policy:'natural',admission_deadline_ms:admission},{call:async()=>queue.shift()||{job:null,native_preparation_waiting:[]},clone:async(s,o)=>{stations=o.workstations;return stations.run('voice',s.job.id,async()=>{await gate.promise;throw Object.assign(Error('SYNTHETIC-local-stage-failure'),{code:'SYNTHETIC_LOCAL_STAGE_FAILURE'});});},postVideo:async(s,o)=>o.workstations.run('archive',s.job.id,async()=>{await gate.promise;assert.ok(clock>admission);return{job_id:s.job.id,status:'post-video-prepared'};})});
 await eventually(()=>stations?.snapshot().active_count===2);clock=admission+600000;gate.resolve();const result=await pass;
 assert.ok(result.job_results.some(r=>r.job_id===job(0).id&&r.status==='scheduled-pass-failed'));assert.ok(result.productions.some(r=>r.job_id===job(1).id&&r.status==='post-video-prepared'));assert.notEqual(result.status,'scheduled-budget-deferred');assert.equal(result.workstations.active_count,0);assert.equal(result.workstations.stations.voice.failed,1);
});

for(const config of [{admission_deadline_ms:null},{admission_deadline_ms:Infinity},{admission_deadline_ms:-1},{production_completion_policy:'kill-after-round'}])test('invalid lifecycle input is rejected before dispatch '+JSON.stringify(config),async()=>{
 let calls=0;await assert.rejects(()=>autonomousPass({execute:true,...config},{call:async()=>{calls++;return{job:null};}}));assert.equal(calls,0);
});
