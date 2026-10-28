// Exact bootstrap for unacknowledged read-only discovery. These helpers inspect
// actual completed CUA arguments/results, never a child-authored observation.
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(v);
const texts=r=>r?.isError===true||!Array.isArray(r?.content)?[]:r.content.filter(c=>c.type==='text'&&typeof c.text==='string').map(c=>c.text);
export const STUDIO_DIRECT_BROWSER_SELECT_CODE="let browser=await cua.getBrowser({url:'https://app.heygen.com/projects'});";
export const STUDIO_DIRECT_BROWSER_INVENTORY_CODE="let studioSelectedBrowserId=String(browser.browserId);let studioBrowserInventory=await cua.listBrowsers({emit:false});nodeRepl.write(JSON.stringify({selected_browser_id:studioSelectedBrowserId,browsers:studioBrowserInventory}));let studioSelectedChrome=studioBrowserInventory.filter(b=>String(b.id)===studioSelectedBrowserId);if(studioSelectedChrome.length!==1||!['extension','cdp'].includes(studioSelectedChrome[0].type)||!(studioSelectedChrome[0].family?String(studioSelectedChrome[0].family).toLowerCase()==='chrome':['chrome','google chrome'].includes(String(studioSelectedChrome[0].name||'').toLowerCase())))throw new Error('Selected Chrome browser identity unavailable');let chromeId=studioSelectedBrowserId;";
export const STUDIO_DIRECT_CREATE_CODE="let tab=await cua.createBrowserTab(chromeId,'about:blank',{sessionName:'🎙️ 本人声音缓存'});";
export const STUDIO_DIRECT_PROJECTS_NAVIGATION_CODE="await tab.goto('https://app.heygen.com/projects');";
export const STUDIO_DIRECT_PENDING_ENTRY_URL='https://app.heygen.com/create-v4/draft?vt=l&panel=scene';
export const STUDIO_DIRECT_PROJECTS_READ_CODE='await tab.getAXState();';
export function studioDirectNavigationCode(kind='projects'){if(kind==='projects')return STUDIO_DIRECT_PROJECTS_NAVIGATION_CODE;if(kind==='pending-preparation')return `await tab.goto('${STUDIO_DIRECT_PENDING_ENTRY_URL}');`;throw Error('STUDIO_DIRECT_TARGET_INVALID');}
export function studioDirectInventoryCode(input){return `let createdTemporaryPage=true;let studioChromeTabs=await cua.listTabs({browser:chromeId,emit:false});nodeRepl.write(JSON.stringify(studioChromeTabs));let studioOwnedRows=studioChromeTabs.filter(t=>String(t.id)===String(tab.id));if(studioOwnedRows.length!==1||studioOwnedRows[0].browserId!==chromeId)throw new Error('Created Chrome page identity unavailable');nodeRepl.write('STUDIO_TEMP_PAGE_V1:'+JSON.stringify({schema:'studio-temp-page-v1',request_id:${JSON.stringify(input.request_id)},attempt_id:${JSON.stringify(input.browser_attempt_id||input.attempt_id)},browser_id:chromeId,tab_id:String(tab.id),created_temporary_page:true}));`;}
export function parseStudioDirectBrowserInventory(result){
 const values=texts(result).flatMap(text=>{try{const value=JSON.parse(text.trim());return value&&typeof value==='object'&&!Array.isArray(value)?[value]:[];}catch{return[];}});if(values.length!==1)return null;const value=values[0];
 if(Object.keys(value).sort().join()!=='browsers,selected_browser_id'||!id(value.selected_browser_id)||!Array.isArray(value.browsers)||value.browsers.length<1||value.browsers.length>64)return null;
 const seen=new Set();for(const row of value.browsers){if(!row||Array.isArray(row)||!id(row.id)||seen.has(row.id)||row.name!=null&&typeof row.name!=='string'||row.family!=null&&typeof row.family!=='string'||row.type!=null&&typeof row.type!=='string')return null;seen.add(row.id);}
 const selected=value.browsers.filter(row=>row.id===value.selected_browser_id);if(selected.length!==1)return null;const row=selected[0];
 if(!['extension','cdp'].includes(row.type)||!(row.family?row.family.toLowerCase()==='chrome':['chrome','google chrome'].includes(String(row.name||'').toLowerCase())))return null;
 return {browser_id:row.id,browser_family_verified:true,browser_count:value.browsers.length,inventory_sha256:sha(value.browsers)};
}
function actualPage(result){
 const matches=texts(result).flatMap(text=>[...text.matchAll(/^Browser tab:\s*([0-9]{1,20}), Title:\s*"(?:[^"\\]|\\.)*", URL:\s*("(?:[^"\\]|\\.)*")(?:, Site Specific Instructions:\s*"(?:[^"\\]|\\.)*")?\./gm)]);
 if(matches.length!==1)return null;let url;try{url=new URL(JSON.parse(matches[0][2]));}catch{return null;}
 return {tab_id:matches[0][1],url};
}
const blank=url=>url.href==='about:blank';
export function parseStudioDirectCreatedTab(result){
 const page=actualPage(result);if(!page||!blank(page.url))return null;
 return {tab_id:page.tab_id,page_kind:'about-blank',url_sha256:sha(page.url.href)};
}
export function parseStudioDirectTargetPage(result,created,{kind='projects',forbidden_draft_ids=[]}={}){
 const page=actualPage(result);if(!page||page.tab_id!==created?.tab_id||page.url.origin!=='https://app.heygen.com'||page.url.username||page.url.password||page.url.hash)return null;
 if(kind==='projects'){if(!['/projects','/projects/'].includes(page.url.pathname)||page.url.search)return null;return {tab_id:page.tab_id,origin:page.url.origin,projects_path_verified:true,url_sha256:sha(page.url.href)};}
 if(kind!=='pending-preparation')return null;
 const match=page.url.pathname.match(/^\/create-v4\/([a-f0-9]{32})$/),generic=/^\/create-v4\/draft\/?$/.test(page.url.pathname);
 if(!generic&&!match||match&&forbidden_draft_ids.includes(match[1]))return null;
 const params=[...page.url.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b));if(params.length&&JSON.stringify(params)!==JSON.stringify([['panel','scene'],['vt','l']]))return null;
 return {tab_id:page.tab_id,origin:page.url.origin,pending_entry_verified:generic,observed_draft_id:match?.[1]||null,url_sha256:sha(page.url.href)};
}
export const parseStudioDirectProjectsPage=(result,created)=>parseStudioDirectTargetPage(result,created);
function arrayPrefix(text){
 const value=text.trim();if(!value.startsWith('['))return null;let depth=0,string=false,escape=false;
 for(let i=0;i<value.length;i++){const c=value[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;}else if(c==='"')string=true;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}')if(--depth===0){const tail=value.slice(i+1).trim();if(tail&&!tail.startsWith('STUDIO_TEMP_PAGE_V1:'))return null;try{return JSON.parse(value.slice(0,i+1));}catch{return null;}}}return null;
}
export function parseStudioDirectInventory(result,created,selected){
 if(!created||!id(created.tab_id))return null;
 const arrays=texts(result).map(arrayPrefix).filter(Array.isArray);if(arrays.length!==1)return null;const rows=arrays[0];if(rows.length<1||rows.length>512)return null;
 const seen=new Set(),parsed=[];for(const row of rows){
  if(!row||Array.isArray(row)||!id(String(row.id||''))||typeof row.browserId!=='string'||!id(row.browserId)||typeof row.url!=='string'||seen.has(String(row.id)))return null;
  let url;try{url=new URL(row.url);}catch{return null;}seen.add(String(row.id));parsed.push({tab_id:String(row.id),browser_id:row.browserId,origin:url.origin,pathname:url.pathname,has_query_or_hash:!!(url.search||url.hash),url_sha256:sha(url.href)});
 }
 const owned=parsed.filter(row=>row.tab_id===created.tab_id);if(owned.length!==1||parsed.some(row=>row.browser_id!==owned[0].browser_id)||selected&&owned[0].browser_id!==selected.browser_id)return null;
 if(owned[0].url_sha256!==sha('about:blank'))return null;
 const generic_editor_absent=!parsed.some(row=>row.origin==='https://app.heygen.com'&&/^\/create-v4\/draft\/?$/.test(row.pathname));
 return {tab_id:created.tab_id,browser_id:owned[0].browser_id,inventory_readable:true,tab_count:rows.length,inventory_sha256:sha(parsed),generic_editor_absent};
}
