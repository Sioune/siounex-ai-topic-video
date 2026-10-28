// Existing Windows task checks every three minutes with IgnoreNew. Admission
// limits new work; a busy invocation and its owned work finish naturally.
export const SCHEDULE_INTERVAL_MS=180000;
export const SCHEDULE_MULTIPLE_INSTANCES='IgnoreNew';
// Legacy aggregate export only. It is not a production completion deadline.
export const TOTAL_RUN_BUDGET_MS=840000;
export const CREDENTIAL_ATTEMPT_BUDGET_MS=120000;
export const ADMISSION_BUDGET_MS=600000;
export const BUSINESS_BUDGET_MS=ADMISSION_BUDGET_MS;
export function scheduledWorkerBudget(startedAt=Date.now()){
 if(!Number.isSafeInteger(startedAt)||startedAt<1)throw Error('Invalid scheduled run start');
 const phaseTime=now=>{if(!Number.isSafeInteger(now)||now<startedAt)throw Error('Invalid scheduled phase time');return now;},admissionDeadline=(now=Date.now())=>phaseTime(now)+ADMISSION_BUDGET_MS;
 return Object.freeze({started_at_ms:startedAt,completion_policy:'natural',schedule_interval_ms:SCHEDULE_INTERVAL_MS,multiple_instances:SCHEDULE_MULTIPLE_INSTANCES,credentialDeadline:(now=Date.now())=>phaseTime(now)+CREDENTIAL_ATTEMPT_BUDGET_MS,admissionDeadline,businessDeadline:admissionDeadline,requestTimeout:(now=Date.now())=>{phaseTime(now);return 30000;}});
}
