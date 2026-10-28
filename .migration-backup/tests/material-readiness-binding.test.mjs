import test from'node:test';
import assert from'node:assert/strict';
import{materialReadiness,currentPreparationExecution}from'../lib/material-readiness.mts';
import{productionFacts}from'../lib/production-facts.mts';

const clone=v=>structuredClone(v),binding={revision:2,script_hash:'SYNTHETIC-script',mode_epoch:3,contract_hash:'SYNTHETIC-contract'},scopeId='SYNTHETIC-scope-current',problem='SYNTHETIC missing current media';
function job(){return{revision:2,approved_revision:2,approved_hash:binding.script_hash,status:'approved',mode_epoch:3,contract_hash:binding.contract_hash,source_snapshot:JSON.stringify({category:'视觉影像'}),drafts:[{revision:2,content:JSON.stringify({production_ready:false,narration_preflight:{machine_preflight:'blocked',problems:[problem]}})}],media_continuation:{current_id:scopeId,scope:{schema:'owner-media-scope-v1',id:scopeId,scope:'preparation',binding:clone(binding)}},stages:[],reviews:[]};}
function probe(kind){return{stage:kind,status:'ready',review_revision:2,review_hash:binding.script_hash,result:JSON.stringify({schema:'media-input-probe-v1',scope_id:scopeId,binding:clone(binding),attempt:1,receipt:{schema:'media-input-probe-receipt-v1',kind,status:'ready',checks:[{code:'SYNTHETIC-real-file-check',passed:true,detail:'SYNTHETIC checked exact local files'}],cost:0,visual_inspected:false,audio_listened:false,quality_approved:false,publication:false}})};}
const probes=()=>['media_inventory','media_inputs'].map(probe);
function mutateResult(stage,fn){const p=JSON.parse(stage.result);fn(p);stage.result=JSON.stringify(p);}
function material(){return{id:'SYNTHETIC-material',decision:'preparation_materials_v1',revision:2,content_hash:binding.script_hash,note:JSON.stringify({schema:'internal-preparation-materials-v1',binding:clone(binding),verified_at:'2026-10-17T00:00:00Z',assets:[{sha256:'a'.repeat(64),file_name:'SYNTHETIC.mp4',duration_seconds:12,source_url:'https://example.org/SYNTHETIC',rights_status:'pending',observations:'SYNTHETIC verified source recording'}]})};}
function execution(){return{id:'SYNTHETIC-execution',decision:'preparation_execution_v1',revision:2,content_hash:binding.script_hash,note:JSON.stringify({schema:'preparation-execution-record-v1',binding:clone(binding),manifest_sha256:'b'.repeat(64),manifest:{binding:clone(binding),ready:false,native_composition_started:false,quality_approved:false,publication_authorized:false,prepared_at:'2026-10-17T00:00:00Z',body_seconds:40,planned_total_seconds:44,segments:[{}],source_clips:[{}],missing:['SYNTHETIC native assembly']}})};}
function blocked(j){const before=JSON.stringify(j),r=materialReadiness(j);assert.equal(r.material_gate,'blocked');assert.deepEqual(r.material_problems,[problem]);assert.deepEqual(r.draft_material_preflight,[problem]);assert.equal(JSON.stringify(j),before,'projection must preserve historical records');return r;}

test('two fully current scoped technical receipts can satisfy readiness without deleting historical draft problems',()=>{const j=job();j.stages=probes();const before=JSON.stringify(j),r=materialReadiness(j);assert.equal(r.material_gate,'evidence-bound');assert.deepEqual(r.material_problems,[]);assert.deepEqual(r.draft_material_preflight,[problem]);assert.equal(JSON.stringify(j),before);});

test('mode, contract, approval and scope changes cannot inherit old ready stages',async t=>{
 const cases={
  'new mode':j=>j.mode_epoch++,
  'new contract':j=>j.contract_hash='SYNTHETIC-new-contract',
  'unapproved revision':j=>j.approved_revision=1,
  'paused job':j=>j.status='paused',
  'missing scope':j=>delete j.media_continuation,
  'withdrawn scope':j=>j.media_continuation.scope=null,
  'scope identity mismatch':j=>j.media_continuation.current_id='SYNTHETIC-new-scope',
  'scope binding mode mismatch':j=>j.media_continuation.scope.binding.mode_epoch++,
  'scope binding contract mismatch':j=>j.media_continuation.scope.binding.contract_hash='SYNTHETIC-other',
  'missing current epoch':j=>delete j.mode_epoch,
  'missing current contract':j=>delete j.contract_hash,
 };
 for(const[name,change]of Object.entries(cases))await t.test(name,()=>{const j=job();j.stages=probes();change(j);blocked(j);});
});

test('a replacement scope with identical script binding needs its own two ready probes',()=>{const j=job();j.stages=probes();j.media_continuation.current_id=j.media_continuation.scope.id='SYNTHETIC-replacement';blocked(j);mutateResult(j.stages[0],p=>p.scope_id='SYNTHETIC-replacement');blocked(j);mutateResult(j.stages[1],p=>p.scope_id='SYNTHETIC-replacement');assert.equal(materialReadiness(j).material_gate,'evidence-bound');});

test('bare ready status, wrong binding, incomplete or contradictory receipt cannot clear the material gate',async t=>{
 const cases={
  'no result':s=>delete s.result,
  'invalid result':s=>s.result='{',
  'old scope':s=>mutateResult(s,p=>p.scope_id='SYNTHETIC-old'),
  'old epoch':s=>mutateResult(s,p=>p.binding.mode_epoch--),
  'old contract':s=>mutateResult(s,p=>p.binding.contract_hash='SYNTHETIC-old'),
  'missing receipt':s=>mutateResult(s,p=>delete p.receipt),
  'wrong kind':s=>mutateResult(s,p=>p.receipt.kind='media_inventory'),
  'blocked receipt':s=>mutateResult(s,p=>p.receipt.status='blocked'),
  'failed check':s=>mutateResult(s,p=>p.receipt.checks[0].passed=false),
  'no checks':s=>mutateResult(s,p=>p.receipt.checks=[]),
  'quality approval claim':s=>mutateResult(s,p=>p.receipt.quality_approved=true),
 };
 for(const[name,change]of Object.entries(cases))await t.test(name,()=>{const j=job();j.stages=probes();change(j.stages[1]);blocked(j);});
});

test('material facts require complete current binding and an active matching scope, and never imply probe readiness',()=>{const j=job();j.reviews=[material()];const r=materialReadiness(j);assert.equal(r.preparation_materials.assets.length,1);assert.equal(r.material_gate,'blocked');assert.match(r.material_problems[0],/仍需分别核验/);assert.deepEqual(r.draft_material_preflight,[problem]);for(const field of['mode_epoch','contract_hash']){const old=clone(j),v=JSON.parse(old.reviews[0].note);v.binding[field]=field==='mode_epoch'?2:'SYNTHETIC-old';old.reviews[0].note=JSON.stringify(v);assert.equal(blocked(old).preparation_materials,null);}const noScope=clone(j);delete noScope.media_continuation;assert.equal(blocked(noScope).preparation_materials,null);const partial=clone(j),v=JSON.parse(partial.reviews[0].note);delete v.binding.contract_hash;partial.reviews[0].note=JSON.stringify(v);assert.equal(blocked(partial).preparation_materials,null);});

test('explicitly scope-bound material facts cannot attach to a replacement scope',()=>{const j=job(),r=material(),v=JSON.parse(r.note);v.scope_id='SYNTHETIC-old-scope';r.note=JSON.stringify(v);j.reviews=[r];assert.equal(blocked(j).preparation_materials,null);});

test('execution preparation is visible only with current scope and both exact record and manifest bindings',()=>{const j=job();j.reviews=[execution()];assert.equal(currentPreparationExecution(j).id,'SYNTHETIC-execution');assert.equal(productionFacts(j).execution_preparation.id,'SYNTHETIC-execution');assert.equal(materialReadiness(j).material_gate,'blocked');for(const change of[j=>delete j.media_continuation,j=>j.media_continuation.scope=null,j=>j.mode_epoch++,j=>j.contract_hash='SYNTHETIC-new',j=>{const v=JSON.parse(j.reviews[0].note);v.manifest.binding.mode_epoch--;j.reviews[0].note=JSON.stringify(v)},j=>{const v=JSON.parse(j.reviews[0].note);v.scope_id='SYNTHETIC-old';j.reviews[0].note=JSON.stringify(v)}]){const old=clone(j);change(old);assert.equal(currentPreparationExecution(old),null);assert.equal(productionFacts(old).execution_preparation,null);blocked(old);}});

test('stale evidence is ignored while historical review and stage arrays remain unchanged',()=>{const j=job();j.reviews=[material(),execution()];j.stages=probes();j.mode_epoch++;const r=blocked(j);assert.equal(r.preparation_materials,null);assert.equal(currentPreparationExecution(j),null);assert.equal(j.reviews.length,2);assert.equal(j.stages.length,2);});

function approvedSilentTail(bodyCount=2){const j=job(),story=Array.from({length:bodyCount},(_,i)=>({start:i*10,end:(i+1)*10,narration:'SYNTHETIC真实正文。',visual:'SYNTHETIC原图',asset_id:'image_'+i}));story.push({start:bodyCount*10,end:bodyCount*10+4,narration:'',visual:'沿用既有4秒片尾，保留原件。',sound:'无新增旁白；保留原声。',asset_id:''});const old='segments['+bodyCount+'] 缺文字或具体可见画面',body='segments[0] 素材未完成获取与核查',content={production_ready:false,storyboard:story,narration_preflight:{machine_preflight:'blocked',problems:[old,body]}};j.drafts[0].content=JSON.stringify(content);j.milestones=['source','script'].map(node=>({node,revision:j.revision,mode_epoch:j.mode_epoch,artifact_version:1,status:'approved',artifact_hash:j.approved_hash}));return{j,content,old,body};}
test('approved current text does not re-expose a historical silent fixed-tail missing-text error as a current material gap',()=>{for(const count of [1,3,5]){const{j,old,body}=approvedSilentTail(count),before=JSON.stringify(j),facts=productionFacts(j);assert.deepEqual(facts.material_problems,[body]);assert.deepEqual(facts.draft_material_preflight,[old,body]);assert.equal(facts.material_gate,'blocked');assert.equal(facts.script_approved,true);assert.equal(facts.candidate_present,false);assert.equal(JSON.stringify(j),before);}});
test('current projection keeps body defects, real material gaps, non-silent endings and unapproved or stale text bindings',()=>{for(const change of [f=>f.j.milestones[0].status='revise',f=>f.j.milestones[1].artifact_hash='SYNTHETIC-new-script',f=>f.j.milestones[1].mode_epoch++,f=>f.j.approved_revision--,f=>f.content.storyboard.at(-1).narration='新增正文',f=>f.content.storyboard.at(-1).visual='',f=>f.content.storyboard.at(-1).sound='待配旁白',f=>f.content.storyboard.at(-1).asset_id='image_0',f=>f.content.storyboard.at(-1).start++,f=>{f.content.narration_preflight.problems[0]='segments[0] 缺文字或具体可见画面';f.old=f.content.narration_preflight.problems[0];}]){const f=approvedSilentTail();change(f);f.j.drafts[0].content=JSON.stringify(f.content);assert.deepEqual(materialReadiness(f.j).material_problems,[f.old,f.body]);}});
test('a silent-tail display correction alone supplies neither materials nor video approval',()=>{const{j,content,old}=approvedSilentTail();content.narration_preflight.problems=[old];j.drafts[0].content=JSON.stringify(content);const facts=productionFacts(j);assert.ok(facts.material_problems.every(p=>!p.includes('缺文字或具体可见画面')));assert.deepEqual(facts.draft_material_preflight,[old]);assert.equal(facts.material_gate,'blocked');assert.equal(facts.video_approval,'not-recorded');assert.equal(facts.candidate_present,false);});
