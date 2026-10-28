// Never retry mutations here: a lost response may conceal a committed receipt.
import {sourceDiagnostic} from '../lib/source-input-contract.mts';
import {createHash} from 'node:crypto';
export function executorTimeoutMs(action,deadline=Infinity,now=Date.now()){
 const remaining=deadline===Infinity?Infinity:Math.floor(deadline-now-1000);
 if(!Number.isFinite(now)||Number.isNaN(deadline)||remaining<=0)throw Object.assign(Error('Executor foreground deadline exhausted'),{code:'EXECUTOR_FOREGROUND_DEADLINE_EXHAUSTED'});
 return Math.min(action==='site_archive_finalize'?120000:30000,remaining);
}
export async function executorResponse(response){
 const text=await response.text();let value;try{value=JSON.parse(text)}catch{
  const e=Error('Executor response missing or incomplete JSON (HTTP '+response.status+'); result unknown. Reconcile saved invocation and receipt before repeating.');e.code='EXECUTOR_RESULT_UNKNOWN';e.status=response.status;e.response_sha256=createHash('sha256').update(text).digest('hex');throw e;
 }
 if(!response.ok){const e=Error('Executor HTTP '+response.status+': '+(typeof value.error==='string'?value.error:'request rejected'));e.status=response.status;e.response_sha256=createHash('sha256').update(text).digest('hex');e.code=response.status===409&&value.code==='PRODUCTION_CANCELLED'?'PRODUCTION_CANCELLED':response.status>=500?'EXECUTOR_RESULT_UNKNOWN':'EXECUTOR_REQUEST_REJECTED';const diagnostic=sourceDiagnostic(value.source_diagnostic);if(diagnostic)e.source_diagnostic=diagnostic;throw e;}
 return value;
}
