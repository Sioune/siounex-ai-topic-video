import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {effectiveProductionStoryboard} from '../lib/production-visual-plan.mts';
const canonical = v => JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sha=v=>createHash('sha256').update(v).digest('hex');
function fixture(){
 const binding={revision:1,script_hash:'a'.repeat(64),mode_epoch:2,contract_hash:'b'.repeat(64),scope_id:'scope-1'},approved_storyboard=[{asset_id:'pending_demo',visual:'original ambitious demo plan',narration:'发布材料称可以交互。',start:0,end:4}],storyboard=[{...approved_storyboard[0],asset_id:'official_real_case_still',visual:'原发布方同案例界面截图，明确作为静态材料展示',material_kind:'image'}],plan={schema:'owner-delegated-production-visual-plan-v1',job_id:'job-1',binding,original_storyboard_sha256:sha(canonical(approved_storyboard)),effective_storyboard_sha256:sha(canonical(storyboard)),script_text_sha256:sha('发布材料称可以交互。'),authorization:{kind:'owner-delegated-material-editing',request_text:'补齐素材并完成视频制作',evidence_reference:'current-owner-request',recorded_at:'2026-10-21T00:00:00+08:00',final_quality_approved:false,publication_authorized:false},narration_changed:false,simulated_evidence_allowed:false,storyboard,changes:[{storyboard_index:0,reason:'已审旁白为材料解读，使用同案例真实图，不声称本人实操',evidence_reference:'actual-original-source-bytes',review_kind:'executor-source-and-narration-match',final_quality_approved:false}]};
 return{job_id:'job-1',binding,approved_storyboard,script:'发布材料称可以交互。',plan};
}
test('delegated visual selection preserves original approved narration and timing with separate final review',()=>{const f=fixture(),before=structuredClone(f.approved_storyboard);assert.equal(effectiveProductionStoryboard(f)[0].material_kind,'image');assert.deepEqual(f.approved_storyboard,before);assert.equal(f.plan.authorization.final_quality_approved,false);});
test('no plan retains the exact approved storyboard',()=>{const f=fixture();assert.equal(effectiveProductionStoryboard({...f,plan:null}),f.approved_storyboard);});
for(const [name,change,code]of[
 ['cross scope',f=>f.plan.binding={...f.binding,scope_id:'another'},'BINDING'],
 ['changed script',f=>f.plan.script_text_sha256='c'.repeat(64),'BINDING'],
 ['changed narration',f=>f.plan.storyboard[0].narration='我实际操作成功','NARRATION'],
 ['changed timing',f=>f.plan.storyboard[0].end=8,'TIMING'],
 ['missing source rationale',f=>f.plan.changes[0].evidence_reference='','EVIDENCE'],
 ['fake final quality approval',f=>f.plan.authorization.final_quality_approved=true,'DELEGATION'],
 ['fake production approval',f=>f.plan.authorization.publication_authorized=true,'DELEGATION'],
 ['simulated evidence',f=>f.plan.simulated_evidence_allowed=true,'DELEGATION'],
 ['changed effective identity',f=>f.plan.effective_storyboard_sha256='d'.repeat(64),'IDENTITY'],
 ['unrecorded change',f=>f.plan.changes=[],'DELEGATION'],
 ['explicit real demonstration',f=>f.demonstration_required=true,'DEMONSTRATION']
])test('visual plan rejects '+name,()=>{const f=fixture();change(f);assert.throws(()=>effectiveProductionStoryboard(f),new RegExp(code));});
