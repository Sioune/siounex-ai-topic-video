import test from 'node:test';
import assert from 'node:assert/strict';
import {isFrameBudgetRecoveryCandidate} from '../lib/private-frame-budget-selection.mts';

const id='job_11111111-1111-4111-8111-111111111111';
const candidate=()=>({job_id:id,queue_id:'native_prep_'+'a'.repeat(64),binding:{scope:'private-video',revision:2},status:'blocked',lease_until:null,version:3,executor:'finite-local-private-review-v1',invocation_id:'private-review-11111111-1111-4111-8111-111111111111',base_video:null,missing:[{code:'measured-speech-frame-budget',detail:'SYNTHETIC complete retained audio exceeds old conservative budget'}],checkpoint:{artifacts:[{kind:'local-file',file:'.sites-runtime/authorized-inputs/'+id+'/revision-2/private-review/'+'b'.repeat(64)+'/producer-receipt.json',purpose:'render-receipt',sha256:'c'.repeat(64),size_bytes:1000}]}});

test('only an exact blocked frame-budget queue with its retained original producer is a selection hint',()=>{
 assert.equal(isFrameBudgetRecoveryCandidate(candidate()),true);
 for(const patch of [{status:'claimed'},{status:'completed'},{status:'result-unknown'},{lease_until:0},{lease_until:Date.now()+60000},{version:2},{executor:'finite-material-acquisition-v1'},{invocation_id:'private-review-unknown'},{base_video:{id:'SYNTHETIC'}},{base_pending_video:{id:'SYNTHETIC'}},{binding:{scope:'preparation',revision:2}},{binding:{scope:'private-video',revision:3}},{missing:[]},{missing:[{code:'measured-speech-frame-budget'},{code:'material:missing'}]},{missing:[{code:'local-production:unknown'}]},{checkpoint:{artifacts:[]}},{reconciliation:{schema:'native-preclaim-reconciliation-v1',state:'unknown',code:'AUTO_MATERIAL_RESULT_RECONCILIATION_REQUIRED',phase:'automatic-material-selection',fingerprint:'d'.repeat(64),evidence_hashes:[]}}])assert.equal(isFrameBudgetRecoveryCandidate({...candidate(),...patch}),false,JSON.stringify(patch));
 for(const patch of [{kind:'remote-url'},{purpose:'timeline'},{sha256:'bad'},{size_bytes:0},{file:candidate().checkpoint.artifacts[0].file.replace(id,'job_22222222-2222-4222-8222-222222222222')},{file:'.sites-runtime/authorized-inputs/'+id+'/revision-2/private-review/../producer-receipt.json'}]){const h=candidate();Object.assign(h.checkpoint.artifacts[0],patch);assert.equal(isFrameBudgetRecoveryCandidate(h),false,JSON.stringify(patch));}
});

test('the legacy measured gate may accompany the known complete-narration gate, without material gaps or duplicated codes',()=>{
 const h=candidate();h.missing.push({code:'complete-narration-over-budget',detail:'SYNTHETIC complete retained clock'});assert.equal(isFrameBudgetRecoveryCandidate(h),true);h.missing.reverse();assert.equal(isFrameBudgetRecoveryCandidate(h),true);
 for(const missing of [[{code:'complete-narration-over-budget'}],[{code:'measured-speech-frame-budget'},{code:'measured-speech-frame-budget'}],[...h.missing,{code:'material:missing'}],[{code:'measured-speech-frame-budget'},{code:'unknown'}]])assert.equal(isFrameBudgetRecoveryCandidate({...candidate(),missing}),false);
});
