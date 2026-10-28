// A selection hint only. Local recovery still proves every retained byte,
// the original invocation's completion and the exact renderer fix.
export function isTitleRuntimeRecoveryCandidate(h:any){
 return h?.status==='blocked'&&h.lease_until===null&&h.binding?.scope==='private-video'&&/^native_prep_[a-f0-9]{64}$/.test(h.queue_id||'')&&h.executor==='finite-local-private-review-v1'&&/^private-review-[a-f0-9-]{36}$/.test(h.invocation_id||'')&&Number.isSafeInteger(h.version)&&h.version>=3&&!h.base_video&&!h.base_pending_video&&Array.isArray(h.missing)&&h.missing.length===1&&String(h.missing[0].code||'').startsWith('local-production:')&&String(h.missing[0].detail||'').includes('ordinary-audio-and-editable-project')&&String(h.missing[0].detail||'').includes('TITLE_CANNOT_FIT_WITHOUT_TEXT_CHANGE');
}
