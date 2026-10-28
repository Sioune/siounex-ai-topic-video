import {db} from './store';
import {hash,ProductionError} from './production-contract';
import {topicId} from './feed';

export const ORIGINAL_SOURCE_ID='owner-original';
const ORIGIN='https://siounex-ai-topic-library.siounexzhao.chatgpt.site';
type SourceRef={library_file_id:string;version:number;file_name:string};
export type OriginalVersion={version:number;title:string;summary:string;draft:string;draft_sha256:string;pending_claims:string;verified_notes:string;history_note:string;created_at:string};
export type OriginalRecord={schema:'owner-original-v1';id:string;owner_id:string;original_text:string;original_sha256:string;description_date:string|null;source_refs:SourceRef[];created_at:string;updated_at:string;version:number;topic:{id:string;url:string};versions:OriginalVersion[]};
type Stored=Omit<OriginalRecord,'versions'>;
type State={value:Stored;raw:string};
type Receipt={id:string;payload_hash:string;commit_token:string};
export type FrozenOriginal=OriginalVersion&{schema:'frozen-owner-original-v1';id:string;owner_id:string;original_text:string;original_sha256:string;description_date:string|null;source_refs:SourceRef[];source_kind:'owner-original-not-external-news'};
const currentKey=(id:string)=>'owner_original_v1:'+id;
const versionKey=(id:string,v:number)=>'owner_original_version_v1:'+id+':'+String(v).padStart(4,'0');
const mappingKey=(id:string)=>'owner_original_topic_v1:'+id;
const now=()=>new Date().toISOString();
function object(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v))throw new ProductionError('原创资料格式无效',400);return v as Record<string,unknown>}
function exact(v:unknown,max:number,min=0){if(typeof v!=='string'||v.length>max||v.trim().length<min)throw new ProductionError('原创文字为空或超出长度限制',400);return v}
function identifier(v:unknown){const id=exact(v,80,1);if(!/^original_[a-f0-9]{64}$/.test(id))throw new ProductionError('原创资料ID无效',400);return id}
function only(b:Record<string,unknown>,keys:string[]){if(Object.keys(b).some(k=>!keys.includes(k)))throw new ProductionError('原创请求包含不支持的字段',400)}
function editable(v:unknown){const b=object(v);only(b,['title','summary','draft','pending_claims','verified_notes','history_note']);return {title:exact(b.title,250,1),summary:exact(b.summary,2000,1),draft:exact(b.draft,100000),pending_claims:exact(b.pending_claims??'',20000),verified_notes:exact(b.verified_notes??'',20000),history_note:exact(b.history_note??'',10000)}}
function sourceRefs(v:unknown):SourceRef[]{if(v===undefined)return [];if(!Array.isArray(v)||v.length>10)throw new ProductionError('来源记录过多',400);return v.map(value=>{const b=object(value);only(b,['library_file_id','version','file_name']);const id=exact(b.library_file_id,100,1);if(!/^libfile[_-][a-zA-Z0-9_-]+$/.test(id)||!Number.isInteger(b.version)||Number(b.version)<0)throw new ProductionError('Library来源标识或版本无效',400);return {library_file_id:id,version:Number(b.version),file_name:exact(b.file_name,300,1)}})}
function descriptionDate(v:unknown){if(v===undefined||v===null||v==='')return null;const s=exact(v,10,1);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw new ProductionError('说明日期无效',400);return s}
function canonical(v:unknown):string{if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(v)}
export function originalCanonicalUrl(id:string){return ORIGIN+'/originals?id='+encodeURIComponent(identifier(id))}
async function load(id:string,owner?:string):Promise<State>{identifier(id);const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(currentKey(id)).first<{value:string}>();if(!row)throw new ProductionError('原创资料不存在',404);const value=JSON.parse(row.value) as Stored;if(!owner||value.owner_id!==owner)throw new ProductionError('仅资料本人可读取或修改',403);return {value,raw:row.value}}
async function version(state:Stored,v:number){const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(versionKey(state.id,v)).first<{value:string}>();if(!row)throw new ProductionError('原创资料版本不存在',409);return JSON.parse(row.value) as OriginalVersion}
export async function getOriginal(id:string,owner:string):Promise<OriginalRecord>{const {value}=await load(id,owner),prefix='owner_original_version_v1:'+id+':',rows=await db().prepare('SELECT value FROM app_state WHERE key>=? AND key<? ORDER BY key LIMIT 100').bind(prefix,prefix+'\uffff').all<{value:string}>();return {...value,versions:rows.results.map(r=>JSON.parse(r.value) as OriginalVersion)}}
export async function listOriginals(owner:string){exact(owner,200,1);const prefix='owner_original_v1:',rows=await db().prepare("SELECT value FROM app_state WHERE key>=? AND key<? AND json_extract(value,'$.owner_id')=? ORDER BY json_extract(value,'$.updated_at') DESC LIMIT 30").bind(prefix,prefix+'\uffff',owner).all<{value:string}>();return Promise.all(rows.results.map(async row=>{const v=JSON.parse(row.value) as Stored;return {...v,versions:[await version(v,v.version)]}}))}
async function request(owner:string,id:unknown,operation:string,payload:unknown){exact(owner,200,1);return {key:'owner_original_request_v1:'+await hash(owner+'\n'+exact(id,120,1)),payload_hash:await hash(canonical({operation,payload}))}}
async function replay(r:{key:string;payload_hash:string}){const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(r.key).first<{value:string}>();if(!row)return null;const value=JSON.parse(row.value) as Receipt;if(value.payload_hash!==r.payload_hash)throw new ProductionError('同一请求编号不能更改原创资料内容',409);return value}
async function response(id:string,owner:string,replayed=false,duplicate=false){return {original:await getOriginal(id,owner),replayed,duplicate}}
async function confirmCreatedContent(id:string,owner:string,input:ReturnType<typeof editable>,date:string|null,refs:SourceRef[]){const record=await getOriginal(id,owner);if(record.description_date!==date||canonical(record.source_refs)!==canonical(refs)||!record.versions.some(v=>canonical({title:v.title,summary:v.summary,draft:v.draft,pending_claims:v.pending_claims,verified_notes:v.verified_notes,history_note:v.history_note})===canonical(input)))throw new ProductionError('完整原文已存在；这份新草稿尚未保存。请打开已有材料并编辑另存，当前输入保留',409)}
async function makeVersion(input:ReturnType<typeof editable>,v:number):Promise<OriginalVersion>{return {...input,version:v,draft_sha256:await hash(input.draft),created_at:now()}}
const risk='本人原创产品说明与报道草稿；功能描述不等于实测结果，公开发布日期未知。制作、媒体与发布仍需既有审核。';
export async function createOriginal(owner:string,b:Record<string,unknown>){
 const input=object(b.input);only(input,['title','summary','draft','pending_claims','verified_notes','history_note','original_text','description_date','source_refs']);
 const {original_text:_o,description_date:_d,source_refs:_s,...edit}=input,content=editable(edit),original_text=exact(input.original_text,100000,1),description_date=descriptionDate(input.description_date),source_refs=sourceRefs(input.source_refs);
 const normalized={...content,original_text,description_date,source_refs},r=await request(owner,b.request_id,'create',normalized),old=await replay(r);if(old){await confirmCreatedContent(old.id,owner,content,description_date,source_refs);return response(old.id,owner,true)}
 const original_sha256=await hash(original_text),id='original_'+await hash(owner+'\n'+original_sha256),url=originalCanonicalUrl(id),topic={id:await topicId(url),url},v=await makeVersion(content,1),time=v.created_at,value:Stored={schema:'owner-original-v1',id,owner_id:owner,original_text,original_sha256,description_date,source_refs,created_at:time,updated_at:time,version:1,topic},raw=JSON.stringify(value),receipt=JSON.stringify({id,payload_hash:r.payload_hash,commit_token:crypto.randomUUID()}),gate='EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?)',args=[r.key,receipt],createdGate=gate+' AND EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?)',createdArgs=[...args,currentKey(id),raw];
 const present=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(currentKey(id)).first<{value:string}>();if(present)await confirmCreatedContent(id,owner,content,description_date,source_refs);
 const result=await db().batch([
  db().prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING').bind(r.key,receipt),
  db().prepare(`INSERT INTO app_state(key,value) SELECT ?,? WHERE ${gate} ON CONFLICT(key) DO NOTHING`).bind(currentKey(id),raw,...args),
  db().prepare(`INSERT INTO app_state(key,value) SELECT ?,? WHERE ${createdGate} ON CONFLICT(key) DO NOTHING`).bind(versionKey(id,1),JSON.stringify(v),...createdArgs),
  db().prepare(`INSERT INTO topics(id,url,source_id,source,title,original_title,summary,published_at,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang,event_key,related_urls,updated_at) SELECT ?,?,?,?, ?,?,?,NULL,?,'AI实用',60,'待核实',?,?,?, ?,0,'zh',?,'[]',? WHERE ${createdGate} ON CONFLICT(id) DO NOTHING`).bind(topic.id,url,ORIGINAL_SOURCE_ID,'本人原创 · 产品说明',v.title,v.title,v.summary,time,v.summary,'从具体观众问题出发，区分产品说明、待核功能与实测证据。','完整原文与编辑草稿已保存；同项目真实录屏、日志与素材权利仍需核对。',risk,'owner-original:'+id,time,...createdArgs),
  db().prepare(`INSERT INTO app_state(key,value) SELECT ?,? WHERE ${createdGate} ON CONFLICT(key) DO NOTHING`).bind(mappingKey(topic.id),JSON.stringify({id,owner_id:owner,topic_id:topic.id}),...createdArgs)
 ]);
 if(!result[0].meta.changes){const previous=await replay(r);if(!previous)throw new ProductionError('保存回执待核对，请读取后重试同一请求',409);await confirmCreatedContent(previous.id,owner,content,description_date,source_refs);return response(previous.id,owner,true)}
 if(!result[1].meta.changes)await confirmCreatedContent(id,owner,content,description_date,source_refs);
 return response(id,owner,false,!result[1].meta.changes);
}
export async function editOriginal(id:string,owner:string,b:Record<string,unknown>){
 const input=editable(b.input),r=await request(owner,b.request_id,'edit',{id,expected_version:b.expected_version,input}),old=await replay(r);if(old)return response(old.id,owner,true);
 const state=await load(id,owner);if(b.expected_version!==state.value.version)throw new ProductionError('资料已有新版本；请读回核对，当前编辑保留',409);if(state.value.version>=100)throw new ProductionError('资料版本已达100版，请先归档核对',409);
 const v=await makeVersion(input,state.value.version+1),next={...state.value,version:v.version,updated_at:v.created_at},receipt=JSON.stringify({id,payload_hash:r.payload_hash,commit_token:crypto.randomUUID()}),gate='EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?)',args=[r.key,receipt];
 const rows=await db().batch([
  db().prepare('INSERT INTO app_state(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?) ON CONFLICT(key) DO NOTHING').bind(r.key,receipt,currentKey(id),state.raw),
  db().prepare(`UPDATE app_state SET value=? WHERE key=? AND value=? AND ${gate}`).bind(JSON.stringify(next),currentKey(id),state.raw,...args),
  db().prepare(`INSERT INTO app_state(key,value) SELECT ?,? WHERE ${gate}`).bind(versionKey(id,v.version),JSON.stringify(v),...args),
  db().prepare(`UPDATE topics SET title=?,original_title=?,summary=?,highlight=?,updated_at=? WHERE id=? AND source_id=? AND ${gate}`).bind(v.title,v.title,v.summary,v.summary,v.created_at,state.value.topic.id,ORIGINAL_SOURCE_ID,...args)
 ]);
 if(!rows[0].meta.changes){const previous=await replay(r);if(previous)return response(previous.id,owner,true);throw new ProductionError('保存时版本发生变化；未覆盖已有资料，请读回核对',409)}
 return response(id,owner);
}
export async function frozenOriginalForTopic(topic:Record<string,unknown>,owner?:string|null):Promise<FrozenOriginal|null>{
 if(topic.source_id!==ORIGINAL_SOURCE_ID)return null;if(!owner)throw new ProductionError('本人原创资料仅可由本人关联制作',403);
 const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(mappingKey(String(topic.id))).first<{value:string}>();if(!row)throw new ProductionError('原创选题缺少资料绑定',409);const binding=JSON.parse(row.value);if(binding.owner_id!==owner||binding.topic_id!==topic.id)throw new ProductionError('原创资料归属不匹配',403);
 const {value}=await load(binding.id,owner);if(value.topic.id!==topic.id||value.topic.url!==topic.url)throw new ProductionError('原创选题绑定已变化',409);const v=await version(value,value.version);
 if(await hash(value.original_text)!==value.original_sha256||await hash(v.draft)!==v.draft_sha256)throw new ProductionError('原创原文或草稿校验失败',409);
 return {...v,schema:'frozen-owner-original-v1',id:value.id,owner_id:owner,original_text:value.original_text,original_sha256:value.original_sha256,description_date:value.description_date,source_refs:value.source_refs,source_kind:'owner-original-not-external-news'};
}
export async function materializedOriginal(snapshot:Record<string,unknown>,owner?:string){
 if(snapshot.source_id!==ORIGINAL_SOURCE_ID)return null;const frozen=object(snapshot.original) as unknown as FrozenOriginal;
 if(frozen.schema!=='frozen-owner-original-v1'||frozen.source_kind!=='owner-original-not-external-news'||!frozen.owner_id||owner&&frozen.owner_id!==owner||snapshot.url!==originalCanonicalUrl(frozen.id)||!Number.isInteger(frozen.version)||frozen.version<1||await hash(exact(frozen.original_text,100000,1))!==frozen.original_sha256||await hash(exact(frozen.draft,100000))!==frozen.draft_sha256)throw new ProductionError('冻结原创资料绑定或字节校验失败',409);
 const content=canonical({schema:'owner-original-source-packet-v1',original:frozen,boundary:'用户原创产品说明及候选草稿。功能均按说明归属，待核项不是实测。说明日期不是公开发布日期。完整原稿中的历史状态保留为引用，不代表当前站点状态。未授予媒体生成或发布批准。'});
 return {url:String(snapshot.url),content,sha256:await hash(content),retrieved_at:frozen.created_at,complete_response:true,source_kind:ORIGINAL_SOURCE_ID,original:frozen,scope:'Complete frozen owner original and draft; not external news, product test results, media generation or publication approval'};
}
