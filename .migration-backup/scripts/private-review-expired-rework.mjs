// Read-only proof for an interrupted LOCAL visual rework. The same expired
// invocation may record this proof; only a later normal claim can do new work.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {command} from './media-adapter.mjs';
import {priorBaseVideoReceipt} from './private-review-materials.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function read(file){if(fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile()||fs.statSync(file).size>2000000)throw Error('unconfirmed local file');const bytes=fs.readFileSync(file);return{value:JSON.parse(bytes),sha256:sha(bytes),size_bytes:bytes.length};}
async function localProcesses(){const r=await command('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Select-Object Name,ProcessId,CommandLine) | ConvertTo-Json -Compress"],30000);return JSON.parse(r.out);}
export async function expiredLocalReworkProof(job,h,{root=process.cwd(),now=Date.now,processSnapshot=localProcesses,priorReceipt=priorBaseVideoReceipt}={}){
 if(job.status!=='approved'||job.is_test||!h.base_video||h.status!=='claimed'||!Number.isSafeInteger(h.lease_until)||h.lease_until>now()||h.executor!=='finite-local-private-review-v1'||!/^private-review-[a-f0-9-]{36}$/.test(h.invocation_id||'')||h.reconciliation)return null;
 const baseRef=priorReceipt(job,h,{root});if(!baseRef)return null;
 const receiptFile=path.resolve(root,baseRef.file),original=read(receiptFile),r=original.value,voice=r.files?.find(f=>f.role==='voice'),project=r.files?.find(f=>f.role==='project');if(!voice||!project||r.audio_generated!==true)return null;
 const p=read(project.file);if(p.sha256!==project.sha256||fs.statSync(voice.file).size!==voice.size_bytes||sha(fs.readFileSync(voice.file))!==voice.sha256)return null;
 const parent=path.resolve(root,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision,'private-review'),claims=(job.reviews||[]).filter(v=>{try{const n=JSON.parse(v.note);return v.decision==='native_preparation_handoff_event'&&v.revision===job.revision&&v.content_hash===job.approved_hash&&n.event==='claim'&&n.queue_id===h.queue_id&&n.invocation_id===h.invocation_id&&canonical(n.binding)===canonical(h.binding);}catch{return false}}),claimAt=Math.max(...claims.map(v=>Date.parse(v.created_at)));if(!Number.isFinite(claimAt))return null;
 const candidates=[];
 for(const e of fs.readdirSync(parent,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&/^[a-f0-9]{64}$/.test(e.name))){const dir=path.join(parent,e.name);if(['producer-receipt.json','site-return.json','provenance.json','unified-render/rendered/full-review.mp4'].some(n=>fs.existsSync(path.join(dir,n))))continue;
  try{const start=read(path.join(dir,'producer-started.json')),partial=read(path.join(dir,'editable-project.json')),approved=fs.readFileSync(path.join(dir,'approved-script.txt'),'utf8'),q=partial.value,s=start.value,started=Date.parse(s.started_at);if(started<claimAt-5000||started>h.lease_until||s.input_hash!==e.name||q.input_hash!==e.name||q.job_id!==job.id||canonical(q.binding)!==canonical(h.binding)||canonical(s.binding)!==canonical(h.binding)||q.script!==p.value.script||approved!==p.value.script||q.script_text_sha256!==p.value.script_text_sha256||q.body_frames!==p.value.body_frames||q.owner_voice_used!==false||q.new_paid_calls!==0||q.publication_authorized!==false||q.voice?.sha256!==voice.sha256)continue;
   const known=path.resolve(dir,q.voice.path),relative=path.relative(dir,known);if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||fs.lstatSync(known).isSymbolicLink()||sha(fs.readFileSync(known))!==voice.sha256)continue;
   candidates.push({dir,input_hash:e.name,project_sha256:partial.sha256,started_sha256:start.sha256,voice_sha256:voice.sha256,started_at:s.started_at});
  }catch{}
 }
 if(candidates.length!==1)return null;const candidate=candidates[0],rows=await processSnapshot();if(!Array.isArray(rows))return null;
 if(rows.some(row=>Number(row.ProcessId)!==process.pid&&/^(?:ffmpeg|ffprobe|node|python|dotnet)(?:\.exe)?$/i.test(String(row.Name||''))&&[job.id,candidate.dir.replaceAll('\\','/')].some(k=>String(row.CommandLine||'').replaceAll('\\','/').toLowerCase().includes(k.toLowerCase()))))return null;
 // Repeat identities after process inspection; no partial render is consumed.
 if(read(path.join(candidate.dir,'editable-project.json')).sha256!==candidate.project_sha256||read(receiptFile).sha256!==original.sha256)return null;
 return{schema:'expired-local-visual-rework-v1',job_id:job.id,queue_id:h.queue_id,invocation_id:h.invocation_id,binding:h.binding,base_video:h.base_video,prior_receipt:baseRef,partial:candidate,original_transport_result:'unchanged-unknown',local_final_video_absent:true,original_complete_voice_verified:true,no_active_local_producer:true,new_speech_calls:0,new_paid_calls:0,quality_approved:false,publication_authorized:false};
}
