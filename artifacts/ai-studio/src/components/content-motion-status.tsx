import type {ProductionJob} from '@/lib/production-contract';
export default function ContentMotionStatus({job}:{job:ProductionJob}){
 if(job.review_mode==='node')return null;
 if(job.status==='cancelled')return null;
 const latest=job.milestones?.filter(m=>m.node==='video'&&m.revision===job.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];let qa:any=null;try{qa=latest?JSON.parse(latest.artifact).qa?.content_motion:null;}catch{}
 const gaps=job.facts?.native_preparation_handoff?.missing?.filter((r:any)=>String(r.code).startsWith('MOTION_'))||[];
 return <section className="production-notice" aria-label="正文画面质量" data-content-motion-policy="content-motion@1"><b>正文画面质量</b><p>围绕内容找视频与支撑材料；有效动态至少80%，静图最多20%、每张不超过3秒。禁止纯文字填充和重复素材；开头3秒高潮可在正文对应处再出现一次。过程演示动画可以使用。</p>{qa?.policy_id==='content-motion@1'&&<p>当前成片已完成画面检查：有效动态 {Math.round(qa.metrics.dynamic_ratio*100)}%，静图 {Math.round(qa.metrics.still_ratio*100)}%，共 {qa.metrics.shot_count} 个镜头。视听效果仍由你审核。</p>}{gaps.length>0&&<><p>本轮待补画面，已保留原稿、音轨和已取得材料：</p><ul>{gaps.map((r:any,i:number)=><li key={i}>{r.detail}</li>)}</ul><p>系统沿缺口继续查找；相同来源和输入复用已有记录。也可用“取消制作”让该选题退出队列。</p></>}</section>;
}
