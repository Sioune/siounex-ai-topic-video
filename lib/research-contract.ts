import {ProductionError} from './production-contract';

export type ResearchInput={keywords:string;direction:string;clue_url:string|null};
export type ResearchSource={id:string;url:string;title:string;publisher:string;published_at:string|null;retrieved_at:string;summary:string;access:'opened'|'search_snippet'};
export type ResearchResult={title:string;summary:string;article:string;sources:ResearchSource[];gaps:string[];queries:string[]};
export type ResearchRetrieval={url:string;resolved_url:string;sha256:string;extract_sha256:string;bytes:number;extracted_chars:number;retrieved_at:string;extraction:'bounded-text'};
export type ResearchProvenance={model:string;started_at:string;finished_at:string;search_count:number;opened_urls:string[];queries:string[];prompt_sha256:string;output_sha256:string;events_sha256:string;paid_media_calls:0;retrievals?:ResearchRetrieval[]};
export type ResearchSourceNote={id:string;url:string;note_sha256:string;kind:'research-source-note'};
export type ResearchVersion={version:number;result:ResearchResult;article_sha256:string;source_manifest_sha256:string;source_notes:ResearchSourceNote[];created_at:string;provenance:ResearchProvenance;origin:'worker'|'owner-edit';topic_id:string|null};
export type ResearchCliCache={origin_attempt:number;discovery_output_sha256:string;discovery_events_sha256:string;discovery_prompt_sha256:string;documents_sha256:string;started_at:string};
export type ResearchCliFailure=Record<string,unknown>&{stage:string;research_binding:{id:string;input_hash:string;attempt:number;version:number};cache?:ResearchCliCache;next_retry_ms:number;next_retry_at:string};
export type ResearchRecord={cache_block?:{schema:string;reason:string;binding:{id:string;input_hash:string;attempt:number;version:number;expected_updated_at:string};recorded_at:string;model_called:false;budget_reset:false};cli_failure?:ResearchCliFailure;cli_failures?:ResearchCliFailure[];id:string;owner_id:string;input:ResearchInput;input_hash:string;request_hash:string;status:'queued'|'running'|'ready'|'failed'|'cancelled';attempt:number;version:number;lease_until:number|null;error:string|null;created_at:string;updated_at:string;versions:ResearchVersion[];topic_id:string|null};
export type FrozenResearch={schema:'frozen-research-source-v1';id:string;version:number;owner_id:string;input:ResearchInput;input_hash:string;result:ResearchResult;article_sha256:string;source_manifest_sha256:string;source_notes:ResearchSourceNote[];created_at:string;provenance:ResearchProvenance;origin:'worker'|'owner-edit';video_clue_watched:false;source_kind:'synthesis-not-external-original'};
export const RESEARCH_SOURCE_ID='research-synthesis';
export const RESEARCH_ORIGIN='https://siounex-ai-topic-library.siounexzhao.chatgpt.site';
export const RESEARCH_LEASE_MS=600000;
export const RESEARCH_MAX_ATTEMPTS=3;
export function researchObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ProductionError('研究资料格式无效',400);return value as Record<string,unknown>;}
function shape(value:Record<string,unknown>,allowed:string[]){if(Object.keys(value).some(key=>!allowed.includes(key)))throw new ProductionError('研究资料含不支持的字段',400);}
export function researchText(value:unknown,max:number,min=1){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new ProductionError('研究文字为空或超出长度限制',400);return value.trim();}
function list(value:unknown,max:number,itemMax:number){if(!Array.isArray(value)||value.length>max)throw new ProductionError('研究列表格式无效',400);return value.map(item=>researchText(item,itemMax));}
export function researchUrl(value:unknown){const raw=researchText(value,2000);let u:URL;try{u=new URL(raw)}catch{throw new ProductionError('来源网址无效',400)}const host=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.port||!host.includes('.')||host.includes(':')||/^\d+(?:\.\d+){3}$/.test(host)||host==='localhost'||/\.(?:localhost|local|internal|invalid)$/.test(host))throw new ProductionError('研究仅接受公开HTTPS网址',400);u.hash='';return u.href;}
function date(value:unknown,nullable=false){if(value===null&&nullable)return null;const raw=researchText(value,60);if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw)||!Number.isFinite(Date.parse(raw))||Date.parse(raw)>Date.now()+86400000)throw new ProductionError('研究来源日期无效；未知发布日期请用null',400);return raw;}
function digest(value:unknown){const raw=researchText(value,64);if(!/^[a-f0-9]{64}$/.test(raw))throw new ProductionError('研究证据SHA256无效',400);return raw;}
export function researchDomain(url:string){const parts=new URL(url).hostname.toLowerCase().replace(/^www\./,'').split('.');const multi=/^(?:co\.uk|org\.uk|com\.au|co\.jp|com\.cn|com\.sg|co\.nz|com\.br|co\.in)$/;return parts.slice(multi.test(parts.slice(-2).join('.'))?-3:-2).join('.');}
export function normalizeResearchInput(value:unknown):ResearchInput{const v=researchObject(value);shape(v,['keywords','direction','clue_url']);const keywords=v.keywords===undefined||v.keywords===''?'':researchText(v.keywords,500),direction=v.direction===undefined||v.direction===''?'':researchText(v.direction,4000),clue_url=v.clue_url===undefined||v.clue_url===null||v.clue_url===''?null:researchUrl(v.clue_url);if(!keywords&&!direction&&!clue_url)throw new ProductionError('请填写关键词、研究方向或视频线索链接',400);return {keywords,direction,clue_url};}
export function normalizeResearchResult(value:unknown):ResearchResult{
 const v=researchObject(value);shape(v,['title','summary','article','sources','gaps','queries']);
 const title=researchText(v.title,250),summary=researchText(v.summary,2000),article=researchText(v.article,24000,200);
 if((article.match(/[\u3400-\u9fff]/g)||[]).length<50)throw new ProductionError('请整理可阅读的中文资料文章',400);
 if(!Array.isArray(v.sources)||v.sources.length<2||v.sources.length>8)throw new ProductionError('资料文章需要2至8个来源',400);
 const sources:ResearchSource[]=v.sources.map((raw,index)=>{const source=researchObject(raw);shape(source,['id','url','title','publisher','published_at','retrieved_at','summary','access']);if(source.id!=='S'+(index+1)||!['opened','search_snippet'].includes(String(source.access)))throw new ProductionError('来源编号或读取范围无效',400);return {id:String(source.id),url:researchUrl(source.url),title:researchText(source.title,500),publisher:researchText(source.publisher,200),published_at:date(source.published_at,true),retrieved_at:date(source.retrieved_at)!,summary:researchText(source.summary,1400),access:source.access as ResearchSource['access']};});
 if(new Set(sources.map(source=>source.url)).size!==sources.length)throw new ProductionError('来源网址重复',400);
 const cited=[...new Set([...article.matchAll(/\[S(\d+)\]/g)].map(match=>'S'+match[1]))];if(cited.some(id=>!sources.some(source=>source.id===id)))throw new ProductionError('资料文章引用了不存在的来源编号',400);
 const opened=sources.filter(source=>source.access==='opened'&&cited.includes(source.id));if(opened.length<2||new Set(opened.map(source=>researchDomain(source.url))).size<2)throw new ProductionError('至少引用两个不同域名且已打开的来源；不足时应返回失败或待补资料',400);
 const gaps=list(v.gaps,12,1000),queries=list(v.queries,20,500);if(!queries.length)throw new ProductionError('缺少实际研究查询记录',400);
 return {title,summary,article,sources,gaps,queries};
}
export function normalizeResearchProvenance(value:unknown):ResearchProvenance{
 const v=researchObject(value);shape(v,['model','started_at','finished_at','search_count','opened_urls','queries','prompt_sha256','output_sha256','events_sha256','paid_media_calls','retrievals']);
 if(!Number.isInteger(v.search_count)||Number(v.search_count)<1||Number(v.search_count)>100||v.paid_media_calls!==0)throw new ProductionError('需要真实搜索记录，研究不授权媒体付费',400);
 const started_at=date(v.started_at)!,finished_at=date(v.finished_at)!;if(Date.parse(finished_at)<Date.parse(started_at))throw new ProductionError('研究执行时间顺序无效',400);
 const opened_urls=list(v.opened_urls,30,2000).map(researchUrl),queries=list(v.queries,30,500);if(opened_urls.length<2||!queries.length)throw new ProductionError('缺少实际打开来源或搜索记录',400);
 const out:ResearchProvenance={model:researchText(v.model,120),started_at,finished_at,search_count:Number(v.search_count),opened_urls:[...new Set(opened_urls)],queries:[...new Set(queries)],prompt_sha256:digest(v.prompt_sha256),output_sha256:digest(v.output_sha256),events_sha256:digest(v.events_sha256),paid_media_calls:0};
 if(v.retrievals!==undefined){if(!Array.isArray(v.retrievals)||v.retrievals.length>8)throw new ProductionError('抓取证据数量无效',400);out.retrievals=v.retrievals.map(raw=>{const r=researchObject(raw);shape(r,['url','resolved_url','sha256','extract_sha256','bytes','extracted_chars','retrieved_at','extraction']);if(r.extraction!=='bounded-text'||!Number.isInteger(r.bytes)||Number(r.bytes)<1||Number(r.bytes)>2200000||!Number.isInteger(r.extracted_chars)||Number(r.extracted_chars)<1||Number(r.extracted_chars)>100000)throw new ProductionError('抓取证据尺寸或范围无效',400);return {url:researchUrl(r.url),resolved_url:researchUrl(r.resolved_url),sha256:digest(r.sha256),extract_sha256:digest(r.extract_sha256),bytes:Number(r.bytes),extracted_chars:Number(r.extracted_chars),retrieved_at:date(r.retrieved_at)!,extraction:'bounded-text'};});}
 return out;
}
export function canonicalResearch(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonicalResearch).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalResearch((value as Record<string,unknown>)[key])).join(',')+'}';return JSON.stringify(value);}
export function researchCanonicalUrl(id:string,version:number){return RESEARCH_ORIGIN+'/research?id='+encodeURIComponent(id)+'&version='+version;}
