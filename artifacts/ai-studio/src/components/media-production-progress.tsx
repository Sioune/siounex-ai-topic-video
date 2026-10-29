'use client';
import type {ProductionJob} from '@/lib/production-contract';
import {bindingMatches,privateVideoScopeAuthorized} from '@/lib/media-continuation-contract';
import {Button} from './ui/button';
import {useEffect,useRef,useState} from 'react';

type Progress={state:string;label:string;message:string;missing:string[];href:string;link:string};
export function currentMediaProductionProgress(job:ProductionJob,now=Date.now()):Progress|null{
 if(job.is_test||job.status!=='approved'||job.revision<1||job.approved_revision!==job.revision||!job.approved_hash||job.facts?.candidate_present||job.publication_reports?.length||job.milestones?.some(m=>m.node==='video'&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch&&!['invalidated','superseded'].includes(m.status)))return null;
 const scope=job.media_continuation?.scope,current=!!scope&&scope.schema==='owner-media-scope-v1'&&scope.id===job.media_continuation?.current_id&&!!scope.binding&&bindingMatches(job,scope.binding)&&(scope.scope==='preparation'||privateVideoScopeAuthorized(scope,job.review_mode));
 if(!current)return{state:'scope-required',label:'口播已批准，制作范围待接续',message:scope?'当前制作范围属于旧版本，不能沿用到本稿。请在下方核对并确认本版范围。':'本版口播批准已保留，尚未读到当前素材准备范围。请查看范围与执行记录，不能据此认定视频已开始制作。',missing:[],href:'#media-next-step',link:'查看本版继续范围与准备队列 →'};
 const h=job.facts?.native_preparation_handoff,p=job.facts?.execution_preparation;
 const prepared=p?`已准备 ${p.segment_count} 段普通参考旁白、${p.source_clip_count} 段源片节选；这些准备尚不代表成片已完成。`:'';
 const privateProduction=scope.scope==='private-video',systemPreparation=privateProduction?'普通审阅音轨、素材与剪辑工程由系统接续；无需本人另行录音或上传音轨。':'';
 if(h&&h.binding?.scope_id===scope.id&&bindingMatches(job,h.binding)){
  const missing=(Array.isArray(h.missing)?h.missing:[]).map(m=>m.detail).filter(Boolean),href='#native-preparation-progress',link='查看本轮取材、工程与回传记录 →';
  const actualNote=privateProduction&&h.checkpoint?.note?.trim()?' 当前执行回执：'+h.checkpoint.note.trim():'';
  if(h.status==='claimed'&&(h.lease_expired||Number(h.lease_until)<=now))return{state:'receipt-unknown',label:'制作准备结果待核对',message:prepared+'本轮领取已过期，先核对原调用、现有工程和输出回执，不直接重复制作。',missing:[],href,link};
  if(h.status==='claimed')return{state:'claimed',label:'取材与制作准备已领取',message:prepared+'当前执行器正在接手本版准备；是否已剪辑、导出和归档，以本次实际产物回执为准。'+systemPreparation+actualNote,missing:[],href,link};
  if(h.status==='blocked')return{state:'blocked',label:h.editing_allowed?'取材与制作待处理':'当前仅做准备，审阅视频待启动',message:prepared+(h.editing_allowed?'本轮已经回传待处理项，口播批准保持有效。':'当前范围只允许准备检查，尚未允许剪辑成片。可在这里确认本版审阅视频制作范围；实际缺项仍需补齐。')+systemPreparation+actualNote,missing,href,link};
  if(h.status==='completed')return{state:'returned',label:'本轮准备已回传，待核对成片回传',message:prepared+'尚未读到本版成片候选；请核对实际导出与网站归档记录，准备完成不能代替成片完成。'+systemPreparation+actualNote,missing:[],href,link};
  return{state:'queued',label:'取材与制作准备已排队',message:prepared+(h.editing_allowed?'本版零新增费用私有制作范围已确认，等待后台领取；无需重复确认已批准口播或制作范围。':'当前只允许准备检查，成片编辑仍需确认私有视频范围。')+systemPreparation+actualNote,missing,href:h.editing_allowed?href:'#media-next-step',link:h.editing_allowed?link:'查看并确认本版私有制作范围 →'};
 }
 if(p)return{state:'prepared',label:'音轨与源片已准备，等待剪辑接续',message:prepared,missing:p.missing,href:'#execution-preparation-progress',link:'查看已准备的音轨、节选与剩余步骤 →'};
 const stages=(job.stages||[]).flatMap(s=>{if(!['media_inventory','media_inputs'].includes(s.stage)||s.review_revision!==job.revision||s.review_hash!==job.approved_hash)return[];try{const v=JSON.parse(s.result||'null');return v?.scope_id===scope.id&&bindingMatches(job,v.binding||{})?[{stage:s,value:v}]:[]}catch{return[]}});
 const missing=stages.flatMap(({value})=>(Array.isArray(value.receipt?.checks)?value.receipt.checks:[]).filter((c:{passed?:boolean;detail?:unknown})=>c.passed===false&&typeof c.detail==='string').map((c:{detail:string})=>c.detail));
 if(privateProduction&&!stages.some(({stage})=>stage.status==='running'))return{state:'awaiting-handoff',label:'制作范围已确认，等待系统准备',message:systemPreparation+'当前尚未读到本版制作领取回执，等待后台按已批准稿和授权范围继续。制作前检查清单保留为历史，不表示需要本人逐项补交录音或工程。',missing:[],href:'#media-next-step',link:'查看准备队列与实际执行记录 →'};
 if(stages.some(({stage})=>stage.status==='blocked'))return{state:'probe-blocked',label:'准备检查待补充',message:'本版准备检查已有实际回执，具体待办见下方；来源与口播的批准保持有效。',missing,href:'#media-next-step',link:'查看实际缺项与只读重查入口 →'};
 if(stages.some(({stage,value})=>stage.status==='running'&&Number(value.lease_until)<=now))return{state:'probe-unknown',label:'准备检查结果待核对',message:'当前准备检查领取已过期，先核对本轮回执，不能直接重做。',missing:[],href:'#media-next-step',link:'查看原检查回执与接续入口 →'};
 if(stages.some(({stage})=>stage.status==='running'))return{state:'probe-running',label:'准备检查已领取',message:'正在检查本版原片、音轨和时序条件，尚不代表成片已开始合成。',missing:[],href:'#media-next-step',link:'查看本版检查进度 →'};
 if(scope.scope!=='private-video')return{state:'private-scope-required',label:'准备范围已登记，私有制作待确认',message:'当前范围只允许准备检查。若要继续成片编辑，请在现有入口预览并确认本版私有视频范围。',missing,href:'#media-next-step',link:'查看并确认本版私有制作范围 →'};
 return{state:'awaiting-handoff',label:'制作范围已确认，等待准备接续',message:stages.length?'本版准备检查已登记，等待后台按当前素材与授权继续；尚未读到成片候选或制作领取回执。':'本版私有制作范围已确认，尚未读到对应准备检查与制作领取回执。请重新读取，并核对下方队列记录。',missing,href:'#media-next-step',link:'查看准备队列、实际待办与接续入口 →'};
}
export function MediaProductionProgress({job,busy=false,onRefresh,onStartVideo}:{job:ProductionJob;busy?:boolean;onRefresh?:()=>void;onStartVideo?:(requestId:string)=>void}){
 const [preview,setPreview]=useState(false),[confirmed,setConfirmed]=useState(false),requestId=useRef('');
 useEffect(()=>{setPreview(false);setConfirmed(false);requestId.current='';},[job.id,job.revision,job.mode_epoch,job.approved_hash,job.contract_hash,job.media_continuation?.current_id]);
 const p=currentMediaProductionProgress(job);if(!p)return null;
 const scope=job.media_continuation?.scope,h=job.facts?.native_preparation_handoff;
 const inflight=h?.status==='claimed'&&Number(h.lease_until)>Date.now()||job.operations?.some(o=>['running','prepared'].includes(o.status)&&Number(o.lease_until)>Date.now())||job.stages?.some(s=>{if(s.status!=='running'||s.review_revision!==job.revision)return false;try{return Number(JSON.parse(s.result||'{}').lease_until)>Date.now()}catch{return false}});
 const canStart=scope?.scope==='preparation'&&scope.id===job.media_continuation?.current_id&&bindingMatches(job,scope.binding)&&!!onStartVideo&&!inflight;
 const demonstration=h?.missing?.some(m=>m.code==='required-demonstration-missing'||m.code==='owner-gameplay-comparison-required');
 return <section className="job-next-step" aria-label="当前取材与制作进度" data-media-production-progress={p.state}><h3>{p.label}</h3><p role="status">{p.message}</p>{p.missing.length>0&&<><h4>本轮记录的待处理项</h4><ul>{p.missing.map((detail,i)=><li key={i}>{detail}</li>)}</ul></>}
  {canStart&&!preview&&<Button disabled={busy} onClick={()=>{requestId.current=crypto.randomUUID();setPreview(true);setConfirmed(false)}}>开始制作审阅视频</Button>}
  {canStart&&preview&&<div className="production-notice" data-private-video-scope-preview><p>将使用已批准口播 v{job.revision} 和当前分镜，确认零新增费用的私有审阅视频范围并排队准备检查。缺失的真实素材仍会暂停；成片视听审核、本人声音版二审与公开发布分别处理。</p><small>本稿 SHA256：{job.approved_hash}</small><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/> 我确认本版私有审阅视频制作范围</label><Button disabled={busy||!confirmed} onClick={()=>onStartVideo?.(requestId.current)}>确认并排队审阅视频制作</Button><Button variant="outline" disabled={busy} onClick={()=>{setPreview(false);setConfirmed(false)}}>取消本次预览</Button></div>}
  {demonstration&&<p>若本稿确实要展示真实操作或试玩对照，可先<a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">在 ChatGPT 上传已有录屏</a>，再<a href="#media-plan-input">登记已有素材</a>；若要改成明确注明未实测的介绍解读，请<a href="#script-feedback">提交本版稿件修改意见</a>，新稿重新审核。这里不会自动改变已批准方向。</p>}
  {h?.missing?.some(m=>m.code==='private-review-history-resources')&&<a className="text-link" href="#series-controls">核对或更新本任务的最近三期 →</a>}
  <a className="text-link" href={p.href}>{p.link}</a>{onRefresh&&<Button variant="outline" disabled={busy} onClick={onRefresh}>重新读取制作进度</Button>}
 </section>;
}
