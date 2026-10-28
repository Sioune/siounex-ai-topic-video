// Full article extraction, shared by Worker preparation and the local source reader.
// This removes page furniture, never truncates article prose to make it fit.
import {sohuImageMetadata,SOHU_IMAGE_METADATA_NAME} from './sohu-image-metadata.mts';
export type SourceArticle={content:string;body_html:string;text:string;title:string;extraction:'plain-text'|'article-container'|'main-container'|'body-fallback';article_found:boolean;raw_chars:number};
const entities=(value:string)=>value.replace(/&#(x[\da-f]+|\d+);/gi,(_,code:string)=>{const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' ';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,name:string)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[name.toLowerCase()]||' '));
export const sourceArticleText=(value:string)=>entities(value.replace(/<[^>]*>/g,' ')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ').replace(/\s+/g,' ').trim();
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function attribute(tag:string,name:string){return tag.match(new RegExp('\\b'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'))?.slice(1).find(v=>v!==undefined)||'';}
function container(html:string,test:(tag:string,name:string)=>boolean){
 const tokens=/<\/?(article|main|div|section)\b[^>]*>/gi;let row:RegExpExecArray|null;
 while((row=tokens.exec(html))){if(row[0][1]==='/'||!test(row[0],row[1].toLowerCase()))continue;const name=row[1],end=new RegExp('<\\/?'+name+'\\b[^>]*>','gi');end.lastIndex=tokens.lastIndex;let depth=1,next:RegExpExecArray|null;while((next=end.exec(html))){depth+=next[0][1]==='/'?-1:1;if(depth===0)return html.slice(tokens.lastIndex,next.index);} }
 return null;
}
export function extractSourceArticle(html:string,{url}:{url?:string}={}):SourceArticle{
 if(typeof html!=='string')throw Error('source-format');
 const title=sourceArticleText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]||'');
 const isHtml=/<(?:!doctype\s+html|html|head|body|article|main|div|p|h[1-6]|script)\b/i.test(html);
 if(!isHtml){const text=html.trim();return {content:html,body_html:escape(html),text,title:'',extraction:'plain-text',article_found:false,raw_chars:html.length};}
 if(/^(?:just a moment|attention required|access denied|verify (?:you are|you're) human|security verification)/i.test(title)||/<(?:form|div)\b[^>]*(?:id|class)=["'][^"']*(?:cf-challenge|challenge-form|captcha-container)/i.test(html))throw Error('source-format');
 const clean=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 // Prefer the publisher's actual article body over a broad page <main>.
 const ids=new Set(['paragraph','article-content','article_content','articlebody','content_views']);
 const classes=new Set(['article','article-content','article_content','article-body','article_body','entry-content','post-content','post_content','rich_media_content','grap','single-post-content']);
 let body=container(clean,(tag)=>{const id=attribute(tag,'id').toLowerCase(),names=attribute(tag,'class').toLowerCase().split(/\s+/);return ids.has(id)||names.some(c=>classes.has(c));});
 // Some ifanr pages reuse #article-content for trailing metadata; its <article>
 // is the authoritative prose container, not that trailing metadata block.
 if(url&&/(?:^|\.)ifanr\.com$/.test(new URL(url).hostname))body=container(clean,(_tag,name)=>name==='article')||body;
 let extraction:SourceArticle['extraction']='article-container';
 if(body===null)body=container(clean,(_tag,name)=>name==='article');
 const article_found=body!==null;
 if(body===null){body=container(clean,(_tag,name)=>name==='main');extraction=body===null?'body-fallback':'main-container';}
 if(body===null)body=clean.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1]||clean.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi,'');
 body=body.replace(/<(nav|footer|aside|header|form|dialog)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 const text=sourceArticleText(body);
 // A normalized, complete selected body preserves relative original image URLs
 // and publication metadata while dropping executable code and page chrome.
 const metadata=(html.match(/<meta\b[^>]*>/gi)||[]).filter(tag=>/\b(?:name|property)\s*=\s*["'](?:article:published_time|datepublished|publishdate|pubdate)["']/i.test(tag)).join('\n');
 let sohuMetadata='';try{const images=url&&sohuImageMetadata(html,url);if(images)sohuMetadata='<meta name="'+SOHU_IMAGE_METADATA_NAME+'" content="'+escape(images.json)+'">';}catch{/* Invalid image metadata stays unavailable; never retain executable script. */}
 const content='<!doctype html><html><head><meta charset="utf-8"><title>'+escape(title)+'</title>'+metadata+sohuMetadata+'</head><body><article>'+body+'</article></body></html>';
 return {content,body_html:body,text,title,extraction,article_found,raw_chars:html.length};
}
