import {nativeReconciliationHolds} from './native-preclaim-reconciliation.mts';

// Queue selection is a hint, never a production or audio-reuse proof. The
// continuation verifies the immutable producer files, current owner scope and
// actual narration plus original outro frames before claiming any work.
export function isFrameBudgetRecoveryCandidate(h:any):boolean{
 if(h?.status!=='blocked'||h.lease_until!==null||h.binding?.scope!=='private-video'||!/^native_prep_[a-f0-9]{64}$/.test(h.queue_id||'')||h.executor!=='finite-local-private-review-v1'||!/^private-review-[a-f0-9-]{36}$/.test(h.invocation_id||'')||!Number.isSafeInteger(h.version)||h.version<3||h.base_video||h.base_pending_video||nativeReconciliationHolds(h.reconciliation))return false;
 if(!/^job_[a-f0-9-]{36}$/.test(h.job_id||'')||!Number.isSafeInteger(h.binding.revision)||h.binding.revision<1||!Array.isArray(h.missing)||!h.missing.length||h.missing.length>2||new Set(h.missing.map((m:any)=>m?.code)).size!==h.missing.length||!h.missing.some((m:any)=>m?.code==='measured-speech-frame-budget')||h.missing.some((m:any)=>!['measured-speech-frame-budget','complete-narration-over-budget'].includes(m?.code))||!Array.isArray(h.checkpoint?.artifacts))return false;
 const prefix='.sites-runtime/authorized-inputs/'+h.job_id+'/revision-'+h.binding.revision+'/private-review/';
 return h.checkpoint.artifacts.some((a:any)=>a?.kind==='local-file'&&a.purpose==='render-receipt'&&typeof a.file==='string'&&a.file.startsWith(prefix)&&/^[a-f0-9]{64}\/producer-receipt\.json$/.test(a.file.slice(prefix.length))&&/^[a-f0-9]{64}$/.test(a.sha256||'')&&Number.isSafeInteger(a.size_bytes)&&a.size_bytes>0);
}
