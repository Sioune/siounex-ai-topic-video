import {db} from './store';
import {getJob} from './production';
import {hash,ProductionError} from './production-contract';
import {cliContentBudget} from './cli-content-budget.mts';
import {currentTextReviewRetry,validTextReviewRetryProof} from './text-review-retry-contract.mts';
import {validTerminalTextReviewProof} from './terminal-text-review-contract.mts';

// Native owner bridge only. It grants no review result and never resets counters.
export async function retryOwnerTextReview(id:string,owner:string,b:{milestone_id:string;proof:any}){
 const ownership=await db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string;is_test:number}>();
 if(!owner||ownership?.owner_id!==owner||ownership.is_test)throw new ProductionError('只能恢复本人原文本审核',403);
 const p=b.proof,rid='owner_text_review_retry_'+await hash(JSON.stringify(p??null));
 const prior=await db().prepare("SELECT note FROM production_reviews WHERE id=? AND job_id=? AND reviewer=? AND decision='owner_text_review_retry'").bind(rid,id,owner).first<{note:string}>();
 if(prior){const saved=JSON.parse(prior.note);if(saved.proof?.job_id!==id||saved.proof?.milestone_id!==b.milestone_id)throw new ProductionError('审核恢复记录不匹配');return {job:await getJob(id,owner),milestone_id:b.milestone_id,replayed:true,new_model_calls:0,original_result_unknown:true};}
 const j=await getJob(id,owner) as any,m=j.milestones?.find((x:any)=>x.id===b.milestone_id),now=Date.now();
 if(!currentTextReviewRetry(j,m,now)||!cliContentBudget(j).review_available||!m||!validTextReviewRetryProof(j,m,p)||p.source_snapshot_sha256!==await hash(j.source_snapshot)||p.skill_snapshot_sha256!==await hash(j.skill_snapshot)||p.artifact_json_sha256!==await hash(m.artifact)||p.original_report_sha256!==await hash(m.report??'null'))throw new ProductionError('仅可恢复系统失败且原只读进程已退出、没有本地结果的文本审核',409);
 const stopped=['pause','production_cancelled','resume_stop','resume_manual','resume_manual_text','revise','script_feedback','script_feedback_rework'];
 if(j.reviews?.some((r:any)=>r.reviewer===owner&&stopped.includes(String(r.decision))&&String(r.created_at)>=p.original_started_at))throw new ProductionError('本人已暂停、退回或取消，保留原审核状态',409);
 const t=new Date(now).toISOString(),note=JSON.stringify({schema:'owner-text-review-retry-event-v1',proof:p,prior:{job_status:j.status,job_error:j.error,status:m.status,invocation_id:m.invocation_id,report:m.report,review_until:m.review_until,updated_at:m.updated_at},original_result_unknown:true,new_model_calls:0,quality_approval:false,publication_authorization:false,counters_preserved:true});
 const guard=`j.id=? AND j.owner_id=? AND j.is_test=0 AND j.status=? AND j.review_mode='auto' AND j.error IS ? AND j.lease_until IS NULL AND j.revision=? AND j.mode_epoch=? AND j.contract_hash=? AND j.updated_at=? AND j.attempt=? AND j.ai_calls=? AND j.reworks=? AND m.id=? AND m.job_id=j.id AND m.node IN ('source','script') AND m.status=? AND m.revision=j.revision AND m.mode_epoch=j.mode_epoch AND m.artifact_hash=? AND m.invocation_id=? AND m.report IS ? AND m.updated_at=? AND m.review_until IS ? AND (m.status='paused' OR m.review_until<?) AND NOT EXISTS(SELECT 1 FROM production_milestones newer WHERE newer.job_id=j.id AND newer.node=m.node AND newer.revision=m.revision AND newer.artifact_version>m.artifact_version) AND NOT EXISTS(SELECT 1 FROM production_reviews stop WHERE stop.job_id=j.id AND stop.reviewer=j.owner_id AND stop.decision IN ('pause','production_cancelled','resume_stop','resume_manual','resume_manual_text','revise','script_feedback','script_feedback_rework') AND stop.created_at>=?) AND NOT EXISTS(SELECT 1 FROM production_operations o WHERE o.job_id=j.id AND o.status IN ('running','prepared')) AND NOT EXISTS(SELECT 1 FROM production_data_videos v WHERE v.job_id=j.id AND v.published_at IS NOT NULL)`;
 const args=[id,owner,j.status,j.error,j.revision,j.mode_epoch,j.contract_hash,j.updated_at,j.attempt,j.ai_calls,j.reworks,m.id,m.status,m.artifact_hash,m.invocation_id,m.report,m.updated_at,m.review_until,now,p.original_started_at];
 const result=await db().batch([
  db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,j.id,j.revision,m.artifact_hash,'owner_text_review_retry',?,?,? FROM production_jobs j JOIN production_milestones m ON m.job_id=j.id WHERE ${guard} ON CONFLICT(id) DO NOTHING`).bind(rid,note,owner,t,...args),
  // Keep invocation/report on the node until the next ordinary review_claim;
  // the audit also retains them after that claim creates its independent call.
  db().prepare("UPDATE production_milestones SET status='awaiting_ai',review_token_hash=NULL,review_until=NULL,updated_at=? WHERE id=? AND status=? AND invocation_id=? AND updated_at=? AND EXISTS(SELECT 1 FROM production_reviews WHERE id=? AND note=? AND created_at=?)").bind(t,m.id,m.status,m.invocation_id,m.updated_at,rid,note,t),
  db().prepare("UPDATE production_jobs SET status='awaiting_review',error=NULL,updated_at=? WHERE id=? AND status=? AND updated_at=? AND EXISTS(SELECT 1 FROM production_reviews WHERE id=? AND note=? AND created_at=?) AND EXISTS(SELECT 1 FROM production_milestones WHERE id=? AND status='awaiting_ai' AND updated_at=?)").bind(t,id,j.status,j.updated_at,rid,note,t,m.id,t)
 ]);
 if(result.some(r=>r.meta.changes!==1))throw new ProductionError('审核状态已变化，请读回原结果；不重复调用',409);
 return {job:await getJob(id,owner),milestone_id:m.id,replayed:false,retry_queued:true,new_model_calls:0,original_result_unknown:true};
}

// Reopen only the original completed read-only invocation. The caller must
// submit its actual JSON through normal review_result; this action approves nothing.
export async function recoverOwnerTerminalTextReview(id:string,owner:string,b:{milestone_id:string;proof:any}){
 const ownership=await db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string;is_test:number}>();
 if(!owner||ownership?.owner_id!==owner||ownership.is_test)throw new ProductionError('只能核对本人原文本审核',403);
 const j=await getJob(id,owner) as any,m=j.milestones?.find((x:any)=>x.id===b.milestone_id),p=b.proof,now=Date.now();
 if(!m||!currentTextReviewRetry(j,m,now)||!validTerminalTextReviewProof(j,m,p)||p.source_snapshot_sha256!==await hash(j.source_snapshot)||p.skill_snapshot_sha256!==await hash(j.skill_snapshot)||p.artifact_json_sha256!==await hash(m.artifact)||p.original_report_sha256!==await hash(m.report??'null'))throw new ProductionError('只能恢复当前同一只读调用的真实完整终态JSON',409);
 const stopped=['pause','production_cancelled','resume_stop','resume_manual','resume_manual_text','revise','script_feedback','script_feedback_rework'];
 if(j.reviews?.some((r:any)=>r.reviewer===owner&&stopped.includes(String(r.decision))&&String(r.created_at)>=p.original_started_at))throw new ProductionError('本人已暂停、退回或取消，保留原审核状态',409);
 const note=JSON.stringify(p),rid='terminal_text_review_'+await hash(note),token=crypto.randomUUID(),tokenHash=await hash(token),t=new Date(now).toISOString();
 const guard=`j.id=? AND j.owner_id=? AND j.is_test=0 AND j.status=? AND j.review_mode='auto' AND j.error IS ? AND j.lease_hash IS NULL AND j.lease_until IS NULL AND j.revision=? AND j.mode_epoch=? AND j.contract_hash=? AND j.updated_at=? AND j.attempt=? AND j.ai_calls=? AND j.reworks=? AND j.source_snapshot=? AND j.skill_snapshot=? AND m.id=? AND m.job_id=j.id AND m.node IN ('source','script') AND m.status=? AND m.revision=j.revision AND m.mode_epoch=j.mode_epoch AND m.artifact_hash=? AND m.artifact=? AND m.invocation_id=? AND m.report IS ? AND m.updated_at=? AND m.review_until IS ? AND (m.status='paused' OR m.review_until<?) AND NOT EXISTS(SELECT 1 FROM production_milestones newer WHERE newer.job_id=j.id AND newer.node=m.node AND newer.revision=m.revision AND newer.artifact_version>m.artifact_version) AND NOT EXISTS(SELECT 1 FROM production_reviews stop WHERE stop.job_id=j.id AND stop.reviewer=j.owner_id AND stop.decision IN ('pause','production_cancelled','resume_stop','resume_manual','resume_manual_text','revise','script_feedback','script_feedback_rework') AND stop.created_at>=?) AND NOT EXISTS(SELECT 1 FROM production_operations o WHERE o.job_id=j.id AND o.status IN ('running','prepared')) AND NOT EXISTS(SELECT 1 FROM production_data_videos v WHERE v.job_id=j.id AND v.published_at IS NOT NULL)`;
 const args=[id,owner,j.status,j.error,j.revision,j.mode_epoch,j.contract_hash,j.updated_at,j.attempt,j.ai_calls,j.reworks,j.source_snapshot,j.skill_snapshot,m.id,m.status,m.artifact_hash,m.artifact,m.invocation_id,m.report,m.updated_at,m.review_until,now,p.original_started_at];
 const gate='EXISTS(SELECT 1 FROM production_reviews WHERE id=? AND note=? AND created_at=?)';
 const result=await db().batch([
  db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,j.id,j.revision,m.artifact_hash,'ai_review_terminal_output_reconciliation_v1',?,'verified-owned-terminal-output',? FROM production_jobs j JOIN production_milestones m ON m.job_id=j.id WHERE ${guard} ON CONFLICT(id) DO NOTHING`).bind(rid,note,t,...args),
  db().prepare(`UPDATE production_milestones SET status='ai_running',review_token_hash=?,review_until=?,updated_at=? WHERE id=? AND status=? AND invocation_id=? AND updated_at=? AND ${gate}`).bind(tokenHash,now+240000,t,m.id,m.status,m.invocation_id,m.updated_at,rid,note,t),
  db().prepare(`UPDATE production_jobs SET status='awaiting_review',error=NULL,updated_at=? WHERE id=? AND status=? AND updated_at=? AND ${gate} AND EXISTS(SELECT 1 FROM production_milestones WHERE id=? AND status='ai_running' AND review_token_hash=?)`).bind(t,id,j.status,j.updated_at,rid,note,t,m.id,tokenHash)
 ]);
 if(result.some(r=>r.meta.changes!==1))throw new ProductionError('原审核状态已变化，请读回结果，不重调模型',409);
 return {review_token:token,invocation_id:m.invocation_id,reconciliation_only:true,new_model_calls:0,original_result_unknown:true,completed_terminal_output:true};
}
