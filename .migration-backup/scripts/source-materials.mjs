import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {sourceEvidence} from './source-evidence.mjs';
import {researchUrl} from './research-web.mjs';
import {readSourceImage,decodeSourceImage,SOURCE_IMAGE_MAX_BYTES,SOURCE_IMAGES_MAX_BYTES,SOURCE_IMAGES_MAX_COUNT} from './source-image-reader.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const scope='Original public article bytes and bounded first-frame technical decode only; the exact files still require CLI --image visual inspection. Rights unconfirmed; no media generation, upload or publication.';
function failure(code,message){const error=Error(message);error.code=code;error.diagnostic={stage:'images',code,retryable:['image-network','image-http','image-unavailable'].includes(code)};return error}
function inside(root,file){const relative=path.relative(root,file);return relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw failure('image-cache','Source image cache receipt is invalid')}}
// Exclusive hard-link commit leaves only a complete immutable final file. An
// interrupted temporary file does not block a later, hash-checked preparation.
function immutableBytes(file,bytes){
 const temporary=file+'.partial-'+randomUUID();
 try{fs.writeFileSync(temporary,bytes,{flag:'wx'});try{fs.linkSync(temporary,file)}catch(error){if(error.code!=='EEXIST')throw error;if(sha(fs.readFileSync(file))!==sha(bytes))throw failure('image-cache','Existing source image file differs from its immutable receipt')}}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
}
function putJson(file,value){if(!fs.existsSync(file)){try{immutableBytes(file,Buffer.from(JSON.stringify(value,null,2)))}catch(error){if(!fs.existsSync(file))throw error}}return readJson(file)}
function fileBytes(file,root,expected){
 let real;try{real=fs.realpathSync(file)}catch{throw failure('image-cache','Source image file is missing')}
 const stat=fs.statSync(real);if(!inside(root,real)||!stat.isFile())throw failure('image-cache','Source image path leaves the authorized local root');if(stat.size<1||stat.size>SOURCE_IMAGE_MAX_BYTES)throw failure('image-too-large','Source image file exceeds the bounded byte budget');
 const bytes=fs.readFileSync(real);if(!bytes.length||bytes.length>SOURCE_IMAGE_MAX_BYTES||expected&&sha(bytes)!==expected)throw failure('image-cache','Source image bytes differ from their immutable binding');return bytes;
}
function decoded(file,decodeImage){let value;try{value=decodeImage(file)}catch(error){if(error.code)throw error;throw failure('image-decode','Source image technical decode failed')}if(!Number.isInteger(value?.width)||!Number.isInteger(value?.height)||value.width<1||value.height<1||value.width>16384||value.height>16384||value.width*value.height>40000000)throw failure('image-decode','Source image decoded dimensions are invalid');return value}

export function validateSourceImages(images,{root=process.cwd(),decodeImage=decodeSourceImage}={}){
 if(!Array.isArray(images)||images.length>SOURCE_IMAGES_MAX_COUNT)throw failure('image-limit','At most thirty-two exact source images are allowed');
 const base=fs.realpathSync(path.resolve(root));let total=0;
 return images.map(image=>{if(!image||typeof image.file!=='string'||!/^[a-f0-9]{64}$/.test(String(image.sha256)))throw failure('image-cache','Source image binding is incomplete');const file=fs.realpathSync(image.file),bytes=fileBytes(file,base,image.sha256);total+=bytes.length;if(total>SOURCE_IMAGES_MAX_BYTES)throw failure('image-limit','Source images exceed the thirty MB total bound');if(image.size_bytes!==undefined&&image.size_bytes!==bytes.length)throw failure('image-cache','Source image recorded length differs');const probe=decoded(file,decodeImage);if(image.width!==undefined&&image.width!==probe.width||image.height!==undefined&&image.height!==probe.height)throw failure('image-cache','Source image recorded dimensions differ');return file});
}

// Text work can proceed from its already frozen complete article. A failed
// image fetch is retained as a later material gap, never visual evidence.
export function deferredSourceImages({job,sourceFile,directory,diagnostic}){
 const source=JSON.parse(job.source_snapshot),bytes=fs.readFileSync(sourceFile),sourceHash=sha(bytes),dir=path.resolve(directory),pending={stage:'images',diagnostic,requires_acquisition:true,visual_inspection:'not-performed',resolve_at:'material-preparation-after-script-approval'},value={schema:'source-text-pending-images-v1',source_url:source.url,source_sha256:sourceHash,evidence:[],images:[],pending_materials:[pending],user_requirements:{stage:'source-and-script-text-only',limits:'Use the complete frozen article text only. Image retrieval failed; no image was viewed. Continue supported source and narration work, record the image gap for later material preparation; never infer unseen visual facts or claim a demonstration was watched.'},quality_approved:false,publication_authorized:false};
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'source-text-pending-images-'+sha(JSON.stringify(value))+'.json'),saved=putJson(file,value);if(JSON.stringify(saved)!==JSON.stringify(value))throw failure('image-cache','Deferred image gap changed from its frozen text binding');return{brief_file:file,pending_materials:value.pending_materials,image_count:0,visual_inspection:'not-performed'};
}

export async function linkedSourceImages({job,sourceFile,directory,readImage=readSourceImage,decodeImage=decodeSourceImage,lookup,doh,transport}){
 const source=JSON.parse(job.source_snapshot),bytes=fs.readFileSync(sourceFile),metadata=sourceEvidence(bytes,source),sourceHash=sha(bytes),dir=path.resolve(directory),manifest=path.join(dir,'source-brief.json');fs.mkdirSync(dir,{recursive:true});const base=fs.realpathSync(dir);
 const refs=metadata.media_references.filter(ref=>ref.kind==='image'||/\.(png|jpe?g|webp|gif)(?:$|[!\/])/i.test(new URL(ref.url).pathname)).map(ref=>researchUrl(ref.url).href),mappings=metadata.media_references.filter(ref=>ref.source_mapping).map(ref=>({url:ref.url,...ref.source_mapping}));
 if(metadata.image_limit_exceeded||refs.length>SOURCE_IMAGES_MAX_COUNT)return {needs_materials:true,reason:'Original article has more than thirty-two images; reconcile an explicit bounded material selection',diagnostic:{stage:'images',code:'image-limit',retryable:false}};
 if(metadata.blocked_image_references?.length)return {needs_materials:true,reason:'An article image URL is outside the public HTTPS policy',diagnostic:{stage:'images',code:'image-host',retryable:false}};
 if(!refs.length)return {brief_file:null,image_count:0,scope:'No original image URLs detected in the selected article body; no image viewed'};
 if(fs.existsSync(manifest)){
  const cached=readJson(manifest),boundRefs=cached.references||cached.images?.map(image=>image.url);
  if(cached.source_sha256!==sourceHash||cached.source_url!==source.url||JSON.stringify(boundRefs)!==JSON.stringify(refs))throw failure('image-cache','Source image manifest does not match the frozen article');
  if(mappings.length&&JSON.stringify(cached.source_image_mappings)!==JSON.stringify(mappings))throw failure('image-cache','Source image mapping audit does not match the frozen article');
  if(!Array.isArray(cached.images)||!cached.images.length||cached.schema&&cached.schema!=='source-images-v2')throw failure('image-cache','Source image manifest is incomplete');
  if(cached.schema==='source-images-v2'){
   let verified=0;
   for(const reference of refs){const image=cached.images.find(image=>Array.isArray(image.reference_urls)&&image.reference_urls.includes(reference));if(!image||!refs.includes(image.url)||image.reference_urls.some(url=>!refs.includes(url)))throw failure('image-cache','Source image manifest reference coverage differs');const receipt=readJson(path.join(dir,'source-image-'+sha(reference)+'.receipt.json'));if(receipt.schema!=='source-image-receipt-v1'||receipt.source_sha256!==sourceHash||receipt.source_url!==source.url||receipt.url!==reference||receipt.sha256!==image.sha256||receipt.size_bytes!==image.size_bytes||receipt.width!==image.width||receipt.height!==image.height||!['.png','.jpg','.webp','.gif'].includes(receipt.extension)||receipt.file!==path.join(dir,'source-image-'+sha(reference)+receipt.extension))throw failure('image-cache','Source image manifest disagrees with the per-reference receipt');fileBytes(receipt.file,base,receipt.sha256);verified+=receipt.size_bytes;}
   if(verified>SOURCE_IMAGES_MAX_BYTES||cached.verified_reference_bytes!==verified)throw failure('image-cache','Source image verified reference budget differs');
  }
  validateSourceImages(cached.images,{root:base,decodeImage});const actual=cached.images.reduce((sum,image)=>sum+fs.statSync(image.file).size,0);if(cached.total_image_bytes!==undefined&&cached.total_image_bytes!==actual)throw failure('image-cache','Source image manifest total differs');
  return {brief_file:manifest,image_count:cached.images.length,reused:true};
 }
 let total=0;const unique=new Map();
 for(const url of refs){
  const key=sha(url),pendingFile=path.join(dir,'source-image-'+key+'.pending.json'),receiptFile=path.join(dir,'source-image-'+key+'.receipt.json');let pending=fs.existsSync(pendingFile)?readJson(pendingFile):null;
  function binding(value){if(!value||value.source_sha256!==sourceHash||value.source_url!==source.url||value.url!==url||!/^[a-f0-9]{64}$/.test(String(value.sha256))||!Number.isInteger(value.size_bytes)||value.size_bytes<1||value.size_bytes>SOURCE_IMAGE_MAX_BYTES||!['.png','.jpg','.webp','.gif'].includes(value.extension)||value.file!==path.join(dir,'source-image-'+key+value.extension))throw failure('image-cache','Partial source image receipt does not match the frozen input');researchUrl(value.resolved_url);if(total+value.size_bytes>SOURCE_IMAGES_MAX_BYTES)throw failure('image-limit','Source images exceed the thirty MB total bound');return value}
  let receipt=fs.existsSync(receiptFile)?binding(readJson(receiptFile)):null;
  if(receipt&&pending&&(receipt.sha256!==pending.sha256||receipt.file!==pending.file))throw failure('image-cache','Completed and pending source image receipts disagree');
  if(!receipt){
   const remaining=SOURCE_IMAGES_MAX_BYTES-total;if(remaining<=0)throw failure('image-limit','Source images exceed the thirty MB total bound');
   if(pending)binding(pending);
   if(!pending||!fs.existsSync(pending.file)){
    let result;try{result=await readImage(url,{lookup,doh,transport,sourceUrl:source.url,maxBytes:Math.min(SOURCE_IMAGE_MAX_BYTES,remaining)})}catch(error){if(error.code==='image-too-large'&&remaining<SOURCE_IMAGE_MAX_BYTES)throw failure('image-limit','Source images exceed the thirty MB total bound');if(!error.code){error.code='image-network';error.diagnostic={stage:'images',code:'image-network',retryable:true}}throw error}
    const downloaded=Buffer.from(result.body||[]);if(!downloaded.length||downloaded.length>SOURCE_IMAGE_MAX_BYTES||downloaded.length>remaining)throw failure(downloaded.length>remaining?'image-limit':'image-too-large','Original image exceeds the bounded byte budget');
    const expected={schema:'source-image-pending-v1',source_sha256:sourceHash,source_url:source.url,url,resolved_url:researchUrl(result.resolved_url).href,file:path.join(dir,'source-image-'+key+result.extension),extension:result.extension,mime_type:result.mime_type,sha256:sha(downloaded),size_bytes:downloaded.length,retrieved_at:result.retrieved_at};binding(expected);
    if(result.sha256!==expected.sha256||result.size_bytes!==expected.size_bytes)throw failure('image-cache','Downloaded image hash or length mismatch');
    if(pending&&(pending.sha256!==expected.sha256||pending.size_bytes!==expected.size_bytes||pending.extension!==expected.extension))throw failure('image-cache','Original image changed after a partial immutable receipt');
    pending=pending||binding(putJson(pendingFile,expected));if(pending.sha256!==expected.sha256||pending.size_bytes!==expected.size_bytes)throw failure('image-cache','Concurrent source image preparation differs');immutableBytes(pending.file,downloaded);
   }
   fileBytes(pending.file,base,pending.sha256);const probe=decoded(pending.file,decodeImage),complete={...pending,schema:'source-image-receipt-v1',...probe,scope};receipt=binding(putJson(receiptFile,complete));if(receipt.sha256!==pending.sha256||receipt.width!==probe.width||receipt.height!==probe.height)throw failure('image-cache','Concurrent source image decode receipt differs');
  }else{fileBytes(receipt.file,base,receipt.sha256);const probe=decoded(receipt.file,decodeImage);if(receipt.width!==probe.width||receipt.height!==probe.height)throw failure('image-cache','Cached source image dimensions changed')}
  total+=receipt.size_bytes;
  if(unique.has(receipt.sha256))unique.get(receipt.sha256).reference_urls.push(url);else unique.set(receipt.sha256,{url:receipt.url,resolved_url:receipt.resolved_url,file:receipt.file,sha256:receipt.sha256,size_bytes:receipt.size_bytes,mime_type:receipt.mime_type,width:receipt.width,height:receipt.height,codec:receipt.codec,decode:receipt.decode,retrieved_at:receipt.retrieved_at,reference_urls:[url],scope});
 }
 const images=[...unique.values()],value={schema:'source-images-v2',source_sha256:sourceHash,source_url:source.url,article_extraction:metadata.article_extraction||null,references:refs,...(mappings.length?{source_image_mappings:mappings}:{}),evidence:[],images,total_image_bytes:images.reduce((sum,image)=>sum+image.size_bytes,0),verified_reference_bytes:total,limits:{images:SOURCE_IMAGES_MAX_COUNT,per_image_bytes:SOURCE_IMAGE_MAX_BYTES,total_bytes:SOURCE_IMAGES_MAX_BYTES},visual_inspection:'pending-cli-image-attachment',scope};
 const cached=putJson(manifest,value);if(JSON.stringify(cached)!==JSON.stringify(value))throw failure('image-cache','Concurrent immutable source image manifest differs');
 return {brief_file:manifest,image_count:images.length,reused:false};
}
