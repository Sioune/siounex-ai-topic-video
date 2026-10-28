import type {EmptySlotMakeupGrant} from './publishing-contract.mts';

// These are separately recorded owner instructions, never a recurring permission
// to fill a missed slot. Times use the real clock at the service boundary.
export const EMPTY_SLOT_MAKEUP_POLICIES=[
 {scheduled_at:'2026-10-22T10:00:00.000Z',last_start:'2026-10-22T15:00:00.000Z',target_at:null,end:null,job_id:null,release_id:null,instruction:'片仓已有库存，现在开始启动本来应该今晚18点的发布'},
 {scheduled_at:'2026-10-23T10:00:00.000Z',last_start:'2026-10-23T12:05:00.000Z',target_at:'2026-10-23T12:00:00.000Z',end:'2026-10-23T12:05:00.000Z',job_id:'job_b98cdfdf-7c37-438c-890c-3463bd42d7ed',release_id:'pr_47e4c78f8070a17fb8989e8e19565d9d2df1f0dc54a27cb9494c0de6ef760ac7',instruction:'2026-10-23黄仁勋人工审核通过后20:00补发'},
] as const;
export const emptyMakeupPolicy=(scheduled:string)=>EMPTY_SLOT_MAKEUP_POLICIES.find(p=>p.scheduled_at===scheduled);
export const emptyMakeupSubmissionStart=(g:EmptySlotMakeupGrant)=>g.submission_starts_at||g.created_at;
export function emptyMakeupRequestMatches(scheduled:string,reference:string,b:Record<string,unknown>){
 const p=emptyMakeupPolicy(scheduled);if(!p||!reference.includes(p.instruction))return false;
 return p.target_at?b.target_at===p.target_at&&b.job_id===p.job_id&&b.release_id===p.release_id:b.target_at===undefined&&b.job_id===undefined&&b.release_id===undefined;
}
export function emptyMakeupGrantTimingValid(g:EmptySlotMakeupGrant){
 const p=emptyMakeupPolicy(g.scheduled_at),created=Date.parse(g.created_at);if(!p||!Number.isFinite(created)||created<Date.parse(g.original_submission_window.end)||created>=Date.parse(p.last_start)||!g.authorization_reference.includes(p.instruction))return false;
 return p.target_at?g.submission_starts_at===p.target_at&&g.expires_at===p.end&&g.job_id===p.job_id&&g.release_id===p.release_id:g.submission_starts_at===undefined&&Date.parse(g.expires_at)===created+3600000;
}
