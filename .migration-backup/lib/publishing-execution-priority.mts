/** Background operations yield to the two existing daily publication windows. */
export const PUBLISHING_BACKGROUND_ACTIONS=new Set(['run_collection_tick','sync_reserve','apply_cover_branding','reconcile_publications','read_engagement','claim_engagement']);
export function publishingExecutionWindow(at:string){
 const now=Date.parse(at);if(!Number.isFinite(now))return null;
 const localDay=new Date(now+8*3600000).toISOString().slice(0,10);
 for(const hour of [8,18]){
  const slot=Date.parse(localDay+'T'+String(hour).padStart(2,'0')+':00:00+08:00');
  if(now>=slot-10*60000&&now<slot+5*60000)return {scheduled_at:new Date(slot).toISOString(),resume_background_at:new Date(slot+5*60000).toISOString(),phase:now<slot?'prepare_to_submit':'submit_now'};
 }
 return null;
}
