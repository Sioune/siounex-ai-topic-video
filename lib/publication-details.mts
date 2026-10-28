export type PublishedAsset={library_file_id:string;file_id:string;version:number;sha256:string;file_name:string;size_bytes:number};
export type ReportedPublication={schema:'reported-publication-v1';time_source:'self_reported';precision:'approximate';display_time:string;timestamp_role:'ordering_anchor_only';video:PublishedAsset;independent_platform_verification:false;external_platform_id:null;source_note:string};
export type NativePublicationObservation={range_start:string;range_end:string;evidence_note:string};
export const MAX_NATIVE_PUBLICATION_RANGE_MS=24*3600000;
export const NATIVE_COLLECTION_ANCHOR_NOTE='按原生成功观察区间上界安排 T+24 / T+48；官方精确发布时间未知。';
export type ClickedPublication={schema:'owner-click-publication-v1';time_source:'owner_click'|'owner_entered'|'native_observation';precision:'registration_time'|'owner_entered'|'observed_interval';display_time:string;timestamp_role:'collection_anchor';platform:import('./publication-collection-contract.mts').PublicationPlatform;platform_url:string|null;video:{storage:'site-private-r2';site_archive_id:string;sha256:string;file_name:string;size_bytes:number;script_revision:number;script_hash:string};independent_platform_verification:false;source_note:string;request_id:string;native_observation?:NativePublicationObservation;exact_platform_published_at?:null;collection_anchor_rule?:'observation_range_end'};

/** Retain supplied fractional seconds in evidence; Date milliseconds are only used for ordering/collection. */
export function parseNativePublicationObservation(value:unknown,clock=Date.now()):NativePublicationObservation|null{
 if(value===undefined||value===null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw Error('原生观察区间格式无效');
 const input=value as Record<string,unknown>,read=(field:'range_start'|'range_end')=>{
  const raw=input[field];
  if(typeof raw!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(raw)||!Number.isFinite(Date.parse(raw)))throw Error('原生观察起止时间须完整填写并带时区');
  const calendar=raw.slice(0,10),year=Number(calendar.slice(0,4)),month=Number(calendar.slice(5,7)),day=Number(calendar.slice(8,10));
  if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())throw Error('原生观察时间日期无效');
  return raw;
 },start=read('range_start'),end=read('range_end');
 const nanos=(raw:string)=>BigInt(Date.parse(raw))*BigInt(1000000)+BigInt((raw.match(/\.(\d+)/)?.[1]||'').padEnd(9,'0').slice(3)),startNs=nanos(start),endNs=nanos(end);
 if(endNs<startNs)throw Error('原生观察区间结束不能早于开始');
 if(endNs-startNs>BigInt(MAX_NATIVE_PUBLICATION_RANGE_MS)*BigInt(1000000))throw Error('原生观察区间不能超过24小时');
 if(Number.isFinite(clock)&&(endNs>BigInt(clock)*BigInt(1000000)||startNs>BigInt(clock)*BigInt(1000000)))throw Error('原生观察区间不能填写未来时间');
 if(typeof input.evidence_note!=='string'||!input.evidence_note.trim()||input.evidence_note.length>2000)throw Error('请填写2000字以内的原生成功观察证据说明');
 return {range_start:start,range_end:end,evidence_note:input.evidence_note.trim()};
}
export function clickedPublicationDetails(source:unknown):ClickedPublication|null{try{
 const x=JSON.parse(String(source));
 if(x.schema!=='owner-click-publication-v1'||!['owner_click','owner_entered','native_observation'].includes(x.time_source)||typeof x.display_time!=='string'||!['unspecified','wechat_channels','douyin','xiaohongshu','bilibili','kuaishou','other'].includes(x.platform)||x.video?.storage!=='site-private-r2'||typeof x.video.site_archive_id!=='string'||typeof x.video.sha256!=='string')return null;
 if(x.time_source==='native_observation'&&(x.precision!=='observed_interval'||x.independent_platform_verification!==false||x.exact_platform_published_at!==null||x.collection_anchor_rule!=='observation_range_end'||!parseNativePublicationObservation(x.native_observation,Infinity)))return null;
 return x;
}catch{return null}}
/** Round an observed micro/nanosecond upper bound up, never earlier, for millisecond storage. */
export function nativePublicationAnchor(interval:NativePublicationObservation):string{
 const fraction=interval.range_end.match(/\.(\d+)/)?.[1]||'',roundUp=/[1-9]/.test(fraction.slice(3));
 return new Date(Date.parse(interval.range_end)+(roundUp?1:0)).toISOString();
}
/** A copied source on a timestamp correction must not lend its old interval to the new anchor. */
export function nativePublicationInterval(source:unknown,publishedAt?:string|null):NativePublicationObservation|null{
 const details=clickedPublicationDetails(source),interval=details?.time_source==='native_observation'?details.native_observation:null;
 if(!interval)return null;
 if(publishedAt!==undefined&&(!publishedAt||Date.parse(publishedAt)!==Date.parse(nativePublicationAnchor(interval))))return null;
 return interval;
}
function beijing(value:string,seconds=false){return new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:seconds?'medium':'short',timeZone:'Asia/Shanghai',hour12:false}).format(new Date(value));}
export function publicationTimeDescription(publishedAt:string|null,source:unknown):string{
 const interval=nativePublicationInterval(source,publishedAt);
 if(interval)return '原生成功观察区间：'+beijing(interval.range_start,true)+' — '+beijing(interval.range_end,true)+'（北京；官方精确发布时间未知；区间上界仅作采集锚点）';
 if(clickedPublicationDetails(source)?.time_source==='native_observation')return '当前采集锚点 '+(publishedAt?beijing(publishedAt):'未知')+'（已更正；原观察区间不适用于此锚点，官方精确发布时间未知）';
 return '发布时间 '+(publishedAt?beijing(publishedAt):'未知');
}
export function publicationDetails(source:unknown):ReportedPublication|null{try{const x=JSON.parse(String(source));return x.schema==='reported-publication-v1'?x:null}catch{return null}}
export function publicationLabel(source:unknown,publishedAt?:string|null){
 const c=clickedPublicationDetails(source),interval=nativePublicationInterval(source,publishedAt);
 if(interval)return '本人登记原生发布成功：'+beijing(interval.range_start,true)+' — '+beijing(interval.range_end,true)+'（北京；'+NATIVE_COLLECTION_ANCHOR_NOTE+'未独立核验平台。）证据：'+interval.evidence_note;
 if(c?.time_source==='native_observation')return '原生发布观察证据保留；当前采集锚点已更正，原观察区间不能当作新版发布时间。官方精确发布时间未知。';
 if(c)return '本人登记已发布：'+c.display_time+'（'+(c.time_source==='owner_click'?'默认采用站内登记时间':'本人填写发布时间')+'，未独立核验平台；作为数据采集时间锚点）';
 const p=publicationDetails(source);return p?'本人自报：'+p.display_time+'（约时，未独立核验平台；时间戳只作排序锚点）':String(source||'');
}
