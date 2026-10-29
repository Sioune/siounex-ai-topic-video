type Segment={asset_id?:unknown;narration?:unknown;visual?:unknown;sound?:unknown;start?:unknown;end?:unknown;role?:unknown};
export const STORYBOARD_SEGMENTS_VERSION='fixed-outro-body-separation-v3';
/** Retain the historical reserved ID; recognize the equivalent saved silent tail. */
export function isFixedOutroSegment(segment:Segment,index:number,allSegments:Segment[]):boolean{
 if(segment?.asset_id==='existing_outro_4s')return true;
 // This reserved role describes the already supplied v5 tail, not another
 // empty body scene. Actual media still binds the pinned 119-frame original.
 if(['existing_v5_outro','existing_v5_outro_119f','existing_v6_outro','existing_v6_outro_119f'].includes(String(segment?.asset_id))){
  if(index!==allSegments.length-1||index<1||typeof segment.narration!=='string'||segment.narration.trim()||typeof segment.visual!=='string'||typeof segment.sound!=='string')return false;
  const start=Number(segment.start),end=Number(segment.end),previousEnd=Number(allSegments[index-1]?.end),speeds=[...segment.visual.matchAll(/(\d+(?:\.\d+)?)\s*[×xX倍]/gu)];
  return Number.isFinite(start)&&Number.isFinite(end)&&Number.isFinite(previousEnd)&&start>0&&end<=60&&Math.abs(end-start-119/30)<=.01&&Math.abs(previousEnd-start)<.001&&/(?:沿用|复用|保留|既有|固定).{0,16}v[56].{0,16}片尾|(?:沿用|复用|保留|既有|固定).{0,16}片尾.{0,16}v[56]/iu.test(segment.visual)&&/119\s*帧/u.test(segment.visual)&&/原速/u.test(segment.visual)&&speeds.every(m=>Number(m[1])===1)&&/(?:不删帧|全部\s*119\s*帧|完整.{0,16}帧)/u.test(segment.visual)&&/(?:保留|复用|沿用).{0,12}片尾.{0,8}原声/u.test(segment.sound);
 }
 if(!segment||index!==allSegments.length-1||index<1||![undefined,null,''].includes(segment.asset_id as never)||typeof segment.narration!=='string'||segment.narration.trim()||typeof segment.visual!=='string'||!segment.visual.trim()||typeof segment.sound!=='string')return false;
 const start=Number(segment.start),end=Number(segment.end),previousEnd=Number(allSegments[index-1]?.end);
 return Number.isFinite(start)&&Number.isFinite(end)&&Number.isFinite(previousEnd)&&start>0&&end>start&&end<=60&&end-start<=4.1&&Math.abs(previousEnd-start)<.001&&/(?:沿用|复用|保留|既有|固定).{0,16}片尾/u.test(segment.visual)&&/无(?:新增)?旁白|不(?:新增|添加)旁白/u.test(segment.sound);
}
export function bodyStoryboard<T extends Segment>(storyboard:T[]):T[]{return storyboard.filter((segment,index)=>!isFixedOutroSegment(segment,index,storyboard));}
