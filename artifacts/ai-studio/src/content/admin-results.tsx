import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { deleteContentResult, saveContentResult, setResultVisibility, type ContentResult, type ContentResultInputKind } from '@workspace/api-client-react';
import { KIND_LABEL, errorText, formatTime } from './shared';

type Draft = { external_id: string; revision: number; kind: ContentResultInputKind; title: string; summary: string; body: string; source_url: string; content_url: string; cover_url: string };
const blank = (): Draft => ({ external_id: '', revision: 1, kind: 'article', title: '', summary: '', body: '', source_url: '', content_url: '', cover_url: '' });

function Editor({ initial, editing, onDone, onCancel }: { initial: Draft; editing: boolean; onDone: (msg: string) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD(v => ({ ...v, [k]: e.target.value }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await saveContentResult({ ...d, revision: Number(d.revision), title: d.title.trim(), external_id: d.external_id.trim() });
      onDone(editing ? '已保存新版本。修改后的成果为私有，审阅后请重新设为公开。' : '已保存为私有成果，审阅后可设为公开。');
    } catch (e2) { setErr(errorText(e2)); } finally { setBusy(false); }
  }
  return <form className="site-form" onSubmit={submit} style={{ marginTop: '1rem' }} data-testid="form-result">
    <div style={{ display: 'grid', gap: '.8rem', gridTemplateColumns: 'repeat(auto-fit,minmax(12rem,1fr))' }}>
      <label>外部编号<input required maxLength={120} value={d.external_id} onChange={set('external_id')} disabled={editing} data-testid="input-external-id" /></label>
      <label>版本<input type="number" min={1} value={d.revision} readOnly={editing} onChange={set('revision')} data-testid="input-revision" /></label>
      <label>类型<select value={d.kind} onChange={set('kind')} data-testid="select-kind">{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    </div>
    <label>标题<input required maxLength={200} value={d.title} onChange={set('title')} data-testid="input-title" /></label>
    <label>摘要<textarea rows={2} maxLength={2000} value={d.summary} onChange={set('summary')} data-testid="input-summary" /></label>
    <label>正文（纯文本）<textarea rows={8} maxLength={100000} value={d.body} onChange={set('body')} data-testid="input-body" /></label>
    <label>成果链接（https）<input type="url" pattern="https://.*" maxLength={2000} value={d.content_url} onChange={set('content_url')} data-testid="input-content-url" /></label>
    <label>来源链接（https）<input type="url" pattern="https://.*" maxLength={2000} value={d.source_url} onChange={set('source_url')} data-testid="input-source-url" /></label>
    <label>封面图（https）<input type="url" pattern="https://.*" maxLength={2000} value={d.cover_url} onChange={set('cover_url')} data-testid="input-cover-url" /></label>
    {err && <p className="site-alert bad" role="alert">{err}</p>}
    <div className="site-actions">
      <button className="site-btn primary" disabled={busy} data-testid="button-save-result">{busy ? '正在保存' : editing ? `保存为第 ${d.revision} 版` : '保存为私有'}</button>
      <button type="button" className="site-btn" onClick={onCancel} data-testid="button-cancel-edit">取消</button>
    </div>
  </form>;
}

export default function AdminResults({ results, reload }: { results: ContentResult[]; reload: () => void }) {
  const [editor, setEditor] = useState<{ draft: Draft; editing: boolean; key: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(id); setMsg(null);
    try { await fn(); setMsg({ text: ok }); } catch (e) { setMsg({ text: errorText(e), bad: true }); }
    finally { setBusy(null); setConfirmDelete(null); reload(); }
  }
  const edit = (r: ContentResult) => setEditor({ key: r.id + r.revision, editing: true, draft: {
    external_id: r.external_id, revision: r.revision + 1, kind: r.kind, title: r.title, summary: r.summary || '', body: r.body || '',
    source_url: r.source_url || '', content_url: r.content_url || '', cover_url: r.cover_url || '' } });

  return <section className="site-panel" aria-labelledby="results-h">
    <h2 id="results-h">成果目录</h2>
    <p>新建或导入的成果默认私有。确认内容无误后再设为公开；公开只代表在本站成果页展示。</p>
    {!editor && <button className="site-btn primary" onClick={() => setEditor({ key: 'new' + Date.now(), editing: false, draft: blank() })} data-testid="button-new-result">手动添加成果</button>}
    {editor && <Editor key={editor.key} initial={editor.draft} editing={editor.editing} onCancel={() => setEditor(null)} onDone={m => { setEditor(null); setMsg({ text: m }); reload(); }} />}
    {msg && <p className={`site-alert${msg.bad ? ' bad' : ''}`} role="status">{msg.text}</p>}
    {results.length === 0 ? <p className="site-src" data-testid="status-admin-results-empty">目录为空。外部导入或手动添加的成果会出现在这里。</p> :
      <div style={{ overflowX: 'auto', marginTop: '1rem' }}><table className="site-table">
        <thead><tr><th>成果</th><th>状态</th><th>版本</th><th>更新</th><th>操作</th></tr></thead>
        <tbody>{results.map(r => <tr key={r.id} data-testid={`row-admin-result-${r.id}`}>
          <td><strong>{r.title}</strong><div className="site-src">{KIND_LABEL[r.kind] || r.kind} · {r.external_id}</div></td>
          <td><span className={`site-pill${r.visible ? ' ok' : ''}`}>{r.visible ? '公开' : '私有'}</span></td>
          <td>{r.revision}</td><td>{formatTime(r.updated_at)}</td>
          <td><div className="site-actions">
            <button className="site-btn" disabled={busy === r.id} onClick={() => run(r.id, () => setResultVisibility(r.id, { visible: !r.visible, revision: r.revision }), r.visible ? '已设为私有。' : '已设为公开。')} data-testid={`button-visibility-${r.id}`}>{r.visible ? '设为私有' : '设为公开'}</button>
            <button className="site-btn" disabled={busy === r.id} onClick={() => edit(r)} data-testid={`button-edit-${r.id}`}>编辑</button>
            {r.visible && <Link href={`/results/${encodeURIComponent(r.id)}`} className="site-btn" data-testid={`link-view-${r.id}`}>查看</Link>}
            {confirmDelete === r.id
              ? <><button className="site-btn danger" disabled={busy === r.id} onClick={() => run(r.id, () => deleteContentResult(r.id), '已从目录移除。')} data-testid={`button-confirm-delete-${r.id}`}>确认移除</button>
                <button className="site-btn" onClick={() => setConfirmDelete(null)} data-testid={`button-cancel-delete-${r.id}`}>取消</button></>
              : <button className="site-btn danger" disabled={busy === r.id} onClick={() => setConfirmDelete(r.id)} data-testid={`button-delete-${r.id}`}>移除</button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}
