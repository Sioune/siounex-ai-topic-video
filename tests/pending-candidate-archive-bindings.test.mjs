// Synthetic binding inputs only; no owner calls or production state.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingCandidateArchiveBinding,pendingCandidateArchiveBindingMatches,pendingCandidateArchiveJobMatches,PENDING_CANDIDATE_ARCHIVE_JOB} from '../lib/site-file-archive-contract.mts';
const ids=[PENDING_CANDIDATE_ARCHIVE_JOB,'job_b7dcd6bf-682d-429f-9016-7c9f3df41c16','job_38fd8bfd-2949-4d26-8b67-d07a03e6f0b0','job_ed3c8123-59ed-4948-9d99-fdb7067ee522'];
for(const id of ids)test('SYNTHETIC frozen first-intake job requires every current approved binding: '+id,()=>{
 const binding=pendingCandidateArchiveBinding(id);assert.ok(binding);assert.equal(Object.isFrozen(binding),true);assert.equal(binding.revision,id===PENDING_CANDIDATE_ARCHIVE_JOB?3:1);assert.equal(binding.mode_epoch,0);
 const job={id,is_test:0,review_mode:'node',revision:binding.revision,approved_revision:binding.revision,approved_hash:binding.script_hash,mode_epoch:binding.mode_epoch,contract_hash:binding.contract_hash};
 assert.equal(pendingCandidateArchiveJobMatches(job),true);assert.equal(pendingCandidateArchiveBindingMatches(id,{...binding,candidate_id:'SYNTHETIC'}),true);
 for(const patch of [{id:'job_11111111-1111-4111-8111-111111111111'},{is_test:1},{review_mode:'auto'},{review_mode:undefined},{revision:binding.revision+1},{approved_revision:null},{approved_hash:'0'.repeat(64)},{mode_epoch:1},{contract_hash:'0'.repeat(64)}])assert.equal(pendingCandidateArchiveJobMatches({...job,...patch}),false,JSON.stringify(patch));
 for(const field of ['revision','script_hash','mode_epoch','contract_hash'])assert.equal(pendingCandidateArchiveBindingMatches(id,{...binding,[field]:typeof binding[field]==='number'?binding[field]+1:'0'.repeat(64)}),false,field);
});
test('SYNTHETIC first-intake map does not authorize arbitrary, inherited-property or old ordinary routes',()=>{
 for(const id of [null,undefined,'','__proto__','constructor','job_1c2556b8-53d5-4dc0-8d7a-faec60fa36ba','job_79fcd694-545b-4423-971c-984d95b5511c','job_9ef39025-d92e-4770-82d0-05881451c5df','job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee']){assert.equal(pendingCandidateArchiveBinding(id),null);assert.equal(pendingCandidateArchiveBindingMatches(id,{}),false);}
});
