'use client';
import {useState} from 'react';
import type {ProductionJob} from '@/lib/production-contract';
import type {AutomaticCloneStagedResult} from '@/lib/automatic-clone-contract.mts';
import {Button} from './ui/button';

export function currentStagedCloneResult(job:ProductionJob,requestId:string|null,value:AutomaticCloneStagedResult|null|undefined){
 const v=value,b=v?.binding,video=v?.video,a=v?.technical_archive;
 if(!v||!b||!video||v.id!==job.id||!/^acl_[a-f0-9]{64}$/.test(requestId||'')||v.request_id!==requestId||!/^lrd_[a-f0-9]{64}$/.test(v.local_draft_id)||b?.revision!==job.revision||b.script_hash!==job.approved_hash||b.mode_epoch!==job.mode_epoch||b.contract_hash!==job.contract_hash||v.status!=='staging'||v.human_review_pending!==true||v.warehouse_allowed!==false||v.quality_approved!==false||v.publication_authorized!==false||!/^sitefile_[a-f0-9]{64}$/.test(video?.site_archive_id||'')||!/^[a-f0-9]{64}$/.test(video?.sha256||'')||!Number.isSafeInteger(video?.size_bytes)||video.size_bytes<1||!Number.isFinite(video?.duration_seconds)||video.duration_seconds<=0||(v.delivery_mode==='results-only'?a!==null:v.delivery_mode!==undefined||!a||!['not_started','uploading','sealed','confirmed'].includes(a.status)||!/^[a-f0-9]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.size_bytes)||a.size_bytes<1))return null;
 const href='/api/site-archive?id='+encodeURIComponent(job.id)+'&archive='+encodeURIComponent(video.site_archive_id);
 return video.url===href?v:null;
}
export default function StagedCloneResult({job,requestId,result}:{job:ProductionJob;requestId:string|null;result:AutomaticCloneStagedResult|null|undefined}){
 const current=currentStagedCloneResult(job,requestId,result),[failed,setFailed]=useState<string|null>(null),[retry,setRetry]=useState(0);if(!current)return null;
 const video=current.video;
 return <div data-staged-clone-result className="final-package-confirmation"><h4>本人声音成片已完成</h4><p>视频已回传，可播放或下载。封面和发布文案齐备后，由你在网站审核入仓。</p>{failed===video.site_archive_id?<><p role="alert">视频暂未载入，可重试播放或下载文件。</p><Button variant="outline" onClick={()=>{setFailed(null);setRetry(n=>n+1)}}>重试播放本人声音成片</Button></>:<video key={video.site_archive_id+':'+retry} controls preload="metadata" src={video.url} onError={()=>setFailed(video.site_archive_id)} style={{display:'block',maxWidth:'100%',maxHeight:560}}/>}<p><a href={video.url}>下载本人声音成片 MP4</a> · {video.duration_seconds.toFixed(3)} 秒</p><details><summary>当前文件校验</summary><p style={{overflowWrap:'anywhere'}}>视频 SHA256：{video.sha256}</p></details></div>;
}
