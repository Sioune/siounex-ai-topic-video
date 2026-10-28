import test from 'node:test';import assert from 'node:assert/strict';
import {isWorkstationWaitCandidate} from '../lib/private-workstation-selection.mts';
import {periodicBusinessResult} from '../scripts/native-site-token.mjs';
const id='job_11111111-1111-4111-8111-111111111111',other='job_22222222-2222-4222-8222-222222222222';
const candidate=()=>({queue_id:'native_prep_'+'a'.repeat(64),status:'blocked',lease_until:null,binding:{scope:'private-video'},executor:'finite-local-private-review-v1',invocation_id:'private-review-11111111-1111-4111-8111-111111111111',version:3,missing:[{code:'production-station-budget-deferred',detail:'等待下轮原阶段；current_wait_sha256='+'b'.repeat(64)}],checkpoint:{artifacts:[{kind:'local-file',purpose:'render-receipt',file:'.sites-runtime/authorized-inputs/'+id+'/revision-1/private-review-station-waits/workstation-wait-'+'b'.repeat(64)+'.json',sha256:'b'.repeat(64),size_bytes:900}]}});
test('a workstation wait is only a strict queue hint, requiring an immutable receipt',()=>{
 assert.equal(isWorkstationWaitCandidate(candidate()),true);
 for(const mutate of [v=>v.status='claimed',v=>v.lease_until=1,v=>v.binding.scope='preparation',v=>v.executor='unknown',v=>v.invocation_id='unknown',v=>v.version=2,v=>v.missing.push({code:'unknown-result'}),v=>v.missing[0].code='generic-budget',v=>v.checkpoint.artifacts=[],v=>v.checkpoint.artifacts[0].purpose='timeline',v=>v.checkpoint.artifacts[0].sha256='unknown',v=>v.checkpoint.artifacts.push(structuredClone(v.checkpoint.artifacts[0]))]){const v=candidate();mutate(v);assert.equal(isWorkstationWaitCandidate(v),false);}
});
test('only the explicitly current wait SHA is selected when old wait history remains',()=>{
 const v=candidate(),old=structuredClone(v.checkpoint.artifacts[0]);old.sha256='c'.repeat(64);old.file=old.file.replace('b'.repeat(64),'c'.repeat(64));v.checkpoint.artifacts.unshift(old);assert.equal(isWorkstationWaitCandidate(v),true);delete v.missing[0].detail;assert.equal(isWorkstationWaitCandidate(v),false);v.missing[0].detail='current_wait_sha256='+'d'.repeat(64);assert.equal(isWorkstationWaitCandidate(v),false);v.missing[0].detail='current_wait_sha256='+'b'.repeat(64)+' current_wait_sha256='+'c'.repeat(64);assert.equal(isWorkstationWaitCandidate(v),false);
});
const prepared={job_id:id,status:'post-video-prepared',plan_id:'post_video_prep_'+'a'.repeat(64),archives:['cover_3_4','cover_4_3','promotion','complete_bundle'].map((role,i)=>({role,status:'confirmed',id:'sitefile_'+String(i+1).repeat(64)}))};
test('a successful prepared package never hides a different parallel job failure',()=>{
 const summary=periodicBusinessResult({productions:[prepared],job_results:[{job_id:other,kind:'automatic-clone',status:'scheduled-pass-failed',failure:{code:'UNCLASSIFIED_FAILURE',message:'SYNTHETIC_SECRET'},token:'SYNTHETIC_SECRET'}]});
 assert.equal(summary.completed,false);assert.equal(summary.blocked,true);assert.equal(summary.in_progress,false);assert.equal(summary.outcome,'parallel-production-needs-attention');assert.equal(summary.productions[0].status,'post-video-prepared');assert.equal(summary.job_results[0].retry_without_reconciliation,false);assert.equal(JSON.stringify(summary).includes('SYNTHETIC_SECRET'),false);
});
test('a successful prepared package never reports completion while another job waits for its workstation budget',()=>{
 const summary=periodicBusinessResult({productions:[prepared],job_results:[{job_id:other,kind:'automatic-clone',status:'scheduled-budget-deferred',budget_exhausted:true}]});assert.equal(summary.completed,false);assert.equal(summary.blocked,false);assert.equal(summary.in_progress,true);assert.equal(summary.outcome,'parallel-production-deferred');assert.equal(summary.productions[0].status,'post-video-prepared');
});
for(const status of ['promotion-result-unknown','session-time-low','needs-cover-file','review-output-reconciliation-required','unsupported-queue-kind','media-result-unknown','media-blocked'])test('prepared results retain a different terminal '+status,()=>{
 const terminal={status:status.startsWith('media-')?'unattended-media-returned':'bounded-pass-returned',job_id:other,result:{status},after:{id:other,status:'approved'}};
 const summary=periodicBusinessResult({productions:[prepared],terminal_results:[terminal],job_results:[{job_id:other,kind:'promotion-package',status}]});assert.equal(summary.completed,false);assert.equal(summary.blocked,status!=='session-time-low');assert.equal(summary.productions[0].status,'post-video-prepared');assert.equal(summary.waiting_jobs[0].job_id,other);
});
for(const reason of ['promotion-invalid-result','promotion-original-session-pending','review-result-reconciliation-required','needs-source-input'])test('prepared results cannot erase a different blocked '+reason,()=>{
 const summary=periodicBusinessResult({productions:[prepared],blocked:[{job_id:other,reason}],job_results:[{job_id:other,kind:'promotion-package',status:'stage-settled'}]});assert.equal(summary.completed,false);assert.equal(summary.blocked,true);assert.equal(summary.waiting_jobs[0].job_id,other);
});
test('top-level budget deferral cannot become completed because another package is prepared',()=>{const summary=periodicBusinessResult({status:'scheduled-budget-deferred',productions:[prepared]});assert.equal(summary.completed,false);assert.equal(summary.blocked,false);assert.equal(summary.in_progress,true);});
test('an unknown terminal result remains blocked when the enclosing pass reaches its budget boundary',()=>{
 for(const includeTerminal of [true,false]){const terminal={status:'bounded-pass-returned',job_id:other,result:{status:'promotion-result-unknown'},after:{id:other,status:'approved'}},summary=periodicBusinessResult({...terminal,status:'scheduled-budget-deferred',productions:[prepared],...(includeTerminal?{terminal_results:[terminal]}:{}),job_results:[{job_id:other,kind:'promotion-package',status:'promotion-result-unknown'}]});assert.equal(summary.completed,false);assert.equal(summary.blocked,true);assert.equal(summary.in_progress,false);assert.equal(summary.waiting_jobs[0].job_id,other);assert.equal(summary.retry_without_reconciliation,false);}
});
test('legacy archive budget progress is resumable but never a finished media operation',()=>{
 const terminal={status:'unattended-media-returned',job_id:other,result:{status:'media-budget-deferred',operation_id:'SYNTHETIC-operation',budget_exhausted:true,resume_same_archives:true}},single=periodicBusinessResult(terminal);assert.equal(single.completed,false);assert.equal(single.blocked,false);assert.equal(single.in_progress,true);
 const mixed=periodicBusinessResult({productions:[prepared],terminal_results:[terminal],job_results:[{job_id:other,kind:'media',status:'media-budget-deferred'}]});assert.equal(mixed.completed,false);assert.equal(mixed.blocked,false);assert.equal(mixed.in_progress,true);
 const unproven=periodicBusinessResult({...terminal,result:{status:'media-budget-deferred'}});assert.equal(unproven.blocked,true);assert.notEqual(unproven.in_progress,true);
});
