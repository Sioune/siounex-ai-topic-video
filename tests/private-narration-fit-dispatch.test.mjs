import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {isNarrationFitRecoveryCandidate} from '../lib/private-narration-fit-selection.mts';

const ID='job_11111111-1111-4111-8111-111111111111',OTHER='job_22222222-2222-4222-8222-222222222222',CLONE='job_33333333-3333-4333-8333-333333333333';
const candidate=(id=ID,code='measured-speech-frame-budget')=>({job_id:id,queue_id:'native_prep_'+'a'.repeat(64),binding:{scope:'private-video',revision:2,mode_epoch:1,scope_id:'SYNTHETIC-owner-scope',script_hash:'d'.repeat(64),contract_hash:'e'.repeat(64)},status:'blocked',lease_until:null,version:3,executor:'finite-local-private-review-v1',invocation_id:'private-review-11111111-1111-4111-8111-111111111111',missing:[{code,detail:'SYNTHETIC measured complete narration retained'}],checkpoint:{artifacts:[{kind:'local-file',file:'.sites-runtime/authorized-inputs/'+id+'/revision-2/private-review/'+'b'.repeat(64)+'/producer-receipt.json',purpose:'render-receipt',sha256:'c'.repeat(64),size_bytes:1000}]}});

const built=await build({stdin:{contents:"export {nextWork} from './lib/dispatch';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'read-only-narration-dispatch',setup(b){
 b.onResolve({filter:/^\.\/(?:store|production|automatic-clone|native-preparation-handoff)$/},args=>({path:args.path.slice(2),namespace:'narration-fixture'}));
 b.onLoad({filter:/.*/,namespace:'narration-fixture'},args=>({contents:args.path==='store'?"export function db(){return globalThis.__narrationDispatch.db}export function siteArchiveBucket(){throw Error('No archive mutation')}":args.path==='production'?"export async function getJob(id){globalThis.__narrationDispatch.reads.push(id);return {id,is_test:0,status:'approved'}}":args.path==='automatic-clone'?"export async function nextAutomaticClone(skip){globalThis.__narrationDispatch.cloneReads++;return {job:{id:'"+CLONE+"'},kind:'automatic-clone'}}export function automaticCloneDraftContext(){throw Error('No clone mutation')}export function automaticCloneApprovalStatement(){throw Error('No approval')}":"export async function listWaitingNativePreparationHandoffs(skip){globalThis.__narrationDispatch.skipLists.push(skip);return globalThis.__narrationDispatch.waiting.filter(h=>!skip.includes(h.job_id))}export async function nextNativePreparationHandoff(){return null}"}));
 }}]});
const {nextWork}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
function fixture(t,waiting){const state={waiting,cloneReads:0,reads:[],skipLists:[],writes:0,db:{prepare:()=>({bind(){return this},async first(){return null},async all(){return{results:[]}},async run(){state.writes++;throw Error('Selector must never write or claim')}})}};globalThis.__narrationDispatch=state;t.after(()=>delete globalThis.__narrationDispatch);return state;}

test('both measured budget gates require an exact owner-bound blocked producer checkpoint; uncertainty and active work never gain priority',()=>{
 assert.equal(isNarrationFitRecoveryCandidate(candidate()),true);const both=candidate();both.missing.push({code:'complete-narration-over-budget'});assert.equal(isNarrationFitRecoveryCandidate(both),true);assert.equal(isNarrationFitRecoveryCandidate(candidate(ID,'complete-narration-over-budget')),false);
 for(const patch of [{binding:{...candidate().binding,script_hash:'bad'}},{binding:{...candidate().binding,scope:'preparation'}},{status:'claimed'},{status:'completed'},{lease_until:Date.now()+60000},{lease_until:0},{executor:'other'},{invocation_id:null},{base_video:{id:'SYNTHETIC'}},{base_pending_video:{id:'SYNTHETIC'}},{missing:[{code:'material:missing'}]},{missing:[{code:'complete-narration-over-budget'},{code:'material:missing'}]},{checkpoint:{artifacts:[]}},{reconciliation:{state:'unknown'}}])assert.equal(isNarrationFitRecoveryCandidate({...candidate(),...patch}),false,JSON.stringify(patch));
 const h=candidate();h.checkpoint.artifacts[0].file=h.checkpoint.artifacts[0].file.replace(ID,OTHER);assert.equal(isNarrationFitRecoveryCandidate(h),false);
});

test('the first dispatch selects retained narration before a slow Studio clone and performs only reads',async t=>{
 const h=candidate(),f=fixture(t,[h]),before=JSON.stringify(h),result=await nextWork();assert.equal(result.job.id,ID);assert.equal(result.kind,'native-preparation-handoff');assert.equal(result.reconciliation_only,true);assert.equal(result.execution_started,false);assert.equal(result.new_paid_calls,0);assert.equal(f.cloneReads,0);assert.equal(f.writes,0);assert.deepEqual(f.reads,[ID]);assert.equal(JSON.stringify(h),before);
});

test('priority is bounded to the first pick and later work keeps the original clone order, including a second eligible recovery',async t=>{
 const second=candidate(OTHER);second.missing.push({code:'complete-narration-over-budget'});const f=fixture(t,[candidate(),second]);assert.equal(isNarrationFitRecoveryCandidate(second),true);assert.equal((await nextWork()).job.id,ID);const next=await nextWork(undefined,[ID]);assert.equal(next.job.id,CLONE);assert.equal(next.kind,'automatic-clone');assert.equal(f.cloneReads,1);assert.equal(f.writes,0);
});

test('unknown, test and excluded work never gains narration priority, while protected owner holds remain in the skip set',async t=>{
 const h=candidate(),f=fixture(t,[{...h,status:'claimed',lease_until:Date.now()+60000}]);assert.equal((await nextWork()).job.id,CLONE);assert.equal(f.cloneReads,1);assert.ok(f.skipLists[0].includes('job_3c14fe6f-44b0-472c-8455-e75040b695bb'));f.waiting=[h];assert.equal((await nextWork(undefined,[ID])).job.id,CLONE);const before=f.cloneReads,result=await nextWork('SYNTHETIC-test-job');assert.equal(result.job,null);assert.equal(f.cloneReads,before);assert.equal(f.writes,0);
});
