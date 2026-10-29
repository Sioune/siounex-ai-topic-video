import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ProductionJob } from '@/lib/production-contract';

type Device = {
  device_id: string;
  device_name: string;
  online: boolean;
  last_seen_at: number;
};

type Pairing = {
  pairing_code: string;
  origin: string;
  expires_at: number;
};

type DeviceStatus = {
  device: Device | null;
  approved: boolean;
};

function sourceUrl(snapshot: string) {
  try {
    const value = JSON.parse(snapshot);
    return typeof value?.url === 'string' ? value.url : typeof value?.source?.url === 'string' ? value.source.url : '';
  } catch { return ''; }
}

export default function CodexExecutorBridge({ job }: { job: ProductionJob }) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const url = useMemo(() => sourceUrl(job.source_snapshot), [job.source_snapshot]);

  async function post(path: string, body: unknown) {
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

  async function refreshStatus(signal?: AbortSignal) {
    const response = await fetch(`/api/codex-executor/devices?job_id=${encodeURIComponent(job.id)}`, {
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error || `读取执行器状态失败 (${response.status})`);
    setStatus(result as DeviceStatus);
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      try { await refreshStatus(controller.signal); }
      catch (error) {
        if (active && !controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : '读取本机执行器状态失败。');
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [job.id]);

  async function issuePairing() {
    setBusy(true);
    setMessage('');
    try {
      setPairing(await post('/api/codex-executor/pairing', {}) as Pairing);
      setMessage('一次性配对码已生成。请在 10 分钟内于本机运行安装命令。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法生成配对码。'); }
    finally { setBusy(false); }
  }

  async function authorizeTask() {
    setBusy(true);
    setMessage('');
    try {
      await post('/api/codex-executor/jobs/approve', { job_id: job.id });
      await refreshStatus();
      setMessage('已授权这条任务。本机执行器在线时会领取；其他任务不会自动执行。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法授权此任务。'); }
    finally { setBusy(false); }
  }

  async function revokeTask() {
    setBusy(true);
    try {
      await post('/api/codex-executor/jobs/revoke', { job_id: job.id });
      await refreshStatus();
      setMessage('这条任务的本机执行授权已撤销。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '撤销任务授权失败。'); }
    finally { setBusy(false); }
  }

  async function revokeDevice() {
    if (!status?.device) return;
    setBusy(true);
    try {
      await post('/api/codex-executor/devices/revoke', { device_id: status.device.device_id });
      setPairing(null);
      await refreshStatus();
      setMessage('本机执行器已撤销，之后不会再领取任务。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '撤销本机执行器失败。'); }
    finally { setBusy(false); }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setMessage(`${label}已复制。`); }
    catch { setMessage('浏览器未允许复制，请手动选择文本复制。'); }
  }

  if (job.is_test !== 0 || !['waiting_executor', 'running'].includes(job.status)) return null;
  const device = status?.device;
  const installCommand = pairing
    ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\artifacts\\api-server\\scripts\\install-codex-executor.ps1 -Origin '${pairing.origin}'`
    : '';

  return (
    <section className="milestone-card space-y-3" aria-label="本机 Codex 后台执行器">
      <h3>本机 Codex 后台执行器</h3>
      <p>执行器在 Windows 登录后后台启动，只会领取你逐条批准的正式任务。它不会自动制作未批准任务，也不会生成视频或发布内容。</p>
      <p className="text-sm text-muted-foreground">
        本机需要安装并登录现有 Codex CLI、Node.js 22.15+，且保持开机联网。首次配对需在本机运行一次安装命令；之后后台执行器会轮询此制作台。
      </p>
      {device ? (
        <div className="rounded-md border p-3 text-sm">
          <p>已配对设备：<strong>{device.device_name}</strong></p>
          <p>{device.online ? '在线' : `离线；上次连接 ${new Date(device.last_seen_at).toLocaleString()}`}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void revokeDevice()}>撤销本机执行器</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button disabled={busy} onClick={() => void issuePairing()}>
            {busy ? '处理中…' : '配对本机并设置登录启动'}
          </Button>
          {pairing && (
            <div className="space-y-2 rounded-md border p-3">
              <p role="status">配对码 10 分钟后失效，只能使用一次。安装后凭据会由 Windows 当前用户加密保存。</p>
              <label className="block text-sm">一次性配对码
                <textarea className="mt-1 block w-full rounded-md border bg-background p-3 font-mono text-xs" rows={2} readOnly value={pairing.pairing_code} />
              </label>
              <Button variant="outline" onClick={() => void copy(pairing.pairing_code, '配对码')}>复制配对码</Button>
              <label className="block text-sm">在本机仓库根目录运行
                <textarea className="mt-1 block w-full rounded-md border bg-background p-3 font-mono text-xs" rows={2} readOnly value={installCommand} />
              </label>
              <Button variant="outline" onClick={() => void copy(installCommand, '安装命令')}>复制安装命令</Button>
              <p className="text-xs text-muted-foreground">安装脚本会提示输入配对码，并在当前 Windows 账号下创建登录启动任务；不会提升为管理员权限。</p>
            </div>
          )}
        </div>
      )}
      {device && job.status === 'waiting_executor' && (
        <div className="flex flex-wrap items-center gap-2">
          {status?.approved ? (
            <>
              <p className="text-sm">此任务已单独授权，{device.online ? '等待本机领取' : '等待本机执行器上线'}。</p>
              <Button variant="outline" disabled={busy} onClick={() => void revokeTask()}>撤销此任务授权</Button>
            </>
          ) : (
            <Button disabled={busy || !url} onClick={() => void authorizeTask()}>
              {busy ? '处理中…' : '仅授权本机执行此任务'}
            </Button>
          )}
        </div>
      )}
      {device && job.status === 'running' && status?.approved && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">本机正在执行此任务。</p>
          <Button variant="outline" disabled={busy} onClick={() => void revokeTask()}>撤销此任务授权</Button>
        </div>
      )}
      {!url && <p className="text-sm text-destructive">任务缺少可用的来源链接，不能授权本机执行。</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}
