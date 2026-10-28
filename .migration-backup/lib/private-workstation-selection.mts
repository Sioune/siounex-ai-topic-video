// Read-only queue hint. The local consumer must verify the immutable wait
// proof, complete output tree and current binding before it may resume.
export function isWorkstationWaitCandidate(h:any):boolean{
 if(h?.status!=='blocked'||h.lease_until!==null||h.binding?.scope!=='private-video'||!/^native_prep_[a-f0-9]{64}$/.test(h.queue_id||'')||h.executor!=='finite-local-private-review-v1'||!/^private-review-[a-f0-9-]{36}$/.test(h.invocation_id||'')||!Number.isSafeInteger(h.version)||h.version<3||!Array.isArray(h.missing)||h.missing.length!==1||h.missing[0]?.code!=='production-station-budget-deferred'||!Array.isArray(h.checkpoint?.artifacts))return false;
 const hashes=[...String(h.missing[0].detail||'').matchAll(/current_wait_sha256=([a-f0-9]{64})(?![a-f0-9])/g)];if(hashes.length!==1)return false;const current=hashes[0][1];
 return h.checkpoint.artifacts.filter((a:any)=>a?.kind==='local-file'&&a.purpose==='render-receipt'&&typeof a.file==='string'&&a.file.endsWith('/workstation-wait-'+current+'.json')&&a.sha256===current&&Number.isSafeInteger(a.size_bytes)&&a.size_bytes>0).length===1;
}
