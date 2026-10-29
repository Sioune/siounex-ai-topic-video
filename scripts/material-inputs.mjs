import {bodyStoryboard} from '../lib/storyboard-segments.mts';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateMaterialCoverage} from '../lib/material-coverage.mts';
import {effectiveProductionStoryboard} from '../lib/production-visual-plan.mts';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fail=code=>{throw Object.assign(Error(code),{code})};
const exactBinding=(job,binding)=>({revision:job.revision,script_hash:job.approved_hash,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash,scope_id:binding.scope_id});

// This is the verified-input boundary, not a download-directory glob. Discovery
// candidates remain unavailable to the renderer until exact semantic coverage
// has been recorded for this approved storyboard and these local bytes.
export function readMaterialInputs({job,binding,root=process.cwd()}={}){
 const base=fs.realpathSync(root),scope=path.resolve(base,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision),manifest=path.join(scope,'material-inputs.json');
 if(!fs.existsSync(manifest))return {media:[],material_coverage:null,material_set_hash:null,manifest_file:null};
 if(fs.lstatSync(manifest).isSymbolicLink())fail('MATERIAL_INPUT_MANIFEST_LINK');
 const bytes=fs.readFileSync(manifest);if(bytes.length>1000000)fail('MATERIAL_INPUT_MANIFEST_TOO_LARGE');
 const value=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),expected=exactBinding(job,binding);
 if(value.schema!=='verified-material-inputs-v1'||value.job_id!==job.id||canonical(value.binding)!==canonical(expected)||!Array.isArray(value.media)||value.media.length>32)fail('MATERIAL_INPUT_CURRENT_BINDING_REQUIRED');
 const draft=job.drafts?.find(d=>d.revision===job.revision&&d.content_hash===job.approved_hash);
 if(!draft||sha(draft.content)!==job.approved_hash)fail('MATERIAL_INPUT_APPROVED_DRAFT_CHANGED');
 const approved=JSON.parse(draft.content),storyboard=effectiveProductionStoryboard({job_id:job.id,binding:expected,approved_storyboard:bodyStoryboard(approved.storyboard),script:approved.script,plan:value.visual_plan,demonstration_required:approved.demonstration_required===true}),ids=new Set();
 const media=value.media.map(item=>{
  if(!item||typeof item.asset_id!=='string'||ids.has(item.asset_id)||!['image','video','article-quote'].includes(item.kind))fail('MATERIAL_INPUT_MEDIA_ID_INVALID');ids.add(item.asset_id);
  if(item.kind==='article-quote')return {...item};
  if(typeof item.file!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256||'')||!Number.isSafeInteger(item.size_bytes)||item.size_bytes<=0||item.size_bytes>300000000)fail('MATERIAL_INPUT_FILE_REFERENCE_INVALID');
  const file=path.resolve(base,item.file),relative=path.relative(scope,file);
  if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))fail('MATERIAL_INPUT_FILE_OUTSIDE_JOB');
  let current=base;for(const part of path.relative(base,file).split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())fail('MATERIAL_INPUT_FILE_LINK');}
  const data=fs.readFileSync(file);if(data.length!==item.size_bytes||sha(data)!==item.sha256)fail('MATERIAL_INPUT_BYTES_CHANGED');
  return {...item,file};
 });
 validateMaterialCoverage(value.material_coverage,{job_id:job.id,binding:expected,storyboard,media,human_review:job.review_mode==='node'});
 let alignment=null;if(value.material_caption_alignment){const ref=value.material_caption_alignment,file=path.resolve(base,ref.file),relative=path.relative(scope,file);if(!relative||path.isAbsolute(relative)||relative.startsWith('..'+path.sep)||relative==='..'||fs.lstatSync(file).isSymbolicLink()||sha(fs.readFileSync(file))!==ref.sha256)fail('MATERIAL_INPUT_CAPTION_ALIGNMENT_CHANGED');alignment={file,sha256:ref.sha256};}
 const title=typeof value.short_title==='string'&&value.short_title.trim()&&Array.from(value.short_title).length<=16?value.short_title:null;
 return {media,material_coverage:value.material_coverage,visual_plan:value.visual_plan||null,automatic_editing:value.automatic_editing||null,short_title:title,material_caption_alignment:alignment,material_set_hash:sha(canonical({media:value.media,material_coverage:value.material_coverage,visual_plan:value.visual_plan||null,material_caption_alignment:alignment})),manifest_file:manifest,manifest_sha256:sha(bytes)};
}
