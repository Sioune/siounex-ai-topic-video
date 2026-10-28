// Exercises the actual controller with inert boundaries; never contacts a Site or platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {publishingExecutionWindow} from '../lib/publishing-execution-priority.mts';

const source=fs.readFileSync(new URL('../lib/publishing-controller.ts',import.meta.url),'utf8'),boundaries=new Map();
for(const m of source.matchAll(/import \{([^}]+)\} from '(\.\/[^']+)'/g))if(!['./production-contract','./publishing-execution-priority.mts'].includes(m[2]))boundaries.set(m[2],m[1].split(',').map(s=>s.trim()));
const bundle=await build({entryPoints:['lib/publishing-controller.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'inert-controller-boundaries',setup(b){
 b.onResolve({filter:/^\.\//},args=>boundaries.has(args.path)?{path:args.path,namespace:'inert'}:undefined);
 b.onLoad({filter:/.*/,namespace:'inert'},args=>({contents:boundaries.get(args.path).map(name=>name==='db'?"export function db(){throw Error('Background request unexpectedly reached the database')}" :`export async function ${name}(){globalThis.__publishingPriorityCalls.push('${name}');return {inert:true};}`).join('\n')}));
}}]});
const {publishingAction}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));

test('both local daily windows reserve ten minutes for staging and release background work after the submit window',()=>{
 for(const hour of ['08','18']){
  const slot=Date.parse('2026-10-27T'+hour+':00:00+08:00');
  assert.equal(publishingExecutionWindow(new Date(slot-600001).toISOString()),null);
  assert.equal(publishingExecutionWindow(new Date(slot-600000).toISOString()).phase,'prepare_to_submit');
  assert.equal(publishingExecutionWindow(new Date(slot).toISOString()).phase,'submit_now');
  assert.equal(publishingExecutionWindow(new Date(slot+299999).toISOString()).phase,'submit_now');
  assert.equal(publishingExecutionWindow(new Date(slot+300000).toISOString()),null);
 }
});

test('collection, reserve sync, reconciliation and engagement cannot start ahead of ready submissions',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-27T17:55:00+08:00')});
 globalThis.__publishingPriorityCalls=[];t.after(()=>delete globalThis.__publishingPriorityCalls);
 for(const action of ['run_collection_tick','sync_reserve','reconcile_publications','read_engagement','run_tick']){
  const r=await publishingAction('SYNTHETIC owner',{action},'automation');assert.equal(r.deferred,true);assert.equal(r.no_external_action,true);
 }
 assert.deepEqual(globalThis.__publishingPriorityCalls,[]);
 await assert.rejects(()=>publishingAction('SYNTHETIC owner',{action:'run_collection_tick',force:true},'automation'),/不支持的参数/);
 t.mock.timers.setTime(Date.parse('2026-10-27T18:00:00+08:00'));
 await publishingAction('SYNTHETIC owner',{action:'run_tick'},'automation');assert.deepEqual(globalThis.__publishingPriorityCalls,['runPreparedPublishingTick']);
 globalThis.__publishingPriorityCalls=[];
 t.mock.timers.setTime(Date.parse('2026-10-27T18:05:00+08:00'));
 await publishingAction('SYNTHETIC owner',{action:'read_engagement'},'automation');assert.deepEqual(globalThis.__publishingPriorityCalls,['readPublishingEngagement']);
});
