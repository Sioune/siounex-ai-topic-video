import {db} from './store';
// Read-only recovery export. No SQL, table names or restore actions come from callers.
// The existing owner-private Sites dispatch boundary supplies service authorization.
export const BACKUP_TABLES=['app_state','dispositions','favorites','production_drafts','production_jobs','production_milestones','production_operations','production_reviews','production_stages','source_status','topics','production_promo_packages','production_data_videos','production_data_relations','production_data_samples','production_data_evidence'] as const;
export async function recoveryExport(){
 const placeholders=BACKUP_TABLES.map(()=>'?').join(',');
 const results=await db().batch([
  db().prepare(`SELECT name,type,tbl_name,sql FROM sqlite_master WHERE tbl_name IN (${placeholders}) AND sql IS NOT NULL ORDER BY type DESC,name`).bind(...BACKUP_TABLES),
  ...BACKUP_TABLES.map(name=>db().prepare(`SELECT * FROM "${name}" ORDER BY rowid LIMIT 2001`))
 ]);
 if(results.slice(1).some(r=>r.results.length>2000))throw Error('Recovery export exceeds the bounded limit; no partial backup accepted');
 const tables=Object.fromEntries(BACKUP_TABLES.map((name,i)=>[name,results[i+1].results]));
 return {format:'siounex-d1-recovery-v1',snapshot_at:new Date().toISOString(),schema:results[0].results,tables,read_only:true,restore_policy:'Recover only reviewed missing data; never replace a live database with an older snapshot. Code rollback preserves current data.'};
}
