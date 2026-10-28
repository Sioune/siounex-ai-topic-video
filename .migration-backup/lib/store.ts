import {env} from 'cloudflare:workers';
import seedTopics from './seeds.json';
import sources from './sources.json';
import {normalizeUrl,topicId,fetchSource,suggest} from './feed';
import {eventKey,findDuplicate,knownEvent} from './dedupe';
import {DAILY_TOPIC_LIMIT,dailyWindow,eligibleItems,sourceLanguage,sourceBrief,sourceRisk} from './collection-policy';
import type {Topic,Library} from './types';
export {sources};
export function db(){if(!env.DB)throw new Error('选题数据库暂时不可用');return env.DB}
export function siteArchiveBucket(){if(!env.BUCKET)throw new Error('私有归档存储暂时不可用');return env.BUCKET as R2Bucket;}
const columns='id,url,source_id,source,title,original_title,summary,published_at,collected_at,category,score,material,highlight,angle,materials,risk,curated,media_url,media_type';
function values(t:Topic){return [t.id,t.url,t.source_id,t.source,t.title,t.original_title,t.summary,t.published_at,t.collected_at,t.category,t.score,t.material,t.highlight,t.angle,t.materials,t.risk,t.curated,t.media_url??null,t.media_type??null]}
function insert(t:Topic){return db().prepare(`INSERT INTO topics (${columns}) VALUES (${new Array(19).fill('?').join(',')}) ON CONFLICT(url) DO NOTHING`).bind(...values(t))}
export async function ensureSeeds(){
 const ready=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('seeds_v1').first();if(ready)return;
 const now=new Date().toISOString();const statements=[];
 for(const [i,s] of seedTopics.entries()){
  const url=normalizeUrl(s.sourceUrl)!;const h=new URL(url).hostname;const source=sources.find(x=>x.hosts.includes(h));
  const category=s.category.startsWith('视觉')?'视觉影像':s.category.startsWith('听觉')?'声音音乐':s.category.includes('游戏')?'互动体验':s.category.startsWith('好奇')?'好奇脑洞':'AI实用';
  statements.push(insert({id:await topicId(url),url,source_id:source?.id??'google-ai',source:s.sourceName,title:s.title,original_title:s.title,summary:s.summary,published_at:s.publishedAt+'T00:00:00.000Z',collected_at:now,category,score:96-i,material:'已找到素材',highlight:s.hook,angle:s.visualIdeas.join('；'),materials:s.primaryMediaType.includes('video')?'官方原文中的视频演示；引用前另行确认授权。':s.primaryMediaType==='image'?'官方配图已找到。图片可见不代表商业视频可自由转载。':'官方互动/试听入口已找到；可使用性、登录和费用需另行实测。',risk:s.evidenceCaveat+(h==='news.mit.edu'?' MIT图片可能受非商业、禁止改编条款限制。':''),curated:1,media_url:s.primaryMediaUrl,media_type:s.primaryMediaType}));
 }
 statements.push(db().prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING').bind('seeds_v1',now));await db().batch(statements);
}
export async function library(userId:string):Promise<Library>{
 await ensureSeeds();
 const [rows,status,updated]=await Promise.all([
 db().prepare("WITH visible(id) AS (SELECT id FROM (SELECT id FROM topics ORDER BY collected_at DESC LIMIT 1500) UNION SELECT topic_id FROM favorites WHERE user_id=? UNION SELECT topic_id FROM dispositions WHERE user_id=?) SELECT t.*, CASE WHEN f.topic_id IS NULL THEN 0 ELSE 1 END AS favorite, COALESCE(d.status,'pending') AS disposition FROM visible v JOIN topics t ON t.id=v.id LEFT JOIN favorites f ON f.topic_id=t.id AND f.user_id=? LEFT JOIN dispositions d ON d.topic_id=t.id AND d.user_id=? ORDER BY COALESCE(t.updated_at,t.published_at) DESC,t.rowid ASC").bind(userId,userId,userId,userId).all<Topic>(),
 db().prepare('SELECT * FROM source_status').all(),
 db().prepare('SELECT value FROM app_state WHERE key=?').bind('last_refresh').first<{value:string}>()]);
 return {topics:rows.results,sources:sources.map(s=>({...s,last_attempt:null,last_success:null,state:'pending',message:'尚未采集',item_count:0,...status.results.find((v)=>v.id===s.id)})),updatedAt:updated?.value??null,serverNow:new Date().toISOString()};
}
export async function setFavorite(userId:string,id:string,saved:boolean){
 const exists=await db().prepare('SELECT id FROM topics WHERE id=?').bind(id).first();if(!exists)throw new Error('选题不存在');
 if(saved)await db().prepare('INSERT INTO favorites(user_id,topic_id,created_at) VALUES (?,?,?) ON CONFLICT(user_id,topic_id) DO NOTHING').bind(userId,id,new Date().toISOString()).run();
 else await db().prepare('DELETE FROM favorites WHERE user_id=? AND topic_id=?').bind(userId,id).run();
 return {id,saved};
}
export async function setDisposition(userId:string,id:string,status:string){
 if(!['pending','rejected','produced'].includes(status))throw new Error('无效状态');
 if(!await db().prepare('SELECT id FROM topics WHERE id=?').bind(id).first())throw new Error('选题不存在');
 await db().prepare('INSERT INTO dispositions(user_id,topic_id,status,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,topic_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at').bind(userId,id,status,new Date().toISOString()).run();return {id,status};
}
export async function refreshFeeds(){
 await ensureSeeds();const now=Date.now(),at=new Date(now).toISOString(),{day,start,end}=dailyWindow(now);
 const lock=await db().prepare(`INSERT INTO app_state(key,value) VALUES ('refresh_lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(app_state.value AS INTEGER) < ? RETURNING value`).bind(String(now+180000),String(now)).first();
 if(!lock)return {cooldown:true,added:0,updated:0,duplicates:0,results:[]};
 const results:{id:string;ok:boolean;added:number;updated:number;duplicates:number;count:number;eligible:number;error?:string}[]=[];let added=0,updated=0,duplicates=0;
 const used=await db().prepare("SELECT count(*) AS value FROM topics WHERE collected_at>=? AND collected_at<?").bind(start,end).first<{value:string}>();let remaining=Math.max(0,DAILY_TOPIC_LIMIT-Number(used?.value||0));
 // Research topics bind an immutable, owner-selected synthesis version. Feed
 // deduplication must never replace that canonical URL or its source identity.
 const prior=(await db().prepare("SELECT * FROM topics WHERE source_id NOT IN ('research-synthesis','owner-original')").all<Topic>()).results;
 try{
 const batches:{source:typeof sources[number];items:Awaited<ReturnType<typeof fetchSource>>;error:string|null}[]=new Array(sources.length);let nextSource=0;
 await Promise.all(Array.from({length:Math.min(3,sources.length)},async()=>{while(nextSource<sources.length){const index=nextSource++,source=sources[index];try{batches[index]={source,items:await fetchSource(source),error:null}}catch(e){batches[index]={source,items:[],error:e instanceof Error?e.message:'来源读取失败'}}}}));
 const queues=batches.map(({source,items,error})=>({source,items,error,eligible:eligibleItems(source,items,now),added:0,updated:0,duplicates:0}));
 // Rotate through sources so a busy domestic feed cannot consume the whole daily allowance.
 const rounds=Math.max(0,...queues.map(q=>q.eligible.length));
 for(let index=0;index<rounds;index++)for(const queue of queues){
   const {source}=queue,item=queue.eligible[index];if(!item)continue;
   const language=sourceLanguage(source,item),summary=sourceBrief(item,language),hints=suggest(item.title,item.summary);
   const candidate={url:item.url,title:item.title,summary,published_at:item.published};
   const match=findDuplicate(candidate,prior);
   if(match){
    queue.duplicates++;
    let related:{url:string;title:string;source:string;published_at:string|null}[]=[];try{related=JSON.parse(match.related_urls||'[]')}catch{}
    const known=match.url===item.url||related.some(r=>r.url===item.url);
    if(!known){related.push({url:item.url,title:item.title,source:source.name,published_at:item.published});match.related_urls=JSON.stringify(related.slice(-100));await db().prepare('UPDATE topics SET related_urls=? WHERE id=?').bind(match.related_urls,match.id).run();}
    const newer=!!item.published&&(!match.published_at||item.published>match.published_at)&&normalizedDifference(item.title,match.title);
    // Prefer an available Chinese report; an English counterpart only supplements it.
    const previousLanguage=match.content_lang??'zh';
    if(language==='zh'&&previousLanguage!=='zh'||(!known&&newer&&language===previousLanguage)){
     if(!related.some(r=>r.url===match.url))related.push({url:match.url,title:match.title,source:match.source,published_at:match.published_at});
     await db().prepare("UPDATE topics SET url=?,source_id=?,source=?,title=?,original_title=?,summary=?,published_at=?,category=?,score=?,material=?,highlight=?,angle=?,materials=?,risk=?,content_lang=?,event_key=?,related_urls=?,updated_at=? WHERE id=?").bind(item.url,source.id,source.name,item.title,item.title,summary,item.published,hints.category,hints.score,hints.material,summary,hints.angle,hints.materials,sourceRisk(language),language,knownEvent(item.url)||eventKey(item.title),JSON.stringify(related.slice(-100)),at,match.id).run();
     Object.assign(match,{...candidate,source_id:source.id,source:source.name,original_title:item.title,content_lang:language,related_urls:JSON.stringify(related),updated_at:at});queue.updated++;
    }
    continue;
   }
   if(remaining<=0)continue;
   const t:Topic={id:await topicId(item.url),url:item.url,source_id:source.id,source:source.name,title:item.title,original_title:item.title,summary,published_at:item.published,collected_at:at,...hints,highlight:summary,risk:sourceRisk(language),curated:0,content_lang:language,event_key:knownEvent(item.url)||eventKey(item.title),related_urls:'[]',updated_at:at};
   const r=await db().prepare(`INSERT INTO topics (${columns},content_lang,event_key,related_urls,updated_at) VALUES (${new Array(23).fill('?').join(',')}) ON CONFLICT(url) DO NOTHING`).bind(...values(t),language,t.event_key,t.related_urls,at).run();
   if(r.meta.changes){prior.push(t);remaining--;queue.added++;}
 }
 for(const {source,items,error,eligible,added:addedSource,updated:updatedSource,duplicates:duplicatesSource} of queues){
  const result={id:source.id,ok:!error,added:addedSource,updated:updatedSource,duplicates:duplicatesSource,count:items.length,eligible:eligible.length,...(error?{error}:{})};results.push(result);added+=addedSource;updated+=updatedSource;duplicates+=duplicatesSource;
  const message=error?'来源暂时无法读取，旧资料保留':`读取 ${items.length} 条，${source.language==='zh'?'中文':'外文'} AI 候选 ${eligible.length} 条；新增 ${addedSource}，更新旧题 ${updatedSource}，重复归并 ${duplicatesSource}`;
  await db().prepare(`INSERT INTO source_status(id,last_attempt,last_success,state,message,item_count) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_attempt=excluded.last_attempt,last_success=COALESCE(excluded.last_success,source_status.last_success),state=excluded.state,message=excluded.message,item_count=excluded.item_count`).bind(source.id,at,error?null:at,error?'error':'ok',message,eligible.length).run();
 }
 await db().batch([db().prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('last_refresh',at),db().prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('daily_topics_'+day,String(DAILY_TOPIC_LIMIT-remaining))]);
 return {cooldown:false,added,updated,duplicates,limit:DAILY_TOPIC_LIMIT,remaining,checkedAt:at,results};
 }finally{await db().prepare("UPDATE app_state SET value=? WHERE key='refresh_lock'").bind(String(Date.now()+60000)).run()}
}
function normalizedDifference(a:string,b:string){return a.replace(/[^\p{L}\p{N}]/gu,'')!==b.replace(/[^\p{L}\p{N}]/gu,'')}
