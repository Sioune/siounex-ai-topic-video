import {db} from './store';
import {ProductionError} from './production-contract';
export const retentionTombstoneKey=(sid:string)=>'site_archive_retention_v1:'+sid;
// Atomic writer exclusion while a physical cleanup batch holds its short lease.
// SQLite seconds round down, so expiry can conservatively block for <1 second.
export const RETENTION_IDLE_SQL="NOT EXISTS(SELECT 1 FROM app_state cleanup WHERE cleanup.key>='site_retention_plan_v1:'||j.id||':' AND cleanup.key<'site_retention_plan_v1:'||j.id||';' AND CASE WHEN json_valid(cleanup.value) THEN COALESCE(json_extract(cleanup.value,'$.lease_until'),0)>CAST(strftime('%s','now') AS INTEGER)*1000 ELSE 1 END)";
export async function assertArchiveNotPruned(id:string,sid:string,owner:string){
 const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(retentionTombstoneKey(sid)).first<{value:string}>();if(!row)return;
 const v=JSON.parse(row.value);if(v.job_id!==id||v.owner_id!==owner)throw new ProductionError('私有归档所有者不匹配',403);
 throw new ProductionError(v.status==='deleted'?'历史文件已按当前定稿保留政策清理；哈希与审核记录保留':'历史文件正在按保留政策清理；请使用当前定稿',v.status==='deleted'?410:409);
}
