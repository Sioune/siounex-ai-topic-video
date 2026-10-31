import {db} from './store';
import {platformCopyReview} from './publishing-copy-review';
import {ProductionError,text} from './production-contract';
import type {PublishingReserve} from './publishing-contract.mts';

function decodeArtifact(value:string):Record<string,unknown>{try{return JSON.parse(String(value));}catch{throw new ProductionError('保存的发布绑定无效',409);}}
// Dashboard-only projection: batch the exact owner, approved promotion and saved
// review reads. Mutations and dispatch continue to re-read their own guards.
export async function currentPlatformCopyReviews(owner:string,reserves:PublishingReserve[]){
 const active=reserves.filter(r=>['ready','reserved'].includes(r.status));
 const reviews=await Promise.all(Array.from({length:Math.ceil(active.length/40)},async(_,chunk)=>{
  const group=active.slice(chunk*40,chunk*40+40);
  const rows=await db().batch(group.map(r=>{const promo=r.binding.materials.find(m=>m.role==='promotion');return db().prepare(`SELECT j.id,m.artifact,s.value AS review_value FROM production_jobs j LEFT JOIN production_milestones m ON m.job_id=j.id AND m.id=? AND m.artifact_hash=? AND m.status='approved' LEFT JOIN app_state s ON s.key=? WHERE j.id=? AND (j.owner_id=? OR j.is_test=1)`).bind(promo?.milestone_id??null,promo?.artifact_hash??null,'publishing_platform_copy_review_v1:'+owner+':'+r.binding.job_id,r.binding.job_id,owner);}));
  return Promise.all(group.map(async(r,i)=>{const row=rows[i].results[0] as {id:string;artifact:string|null;review_value:string|null}|undefined;if(!row)throw new ProductionError('任务不存在',404);if(row.artifact===null)throw new ProductionError('当前已审宣发不可用',409);const source=text(decodeArtifact(row.artifact).text,30000);return platformCopyReview(owner,r.binding,r.title,source,row.review_value===null?null:{value:row.review_value});}));
 }));
 return reviews.flat().filter(Boolean);
}
