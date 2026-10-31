import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Search } from 'lucide-react';
import { listPublicResults, type ContentResult, type ListPublicResultsKind } from '@workspace/api-client-react';
import { KIND_LABEL, Skeletons, StateBox, errorText, formatTime, httpsUrl, isAbort, useTitle } from './shared';

const KINDS: Array<'' | ListPublicResultsKind> = ['', 'article', 'video', 'link'];

export default function ResultsPage() {
  useTitle('成果');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | ListPublicResultsKind>('');
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState<ContentResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { const t = setTimeout(() => setQ(input.trim().slice(0, 200)), 300); return () => clearTimeout(t); }, [input]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    listPublicResults({ q: q || undefined, kind: kind || undefined }, { signal: controller.signal, cache: 'no-store' })
      .then(r => { if (!controller.signal.aborted) { setItems(r); setLoading(false); } })
      .catch(e => { if (!controller.signal.aborted && !isAbort(e)) { setError(errorText(e)); setLoading(false); } });
    return () => controller.abort();
  }, [q, kind, attempt]);

  // Quiet refresh while the tab is visible, so newly approved results appear.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setAttempt(a => a + 1); }, 60000);
    return () => clearInterval(id);
  }, []);

  const filtered = Boolean(q || kind);
  return <>
    <p className="site-kicker">外部成果</p>
    <h1 className="site-h1">已经做出来的文章与视频</h1>
    <p className="site-lede">这里收录在其他地方完成的文章、视频和链接，经站主审阅后公开。本站不负责制作或发布。</p>
    <div className="site-filters">
      <label className="site-search"><Search size={16} aria-hidden /><span className="sr-only">搜索成果</span>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="搜索成果" maxLength={200} data-testid="input-result-search" />
      </label>
      <div className="site-chips" role="group" aria-label="类型">
        {KINDS.map(k => <button key={k || 'all'} type="button" className="site-chip" aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`button-kind-${k || 'all'}`}>{k ? KIND_LABEL[k] : '全部'}</button>)}
      </div>
    </div>

    {error ? <StateBox testId="status-results-error" title="成果暂时读取失败" text={error} action={<button className="site-btn primary" onClick={() => setAttempt(a => a + 1)} data-testid="button-retry-results">重试</button>} />
      : loading && !items ? <Skeletons n={3} />
      : items && items.length === 0 ? <StateBox testId="status-results-empty" title={filtered ? '没有匹配的成果' : '还没有公开的成果'}
        text={filtered ? '换个关键词或类型试试。' : '外部完成的作品经站主审阅、设为公开后，会出现在这里。在此之前，可以先去看看选题。'}
        action={filtered ? <button className="site-btn" onClick={() => { setInput(''); setQ(''); setKind(''); }} data-testid="button-clear-result-filters">清除筛选</button> : <Link href="/" className="site-btn primary" data-testid="link-to-topics">浏览选题</Link>} />
      : items && <div className="site-cards" style={{ opacity: loading ? .6 : 1 }}>
        {items.map(r => {
          const cover = httpsUrl(r.cover_url);
          return <Link key={r.id} href={`/results/${encodeURIComponent(r.id)}`} className="site-card" data-testid={`card-result-${r.id}`}>
            {cover && <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <div className="site-card-body">
              <span className="site-tag">{KIND_LABEL[r.kind] || r.kind}</span><span className="site-src">更新于 {formatTime(r.updated_at, false)}</span>
              <h2>{r.title}</h2>
              {r.summary && <p>{r.summary}</p>}
            </div>
          </Link>;
        })}
      </div>}
  </>;
}
