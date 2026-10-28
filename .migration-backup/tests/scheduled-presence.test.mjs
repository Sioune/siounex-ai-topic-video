import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledPresence} from '../scripts/scheduled-presence.mjs';

test('scheduled telemetry records actual start and finish without claiming or granting work',async()=>{
 const calls=[];let tick,cleared=0,time=100000;
 const p=scheduledPresence({call:async b=>calls.push(b),runId:'SYNTHETIC-RUN',startedAt:time,now:()=>time,setTimer:f=>(tick=f,7),clearTimer:id=>{assert.equal(id,7);cleared++}});
 await p.start();time+=16000;await p.pulse();time+=4000;await p.finish('idle');await p.finish('completed');await tick();
 assert.equal(calls.length,3);assert.equal(cleared,1);assert.deepEqual(calls.map(x=>x.state),['active','active','idle']);
 assert.equal(calls[2].last_finished_at,120000);assert.equal(calls[2].next_check_at,280000);assert.equal(calls[2].outcome,'idle');
 assert.ok(calls.every(x=>x.schedule_interval_ms===180000));
 assert.ok(calls.every(x=>x.action==='executor_heartbeat'&&x.job_id===null&&x.scope==='scheduled-poll'&&x.session_id==='SYNTHETIC-RUN'));
 assert.ok(calls.every(x=>x.token===undefined&&x.new_paid_authorization===undefined&&x.quality_approved===undefined));
});

test('a natural production longer than the cadence records a future next check and the actual occupied station',async()=>{
 const calls=[];let time=100000,phase=null;
 const p=scheduledPresence({call:async b=>calls.push(b),runId:'SYNTHETIC-LONG',startedAt:time,now:()=>time,setTimer:()=>1,clearTimer:()=>{},readProgress:()=>phase});
 await p.start();phase='工位占用：合成；排队 2 项';await p.pulse();time+=1900000;await p.finish('blocked');
 assert.equal(calls[1].phase,phase);assert.equal(calls[2].last_finished_at,time);assert.equal(calls[2].next_check_at,2080000);assert.ok(calls[2].next_check_at>time);assert.ok(calls[2].next_check_at-time<=180000);
});

test('finish drains a slow active pulse before idle; no overlap or late active overwrite',async()=>{
 const calls=[];let release,tick;const p=scheduledPresence({runId:'SYNTHETIC-RUN',startedAt:100,now:()=>200,setTimer:f=>(tick=f,9),clearTimer:()=>{},call:async b=>{calls.push(b);if(calls.length===2)await new Promise(r=>release=r)}});
 await p.start();const active=p.pulse();await Promise.resolve();await p.pulse();const done=p.finish('blocked');assert.equal(calls.length,2);release();await active;await done;await tick();assert.equal(calls.length,3);assert.equal(calls[2].state,'idle');assert.equal(calls[2].outcome,'blocked');
});

test('telemetry start failure does not block authorized business; failed pulses remain observable and finite',async()=>{
 let timers=0,business=0;const failures=[];const p=scheduledPresence({call:async()=>{throw Error('SYNTHETIC_START_FAIL')},runId:'SYNTHETIC',startedAt:1,setTimer:()=>timers++,onFailure:e=>failures.push(e.message)});const started=await p.start();business++;await p.finish('failed');assert.equal(started,false);assert.equal(business,1);assert.equal(timers,0);assert.deepEqual(failures,['SYNTHETIC_START_FAIL']);
 const observed=[];let calls=0;const q=scheduledPresence({call:async()=>{if(++calls===2)throw Error('SYNTHETIC_PULSE_FAIL')},runId:'SYNTHETIC',startedAt:1,setTimer:()=>1,clearTimer:()=>{},onFailure:e=>observed.push(e.message)});await q.start();await q.pulse();await q.finish('completed');assert.deepEqual(observed,['SYNTHETIC_PULSE_FAIL']);assert.equal(calls,3);
});
