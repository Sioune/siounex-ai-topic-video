'use client';
import type{ProductionJob,Milestone}from'@/lib/production-contract';
import {SiteArchiveFiles,visibleSiteArchives,currentSiteVideoMilestone,NativeSiteMilestone,hasCurrentFinalRetention,SiteArchiveRetentionNotice}from'./site-archive-files';
export function NativeVideoArchive({job}:{job:ProductionJob}){if(visibleSiteArchives(job).length)return <SiteArchiveFiles job={job}/>;if(hasCurrentFinalRetention(job))return <section className="production-notice" id="native-video-archive"><h2>当前定稿归档</h2><SiteArchiveRetentionNotice job={job}/><p>当前归档绑定需重新读取，暂不提供历史文件入口。历史哈希与审核记录保留用于追溯。</p></section>;const a=job.facts?.native_video_archive;if(!a||'site_archive_id'in a)return null;return <section className="production-notice" id="native-video-archive"><h2>完整视频私有归档</h2><p>{a.file_name} · {(a.size_bytes/1048576).toFixed(1)} MB · Library 版本 {a.version}</p><p>完整原件已存入本人 ChatGPT 资料库。请在 ChatGPT 资料库按上面的文件名查找并使用原生下载入口；也可继续使用已有本机成片。</p><a className="text-link" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">打开 ChatGPT，前往资料库</a><p>本站不提供跨站视频直下或私有下载地址复制。归档原件已实际核对字节与哈希；归档不代表视频质量通过或外部发布授权。</p><details><summary>查看归档核验</summary><p>SHA256：{a.sha256}</p><p>核验时间：{a.verified_at}</p></details></section>}

function NativeVideoRecord({job,milestone,historical=false}:{job:ProductionJob;milestone:Milestone;historical?:boolean}){
 let a:{sha256?:string;qa?:{site_archive_id?:string;native_handoff?:boolean;file_name?:string;duration_seconds?:number;size_bytes?:number}};
 try{a=JSON.parse(milestone.artifact);}catch{return null;}
 if(a.qa?.site_archive_id)return <NativeSiteMilestone job={job} milestone={milestone} historical={historical}/>;
 if(!a.qa?.native_handoff)return null;
 if(historical&&hasCurrentFinalRetention(job))return <section className="milestone-card"><h3>历史原生草稿 · 保留审核记录</h3><p>{a.qa.file_name} · {Number(a.qa.duration_seconds).toFixed(3)} 秒 · {(Number(a.qa.size_bytes)/1048576).toFixed(2)} MB</p><p>历史版本仅展示哈希与审核摘要；当前交付请使用上方最新正式成片。</p><small style={{overflowWrap:'anywhere'}}>SHA256 {a.sha256}</small></section>;
 const status=milestone.status==='awaiting_human'?'待本人审片':milestone.status==='approved'?'视频节点已通过':milestone.status==='revise'?'已打回':milestone.status;
 return <section className="milestone-card"><h3>{historical?'历史原生草稿':'原生草稿已回站'} · {historical?'保留旧版记录':status}</h3><p>{a.qa.file_name} · {Number(a.qa.duration_seconds).toFixed(3)} 秒 · {(Number(a.qa.size_bytes)/1048576).toFixed(2)} MB</p><p>已绑定批准稿 v{milestone.revision}、本次原生导出和已保存的 Library 原文件。请打开本会话已交付附件或在 ChatGPT 资料库按文件名查看。</p>{historical?<p>旧版文件与审核结果保留，当前交付请使用上方最新正式成片。</p>:<p>本机实际文件哈希与时长已核对；完整解码和音量检查来自制作会话回执。声音语义及连续画面仍待本人审核，尚未批准成片或对外发布。源素材目前保存在本机编辑器，不能据此承诺云端可重渲染。</p>}<a className="text-link" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">打开 ChatGPT 资料库查看原文件</a>{!historical&&<p><a href="#video-review" className="text-link">前往视频里程碑审核 →</a></p>}<small style={{overflowWrap:'anywhere'}}>SHA256 {a.sha256}</small></section>;
}

export function NativeVideoVersions({job}:{job:ProductionJob}){
 const retention=hasCurrentFinalRetention(job);
 const milestones=(job.milestones||[]).filter(m=>m.node==='video'&&m.revision===job.revision&&m.status!=='invalidated').sort((a,b)=>b.artifact_version-a.artifact_version);
 // Every voice and editor path uses the same current epoch/version rule. Under
 // final retention, an unverified archive must never fall back to an old file.
 const current=currentSiteVideoMilestone(job)||(!retention?milestones.find(m=>m.mode_epoch===job.mode_epoch&&m.status!=='superseded'):null);
 const history=milestones.filter(m=>m.id!==current?.id);
 return <>{current&&<NativeVideoRecord job={job} milestone={current}/>}{history.length>0&&<details className="production-technical" data-historical-native-videos><summary>{retention?'历史审核记录':'历史成片版本'}（{history.length}）</summary><p>{retention?'以下为历史版本的哈希与审核摘要，当前成品请使用上方正式交付。':'旧成片与原审核记录保留，以下文件不作为当前交付版本。'}</p>{history.map(m=><NativeVideoRecord key={m.id} job={job} milestone={m} historical/>)}</details>}</>;
}
