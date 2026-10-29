'use client';

import {ArrowUpRight,Clock3,RefreshCw,Send} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/button';
import {PUBLISHING_PLATFORMS,PUBLISHING_PLATFORM_LABELS,type PublishingPlatform,type PublishingPost,type NativePublishingReceipt} from '@/lib/publishing-contract.mts';

export type PublishingPreparationView={
 preparation:{id:string;scheduled_at:string;package_id:string;job_id:string;title:string;release_id:string;state:string;submission_window?:{start:string;end:string}}|null;
 package?:{id:string;approval_scope?:string;package_hash?:string}|null;
 work:{id:string;preparation_id:string;platform:PublishingPlatform;transport:'browser'|'native';expected_account_label?:string|null;account_label?:string|null;account_id?:string|null;state:string;phase:string;prepared_at?:string|null;reason?:string|null;evidence_note?:string;receipt?:Record<string,unknown>}[];
 available_preparations?:{id:string;scheduled_at:string;title:string;state:string}[];
 publications?:PublishingPost[];
 no_external_action?:boolean;
};
export type PublishingReadinessView={package_guard_error?:string|null;scheduled_at:string;ready_by_at:string;phase:string;inventory_count:number;total_ready:number;browser_ready:number;requires_attention:boolean;platforms:{platform:string;ready:boolean;reason:string|null}[]};
export type PublishingEngagementView={publication_id:string;registered_publication_id?:string|null;package_id?:string;job_id:string;platform:PublishingPlatform;status:string;reaction_state:string;comment_state:string;first_comment?:{text:string};evidence_note?:string;updated_at?:string};
const stages=[['awaiting_preparation','待准备'],['preparing','准备中'],['draft_saved','草稿已就绪'],['awaiting_publish','待发表'],['published','已发表'],['engagement_completed','互动完成']] as const;
type Stage=typeof stages[number][0];
const label=(platform:PublishingPlatform)=>platform==='bilibili'?'哔哩哔哩':PUBLISHING_PLATFORM_LABELS[platform];
function time(value:string){const t=new Date(value);return Number.isFinite(t.getTime())?new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(t):'时间待确认';}
function publicationLink(value:string|null|undefined){if(!value)return null;try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}}
function completedEngagementDetail(value:PublishingEngagementView){
 if(value.reaction_state==='done'&&value.comment_state==='done')return '点赞／推荐与首评已保存';
 if(value.reaction_state==='not_present'&&value.comment_state==='done')return '首评已保存；平台未提供点赞／推荐入口';
 if(value.reaction_state==='done'&&value.comment_state==='not_present')return '点赞／推荐已完成；平台未提供首评入口';
 if(value.reaction_state==='not_present'&&value.comment_state==='not_present')return '平台未提供点赞／推荐和首评入口，已记录不可用';
 return '互动处理已结束，实际结果见记录';
}

export default function PublishingPreparation({data,readiness,publications,nativeReceipts,engagement,enabled,busy,onPrepare,onPublish,onReconcile}:{data?:PublishingPreparationView;readiness?:PublishingReadinessView;publications:PublishingPost[];nativeReceipts?:NativePublishingReceipt[];engagement?:PublishingEngagementView[];enabled:boolean;busy:boolean;onPrepare:()=>void;onPublish:(preparationId:string)=>void;onReconcile:()=>void}){
 const [selectedId,setSelectedId]=useState(''),[selected,setSelected]=useState<PublishingPreparationView|null>(null),[loading,setLoading]=useState(false),[selectionError,setSelectionError]=useState('');const sequence=useRef(0);
 useEffect(()=>{if(!selectedId){setSelected(null);setSelectionError('');setLoading(false);return;}const id=++sequence.current,controller=new AbortController();setLoading(true);setSelectionError('');void (async()=>{const response=await fetch('/api/publishing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'read_preparation',preparation_id:selectedId}),cache:'no-store',signal:controller.signal});const value=await response.json() as PublishingPreparationView&{error?:string};if(!response.ok)throw Error(value.error||'准备记录读取失败');if(value.preparation?.id!==selectedId||!Array.isArray(value.work)||!Array.isArray(value.publications))throw Error('准备记录读取未完成');if(sequence.current===id)setSelected(value);})().catch(e=>{if(sequence.current===id&&!controller.signal.aborted)setSelectionError((e as Error).message);}).finally(()=>{if(sequence.current===id)setLoading(false);});return()=>controller.abort();},[selectedId,data]);
 const activeData=selectedId?selected:data,historical=!!activeData?.preparation&&!!readiness&&activeData.preparation.scheduled_at!==readiness.scheduled_at,scopedPublications=activeData?.publications||publications,preparations=data?.available_preparations||[];
 const current=activeData?.preparation,now=Date.now(),start=Date.parse(current?.submission_window?.start||current?.scheduled_at||''),due=!!current&&Number.isFinite(start)&&now>=start;
 const rows=PUBLISHING_PLATFORMS.map(platform=>{
  const work=activeData?.work.find(w=>w.platform===platform),post=current?scopedPublications.find(p=>p.release_id===current.release_id&&p.platform===platform):undefined,native=current&&post?nativeReceipts?.find(n=>n.browser_post_id===post.id&&n.job_id===current.job_id&&n.platform===platform&&n.release_id===current.release_id):undefined,nativeStatusMissing=work?.transport==='native'&&!!post&&!native&&!publications.some(p=>p.id===post.id);
  // The backend creates these author tasks only from an actual confirmed public result.
  // An exact same-work task is therefore newer evidence than a publication row awaiting ingestion.
  const interaction=current?engagement?.find(e=>e.job_id===current.job_id&&e.platform===platform&&(!e.package_id||e.package_id===current.package_id)&&['pending','completed','uncertain','blocked'].includes(e.status)&&(
   e.publication_id===post?.id||
   !!native&&(e.publication_id===native.publication_id||e.registered_publication_id===native.publication_id)||
   work?.transport==='native'&&e.publication_id.startsWith('pne_')&&e.package_id===current.package_id
  )):undefined;
  const nativeStatusUnknown=nativeStatusMissing&&!interaction&&post?.status!=='published',published=post?.status==='published'||!!native||!!interaction,prepared=work?.phase==='draft_saved';
  const stage:Stage=published?(interaction?.status==='completed'?'engagement_completed':'published'):prepared?(due?'awaiting_publish':'draft_saved'):work&&['claimed','preparing'].includes(work.state)||work?.phase==='preparing'?'preparing':'awaiting_preparation';
  const issue=nativeStatusUnknown|| (published?interaction?.status==='uncertain'||interaction?.status==='blocked':post?.submission_state==='platform_accepted'?false:work?.phase==='blocked'||work?.phase==='uncertain'||post?.status==='uncertain'||post?.status==='blocked'&&!native&&work?.transport!=='native');
  const detail=nativeStatusUnknown?'手机原生回执未在当前看板中，先核对原任务':published?(interaction?.status==='completed'?completedEngagementDetail(interaction):interaction?.status==='uncertain'?'发表已确认；互动结果待回查，避免重复操作':interaction?.status==='blocked'?'发表已确认；互动受阻'+(interaction.evidence_note?'：'+interaction.evidence_note:'，保留当前进度'):'发表已确认，接续点赞／推荐与首评'):post?.submission_state==='platform_accepted'?'平台已受理，审核中，等待公开确认':work?.phase==='uncertain'||post?.status==='uncertain'?'结果待核验，先回查当前作品':work?.phase==='blocked'?work.reason||'准备受阻':post?.status==='submitted'?'已提交，等待平台审核或公开确认':post?.status==='submitting'?'一次提交进行中':prepared?'草稿内容已保存，到点使用本冻结包提交':work?.reason||'等待执行器准备当前冻结包';
  return{platform,work,post,native,nativeStatusUnknown,stage,issue,detail,href:publicationLink(native?.platform_url||post?.platform_url)};
 });
 const preparedCount=rows.filter(row=>row.work?.phase==='draft_saved'&&!row.nativeStatusUnknown&&!['dispatching','submitting','submitted','uncertain'].includes(row.post?.status||'')&&row.post?.submission_state!=='platform_accepted'&&row.stage!=='published'&&row.stage!=='engagement_completed').length;
 return <section aria-labelledby="publishing-preparation-title">
  {readiness&&<div role="status" className="publishing-readiness"><p><strong>下一场：{time(readiness.scheduled_at)}</strong> · 浏览器草稿就绪 {readiness.browser_ready}/3 · 全平台 {readiness.total_ready}/4</p><p>准备验收：{time(readiness.ready_by_at)}；到点只恢复草稿和提交。</p>{readiness.phase==='no_inventory'&&<p>本场对应早晚类别没有已审库存，需要先补足库存。</p>}{readiness.requires_attention&&readiness.phase!=='no_inventory'&&<p>尚有准备缺口：{readiness.platforms.filter(p=>!p.ready).map(p=>label(p.platform as PublishingPlatform)+(p.reason?'：'+p.reason:'未保存草稿')).join('；')}</p>}{historical&&<p>上方是下一场情况；下方保留上一场原草稿，可沿原任务继续。</p>}</div>}
  <header className="publishing-section-heading"><div><h2 id="publishing-preparation-title">提前准备，到点发表</h2><p>使用已完成片仓的批准包；准备好草稿后，到点分别发表，随后自动回填与跟踪互动。</p></div><Button variant="outline" onClick={onPrepare} disabled={busy||!enabled}><RefreshCw size={16} aria-hidden="true"/>准备下一场</Button></header>
  {(preparations.length>1||!!selectedId)&&<label>查看准备任务 <select aria-label="查看准备任务" value={selectedId} disabled={busy} onChange={event=>{sequence.current++;setSelected(null);setSelectedId(event.target.value);}}><option value="">自动选择当前准备</option>{selectedId&&!preparations.some(p=>p.id===selectedId)&&<option value={selectedId}>所选准备任务</option>}{preparations.map(p=><option key={p.id} value={p.id}>{time(p.scheduled_at)} · {p.title} · {p.state==='claimed'?'已领取':p.state==='ready'?'准备就绪':p.state==='preparing'?'准备中':p.state==='stale'?'状态已变化':p.state==='missed'?'原时段已过':'查看原状态'}</option>)}</select></label>}
  {selectedId&&loading&&!selected&&<p role="status">正在读取所选准备任务…</p>}{selectionError&&<p role="alert">{selectionError}；可重新选择或重新读取。</p>}
  {(!selectedId||!!selected)&&<ol className="publishing-flow" aria-label="发布工作流六阶段">{stages.map(([key,name])=><li key={key} data-active={rows.some(row=>row.stage===key)}><span>{name}</span><strong>{rows.filter(row=>row.stage===key).length}</strong></li>)}</ol>}
  {current?<>
   <div className="publishing-preparation-heading"><div><h3>{current.title}</h3><p>计划 {time(current.scheduled_at)} · 北京时间 · {current.state==='claimed'?'准备包已领取':current.state==='ready'?'准备包已就绪':current.state==='preparing'?'准备中':current.state==='stale'?'准备包状态已变化':current.state==='missed'?'原时段已过，保留原记录':'准备包状态待核对'}</p></div><a href={'/production?job='+encodeURIComponent(current.job_id)}>查看已审成片<ArrowUpRight size={14} aria-hidden="true"/></a></div>
   <div className="publishing-preparations" aria-label="四平台发布准备">{rows.map(row=><article className="publishing-preparation-card" key={row.platform} data-issue={row.issue}>
    <h3>{label(row.platform)}</h3><span className={'publishing-status publishing-status-'+(row.issue?'blocked':row.stage)}>{row.nativeStatusUnknown?'手机回执待核对':row.stage!=='published'&&row.stage!=='engagement_completed'&&(row.post?.status==='uncertain'||row.work?.phase==='uncertain')?'结果待核验':row.stage!=='published'&&row.stage!=='engagement_completed'&&row.post?.status==='dispatching'?'正在分发':row.stage!=='published'&&row.stage!=='engagement_completed'&&row.post?.submission_state==='waiting_browser'?'待浏览器执行':row.post?.submission_state==='platform_accepted'&&row.stage!=='published'&&row.stage!=='engagement_completed'?'平台审核中':stages.find(s=>s[0]===row.stage)?.[1]}</span>
    <p className="publishing-preparation-transport">{row.work?.transport==='native'?'手机微信原生界面':row.work?.transport==='browser'?'Chrome 创作者页面':'等待执行器'}</p>
    {(row.work?.account_label||row.work?.expected_account_label)&&<p>账号：{row.work.account_label||row.work.expected_account_label}</p>}
    <p>{row.detail}</p>{row.href&&<a href={row.href} target="_blank" rel="noopener noreferrer">查看作品<ArrowUpRight size={13} aria-hidden="true"/></a>}
   </article>)}</div>
   <div className="publishing-actions"><Button onClick={()=>onPublish(current.id)} disabled={busy||!enabled||!due||preparedCount===0}><Send size={16} aria-hidden="true"/>发表当期已准备作品</Button><Button variant="outline" onClick={onReconcile} disabled={busy}><RefreshCw size={16} aria-hidden="true"/>核对发布回执</Button><span className="publishing-help">{due?preparedCount?`${preparedCount} 个平台草稿已准备，分别接续提交；其余平台单独保留待处理。`:'尚无可继续提交的已保存草稿，详情见上方。':'到计划时刻后接续发表；当前只进行准备。'}</span></div>
   <details className="publishing-package-reference"><summary>本场次准备记录</summary><p>准备记录：{current.id}</p><p>冻结包：{current.package_id}</p></details>
  </>:!selectedId&&<div className="publishing-empty"><Clock3 size={22} aria-hidden="true"/><p>尚未创建下一场准备任务。有已审库存时，自动执行器会提前准备；也可点击“准备下一场”立即安排。</p></div>}
 </section>;
}
