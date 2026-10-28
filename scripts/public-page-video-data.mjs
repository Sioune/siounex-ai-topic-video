// Read published JSON/Next page data as inert data. Never evaluate JavaScript,
// derive a player API, authenticate, or request any URL from this parser.
import {researchUrl} from './research-web.mjs';
export const PUBLIC_PAGE_VIDEO_DATA_VERSION='published-page-video-data@1';
export function publishedPageVideos(html,base){
 if(typeof html!=='string'||Buffer.byteLength(html)>2000000)return [];
 const found=[],queue=[];let nodes=0,decodedBytes=0;
 const videoKey=key=>/(?:^|_)video(?:_?url)?$|videoUrl$/i.test(key);
 const add=(key,value)=>{if(!videoKey(key)||typeof value!=='string'||!/\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(value))return;let url;try{url=researchUrl(new URL(value,base).href).href}catch{return}if(/doubleclick|googlesyndication|adservice/i.test(url)||found.some(r=>r.url===url)||found.length>=16)return;found.push({url,kind:'video',basis:'public-page-published-video-data',source_relation:'公开页面随附的产品演示配置（'+key.slice(0,100)+'）；仅作相关产品画面候选，未证明属于本文案例或本次版本，不能冒充本人实测。'});};
 const enqueue=(value,depth=0)=>{if(depth<=8&&queue.length<6000)queue.push({value,depth})};
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  const attrs=match[1],body=match[2].trim();
  if(/\btype\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attrs)){try{enqueue(JSON.parse(body))}catch{}continue;}
  // The recognized operation is only unwrapped as a JSON literal. No script
  // or arbitrary assignment is executed, including inside malformed payloads.
  const flight=body.match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);if(flight){try{enqueue(JSON.parse(flight[1]))}catch{}}
 }
 for(let cursor=0;cursor<queue.length&&nodes++<6000&&found.length<16;cursor++){
  const {value,depth}=queue[cursor];if(Array.isArray(value)){for(const item of value)enqueue(item,depth+1);continue;}
  if(value&&typeof value==='object'){for(const [key,item]of Object.entries(value)){add(key,item);enqueue(item,depth+1);}continue;}
  if(typeof value!=='string'||!/(?:video|\.mp4|\.webm|\.mov)/i.test(value))continue;
  decodedBytes+=Buffer.byteLength(value);if(decodedBytes>8000000)break;
  for(const m of value.matchAll(/"([A-Za-z0-9_-]{1,100})"\s*:\s*("(?:\\.|[^"\\])*")/g)){if(videoKey(m[1]))try{add(m[1],JSON.parse(m[2]))}catch{}}
  try{enqueue(JSON.parse(value),depth+1)}catch{}
  for(const line of value.split('\n').slice(0,1000)){const record=line.match(/^[a-f0-9]+:([\[{].*)$/i);if(record)try{enqueue(JSON.parse(record[1]),depth+1)}catch{}}
 }
 return found;
}
