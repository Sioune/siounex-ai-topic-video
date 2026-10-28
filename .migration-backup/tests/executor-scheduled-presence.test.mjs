// In-memory SQLite and a fixed clock only; no real worker, queue or HTTP calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import fs from 'node:fs';

fs.mkdirSync('.sites-runtime',{recursive:true});
await build({entryPoints:['lib/executor-presence.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/scheduled-presence-test.mjs',plugins:[{name:'memory-presence',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__scheduledPresenceDb}'}));}}]});
const api=await import('../.sites-runtime/scheduled-presence-test.mjs');
const NOW=1800000000000,INTERVAL=900000;
function fixture(t){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 class Statement{constructor(query,args=[]){this.query=query;this.args=args;}bind(...args){return new Statement(this.query,args);}async first(){return sql.prepare(this.query).get(...this.args)||null;}async all(){return {results:sql.prepare(this.query).all(...this.args)};}async run(){return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}}
 const previous=Date.now;let clock=NOW;Date.now=()=>clock;globalThis.__scheduledPresenceDb={prepare:query=>new Statement(query)};t.after(()=>{Date.now=previous;sql.close();});
 return {sql,now:value=>{clock=value;},row:id=>JSON.parse(sql.prepare('SELECT value FROM app_state WHERE key=?').get('executor_presence_v1:'+id).value),raw:id=>sql.prepare('SELECT value FROM app_state WHERE key=?').get('executor_presence_v1:'+id)?.value};
}
function active(changes={}){return {executor_id:'windows-topic-periodic-v1',session_id:'run-one',scope:'scheduled-poll',state:'active',capabilities:['text','review'],job_id:null,pid:null,phase:'checking-authorized-queue',schedule_interval_ms:INTERVAL,last_started_at:NOW,...changes};}
function finish(changes={}){return active({state:'idle',last_started_at:NOW-180000,last_finished_at:NOW-120000,next_check_at:NOW+720000,outcome:'idle',phase:'waiting-next-scheduled-check',...changes});}

test('a 15-minute scheduled pause stays registered after the 45-second online TTL',async t=>{
 const f=fixture(t),record=await api.reportExecutor(finish());
 assert.equal(record.online,false);assert.equal(record.poll_state,'waiting');assert.equal(record.schedule_current,true);assert.equal(record.connection,'scheduled');
 const later=api.presenceProjection(f.row(record.executor_id),NOW+600000);assert.equal(later.online,false);assert.equal(later.poll_state,'waiting');assert.equal(later.automatic_wakeup,true);
 const runtime=await api.executorPresence();assert.equal(runtime.executors.length,1);assert.equal(runtime.automatic_wakeup,true);assert.equal(runtime.ttl_ms,45000);
 const overdue=api.presenceProjection(f.row(record.executor_id),record.next_check_at+api.SCHEDULE_GRACE_MS+1);assert.equal(overdue.poll_state,'overdue');assert.equal(overdue.schedule_current,false);assert.equal(overdue.online,false);
});
test('a normal bounded transfer yield is recorded as in-progress rather than failed or complete',async t=>{const f=fixture(t),record=await api.reportExecutor(finish({outcome:'in-progress'}));assert.equal(record.outcome,'in-progress');assert.equal(record.poll_state,'waiting');assert.equal(record.automatic_wakeup,true);assert.equal((await api.executorPresence()).executors[0].outcome,'in-progress');assert.equal(f.row(record.executor_id).state,'idle');});
test('a three-minute executor can finish a natural production after many skipped triggers',async t=>{
 const f=fixture(t),interval=180000;await api.reportExecutor(active({schedule_interval_ms:interval}));f.now(NOW+1900000);
 const record=await api.reportExecutor(active({state:'idle',schedule_interval_ms:interval,last_finished_at:NOW+1900000,next_check_at:NOW+1980000,outcome:'blocked'}));
 assert.equal(record.online,false);assert.equal(record.state,'idle');assert.equal(record.poll_state,'waiting');assert.equal(record.schedule_interval_ms,interval);
 await assert.rejects(api.reportExecutor({...active({session_id:'next',schedule_interval_ms:interval,last_started_at:NOW+1900000}),state:'idle',last_finished_at:NOW+1900000,next_check_at:NOW+1900000+interval+api.SCHEDULE_GRACE_MS+1,outcome:'idle'}));
});
test('active pulses, an immutable finish and a new run preserve chronological session guards',async t=>{
 const f=fixture(t);assert.equal((await api.reportExecutor(active())).online,true);
 await assert.rejects(api.reportExecutor(active({session_id:'concurrent'})),/在线会话/);
 f.now(NOW+46000);const stale=api.presenceProjection(f.row('windows-topic-periodic-v1'));assert.equal(stale.online,false);assert.equal(stale.poll_state,'checking');
 await api.reportExecutor(active());f.now(NOW+60000);
 const end=finish({last_started_at:NOW,last_finished_at:NOW+60000,next_check_at:NOW+INTERVAL,outcome:'blocked'});await api.reportExecutor(end);const raw=f.raw(end.executor_id);
 await assert.rejects(api.reportExecutor(active()),/巡检已结束/);assert.equal(f.raw(end.executor_id),raw);
 await assert.rejects(api.reportExecutor({...end,outcome:'completed'}),/不可改写/);assert.equal(f.raw(end.executor_id),raw);
 await assert.rejects(api.reportExecutor(active({session_id:'older',last_started_at:NOW-1000})),/旧巡检/);assert.equal(f.raw(end.executor_id),raw);
 f.now(NOW+INTERVAL);const next=await api.reportExecutor(active({session_id:'run-two',last_started_at:NOW+INTERVAL}));assert.equal(next.online,true);assert.equal(next.session_id,'run-two');assert.equal(next.last_finished_at,end.last_finished_at);assert.equal(next.outcome,'blocked');assert.equal(next.next_check_at,null);
 await assert.rejects(api.reportExecutor(end));assert.equal(f.row(end.executor_id).session_id,'run-two');
});
test('legacy isolated QA and explicit test heartbeats never represent a real executor or claim',async t=>{
 const f=fixture(t),legacy={executor_id:'isolated-closure-qa',session_id:'old',state:'active',capabilities:['text'],last_seen:NOW,scope:'finite-foreground',job_id:'job_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'};
 f.sql.prepare('INSERT INTO app_state VALUES(?,?)').run('executor_presence_v1:'+legacy.executor_id,JSON.stringify(legacy));
 const projected=api.presenceProjection(legacy);assert.equal(projected.online,false);assert.equal(projected.job_id,null);assert.equal(projected.scope,'isolated-test');
 const isolated=await api.reportExecutor({executor_id:'verification-only',session_id:'synthetic',scope:'isolated-test',state:'active',capabilities:['text'],job_id:legacy.job_id});assert.equal(isolated.online,false);assert.equal(isolated.job_id,null);
 await api.reportExecutor(finish());const runtime=await api.executorPresence();assert.deepEqual(runtime.executors.map(value=>value.executor_id),['windows-topic-periodic-v1']);assert.equal(runtime.isolated_executor_count,2);
});
test('invalid schedule evidence is rejected before any presence row is written',async t=>{
 const f=fixture(t);
 for(const report of [active({schedule_interval_ms:30000}),active({last_started_at:NOW+31000}),finish({last_finished_at:null}),finish({next_check_at:NOW+INTERVAL+api.SCHEDULE_GRACE_MS+1}),finish({outcome:'made-up-success'}),active({last_finished_at:NOW})])await assert.rejects(api.reportExecutor(report),error=>error.status===400);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM app_state').get().n,0);
});
test('a scheduled completion race has one CAS winner and retains its exact outcome',async t=>{
 const f=fixture(t);await api.reportExecutor(active());f.now(NOW+1000);
 const end=finish({last_started_at:NOW,last_finished_at:NOW+1000,next_check_at:NOW+INTERVAL});
 const results=await Promise.allSettled([api.reportExecutor({...end,outcome:'idle'}),api.reportExecutor({...end,outcome:'failed'})]);
 assert.equal(results.filter(value=>value.status==='fulfilled').length,1);const winner=results.find(value=>value.status==='fulfilled').value;assert.equal(f.row(end.executor_id).outcome,winner.outcome);
});
test('isolating old QA does not remove its capacity reservation or bypass the eight-row limit',async t=>{
 const f=fixture(t);
 for(let i=0;i<8;i++)await api.reportExecutor({executor_id:'isolated-reservation-'+i,session_id:'local',state:'stopped',capabilities:[],job_id:null});
 assert.equal((await api.executorPresence()).executors.length,0);await assert.rejects(api.reportExecutor(finish()),/达到上限/);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM app_state').get().n,8);
});
