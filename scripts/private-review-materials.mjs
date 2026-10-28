import {deriveAuthoritativeNarration} from '../lib/authoritative-narration.mts';
import {bodyStoryboard} from '../lib/storyboard-segments.mts';
import {originalOutroFrames,originalOutroSeconds} from '../lib/outro-contract.mts';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {resolveSegmentMaterial,validateMaterialCoverage} from '../lib/material-coverage.mts';
import {effectiveProductionStoryboard} from '../lib/production-visual-plan.mts';
import {requiresToolDemonstration} from '../lib/tool-demonstration.mts';
import {validateProjectBodyRetiming} from './measured-body-retiming.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fail=code=>{throw Object.assign(Error(code),{code})};

export function availableMaterialCoverage(config,{project}={}){
 const job=config.job,draft=job.drafts.find(d=>d.revision===job.revision&&d.content_hash===job.approved_hash);
 if(!draft||sha(draft.content)!==job.approved_hash||!project?.source_to_timeline)fail('MATERIAL_AVAILABLE_CURRENT_PLAN_REQUIRED');
 const content=JSON.parse(draft.content),storyboard=deriveAuthoritativeNarration(content.script,effectiveProductionStoryboard({job_id:job.id,binding:config.binding,approved_storyboard:bodyStoryboard(content.storyboard),script:content.script,plan:config.visual_plan,demonstration_required:requiresToolDemonstration(JSON.parse(job.source_snapshot||'{}'))})).storyboard,media=config.media||[];
 validateMaterialCoverage(config.material_coverage,{job_id:job.id,binding:config.binding,storyboard,media});
 const used_ranges=new Map(),missing=[];
 for(const [storyboard_index,approved]of storyboard.entries()){
  const row=project.source_to_timeline[storyboard_index];if(!row)fail('MATERIAL_AVAILABLE_TIMELINE_MISSING');
  const result=resolveSegmentMaterial({storyboard_index,approved,media,contract:config.material_coverage,required_frames:row.end_frame-row.start_frame,used_ranges});if(result.gap)missing.push(result.gap);
 }
 return {valid:missing.length===0,missing};
}

export function knownProjectMaterials(job,receipt,{root=process.cwd()}={}){
 const ref=receipt.files?.find(f=>f.role==='project');if(!ref)fail('MATERIAL_REVIEW_PROJECT_MISSING');
 const file=fs.realpathSync(ref.file),base=fs.realpathSync(root),prefix=path.resolve(base,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision);
 if(!file.startsWith(prefix+path.sep)||sha(fs.readFileSync(file))!==ref.sha256||fs.statSync(file).size!==ref.size_bytes)fail('MATERIAL_REVIEW_PROJECT_CHANGED');
 const project=JSON.parse(fs.readFileSync(file,'utf8'));
 if(canonical(project.binding)!==canonical(receipt.binding)||project.job_id!==job.id||project.binding.script_hash!==job.approved_hash||project.binding.revision!==job.revision||project.binding.mode_epoch!==job.mode_epoch||project.binding.contract_hash!==job.contract_hash)fail('MATERIAL_REVIEW_CURRENT_BINDING_REQUIRED');
 const draft=job.drafts.find(d=>d.revision===job.revision&&d.content_hash===job.approved_hash);if(!draft||sha(draft.content)!==job.approved_hash)fail('MATERIAL_REVIEW_DRAFT_CHANGED');
 const content=JSON.parse(draft.content),storyboard=deriveAuthoritativeNarration(content.script,effectiveProductionStoryboard({job_id:job.id,binding:receipt.binding,approved_storyboard:bodyStoryboard(content.storyboard),script:content.script,plan:project.visual_plan,demonstration_required:requiresToolDemonstration(JSON.parse(job.source_snapshot||'{}'))})).storyboard,media=[];
 for(const row of project.source_to_timeline||[]){if(row.media?.kind==='image-sequence')media.push(...row.media.items);else if(row.media)media.push(row.media);}
 const unique=media.filter((m,i)=>media.findIndex(v=>v.asset_id===m.asset_id)===i),used_ranges=new Map(),missing=[];
 try{validateMaterialCoverage(project.material_coverage,{job_id:job.id,binding:receipt.binding,storyboard,media:unique});}catch(error){return {project,coverage_current:false,missing:storyboard.map(s=>({code:'material:'+s.asset_id,detail:s.visual||'素材合同不匹配当前分镜',reason:error.code||error.message}))};}
 for(const [storyboard_index,approved]of storyboard.entries()){
  const row=project.source_to_timeline?.[storyboard_index],required_frames=row?row.end_frame-row.start_frame:1;
  const resolved=resolveSegmentMaterial({storyboard_index,approved,media:unique,contract:project.material_coverage,required_frames,used_ranges});
  if(resolved.gap)missing.push(resolved.gap);
  else {const identity=m=>m?.kind==='image-sequence'?{kind:m.kind,items:m.items.map(a=>({asset_id:a.asset_id,sha256:a.sha256,display_crop:a.display_crop}))}:{kind:m?.kind,asset_id:m?.asset_id,sha256:m?.sha256,display_crop:m?.display_crop,start_seconds:m?.kind==='video'?Number(m.start_seconds||0):undefined,text:m?.kind==='article-quote'?m.text:undefined};if(canonical(identity(resolved.media))!==canonical(identity(row?.media)))missing.push({code:'material:'+approved.asset_id,detail:approved.visual||'实际画面身份与已审素材不一致',reason:'actual-rendered-source-mismatch'});}
 }
 return {project,missing,coverage_current:missing.length===0};
}

export function priorBaseVideoReceipt(job,handoff,{root=process.cwd()}={}){
 const base=handoff.base_video;if(!base)return null;
 const m=job.milestones?.filter(m=>m.node==='video'&&m.revision===job.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(!m||m.status!=='revise'||m.id!==base.id||m.artifact_hash!==base.artifact_hash||m.artifact_version!==base.artifact_version)fail('MATERIAL_REWORK_BASE_CHANGED');
 if(sha(m.artifact)!==m.artifact_hash)fail('MATERIAL_REWORK_BASE_CHANGED');
 const a=JSON.parse(m.artifact);if(!a.qa?.local_review_draft_id||!a.sha256||!a.qa.project_sha256||!a.qa.render_receipt_sha256)fail('MATERIAL_REWORK_PRIOR_LOCAL_ID_REQUIRED');
 const parent=path.resolve(fs.realpathSync(root),'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision,'private-review'),matches=[];
 for(const dir of fs.readdirSync(parent,{withFileTypes:true})){if(!dir.isDirectory()||!/^[a-f0-9]{64}$/.test(dir.name))continue;const file=path.join(parent,dir.name,'producer-receipt.json');if(!fs.existsSync(file)||fs.lstatSync(path.dirname(file)).isSymbolicLink()||fs.lstatSync(file).isSymbolicLink())continue;const bytes=fs.readFileSync(file);if(bytes.length>2000000)continue;const r=JSON.parse(bytes.toString('utf8'));if(r.input_hash!==dir.name||canonical(r.binding)!==canonical(handoff.binding)||!r.files?.some(f=>f.role==='video'&&f.sha256===a.sha256)||!r.files.some(f=>f.role==='project'&&f.sha256===a.qa.project_sha256)||!r.files.some(f=>f.role==='render_receipt'&&f.sha256===a.qa.render_receipt_sha256))continue;matches.push({kind:'local-file',file:path.relative(root,file).split(path.sep).join('/'),sha256:sha(bytes),size_bytes:bytes.length});}
 if(matches.length!==1)fail('MATERIAL_REWORK_PRIOR_AUDIO_RECONCILIATION_REQUIRED');return matches[0];
}

export const COMPLETED_MATERIAL_FILES_SCOPE='completed-receipt-and-audio-v1';

// A completed producer receipt fixes the artifacts and audio that will actually
// be reused. Renderer scratch planes are not dependencies of narration reuse;
// they stay untouched, and this inventory makes no claim about their bytes.
export function completedMaterialResumeFiles(receipt,prior){
 const base=fs.realpathSync(prior),files=new Map();
 if(receipt?.schema!=='private-review-producer-receipt-v1'||receipt.audio_generated!==true||!['files-ready','materials-blocked'].includes(receipt.status)||!Array.isArray(receipt.files)||receipt.files.length>1000||receipt.dependencies&&!Array.isArray(receipt.dependencies))fail('MATERIAL_AUDIO_RESUME_COMPLETED_RECEIPT_REQUIRED');
 const add=(name,reference=null)=>{
  if(typeof name!=='string'||!name)fail('MATERIAL_AUDIO_RESUME_REFERENCE_INVALID');const file=path.resolve(base,name),relative=path.relative(base,file);
  if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))fail('MATERIAL_AUDIO_RESUME_REFERENCE_OUTSIDE');
  let cursor=base;for(const part of relative.split(path.sep)){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())fail('MATERIAL_AUDIO_RESUME_LINK');}
  // A declared, SHA-bound renderer dependency can legitimately exceed the
  // source-media limit (1080p lossless planes do). Keep the bounded archive
  // allowance for exact receipts; unrelated speech files retain their cap.
  const stat=fs.statSync(file);if(!stat.isFile()||stat.size>(reference?500000000:300000000)||files.size>1000)fail('MATERIAL_AUDIO_RESUME_TREE_LIMIT');
  const key=relative.split(path.sep).join('/');let known=files.get(key);if(!known){known={file:key,sha256:sha(fs.readFileSync(file)),size_bytes:stat.size};files.set(key,known);}
  if(reference&&(reference.sha256!==known.sha256||reference.size_bytes!==known.size_bytes))fail('MATERIAL_AUDIO_RESUME_FILES_CHANGED');
 };
 for(const name of ['producer-receipt.json','producer-started.json','approved-script.txt'])add(name);
 for(const ref of [...receipt.files,...(receipt.dependencies||[])])add(ref.file||ref.path,ref);
 const speech=path.join(base,'speech');if(fs.lstatSync(speech).isSymbolicLink()||!fs.statSync(speech).isDirectory())fail('MATERIAL_AUDIO_RESUME_LINK');
 for(const name of fs.readdirSync(speech))if(/^(?:segment-\d{2}\.(?:txt|wav|events\.json)|tempo-\d+\.wav|timed-\d+\.wav)$/.test(name))add(path.join('speech',name));
 return [...files.values()].sort((a,b)=>a.file.localeCompare(b.file));
}

export function materialAudioResume(job,binding,receipt,receiptFile,new_input_hash,{root=process.cwd()}={}){
 const base=fs.realpathSync(root),file=fs.realpathSync(receiptFile),prior=path.dirname(file),prefix=path.resolve(base,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision,'private-review');
 if(path.dirname(prior)!==prefix||path.basename(prior)!==receipt.input_hash||new_input_hash===receipt.input_hash||canonical(receipt.binding)!==canonical(binding)||receipt.audio_generated!==true||!receipt.files?.some(f=>f.role==='voice'))fail('MATERIAL_AUDIO_RESUME_CURRENT_RECEIPT_REQUIRED');
 if(canonical(JSON.parse(fs.readFileSync(file,'utf8')))!==canonical(receipt))fail('MATERIAL_AUDIO_RESUME_RECEIPT_CHANGED');
 for(const ref of [...receipt.files,...(receipt.dependencies||[])]){const actual=fs.realpathSync(ref.file);if(!actual.startsWith(prior+path.sep)||fs.statSync(actual).size!==ref.size_bytes||sha(fs.readFileSync(actual))!==ref.sha256)fail('MATERIAL_AUDIO_RESUME_FILES_CHANGED');}
 const hasProject=receipt.files.some(f=>f.role==='project'),files=hasProject?completedMaterialResumeFiles(receipt,prior):[];
 const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const absolute=path.join(dir,entry.name),stat=fs.lstatSync(absolute);if(stat.isSymbolicLink())fail('MATERIAL_AUDIO_RESUME_LINK');if(stat.isDirectory())walk(absolute);else{if(!stat.isFile()||stat.size>300000000||files.length>1000)fail('MATERIAL_AUDIO_RESUME_TREE_LIMIT');files.push({file:path.relative(prior,absolute).split(path.sep).join('/'),sha256:sha(fs.readFileSync(absolute)),size_bytes:stat.size});}}};if(!hasProject)walk(prior);
 const bytes=fs.readFileSync(file);
 return {schema:'verified-private-material-resume-v1',verification:'actual-byte-checked-completed-audio-and-materials',prior_output_dir:prior,prior_receipt:{file:path.basename(file),sha256:sha(bytes),size_bytes:bytes.length},old_input_hash:receipt.input_hash,new_input_hash,binding,files,...(hasProject?{files_scope:COMPLETED_MATERIAL_FILES_SCOPE,processed_audio:processedAudioProof(job,binding,receipt,prior,files)}:{}),authorization_reference:binding.scope_id+'; current exact verified material manifest changed; preserve completed narration and approved script'};
}

export function processedAudioProof(job,binding,receipt,prior,files){
 const projectRef=receipt.files.find(f=>f.role==='project'),draft=job.drafts?.find(d=>d.revision===job.revision&&d.content_hash===job.approved_hash);
 if(!projectRef||!draft||sha(draft.content)!==job.approved_hash)fail('MATERIAL_PROCESSED_APPROVED_PROJECT_REQUIRED');
 const p=JSON.parse(fs.readFileSync(projectRef.file,'utf8')),content=JSON.parse(draft.content),story=deriveAuthoritativeNarration(content.script,bodyStoryboard(content.storyboard)).storyboard;
 const awaitingRetime=receipt.status==='materials-blocked'&&receipt.video_generated===false&&receipt.missing?.some(m=>['measured-speech-frame-budget','complete-narration-over-budget'].includes(m.code)),maxFrames=awaitingRetime?2100:1800,retimed=validateProjectBodyRetiming(p);
 if(p.schema!=='editable-local-private-review-v1'||p.input_hash!==receipt.input_hash||p.job_id!==job.id||canonical(p.binding)!==canonical(binding)||p.script!==content.script||p.script_text_sha256!==sha(content.script)||p.fps!==30||!Number.isSafeInteger(p.body_frames)||p.body_frames<=0||p.body_frames+originalOutroFrames(p.outro,p.outro_frames)>maxFrames||!Array.isArray(p.source_to_timeline)||p.source_to_timeline.length!==story.length||!Array.isArray(p.caption_cues)||!p.caption_cues.length)fail('MATERIAL_PROCESSED_PROJECT_BINDING_CHANGED');
 const reference=(ref)=>{if(!ref||!/^\w/.test(ref.path||ref.file||''))fail('MATERIAL_PROCESSED_REFERENCE_INVALID');const file=path.resolve(prior,ref.path||ref.file),relative=path.relative(prior,file).split(path.sep).join('/'),known=files.find(f=>f.file===relative);if(!file.startsWith(prior+path.sep)||!known||known.sha256!==ref.sha256)fail('MATERIAL_PROCESSED_REFERENCE_CHANGED');return {...known};};
 const project=reference({file:path.relative(prior,projectRef.file),sha256:projectRef.sha256}),voice=reference(p.voice),captions=reference(p.captions);let cursor=0;
 const segments=p.source_to_timeline.map((s,index)=>{const text=story[index].narration||'';if(s.index!==index||s.text!==text||s.start_frame!==cursor||!Number.isSafeInteger(s.end_frame)||s.end_frame<=cursor||typeof s.source_speed!=='number'||s.source_speed<1||s.source_speed>1.3&&!retimed||typeof s.padding_only!=='boolean'||s.padding_only!==true)fail('MATERIAL_PROCESSED_SEGMENT_CHANGED');cursor=s.end_frame;return {index,text_sha256:sha(text),start_frame:s.start_frame,end_frame:s.end_frame,audio:reference(s.audio),raw_audio_sha256:s.raw_audio_sha256??null,source_speed:s.source_speed};});
 if(cursor!==p.body_frames)fail('MATERIAL_PROCESSED_TIMELINE_CHANGED');
 return {schema:'exact-processed-narration-v1',project,voice,captions,fps:30,body_frames:p.body_frames,segments,caption_policy:'reuse-verified-two-line-layout-or-align-existing-audio'};
}

// A material search is itself a finite preparation step. Persist its current
// result through the normal versioned handoff, rather than leaving a silent
// permanent early return or pretending that candidate discovery is coverage.
export async function persistMaterialDiscovery(job,handoff,discovery,missing,{call,root=process.cwd()}={}){
 const reference=discovery.attempt_file&&fs.realpathSync(discovery.attempt_file),prefix=path.resolve(fs.realpathSync(root),'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision);
 if(!reference||!reference.startsWith(prefix+path.sep))fail('MATERIAL_SEARCH_RECEIPT_OUTSIDE_JOB');
 const bytes=fs.readFileSync(reference);if(sha(bytes)!==discovery.sha256||bytes.length!==discovery.size_bytes)fail('MATERIAL_SEARCH_RECEIPT_CHANGED');
 const artifact={kind:'local-file',file:path.relative(root,reference).split(path.sep).join('/'),sha256:discovery.sha256,size_bytes:bytes.length,purpose:'render-receipt',verified_at:new Date().toISOString(),verification:'executor-reported-local-bytes'};
 if(canonical(handoff.missing||[])===canonical(missing)&&(handoff.checkpoint?.artifacts?.some(a=>a.file===artifact.file&&a.sha256===artifact.sha256)||discovery.observed_at&&handoff.checkpoint?.note?.includes('最近检查'+discovery.observed_at)))return {handoff,persisted:true,reused:true};
 const invocation_id='material-search-'+randomUUID(),claim=await call({action:'native_preparation_claim',id:job.id,queue_id:handoff.queue_id,version:handoff.version,executor:'finite-material-acquisition-v1',invocation_id,reason:'检查当前已批准分镜的真实素材候选；保留已知音轨及工程，不重新生成声音，不把候选当作已通过素材。'});
 let token=claim.lease_token;
 try{
  const note='自动取材已检查当前来源及相关公开页面；候选'+(discovery.candidates?.length||0)+'项。'+(discovery.candidates?.length?'候选必须核对实际画面、对应主体和入出点后才可续剪辑。':'未找到可直接匹配分镜的连续原片，保留下面真实缺项。')+' 音轨和已批准口播保留，不循环重录。最近检查'+discovery.observed_at+'；本次取材记录 '+artifact.file+'；SHA256 '+artifact.sha256;
  const result=await call({action:'native_preparation_progress',id:job.id,queue_id:handoff.queue_id,invocation_id,lease_token:token,version:claim.handoff.version,status:'blocked',artifacts:handoff.checkpoint?.artifacts?.some(a=>a.file?.includes('/material-acquisition/'))?[]:[artifact],note,missing:missing.length?missing:[{code:'material-candidate-review-required',detail:'已取得候选，尚须逐段核验真实画面，不以候选文件存在冒充已满足分镜。'}]});
  return {...result,persisted:true,discovery};
 }catch(error){const read=await call({action:'native_preparation_read',id:job.id});if(read.handoff?.status==='blocked'&&read.handoff.invocation_id===invocation_id)return {...read,persisted:true,read_only_reconciled:true,discovery};throw error;}
 finally{token='';claim.lease_token='';}
}
