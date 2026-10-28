'use client';

import './platform-copy-reviews.css';
import {useId,useRef,useState} from 'react';
import {BookOpenCheck,Check,ChevronDown,Download,ShieldCheck} from 'lucide-react';
import {Button} from './ui/button';
import type {PlatformCopy,PlatformCopyReview} from '@/lib/publishing-copy-review';

type Props={reviews:PlatformCopyReview[];onChanged:()=>Promise<void>};
type Decision='approve'|'revise';
type Originality='self-produced-commentary'|'repost';
type SavedDecision={copy_hash:string;status:'approved'|'revise';reason:string;originality_decision:Originality|null};
const platformOrder=['wechat_channels','douyin','bilibili','kuaishou','xiaohongshu'] as const;
const platformLabels:Record<string,string>={wechat_channels:'微信视频号',douyin:'抖音',bilibili:'哔哩哔哩',kuaishou:'快手',xiaohongshu:'小红书'};
const statusLabels:Record<PlatformCopyReview['status'],string>={awaiting_review:'可直接使用，无需额外审批',approved:'本版文案与发布选项已通过',revise:'已打回 · 等待修改',source_changed:'来源已变化 · 需更新文案'};
const originalityLabels:Record<Originality,string>={'self-produced-commentary':'自制解读（含引用素材，不声明引用素材原创）',repost:'转载（后续需平台来源信息）'};
function reviewKey(review:PlatformCopyReview){return review.job_id+':'+review.copy_hash;}
function originalityValue(value:string):Originality|''{return value==='self-produced-commentary'||value==='repost'?value:'';}
function completePolicy(review:PlatformCopyReview){const policy=review.option_policy;return !!policy&&policy.category==='technology-ai'&&policy.originality==='self-produced-commentary'&&policy.ai_disclosure==='ai-generated'&&policy.visibility==='public'&&policy.publish_mode==='immediate'&&policy.download==='disabled'&&policy.sync==='disabled';}
function reviewTime(value:string|null){if(!value)return null;const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'}).format(date):null;}
function completeCopy(copy:PlatformCopy|undefined){return !!copy&&typeof copy.title==='string'&&!!copy.title.trim()&&typeof copy.description==='string'&&!!copy.description.trim()&&Array.isArray(copy.tags)&&copy.tags.length>0&&copy.tags.every(tag=>typeof tag==='string'&&!!tag.trim())&&typeof copy.approach==='string'&&!!copy.approach.trim();}

export default function PlatformCopyReviews({reviews,onChanged}:Props){
 const id=useId(),lock=useRef(false),[pending,setPending]=useState<{job_id:string;decision:Decision}|null>(null),[reasons,setReasons]=useState<Record<string,string>>({}),[originalities,setOriginalities]=useState<Record<string,Originality|''>>({}),[saved,setSaved]=useState<Record<string,SavedDecision>>({}),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function decide(review:PlatformCopyReview,decision:Decision){
  const key=reviewKey(review),previous=saved[review.job_id],reason=(reasons[key]||'').trim(),originality=originalities[key]||'',complete=platformOrder.every(platform=>completeCopy(review.platforms[platform]))&&Object.keys(review.platforms).every(platform=>platform in platformLabels)&&completePolicy(review);
  if(lock.current||review.status==='source_changed'||decision==='revise'&&!reason||decision==='approve'&&(!complete||!originality))return;
  lock.current=true;setPending({job_id:review.job_id,decision});setError('');setMessage('');let committed=false;
  try{
   const response=await fetch('/api/publishing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'review_platform_copy',job_id:review.job_id,copy_hash:review.copy_hash,decision,...(decision==='revise'?{reason}:{originality})}),cache:'no-store'});
   const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error||'平台文案审核未保存，请重新读取后核对。');
   committed=true;setSaved(value=>({...value,[review.job_id]:{copy_hash:review.copy_hash,status:decision==='approve'?'approved':'revise',reason:decision==='revise'?reason:'',originality_decision:decision==='approve'?originality as Originality:null}}));
   setMessage('「'+review.title+'」'+(decision==='approve'?'的本版五平台文案与发布选项审核已保存。':'的修改意见已保存，等待提交新版。'));
   await onChanged();
  }catch(e){setError((committed?'审核决定已经保存，但状态刷新未完成：':'「'+review.title+'」审核结果未确认，请重新读取后核对：')+(e instanceof Error?e.message:'当前记录暂时无法读取。'));}
  finally{lock.current=false;setPending(null);}
 }
 return <section id="platform-copy-reviews" className="platform-copy-reviews" aria-labelledby={id+'-heading'}>
  <header className="publishing-section-heading"><div><h2 id={id+'-heading'}><BookOpenCheck size={21} aria-hidden="true"/>五平台发布文案</h2><p>成片通过后直接使用这些平台文案，无需额外审批；需要调整时可保存意见。</p></div></header>
  <div className="platform-copy-scope"><ShieldCheck size={17} aria-hidden="true"/><p>文案与设置沿用当前成片及宣发材料。视频号访问受阻状态继续保留；小红书专稿仅纳入宣发包，不新增自动发布授权。原封面和引用素材的使用权不因此扩大，实际平台登录与验证按平台提示处理。</p></div>
  {error&&<div className="publishing-notice publishing-notice-error" role="alert"><p>{error}</p></div>}
  {message&&<div className="publishing-notice publishing-notice-success" role="status"><p>{message}</p></div>}
  {!reviews.length&&<p className="publishing-help">尚无平台专属文案审阅记录。</p>}
  {reviews.map(review=>{
   const key=reviewKey(review),local=saved[review.job_id],current=review.status==='awaiting_review'&&local?.copy_hash===review.copy_hash?local:null,status=current?.status||review.status,reason=current?current.reason:review.reason,canReview=status!=='source_changed'&&status!=='revise',complete=platformOrder.every(platform=>completeCopy(review.platforms[platform]))&&Object.keys(review.platforms).every(platform=>platform in platformLabels),policyComplete=completePolicy(review),policy=review.option_policy,originality=originalities[key]||'',originalityDecision=current?current.originality_decision:review.originality_decision,at=reviewTime(review.reviewed_at),reasonId=id+'-reason-'+review.job_id,originalityId=id+'-originality-'+review.job_id;
   const ordered=[...platformOrder,...Object.keys(review.platforms).filter(platform=>!platformOrder.includes(platform as typeof platformOrder[number]))];
   return <article className="platform-copy-review" key={review.job_id} id={'copy-review-'+review.job_id} tabIndex={-1} style={{scrollMarginTop:'1.5rem'}}><a className="platform-copy-direct-link" href={'#copy-review-'+review.job_id}>本条文案直达链接</a>
    <header className="publishing-item-heading"><h3>{review.title||'待核对作品标题'}</h3><span className={'publishing-status publishing-status-'+(status==='approved'?'ready':status==='source_changed'?'blocked':status==='revise'?'rejected':'pending_review')}>{status==='approved'&&<Check size={13} aria-hidden="true"/>}{statusLabels[status]}</span></header>
    <p className="platform-copy-binding-note">文案随当前已审成片使用，无需另行批准。需要调整时可直接保存修改意见。{at?' 最近意见记录：'+at+'（北京）。':''}</p>
    {reason&&<p className="platform-copy-review-reason">{reason}</p>}
    {!complete&&<p className="platform-copy-incomplete" role="status">部分平台文案信息尚未齐全，执行时补齐相应内容。</p>}
    <div className="platform-copy-platforms">{ordered.map(platform=>{const copy=review.platforms[platform];return <details className="platform-copy-platform" key={platform}><summary><span><strong>{platformLabels[platform]||'未识别平台，需核对'}</strong><small>{copy?.title||'标题缺失，需补齐'}</small></span><ChevronDown size={16} aria-hidden="true"/></summary>{copy?<div className="platform-copy-fields"><div><h4>发布标题</h4><p className="platform-copy-public">{copy.title||'未提供'}</p></div><div><h4>发布简介</h4><p className="platform-copy-public">{copy.description||'未提供'}</p></div><div><h4>话题标签</h4>{copy.tags?.length?<ul className="platform-copy-tags">{copy.tags.map((tag,index)=><li key={tag+':'+index}>{tag.startsWith('#')?tag:'#'+tag}</li>)}</ul>:<p className="publishing-help">未提供话题标签</p>}</div><aside className="platform-copy-approach"><h4>编辑依据 · 不进入公开文案</h4><p>{copy.approach||'未提供'}</p></aside></div>:<p className="platform-copy-fields publishing-help">尚无此平台专稿。</p>}</details>;})}</div>
    <div className="platform-copy-options"><h4>发布设置</h4><dl><div><dt>内容分类</dt><dd>{policy?.category==='technology-ai'?'科技 / AI':'尚待核对'}</dd></div><div><dt>AI 声明</dt><dd>{policy?.ai_disclosure==='ai-generated'?'含 AI 生成内容':'尚待核对'}</dd></div><div><dt>可见范围</dt><dd>{policy?.visibility==='public'?'公开':'尚待核对'}</dd></div><div><dt>发布时间</dt><dd>{policy?.publish_mode==='immediate'?'立即发布（执行到该作品时）':'尚待核对'}</dd></div><div><dt>允许下载</dt><dd>{policy?.download==='disabled'?'关闭':'尚待核对'}</dd></div><div><dt>额外同步</dt><dd>{policy?.sync==='disabled'?'关闭':'尚待核对'}</dd></div></dl><p className="publishing-help">沿用这些设置；平台没有的控件按实际情况处理。</p><p className="platform-copy-originality">作品类型：{originalityDecision?originalityLabels[originalityDecision]:originalityLabels['self-produced-commentary']}</p></div>
    <details className="platform-copy-binding"><summary>查看来源与版本绑定</summary><dl><div><dt>平台文案版本</dt><dd>{review.strategy_version}</dd></div><div><dt>本版平台文案哈希</dt><dd>{review.copy_hash}</dd></div><div><dt>成片与来源绑定哈希</dt><dd>{review.binding_hash}</dd></div></dl></details>
    {status!=='source_changed'&&<div className="platform-copy-download"><a href={'/api/publishing-copy?job='+encodeURIComponent(review.job_id)+'&format=zip&hash='+encodeURIComponent(review.copy_hash)}><Download size={15} aria-hidden="true"/>{status==='approved'?'下载已批准文案与双封面 ZIP':status==='revise'?'下载已打回文案与双封面 ZIP':'下载文案与双封面 ZIP'}</a><p className="publishing-help">包含当前来源绑定的五平台文案和已批准双封面，不含视频。{status==='revise'?'已有修改意见，按意见接续。':'无需再审批平台文案。'}</p></div>}
    {canReview&&<div className="platform-copy-review-actions"><label htmlFor={reasonId}>修改意见<textarea id={reasonId} value={reasons[key]||''} maxLength={4000} disabled={!!pending} onChange={event=>setReasons(value=>({...value,[key]:event.target.value}))} placeholder="写明需要修改的平台与具体内容。"/></label><div className="publishing-actions"><Button type="button" variant="outline" disabled={!!pending||!(reasons[key]||'').trim()} onClick={()=>void decide(review,'revise')}>{pending?.job_id===review.job_id&&pending.decision==='revise'?'正在保存意见':'保存修改意见'}</Button></div></div>}
    {status==='source_changed'&&<p className="publishing-help">请基于当前来源重新准备五平台文案；请沿原任务更新相应内容。</p>}
   </article>;
  })}
 </section>;
}
