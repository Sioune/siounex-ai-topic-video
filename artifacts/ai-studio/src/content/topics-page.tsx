import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { listPublicTopics, type TopicPage } from '@workspace/api-client-react';
import { ExternalLink, Skeletons, StateBox, errorText, formatTime, httpsUrl, isAbort, useTitle } from './shared';

export default function TopicsPage() {
  useTitle('');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<TopicPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { const v = input.trim().slice(0, 200); setQ(prev => { if (prev !== v) setPage(1); return v; }); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    listPublicTopics({ q: q || undefined, category: category || undefined, page }, { signal: controller.signal })
      .then(r => { if (!controller.signal.aborted) { setData(r); setLoading(false); } })
      .catch(e => { if (!controller.signal.aborted && !isAbort(e)) { setError(errorText(e)); setLoading(false); } });
    return () => controller.abort();
  }, [q, category, page, attempt]);

  const pages = data ? Math.max(1, Math.ceil(data.total / Math.max(1, data.page_size))) : 1;
  const filtered = Boolean(q || category);

  return <>
    <p className="site-kicker">公开选题</p>
    <h1 className="site-h1">值得读的 AI 新闻</h1>
    <p className="site-lede">从公开来源自动整理的 AI 资讯，点击即可跳转原文。来源与更新时间如实标注。</p>
    <div className="site-meta" data-testid="text-topic-freshness">
      <span><span className="site-dot" />最近同步：{data ? formatTime(data.last_synced_at) : '读取中'}</span>
      {data && <span>共 {data.total} 条</span>}
    </div>

    <div className="site-filters">
      <label className="site-search"><Search size={16} aria-hidden /><span className="sr-only">搜索选题</span>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="搜索标题或摘要" maxLength={200} data-testid="input-topic-search" />
      </label>
    </div>
    {data && data.categories.length > 0 && <div className="site-chips" role="group" aria-label="分类" style={{ marginBottom: '1.2rem' }}>
      <button type="button" className="site-chip" aria-pressed={!category} onClick={() => { setCategory(''); setPage(1); }} data-testid="button-category-all">全部</button>
      {data.categories.map(c => <button key={c} type="button" className="site-chip" aria-pressed={category === c} onClick={() => { setCategory(c); setPage(1); }} data-testid={`button-category-${c}`}>{c}</button>)}
    </div>}

    {error ? <StateBox testId="status-topics-error" title="选题暂时读取失败" text={error} action={<button className="site-btn primary" onClick={() => setAttempt(a => a + 1)} data-testid="button-retry-topics">重试</button>} />
      : loading && !data ? <Skeletons />
      : data && data.topics.length === 0 ? <StateBox testId="status-topics-empty" title={filtered ? '没有匹配的选题' : '选题库还是空的'} text={filtered ? '换个关键词或分类试试。' : '来源同步完成后，新的资讯会出现在这里。'}
        action={filtered ? <button className="site-btn" onClick={() => { setInput(''); setQ(''); setCategory(''); setPage(1); }} data-testid="button-clear-filters">清除筛选</button> : undefined} />
      : data && <>
        <ol className="site-list" style={{ opacity: loading ? .55 : 1, transition: 'opacity .2s' }} aria-busy={loading}>
          {data.topics.map(t => <li key={t.id} className="site-row" data-testid={`row-topic-${t.id}`}>
            <div className="site-row-date">{formatTime(t.published_at, false)}</div>
            <div>
              <h2>{httpsUrl(t.url) ? <ExternalLink className="" href={t.url}>{t.title}</ExternalLink> : t.title}</h2>
              {t.summary && <p>{t.summary}</p>}
              <div className="site-src">{t.category && <span className="site-tag">{t.category}</span>}来源：{t.source || '未标注'}</div>
            </div>
          </li>)}
        </ol>
        <nav className="site-pager" aria-label="分页">
          <button className="site-btn" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)} data-testid="button-page-prev">上一页</button>
          <span data-testid="text-page">第 {data.page} / {pages} 页</span>
          <button className="site-btn" disabled={page >= pages || loading} onClick={() => setPage(p => p + 1)} data-testid="button-page-next">下一页</button>
        </nav>
      </>}
  </>;
}
