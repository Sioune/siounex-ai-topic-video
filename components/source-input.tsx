'use client';
import {useState} from 'react';
import type {ProductionJob} from '@/lib/production-contract';
import {SOURCE_INPUT_REQUIRED,latestSourceBlock,sourceDiagnosticCopy} from '@/lib/source-input-contract.mts';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
export default function SourceInput({job,onSaved}:{job:ProductionJob;onSaved:(job:ProductionJob)=>void}){
 const [content,setContent]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 let research:{id?:string;version?:number}|null=null,isResearch=false,original:{id?:string;version?:number}|null=null,isOriginal=false;
 try{const source=JSON.parse(job.source_snapshot);isResearch=source.source_id==='research-synthesis';if(isResearch&&source.research?.schema==='frozen-research-source-v1')research=source.research;isOriginal=source.source_id==='owner-original';if(isOriginal&&source.original?.schema==='frozen-owner-original-v1')original=source.original}catch{}
 if(isResearch)return <section className="milestone-card" id="source-input"><h3>固定研究材料</h3><p>当前采用冻结研究{research?.version?' v'+research.version:''}，来源、资料正文与读取范围保留在该版本。要改材料，请另存研究版本并保存为新选题；既有任务继续使用已冻结材料。</p>{research?.id&&Number.isInteger(research.version)&&<a className="text-link" href={'/research?id='+encodeURIComponent(research.id)+'&version='+research.version}>返回研究页面查看本版与来源 →</a>}</section>;
 if(isOriginal)return <section className="milestone-card" id="source-input"><h3>固定本人原创材料</h3><p>当前采用本人原创{original?.version?' v'+original.version:''}，完整原文、草稿与待核事项保留在该版本。产品说明不代表功能已实测；编辑另存不会替换本任务已冻结的输入。</p>{original?.id&&Number.isInteger(original.version)&&<a className="text-link" href={'/originals?id='+encodeURIComponent(original.id)+'&version='+original.version}>返回本人原创查看原文与草稿 →</a>}</section>;
 const blocked=job.status==='paused'&&job.error===SOURCE_INPUT_REQUIRED,canProvide=job.revision===0&&job.attempt===0&&!job.drafts?.length&&(job.status==='waiting_executor'||blocked),diagnostic=blocked?latestSourceBlock(job.reviews||[],job)?.diagnostic||null:null,copy=sourceDiagnosticCopy(diagnostic),showText=canProvide&&(!blocked||copy.canProvideText);
 if(!blocked&&!canProvide)return null;
 async function submit(action:'source_input'|'source_input_retry'){
  setBusy(true);setError('');try{
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(job.source_snapshot)),sourceHash=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
   const response=await fetch('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:job.id,revision:job.revision,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash,source_snapshot_hash:sourceHash,expected_updated_at:job.updated_at,...(action==='source_input'?{content}:{})})});
   const value=await response.json() as {job?:ProductionJob;error?:string};if(!response.ok||!value.job)throw Error(value.error||'来源保存未完成');onSaved(value.job);setSaved(true);
  }catch(e){setError(e instanceof Error?e.message:'来源保存未完成')}finally{setBusy(false)}
 }
 return <section className="milestone-card" id="source-input" data-source-stage={diagnostic?.stage||'unknown'}><h3>{blocked?copy.title:'来源正文准备'}</h3>
  {blocked?<><p>{copy.detail}{diagnostic?.host?'（'+diagnostic.host+(diagnostic.status?'，HTTP '+diagnostic.status:'')+'）':''}。</p><p>{diagnostic?.stage==='images'?'完整正文已保留；重试将重新准备配图，不会替换正文。':'可重新准备来源；首次生成前也可粘贴完整正文。'}本次准备未领取任务或调用模型。</p></>:<p>支持的来源会由执行器读取。其他来源或原文暂时不可读取时，可以在首次生成前粘贴完整正文；它会标为你提供的材料，仍须来源审核。</p>}
  {showText&&<><label htmlFor={'source-'+job.id}>完整来源正文</label><Textarea id={'source-'+job.id} aria-label="完整来源正文" value={content} onChange={e=>setContent(e.target.value)} maxLength={100000} disabled={busy}/><p>至少100字符，保留全文；确认后冻结输入，不会改写已有稿件或重置预算。</p><Button disabled={busy||content.trim().length<100} onClick={()=>submit('source_input')}>保存来源正文并继续排队</Button></>}
  {blocked&&<Button variant="outline" disabled={busy} onClick={()=>submit('source_input_retry')}>{copy.remedy}</Button>}
  {saved&&<p role="status">来源准备请求已保存，等待执行器准备；尚未生成新稿。</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
