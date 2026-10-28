import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readMaterialInputs} from '../scripts/material-inputs.mjs';
import {knownProjectMaterials,persistMaterialDiscovery,materialAudioResume,priorBaseVideoReceipt} from '../scripts/private-review-materials.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),id='job_11111111-2222-4333-8444-555555555555';
function fixture(t,storyboard=[{asset_id:'image_0',visual:'A real source still',narration:'script'}]){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'verified-material-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const content=JSON.stringify({script:'script',storyboard}),binding={revision:1,script_hash:sha(content),mode_epoch:2,contract_hash:'c'.repeat(64),scope_id:'scope-1'},job={id,revision:1,approved_hash:binding.script_hash,mode_epoch:2,contract_hash:binding.contract_hash,drafts:[{revision:1,content_hash:binding.script_hash,content}]};
 const dir=path.join(root,'.sites-runtime/authorized-inputs',id,'revision-1');fs.mkdirSync(dir,{recursive:true});return {root,dir,job,binding};
}
test('a changed verified material manifest is observed without changing approved text',t=>{
 const f=fixture(t),file=path.join(f.dir,'real.png');fs.writeFileSync(file,'original still bytes');
 const media={asset_id:'image_0',kind:'image',file,sha256:sha(fs.readFileSync(file)),size_bytes:fs.statSync(file).size},manifest={schema:'verified-material-inputs-v1',job_id:id,binding:f.binding,media:[media],material_coverage:null};
 fs.writeFileSync(path.join(f.dir,'material-inputs.json'),JSON.stringify(manifest));const before=f.job.approved_hash,a=readMaterialInputs(f);
 assert.equal(a.media[0].sha256,media.sha256);assert.equal(f.job.approved_hash,before);
 fs.writeFileSync(file,'different bytes');assert.throws(()=>readMaterialInputs(f),/BYTES_CHANGED/);
});
test('another revision, scope or job directory cannot provide the new footage',t=>{
 const f=fixture(t),file=path.join(f.root,'wrong-job.mp4');fs.writeFileSync(file,'not this job');
 const m={schema:'verified-material-inputs-v1',job_id:id,binding:f.binding,media:[{asset_id:'pending_demo',kind:'video',file,sha256:sha(fs.readFileSync(file)),size_bytes:fs.statSync(file).size}]};
 fs.writeFileSync(path.join(f.dir,'material-inputs.json'),JSON.stringify(m));assert.throws(()=>readMaterialInputs(f),/OUTSIDE_JOB/);
 m.binding={...f.binding,mode_epoch:1};fs.writeFileSync(path.join(f.dir,'material-inputs.json'),JSON.stringify(m));assert.throws(()=>readMaterialInputs(f),/CURRENT_BINDING/);
});
test('an old gap-free receipt is re-audited against the required action instead of re-uploaded',t=>{
 const f=fixture(t,[{asset_id:'pending_interview_or_cup_example',visual:'Need real interview or cup scene',narration:'script'}]),file=path.join(f.dir,'project.json');
 const project={job_id:id,binding:f.binding,gaps:[],source_to_timeline:[{start_frame:0,end_frame:90,media:{asset_id:'pending_interview_or_cup_example',kind:'article-quote',text:'script'}}]};fs.writeFileSync(file,JSON.stringify(project));
 const receipt={binding:f.binding,files:[{role:'project',file,sha256:sha(fs.readFileSync(file)),size_bytes:fs.statSync(file).size}]},audit=knownProjectMaterials(f.job,receipt,{root:f.root});
 assert.equal(audit.coverage_current,false);assert.equal(audit.missing.length,1);assert.equal(audit.missing[0].code,'material:pending_interview_or_cup_example');
});
test('the same cached discovery does not acquire a lease, generate speech or append duplicate reports',async t=>{
 const f=fixture(t),dir=path.join(f.dir,'material-acquisition');fs.mkdirSync(dir);const file=path.join(dir,'attempt.json');fs.writeFileSync(file,'{}');const observed_at='2026-10-20T11:00:00Z';let calls=0;
 const missing=[{code:'material:pending',detail:'exact footage missing'}],r=await persistMaterialDiscovery(f.job,{missing,checkpoint:{note:'最近检查'+observed_at,artifacts:[]}}, {observed_at,attempt_file:file,sha256:sha(fs.readFileSync(file)),size_bytes:2},missing,{root:f.root,call:async()=>{calls++;throw Error('no duplicate step');}});
 assert.equal(calls,0);assert.equal(r.reused,true);
});

test('a cached source discovery still persists a changed actual coverage diagnosis through the normal lease',async t=>{
 const f=fixture(t),file=path.join(f.dir,'attempt.json');fs.writeFileSync(file,'{}');const observed_at='SYNTHETIC same source check',missing=[{code:'material:public_clip',detail:'actual 132-frame narration requires a longer normal-speed range',reason:'reviewed-normal-speed-source-range-too-short'}],h={queue_id:'SYNTHETIC-queue',version:3,missing:[{code:'owner-video-revision-required',detail:'old generic diagnosis'}],checkpoint:{note:'最近检查'+observed_at,artifacts:[]}},calls=[];
 const r=await persistMaterialDiscovery(f.job,h,{observed_at,attempt_file:file,sha256:sha(fs.readFileSync(file)),size_bytes:2,candidates:[]},missing,{root:f.root,call:async b=>{calls.push(b);if(b.action==='native_preparation_claim')return{lease_token:'SYNTHETIC memory token',handoff:{...h,version:4,status:'claimed'}};if(b.action==='native_preparation_progress'){assert.equal(b.version,4);assert.deepEqual(b.missing,missing);return{handoff:{...h,status:'blocked',version:5,missing:b.missing}};}throw Error('Unexpected '+b.action);}});
 assert.deepEqual(calls.map(c=>c.action),['native_preparation_claim','native_preparation_progress']);assert.deepEqual(r.handoff.missing,missing);assert.equal(r.handoff.version,5);
});
test('completed audio resumption refuses changed prior output bytes',t=>{
 const f=fixture(t),hash='a'.repeat(64),out=path.join(f.dir,'private-review',hash);fs.mkdirSync(out,{recursive:true});const voice=path.join(out,'voice.wav');fs.writeFileSync(voice,'known completed voice');
 const receipt={input_hash:hash,binding:f.binding,audio_generated:true,files:[{role:'voice',file:voice,sha256:sha(fs.readFileSync(voice)),size_bytes:fs.statSync(voice).size}]},file=path.join(out,'producer-receipt.json');fs.writeFileSync(file,JSON.stringify(receipt));
 const proof=materialAudioResume(f.job,f.binding,receipt,file,'b'.repeat(64),{root:f.root});assert.equal(proof.old_input_hash,hash);assert.equal(proof.files.length,2);
 fs.appendFileSync(voice,'changed');assert.throws(()=>materialAudioResume(f.job,f.binding,receipt,file,'b'.repeat(64),{root:f.root}),/FILES_CHANGED/);
});

test('a new rework queue restores only the exact rejected video receipt, preserving its completed audio',t=>{
 const f=fixture(t),hash='a'.repeat(64),out=path.join(f.dir,'private-review',hash);fs.mkdirSync(out,{recursive:true});
 const files=['video','project','render_receipt','voice'].map(role=>{const file=path.join(out,role);fs.writeFileSync(file,role+' known bytes');return {role,file,sha256:sha(fs.readFileSync(file)),size_bytes:fs.statSync(file).size};});
 const artifact=JSON.stringify({sha256:files[0].sha256,qa:{local_review_draft_id:'lrd_old',project_sha256:files[1].sha256,render_receipt_sha256:files[2].sha256}}),m={id:'video-1',node:'video',revision:1,status:'revise',artifact_version:1,artifact_hash:sha(artifact),artifact};f.job.milestones=[m];
 const receipt={input_hash:hash,binding:f.binding,files,audio_generated:true,video_generated:true};fs.writeFileSync(path.join(out,'producer-receipt.json'),JSON.stringify(receipt));
 const h={base_video:{id:m.id,artifact_hash:m.artifact_hash,artifact_version:1},binding:f.binding,checkpoint:{artifacts:[]}},found=priorBaseVideoReceipt(f.job,h,{root:f.root});assert.ok(found.file.endsWith(hash+'/producer-receipt.json'));assert.equal(found.sha256,sha(fs.readFileSync(path.join(out,'producer-receipt.json'))));
 f.job.milestones[0]={...m,artifact_hash:'b'.repeat(64)};assert.throws(()=>priorBaseVideoReceipt(f.job,h,{root:f.root}),/BASE_CHANGED/);
});
