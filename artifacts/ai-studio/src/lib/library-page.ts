import {db,ensureSeeds,sources} from './store';
import {viewFromUrl,validTopicId} from './topic-navigation';
import type {Topic} from './types';

// A separate paginated read model. The legacy library() API is deliberately unchanged.
export async function libraryPage(userId:string,url:URL,now=Date.now()){
 await ensureSeeds();const view=viewFromUrl(url),parsedOffset=Number(url.searchParams.get('offset')||0),parsedLimit=Number(url.searchParams.get('limit')||18),offset=Number.isSafeInteger(parsedOffset)?Math.max(0,parsedOffset):0,limit=Number.isSafeInteger(parsedLimit)?Math.max(1,Math.min(100,parsedLimit)):18;
 const base="FROM topics t LEFT JOIN favorites f ON f.topic_id=t.id AND f.user_id=? LEFT JOIN dispositions d ON d.topic_id=t.id AND d.user_id=?",args:any[]=[userId,userId],where:string[]=[];
 if(view.tab==='legacy')where.push("COALESCE(t.content_lang,'zh')<>'zh'");else if(view.tab==='saved')where.push('f.topic_id IS NOT NULL');else if(view.tab==='rejected'||view.tab==='produced'){where.push("COALESCE(d.status,'pending')=?");args.push(view.tab);}else where.push("COALESCE(d.status,'pending')='pending'");
 const query=view.q.trim().toLowerCase(),unicodeCase=Array.from(query).some(c=>c.codePointAt(0)!>127&&c.toLowerCase()!==c.toUpperCase());
 if(query&&!unicodeCase){where.push("instr(lower(COALESCE(t.title,'')||' '||COALESCE(t.original_title,'')||' '||COALESCE(t.summary,'')||' '||COALESCE(t.source,'')||' '||COALESCE(t.angle,'')),?)>0");args.push(query);}
 if(view.category!=='all'){where.push('t.category=?');args.push(view.category);}if(view.material!=='all'){where.push('t.material=?');args.push(view.material);}
 if(view.time==='unknown')where.push("COALESCE(t.published_at,'')=''");else if(view.time==='longtail'){where.push('t.published_at IS NOT NULL AND julianday(?) - julianday(t.published_at)>90');args.push(new Date(now).toISOString());}else if(view.time!=='all'){where.push('t.published_at IS NOT NULL AND julianday(?) - julianday(t.published_at) BETWEEN -1 AND ?');args.push(new Date(now).toISOString(),Number(view.time));}
 const random=url.searchParams.get('random')==='1';if(random)where.push("COALESCE(d.status,'pending') NOT IN ('rejected','produced')");
 const predicate=where.length?' WHERE '+where.join(' AND '):'',ordering=random?'random()':view.sort==='score'?"t.score DESC,COALESCE(t.published_at,'') DESC,COALESCE(t.updated_at,t.published_at) DESC,t.rowid ASC":"COALESCE(t.published_at,'') DESC,COALESCE(t.updated_at,t.published_at) DESC,t.rowid ASC",columns="t.*, CASE WHEN f.topic_id IS NULL THEN 0 ELSE 1 END AS favorite,COALESCE(d.status,'pending') AS disposition";
 // D1's SQLite lower() folds ASCII only. For cased non-ASCII searches, scan
 // just the search fields server-side and page the matching ids, matching the
 // existing JS toLowerCase semantics without returning the entire history.
 const result=unicodeCase?(async()=>{const candidates=await db().prepare(`SELECT t.id,t.title,t.original_title,t.summary,t.source,t.angle ${base}${predicate} ORDER BY ${ordering}`).bind(...args).all<{id:string;title:string;original_title:string;summary:string;source:string;angle:string}>(),matches=candidates.results.filter(t=>[t.title,t.original_title,t.summary,t.source,t.angle].join(' ').toLowerCase().includes(query)),ids=matches.slice(offset,offset+limit).map(t=>t.id);if(!ids.length)return{page:[] as Topic[],total:matches.length};const rows=await db().prepare(`SELECT ${columns} ${base} WHERE t.id IN (${ids.map(()=>'?').join(',')})`).bind(userId,userId,...ids).all<Topic>(),byId=new Map(rows.results.map(row=>[row.id,row]));return{page:ids.map(id=>byId.get(id)!).filter(Boolean),total:matches.length};})():(async()=>{const [rows,count]=await Promise.all([db().prepare(`SELECT ${columns} ${base}${predicate} ORDER BY ${ordering} LIMIT ? OFFSET ?`).bind(...args,limit,offset).all<Topic>(),db().prepare(`SELECT count(*) AS value ${base}${predicate}`).bind(...args).first<{value:number}>()]);return{page:rows.results,total:Number(count?.value||0)};})();
 const detailId=url.searchParams.get('topic');const [paged,counts,detail,status,updated]=await Promise.all([
  result,
  db().prepare(`SELECT count(*) AS total,COALESCE(sum(CASE WHEN COALESCE(d.status,'pending')='pending' THEN 1 ELSE 0 END),0) AS pending,COALESCE(sum(CASE WHEN d.status='rejected' THEN 1 ELSE 0 END),0) AS rejected,COALESCE(sum(CASE WHEN f.topic_id IS NOT NULL THEN 1 ELSE 0 END),0) AS saved,COALESCE(sum(CASE WHEN t.published_at IS NOT NULL AND julianday(?) - julianday(t.published_at)<=7 THEN 1 ELSE 0 END),0) AS fresh ${base}`).bind(new Date(now).toISOString(),userId,userId).first<{total:number;pending:number;rejected:number;saved:number;fresh:number}>(),
  validTopicId(detailId)?db().prepare(`SELECT ${columns} ${base} WHERE t.id=?`).bind(userId,userId,detailId).first<Topic>():Promise.resolve(null),
  db().prepare('SELECT * FROM source_status').all(),db().prepare('SELECT value FROM app_state WHERE key=?').bind('last_refresh').first<{value:string}>()
 ]);
 return {topics:paged.page,total:paged.total,offset,limit,counts,detail:detail||null,sources:sources.map(s=>({...s,last_attempt:null,last_success:null,state:'pending',message:'尚未采集',item_count:0,...status.results.find(v=>v.id===s.id)})),updatedAt:updated?.value??null,serverNow:new Date(now).toISOString()};
}
