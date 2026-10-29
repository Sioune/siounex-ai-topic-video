// Actual owner instruction in the existing polling conversation, 2026-10-23.
// It authorizes zero-new-fee production through the next real human review;
// it is not source/script/video approval, a payment grant or publication consent.
export const APPROVED_PRODUCTION_AUTHORIZATION='owner-approved-production-01a164fd-39d3-7971-b3f3-38d046a3fd96';
export const APPROVED_PRODUCTION_OWNER_INSTRUCTION={
 source_thread_id:'01a154dc-27ba-70d2-9609-21cb56ba838d',
 user_message_id:'01a164fd-39d3-7971-b3f3-38d046a3fd96',
 instruction:'把这些卡点统一交给V3彻底修复，尤其已审稿进入制作和换声失败自动接续。能自动恢复直接推进成片待我审核，AI崇祯继续暂停，人工节点保留，不靠手工补单个作品。',
 new_paid_authorization:false,publication_authorization:false,quality_approved:false
} as const;
export const LEGACY_APPROVED_PRODUCTION_JOB='job_d3fcbbde-fb72-46b9-a64d-e3315c0a20cf';
export const OWNER_HELD_PRODUCTION_JOBS=['job_3fc559eb-354e-48e3-a718-8a89b2e6e170','job_e13e8b19-aa0a-4840-abc9-333eefc91b05'] as const;
const hash=(v:any)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function currentApprovedText(j:any){
 if(!j||j.is_test||OWNER_HELD_PRODUCTION_JOBS.some(id=>id===j.id)||!['node','auto'].includes(j.review_mode)||j.status!=='approved'||j.error||j.revision<1||j.approved_revision!==j.revision||!hash(j.approved_hash)||!hash(j.contract_hash)||!Number.isSafeInteger(j.mode_epoch)||j.mode_epoch<0)return false;
 const d=j.drafts?.find((d:any)=>d.revision===j.revision&&d.content_hash===j.approved_hash);
 try{if(typeof d?.content!=='string'||!JSON.parse(d.content).script?.trim())return false;}catch{return false;}
 return ['source','script'].every(node=>{const m=j.milestones?.filter((m:any)=>m.node===node&&m.revision===j.revision).sort((a:any,b:any)=>b.artifact_version-a.artifact_version)[0];return m?.status==='approved'&&m.mode_epoch===j.mode_epoch&&m.artifact_hash===j.approved_hash;});
}
// Admission of a new current-script production, never reopening an old video.
export function approvedScriptProductionCandidate(j:any){return currentApprovedText(j)&&j.lease_until==null&&j.lease_hash==null&&!j.publication_reports?.length&&!j.facts?.candidate_present&&!j.milestones?.some((m:any)=>m.node==='video'&&m.revision===j.revision);}
// Persisted scope provenance remains readable after the real video is returned.
// Each writer still checks its own current state, leases and exact file binding.
export function currentApprovedProductionScope(j:any){
 const s=j?.media_continuation?.scope,b=s?.binding;
 return !!s&&!j.is_test&&['node','auto'].includes(j.review_mode)&&!OWNER_HELD_PRODUCTION_JOBS.some(id=>id===j.id)&&Number.isSafeInteger(j.revision)&&j.revision>0&&Number.isSafeInteger(j.mode_epoch)&&j.mode_epoch>=0&&hash(j.approved_hash)&&hash(j.contract_hash)&&s.schema==='owner-media-scope-v1'&&typeof s.id==='string'&&!!s.id&&s.id===j.media_continuation.current_id&&s.scope==='private-video'&&s.owner_confirmed===true&&s.authorization_source==='owner-private-video'&&s.authorization_reference===APPROVED_PRODUCTION_AUTHORIZATION&&s.new_paid_authorization===false&&s.publication_authorization===false&&s.quality_approved===false&&j.approved_revision===j.revision&&b?.revision===j.revision&&b.script_hash===j.approved_hash&&b.mode_epoch===j.mode_epoch&&b.contract_hash===j.contract_hash;
}
export function legacyApprovedProductionCandidate(j:any){return j?.id===LEGACY_APPROVED_PRODUCTION_JOB&&approvedScriptProductionCandidate(j);}
export function legacyCurrentProductionAuthorized(j:any){return j?.id===LEGACY_APPROVED_PRODUCTION_JOB&&currentApprovedProductionScope(j);}
export function privateProductionJobExcluded(j:any){return !j||OWNER_HELD_PRODUCTION_JOBS.some(id=>id===j.id)||j.id===LEGACY_APPROVED_PRODUCTION_JOB&&!legacyCurrentProductionAuthorized(j);}
