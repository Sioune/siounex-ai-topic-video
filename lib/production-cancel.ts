import {db} from './store';
import {getJob} from './production';
import {ProductionError,text} from './production-contract';

export const PRODUCTION_CANCELLED_MESSAGE='该任务已取消制作，不再领取或继续制作；已保存的稿件、成果和回执仍保留。';
export async function assertProductionNotCancelled(id:string){
 const job=await db().prepare('SELECT status FROM production_jobs WHERE id=?').bind(id).first<{status:string}>();
 if(job?.status==='cancelled')throw Object.assign(new ProductionError(PRODUCTION_CANCELLED_MESSAGE,409),{code:'PRODUCTION_CANCELLED'});
}

// Cancellation is an owner decision about the whole job, including active work.
// It does not consume another attempt, erase artifacts, or reinterpret an
// already-issued provider call as failed. Pending child records remain history.
export async function cancelProduction(id:string,owner:string,b:{revision:number;mode_epoch:number;reason?:string}){
 const row=await db().prepare('SELECT owner_id,status,revision,mode_epoch FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string|null;status:string;revision:number;mode_epoch:number}>();
 if(!row||row.owner_id!==owner)throw new ProductionError('只能取消本人的制作任务',403);
 if(row.status==='cancelled')return {job:await getJob(id,owner),cancelled:true,replayed:true};
 if(!Number.isSafeInteger(b.revision)||!Number.isSafeInteger(b.mode_epoch)||row.revision!==b.revision||row.mode_epoch!==b.mode_epoch)throw new ProductionError('稿件版本已经变化，请重新读取后取消',409);
 if(b.reason!==undefined&&typeof b.reason!=='string')throw new ProductionError('取消原因格式无效',400);
 const reason=b.reason===undefined||b.reason.trim()===''?'本人取消制作':text(b.reason,1000),now=new Date().toISOString();
 // Freeze-aware CAS is evaluated in the same transaction as the permanent
 // audit record. A concurrent warehouse entry/publication wins over a stale UI.
 const guard=`id=? AND owner_id=? AND revision=? AND mode_epoch=? AND status NOT IN ('cancelled','completed') AND NOT EXISTS(SELECT 1 FROM publishing_reserve WHERE job_id=production_jobs.id) AND NOT EXISTS(SELECT 1 FROM production_data_videos WHERE job_id=production_jobs.id AND published_at IS NOT NULL)`;
 const results=await db().batch([
  db().prepare(`UPDATE production_jobs SET status='cancelled',lease_hash=NULL,lease_until=NULL,error=NULL,updated_at=? WHERE ${guard}`).bind(now,id,owner,row.revision,row.mode_epoch),
  db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,contract_hash,'production_cancelled',?,?,? FROM production_jobs WHERE id=? AND owner_id=? AND status='cancelled' ON CONFLICT(id) DO NOTHING`).bind('production_cancelled:'+id,reason,owner,now,id,owner),
 ]);
 const job=await getJob(id,owner);
 if(job.status!=='cancelled')throw new ProductionError('任务已变化或已进入片仓／发布流程，不能取消制作；请重新读取',409);
 return {job,cancelled:true,replayed:!results[0].meta.changes};
}
