import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const APP_HOME = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ReplitCodexExecutor');
const CREDENTIAL_FILE = path.join(APP_HOME, 'device-credential.dpapi');
const JOB_HOME = path.join(APP_HOME, 'jobs');
const API_TIMEOUT_MS = 30_000;
// Match the mature executor's bounded source input, rather than downloading
// a file it will immediately reject.
const SOURCE_LIMIT = 500_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function requireWindows() {
  if (process.platform !== 'win32') throw new Error('此后台执行器当前仅支持 Windows。');
}

function validatedOrigin(value) {
  let origin;
  try { origin = new URL(value); } catch { throw new Error('请设置有效的 Replit HTTPS 地址。'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash ||
      !(origin.hostname.endsWith('.replit.dev') || origin.hostname.endsWith('.replit.app'))) {
    throw new Error('执行器只接受 Replit HTTPS 网站地址。');
  }
  return origin.origin;
}

function powershell(command, input) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 100_000,
  }).trim();
}

function protectWithDpapi(value) {
  const command = [
    '$plain=[Console]::In.ReadToEnd().TrimEnd([char]13,[char]10)',
    'if([string]::IsNullOrWhiteSpace($plain)){throw "Credential input is empty"}',
    '$secure=ConvertTo-SecureString -String $plain -AsPlainText -Force',
    'ConvertFrom-SecureString -SecureString $secure',
  ].join('; ');
  return powershell(command, value);
}

function unprotectWithDpapi(value) {
  const command = [
    '$cipher=[Console]::In.ReadToEnd().TrimEnd([char]13,[char]10)',
    'if([string]::IsNullOrWhiteSpace($cipher)){throw "Credential file is empty"}',
    '$secure=ConvertTo-SecureString -String $cipher',
    '$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)',
    'try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr))}',
    'finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}',
  ].join('; ');
  return powershell(command, value);
}

function saveCredential(origin, deviceId, token) {
  fs.mkdirSync(APP_HOME, { recursive: true });
  const protectedToken = protectWithDpapi(token);
  const content = JSON.stringify({ version: 1, origin, device_id: deviceId, protected_token: protectedToken }, null, 2);
  const temp = `${CREDENTIAL_FILE}.tmp`;
  fs.writeFileSync(temp, content, { mode: 0o600 });
  fs.renameSync(temp, CREDENTIAL_FILE);
}

function loadCredential() {
  const value = JSON.parse(fs.readFileSync(CREDENTIAL_FILE, 'utf8'));
  if (value?.version !== 1 || typeof value.origin !== 'string' ||
      typeof value.device_id !== 'string' || typeof value.protected_token !== 'string') {
    throw new Error('本机凭据文件格式无效。请从站点撤销设备后重新配对。');
  }
  const origin = validatedOrigin(value.origin);
  const token = unprotectWithDpapi(value.protected_token);
  if (!/^cxdev1\.[A-Za-z0-9_-]{20,32}\.[A-Za-z0-9_-]{40,48}$/.test(token)) {
    throw new Error('本机凭据无法解密或格式无效。请重新配对。');
  }
  return { origin, deviceId: value.device_id, token };
}

async function jsonRequest(url, { origin, token, body, timeout = API_TIMEOUT_MS }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : `请求失败 (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function pairDevice() {
  requireWindows();
  const origin = validatedOrigin(process.env.REPLIT_CODEX_BRIDGE_ORIGIN);
  const pairingCode = process.env.REPLIT_CODEX_PAIRING_CODE;
  if (typeof pairingCode !== 'string' || !/^cxpair1\.[A-Za-z0-9_-]{20,32}\.[A-Za-z0-9_-]{40,48}$/.test(pairingCode)) {
    throw new Error('没有收到有效的一次性配对码。请重新从站点生成。');
  }
  fs.mkdirSync(APP_HOME, { recursive: true });
  const result = await jsonRequest(`${origin}/api/codex-executor/agent/pair`, {
    origin,
    token: pairingCode,
    body: { device_name: os.hostname() },
  });
  if (typeof result.token !== 'string' || typeof result.device_id !== 'string') {
    throw new Error('配对服务没有返回有效的设备凭据。');
  }
  saveCredential(origin, result.device_id, result.token);
  console.log(`已安全配对设备 ${os.hostname()}。凭据仅保存在当前 Windows 用户的 DPAPI 加密文件中。`);
}

function validatePublicSourceUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('任务来源链接无效。'); }
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw new Error('为保护本机网络，只能读取公开 HTTPS 来源。');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addressType = isIP(host);
  if (addressType === 4 && (
    host.startsWith('10.') || host.startsWith('127.') ||
    host.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith('169.254.') || host.startsWith('100.64.')
  )) throw new Error('不允许读取本机或私有网络地址。');
  if (addressType === 6 && (
    host === '::1' || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host) || /^::ffff:(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(host)
  )) {
    throw new Error('不允许读取本机或私有网络地址。');
  }
  return url;
}

async function downloadSource(urlValue, destination) {
  const url = validatePublicSourceUrl(urlValue);
  const response = await fetch(url, {
    redirect: 'error',
    headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1', 'User-Agent': 'ReplitCodexExecutor/1.0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`来源下载失败 (${response.status})。`);
  const contentType = response.headers.get('content-type') || '';
  if (!/(?:text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
    throw new Error('来源不是可读取的网页或纯文本。');
  }
  const length = Number(response.headers.get('content-length') || 0);
  if (length > SOURCE_LIMIT) throw new Error('来源网页超过执行器的 500 KB 上限。');
  if (!response.body) throw new Error('来源网页没有可读取的内容。');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > SOURCE_LIMIT) {
        await reader.cancel();
        throw new Error('来源网页超过执行器的 500 KB 上限。');
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  if (!total) throw new Error('来源网页为空。');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temp = `${destination}.tmp`;
  fs.writeFileSync(temp, Buffer.concat(chunks));
  fs.renameSync(temp, destination);
  return createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
}

async function readTask({ origin, token }, jobId) {
  return jsonRequest(`${origin}/api/executor`, {
    origin, token, body: { action: 'read', id: jobId },
  });
}

async function approvedSet(credential) {
  const result = await jsonRequest(`${credential.origin}/api/codex-executor/agent/poll`, {
    ...credential, body: {},
  });
  return new Set(Array.isArray(result.approved_jobs)
    ? result.approved_jobs.filter(value => typeof value === 'string')
    : []);
}

async function terminateChild(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true, timeout: 5_000, stdio: 'ignore',
      });
    } catch { child.kill('SIGTERM'); }
  } else child.kill('SIGTERM');
}

async function runTask(credential, task) {
  const { job_id: jobId, revision } = task;
  if (!/^job_[A-Za-z0-9_-]{1,100}$/.test(jobId) || !Number.isSafeInteger(revision)) return;
  console.log(`已领取到站主批准的制作任务 ${jobId}，读取冻结来源。`);
  const read = await readTask(credential, jobId);
  const job = read.job;
  if (!job || job.id !== jobId || job.revision !== revision || job.is_test !== 0 ||
      !['waiting_executor', 'running'].includes(job.status)) {
    console.log(`任务 ${jobId} 已变化，跳过本次执行。`);
    return;
  }
  const source = JSON.parse(job.source_snapshot);
  const sourceUrl = typeof source.url === 'string' ? source.url : source?.source?.url;
  if (typeof sourceUrl !== 'string') throw new Error('任务没有公开的来源链接。');
  const folder = path.join(JOB_HOME, jobId, `revision-${revision}`);
  const sourceFile = path.join(folder, 'source.html');
  if (!fs.existsSync(sourceFile)) await downloadSource(sourceUrl, sourceFile);
  const submissionId = `codex_${jobId}_r${revision}`;
  const config = {
    token: credential.token,
    job_id: jobId,
    source_file: sourceFile,
    source_url: sourceUrl,
    submission_id: submissionId,
  };
  const args = [
    '--import', path.join(REPO_ROOT, 'artifacts/api-server/scripts/codex-executor-loader.mjs'),
    path.join(REPO_ROOT, '.migration-backup/scripts/production-codex-executor.mjs'),
  ];
  const child = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, REPLIT_CODEX_BRIDGE_ORIGIN: credential.origin },
    stdio: ['pipe', 'inherit', 'inherit'],
    windowsHide: true,
  });
  child.stdin.end(`${JSON.stringify(config)}\n`);
  let revoked = false;
  let monitoring = true;
  let stopMonitoring;
  const stopped = new Promise(resolve => { stopMonitoring = resolve; });
  const monitor = (async () => {
    while (monitoring && child.exitCode === null && !child.killed) {
      await Promise.race([sleep(12_000), stopped]);
      if (!monitoring || child.exitCode !== null || child.killed) return;
      try {
        const approved = await approvedSet(credential);
        if (!approved.has(jobId)) { revoked = true; await terminateChild(child); return; }
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
          revoked = true;
          await terminateChild(child);
          return;
        }
        console.error(`任务授权状态暂时无法确认：${String(error.message || error).slice(0, 300)}`);
      }
    }
  })();
  const exitCode = await new Promise(resolve => {
    child.once('error', error => {
      console.error(`无法启动本机 Codex 进程：${String(error.message || error).slice(0, 300)}`);
      resolve(1);
    });
    child.once('close', code => resolve(code ?? 1));
  });
  monitoring = false;
  stopMonitoring();
  await monitor;
  if (revoked) console.log(`任务 ${jobId} 已撤销，执行进程已停止。`);
  else if (exitCode !== 0) console.error(`任务 ${jobId} 的 Codex 执行进程退出，退出码 ${exitCode}。请在工作台检查回执。`);
  else console.log(`任务 ${jobId} 已执行结束；请在制作台审核回传草稿。`);
}

async function runAgent() {
  requireWindows();
  const credential = loadCredential();
  const codexCli = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  if (!fs.existsSync(codexCli)) {
    throw new Error('找不到本机已登录的 Codex CLI。请先在此 Windows 用户下安装并登录 Codex CLI。');
  }
  console.log(`本机执行器已启动（${credential.deviceId}），仅轮询站主逐条批准的任务。`);
  let delay = 8_000;
  while (true) {
    try {
      const result = await jsonRequest(`${credential.origin}/api/codex-executor/agent/poll`, {
        ...credential, body: {},
      });
      delay = 8_000;
      const tasks = Array.isArray(result.tasks) ? result.tasks : [];
      if (tasks.length) {
        await runTask(credential, tasks[0]);
        continue;
      }
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        console.error('设备授权已撤销或失效；执行器已停止。');
        return;
      }
      console.error(`暂时无法连接制作台：${String(error.message || error).slice(0, 300)}`);
      delay = Math.min(Math.max(delay * 2, 10_000), 5 * 60_000);
    }
    await sleep(delay);
  }
}

try {
  const command = process.argv[2];
  if (command === '--pair') await pairDevice();
  else if (command === '--run') await runAgent();
  else throw new Error('Use --pair during installation or --run from Task Scheduler.');
} catch (error) {
  console.error(String(error?.message || error).slice(0, 1000));
  process.exitCode = 1;
}
