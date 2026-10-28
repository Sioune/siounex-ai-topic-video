import type {Source} from './types';
import {isChinese,relevantAI,chineseBrief,excerpt} from './dedupe';

export const DAILY_TOPIC_LIMIT=50;
export type FeedItem={url:string;title:string;summary:string;published:string|null};
export function sourceLanguage(source:Source,item:FeedItem){return isChinese(item.title,item.summary)?'zh':source.language||'en';}
export function eligibleItems(source:Source,items:FeedItem[],now=Date.now()){
 return items.filter(item=>{
  if(!item.published||!Number.isFinite(Date.parse(item.published))||now-Date.parse(item.published)>30*86400000||Date.parse(item.published)>now)return false;
  if(source.language==='zh'&&!isChinese(item.title,item.summary))return false;
  if(/\b(fundraising|funding round|valuation|earnings|acquisition|quarterly results)\b/i.test(item.title))return false;
  return relevantAI(item.title,item.summary)||(source.aiOnly===true&&source.language!=='zh');
 }).sort((a,b)=>(b.published||'').localeCompare(a.published||''));
}
export function sourceBrief(item:FeedItem,language:string){return language==='zh'?chineseBrief(item.title,item.summary):excerpt(item.summary,650)||'该订阅未提供摘要，请打开外文原文核读。';}
export function sourceRisk(language:string){return language==='zh'?'中文来源报道与演示线索；尚未逐项实测。发布前核验产品范围、费用和素材授权。':'外文来源原文与订阅摘要，未自动翻译、未逐篇深度核读。制作中文脚本前核验原文事实、产品范围、费用和素材授权。';}
export function dailyWindow(now:number){const day=new Date(now+8*3600000).toISOString().slice(0,10),start=new Date(Date.parse(day+'T00:00:00Z')-8*3600000).toISOString();return {day,start,end:new Date(Date.parse(start)+86400000).toISOString()};}
