import https from 'node:https';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {researchUrl,resolveResearchAddresses,publicResearchAddress,researchDigest} from './research-web.mjs';

export const SOURCE_IMAGE_MAX_BYTES=5000000;
export const SOURCE_IMAGES_MAX_BYTES=30000000;
export const SOURCE_IMAGES_MAX_COUNT=32;
const types={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'};
function failure(code,message,extra={}){const error=Error(message);error.code=code;error.diagnostic={stage:'images',code,retryable:['image-network','image-http','image-unavailable'].includes(code),...extra};return error}
function safeUrl(value){try{return researchUrl(value)}catch{throw failure('image-host','Source image must use an unauthenticated public HTTPS URL')}}
const pinnedLookup=address=>(_hostname,options,callback)=>options.all?callback(null,[{address,family:4}]):callback(null,address,4);
function bounded(operation,timeoutMs){if(!Number.isFinite(timeoutMs)||timeoutMs<=0)return Promise.reject(failure('image-network','Source image read deadline reached'));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(failure('image-network','Source image read deadline reached')),timeoutMs);Promise.resolve().then(operation).then(resolve,reject).finally(()=>clearTimeout(timer))})}
function imageType(bytes){if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';if(bytes.length>=13&&/^GIF8[79]a$/.test(bytes.toString('ascii',0,6)))return 'image/gif';throw failure('image-format','Source image bytes are not a supported original raster image')}

function readResponse(url,address,{timeoutMs,maxBytes,referer}){
 return new Promise((resolve,reject)=>{
  const request=https.request(url,{method:'GET',agent:false,family:4,servername:url.hostname,maxHeaderSize:16384,signal:AbortSignal.timeout(Math.max(1,Math.floor(timeoutMs))),lookup:pinnedLookup(address),headers:{'User-Agent':'SiounexSourceMaterials/1.0 (private article research)',Accept:'image/png,image/jpeg,image/webp,image/gif','Accept-Encoding':'identity',...(referer?{Referer:referer}:{})}},response=>{
   const status=response.statusCode||0,headers=response.headers;
   if(status>=300&&status<400){response.destroy();resolve({status,location:headers.location});return}
   const contentType=String(headers['content-type']||''),mime=contentType.split(';')[0].trim().toLowerCase(),encoding=String(headers['content-encoding']||'identity').toLowerCase(),length=headers['content-length'];
   if(status!==200){response.destroy();reject(failure('image-http','Source image HTTP response rejected',{status,host:url.hostname,retryable:status===429||status>=500}));return}
   if(!types[mime]||encoding!=='identity'||length!==undefined&&!/^\d+$/.test(String(length))){response.destroy();reject(failure('image-format','Source image MIME, encoding or byte length is invalid',{host:url.hostname}));return}
   if(Number(length||0)>maxBytes){response.destroy();reject(failure('image-too-large','Source image exceeds the bounded byte budget',{host:url.hostname}));return}
   const chunks=[];let bytes=0;
   response.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){response.destroy(failure('image-too-large','Source image exceeds the bounded byte budget',{host:url.hostname}));return}chunks.push(chunk)});
   response.once('end',()=>resolve({status,body:Buffer.concat(chunks),contentType,contentEncoding:encoding}));response.once('error',reject);
  });request.once('error',error=>reject(error.diagnostic?error:failure('image-network','Source image network read failed',{host:url.hostname})));request.end();
 });
}

// Every redirect receives a fresh public-address check and a pinned connection.
// No caller-supplied fetch, cookies, authorization, URL proxy or persistent network settings.
export async function readSourceImage(value,{lookup,doh,transport=readResponse,timeoutMs=20000,maxBytes=SOURCE_IMAGE_MAX_BYTES,maxRedirects=3,sourceUrl}={}){
 if(!Number.isFinite(maxBytes)||maxBytes<=0||!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isInteger(maxRedirects)||maxRedirects<0)throw failure('image-limit','Source image reader bounds invalid');
 maxBytes=Math.min(maxBytes,SOURCE_IMAGE_MAX_BYTES);maxRedirects=Math.min(maxRedirects,3);timeoutMs=Math.min(timeoutMs,20000);
 const original=safeUrl(value).href,deadline=Date.now()+timeoutMs;let current=original,referer;
 // The dispatcher has already matched this frozen public article URL to its
 // complete source receipt. Send only its public path, never URL query secrets
 // or arbitrary request headers. Drop this context on a cross-host redirect.
 if(sourceUrl!==undefined){if(typeof sourceUrl!=='string'||/[\r\n]/.test(sourceUrl))throw failure('image-host','Source article context must be a public HTTPS URL');const article=safeUrl(sourceUrl);article.search='';article.hash='';referer=article.href;}
 for(let hop=0;hop<=maxRedirects;hop++){
  const url=safeUrl(current);let records;try{records=await resolveResearchAddresses(url.hostname,{lookup,doh,timeoutMs:deadline-Date.now()})}catch{throw failure('image-host','Source image host did not resolve to verified public addresses',{host:url.hostname})}const address=records.find(row=>row.family===4&&publicResearchAddress(row.address))?.address;
  if(!address)throw failure('image-host','Source image has no verified public IPv4 address',{host:url.hostname});
  const remaining=deadline-Date.now();let response;try{response=await bounded(()=>transport(url,address,{timeoutMs:remaining,maxBytes,...(referer&&url.hostname===new URL(original).hostname?{referer}:{})}),remaining)}catch(error){if(error.diagnostic)throw error;throw failure('image-network','Source image network read failed',{host:url.hostname})}
  if(response?.status>=300&&response.status<400){if(hop===maxRedirects||!response.location)throw failure('image-http','Source image redirect limit reached',{status:response.status,host:url.hostname,retryable:false});let redirected;try{redirected=new URL(response.location,url).href}catch{throw failure('image-host','Source image redirect URL is invalid')}current=safeUrl(redirected).href;continue}
  const mime=String(response?.contentType||'').split(';')[0].trim().toLowerCase(),bytes=response?.body&&Buffer.from(response.body);
  if(response?.status!==200)throw failure('image-http','Source image HTTP response rejected',{status:response?.status,host:url.hostname});
  if(bytes?.length>maxBytes)throw failure('image-too-large','Source image exceeds the bounded byte budget',{host:url.hostname});
  if(!bytes?.length||!types[mime]||response.contentEncoding&&String(response.contentEncoding).toLowerCase()!=='identity'||imageType(bytes)!==mime)throw failure('image-format','Source image bytes or MIME mismatch',{host:url.hostname});
  return {url:original,resolved_url:url.href,body:bytes,sha256:researchDigest(bytes),size_bytes:bytes.length,mime_type:mime,extension:types[mime],retrieved_at:new Date().toISOString()};
 }
 throw failure('image-unavailable','Source image read incomplete');
}

export function decodeSourceImage(file,{run=spawnSync}={}){
 const stat=fs.statSync(file);if(!stat.isFile()||stat.size<=0||stat.size>SOURCE_IMAGE_MAX_BYTES)throw failure('image-too-large','Source image is not a bounded regular file');
 const bytes=fs.readFileSync(file);if(!bytes.length||bytes.length>SOURCE_IMAGE_MAX_BYTES)throw failure('image-too-large','Source image byte limit changed during preflight');imageType(bytes);
 const probe=run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_entries','stream=codec_type,codec_name,width,height','-of','json',file],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1000000});
 if(probe.status!==0||probe.error)throw failure('image-decode','Source image technical probe failed');
 let streams;try{streams=JSON.parse(probe.stdout).streams}catch{throw failure('image-decode','Source image probe response invalid')}
 const stream=streams?.find(stream=>stream.codec_type==='video');
 if(!Number.isInteger(stream?.width)||!Number.isInteger(stream?.height)||stream.width<1||stream.height<1||stream.width>16384||stream.height>16384||stream.width*stream.height>40000000)throw failure('image-decode','Source image dimensions exceed safe decode bounds');
 const decoded=run('ffmpeg',['-nostdin','-v','error','-xerror','-threads','1','-protocol_whitelist','file,pipe','-i',file,'-map','0:v:0','-frames:v','1','-f','null','-'],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1000000});
 if(decoded.status!==0||decoded.error)throw failure('image-decode','Source image first frame could not be decoded');
 return {width:stream.width,height:stream.height,codec:stream.codec_name||'unknown',decode:'ffmpeg-first-frame-v1'};
}
