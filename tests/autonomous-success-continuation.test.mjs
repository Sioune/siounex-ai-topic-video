// Pure scheduled orchestration fixtures: no provider, Site or media execution.
import test from 'node:test';import assert from 'node:assert/strict';
import {autonomousPass,autonomousPassDiagnostics} from '../scripts/production-autonomous-pass.mjs';
import {periodicBusinessResult} from '../scripts/native-site-token.mjs';
const ID='job_55555555-5555-4555-8555-555555555555',OTHER='job_66666666-6666-4666-8666-666666666666',HASH='b'.repeat(64),PACKAGE='promo_cccccccc-cccc-4ccc-8ccc-cccccccccccc',CONTENT='d'.repeat(64),QUEUE='native_prep_'+'e'.repeat(64),AT='2026-10-22T00:00:00.000Z';
const job=(patch={})=>({id:ID,is_test:0,status:'waiting_executor',revision:0,mode_epoch:0,contract_hash:'a'.repeat(64),review_mode:'auto',source_snapshot:JSON.stringify({category:'测试'}),milestones:[],drafts:[],reviews:[],updated_at:AT,...patch});
const approved=()=>job({status:'approved',revision:1,approved_revision:1,approved_hash:HASH,updated_at:'2026-10-22T00:01:00.000Z',milestones:['source','script'].map((node,i)=>({id:'SYNTHETIC-'+node,node,revision:1,mode_epoch:0,artifact_hash:HASH,artifact_version:1,status:'approved',updated_at:'2026-10-22T00:01:00.000Z'}))});
const persistedPackage=()=>({id:PACKAGE,status:'ready',is_current:true,script_revision:1,script_hash:HASH,content_hash:CONTENT});

test('owner cancellation after dispatch prevents station execution and leaves an independent job executable',async()=>{
 let picks=0;const executed=[],cancelled=job({status:'cancelled'}),other=job({id:OTHER});
 const result=await autonomousPass({execute:true},{call:async b=>{if(b.action==='read')return{job:b.id===ID?cancelled:other};assert.equal(b.action,'dispatch_next');return ++picks===1?{job:job(),kind:'text'}:picks===2?{job:other,kind:'text'}:{job:null,native_preparation_waiting:[]};},execute:async(_c,{selection})=>{executed.push(selection.job.id);return{status:'awaiting_review'};}});
 assert.deepEqual(executed,[OTHER]);assert.equal(result.job_results.find(r=>r.job_id===ID).status,'production-cancelled');assert.ok(!result.blocked.some(r=>r.job_id===ID));
});

test('a finite source/script success is read back then enters free preparation through the central dispatcher in the same pass',async()=>{
 const before=job(),after=approved(),calls=[];let selections=0,models=0,prepared=0;
 const result=await autonomousPass({execute:true},{call:async b=>{calls.push(b);if(b.action==='dispatch_next'){assert.deepEqual(b.exclude_job_ids,[]);return ++selections===1?{job:before,kind:'text'}:selections===2?{job:after,kind:'preparation',stage_id:'SYNTHETIC-current-media-inputs'}:{job:null,native_preparation_waiting:[]};}assert.equal(b.action,'read');return{job:after};},execute:async()=>{models++;return{status:'finite-workflow-returned',job_id:ID};},prepare:async s=>{prepared++;assert.equal(s.stage_id,'SYNTHETIC-current-media-inputs');return{status:'ready',persisted:true};},continuePrivate:()=>{throw Error('No direct producer from a successful text return');}});
 assert.equal(models,1);assert.equal(prepared,1);assert.equal(selections,3);assert.equal(calls.filter(c=>c.action==='read').length,3);assert.deepEqual(result.executions,[{job_id:ID,kind:'text',status:'finite-workflow-returned',revision:1,mode_epoch:0,persisted:true}]);assert.equal(result.preparations.length,1);
 const summary=periodicBusinessResult(result);assert.equal(summary.executions.length,1);assert.ok(['persisted-readonly-preparation-receipts','persisted-workflow-returned'].includes(summary.outcome),'both verified receipts survive natural station settlement order');assert.equal(autonomousPassDiagnostics(result).executions.length,1);
});

test('the final idle dispatch preserves the preceding durable workflow success in the periodic summary',async()=>{
 const before=job(),after=approved();let selected=0;const result=await autonomousPass({execute:true},{call:async b=>b.action==='read'?{job:after}:++selected===1?{job:before,kind:'text'}:{job:null,native_preparation_waiting:[]},execute:async()=>({status:'finite-workflow-returned',job_id:ID})}),summary=periodicBusinessResult(result);
 assert.equal(selected,2);assert.ok(['persisted-execution-steps','persisted-workflow-returned'].includes(summary.outcome),'the verified success remains visible after either natural settlement order');assert.equal(summary.executions.length,1);assert.equal(summary.completed,true);assert.equal(summary.quality_approved,false);assert.equal(summary.publication_authorized,false);
});

test('a persisted ready promotion enters post-video preparation through dispatch without another scheduled wake',async()=>{
 const current=approved(),calls=[];let selects=0,promos=0,post=0;
 const result=await autonomousPass({execute:true},{call:async b=>{calls.push(b);if(b.action==='dispatch_next'){selects++;if(selects===1)return{job:current,kind:'promotion-package',package_id:PACKAGE};if(selects===2){assert.deepEqual(b.exclude_job_ids,[]);return{job:current,kind:'post-video-preparation'};}assert.deepEqual(b.exclude_job_ids,[ID]);return{job:null,native_preparation_waiting:[]};}if(b.action==='read')return{job:current};assert.equal(b.action,'promo_list');assert.equal(b.id,ID);return{packages:[persistedPackage()]};},execute:async()=>{promos++;return{status:'ready',package_id:PACKAGE,content_sha256:CONTENT,model_calls:1};},postVideo:async()=>{post++;return{job_id:ID,status:'post-video-preparation-returned',claimed:false};}});
 assert.equal(promos,1);assert.equal(post,1);assert.equal(selects,3);assert.equal(calls.filter(c=>c.action==='promo_list').length,1);assert.deepEqual(result.executions,[{job_id:ID,kind:'promotion-package',status:'ready',revision:1,mode_epoch:0,package_id:PACKAGE,content_sha256:CONTENT,persisted:true}]);assert.equal(periodicBusinessResult(result).executions[0].content_sha256,CONTENT);
});

test('a stage needs seven minutes but a remaining shorter budget may still advance independent retained-audio video work',async()=>{
 let selects=0,models=0,native=0;const result=await autonomousPass({execute:true,foreground_deadline_ms:Date.now()+360000},{call:async b=>{if(b.action==='read')return{job:job({id:b.id})};assert.equal(b.action,'dispatch_next');if(++selects===1)return{job:job(),kind:'text'};assert.ok(b.exclude_job_ids.includes(ID));if(selects===2)return{job:job({id:OTHER}),kind:'native-preparation-handoff',native_preparation:{job_id:OTHER,binding:{scope:'private-video'},queue_id:QUEUE,missing:[]}};return{job:null,native_preparation_waiting:[]};},execute:async()=>{models++;return{status:'text-workflow-budget-deferred',job_id:ID,phase:'generation',remaining_ms:360000,required_ms:420000,claimed:false};},continuePrivate:async()=>{native++;return{job_id:OTHER,queue_id:QUEUE,status:'local-review-returned',claimed:true,video_generated:true};}});
 assert.equal(models,1);assert.equal(native,1);assert.notEqual(result.status,'scheduled-budget-deferred');assert.equal(result.productions[0].status,'local-review-returned');assert.equal(result.blocked[0].reason,'text-workflow-budget-deferred');assert.deepEqual(result.executions,[]);
});

test('a cover stage needing330seconds yields locally while five remaining minutes can finish independent cached-video work',async()=>{
 let selects=0,covers=0,native=0;const result=await autonomousPass({execute:true,foreground_deadline_ms:Date.now()+300000},{call:async b=>{assert.equal(b.action,'dispatch_next');if(++selects===1)return{job:approved(),kind:'post-video-preparation'};assert.ok(b.exclude_job_ids.includes(ID));if(selects===2)return{job:job({id:OTHER}),kind:'native-preparation-handoff',native_preparation:{job_id:OTHER,binding:{scope:'private-video'},queue_id:QUEUE,missing:[]}};return{job:null,native_preparation_waiting:[]};},postVideo:async()=>{covers++;return{job_id:ID,status:'post-video-upload-deferred',phase:'native-aigc-covers',budget_exhausted:true,resume_same_archives:true};},continuePrivate:async()=>{native++;return{job_id:OTHER,queue_id:QUEUE,status:'local-review-returned',claimed:true,video_generated:true};}});
 assert.equal(covers,1);assert.equal(native,1);assert.equal(selects,3);assert.notEqual(result.status,'scheduled-budget-deferred');assert.equal(result.blocked[0].reason,'post-video-upload-deferred');assert.equal(result.blocked[0].budget_exhausted,true);assert.equal(result.productions[1].status,'local-review-returned');
});

test('a post-video budget yield ends the whole pass only when the real inherited remainder is below one minute',async()=>{
 const originalNow=Date.now;let clock=originalNow(),selects=0;Date.now=()=>clock;
 try{const deadline=clock+120000,result=await autonomousPass({execute:true,foreground_deadline_ms:deadline},{call:async b=>{assert.equal(b.action,'dispatch_next');selects++;return{job:approved(),kind:'post-video-preparation'};},postVideo:async()=>{clock+=61000;return{job_id:ID,status:'post-video-upload-deferred',phase:'site-archive-parts',budget_exhausted:true,resume_same_archives:true};},continuePrivate:()=>{throw Error('Less than60seconds remain');}});assert.equal(selects,1);assert.equal(result.status,'scheduled-budget-deferred');assert.equal(result.productions[0].status,'post-video-upload-deferred');assert.deepEqual(result.executions,[]);}finally{Date.now=originalNow;}
});

test('less than one minute of real inherited budget stops the whole pass without dispatch or model calls',async()=>{
 let calls=0;const result=await autonomousPass({execute:true,foreground_deadline_ms:Date.now()+1000},{call:async()=>{calls++;throw Error('No budget');},execute:()=>{throw Error('No model');}});assert.equal(result.status,'scheduled-budget-deferred');assert.equal(calls,0);assert.deepEqual(result.executions,[]);
});

test('fresh human-review or paused state is excluded for the current pass without crossing the gate or changing approval',async()=>{
 for(const [review_mode,status,nodeStatus]of [['node','awaiting_review','awaiting_human'],['auto','awaiting_review','awaiting_human'],['auto','paused','paused']]){
  const before=job({review_mode}),after=job({review_mode,status,revision:1,updated_at:'2026-10-22T00:01:00.000Z',milestones:[{id:'SYNTHETIC-human',node:'script',revision:1,mode_epoch:0,artifact_hash:HASH,artifact_version:1,status:nodeStatus}]}),original=JSON.stringify(after),calls=[];let selects=0;
  const result=await autonomousPass({execute:true},{call:async b=>{calls.push(b);if(b.action==='read')return{job:after};assert.equal(b.action,'dispatch_next');if(++selects===1)return{job:before,kind:'text'};assert.deepEqual(b.exclude_job_ids,[ID]);return{job:null,native_preparation_waiting:[]};},execute:async()=>({status:'finite-workflow-returned',job_id:ID}),prepare:()=>{throw Error('Human gate');},continuePrivate:()=>{throw Error('Human gate');}});
  assert.equal(selects,2);assert.equal(result.blocked[0].reason,'current-human-decision-or-stop');assert.equal(result.executions[0].persisted,true);assert.equal(JSON.stringify(after),original);assert.ok(calls.every(c=>['read','dispatch_next'].includes(c.action)));
 }
});

test('promotion completion with an unconfirmed current package remains unknown instead of advancing post-video work',async()=>{
 for(const patch of [{status:'running'},{is_current:false},{content_hash:'f'.repeat(64)},{script_revision:2}]){
  let selects=0;const current=approved(),result=await autonomousPass({execute:true},{call:async b=>{if(b.action==='dispatch_next'){selects++;return{job:current,kind:'promotion-package',package_id:PACKAGE};}if(b.action==='read')return{job:current};assert.equal(b.action,'promo_list');return{packages:[{...persistedPackage(),...patch}]};},execute:async()=>({status:'ready',package_id:PACKAGE,content_sha256:CONTENT,model_calls:1}),postVideo:()=>{throw Error('No unconfirmed next stage');}});
  assert.equal(selects,2);assert.equal(result.result.status,'promotion-result-unknown');assert.equal(result.result.retry_without_reconciliation,false);assert.deepEqual(result.executions,[]);
 }
});

test('an unchanged finite workflow is excluded once rather than selected sixteen times',async()=>{
 const current=approved();let selects=0,runs=0;const result=await autonomousPass({execute:true},{call:async b=>{if(b.action==='read')return{job:current};if(++selects===1)return{job:current,kind:'review'};assert.deepEqual(b.exclude_job_ids,[ID]);return{job:null,native_preparation_waiting:[]};},execute:async()=>{runs++;return{status:'finite-workflow-returned'};}});assert.equal(runs,1);assert.equal(selects,2);assert.equal(result.blocked[0].reason,'workflow-state-unchanged');assert.deepEqual(result.executions,[]);
});

test('a changed owner epoch or non-whitelisted success does not create a durable success summary or automatic next stage',async()=>{
 for(const [status,patch]of [['finite-workflow-returned',{mode_epoch:1}],['ready',{}]]){const before=job(),after={...approved(),...patch};let selects=0;const result=await autonomousPass({execute:true},{call:async b=>{if(b.action==='read')return{job:after};selects++;return{job:before,kind:'text'};},execute:async()=>({status})});assert.equal(selects,2);assert.equal(result.status,'bounded-pass-returned');assert.deepEqual(result.executions,[]);}
});
