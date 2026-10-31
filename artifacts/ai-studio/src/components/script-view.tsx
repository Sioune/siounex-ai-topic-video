'use client';
import {useState,type ReactNode} from 'react';
import type {ProductionJob,ProductionDraft,DraftContent} from '@/lib/production-contract';
function SourcePicture({url,title}:{url:string;title:string}){const [failed,setFailed]=useState(false);return <figure>{failed?<p role="status">图片未能加载，可打开原图查看。</p>:<img src={url} alt={title} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)} style={{width:'100%',maxHeight:360,objectFit:'contain'}}/>}<figcaption><a href={url} target="_blank" rel="noopener noreferrer">{title} · 打开原图</a></figcaption></figure>}
export default function ScriptView({job,draft,content,children}:{job:ProductionJob;draft:ProductionDraft;content:DraftContent;children?:ReactNode}){
 const support=content.execution?.content_support;
 const pictures=content.evidence.filter(e=>/\.(?:png|jpe?g|webp)(?:\?|$)/i.test(e.url));
 const approved=job.approved_revision===draft.revision&&job.approved_hash===draft.content_hash;
 return <section className="milestone-card script-reader script-view">
  <header className="script-reader-heading"><h3>口播稿 v{draft.revision}</h3><span className={approved?'script-review-state approved':'script-review-state'}>{approved?'口播已批准':'待审核草稿'}</span></header>
  <p className="script-reader-context">{approved?'本版口播稿已通过审核；视频和后续节点分别审核。':'来源审核和口播审核分别进行。'}</p>
  <div className="script-reader-body">{content.script}</div>
  {content.narration_preflight&&<p className="script-preflight" role="status">{approved?'本版口播已批准；历史综合预检保留为制作准备记录，不撤销当前批准。':content.narration_preflight.text_preflight==='clear'?'文本预检已通过，等待节点审核；素材与成片在后续独立核验。':content.narration_preflight.text_preflight==='blocked'?'文本预检有待处理，请查看具体审核依据；素材准备另行记录。':'历史综合预检保留；请按当前节点核对来源与口播，素材缺口另行处理。'}</p>}
  <div className="script-reader-actions">{children}</div>
  {content.storyboard?.length?<details className="script-storyboard"><summary>分镜与画面计划（{content.storyboard.length} 段）</summary><p>这里展示制作计划，实际成片状态以视频节点为准。</p><div className="script-storyboard-list">{content.storyboard.map((shot,index)=><section className="script-shot" key={index}><b>{shot.start}-{shot.end} 秒</b><div><p className="script-shot-narration">{shot.narration}</p><p>画面：{shot.visual}</p><p>声音：{shot.sound}</p><small>素材 {shot.asset_id} · {shot.reason}</small></div></section>)}</div></details>:null}
  {pictures.length>0&&<details className="script-source-pictures"><summary>原文配图（{pictures.length} 张）</summary><p>展示来源图片供审阅；图片在线加载失败会明确提示。版本证据以保存的 SHA256 为准，外部原图可能更新，发布权利尚未确认。</p><div className="source-picture-grid">{pictures.map(e=><SourcePicture key={e.sha256} url={e.url} title={e.title}/>)}</div></details>}
  {support?.schema==='content-driven-support-summary-v1'&&<details className="script-evidence"><summary>内容支撑研究 · {support.downloaded_video_count} 条视频候选 · {support.document_count} 份支撑文字</summary><p>已根据原始内容主动检索 {support.search_count} 次，读取支撑文字并保存候选原片。实际使用片段和成片效果在制作后审核。</p>{support.sources.map((s,index)=><p key={index}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> · {s.relation}</p>)}</details>}
  <details className="script-evidence"><summary>来源、事实依据与素材限制</summary>{content.evidence.map(e=><section key={e.sha256}><a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a><ul>{e.facts.map((fact,index)=><li key={index}>{fact}</li>)}</ul><p>{e.limits.join('；')}</p><small>SHA256 {e.sha256}</small></section>)}<p>{content.limits}</p><small>稿件 SHA256 {draft.content_hash} · 模式版本 {job.mode_epoch}</small></details>
 </section>;
}
