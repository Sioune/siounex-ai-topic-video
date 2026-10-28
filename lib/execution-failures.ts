import{db}from'./store';import{hash,type ProductionJob}from'./production-contract';
// Preserve the observed failure before an owner recovery clears current error.
// A failure receipt is never an approval or permission to retry automatically.
export async function recordExecutionFailure(j:Pick<ProductionJob,'id'|'status'|'error'|'checkpoint'|'revision'|'mode_epoch'|'attempt'|'executor'|'updated_at'>,owner:string){
 if(j.status!=='failed'||!j.error)return;
 let checkpoint:{phase?:string;submission_id?:string}={};try{checkpoint=JSON.parse(j.checkpoint||'{}')}catch{}
 const payload={schema:'executor-failure-history-v1',revision:j.revision,mode_epoch:j.mode_epoch,attempt:j.attempt,executor:j.executor,failed_at:j.updated_at,reason:j.error,checkpoint:{phase:checkpoint.phase||null,submission_id:checkpoint.submission_id||null},quality_approval:false,new_paid_authorization:false,automatic_retry:false};
 const note=JSON.stringify(payload),id='executor_failure_'+await hash(j.id+':'+note);
 await db().prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES (?,?,?,?,'executor_failure_v1',?,?,?) ON CONFLICT(id) DO NOTHING").bind(id,j.id,j.revision,await hash(note),note,owner,new Date().toISOString()).run();
}
