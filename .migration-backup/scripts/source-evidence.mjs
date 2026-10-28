import {createHash} from 'node:crypto';
import {extractSourceArticle} from '../lib/source-document.mts';
import {researchUrl} from './research-web.mjs';
import {SOURCE_IMAGES_MAX_COUNT} from './source-image-reader.mjs';
import {mapSohuImageReference} from './sohu-image-reference.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const text=x=>x.replace(/<[^>]*>/g,' ').replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[k]).replace(/\s+/g,' ').trim();
const entities=value=>value.replace(/&#(x[\da-f]+|\d+);/gi,(_,code)=>{const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' '}).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[key.toLowerCase()]);
function attributes(tag){const values={};for(const match of tag.matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))/g))values[match[1].toLowerCase()]=entities(match[2]??match[3]??match[4]??'');return values}
function srcset(value){if(!value)return null;const candidates=[...value.matchAll(/(?:^|,)\s*(\S+)\s+(\d+(?:\.\d+)?)([wx])(?=\s*(?:,|$))/g)];if(candidates.length){const mode=candidates[0][3];return candidates.filter(row=>row[3]===mode).sort((a,b)=>Number(b[2])-Number(a[2]))[0]?.[1]||null}return !/[\s,]/.test(value)?value:null}
function imageReferences(body,url,html,sourceSha256){
 const found=[],blocked=[],seen=new Set();
 function image(tag,picture){
  const a=attributes(tag),identity=[a.id,a.class,a.role].filter(Boolean).join(' '),width=Number(a.width),height=Number(a.height);
  if(/(?:^|[\s_-])(?:logo|avatar|icon|emoji|qrcode|qr-code|tracking|spacer|advertisement|social|placeholder|loading)(?:$|[\s_-])/i.test(identity)||width>0&&height>0&&(width<=2||height<=2||width<=96&&height<=96))return;
  const lazy=a['data-original']||a['data-original-src']||a['data-lazy-src']||a['data-src']||a['data-actualsrc']||a['data-echo'],pictureCandidate=picture?.map(row=>{const source=attributes(row);return !source.type||/^image\/(?:png|jpe?g|webp|gif)$/i.test(source.type)?srcset(source['data-srcset']||source.srcset):null}).find(Boolean);
  const value=lazy||srcset(a['data-srcset'])||srcset(a.srcset)||pictureCandidate||a.src;
  if(!value||/^(?:data:|blob:|javascript:)/i.test(value))return;
  const mapping=value===a['data-src']?mapSohuImageReference(value,{sourceUrl:url,html,sourceSha256}):null;
  if(mapping?.blocked){blocked.push({reason:mapping.reason});return;}
  const reference=mapping?.url||value;
  if(/\.(?:svg|ico)(?:$|[?#])/i.test(reference)||/(?:^|\/)(?:logo|avatar|icon|emoji|qrcode|spacer|placeholder|loading)(?:[\/_.-]|$)/i.test(reference))return;
  let normalized;try{normalized=researchUrl(new URL(reference,url).href).href}catch{blocked.push({reason:'Article image requires an unauthenticated public HTTPS URL'});return}
  if(seen.has(normalized))return;seen.add(normalized);found.push({url:normalized,kind:'image',status:'URL present in selected article body; bytes, content and rights NOT inspected',...(mapping?{source_mapping:mapping.audit}:{})});
 }
 for(const match of body.matchAll(/<picture\b[^>]*>[\s\S]*?<\/picture\s*>|<img\b[^>]*>/gi)){if(/^<picture\b/i.test(match[0])){const tag=match[0].match(/<img\b[^>]*>/i)?.[0];if(tag)image(tag,match[0].match(/<source\b[^>]*>/gi)||[])}else image(match[0])}
 return {media_references:found,blocked_image_references:blocked,image_reference_count:found.length,image_limit_exceeded:found.length>SOURCE_IMAGES_MAX_COUNT};
}
export function sourceEvidence(bytes,source){
 if(source.source_id==='owner-original'||source.original){
  const original=source.original;if(source.source_id!=='owner-original'||original?.schema!=='frozen-owner-original-v1'||original.source_kind!=='owner-original-not-external-news'||typeof original.original_text!=='string'||typeof original.draft!=='string'||sha(original.original_text)!==original.original_sha256||sha(original.draft)!==original.draft_sha256)throw Error('Frozen owner original binding mismatch');
  return {title:original.title,title_basis:'Owner-authored draft title; not an external publication title',published_at:null,published_raw:null,published_basis:'No public release date established; description_date is only the supplied material date',media_references:[],source_sha256:sha(bytes),source_kind:'owner-original-not-external-news',original_id:original.id,original_version:original.version,original_sha256:original.original_sha256,draft_sha256:original.draft_sha256,description_date:original.description_date||null,compiled_at:original.created_at,limits:'Complete owner-authored product description and editable draft. Claimed features and pending checks are not observed test results. No media inspected, quality approval, generation authorization or publication authorization is implied.'};
 }
 if(source.research){
  const research=source.research;if(research.schema!=='frozen-research-source-v1'||!research.result?.article||sha(research.result.article)!==research.article_sha256)throw Error('Frozen research article binding mismatch');
  return {title:research.result.title,title_basis:'Frozen owner-selected research synthesis title; not an external document title',published_at:null,published_raw:null,published_basis:'This is a multi-source synthesis; individual source publication dates remain in research sources',media_references:[],source_sha256:sha(bytes),source_kind:'research-synthesis-not-external-original',research_id:research.id,research_version:research.version,research_article_sha256:research.article_sha256,compiled_at:research.created_at,video_clue_watched:false,source_notes:research.source_notes,limits:'Source notes and bounded retrieval receipts preserve attribution; this script stage did not independently read full external pages or watch the clue video'};
 }
 const html=bytes.toString('utf8'),headline=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];let published=null,raw=null;
 const firstLine=html.split(/\r?\n/).map(s=>s.trim()).find(Boolean),u=new URL(source.url),archiveTitle=!headline&&!/<[a-z][\s>]/i.test(html)&&u.hostname==='chatgpt.com'&&/^\/api\/library\/files\/libfile_[a-f0-9]+\/download$/.test(u.pathname)&&firstLine===source.original_title?firstLine:null;
 // IT之家's explicit publication element uses China local time. Never use an arbitrary date in article prose.
 if(['www.ithome.com','ithome.com','m.ithome.com'].includes(new URL(source.url).hostname)){
  const value=html.match(/<span\b[^>]*\bid=["']pubtime(?:_baidu)?["'][^>]*>([^<]+)<\/span>/i)?.[1]?.trim();
  const m=value?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{2}):(\d{2}):(\d{2})$/);if(m){const stamp=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T${m[4]}:${m[5]}:${m[6]}+08:00`;if(Number.isFinite(Date.parse(stamp))){published=stamp;raw=value;}}
 }
 const article=extractSourceArticle(html,{url:source.url}),media=imageReferences(article.body_html,source.url,html,sha(bytes));
 return {title:headline?text(headline).slice(0,500):archiveTitle||source.original_title||source.title,title_basis:headline?'Exact document title':archiveTitle?'Exact first nonempty line of pinned plain-text Library archive; matches frozen original_title':'Frozen topic label; original document title unconfirmed',published_at:published||source.published_at||null,published_raw:raw,published_basis:published?'Explicit IT之家 publication element, China +08:00':source.published_at?'Frozen source record':'Unconfirmed',...media,article_extraction:article.extraction,article_found:article.article_found,source_sha256:sha(bytes)};
}
