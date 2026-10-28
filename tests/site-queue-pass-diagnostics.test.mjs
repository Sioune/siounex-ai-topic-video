import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {siteQueuePass} from '../scripts/site-queue-pass.mjs';
import {writePeriodicResult} from '../scripts/periodic-diagnostics.mjs';

test('the scheduled queue entry replaces selected with a final confirmed promotion cooldown snapshot',async t=>{
 const run_id='2026-10-22T00-00-00.000Z-'+randomUUID(),dir=path.resolve('.sites-runtime/periodic-runs',run_id);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const job_id='job_11111111-1111-4111-8111-111111111111',package_id='promo_11111111-1111-4111-8111-111111111111',returned={status:'bounded-pass-returned',job_id,after:{id:job_id,status:'approved'},result:{status:'promotion-technical-retry-pending',job_id,package_id,confirmed_no_result:true,result_unknown:false,http_status:429,next_retry_at:'2026-10-22T00:01:00.000Z',retry_state:{known_retryable:true,result_unknown:false,exhausted:false},raw:'SYNTHETIC_DO_NOT_RECORD'}};
 const result=await siteQueuePass({execute:true,run_id},{research:async()=>({status:'research-idle'}),production:async()=>{writePeriodicResult(run_id,{phase:'selected',job_id,kind:'promotion-package'});return returned;}});
 assert.equal(result,returned);const saved=JSON.parse(fs.readFileSync(path.join(dir,'autonomous-pass-result.json')));assert.equal(saved.phase,'returned');assert.equal(saved.completed,false);assert.equal(saved.blocked.length,0);assert.equal(saved.in_progress,true);assert.equal(saved.business_outcome,'promotion-rate-limit-cooldown');assert.equal(saved.package_id,package_id);assert.equal(saved.http_status,429);assert.equal(saved.confirmed_no_result,true);assert.equal(saved.result_unknown,false);assert.equal(saved.next_retry_at,returned.result.next_retry_at);assert.equal(JSON.stringify(saved).includes('SYNTHETIC_DO_NOT_RECORD'),false);
});

test('the queue snapshot does not turn an unknown promo return into success or known cooldown',async t=>{
 const run_id='2026-10-22T00-00-00.000Z-'+randomUUID(),dir=path.resolve('.sites-runtime/periodic-runs',run_id);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const job_id='job_11111111-1111-4111-8111-111111111111';
 await siteQueuePass({execute:true,run_id},{research:async()=>({status:'research-idle'}),production:async()=>({status:'bounded-pass-returned',job_id,result:{status:'promotion-result-unknown',package_id:'promo_11111111-1111-4111-8111-111111111111'}})});
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'autonomous-pass-result.json')));assert.equal(saved.phase,'returned');assert.equal(saved.completed,false);assert.equal(saved.in_progress,false);assert.equal(saved.business_outcome,'result-unconfirmed');assert.equal(saved.confirmed_no_result,undefined);
});

test('the scheduled final idle snapshot retains confirmed earlier execution steps without copy or credentials',async t=>{
 const run_id='2026-10-22T00-00-00.000Z-'+randomUUID(),dir=path.resolve('.sites-runtime/periodic-runs',run_id);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const job_id='job_11111111-1111-4111-8111-111111111111',execution={job_id,kind:'text',status:'finite-workflow-returned',revision:2,mode_epoch:1,persisted:true,raw:'SYNTHETIC_DO_NOT_RECORD'};
 await siteQueuePass({execute:true,run_id},{research:async()=>({status:'research-idle'}),production:async()=>({status:'idle-or-blocked',blocked:[],executions:[execution]})});
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'autonomous-pass-result.json')));assert.equal(saved.phase,'returned');assert.equal(saved.business_outcome,'persisted-execution-steps');assert.equal(saved.completed,true);assert.equal(saved.executions.length,1);assert.equal(saved.executions[0].job_id,job_id);assert.equal(saved.quality_approved,false);assert.equal(saved.publication_authorized,false);assert.equal(JSON.stringify(saved).includes('SYNTHETIC_DO_NOT_RECORD'),false);
});
