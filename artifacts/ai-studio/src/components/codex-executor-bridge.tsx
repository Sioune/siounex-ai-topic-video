import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ProductionJob } from '@/lib/production-contract';

type Grant = { grant_id: string; token: string; origin: string; expires_at: number };

function sourceUrl(snapshot: string) {
  try {
    const value = JSON.parse(snapshot);
    return typeof value?.url === 'string' ? value.url : typeof value?.source?.url === 'string' ? value.source.url : '';
  } catch { return ''; }
}

export default function CodexExecutorBridge({ job }: { job: ProductionJob }) {
  const [grant, setGrant] = useState<Grant | null>(null);
  const [sourceFile, setSourceFile] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const url = useMemo(() => sourceUrl(job.source_snapshot), [job.source_snapshot]);

  async function request(path: string, body: unknown) {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error || `请求失败 (${response.status})`);
    return result;
  }

  async function issue() {
    setBusy(true);
    setMessage('');
    try {
      const result = await request('/api/codex-executor/grant', { job_id: job.id });
      setGrant(result);
      setSourceFile('');
      setMessage('一次性授权已生成。请立即复制保存；关闭或刷新此页后无法再次查看。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法生成授权。'); }
    finally { setBusy(false); }
  }

  async function revoke() {
    if (!grant) return;
    setBusy(true);
    try {
      await request('/api/codex-executor/grant/revoke', { grant_id: grant.grant_id });
      setGrant(null);
      setMessage('这次本机执行授权已撤销。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '撤销授权失败。'); }
    finally { setBusy(false); }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setMessage(`${label}已复制。`); }
    catch { setMessage('浏览器未允许复制，请手动选择文本复制。'); }
  }

  if (job.is_test !== 0 || job.status !== 'waiting_executor' && !grant) return null;

  const runner = `$env:REPLIT_CODEX_BRIDGE_ORIGIN = '${grant?.origin || '在这里填入授权页面显示的网址'}'\nnode --import .\\artifacts\\api-server\\scripts\\codex-executor-loader.mjs .\\.migration-backup\\scripts\\production-codex-executor.mjs`;
  const payload = grant ? JSON.stringify({
    token: grant.token,
    job_id: job.id,
    source_file: sourceFile || '请填写本机已核对的来源文件绝对路径',
    source_url: url,
    submission_id: `replit_${job.id}_r${job.revision}`,
  }, null, 2) : '';

  return (
    <section className="milestone-card" aria-label="本机 Codex 单任务桥接">
      <h3>本机 Codex 单任务执行</h3>
      <p>仅适用于当前正式任务。授权限时一小时、绑定此任务，运行一次既有的本机 Codex 文稿流程；不会自动启动电脑、生成视频或发布内容。</p>
      <p className="text-sm text-muted-foreground">先在本机同步此仓库并安装依赖，使用 Node.js 22.15+ 和原来已经登录的 Codex CLI。模型仍沿用本机 Codex 的账号与额度。</p>
      {!grant ? (
        <Button disabled={busy} onClick={() => void issue()}>{busy ? '正在准备…' : '为此任务生成临时授权'}</Button>
      ) : (
        <div className="space-y-3">
          <p role="status">授权将于 {new Date(grant.expires_at).toLocaleTimeString()} 过期，刷新页面前请先在本地启动。</p>
          <label className="block text-sm">本地来源文件完整路径
            <input className="mt-1 block w-full rounded-md border bg-background px-3 py-2" value={sourceFile} onChange={event => setSourceFile(event.target.value)} placeholder="例如 C:\Work\source.txt" />
          </label>
          <label className="block text-sm">一次性任务授权与输入
            <textarea className="mt-1 block w-full rounded-md border bg-background p-3 font-mono text-xs" rows={10} readOnly value={payload} />
          </label>
          <Button variant="outline" onClick={() => void copy(payload, '隐藏输入 JSON')}>复制隐藏输入 JSON</Button>
          <label className="block text-sm">在 Windows PowerShell 的仓库根目录运行
            <textarea className="mt-1 block w-full rounded-md border bg-background p-3 font-mono text-xs" rows={3} readOnly value={runner} />
          </label>
          <Button variant="outline" onClick={() => void copy(runner, 'PowerShell 命令')}>复制运行命令</Button>
          <p className="text-sm text-muted-foreground">启动后，Codex 会要求输入上方 JSON；隐藏输入不会回显。只选择哈希与任务来源相符的本地文件。草稿照常回传站点等待你审核。</p>
          <Button variant="outline" disabled={busy} onClick={() => void revoke()}>{busy ? '处理中…' : '立即撤销授权'}</Button>
        </div>
      )}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}
