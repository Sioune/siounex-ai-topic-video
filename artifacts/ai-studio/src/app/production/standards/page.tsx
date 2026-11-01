import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {db} from '@/lib/store';
import {readOwnerFeedback} from '@/lib/owner-feedback-records.mts';

export const dynamic='force-dynamic';
function when(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(d)+'（北京时间）';}
export default async function OwnerStandardsPage(){
 const user=await requireChatGPTUser('/production/standards');
 let records:Awaited<ReturnType<typeof readOwnerFeedback>>=[];let failed=false;
 try{records=await readOwnerFeedback(db(),user.userId)}catch{failed=true}
 return <main style={{maxWidth:960,margin:'0 auto',padding:'2rem 1.25rem 4rem',lineHeight:1.7}}>
  <p><a href="/production">← 返回制作工作台</a></p>
  <h1>新的验收标准记录</h1>
  <p><strong>仅记录，未启用。</strong>这里展示你在稿件和视频节点保存的原话；不会自动生成审核门槛或替你审批。</p>
  <p>未来可与原有标准逐条对照；哪些旧规则保留或补入，由你决定。</p>
  {failed?<p role="alert">本人反馈暂时读取失败，请刷新后重试。</p>:records.length===0?<p>目前没有可读取的本人稿件或视频反馈记录。</p>:<ol style={{display:'grid',gap:'1rem',padding:0,listStyle:'none'}}>{records.map(r=><li key={JSON.stringify([r.job_id,r.kind,r.revision,r.source_ids])} style={{border:'1px solid var(--border)',borderRadius:12,padding:'1rem 1.25rem'}}>
   <h2 style={{fontSize:'1.1rem',fontWeight:650}}><a href={'/production?job='+encodeURIComponent(r.job_id)}>{r.title}</a></h2>
   <p>{r.kind==='script'?'口播稿':r.kind==='preview'?'中间视频预览':'视频'} · 稿 v{r.revision}{r.artifact_version!==null?' · 视频版本 v'+r.artifact_version:''}</p>
   <blockquote style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',margin:'.75rem 0'}}>{r.note}</blockquote>
   <small>来源：站内本人{r.kind==='script'?'稿件反馈':r.kind==='preview'?'预览意见':'视频节点意见'}{r.preview_id?' · 预览 '+r.preview_id:''}<br/>{r.sources.map(s=><span key={s.id}>{when(s.created_at)} · {s.id}<br/></span>)}</small>
  </li>)}</ol>}
 </main>;
}
