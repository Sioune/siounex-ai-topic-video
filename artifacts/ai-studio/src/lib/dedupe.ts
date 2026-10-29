import type {Topic} from './types';
export function normalizedTitle(s:string=''){return s.toLowerCase().replace(/&amp;/g,'&').replace(/[^\p{L}\p{N}]/gu,'').replace(/^(首发|重磅|刚刚|突发|独家|实测|深度)/,'');}
export function isChinese(title:string,body:string){const han=(s:string)=>(s.match(/[\u3400-\u9fff]/g)||[]).length;return han(title)>=4&&han(body)>=35&&han(body)/Math.max(body.length,1)>.25;}
export function isAI(s:string){return /\b(AI|artificial intelligence|machine learning|deep learning|neural networks?|reinforcement learning|large language models?|generative models?|diffusion models?|text.to.video|text.to.image)\b|人工智能|大模型|生成式|智能体|机器学习|深度学习|神经网络|具身|机器人|ChatGPT|OpenAI|Claude|Gemini|DeepSeek|Sora|Veo\b|Vidu|DLSS|Seedance|Grok|WorkBuddy|Opus|MiniMax|可灵|即梦|豆包|通义|百炼|智谱|Kimi|扣子|Qwen|生成视频|文生图|图生视频|语音合成|数字人/i.test(s)}
export function excerpt(s:string,max=260){s=s.replace(/^(IT之家|爱范儿|极客公园)\s*\d+\s*月\s*\d+\s*日(消息|报道)[，,：:\s]*/,'').replace(/本文来自[\s\S]*$/,'').trim();if(s.length<=max)return s;const head=s.slice(0,max);const end=Math.max(head.lastIndexOf('。'),head.lastIndexOf('！'),head.lastIndexOf('？'));return end>40?head.slice(0,end+1):head+'…';}
const generic=new Set(['ai','openai','google','nvidia','apple','microsoft','meta','the','new','with','and','for','model','models','agent','agents','api','llm','pro','max','plus','ultra','laptop','preview','windows','mac','introducing','introduction','how','what','why','your','our','from','into','using','use','uses','used','building','build','based','more','their','that','this','these','those','are','can','will','its','you','about','through']);
export function anchors(s:string){const a=[...s.toLowerCase().matchAll(/\b[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*(?:\s+(?:\d+(?:\.\d+)*)(?:\s*(?:pro|mini|flash|ultra))?)?\b/g)].map(m=>m[0].trim()).filter(x=>x.length>2&&!generic.has(x));for(const n of ['可灵','即梦','豆包','通义千问','智谱','混元','灵光','海螺','腾讯元宝','扣子','文心'])if(s.includes(n))a.push(n);return [...new Set(a)].sort();}
export function eventKey(s:string){const a=anchors(s);return a.length?a.slice(0,4).join('|'):normalizedTitle(s).slice(0,64)}
function grams(s:string){const v=normalizedTitle(s);return new Set(Array.from({length:Math.max(0,v.length-2)},(_,i)=>v.slice(i,i+3)))}
function similarity(a:string,b:string){const x=grams(a),y=grams(b);const n=[...x].filter(g=>y.has(g)).length;return n/Math.max(1,Math.min(x.size,y.size))}
function versions(s:string){return [...s.toLowerCase().matchAll(/\b(?:sora|gpt|claude|gemini|qwen|deepseek|veo|kling|seedance|midjourney|grok)[\s-]*(\d+(?:\.\d+)*)/g)].map(m=>m[0].replace(/[\s-]/g,''))}
export function findDuplicate(candidate:{url:string;title:string;summary:string;published_at:string|null},existing:Topic[]):Topic|undefined {
 const direct=existing.find(t=>{let links:{url:string}[]=[];try{links=JSON.parse(t.related_urls||'[]')}catch{}return t.url===candidate.url||links.some(l=>l.url===candidate.url)});if(direct)return direct;
 const key=knownEvent(candidate.url);if(key){const exact=existing.find(t=>t.event_key===key||knownEvent(t.url)===key);if(exact)return exact}
 const title=normalizedTitle(candidate.title),a=anchors(candidate.title),cv=versions(candidate.title);
 return existing.find(t=>{
  let links:{url:string}[]=[];try{links=JSON.parse(t.related_urls||'[]')}catch{}
  if(t.url===candidate.url||links.some(l=>l.url===candidate.url))return true;
  if(normalizedTitle(t.title)===title||normalizedTitle(t.original_title)===title)return true;
  const sim=Math.max(similarity(candidate.title,t.title),similarity(candidate.title,t.original_title));
  if(sim>=.68)return true;
  const b=anchors(t.title+' '+t.original_title),shared=a.filter(v=>b.includes(v)),bv=versions(t.title+' '+t.original_title);
  // Explicit model version anchors remain useful across translated historical titles.
  if(cv.length&&bv.length&&cv.some(v=>bv.includes(v))&&(sim>=.22||(/发布|推出|上线|release|launch|introduc/i.test(candidate.title)&&/发布|推出|上线|release|launch|introduc/i.test(t.title+' '+t.original_title))))return true;
  const days=candidate.published_at&&t.published_at?Math.abs(Date.parse(candidate.published_at)-Date.parse(t.published_at))/86400000:Infinity;
  // Shared feed boilerplate is not event evidence; only title entities may join stories.
  return days<=21&&shared.length>=2&&sim>=.25;
 });
}

export function relevantAI(title:string,body:string){
 if(/早报|晚报|早知道|一周回顾|每日速递|估值|融资|招股书|收购|发售.*元|指数收|发布.*笔记本|芯片.*业务|访韩|会见.*CEO/.test(title)||(title.match(/[；;]/g)||[]).length>=2)return false;
 if(isAI(title))return true;
 const first=body.slice(0,900);return (first.match(/人工智能|大模型|生成式|智能体|文生图|生成视频|语音合成|数字人|\bAI\b/gi)||[]).length>=3;
}
export function chineseBrief(title:string,body:string){
 const sentences=body.match(/[^。！？]+[。！？]+/g)||[];
 const focused=sentences.filter(s=>isAI(s)&&s.length>=22&&s.length<=230);
 const chosen=focused.length?focused.slice(0,2):sentences.filter(s=>s.length>=22&&s.length<=230).slice(0,2);
 return chosen.length?chosen.join(' ').slice(0,470).trim():excerpt(body,260);
}

export function knownEvent(url:string){const keys:Record<string,string>={
 'https://www.qbitai.com/2026/10/501803.html':'utopai-x-pai-2026-10',
 'https://www.ifanr.com/1682888':'utopai-x-pai-2026-10',
 'https://www.ifanr.com/1683177':'windows-surface-ai-2026-10',
 'https://www.ifanr.com/1683127':'windows-surface-ai-2026-10',
 'https://www.ithome.com/1/010/510.htm':'windows-surface-ai-2026-10',
 'https://www.qbitai.com/2026/10/501834.html':'chatgpt-gpt6-iui-2026-10',
 'https://www.ifanr.com/1682953':'macos-disk-access-2026-10'
 };return keys[url]||null}
