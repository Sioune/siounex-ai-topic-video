'use client';

import './publication-data.css';
import {useCallback,useEffect,useState} from 'react';
import {ArrowUpRight,CalendarClock,Check,Clock3,FileImage,RefreshCw} from 'lucide-react';
import {Button} from './ui/button';
import {PUBLICATION_PLATFORMS,type PublicationCollection,type CollectionResponse} from '@/lib/publication-collection-contract.mts';

export function formatBeijing(value:string|null){return value?new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(new Date(value)):'时间待补充';}
export function toBeijingInput(value:string|null){return value?new Date(value).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}).replace(' ','T').slice(0,16):'';}
export function fromBeijingInput(value:string){return value?new Date(value+(value.length===16?':00':'')+'+08:00').toISOString():null;}
export const collectionStatusLabel={scheduled:'待采集',due:'到期待采集',uploaded:'已上传 · 待核对',sampled:'已采样'} as const;
export function collectionSampleHref(item:PublicationCollection){return '/data?'+new URLSearchParams({collection:item.id,video_id:item.video_id,sample_kind:item.sample_kind}).toString()+'#sample-form';}

export function CollectionStatus({status}:{status:PublicationCollection['status']}){const Icon=status==='sampled'?Check:status==='uploaded'?FileImage:Clock3;return <span className={'collection-status collection-status-'+status}><Icon size={14} aria-hidden="true"/>{collectionStatusLabel[status]}</span>;}

export function CollectionCards({collections,compact=false}:{collections:PublicationCollection[];compact?:boolean}){return <div className={'collection-cards'+(compact?' collection-cards-compact':'')}>{collections.map(item=><article className="collection-card" key={item.id}>
 <div className="collection-card-top"><span className="collection-window">T+{item.target_hours}<small>小时</small></span><CollectionStatus status={item.status}/></div>
 {!compact&&<h3>{item.title}</h3>}
 <p className="collection-deadline">{formatBeijing(item.due_at)}<span>（北京）{!compact&&' · '+PUBLICATION_PLATFORMS[item.platform]}</span></p>
 {item.collection_anchor_note&&<p className="collection-evidence-note">{item.collection_anchor_note}</p>}
 <p className="collection-evidence-note">{item.evidence.length?item.evidence.length+' 张原始截图已绑定':item.status==='sampled'?'已保留实际采样记录':'从平台数据面板保存截图，到这里直接上传。'}</p>
 <div className="collection-card-actions"><a className="publication-link-button" href={item.upload_url}><FileImage size={16} aria-hidden="true"/>{item.evidence.length?'查看 / 添加截图':'上传数据截图'}</a><a className="publication-inline-link" href={collectionSampleHref(item)}>{item.status==='sampled'?'查看采样':'核对并补录指标'}<ArrowUpRight size={15} aria-hidden="true"/></a></div>
 </article>)}</div>;}

export default function DataCollections({revision=0}:{revision?:number}){
 const[collections,setCollections]=useState<PublicationCollection[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{setBusy(true);try{const r=await fetch('/api/data-collections',{cache:'no-store'}),d=await r.json() as CollectionResponse&{error?:string};if(!r.ok)throw Error(d.error||'采集任务读取失败');setCollections(d.collections||[]);setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}},[]);
 useEffect(()=>{void load();},[load,revision]);
 const active=collections?.filter(item=>item.status!=='sampled')||[],completed=collections?.filter(item=>item.status==='sampled')||[];
 return <section className="data-collections publication-surface" aria-label="发布后的数据采集">
  <header className="publication-section-heading"><div><span className="publication-eyebrow"><CalendarClock size={16} aria-hidden="true"/>发布后跟踪</span><h2>下一次，看看观众的反馈</h2><p>按发布时间跟踪 T+24 / T+48，手机截图可以直接上传。</p></div><Button variant="outline" disabled={busy} onClick={()=>void load()} aria-label="刷新采集任务"><RefreshCw size={16} aria-hidden="true"/>刷新</Button></header>
  {error&&<p role="alert" className="publication-feedback">{error}</p>}
  {!collections&&!error&&<p role="status">正在读取采集任务…</p>}
  {collections&&!collections.length&&<div className="collection-empty"><CalendarClock size={25} aria-hidden="true"/><p>作品发布后，在交付页点「已发布」，这里会出现采集任务。</p></div>}
  {!!active.length&&<CollectionCards collections={active}/>}
  {!!completed.length&&<details className="collection-completed"><summary>已完成采样（{completed.length}）</summary><CollectionCards collections={completed}/></details>}
 </section>;
}
