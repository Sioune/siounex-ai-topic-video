import {activeScriptLock,exactScript,lockSegments} from './script-lock.mts';
import {queueScriptFeedback} from './script-feedback-queue';
import {db} from './store';import {getJob} from './production';import {hash,text,ProductionError} from './production-contract';
export type ScriptReworkOrigin={kind:'milestone'|'legacy'|'reopen';milestone_id?:string;artifact_hash?:string;node?:string};
export async function requestScriptRework(id:string,owner:string,b:{revision:number;content_hash:string;mode_epoch:number;note:string},origin:ScriptReworkOrigin){
 const j=await getJob(id,owner),lock=activeScriptLock(j as never);
 const result=await saveScriptFeedback(id,owner,{...b,...(lock?{locked_script:lock.text}:{}),origin});
 if(!result.queued)throw new ProductionError('意见已保存；'+('blocker'in result?result.blocker:'当前状态或预算不允许返工'),409);
 return result.job;
}
export async function saveScriptFeedback(id:string,owner:string,b:{revision:number;content_hash:string;mode_epoch:number;note:string;locked_script?:string;origin?:ScriptReworkOrigin}){
 const ownership=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string}>();if(ownership?.owner_id!==owner)throw new ProductionError('只有任务本人可以录入全文或返工意见',403);
 const j=await getJob(id,owner),d=j.drafts?.find(d=>d.revision===j.revision),note=text(b.note,4000);
 if(!d||j.revision!==b.revision||d.content_hash!==b.content_hash||j.mode_epoch!==b.mode_epoch)throw new ProductionError('稿件版本已变化，请重新读取后提交意见');
 if(b.locked_script===undefined&&d&&(JSON.parse(String(d.content)).execution?.script_lock||await db().prepare("SELECT id FROM production_reviews WHERE job_id=? AND revision=? AND decision='script_lock' AND json_extract(note,'$.mode_epoch')=?").bind(id,j.revision,j.mode_epoch).first()))throw new ProductionError('当前稿件已锁定全文；如要修改，请录入新的完整原稿并重新锁定');
 let locked:string|null=null;if(b.locked_script!==undefined){try{locked=exactScript(b.locked_script);lockSegments(locked)}catch(e){throw new ProductionError((e as Error).message,400)}}const script_lock=locked===null?null:{schema:'owner-script-lock-v1',text:locked,sha256:await hash(locked),source_revision:b.revision,source_hash:b.content_hash,mode_epoch:b.mode_epoch,contract_hash:j.contract_hash,quality_approval:false,media_authorization:false,publication_authorization:false};
 const payload=JSON.stringify({...(script_lock?{script_lock}:{}),...(b.origin?{origin:b.origin}:{}),schema:'siounex-script-feedback-v1',note,revision:b.revision,script_hash:b.content_hash,mode_epoch:b.mode_epoch,approval:false,rework_started:false,source_dependency_preserved:true});
 const rid='script_feedback_'+await hash(id+':'+owner+':'+payload),prior=await db().prepare('SELECT job_id,note FROM production_reviews WHERE id=?').bind(rid).first<{job_id:string;note:string}>();
 if(prior){if(prior.job_id!==id||prior.note!==payload)throw new ProductionError('意见记录不能覆盖');return enqueue(true);}
 async function enqueue(replayed:boolean){try{return {...await queueScriptFeedback(id,rid,owner),saved:true,replayed};}catch(e){if(!(e instanceof ProductionError))throw e;return {job:await getJob(id,owner),feedback_id:rid,saved:true,queued:false,replayed,blocker:e.message,wakeup_connected:false};}}
 const r=await db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,?,'script_feedback',?,?,? FROM production_jobs WHERE id=? AND owner_id=? AND revision=? AND mode_epoch=? AND EXISTS(SELECT 1 FROM production_drafts WHERE job_id=? AND revision=? AND content_hash=?) ON CONFLICT(id) DO NOTHING`).bind(rid,b.content_hash,payload,owner,new Date().toISOString(),id,owner,b.revision,b.mode_epoch,id,b.revision,b.content_hash).run();
 if(!r.meta.changes&&!await db().prepare('SELECT id FROM production_reviews WHERE id=?').bind(rid).first())throw new ProductionError('提交时稿件或模式变化，意见未保存');
 return enqueue(!r.meta.changes);
}
