/** Pure checks of an executor's actual creator-form readback. No browser, database or media IO. */
import type {CoverAdaptation} from './publishing-cover-adaptation.mts';
export type PublishingPreflightPlatform='douyin'|'wechat_channels'|'bilibili'|'kuaishou';
export type PublishingPreflightCoverRole='cover_3_4'|'cover_4_3';
export const PUBLISHING_PREFLIGHT_OPTION_KEYS=['category','originality','ai_disclosure','visibility','publish_mode','download','sync'] as const;
export type PublishingPreflightOption=typeof PUBLISHING_PREFLIGHT_OPTION_KEYS[number];
export type PublishingPreflightExpected={
 platform:PublishingPreflightPlatform;account_id:string;video_sha256:string;materials_hash:string;
 title:string;description:string;tags:string[];
 covers:{role:PublishingPreflightCoverRole;archive_id:string;sha256:string}[];
 cover_adaptations?:CoverAdaptation[];
 options:Record<PublishingPreflightOption,string|null>&{visibility:'public';publish_mode:'immediate'};
 collection_policy?:{target_name:string;if_available:true};
};
export type PublishingPreflightCollection={control_present:boolean;target_available:boolean;selected_name:string|null;selected_id?:string;evidence_note:string};
export type PublishingPreflightControl={label:string;status:'selected'|'not_present';value:string|null;evidence_note:string};
export type PublishingPreflightCoverSlot={
 slot:string;label:string;required:boolean;status:'selected'|'not_present';
 expected_ratio:string|null;source_ratio:string|null;actual_ratio:string|null;
 role:PublishingPreflightCoverRole|null;archive_id:string|null;sha256:string|null;
 crop_confirmed:boolean;preview_confirmed:boolean;safe_area_confirmed:boolean;evidence_note:string;
};
export type PublishingPreflightObservation={
 platform:PublishingPreflightPlatform;account_id:string;video_sha256:string;materials_hash:string;
 title:string;description:string;
 tags:{mode:'platform-tag-controls';selected:{label:string;platform_tag_id?:string}[];evidence_note:string};
 cover_inventory_complete:true;required_cover_slots:string[];covers:PublishingPreflightCoverSlot[];
 options:Record<PublishingPreflightOption,PublishingPreflightControl>;
 required_unknown_controls:string[];observed_at:string;evidence_url:string;evidence_note:string;
 collection?:PublishingPreflightCollection;
};
export type PublishingPreflightProof={
 schema:'publishing-preflight-proof-v1';version:1;digest:string;validated_at:string;
 expected_digest:string;observation:PublishingPreflightObservation;
};
export class PublishingPreflightError extends Error{
 readonly status=409;
 readonly code='PUBLISHING_PREFLIGHT_REJECTED';
 constructor(readonly issues:{path:string;message:string}[]){super(issues.map(i=>i.path+': '+i.message).join('; '));this.name='PublishingPreflightError';}
}
type Obj=Record<string,unknown>;
function check(value:unknown,path:string,message:string):asserts value{if(!value)throw new PublishingPreflightError([{path,message}]);}

/** Canonical JSON for the expected packet and proof; undefined/non-JSON values never disappear silently. */
export function canonicalPublishingPreflight(value:unknown):string{
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){check(Number.isFinite(value),'digest','不能包含非有限数字');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map(canonicalPublishingPreflight).join(',')+']';
 check(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),'digest','仅支持JSON数据');
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalPublishingPreflight((value as Obj)[k])).join(',')+'}';
}
export async function publishingPreflightDigest(value:unknown):Promise<string>{const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalPublishingPreflight(value)));return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');}

/** Re-run with the current expected packet and real clock immediately before submitting. */
/** Optional operation record, not an authorization or mandatory full-form revalidation. */
export async function validatePublishingPreflight(expected:PublishingPreflightExpected,observed:unknown,now:string|Date=new Date()):Promise<PublishingPreflightProof>{
 const o=observed as PublishingPreflightObservation;
 check(o&&typeof o==='object','observation','操作记录须为对象');
 for(const k of ['platform','account_id','video_sha256'] as const)if(o[k]!==undefined)check(o[k]===expected[k],'observation.'+k,'作品或账号不一致');
 const validated=now instanceof Date?now.toISOString():now;
 const observation=structuredClone(o),payload={schema:'publishing-preflight-proof-v1' as const,version:1 as const,validated_at:validated,expected_digest:await publishingPreflightDigest(expected),observation};
 return {...payload,digest:await publishingPreflightDigest(payload)};
}
