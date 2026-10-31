import { useCallback, useEffect, useRef, useState } from 'react';
import { getContentAdmin, refreshContentSources, type ContentAdmin } from '@workspace/api-client-react';
import AdminResults from './admin-results';
import SyncKeyPanel from './admin-sync-key';
import { Skeletons, StateBox, errorStatus, errorText, formatTime, isAbort } from './shared';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function AdminPage() {
  const [data, setData] = useState<ContentAdmin | null>(null);
  const [error, setError] = useState<{ text: string; status?: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
  const [starting, setStarting] = useState(false);
  const seq = useRef(0);

  const load = useCallback((signal?: AbortSignal) => {
    const mine = ++seq.current;
    return getContentAdmin({ signal, cache: 'no-store' })
      .then(r => { if (mine === seq.current) { setData(r); setError(null); } })
      .catch(e => { if (mine === seq.current && !isAbort(e)) setError({ text: errorText(e), status: errorStatus(e) }); });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 10000);
    return () => { controller.abort(); clearInterval(id); seq.current++; };
  }, [load]);

  async function startRefresh() {
    setStarting(true); setNotice(null);
    try { const r = await refreshContentSources(); setNotice({ text: r.message || '已开始后台刷新。' }); }
    catch (e) { setNotice({ text: errorText(e), bad: true }); }
    finally { setStarting(false); load(); }
  }

  if (error && !data) {
    if (error.status === 401) return <StateBox testId="status-admin-401" title="登录状态已失效" text="请重新登录站主账号。" action={<a className="site-btn primary" href={`${basePath}/sign-in`}>登录</a>} />;
    if (error.status === 403) return <StateBox testId="status-admin-403" title="此账号没有站主权限" text={error.text} />;
    return <StateBox testId="status-admin-error" title="维护数据读取失败" text={error.text} action={<button className="site-btn primary" onClick={() => load()} data-testid="button-retry-admin">重试</button>} />;
  }
  if (!data) return <Skeletons n={4} />;

  return <>
    <p className="site-kicker">仅站主可见</p>
    <h1 className="site-h1">站点维护</h1>
    <p className="site-lede">同步公开来源、整理外部成果。这里没有制作或平台发布功能。</p>
    <div className="site-meta">
      <span data-testid="text-topic-count">选题 {data.topic_count} 条</span>
      <span>成果 {data.results.length} 条（公开 {data.results.filter(r => r.visible).length}）</span>
      {data.legacy_job_count > 0 && <span>旧制作记录 {data.legacy_job_count} 条（已停用，仅保留）</span>}
    </div>
    {error && <p className="site-alert bad" role="alert">最近一次读取失败：{error.text}（显示的是上一次成功读取的数据）</p>}

    <section className="site-panel" aria-labelledby="sources-h">
      <h2 id="sources-h">来源同步</h2>
      <p>API 进程运行期间每 {data.automatic_refresh_minutes} 分钟自动同步一次；本页每 10 秒刷新状态。</p>
      <div className="site-actions" style={{ marginBottom: '.8rem', alignItems: 'center' }}>
        <button className="site-btn primary" disabled={starting || data.refresh_running} onClick={startRefresh} data-testid="button-refresh-sources">
          {data.refresh_running ? '正在后台刷新' : starting ? '正在请求' : '立即刷新来源'}</button>
        <span className={`site-pill${data.refresh_running ? ' ok' : ''}`} data-testid="status-refresh">{data.refresh_running ? '刷新进行中' : '空闲'}</span>
      </div>
      {notice && <p className={`site-alert${notice.bad ? ' bad' : ''}`} role="status">{notice.text}</p>}
      {data.sources.length === 0 ? <p className="site-src">尚未配置来源。</p> :
        <div style={{ overflowX: 'auto' }}><table className="site-table">
          <thead><tr><th>来源</th><th>状态</th><th>最近成功</th><th>最近尝试</th><th>说明</th></tr></thead>
          <tbody>{data.sources.map(s => {
            const bad = /error|fail/i.test(s.state);
            return <tr key={s.id} data-testid={`row-source-${s.id}`}>
              <td>{s.name}</td><td><span className={`site-pill${bad ? ' bad' : s.state === 'ok' ? ' ok' : ''}`}>{s.state}</span></td>
              <td>{formatTime(s.last_success)}</td><td>{formatTime(s.last_attempt)}</td>
              <td style={{ color: bad ? '#a3202b' : undefined }}>{s.message || '—'}</td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>

    <AdminResults results={data.results} reload={() => load()} />
    <SyncKeyPanel active={data.sync_key_active} reload={() => load()} />
  </>;
}
