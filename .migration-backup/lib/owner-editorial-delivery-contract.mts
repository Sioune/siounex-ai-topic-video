// A narrowly scoped owner decision classifies this exact official commentary.
// Its authority is independent of a category's default production requirements.
export const EDITORIAL_DELIVERY_DECISION='owner_editorial_delivery_v1';
export const EDITORIAL_DELIVERY_REVOKED='owner_editorial_delivery_revoked_v1';
export const GLM_EDITORIAL_BINDING={
 job_id:'job_b7dcd6bf-682d-429f-9016-7c9f3df41c16',revision:1,
 script_hash:'8580f6bbad4bdca0c07af05915e61ed734b3fd6c8d492e5c9a21ef92937594fa',
 contract_hash:'670a348cda9d5941d4a7ac66ba00f1c0ce6388cb0d80fc6bdd595da7315bba6f',mode_epoch:0,
 video_sha256:'11b78d228391cd08ff723eb61aa9abb0d3291387a7b3aaa507a7178e9d1f97dd',
 authorization_reference:'call_3ddfa9a4acc0436db3739d60475bc63d',
 owner_quote:'按官方演示解读交付，保留真实素材说明'
} as const;
export type EditorialJob={id?:string;owner_id?:string|null;is_test?:number;revision:number;approved_revision?:number|null;approved_hash:string|null;review_mode?:string;mode_epoch?:number;contract_hash?:string;source_snapshot?:string;media_continuation?:{current_id?:string;scope?:unknown};reviews?:Record<string,unknown>[]};
export type EditorialAuthorization={
 schema:'owner-editorial-delivery-v1';id:string;owner_id:string;delivery_type:'official-demo-commentary';
 binding:{job_id:string;revision:number;script_hash:string;mode_epoch:number;contract_hash:string;video_sha256:string;source_snapshot_sha256:string;scope_id:string;scope_hash:string};
 source_snapshot:string;scope_snapshot:Record<string,unknown>;
 authorization:{source:'owner-chat-report';reference:string;quote:string;authorized_at:string;recorded_at:string;expires_at:string|null;website_button_clicked:false};
 source_notes:{original_article:{url:string;sha256:string};description:string;materials_kind:'vendor-published-demonstration-and-screenshots';owner_recorded_tool_session:false;independent_tool_test:false;rights_granted:false};
 quality_approved:false;publication_authorized:false;new_paid_authorization:false;
};
// A source name, job ID or shared media hash is not a delivery classification.
// The server supplies the persisted classification separately; explicit client
// references only require verification, and never supply authority themselves.
export function editorialDeliveryAuthorityRequired(_j:Pick<EditorialJob,'id'>,value:Record<string,unknown>,classifiedForCurrentVersion=false){
 const qa=value.qa as Record<string,unknown>|undefined;
 return classifiedForCurrentVersion||qa?.editorial_delivery_authorization_id!==undefined;
}
const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
export function editorialCanonical(v:unknown):string{if(Array.isArray(v))return '['+v.map(editorialCanonical).join(',')+']';const o=object(v);return o?'{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+editorialCanonical(o[k])).join(',')+'}':JSON.stringify(v);}
function record(v:unknown){try{return object(typeof v==='string'?JSON.parse(v):v)}catch{return null}}
export function editorialBindingProblems(j:EditorialJob,b:unknown){
 const v=object(b),fixed=GLM_EDITORIAL_BINDING,issues:string[]=[];
 if(!v||j.id!==fixed.job_id||j.is_test===1||j.revision!==fixed.revision||j.approved_revision!==j.revision||j.approved_hash!==fixed.script_hash||j.review_mode!=='node'||j.mode_epoch!==fixed.mode_epoch||j.contract_hash!==fixed.contract_hash)issues.push('本次官方演示解读仅适用于本人已批准的 GLM-Legal 当前精确稿件');
 if(!v||v.job_id!==j.id||v.revision!==j.revision||v.script_hash!==j.approved_hash||v.mode_epoch!==j.mode_epoch||v.contract_hash!==j.contract_hash||v.video_sha256!==fixed.video_sha256||!sha(v.source_snapshot_sha256)||!sha(v.scope_hash)||typeof v.scope_id!=='string'||!v.scope_id)issues.push('官方演示解读授权的稿件、合同、模式、视频或素材范围绑定无效');
 return issues;
}
export function editorialAuthorizationProblems(j:EditorialJob,raw:unknown,videoSha:string|undefined,now=Date.now()){
 const v=record(raw),issues=editorialBindingProblems(j,v?.binding),b=object(v?.binding),a=object(v?.authorization),notes=object(v?.source_notes),scope=object(j.media_continuation?.scope),sb=object(scope?.binding),article=object(notes?.original_article);
 if(!v||v.schema!=='owner-editorial-delivery-v1'||v.owner_id!==j.owner_id||!j.owner_id||typeof v.id!=='string'||!/^editorial_delivery_[a-f0-9]{64}$/.test(v.id)||v.delivery_type!=='official-demo-commentary')issues.push('缺少真实任务所有者的独立交付类型授权');
 if(videoSha!==undefined&&(!sha(videoSha)||b?.video_sha256!==videoSha))issues.push('官方演示解读批准不能迁移到另一支或新版视频');
 if(!scope||scope.schema!=='owner-media-scope-v1'||scope.scope!=='private-video'||scope.id!==j.media_continuation?.current_id||b?.scope_id!==scope.id||scope.new_paid_authorization!==false||scope.publication_authorization!==false||scope.quality_approved!==false||sb?.revision!==j.revision||sb?.script_hash!==j.approved_hash||sb?.mode_epoch!==j.mode_epoch||sb?.contract_hash!==j.contract_hash||editorialCanonical(scope)!==editorialCanonical(v?.scope_snapshot))issues.push('本人当前私有制作范围已变更或撤回');
 if(typeof j.source_snapshot!=='string'||v?.source_snapshot!==j.source_snapshot)issues.push('来源快照已变化，旧交付类型授权失效');
 if(!a||a.source!=='owner-chat-report'||a.reference!==GLM_EDITORIAL_BINDING.authorization_reference||a.quote!==GLM_EDITORIAL_BINDING.owner_quote||a.website_button_clicked!==false||!Number.isFinite(Date.parse(String(a.authorized_at)))||!Number.isFinite(Date.parse(String(a.recorded_at)))||!Number.isFinite(Date.parse(String(scope?.confirmed_at)))||Date.parse(String(a.authorized_at))>Date.parse(String(a.recorded_at))||Date.parse(String(a.recorded_at))>now+60000||Date.parse(String(a.authorized_at))<Date.parse(String(scope?.confirmed_at))||a.expires_at!==null&&(!Number.isFinite(Date.parse(String(a.expires_at)))||Date.parse(String(a.expires_at))<=now))issues.push('本人原话、授权来源或有效时间不完整或已过期');
 if(!notes||notes.materials_kind!=='vendor-published-demonstration-and-screenshots'||notes.owner_recorded_tool_session!==false||notes.independent_tool_test!==false||notes.rights_granted!==false||typeof notes.description!=='string'||notes.description.length<20||notes.description.length>3000||!article||!sha(article.sha256)||typeof article.url!=='string'||!article.url.startsWith('https://'))issues.push('须保留官方演示与配图的真实说明，不能声称本人实操、独立测试或新增转载许可');
 if(v?.quality_approved!==false||v.publication_authorized!==false||v.new_paid_authorization!==false)issues.push('交付类型确认不授予质量批准、收费或发布权限');
 return [...new Set(issues)];
}
// Reviews must come from the persisted DB row, including its real reviewer.
// A caller's note saying "owner" is never sufficient.
export function currentEditorialDelivery(j:EditorialJob,videoSha?:string,now=Date.now()):EditorialAuthorization|null{
 const records=(j.reviews||[]).filter(r=>r.decision===EDITORIAL_DELIVERY_DECISION&&r.reviewer===j.owner_id&&r.revision===j.revision&&r.content_hash===j.approved_hash).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id)));
 for(const row of records){
  const value=record(row.note);if(!value||value.id!==row.id||editorialAuthorizationProblems(j,value,videoSha,now).length)continue;
  const revoked=(j.reviews||[]).some(r=>r.decision===EDITORIAL_DELIVERY_REVOKED&&r.reviewer===j.owner_id&&r.revision===j.revision&&r.content_hash===j.approved_hash&&(()=>{const n=record(r.note);return n?.authorization_id===value.id&&n?.job_id===j.id&&n?.owner_id===j.owner_id&&Number.isFinite(Date.parse(String(n?.revoked_at)))&&Date.parse(String(n?.revoked_at))<=now})());
  if(revoked)return null;
  return value as EditorialAuthorization;
 }
 return null;
}
export function editorialDeliveryFacts(j:EditorialJob,videoSha?:string,now=Date.now()){
 const v=currentEditorialDelivery(j,videoSha,now);return v?{authorization_id:v.id,delivery_type:v.delivery_type,label:'官方演示解读',description:v.source_notes.description,owner_recorded_tool_session:false,independent_tool_test:false,original_category_preserved:true,default_tool_demonstration_rule_preserved:true,bound_video_sha256:v.binding.video_sha256,scope_id:v.binding.scope_id,authorization_source:v.authorization.source,authorization_reference:v.authorization.reference,owner_quote:v.authorization.quote,authorized_at:v.authorization.authorized_at,quality_approved:false,publication_authorized:false,rights_granted:false}:null;
}
// Add this to the same mutation as a candidate or formal approval. A revoke
// between the read check and the write must not let a stale exception through.
export function editorialMutationGuard(v:EditorialAuthorization){
 return{sql:"j.source_snapshot=? AND j.contract_hash=? AND EXISTS(SELECT 1 FROM production_reviews editorial WHERE editorial.id=? AND editorial.job_id=j.id AND editorial.revision=j.revision AND editorial.content_hash=j.approved_hash AND editorial.reviewer=j.owner_id AND editorial.decision=? AND editorial.note=? AND (json_extract(editorial.note,'$.authorization.expires_at') IS NULL OR CAST(strftime('%s',json_extract(editorial.note,'$.authorization.expires_at')) AS INTEGER)*1000>CAST(strftime('%s','now') AS INTEGER)*1000)) AND NOT EXISTS(SELECT 1 FROM production_reviews revoked WHERE revoked.job_id=j.id AND revoked.reviewer=j.owner_id AND revoked.decision=? AND json_extract(revoked.note,'$.authorization_id')=?) AND EXISTS(SELECT 1 FROM app_state editorial_scope WHERE editorial_scope.key='media_scope_v1:'||j.id AND json_extract(editorial_scope.value,'$.id')=? AND json_extract(editorial_scope.value,'$.scope.id')=? AND json_extract(editorial_scope.value,'$.scope.scope')='private-video' AND json_extract(editorial_scope.value,'$.scope.binding.revision')=j.revision AND json_extract(editorial_scope.value,'$.scope.binding.script_hash')=j.approved_hash AND json_extract(editorial_scope.value,'$.scope.binding.mode_epoch')=j.mode_epoch AND json_extract(editorial_scope.value,'$.scope.binding.contract_hash')=j.contract_hash)",args:[v.source_snapshot,v.binding.contract_hash,v.id,EDITORIAL_DELIVERY_DECISION,editorialCanonical(v),EDITORIAL_DELIVERY_REVOKED,v.id,v.binding.scope_id,v.binding.scope_id]};
}
