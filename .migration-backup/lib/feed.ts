import type {Source,Topic} from './types';
export function plainText(input:string):string {
 let s=input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ');
 s=s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return v>=0&&v<=0x10ffff?String.fromCodePoint(v):''}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,n)=>(({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[n]??''));
 return s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function tag(s:string,name:string){return s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1]??''}
export function normalizeUrl(raw:string):string|null{try{const u=new URL(raw.replace(/&amp;/g,'&').trim());if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const h=u.hostname.toLowerCase();if(h==='localhost'||h.endsWith('.local')||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(':'))return null;u.hash='';[...u.searchParams.keys()].forEach(k=>{if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k)});u.pathname=u.pathname.replace(/\/$/,'')||'/';return u.href;}catch{return null}}
export function validDate(raw:string,now=Date.now()):string|null {const d=Date.parse(plainText(raw));return Number.isFinite(d)&&d>946684800000&&d<=now+86400000?new Date(d).toISOString():null}
export function parseFeed(xml:string,source:Source,now=Date.now()) {
 if(xml.length>2200000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('订阅格式不安全或超出大小限制');
 if(!/<rss\b|<feed\b|<rdf:RDF\b/i.test(xml))throw new Error('来源未返回 RSS / Atom');
 const items=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>|<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)??[];
 const seen=new Set<string>();const parsed=[];
 for(const item of items.slice(0,80)){
  const alt=[...item.matchAll(/<link\b([^>]*?)\/?>/gi)].map(m=>m[1]).find(a=>/href\s*=/.test(a)&&(!/rel\s*=/.test(a)||/rel\s*=\s*["']alternate["']/.test(a)));
  const href=alt?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
  let raw=plainText(tag(item,'link'))||href||'';try{const u=new URL(raw);if(u.protocol==='http:'&&source.hosts.includes(u.hostname)){u.protocol='https:';raw=u.href}}catch{}
  const url=normalizeUrl(raw);
  const title=plainText(tag(item,'title')).slice(0,250);
  if(!url||!title||seen.has(url))continue;
  if(!source.hosts.includes(new URL(url).hostname))continue;
  seen.add(url);
  const summary=[tag(item,'content:encoded'),tag(item,'content'),tag(item,'description'),tag(item,'summary')].map(plainText).sort((a,b)=>b.length-a.length)[0].slice(0,5000);
  const published=validDate(tag(item,'pubDate')||tag(item,'published')||tag(item,'dc:date')||tag(item,'updated'),now);
  parsed.push({url,title,summary,published});
 }
 return parsed;
}
export function suggest(title:string,summary:string){
 const s=(title+' '+summary).toLowerCase();
 const vision=/\b(video|image|visual|photo|camera|film|animation|animate|3d|world model|veo|sora|genie)\b|视频|图像|视觉|动画|影像|摄影|画面|图片/.test(s);
 const sound=/\b(audio|music|voice|speech|sound|sing|singing|lyria)\b|音频|音乐|声音|语音|配音|唱歌/.test(s);
 const interact=/\b(game|gaming|interactive|robot|robotics|avatar|computer use|virtual|agent)\b|交互|机器人|智能体/.test(s);
 const curious=/\b(science|animal|weather|space|brain|dream|discover|ocean|dolphin)\b|科学|动物|梦/.test(s);
 const boring=/\b(funding|fundraise|valuation|investment|revenue|earnings|benchmark|parameters|leaderboard|enterprise pricing)\b|融资|估值|参数|榜单/.test(s);
 const category=vision?'视觉影像':sound?'声音音乐':interact?'互动体验':curious?'好奇脑洞':boring?'行业动态':'AI实用';
 const score=Math.max(15,Math.min(95,45+(vision?24:0)+(sound?23:0)+(interact?14:0)+(curious?18:0)-(boring?36:0)));
 const material=/\b(demo|watch|video|listen|try|play|examples|gallery|showcase)\b|演示|视频|体验|试听|实测|试用|案例|开源/.test(s)?'有演示线索':'待核实';
 const angle=category==='视觉影像'?'先展示一段画面，再拆解它哪里像真的、哪里露馅。':category==='声音音乐'?'先让观众听一遍，再揭晓生成方式并做一个对比。':category==='互动体验'?'用一个普通人熟悉的小任务，演示交互过程和失误。':category==='好奇脑洞'?'从一个好奇问题开场，区分演示结果、研究推测和现实用途。':category==='行业动态'?'优先寻找可体验的变化；仅有参数、融资或榜单时暂缓拍摄。':'找一个生活场景，展示使用前后差异，保留失败片段。';
 return {category,score,material,highlight:summary?summary.slice(0,280):'订阅未提供摘要，请先查看原文。',angle,materials:material==='有演示线索'?'标题或摘要出现演示线索。打开原文确认视频、音频或可试用入口；引用前检查授权。':'打开原文查找演示或试用入口；尚未确认可直接使用的素材。',risk:'这是基于标题与订阅摘要的规则初筛。发布前核对原文、上线范围、费用与素材授权，不把演示效果当作稳定能力。'};
}
export async function topicId(url:string){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));return 't_'+Array.from(new Uint8Array(buf)).map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,24)}
function divWithClass(html:string,className:string){
 const openings=/<div\b[^>]*>/gi;let opening;while((opening=openings.exec(html))){const attr=opening[0].match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i);if(!attr||!attr[2].split(/\s+/).includes(className))continue;const tokens=/<div\b[^>]*>|<\/div\s*>/gi;tokens.lastIndex=openings.lastIndex;let depth=1,token;while((token=tokens.exec(html))){depth+=/^<\//.test(token[0])?-1:1;if(!depth)return {start:opening.index,end:tokens.lastIndex,inner:html.slice(openings.lastIndex,token.index)}}return null}return null;
}
export function articleText(html:string){
 const source=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');const article=divWithClass(source,'article');if(!article)return '';let body=article.inner;for(const cls of ['article_info','zhaiyao']){const meta=divWithClass(body,cls);if(meta)body=body.slice(0,meta.start)+body.slice(meta.end)}body=body.replace(/<h1\b[^>]*>[\s\S]*?<\/h1\s*>/gi,'').replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote\s*>/gi,b=>/公众号\s*QbitAI/.test(plainText(b))?'':b);return plainText(body).replace(/版权所有[\s\S]*$/,'').trim();
}
export async function readSourceDocument(url:string,source:Source,fetcher:typeof fetch){
 const allowed=(raw:string)=>{const u=new URL(raw);if(!normalizeUrl(raw)||!source.hosts.includes(u.hostname))throw new Error('来源不在白名单');return u.href;};
 let current=allowed(url);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{let res:Response;for(let hop=0;;hop++){
 res=await fetcher(current,{headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html','User-Agent':'AI-Topic-Library/2.0'},redirect:'manual',signal:controller.signal});
 if(![301,302,303,307,308].includes(res.status))break;
 const location=res.headers.get('location');await res.body?.cancel();if(hop>=3||!location)throw new Error('来源重定向过多或缺少目标');current=allowed(new URL(location,current).href);
 }if(!res.ok)throw Object.assign(new Error('来源 HTTP '+res.status),{code:'source-http',status:res.status});
 if(Number(res.headers.get('content-length')||0)>2200000)throw Object.assign(new Error('来源文件超出大小限制'),{code:'source-too-large'});
 const reader=res.body?.getReader();if(!reader)throw Object.assign(new Error('来源返回空内容'),{code:'source-empty'});let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2200000){await reader.cancel();throw Object.assign(new Error('来源文件超出大小限制'),{code:'source-too-large'})}chunks.push(value)}const content=new Uint8Array(size);let off=0;for(const c of chunks){content.set(c,off);off+=c.length}const content_type=res.headers.get('content-type')||'',charset=content_type.match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1]||'utf-8';let decoded:string;try{decoded=new TextDecoder(charset).decode(content)}catch{throw Object.assign(new Error('来源文字编码暂不支持'),{code:'source-format'})}const digest=await crypto.subtle.digest('SHA-256',content),raw_sha256=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');return {content:decoded,resolved_url:current,content_type,byte_length:size,raw_sha256};
 }finally{clearTimeout(timer)}
}
export async function readSourceText(url:string,source:Source,fetcher:typeof fetch){return (await readSourceDocument(url,source,fetcher)).content;}
export async function fetchSource(source:Source,fetcher:typeof fetch=fetch){
 const rows=parseFeed(await readSourceText(source.url,source,fetcher),source);
 if(source.id==='qbitai-zh')for(let i=0;i<Math.min(rows.length,10);i+=2)await Promise.all(rows.slice(i,i+2).map(async item=>{try{const full=articleText(await readSourceText(item.url,source,fetcher));if(full.length>100)item.summary=full.slice(0,7000)}catch{/* Insufficient Chinese content is excluded later, never silently translated. */}}));
 return rows;
}
export function filterTopics(topics:Topic[],f:{q:string;category:string;time:string;material:string;tab:string;sort:string},now=Date.now()){
 const q=f.q.toLowerCase().trim();const rows=topics.filter(t=>{
 const age=t.published_at?(now-Date.parse(t.published_at))/86400000:Infinity;
 const lang=t.content_lang??'zh';const status=t.disposition??'pending';const visible=f.tab==='legacy'?lang!=='zh':f.tab==='rejected'?status==='rejected':f.tab==='produced'?status==='produced':f.tab==='saved'?!!t.favorite:status==='pending';
 return visible&&(!q||[t.title,t.original_title,t.summary,t.source,t.angle].join(' ').toLowerCase().includes(q))&&(f.category==='all'||t.category===f.category)&&(f.material==='all'||t.material===f.material)&&(f.tab!=='saved'||!!t.favorite)&&(f.time==='all'||(f.time==='longtail'?age>90&&!!t.published_at:f.time==='unknown'?!t.published_at:age>=-1&&age<=Number(f.time)));
 });return rows.sort((a,b)=>f.sort==='date'?(b.published_at||'').localeCompare(a.published_at||''):b.score-a.score||(b.published_at||'').localeCompare(a.published_at||''));
}
