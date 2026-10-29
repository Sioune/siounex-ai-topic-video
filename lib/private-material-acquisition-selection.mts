import {validNativePreclaimReconciliation} from './native-preclaim-reconciliation.mts';
const gaps=new Set(['MOTION_CONTENT_GAPS','MOTION_DYNAMIC_COVERAGE_LOW','owner-feedback-materials-next-step']);
// Scheduling hint for a returned read-only material pass, never a producer retry.
// Continuation still verifies current approvals, plans real coverage and uses the
// existing exact completed-audio recovery for a rejected base video.
export function isMaterialAcquisitionResumeCandidate(h:any):boolean{
 const b=h?.binding,r=h?.reconciliation,a=h?.checkpoint?.artifacts;
 return h?.status==='blocked'&&h.lease_until===null&&b?.scope==='private-video'&&/^native_prep_[a-f0-9]{64}$/.test(h.queue_id||'')&&Number.isSafeInteger(h.version)&&h.version>=3&&h.executor==='finite-material-acquisition-v1'&&/^material-search-[a-f0-9-]{36}$/.test(h.invocation_id||'')&&!h.base_pending_video&&Number.isSafeInteger(b.revision)&&b.revision>=0&&Number.isSafeInteger(b.mode_epoch)&&b.mode_epoch>=0&&/^[a-f0-9]{64}$/.test(b.script_hash||'')&&/^[a-f0-9]{64}$/.test(b.contract_hash||'')&&typeof b.scope_id==='string'&&!!b.scope_id&&(!r||validNativePreclaimReconciliation(r)&&['resolved','superseded'].includes(r.state))&&Array.isArray(h.missing)&&h.missing.length>0&&h.missing.length<=30&&h.missing.some((m:any)=>m.code?.startsWith('MOTION_'))&&h.missing.every((m:any)=>gaps.has(m.code))&&Array.isArray(a)&&a.length>0&&a.every((v:any)=>v.kind==='local-file'&&v.purpose==='render-receipt'&&new RegExp('^\\.sites-runtime/authorized-inputs/job_[a-f0-9-]{36}/revision-'+b.revision+'/automatic-material-plan/[a-f0-9]{64}/gaps\\.json$').test(v.file||'')&&/^[a-f0-9]{64}$/.test(v.sha256||'')&&Number.isSafeInteger(v.size_bytes)&&v.size_bytes>0);
}
