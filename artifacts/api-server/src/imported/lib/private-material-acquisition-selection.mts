import {validNativePreclaimReconciliation} from './native-preclaim-reconciliation.mts';
const gaps=new Set(['MOTION_CONTENT_GAPS','MOTION_DYNAMIC_COVERAGE_LOW','owner-feedback-materials-next-step']);
// Scheduling hint for a returned read-only material pass, never a producer retry.
// Continuation still verifies current approvals, plans real coverage and uses the
// existing exact completed-audio recovery for a rejected base video.
export function isMaterialAcquisitionResumeCandidate(h:any):boolean{
 const b=h?.binding,r=h?.reconciliation,a=h?.checkpoint?.artifacts;
 return h?.status==='blocked'&&h.lease_until===null&&b?.scope==='private-video'&&/^native_prep_[a-f0-9]{64}$/.test(h.queue_id||'')&&Number.isSafeInteger(h.version)&&h.version>=3&&h.executor==='finite-material-acquisition-v1'&&/^material-search-[a-f0-9-]{36}$/.test(h.invocation_id||'')&&!h.base_pending_video&&Number.isSafeInteger(b.revision)&&b.revision>=0&&Number.isSafeInteger(b.mode_epoch)&&b.mode_epoch>=0&&/^[a-f0-9]{64}$/.test(b.script_hash||'')&&/^[a-f0-9]{64}$/.test(b.contract_hash||'')&&typeof b.scope_id==='string'&&!!b.scope_id&&(!r||validNativePreclaimReconciliation(r)&&['resolved','superseded'].includes(r.state))&&Array.isArray(h.missing)&&h.missing.length>0&&h.missing.length<=30&&h.missing.some((m:any)=>m.code?.startsWith('MOTION_'))&&h.missing.every((m:any)=>gaps.has(m.code))&&Array.isArray(a)&&a.length>0&&a.every((v:any)=>v.kind==='local-file'&&v.purpose==='render-receipt'&&new RegExp('^\\.sites-runtime/authorized-inputs/job_[a-f0-9-]{36}/revision-'+b.revision+'/automatic-material-plan/[a-f0-9]{64}/gaps\\.json$').test(v.file||'')&&/^[a-f0-9]{64}$/.test(v.sha256||'')&&Number.isSafeInteger(v.size_bytes)&&v.size_bytes>0);
}

// A read-only scheduling hint for an existing producer after an AI-only visual
// gap. The worker must verify every original file and the exact owner feedback
// before upload; selection itself never authorizes another production.
export function isManualCompletedProducerCandidate(job:any,h:any):boolean{
 const b=h?.binding,base=h?.base_video,a=h?.checkpoint?.artifacts,r=h?.reconciliation;
 if(job?.review_mode!=='node'||job?.is_test||job?.status!=='approved'||!/^job_[a-f0-9-]{36}$/.test(job.id||'')||h?.status!=='blocked'||h.lease_until!==null||h.executor!=='finite-material-acquisition-v1'||!/^material-search-[a-f0-9-]{36}$/.test(h.invocation_id||'')||!/^native_prep_[a-f0-9]{64}$/.test(h.queue_id||'')||!Number.isSafeInteger(h.version)||h.version<3||h.base_pending_video||!base||b?.scope!=='private-video'||b.revision!==job.revision||b.script_hash!==job.approved_hash||b.mode_epoch!==job.mode_epoch||b.contract_hash!==job.contract_hash||!job.milestones?.some((m:any)=>m.id===base.id&&m.node==='video'&&m.revision===b.revision&&m.mode_epoch===b.mode_epoch&&m.artifact_hash===base.artifact_hash&&m.artifact_version===base.artifact_version&&m.status==='revise')||r&&(!validNativePreclaimReconciliation(r)||!['resolved','superseded'].includes(r.state))||!Array.isArray(h.missing)||!h.missing.length||h.missing.length>30||!h.missing.some((v:any)=>/^MOTION_[A-Z0-9_]+$/.test(v.code||''))||!h.missing.every((v:any)=>/^MOTION_[A-Z0-9_]+$/.test(v.code||'')||v.code==='owner-feedback-materials-next-step')||!Array.isArray(a))return false;
 const file=a.filter((v:any)=>v.kind==='local-file'&&typeof v.file==='string'&&v.file.endsWith('/producer-receipt.json')).at(-1);
 return !!file&&file.purpose==='render-receipt'&&new RegExp('^\\.sites-runtime/authorized-inputs/'+job.id+'/revision-'+b.revision+'/private-review/[a-f0-9]{64}/producer-receipt\\.json$').test(file.file)&&/^[a-f0-9]{64}$/.test(file.sha256||'')&&Number.isSafeInteger(file.size_bytes)&&file.size_bytes>0;
}
