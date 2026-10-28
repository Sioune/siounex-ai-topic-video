import type {PublishingPlatform} from './publishing-contract.mts';

export type EngagementPlan={comment_text:string;reaction:'like'|'recommend';comment_source:'approved-platform-copy'|'discussion-template';source:'owner_authorized_author_operation'};
type Copy={title:string;description:string;tags?:string[]};
/** Deterministic discussion text from the already approved copy, never a new AI call. */
export function buildFrozenAuthorEngagement(copies:Partial<Record<PublishingPlatform,Copy>>){
 const result:Partial<Record<PublishingPlatform,EngagementPlan>>={};
 for(const platform of ['douyin','wechat_channels','bilibili','kuaishou'] as const){
  const copy=copies[platform];if(!copy)continue;
  const questions=copy.description.replace(/\r\n?/g,'\n').match(/[^。！？!?\n]+[？?]/g)||[];
  const question=questions.map(value=>value.trim()).filter(value=>value.length>=4&&value.length<=160).at(-1);
  result[platform]={comment_text:question||'你最想先了解这项内容的哪一步？',reaction:platform==='wechat_channels'?'recommend':'like',comment_source:question?'approved-platform-copy':'discussion-template',source:'owner_authorized_author_operation'};
 }
 return result;
}

export type EngagementAction='reaction'|'first_comment';
export type EngagementState='pending'|'prepared'|'done'|'not_present'|'blocked'|'uncertain';
export function engagementStatus(reaction:EngagementState,comment:EngagementState){
 const states=[reaction,comment];
 return states.every(state=>state==='done'||state==='not_present')?'completed':states.includes('uncertain')?'uncertain':states.includes('blocked')?'blocked':'pending';
}
