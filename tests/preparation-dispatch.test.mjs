import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../scripts/production-dispatch-executor.mjs';
import {runSession} from '../scripts/production-session-executor.mjs';

const approved={id:'job_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',is_test:0,status:'approved',revision:1,approved_revision:1,approved_hash:'b'.repeat(64),mode_epoch:0,contract_hash:'a'.repeat(64),stages:[],media_continuation:{current_id:'',scope:null},publication_reports:[]};
const binding={revision:1,script_hash:approved.approved_hash,mode_epoch:0,contract_hash:approved.contract_hash};
const scope={id:'SYNTHETIC-scope',scope:'preparation',binding,authorization_source:'included-free-preparation',new_paid_authorization:false,publication_authorization:false};
const stages=['media_inventory','media_inputs'].map((stage,i)=>({id:'SYNTHETIC-stage-'+i,stage,review_revision:1,review_hash:approved.approved_hash,result:JSON.stringify({scope_id:scope.id})}));
const registered={...approved,stages,media_continuation:{current_id:scope.id,scope}};

test('foreground session consumes registration and two preparation steps without text fallback or 16-step spin',async()=>{
 let phase=0,clock=100000,workflows=0,prepared=0;const calls=[];
 const call=async b=>{calls.push(b);if(b.action==='executor_heartbeat')return {};if(b.action==='dispatch_next'){return phase===0?{job:approved,kind:'preparation-registration',binding}:phase<=2?{job:registered,kind:'preparation',stage_id:stages[phase-1].id}:{job:null,reason:'Human review or material input remains'}}if(b.action==='internal_preparation'){assert.equal(b.automatic,true);phase++;return {job:registered}}throw Error('Unexpected source/model/claim call: '+b.action)};
 const result=await runSession({execute:true,max_runtime_ms:30000,poll_ms:1000},{call,now:()=>clock,wait:async ms=>clock+=ms,setTicker:()=>1,clearTicker:()=>{},execute:(config,options)=>dispatch(config,{...options,run:()=>workflows++,prepare:async s=>{assert.equal(s.stage_id,stages[phase-1].id);phase++;prepared++;return {stage_id:s.stage_id,status:'blocked',persisted:true}}})});
 assert.equal(result.status,'foreground-session-finished');assert.equal(result.events.length,3);assert.equal(result.events[0].result.scope_registered,true);assert.equal(result.events[0].result.generation_started,false);assert.equal(prepared,2);assert.equal(workflows,0);assert.equal(calls.filter(b=>b.action==='internal_preparation').length,1);assert.ok(calls.every(b=>['dispatch_next','internal_preparation','executor_heartbeat'].includes(b.action)));
});

test('unknown queue kinds stop before source materialization or child workflow',async()=>{
 let calls=0,workflows=0;const result=await dispatch({execute:true},{selection:{job:approved,kind:'SYNTHETIC-unsupported-future-step'},call:async()=>{calls++;throw Error('Unexpected call')},run:()=>workflows++});assert.equal(result.execution_started,false);assert.equal(result.status,'unsupported-queue-kind');assert.equal(calls,0);assert.equal(workflows,0);
});
