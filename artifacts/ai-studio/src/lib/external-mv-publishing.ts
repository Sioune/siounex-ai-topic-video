import {db} from './store';
import {hash,ProductionError} from './production-contract';
import {MV_PLATFORMS,validateMvManifest,mvManifestIdentity,mvObject,mvKeys,mvText,mvCanonical,mvObservation,mvClaimMode,mvPublishedAnchor,mvUrl,mvMetrics,mvFail,type MvObject,type MvPackage,type MvWork,type MvPlatform} from './external-mv-contract.mts';

const LEASE_MS=30*60000;
const stamp=()=>new Date().toISOString();
async function prefix(owner:string,kind='package'){return 'external_mv_'+kind+'_v1:'+await hash(owner)+':';}
async function key(owner:string,kind:string,id:string){return await prefix(owner,kind)+id;}
async function get(owner:string,kind:string,id:unknown){const s=mvText(id,100);if(!(kind==='package'?/^emv_[a-f0-9]{64}$/:/^emvw_[a-f0-9]{64}$/).test(s))mvFail('完整成品标识无效',400);const k=await key(owner,kind,s),row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(k).first<{value:string}>();if(!row)mvFail('完整成品不存在或不属于本人',404);return {key:k,raw:row.value,value:JSON.parse(row.value)};}
async function pkg(owner:string,id:unknown){const r=await get(owner,'package',id);if(r.value.owner_id!==owner)mvFail('完整成品所有权不符',403);return {...r,value:r.value as MvPackage};}
async function work(owner:string,id:unknown){const r=await get(owner,'work',id);return {...r,value:r.value as MvWork,packet:(await pkg(owner,r.value.package_id)).value};}
function publicWork(w:MvWork){const {claim_hash,...visible}=w;return {...visible,access_route:w.platform==='wechat_channels'?'native-wechat':'browser',next_action:w.owner_report?'owner reported complete; no further platform actions':w.state==='published'?'record_interaction / due collections':w.submission_intent_at?'claim for reconciliation; never submit again':'claim, check existing platform works, then prepare same local files'};}
async function save(k:string,raw:string,w:MvWork){w.updated_at=stamp();const r=await db().prepare('UPDATE app_state SET value=? WHERE key=? AND value=?').bind(JSON.stringify(w),k,raw).run();if(Number(r.meta.changes)!==1)mvFail('成品发布状态已更新，请读回同一工作包',409);}
function event(w:MvWork,phase:string){w.events=[...w.events,{at:stamp(),phase}].slice(-100);}
async function active(owner:string,b:MvObject){const r=await work(owner,b.work_id);if(!r.value.claim_hash||r.value.claim_hash!==await hash(mvText(b.claim_token,200)))mvFail('领取凭据无效或已到期，请读回同一平台状态',409);return r;}
async function browserAccount(owner:string,p:MvPlatform){if(p==='wechat_channels')return null;const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('publishing_browser_account_v2:'+owner+':'+p).first<{value:string}>();return row?JSON.parse(row.value) as MvObject:null;}
async function observeAccount(owner:string,w:MvWork,e:MvObject){mvText(e.account_id,300);if(w.platform==='wechat_channels'){if(e.account_label!=='怎么用好AI')mvFail('须在手机核对既有“怎么用好AI”账号',409);}else{const account=await browserAccount(owner,w.platform);if(account?.state==='security_blocked')mvFail('此平台仍有安全阻断，不能绕过原控制路径',409);if(account?.account_id&&account.account_id!==e.account_id)mvFail('平台账号与既有本人账号不符',409);}if(w.dedupe?.account_id&&w.dedupe.account_id!==e.account_id)mvFail('同一包不能在准备或提交途中更换账号',409);}
function clearLease(w:MvWork){delete w.claim_hash;delete w.lease_until;delete w.claimed_by;delete w.claim_mode;delete w.collection_id;}
async function readPackage(owner:string,id:unknown){
 const p=(await pkg(owner,id)).value;
 const works=await Promise.all(MV_PLATFORMS.map(async platform=>{
  const w=await work(owner,'emvw_'+await hash(p.id+'\n'+platform));return publicWork(w.value);
 }));
 return {package:p,works,files_location:'owner-local-executor',server_archived_bytes:false,publication_authorized:true,production_job_created:false,news_slot_claimed:false};
}
export async function externalMvDashboard(owner:string){
 // Prefix ends in ':'. Its next ASCII separator bounds this owner's keys
 // without D1's limited LIKE/GLOB patterns or underscore wildcard semantics.
 const lower=await prefix(owner),upper=lower.slice(0,-1)+';';
 const rows=(await db().prepare('SELECT value FROM app_state WHERE key>=? AND key<? ORDER BY key LIMIT 100').bind(lower,upper).all<{value:string}>()).results;
 return Promise.all(rows.map(async row=>{const p=JSON.parse(row.value) as MvPackage;if(p.owner_id!==owner)return null;const r=await readPackage(owner,p.id);return {id:p.id,title:p.manifest.title,duration_seconds:p.manifest.video.duration_seconds!,cover_count:p.manifest.covers.length,registered_at:p.registered_at,files_location:r.files_location,platforms:r.works.map(w=>({id:w.id,platform:w.platform,state:w.state,result:w.result||null,collections:w.collections,reaction:w.reaction,first_comment:w.first_comment,access_route:w.access_route}))};})).then(r=>r.filter((r):r is NonNullable<typeof r>=>r!==null));
}

async function register(owner:string,value:unknown){
 const manifest=validateMvManifest(value),id='emv_'+await hash(owner+'\n'+manifest.video.sha256),manifest_hash=await hash(mvCanonical(mvManifestIdentity(manifest))),k=await key(owner,'package',id),old=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(k).first<{value:string}>();
 if(old){if(JSON.parse(old.value).manifest_hash!==manifest_hash)mvFail('同一视频已有冻结发布包，不能换稿、换封面或重新生成平台任务',409);return {...await readPackage(owner,id),reused:true};}
 const at=stamp(),p:MvPackage={id,owner_id:owner,manifest,manifest_hash,registered_at:at},writes=[db().prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING').bind(k,JSON.stringify(p))];
 for(const platform of MV_PLATFORMS){const wid='emvw_'+await hash(id+'\n'+platform),w:MvWork={id:wid,package_id:id,platform,state:'pending',created_at:at,updated_at:at,reaction:{state:'pending'},first_comment:{state:'pending'},collections:[],events:[{at,phase:'owner-approved-completed-mv-received'}]};writes.push(db().prepare("INSERT INTO app_state(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM app_state WHERE key=? AND json_extract(value,'$.manifest_hash')=?) ON CONFLICT(key) DO NOTHING").bind(await key(owner,'work',wid),JSON.stringify(w),k,manifest_hash));}
 await db().batch(writes);const stored=(await pkg(owner,id)).value;if(stored.manifest_hash!==manifest_hash)mvFail('另一个登记已冻结同一视频，请读回原包',409);return {...await readPackage(owner,id),reused:false};
}

async function claim(owner:string,b:MvObject){
 const r=await work(owner,b.work_id),w=r.value;if(w.owner_report)mvFail('本人已报告完成并停止本平台自动操作，不再领取',409);if(w.claim_hash&&(w.lease_until||0)>Date.now())mvFail('当前平台正在由原执行器处理，不能并发领取',409);
 let mode=mvClaimMode(w);if(b.collection_id){if(w.state!=='published')mvFail('尚未公开，不能领取采集',409);const c=w.collections.find(c=>c.id===b.collection_id);if(!c||c.state==='collected'||Date.parse(c.due_at)>Date.now())mvFail('采集尚未到期或已完成',409);mode='collect';w.collection_id=c.id;}
 if(w.platform!=='wechat_channels'&&(await browserAccount(owner,w.platform))?.state==='security_blocked')mvFail('此浏览器平台仍受安全阻断，不能换路绕过',409);
 const token=crypto.randomUUID()+crypto.randomUUID();w.claim_hash=await hash(token);w.lease_until=Date.now()+LEASE_MS;w.claimed_by=mvText(b.worker,120);w.claim_mode=mode;event(w,'claimed-'+mode);await save(r.key,r.raw,w);return {work:publicWork(w),claim_token:token,mode,readback_only:mode==='reconcile',preparation_authorized:mode==='publish',submission_authorized:false};
}

/** Persist a direct owner completion report without claiming a platform visit,
 * official publication time, new collections, or an automatic second submission. */
async function recordOwnerPublication(owner:string,b:MvObject){
 const r=await work(owner,b.work_id),w=r.value,e=mvObservation(b.evidence);
 mvKeys(e,['owner_confirmed_published','stop_platform_actions','original_link_retained','source_thread_id','source_turn_id','external_post_id','platform_url','observed_at','evidence_reference','evidence_note']);
 if(b.video_sha256!==r.packet.manifest.video.sha256||e.owner_confirmed_published!==true||e.stop_platform_actions!==true||typeof e.original_link_retained!=='boolean')mvFail('须绑定同一完整MV及本人明确已发布、停止本平台操作的原话',403);
 mvText(e.source_thread_id,100);mvText(e.source_turn_id,100);mvText(e.evidence_reference,2000);if(e.external_post_id)mvText(e.external_post_id,300);
 if(e.platform_url){const u=mvUrl(e.platform_url),host=w.platform==='douyin'?'douyin.com':w.platform==='bilibili'?'bilibili.com':w.platform==='kuaishou'?'kuaishou.com':'weixin.qq.com';if(u.hostname!==host&&!u.hostname.endsWith('.'+host))mvFail('本人报告的链接不属于本平台',400);}
 if(w.owner_report)return {work:publicWork(w),replayed:true,no_external_action:true};
 w.owner_report={...e,video_sha256:b.video_sha256,source:'owner-report',independent_platform_verification:false};
 if(w.state!=='published'){w.state='owner_reported_published';w.result={...w.owner_report,status:w.state};}
 clearLease(w);event(w,'owner-reported-complete-stop-platform-actions');await save(r.key,r.raw,w);
 return {work:publicWork(w),replayed:false,no_external_action:true};
}

async function checkpoint(owner:string,b:MvObject){
 const r=await active(owner,b),w=r.value,phase=mvText(b.phase,80),e=mvObservation(b.evidence);mvKeys(e,['account_id','account_label','existing_publication_checked','matching_existing_publication','identity_match_note','video_sha256','video_size_bytes','copy_sha256','cover_sha256s','ai_disclosure_checked','platform_options_checked','cover_preview_checked','full_copy_checked','draft_locator','observed_at','evidence_url','evidence_reference','evidence_note']);
 if(!['dedupe_checked','preparing','draft_saved','ready_to_submit','submitting','blocked','uncertain'].includes(phase))mvFail('成品发布检查点无效',400);
 if(w.claim_mode!=='publish'){if(phase==='uncertain'){w.state='uncertain';event(w,phase);clearLease(w);await save(r.key,r.raw,w);return {work:publicWork(w),submission_may_proceed:false};}mvFail('此领取仅能回查原结果或记录互动/采集，不能再次上传或投稿',409);}
 if(w.submission_intent_at)return {work:publicWork(w),submission_may_proceed:false,readback_only:true};
 if(phase==='blocked'||phase==='uncertain'){w.state=phase;w.result={status:phase,...e};event(w,phase);clearLease(w);await save(r.key,r.raw,w);return {work:publicWork(w),submission_may_proceed:false};}
 await observeAccount(owner,w,e);
 if(phase==='dedupe_checked'){if(e.existing_publication_checked!==true||typeof e.matching_existing_publication!=='boolean')mvFail('首次动作前须实际回查本账号已有作品',409);w.dedupe=e;w.state=phase;}
 else{
  if(!w.dedupe||w.dedupe.matching_existing_publication!==false)mvFail('须先核对本账号没有该MV的既有投稿',409);
  if(phase==='preparing')w.state=phase;
  else if(phase==='draft_saved'||phase==='ready_to_submit'){
   const m=r.packet.manifest,copy=m.copies[w.platform];if(e.video_sha256!==m.video.sha256||e.video_size_bytes!==m.video.size_bytes||e.copy_sha256!==await hash(mvCanonical(copy))||!Array.isArray(e.cover_sha256s)||!e.cover_sha256s.length||e.cover_sha256s.some(s=>!m.covers.some(c=>c.sha256===s))||e.ai_disclosure_checked!==true||e.platform_options_checked!==true||e.cover_preview_checked!==true||e.full_copy_checked!==true)mvFail('须核对同一原视频、冻结文案、实际封面与平台选项',409);
   if(phase==='draft_saved')w.draft_locator=mvText(e.draft_locator,2000);w.preflight=e;w.state=phase;
  }else{
   if(!w.preflight||!['ready_to_submit','draft_saved'].includes(w.state)||e.video_sha256!==r.packet.manifest.video.sha256||e.copy_sha256!==await hash(mvCanonical(r.packet.manifest.copies[w.platform])))mvFail('尚未完成同一成品的实际表单核对',409);
   w.submission_intent_at=stamp();w.state='submitting';
  }
 }
 w.lease_until=Date.now()+LEASE_MS;event(w,phase);await save(r.key,r.raw,w);return {work:publicWork(w),submission_may_proceed:phase==='submitting',new_submission_intent:phase==='submitting'};
}

async function complete(owner:string,b:MvObject){
 const r=await active(owner,b),w=r.value,result=mvObservation(b.result);mvKeys(result,['status','source','account_id','account_label','external_post_id','platform_url','published_at','published_at_precision','observed_start_at','observed_end_at','publication_visible','platform_accepted','identity_match_note','observed_at','evidence_url','evidence_reference','evidence_note']);const status=mvText(result.status,40);if(result.external_post_id)mvText(result.external_post_id,300);
 if(!['published','submitted','blocked','uncertain','failed'].includes(status))mvFail('成品平台结果无效',400);if(['interaction','collect'].includes(w.claim_mode||''))mvFail('此领取不能改写投稿结果',409);
 if(w.platform==='wechat_channels'?result.source!=='native-wechat':result.source!=='browser-ui')mvFail('结果须来自该平台原定的实际控制路径',409);await observeAccount(owner,w,result);
 if(!w.submission_intent_at&&!(status==='published'&&w.dedupe?.matching_existing_publication===true)&&!['blocked','uncertain','failed'].includes(status))mvFail('缺少原提交意图或已发表作品的实际回查',409);
 if(w.state==='published')mvFail('已公开结果不能被覆盖',409);
 if(status==='published'){
  if(result.publication_visible!==true||!mvText(result.identity_match_note,4000)||(!result.external_post_id&&!result.platform_url&&w.platform!=='wechat_channels'))mvFail('须实际看到同一作品成功可见，保留身份与平台回执',409);
  if(result.platform_url){const u=mvUrl(result.platform_url);const hosts=w.platform==='douyin'?['douyin.com']:w.platform==='bilibili'?['bilibili.com']:w.platform==='kuaishou'?['kuaishou.com']:['weixin.qq.com'];if(u.protocol!=='https:'||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))||u.username||u.password)mvFail('平台作品链接不属于该平台',400);}
  const anchor=mvPublishedAnchor(result);if(w.platform!=='wechat_channels'&&anchor.precision==='observed_interval')mvFail('浏览器公开作品须保留平台实际发布时间及其精度',409);
  if(w.collections.length)mvFail('已有采集安排，不能重复创建',409);for(const hours of [24,48] as const)w.collections.push({id:'emvc_'+await hash(w.id+'\n'+hours),target_hours:hours,due_at:new Date(Date.parse(anchor.at)+hours*3600000).toISOString(),anchor_precision:anchor.precision,state:'scheduled',metrics:null});
 }else if(status==='submitted'){if(!w.submission_intent_at||result.platform_accepted!==true)mvFail('须有原提交意图及平台实际受理依据',409);}
 const state=w.submission_intent_at&&['blocked','failed'].includes(status)?'uncertain':status;w.state=state;w.result={...result,status:state};event(w,'result-'+state);clearLease(w);await save(r.key,r.raw,w);return {work:publicWork(w),collection_tasks:w.collections.length};
}

async function interaction(owner:string,b:MvObject){const r=await active(owner,b),w=r.value,e=mvObservation(b.evidence);mvKeys(e,['account_id','account_label','state','author_ui_observed','comment_text','comment_visible','already_present','observed_at','evidence_url','evidence_reference','evidence_note']);if(w.state!=='published'||w.claim_mode!=='interaction'||e.author_ui_observed!==true)mvFail('作者互动须在本作品成功可见后使用原平台界面',409);if(!['reaction','first_comment'].includes(String(b.interaction)))mvFail('互动类型无效',400);if(!['done','not_present','uncertain'].includes(String(e.state)))mvFail('互动结果无效',400);await observeAccount(owner,w,e);const kind=b.interaction as 'reaction'|'first_comment';if(w[kind].state==='done')return {work:publicWork(w),already_recorded:true};if(kind==='first_comment'&&e.state==='done'&&(e.comment_visible!==true||e.comment_text!==r.packet.manifest.copies[w.platform].first_comment))mvFail('首评须准确回读冻结文案及可见结果',409);w[kind]={state:e.state as 'done'|'not_present'|'uncertain',observed_at:String(e.observed_at),evidence_note:String(e.evidence_note),...(kind==='first_comment'?{comment_text:String(e.comment_text||'')}: {})};event(w,'interaction-'+kind);if(w.reaction.state!=='pending'&&w.first_comment.state!=='pending')clearLease(w);await save(r.key,r.raw,w);return {work:publicWork(w)};}
async function collect(owner:string,b:MvObject){const r=await active(owner,b),w=r.value,e=mvObservation(b.evidence);mvKeys(e,['account_id','account_label','external_post_id','single_work_observed','metrics','observed_at','evidence_url','evidence_reference','evidence_note']);const c=w.collections.find(c=>c.id===w.collection_id);if(w.claim_mode!=='collect'||w.state!=='published'||!c||c.state==='collected'||Date.parse(c.due_at)>Date.now()||e.single_work_observed!==true)mvFail('仅采集当前到期的同一作品真实累计指标',409);if(w.result?.external_post_id&&e.external_post_id!==w.result.external_post_id)mvFail('采集作品ID不符',409);await observeAccount(owner,w,e);if(Date.parse(String(e.observed_at))<Date.parse(c.due_at))mvFail('须使用本次到期后的真实采样时间',409);c.metrics=mvMetrics(e.metrics);c.state='collected';c.observed_at=String(e.observed_at);c.evidence_note=String(e.evidence_note);event(w,'collection-'+c.target_hours);clearLease(w);await save(r.key,r.raw,w);return {work:publicWork(w),collection:c};}

export async function externalMvPublishingAction(owner:string,value:unknown):Promise<unknown>{try{
 const b=mvObject(value),action=mvText(b.action,40),allowed:Record<string,string[]>={register:['package'],list:[],read:['package_id'],read_materials:['work_id'],claim:['work_id','worker','collection_id'],record_owner_publication:['work_id','video_sha256','evidence'],checkpoint:['work_id','claim_token','phase','evidence'],complete:['work_id','claim_token','result'],record_interaction:['work_id','claim_token','interaction','evidence'],record_collection:['work_id','claim_token','evidence']};if(!Object.hasOwn(allowed,action))mvFail('完整成品发布操作无效',400);mvKeys(b,['action',...allowed[action]]);
 if(action==='register')return await register(owner,b.package);if(action==='list')return {packages:await externalMvDashboard(owner)};if(action==='read')return await readPackage(owner,b.package_id);if(action==='claim')return await claim(owner,b);if(action==='record_owner_publication')return await recordOwnerPublication(owner,b);if(action==='checkpoint')return await checkpoint(owner,b);if(action==='complete')return await complete(owner,b);if(action==='record_interaction')return await interaction(owner,b);if(action==='record_collection')return await collect(owner,b);
 const r=await work(owner,b.work_id),copy=r.packet.manifest.copies[r.value.platform];return {package_id:r.packet.id,work:publicWork(r.value),video:r.packet.manifest.video,covers:r.packet.manifest.covers,copy,copy_sha256:await hash(mvCanonical(copy)),owner_approval:r.packet.manifest.owner_approval,files_location:'owner-local-executor',server_archived_bytes:false,news_production_required:false};
 }catch(e){if(e instanceof ProductionError)throw e;const status=Number((e as {status?:number})?.status);if([400,403,404,409].includes(status))throw new ProductionError((e as Error).message,status);console.error('external-mv-publishing-unexpected',{name:(e as Error)?.name,message:String((e as Error)?.message||e).slice(0,300),frames:String((e as Error)?.stack||'').split('\n').slice(1,4)});throw e;}}
