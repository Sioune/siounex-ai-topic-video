import {createHash} from 'node:crypto';
import {getSiteArchiveMetadata,openSiteArchiveForRead} from './site-file-archive';
import {db,siteArchiveBucket} from './store';
import {ProductionError} from './production-contract';
import type {SiteFileArchive} from './site-file-archive-contract.mts';
const digest=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
export const coverThumbnailKey=(id:string,sid:string,role:string,sha256:string)=>'site-private-thumbnails/v1/'+digest(id+'\n'+sid+'\n'+role+'\n'+sha256);
const key=(id:string,a:SiteFileArchive)=>coverThumbnailKey(id,a.site_archive_id,a.file.role,a.file.sha256);
function validBytes(bytes:Uint8Array){return bytes.length>=12&&bytes.length<=120000&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP';}
// Called only at the authenticated service dispatch boundary. Thumbnails have
// no role in archive confirmation, approvals, delivery or publishing decisions.
export async function putCoverThumbnail(id:string,b:Record<string,unknown>){
 const owner=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string}>();if(!owner?.owner_id)throw new ProductionError('任务所有者不存在',403);
 const sid=String(b.site_archive_id||''),source=String(b.source_sha256||''),role=String(b.role||''),encoded=b.thumbnail_base64;
 if(!/^sitefile_[a-f0-9]{64}$/.test(sid)||!/^([a-f0-9]{64})$/.test(source)||!['cover_3_4','cover_4_3'].includes(role)||typeof encoded!=='string'||encoded.length>160000||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new ProductionError('缩略文件参数无效',400);
 const archive=await getSiteArchiveMetadata(id,sid,owner.owner_id);if(archive.status!=='confirmed'||archive.file.role!==role||archive.file.sha256!==source)throw new ProductionError('缩略图与确认原图不匹配',409);
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}catch{throw new ProductionError('缩略文件无效',400);}if(!validBytes(bytes))throw new ProductionError('缩略文件无效',400);
 const thumbSha=digest(bytes),bucket=siteArchiveBucket(),k=key(id,archive),existing=await bucket.get(k);let condition=new Headers({'If-None-Match':'*'});if(existing){const current=new Uint8Array(await existing.arrayBuffer());if(existing.customMetadata?.source_sha256===source&&existing.customMetadata?.role===role&&existing.customMetadata?.thumbnail_sha256===digest(current)&&validBytes(current))return{source_sha256:source,thumbnail_sha256:digest(current),reused:true};
  // Repair only the exact corrupt object observed. A concurrent valid writer
  // wins the conditional write and is never overwritten by this repair.
  if(!existing.httpEtag)throw new ProductionError('损坏缩略图缺少条件写入标识',503);condition=new Headers({'If-Match':existing.httpEtag});}
 const result=await bucket.put(k,bytes,{onlyIf:condition,customMetadata:{source_sha256:source,thumbnail_sha256:thumbSha,role}});if(!result){const winner=await readCoverThumbnail(id,archive);if(!winner)throw new ProductionError('缩略文件写入未确认',503);return{source_sha256:source,thumbnail_sha256:digest(winner),reused:true};}try{await getSiteArchiveMetadata(id,sid,owner.owner_id);}catch(e){await bucket.delete(k);throw e;}return{source_sha256:source,thumbnail_sha256:thumbSha,reused:false};
}
export async function readCoverThumbnail(id:string,a:SiteFileArchive):Promise<Uint8Array|null>{
 if(a.status!=='confirmed'||!['cover_3_4','cover_4_3'].includes(a.file.role))return null;
 const object=await siteArchiveBucket().get(key(id,a));if(!object)return null;const bytes=new Uint8Array(await object.arrayBuffer());if(object.customMetadata?.source_sha256!==a.file.sha256||object.customMetadata?.role!==a.file.role||object.customMetadata?.thumbnail_sha256!==digest(bytes)||!validBytes(bytes))return null;return bytes;
}

// Read-only bounded parts support historical backfill, after the same owner,
// retention, original archive and manifest checks used for the original file.
export async function readCoverSourcePart(id:string,b:Record<string,unknown>){
 const owner=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string}>();if(!owner?.owner_id)throw new ProductionError('任务所有者不存在',403);
 const sid=String(b.site_archive_id||''),source=String(b.source_sha256||''),part=Number(b.part),role=String(b.role||'');
 if(!/^sitefile_[a-f0-9]{64}$/.test(sid)||!/^([a-f0-9]{64})$/.test(source)||!['cover_3_4','cover_4_3'].includes(role)||!Number.isSafeInteger(part)||part<0)throw new ProductionError('原图请求无效',400);
 const requested=b.chunk_size;if(requested!==undefined&&requested!==128*1024&&requested!==512*1024)throw new ProductionError('原图分片大小无效',400);
 const opened=await openSiteArchiveForRead(id,sid,owner.owner_id),a=opened.archive,size=requested===512*1024?512*1024:128*1024,offset=part*size;if(a.status!=='confirmed'||a.file.role!==role||a.file.sha256!==source||offset>=a.file.size_bytes)throw new ProductionError('原图绑定无效',409);
 const result=await opened.read({offset,length:Math.min(size,a.file.size_bytes-offset)}),bytes=new Uint8Array(await new Response(result.body).arrayBuffer());if(result.archive.file.sha256!==source||bytes.length!==Math.min(size,a.file.size_bytes-offset))throw new ProductionError('原图读取失败',503);
 let str='';for(let n=0;n<bytes.length;n+=8192)str+=String.fromCharCode(...bytes.subarray(n,n+8192));return{source_sha256:source,role,part,part_count:Math.ceil(a.file.size_bytes/size),size_bytes:a.file.size_bytes,chunk_size:size,chunk_base64:btoa(str),chunk_sha256:digest(bytes)};
}
