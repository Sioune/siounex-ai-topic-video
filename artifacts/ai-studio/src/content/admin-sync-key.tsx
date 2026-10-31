import { useEffect, useState } from 'react';
import { issueResultSyncKey, revokeResultSyncKey, type ResultSyncKey } from '@workspace/api-client-react';
import { errorText } from './shared';

const EXAMPLE = `curl -X POST "$SITE/api/sync/results" \\
  -H "Authorization: Bearer <导入密钥>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_id": "my-article-001",
    "revision": 1,
    "kind": "article",
    "title": "标题",
    "summary": "一句话摘要",
    "body": "正文纯文本",
    "source_url": "https://example.com/source",
    "content_url": "https://example.com/article",
    "cover_url": ""
  }'`;

export default function SyncKeyPanel({ active, reload }: { active: boolean; reload: () => void }) {
  // Token lives only in component memory; cleared on unmount (leaving admin).
  const [key, setKey] = useState<ResultSyncKey | null>(null);
  const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  useEffect(() => () => setKey(null), []);

  async function issue() {
    setBusy(true); setMsg(null); setConfirm(null);
    try { setKey(await issueResultSyncKey()); setMsg({ text: '新密钥已生成，旧密钥（如有）已失效。有效期 30 天，只显示这一次。' }); }
    catch (e) { setMsg({ text: errorText(e), bad: true }); }
    finally { setBusy(false); reload(); }
  }
  async function revoke() {
    setBusy(true); setMsg(null); setConfirm(null);
    try { await revokeResultSyncKey(); setKey(null); setMsg({ text: '导入密钥已撤销。' }); }
    catch (e) { setMsg({ text: errorText(e), bad: true }); }
    finally { setBusy(false); reload(); }
  }

  return <section className="site-panel" aria-labelledby="key-h">
    <h2 id="key-h">外部成果导入</h2>
    <p>外部工具可以用导入密钥推送成果。导入的成果一律为私有，需要你在上方审阅后手动设为公开。这不是平台发布。密钥有效期 30 天，轮换会让旧密钥立即失效。</p>
    <div className="site-actions" style={{ alignItems: 'center', marginBottom: '.6rem' }}>
      <span className={`site-pill${active ? ' ok' : ''}`} data-testid="status-sync-key">{active ? '密钥有效' : '未启用'}</span>
      <button className="site-btn primary" disabled={busy} onClick={() => active ? setConfirm('rotate') : issue()} data-testid="button-issue-key">{active ? '轮换密钥' : '生成密钥'}</button>
      {active && <button className="site-btn danger" disabled={busy} onClick={() => setConfirm('revoke')} data-testid="button-revoke-key">撤销密钥</button>}
    </div>
    {confirm && <div className="site-alert bad" role="alertdialog" aria-label="确认操作">
      {confirm === 'rotate' ? '轮换后旧密钥立即失效，正在使用它的外部工具需要更新。确定继续？' : '撤销后外部工具将无法再导入成果。确定继续？'}
      <div className="site-actions" style={{ marginTop: '.5rem' }}>
        <button className="site-btn danger" onClick={confirm === 'rotate' ? issue : revoke} data-testid="button-confirm-key">确定</button>
        <button className="site-btn" onClick={() => setConfirm(null)} data-testid="button-cancel-key">取消</button>
      </div>
    </div>}
    {msg && <p className={`site-alert${msg.bad ? ' bad' : ''}`} role="status">{msg.text}</p>}
    {key && <div data-testid="panel-new-key">
      <p className="site-src">请手动选中复制并妥善保存，离开本页后不再显示：</p>
      <div className="site-code" style={{ userSelect: 'all' }}>{key.token}</div>
      <p className="site-src">接口：{key.endpoint}</p>
      <button className="site-btn" onClick={() => setKey(null)} data-testid="button-hide-key">我已保存，隐藏密钥</button>
    </div>}
    <details style={{ marginTop: '1rem' }}>
      <summary style={{ cursor: 'pointer', fontSize: '.9rem' }}>导入格式示例</summary>
      <div className="site-code">{EXAMPLE}</div>
      <p className="site-src">external_id 是外部系统中的稳定编号；revision 从 1 开始，每次内容修改加 1。同一版本重复提交相同内容不会重复导入；同一版本内容不同或版本过旧会返回 409。可选字段请传空字符串，链接仅接受 https。</p>
    </details>
  </section>;
}
