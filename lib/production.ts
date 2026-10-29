import {ownerFeedbackContinuation,continuationSql,continuationLimitSql} from './owner-feedback-continuation.mts';
import {cliContentBudget,cliContentCountSql} from './cli-content-budget.mts';
import {recordExecutionFailure} from './execution-failures';
import {readCliCapacity,persistCliFailure} from './cli-failure';
import {cliReadySql} from './cli-failure-contract.mts';
import {readCurrentNativePreparationState} from './native-preparation-handoff';
import {activeScriptLock,verifyLockedDraft} from './script-lock.mts';
import {readMediaContinuation,assertNoPreparation,assertMediaScope,PREPARATION_IDLE_SQL} from './media-continuation';
import {acceptedIntake,assertIntakeExecution,INTAKE_TEXT_GUARD_SQL} from './production-intake';
import{productionFacts}from'./production-facts.mjs';import{executorPresence}from'./executor-presence';
import {CURRENT_FEEDBACK_GUARD_SQL,feedbackReworkBinding} from './script-feedback-contract';
import {requestScriptRework} from './script-feedback';
import {CANDIDATE_OWNER_REVIEW_DECISION} from './native-candidate-feedback-contract.mts';
import {nativePreparationBinding,parseNativePreparation} from './native-preparation-contract.mts';
import {executionDisplay,executionStatusLabel} from './execution-display.mts';
import {completedProductionDelivery} from './production-handoff';
import {productionWorkspacePlacement,type ProductionWorkspacePlacement} from './production-workspace.mts';
import {currentAutomaticCloneProgress,type AutomaticCloneProgress} from './automatic-clone-progress.mts';
import {frozenResearchForTopic,materializedResearch} from './research';
import {frozenOriginalForTopic,materializedOriginal} from './originals';
import {ensureSeries,readSeries} from './series';
import {db} from './store';
import {operations} from './media-operations';
import {milestones,recordDraft,draftStatements,recordStage,LIMITS} from './milestones';
import skill from '../production/skill-snapshots/7fc675ade9098a9abf770eddc6e2d2b4c0b3c45f/snapshot.json';
import {hash,text,validateDraft,https,ProductionError,type ProductionJob} from './production-contract';
const columns='review_mode,mode_epoch,reworks,ai_calls,id,topic_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,checkpoint_version,checkpoint,lease_until,executor,attempt,error,review_note,approved_revision,approved_hash,created_at,updated_at';
const at=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID();
// This read model is deliberately not a ProductionJob. It cannot authorize a
// mutation or stand in for the separately fetched full detail record.
export type ProductionJobSummary=ProductionWorkspacePlacement&{kind:'production-job-summary-v1';id:string;topic_id:string;title:string;is_test:number;status:string;revision:number;mode_epoch:number;review_mode:string;updated_at:string;status_label:string;execution_condition:string;clone_progress?:AutomaticCloneProgress;current_node:{node:string;status:string;artifact_version:number}|null;current_candidate:{id:string;sha256:string;review_decision:string|null;review_id:string|null}|null};
const summaryLabels:Record<string,string>={cancelled:'已取消制作',completed:'交付状态待核对',waiting_executor:'等待执行器领取',running:'执行器已领单',awaiting_review:'等待节点审核',approved:'口播稿已批准',failed:'执行失败',paused:'已暂停，需要决定',awaiting_ai:'等待AI审核',awaiting_human:'等待人工审核',ai_running:'AI正在审核',pending:'等待前一节点',revise:'已打回返工'};
const summaryNodes:Record<string,string>={source:'来源',script:'口播稿',video:'成片',cover:'封面',promotion:'宣发',delivery:'交付'};
// One owner-filtered SQL snapshot contains only the inputs needed to validate
// current facts. Correlated subqueries stay in D1, replacing per-job getJob
// round trips. Large immutable skill/checkpoint/series snapshots never enter
// this query or its explicitly projected HTTP response.
const summaryRows=(table:string,fields:string,order:string,condition='job_id=j.id')=>`(SELECT COALESCE(json_group_array(json_object(${fields.split(',').map(f=>`'${f}',${f}`).join(',')})),'[]') FROM (SELECT ${fields} FROM ${table} WHERE ${condition} ORDER BY ${order}))`;
export async function listJobSummaries(owner:string):Promise<ProductionJobSummary[]>{
 const [result,runtime]=await Promise.all([db().prepare(`SELECT j.id,j.topic_id,j.owner_id,j.is_test,j.status,j.review_mode,j.mode_epoch,j.reworks,j.ai_calls,j.revision,j.approved_revision,j.approved_hash,j.contract_hash,j.lease_until,j.lease_hash,j.error,j.review_note,j.source_snapshot,j.updated_at,
 ${summaryRows('production_drafts','revision,content_hash,content','revision DESC','job_id=j.id AND revision=j.revision')} AS drafts_raw,
 ${summaryRows('production_milestones','id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,review_until,report,created_at','revision DESC,artifact_version DESC,created_at DESC')} AS milestones_raw,
 ${summaryRows('production_reviews','id,revision,content_hash,decision,note,reviewer,created_at,rowid','created_at DESC',"job_id=j.id AND decision<>'native_preparation_handoff_event'")} AS reviews_raw,
 ${summaryRows('production_stages','id,stage,review_revision,review_hash,status,result','stage')} AS stages_raw,
 ${summaryRows('production_operations','id,node,revision,mode_epoch,script_hash,status,lease_until,error,result','created_at DESC')} AS operations_raw,
 ${summaryRows('production_data_videos','id,title,published_at,publication_source,created_at','created_at DESC,id DESC',"job_id=j.id AND published_at IS NOT NULL AND (owner_id IS NULL OR owner_id=j.owner_id)")} AS publications_raw,
 (SELECT count(*) FROM production_data_videos WHERE job_id=j.id AND published_at IS NOT NULL) AS any_publications,
 (SELECT value FROM app_state WHERE key='media_scope_v1:'||j.id) AS scope_raw,
 (SELECT value FROM app_state WHERE key='native_preparation_handoff_v1:'||j.id) AS native_raw,
 (SELECT value FROM app_state a WHERE a.key>='automatic_local_clone_v1:'||j.id||':' AND a.key<'automatic_local_clone_v1:'||j.id||';' AND json_extract(a.value,'$.owner_id')=j.owner_id AND json_extract(a.value,'$.binding.revision')=j.revision AND json_extract(a.value,'$.binding.mode_epoch')=j.mode_epoch AND json_extract(a.value,'$.binding.script_hash')=j.approved_hash AND json_extract(a.value,'$.binding.contract_hash')=j.contract_hash AND json_extract(a.value,'$.status')<>'superseded' AND json_extract(a.value,'$.superseded_by') IS NULL AND json_extract(a.value,'$.base.milestone_id')=(SELECT id FROM production_milestones m WHERE m.job_id=j.id AND m.node='video' AND m.revision=j.revision AND m.mode_epoch=j.mode_epoch ORDER BY m.artifact_version DESC LIMIT 1) ORDER BY json_extract(a.value,'$.created_at') DESC,a.key DESC LIMIT 1) AS clone_raw,
 EXISTS(SELECT 1 FROM dispositions WHERE topic_id=j.topic_id AND status IN ('produced','rejected')) AS excluded_disposition
 FROM production_jobs j WHERE j.owner_id=? OR j.is_test=1 ORDER BY j.created_at DESC LIMIT 100`).bind(owner).all<Record<string,any>>(),executorPresence()]);
 return result.results.map(row=>{
  const drafts=JSON.parse(row.drafts_raw),milestones=JSON.parse(row.milestones_raw),reviews=JSON.parse(row.reviews_raw),stages=JSON.parse(row.stages_raw),operations=JSON.parse(row.operations_raw),publication_reports=JSON.parse(row.publications_raw);
  let scopeState:any=null;try{scopeState=JSON.parse(row.scope_raw||'null')}catch{}
  const licenses:any[]=[];for(const r of [...reviews].sort((a,b)=>b.rowid-a.rowid)){if(r.decision!=='media_license'||r.reviewer!==row.owner_id)continue;const license=JSON.parse(r.note);if(!licenses.some(x=>x.library_file_id===license.library_file_id&&x.sha256===license.sha256))licenses.push(license);}
  const media_continuation={current_id:scopeState?.id||'',scope:scopeState?.scope||null,licenses};
  const context={...row,drafts,milestones,reviews,stages,operations,publication_reports,media_continuation};
  // Match readCurrentNativePreparationState's owner/scope/disposition checks;
  // a stale queue must not make an unapproved or superseded draft look active.
  const binding=nativePreparationBinding({...context,publication_reports:row.any_publications?[{}]:[]} as never),scopeReview=binding&&reviews.find((r:any)=>r.id===binding.scope_id&&r.decision==='media_scope'&&r.revision===row.revision&&r.content_hash===row.approved_hash&&r.note===JSON.stringify(scopeState?.scope));
  const scopeOwner=scopeReview&&(scopeState.scope.scope==='private-video'?scopeReview.reviewer===row.owner_id:scopeReview.reviewer===row.owner_id||scopeState.scope.authorization_source==='included-free-preparation'&&scopeReview.reviewer==='internal-free-preparation');
  const native_preparation_raw=binding&&!row.excluded_disposition&&scopeOwner&&parseNativePreparation(row.native_raw)?row.native_raw:null;
  const facts=productionFacts({...context,native_preparation_raw} as never),job={...context,facts,runtime} as ProductionJob;
  const current=(node:string)=>milestones.filter((m:any)=>m.node===node&&m.revision===row.revision&&m.mode_epoch===row.mode_epoch&&!['invalidated','superseded'].includes(m.status)).sort((a:any,b:any)=>b.artifact_version-a.artifact_version)[0];
  const nodes=['source','script','video','cover','promotion','delivery'].map(current).filter(Boolean),pending=nodes.find((m:any)=>m.status==='revise')||nodes.find((m:any)=>!['approved','pending'].includes(m.status)),video=current('video');
  const review=facts.candidate_owner_review;
  let label:string|null=null;
  if(completedProductionDelivery(job))label='交付已完成';
  else if(pending)label=(summaryNodes[pending.node]||pending.node)+(pending.status==='revise'?'需修改':pending.status==='awaiting_human'?'待本人审核':pending.status==='paused'?'审核暂停':' · '+(summaryLabels[pending.status]||pending.status));
  else if(review&&facts.video_approval!=='owner-node-approved')label=(review.reviewed_voice_kind==='owner-cloned'?'本人声音版':'普通配音版')+(review.decision==='rework-requested'?'需修改':facts.files_archived?'聊天审阅通过 · 已归档':'聊天审阅通过 · 待归档');
  else if(video?.status==='approved'&&facts.video_approval==='owner-node-approved')label='成片已通过，后续按节点继续';
  else if(facts.candidate_present&&row.approved_revision===row.revision)label='成片候选待审';
  let cloneRequest:any=null;try{cloneRequest=JSON.parse(row.clone_raw||'null')}catch{}const clone_progress=currentAutomaticCloneProgress({...context,owner_id:row.owner_id},cloneRequest);
  const placement=productionWorkspacePlacement(job,completedProductionDelivery(job),clone_progress);if(placement.workspace_badge.startsWith('修改'))label=placement.workspace_badge==='修改已排队'?'修改意见已保存，等待制作接续':placement.workspace_badge;
  const executionLabel=executionStatusLabel(job),statusLabel=row.status==='cancelled'?'已取消制作':clone_progress?clone_progress.phase+' · '+clone_progress.reason:executionLabel?(label?executionLabel+' · '+label:executionLabel):label||executionDisplay(job).label||summaryLabels[row.status]||row.status;
  let source:any={};try{source=JSON.parse(row.source_snapshot)}catch{}
  return{kind:'production-job-summary-v1',...placement,...(clone_progress?{clone_progress}:{}),id:row.id,topic_id:row.topic_id,title:typeof source.title==='string'?source.title:'未命名选题',is_test:row.is_test,status:row.status,revision:row.revision,mode_epoch:row.mode_epoch,review_mode:row.review_mode,updated_at:row.updated_at,status_label:statusLabel,execution_condition:facts.execution_condition,current_node:pending?{node:pending.node,status:pending.status,artifact_version:pending.artifact_version}:null,current_candidate:facts.candidate_record_id&&facts.candidate_video_sha256?{id:facts.candidate_record_id,sha256:facts.candidate_video_sha256,review_decision:review?.decision||null,review_id:review?.id||null}:null};
 });
}
export async function listJobs(owner:string):Promise<ProductionJob[]>{
 const rows=(await db().prepare(`SELECT ${columns},CASE WHEN owner_id=? AND is_test=0 AND (EXISTS(SELECT 1 FROM production_reviews r WHERE r.job_id=production_jobs.id AND r.revision=production_jobs.revision AND r.decision=?) OR EXISTS(SELECT 1 FROM app_state WHERE key='native_preparation_handoff_v1:'||production_jobs.id)) THEN 1 ELSE 0 END AS candidate_feedback_present FROM production_jobs WHERE owner_id=? OR is_test=1 ORDER BY created_at DESC LIMIT 100`).bind(owner,CANDIDATE_OWNER_REVIEW_DECISION,owner).all<ProductionJob&{candidate_feedback_present:number}>()).results;
 const jobs=await Promise.all(rows.map(async({candidate_feedback_present,...row}):Promise<ProductionJob|null>=>{
  if(!candidate_feedback_present)return row;
  try{
   const current=await getJob(row.id,owner);
   if(current.is_test!==0||!current.facts.candidate_owner_review&&!current.facts.native_preparation_handoff)return row;
   // Use current columns with current facts: a concurrent revision must not borrow the old list binding.
   const projected=Object.fromEntries(columns.split(',').map(key=>[key,current[key as keyof ProductionJob]])) as ProductionJob;
   return {...projected,facts:current.facts};
  }catch(error){if(error instanceof ProductionError&&error.status===404)return null;throw error;}
 }));
 return jobs.filter((job):job is ProductionJob=>job!==null);
}
export async function getJob(id:string,owner?:string,options?:{desk?:boolean}){
 // The browser desk does not use the large immutable skill snapshot except in
 // the on-demand historical diagnostics. All executor and mutation callers
 // retain the full existing contract. The desk result is explicitly marked.
 const desk=options?.desk===true,readColumns=desk?columns.replace(',skill_snapshot,',','):columns;
 const job=await db().prepare(`SELECT ${readColumns} FROM production_jobs WHERE id=?${owner?' AND (owner_id=? OR is_test=1)':''}`).bind(...(owner?[id,owner]:[id])).first<ProductionJob>();if(!job)throw new ProductionError('任务不存在',404);
 // Once access is checked above, these independent reads need no serial wait.
 // Their existing implementations, owner filters and validation stay intact.
 const [factOwner,drafts,stages,reviews,publications,runtime,ms,ops,mediaContinuation,nativePreparation,intake,series,cliCapacity]=await Promise.all([
  db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string|null}>(),
  db().prepare('SELECT * FROM production_drafts WHERE job_id=? ORDER BY revision DESC').bind(id).all(),
  db().prepare('SELECT * FROM production_stages WHERE job_id=? ORDER BY stage').bind(id).all(),
  db().prepare(`SELECT id,revision,content_hash,decision,note,reviewer,created_at FROM production_reviews WHERE job_id=?${desk?" AND decision<>'native_preparation_handoff_event'":''} ORDER BY created_at DESC`).bind(id).all(),
  db().prepare('SELECT id,title,published_at,publication_source,created_at FROM production_data_videos WHERE job_id=? AND published_at IS NOT NULL AND (owner_id IS NULL OR owner_id=(SELECT owner_id FROM production_jobs WHERE id=?)) ORDER BY created_at DESC,id DESC').bind(id,id).all(),
  executorPresence(),milestones(id),operations(id),readMediaContinuation(id),readCurrentNativePreparationState(id),acceptedIntake(id),readSeries(id,owner),readCliCapacity(id)
 ]);
 const facts=productionFacts({...job,native_preparation_raw:nativePreparation,owner_id:factOwner?.owner_id,media_continuation:mediaContinuation,drafts:drafts.results,reviews:reviews.results,stages:stages.results,publication_reports:publications.results,operations:ops,milestones:ms} as never);
 return {...job,...(desk?{detail_view:'desk' as const}:{}),cli_capacity:cliCapacity,media_continuation:mediaContinuation,intake,facts,runtime,series,drafts:drafts.results,stages:stages.results,reviews:reviews.results,publication_reports:publications.results,milestones:ms,operations:ops};
}
export async function createJob(topicId:string,owner:string|null,isTest=false,mode='node',initialStatus:'waiting_executor'|'paused'='waiting_executor'){
 if(!['node','auto'].includes(mode))throw new ProductionError('审核模式无效',400);
 const existing=await db().prepare(`SELECT ${columns} FROM production_jobs WHERE topic_id=?`).bind(topicId).first<ProductionJob>();if(existing){if(owner&&!(await listJobs(owner)).some(x=>x.id===existing.id))throw new ProductionError('此题已有任务');return {job:await getJob(existing.id),created:false}}
 const topic=await db().prepare('SELECT * FROM topics WHERE id=?').bind(topicId).first();if(!topic)throw new ProductionError('选题不存在',404);
 const research=await frozenResearchForTopic(topic,owner),original=await frozenOriginalForTopic(topic,owner),snapshot=JSON.stringify(research?{...topic,research}:original?{...topic,original}:topic),contract=JSON.stringify({source:snapshot,skill,scope:'source-verification-and-script',is_test:isTest}),id='job_'+uuid();
 await db().prepare(`INSERT INTO production_jobs(id,topic_id,owner_id,is_test,review_mode,status,source_snapshot,skill_snapshot,contract_hash,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM dispositions WHERE topic_id=? AND status IN ('produced','rejected')) ON CONFLICT(topic_id) DO NOTHING`).bind(id,topicId,owner,isTest?1:0,mode,initialStatus,snapshot,JSON.stringify(skill),await hash(contract),at(),at(),topicId).run();
 const result=await db().prepare('SELECT id FROM production_jobs WHERE topic_id=?').bind(topicId).first<{id:string}>();if(!result)throw new ProductionError('已制作或已否决选题不能重复生成；请先明确恢复状态');if(result.id===id)await ensureSeries(id);return {job:await getJob(result.id),created:result.id===id};
}
export async function claimJob(executor:string,id?:string){
 if(id)await assertIntakeExecution(id);
 const token=uuid()+uuid(),now=Date.now();const claimed=await db().prepare(`UPDATE production_jobs SET status='running',lease_hash=?,lease_until=?,executor=?,attempt=attempt+1,error=NULL,updated_at=? WHERE id=(SELECT id FROM production_jobs j WHERE ${cliContentCountSql('j','generation')}<${continuationLimitSql('j','generation')} AND (reworks<=2 OR ${continuationSql('j')}) AND ${cliReadySql()} AND ${INTAKE_TEXT_GUARD_SQL} AND ${CURRENT_FEEDBACK_GUARD_SQL} AND (status='waiting_executor' OR (status='running' AND lease_until<?)) ${id?'AND id=?':''} ORDER BY created_at LIMIT 1) RETURNING id`).bind(await hash(token),now+600000,text(executor,120),at(),now,...(id?[id]:[])).first<{id:string}>();
 return claimed?{job:await getJob(claimed.id),lease_token:token,lease_seconds:600}: {job:null,reason:'没有可领任务；失败任务需用户重试，付费阶段不会自动领单'};
}
async function lease(id:string,token:string){const h=await hash(text(token,200));const row=await db().prepare('SELECT * FROM production_jobs WHERE id=? AND lease_hash=? AND lease_until>? AND status=\'running\'').bind(id,h,Date.now()).first<ProductionJob>();if(!row)throw new ProductionError('租约已失效；先读取任务，不得继续写入');return {row,h}}
export async function checkpointJob(id:string,token:string,version:number,checkpoint:unknown){
 const {h}=await lease(id,token),content=JSON.stringify(checkpoint);if(content.length>60000)throw new ProductionError('Checkpoint 超过60KB',400);
 const result=await db().prepare(`UPDATE production_jobs SET checkpoint=?,checkpoint_version=checkpoint_version+1,lease_until=?,updated_at=? WHERE id=? AND lease_hash=? AND lease_until>? AND status='running' AND checkpoint_version=? RETURNING checkpoint_version`).bind(content,Date.now()+600000,at(),id,h,Date.now(),version).first();if(!result)throw new ProductionError('Checkpoint 版本冲突；读取后恢复');return getJob(id);
}
export async function heartbeat(id:string,token:string){const {h}=await lease(id,token);const result=await db().prepare(`UPDATE production_jobs SET lease_until=?,updated_at=? WHERE id=? AND lease_hash=? AND lease_until>? AND status='running' RETURNING id`).bind(Date.now()+600000,at(),id,h,Date.now()).first();if(!result)throw new ProductionError('租约过期');return getJob(id)}
export async function submitDraft(id:string,token:string,base:number,submission:string,value:unknown){
 const siteCommand=await acceptedIntake(id);if(siteCommand&&(value as {execution?:{site_instruction_hash?:string}})?.execution?.site_instruction_hash!==siteCommand.command_hash)throw new ProductionError('草稿未绑定站内已确认的指令，拒绝聊天或旧配置覆盖',409);
 const sid=text(submission,120),prior=await db().prepare('SELECT * FROM production_drafts WHERE job_id=? AND submission_id=?').bind(id,sid).first();
 const draft=validateDraft(value),content=JSON.stringify(draft),contentHash=await hash(content);
 if(prior){if(prior.content_hash!==contentHash)throw new ProductionError('相同提交ID不能覆盖已有成果');const replayJob=await getJob(id);if(replayJob.status==='awaiting_review'&&replayJob.revision===prior.revision)await recordDraft(id,Number(prior.revision),contentHash,content);return {job:await getJob(id),replayed:true}}
 const {row,h}=await lease(id,token),snapshot=JSON.parse(row.skill_snapshot);if(draft.execution.source_hash!==await hash(row.source_snapshot)||draft.execution.skill_hash!==snapshot.sha256)throw new ProductionError('成果必须绑定此任务来源与技能快照');
 const boundJob=await getJob(id) as unknown as ProductionJob;const lockedScript=activeScriptLock(boundJob);if(lockedScript){if(await hash(lockedScript.text)!==lockedScript.sha256)throw new ProductionError('锁稿内容哈希不匹配');try{verifyLockedDraft(lockedScript,draft)}catch(e){throw new ProductionError((e as Error).message)}}
 const continuation=ownerFeedbackContinuation(boundJob);const requiredFeedback=feedbackReworkBinding(boundJob)||(continuation?.source_revision===boundJob.revision?continuation:null);if(requiredFeedback){const actual=(draft.execution as unknown as {feedback?:{feedback_id:string;queue_id:string;feedback_note_sha256:string;source_revision:number;source_hash:string;mode_epoch:number}}).feedback;if(!actual||['feedback_id','queue_id','feedback_note_sha256','source_revision','source_hash','mode_epoch'].some(k=>actual[k as keyof typeof actual]!==requiredFeedback[k as keyof typeof requiredFeedback]))throw new ProductionError('新稿没有绑定网站本人反馈与队列回执，不能回传');}
 const source=JSON.parse(row.source_snapshot);if(!draft.evidence.some(e=>e.url===source.url))throw new ProductionError('必须核读本任务原文，不可只交相关报道');
 const research=await materializedResearch(source);if(research&&(!draft.evidence.some(e=>e.url===research.url&&e.sha256===research.sha256)||research.source_notes.some(note=>!draft.evidence.some(e=>e.url===note.url&&e.sha256===note.note_sha256))))throw new ProductionError('研究稿必须绑定冻结综合资料包和每条来源笔记的URL与SHA；综合稿哈希不能冒充各来源原文',409);
 const original=await materializedOriginal(source);if(original&&!draft.evidence.some(e=>e.url===original.url&&e.sha256===original.sha256))throw new ProductionError('原创稿必须绑定冻结原文与草稿资料包的URL和SHA；本人说明不是外部实测证据',409);
 const now=Date.now(),time=at();const results=await db().batch([
 db().prepare(`INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) SELECT id,revision+1,?,?,?,?,? FROM production_jobs WHERE id=? AND revision=? AND lease_hash=? AND lease_until>? AND status='running'`).bind(sid,content,contentHash,row.executor,time,id,base,h,now),
 db().prepare(`UPDATE production_jobs SET revision=revision+1,status='awaiting_review',lease_hash=NULL,lease_until=NULL,approved_revision=NULL,approved_hash=NULL,updated_at=? WHERE id=? AND revision=? AND lease_hash=? AND lease_until>? AND status='running' AND EXISTS(SELECT 1 FROM production_drafts WHERE job_id=? AND revision=? AND submission_id=?)`).bind(time,id,base,h,now,id,base+1,sid),...draftStatements(id,base+1,contentHash,content)]);
 if(!results[1].meta.changes)throw new ProductionError('草稿版本或租约冲突，先读回成果');return {job:await getJob(id),replayed:false};
}
export async function failJob(id:string,token:string,message:string,diagnostic?:unknown){const {row,h}=await lease(id,token);if(diagnostic){await persistCliFailure(row,h,text(message,2000),diagnostic);return getJob(id);}await db().prepare(`UPDATE production_jobs SET status='failed',error=?,lease_hash=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_hash=? AND lease_until>? AND status='running'`).bind(text(message,2000),at(),id,h,Date.now()).run();return getJob(id)}
export async function reopenJob(id:string,owner:string,revision:number,contentHash:string,note:string){
 await assertNoPreparation(id);
 const j=await getJob(id,owner);
 return requestScriptRework(id,owner,{revision,content_hash:contentHash,mode_epoch:j.mode_epoch,note:text(note,4000)},{kind:'reopen'});
}
export async function retryJob(id:string,owner:string){const budget=await getJob(id,owner);if(!cliContentBudget(budget).generation_available)throw new ProductionError('已达到执行或返工上限，需人工决定');await recordExecutionFailure(budget,owner);const result=await db().prepare(`UPDATE production_jobs SET status='waiting_executor',lease_hash=NULL,lease_until=NULL,error=NULL,updated_at=? WHERE id=? AND (status='failed' OR (status='running' AND lease_until<?)) RETURNING id`).bind(at(),id,Date.now()).first();if(!result)throw new ProductionError('仅失败或租约过期任务可恢复；Checkpoint 保留');return getJob(id,owner)}
export async function reviewJob(id:string,owner:string,revision:number,contentHash:string,decision:string,note:string){
 const ownership=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string}>();if(ownership?.owner_id!==owner)throw new ProductionError('只有任务本人可以审核',403);const currentJob=await getJob(id,owner);if(currentJob.review_mode==='auto'||currentJob.milestones?.some(m=>m.revision===revision&&m.status!=='approved'))throw new ProductionError('请在里程碑逐节点审核，不能跳过检查');if(!['approve','revise'].includes(decision))throw new ProductionError('审稿决策无效',400);if(decision==='revise')text(note,4000);const rid='review_'+uuid(),time=at();
 if(decision==='revise')return requestScriptRework(id,owner,{revision,content_hash:contentHash,mode_epoch:currentJob.mode_epoch,note:text(note,4000)},{kind:'legacy'});
 const result=await db().batch([
 db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,?,?,?,?,? FROM production_jobs WHERE id=? AND revision=? AND status='awaiting_review' AND EXISTS(SELECT 1 FROM production_drafts WHERE job_id=? AND revision=? AND content_hash=?)`).bind(rid,contentHash,decision,note,owner,time,id,revision,id,revision,contentHash),
 db().prepare(`UPDATE production_jobs SET status=?,approved_revision=?,approved_hash=?,review_note=?,updated_at=? WHERE id=? AND revision=? AND status='awaiting_review' AND EXISTS(SELECT 1 FROM production_reviews WHERE id=?)`).bind(decision==='approve'?'approved':'waiting_executor',decision==='approve'?revision:null,decision==='approve'?contentHash:null,note,time,id,revision,rid)]);
 if(!result[1].meta.changes)throw new ProductionError('草稿已变化或已审阅，请重新读取当前版本');return getJob(id,owner);
}
export async function requestStage(id:string,owner:string,stage:string,revision:number,contentHash:string){
 await getJob(id,owner);if(!['cover','video','promotion'].includes(stage))throw new ProductionError('阶段无效',400);
 const sid='stage_'+uuid();await db().prepare(`INSERT INTO production_stages(id,job_id,stage,review_revision,review_hash,status,updated_at) SELECT ?,id,?,?,?,'blocked_executor',? FROM production_jobs WHERE id=? AND status='approved' AND approved_revision=? AND approved_hash=? ON CONFLICT(job_id,stage,review_revision) DO NOTHING`).bind(sid,stage,revision,contentHash,at(),id,revision,contentHash).run();
 const record=await db().prepare('SELECT * FROM production_stages WHERE job_id=? AND stage=? AND review_revision=? AND review_hash=?').bind(id,stage,revision,contentHash).first();if(!record)throw new ProductionError('后续制作必须绑定已批准的当前口播版本');return {stage:record,blocker:'尚未接入此阶段执行器；未授予付费调用和发布权限。请求已持久保存，不会模拟执行。'};
}
export async function stageResult(id:string,stageId:string,value:Record<string,unknown>){
 // Callback only for externally completed, zero-cost results. No provider submission occurs here.
 const provider=text(value.provider_job_id,150),url=https(value.url),sha=text(value.sha256,64);if(!/^[a-f0-9]{64}$/.test(sha)||value.cost!==0)throw new ProductionError('第一版仅接受零新增费用成果；计费结果需单独权限设计',400);
 const stage=await db().prepare('SELECT * FROM production_stages WHERE id=? AND job_id=?').bind(stageId,id).first();if(!stage)throw new ProductionError('阶段请求不存在',404);if(!['cover','video','promotion'].includes(String(stage.stage)))throw new ProductionError('准备节点仅接受租约绑定的技术检查回执',400);if(['cover','video'].includes(String(stage.stage)))await assertMediaScope(await getJob(id),String(stage.stage));
 const result=JSON.stringify({url,sha256:sha,verification:'external-result-reported; requires owner review',cost:0});if(stage.result){if(stage.result!==result||stage.provider_job_id!==provider)throw new ProductionError('重复回调不允许覆盖成果');return getJob(id)}
 const saved=await db().prepare(`UPDATE production_stages SET result=?,provider_job_id=?,status='result_reported',updated_at=? WHERE id=? AND result IS NULL AND EXISTS(SELECT 1 FROM production_jobs WHERE id=? AND status='approved' AND approved_revision=production_stages.review_revision AND approved_hash=production_stages.review_hash) RETURNING id`).bind(result,provider,at(),stageId,id).first();if(!saved)throw new ProductionError('批准版本已变化或成果已回传；不重试收费');await recordStage(id,stage,result);return getJob(id);
}

// Records an explicitly delegated human CHANGE REQUEST. Never approves a draft,
// never supplies or impersonates a browser visitor identity, and cannot touch personal tables.
export async function requestScriptRevision(id:string,revision:number,contentHash:string,requestId:string,note:string,authorizationReference:string){
 const rid='delegated_revision_'+text(requestId,120),previous=await db().prepare('SELECT job_id,revision,content_hash FROM production_reviews WHERE id=?').bind(rid).first<{job_id:string;revision:number;content_hash:string}>();
 if(previous){if(previous.job_id!==id||previous.revision!==revision||previous.content_hash!==contentHash)throw new ProductionError('修订请求ID已绑定其他版本');return getJob(id)}
 const job=await getJob(id);if(job.reworks>=2||!cliContentBudget(job).generation_available)throw new ProductionError('返工或执行预算已用完，请人工决定');if(job.status!=='awaiting_review'||job.revision!==revision)throw new ProductionError('仅能修改当前待审稿版本');
 const old=JSON.parse(job.skill_snapshot),next=JSON.stringify({...skill,previous_snapshots:[...(old.previous_snapshots||[]),{revision,content_hash:contentHash,contract_hash:job.contract_hash,snapshot:old}]});
 const noteContent=JSON.stringify({note:text(note,4000),authorization_reference:text(authorizationReference,300),actor:'delegated-owner-change-request',approval:false,old_skill_sha256:old.sha256,new_skill_sha256:skill.sha256,new_skill_revision:skill.revision});
 const contract=await hash(JSON.stringify({source:job.source_snapshot,skill:next,scope:'source-verification-and-script',is_test:job.is_test})),time=at();
 const result=await db().batch([
 db().prepare(`INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,?,'revise',?,'delegated-owner-change-request',? FROM production_jobs WHERE id=? AND revision=? AND status='awaiting_review' AND contract_hash=? AND EXISTS(SELECT 1 FROM production_drafts WHERE job_id=? AND revision=? AND content_hash=?)`).bind(rid,contentHash,noteContent,time,id,revision,job.contract_hash,id,revision,contentHash),
 db().prepare(`UPDATE production_jobs SET status='waiting_executor',reworks=reworks+1,skill_snapshot=?,contract_hash=?,approved_revision=NULL,approved_hash=NULL,review_note=?,error=NULL,updated_at=? WHERE id=? AND revision=? AND status='awaiting_review' AND EXISTS(SELECT 1 FROM production_reviews WHERE id=?)`).bind(next,contract,note,time,id,revision,rid),
 db().prepare(`UPDATE production_milestones SET status='revise',updated_at=? WHERE job_id=? AND revision=? AND EXISTS(SELECT 1 FROM production_reviews WHERE id=?)`).bind(time,id,revision,rid)]);
 if(!result[1].meta.changes)throw new ProductionError('草稿版本已变化，请读回后重新核对授权');return getJob(id);
}
