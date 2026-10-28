'use client';

import './research-design.css';
import './original-design.css';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,ChevronRight,FilePenLine,Plus,RefreshCw,Save,SquarePen} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {ProductionAction} from './production-desk';

type Fields={title:string;summary:string;draft:string;pending_claims:string;verified_notes:string;history_note:string};
type Version=Fields&{version:number;created_at:string;draft_sha256:string};
type OriginalRecord={schema:'owner-original-v1';id:string;owner_id:string;original_text:string;original_sha256:string;description_date:string|null;source_refs:{library_file_id:string;version:number;file_name:string}[];created_at:string;updated_at:string;version:number;topic:{id:string;url:string};versions:Version[]};
type Composer=Fields&{original_text:string;description_date:string;source_ref_text:string};
type Editor=Fields&{expected_version:number;base:string};
type Mutation={kind:'create'|'edit';body:Record<string,unknown>;id?:string};
const pendingKey='siounex-originals-pending-v1';
const empty=():Composer=>({title:'',summary:'',original_text:'',draft:'',description_date:'',source_ref_text:'',pending_claims:'产品功能来自本人说明，尚待真实项目逐项核验。',verified_notes:'',history_note:''});
const date=(value:string|null|undefined)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未提供';
const signature=(value:Fields)=>JSON.stringify([value.title,value.summary,value.draft,value.pending_claims,value.verified_notes,value.history_note]);
function route(id:string|null,version?:number){const url=new URL(window.location.href);if(id)url.searchParams.set('id',id);else url.searchParams.delete('id');if(version)url.searchParams.set('version',String(version));else url.searchParams.delete('version');window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash)}
class ApiError extends Error {constructor(message:string,public status:number){super(message)}}
async function api<T>(path='',body?:Record<string,unknown>):Promise<T>{const response=await fetch('/api/originals'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(30000)});const value=await response.json() as {error?:string};if(!response.ok)throw new ApiError(value.error||'材料操作未完成，请读回核对。',response.status);return value as T}
function validMutation(value:unknown):value is Mutation{if(!value||typeof value!=='object')return false;const item=value as Mutation;return ['create','edit'].includes(item.kind)&&!!item.body&&typeof item.body.request_id==='string'&&item.body.action===item.kind}

export default function OriginalDesk(){
 const [composer,setComposer]=useState<Composer>(empty),[records,setRecords]=useState<OriginalRecord[]>([]),[record,setRecord]=useState<OriginalRecord|null>(null),[selected,setSelected]=useState<string|null>(null),[view,setView]=useState<number|null>(null);
 const [editor,setEditor]=useState<Editor|null>(null),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[busy,setBusy]=useState(false),[fileReading,setFileReading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [pending,setPending]=useState<Mutation|null>(null),[checked,setChecked]=useState(false),[productionOpen,setProductionOpen]=useState(false);
 const alive=useRef(true),busyRef=useRef(false),selection=useRef<string|null>(null),sequence=useRef(0);
 const version=record?.versions.find(item=>item.version===(view??record.version));
 const dirty=!!editor&&signature(editor)!==editor.base;
 const composerDirty=JSON.stringify(composer)!==JSON.stringify(empty());
 const locked=busy||fileReading||!!pending;

 const readHistory=useCallback(async()=>{const result=await api<{originals:OriginalRecord[]}>();if(!Array.isArray(result.originals))throw Error('材料列表回执不完整');if(alive.current){setRecords(result.originals);setLoading(false)}return result.originals},[]);
 const readDetail=useCallback(async(id:string)=>{const current=++sequence.current;setDetailLoading(true);try{const result=await api<{original:OriginalRecord}>('?id='+encodeURIComponent(id));if(!result.original?.id)throw Error('材料记录回执不完整');if(alive.current&&selection.current===id&&current===sequence.current)setRecord(result.original);return result.original}finally{if(alive.current&&current===sequence.current)setDetailLoading(false)}},[]);
 const readBack=useCallback(async()=>{try{await readHistory();if(selection.current)await readDetail(selection.current);if(alive.current){setChecked(true);setError('');setNotice('已读回站内记录。待确认的保存可使用原请求编号重试。')}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'读取未完成')}},[readHistory,readDetail]);
 useEffect(()=>{alive.current=true;readHistory().catch(e=>{if(alive.current){setError(e.message);setLoading(false)}});const params=new URLSearchParams(window.location.search),id=params.get('id'),v=Number(params.get('version'));if(id){selection.current=id;setSelected(id);if(Number.isInteger(v)&&v>0)setView(v);readDetail(id).catch(e=>{if(alive.current)setError(e.message)})}try{const saved=window.sessionStorage.getItem(pendingKey);if(saved){const value:unknown=JSON.parse(saved);if(validMutation(value)){setPending(value);setError('上次保存尚待核对。请先读回记录，再使用原请求编号重试。')}}}catch{}return()=>{alive.current=false;sequence.current++}},[readHistory,readDetail]);
 useEffect(()=>{if(!dirty&&!composerDirty&&!pending)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[dirty,composerDirty,pending]);

 function choose(id:string|null){if(locked){setError('先处理当前保存或待确认请求，再切换材料。');return}if(dirty||(!selected&&composerDirty)){setError('有未保存内容。请先保存，或明确放弃内容，再切换材料。');return}sequence.current++;selection.current=id;setSelected(id);setRecord(null);setEditor(null);setView(null);setProductionOpen(false);setError('');setNotice('');route(id);if(id)readDetail(id).catch(e=>setError(e.message));else setDetailLoading(false)}
 function chooseVersion(number:number){if(locked||dirty){setError('先保存或放弃编辑，再切换版本。');return}setView(number);setEditor(null);setProductionOpen(false);if(selected)route(selected,number)}
 function remember(action:Mutation|null){try{if(action)window.sessionStorage.setItem(pendingKey,JSON.stringify(action));else window.sessionStorage.removeItem(pendingKey)}catch{}}
 async function perform(action:Mutation){
  if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('');remember(action);
  try{const result=await api<{original:OriginalRecord;duplicate?:boolean;replayed?:boolean}>('',action.body);if(!result.original?.id||!result.original.topic?.id)throw Error('保存回执缺少材料或选题身份');if(!alive.current)return;remember(null);setPending(null);setChecked(false);selection.current=result.original.id;sequence.current++;setSelected(result.original.id);setRecord(result.original);setView(result.original.version);setEditor(null);setComposer(empty());setProductionOpen(false);route(result.original.id,result.original.version);setNotice(action.kind==='edit'?'已另存新版本，完整原文和历史草稿仍保留。':result.duplicate?'检测到相同原文，已打开原有材料与选题。':'原创材料和选题已保存，未启动制作。');await readHistory().catch(e=>setError('保存已获回执，列表刷新未完成：'+e.message))}
  catch(e){if(!alive.current)return;const message=e instanceof Error?e.message:'保存未完成';if(e instanceof ApiError&&e.status>=400&&e.status<500){remember(null);setPending(null);setError(message);if(selection.current)await readDetail(selection.current).catch(()=>{});await readHistory().catch(()=>{})}else{setPending(action);setChecked(false);setError('保存结果尚未确认，输入仍保留。先读回记录，再用同一请求编号重试。'+message)}}
  finally{busyRef.current=false;if(alive.current)setBusy(false)}
 }
 function create(event:React.FormEvent){event.preventDefault();if(locked)return;let source_refs:OriginalRecord['source_refs'];try{const lines=composer.source_ref_text.split('\n').map(line=>line.trim()).filter(Boolean);if(lines.length>10)throw Error('最多记录10份来源文件。');source_refs=lines.map((line,index)=>{const [library_file_id,number,...name]=line.split('|').map(value=>value.trim()),file_name=name.join(' | ');if(!/^libfile[_-][a-zA-Z0-9_-]+$/.test(library_file_id)||!/^\d+$/.test(number||'')||!file_name||file_name.length>300)throw Error('第'+(index+1)+'行来源格式无效，请按 Library文件ID | 版本号 | 文件名 填写。');return {library_file_id,version:Number(number),file_name}})}catch(e){setError(e instanceof Error?e.message:'来源记录格式无效');return}const {source_ref_text:_refs,...content}=composer,input={...content,description_date:composer.description_date||null,source_refs};perform({kind:'create',body:{action:'create',request_id:crypto.randomUUID(),input}})}
 function beginEdit(){if(!record||!version||locked)return;const fields:Fields={title:version.title,summary:version.summary,draft:version.draft,pending_claims:version.pending_claims,verified_notes:version.verified_notes,history_note:version.history_note};setEditor({...fields,expected_version:record.version,base:signature(fields)});setError('')}
 function saveEdit(event:React.FormEvent){event.preventDefault();if(!record||!editor||locked||!dirty)return;const {expected_version,base:_base,...input}=editor;perform({kind:'edit',id:record.id,body:{action:'edit',request_id:crypto.randomUUID(),id:record.id,expected_version,input}})}
 async function readFile(event:React.ChangeEvent<HTMLInputElement>,field:'original_text'|'draft',editing=false){const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>400000){setError('文件超过400 KB，请使用不超过100000字符的文本。');return}setFileReading(true);try{const value=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(value.length>100000)throw Error('文本超过100000字符，请缩减后再导入。');if(editing)setEditor(current=>current?{...current,draft:value}:null);else setComposer(current=>({...current,[field]:value}));setNotice('已读入文本，尚未保存到网站。');setError('')}catch(e){setError(e instanceof Error?e.message:'文件需为UTF-8文本')}finally{setFileReading(false)}}
 function fieldset(value:Fields,set:(patch:Partial<Fields>)=>void,editing=false){return <>
  <label>报道标题<Input aria-label="原创报道标题" required maxLength={250} value={value.title} onChange={event=>set({title:event.target.value})} disabled={locked}/></label>
  <label>选题摘要<Textarea aria-label="原创选题摘要" required maxLength={2000} rows={3} value={value.summary} onChange={event=>set({summary:event.target.value})} disabled={locked}/></label>
  <label>完整报道草稿与素材需求（可选）<Textarea aria-label="原创完整草稿" maxLength={100000} rows={18} value={value.draft} onChange={event=>set({draft:event.target.value})} disabled={locked}/></label>
  <input className="original-file" aria-label={editing?'从文本文件读取编辑草稿':'从文本文件读取草稿'} type="file" accept=".txt,.md,text/plain,text/markdown" disabled={locked} onChange={event=>readFile(event,'draft',editing)}/>
  <label>待核功能与证据缺口<Textarea aria-label="待核功能与证据缺口" rows={4} maxLength={12000} value={value.pending_claims} onChange={event=>set({pending_claims:event.target.value})} disabled={locked}/></label>
  <label>已核内容与对应证据<Textarea aria-label="已核内容与对应证据" rows={3} maxLength={12000} placeholder="未验证功能时留空。写清核验对象、范围和证据。" value={value.verified_notes} onChange={event=>set({verified_notes:event.target.value})} disabled={locked}/></label>
  <label>原稿历史说明<Textarea aria-label="原稿历史说明" rows={3} maxLength={10000} placeholder="例如：原稿内旧条数、当时未登录等属于历史背景。" value={value.history_note} onChange={event=>set({history_note:event.target.value})} disabled={locked}/></label>
 </>}

 return <main className="research-desk original-desk" aria-labelledby="original-title">
  <header className="research-heading"><div><h1 id="original-title">本人原创</h1><p>把本人产品说明、完整原文和报道草稿，保存为可继续编辑的选题材料。</p></div><Button variant="outline" disabled={locked} onClick={()=>choose(null)}><Plus size={17}/>录入新材料</Button></header>
  {error&&<div className="research-alert" role="alert"><p>{error}</p><Button variant="outline" disabled={busy||fileReading} onClick={readBack}><RefreshCw size={16}/>读回最新状态</Button></div>}
  {notice&&<p className="research-notice" role="status">{notice}</p>}
  {pending&&<section className="research-uncertain"><h2>保存结果待核对</h2><p>读取记录不会新建选题。核对后可重试原请求，服务器会检查重复提交。</p><div className="research-actions"><Button variant="outline" disabled={busy} onClick={readBack}>先读回状态</Button><Button disabled={busy||!checked} onClick={()=>perform(pending)}>重试同一请求</Button></div><small>请求编号：{String(pending.body.request_id)}</small></section>}
  <div className="original-layout" data-selected={!!selected}>
   <aside className="research-sidebar"><section className="research-history original-history" aria-label="本人原创材料历史"><div className="research-section-heading"><h2>我的原创材料</h2><button type="button" aria-label="刷新原创材料" disabled={busy} onClick={readBack}><RefreshCw size={17}/></button></div>{loading?<p className="research-helper">正在读取已保存材料…</p>:!records.length?<p className="research-helper">还没有已保存材料。录入完整原文和草稿后，会同时建立一个选题。</p>:<div className="research-history-list">{records.map(item=><button key={item.id} type="button" className={selected===item.id?'selected':''} aria-pressed={selected===item.id} disabled={locked} onClick={()=>choose(item.id)}><strong>{item.versions.find(v=>v.version===item.version)?.title||'本人原创材料'}</strong><span>本人原创 · v{item.version}</span><small>{date(item.updated_at)}</small></button>)}</div>}</section></aside>
   <section className="research-result" aria-label="原创材料与草稿">
    {!selected?<><h2><FilePenLine size={22}/> 录入本人原创材料</h2><p className="research-helper">这里保存本人提供的产品说明与草稿。功能描述按待核材料保留；保存不会启动制作、媒体生成或发布。</p><form className="original-form research-editor" onSubmit={create}>
     <label>完整原始产品说明<Textarea aria-label="完整原始产品说明" required maxLength={100000} rows={12} value={composer.original_text} onChange={event=>setComposer({...composer,original_text:event.target.value})} disabled={locked}/></label>
     <input className="original-file" aria-label="从文本文件读取原文" type="file" accept=".txt,.md,text/plain,text/markdown" disabled={locked} onChange={event=>readFile(event,'original_text')}/>
     <label>说明日期（可选）<Input aria-label="产品说明日期" type="date" value={composer.description_date} onChange={event=>setComposer({...composer,description_date:event.target.value})} disabled={locked}/></label><p className="research-helper">这是说明或整理日期。公开发布日期未知时保持未知。</p>
     <label>Library来源文件记录（可选，每行一份）<Textarea aria-label="Library来源文件记录" rows={3} maxLength={5000} placeholder="libfile_… | 1 | 完整产品说明.txt" value={composer.source_ref_text} onChange={event=>setComposer({...composer,source_ref_text:event.target.value})} disabled={locked}/></label><p className="research-helper">填写准确的文件ID、版本号和文件名，用于追溯本人提供的资料；不充当外部新闻来源。</p>
     {fieldset(composer,patch=>setComposer(current=>({...current,...patch})))}
     <div className="research-actions"><Button type="submit" disabled={locked||!composer.title.trim()||!composer.summary.trim()||!composer.original_text.trim()}><Save size={17}/>{busy?'正在保存…':'保存原创材料与选题'}</Button>{composerDirty&&<Button type="button" variant="outline" disabled={locked} onClick={()=>{setComposer(empty());setError('')}}>放弃未保存内容</Button>}</div>
    </form></>:detailLoading&&!record?<p>正在读取材料与版本…</p>:!record?<p>材料尚未读回。请读取最新状态。</p>:<>
     <div className="research-record-heading"><div><span className="research-status status-ready">本人原创 · 已入库</span><h2>{version?.title||'本人原创材料'}</h2></div><Button variant="outline" disabled={busy} onClick={readBack}><RefreshCw size={16}/>读取状态</Button></div>
     <p className="research-helper">当前入库状态：完整材料与选题已保存。产品说明、草稿与功能核验记录分别保留，保存动作不授予制作或发布批准。</p>
     <dl className="original-meta"><div><dt>说明日期</dt><dd>{record.description_date||'未提供'}（不是产品公开发布日期）</dd></div><div><dt>站内保存</dt><dd>{date(record.created_at)}<br/>最近版本：{date(record.updated_at)}</dd></div></dl>
     <div className="research-version-toolbar"><label>草稿版本<select aria-label="原创草稿版本" value={view??record.version} disabled={locked||!!editor} onChange={event=>chooseVersion(Number(event.target.value))}>{[...record.versions].sort((a,b)=>b.version-a.version).map(item=><option key={item.version} value={item.version}>v{item.version} · {date(item.created_at)}</option>)}</select></label>{version&&!editor&&<Button variant="outline" disabled={locked} onClick={beginEdit}><SquarePen size={16}/>编辑并另存</Button>}</div>
     {editor?<form className="research-editor" onSubmit={saveEdit}><h3>编辑并另存草稿</h3><p>完整原始说明保持原样。保存会新增草稿版本，继续关联同一选题。</p>{fieldset(editor,patch=>setEditor(current=>current?{...current,...patch}:null),true)}{editor.expected_version!==record.version&&<div className="research-stage"><p>站内已有更新。你的编辑仍保留；核对最新版本后，再更新保存基准。</p><Button type="button" variant="outline" onClick={()=>setEditor({...editor,expected_version:record.version})} disabled={locked}>保留编辑，更新保存基准</Button></div>}<div className="research-actions"><Button type="submit" disabled={locked||!dirty||editor.expected_version!==record.version}><Save size={16}/>另存草稿版本</Button><Button type="button" variant="outline" disabled={locked} onClick={()=>{setEditor(null);setError('')}}>放弃未保存编辑</Button></div></form>:version?<>
      <article className="research-article"><div className="research-article-heading"><span>本人原创报道草稿 · v{version.version}</span><h2>{version.title}</h2><p>{version.summary}</p><small>本版保存于 {date(version.created_at)}。草稿中的计划或旧状态属于原稿内容。</small></div><div className="original-text" data-original-draft>{version.draft||'尚未录入报道草稿。可编辑并另存新版本。'}</div></article>
      <section className="research-gaps"><h3>待核功能与证据缺口</h3><div className="original-text">{version.pending_claims||'尚未列出逐项核验记录；产品功能不据此视为已验证。'}</div></section>
      <section className="research-gaps"><h3>已核内容与对应证据</h3><div className="original-text">{version.verified_notes||'尚未录入功能实测通过证据。'}</div></section>
      {version.history_note&&<section className="original-history-note"><h3>原稿历史说明</h3><p>{version.history_note}</p></section>}
     </>:<p role="alert">该草稿版本尚未读回。</p>}
     <details className="original-raw"><summary>查看完整原始产品说明（保留原文）</summary><p className="original-hash">原文 SHA-256：{record.original_sha256}</p><div className="original-text" data-original-text>{record.original_text}</div></details>
     <details className="research-binding"><summary>材料身份与保存绑定</summary><p>材料 ID：{record.id}</p><p>选题 ID：{record.topic.id}</p>{version&&<p>本版草稿 SHA-256：{version.draft_sha256}</p>}{record.source_refs?.map((source,index)=><p key={index}>{source.file_name} · Library {source.library_file_id} · v{source.version}</p>)}</details>
     <section className="research-handoff"><h3><Check size={17}/> 已关联选题材料</h3><p>原文与草稿已保存。后续制作需单独发起，将采用最新保存的 v{record.version}，并沿用现有事实、素材和审核要求。</p>{version&&version.version!==record.version&&<p>当前查看历史版本。请切换至最新版，再打开制作入口。</p>}<a className="research-topic-link" href={'/?topic='+encodeURIComponent(record.topic.id)}>打开选题材料<ChevronRight size={17}/></a>{!productionOpen?<div className="research-actions"><Button variant="outline" disabled={locked||!!editor||version?.version!==record.version} onClick={()=>setProductionOpen(true)}>查看后续制作入口</Button></div>:<ProductionAction topicId={record.topic.id}/>}</section>
    </>}
   </section>
  </div>
 </main>;
}
