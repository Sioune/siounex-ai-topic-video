import {publishedPageVideos} from './public-page-video-data.mjs';
import {bodyStoryboard} from '../lib/storyboard-segments.mts';
// Finite public-source discovery. Downloaded originals are candidates, never
// semantic approval, publication rights, or permission to replace a storyboard.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';
import {researchUrl,resolveResearchAddresses,publicResearchAddress,researchDohLookup} from './research-web.mjs';
import {winHttpProxy,proxyPublicResponse} from './public-material-proxy.mjs';
import {extractSourceArticle} from '../lib/source-document.mts';

const SCHEMA='finite-public-material-discovery-v1';
const sha=value=>createHash('sha256').update(value).digest('hex');
// Git checkouts may materialize the same JavaScript with LF or CRLF. Normalize
// only those source line endings; media, manifests and receipt hashes stay raw.
export const materialAcquisitionCodeSha=parts=>sha(Buffer.concat(parts.map(bytes=>Buffer.from(bytes.toString('latin1').replace(/\r\n/g,'\n'),'latin1'))));
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const inside=(base,file)=>{const rel=path.relative(base,file);return !!rel&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep)};
const digest=/^[a-f0-9]{64}$/;
const MAX={documents:6,document_bytes:2000000,media:3,media_bytes:32000000,total_bytes:48000000,time_ms:90000,request_ms:15000,redirects:3,cache_ms:7200000};
const RESUME_PASSES=6,READ_ATTEMPTS=2;
// This exact predecessor used the same acquisition/DNS/decoding contract. Only
// its local observation cache expired after two hours. Recompute its full input
// hash to reuse verified originals without treating the source URL as refreshed.
const RETAINED_ACQUISITION_IMPLEMENTATION='68bac4e87d6f008e4267b431cbeda40d31d70850b2162cdd4af6655668fffe78';
const RETAINED_ACQUISITION_SUPPORT_SHA256='e81f3d0fc5f8a1d081cb03dca5609c4b47dd298c1259ddb90d73de7e00fad476';
const transientRead=error=>/MATERIAL_DEADLINE|(?:公开|系统) DNS 读取超时|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|EAI_AGAIN|ABORT_ERR|operation was aborted/i.test(String(error?.code||'')+' '+String(error?.message||error));
const fail=code=>{throw Error(code)};
const checked=(file,root,max=2000000)=>{const real=fs.realpathSync(file),stat=fs.statSync(real);if(!inside(root,real)||!stat.isFile()||stat.size<1||stat.size>max)fail('MATERIAL_LOCAL_FILE_INVALID');return {file:real,bytes:fs.readFileSync(real)}};
function mkdir(directory,root){
 if(!inside(root,directory))fail('MATERIAL_OUTPUT_SCOPE_INVALID');let cursor=directory;
 while(cursor!==root){if(fs.existsSync(cursor)&&(fs.lstatSync(cursor).isSymbolicLink()||!fs.statSync(cursor).isDirectory()||!inside(root,fs.realpathSync(cursor))))fail('MATERIAL_OUTPUT_SCOPE_INVALID');cursor=path.dirname(cursor)}
 fs.mkdirSync(directory,{recursive:true});if(!inside(root,fs.realpathSync(directory))||fs.realpathSync(directory).toLowerCase()!==directory.toLowerCase())fail('MATERIAL_OUTPUT_SCOPE_INVALID');
}
function put(file,bytes,root){if(!inside(root,fs.realpathSync(path.dirname(file))))fail('MATERIAL_OUTPUT_SCOPE_INVALID');try{fs.writeFileSync(file,bytes,{flag:'wx'})}catch(e){if(e.code!=='EEXIST'||sha(checked(file,root,256000000).bytes)!==sha(bytes))throw e}return {file:path.resolve(file),sha256:sha(bytes),size_bytes:bytes.length}}
function bounded(operation,ms){if(!Number.isFinite(ms)||ms<=0)return Promise.reject(Error('MATERIAL_DEADLINE'));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('MATERIAL_DEADLINE')),ms);Promise.resolve().then(operation).then(resolve,reject).finally(()=>clearTimeout(timer))})}
function limits(request={}){const caps=request.content_motion_policy==='content-motion@1'?{...MAX,documents:12,media:16,media_bytes:64000000,total_bytes:256000000,time_ms:180000}:MAX;const out={};for(const [key,value]of Object.entries(caps)){const n=request[key]??value;if(!Number.isSafeInteger(n)||n<=0)fail('MATERIAL_LIMIT_INVALID');out[key]=Math.min(n,value)}return out}
function context(job,binding){
 const scope=job?.media_continuation?.scope;
 if(!/^job_[a-f0-9-]{36}$/.test(job?.id||'')||job.is_test||job.status!=='approved'||!['auto','node'].includes(job.review_mode)||job.approved_revision!==job.revision||!Number.isSafeInteger(job.revision)||job.revision<1||!digest.test(job.approved_hash||'')||!digest.test(job.contract_hash||'')||binding?.revision!==job.revision||binding.script_hash!==job.approved_hash||binding.mode_epoch!==job.mode_epoch||binding.contract_hash!==job.contract_hash||binding.scope!=='private-video'||scope?.scope!=='private-video'||scope.id!==binding.scope_id||scope.owner_confirmed!==true||scope.authorization_source!=='owner-private-video'||scope.new_paid_authorization!==false||scope.publication_authorization!==false||scope.quality_approved!==false||canonical(scope.binding)!==canonical({revision:job.revision,script_hash:job.approved_hash,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash}))fail('MATERIAL_CURRENT_OWNER_BINDING_REQUIRED');
 for(const node of ['source','script']){const row=job.milestones?.filter(m=>m.node===node&&m.revision===job.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];if(!row||row.status!=='approved'||row.mode_epoch!==job.mode_epoch||row.artifact_hash!==job.approved_hash)fail('MATERIAL_TEXT_APPROVAL_CHANGED')}
 const d=job.drafts?.find(d=>d.revision===job.revision&&d.content_hash===job.approved_hash),raw=d?.content;
 if(typeof raw!=='string'||sha(raw)!==job.approved_hash)fail('MATERIAL_APPROVED_DRAFT_CHANGED');
 const draft=JSON.parse(raw),snapshot=typeof job.source_snapshot==='string'?job.source_snapshot:canonical(job.source_snapshot),source=JSON.parse(snapshot);
 if(typeof draft.script!=='string'||!draft.script.trim()||draft.script.length>16000||!Array.isArray(draft.storyboard)||draft.storyboard.length<1||draft.storyboard.length>64)fail('MATERIAL_APPROVED_PLAN_REQUIRED');
 researchUrl(source.url);
 return {job,binding,draft,source,snapshotHash:sha(snapshot)};
}
function walk(base,root,{depth=4,max=180}={}){
 const found=[];let count=0;
 function visit(dir,level){if(!fs.existsSync(dir))return;if(++count>max)fail('MATERIAL_CACHE_SCAN_LIMIT');if(fs.lstatSync(dir).isSymbolicLink())fail('MATERIAL_CACHE_SYMLINK');const real=fs.realpathSync(dir);if(!inside(root,real))fail('MATERIAL_CACHE_SCOPE_INVALID');found.push(real);if(level===depth)return;for(const e of fs.readdirSync(real,{withFileTypes:true})){if(e.isSymbolicLink())fail('MATERIAL_CACHE_SYMLINK');if(e.isDirectory())visit(path.join(real,e.name),level+1)}}
 visit(base,0);return found;
}
function frozenSource(c,root){
 const matches=[];
 for(const dir of walk(path.join(root,'.sites-runtime/dispatch-sources',c.job.id,c.job.contract_hash),root)){
  const receipt=path.join(dir,'source-receipt.json');if(!fs.existsSync(receipt))continue;
  const r=JSON.parse(checked(receipt,root).bytes.toString('utf8'));if(r.url!==c.source.url||r.source_snapshot_hash!==c.snapshotHash)fail('MATERIAL_FROZEN_SOURCE_BINDING_CHANGED');
  const source=checked(path.join(dir,'source.txt'),root,MAX.document_bytes);if(r.complete_response!==true||r.sha256!==sha(source.bytes)||!c.draft.evidence?.some(e=>e.url===c.source.url&&e.sha256===r.sha256))fail('MATERIAL_FROZEN_SOURCE_BYTES_CHANGED');
  matches.push({...source,sha256:r.sha256});
 }
 if(new Set(matches.map(m=>m.sha256)).size>1)fail('MATERIAL_FROZEN_SOURCE_AMBIGUOUS');
 return matches.sort((a,b)=>a.file.localeCompare(b.file))[0]||null;
}
function readManifests(c,root,jobRoot,explicit=[]){
 const names=new Set(['materials-manifest.json','material-manifest.json','material-acquisition-input.json','material-coverage.json','candidate-sources.json']),files=new Set();
 // Deliberately avoid producer outputs and our own attempts: they must not make
 // an unchanged input miss its cache on every scheduled pass.
 for(const dir of [jobRoot,path.join(jobRoot,'materials')])if(fs.existsSync(dir))for(const e of fs.readdirSync(dir,{withFileTypes:true}))if(e.isFile()&&names.has(e.name))files.add(path.join(dir,e.name));
 if(!Array.isArray(explicit)||explicit.length>8)fail('MATERIAL_MANIFEST_LIMIT');
 for(const file of explicit){const candidate=path.resolve(root,file);if(!inside(jobRoot,candidate))fail('MATERIAL_MANIFEST_SCOPE_INVALID');files.add(candidate)}
 if(files.size>12)fail('MATERIAL_MANIFEST_LIMIT');
 return [...files].sort().map(file=>{const f=checked(file,root),m=JSON.parse(f.bytes.toString('utf8'));if(m.job_id!==c.job.id||canonical(m.binding)!==canonical(c.binding))fail('MATERIAL_MANIFEST_BINDING_CHANGED');return {file:f.file,sha256:sha(f.bytes),manifest:m}});
}
function list(value){if(value===undefined||value===null)return [];if(typeof value==='string'){try{value=JSON.parse(value)}catch{return [value]}}return Array.isArray(value)?value:[]}
const decode=value=>value.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(?:x([\da-f]+)|(\d+));/gi,(_,h,d)=>{const n=parseInt(h||d,h?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''});
function attrs(tag){const result={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))result[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]??'');return result}
const safeReference=(value,base)=>{try{return researchUrl(new URL(value,base).href).href}catch{return null}};
const videoPath=value=>/\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(value);
const imagePath=value=>/\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.test(value);
const adPattern=/(?:taboola|outbrain|doubleclick|adservice|googlesyndication|googletagmanager|google-analytics|\/advert(?:isements)?\/)/i;
function articleScope(html){
 // Prefer an explicit prose container inside an outer .article. The latter
 // may also enclose QR codes, recommendations and advertising (e.g. CNR).
 const clean=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,''),tokens=/<(div|section|article)\b[^>]*>/gi;
 for(const token of clean.matchAll(tokens)){
  const a=attrs(token[0]),names=[a.id,...String(a.class||'').split(/\s+/)];if(!names.some(n=>['mp-editor','article-content','article_content','article-body','article_body','rich_media_content','TRS_Editor','content_views'].includes(n)))continue;
  const tag=token[1],end=new RegExp('<\\/?'+tag+'\\b[^>]*>','gi');end.lastIndex=token.index+token[0].length;let depth=1,next;
  while((next=end.exec(clean))){depth+=next[0][1]==='/'?-1:1;if(depth===0)return '<html><head>'+(clean.match(/<title\b[^>]*>[\s\S]*?<\/title\s*>/i)?.[0]||'')+'</head><body><article>'+clean.slice(token.index+token[0].length,next.index)+'</article></body></html>'}
 }
 return clean;
}
function publicPlayerReferences(html,url){
 const references=[],add=(raw,basis,embed=false)=>{const href=typeof raw==='string'&&safeReference(decode(raw),url);if(!href||adPattern.test(href)||/\.(?:m3u8|mpd)(?:$|[?#])/i.test(href)||references.some(r=>r.url===href))return;const kind=embed&&!videoPath(href)?'document':'video';references.push({url:href,kind,basis,...(kind==='document'?{public_player:true}:{})});};
 // Only public HTML media declarations are read. No script is executed and no
 // platform API, authenticated playlist or player-internal request is derived.
 const clean=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(aside|nav|footer|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 for(const match of clean.matchAll(/<(video|source|iframe|embed|meta)\b[^>]*>/gi)){
  const tag=match[1].toLowerCase(),a=attrs(match[0]);if(/(?:advert|recommend|\bad(?:vert)?[-_]|qrcode)/i.test([a.id,a.class].join(' ')))continue;
  if(tag==='video')add(a.src||a['data-src'],'public-player-video-src');
  if(tag==='source'&&(!a.type||/^video\//i.test(a.type)))add(a.src,'public-player-source-src');
  if(['iframe','embed'].includes(tag))add(a.src,'public-player-embedded-source',true);
  if(tag==='meta'&&/^og:video(?::(?:url|secure_url))?$/.test(a.property||a.name||''))add(a.content,'public-player-open-graph-video',true);
 }
 let count=0;const walk=value=>{if(++count>150)return;if(Array.isArray(value)){for(const x of value)walk(x);return}if(!value||typeof value!=='object')return;const types=Array.isArray(value['@type'])?value['@type']:[value['@type']];if(types.some(t=>t==='VideoObject'||t==='https://schema.org/VideoObject'||t==='http://schema.org/VideoObject')){add(value.contentUrl,'public-player-structured-content-url');add(value.embedUrl,'public-player-structured-embed-url',true);}for(const [key,v]of Object.entries(value))if(key==='@graph'||key==='mainEntity'||key==='video'||key==='itemListElement'||key==='item')walk(v);};
 for(const match of clean.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){if(!/^application\/ld\+json(?:;|$)/i.test(attrs(match[1]).type||''))continue;try{walk(JSON.parse(match[2]))}catch{}}
 return [...references,...publishedPageVideos(html,url)].filter((r,i,a)=>a.findIndex(v=>v.url===r.url)===i).slice(0,32);
}
export function articleMaterialReferences(html,url,{public_player=false}={}){
 const article=extractSourceArticle(articleScope(html),{url}),references=[];
 // A page-wide fallback can contain unrelated recommendations and ad players.
 // It remains a checked source, but does not automatically yield media.
 if(!article.article_found)return {title:article.title,extraction:article.extraction,article_found:false,references:public_player?publicPlayerReferences(html,url):publishedPageVideos(html,url),text:article.text};
 const body=article.body_html.replace(/<(?:audio)\b[^>]*>[\s\S]*?<\/audio\s*>/gi,''),add=(raw,kind,basis)=>{const href=raw&&safeReference(raw,url);if(href&&!adPattern.test(href)&&!references.some(r=>r.url===href))references.push({url:href,kind,basis,...(basis==='article-embedded-source'?{public_player:true}:{})})};
 for(const match of body.matchAll(/<(video|source|iframe|embed|a|img)\b[^>]*>/gi)){
  const tag=match[1].toLowerCase(),a=attrs(match[0]);
  if(tag==='video')add(a.src||a['data-src'],'video','article-video-src');
  if(tag==='source'&&(!a.type||/^video\//i.test(a.type))&&videoPath(a.src||''))add(a.src,'video','article-source-src');
  if(['iframe','embed'].includes(tag))add(a.src,'document','article-embedded-source');
  if(tag==='a'&&videoPath(a.href||''))add(a.href,'video','article-linked-video');
  if(tag==='img'){const value=a['data-original']||a['data-src']||a.src;if(imagePath(value||'')&&!/logo|avatar|icon|qrcode|qr[-_]code|banner/i.test([a.alt,a.class,a.id].join(' ')))add(value,'image','article-original-image')}
 }
 const player=public_player?publicPlayerReferences(html,url):publishedPageVideos(html,url);return {title:article.title,extraction:article.extraction,article_found:true,references:[...references,...player].filter((r,i,a)=>a.findIndex(v=>v.url===r.url)===i).slice(0,32),text:article.text};
}
const pinnedLookup=address=>(_name,options,callback)=>options.all?callback(null,[{address,family:4}]):callback(null,address,4);
export function decodePublicMaterialBody(body,encoding,maxBytes){
 if(!Buffer.isBuffer(body)||!body.length||body.length>maxBytes)fail('MATERIAL_BYTE_BUDGET');
 const name=String(encoding||'identity').trim().toLowerCase();if(name==='identity')return body;
 const decode={gzip:gunzipSync,deflate:inflateSync,br:brotliDecompressSync}[name];if(!decode)fail('MATERIAL_CONTENT_ENCODING_REJECTED');
 let decoded;try{decoded=decode(body,{maxOutputLength:maxBytes});}catch(error){fail(error.code==='ERR_BUFFER_TOO_LARGE'?'MATERIAL_BYTE_BUDGET':'MATERIAL_CONTENT_ENCODING_INVALID');}
 if(!decoded.length||decoded.length>maxBytes)fail('MATERIAL_BYTE_BUDGET');return decoded;
}
function transportResponse(url,address,{timeoutMs,maxBytes,connectTimeoutMs=timeoutMs}){
 return new Promise((resolve,reject)=>{
  let phase='tcp-connect',connectTimer;
  const request=https.request(url,{method:'GET',agent:false,family:4,servername:url.hostname,maxHeaderSize:16384,signal:AbortSignal.timeout(Math.max(1,Math.floor(timeoutMs))),lookup:pinnedLookup(address),headers:{'User-Agent':'SiounexMaterialDiscovery/1.0 (bounded public research)','Accept':'text/html,application/xhtml+xml,text/plain,video/mp4,video/webm,image/png,image/jpeg,image/webp,image/gif','Accept-Encoding':'gzip, deflate, br'}},response=>{
   phase='response-body';clearTimeout(connectTimer);
   const status=response.statusCode||0,h=response.headers;if(status>=300&&status<400){response.destroy();resolve({status,location:h.location});return}
   const encoding=String(h['content-encoding']||'identity').toLowerCase(),length=h['content-length'];
   if(status!==200||!['identity','gzip','deflate','br'].includes(encoding)||length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>maxBytes)){response.destroy();reject(Error(status!==200?'MATERIAL_HTTP_'+status:!['identity','gzip','deflate','br'].includes(encoding)?'MATERIAL_CONTENT_ENCODING_REJECTED':'MATERIAL_DECLARED_SIZE_REJECTED'));return}
   const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){response.destroy(Error('MATERIAL_BYTE_BUDGET'));return}chunks.push(chunk)});response.once('error',reject);response.once('end',()=>resolve({status,body:Buffer.concat(chunks),contentType:String(h['content-type']||''),contentEncoding:encoding}));
  });connectTimer=setTimeout(()=>request.destroy(Object.assign(Error('MATERIAL_CONNECT_DEADLINE'),{code:'ETIMEDOUT'})),Math.max(1,Math.floor(connectTimeoutMs)));request.once('socket',socket=>{socket.once('connect',()=>{phase='tls-connect';});socket.once('secureConnect',()=>{phase='response-headers';clearTimeout(connectTimer);});});request.once('error',error=>{clearTimeout(connectTimer);error.transport_phase=phase;reject(error);});request.end();
 });
}
function mediaType(body,mime,kind){
 if(kind==='page-or-video')return mediaType(body,mime,/^(?:text\/(?:html|plain)|application\/xhtml\+xml)$/.test(mime)?'document':'video');
 if(kind==='document'){if(!/^(?:text\/(?:html|plain)|application\/xhtml\+xml)$/.test(mime))fail('MATERIAL_DOCUMENT_MIME');return '.html'}
 if(kind==='video'){
  if(!/^(?:video\/(?:mp4|webm|quicktime|x-m4v)|application\/octet-stream)$/.test(mime))fail('MATERIAL_VIDEO_MIME');
  if(body.length>=16&&body.toString('ascii',4,8)==='ftyp')return '.mp4';
  if(body.length>=16&&body.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))return '.webm';
  fail('MATERIAL_VIDEO_SIGNATURE');
 }
 if(kind==='image'){
  if(mime==='image/png'&&body.length>=24&&body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';
  if(mime==='image/jpeg'&&body.length>=4&&body[0]===255&&body[1]===216&&body[2]===255)return '.jpg';
  if(mime==='image/webp'&&body.length>=12&&body.toString('ascii',0,4)==='RIFF'&&body.toString('ascii',8,12)==='WEBP')return '.webp';
  if(mime==='image/gif'&&body.length>=13&&/^GIF8[79]a$/.test(body.toString('ascii',0,6)))return '.gif';
  fail('MATERIAL_IMAGE_SIGNATURE');
 }
 fail('MATERIAL_KIND_INVALID');
}
// Uses the existing research HTTPS/DNS boundary, including each redirect and
// pinned public IPv4 connection. There are no cookies, auth headers or APIs.
export async function readPublicMaterial(value,{kind='document',lookup,doh,transport=transportResponse,timeoutMs=15000,maxBytes=2000000,maxRedirects=3,dnsCache,_proxyAttempt=false}={}){
 if(!['document','video','image','page-or-video'].includes(kind)||!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isInteger(maxRedirects)||maxRedirects<0)fail('MATERIAL_LIMIT_INVALID');
 maxBytes=Math.min(maxBytes,kind==='document'?MAX.document_bytes:MAX.media_bytes);timeoutMs=Math.min(timeoutMs,MAX.request_ms);maxRedirects=Math.min(maxRedirects,MAX.redirects);
 const original=researchUrl(value).href,deadline=Date.now()+timeoutMs,read_diagnostics=[];let current=original;
 try{
 for(let hop=0;hop<=maxRedirects;hop++){
  const url=researchUrl(current);let records=dnsCache?.get(url.hostname);if(!records){try{records=await resolveResearchAddresses(url.hostname,{lookup,doh,timeoutMs:deadline-Date.now(),...(_proxyAttempt?{lookupTimeoutMs:4000}:{})});dnsCache?.set(url.hostname,records);}catch(error){read_diagnostics.push({phase:'public-dns',hostname:url.hostname,error:String(error.code||error.message).slice(0,200)});throw error;}}
  if(!Array.isArray(records)||!records.length||records.some(r=>r.family!==4||!publicResearchAddress(r.address)))fail('MATERIAL_PUBLIC_DNS_REQUIRED');
  // A CDN can return several public edges while one route is temporarily down.
  // Only transport failures may try another address from this validated answer;
  // HTTP denials, MIME/signature failures and redirect policy are never retried.
  let r;const addresses=[...new Set(records.map(r=>r.address))].slice(0,3);for(const [index,address]of addresses.entries()){const remaining=deadline-Date.now(),slice=index===addresses.length-1?remaining:Math.min(5000,Math.max(1,Math.floor(remaining/(addresses.length-index)))),started=Date.now();try{r=await bounded(()=>transport(url,address,{timeoutMs:remaining,connectTimeoutMs:slice,maxBytes}),remaining);read_diagnostics.push({phase:'public-https',hostname:url.hostname,validated_public_ipv4:address,status:r.status,elapsed_ms:Date.now()-started});if(index&&dnsCache)dnsCache.set(url.hostname,[records.find(r=>r.address===address),...records.filter(r=>r.address!==address)]);break;}catch(error){read_diagnostics.push({phase:'public-https',hostname:url.hostname,validated_public_ipv4:address,error:String(error.code||error.message).slice(0,200),...(error.transport_phase?{transport_phase:error.transport_phase}:{}),elapsed_ms:Date.now()-started});if(!transientRead(error)||index===addresses.length-1||Date.now()>=deadline)throw error;}}
  if(r.status>=300&&r.status<400){if(hop===maxRedirects||!r.location)fail('MATERIAL_REDIRECT_LIMIT');current=researchUrl(new URL(r.location,url).href).href;continue}
  if(r.status!==200||!Buffer.isBuffer(r.body)||!r.body.length||r.body.length>maxBytes)fail('MATERIAL_RESPONSE_INVALID');
  r={...r,body:decodePublicMaterialBody(r.body,r.contentEncoding,maxBytes),contentEncoding:'identity'};
  const mime=String(r.contentType||'').split(';')[0].trim().toLowerCase(),extension=mediaType(r.body,mime,kind);if(extension==='.html'&&r.body.length>MAX.document_bytes)fail('MATERIAL_BYTE_BUDGET');
  return {url:original,resolved_url:current,body:r.body,sha256:sha(r.body),size_bytes:r.body.length,mime_type:mime,extension,content_type:r.contentType,detected_kind:extension==='.html'?'document':kind==='page-or-video'?'video':kind,read_diagnostics};
 }
 fail('MATERIAL_REDIRECT_LIMIT');
 }catch(error){
  error.read_diagnostics=read_diagnostics;
  // Only a direct transport/DNS failure may use the user's existing WinHTTP
  // route. The proxy receives a validated public IP, not a hostname; each
  // redirect is re-resolved through TLS-authenticated DNS and revalidated.
  if(!_proxyAttempt&&!lookup&&!doh&&transport===transportResponse&&transientRead(error)&&deadline-Date.now()>1000){
   const proxy=winHttpProxy();if(proxy&&deadline-Date.now()>1000){
    const proxied=(url,address,options)=>proxyPublicResponse(url,address,{...options,proxy});
    const authoritative=async name=>researchDohLookup(name,{transport:proxied,timeoutMs:Math.min(4000,deadline-Date.now())});
    try{const value=await readPublicMaterial(original,{kind,lookup:authoritative,transport:proxied,timeoutMs:deadline-Date.now(),maxBytes,maxRedirects,_proxyAttempt:true});value.read_diagnostics=[...read_diagnostics,{phase:'existing-winhttp-proxy'},...value.read_diagnostics];return value}catch(next){next.read_diagnostics=[...read_diagnostics,{phase:'existing-winhttp-proxy'},...(next.read_diagnostics||[])];throw next;}
   }
  }
  throw error;
 }
}
export function inspectMaterial(file,{kind='video',run=spawnSync,timeoutMs=15000}={}){
 const p=run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',file],{encoding:'utf8',windowsHide:true,timeout:Math.min(10000,timeoutMs),maxBuffer:1000000});
 if(p.status!==0)fail('MATERIAL_PROBE_FAILED');const report=JSON.parse(p.stdout),v=report.streams?.find(s=>s.codec_type==='video'),duration=Number(report.format?.duration||v?.duration);
 if(!v||!Number.isInteger(v.width)||!Number.isInteger(v.height)||v.width<16||v.height<16||v.width>8192||v.height>8192||kind==='video'&&(!Number.isFinite(duration)||duration<=0||duration>7200))fail('MATERIAL_PROBE_INVALID');
 const out=run('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file,pipe','-i',file,'-frames:v','1','-vf','scale=640:-2','-f','image2pipe','-vcodec','png','pipe:1'],{windowsHide:true,timeout:Math.min(10000,timeoutMs),maxBuffer:4000000});
 const frame=Buffer.isBuffer(out.stdout)?out.stdout:Buffer.from(out.stdout||'');if(out.status!==0||frame.length<24||!frame.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('MATERIAL_FRAME_DECODE_FAILED');
 return {probe:{width:v.width,height:v.height,duration_seconds:Number.isFinite(duration)?duration:null,frame_rate:v.avg_frame_rate||v.r_frame_rate||null,codec_name:v.codec_name||null,audio_present:report.streams.some(s=>s.codec_type==='audio')},frame};
}
function requirements(c){return bodyStoryboard(c.draft.storyboard).map((s,index)=>({id:sha(canonical({binding:c.binding,index,asset_id:s.asset_id,visual:s.visual})),storyboard_index:index,asset_id:s.asset_id||null,narration:s.narration||'',visual:s.visual||'',reason:s.reason||'',start:s.start??null,end:s.end??null,required_kind:/^image_/.test(s.asset_id||'')?'image':/实录|连续|操作|试玩|动作|原片|视频|动画/.test(s.visual||'')?'video':'existing-or-reviewed-plan',satisfied:false,semantic_verification:'pending-exact-segment-review'}))}
function sourceEntries(c,manifests,explicit){
 const items=[{url:c.source.url,kind:'document',basis:'current-approved-source'},...list(c.source.related_urls).map(x=>({...(typeof x==='string'?{url:x}:x),basis:'current-source-related-url'}))];
 if(!Array.isArray(explicit)||explicit.length>12)fail('MATERIAL_SOURCE_LIMIT');
 for(const entry of [...explicit,...manifests.flatMap(m=>[...list(m.manifest.sources),...list(m.manifest.candidate_sources),...list(m.manifest.candidates).filter(x=>x.url||x.source_url)])]){
  const e=typeof entry==='string'?{url:entry}:entry;if(!e||e.binding&&canonical(e.binding)!==canonical(c.binding)||e.job_id&&e.job_id!==c.job.id)fail('MATERIAL_CANDIDATE_BINDING_CHANGED');items.push({...e,url:e.url||e.source_url,basis:'explicit-current-candidate-source'});
 }
 return items.map(e=>{const directVideo=videoPath(e.url),kind=directVideo?'video':e.kind==='image'||imagePath(e.url)?'image':'document';return {...e,url:researchUrl(e.url).href,kind,...(kind==='document'&&(e.basis==='explicit-current-candidate-source'||e.basis==='current-source-related-url'&&e.kind==='video')?{public_player:true}:{})};}).filter((e,i,a)=>a.findIndex(x=>x.url===e.url)===i).slice(0,16);
}
function resultFor(attempt,file,bytes,cached=false){return {status:attempt.candidates.length?'candidates-found':'missing',job_id:attempt.job_id,binding:attempt.binding,input_hash:attempt.input_hash,observed_at:attempt.observed_at,requirements:attempt.requirements,candidates:attempt.candidates,checked_sources:attempt.checked_sources,missing:attempt.missing,next_steps:attempt.next_steps,attempt_file:path.resolve(file),sha256:sha(bytes),size_bytes:bytes.length,discovery_progress:{resumable:!!attempt.resume_state?.pending_sources?.length,pass_count:attempt.resume_state?.pass_count||1,pending_count:attempt.resume_state?.pending_sources?.length||0},new_paid_calls:0,semantic_approval:false,quality_approved:false,publication_authorized:false,cached}}
function cachedAttempt(indexFile,root,inputHash,now){
 if(!fs.existsSync(indexFile))return null;
 // Missing/different inputs can be searched; changed evidence for this exact
 // input must stop instead of being swallowed into another network attempt.
 try{const index=JSON.parse(checked(indexFile,root).bytes);if(index.input_hash!==inputHash)return null;
  const f=checked(index.attempt_file,root,5000000),a=JSON.parse(f.bytes),observed=Date.parse(a.observed_at);
  if(index.sha256!==sha(f.bytes)||index.size_bytes!==f.bytes.length||a.schema!==SCHEMA||a.input_hash!==inputHash||!Number.isFinite(observed)||now<observed||!Array.isArray(a.candidates)||!Array.isArray(a.checked_sources))fail('MATERIAL_ACQUISITION_CACHE_CHANGED');
  for(const row of a.checked_sources)if(row.file&&row.sha256&&row.size_bytes){const bytes=checked(row.file,root,64000000).bytes;if(sha(bytes)!==row.sha256||bytes.length!==row.size_bytes)fail('MATERIAL_ACQUISITION_CACHE_CHANGED')}
  for(const candidate of a.candidates){const m=checked(candidate.file,root,64000000);if(sha(m.bytes)!==candidate.sha256||m.bytes.length!==candidate.size_bytes)fail('MATERIAL_ACQUISITION_CACHE_CHANGED');for(const r of [candidate.frame,candidate.probe_file])if(r){const b=checked(r.file,root,5000000).bytes;if(sha(b)!==r.sha256||b.length!==r.size_bytes)fail('MATERIAL_ACQUISITION_CACHE_CHANGED')}}
  if(a.resume_state&&(!Number.isSafeInteger(a.resume_state.pass_count)||a.resume_state.pass_count<1||a.resume_state.pass_count>RESUME_PASSES||!Array.isArray(a.resume_state.pending_sources)||a.resume_state.pending_sources.length>64||!a.resume_state.read_attempts||typeof a.resume_state.read_attempts!=='object'))fail('MATERIAL_ACQUISITION_CACHE_CHANGED');
  return {result:resultFor(a,f.file,f.bytes,true),attempt:a};
 }catch{fail('MATERIAL_ACQUISITION_CACHE_CHANGED')}
}

export async function discoverMaterials({job,binding,root=process.cwd(),candidate_sources=[],material_manifest_files=[]},{read=readPublicMaterial,inspect=inspectMaterial,lookup,doh,transport,now=()=>new Date().toISOString(),bounds={}}={}){
 const c=context(job,binding),realRoot=fs.realpathSync(root),jobRoot=path.join(realRoot,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision),out=path.join(jobRoot,'material-acquisition'),policy=limits(bounds);mkdir(out,realRoot);
 const implementation_sha256=materialAcquisitionCodeSha([Buffer.from("bounded-public-compression-and-page-data-v3\n"),fs.readFileSync(fileURLToPath(import.meta.url)),fs.readFileSync(new URL('./public-page-video-data.mjs',import.meta.url)),fs.readFileSync(new URL('../lib/storyboard-segments.mts',import.meta.url))]),frozen=frozenSource(c,realRoot),manifests=readManifests(c,realRoot,jobRoot,material_manifest_files),sources=sourceEntries(c,manifests,candidate_sources),input_hash=sha(canonical({schema:SCHEMA,implementation_sha256,binding,source_snapshot_sha256:c.snapshotHash,frozen_sha256:frozen?.sha256||null,draft_sha256:job.approved_hash,owner_feedback_sha256:sha(typeof job.review_note==='string'?job.review_note:''),sources,manifests:manifests.map(m=>({file:m.file,sha256:m.sha256})),policy})),observed_at=now();
 if(!Number.isFinite(Date.parse(observed_at)))fail('MATERIAL_CLOCK_INVALID');
 const retained_hash=sha(canonical({schema:SCHEMA,implementation_sha256:RETAINED_ACQUISITION_IMPLEMENTATION,binding,source_snapshot_sha256:c.snapshotHash,frozen_sha256:frozen?.sha256||null,draft_sha256:job.approved_hash,owner_feedback_sha256:sha(typeof job.review_note==='string'?job.review_note:''),sources,manifests:manifests.map(m=>({file:m.file,sha256:m.sha256})),policy}));
 const retainedSupport=materialAcquisitionCodeSha([fs.readFileSync(new URL('./public-page-video-data.mjs',import.meta.url)),fs.readFileSync(new URL('../lib/storyboard-segments.mts',import.meta.url))])===RETAINED_ACQUISITION_SUPPORT_SHA256;
 const indexFile=path.join(out,'latest.json'),inputIndex=path.join(out,input_hash,'latest.json'),retained=retainedSupport?cachedAttempt(path.join(out,retained_hash,'latest.json'),realRoot,retained_hash,Date.parse(observed_at)):null;
 // The earlier implementation could permanently retain a completed pass that
 // only encountered transient network failures. Retry that old acquisition
 // once under the new transport identity; its original bytes remain usable via
 // retainedMotionCandidates. Completed successful observations stay cached.
 const oldNetworkGap=retained?.attempt?.checked_sources?.some(r=>r.status==='unavailable'&&r.transient===true||r.status==='not-read-budget'&&r.budget_scope!=='cumulative-source-limit'||r.status==='not-read-deadline-or-budget');
 const cached=cachedAttempt(inputIndex,realRoot,input_hash,Date.parse(observed_at))||(!oldNetworkGap?retained:null)||cachedAttempt(indexFile,realRoot,input_hash,Date.parse(observed_at)),previous=cached?.attempt;
 const missingTransient=new Map();for(const r of previous?.checked_sources||[])if(r.url)missingTransient.set(r.url,r);
 const retryNetwork=[...missingTransient.values()].filter(r=>r.status==='unavailable'&&r.transient===true||r.status==='not-read-budget'&&r.budget_scope!=='cumulative-source-limit'||r.status==='not-read-deadline-or-budget').map(r=>({url:r.url,kind:r.kind,basis:r.basis,parent_url:r.parent_url||null,...(r.public_player===true||r.kind==='document'&&r.basis==='explicit-current-candidate-source'?{public_player:true}:{})}));
 const pendingSources=previous?.resume_state?.pending_sources?.length?previous.resume_state.pending_sources:retryNetwork,resuming=!!pendingSources.length&&(previous.resume_state.pass_count<RESUME_PASSES||retryNetwork.length>0)&&(bounds.content_motion_policy==='content-motion@1'?previous.candidates.filter(c=>c.kind==='video').reduce((n,c)=>n+(c.probe?.duration_seconds||0),0)<90:!previous.candidates.some(c=>c.kind==='video'));if(cached&&!resuming)return cached.result;
 const lockFile=path.join(out,'.discovery.lock');let lock;try{lock=fs.openSync(lockFile,'wx');fs.writeFileSync(lock,canonical({input_hash,started_at:observed_at,pid:process.pid}))}catch(e){if(e.code==='EEXIST')fail('MATERIAL_DISCOVERY_ALREADY_RUNNING');throw e}
 try{
  const attemptDir=path.join(out,input_hash,new Date(observed_at).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());mkdir(attemptDir,realRoot);
  const requirementsList=requirements(c),checked_sources=resuming?[...previous.checked_sources]:[],candidates=resuming?[...previous.candidates]:[],queue=resuming?[...pendingSources]:[...sources],pending=[],read_attempts=resuming?{...previous.resume_state.read_attempts}:{},pass_count=resuming?Math.min(RESUME_PASSES,previous.resume_state.pass_count+1):1,pendingUrls=new Set(queue.map(s=>s.url)),visited=new Set(checked_sources.filter(s=>!pendingUrls.has(s.url)).map(s=>s.url)),deadline=Date.now()+policy.time_ms,dnsCache=new Map();let bytes=resuming?previous.budget.total_bytes:0,documents=0,media=0;
  const later=source=>{if(pass_count<RESUME_PASSES&&pending.length<64&&!pending.some(s=>s.url===source.url)&&bytes<policy.total_bytes)pending.push(source);};
  while(queue.length&&Date.now()<deadline){
   const priority={document:0,video:1,image:2};queue.sort((a,b)=>priority[a.kind]-priority[b.kind]||(read_attempts[a.url]?.count||0)-(read_attempts[b.url]?.count||0));
   const source=queue.shift();if(visited.has(source.url))continue;visited.add(source.url);
   const priorRead=read_attempts[source.url],uniqueLimit=source.kind==='document'?policy.documents:policy.media*4,uniqueCount=Object.values(read_attempts).filter(r=>r.kind===source.kind).length;
   if(!priorRead&&uniqueCount>=uniqueLimit){checked_sources.push({url:source.url,kind:source.kind,status:'not-read-budget',budget_scope:'cumulative-source-limit',basis:source.basis,...(source.public_player===true?{public_player:true}:{})});continue}
   if(source.kind==='document'&&documents>=policy.documents||source.kind!=='document'&&media>=policy.media){checked_sources.push({url:source.url,kind:source.kind,status:'not-read-budget',basis:source.basis,...(source.public_player===true?{public_player:true}:{})});later(source);continue}
   if(source.kind==='document')documents++;else media++;
   const maxBytes=Math.min(source.kind==='document'&&!source.public_player?policy.document_bytes:policy.media_bytes,policy.total_bytes-bytes);if(maxBytes<1)break;
   const row={url:source.url,kind:source.kind,basis:source.basis,parent_url:source.parent_url||null,...(source.public_player===true?{public_player:true}:{}),read_attempt:(priorRead?.count||0)+1};checked_sources.push(row);read_attempts[source.url]={kind:source.kind,count:row.read_attempt};
   try{
    let response;
    if(source.url===c.source.url&&source.kind==='document'&&frozen){response={url:source.url,resolved_url:source.url,body:frozen.bytes,sha256:frozen.sha256,size_bytes:frozen.bytes.length,content_type:'text/html; charset=utf-8',extension:'.html'};row.origin='approved-frozen-complete-source';row.frozen_file=frozen.file}
    else response=await bounded(()=>read(source.url,{kind:source.kind==='document'&&source.public_player?'page-or-video':source.kind,lookup,doh,...(transport?{transport}:{}),dnsCache,timeoutMs:Math.max(1,Math.min(policy.request_ms,deadline-Date.now())-100),maxBytes,maxRedirects:policy.redirects}),Math.min(policy.request_ms,deadline-Date.now()));
    if(!Buffer.isBuffer(response.body)||response.body.length>maxBytes||response.body.length<1||response.sha256!==sha(response.body)||response.size_bytes!==response.body.length)fail('MATERIAL_READER_BYTES_CHANGED');bytes+=response.body.length;
    row.resolved_url=response.resolved_url;row.sha256=response.sha256;row.size_bytes=response.size_bytes;if(response.read_diagnostics)row.read_diagnostics=response.read_diagnostics;
    const actualKind=source.kind==='document'&&source.public_player&&(response.detected_kind==='video'||/^(?:video\/|application\/octet-stream)/.test(response.mime_type||''))?'video':source.kind;row.detected_kind=actualKind;
    if(actualKind==='document'){
     const ref=put(path.join(attemptDir,'source-'+response.sha256+'.html'),response.body,realRoot),charset=String(response.content_type||'').match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||response.body.subarray(0,4096).toString('ascii').match(/<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf-8';let html;try{html=new TextDecoder(charset).decode(response.body)}catch{html=response.body.toString('utf8')}
     const extracted=articleMaterialReferences(html,response.resolved_url||source.url,{public_player:source.public_player===true});Object.assign(row,{status:'checked',file:ref.file,title:extracted.title,article_found:extracted.article_found,article_extraction:extracted.extraction,media_references:extracted.references});
     for(const candidate of extracted.references)if(!visited.has(candidate.url))queue.push({...candidate,parent_url:source.url,source_page_title:extracted.title,source_relation:candidate.source_relation||source.relation||source.source_relation||null});
    }else{
     if(source.kind==='document'){if(media>=policy.media)fail('MATERIAL_MEDIA_BUDGET');media++;}const extension=mediaType(response.body,response.mime_type||'',actualKind),original=put(path.join(attemptDir,'original-'+response.sha256+extension),response.body,realRoot);row.file=original.file;
     const duplicate=candidates.find(c=>c.sha256===response.sha256&&c.kind===actualKind);if(duplicate){duplicate.alternate_urls=[...(duplicate.alternate_urls||[]),source.url];row.status='candidate-duplicate-bytes';row.candidate_id=duplicate.id;continue}
     const technical=await bounded(()=>inspect(original.file,{kind:actualKind,timeoutMs:Math.min(15000,deadline-Date.now())}),Math.min(20000,deadline-Date.now()));
     if(!technical?.probe||!Buffer.isBuffer(technical.frame))fail('MATERIAL_TECHNICAL_INSPECTION_REQUIRED');
     const frame=put(path.join(attemptDir,'frame-'+response.sha256+'.png'),technical.frame,realRoot),probe_file=put(path.join(attemptDir,'probe-'+response.sha256+'.json'),Buffer.from(JSON.stringify(technical.probe,null,2)),realRoot);
     const candidate={id:'candidate_'+response.sha256,kind:actualKind,...original,url:source.url,resolved_url:response.resolved_url,source_url:source.parent_url||source.url,source_context:{page_url:source.parent_url||source.url,page_title:source.source_page_title||source.title||null,relation:source.source_relation||source.relation||null,claim:'public-page-context-only; exact-work-identity-unverified'},discovery_basis:source.basis,probe:technical.probe,probe_file,frame,possible_requirement_ids:requirementsList.filter(r=>r.required_kind===actualKind).map(r=>r.id),semantic_verification:'pending-exact-segment-review',rights_status:'unconfirmed',satisfies_requirements:false};
     candidates.push(candidate);row.status='candidate-downloaded-unverified';row.file=original.file;
    }
   }catch(error){row.status='unavailable';row.error=String(error.code||error.message||'MATERIAL_READ_FAILED').replace(/https?:\/\/\S+/g,'[source-url]').slice(0,300);if(error.read_diagnostics)row.read_diagnostics=error.read_diagnostics;row.transient=transientRead(error);if(row.transient&&row.read_attempt<READ_ATTEMPTS)later(source)}
  }
  for(const source of queue)if(!visited.has(source.url)){checked_sources.push({url:source.url,kind:source.kind,basis:source.basis,status:'not-read-deadline-or-budget',...(source.public_player===true?{public_player:true}:{})});later(source);}
  const missing=requirementsList.filter(r=>!r.satisfied).map(r=>({code:'material:'+r.asset_id,requirement_id:r.id,storyboard_index:r.storyboard_index,detail:r.visual||r.reason||r.narration,reason:candidates.length?'candidate-requires-exact-action-semantic-review':'no-verified-corresponding-original-found'})),next_steps=candidates.length?['逐一核对候选原片中的人物、课件/作品、具体动作及正常速度入出点；未完成精确段落语义核验前，不将候选标为可用或清除缺项。','核对素材复用权利；公开可下载不代表获得发布授权。']:['已查来源未取得对应实录；系统沿当前内容继续检索相关公开视频与支撑说明，保留已读来源和真实缺口；仅本人明确要求不可替代实测时等待该原始证据。','新增带当前job/binding的素材manifest后立即重新检查；未变输入按有时效缓存复用，不重复生成或伪造画面。'];
  const attempt={schema:SCHEMA,implementation_sha256,job_id:job.id,binding,input_hash,observed_at,source_snapshot_sha256:c.snapshotHash,approved_script_sha256:job.approved_hash,requirements:requirementsList,candidates,checked_sources,missing,next_steps,resume_state:{pass_count,pending_sources:pending,read_attempts,...(resuming?{previous_attempt_file:cached.result.attempt_file,previous_attempt_sha256:cached.result.sha256}:{})},budget:{policy,documents_read:documents,media_attempted:media,total_bytes:bytes,deadline_reached:Date.now()>=deadline},new_paid_calls:0,semantic_approval:false,quality_approved:false,publication_authorized:false},body=Buffer.from(JSON.stringify(attempt,null,2)),saved=put(path.join(attemptDir,'attempt.json'),body,realRoot),index=Buffer.from(JSON.stringify({input_hash,attempt_file:saved.file,sha256:saved.sha256,size_bytes:saved.size_bytes,observed_at},null,2)),partial=indexFile+'.partial-'+randomUUID();
  // Different source sets (original article and researched public clips) must
  // not evict each other's resumable cache on every scheduled budget slice.
  // Both pointers reference immutable, byte-checked attempt files; old attempts
  // stay intact when time passes or new input creates a different hash. Reuse
  // retains the original observed_at; it does not claim the public URL is unchanged.
  const keyedPartial=inputIndex+'.partial-'+randomUUID();fs.writeFileSync(keyedPartial,index,{flag:'wx'});fs.renameSync(keyedPartial,inputIndex);fs.writeFileSync(partial,index,{flag:'wx'});fs.renameSync(partial,indexFile);return resultFor(attempt,saved.file,body);
 }finally{if(lock!==undefined)fs.closeSync(lock);fs.unlinkSync(lockFile)}
}
