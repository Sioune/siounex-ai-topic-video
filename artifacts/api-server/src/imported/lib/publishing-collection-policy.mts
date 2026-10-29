/** Next-day and following-day collection is best effort; observed_at always remains the actual time. */
export function collectionTimingMetadata(dueAt:string,observedAt:string|null){
 const due=Date.parse(dueAt),observed=observedAt?Date.parse(observedAt):NaN,delay=Number.isFinite(due)&&Number.isFinite(observed)?(observed-due)/3600000:null;
 return {collection_policy:'next-day-following-day-best-effort' as const,observed_at:observedAt,delay_hours:delay,late:delay!==null&&delay>2,strict_target_comparable:delay!==null&&Math.abs(delay)<=2};
}
/** Delays are recorded, never discarded or backdated. An observation before its due time is not a due collection. */
export function validDelayedObservation(dueAt:string,observedAt:string,now:string){
 const due=Date.parse(dueAt),observed=Date.parse(observedAt),clock=Date.parse(now);
 return Number.isFinite(due)&&Number.isFinite(observed)&&Number.isFinite(clock)&&observed>=due&&observed<=clock+60000;
}
