'use client';
import {useEffect,useMemo,useState} from 'react';
import type {ProductionJob} from '@/lib/production-contract';

// Keep the accessibility tree and DOM bounded even when one saved record is
// itself very large. Boundaries never split a UTF-16 surrogate pair.
const PAGE_CHARS=12000,ROWS_PER_PAGE=20;
function textBoundaries(value:string){const points=[0];let i=0;while(i<value.length){let end=Math.min(i+PAGE_CHARS,value.length);if(end<value.length&&end>i&&value.charCodeAt(end-1)>=0xd800&&value.charCodeAt(end-1)<=0xdbff&&value.charCodeAt(end)>=0xdc00&&value.charCodeAt(end)<=0xdfff)end--;points.push(end);i=end;}return points;}
function PageControls({label,page,count,onPage}:{label:string;page:number;count:number;onPage:(page:number)=>void}){
 const [requested,setRequested]=useState(String(page+1));useEffect(()=>setRequested(String(page+1)),[page]);
 return <div aria-label={label+'分页'}><button type="button" disabled={page===0} onClick={()=>onPage(page-1)}>{label==='记录内容'?'上一段':'上一页'}</button><span> 第 {page+1} / {count} {label==='记录内容'?'段':'页'} </span><button type="button" disabled={page===count-1} onClick={()=>onPage(page+1)}>{label==='记录内容'?'下一段':'下一页'}</button><form onSubmit={e=>{e.preventDefault();const n=Number(requested);if(Number.isInteger(n)&&n>=1&&n<=count)onPage(n-1);}}><label>跳至<input type="number" min={1} max={count} value={requested} onChange={e=>setRequested(e.target.value)} aria-label={label+'页码'}/></label><button type="submit">跳转</button></form></div>;
}
function RawValue({value}:{value:unknown}){
 const text=useMemo(()=>JSON.stringify(value,null,2)??'null',[value]),bounds=useMemo(()=>textBoundaries(text),[text]),[page,setPage]=useState(0),count=Math.max(1,bounds.length-1),current=Math.min(page,count-1);
 return <div data-history-value><pre data-historical-diagnostics>{text.slice(bounds[current],bounds[current+1]??text.length)}</pre>{count>1&&<PageControls label="记录内容" page={current} count={count} onPage={setPage}/>}</div>;
}
function ParsedRecord({label,value,parseJson=false}:{label:string;value:unknown;parseJson?:boolean}){const [open,setOpen]=useState(false);return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>{label}</summary>{open&&<RawValue value={parseJson&&typeof value==='string'?safeJson(value):value}/>}</details>;}
function safeJson(value:string){try{return JSON.parse(value)}catch{return value}}
function HistoryRows({label,records}:{label:string;records:unknown[]}){
 const [open,setOpen]=useState(false),[page,setPage]=useState(0),count=Math.max(1,Math.ceil(records.length/ROWS_PER_PAGE)),current=Math.min(page,count-1),start=current*ROWS_PER_PAGE;
 return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>{label}（{records.length}条）</summary>{open&&<div data-history-group={label}>{records.length===0?<p>暂无记录</p>:<>{records.slice(start,start+ROWS_PER_PAGE).map((record,index)=>{const r=record&&typeof record==='object'?record as Record<string,unknown>:{};const name=[r.node,r.decision,r.status,r.created_at].filter(x=>typeof x==='string'&&x).map(x=>String(x).slice(0,100)).join(' · ');return <ParsedRecord key={start+index} label={'第 '+(start+index+1)+' 条'+(name?' · '+name:'')} value={record}/>})}{count>1&&<PageControls label={label} page={current} count={count} onPage={setPage}/>}</>}</div>}</details>;
}
export default function ProductionHistory({job,cancelled=false}:{job:ProductionJob;cancelled?:boolean}){
 return <div data-production-history><p>按分类和记录查看；长记录分段显示，原始内容完整保留。</p>{!cancelled&&<HistoryRows label="稿件" records={job.drafts||[]}/>}<HistoryRows label="审核记录" records={job.reviews||[]}/><HistoryRows label="节点记录" records={job.milestones||[]}/><HistoryRows label="执行记录" records={job.operations||[]}/><ParsedRecord label="恢复检查点" value={job.checkpoint} parseJson/>{!cancelled&&<ParsedRecord label="制作规范快照" value={job.skill_snapshot} parseJson/>}</div>;
}
