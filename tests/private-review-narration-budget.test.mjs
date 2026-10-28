// All bytes and owner-service results below are synthetic. No speech, media,
// model, browser or real task is run or changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {materialAudioResume} from '../scripts/private-review-materials.mjs';
import {retainedNarrationBudgetStop} from '../scripts/private-review-narration-budget.mjs';
import {automaticMaterialTiming} from '../scripts/automatic-material-timing.mjs';
import {automaticMaterialTiming as policyTiming} from '../scripts/automatic-material-policy-timing.mjs';
import {inspectAutomaticMaterialTiming} from '../scripts/automatic-material-timing-inspection.mjs';
import {runPrivateReviewContinuation} from '../scripts/private-review-continuation.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),ID='job_55555555-5555-4555-8555-555555555555',Q='native_prep_'+'a'.repeat(64);
function fixture(t,{body=1682,outroFrames=119}={}){
 const temp=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(temp,'SYNTHETIC-narration-budget-'));t.after(()=>{assert.equal(path.dirname(root),temp);assert.ok(path.basename(root).startsWith('SYNTHETIC-narration-budget-'));fs.rmSync(root,{recursive:true,force:true});});
 const inputHash='d'.repeat(64),out=path.join(root,'.sites-runtime/authorized-inputs',ID,'revision-1/private-review',inputHash),files=[],put=(name,bytes,role)=>{const file=path.join(out,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);const ref={file,sha256:sha(bytes),size_bytes:Buffer.byteLength(bytes)};if(role)files.push({role,...ref});return{path:name,sha256:ref.sha256};};
 const script='这是保持不变的完整旁白。',content=JSON.stringify({script,storyboard:[{start:0,end:55,narration:script,visual:'SYNTHETIC approved picture',asset_id:'image_0'}]}),binding={revision:1,script_hash:sha(content),mode_epoch:1,contract_hash:'c'.repeat(64),scope_id:'SYNTHETIC-scope',scope:'private-video'},scope={schema:'owner-media-scope-v1',id:binding.scope_id,scope:'private-video',owner_confirmed:true,authorization_source:'owner-private-video',new_paid_authorization:false,publication_authorization:false,quality_approved:false,binding:{revision:1,script_hash:binding.script_hash,mode_epoch:1,contract_hash:binding.contract_hash}},job={id:ID,status:'approved',review_mode:'auto',is_test:0,revision:1,approved_revision:1,approved_hash:binding.script_hash,mode_epoch:1,contract_hash:binding.contract_hash,source_snapshot:JSON.stringify({title:'SYNTHETIC overlong script'}),drafts:[{revision:1,content_hash:binding.script_hash,content}],milestones:['source','script'].map(node=>({node,revision:1,mode_epoch:1,artifact_version:1,status:'approved',artifact_hash:binding.script_hash})),media_continuation:{current_id:scope.id,scope}};
 put('producer-started.json',JSON.stringify({input_hash:inputHash,binding}));put('approved-script.txt',script);const segment=put('speech/timed-0.wav','SYNTHETIC complete timed narration'),voice=put('ordinary-narration.wav','SYNTHETIC complete original ordinary narration','voice'),captions=put('captions.ass','SYNTHETIC exact approved caption text','captions'),outro=put('assets/original-outro.mp4','SYNTHETIC pinned original outro');
 const gap={code:'measured-speech-frame-budget',detail:'SYNTHETIC original measured budget gate'},project={schema:'editable-local-private-review-v1',input_hash:inputHash,job_id:ID,binding,fps:30,script,script_text_sha256:sha(script),body_frames:body,outro_frames:outroFrames,outro:{...outro,version:outroFrames===119?'v5':'legacy',frames:outroFrames},voice,captions,owner_voice_used:false,source_to_timeline:[{index:0,text:script,start_frame:0,end_frame:body,audio:segment,source_speed:1.25,padding_only:true}],caption_cues:[{text:script,start_seconds:0,end_seconds:body/30,alignment:'actual-segment-audio-boundaries',word_alignment_verified:false}],gaps:[gap]};
 put('editable-project.json',JSON.stringify(project),'project');put('editable-project.zip','SYNTHETIC complete retained editable project archive','project_archive');
 const outroFile=path.join(out,outro.path),receipt={schema:'private-review-producer-receipt-v1',status:'materials-blocked',input_hash:inputHash,binding,body_frames:body,output_dir:out,project_file:path.join(out,'editable-project.json'),audio_generated:true,video_generated:false,new_paid_calls:0,missing:[gap],gaps:[gap],files,dependencies:[{file:outroFile,sha256:outro.sha256,size_bytes:fs.statSync(outroFile).size}],qa:{audio_decoded:true,quality_approved:false}},receiptFile=path.join(out,'producer-receipt.json');fs.writeFileSync(receiptFile,JSON.stringify(receipt));
 const artifact={kind:'local-file',file:path.relative(root,receiptFile).replaceAll('\\','/'),sha256:sha(fs.readFileSync(receiptFile)),size_bytes:fs.statSync(receiptFile).size,purpose:'render-receipt'},handoff={queue_id:Q,job_id:ID,binding,status:'blocked',version:3,lease_until:null,missing:[gap],checkpoint:{artifacts:[artifact]}};
 return{job,binding,receipt,project,receiptFile,root,out,handoff};
}

test('inspection distinguishes a valid complete overrun from changed narration identity; production timing still rejects it',t=>{
 const f=fixture(t);assert.equal(inspectAutomaticMaterialTiming({...f}).body_frames,1682);assert.throws(()=>automaticMaterialTiming({...f}),/AUTO_MATERIAL_NARRATION_TIMING_CHANGED/);
 assert.throws(()=>inspectAutomaticMaterialTiming({...f,project:{...f.project,script:'CHANGED'}}),/AUTO_MATERIAL_NARRATION_TIMING_CHANGED/);
});

test('a confirmed retained overrun becomes owner script revision with exact frames and unchanged original files',t=>{
 const f=fixture(t,{body:1982}),before=fs.readFileSync(f.receiptFile),voice=f.receipt.files.find(r=>r.role==='voice'),voiceHash=sha(fs.readFileSync(voice.file)),result=retainedNarrationBudgetStop(f);
 assert.equal(result.status,'owner-script-revision-required');assert.equal(result.measured_timing.total_frames,2101);assert.equal(result.measured_timing.over_budget_frames,301);assert.equal(result.measured_timing.over_budget_seconds,301/30);assert.equal(result.measured_timing.total_seconds,2101/30);assert.equal(result.retained_evidence.voice_sha256,voiceHash);assert.equal(result.new_speech_calls,0);assert.match(result.missing[0].detail,/需要本人缩稿/);
 assert.deepEqual(fs.readFileSync(f.receiptFile),before);assert.equal(sha(fs.readFileSync(voice.file)),voiceHash);
});

test('an obsolete conservative budget gap does not block exact v5 projects within 1800 frames',t=>{
 for(const body of [1680,1681]){const f=fixture(t,{body});assert.equal(retainedNarrationBudgetStop(f),null);assert.equal(automaticMaterialTiming(f).body_frames,body);}
 const legacy=fixture(t,{body:1681,outroFrames:120});assert.equal(retainedNarrationBudgetStop(legacy),null);assert.equal(policyTiming(legacy).body_frames,1681);
});

test('unproven, already-rendered, changed audio or mismatched timing cannot be relabeled as a harmless script stop',t=>{
 const f=fixture(t,{body:1982});assert.equal(retainedNarrationBudgetStop({...f,receipt:{...f.receipt,missing:[]}}),null);assert.equal(retainedNarrationBudgetStop({...f,receipt:{...f.receipt,video_generated:true}}),null);
 fs.appendFileSync(f.receipt.files.find(r=>r.role==='voice').file,'CHANGED');assert.throws(()=>retainedNarrationBudgetStop(f),/MATERIAL_AUDIO_RESUME_FILES_CHANGED/);
 const changed=fixture(t,{body:1982});changed.project.source_to_timeline[0].audio.sha256='0'.repeat(64);assert.throws(()=>retainedNarrationBudgetStop(changed),/PRIVATE_NARRATION_BUDGET_EVIDENCE_CHANGED/);
});

test('natural continuation stops before material resources, discovery, queue claim or voice/render work on every unchanged round',async t=>{
 const f=fixture(t,{body:1982}),before=JSON.stringify(f.job),originalReceipt=fs.readFileSync(f.receiptFile),calls=[],forbidden=()=>{throw Error('SYNTHETIC no material/audio/render/upload work allowed');},call=async b=>{calls.push(b.action);if(b.action==='read')return{job:f.job};if(b.action==='native_preparation_ensure')return{handoff:f.handoff};throw Error('SYNTHETIC no mutation or claim allowed: '+b.action);};
 for(let round=0;round<2;round++){
  const result=await runPrivateReviewContinuation({job:f.job,native_preparation:f.handoff},{root:f.root,call,assessMaterials:()=>({project:f.project,coverage_current:false,missing:[{code:'material:image_0'}]}),prepare:forbidden,resources:forbidden,discover:forbidden,materialInputs:forbidden,produce:forbidden,upload:forbidden});
  assert.equal(result.status,'owner-script-revision-required');assert.equal(result.claimed,false);assert.equal(result.generation_started,false);assert.equal(result.video_generated,false);assert.equal(result.audio_reused,true);assert.equal(result.retry_requires_changed_script,true);assert.equal(result.measured_timing.over_budget_frames,301);
 }
 assert.deepEqual(calls,['read','native_preparation_ensure','read','native_preparation_ensure']);assert.equal(JSON.stringify(f.job),before);assert.deepEqual(fs.readFileSync(f.receiptFile),originalReceipt);
});

 test('60 through 70 seconds uses body retiming eligibility; one frame beyond requires new script',t=>{
 for(const total of [1800,1801,1989,2100]){const f=fixture(t,{body:total-119});assert.equal(retainedNarrationBudgetStop(f),null);assert.equal(policyTiming(f).body_frames,total-119);}
 const f=fixture(t,{body:2101-119});assert.equal(retainedNarrationBudgetStop(f).status,'owner-script-revision-required');assert.throws(()=>policyTiming(f),/AUTO_MATERIAL_NARRATION_REQUIRES_SCRIPT_REVISION/);
});


 test('only exact unrendered budget-gated recordings up to 70 seconds enter processed-audio reuse',t=>{
 for(const body of [1681,1870,1981]){const f=fixture(t,{body}),resume=materialAudioResume(f.job,f.binding,f.receipt,f.receiptFile,'e'.repeat(64),{root:f.root});assert.equal(resume.processed_audio.body_frames,body);assert.equal(resume.processed_audio.voice.sha256,f.project.voice.sha256);}
 const over=fixture(t,{body:1982});assert.throws(()=>materialAudioResume(over.job,over.binding,over.receipt,over.receiptFile,'e'.repeat(64),{root:over.root}),/MATERIAL_PROCESSED_PROJECT_BINDING_CHANGED/);
 const rendered=fixture(t,{body:1870});rendered.receipt.video_generated=true;fs.writeFileSync(rendered.receiptFile,JSON.stringify(rendered.receipt));assert.throws(()=>materialAudioResume(rendered.job,rendered.binding,rendered.receipt,rendered.receiptFile,'e'.repeat(64),{root:rendered.root}),/MATERIAL_PROCESSED_PROJECT_BINDING_CHANGED/);
});
