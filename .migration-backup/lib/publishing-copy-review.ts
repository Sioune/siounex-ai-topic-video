import {v6OutroSourceBinding} from './outro-upgrade-contract.mts';
import {db} from './store';
import {hash,ProductionError,text} from './production-contract';
import type {PublishingBinding,PublishingPlatform,PublishingReserve} from './publishing-contract.mts';
import seeds from '../production/platform-promotion-drafts.json';
import {resolvePublishingCopy,type PublishingCopyPlatform} from './publishing-copy.mts';
import {coverBrandingSourceBinding} from './cover-branding.mts';

export type PlatformCopy={title:string;description:string;tags:string[];approach:string};
export const PLATFORM_COPY_OPTIONS={category:'technology-ai',originality:'self-produced-commentary',ai_disclosure:'ai-generated',visibility:'public',publish_mode:'immediate',download:'disabled',sync:'disabled'} as const;
export type PlatformCopyReview={job_id:string;title:string;copy_hash:string;binding_hash:string;strategy_version:string;platforms:Record<string,PlatformCopy>;option_policy:typeof PLATFORM_COPY_OPTIONS;originality_decision:'self-produced-commentary'|'repost'|null;status:'awaiting_review'|'approved'|'revise'|'source_changed';reason:string;reviewed_at:string|null};
const key=(owner:string,id:string)=>'publishing_platform_copy_review_v1:'+owner+':'+id;
export async function platformCopyReview(owner:string,binding:PublishingBinding,title='',sourceText?:string):Promise<PlatformCopyReview|null>{
 const promotion=binding.materials.find(m=>m.role==='promotion');let seed=seeds.drafts.find(d=>d.job_id===binding.job_id);
 if((!seed||seed.source_promotion_sha256!==promotion?.sha256)&&sourceText&&promotion){const entries=(['douyin','wechat_channels','bilibili','kuaishou','xiaohongshu'] as PublishingCopyPlatform[]).map(p=>[p,resolvePublishingCopy(sourceText,p)] as const);if(entries.every(([,c])=>c.ok)){const copies=entries.map(([p,c])=>[p,c.ok?{title:c.title,description:c.description,tags:c.tags,approach:'本平台专段来自当前已审核宣发，按五平台写作规范分别组织；编辑依据保留在原宣发材料中。'}:null] as const);if(new Set(copies.map(([,c])=>c!.title)).size===5&&new Set(copies.map(([,c])=>c!.description)).size===5)seed={job_id:binding.job_id,source_promotion_sha256:promotion.sha256,platforms:Object.fromEntries(copies)} as typeof seed;}}
 if(!seed)return null;
 const bindingHash=await hash(JSON.stringify(binding));
 const payload={schema:seeds.schema,strategy_version:seeds.strategy_version,job_id:binding.job_id,binding_hash:bindingHash,source_promotion_sha256:seed.source_promotion_sha256,platforms:seed.platforms,option_policy:PLATFORM_COPY_OPTIONS},copyHash=await hash(JSON.stringify(payload));
 const stored=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key(owner,binding.job_id)).first<{value:string}>(),saved=stored?JSON.parse(stored.value):null,current=promotion?.sha256===seed.source_promotion_sha256;
 const beforeOutro=v6OutroSourceBinding(binding),sourceBinding=coverBrandingSourceBinding(beforeOutro||binding)||beforeOutro,sourceHash=sourceBinding?await hash(JSON.stringify(sourceBinding)):null,sourceCopyHash=sourceHash?await hash(JSON.stringify({...payload,binding_hash:sourceHash})):null;
 const oldOptions={...PLATFORM_COPY_OPTIONS,originality:'owner-selection-required'},legacyCopyHash=await hash(JSON.stringify({...payload,option_policy:oldOptions})),legacySourceCopyHash=sourceHash?await hash(JSON.stringify({...payload,binding_hash:sourceHash,option_policy:oldOptions})):null;
 // Removing a second approval must not erase an actual owner's previous revision request.
 if(saved&&(saved.binding_hash===bindingHash&&saved.copy_hash===legacyCopyHash||saved.binding_hash===sourceHash&&saved.copy_hash===legacySourceCopyHash||saved.copy_hash!==copyHash&&sourceCopyHash===saved.copy_hash&&sourceHash===saved.binding_hash)){saved.copy_hash=copyHash;saved.binding_hash=bindingHash;}
 return{job_id:binding.job_id,title,copy_hash:copyHash,binding_hash:bindingHash,strategy_version:seeds.strategy_version,platforms:seed.platforms,option_policy:PLATFORM_COPY_OPTIONS,originality_decision:saved?.copy_hash===copyHash?saved.originality||null:null,status:!current?'source_changed':saved?.copy_hash===copyHash?saved.status:'awaiting_review',reason:!current?'当前正式宣发来源已改变，需基于新版重新写平台专稿':saved?.copy_hash===copyHash?saved.reason||'':'平台文案随成片使用，无需另行审批；可随时提交修改意见',reviewed_at:saved?.copy_hash===copyHash?saved.reviewed_at:null};
}
export async function platformCopyReviews(owner:string,reserves:PublishingReserve[]){const rows=await Promise.all(reserves.filter(r=>['ready','reserved'].includes(r.status)).map(r=>platformCopyReview(owner,r.binding,r.title)));return rows.filter((r):r is PlatformCopyReview=>!!r);}
export async function decidePlatformCopy(owner:string,binding:PublishingBinding,b:Record<string,unknown>,sourceText?:string){
 const existing=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key(owner,binding.job_id)).first<{value:string}>();
 const current=await platformCopyReview(owner,binding,'',sourceText);if(!current||current.status==='source_changed'||current.copy_hash!==b.copy_hash)throw new ProductionError('平台稿或绑定已变化，请刷新后审核',409);
 if(typeof b.decision!=='string'||!['approve','revise'].includes(b.decision))throw new ProductionError('平台稿审核决定无效',400);
 if(b.decision==='approve'&&current.status!=='awaiting_review')throw new ProductionError('本版已有审核决定，不能覆盖；修改后须形成新稿',409);
 
 const decision=b.decision,status=decision==='approve'?'approved':'revise',reason=decision==='revise'?text(b.reason,4000):'',at=new Date().toISOString();
 const value=JSON.stringify({schema:'publishing-platform-copy-review-v1',copy_hash:current.copy_hash,binding_hash:current.binding_hash,status,reason,originality:decision==='approve'?(b.originality||'self-produced-commentary'):null,previous_decision:existing?JSON.parse(existing.value):null,reviewer:owner,reviewed_at:at});
 const result=await db().prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE app_state.value=?').bind(key(owner,binding.job_id),value,existing?.value||'').run();if(!result.meta.changes)throw new ProductionError('审核已并发变化，请刷新',409);
 return platformCopyReview(owner,binding,'',sourceText);
}
export async function approvedPlatformCopy(owner:string,binding:PublishingBinding,platform:PublishingPlatform,sourceText?:string){
 const review=await platformCopyReview(owner,binding,'',sourceText);
 if(!review)return null;
 if(['revise','source_changed'].includes(review.status))throw new ProductionError(review.reason||'平台专稿尚未通过本人审核',409);
 const copy=review.platforms[platform];if(!copy)throw new ProductionError('缺少对应平台专稿，禁止用其他平台或通用文案替代',409);

 return{...copy,copy_hash:review.copy_hash,strategy_version:review.strategy_version,selection:'platform-specific' as const,reviewed_at:review.reviewed_at,option_policy:{...review.option_policy,originality:review.originality_decision||'self-produced-commentary'}};
}
