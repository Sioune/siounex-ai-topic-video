import {db} from './store';
import {ProductionError,text} from './production-contract';
import {readPublishingDashboard,reconcileWarehouseCoverBranding,configurePublishingPlan,syncPublishingReserve,runPublishingTick,runCollectionTick,runOneTimeSlotMakeup,authorizeOneTimeMakeupContinuation,runOneTimeMakeupReconciliation,readOneTimeSlotMakeupPreparation,runSlotContinuationReconciliation,authorizeSlotContinuation,authorizeScheduledBrowserTagAmendment,authorizeBrowserTagAmendment,recordPublishingExclusion,currentPublishingBinding,currentPublishingPromotionText,currentPlatformCopyReview,prepareNextPublishingSlot,readPublishingPreparation,runPreparedPublishingTick,armPreparedPublishingSlot,runPublishingReconciliation,authorizePreparedSlotContinuation,authorizeEmptySlotMakeup,authorizeEmptySlotBrowserRecovery,registerPublishingCoverAdaptation,readPublishingReadiness} from './publishing';
import {decidePlatformCopy} from './publishing-copy-review';
import {browserPublishingAdapter,readBrowserAccounts,readBrowserPublishingWork,readBrowserPublishingMaterials,claimBrowserPublishingWork,claimBrowserPublishingReconciliation,checkpointBrowserPublishingWork,completeBrowserPublishingWork,recordBrowserAccountObservation,claimPublishingPreparation,readPublishingPreparationMaterials,checkpointPublishingPreparation} from './publishing-browser';
import {readExistingPlatformDashboard,recordExistingPlatformObservation,runExistingCollectionTick} from './publishing-existing';
import {readNativePublishingReceipts} from './publishing-native-receipts';
import {readPublishingEngagement,claimPublishingEngagement,recordPublishingEngagement,observeNativePublishingEngagement,observeBrowserPublishingEngagement} from './publishing-engagement';
import {externalMvDashboard,externalMvPublishingAction} from './external-mv-publishing';
import {PUBLISHING_BACKGROUND_ACTIONS,publishingExecutionWindow} from './publishing-execution-priority.mts';

export async function publishingDashboard(owner:string,onCore?:(dashboard:unknown)=>void,onOperational?:(dashboard:unknown)=>void){
 const external=externalMvDashboard(owner).then(packages=>({external_mv_packages:packages,external_mv_error:null})).catch(e=>{console.error('external-mv-dashboard-unexpected',{name:(e as Error)?.name,message:String((e as Error)?.message||e).slice(0,300)});return {external_mv_packages:[],external_mv_error:'已审成品进度读取暂未完成；原新闻发布信息保留。'};});
 const [news,mv]=await Promise.all([newsPublishingDashboard(owner,onCore,onOperational),external]);
 return {...news,...mv};
}
const scheduleKey=(owner:string)=>'publishing_scheduler_v2:'+owner;
async function newsPublishingDashboard(owner:string,onCore?:(dashboard:unknown)=>void,onOperational?:(dashboard:unknown)=>void){const base=Promise.all([readPublishingDashboard(owner,browserPublishingAdapter),readBrowserAccounts(owner),db().prepare('SELECT value FROM app_state WHERE key=?').bind(scheduleKey(owner)).first<{value:string}>()]).then(([dashboard,accounts,stored])=>{const scheduler=stored?JSON.parse(stored.value):{enabled:false,last_run_at:null,heartbeat_at:null,last_result:null,reason:'自动执行尚未接通；保存计划不代表后台已在持续巡检。'};const core={...dashboard,accounts:accounts.map(account=>({...account,account_name:account.account_label})),scheduler};onCore?.(core);return core;});const operation=Promise.all([base,readPublishingPreparation(owner,{}),readPublishingEngagement(owner),readPublishingReadiness(owner)]).then(async([dashboard,preparation,engagement,readiness])=>{const native=await readNativePublishingReceipts(owner,dashboard);const value={...dashboard,...native,...engagement,preparation,readiness};onOperational?.(value);return value;});const copyReviews=base.then(dashboard=>Promise.all(dashboard.reserve_queue.filter(r=>['ready','reserved'].includes(r.status)).map(r=>currentPlatformCopyReview(owner,r.binding,r.title)))).then(value=>({value} as const),error=>({error} as const));const [dashboard,existing]=await Promise.all([operation,readExistingPlatformDashboard(owner)]);const copies=await copyReviews;if('error' in copies)throw copies.error;return {...dashboard,...existing,copy_reviews:copies.value.filter(Boolean),existing_candidates:existing.candidates};}
async function recordRun(owner:string,source:'manual'|'automation',result:string){const prior=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(scheduleKey(owner)).first<{value:string}>(),old=prior?JSON.parse(prior.value):{},now=new Date().toISOString(),value=JSON.stringify({...old,last_run_at:now,last_result:result,...(source==='automation'?{heartbeat_at:now}:{}),reason:'浏览器执行依赖本机在线、Chrome连接和有效登录；平台安全阻碍、登录失效与未知结果会保留待办。'});await db().prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(scheduleKey(owner),value).run();}
export async function publishingAction(owner:string,b:Record<string,unknown>,source:'manual'|'automation'='manual'){
 const action=text(b.action,80);
 // Retained solely for already cached clients. No new grant, approval or expiry is created.
 if(['authorize_one_time_makeup_continuation','authorize_slot_continuation','authorize_prepared_slot_continuation','authorize_empty_slot_makeup','authorize_empty_slot_browser_recovery','run_one_time_slot_makeup','authorize_scheduled_browser_tag_amendment','authorize_browser_tag_amendment'].includes(action))return {authorization_required:false,no_external_action:true,no_submission:true,next_action:'不再需要额外授权。继续准备请沿原work_id领取并保存草稿；需要正式排期时沿原preparation_id调用arm_prepared_slot。平台话题数量和封面比例按实际界面适配，直接记录，不另行审批。'};

 if(action==='external_mv'){if(Object.keys(b).some(k=>!['action','request'].includes(k)))throw new ProductionError('完整成品发布含不支持的参数',400);return externalMvPublishingAction(owner,b.request);}
 const allowed:Record<string,string[]>={configure_plan:['enabled','request_id','authorization_reference','platforms'],sync_reserve:['request_id'],run_tick:['request_id'],read_browser_work:[],read_browser_materials:['work_id'],record_existing_publication:['job_id','reason','evidence_reference','platforms','observed_at'],read_existing_publications:[],observe_existing_publication:['job_id','data_video_id','platform','account_id','external_post_id','platform_url','platform_published_at','published_at_precision','observed_at','evidence_reference','evidence_note','observation_kind','independently_observed','identity_match_note'],claim_browser_work:['work_id','worker'],claim_browser_reconciliation:['work_id','worker'],checkpoint_browser_work:['work_id','claim_token','phase','account_id','local_sha256'],complete_browser_work:['work_id','claim_token','result'],observe_account:['platform','account_id','account_label','state','can_publish','can_collect','evidence_url','evidence_note']};
 allowed.run_collection_tick=[];allowed.authorize_one_time_makeup_continuation=['request_id','slot_id','release_id','job_id','binding_hash','copy_hash','authorization_reference'];allowed.read_one_time_slot_makeup_preparation=['scheduled_at'];
 allowed.review_platform_copy=['job_id','copy_hash','decision','reason','originality'];allowed.checkpoint_browser_work.push('preflight','prepared_check');
 allowed.run_one_time_slot_makeup=['request_id','scheduled_at','release_id','binding_hash','copy_hash','authorization_reference'];
 allowed.run_one_time_makeup_reconciliation=['slot_id','release_id','job_id','binding_hash','copy_hash'];
 allowed.run_slot_continuation_reconciliation=['slot_id','release_id','job_id','binding_hash','copy_hash'];
 allowed.authorize_slot_continuation=['request_id','slot_id','release_id','job_id','binding_hash','copy_hash','authorization_reference'];
 allowed.authorize_scheduled_browser_tag_amendment=['request_id','work_id','claim_token','base_materials_hash','old_tags','new_tags','authorization_reference'];
 allowed.authorize_browser_tag_amendment=['request_id','work_id','claim_token','grant_request_id','grant_expires_at','base_materials_hash','old_tags','new_tags','authorization_reference'];
 allowed.read_readiness=[];allowed.register_cover_adaptation=['preparation_id','package_id','platform','adaptation'];
 allowed.apply_cover_branding=[];allowed.prepare_next_slot=[];allowed.read_preparation=['preparation_id'];allowed.claim_preparation=['work_id','worker'];allowed.read_preparation_materials=['work_id'];
 allowed.checkpoint_preparation=['work_id','claim_token','phase','account_id','account_label','evidence_url','evidence_note','draft_locator','video_sha256','materials_hash','preflight'];
 allowed.authorize_prepared_slot_continuation=['request_id','preparation_id','package_id','platforms','authorization_reference'];allowed.authorize_empty_slot_makeup=['request_id','scheduled_at','authorization_reference','target_at','job_id','release_id'];
 allowed.authorize_empty_slot_browser_recovery=['request_id','preparation_id','package_id','authorization_reference'];
 allowed.arm_prepared_slot=['preparation_id'];allowed.run_prepared_tick=['preparation_id'];allowed.reconcile_publications=[];
 allowed.read_engagement=[];allowed.claim_engagement=['publication_id','engagement_action','worker','readback_only','package_id'];allowed.record_engagement=['publication_id','engagement_action','claim_token','state','comment_text','comment_visible','author_ui_observed','already_present','no_action_observed','evidence_url','evidence_note','observed_at'];
 allowed.observe_browser_engagement=['work_id','package_id','account_id','external_post_id','platform_url','browser_publication_visible','observed_at','evidence_url','evidence_note'];
 allowed.observe_native_engagement=['package_id','video_sha256','native_publication_visible','account_label','observed_at','evidence_url','evidence_note'];
 if(!Object.hasOwn(allowed,action)||Object.keys(b).some(key=>key!=='action'&&!allowed[action].includes(key)))throw new ProductionError('发布操作含不支持的参数',400);
 const priority=source==='automation'?publishingExecutionWindow(new Date().toISOString()):null;
 if(priority&&PUBLISHING_BACKGROUND_ACTIONS.has(action))return {deferred:true,no_external_action:true,...priority,reason:'当前优先完成已准备作品的到点提交，后台工作在提交后继续'};
 if(priority&&action==='run_tick')return priority.phase==='submit_now'?runPreparedPublishingTick(owner,browserPublishingAdapter):{deferred:true,no_submission:true,no_external_action:true,...priority,next_action:'先将当场原草稿提前就位并取得定时许可，不在临窗执行全量同步或采集'};
 if(action==='apply_cover_branding')return reconcileWarehouseCoverBranding(owner);
 if(action==='review_platform_copy'){if(source!=='manual')throw new ProductionError('平台新稿须本人在网页审阅，自动执行器不能代为批准',403);const binding=await currentPublishingBinding(owner,text(b.job_id,100));await decidePlatformCopy(owner,binding,b,await currentPublishingPromotionText(owner,binding));return publishingDashboard(owner);}
 if(action==='configure_plan'){await configurePublishingPlan(owner,{enabled:b.enabled,platforms:b.platforms,request_id:b.request_id,authorization_reference:b.authorization_reference||'本人在发布中心设置每天北京时间08:00、18:00四平台发布，已审核储备先进先发，发布后自动采集。'},browserPublishingAdapter);return publishingDashboard(owner);}
 if(action==='sync_reserve'){await syncPublishingReserve(owner,browserPublishingAdapter);return publishingDashboard(owner);}
 if(action==='read_readiness')return readPublishingReadiness(owner);
 if(action==='register_cover_adaptation')return registerPublishingCoverAdaptation(owner,b);
 if(action==='authorize_empty_slot_makeup'){if(source!=='automation')throw new ProductionError('空档单次授权只接受已获本人明确指令的私有发布服务登记',403);return authorizeEmptySlotMakeup(owner,b,browserPublishingAdapter);}
 if(action==='authorize_empty_slot_browser_recovery'){if(source!=='automation')throw new ProductionError('恢复接续只接受本人明确指令的私有连接登记',403);return authorizeEmptySlotBrowserRecovery(owner,b);}
 if(action==='prepare_next_slot')return prepareNextPublishingSlot(owner,browserPublishingAdapter);
 if(action==='read_preparation')return readPublishingPreparation(owner,b);
 if(action==='claim_preparation')return claimPublishingPreparation(owner,b);
 if(action==='read_preparation_materials')return readPublishingPreparationMaterials(owner,b);
 if(action==='checkpoint_preparation')return checkpointPublishingPreparation(owner,b);
 if(action==='authorize_prepared_slot_continuation')return authorizePreparedSlotContinuation(owner,b);
 if(action==='arm_prepared_slot')return armPreparedPublishingSlot(owner,b,browserPublishingAdapter);
 if(action==='run_prepared_tick'){const result=await runPreparedPublishingTick(owner,browserPublishingAdapter,b);await recordRun(owner,source,result.no_submission?('reason' in result?String(result.reason):'当前未创建发表任务；准备与既有回执保留。'):'当期冻结包已按真实时段领取并派发；实际发表以逐平台回执为准。');return result;}
 if(action==='reconcile_publications'){const result=await runPublishingReconciliation(owner,browserPublishingAdapter);await recordRun(owner,source,'已核对现有发布回执及两次采集安排；未创建新投稿。');return {...result,dashboard:await publishingDashboard(owner)};}
 if(action==='read_engagement')return readPublishingEngagement(owner);
 if(action==='claim_engagement')return claimPublishingEngagement(owner,b);
 if(action==='record_engagement')return recordPublishingEngagement(owner,b);
 if(action==='observe_browser_engagement')return observeBrowserPublishingEngagement(owner,b);
 if(action==='observe_native_engagement')return observeNativePublishingEngagement(owner,b);
 if(action==='run_tick'){try{await runPublishingTick(owner,browserPublishingAdapter);await runExistingCollectionTick(owner,browserPublishingAdapter);await recordRun(owner,source,'到期排期、平台回执与新旧作品采集待办已检查；真实结果以逐平台记录为准。');}catch(e){await recordRun(owner,source,e instanceof ProductionError?e.message:'本次检查失败，保留原有待办，未盲目重发。');throw e;}return publishingDashboard(owner);}
 if(action==='run_collection_tick'){await runCollectionTick(owner,browserPublishingAdapter);await runExistingCollectionTick(owner,browserPublishingAdapter);await recordRun(owner,source,'独立到期采集及真实指标回执已检查；未运行储备同步、发布排期或投稿。');return publishingDashboard(owner);}
 if(action==='read_one_time_slot_makeup_preparation')return readOneTimeSlotMakeupPreparation(owner,b,browserPublishingAdapter);
 if(action==='authorize_one_time_makeup_continuation')return authorizeOneTimeMakeupContinuation(owner,b,browserPublishingAdapter);
 if(action==='run_one_time_slot_makeup')return runOneTimeSlotMakeup(owner,b,browserPublishingAdapter);
 if(action==='run_one_time_makeup_reconciliation')return runOneTimeMakeupReconciliation(owner,b,browserPublishingAdapter);
 if(action==='run_slot_continuation_reconciliation')return runSlotContinuationReconciliation(owner,b,browserPublishingAdapter);
 if(action==='authorize_slot_continuation')return authorizeSlotContinuation(owner,b);
 if(action==='authorize_scheduled_browser_tag_amendment')return authorizeScheduledBrowserTagAmendment(owner,b);
 if(action==='authorize_browser_tag_amendment')return authorizeBrowserTagAmendment(owner,b);
 if(action==='read_browser_work')return readBrowserPublishingWork(owner);
 if(action==='read_browser_materials')return readBrowserPublishingMaterials(owner,b);
 if(action==='record_existing_publication')return recordPublishingExclusion(owner,b);
 if(action==='read_existing_publications')return readExistingPlatformDashboard(owner);
 if(action==='observe_existing_publication')return recordExistingPlatformObservation(owner,b,browserPublishingAdapter);
 if(action==='claim_browser_work')return claimBrowserPublishingWork(owner,b);
 if(action==='claim_browser_reconciliation')return claimBrowserPublishingReconciliation(owner,b);
 if(action==='checkpoint_browser_work')return checkpointBrowserPublishingWork(owner,b);
 if(action==='complete_browser_work')return completeBrowserPublishingWork(owner,b);
 if(action==='observe_account')return recordBrowserAccountObservation(owner,b);
 throw new ProductionError('发布中心操作无效',400);
}

/** Only used behind this Site's confirmed owner-private Sites service boundary. */
export async function publishingServiceOwner(){const rows=(await db().prepare('SELECT DISTINCT owner_id FROM production_jobs WHERE is_test=0 AND owner_id IS NOT NULL LIMIT 2').all<{owner_id:string}>()).results;if(rows.length!==1)throw new ProductionError('需唯一真实站主身份；服务不能从请求参数指定所有者',403);return rows[0].owner_id;}
