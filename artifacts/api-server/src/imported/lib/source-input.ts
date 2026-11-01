import {db} from './store';
import {getJob} from './production';
import {hash,text,ProductionError} from './production-contract';

import {SOURCE_INPUT_REQUIRED,sourceDiagnostic,latestSourceBlock} from './source-input-contract.mts';
export {SOURCE_INPUT_REQUIRED};
const protectedJob='job_e13e8b19-aa0a-4840-abc9-333eefc91b05';
type Job=Awaited<ReturnType<typeof getJob>>;
function binding(j:Job){return {revision:j.revision,mode_epoch:j.mode_epoch,contract_hash:j.contract_hash,source_snapshot_hash:null as string|null};}
async function expected(j:Job,b:Record<string,unknown>){
 const value={...binding(j),source_snapshot_hash:await hash(j.source_snapshot)};
 if(j.id===protectedJob||Object.entries(value).some(([k,v])=>b[k]!==v))throw new ProductionError('来源输入绑定已变化，请重新读取任务',409);
 return value;
}
const key=(j:Job)=>'source_input_v1:'+j.id+':'+j.contract_hash;
async function ownerJob(id:string,owner:string){const row=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string|null}>();if(row?.owner_id!==owner)throw new ProductionError('仅任务本人可补充或重试来源',403);return getJob(id,owner);}
export async function readProvidedSource(j:Job){
 const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key(j)).first<{value:string}>();if(!row)return null;
 const value=JSON.parse(row.value),current={...binding(j),source_snapshot_hash:await hash(j.source_snapshot)};
 if(value.binding.contract_hash!==current.contract_hash||value.binding.source_snapshot_hash!==current.source_snapshot_hash||value.url!==JSON.parse(j.source_snapshot).url||value.sha256!==await hash(value.content))throw new ProductionError('已保存原文的版本或字节校验失败，不会重新生成',409);
 return value as {binding:typeof current;content:string;sha256:string;saved_at:string;url:string;source:'owner-provided-full-text'};
}
export async function saveProvidedSource(id:string,owner:string,b:Record<string,unknown>){
 const j=await ownerJob(id,owner),bound=await expected(j,b),raw=b.content;
 if(JSON.parse(j.source_snapshot).source_id==='research-synthesis')throw new ProductionError('研究综合稿已冻结；请回研究入口编辑另存版本，再保存为新的选题材料',409);
 if(JSON.parse(j.source_snapshot).source_id==='owner-original')throw new ProductionError('本人原创原文与草稿已冻结；请回本人原创入口另存版本，已有任务保留原输入',409);
 if(typeof raw!=='string'||raw.trim().length<100||raw.length>100000||new TextEncoder().encode(raw).length>500000)throw new ProductionError('请提供完整来源正文（至少100字符，最多10万字符）；不会截断冒充全文',400);
 const sha=await hash(raw),prior=await readProvidedSource(j);
 if(prior){if(prior.sha256!==sha)throw new ProductionError('已确认原文不可覆盖；保留已冻结输入',409);return {job:await getJob(id,owner),replayed:true};}
 if(j.revision!==0||j.attempt!==0||j.drafts?.length||!['waiting_executor','paused'].includes(j.status)||j.status==='paused'&&j.error!==SOURCE_INPUT_REQUIRED)throw new ProductionError('仅在首次生成前补充来源；已有稿件和执行输入保持不变',409);
 const at=new Date().toISOString(),value=JSON.stringify({schema:'owner-source-input-v1',binding:bound,content:raw,sha256:sha,url:JSON.parse(j.source_snapshot).url,saved_at:at,source:'owner-provided-full-text',commit_token:crypto.randomUUID()}),rid='source_input_'+await hash(id+key(j)+sha);
 const guard="id=? AND owner_id=? AND revision=0 AND attempt=0 AND mode_epoch=? AND contract_hash=? AND source_snapshot=? AND updated_at=? AND COALESCE(lease_until,0)<=? AND (status='waiting_executor' OR status='paused' AND error=?) AND NOT EXISTS(SELECT 1 FROM production_drafts WHERE job_id=production_jobs.id)";
 const args=[id,owner,j.mode_epoch,j.contract_hash,j.source_snapshot,j.updated_at,Date.now(),SOURCE_INPUT_REQUIRED];
 const results=await db().batch([
  db().prepare(`INSERT INTO app_state(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM production_jobs WHERE ${guard}) ON CONFLICT(key) DO NOTHING`).bind(key(j),value,...args),
  db().prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,?,0,?,'source_input_saved',?,?,? WHERE EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?) ON CONFLICT(id) DO NOTHING").bind(rid,id,sha,JSON.stringify({binding:bound,source:'owner-provided-full-text',quality_approved:false}),owner,at,key(j),value),
  db().prepare("UPDATE production_jobs SET status='waiting_executor',error=NULL,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?)").bind(at,id,key(j),value)
 ]);
 if(!results[0].meta.changes){const saved=await readProvidedSource(await getJob(id,owner));if(saved?.sha256!==sha)throw new ProductionError('保存来源时任务发生变化，请重新读取',409);}
 return {job:await getJob(id,owner),replayed:!results[0].meta.changes};
}
export async function blockSourceInput(id:string,b:Record<string,unknown>){
 const j=await getJob(id),bound=await expected(j,b),rid='source_block_'+await hash(id+JSON.stringify(bound)+text(b.expected_updated_at,50));
 const diagnostic=b.diagnostic===undefined?{stage:'text' as const,code:'source-unavailable',retryable:true}:sourceDiagnostic(b.diagnostic);if(!diagnostic)throw new ProductionError('来源诊断格式无效',400);
 const old=await db().prepare('SELECT id,note FROM production_reviews WHERE id=? AND job_id=?').bind(rid,id).first<{id:string;note:string}>();if(old)return {persisted:true,replayed:true,diagnostic:sourceDiagnostic(JSON.parse(old.note).diagnostic)};
 const at=new Date().toISOString(),note=JSON.stringify({schema:'source-input-block-v2',binding:bound,reason:diagnostic.code,diagnostic,execution_started:false,new_paid_calls:0,commit_token:crypto.randomUUID()});
 const results=await db().batch([
  db().prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,?,'source_input_block',?,'finite-source-preparation',? FROM production_jobs WHERE id=? AND revision=? AND mode_epoch=? AND contract_hash=? AND source_snapshot=? AND updated_at=? AND status='waiting_executor' AND COALESCE(lease_until,0)<=? ON CONFLICT(id) DO NOTHING").bind(rid,bound.source_snapshot_hash,note,at,id,j.revision,j.mode_epoch,j.contract_hash,j.source_snapshot,b.expected_updated_at,Date.now()),
  db().prepare("UPDATE production_jobs SET status='paused',error=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM production_reviews WHERE id=? AND note=?)").bind(SOURCE_INPUT_REQUIRED,at,id,rid,note)
 ]);
 if(!results[0].meta.changes){const saved=await db().prepare('SELECT note FROM production_reviews WHERE id=? AND job_id=?').bind(rid,id).first<{note:string}>();if(!saved)throw new ProductionError('读取来源时任务版本已变化，未暂停新版本',409);return {persisted:true,replayed:true,diagnostic:sourceDiagnostic(JSON.parse(saved.note).diagnostic)};}
 return {persisted:true,replayed:!results[0].meta.changes,diagnostic};
}
export async function retrySourceInput(id:string,owner:string,b:Record<string,unknown>){
 const j=await ownerJob(id,owner),bound=await expected(j,b);
 if(b.expected_updated_at!==undefined&&b.expected_updated_at!==j.updated_at)throw new ProductionError('来源准备状态已变化，请重新读取',409);
 const at=new Date().toISOString(),rid='source_retry_'+crypto.randomUUID();
 const blocked=latestSourceBlock(j.reviews||[],bound),note=JSON.stringify({schema:'source-input-retry-v2',binding:bound,retry_id:rid,blocked_review_id:blocked?.id||null,diagnostic:blocked?.diagnostic||null,scope:'source-preparation-only',execution_started:false,new_paid_calls:0});
 const results=await db().batch([
  db().prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,contract_hash,'source_input_retry',?,?,? FROM production_jobs WHERE id=? AND owner_id=? AND revision=? AND mode_epoch=? AND contract_hash=? AND source_snapshot=? AND updated_at=? AND status='paused' AND error=? AND COALESCE(lease_until,0)<=?").bind(rid,note,owner,at,id,owner,j.revision,j.mode_epoch,j.contract_hash,j.source_snapshot,j.updated_at,SOURCE_INPUT_REQUIRED,Date.now()),
  db().prepare("UPDATE production_jobs SET status='waiting_executor',error=NULL,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM production_reviews WHERE id=?)").bind(at,id,rid)
 ]);
 if(!results[0].meta.changes)throw new ProductionError('只可重试等待补充来源的任务；其他暂停原因不变',409);
 return {job:await getJob(id,owner),retry_id:rid};
}
