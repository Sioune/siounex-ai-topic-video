// A queue-selection hint only. The local continuation still verifies the
// original process exit, bound event, unchanged narration and zero output tree.
export function isPreproductionNarrationCandidate(h:any):boolean{
 return h?.status==='blocked'&&h.lease_until===null&&h.binding?.scope==='private-video'&&/^native_prep_[a-f0-9]{64}$/.test(h.queue_id||'')&&h.executor==='finite-local-private-review-v1'&&/^private-review-[a-f0-9-]{36}$/.test(h.invocation_id||'')&&Number.isSafeInteger(h.version)&&h.version>=3&&!h.base_video&&!h.base_pending_video&&Array.isArray(h.missing)&&h.missing.length===1&&h.missing[0].code==='local-production:PRIVATE_STORYBOARD_SCRIPT_MISMATCH'&&String(h.missing[0].detail).includes('ordinary-audio-and-editable-project')&&Array.isArray(h.checkpoint?.artifacts)&&h.checkpoint.artifacts.every((a:any)=>a.kind==='local-file'&&['source-media','timeline'].includes(a.purpose));
}
