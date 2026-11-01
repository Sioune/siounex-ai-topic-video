import test from 'node:test';
import assert from 'node:assert/strict';
import {siteQueuePass} from '../scripts/site-queue-pass.mjs';
import {autonomousPass} from '../scripts/production-autonomous-pass.mjs';

const id='job_12345678-1234-1234-1234-123456789abc',rid='acl_'+'a'.repeat(64);
test('dedicated queue skips research and forwards only the exact clone target',async()=>{
 const oldJob=process.env.SIOUNEX_STUDIO_CDP_JOB_ID,oldReq=process.env.SIOUNEX_STUDIO_CDP_REQUEST_ID;
 process.env.SIOUNEX_STUDIO_CDP_JOB_ID=id;process.env.SIOUNEX_STUDIO_CDP_REQUEST_ID=rid;
 try{let seen;await siteQueuePass({execute:true},{research:()=>{throw Error('research must not run');},production:async c=>{seen=c;return {status:'idle'};}});assert.equal(seen.exact_clone_job_id,id);assert.equal(seen.exact_clone_request_id,rid);}
 finally{if(oldJob===undefined)delete process.env.SIOUNEX_STUDIO_CDP_JOB_ID;else process.env.SIOUNEX_STUDIO_CDP_JOB_ID=oldJob;if(oldReq===undefined)delete process.env.SIOUNEX_STUDIO_CDP_REQUEST_ID;else process.env.SIOUNEX_STUDIO_CDP_REQUEST_ID=oldReq;}
});
test('dedicated pass reads and executes only the bound request',async()=>{
 const actions=[];const job={id,status:'approved',review_mode:'node',revision:3,mode_epoch:0};
 const call=async b=>{actions.push(b);if(b.action==='read')return {job};if(b.action==='automatic_clone_read')return {clone:{is_current:true},request:{id:rid,job_id:id,status:'blocked'}};throw Error('unexpected action '+b.action);};
 let received;const result=await autonomousPass({execute:true,exact_clone_job_id:id,exact_clone_request_id:rid},{call,clone:async s=>{received=s;return {job_id:id,request_id:rid,status:'automatic-clone-native-handoff-required'};}});
 assert.deepEqual(actions.map(x=>x.action).sort(),['automatic_clone_read','read']);assert.equal(received.automatic_clone.request_id,rid);assert.equal(result.job_id,id);
});
test('dedicated pass rejects a different current request without executing',async()=>{
 let executed=false;const call=async b=>b.action==='read'?{job:{id,status:'approved',review_mode:'node'}}:{clone:{is_current:true},request:{id:'acl_'+'b'.repeat(64),job_id:id}};
 await assert.rejects(autonomousPass({execute:true,exact_clone_job_id:id,exact_clone_request_id:rid},{call,clone:async()=>{executed=true;}}),/Exact current dedicated clone binding required/);assert.equal(executed,false);
});
test('paused and cancelled jobs cannot enter the dedicated clone',async()=>{
 for(const status of ['paused','cancelled']){let executed=false;const call=async b=>b.action==='read'?{job:{id,status,review_mode:'node'}}:{clone:{is_current:true},request:{id:rid,job_id:id}};await assert.rejects(autonomousPass({execute:true,exact_clone_job_id:id,exact_clone_request_id:rid},{call,clone:async()=>{executed=true;}}),/Exact current dedicated clone binding required/);assert.equal(executed,false);}
});
