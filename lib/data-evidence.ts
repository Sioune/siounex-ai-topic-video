import * as store from './store';
import {hash,ProductionError,text} from './production-contract';

export const DATA_EVIDENCE_MAX_BYTES=10*1024*1024;
export const LEGACY_EVIDENCE_MAX_BYTES=1024*1024;
// Bound the complete multipart stream before the platform parses any form fields.
export const DATA_EVIDENCE_REQUEST_MAX_BYTES=DATA_EVIDENCE_MAX_BYTES+32*1024;
export const DATA_EVIDENCE_META_COLUMNS='id,file_name,content_type,sha256,size_bytes,captured_at,created_at,storage_kind';
type EvidenceRow={id:string;owner_id:string;file_name:string;content_type:string;sha256:string;size_bytes:number;image_base64:string;captured_at:string|null;created_at:string;storage_kind?:string;storage_key?:string|null};
export type DataEvidenceMetadata={id:string;file_name:string;content_type:string;sha256:string;size_bytes:number;captured_at:string|null;created_at:string;storage_kind:string};
const db=()=>store.db();
async function bucket():Promise<R2Bucket>{const accessor=Reflect.get(store,'siteArchiveBucket');if(typeof accessor!=='function')throw new ProductionError('私有截图存储暂不可用',503);return accessor();}
const metadata=(r:EvidenceRow):DataEvidenceMetadata=>({id:r.id,file_name:r.file_name,content_type:r.content_type,sha256:r.sha256,size_bytes:Number(r.size_bytes),captured_at:r.captured_at,created_at:r.created_at,storage_kind:r.storage_kind||'d1'});
function ownerId(owner:string){return text(owner,500);}
function capturedAt(value:unknown){if(value===undefined||value===null||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT/.test(value)||!Number.isFinite(Date.parse(value)))throw new ProductionError('截图时间无效',400);return new Date(value).toISOString();}
function fileName(value:unknown){return text(value,180).split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g,'').trim()||'截图';}
function imageType(bytes:Uint8Array){
 if(bytes.length<12)throw new ProductionError('截图内容不完整',400);
 if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80)return 'image/webp';
 throw new ProductionError('仅支持PNG、JPEG、WebP原始截图，文件内容与格式须匹配',400);
}
async function sha256(bytes:Uint8Array){const value=await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>);return Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,'0')).join('');}
async function storageKey(owner:string,sha:string){return 'site-private-data-evidence/v1/'+await hash(owner)+'/'+sha;}
async function rowForOwner(owner:string,id:string){const row=await db().prepare('SELECT * FROM production_data_evidence WHERE id=? AND owner_id=?').bind(text(id,100),ownerId(owner)).first<EvidenceRow>();if(!row)throw new ProductionError('截图不存在或无权读取',404);return row;}

export function evidenceSameOrigin(req:Request,write=false){const origin=req.headers.get('origin'),site=req.headers.get('sec-fetch-site');return (!write||!!origin)&&(!origin||origin===new URL(req.url).origin)&&(!site||site==='same-origin'||(!write&&site==='none'));}
export async function readEvidenceUpload(req:Request){
 const contentType=req.headers.get('content-type')||'';
 if(!/^multipart\/form-data\s*;/i.test(contentType)||contentType.length>200)throw new ProductionError('请以原始文件上传截图',415);
 const length=req.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>DATA_EVIDENCE_REQUEST_MAX_BYTES))throw new ProductionError('每张截图最多10MiB',413);
 if(!req.body)throw new ProductionError('未收到截图文件',400);
 const reader=req.body.getReader(),chunks:Uint8Array[]=[],maximum=DATA_EVIDENCE_REQUEST_MAX_BYTES;let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maximum){await reader.cancel();throw new ProductionError('每张截图最多10MiB',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const body=new Uint8Array(total);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
 let form:FormData;try{form=await new Response(body,{headers:{'Content-Type':contentType}}).formData();}catch{throw new ProductionError('截图上传表单无效',400);}
 for(const key of form.keys())if(!['file','captured_at'].includes(key))throw new ProductionError('截图上传字段无效',400);
 if(form.getAll('file').length!==1||form.getAll('captured_at').length>1)throw new ProductionError('请每次上传一张截图',400);
 const file=form.get('file'),capture=form.get('captured_at');if(!file||typeof file==='string'||capture!==null&&typeof capture!=='string')throw new ProductionError('未收到截图文件或时间格式无效',400);
 if(file.size>DATA_EVIDENCE_MAX_BYTES)throw new ProductionError('每张截图最多10MiB',413);
 const bytes=new Uint8Array(await file.arrayBuffer());return {bytes,file_name:fileName(file.name),captured_at:capturedAt(capture),claimed_type:file.type};
}
export async function saveEvidenceBytes(owner:string,input:{bytes:Uint8Array;file_name:unknown;captured_at?:unknown;claimed_type?:string}){
 const oid=ownerId(owner),bytes=input.bytes;if(bytes.length>DATA_EVIDENCE_MAX_BYTES)throw new ProductionError('每张截图最多10MiB',413);
 const type=imageType(bytes),name=fileName(input.file_name),captured=capturedAt(input.captured_at);
 if(input.claimed_type&&input.claimed_type!=='application/octet-stream'&&input.claimed_type.toLowerCase()!==type)throw new ProductionError('截图声明格式与真实内容不一致',400);
 const sha=await sha256(bytes),old=await db().prepare('SELECT * FROM production_data_evidence WHERE owner_id=? AND sha256=?').bind(oid,sha).first<EvidenceRow>();if(old)return {evidence:metadata(old),replayed:true};
 const key=await storageKey(oid,sha),r2=await bucket();
 // Content-addressed private keys make a simultaneous retry write the same bytes.
 await r2.put(key,bytes as Uint8Array<ArrayBuffer>,{httpMetadata:{contentType:type},customMetadata:{sha256:sha,size_bytes:String(bytes.length)}});
 const id='de_'+crypto.randomUUID(),created=new Date().toISOString();
 const inserted=await db().prepare("INSERT INTO production_data_evidence(id,owner_id,file_name,content_type,sha256,size_bytes,image_base64,captured_at,created_at,storage_kind,storage_key) VALUES (?,?,?,?,?,?,'',?,?,'r2',?) ON CONFLICT(owner_id,sha256) DO NOTHING").bind(id,oid,name,type,sha,bytes.length,captured,created,key).run();
 const actual=await db().prepare('SELECT * FROM production_data_evidence WHERE owner_id=? AND sha256=?').bind(oid,sha).first<EvidenceRow>();if(!actual)throw new ProductionError('截图保存未完成，请重试原图',503);
 return {evidence:metadata(actual),replayed:!inserted.meta.changes};
}
export async function saveEvidence(owner:string,b:Record<string,unknown>){
 const base64=text(b.image_base64,Math.ceil(LEGACY_EVIDENCE_MAX_BYTES/3)*4);
 if(base64.length%4!==0||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw new ProductionError('截图编码无效',400);
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch{throw new ProductionError('截图编码无效',400);}
 if(bytes.length>LEGACY_EVIDENCE_MAX_BYTES)throw new ProductionError('旧截图入口最多1MiB，请使用手机原图上传入口（最多10MiB）',413);
 return saveEvidenceBytes(owner,{bytes,file_name:b.file_name,captured_at:b.captured_at});
}
export async function getEvidence(owner:string,id:string){return metadata(await rowForOwner(owner,id));}
export async function getEvidenceBytes(owner:string,id:string){
 const row=await rowForOwner(owner,id),size=Number(row.size_bytes),kind=row.storage_kind||'d1';
 if(!Number.isInteger(size)||size<12||size>DATA_EVIDENCE_MAX_BYTES)throw new ProductionError('截图大小记录无效或超过10MiB读取上限',409);
 let bytes:Uint8Array;
 if(kind==='r2'){
  if(row.storage_key!==await storageKey(row.owner_id,row.sha256))throw new ProductionError('截图存储记录无效',409);
  const object=await(await bucket()).get(row.storage_key);if(!object||object.size!==size)throw new ProductionError('截图原文件缺失或大小校验失败',409);
  bytes=new Uint8Array(await object.arrayBuffer());
 }else if(kind==='d1'){
  if(size>LEGACY_EVIDENCE_MAX_BYTES||typeof row.image_base64!=='string'||row.image_base64.length>Math.ceil(LEGACY_EVIDENCE_MAX_BYTES/3)*4)throw new ProductionError('历史截图编码超过读取上限',409);
  try{bytes=Uint8Array.from(atob(row.image_base64),c=>c.charCodeAt(0));}catch{throw new ProductionError('历史截图编码无效',409);}
 }else throw new ProductionError('截图存储类型无效',409);
 if(bytes.length!==size||await sha256(bytes)!==row.sha256)throw new ProductionError('截图原文件完整性校验失败',409);
 let actualType:string;try{actualType=imageType(bytes);}catch{throw new ProductionError('截图原文件格式校验失败',409);}if(actualType!==row.content_type)throw new ProductionError('截图原文件格式校验失败',409);
 return {bytes,evidence:metadata(row)};
}
