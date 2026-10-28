import {withProductionStation} from './production-workstations.mjs';
// A finite, zero-provider-call consumer for an exact approved preparation scope.
// It restores existing public source bytes and a PLANNED editor brief only.
// It never generates audio/pictures, opens an editor, uploads, or marks ready.
import {legacyCurrentProductionAuthorized} from '../lib/approved-production-policy.mts';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {requiresToolDemonstration,toolDemonstrationProblems} from '../lib/tool-demonstration.mts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const jobId=/^job_[a-f0-9-]{36}$/;
const digest=/^[a-f0-9]{64}$/;
const queueId=/^native_prep_[a-f0-9]{64}$/;
const schema='native-editor-preparation-plan-v1';
const excluded=new Set(['job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee','job_9ef39025-d92e-4770-82d0-05881451c5df']);
const fail=(code)=>{throw Object.assign(Error(code),{code})};
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep)};
const portable=file=>file.split(path.sep).join('/');
function checkedFile(file,root,max=32000000){const real=fs.realpathSync(file),stat=fs.statSync(real);if(!inside(root,real)||!stat.isFile()||stat.size<1||stat.size>max)fail('PREPARATION_LOCAL_FILE_INVALID');return {file:real,bytes:fs.readFileSync(real)}}
function directories(base,root,depth=0){if(!fs.existsSync(base))return[];const real=fs.realpathSync(base);if(!inside(root,real)||fs.lstatSync(base).isSymbolicLink()||depth>5)fail('PREPARATION_CACHE_PATH_INVALID');let out=[real];for(const child of fs.readdirSync(real,{withFileTypes:true})){if(child.isSymbolicLink())fail('PREPARATION_CACHE_PATH_INVALID');if(child.isDirectory())out.push(...directories(path.join(real,child.name),root,depth+1))}return out}
function immutable(file,bytes,root){const parent=fs.realpathSync(path.dirname(file));if(!inside(root,parent))fail('PREPARATION_OUTPUT_PATH_INVALID');if(fs.existsSync(file)){const old=checkedFile(file,root,64000000).bytes;if(sha(old)!==sha(bytes))fail('PREPARATION_OUTPUT_CHANGED');return false}const partial=file+'.partial-'+randomUUID();try{fs.writeFileSync(partial,bytes,{flag:'wx'});try{fs.linkSync(partial,file)}catch(error){if(error.code!=='EEXIST')throw error;if(sha(checkedFile(file,root,64000000).bytes)!==sha(bytes))fail('PREPARATION_OUTPUT_CHANGED')}}finally{if(fs.existsSync(partial))fs.unlinkSync(partial)}return true}
function validate(selection){
 const job=selection?.job,native=selection?.native_preparation,b=native?.binding;
 if(!job||!jobId.test(job.id)||(excluded.has(job.id)&&!legacyCurrentProductionAuthorized(job))||job.is_test||native.job_id!==job.id||job.status!=='approved'||job.approved_revision!==job.revision||!['node','auto'].includes(job.review_mode)||!digest.test(job.approved_hash||'')||!digest.test(job.contract_hash||'')||!b||b.revision!==job.revision||b.script_hash!==job.approved_hash||b.mode_epoch!==job.mode_epoch||b.contract_hash!==job.contract_hash||!['preparation','private-video'].includes(b.scope)||typeof b.scope_id!=='string'||!b.scope_id)fail('PREPARATION_BINDING_CHANGED');
 const current=job.drafts?.find(d=>d.revision===job.revision&&d.content_hash===job.approved_hash);if(!current)fail('PREPARATION_APPROVED_DRAFT_MISSING');
 const raw=typeof current.content==='string'?current.content:JSON.stringify(current.content);if(sha(raw)!==job.approved_hash)fail('PREPARATION_APPROVED_DRAFT_CHANGED');
 const draft=parse(raw);if(typeof draft.script!=='string'||!draft.script.trim()||draft.script.length>16000||!Array.isArray(draft.storyboard)||draft.storyboard.length>64)fail('PREPARATION_APPROVED_PLAN_INVALID');
 const snapshot=typeof job.source_snapshot==='string'?job.source_snapshot:JSON.stringify(job.source_snapshot),source=parse(snapshot);if(!source||typeof source.url!=='string'||!/^https:\/\//.test(source.url))fail('PREPARATION_SOURCE_BINDING_INVALID');
 return {job,binding:b,draft,draftRaw:raw,source,snapshotHash:sha(snapshot)};
}
function approvedSource(context,actualHash){const evidence=context.draft.evidence?.filter(e=>e?.url===context.source.url)||[];if(!evidence.length||!evidence.some(e=>digest.test(e.sha256||'')))fail('PREPARATION_APPROVED_SOURCE_EVIDENCE_MISSING');if(!evidence.some(e=>e.sha256===actualHash))fail('PREPARATION_APPROVED_SOURCE_CHANGED')}
function approvedImage(context,image){const evidence=context.draft.evidence?.filter(e=>e?.url===(image.url||image.source_url))||[];if(evidence.length&&!evidence.some(e=>e.sha256===image.sha256))fail('PREPARATION_APPROVED_IMAGE_CHANGED')}
function existingSource(context,root){
 const base=path.resolve(root,'.sites-runtime/dispatch-sources',context.job.id,context.job.contract_hash),matches=[];
 for(const directory of directories(base,root)){
  const receiptFile=path.join(directory,'source-receipt.json');if(!fs.existsSync(receiptFile))continue;
  const receipt=parse(checkedFile(receiptFile,root,1000000).bytes.toString('utf8'));
  if(receipt.source_snapshot_hash!==context.snapshotHash||receipt.url!==context.source.url)fail('PREPARATION_FROZEN_SOURCE_CHANGED');
  const input=checkedFile(path.join(directory,'source.txt'),root);if(sha(input.bytes)!==receipt.sha256||!digest.test(receipt.sha256||'')||receipt.complete_response!==true)fail('PREPARATION_FROZEN_SOURCE_CHANGED');approvedSource(context,receipt.sha256);
  matches.push({directory,receipt,input});
 }
 if(!matches.length)return null;
 if(new Set(matches.map(x=>x.receipt.sha256)).size!==1)fail('PREPARATION_SOURCE_CACHE_AMBIGUOUS');
 return matches.sort((a,b)=>a.directory.localeCompare(b.directory))[0];
}
function existingImages(context,source,root){
 const candidates=directories(path.join(source.directory,'source-images'),root).flatMap(directory=>{const file=path.join(directory,'source-brief.json');return fs.existsSync(file)?[{file,brief:parse(checkedFile(file,root,1000000).bytes.toString('utf8'))}]:[]});
 const matching=candidates.filter(x=>x.brief.source_url===context.source.url&&x.brief.source_sha256===source.receipt.sha256);
 if(candidates.length&&!matching.length)fail('PREPARATION_IMAGE_SOURCE_CHANGED');
 if(!matching.length)return [];
 const brief=matching.sort((a,b)=>a.file.localeCompare(b.file))[0].brief;
 if(!Array.isArray(brief.images)||brief.images.length>22)fail('PREPARATION_SOURCE_IMAGE_LIMIT');
 let total=0;return brief.images.map(image=>{
  if(typeof image.file!=='string'||!digest.test(image.sha256||'')||(image.size_bytes!==undefined&&(!Number.isSafeInteger(image.size_bytes)||image.size_bytes<1))||typeof image.url!=='string'||!/^https:\/\//.test(image.url))fail('PREPARATION_IMAGE_RECEIPT_INVALID');
  // Older source briefs did not persist byte length. Derive that missing fact
  // from the same frozen file only after its path and approved SHA are checked.
  const input=checkedFile(image.file,root,8000000);if(!inside(source.directory,input.file)||(image.size_bytes!==undefined&&input.bytes.length!==image.size_bytes)||sha(input.bytes)!==image.sha256)fail('PREPARATION_IMAGE_BYTES_CHANGED');approvedImage(context,image);
  total+=input.bytes.length;if(total>32000000)fail('PREPARATION_SOURCE_IMAGE_LIMIT');
  return {input,sha256:image.sha256,size_bytes:input.bytes.length,url:image.url,width:image.width??null,height:image.height??null};
 });
}
// Legacy briefs are cache locations, not approvals. Both the exact URL and SHA
// must occur in the current approved draft and its actual CLI image receipt.
function declaredImages(context,root){
 const hashes=new Set(context.draft.execution?.receipt?.image_hashes||context.draft.receipt?.image_hashes||[]),declared=(context.draft.evidence||[]).filter(e=>digest.test(e?.sha256||'')&&hashes.has(e.sha256)&&typeof e.url==='string'&&/^https:\/\//.test(e.url));
 if(!declared.length)return[];
 const jobCache=path.resolve(root,'.sites-runtime/authorized-inputs',context.job.id),briefFiles=new Set();
 for(const dir of directories(jobCache,root)){
  const readyFile=path.join(dir,'ready.json');if(!fs.existsSync(readyFile))continue;
  const ready=parse(checkedFile(readyFile,root,1000000).bytes.toString('utf8'));if(ready.job_id!==undefined&&ready.job_id!==context.job.id||ready.contract_hash!==context.job.contract_hash)continue;
  for(const key of ['production_brief_file','source_brief_file'])if(typeof ready[key]==='string'&&fs.existsSync(path.resolve(root,ready[key])))briefFiles.add(path.resolve(root,ready[key]));
 }
 const candidates=[];
 for(const file of [...briefFiles].sort()){
  const input=checkedFile(file,root,2000000),brief=parse(input.bytes.toString('utf8'));if(!Array.isArray(brief.images)||brief.images.length>22)continue;
  for(const image of brief.images)if(declared.some(e=>e.sha256===image.sha256&&e.url===(image.url||image.source_url))){
   if(typeof image.file!=='string')fail('PREPARATION_DECLARED_IMAGE_INVALID');const actual=checkedFile(path.resolve(root,image.file),root,8000000);
   if(sha(actual.bytes)!==image.sha256||image.size_bytes!==undefined&&image.size_bytes!==actual.bytes.length)fail('PREPARATION_DECLARED_IMAGE_BYTES_CHANGED');
   candidates.push({input:actual,sha256:image.sha256,size_bytes:actual.bytes.length,url:image.url||image.source_url,width:image.width??null,height:image.height??null,kind:'approved-declared-image',cache_brief_file:portable(path.relative(root,input.file)),approval_binding:'current-approved-draft-evidence-and-cli-image-receipt'});
  }
 }
 const images=declared.flatMap(e=>{const found=candidates.find(i=>i.sha256===e.sha256&&i.url===e.url);return found?[found]:[]});
 if(images.reduce((n,i)=>n+i.size_bytes,0)>32000000)fail('PREPARATION_SOURCE_IMAGE_LIMIT');return images;
}
const missingFor=(context,source,images)=>{
 const missing=[];if(!source)missing.push({code:'frozen-source-cache-missing',detail:'本机没有与当前来源快照绑定的完整原文缓存；本轮没有重新联网抓取或更换来源。'});
 if(!images.length)missing.push({code:'source-images-missing',detail:'当前来源没有可复用且经字节核对的原文图片；未创建替代图片。'});
 if(requiresToolDemonstration(context.source))for(const detail of toolDemonstrationProblems(context.draft))missing.push({code:'required-demonstration-missing',detail:detail.slice(0,2000)});
 if(/崇祯/.test(context.source.title||context.source.original_title||''))missing.push({code:'owner-gameplay-comparison-required',detail:'本人要求保留真实试玩对照，缺素材时暂停；现有静态截图不能代替同一危机下相反诏令的真实操作与结果。'});
 missing.push({code:'authorized-audio-unverified',detail:'本轮只恢复已有来源和编辑准备计划，没有生成或核验与本稿绑定的授权旁白音轨。'});
 missing.push({code:'actual-native-timeline-pending',detail:'已审分镜仅保存为计划，尚无实际编辑器工程、按真实音轨对齐的字幕或成片；未创建 ready.json。'});
 if(context.binding.scope==='preparation')missing.push({code:'preparation-only-scope',detail:'当前范围仅为免费内部准备；本轮没有启动私有视频合成、付费生成或外部发布。'});
 return missing.filter((x,i,all)=>all.findIndex(y=>y.code===x.code&&y.detail===x.detail)===i).slice(0,30);
};
function inputView(context,root){
 const source=existingSource(context,root),images=[...(source?existingImages(context,source,root):[]),...declaredImages(context,root)].filter((x,i,all)=>all.findIndex(y=>y.sha256===x.sha256&&y.url===x.url)===i);
 if(images.length>22||images.reduce((n,i)=>n+i.size_bytes,0)>32000000)fail('PREPARATION_SOURCE_IMAGE_LIMIT');
 const missing=missingFor(context,source,images),imageIdentity=images.map(i=>({sha256:i.sha256,url:i.url,size_bytes:i.size_bytes})).sort((a,b)=>(a.sha256+a.url).localeCompare(b.sha256+b.url)),input_hash=sha(JSON.stringify({schema:'native-preparation-input-v2',binding:context.binding,source_snapshot_sha256:context.snapshotHash,source_sha256:source?.receipt.sha256||null,images:imageIdentity,missing}));
 return{source,images,missing,input_hash};
}
function matchesView(plan,view,context){
 if(JSON.stringify(plan.binding)!==JSON.stringify(context.binding)||plan.source_snapshot_sha256!==context.snapshotHash)return false;
 if(plan.input_hash)return plan.input_hash===view.input_hash;
 const ids=list=>list.map(i=>({sha256:i.sha256,url:i.url||i.source_url,size_bytes:i.size_bytes})).sort((a,b)=>(a.sha256+a.url).localeCompare(b.sha256+b.url));
 return JSON.stringify(ids(plan.source_images||[]))===JSON.stringify(ids(view.images))&&JSON.stringify(plan.missing)===JSON.stringify(view.missing);
}
function localArtifacts(plan,root,at){const files=[...plan.source_images.map(x=>({file:x.file,sha256:x.sha256,size_bytes:x.size_bytes,purpose:'source-media'})),{file:plan.plan_file,sha256:plan.plan_sha256,size_bytes:plan.plan_size_bytes,purpose:'timeline'}];if(plan.supplement_of&&plan.manifest_file){const bytes=checkedFile(path.resolve(root,plan.manifest_file),root,2000000).bytes;files.push({file:plan.manifest_file,sha256:sha(bytes),size_bytes:bytes.length,purpose:'timeline'})}return files.map(x=>{const actual=checkedFile(path.resolve(root,x.file),root,64000000).bytes;if(sha(actual)!==x.sha256||actual.length!==x.size_bytes)fail('PREPARATION_OUTPUT_CHANGED');return {kind:'local-file',...x,verified_at:at,verification:'executor-reported-local-bytes'}})}

export function prepareNativeInputs(selection,{root=process.cwd(),queue_id,observed_at=new Date().toISOString()}={}){
 const context=validate(selection);if(!queueId.test(queue_id||''))fail('PREPARATION_QUEUE_INVALID');const realRoot=fs.realpathSync(root),relative='.sites-runtime/authorized-inputs/'+context.job.id+'/revision-'+context.job.revision+'/native-preparation/'+queue_id;let out=path.resolve(realRoot,relative);fs.mkdirSync(out,{recursive:true});if(!inside(realRoot,fs.realpathSync(out))||fs.realpathSync(out).toLowerCase()!==out.toLowerCase())fail('PREPARATION_OUTPUT_PATH_INVALID');
 const view=inputView(context,realRoot);let manifestFile=path.join(out,'preparation-manifest.json'),supplement_of;
 if(fs.existsSync(manifestFile)){
  const original=checkedFile(manifestFile,realRoot,2000000).bytes,manifest=parse(original.toString('utf8'));
  if(manifest.schema!=='native-preparation-local-manifest-v1'||JSON.stringify(manifest.binding)!==JSON.stringify(context.binding)||manifest.queue_id!==queue_id||manifest.source_snapshot_sha256!==context.snapshotHash||manifest.ready!==false||manifest.native_composition_started!==false||manifest.new_paid_calls!==0||manifest.publication_authorized!==false||manifest.quality_approved!==false)fail('PREPARATION_LOCAL_MANIFEST_CHANGED');
  for(const file of manifest.files||[]){const bytes=checkedFile(path.resolve(realRoot,file.file),realRoot,64000000).bytes;if(sha(bytes)!==file.sha256||bytes.length!==file.size_bytes)fail('PREPARATION_OUTPUT_CHANGED')}
  const plan=parse(checkedFile(path.resolve(realRoot,manifest.plan_file),realRoot,2000000).bytes.toString('utf8'));if(plan.source)approvedSource(context,plan.source.sha256);for(const image of manifest.source_images||[])approvedImage(context,image);
  if(matchesView(manifest,view,context)){const result={...manifest,manifest_file:portable(path.relative(realRoot,manifestFile))};return {...result,artifacts:localArtifacts(result,realRoot,observed_at),reused:true};}
  supplement_of={manifest_file:portable(path.relative(realRoot,manifestFile)),sha256:sha(original)};out=path.join(out,'supplement-'+view.input_hash);fs.mkdirSync(out,{recursive:true});if(fs.realpathSync(out).toLowerCase()!==out.toLowerCase())fail('PREPARATION_OUTPUT_PATH_INVALID');manifestFile=path.join(out,'preparation-manifest.json');
  if(fs.existsSync(manifestFile)){const saved=parse(checkedFile(manifestFile,realRoot,2000000).bytes.toString('utf8'));if(saved.input_hash!==view.input_hash||JSON.stringify(saved.supplement_of)!==JSON.stringify(supplement_of)||!matchesView(saved,view,context))fail('PREPARATION_LOCAL_MANIFEST_CHANGED');for(const item of saved.files||[]){const bytes=checkedFile(path.resolve(realRoot,item.file),realRoot,64000000).bytes;if(sha(bytes)!==item.sha256||bytes.length!==item.size_bytes)fail('PREPARATION_OUTPUT_CHANGED')}const result={...saved,manifest_file:portable(path.relative(realRoot,manifestFile))};return{...result,artifacts:localArtifacts(result,realRoot,observed_at),reused:true};}
 }
 const {source,images,missing,input_hash}=view,files=[],sourceImages=[];
 const save=(name,bytes)=>{const file=path.join(out,name);immutable(file,bytes,realRoot);const item={file:portable(path.relative(realRoot,file)),sha256:sha(bytes),size_bytes:bytes.length};files.push(item);return item};
 const script=save('approved-script.txt',Buffer.from(context.draft.script)),approvedDraft=save('approved-draft.json',Buffer.from(context.draftRaw)),article=source?save('source.txt',source.input.bytes):null;
 for(const image of images){const extension=path.extname(image.input.file).toLowerCase();if(!['.png','.jpg','.jpeg','.webp','.gif'].includes(extension))fail('PREPARATION_IMAGE_EXTENSION_INVALID');const file=save('source-'+image.sha256+extension,image.input.bytes);sourceImages.push({...file,source_url:image.url,width:image.width,height:image.height,kind:image.kind||'original-article-image',...(image.cache_brief_file?{cache_brief_file:image.cache_brief_file,approval_binding:image.approval_binding}:{}),visual_inspected_this_pass:false,rights_status:'unconfirmed'})}
 const plan={schema,job_id:context.job.id,queue_id,binding:context.binding,source_snapshot_sha256:context.snapshotHash,input_hash,...(supplement_of?{supplement_of}:{}),script_text:context.draft.script,script_text_sha256:script.sha256,approved_draft_file:approvedDraft.file,approved_script_unchanged:true,source:article?{...article,url:context.source.url,complete_response:true}:null,source_images:sourceImages,planned_storyboard:context.draft.storyboard,storyboard_timing:'approved-plan-only; not aligned to actual recorded audio',actual_native_timeline_created:false,audio_generated:false,video_generated:false,source_motion_verified:false,ready:false,quality_approved:false,new_paid_calls:0,publication_authorized:false,missing};
 const planItem=save('editor-preparation-plan.json',Buffer.from(JSON.stringify(plan,null,2)));
 const manifest={schema:'native-preparation-local-manifest-v1',job_id:context.job.id,queue_id,binding:context.binding,source_snapshot_sha256:context.snapshotHash,input_hash,...(supplement_of?{supplement_of}:{}),prepared_at:observed_at,source_images:sourceImages,plan_file:planItem.file,plan_sha256:planItem.sha256,plan_size_bytes:planItem.size_bytes,files,source_restored:!!source,image_count:sourceImages.length,missing,ready:false,native_composition_started:false,audio_generated:false,video_generated:false,new_paid_calls:0,publication_authorized:false,quality_approved:false};
 immutable(manifestFile,Buffer.from(JSON.stringify(manifest,null,2)),realRoot);
 const result={...manifest,manifest_file:portable(path.relative(realRoot,manifestFile))};return {...result,artifacts:localArtifacts(result,realRoot,observed_at),reused:false};
}
function result(handoff,extra={}){return {status:'native-preparation-returned',job_id:extra.job_id,queue_id:handoff.queue_id,handoff_status:handoff.status,handoff,persisted:true,claimed:false,generation_started:false,automatic_editor_launch:false,new_paid_calls:0,publication_authorized:false,quality_approved:false,missing:handoff.missing||[],...extra}}
function unknownResult(id,queue_id,extra={}){return {status:'native-preparation-result-unknown',job_id:id,queue_id,persisted:false,claimed:true,generation_started:false,new_paid_calls:0,publication_authorized:false,retry_without_reconciliation:false,...extra}}
function exactReadback(read,expected,artifacts){const h=read?.handoff;return !!h&&h.queue_id===expected.queue_id&&h.invocation_id===expected.invocation_id&&h.status==='blocked'&&h.version>=expected.version&&artifacts.every(a=>h.checkpoint?.artifacts?.some(b=>b.kind===a.kind&&b.file===a.file&&b.sha256===a.sha256&&b.size_bytes===a.size_bytes))}

export async function runNativePreparation(selection,{call,root=process.cwd(),now=()=>new Date().toISOString(),workstations}={}){
 if(typeof call!=='function')fail('PREPARATION_OWNER_SERVICE_REQUIRED');const context=validate(selection),saved=await call({action:'native_preparation_ensure',id:context.job.id,binding:context.binding}),handoff=saved.handoff;
 if(!handoff||!queueId.test(handoff.queue_id||'')||JSON.stringify(handoff.binding)!==JSON.stringify(context.binding))fail('PREPARATION_HANDOFF_UNCONFIRMED');
 if(['claimed','completed'].includes(handoff.status))return result(handoff,{job_id:context.job.id,waiting_for:handoff.waiting_for});
 const ownPlan=handoff.checkpoint?.artifacts?.filter(a=>a.kind==='local-file'&&a.file?.endsWith('/editor-preparation-plan.json')).at(-1);
 if(handoff.status==='blocked'&&ownPlan){const realRoot=fs.realpathSync(root),bytes=checkedFile(path.resolve(root,ownPlan.file),realRoot,2000000).bytes;if(sha(bytes)!==ownPlan.sha256)fail('PREPARATION_OUTPUT_CHANGED');if(matchesView(parse(bytes.toString('utf8')),inputView(context,realRoot),context))return result(handoff,{job_id:context.job.id,reused:true,artifacts_count:handoff.checkpoint.artifacts.length})}
 const invocation='native-preparation-consumer-'+randomUUID();let stage;try{stage=await withProductionStation(workstations,'preparation',context.job.id,async()=>{let claim;
 try{claim=await call({action:'native_preparation_claim',id:context.job.id,queue_id:handoff.queue_id,version:handoff.version,executor:'finite-existing-source-preparation-v1',invocation_id:invocation,...(handoff.status==='blocked'?{reason:'本轮实际恢复已缓存原文与图片，逐项回传现有来源和编辑准备计划；不生成媒体。'}:{})})}catch{let observed;try{observed=await call({action:'native_preparation_read',id:context.job.id})}catch{}const confirmed=observed?.handoff?.queue_id===handoff.queue_id&&observed.handoff.status==='claimed'&&observed.handoff.invocation_id===invocation;return unknownResult(context.job.id,handoff.queue_id,{phase:'claim-readback-required',claimed:confirmed,claim_attempted:true,claim_result_unknown:!confirmed,...(observed?.handoff?{handoff:observed.handoff}:{})})}
 if(!claim.handoff||claim.handoff.queue_id!==handoff.queue_id||claim.handoff.status!=='claimed'||typeof claim.lease_token!=='string')fail('PREPARATION_CLAIM_UNCONFIRMED');
 let prepared=null,failure=null;try{prepared=prepareNativeInputs(selection,{root,queue_id:handoff.queue_id,observed_at:now()})}catch(error){failure={code:/^PREPARATION_[A-Z_]+$/.test(error.code||'')?error.code:'PREPARATION_LOCAL_CHECK_FAILED',detail:'本轮本地来源或准备文件核验失败，已保留原件和现有批准；没有重新抓取、覆盖或生成媒体。'}}
 return{claim,prepared,failure};});}catch(e){if(e.code!=='PRODUCTION_STATION_BUDGET_DEFERRED')throw e;return{status:'native-preparation-budget-deferred',job_id:context.job.id,queue_id:handoff.queue_id,claimed:false,generation_started:false,budget_exhausted:true,phase:'preparation',resume_same_archives:true,new_paid_calls:0,quality_approved:false,publication_authorized:false};}if(!stage.claim)return stage;const{claim,prepared,failure}=stage;
 const artifacts=prepared?.artifacts||[],missing=failure?[failure]:prepared.missing,note=failure?failure.code+'：'+failure.detail:'已核对并恢复'+prepared.image_count+'张当前来源原图，保留已审原文和口播稿，保存分镜编辑准备计划；计划不是实际工程或成片。'+missing.map(x=>x.detail).join('；');
 const body={action:'native_preparation_progress',id:context.job.id,queue_id:handoff.queue_id,version:claim.handoff.version,invocation_id:invocation,lease_token:claim.lease_token,status:'blocked',artifacts,missing,note:note.slice(0,4000)};
 let response,unknown=false;try{response=await call(body)}catch{unknown=true}finally{body.lease_token='';claim.lease_token=''}
 // A lost progress response is reconciled by a READ only. Never reclaim/retry.
 let read;try{read=await call({action:'native_preparation_read',id:context.job.id})}catch{return unknownResult(context.job.id,handoff.queue_id)}
 if(!exactReadback(read,{queue_id:handoff.queue_id,version:claim.handoff.version+1,invocation_id:invocation},artifacts)||JSON.stringify(read.handoff.missing)!==JSON.stringify(missing))return unknownResult(context.job.id,handoff.queue_id);
 return result(read.handoff,{job_id:context.job.id,claimed:true,preparation_completed:!failure,artifacts_count:artifacts.length,image_count:prepared?.image_count||0,source_restored:prepared?.source_restored||false,...(prepared?{manifest_file:prepared.manifest_file,reused:prepared.reused}:{}),...(failure?{failure_code:failure.code}:{}),...(unknown?{reconciled_readback:true}:{})});
}
