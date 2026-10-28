// Real SQLite selection; all jobs and approvals are synthetic, with no writes
// allowed through the selector and no provider, browser or media execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {AUTOMATIC_CLONE_SCHEMA,AUTOMATIC_CLONE_VOICE} from '../lib/automatic-clone-contract.mts';
import {STUDIO_PREVIEW_PREPARATION_BUDGET_DEFERRED as CODE} from '../scripts/heygen-studio-preview-bridge.mjs';
import {runAutomaticClone} from '../scripts/automatic-clone-consumer.mjs';

const built=await build({stdin:{contents:"export {nextAutomaticClone} from './lib/automatic-clone';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-clone-budget-priority',setup(b){
 b.onResolve({filter:/^\.\/(?:store|production|local-review-draft)$/},a=>a.path==='./store'||a.importer.replaceAll('\\','/').endsWith('/lib/automatic-clone.ts')?{path:a.path.slice(2),namespace:'budget-fixture'}:null);
 b.onLoad({filter:/.*/,namespace:'budget-fixture'},a=>({contents:a.path==='store'?"export function db(){return globalThis.__cloneBudgetPriority.db}export function siteArchiveBucket(){throw Error('No archive operations')}":a.path==='production'?"export async function getJob(id){return globalThis.__cloneBudgetPriority.jobs.get(id)}":"export async function localReviewMilestoneDecisionContext(){return {sql:'SYNTHETIC-current-owner-approval',args:[]}}export function readLocalReviewDraft(){throw Error('No draft reads')}export function readLocalReviewDraftStatus(){throw Error('No draft reads')}"}));
}}]});
const {nextAutomaticClone}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));

function fixture(t){
 const sql=new DatabaseSync(':memory:'),jobs=new Map();sql.exec('CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE production_jobs(id TEXT PRIMARY KEY,owner_id TEXT,is_test INTEGER,status TEXT DEFAULT \'approved\')');
 const db={prepare:q=>({bind(...args){return{async first(){return sql.prepare(q).get(...args)||null},async all(){if(q.startsWith('SELECT j.id FROM production_jobs j JOIN'))return{results:[]};return{results:sql.prepare(q).all(...args)}},async run(){throw Error('Selector must not write')}}}}),batch:async()=>{throw Error('Selector must not mutate or claim')}};
 globalThis.__cloneBudgetPriority={db,jobs};t.after(()=>{delete globalThis.__cloneBudgetPriority;sql.close()});let index=0;
 function add({status='blocked',reason='STUDIO_PREVIEW_DRAFT_DISCOVERY_UNKNOWN',created_at='2026-10-22T01:00:00Z',...patch}={}){
  const digit=String(++index),id='job_'+digit.repeat(8)+'-'+digit.repeat(4)+'-4'+digit.repeat(3)+'-8'+digit.repeat(3)+'-'+digit.repeat(12),rid='acl_'+digit.repeat(64),owner='SYNTHETIC-owner',binding={revision:1,script_hash:'a'.repeat(64),mode_epoch:0,contract_hash:'b'.repeat(64)},m={id:'SYNTHETIC-video-'+digit,node:'video',revision:1,mode_epoch:0,status:'approved',artifact_hash:'c'.repeat(64),artifact_version:1,report:'SYNTHETIC-owner-report-'+digit};
  jobs.set(id,{id,owner_id:owner,is_test:0,status:'approved',review_mode:'auto',revision:1,mode_epoch:0,approved_hash:binding.script_hash,contract_hash:binding.contract_hash,media_continuation:{current_id:'SYNTHETIC-scope'},milestones:[m],reviews:[{id:'SYNTHETIC-first-'+digit,reviewer:owner,decision:'approve',content_hash:m.artifact_hash,note:m.report}]});sql.prepare('INSERT INTO production_jobs(id,owner_id,is_test) VALUES(?,?,0)').run(id,owner);
  const p={schema:AUTOMATIC_CLONE_SCHEMA,id:rid,job_id:id,owner_id:owner,version:3,status,reason,created_at,updated_at:created_at,binding,scope_id:'SYNTHETIC-scope',first_review_id:'SYNTHETIC-first-'+digit,base:{milestone_id:m.id,artifact_hash:m.artifact_hash,artifact_version:1},voice_id:AUTOMATIC_CLONE_VOICE.id,engine:'starfish',acquisition_method:'heygen_studio_audio_preview',new_payment_limit:0,new_clone_allowed:false,api_fallback_allowed:false,publication_authorized:false,...patch};
  sql.prepare('INSERT INTO app_state VALUES(?,?)').run('automatic_local_clone_v1:'+id+':'+rid,JSON.stringify(p));return p;
 }
 return{sql,jobs,add,snapshot:()=>JSON.stringify(sql.prepare('SELECT * FROM app_state ORDER BY key').all())};
}

test('same original budget-deferred request precedes older ordinary blockers without changing any request',async t=>{
 const f=fixture(t),older=f.add(),preferred=f.add({reason:'SYNTHETIC original preparation remains pending（'+CODE+'）',created_at:'2026-10-22T02:00:00Z'}),before=f.snapshot();
 const selected=await nextAutomaticClone();assert.equal(selected.job.id,preferred.job_id);assert.equal(selected.automatic_clone.request_id,preferred.id);assert.equal(selected.automatic_clone.version,preferred.version);assert.equal(selected.automatic_clone.reconciliation_only,false);assert.equal((await nextAutomaticClone([preferred.job_id])).job.id,older.job_id);assert.equal(f.snapshot(),before);
});

for(const status of ['cost_check_pending','queued','audio_ready'])test(status+' remains ahead of a budget-deferred blocker',async t=>{
 const f=fixture(t);f.add({reason:CODE});const ready=f.add({status,created_at:'2026-10-22T03:00:00Z'});assert.equal((await nextAutomaticClone()).job.id,ready.job_id);
});

test('same priority retains created-at FIFO instead of updated-at recency',async t=>{
 const f=fixture(t),older=f.add({reason:CODE,updated_at:'2026-10-22T10:00:00Z'});f.add({reason:CODE,created_at:'2026-10-22T02:00:00Z'});assert.equal((await nextAutomaticClone()).automatic_clone.request_id,older.id);
});

for(const patch of [
 {reason:'STUDIO_PREVIEW_DRAFT_NOT_FOUND'},
 {reason:'SYNTHETIC（'+CODE+'） unverified suffix'},
 {reason:'SYNTHETIC（'+CODE.replaceAll('_','X')+'）'},
 {reason:CODE,acquisition_method:'heygen_create_speech'},
 {reason:CODE,lease_hash:'SYNTHETIC-active-lease'},
 {reason:CODE,lease_until:Date.now()+600000},
 {reason:CODE,provider_call_started:true},
 {reason:CODE,provider_result:{audio_sha256:'d'.repeat(64)}}
])test('old, imprecise, non-Studio or non-pristine blocker does not gain budget priority '+JSON.stringify(patch),async t=>{
 const f=fixture(t),older=f.add();f.add({created_at:'2026-10-22T02:00:00Z',...patch});assert.equal((await nextAutomaticClone()).job.id,older.job_id);
});

test('a changed approval remains ineligible even when its old reason has budget priority',async t=>{
 const f=fixture(t),older=f.add(),stale=f.add({reason:CODE,created_at:'2026-10-22T02:00:00Z'});f.jobs.get(stale.job_id).approved_hash='e'.repeat(64);assert.equal((await nextAutomaticClone()).job.id,older.job_id);
});

test('consumer persists the exact safe budget code on the same request without quote, provider claim or Play',async()=>{
 const id='job_11111111-1111-4111-8111-111111111111',rid='acl_'+'a'.repeat(64),job={id,review_mode:'auto',mode_epoch:0},calls=[];let request={id:rid,version:3,status:'blocked',reason:'STUDIO_PREVIEW_DRAFT_NOT_FOUND',workflow_mode:'auto',acquisition_method:'heygen_studio_audio_preview',binding:{revision:1,script_hash:'b'.repeat(64),mode_epoch:0}};
 const call=async b=>{calls.push(b);if(b.action==='automatic_clone_read')return{clone:{is_current:true},request};if(b.action==='automatic_clone_preflight')return{job,request};if(b.action==='automatic_clone_block'){request={...request,version:request.version+1,status:'blocked',reason:b.reason};return{request}}throw Error('No quote, claim, checkpoint or provider operation is permitted')};
 let reads=0;const result=await runAutomaticClone({job,kind:'automatic-clone',automatic_clone:{request_id:rid}},{call,studioPreviewVoice:{readEvidence:async()=>{reads++;throw Object.assign(Error('SYNTHETIC private browser details are not persisted'),{code:CODE})},generate:()=>{throw Error('No Play')}}});
 assert.equal(result.claimed,false);assert.equal(result.generation_started,false);assert.equal(request.id,rid);assert.equal(request.status,'blocked');assert.equal(request.reason.endsWith('（'+CODE+'）'),true);assert.equal(request.reason.includes('private browser'),false);assert.equal(reads,1);assert.deepEqual(calls.map(c=>c.action),['automatic_clone_read','automatic_clone_preflight','automatic_clone_block']);assert.equal(request.provider_call_started,undefined);assert.equal(request.provider_result,undefined);
});
