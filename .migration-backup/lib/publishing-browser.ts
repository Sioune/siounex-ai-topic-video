import {db} from './store';
import {preparedSubmissionWindow,type PreparedSubmissionPermit} from './publishing-submit-permit.mts';
import {collectionAuthorization,sameCollectionAuthorization,collectionAuthorizationSql,collectionAuthorizationArgs,type CollectionAuthorization} from './collection-authorization';
import {hash,ProductionError,text} from './production-contract';
import {assertPublishingDispatchCurrent,readPublishingDispatchMaterials,assertPublishingPreparationCurrent,publishingPreparationMaterialPacket,publishingDispatchPreparation} from './publishing';
import {readSiteArchiveFile,getSiteArchiveMetadata} from './site-file-archive';
import {PUBLISHING_PLATFORMS,type PublishingPlatform,type PublishingAdapter,type PublishingDispatch,type PublishingResult,type PublishingCollectionInput,type PublishingPreparationWork} from './publishing-contract.mts';
import {METRICS,metrics as validateMetrics} from './data-contract.mts';
import {parsePublishedAt} from './publishing-time.mts';
import {validateCurrentPublishingForm} from './publishing-form';
import {validatePublishingPreflight,type PublishingPreflightProof,type PublishingPreflightExpected,type PublishingPreflightObservation} from './publishing-preflight.mts';

export const CREATOR_PORTALS:Record<PublishingPlatform,string>={douyin:'https://creator.douyin.com/',wechat_channels:'https://channels.weixin.qq.com/platform',bilibili:'https://member.bilibili.com/',kuaishou:'https://cp.kuaishou.com/'};
type BrowserAccount={platform:PublishingPlatform;account_id:string|null;account_label:string|null;state:'ready'|'login_required'|'security_blocked'|'unverified';can_publish:boolean;can_collect:boolean;observed_at:string;evidence_url:string;evidence_note:string};
type BrowserWork={schema:'publishing-browser-work-v2';id:string;owner_id:string;platform:PublishingPlatform;kind:'publish'|'collect';input:PublishingDispatch|PublishingCollectionInput;input_hash:string;state:'queued'|'claimed'|'submitting'|'submitted'|'confirmed'|'blocked'|'uncertain';phase:string;claim_hash?:string;claim_kind?:'execute'|'reconcile';collection_authorization?:CollectionAuthorization;lease_until?:number;worker?:string;result?:Record<string,unknown>;preflight?:PublishingPreflightProof;preparation?:Record<string,unknown>;prepared_checkpoint?:Record<string,unknown>;submission_permit?:PreparedSubmissionPermit;reason?:string;created_at:string;updated_at:string};
const accountKey=(owner:string,platform:string)=>'publishing_browser_account_v2:'+owner+':'+platform;
const workKey=(id:string)=>'publishing_browser_work_v2:'+id;
const stamp=()=>new Date().toISOString();
const fail=(message:string,status=409)=>new ProductionError(message,status);
const platform=(value:unknown):PublishingPlatform=>{if(typeof value!=='string'||!PUBLISHING_PLATFORMS.includes(value as PublishingPlatform))throw fail('发布平台无效',400);return value as PublishingPlatform;};
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const owned=(work:BrowserWork,owner:string)=>{if(work.owner_id!==owner)throw fail('浏览器任务不属于当前账号',403);return work;};
const publicWork=(work:BrowserWork)=>{const {claim_hash,owner_id,...safe}=work;const input={...safe.input} as Record<string,unknown>;delete input.owner_id;return {...safe,input,archive_url:work.kind==='publish'?'/api/site-archive?id='+encodeURIComponent((work.input as PublishingDispatch).job_id)+'&archive='+encodeURIComponent((work.input as PublishingDispatch).binding.site_archive_id)+'&download=1':null};};
async function workRecord(owner:string,id:string){const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(workKey(text(id,100))).first<{value:string}>();if(!row)throw fail('浏览器任务不存在',404);return{raw:row.value,work:owned(JSON.parse(row.value),owner)};}
async function mutate(raw:string,work:BrowserWork,changes:Partial<BrowserWork>,grant?:CollectionAuthorization,account?:{key:string;raw:string}){const next={...work,...changes,updated_at:stamp()},value=JSON.stringify(next),result=await db().prepare('UPDATE app_state SET value=? WHERE key=? AND value=?'+(grant?' AND '+collectionAuthorizationSql:'')+(account?' AND EXISTS(SELECT 1 FROM app_state cca WHERE cca.key=? AND cca.value=?)':'')).bind(value,workKey(work.id),raw,...(grant?collectionAuthorizationArgs(work.owner_id,grant):[]),...(account?[account.key,account.raw]:[])).run();if(!result.meta.changes)throw fail(grant?'浏览器采集任务、账号或计划授权已变化，保留已有观察并先核对回执，禁止重新采集冒充原观察':'浏览器任务已由另一执行器更新，请读回现有回执');return next;}
async function currentCollectionGrant(owner:string,work?:BrowserWork){const current=await collectionAuthorization(owner,stamp());if(!current||work&&!sameCollectionAuthorization(work.collection_authorization||null,current))throw fail('采集计划已暂停或领取授权已变化，保留已有观察待核对，不能继续或重新采集冒充原观察');return current;}
async function currentCollectionAccount(owner:string,work:BrowserWork){const key=accountKey(owner,work.platform),row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key).first<{value:string}>();let account:BrowserAccount|null=null;try{account=row?JSON.parse(row.value):null}catch{}const observed=Date.parse(account?.observed_at||'');if(!row||!account||account.platform!==work.platform||account.state!=='ready'||account.can_collect!==true||account.account_id!==work.input.account_id||!Number.isFinite(observed)||observed>Date.now()+60000)throw fail('采集账号已变化、登录失效或访问被阻断，保留已有观察待核对');return{key,raw:row.value};}

export async function readBrowserAccounts(owner:string){return Promise.all(PUBLISHING_PLATFORMS.map(async p=>{const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(accountKey(owner,p)).first<{value:string}>(),account=row?JSON.parse(row.value) as BrowserAccount:null;const fresh=!!account;return {platform:p,mode:'browser' as const,account_id:account?.account_id||null,account_label:account?.account_label||null,connected:!!(fresh&&account?.state==='ready'),can_publish:!!(fresh&&account?.state==='ready'&&account.can_publish),can_collect:!!(fresh&&account?.state==='ready'&&account.can_collect),login_required:account?.state==='login_required',state:account?.state||'unverified',observed_at:account?.observed_at||null,official_url:CREATOR_PORTALS[p],reason:!account?'尚未检查创作者后台登录与功能':account.state==='ready'?null:account.evidence_note};}));}

export async function recordBrowserAccountObservation(owner:string,b:Record<string,unknown>){
 const p=platform(b.platform),state=b.state as BrowserAccount['state'];if(!['ready','login_required','security_blocked','unverified'].includes(state))throw fail('账号观察状态无效',400);
 const evidenceUrl=text(b.evidence_url,2000),url=new URL(evidenceUrl),allowed=new URL(CREATOR_PORTALS[p]).hostname;
 if(url.protocol!=='https:'||url.hostname!==allowed||url.username||url.password)throw fail('账号证据须来自对应平台官方创作者后台',400);
 const old=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(accountKey(owner,p)).first<{value:string}>();
 if(old&&JSON.parse(old.value).state==='security_blocked'&&state!=='security_blocked')throw fail('此平台浏览器访问被安全策略拦截，不能通过修改登录观察绕过',403);
 const account:BrowserAccount={platform:p,account_id:state==='ready'?text(b.account_id,200):null,account_label:state==='ready'?text(b.account_label,200):null,state,can_publish:state==='ready'&&b.can_publish===true,can_collect:state==='ready'&&b.can_collect===true,observed_at:stamp(),evidence_url:evidenceUrl,evidence_note:text(b.evidence_note,3000)};
 const write=await db().prepare("INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE json_extract(app_state.value,'$.state')<>'security_blocked' OR json_extract(excluded.value,'$.state')='security_blocked'").bind(accountKey(owner,p),JSON.stringify(account)).run();if(!write.meta.changes)throw fail('此平台已被安全策略阻止，不能用并发账号观察绕过',403);return{accounts:await readBrowserAccounts(owner)};
}

async function ensureWork(owner:string,p:PublishingPlatform,kind:BrowserWork['kind'],input:BrowserWork['input'],business:string){const id='pbw_'+await hash(owner+'\n'+kind+'\n'+business),key=workKey(id),digest=await hash(canonical(input)),now=stamp(),prepared=kind==='publish'?await publishingDispatchPreparation(owner,input as PublishingDispatch):null,work:BrowserWork={schema:'publishing-browser-work-v2',id,owner_id:owner,platform:p,kind,input,input_hash:digest,state:'queued',phase:'waiting_browser',created_at:now,updated_at:now,...(prepared?.work?{preparation:{package_id:prepared.package.id,preparation_id:prepared.preparation.id,work_id:prepared.work.id,draft_locator:prepared.work.draft_locator,prepared_at:prepared.work.prepared_at,evidence_note:prepared.work.evidence_note}}:{})};await db().prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING').bind(key,JSON.stringify(work)).run();const current=(await workRecord(owner,id)).work;if(current.input_hash!==digest)throw fail('同一浏览器业务键已经绑定不同版本或账号');return current;}

const collectionBusiness=(input:PublishingCollectionInput)=>input.post_id+':'+(input.collection_key||input.target_hours);
async function readCollectionResult(input:PublishingCollectionInput){
 const id='pbw_'+await hash(input.owner_id+'\ncollect\n'+collectionBusiness(input)),row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(workKey(id)).first<{value:string}>();if(!row)return null;
 const work=owned(JSON.parse(row.value) as BrowserWork,input.owner_id);if(work.kind!=='collect'||work.platform!==input.platform||work.input_hash!==await hash(canonical(input)))throw fail('已存采集回执与当前平台、作品、账号或采样锚点不匹配');
 return work.state==='confirmed'&&work.result?.status==='collected'?work.result as never:null;
}

export async function readBrowserPublishingWork(owner:string){const rows=await db().prepare("SELECT value FROM app_state WHERE key LIKE 'publishing_browser_work_v2:%' AND json_extract(value,'$.owner_id')=? AND json_extract(value,'$.state')<>'confirmed' ORDER BY CASE WHEN json_extract(value,'$.kind')='publish' THEN 0 ELSE 1 END,json_extract(value,'$.created_at') LIMIT 200").bind(owner).all<{value:string}>();return {work:rows.results.map(row=>JSON.parse(row.value) as BrowserWork).map(publicWork),accounts:await readBrowserAccounts(owner)};}

export async function readBrowserPublishingMaterials(owner:string,b:Record<string,unknown>){const {work}=await workRecord(owner,text(b.work_id,100));if(work.kind!=='publish')throw fail('采集待办没有投稿素材');return readPublishingDispatchMaterials(owner,work.input as PublishingDispatch);}

export async function readBrowserPublishingMedia(owner:string,b:Record<string,unknown>){const preparationRow=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('publishing_preparation_work_v1:'+text(b.work_id,100)).first<{value:string}>();if(preparationRow){const w=JSON.parse(preparationRow.value) as PublishingPreparationWork,{package:p}=await assertPublishingPreparationCurrent(owner,w),role=text(b.role,40),file=role==='video'?{site_archive_id:p.binding.site_archive_id,sha256:p.binding.video_sha256,size_bytes:p.binding.size_bytes,file_name:p.binding.file_name}:p.binding.materials.find(m=>m.role===role);if(!file)throw fail('只允许读取冻结准备包的正式成片、封面和文案',400);const archive=await getSiteArchiveMetadata(p.job_id,file.site_archive_id,owner);if(archive.status!=='confirmed'||archive.file.role!==role||archive.file.sha256!==file.sha256||archive.materialized_sha256!==file.sha256||archive.file.size_bytes!==file.size_bytes)throw fail('冻结准备包归档身份已变化');const result=await readSiteArchiveFile(p.job_id,file.site_archive_id,owner);return new Response(result.body,{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Type':archive.file.mime_type,'Content-Length':String(file.size_bytes),'X-Asset-SHA256':file.sha256,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.file_name)}});}const {work}=await workRecord(owner,text(b.work_id,100));if(work.kind!=='publish')throw fail('采集待办没有投稿素材');const input=work.input as PublishingDispatch;await assertPublishingDispatchCurrent(owner,input,{stage:'claim'});const role=text(b.role,40),file=role==='video'?{site_archive_id:input.binding.site_archive_id,sha256:input.binding.video_sha256,size_bytes:input.binding.size_bytes,file_name:input.binding.file_name}:input.binding.materials.find(item=>item.role===role);if(!file)throw fail('只允许读取当前正式发布包中的成片、双封面和宣发',400);const archive=await getSiteArchiveMetadata(input.job_id,file.site_archive_id,owner);if(archive.file.sha256!==file.sha256||archive.file.size_bytes!==file.size_bytes||archive.file.role!==role)throw fail('正式发布素材归档绑定已改变');const result=await readSiteArchiveFile(input.job_id,file.site_archive_id,owner);return new Response(result.body,{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Type':archive.file.mime_type,'Content-Length':String(file.size_bytes),'X-Asset-SHA256':file.sha256,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.file_name)}});}

export async function claimBrowserPublishingWork(owner:string,b:Record<string,unknown>){const {raw,work}=await workRecord(owner,text(b.work_id,100));const accounts=await readBrowserAccounts(owner),account=accounts.find(a=>a.platform===work.platform);if(!account?.connected||account.account_id!==work.input.account_id||(work.kind==='publish'?!account.can_publish:!account.can_collect))throw fail('对应账号未登录或当前账号与待办不符，先请本人处理登录');
 if(work.state==='confirmed'||work.state==='uncertain'||work.state==='submitting'||work.state==='submitted'||work.state==='blocked'&&work.phase!=='login_required')throw fail('此待办已结束、待核验或受阻；禁止重新领取后重复外发');
 if(work.state==='claimed'&&Number(work.lease_until)>Date.now()&&work.worker!==b.worker)throw fail('另一浏览器执行器正在处理此待办');
 if(work.kind==='publish')await assertPublishingDispatchCurrent(owner,work.input as PublishingDispatch,{stage:'claim'});
 const grant=work.kind==='collect'?await currentCollectionGrant(owner):undefined;
 const collectionAccount=grant?await currentCollectionAccount(owner,work):undefined;
 const token=crypto.randomUUID()+crypto.randomUUID(),next=await mutate(raw,work,{state:'claimed',phase:'preparing',claim_kind:'execute',worker:text(b.worker,120),claim_hash:await hash(token),lease_until:Date.now()+10*60000,...(grant?{collection_authorization:grant}:{})},grant,collectionAccount);return{work:publicWork(next),claim_token:token};}

export async function claimBrowserPublishingReconciliation(owner:string,b:Record<string,unknown>){const {raw,work}=await workRecord(owner,text(b.work_id,100));const account=(await readBrowserAccounts(owner)).find(a=>a.platform===work.platform);if(!account?.connected||!account.can_collect||account.account_id!==work.input.account_id)throw fail('对应账号未登录或平台访问受阻，不能领取回读任务');if(!['submitting','submitted','uncertain'].includes(work.state))throw fail('此待办不属于待核验发布');if(work.phase==='armed'&&Number(work.lease_until)>Date.now())throw fail('原执行器已持有定时单次提交许可，不能抢占待发页面');if(work.claim_kind==='reconcile'&&Number(work.lease_until)>Date.now())throw fail('另一执行器正在回读发布结果');const token=crypto.randomUUID()+crypto.randomUUID(),next=await mutate(raw,work,{claim_kind:'reconcile',claim_hash:await hash(token),lease_until:Date.now()+10*60000,worker:text(b.worker,120)});return{work:publicWork(next),claim_token:token,readback_only:true};}

async function claimed(owner:string,b:Record<string,unknown>,recordOnly=false){const record=await workRecord(owner,text(b.work_id,100));if(!record.work.claim_hash||record.work.claim_hash!==await hash(text(b.claim_token,200)))throw fail('浏览器领取凭据已失效，只能核对现有状态，不能直接重试发布');return record;}

export async function checkpointBrowserPublishingWork(owner:string,b:Record<string,unknown>){const phase=text(b.phase,40),{raw,work}=await claimed(owner,b,['submitted','uncertain'].includes(phase));if(!['preparing','ready_to_submit','armed','submitting','submitted','uncertain','login_required'].includes(phase))throw fail('浏览器执行阶段无效',400);if(!['claimed','submitting','submitted'].includes(work.state))throw fail('当前待办不能继续执行');
 if(work.claim_kind==='reconcile')throw fail('此领取仅允许回读现有发布结果，不能再次操作投稿');
 if(phase==='submitted'&&!['submitting','submitted'].includes(work.state))throw fail('先记录一次提交意图，再保存平台受理结果');
 let preflight:PublishingPreflightProof|undefined,preparedCheckpoint:Record<string,unknown>|undefined,permit:PreparedSubmissionPermit|undefined;
 if(work.kind==='publish'&&['ready_to_submit','armed','submitting'].includes(phase)){const input=work.input as PublishingDispatch,account=(await readBrowserAccounts(owner)).find(a=>a.platform===input.platform);if(!account?.connected||!account.can_publish||account.account_id!==input.account_id||b.local_sha256!==undefined&&b.local_sha256!==input.binding.video_sha256||b.account_id!==undefined&&b.account_id!==input.account_id)throw fail('本地成片或当前登录账号与正式冻结包不符');const current=await assertPublishingDispatchCurrent(owner,input,{stage:phase==='armed'?'claim':'before_external'});const linked=await publishingDispatchPreparation(owner,input),prepared=linked?.work;
  if(linked&&prepared){
   if(prepared.state!=='prepared'||prepared.phase!=='draft_saved'||prepared.account_id!==input.account_id||!prepared.draft_locator)throw fail('先保存同一作品的原草稿');
   // Reuse the existing draft record. No new form readback or two-minute evidence ticket.
   preflight=prepared.preflight as unknown as PublishingPreflightProof|undefined;
   preparedCheckpoint={schema:'prepared-publish-checkpoint-v1',package_id:linked.package.id,preparation_id:linked.preparation.id,preparation_work_id:prepared.id,draft_locator:prepared.draft_locator,prepared_at:prepared.prepared_at,checked_at:stamp(),account_id:input.account_id,stage:phase};
  }else if(b.preflight){preflight=await validateCurrentPublishingForm(owner,input,b.preflight);}
  if(phase==='armed'){
   let window;try{window=preparedSubmissionWindow(current.submission_window,stamp());}catch(e){throw fail((e as Error).message);}
   permit={schema:'prepared-submission-permit-v1',work_id:work.id,preparation_id:linked?.preparation.id||'',package_id:linked?.package.id||'',account_id:input.account_id,video_sha256:input.binding.video_sha256,draft_locator:linked?.work?.draft_locator||'',issued_at:stamp(),...window,once_only:true};
  }else await assertPublishingDispatchCurrent(owner,input,{stage:'before_external'});
 }
 if(['submitting','submitted'].includes(work.state)&&!['submitted','uncertain'].includes(phase))throw fail('已经进入外发，不能回退后再次点击发布');
 const grant=work.kind==='collect'?await currentCollectionGrant(owner,work):undefined;
 const state=phase==='login_required'?'blocked':phase==='uncertain'?'uncertain':['armed','submitting'].includes(phase)?'submitting':phase==='submitted'?'submitted':'claimed';const next=await mutate(raw,work,{state,phase,...(preflight?{preflight}:{}),...(preparedCheckpoint?{prepared_checkpoint:preparedCheckpoint}:{}),...(permit?{submission_permit:permit}:{}),reason:phase==='login_required'?'创作者后台需要本人登录或验证':phase==='uncertain'?'发布结果待核验，禁止盲目重复提交':undefined,lease_until:Date.now()+10*60000},grant);return{work:publicWork(next),...(permit?{submission_permit:permit,next_action:'保留当前发布页；到计划时刻后只点击一次发布；没有截止作废时间，不再调用submitting或重复检查；全部平台提交后回填结果'}:{})};}

const platformHost=(p:PublishingPlatform,url:URL)=>{const suffix=p==='bilibili'?'bilibili.com':p==='douyin'?'douyin.com':p==='kuaishou'?'kuaishou.com':'weixin.qq.com';return url.protocol==='https:'&&(url.hostname===suffix||url.hostname.endsWith('.'+suffix))&&!url.username&&!url.password;};
function collectionDetailId(p:PublishingPlatform,url:URL):{detail:boolean;id:string|null}{
 let parts:string[];try{parts=url.pathname.split('/').filter(Boolean).map(s=>decodeURIComponent(s));}catch{throw fail('指标作品路径编码无效',400);}
 const exact=(prefix:string[])=>({detail:true,id:parts.length===prefix.length+1?parts[prefix.length]:null});
 if(p==='bilibili'){
  if(['www.bilibili.com','bilibili.com'].includes(url.hostname)&&parts[0]==='video')return exact(['video']);
  if(url.hostname==='member.bilibili.com'&&parts.slice(0,4).join('/')==='platform/upload-manager/article/data')return exact(['platform','upload-manager','article','data']);
 }
 if(p==='kuaishou'){
  if(['www.kuaishou.com','kuaishou.com'].includes(url.hostname)&&parts[0]==='short-video')return exact(['short-video']);
  if(url.hostname==='cp.kuaishou.com'&&parts.slice(0,3).join('/')==='statistics/article/detail')return exact(['statistics','article','detail']);
 }
 if(p==='douyin'&&['www.douyin.com','douyin.com'].includes(url.hostname)&&parts[0]==='video')return exact(['video']);
 if(p==='douyin'&&url.hostname==='creator.douyin.com'&&parts.slice(0,3).join('/')==='creator-micro/work-management/work-detail'){const route=exact(['creator-micro','work-management','work-detail']);return {detail:true,id:route.id&&/^\d+$/.test(route.id)?route.id:null};}
 return {detail:false,id:null};
}
export async function completeBrowserPublishingWork(owner:string,b:Record<string,unknown>){const {raw,work}=await claimed(owner,b,true),result=b.result;if(!result||typeof result!=='object'||Array.isArray(result))throw fail('缺少真实浏览器结果',400);const r=result as Record<string,unknown>;let accepted:Record<string,unknown>;
 let grant:CollectionAuthorization|undefined,collectionAccount:{key:string;raw:string}|undefined;
 if(work.kind==='publish'){
  if(!['submitting','submitted'].includes(work.state)&&!(work.state==='uncertain'&&work.claim_kind==='reconcile'))throw fail('必须先持久化最终提交阶段，才能确认平台发布结果');
  if(work.submission_permit&&['published','submitted'].includes(String(r.status))&&Date.now()<Date.parse(work.submission_permit.not_before))throw fail('尚未到许可提交时间，不得提前发表或登记已受理');
  if(!['published','submitted','uncertain','blocked'].includes(String(r.status)))throw fail('发布结果状态无效',400);
  const proof=text(r.evidence_note,5000),source=new URL(text(r.evidence_url,2000));if(!platformHost(work.platform,source))throw fail('发布证据网址不属于对应平台',400);
  accepted={status:r.status,evidence_note:proof,evidence_url:source.href,...(work.preflight?{preflight:work.preflight}:{})};
  if(r.status==='published'||r.status==='submitted'&&r.external_post_id!==undefined&&r.external_post_id!==null&&r.external_post_id!=='')accepted.external_post_id=text(r.external_post_id,200);
  if(r.status==='published'||r.status==='submitted'){if(r.platform_url){const url=new URL(text(r.platform_url,2000));if(!platformHost(work.platform,url))throw fail('作品链接不属于对应平台',400);accepted.platform_url=url.href;}}
  if(r.status==='submitted')accepted.reason='平台已受理，等待审核或公开确认：'+proof;
  if(r.status==='published'){const parsed=parsePublishedAt(r.published_at,r.published_at_precision);if(Date.parse(parsed.published_at)>Date.now()+60000)throw fail('须填写平台真实公开时间及明确时区，不能使用计划时间或未来时间',400);Object.assign(accepted,parsed);}
 }else{
  if(!['claimed','submitted'].includes(work.state))throw fail('采集待办当前不能完成');
  grant=await currentCollectionGrant(owner,work);
  collectionAccount=await currentCollectionAccount(owner,work);
  if(r.status!=='collected')throw fail('采集完成必须有真实观察结果',400);const observed=text(r.observed_at,100);if(!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(observed)||!Number.isFinite(Date.parse(observed))||Date.parse(observed)>Date.now()+60000)throw fail('采集观察时间无效',400);
  const source=new URL(text(r.evidence_url,2000));if(!platformHost(work.platform,source))throw fail('指标来源不属于对应平台',400);
  const observedPost=text(r.external_post_id,300),input=work.input as PublishingCollectionInput,proof=text(r.evidence_note,5000);if(observedPost!==input.external_post_id)throw fail('实际观察的平台作品ID与采集工作包不匹配',400);
  const subject=collectionDetailId(work.platform,source);if(subject.detail&&subject.id!==observedPost)throw fail('单作品详情路径与实际观察作品ID不匹配',400);
  if(!subject.detail&&(r.evidence_context!=='creator-list-row'||!proof.includes(observedPost)))throw fail('通用后台列表须明确记录当前行作品ID及对应证据说明',400);
  const metrics=r.metrics;if(!metrics||typeof metrics!=='object'||Array.isArray(metrics))throw fail('缺少真实指标',400);
  for(const key of Object.keys(metrics))if(!Object.hasOwn(METRICS,key))throw fail('指标名称无效',400);let clean:Record<string,number|null>;try{clean=validateMetrics(metrics);}catch{throw fail('指标无效，累计计数须为非负整数，未知应为null',400);}
  if(!Object.values(clean).some(v=>v!==null))throw fail('没有实际读到的指标，不能标记采集完成',400);
  accepted={status:'collected',observed_at:new Date(observed).toISOString(),metrics:clean,source:{kind:'creator-browser-observation',url:source.href,note:proof,external_post_id:observedPost,evidence_context:subject.detail?'single-post-detail':'creator-list-row',mapping_version:'creator-browser-v2'}};
 }
 const next=await mutate(raw,work,{state:r.status==='uncertain'?'uncertain':r.status==='blocked'?'blocked':r.status==='submitted'?'submitted':'confirmed',phase:'result_recorded',result:accepted,...(r.status==='submitted'?{reason:String(accepted.reason)}:{}),lease_until:Date.now()+10*60000},grant,collectionAccount);return{work:publicWork(next)};}

export const browserPublishingAdapter:PublishingAdapter={
 async status(owner,p){return (await readBrowserAccounts(owner)).find(a=>a.platform===p)!;},
 async preparePublish(input){return browserPublishingAdapter.publish(input);},
 async publish(input){const work=await ensureWork(input.owner_id,input.platform,'publish',input,input.idempotency_key);return{status:'submitted',reason:'浏览器发布待办已保存，尚未投稿',receipt:{transport:'browser',work_id:work.id}};},
 async reconcile(input){const {receipt,external_post_id,...original}=input;if(receipt?.transport!=='browser'||typeof receipt.work_id!=='string')return{status:'uncertain',reason:'缺少精确浏览器工作包，先核验平台结果'};const {work}=await workRecord(input.owner_id,receipt.work_id);if(work.kind!=='publish'||work.input_hash!==await hash(canonical(original)))throw fail('浏览器回执与当前发布版本、平台或账号不匹配');if(work.result){if(work.result.status==='published'&&(work.state!=='confirmed'||external_post_id&&work.result.external_post_id!==external_post_id))throw fail('已确认发布回执的状态或平台作品身份不匹配');return{...work.result,receipt:{...receipt,evidence:work.result}} as unknown as PublishingResult;}return{status:work.state==='uncertain'?'uncertain':work.state==='blocked'?'blocked':'submitted',reason:work.reason||'等待浏览器实际投稿与平台回执',receipt};},
 readCollectionResult,
 async collect(input){const work=await ensureWork(input.owner_id,input.platform,'collect',input,collectionBusiness(input));if(work.state==='confirmed'&&work.result)return work.result as never;return {status:work.state==='blocked'?'blocked':'pending',reason:work.reason||'等待浏览器读取对应作品真实指标'} as never;}
};


const preparationWorkKey=(id:string)=>'publishing_preparation_work_v1:'+id;
async function preparationWorkRecord(owner:string,id:string){const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(preparationWorkKey(text(id,100))).first<{value:string}>(),work=row?JSON.parse(row.value) as PublishingPreparationWork:null;if(!row||!work||work.schema!=='publishing-preparation-work-v1'||work.owner_id!==owner||work.id!==id)throw fail('准备工作不存在或不属于当前所有者',404);return {raw:row.value,work};}
function publicPreparationWork(work:PublishingPreparationWork){const {owner_id,claim_hash,...safe}=work;return safe;}
async function mutatePreparation(raw:string,work:PublishingPreparationWork,changes:Partial<PublishingPreparationWork>){const next={...work,...changes,updated_at:stamp()},value=JSON.stringify(next),r=await db().prepare('UPDATE app_state SET value=? WHERE key=? AND value=?').bind(value,preparationWorkKey(work.id),raw).run();if(!r.meta.changes)throw fail('准备任务已由另一执行器更新，先读回原草稿，不能重复上传');return next;}
export async function claimPublishingPreparation(owner:string,b:Record<string,unknown>){if(Object.keys(b).some(k=>!['action','work_id','worker'].includes(k)))throw fail('准备领取不接受时钟、账号或强制重试字段',400);const {raw,work}=await preparationWorkRecord(owner,text(b.work_id,100));await assertPublishingPreparationCurrent(owner,work);if(work.lease_until&&work.lease_until>Date.now()&&work.claim_hash&&work.worker!==b.worker)throw fail('另一执行器正在准备同一冻结包，不重复上传');let account_id=work.account_id,account_label=work.account_label||null;if(work.transport==='browser'){const a=(await readBrowserAccounts(owner)).find(a=>a.platform===work.platform);if(work.platform==='wechat_channels'||!a?.connected||!a.can_publish||!a.account_id||account_id&&account_id!==a.account_id)throw fail('本平台Chrome账号未就绪、与准备账号不同或网页被安全阻断');account_id=a.account_id;account_label=a.account_label;}const token=crypto.randomUUID()+crypto.randomUUID(),next=await mutatePreparation(raw,work,{state:work.state==='prepared'?'prepared':'claimed',phase:work.state==='prepared'?'draft_saved':'preparing',account_id,account_label,worker:text(b.worker,120),claim_hash:await hash(token),lease_until:Date.now()+15*60000,reason:null});return {work:publicPreparationWork(next),claim_token:token,preparation_only:true,publish_allowed:false,readback_first:!!work.claim_hash||work.state==='uncertain'||work.state==='prepared'};}
export async function readPublishingPreparationMaterials(owner:string,b:Record<string,unknown>){if(Object.keys(b).some(k=>!['action','work_id'].includes(k)))throw fail('准备材料读取只接受work_id',400);const {work}=await preparationWorkRecord(owner,text(b.work_id,100));return publishingPreparationMaterialPacket(owner,work);}
export async function checkpointPublishingPreparation(owner:string,b:Record<string,unknown>){
 const fields=['action','work_id','claim_token','phase','account_id','account_label','evidence_url','evidence_note','draft_locator','video_sha256','materials_hash','preflight'];if(Object.keys(b).some(k=>!fields.includes(k)))throw fail('准备检查点包含不支持字段',400);const {raw,work}=await preparationWorkRecord(owner,text(b.work_id,100));const phase=text(b.phase,40),recordOnly=['draft_saved','blocked','uncertain'].includes(phase);if(!work.claim_hash||work.claim_hash!==await hash(text(b.claim_token,200)))throw fail('准备领取凭据已失效，先读回原草稿后重新领取');if(!['preparing','draft_saved','blocked','uncertain'].includes(phase))throw fail('准备检查点不能发表或声称发布成功',400);const packet=await publishingPreparationMaterialPacket(owner,work,{record_only:recordOnly}),changes:Partial<PublishingPreparationWork>={phase:phase as PublishingPreparationWork['phase'],state:phase==='draft_saved'?'prepared':phase==='blocked'?'blocked':phase==='uncertain'?'uncertain':'claimed',lease_until:Date.now()+15*60000};
 if(phase==='draft_saved'){
  const accountId=text(b.account_id,200),accountLabel=text(b.account_label,200),note=text(b.evidence_note,5000),evidenceUrl=text(b.evidence_url,2000),draft=text(b.draft_locator,4000);if(b.video_sha256!==undefined&&b.video_sha256!==packet.video_sha256||b.materials_hash!==undefined&&b.materials_hash!==packet.materials_hash)throw fail('草稿素材必须来自同一冻结包，系统不会关联另一视频');
  if(work.transport==='browser'){
   const a=(await readBrowserAccounts(owner)).find(a=>a.platform===work.platform);
   if(!a?.connected||!a.can_publish||a.account_id!==accountId||work.account_id!==accountId)throw fail('保存草稿时账号已变化');
  }else if(work.platform!=='wechat_channels'||accountLabel!=='怎么用好AI')throw fail('手机准备使用原指定视频号账号');
  if(b.preflight&&typeof b.preflight==='object')changes.preflight={schema:'publishing-operation-record-v1',observation:b.preflight,recorded_at:stamp()};
  Object.assign(changes,{account_id:accountId,account_label:accountLabel,draft_locator:draft,evidence_url:evidenceUrl,evidence_note:note,prepared_at:stamp(),reason:null});
 }else if(phase==='blocked'||phase==='uncertain'){changes.reason=text(b.evidence_note,5000);changes.evidence_note=changes.reason;if(b.evidence_url)changes.evidence_url=text(b.evidence_url,2000);}const next=await mutatePreparation(raw,work,changes);return {work:publicPreparationWork(next),preparation_only:true,publish_allowed:false};
}
