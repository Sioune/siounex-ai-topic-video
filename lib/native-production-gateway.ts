import {continueSavedOwnerFeedback,continueOwnerFeedbackAfterAiReview} from './owner-feedback-continuation';
import {db} from './store';
import {ProductionError} from './production-contract';
import {getResearch} from './research';
import {retryJob} from './production';
import {retryOwnerTextReview,recoverOwnerTerminalTextReview} from './owner-text-review-retry';
import {getLatestWorkInProgress,getWorkInProgressPartDigest} from './work-in-progress-video';
import {POST as executePrivateProduction} from '../app/api/executor/route';
import policy from '../production/native-runtime-policy.json';

// A first-class Sites MCP entry point. Sites authenticates the real caller;
// this adapter additionally binds the existing private production service to
// its persisted owner. No HTTP forwarding, minted credentials or approval API.
export async function nativeProductionRequest(owner:string,args:Record<string,unknown>){
 const anchor=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=? AND is_test=0').bind(policy.owner_anchor_job_id).first<{owner_id:string}>();
 if(!owner||anchor?.owner_id!==owner)throw new ProductionError('仅原制作所有者可使用正常执行入口',403);
 if(Object.keys(args).some(k=>!['request_json','runtime_protocol'].includes(k))||args.runtime_protocol!==undefined&&args.runtime_protocol!==2||typeof args.request_json!=='string'||args.request_json.length>1450000)throw new ProductionError('制作请求无效',400);
 let b:any;try{b=JSON.parse(args.request_json)}catch{throw new ProductionError('制作请求须为JSON',400)}
 if(!b||typeof b!=='object'||Array.isArray(b)||!policy.allowed_actions.includes(b.action)||['owner','owner_id','trusted_owner_service','requestOwner','test_job_id'].some(k=>Object.hasOwn(b,k)))throw new ProductionError('不允许的正常制作动作或身份参数',403);
 let bound=false;
 if(typeof b.id==='string'&&b.id.startsWith('job_')){
  const job=await db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(b.id).first<{owner_id:string;is_test:number}>();
  if(job?.owner_id!==owner||job.is_test)throw new ProductionError('制作任务归属不符',403);bound=true;
 }else if(typeof b.id==='string'&&b.id.startsWith('research_')){await getResearch(b.id,owner);bound=true;}
 if(typeof b.package_id==='string'){
  const job=await db().prepare('SELECT j.owner_id,j.is_test FROM production_promo_packages p JOIN production_jobs j ON j.id=p.job_id WHERE p.id=?').bind(b.package_id).first<{owner_id:string;is_test:number}>();
  if(job?.owner_id!==owner||job.is_test)throw new ProductionError('宣发任务归属不符',403);bound=true;
 }
 if(!bound&&!policy.global_actions.includes(b.action))throw new ProductionError('正常制作动作必须绑定原任务',403);
 // The owner's request to continue failed work can use the same checkpoint-
 // preserving retry as the production page. This grants no content approval.
 if(b.action==='retry')return {status:200,body:{job:await retryJob(b.id,owner)}};
 if(b.action==='owner_feedback_review_continue'){if(Object.keys(b).some(k=>!['action','id','review_id','revision','content_hash','mode_epoch'].includes(k))||typeof b.review_id!=='string'||!Number.isSafeInteger(b.revision)||!Number.isSafeInteger(b.mode_epoch)||typeof b.content_hash!=='string')throw new ProductionError('审核纠错请求无效',400);return {status:200,body:await continueOwnerFeedbackAfterAiReview(b.id,owner,b)};}
 if(b.action==='owner_feedback_continue'){if(Object.keys(b).some(k=>!['action','id','feedback_id','revision','content_hash','mode_epoch'].includes(k))||typeof b.feedback_id!=='string'||!Number.isSafeInteger(b.revision)||!Number.isSafeInteger(b.mode_epoch)||typeof b.content_hash!=='string')throw new ProductionError('意见接续请求无效',400);return {status:200,body:await continueSavedOwnerFeedback(b.id,owner,b)};}
 if(b.action==='owner_text_review_retry')return {status:200,body:await retryOwnerTextReview(b.id,owner,b)};
 if(b.action==='owner_text_review_output_recover')return {status:200,body:await recoverOwnerTerminalTextReview(b.id,owner,b)};
 if(b.action==='wip_video_read'){if(Object.keys(b).some(k=>!['action','id'].includes(k)))throw new ProductionError('预览读取请求无效',400);return {status:200,body:{preview:await getLatestWorkInProgress(b.id,owner)}};}
 if(b.action==='wip_video_read_part'){if(Object.keys(b).some(k=>!['action','id','preview_id','part'].includes(k))||typeof b.preview_id!=='string'||!Number.isSafeInteger(b.part))throw new ProductionError('预览分片读取请求无效',400);return {status:200,body:await getWorkInProgressPartDigest(b.id,b.preview_id,owner,b.part)};}
 // Drain old processes without interrupting their existing claims or exports.
 // The unchanged scheduled task then starts the synchronized normal executor.
 if(args.runtime_protocol!==2&&['dispatch_next','research_next'].includes(b.action))return {status:200,body:{kind:'idle',job:null,research:null,no_work:true,executor_reload_required:true,content_motion_policy:'content-motion@1'}};
 if(b.action==='dispatch_next'&&b.executor_release!==policy.executor_release)return {status:200,body:{kind:'idle',job:null,research:null,no_work:true,executor_reload_required:true,executor_release:policy.executor_release}};
 if(b.action==='dispatch_next'){
  delete b.executor_release;
  // Selection itself is read-only. Do not expose another owner's selection.
  const other=(await db().prepare('SELECT id FROM production_jobs WHERE owner_id IS NULL OR owner_id<>?').bind(owner).all<{id:string}>()).results;
  b.exclude_job_ids=[...new Set([...(Array.isArray(b.exclude_job_ids)?b.exclude_job_ids:[]),...other.map(x=>x.id)])];
 }
 const response=await executePrivateProduction(new Request('https://siounex-ai-topic-library.siounexzhao.chatgpt.site/api/executor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}));
 const body=await response.json() as any;
 if(body?.job?.id){const j=await db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(body.job.id).first<{owner_id:string;is_test:number}>();if(j?.owner_id!==owner||j.is_test)throw new ProductionError('返回制作任务归属不符',403);}
 if(body?.research?.id)await getResearch(body.research.id,owner);
 return {status:response.status,body};
}
