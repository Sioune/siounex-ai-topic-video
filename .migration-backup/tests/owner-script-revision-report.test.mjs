import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {periodicBusinessResult} from '../scripts/native-site-token.mjs';
import {writePeriodicJobResult,readPeriodicJobResults} from '../scripts/periodic-diagnostics.mjs';
const action={job_id:'job_11111111-1111-4111-8111-111111111111',status:'owner-script-revision-required',waiting_for:'owner-script-revision-required',claimed:false,generation_started:false,measured_timing:{body_frames:1870,outro_frames:119,total_frames:1989,body_seconds:1870/30,outro_seconds:119/30,total_seconds:66.3,over_budget_frames:189,over_budget_seconds:6.3,max_frames:1800,max_seconds:60}};
test('a proven retained narration budget stop is a real owner action, not another unknown media attempt',()=>{
 const r=periodicBusinessResult({status:'private-review-production-returned',productions:[action],handoffs:[],blocked:[]});
 assert.equal(r.outcome,'owner-script-revision-required');assert.equal(r.blocked,true);assert.equal(r.completed,false);assert.equal(r.owner_actions[0].measured_timing.total_seconds,66.3);assert.equal(r.productions[0].generation_started,false);
});
test('mixed provider unknown retains the separate script action without claiming the provider result',()=>{
 const r=periodicBusinessResult({status:'private-review-production-returned',productions:[action,{job_id:'job_22222222-2222-4222-8222-222222222222',status:'automatic-clone-provider-unknown'}],handoffs:[],blocked:[]});
 assert.equal(r.outcome,'automatic-clone-result-unknown');assert.equal(r.owner_actions.length,1);assert.equal(r.owner_actions[0].waiting_for,action.waiting_for);assert.equal(r.completed,false);
});
test('safe periodic event retains bounded timing and the required action while excluding source text',t=>{
 const cwd=process.cwd(),root=fs.mkdtempSync(path.join(os.tmpdir(),'siounex-owner-action-'));
 t.after(()=>{process.chdir(cwd);assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true});});process.chdir(root);
 const run='2026-10-22T08-00-00.000Z-11111111-1111-4111-8111-111111111111';
 writePeriodicJobResult(run,{...action,script:'SYNTHETIC not for diagnostic storage'});const rows=readPeriodicJobResults(run);
 assert.equal(rows.length,1);assert.equal(rows[0].status,action.status);assert.equal(rows[0].waiting_for,action.waiting_for);assert.equal(rows[0].measured_timing.total_frames,1989);assert.equal(rows[0].script,undefined);
});
