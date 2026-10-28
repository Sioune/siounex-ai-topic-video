import {assertMediaScope} from './media-continuation';
import {db} from './store';
import {getJob,reviewJob} from './production';
import {hash,text,ProductionError} from './production-contract';
type Asset={node:string;library_file_id:string;file_name:string;version:number;sha256:string};
type Receipt={revision:number;script_hash:string;approval_reference:string;execution:string;cost:number;publication:boolean;duration:number;limits:string;qa:Record<string,unknown>;assets:Asset[]};
// Service callback stores evidence, never a human approval or user identity.
export async function recordDelivery(id:string,submission:string,value:Receipt){
 const j=await getJob(id);if(!j.is_test)await assertMediaScope(j,'delivery');if(j.review_mode!=='node')throw new ProductionError('既有人工流程成果不能切成自动模式');
 const d=j.drafts?.find(x=>x.revision===value.revision&&x.content_hash===value.script_hash);if(!d||j.revision!==value.revision)throw new ProductionError('回传绑定的稿件版本已变化');
 if(value.cost!==0||value.publication!==false||!Number.isFinite(value.duration)||value.duration<=0)throw new ProductionError('只接收已完成、零新增费用、未发布的真实成果',400);
 text(value.approval_reference,500);text(value.execution,2000);text(value.limits,4000);
 if(!Array.isArray(value.assets)||value.assets.length<3||value.assets.length>10)throw new ProductionError('缺少交付文件',400);
 for(const a of value.assets){if(!['cover','video','promotion','preview','first_frame'].includes(a.node)||!/^libfile_[a-f0-9]+$/.test(a.library_file_id)||!Number.isInteger(a.version)||a.version<0||!/^[a-f0-9]{64}$/.test(a.sha256))throw new ProductionError('文件身份或哈希无效',400);text(a.file_name,300)}
 for(const node of ['cover','video','promotion'])if(value.assets.filter(a=>a.node===node).length!==1)throw new ProductionError('需唯一封面、成片与宣发稿',400);
 const payload=JSON.stringify(value);if(payload.length>20000)throw new ProductionError('回传过大',400);
 const rid='delivery_'+text(submission,120),prior=await db().prepare('SELECT * FROM production_reviews WHERE id=?').bind(rid).first<{job_id:string;note:string}>();
 if(prior){if(prior.job_id!==id||prior.note!==payload)throw new ProductionError('同一回传ID不能覆盖真实成果');return getJob(id)}
 await db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,?,'external_delivery',?,'external-result-reported',? FROM production_jobs WHERE id=? AND revision=? AND review_mode='node' AND EXISTS(SELECT 1 FROM production_drafts WHERE job_id=? AND revision=? AND content_hash=?)`).bind(rid,value.script_hash,payload,new Date().toISOString(),id,value.revision,id,value.revision,value.script_hash).run();
 return getJob(id);
}
// Owner-origin endpoint registers an ALREADY GIVEN conversation approval using the
// actual signed visitor. The service callback above cannot invoke this operation.
export async function syncExistingApproval(id:string,owner:string,receiptId:string){
 let j=await getJob(id,owner);const r=await db().prepare(`SELECT * FROM production_reviews WHERE id=? AND job_id=? AND decision='external_delivery'`).bind(receiptId,id).first<{note:string;revision:number;content_hash:string}>();if(!r)throw new ProductionError('真实交付回执不存在');
 const latest=j.reviews?.find(x=>x.decision==='external_delivery'&&x.revision===j.revision);if(latest&&latest.id!==receiptId)throw new ProductionError('历史回执不能登记为当前媒体，请使用最新版本回执');
 const value=JSON.parse(r.note) as Receipt;if(j.review_mode!=='node'||j.revision!==r.revision)throw new ProductionError('既有批准只适用于原人工流程和原稿版本');
 if(j.approved_revision!==r.revision||j.approved_hash!==r.content_hash)j=await reviewJob(id,owner,r.revision,r.content_hash,'approve','同步既有对话批准记录；'+value.approval_reference+'；成片、封面、宣发仍待人工审核');
 const t=new Date().toISOString(),statements=[];
 for(const node of ['cover','video','promotion']){
  const asset=value.assets.find(a=>a.node===node)!,artifact=JSON.stringify({asset,script_revision:r.revision,script_hash:r.content_hash,execution:value.execution,cost:0,publication:false,duration:value.duration,qa:value.qa,limits:value.limits,approval_reference:value.approval_reference});
  statements.push(db().prepare(`INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) SELECT ?,id,?,?,?,?,?,mode_epoch,?,? FROM production_jobs WHERE id=? AND revision=? AND approved_revision=? AND approved_hash=? AND review_mode='node' ON CONFLICT(job_id,node,revision,artifact_version) DO NOTHING`).bind(receiptId+'_'+node,node,r.revision,await hash(artifact),artifact,node==='cover'?'awaiting_human':'pending',t,t,id,r.revision,r.revision,r.content_hash));
 }
 await db().batch(statements);return getJob(id,owner);
}
