'use client';
import {currentPreparation} from '@/lib/media-preparation-contract';
import {durationStatus} from '@/lib/final-media-contract';
import type {ProductionJob} from '@/lib/production-contract';
import VerifiedMediaPreview from './verified-media-preview';
export default function MediaPreparation({job}:{job:ProductionJob}){
 const p=currentPreparation(job);if(!p)return null;
 const video=job.milestones?.find(m=>m.node==='video'&&m.revision===job.revision);
 const duration=durationStatus(p.qa,p.assets.find(a=>a.node==='video')!.sha256);
 return <section className="milestone-card"><h3>本版私有视频草稿</h3><p role={duration.passed?'status':'alert'}>{duration.message}</p><p>口播稿 v{p.revision} · {p.duration} 秒 · 临时普通审稿音色，非本人克隆声音</p><p>{video?'已回传视频节点，成片画面与声音需独立审核。':'脚本已通过；此准备稿尚未回传视频节点，封面审核不阻挡视频草稿。'}</p><p>{p.limits}</p><VerifiedMediaPreview assets={p.assets}/><details><summary>准备稿执行与技术检查</summary><pre>{JSON.stringify(p.qa,null,2)}</pre></details><small>准备和回传不批准质量，不授权付费或公开发布。</small></section>;
}
