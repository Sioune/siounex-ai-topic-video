import {nativeReconciliationHolds,validNativePreclaimReconciliation} from './native-preclaim-reconciliation.mts';
import {currentApprovedText,privateProductionJobExcluded} from './approved-production-policy.mts';
const digest=(v:any)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function isCompletedPrivateReturnHandoff(h:any){
 const refs=h?.checkpoint?.artifacts?.filter((a:any)=>a.kind==='local-file'&&a.purpose==='render-receipt'&&/\/private-review\/[a-f0-9]{64}\/producer-receipt\.json$/.test(a.file||''));
 return (h?.reconciliation==null||validNativePreclaimReconciliation(h.reconciliation)&&!nativeReconciliationHolds(h.reconciliation))&&!h?.base_video&&!h?.base_pending_video&&h?.status==='completed'&&h.lease_until===null&&h.executor==='finite-local-private-review-v1'&&/^private-review-[a-f0-9-]{36}$/.test(h.invocation_id||'')&&/^native_prep_[a-f0-9]{64}$/.test(h.queue_id||'')&&h.binding?.scope==='private-video'&&Number.isSafeInteger(h.version)&&h.version>=3&&Array.isArray(h.missing)&&h.missing.length===0&&refs?.length===1&&digest(refs[0].sha256)&&Number.isSafeInteger(refs[0].size_bytes)&&refs[0].size_bytes>0;
}
// Selection only. The existing consumer checks the exact receipt and media
// bytes, takes the same transfer lock and reconciles its persisted Site upload.
export function completedPrivateReturnCandidate(j:any,h:any){
 if(h?.job_id!==j?.id||!isCompletedPrivateReturnHandoff(h)||!currentApprovedText(j)||privateProductionJobExcluded(j)||j.lease_until!=null||j.lease_hash!=null||j.publication_reports?.length||j.milestones?.some((m:any)=>m.node==='video'&&m.revision===j.revision)||j.operations?.some((o:any)=>!['completed','abandoned','cancelled'].includes(o.status)))return false;
 const s=j.media_continuation?.scope,b=h.binding,ref=h.checkpoint.artifacts.find((a:any)=>a.kind==='local-file'&&a.purpose==='render-receipt'&&/\/private-review\/[a-f0-9]{64}\/producer-receipt\.json$/.test(a.file||''));
 return s?.schema==='owner-media-scope-v1'&&s.id===j.media_continuation.current_id&&s.scope==='private-video'&&s.owner_confirmed===true&&s.authorization_source==='owner-private-video'&&s.new_paid_authorization===false&&s.publication_authorization===false&&s.quality_approved===false&&s.id===b.scope_id&&['revision','mode_epoch','contract_hash'].every(k=>b[k]===j[k]&&s.binding?.[k]===j[k])&&b.script_hash===j.approved_hash&&s.binding.script_hash===j.approved_hash&&ref.file.startsWith('.sites-runtime/authorized-inputs/'+j.id+'/revision-'+j.revision+'/private-review/');
}
