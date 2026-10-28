'use client';
import {cliContentBudget} from '@/lib/cli-content-budget.mts';
import {cliFailureRecovery,cliFailureIsReview} from '@/lib/cli-failure-contract.mts';
import type {ProductionJob} from '@/lib/production-contract';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';

export const cliRecoveryLabels:Record<string,string>={
 'account-capacity-wait':'生成额度暂不可用，等待恢复',
 cooldown:'服务限流，等待冷却后接续',
 ready:'冷却已结束，等待接续检查',
 retrying:'本轮接续已领取',
 'manual-retry':'本次执行未产出，可确认接续',
 'budget-exhausted':'有效内容预算已用完，等待本人决定',
 'result-unknown':'执行结果待核对'
};
export function ExecutionRecovery({job,busy,note,onNote,onRefresh,onContinue}:{job:ProductionJob;busy:boolean;note:string;onNote:(value:string)=>void;onRefresh:()=>void;onContinue:()=>void}){
 const recovery=cliFailureRecovery(job);if(!recovery)return null;
 const budget=cliContentBudget(job),reviewFailure=cliFailureIsReview(job),retryTime=recovery.next_retry_at?Date.parse(recovery.next_retry_at):NaN;
 const transportResume='transport_resume_required' in recovery&&recovery.transport_resume_required===true;
 const time=Number.isFinite(retryTime)?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(retryTime):null;
 return <section className="production-rework-recovery" aria-label="执行异常与下一步" data-cli-recovery={recovery.state}>
  <h3>{transportResume?'零结果限流已核实，等待原任务接续':cliRecoveryLabels[recovery.state]||'执行待接续'}</h3>
  <p role={recovery.result_unknown?'alert':'status'}>{recovery.message}</p>
  <p>累计执行 {budget.raw_attempts} 次、审核 {budget.raw_ai_calls} 次；有效内容执行 {budget.content_attempts}/6、审核 {budget.content_ai_calls}/8。已核实的零结果限流另计：执行 {budget.zero_result_generation_attempts} 次、审核 {budget.zero_result_review_calls} 次；原始记录保留。</p>
  {!reviewFailure&&job.revision===0&&!job.drafts?.length&&<p>首版口播稿尚未回传；当前没有可审核或已完成的成片。</p>}
  {job.revision>0&&!!job.drafts?.length&&<p>{reviewFailure?<>已回传的口播 v{job.revision} 与已通过节点保留；本次只是审核未返回结果，无需重建任务。</>:<>已回传的口播 v{job.revision} 和审核意见保留；此处“未返回”仅指本轮没有生成新版稿件，不需要你重建任务。</>}</p>}
  {time&&<p>北京时间{recovery.state==='account-capacity-wait'?'额度预计重置时间':'最早接续时间'}：<time dateTime={recovery.next_retry_at!}>{time}</time>。到时仍需实际确认服务可用。</p>}
  {recovery.automatic_retry_allowed&&<p>{transportResume?'后台将恢复原队列，无需再次确认接续；原失败证据和累计历史保留。':''}{reviewFailure?'后台会按当前审核与有效内容剩余次数接续；无需重新建任务。排队不代表审核已通过或制作已完成。':'后台会按原任务与有效内容剩余次数接续；无需重新建任务。排队不代表已生成或已完成。'}</p>}
  {recovery.result_unknown&&<p>{reviewFailure?'先核对原审核调用、已有审核输出及回执。核对前不重复审核，也不通过切换模式启动另一轮。':'先核对原调用、输出文件与回执。核对前不重新生成，也不通过切换模式启动另一轮。'}</p>}
  {recovery.owner_retry_allowed&&<><label>本次接续理由<Textarea aria-label="本次安全接续理由" value={note} onChange={event=>onNote(event.target.value)} disabled={busy} maxLength={2000} placeholder="说明已确认的故障与接续理由"/></label><p>填写理由后可确认接续；这不会重置执行次数，也不代表稿件或成片通过审核。</p><Button disabled={busy||!note.trim()} onClick={onContinue}>{busy?'正在保存接续决定…':'确认接续本任务'}</Button></>}
  <Button variant="outline" disabled={busy} onClick={onRefresh}>{busy?'正在处理…':'重新核对执行状态'}</Button>
  <a className="text-link" href="#production-recovery">查看执行记录与其他处理选项 →</a>
 </section>;
}
