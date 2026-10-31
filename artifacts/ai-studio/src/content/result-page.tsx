import { useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { getPublicResult, type ContentResult } from '@workspace/api-client-react';
import { ExternalLink, KIND_LABEL, Skeletons, StateBox, errorStatus, errorText, formatTime, httpsUrl, isAbort, useTitle } from './shared';

export default function ResultPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ id: string; result?: ContentResult; error?: string; missing?: boolean } | null>(null);
  useTitle(state?.result?.title || '成果');

  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    getPublicResult(id, { signal: controller.signal, cache: 'no-store' })
      .then(result => { if (!controller.signal.aborted) setState({ id, result }); })
      .catch(e => { if (!controller.signal.aborted && !isAbort(e)) setState({ id, error: errorText(e), missing: errorStatus(e) === 404 }); });
    return () => controller.abort();
  }, [id, attempt]);

  const back = <Link href="/results" className="site-btn" data-testid="link-back-results"><ArrowLeft size={15} />返回成果</Link>;
  if (!state || state.id !== id) return <div className="site-article"><Skeletons n={4} /></div>;
  if (state.missing) return <StateBox testId="status-result-missing" title="找不到这篇成果" text="它可能尚未公开、已被撤下，或链接有误。" action={back} />;
  if (state.error || !state.result) return <StateBox testId="status-result-error" title="成果读取失败" text={state.error || '请稍后重试。'}
    action={<div className="site-actions" style={{ justifyContent: 'center' }}><button className="site-btn primary" onClick={() => setAttempt(a => a + 1)} data-testid="button-retry-result">重试</button>{back}</div>} />;

  const r = state.result;
  const cover = httpsUrl(r.cover_url);
  return <article className="site-article" data-testid={`article-result-${r.id}`}>
    {back}
    <p className="site-kicker" style={{ marginTop: '2rem' }}>{KIND_LABEL[r.kind] || r.kind} · 外部成果</p>
    <h1 className="site-h1">{r.title}</h1>
    {r.summary && <p className="site-lede">{r.summary}</p>}
    <div className="site-meta"><span>更新于 {formatTime(r.updated_at)}</span><span>第 {r.revision} 版</span></div>
    {cover && <img className="site-cover" src={cover} alt="" referrerPolicy="no-referrer" />}
    <div className="site-links">
      <ExternalLink className="site-btn primary" href={r.content_url}>{r.kind === 'video' ? '观看视频' : '打开成果'}</ExternalLink>
      <ExternalLink href={r.source_url}>查看来源</ExternalLink>
    </div>
    {r.body ? <div className="site-body" data-testid="text-result-body">{r.body}</div>
      : <p className="site-src" style={{ marginTop: '2rem' }}>这条成果没有附带正文，请通过上方链接阅读原作。</p>}
  </article>;
}
