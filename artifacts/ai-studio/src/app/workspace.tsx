'use client';
import './workspace-design.css';
import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,AudioLines,Bookmark,Check,ChevronRight,Clapperboard,FileSearch,FlaskConical,Gamepad2,LayoutGrid,List,LockKeyhole,RefreshCw,Search,Shuffle,Sparkles,Radio,Clock3,X} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetClose} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Toaster} from '@/components/ui/sonner';
import {toast} from 'sonner';
import {categories,type Library,type Topic} from '@/lib/types';
import {filterTopics} from '@/lib/feed';
import {useTopicNavigation} from '@/hooks/use-topic-navigation';
const ProductionAction=lazy(()=>import('@/components/production-desk').then(module=>({default:module.ProductionAction})));
const icons:Record<string,typeof Clapperboard>={'视觉影像':Clapperboard,'声音音乐':AudioLines,'互动体验':Gamepad2,'好奇脑洞':FlaskConical,'AI实用':Sparkles,'行业动态':Radio};
const date=(s:string|null)=>s?s.slice(0,10).replaceAll('-','.'):'日期未提供';
const clock=(s:string|null)=>s?new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'尚未刷新';
const topicLanguage=(language?:string)=>(language??'zh')==='zh'?'中文原文':language==='en'?'英文原文':'历史原文（语言待核实）';
const isResearchTopic=(topic:Topic)=>topic.source_id==='research-synthesis';
const isOriginalTopic=(topic:Topic)=>topic.source_id==='owner-original';
const originalLink=(topic:Topic)=>{try{const url=new URL(topic.url,'https://site.local'),id=url.searchParams.get('id');return id?'/originals?id='+encodeURIComponent(id):'/originals'}catch{return '/originals'}};
async function api(path:string,body?:unknown,signal?:AbortSignal){const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal});const data=await r.json() as any;if(!r.ok)throw new Error(data.error??'请求失败，请重试');return data;}
function Picker({value,onChange,label,options}:{value:string;onChange:(s:string)=>void;label:string;options:{value:string;label:string}[]}){return <div className="workspace-picker"><span className="field-label">{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger className="filter-select" aria-label={label}><SelectValue/></SelectTrigger><SelectContent className="text-base">{options.map(o=><SelectItem className="min-h-11 text-base" key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>}
export default function Workspace({initial,deferInitialLoad=false}:{initial:Library|null;deferInitialLoad?:boolean}){
 const [data,setData]=useState(initial);const [loadError,setLoadError]=useState(!initial&&!deferInitialLoad);const [loading,setLoading]=useState(deferInitialLoad&&!initial);const [refreshing,setRefreshing]=useState(false);const [pending,setPending]=useState<string[]>([]);const loadSequence=useRef(0);
 const knownIds=useMemo(()=>data?new Set(data.topics.map(t=>t.id)):null,[data]);
 const nav=useTopicNavigation(knownIds);const {q,category,time,material,sort,tab}=nav.view;const {detail,limit,setLimit,openDetail,closeDetail}=nav;
 const setQ=(v:string)=>nav.setFilter('q',v),setCategory=(v:string)=>nav.setFilter('category',v),setTime=(v:string)=>nav.setFilter('time',v),setMaterial=(v:string)=>nav.setFilter('material',v),setSort=(v:string)=>nav.setFilter('sort',v),setTab=(v:string)=>nav.setFilter('tab',v);
 const [sourcesOpen,setSourcesOpen]=useState(false);
 const [moreFiltersOpen,setMoreFiltersOpen]=useState(false);
 const [layout,setLayout]=useState<'cards'|'list'>('cards'),[roamTarget,setRoamTarget]=useState<string|null>(null);
 const reload=useCallback(async(signal?:AbortSignal)=>{const sequence=++loadSequence.current;setLoading(true);try{const d=await api('/api/library',undefined,signal);if(sequence===loadSequence.current&&!signal?.aborted){setData(d);setLoadError(false)}return d as Library}catch(e){if(sequence===loadSequence.current&&!signal?.aborted)setLoadError(true);throw e}finally{if(sequence===loadSequence.current&&!signal?.aborted)setLoading(false)}},[]);
 useEffect(()=>{if(!deferInitialLoad||initial)return;const controller=new AbortController();void reload(controller.signal).catch(()=>{});return()=>{controller.abort();loadSequence.current++}},[deferInitialLoad,initial,reload]);
 const save=useCallback(async(id:string,saved:boolean)=>{setPending(p=>[...p,id]);try{await api('/api/favorites',{id,saved});setData(d=>d?{...d,topics:d.topics.map(t=>t.id===id?{...t,favorite:saved?1:0}:t)}:d);return {id,saved}}finally{setPending(p=>p.filter(i=>i!==id))}},[]);
 async function toggle(t:Topic){try{await save(t.id,!t.favorite);toast.success(t.favorite?'已取消收藏':'已收藏，其他设备也能查看')}catch(e){toast.error((e as Error).message)}}
 async function disposition(t:Topic,status:string){setPending(p=>[...p,t.id]);try{await api('/api/disposition',{id:t.id,status});setData(d=>d?{...d,topics:d.topics.map(x=>x.id===t.id?{...x,disposition:status}:x)}:d);toast.success(status==='rejected'?'已否决，可在「已否决」中恢复':status==='produced'?'已标记制作，不再重复推荐':'已恢复到选题池')}catch(e){toast.error((e as Error).message)}finally{setPending(p=>p.filter(i=>i!==t.id))}}
 async function refresh(){setRefreshing(true);try{const result=await api('/api/refresh',{});await reload();if(result.cooldown)toast.info('刚刚已刷新或仍在采集中，请稍等一分钟');else{const failed=result.results.filter((r:{ok:boolean})=>!r.ok).length;failed===result.results.length?toast.error('本次来源均未能读取，已有选题与收藏仍保留'):toast.success(`新增 ${result.added} 条，更新旧题 ${result.updated??0} 条，归并重复 ${result.duplicates??0} 条${failed?`；${failed} 个来源暂未成功`:''}`)}}catch(e){toast.error((e as Error).message)}finally{setRefreshing(false)}}
 const filters={q,category,time,material,tab,sort};const now=data?Date.parse(data.serverNow):Date.now();const rows=useMemo(()=>filterTopics(data?.topics??[],filters,now),[data,q,category,time,material,tab,sort,now]);
 const selected=data?.topics.find(t=>t.id===detail);const savedCount=data?.topics.filter(t=>t.favorite).length??0;
 const pendingCount=data?.topics.filter(t=>(t.disposition??'pending')==='pending').length??0;
 const rejectedCount=data?.topics.filter(t=>t.disposition==='rejected').length??0;
 const freshCount=data?.topics.filter(t=>t.published_at&&now-Date.parse(t.published_at)<=7*86400000).length??0;
 const hasFilters=q||category!=='all'||time!=='all'||material!=='all';const failed=data?.sources.filter(s=>s.state==='error').length??0;
 const extraFilterLabels=[category!=='all'?category:null,time!=='all'?({7:'近 7 天',30:'近 30 天',90:'近 90 天',longtail:'长尾 · 90 天前',unknown:'日期待核实'} as Record<string,string>)[time]:null,material!=='all'?material:null].filter(Boolean);
 const roamingRows=useMemo(()=>rows.filter(t=>!['rejected','produced'].includes(t.disposition??'pending')),[rows]);
 function roam(){if(!roamingRows.length)return;const chosen=roamingRows[Math.floor(Math.random()*roamingRows.length)],index=rows.findIndex(t=>t.id===chosen.id);setLimit(current=>Math.max(current,Math.ceil((index+1)/18)*18));setRoamTarget(chosen.id);}
 useEffect(()=>{if(roamTarget){openDetail(roamTarget);setRoamTarget(null)}},[roamTarget,openDetail]);
 useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if(event.key!=='/'||event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||detail||sourcesOpen||document.querySelector('[role="dialog"],[role="alertdialog"],[data-slot="select-content"][data-state="open"]'))return;const target=event.target;if(target instanceof Element&&target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]'))return;event.preventDefault();document.getElementById('topic-search')?.focus()};window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut)},[detail,sourcesOpen]);
 useEffect(()=>{if(nav.notice){toast.info(nav.notice);nav.clearNotice()}},[nav.notice]);
 useEffect(()=>{const d=document as Document&{modelContext?:{registerTool:(t:unknown,o:{signal:AbortSignal})=>void}};if(!d.modelContext?.registerTool)return;const c=new AbortController();try{
  d.modelContext.registerTool({name:'search_topics',title:'搜索选题',description:'按关键词筛选当前选题库并返回匹配条目。',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:200}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async(input:unknown)=>{const v=input as {query?:unknown};if(typeof v?.query!=='string'||v.query.length>200)throw new Error('query 必须为200字以内的字符串');setQ(v.query);setTab('all');setCategory('all');setTime('all');setMaterial('all');const r=await api('/api/library');setData(r);return filterTopics(r.topics,{q:v.query,category:'all',time:'all',material:'all',tab:'all',sort:'score'}).slice(0,20).map(t=>({id:t.id,title:t.title,url:t.url,saved:!!t.favorite}));}}, {signal:c.signal});
  d.modelContext.registerTool({name:'set_topic_favorite',title:'设置选题收藏',description:'为当前登录用户保存或取消一条选题的收藏，同步到此账号的其他设备。',inputSchema:{type:'object',properties:{id:{type:'string'},saved:{type:'boolean'}},required:['id','saved'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input:unknown)=>{const v=input as {id?:unknown;saved?:unknown};if(typeof v?.id!=='string'||!/^t_[a-f0-9]{24}$/.test(v.id)||typeof v.saved!=='boolean')throw new Error('收藏参数无效');return await save(v.id,v.saved);}}, {signal:c.signal});
 }catch(e){console.info('WebMCP unavailable',e)}return()=>c.abort()},[save]);
 return <>
  <Toaster position="bottom-center"/>
  <div className="app-shell">
   <main className="workspace-main" aria-labelledby="workspace-title">
    <section className="workspace-heading">
     <div className="workspace-intro"><h1 id="workspace-title">下一条，拍什么？</h1><p>从中外原文里，找到值得讲给观众的 AI 故事。</p></div>
     <div className="workspace-header-actions">
      <Button asChild className="research-entry"><a href="/research"><FileSearch size={18}/>关键词研究</a></Button>
      <Button variant="outline" onClick={refresh} disabled={refreshing||loading} className="refresh-button"><RefreshCw size={18} className={refreshing?'spin':''}/>{refreshing?'正在采集…':'采集最新选题'}</Button>
     </div>
    </section>
    <div className="metrics">
     <span><b>{data?pendingCount:'待读取'}</b> 条待选线索</span><span><b>{data?freshCount:'—'}</b> 近 7 天</span><span><b>{data?savedCount:'—'}</b> 已收藏</span>
     <button onClick={()=>setSourcesOpen(true)} className="source-trigger"><i className={failed?'dot-warning':'dot-live'}/>{data?.sources.length??'待读取'} 个公开来源<ChevronRight size={16}/></button>
     <small className="refresh-time"><Clock3 size={15}/>{data?.updatedAt?'上次检查 '+clock(data.updatedAt):'尚未采集'}</small>
     <span className="private-label"><LockKeyhole size={14}/>仅你可见</span>
    </div>
    <Tabs value={tab} onValueChange={setTab} className="workspace-tabs">
     <div className="workspace-controls">
      <div className="tabs-line"><TabsList variant="line" className="tab-list"><TabsTrigger value="all">全部待选<span>{data?pendingCount:'—'}</span></TabsTrigger><TabsTrigger value="saved"><Bookmark size={16}/>我的收藏<span>{data?savedCount:'—'}</span></TabsTrigger><TabsTrigger value="rejected">已否决<span>{data?rejectedCount:'—'}</span></TabsTrigger><TabsTrigger value="produced">已制作</TabsTrigger><TabsTrigger value="legacy">外文来源</TabsTrigger></TabsList></div>
      <div className="filter-bar">
       <div className="workspace-search"><label className="field-label" htmlFor="topic-search">搜索选题</label><div className="search-box"><Search size={19}/><Input id="topic-search" value={q} onChange={e=>setQ(e.target.value)} placeholder="选题、工具或来源" aria-label="搜索选题" maxLength={200}/>{q?<button aria-label="清空搜索" onClick={()=>setQ('')}><X size={17}/></button>:<kbd aria-hidden="true">/</kbd>}</div></div>
       <button type="button" className="mobile-filter-toggle" aria-expanded={moreFiltersOpen} aria-controls="workspace-extra-filters" onClick={()=>setMoreFiltersOpen(open=>!open)}><span>{moreFiltersOpen?'收起筛选':'更多筛选'}{extraFilterLabels.length>0?' · '+extraFilterLabels.length:''}</span><ChevronRight size={17}/></button>
       <div id="workspace-extra-filters" className="filter-pickers" data-expanded={moreFiltersOpen}><Picker label="题材" value={category} onChange={setCategory} options={[{value:'all',label:'全部题材'},...categories.map(c=>({value:c,label:c}))]}/><Picker label="发布时间" value={time} onChange={setTime} options={[{value:'all',label:'全部时间'},{value:'7',label:'近 7 天'},{value:'30',label:'近 30 天'},{value:'90',label:'近 90 天'},{value:'longtail',label:'长尾 · 90 天前'},{value:'unknown',label:'日期待核实'}]}/><Picker label="素材可得性" value={material} onChange={setMaterial} options={[{value:'all',label:'全部素材状态'},{value:'已找到素材',label:'已找到素材'},{value:'有演示线索',label:'有演示线索'},{value:'待核实',label:'素材待核实'}]}/></div>
       {extraFilterLabels.length>0&&<p className="mobile-filter-summary" role="status">已选：{extraFilterLabels.join(' · ')}</p>}
      </div>
     </div>
     <div className="result-bar">
      <div className="result-count"><strong>{hasFilters?'筛选结果':'选题池'}</strong><span>{data?rows.length+' 条':'待读取'}</span>{hasFilters&&<button onClick={()=>{setQ('');setCategory('all');setTime('all');setMaterial('all')}}>清空条件</button>}<button className="roam-button" onClick={roam} disabled={!roamingRows.length||loading||!!roamTarget} title="从当前筛选中随机打开一条未否决、未制作的真实选题"><Shuffle size={16}/>灵感漫游</button></div>
      <div className="result-options"><Picker label="排序方式" value={sort} onChange={setSort} options={[{value:'score',label:'原有规则排序'},{value:'date',label:'发布时间最新'}]}/><div className="view-switch" role="group" aria-label="选题显示方式"><button aria-label="卡片视图" aria-pressed={layout==='cards'} onClick={()=>setLayout('cards')}><LayoutGrid size={18}/><span>卡片</span></button><button aria-label="列表视图" aria-pressed={layout==='list'} onClick={()=>setLayout('list')}><List size={19}/><span>列表</span></button></div></div>
     </div>
     {failed>0&&<div className="inline-alert" role="status"><span>{failed} 个来源暂时未能采集，已有选题不受影响。</span><button onClick={()=>setSourcesOpen(true)}>查看来源状态<ArrowUpRight size={15}/></button></div>}
     <TabsContent value={tab} className="results-content">
      {loading&&!data?<div className="empty-state" role="status"><h2>正在读取选题与收藏…</h2></div>:loadError?<div className="empty-state"><Radio size={32}/><h2>暂时连不上选题库</h2><p>你的收藏保存在账号中，重新读取即可。</p><Button onClick={()=>reload().catch(e=>toast.error(e.message))} disabled={loading}>重新读取</Button></div>:rows.length===0?<div className="empty-state"><Search size={32}/><h2>{tab==='saved'&&!hasFilters?'把想拍的，先收进来':'没有匹配的选题'}</h2><p>{tab==='saved'&&!hasFilters?'点选题右上角的书签，随时回来继续挑。':'试试放宽时间或素材条件，也可以采集新线索。'}</p><Button variant="outline" onClick={()=>{setTab('all');setQ('');setCategory('all');setTime('all');setMaterial('all')}}>查看全部选题</Button></div>:<div className={'topic-grid topic-grid--'+layout}>
       {rows.slice(0,limit).map(t=>{const Icon=icons[t.category]??Sparkles;const age=t.published_at?(now-Date.parse(t.published_at))/86400000:null;return <article className={'topic-card '+(t.curated?'curated-card':'')} key={t.id} data-topic-id={t.id}>
        <div className="card-top"><span className="category-label"><Icon size={17}/>{t.category}</span><button className={'bookmark-button '+(t.favorite?'saved':'')} aria-label={t.favorite?'取消收藏：'+t.title:'收藏：'+t.title} aria-pressed={!!t.favorite} disabled={pending.includes(t.id)} onClick={()=>toggle(t)}><Bookmark size={20} fill={t.favorite?'currentColor':'none'}/></button></div>
        <button className="card-main" onClick={()=>openDetail(t.id)}><div className="card-meta"><span>{t.source}</span><span>{isOriginalTopic(t)?'公开发布日期未知':isResearchTopic(t)?'来源日期见研究稿':date(t.published_at)}</span></div><div className="card-copy"><h2 lang={t.content_lang==='en'?'en':undefined}>{t.title}</h2><p className="card-summary" lang={t.content_lang==='en'?'en':undefined}>{t.summary||t.highlight}</p></div><div className="angle-preview"><span>拍摄切口</span><p>{t.curated?t.highlight:t.angle}</p></div></button>
        <div className="card-bottom"><span className={'material-badge '+(t.material==='已找到素材'?'confirmed':'')}>{t.material==='已找到素材'&&<Check size={14}/>} {t.material}</span><span className="age-label">{isOriginalTopic(t)?'本人说明 · 待核':age===null?'日期待核实':age>90?'经典 / 长尾':age<=7?'近 7 天':'近期'}</span><button className="status-button" disabled={pending.includes(t.id)} onClick={()=>disposition(t,t.disposition==='rejected'?'pending':'rejected')}>{t.disposition==='rejected'?'恢复选题':'否决'}</button></div>
        <div className="card-foot"><span>{isOriginalTopic(t)?'本人原创 · 保留完整材料':isResearchTopic(t)?'综合资料 · 有出处':topicLanguage(t.content_lang)+' · '+(t.content_lang==='en'?'摘要未翻译':'规则初筛')}</span><button onClick={()=>openDetail(t.id)}>看选题简报<ArrowUpRight size={16}/></button></div>
       </article>})}
      </div>}
      {rows.length>limit&&<div className="load-more"><Button variant="outline" onClick={()=>setLimit(l=>l+18)}>再看 18 条<span className="remaining">还有 {rows.length-limit} 条</span></Button></div>}
     </TabsContent>
    </Tabs>
    <footer><span>保留原文，先核实，再开拍。</span><span>素材找到 ≠ 获得转载授权</span></footer>
   </main>
  </div>
  <Sheet open={!!selected} onOpenChange={o=>{if(!o)closeDetail()}}>
   <SheetContent className="detail-sheet topic-detail-sheet" showCloseButton={false} onCloseAutoFocus={nav.onCloseAutoFocus}>
    <div className="detail-navigation"><Button variant="ghost" className="back-to-list" onClick={closeDetail} disabled={nav.closing}><ArrowLeft size={18}/>返回列表</Button><span>选题简报</span><SheetClose asChild><button type="button" className="detail-close-button" aria-label="关闭详情，返回列表" disabled={nav.closing}><X size={21}/></button></SheetClose></div>
    <div className="detail-scroll">
     <SheetHeader><SheetTitle>{selected?.title}</SheetTitle><SheetDescription>{selected?.source} · {selected&&isOriginalTopic(selected)?'本人产品说明与草稿 · 公开发布日期未知':selected&&isResearchTopic(selected)?'综合资料，来源日期与读取范围见研究稿':'原文发布 '+date(selected?.published_at??null)}</SheetDescription></SheetHeader>
     {selected&&<div className="detail-body">
      <div className="detail-tags"><span>{selected.category}</span><span>{isOriginalTopic(selected)?'本人原创 · 产品说明待核':isResearchTopic(selected)?'综合资料 · 有出处':topicLanguage(selected.content_lang)}</span><span>{selected.material}</span><span>{selected.disposition==='rejected'?'已否决':selected.disposition==='produced'?'已制作':selected.favorite?'已收藏':'待选择'}</span></div>
      <section className="brief-section"><h3>{isOriginalTopic(selected)?'原创草稿摘要':isResearchTopic(selected)?'研究资料摘要':(selected.content_lang??'zh')==='zh'?'中文内容摘要':selected.content_lang==='en'?'英文原文摘要（未翻译）':'原文摘要（语言待核实）'}</h3><p lang={selected.content_lang==='en'?'en':undefined}>{selected.summary||(isOriginalTopic(selected)?'请打开本人原创材料查看完整说明与草稿。':'订阅未提供摘要，请查看下方原文阅读完整内容。')}</p>{selected.content_lang==='en'&&<p className="reading-note">英文标题和摘要保留原文，未自动翻译；拍摄切口是中文规则提示，仍需核对原文。</p>}</section>
      <section className="hook-block brief-section"><h3>开场亮点</h3><p>{selected.highlight}</p></section>
      <section className="brief-section"><h3>为什么适合拍</h3><p>{selected.angle}</p></section>
      <section className="brief-section"><h3>素材线索</h3><p>{selected.materials}</p>{selected.media_url&&<a href={selected.media_url} target="_blank" rel="noopener noreferrer" className="text-link">打开官方素材 / 演示<ArrowUpRight size={16}/></a>}</section>
      <section className="risk-block brief-section"><h3>发布前，避开这几个坑</h3><p>{selected.risk}</p></section>
      {isOriginalTopic(selected)?<div className="provenance"><b>本人原创 · 完整说明与草稿分别保存</b><p>这是本人提供的产品说明与报道草稿，功能描述仍需真实项目证据核验。请打开原创材料查看完整原文、草稿版本、待核功能和已核内容；原稿里的计划与旧状态保留为历史记录。</p><p>入库于 {clock(selected.collected_at)}；说明或整理日期不是产品公开发布日期。保存材料不会启动制作或发布。</p><a className="text-link" href={originalLink(selected)}>查看本人原创材料与版本<ArrowUpRight size={16}/></a></div>:isResearchTopic(selected)?<div className="provenance"><b>站内综合资料 · 保留固定研究版本</b><p>这是根据多个来源整理的资料稿。请打开研究稿逐项核对引用、原始发布日期与读取范围；视频链接只是未观看的线索。保存为选题不会批准脚本或视频。</p><p>加入选题库于 {clock(selected.collected_at)}；整理日期不是外部来源的发布日期。</p></div>:<div className="provenance"><b>{selected.curated?'编辑选题 · 已核对官方原文与素材入口':'透明规则 · 未逐篇深度核读'}</b><p>{selected.curated?'这是按原文整理的拍摄角度，仍需在录制前实测产品权限与效果。':'标题与摘要摘自公开来源；分类与拍摄切口沿用关键词规则。摘要是阅读入口，点击下方原文查看完整报道；并未启用个人自动评分。'}</p><p>{selected.updated_at?'最近补充 '+clock(selected.updated_at)+' · ':''}采集于 {clock(selected.collected_at)} · 日期指原文发布日，不等于产品首发日。</p></div>}
      <Suspense fallback={<p role="status">正在读取制作入口…</p>}><ProductionAction key={selected.id} topicId={selected.id} disposition={selected.disposition}/></Suspense>
      <div className="status-actions"><Button variant="outline" disabled={pending.includes(selected.id)} onClick={()=>disposition(selected,selected.disposition==='rejected'?'pending':'rejected')}>{selected.disposition==='rejected'?'恢复选题':'否决此题'}</Button><Button variant="outline" disabled={pending.includes(selected.id)} onClick={()=>disposition(selected,selected.disposition==='produced'?'pending':'produced')}>{selected.disposition==='produced'?'恢复待选':'标记已制作'}</Button></div>
     </div>}
    </div>
    {selected&&<div className="detail-actions"><Button onClick={()=>toggle(selected)} disabled={pending.includes(selected.id)}><Bookmark size={18} fill={selected.favorite?'currentColor':'none'}/>{selected.favorite?'已收藏':'收藏选题'}</Button><Button asChild variant="outline"><a href={isOriginalTopic(selected)?originalLink(selected):selected.url} target={isOriginalTopic(selected)||isResearchTopic(selected)?undefined:'_blank'} rel="noopener noreferrer">{isOriginalTopic(selected)?'阅读完整原创材料':isResearchTopic(selected)?'阅读研究稿与来源':(selected.content_lang??'zh')==='zh'?'阅读全文（中文）':selected.content_lang==='en'?'阅读全文（英文）':'阅读全文（语言待核实）'}<ArrowUpRight size={17}/></a></Button></div>}
   </SheetContent>
  </Sheet>
  <Sheet open={sourcesOpen} onOpenChange={setSourcesOpen}>
   <SheetContent className="detail-sheet sources-sheet" showCloseButton={false}>
    <div className="detail-navigation"><span>来源状态</span><SheetClose asChild><button type="button" className="detail-close-button" aria-label="关闭来源状态"><X size={21}/></button></SheetClose></div>
    <div className="detail-scroll"><SheetHeader><SheetTitle>中外来源，逐个确认</SheetTitle><SheetDescription>采集中外公开订阅与官方资料，保留原文语言；英文标题和摘要未自动翻译。单个来源失败时保留已有资料。</SheetDescription></SheetHeader>
     <div className="detail-body"><div className="source-guidance">中外来源共享每日最多 50 条的新增额度，按来源轮流选取，不为凑数降低标准。新采集按近 30 天与发布日期核验规则筛选，不伪造缺失日期；已有历史资料保留。按原文网址、近似标题和具体产品事件归并，收藏、否决和已制作状态保留。复杂同义报道仍需核对。摘要保留原文，英文未自动翻译；中英文待选题都进入默认选题池。</div>
      {data?.sources.map(s=><div className="source-row" key={s.id}><div><h3><i className={s.state==='ok'?'dot-live':s.state==='error'?'dot-warning':'dot-pending'}/>{s.name}</h3><span className={'source-state '+s.state}>{s.state==='ok'?'采集正常':s.state==='error'?'暂不可用':'待首次采集'}</span></div><p>{topicLanguage(s.language)} · {s.description}</p><small>{s.message}</small>{s.last_success&&<small>最近成功：{clock(s.last_success)}</small>}<a href={s.url} target="_blank" rel="noopener noreferrer">查看公开订阅<ArrowUpRight size={15}/></a></div>)}
      <div className="provenance"><b>如何理解参考分？</b><p>只是选题筛选辅助，不是事实可信度或效果保证。编辑种子分数体现本次选题顺序；新采集条目按关键词计算，优先视觉、声音、交互和科普题材，降低商业宣传与参数榜单优先级。</p><p>来源包括中外媒体与官方材料。图片、视频、论文和演示各自适用不同许可；可阅读不代表可商用，发布前单独核权。</p></div>
     </div>
    </div>
   </SheetContent>
  </Sheet>
 </>;
}
