import type {PublicationReport} from '@/lib/production-contract';

export default function PublicationReports({reports}:{reports:PublicationReport[]}){
 if(!reports.length)return null;
 return <details className="publication-reports" aria-label="既有发布登记"><summary>既有发布记录（{reports.length}）</summary><p>数据中心保留的原始发布登记。</p>{reports.map(r=><div className="milestone-card" key={r.id}><h4>{r.title}</h4>{r.published_at&&<p>记录中的发布时间：<time dateTime={r.published_at}>{new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'}).format(new Date(r.published_at))}</time>（上海）</p>}<p>{r.publication_source}</p><small>记录 ID：{r.id}。发布时间或用户自报不代表网站独立核实平台作品、最终文件版本或质量批准。</small></div>)}<a href="/data" className="text-link">查看数据中心原记录 →</a></details>;
}
