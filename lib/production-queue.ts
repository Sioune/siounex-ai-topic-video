import {cliContentCountSql} from './cli-content-budget.mts';
import {db} from './store';
import {getJob} from './production';
import {hash,ProductionError,type ProductionJob} from './production-contract';
import {executionBinding,PROTECTED_JOB,type ExecutionBinding} from './production-queue-contract';
import {CURRENT_MEDIA_OPERATION_SQL} from './current-media-operation';

export async function requestExecution(id:string,owner:string,expected:ExecutionBinding){
 const j=await getJob(id,owner) as unknown as ProductionJob,binding=executionBinding(j);
 if(!binding)throw new ProductionError('当前需先审核、补材料或恢复决定；不会重跑已发布内容');
 if(!expected||Object.keys(binding).some(k=>expected[k as keyof ExecutionBinding]!==binding[k as keyof ExecutionBinding]))throw new ProductionError('任务版本或下一步已变化，请重新读取');
 const content=JSON.stringify({schema:'siounex-execution-request-v1',binding,quality_approval:false,new_paid_authorization:false,publication_authorization:false,wakeup_connected:false});
 const rid='execution_request_'+await hash(id+':'+owner+':'+JSON.stringify(binding));
 const prior=await db().prepare('SELECT job_id,note FROM production_reviews WHERE id=?').bind(rid).first<{job_id:string;note:string}>();
 if(prior){if(prior.job_id!==id||prior.note!==content)throw new ProductionError('已保存请求不能覆盖');return {job:await getJob(id,owner),queued:true,replayed:true,wakeup_connected:false};}
 const guards:string[]=[];const args:(string|number)[]=[];
 if(binding.kind==='text'){guards.push("status='waiting_executor' AND "+cliContentCountSql('production_jobs','generation')+"<6");}
 if(binding.kind==='review'){guards.push("review_mode='auto' AND status IN ('awaiting_review','approved') AND EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=production_jobs.id AND m.id=? AND m.artifact_hash=? AND m.revision=production_jobs.revision AND m.mode_epoch=production_jobs.mode_epoch AND ((m.status='awaiting_ai' AND "+cliContentCountSql('production_jobs','review')+"<8) OR (m.status='ai_running' AND m.review_until<?)))");args.push(binding.target_id,binding.target_hash,Date.now());}
 if(binding.kind==='media'){guards.push("status='approved' AND approved_revision=revision AND EXISTS(SELECT 1 FROM production_operations o WHERE o.job_id=production_jobs.id AND o.id=? AND o.input_hash=? AND o.revision=production_jobs.revision AND o.mode_epoch=production_jobs.mode_epoch AND o.script_hash=approved_hash AND o.status='queued' AND "+CURRENT_MEDIA_OPERATION_SQL.replaceAll('j.','production_jobs.')+")");args.push(binding.target_id,binding.target_hash);}
 const r=await db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,?,'execution_request',?,?,? FROM production_jobs WHERE id=? AND owner_id=? AND is_test=0 AND id!=? AND revision=? AND mode_epoch=? AND checkpoint_version=? AND contract_hash=? AND reworks<=2 AND NOT EXISTS(SELECT 1 FROM production_data_videos v WHERE v.job_id=production_jobs.id AND v.published_at IS NOT NULL AND (v.owner_id IS NULL OR v.owner_id=production_jobs.owner_id)) AND ${guards.join(' AND ')} ON CONFLICT(id) DO NOTHING`).bind(rid,binding.target_hash,content,owner,new Date().toISOString(),id,owner,PROTECTED_JOB,binding.revision,binding.mode_epoch,binding.checkpoint_version,binding.contract_hash,...args).run();
 if(!r.meta.changes){const duplicate=await db().prepare('SELECT note FROM production_reviews WHERE id=?').bind(rid).first<{note:string}>();if(!duplicate||duplicate.note!==content)throw new ProductionError('请求保存时版本或审核状态已变化，请重新读取');}
 return {job:await getJob(id,owner),queued:true,replayed:!r.meta.changes,wakeup_connected:false};
}
