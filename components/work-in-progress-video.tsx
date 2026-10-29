'use client';
import {useEffect,useState} from 'react';

type Preview={id:string;revision:number;job_revision:number;review?:{decision:'approve'|'revise';feedback:string;created_at:string}|null};
export default function WorkInProgressVideo({jobId}:{jobId:string}){
 const [p,setP]=useState<Preview|null>(null),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();setP(null);setFeedback('');setMessage('');setError('');const read=()=>fetch('/api/work-in-progress-video?id='+encodeURIComponent(jobId),{signal:c.signal}).then(async r=>r.ok?await r.json() as {preview:Preview|null}:null).then(v=>{if(!c.signal.aborted)setP(v?.preview||null)}).catch(()=>{});read();const timer=setInterval(read,8000);return()=>{clearInterval(timer);c.abort()}},[jobId]);
 if(!p)return null;
 async function submit(decision:'approve'|'revise'){
  if(!p||busy)return;if(decision==='revise'&&!feedback.trim()){setError('请填写需要修改的地方。');return}setBusy(true);setError('');setMessage('');
  try{const r=await fetch('/api/work-in-progress-video',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:jobId,preview_id:p.id,decision,feedback,request_id:crypto.randomUUID()})}),v=await r.json() as {error?:string;formal?:{state?:string}};if(!r.ok)throw Error(v.error||'意见暂时无法保存');setP({...p,review:{decision,feedback,created_at:new Date().toISOString()}});setMessage(v.formal?.state==='rework-queued'?'你的意见已保存，修改已排队。':v.formal?.state==='linked'?'你的决定已接续到正式视频节点。':v.formal?.state==='formal-node-already-decided'?'意见已保存，正式节点已有其他决定，本次意见尚未接续。':v.formal?.state==='feedback-recorded-rework-pending'?'意见已接续到正式节点，修改尚未排队。':'你的意见已保存，等待同一视频的正式节点接续。');}
  catch(e){setError(e instanceof Error?e.message:'意见暂时无法保存');}finally{setBusy(false)}
 }
 return <section className="production-notice" aria-label="视频人工审阅"><b>当前视频 · 请你审阅</b><p>第 {p.revision} 稿的视频，是否通过由你决定。</p><video controls preload="metadata" playsInline style={{maxWidth:'100%',maxHeight:600}} src={'/api/work-in-progress-video?id='+encodeURIComponent(jobId)+'&preview='+encodeURIComponent(p.id)}/>{p.review&&<p>你上次的决定：{p.review.decision==='approve'?'这版通过':'需要修改'}{p.review.feedback?' · '+p.review.feedback:''}</p>}<label htmlFor={'preview-feedback-'+jobId}>你的意见</label><textarea id={'preview-feedback-'+jobId} value={feedback} onChange={e=>setFeedback(e.target.value)} maxLength={4000} rows={3} placeholder="请写下需要保留或修改的地方" disabled={busy||p.job_revision!==p.revision}/><div><button type="button" onClick={()=>submit('approve')} disabled={busy||p.job_revision!==p.revision}>这版通过</button>{' '}<button type="button" onClick={()=>submit('revise')} disabled={busy||p.job_revision!==p.revision}>需要修改</button></div><small>这里保存的是你对这版视频的意见，正式视频节点及后续制作状态会另行更新。</small>{p.job_revision!==p.revision&&<p role="status">这是旧稿的视频，新稿视频回站后再审阅。</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}</section>;
}
