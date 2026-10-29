import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createClonePreparationRetryPolicy,clonePreparationRetryReason,CLONE_PREPARATION_RETRY_DELAYS_MS} from '../scripts/automatic-clone-retry-state.mjs';
import {runAutomaticClone} from '../scripts/automatic-clone-consumer.mjs';
import {safeProductionStageFields} from '../scripts/periodic-diagnostics.mjs';
import {periodicBusinessResult} from '../scripts/native-site-token.mjs';
const job_id='job_11111111-1111-4111-8111-111111111111',rid='acl_'+'a'.repeat(64),binding={revision:1,mode_epoch:0,script_hash:'b'.repeat(64),contract_hash:'c'.repeat(64)};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'clone-preparation-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let clock=Date.now();const dir=path.join(root,'.sites-runtime/authorized-inputs',job_id,'revision-1/automatic-clone',rid);fs.mkdirSync(dir,{recursive:true});
 const request={id:rid,job_id,binding,status:'blocked',version:1,lease_until:null,provider_call_started:false,provider_result:null,acquisition_method:'heygen_studio_audio_preview',voice_id:'SYNTHETIC-private-voice'},error=Object.assign(Error('STUDIO_PREVIEW_BROWSER_UI_ERROR'),{code:'STUDIO_PREVIEW_BROWSER_UI_ERROR'}),policy=createClonePreparationRetryPolicy({root,job_id,now:()=>clock,implementation_sha256:'d'.repeat(64)});
 function attempt({code=error.code,phase='recover-preparation',finished=clock,play=false,draft=false,request_id=rid,terminated=true,diagnostic='Search textbox visibility timed out; Bearer private-token at https://private.example/audio'}={}){const name='browser-'+randomUUID(),base=path.join(dir,name);fs.mkdirSync(path.join(base,'process'),{recursive:true});fs.writeFileSync(path.join(base,'browser-attempt.json'),JSON.stringify({phase,request_id,started_at:new Date(finished-1000).toISOString()}));fs.writeFileSync(path.join(base,'browser-events.json'),JSON.stringify({phase,failure_code:code,structured_failure:{diagnostic},draft_checkpoint_saved:draft,play_journal_saved:play}));fs.writeFileSync(path.join(base,'process/process-exit.json'),JSON.stringify({finished_at:new Date(finished).toISOString(),termination_unconfirmed:!terminated}));return name;}
 return{root,dir,request,error,policy,attempt,now:()=>clock,set:at=>{clock=at;},advance:ms=>{clock+=ms;}};
}
test('only a completed, exact preparation failure records a bounded retry and removes private diagnostic data',t=>{
 const f=fixture(t);assert.equal(f.policy.record(f.request,f.error),null);f.attempt();const r=f.policy.record(f.request,f.error);assert.equal(r.phase,'recover-preparation');assert.equal(r.failure_code,f.error.code);assert.equal(r.consecutive_count,1);assert.equal(Date.parse(r.next_retry_at)-f.now(),180000);assert.ok(!JSON.stringify(r).includes('private-token'));assert.ok(!JSON.stringify(r).includes('private.example'));assert.match(clonePreparationRetryReason(r),/连续失败1次.*北京时间/);assert.deepEqual(f.policy.pending(f.request),r);
});
test('the same ended browser observation cannot increase the retry count or postpone the deadline',t=>{const f=fixture(t);f.attempt();const r=f.policy.record(f.request,f.error);f.advance(1000);assert.deepEqual(f.policy.record(f.request,f.error,{started_at_ms:f.now()-1000}),r);assert.equal(fs.readdirSync(path.join(f.dir,'preparation-retry-history')).length,1);});
test('consecutive no-progress failures back off to a finite thirty-minute cap, without extending the interval on reads',t=>{
 const f=fixture(t);for(let n=0;n<8;n++){f.attempt();const r=f.policy.record(f.request,f.error);assert.equal(r.consecutive_count,n+1);const delay=CLONE_PREPARATION_RETRY_DELAYS_MS[Math.min(n,4)];assert.equal(Date.parse(r.next_retry_at)-f.now(),delay);for(let read=0;read<3;read++)assert.deepEqual(f.policy.pending(f.request),r);f.advance(delay);assert.equal(f.policy.pending(f.request),null);f.advance(1);}
});
test('browser unavailable is checked again after three minutes even after repeated failures',t=>{
 const f=fixture(t),error={code:'STUDIO_PREVIEW_BROWSER_UNAVAILABLE'};
 for(let n=0;n<8;n++){f.attempt({code:error.code});const r=f.policy.record(f.request,error);assert.equal(r.consecutive_count,n+1);assert.equal(Date.parse(r.next_retry_at)-f.now(),180000);assert.deepEqual(f.policy.pending(f.request),r);f.advance(180000);assert.equal(f.policy.pending(f.request),null);f.advance(1);}
});
test('the diagnostic count saturates at the server bound and an upstream future time cannot turn preparation backoff into a permanent hold',t=>{
 const f=fixture(t);f.attempt();f.policy.record(f.request,f.error);const file=path.join(f.dir,'studio-preparation-retry-state.json'),state=JSON.parse(fs.readFileSync(file));state.consecutive_count=1000;fs.writeFileSync(file,JSON.stringify(state));f.advance(1800001);f.attempt();const r=f.policy.record(f.request,{...f.error,code:f.error.code,next_retry_at:new Date(f.now()+86400000).toISOString()});assert.equal(r.consecutive_count,1000);assert.equal(Date.parse(r.next_retry_at)-f.now(),1800000);
});
test('a newly loaded implementation, changed approved binding or real saved draft invalidates the prior wait',t=>{
 const f=fixture(t);f.attempt();f.policy.record(f.request,f.error);const repaired=createClonePreparationRetryPolicy({root:f.root,job_id,now:f.now,implementation_sha256:'e'.repeat(64)});assert.equal(repaired.pending(f.request),null);assert.equal(f.policy.pending({...f.request,binding:{...binding,script_hash:'f'.repeat(64)}}),null);fs.writeFileSync(path.join(f.dir,'studio-draft.json'),'{}');assert.equal(f.policy.pending(f.request),null);
});
test('provider intents, saved Play, real audio and incomplete or foreign attempts never enter this preparation-only retry state',t=>{
 for(const field of ['provider_call_started','provider_result','status']){const f=fixture(t);f.attempt();const request={...f.request,[field]:field==='status'?'provider_unknown':true};assert.equal(f.policy.record(request,f.error),null);assert.equal(f.policy.pending(request),null);}
 for(const name of ['preview-play-intent.json','studio-play-observed.json','preview-loaded-audio.json']){const f=fixture(t);f.attempt();fs.writeFileSync(path.join(f.dir,name),'{}');assert.equal(f.policy.record(f.request,f.error),null);}
 for(const options of [{phase:'preview'},{play:true},{draft:true},{request_id:'acl_'+'0'.repeat(64)},{terminated:false}]){const f=fixture(t);f.attempt(options);assert.equal(f.policy.record(f.request,f.error),null);}
});
test('consumer checks current server identity then skips voice admission and browser entirely during the stored wait',async t=>{
 const f=fixture(t);f.attempt();const r=f.policy.record(f.request,f.error),calls=[],never=()=>{throw Error('no voice admission, browser, quote, claim or Play during this wait');};
 const result=await runAutomaticClone({job:{id:job_id},automatic_clone:{request_id:rid}},{root:f.root,preparationRetryPolicy:f.policy,call:async b=>{calls.push(b);assert.equal(b.action,'automatic_clone_read');return{request:f.request,clone:{is_current:true}};},studioPreviewVoice:{readEvidence:never,generate:never,reconcile:never},workstations:{run:never}});
 assert.equal(result.next_retry_at,r.next_retry_at);assert.equal(result.retry_deferred,true);assert.deepEqual(result.preparation_retry,r);assert.equal(result.claimed,false);assert.equal(calls.length,1);
});
test('worker summary retains exact retry stage, code, consecutive count and time without private diagnostic text',t=>{
 const f=fixture(t);f.attempt();const retry=f.policy.record(f.request,f.error),row={job_id,status:'automatic-clone-native-handoff-required',request_id:rid,preparation_retry:{...retry,diagnostic:'SYNTHETIC_PRIVATE_DIAGNOSTIC'},retry_deferred:true};
 const safe=safeProductionStageFields(row);assert.equal(safe.preparation_retry.failure_code,retry.failure_code);assert.equal(safe.preparation_retry.consecutive_count,1);assert.equal(safe.next_retry_at,retry.next_retry_at);assert.equal(JSON.stringify(safe).includes('SYNTHETIC_PRIVATE_DIAGNOSTIC'),false);
 const business=periodicBusinessResult({productions:[row]});assert.equal(business.productions[0].preparation_retry.phase,'recover-preparation');assert.equal(business.productions[0].next_retry_at,retry.next_retry_at);assert.equal(business.completed,false);assert.equal(business.blocked,true);
});
test('consumer persists exact first preparation failure once; a later pending tick only reads and does not repeat browser or block writes',async t=>{
 const f=fixture(t);let request={...f.request,status:'cost_check_pending'},browser=0;const calls=[];
 const call=async b=>{calls.push(b);if(b.action==='automatic_clone_read')return{request,clone:{is_current:true}};if(b.action==='automatic_clone_preflight')return{request,job:{id:job_id}};if(b.action==='automatic_clone_block'){request={...request,status:'blocked',version:request.version+1,reason:b.reason,preparation_retry:b.preparation_retry};return{request}}throw Error('no generation action '+b.action);};
 const options={root:f.root,preparationRetryPolicy:f.policy,call,studioPreviewVoice:{readEvidence:async()=>{browser++;f.attempt();throw f.error;},generate:()=>{throw Error('never generate')}}},selection={job:{id:job_id},automatic_clone:{request_id:rid}};
 const first=await runAutomaticClone(selection,options),second=await runAutomaticClone(selection,options);assert.equal(browser,1);assert.equal(calls.filter(b=>b.action==='automatic_clone_block').length,1);assert.equal(first.preparation_retry.consecutive_count,1);assert.deepEqual(second.preparation_retry,first.preparation_retry);assert.match(request.reason,/查找原本人声草稿.*STUDIO_PREVIEW_BROWSER_UI_ERROR/);assert.equal(calls.at(-1).action,'automatic_clone_read');
});
