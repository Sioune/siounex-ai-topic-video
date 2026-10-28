import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {dispatch} from '../scripts/production-dispatch-executor.mjs';import {frozenSkill} from '../scripts/frozen-skill.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),root=fs.mkdtempSync(path.resolve('.sites-runtime/dispatch-qa-'));
const skill=JSON.parse(fs.readFileSync('production/skill-snapshot/snapshot.json'));assert.ok(frozenSkill({skill_snapshot:JSON.stringify(skill)}).promptText.includes('SKILL.md'));assert.equal(frozenSkill({skill_snapshot:JSON.stringify(skill)}).promptText.includes('[object Object]'),false);
assert.throws(()=>frozenSkill({skill_snapshot:JSON.stringify({...skill,contents:{...skill.contents,'SKILL.md':'changed'}})}));
const old=JSON.parse(fs.readFileSync('production/skill-snapshot/revisions/eb015e0e41f627d1157f6671466d1473e6cb2363/snapshot.json','utf8'));assert.ok(frozenSkill({skill_snapshot:JSON.stringify(old)}).promptText.length>100);
const job={id:'job_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',revision:0,mode_epoch:0,contract_hash:'a'.repeat(64),is_test:1,source_snapshot:JSON.stringify({url:'https://www.qbitai.com/fixture'})},content='Fictional complete source '.repeat(10);let called=0,ran=0;
const call=async body=>{called++;if(body.action==='dispatch_next')return {job,kind:'text'};assert.equal(body.action,'dispatch_source');return {source:{url:JSON.parse(job.source_snapshot).url,content,sha256:sha(content),complete_response:true,source_snapshot_hash:sha(job.source_snapshot),retrieved_at:'TEST'}}};
let r=await dispatch({execute:false},{call,root,run:()=>{ran++}});assert.equal(r.execution_started,false);assert.equal(called,1);assert.equal(ran,0);
const run=async cfg=>{ran++;assert.equal(cfg.job_id,job.id);assert.equal(fs.readFileSync(cfg.source_file,'utf8'),content);assert.equal(cfg.source_url,JSON.parse(job.source_snapshot).url);};
r=await dispatch({execute:true},{call,run,root});assert.equal(r.status,'finite-workflow-returned');assert.equal(ran,1);const oldCalls=called;await dispatch({execute:true},{call:async b=>{assert.equal(b.action,'dispatch_next');return {job,kind:'text'}},run,root});assert.equal(called,oldCalls,'frozen source reused without refetch');
const sourceFile=path.join(root,job.id,job.contract_hash,'source.txt');fs.writeFileSync(sourceFile,'changed');await assert.rejects(()=>dispatch({execute:true},{call,run,root}));assert.equal(ran,2);
r=await dispatch({execute:true},{call:async()=>({job,kind:'media',operation_id:'TEST'}),run,root});assert.equal(r.execution_started,false);assert.equal(r.status,'needs-media-handoff');
console.log('PASS finite runner: scan never claims/generates, exact cached source reused, changed source blocks rework, no blind media calls, full frozen skill object/old revision preserved. Model execution is mocked in this test.');

// A foreground session must use its one selected identity without a second scan.
let scans=0;const exact=await dispatch({execute:true},{selection:{job,kind:'media',operation_id:'TEST'},call:async()=>{scans++;throw Error('Unexpected second selection')},root});assert.equal(scans,0);assert.equal(exact.job_id,job.id);

const coverJob={...job,milestones:[{id:'TEST-cover',node:'cover',artifact:JSON.stringify({sha256:'a'.repeat(64)})}]};const callsBefore=ran;const cover=await dispatch({execute:true},{call:async()=>({job:coverJob,kind:'review',milestone_id:'TEST-cover'}),run,root});assert.equal(cover.status,'needs-cover-file');assert.equal(cover.execution_started,false);assert.equal(ran,callsBefore);console.log('PASS missing actual cover stops before AI reservation/generation.');
