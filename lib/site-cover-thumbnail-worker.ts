import {randomUUID,createHash} from 'node:crypto';
import {db} from './store';
import {ProductionError} from './production-contract';
import {SITE_ARCHIVE_DECISION,validSiteArchive} from './site-file-archive-contract.mts';
import {getSiteArchiveMetadata} from './site-file-archive';
import {readCoverThumbnail} from './site-cover-thumbnail';
const keyFor=(owner:string)=>'site_cover_thumbnail_worker_v1:'+createHash('sha256').update(owner).digest('hex');
const LEASE=180000,BACKOFF=300000;
type State={schema:'site-cover-thumbnail-worker-v1';cursor:string;token:string|null;until:number;retry_after:number};
const encode=(v:State)=>JSON.stringify(v);
const initial:State={schema:'site-cover-thumbnail-worker-v1',cursor:'',token:null,until:0,retry_after:0};
async function row(owner:string){const r=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(keyFor(owner)).first<{value:string}>();if(!r)return null;try{const s=JSON.parse(r.value) as State;if(s.schema!=='site-cover-thumbnail-worker-v1'||typeof s.cursor!=='string'||!Number.isSafeInteger(s.until)||!Number.isSafeInteger(s.retry_after))throw Error();return{raw:r.value,s};}catch{throw new ProductionError('缩略图后台状态无效',409);}}
async function cas(owner:string,raw:string,next:State){const result=await db().prepare('UPDATE app_state SET value=? WHERE key=? AND value=?').bind(encode(next),keyFor(owner),raw).run();if(!result.meta.changes)throw new ProductionError('缩略图工位租约已变',409);}
async function leased(owner:string,token:unknown){const r=await row(owner);if(!r||typeof token!=='string'||r.s.token!==token||r.s.until<=Date.now())throw new ProductionError('缩略图工位租约已过期',409);return r;}
export async function claimCoverThumbnailWorker(owner:string){
 await db().prepare('INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(keyFor(owner),encode(initial)).run();const r=await row(owner);if(!r)throw new ProductionError('缩略图工位不可用',503);const now=Date.now();if(r.s.until>now||r.s.retry_after>now)return{claimed:false,retry_after:Math.max(r.s.until,r.s.retry_after)};const token=randomUUID(),s={...r.s,token,until:now+LEASE};await cas(owner,r.raw,s);return{claimed:true,token,until:s.until};
}
export async function nextCoverThumbnail(owner:string,token:unknown){
 const r=await leased(owner,token),result=await db().prepare("SELECT r.id,r.job_id,r.note,j.owner_id FROM production_reviews r JOIN production_jobs j ON j.id=r.job_id WHERE r.decision=? AND j.is_test=0 AND j.owner_id=? AND r.id>? AND json_valid(r.note) AND json_extract(r.note,'$.file.role') IN ('cover_3_4','cover_4_3') ORDER BY r.id LIMIT 1").bind(SITE_ARCHIVE_DECISION,owner,r.s.cursor).all<{id:string;job_id:string;note:string;owner_id:string}>();const x=result.results[0];if(!x)return{done:true};
 let a;try{const note=JSON.parse(x.note);if(note.owner_id!==x.owner_id||!validSiteArchive(note))return{cursor:x.id,skip:true};a=await getSiteArchiveMetadata(x.job_id,note.site_archive_id,x.owner_id);if(a.file.sha256!==note.file.sha256||a.file.role!==note.file.role)return{cursor:x.id,skip:true};const existing=await readCoverThumbnail(x.job_id,a);return{cursor:x.id,item:{id:x.job_id,site_archive_id:a.site_archive_id,source_sha256:a.file.sha256,role:a.file.role},exists:!!existing};}catch(error){if(error instanceof ProductionError&&[403,404,409,410].includes(error.status))return{cursor:x.id,skip:true};throw error;}
}
export async function finishCoverThumbnailWorker(owner:string,token:unknown,b:Record<string,unknown>){
 const r=await leased(owner,token);if(b.done===true){await cas(owner,r.raw,{...r.s,cursor:'',token:null,until:0,retry_after:Date.now()+BACKOFF});return{done:true};}
 if(b.failed===true){const cursor=typeof b.cursor==='string'&&/^site_archive_confirmed_[a-f0-9]{64}$/.test(b.cursor)&&b.cursor>r.s.cursor?b.cursor:r.s.cursor;await cas(owner,r.raw,{...r.s,cursor,token:null,until:0,retry_after:Date.now()+BACKOFF});return{deferred:true,advanced:cursor!==r.s.cursor};}
 if(typeof b.cursor!=='string'||!/^site_archive_confirmed_[a-f0-9]{64}$/.test(b.cursor)||b.cursor<=r.s.cursor)throw new ProductionError('缩略图游标无效',400);
 await cas(owner,r.raw,{...r.s,cursor:b.cursor,token:null,until:0,retry_after:Date.now()+10000});return{advanced:true};
}
