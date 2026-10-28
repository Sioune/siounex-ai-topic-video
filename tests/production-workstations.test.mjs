import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionWorkstations,withProductionStation,PRODUCTION_STATIONS,PRODUCTION_STATION_MIN_BUDGET_MS} from '../scripts/production-workstations.mjs';
const gate=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const code=value=>error=>error?.code===value;

test('a job cancelled while waiting never enters its next station; other jobs keep running',async()=>{
 const held=gate(),cancelled=new Set(),begun=[],stations=createProductionWorkstations({beforeStart:async({job_id})=>{if(cancelled.has(job_id))throw Object.assign(Error('cancelled'),{code:'PRODUCTION_CANCELLED'});}});
 const first=stations.run('render','A',async()=>{begun.push('A');await held.promise;});
 const waiting=stations.run('render','B',async()=>{begun.push('B');});
 const rejected=assert.rejects(waiting,code('PRODUCTION_CANCELLED'));
 const next=stations.run('render','C',()=>begun.push('C'));
 await turn();cancelled.add('B');held.resolve();await Promise.all([first,rejected,next]);await stations.drain();assert.deepEqual(begun,['A','C']);assert.equal(stations.snapshot().waiting_count,0);
});

test('voice A and render B overlap, while every workstation capacity remains one',async()=>{
 const events=[],stations=createProductionWorkstations({onEvent:event=>events.push(event)}),voice=gate(),render=gate(),begun=[];
 const a=stations.run('voice','A',async()=>{begun.push('voice-A');await voice.promise;return'audio';});
 const b=stations.run('render','B',async()=>{begun.push('render-B');await render.promise;return'video';});
 await turn();assert.deepEqual(begun,['voice-A','render-B']);const during=stations.snapshot();assert.equal(during.active_count,2);assert.equal(during.max_active,2);assert.equal(during.observed_parallel,true);assert.equal(during.stations.voice.active,'A');assert.equal(during.stations.render.active,'B');assert.deepEqual(Object.keys(during.stations),PRODUCTION_STATIONS);
 for(const state of Object.values(during.stations))assert.equal(state.capacity,1);
 let drained=false;const drain=stations.drain().then(result=>{drained=true;return result;});voice.resolve();assert.equal(await a,'audio');await turn();assert.equal(drained,false);assert.equal(stations.snapshot().stations.render.active,'B');render.resolve();assert.equal(await b,'video');const done=await drain;assert.equal(done.active_count,0);assert.equal(done.waiting_count,0);assert.equal(done.max_active,2);assert.deepEqual(events.map(e=>e.event),['started','started','finished','finished']);assert.ok(events.every(e=>Number.isFinite(e.time)&&Object.keys(e).sort().join(',')==='event,job_id,station,time'));
});

test('one render queue is FIFO even when other workstations finish sooner',async()=>{
 const stations=createProductionWorkstations(),first=gate(),second=gate(),begun=[],finished=[];
 const run=(job,hold)=>stations.run('render',job,async()=>{begun.push(job);if(hold)await hold.promise;finished.push(job);return job;});
 const a=run('A',first),b=run('B',second),c=run('C');await turn();assert.deepEqual(begun,['A']);assert.deepEqual(stations.snapshot().stations.render.waiting,['B','C']);assert.equal(await stations.run('assets','D',()=> 'cover'),'cover');assert.deepEqual(begun,['A']);first.resolve();assert.equal(await a,'A');await turn();assert.deepEqual(begun,['A','B']);second.resolve();assert.deepEqual(await Promise.all([b,c]),['B','C']);await stations.drain();assert.deepEqual(finished,['A','B','C']);assert.equal(stations.snapshot().stations.render.max_active,1);
});

test('a queued job occupies no other station and cannot reserve a second resource',async()=>{
 const stations=createProductionWorkstations(),held=gate(),a=stations.run('render','A',()=>held.promise),b=stations.run('render','B',()=> 'B');
 const duplicate=assert.rejects(stations.run('voice','B',()=> 'never'),code('PRODUCTION_STATION_JOB_ACTIVE'));
 assert.equal(await stations.run('voice','C',()=> 'C'),'C');await duplicate;assert.equal(stations.snapshot().stations.render.active,'A');assert.deepEqual(stations.snapshot().stations.render.waiting,['B']);assert.equal(stations.snapshot().stations.voice.active,null);held.resolve();await Promise.all([a,b]);await stations.drain();
});

test('same-job active and nested calls reject immediately rather than deadlocking, then a later stage is allowed',async()=>{
 const stations=createProductionWorkstations(),entered=gate(),held=gate();let nestedStarted=false;
 const a=stations.run('voice','A',async()=>{await assert.rejects(stations.run('render','A',()=>{nestedStarted=true;}),code('PRODUCTION_STATION_JOB_ACTIVE'));entered.resolve();await held.promise;});await entered.promise;
 await assert.rejects(stations.run('voice','A',()=>{}),code('PRODUCTION_STATION_JOB_ACTIVE'));assert.equal(nestedStarted,false);held.resolve();await a;assert.equal(await stations.run('render','A',()=> 'next stage'),'next stage');await stations.drain();
});

test('synchronous and asynchronous failures preserve their original errors and release the next FIFO ticket',async()=>{
 const events=[],stations=createProductionWorkstations({onEvent:event=>events.push(event)}),sync=Error('SYNTHETIC sync'),asyncError=Error('SYNTHETIC async'),order=[];
 const a=stations.run('render','A',()=>{order.push('A');throw sync;}),b=stations.run('render','B',async()=>{order.push('B');throw asyncError;}),c=stations.run('render','C',()=>{order.push('C');return'complete';});
 const results=await Promise.allSettled([a,b,c]);assert.equal(results[0].reason,sync);assert.equal(results[1].reason,asyncError);assert.equal(results[2].value,'complete');const done=await stations.drain();assert.deepEqual(order,['A','B','C']);assert.equal(done.stations.render.failed,2);assert.equal(done.stations.render.finished,1);assert.equal(done.active_count,0);assert.equal(done.waiting_count,0);assert.equal(events.filter(e=>e.event==='failed').length,2);
});

test('less than 60 seconds defers before calling fn; exactly 60 seconds may start',async()=>{
 assert.equal(PRODUCTION_STATION_MIN_BUDGET_MS,60000);let entered=0;const events=[],late=createProductionWorkstations({deadline_ms:60999,now:()=>1000,onEvent:e=>events.push(e)});
 await assert.rejects(late.run('voice','A',()=>{entered++;}),code('PRODUCTION_STATION_BUDGET_DEFERRED'));const idle=await late.drain();assert.equal(entered,0);assert.equal(idle.stations.voice.started,0);assert.equal(idle.stations.voice.deferred,1);assert.equal(idle.active_count,0);assert.deepEqual(events,[{event:'deferred',station:'voice',job_id:'A',time:1000}]);const boundary=createProductionWorkstations({deadline_ms:61000,now:()=>1000});assert.equal(await boundary.run('voice','A',()=> 'started'),'started');await boundary.drain();
});

test('waiting tickets expire at the budget boundary while the active function retains its station until actual settlement',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let current=0;const events=[],stations=createProductionWorkstations({deadline_ms:60010,now:()=>current,onEvent:e=>events.push(e)}),held=gate();let waitingStarted=false,drained=false;
 const a=stations.run('voice','A',()=>held.promise),b=stations.run('voice','B',()=>{waitingStarted=true;}),rejected=assert.rejects(b,code('PRODUCTION_STATION_BUDGET_DEFERRED')),drain=stations.drain().then(x=>{drained=true;return x;});await turn();current=11;t.mock.timers.tick(11);await rejected;await turn();assert.equal(waitingStarted,false);assert.equal(drained,false);assert.equal(stations.snapshot().stations.voice.active,'A');assert.equal(stations.snapshot().active_count,1);assert.deepEqual(stations.snapshot().stations.voice.waiting,[]);assert.equal(events.filter(e=>e.event==='finished').length,0);
 await assert.rejects(stations.run('render','C',()=>{}),code('PRODUCTION_STATION_BUDGET_DEFERRED'));held.resolve('finished after deadline');assert.equal(await a,'finished after deadline');assert.equal((await drain).active_count,0);assert.deepEqual(events.filter(e=>e.job_id==='A').map(e=>e.event),['started','finished']);
});

test('budget is checked again after the previous ticket finishes, without starting an expired FIFO successor',async()=>{
 let current=0;const stations=createProductionWorkstations({deadline_ms:100000,now:()=>current}),held=gate(),a=stations.run('render','A',()=>held.promise);let begun=false;const b=stations.run('render','B',()=>{begun=true;}),rejected=assert.rejects(b,code('PRODUCTION_STATION_BUDGET_DEFERRED'));current=40001;held.resolve();await a;await rejected;await stations.drain();assert.equal(begun,false);assert.equal(stations.snapshot().stations.render.finished,1);
});

test('event callback throws and rejected promises cannot break capacity, release or FIFO',async()=>{
 let called=0;const stations=createProductionWorkstations({onEvent:()=>{if(++called%2)throw Error('SYNTHETIC observer failure');return Promise.reject(Error('SYNTHETIC async observer failure'));}}),order=[];assert.deepEqual(await Promise.all(['A','B','C'].map(job=>stations.run('render',job,()=>{order.push(job);return job;}))),['A','B','C']);await stations.drain();assert.deepEqual(order,['A','B','C']);assert.equal(called,6);assert.equal(stations.snapshot().stations.render.max_active,1);assert.equal(stations.snapshot().active_count,0);
});

test('drain includes a follow-on stage scheduled by a settling ticket and waits through another job failure',async()=>{
 const stations=createProductionWorkstations(),first=gate(),second=gate(),other=gate();let drained=false;
 const start=stations.run('voice','A',()=>first.promise),follow=start.then(()=>stations.run('render','A',()=>second.promise)),failed=stations.run('assets','B',async()=>{await other.promise;throw Error('SYNTHETIC failed cover');});const settled=Promise.allSettled([follow,failed]),drain=stations.drain().then(x=>{drained=true;return x;});first.resolve();await start;await turn();assert.equal(stations.snapshot().stations.render.active,'A');assert.equal(drained,false);other.resolve();await turn();assert.equal(drained,false);second.resolve();await settled;assert.equal((await drain).active_count,0);
});

test('all different stations may run together and snapshots cannot mutate queue ownership',async()=>{
 const stations=createProductionWorkstations(),held=gate(),work=PRODUCTION_STATIONS.map((station,n)=>stations.run(station,'JOB-'+n,()=>held.promise));await turn();const observed=stations.snapshot();assert.equal(observed.active_count,PRODUCTION_STATIONS.length);assert.equal(observed.max_active,PRODUCTION_STATIONS.length);observed.stations.voice.active='forged';observed.stations.render.waiting.push('forged');observed.stations.preparation.capacity=100;const actual=stations.snapshot();assert.equal(actual.stations.voice.active,'JOB-1');assert.deepEqual(actual.stations.render.waiting,[]);assert.equal(actual.stations.preparation.capacity,1);held.resolve();await Promise.all(work);assert.equal((await stations.drain()).active_count,0);
});

test('compatibility wrapper calls the original function directly without a manager and preserves results and errors',async()=>{
 assert.equal(await withProductionStation(undefined,'legacy-name','A',()=>42),42);assert.equal(await withProductionStation(null,'legacy-name','A',async()=>43),43);const error=Error('SYNTHETIC existing error');await assert.rejects(withProductionStation(undefined,'render','A',()=>{throw error;}),e=>e===error);const stations=createProductionWorkstations();assert.equal(await withProductionStation(stations,'archive','A',()=>44),44);assert.equal((await stations.drain()).stations.archive.finished,1);
});

test('invalid input never reserves a job or station',async()=>{
 for(const options of [{deadline_ms:NaN},{deadline_ms:-1},{onEvent:3},{now:null}])assert.throws(()=>createProductionWorkstations(options),code('PRODUCTION_STATION_INPUT_INVALID'));assert.throws(()=>createProductionWorkstations({now:()=>NaN}),code('PRODUCTION_STATION_CLOCK_INVALID'));const stations=createProductionWorkstations();for(const args of [['unknown','A',()=>{}],['render','',()=>{}],['render',' A',()=>{}],['render','A\n',()=>{}],['render','A',null]])await assert.rejects(stations.run(...args),code('PRODUCTION_STATION_INPUT_INVALID'));await assert.rejects(withProductionStation({},'render','A',()=>{}),code('PRODUCTION_STATION_INPUT_INVALID'));await assert.rejects(withProductionStation(null,'render','A',null),code('PRODUCTION_STATION_INPUT_INVALID'));const snapshot=await stations.drain();assert.equal(snapshot.active_count,0);assert.equal(snapshot.waiting_count,0);assert.equal(snapshot.max_active,0);
});
