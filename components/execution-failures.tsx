'use client';
import type{ProductionJob}from'@/lib/production-contract';
type Failure={attempt:number;revision:number;failed_at:string;reason:string;checkpoint?:{phase?:string;submission_id?:string}};
export function executionErrorText(reason:string){
 if(/CLI_NONZERO_EXIT|CLI_DEADLINE_REACHED|CLI_OUTPUT_MISSING|CLI_RESULT_UNKNOWN|result[_ -]unknown/i.test(reason))return '执行程序未正常回传结果，是否已有产物仍待核对。先检查原调用与已保存文件，不能直接重新生成。';
 if(/CLI_RATE_LIMITED/.test(reason))return '生成服务触发频率限制，本轮未生成草稿。后续接续时间与次数以本任务的恢复记录为准。';
 if(/CLI_PROCESS_START_FAILED/.test(reason))return '执行程序未能启动，当前步骤尚未完成。请核对本机执行器后再继续。';
 if(/[\u3400-\u9fff]/.test(reason))return reason;
 return '执行遇到技术问题，当前步骤尚未完成。请核对已保存结果与执行记录后继续。';
}
export function ExecutionError({reason}:{reason:string}){const message=executionErrorText(reason);return <div data-execution-error><p role="alert">{message}</p>{message!==reason&&<details><summary>技术记录（排查时查看）</summary><pre>{reason}</pre></details>}</div>}
export function ExecutionFailures({job}:{job:ProductionJob}){const rows=(job.reviews||[]).filter(r=>r.decision==='executor_failure_v1').flatMap(r=>{try{if(typeof r.note!=='string'||typeof r.id!=='string')return[];const value=JSON.parse(r.note)as Failure;if(!value||typeof value.reason!=='string'||!Number.isSafeInteger(value.revision)||!Number.isSafeInteger(value.attempt))return[];return[{...value,id:r.id}]}catch{return[]}});if(!rows.length)return null;return <details><summary>执行失败历史（恢复后仍保留）</summary>{rows.map(r=><div key={r.id} className="production-notice"><strong>草稿 v{r.revision} · 第{r.attempt}次执行</strong><p>{r.failed_at}</p><ExecutionError reason={r.reason}/>{r.checkpoint?.phase&&<details><summary>最后执行检查点</summary><code>{r.checkpoint.phase}</code></details>}<p>失败记录不代表质量批准，也不自动重试。</p></div>)}</details>}
