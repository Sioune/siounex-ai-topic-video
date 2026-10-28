export type TemplateTimeSlot='08:00'|'18:00';
export type TemplatePublishingSlot={schema:'template-publishing-slot-v1';timezone:'Asia/Shanghai';time:TemplateTimeSlot;planned_at?:string;selection_sequence?:number;policy:'morning-light-evening-dark-v1'};
const offset=8*3600000;
export function nextTemplatePublishingSlot(now:string,after?:string,time?:TemplateTimeSlot):TemplatePublishingSlot & {planned_at:string}{
 const start=Math.max(Date.parse(now),after?Date.parse(after):-Infinity);
 if(!Number.isFinite(start))throw Error('TEMPLATE_SLOT_TIME_INVALID');
 const local=new Date(start+offset),day=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate());
 for(let d=0;d<3;d++)for(const hour of [8,18]){const at=day+d*86400000+hour*3600000-offset,slot=hour===8?'08:00':'18:00';if(at>start&&(!time||time===slot))return {schema:'template-publishing-slot-v1',timezone:'Asia/Shanghai',time:slot,planned_at:new Date(at).toISOString(),policy:'morning-light-evening-dark-v1'};}
 throw Error('TEMPLATE_SLOT_UNAVAILABLE');
}
export function templateSlotMatches(slot:TemplatePublishingSlot|undefined,scheduled:string){
 if(!slot)return true; // Frozen historical packages keep their original identity.
 const date=new Date(Date.parse(scheduled)+offset),time=String(date.getUTCHours()).padStart(2,'0')+':'+String(date.getUTCMinutes()).padStart(2,'0');
 return slot.schema==='template-publishing-slot-v1'&&slot.timezone==='Asia/Shanghai'&&slot.policy==='morning-light-evening-dark-v1'&&Number.isFinite(date.getTime())&&slot.time===time;
}
