// Classify a known retained ordinary recording before material/model work.
// This module only reads exact local evidence; it never changes a script,
// recording speed, audio bytes, approval, queue claim or production artifact.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectAutomaticMaterialTiming} from './automatic-material-timing-inspection.mjs';
import {completedMaterialResumeFiles} from './private-review-materials.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const gap=rows=>Array.isArray(rows)&&rows.some(r=>r?.code==='measured-speech-frame-budget');
const fail=code=>{throw Object.assign(Error(code),{code});};

export function retainedNarrationBudgetStop({job,binding,receipt,project,receiptFile,root=process.cwd()}){
 if(receipt?.schema!=='private-review-producer-receipt-v1'||receipt.status!=='materials-blocked'||receipt.audio_generated!==true||receipt.video_generated!==false||project?.owner_voice_used!==false||!gap(receipt.missing)||!gap(project.gaps))return null;
 const timing=inspectAutomaticMaterialTiming({job,binding,project}),total=timing.body_frames+timing.outro_frames;
 // Up to ten seconds of complete measured overrun is corrected by the normal
 // producer's body-only retiming stage. Only larger overruns need new copy.
 if(total<=2100)return null;
 if(receipt.body_frames!==timing.body_frames||canonical(receipt.binding)!==canonical(binding)||canonical(project.binding)!==canonical(binding)||receipt.qa?.audio_decoded!==true)fail('PRIVATE_NARRATION_BUDGET_EVIDENCE_CHANGED');
 const base=fs.realpathSync(root),file=fs.realpathSync(receiptFile),prior=path.dirname(file),scope=path.resolve(base,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision,'private-review');
 if(path.dirname(prior)!==scope||path.basename(prior)!==receipt.input_hash||path.basename(file)!=='producer-receipt.json'||canonical(JSON.parse(fs.readFileSync(file,'utf8')))!==canonical(receipt))fail('PRIVATE_NARRATION_BUDGET_EVIDENCE_CHANGED');
 const files=completedMaterialResumeFiles(receipt,prior),one=role=>{const rows=receipt.files.filter(f=>f.role===role);if(rows.length!==1)fail('PRIVATE_NARRATION_BUDGET_EVIDENCE_CHANGED');return rows[0];};
 const projectRef=one('project'),voice=one('voice');one('captions');one('project_archive');
 const relativeFile=ref=>{const name=ref?.file||ref?.path;if(typeof name!=='string'||path.isAbsolute(name)||path.win32.isAbsolute(name)||name.split(/[\\/]/).some(p=>!p||p==='..'))fail('PRIVATE_NARRATION_BUDGET_EVIDENCE_CHANGED');return name.replaceAll('\\','/');};
 const retained=(ref,expected)=>{const name=relativeFile(ref),known=files.find(f=>f.file===name);if(!known||known.sha256!==ref.sha256||expected&&known.sha256!==expected.sha256)fail('PRIVATE_NARRATION_BUDGET_EVIDENCE_CHANGED');return known;};
 const projectBytes=fs.readFileSync(projectRef.file||projectRef.path);
 if(canonical(JSON.parse(projectBytes.toString('utf8')))!==canonical(project)||sha(projectBytes)!==projectRef.sha256||retained(project.voice,voice).sha256!==voice.sha256)fail('PRIVATE_NARRATION_BUDGET_EVIDENCE_CHANGED');
 retained(project.outro);
 for(const row of project.source_to_timeline)retained(row.audio);
 const detail='完整实测旁白'+(timing.body_frames/30).toFixed(3)+'秒，加所绑定原片尾'+(timing.outro_frames/30).toFixed(3)+'秒，共'+(total/30).toFixed(3)+'秒，超过60秒硬上限'+((total-1800)/30).toFixed(3)+'秒，已超出10秒自动调速范围。原稿、完整音轨与原片尾均保留，需要本人缩稿后重新走审核；不自动改稿、截断或重录。';
 return {status:'owner-script-revision-required',waiting_for:'owner-script-revision-required',owner_action:'shorten-script-and-submit-new-approval',retry_requires_changed_script:true,missing:[{code:'owner-script-revision-required',detail}],measured_timing:{fps:30,body_frames:timing.body_frames,outro_frames:timing.outro_frames,total_frames:total,body_seconds:timing.body_frames/30,outro_seconds:timing.outro_frames/30,total_seconds:total/30,max_frames:1800,max_seconds:60,over_budget_frames:total-1800,over_budget_seconds:(total-1800)/30},retained_evidence:{producer_receipt_sha256:sha(fs.readFileSync(file)),project_sha256:projectRef.sha256,voice_sha256:voice.sha256,verified_file_count:files.length},new_speech_calls:0,new_paid_calls:0};
}
