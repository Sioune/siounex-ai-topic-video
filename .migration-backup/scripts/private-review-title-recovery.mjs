// A known local text-layout failure preserves complete speech. Reconcile its
// immutable project, then adopt processed PCM in the normal new renderer hash.
// This module never starts media, writes a checkpoint or claims a queue.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isTitleRuntimeRecoveryCandidate} from '../lib/private-title-recovery-selection.mts';
import {validatePrivateReviewFinalizationRecovery,privateFinalizationTree} from './private-review-finalization-recovery.mjs';
import {completedPrivateFailureRun} from './private-review-caption-recovery.mjs';
import {processedAudioProof} from './private-review-materials.mjs';
import {currentTitleRuntimeFix} from './title-runtime-fix.mjs';
import {command} from './media-adapter.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const fail=code=>{throw Object.assign(Error(code),{code});};
function audioDescriptor(dir,hash,files){const ref=files.find(f=>f.file==='editable-project.json');if(!ref)fail('PRIVATE_TITLE_RECOVERY_PROJECT_MISSING');return{input_hash:hash,files:[{...ref,file:path.join(dir,ref.file),role:'project'}]};}
export function validateTitleRuntimeResume(r,c,x,newHash,oldHash){
 if(r?.known_title_runtime_failure!==true||r.old_input_hash!==oldHash||r.new_input_hash!==newHash||oldHash===newHash||r.title_runtime_fix_sha256!==currentTitleRuntimeFix().manifest_sha256||!isTitleRuntimeRecoveryCandidate(r.source_handoff)||canonical(r.files)!==canonical(r.recovery?.files))fail('PRIVATE_TITLE_RECOVERY_PROOF_CHANGED');
 validatePrivateReviewFinalizationRecovery(r.recovery,{job:x.job,binding:x.binding,handoff:r.source_handoff,root:x.root,expected_input_hash:oldHash});
 const expected=processedAudioProof(x.job,x.binding,audioDescriptor(r.prior_output_dir,oldHash,r.files),r.prior_output_dir,r.files);
 if(canonical(r.processed_audio)!==canonical(expected))fail('PRIVATE_TITLE_RECOVERY_AUDIO_PROOF_CHANGED');
 return r;
}
async function localProcesses(run){
 if(process.platform!=='win32')fail('PRIVATE_TITLE_RECOVERY_PROCESS_INSPECTION_UNAVAILABLE');
 const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Select-Object Name,ProcessId,CommandLine) | ConvertTo-Json -Compress"],30000);
 try{const rows=JSON.parse(result.out);return Array.isArray(rows)?rows:rows&&typeof rows==='object'?[rows]:[];}catch{fail('PRIVATE_TITLE_RECOVERY_PROCESS_INSPECTION_FAILED');}
}
export async function autoKnownTitleRuntimeRecovery(c,h,{root=process.cwd(),run=command,processSnapshot}={}){
 if(!isTitleRuntimeRecoveryCandidate(h))return null;
 const {validatePrivateProducer,privateProducerInputHash,privateProducerTitleBaselineInputHash}=await import('./private-review-producer.mjs');
 const x=validatePrivateProducer(c,{root}),newHash=privateProducerInputHash(c,{root}),oldHash=privateProducerTitleBaselineInputHash(c,{root}),base=path.join(x.root,'.sites-runtime/authorized-inputs',x.job.id,'revision-'+x.job.revision,'private-review'),dir=path.join(base,oldHash);
 if(oldHash===newHash||!fs.existsSync(dir)||fs.existsSync(path.join(base,newHash)))return null;
 const checkProcesses=async()=>{const rows=await(processSnapshot?processSnapshot():localProcesses(run));if(!Array.isArray(rows))fail('PRIVATE_TITLE_RECOVERY_PROCESS_INSPECTION_FAILED');for(const row of rows){const name=String(row.Name||'').toLowerCase(),line=String(row.CommandLine||'').replaceAll('\\','/').toLowerCase();if(Number(row.ProcessId)!==process.pid&&/^(?:ffmpeg|ffprobe|node|python|dotnet)(?:\.exe)?$/.test(name)&&(line.includes(x.job.id.toLowerCase())||line.includes(dir.replaceAll('\\','/').toLowerCase())))fail('PRIVATE_TITLE_RECOVERY_PROCESS_STILL_ACTIVE');}};
 await checkProcesses();
 const files=privateFinalizationTree(x.root,dir),file=name=>files.find(f=>f.file===name),started=json(path.join(dir,'producer-started.json')),fix=currentTitleRuntimeFix();
 const recovery={queue_id:h.queue_id,version:h.version,output_dir:dir,started_sha256:file('producer-started.json')?.sha256,project_sha256:file('editable-project.json')?.sha256,files,reason:'已结束的往期卡片排版失败；沿精确标题运行时修复保留完整音轨、字幕及模板锁，仅重新合成普通审阅画面。',layout_recovery:{schema:'known-title-runtime-fix-v3',manifest_sha256:fix.manifest_sha256}};
 validatePrivateReviewFinalizationRecovery(recovery,{job:x.job,binding:x.binding,handoff:h,root:x.root,expected_input_hash:oldHash});
 let stepEnd=Date.parse(started.started_at);for(const f of files.filter(f=>/^steps\/[a-f0-9]{64}\.json$/.test(f.file))){const s=json(path.join(dir,f.file)),end=Date.parse(s.finished_at);if(Number.isFinite(end))stepEnd=Math.max(stepEnd,end);}
 const original_run=completedPrivateFailureRun(x.root,x,h,Date.parse(started.started_at),stepEnd),processed_audio=processedAudioProof(x.job,x.binding,audioDescriptor(dir,oldHash,files),dir,files);
 const resume_verified={schema:'verified-private-producer-partial-resume-v1',verification:'actual-byte-checked-known-step-files',known_title_runtime_failure:true,old_input_hash:oldHash,new_input_hash:newHash,prior_output_dir:dir,files,processed_audio,source_handoff:structuredClone(h),recovery,title_runtime_fix_sha256:fix.manifest_sha256,original_run,authorization_reference:x.binding.scope_id+'; '+recovery.reason};
 validateTitleRuntimeResume(resume_verified,c,x,newHash,oldHash);await checkProcesses();if(canonical(privateFinalizationTree(x.root,dir))!==canonical(files))fail('PRIVATE_TITLE_RECOVERY_TREE_CHANGED');
 return{schema:'known-title-runtime-private-review-recovery-v1',known_title_runtime_failure:true,prior_input_hash:oldHash,new_input_hash:newHash,reason:recovery.reason,resume_verified,original_run,files_changed:false,speech_regeneration_authorized:false,audio_processing_authorized:false,new_paid_calls:0,publication_authorized:false};
}
