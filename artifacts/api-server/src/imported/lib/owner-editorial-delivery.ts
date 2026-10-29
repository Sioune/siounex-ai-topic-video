import {db} from './store';
import {getJob} from './production';
import {hash,text,ProductionError} from './production-contract';
import {EDITORIAL_DELIVERY_DECISION,EDITORIAL_DELIVERY_REVOKED,GLM_EDITORIAL_BINDING,editorialCanonical,editorialBindingProblems,editorialAuthorizationProblems,currentEditorialDelivery,type EditorialAuthorization,type EditorialJob} from './owner-editorial-delivery-contract.mts';

// This function is only called after the route authenticates a real owner.
// Neither a caller-supplied owner label nor the authorization quote supplies identity.
async function ownerContext(id:string,owner:string){
 const actual=await db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string|null;is_test:number}>();
 if(!owner||!actual?.owner_id||actual.owner_id!==owner||actual.is_test)throw new ProductionError('只有任务真实所有者可确认官方演示解读交付',403);
 if(id!==GLM_EDITORIAL_BINDING.job_id)throw new ProductionError('本次官方演示解读授权仅限当前 GLM-Legal 任务',403);
 const j=await getJob(id,owner),state=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('media_scope_v1:'+id).first<{value:string}>();
 let scope:Record<string,unknown>|null=null;try{scope=JSON.parse(state?.value||'null')?.scope||null}catch{}
 if(!scope||editorialCanonical(scope)!==editorialCanonical(j.media_continuation?.scope))throw new ProductionError('当前私有制作范围缺失或变化',409);
 const confirmation=await db().prepare("SELECT note FROM production_reviews WHERE id=? AND job_id=? AND revision=? AND content_hash=? AND decision='media_scope' AND reviewer=?").bind(scope.id,id,j.revision,j.approved_hash,owner).first<{note:string}>();
 if(!confirmation||editorialCanonical(JSON.parse(confirmation.note))!==editorialCanonical(scope))throw new ProductionError('私有制作范围缺少真实所有者原始记录',409);
 return {j,scope,scope_raw:state!.value,scope_note:confirmation.note,owner};
}
async function withOwnerReviews(j:Awaited<ReturnType<typeof getJob>>,owner:string){
 const rows=await db().prepare("SELECT id,job_id,revision,content_hash,decision,note,reviewer,created_at FROM production_reviews WHERE job_id=? AND decision IN (?,?) AND reviewer=? ORDER BY created_at DESC,id DESC").bind(j.id,EDITORIAL_DELIVERY_DECISION,EDITORIAL_DELIVERY_REVOKED,owner).all<Record<string,unknown>>();
 return {...j,owner_id:owner,reviews:rows.results} as EditorialJob;
}
export async function readCurrentEditorialDelivery(j:Awaited<ReturnType<typeof getJob>>,videoSha:string){
 if(j.id!==GLM_EDITORIAL_BINDING.job_id)return null;
 const owner=await db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(j.id).first<{owner_id:string|null;is_test:number}>();
 if(!owner?.owner_id||owner.is_test)return null;
 const bound=await withOwnerReviews(j,owner.owner_id),v=currentEditorialDelivery(bound,videoSha);
 if(!v||v.binding.source_snapshot_sha256!==await hash(j.source_snapshot)||v.binding.scope_hash!==await hash(editorialCanonical(j.media_continuation?.scope)))return null;
 // The persisted scope review is independently rechecked, including revocation.
 try{const c=await ownerContext(j.id,owner.owner_id);if(c.j.approved_hash!==j.approved_hash||c.j.mode_epoch!==j.mode_epoch||c.j.contract_hash!==j.contract_hash||c.j.source_snapshot!==j.source_snapshot||editorialCanonical(c.scope)!==editorialCanonical(j.media_continuation?.scope))return null}catch{return null}
 return v;
}
// Classification survives expiry or revocation of its authority. Otherwise a
// revoked official-commentary permission could silently become an unclassified
// article explainer. Its original exact scope is checked here; the scope's
// continued validity is independently checked by readCurrentEditorialDelivery.
export async function hasOwnerEditorialDeliveryClassification(j:Awaited<ReturnType<typeof getJob>>){
 const rows=await db().prepare("SELECT r.id,r.note,r.reviewer FROM production_reviews r JOIN production_jobs actual ON actual.id=r.job_id WHERE r.job_id=? AND r.revision=? AND r.content_hash=? AND r.decision=? AND r.reviewer=actual.owner_id AND actual.is_test=0 AND actual.revision=? AND actual.approved_hash=? AND actual.mode_epoch=? AND actual.contract_hash=?").bind(j.id,j.revision,j.approved_hash,EDITORIAL_DELIVERY_DECISION,j.revision,j.approved_hash,j.mode_epoch,j.contract_hash).all<{id:string;note:string;reviewer:string}>();
 for(const row of rows.results){try{
  const v=JSON.parse(row.note) as EditorialAuthorization,b=v.binding,s=v.scope_snapshot,sb=s?.binding as Record<string,unknown>|undefined;
  if(v.schema==='owner-editorial-delivery-v1'&&v.id===row.id&&/^editorial_delivery_[a-f0-9]{64}$/.test(v.id)&&v.owner_id===row.reviewer&&v.delivery_type==='official-demo-commentary'&&b.job_id===j.id&&b.revision===j.revision&&b.script_hash===j.approved_hash&&b.mode_epoch===j.mode_epoch&&b.contract_hash===j.contract_hash&&typeof b.scope_id==='string'&&b.scope_id&&s?.schema==='owner-media-scope-v1'&&s.id===b.scope_id&&s.scope==='private-video'&&sb?.revision===j.revision&&sb.script_hash===j.approved_hash&&sb.mode_epoch===j.mode_epoch&&sb.contract_hash===j.contract_hash)return true;
 }catch{}}
 return false;
}
export async function saveOwnerEditorialDelivery(id:string,owner:string,b:Record<string,unknown>){
 const c=await ownerContext(id,owner),{j}=c;
 if(b.confirmed!==true||b.delivery_type!=='official-demo-commentary')throw new ProductionError('需本人明确确认官方演示解读的交付类型',400);
 const issues=editorialBindingProblems({...j,owner_id:owner},b.binding);if(issues.length)throw new ProductionError(issues.join('；'),409);
 const binding=b.binding as EditorialAuthorization['binding'];
 if(binding.source_snapshot_sha256!==await hash(j.source_snapshot)||binding.scope_id!==c.scope.id||binding.scope_hash!==await hash(editorialCanonical(c.scope)))throw new ProductionError('来源或本人私有制作范围的准确哈希不匹配',409);
 const rid='editorial_delivery_'+await hash(editorialCanonical([id,owner,text(b.request_id,120)]));
 const previous=await db().prepare('SELECT note,reviewer FROM production_reviews WHERE id=? AND job_id=? AND decision=?').bind(rid,id,EDITORIAL_DELIVERY_DECISION).first<{note:string;reviewer:string}>();
 const authorization=b.authorization as Record<string,unknown>|undefined,source_notes=b.source_notes as EditorialAuthorization['source_notes'];
 const request={binding,source_notes,authorization:{source:authorization?.source,reference:authorization?.reference,quote:authorization?.quote,authorized_at:authorization?.authorized_at,expires_at:authorization?.expires_at??null,website_button_clicked:authorization?.website_button_clicked}};
 if(previous){
  const old=JSON.parse(previous.note) as EditorialAuthorization,oldRequest={binding:old.binding,source_notes:old.source_notes,authorization:{...old.authorization,recorded_at:undefined}};
  delete (oldRequest.authorization as Partial<EditorialAuthorization['authorization']>).recorded_at;
  if(previous.reviewer!==owner||editorialCanonical(oldRequest)!==editorialCanonical(request))throw new ProductionError('重复交付类型请求不得改绑视频、来源或本人原话',409);
  if(!currentEditorialDelivery(await withOwnerReviews(j,owner),binding.video_sha256))throw new ProductionError('此交付类型确认已失效、过期或撤回',409);
  return{job:await getJob(id,owner),authorization:old,replayed:true,quality_approved:false,publication_authorized:false};
 }
 const withdrawn=await db().prepare(`SELECT revoked.id FROM production_reviews revoked JOIN production_reviews prior ON prior.id=json_extract(revoked.note,'$.authorization_id') AND prior.job_id=revoked.job_id AND prior.reviewer=revoked.reviewer WHERE revoked.job_id=? AND revoked.reviewer=? AND revoked.decision=? AND prior.decision=? AND json_extract(prior.note,'$.authorization.reference')=? LIMIT 1`).bind(id,owner,EDITORIAL_DELIVERY_REVOKED,EDITORIAL_DELIVERY_DECISION,GLM_EDITORIAL_BINDING.authorization_reference).first();
 if(withdrawn)throw new ProductionError('本次聊天授权已被本人撤回，旧原话或新请求ID不能恢复授权',409);
 const at=new Date().toISOString(),record={schema:'owner-editorial-delivery-v1',id:rid,owner_id:owner,delivery_type:'official-demo-commentary',binding,source_snapshot:j.source_snapshot,scope_snapshot:c.scope,authorization:{...request.authorization,recorded_at:at},source_notes,quality_approved:false,publication_authorized:false,new_paid_authorization:false};
 const problems=editorialAuthorizationProblems({...j,owner_id:owner},record,binding.video_sha256);if(problems.length)throw new ProductionError(problems.join('；'),400);
 const draft=j.drafts?.find(d=>d.revision===j.revision&&d.content_hash===j.approved_hash),content=draft?JSON.parse(String(draft.content)):null,original=source_notes.original_article,source=JSON.parse(j.source_snapshot);
 if(original.url!==source.url||!content?.evidence?.some((e:{url:string;sha256:string})=>e.url===original.url&&e.sha256===original.sha256))throw new ProductionError('真实素材说明须引用当前批准稿已核对的原文快照',409);
 const note=editorialCanonical(record),result=await db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,approved_hash,?,?,?,? FROM production_jobs WHERE id=? AND owner_id=? AND is_test=0 AND status='approved' AND revision=? AND approved_revision=revision AND approved_hash=? AND mode_epoch=? AND review_mode='node' AND contract_hash=? AND source_snapshot=? AND updated_at=? AND EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM production_reviews r WHERE r.id=? AND r.job_id=production_jobs.id AND r.revision=production_jobs.revision AND r.content_hash=production_jobs.approved_hash AND r.decision='media_scope' AND r.reviewer=production_jobs.owner_id AND r.note=?) ON CONFLICT(id) DO NOTHING`).bind(rid,EDITORIAL_DELIVERY_DECISION,note,owner,at,id,owner,j.revision,j.approved_hash,j.mode_epoch,j.contract_hash,j.source_snapshot,j.updated_at,'media_scope_v1:'+id,c.scope_raw,c.scope.id,c.scope_note).run();
 if(!result.meta.changes){const same=await db().prepare('SELECT note FROM production_reviews WHERE id=? AND reviewer=?').bind(rid,owner).first<{note:string}>();if(same?.note!==note)throw new ProductionError('记录交付类型时稿件或私有范围已变化，请读回',409);}
 return{job:await getJob(id,owner),authorization:record,replayed:!result.meta.changes,quality_approved:false,publication_authorized:false};
}
export async function revokeOwnerEditorialDelivery(id:string,owner:string,b:Record<string,unknown>){
 const c=await ownerContext(id,owner),authorization_id=text(b.authorization_id,100),reason=text(b.note,2000),rid='editorial_revoke_'+await hash(editorialCanonical([id,owner,text(b.request_id,120)]));
 const previous=await db().prepare('SELECT note,reviewer FROM production_reviews WHERE id=? AND job_id=? AND decision=?').bind(rid,id,EDITORIAL_DELIVERY_REVOKED).first<{note:string;reviewer:string}>();
 if(previous){const n=JSON.parse(previous.note);if(previous.reviewer!==owner||n.authorization_id!==authorization_id||n.reason!==reason)throw new ProductionError('重复撤回请求不可改绑另一授权',409);return{job:await getJob(id,owner),authorization_id,revoked:true,replayed:true};}
 const current=await withOwnerReviews(c.j,owner),v=currentEditorialDelivery(current,GLM_EDITORIAL_BINDING.video_sha256);
 if(!v||v.id!==authorization_id)throw new ProductionError('仅能撤回当前准确的官方演示解读授权',409);
 const note=editorialCanonical({schema:'owner-editorial-delivery-revocation-v1',authorization_id,job_id:id,owner_id:owner,reason,revoked_at:new Date().toISOString(),quality_approved:false,publication_authorized:false});
 const result=await db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,approved_hash,?,?,?,? FROM production_jobs WHERE id=? AND owner_id=? AND revision=? AND approved_hash=? AND mode_epoch=? AND contract_hash=? AND EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?) ON CONFLICT(id) DO NOTHING`).bind(rid,EDITORIAL_DELIVERY_REVOKED,note,owner,new Date().toISOString(),id,owner,c.j.revision,c.j.approved_hash,c.j.mode_epoch,c.j.contract_hash,'media_scope_v1:'+id,c.scope_raw).run();
 if(!result.meta.changes)throw new ProductionError('撤回决定已记录或当前绑定变化，请读回',409);
 return{job:await getJob(id,owner),authorization_id,revoked:true,replayed:false};
}
