import {ProductionError} from './production-contract';
import type {PublishedAtPrecision,PublishedAtMetadata,CollectionTimeMetadata} from './publishing-contract.mts';

export function publishedAtPrecision(value:unknown):PublishedAtPrecision{
 if(value===undefined||value===null)return 'second';
 if(value!=='minute'&&value!=='second')throw new ProductionError('平台发布时间精度仅支持minute或second',400);
 return value;
}
/** A minute value is an interval anchor, never a claim that the platform published at second 00. */
export function parsePublishedAt(value:unknown,precision?:unknown){
 const p=publishedAtPrecision(precision),pattern=p==='minute'?/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::00(?:\.0{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
 if(typeof value!=='string'||!pattern.test(value)||!Number.isFinite(Date.parse(value)))throw new ProductionError(p==='minute'?'分钟精度须提供带时区分钟或该分钟起点，不能填未知的非零秒':'秒精度须提供带时区且包含真实秒的时间；未知秒请明确minute',400);
 const at=new Date(value).toISOString(),uncertainty=p==='minute'?59 as const:0 as const;
 return {published_at:at,published_at_precision:p,published_at_range_start:at,published_at_range_end:new Date(Date.parse(at)+uncertainty*1000).toISOString(),published_at_uncertainty_seconds:uncertainty};
}
export function publishedAtMetadata(value:string|null,precision?:unknown):PublishedAtMetadata{
 if(!value)return {published_at_precision:null,published_at_range_start:null,published_at_range_end:null,published_at_uncertainty_seconds:null};
 const {published_at,...metadata}=parsePublishedAt(value,precision);void published_at;return metadata;
}
export function collectionTimeMetadata(dueAt:string,precision?:unknown,targetHours:24|48|null=24):CollectionTimeMetadata{
 const p=publishedAtPrecision(precision),uncertainty=p==='minute'?59 as const:0 as const;
 return {anchor_published_at_precision:p,anchor_uncertainty_seconds:uncertainty,due_at_range_end:targetHours===null?null:new Date(Date.parse(dueAt)+uncertainty*1000).toISOString()};
}
