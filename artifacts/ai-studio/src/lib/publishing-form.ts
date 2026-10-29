import {ProductionError} from './production-contract';
import {PublishingPreflightError,validatePublishingPreflight,type PublishingPreflightExpected,type PublishingPreflightObservation} from './publishing-preflight.mts';
import type {PublishingDispatch} from './publishing-contract.mts';
import {readPublishingDispatchMaterials} from './publishing';

/** These are editorial decisions, not invented platform control labels. The executor records the actual labels separately. */
export async function validateCurrentPublishingForm(owner:string,input:PublishingDispatch,observed:unknown){
 if(!observed||typeof observed!=='object'||Array.isArray(observed))throw new ProductionError('缺少当前平台完整表单回读；不能只核对视频文件后发布',409);
 const observation=observed as PublishingPreflightObservation,packet=await readPublishingDispatchMaterials(owner,input),policy=packet.option_policy;
 const mandatory=new Set(['visibility','publish_mode',...(input.platform==='bilibili'?['category','ai_disclosure']:input.platform==='douyin'?['ai_disclosure']:[])]);
 const options=Object.fromEntries(Object.entries(policy).map(([key,value])=>[key,!mandatory.has(key)&&observation.options?.[key as keyof typeof policy]?.status==='not_present'?null:value])) as PublishingPreflightExpected['options'];
 const expected:PublishingPreflightExpected={platform:input.platform,account_id:input.account_id,video_sha256:input.binding.video_sha256,materials_hash:packet.materials_hash,title:packet.copy.title,description:packet.copy.description,tags:packet.copy.tags,covers:packet.covers.map(c=>({role:c.role as 'cover_3_4'|'cover_4_3',archive_id:c.site_archive_id,sha256:c.sha256})),...('cover_adaptations' in packet?{cover_adaptations:packet.cover_adaptations}:{}),options,...(packet.collection_policy?{collection_policy:packet.collection_policy}:{})};
 try{
  const proof=await validatePublishingPreflight(expected,observed);
  return proof;
 }catch(e){if(e instanceof PublishingPreflightError)throw new ProductionError('提交前核验未通过：'+e.message,409);throw e;}
}
