/** A prepared draft is checked before its slot; the executor keeps this one-use intent in memory. */
export const PUBLISHING_ARM_LEAD_MS=15*60*1000;
export type PreparedSubmissionPermit={
 schema:'prepared-submission-permit-v1';work_id:string;preparation_id:string;package_id:string;
 account_id:string;video_sha256:string;draft_locator:string;issued_at:string;
 not_before:string;expires_at:string;once_only:true;
};
/** Scheduling is a lower bound, never an expiring authorization. Legacy end is metadata only. */
export function preparedSubmissionWindow(window:{start:string;end:string},at:string){
 const start=Date.parse(window.start);
 if(!Number.isFinite(start))throw Error('发布时间无效');
 return {not_before:new Date(start).toISOString(),expires_at:'9999-12-31T23:59:59.999Z'};
}
export function preparedPermitAllowsClick(permit:PreparedSubmissionPermit,at:string){
 const now=Date.parse(at);
 return permit.schema==='prepared-submission-permit-v1'&&permit.once_only===true&&Number.isFinite(now)&&now>=Date.parse(permit.not_before);
}
