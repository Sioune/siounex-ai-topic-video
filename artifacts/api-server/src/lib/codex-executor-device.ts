import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { db } from '../imported/lib/store';
import { persistStudioDatabase } from './studio-database';
import { authenticatedUser, requestIdentity } from './studio-auth';
import { isCodexBridgeRequestAllowed } from './codex-bridge-policy.mjs';

const PAIR_PREFIX = 'codex_executor_pairing_v1:';
const DEVICE_PREFIX = 'codex_executor_device_v1:';
const APPROVAL_PREFIX = 'codex_executor_approval_v1:';
const PAIR_TTL_MS = 10 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type StatementLike = {
  first(): Promise<unknown>;
  all(): Promise<{ results: unknown[] }>;
};

async function firstRow<T>(statement: StatementLike): Promise<T | null> {
  return await statement.first() as T | null;
}

async function allRows<T>(statement: StatementLike): Promise<{ results: T[] }> {
  return await statement.all() as { results: T[] };
}

type Device = {
  version: 1;
  token_hash: string;
  owner_id: string;
  origin: string;
  device_id: string;
  device_name: string;
  created_at: number;
  last_seen_at: number;
  revoked: boolean;
};

type Approval = {
  version: 1;
  owner_id: string;
  device_id: string;
  job_id: string;
  revision: number;
  source_hash: string;
  approved_at: number;
  revoked: boolean;
};

function bodyObject(req: Request, limit = 10000) {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!raw || Buffer.byteLength(raw) > limit) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch { return null; }
}

function trustedOrigin(req: Request) {
  const host = req.get('host') || '';
  const allowedHosts = [
    process.env.REPLIT_DEV_DOMAIN,
    ...(process.env.REPLIT_DOMAINS || '').split(',').map(value => value.trim()).filter(Boolean),
  ].filter((value): value is string => !!value);
  if (req.protocol !== 'https' || !allowedHosts.includes(host)) return null;
  return `https://${host}`;
}

function sameOrigin(req: Request, expected?: string) {
  const origin = trustedOrigin(req);
  return !!origin && (!expected || origin === expected) &&
    req.get('origin') === origin && req.get('sec-fetch-site') !== 'cross-site';
}

function parseRecord<T>(value: string | undefined): T | null {
  try { return value ? JSON.parse(value) as T : null; } catch { return null; }
}

async function ownerId(req: Request) {
  return authenticatedUser(req)?.userId || null;
}

async function getJob(jobId: string) {
  return firstRow<{ owner_id: string | null; is_test: number; status: string; revision: number; source_snapshot: string; lease_until: number | null }>(
    db().prepare('SELECT owner_id,is_test,status,revision,source_snapshot,lease_until FROM production_jobs WHERE id=?').bind(jobId),
  );
}

function sourceHash(sourceSnapshot: string) {
  return hash(sourceSnapshot);
}

function validSource(sourceSnapshot: string) {
  try {
    const source = JSON.parse(sourceSnapshot);
    const url = typeof source?.url === 'string' ? source.url : source?.source?.url;
    return typeof url === 'string' && /^https:\/\/\S+$/i.test(url);
  } catch { return false; }
}

export const issueCodexExecutorPairing: RequestHandler = async (req, res) => {
  if (!sameOrigin(req)) { res.status(403).json({ error: '不接受跨站请求或不支持此网站地址。' }); return; }
  const input = bodyObject(req);
  if (!input || Object.keys(input).length) { res.status(400).json({ error: '配对请求格式无效。' }); return; }
  const owner = await ownerId(req);
  const origin = trustedOrigin(req);
  if (!owner || !origin) { res.status(403).json({ error: '站主身份无效。' }); return; }

  const existingDevices = await allRows<{ value: string }>(
    db().prepare('SELECT value FROM app_state WHERE key LIKE ?').bind(DEVICE_PREFIX + '%'),
  );
  if (existingDevices.results.some(row => {
    const device = parseRecord<Device>(row.value);
    return !!device && device.owner_id === owner && !device.revoked;
  })) {
    res.status(409).json({ error: '已有本机执行器登记。请先撤销旧设备，再配对新设备。' });
    return;
  }

  const pairId = randomBytes(18).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const pairingCode = `cxpair1.${pairId}.${secret}`;
  const rows = await allRows<{ key: string; value: string }>(
    db().prepare('SELECT key,value FROM app_state WHERE key LIKE ?').bind(PAIR_PREFIX + '%'),
  );
  const statements = rows.results
    .filter(row => parseRecord<{ owner_id?: string }>(row.value)?.owner_id === owner)
    .map(row => db().prepare('DELETE FROM app_state WHERE key=?').bind(row.key));
  statements.push(db().prepare('INSERT INTO app_state(key,value) VALUES (?,?)').bind(
    PAIR_PREFIX + pairId,
    JSON.stringify({
      version: 1, credential_hash: hash(secret), owner_id: owner, origin,
      created_at: Date.now(), expires_at: Date.now() + PAIR_TTL_MS,
    }),
  ));
  await db().batch(statements);
  await persistStudioDatabase();
  res.set('Cache-Control', 'no-store').status(201).json({
    pairing_code: pairingCode,
    origin,
    expires_at: Date.now() + PAIR_TTL_MS,
  });
};

export const pairCodexExecutorDevice: RequestHandler = async (req, res) => {
  const origin = trustedOrigin(req);
  if (!origin || req.get('origin') !== origin || req.get('sec-fetch-site') === 'cross-site') {
    res.status(403).json({ error: '设备配对来源无效。' });
    return;
  }
  const input = bodyObject(req);
  if (!input || Object.keys(input).some(key => key !== 'device_name') ||
      typeof input.device_name !== 'string' || !input.device_name.trim() || input.device_name.length > 100) {
    res.status(400).json({ error: '设备名称无效。' });
    return;
  }
  const match = /^Bearer (cxpair1\.([A-Za-z0-9_-]{20,32})\.([A-Za-z0-9_-]{40,48}))$/.exec(req.get('authorization') || '');
  if (!match) { res.status(401).json({ error: '配对码无效或已过期。' }); return; }
  const [, , pairId, secret] = match;
  const pairKey = PAIR_PREFIX + pairId;
  const row = await firstRow<{ value: string }>(db().prepare('SELECT value FROM app_state WHERE key=?').bind(pairKey));
  const pairing = parseRecord<{ credential_hash: string; owner_id: string; origin: string; expires_at: number }>(row?.value);
  const presentedHash = Buffer.from(hash(secret), 'hex');
  const storedHash = Buffer.from(pairing?.credential_hash || '', 'hex');
  if (!pairing || storedHash.length !== presentedHash.length || !timingSafeEqual(storedHash, presentedHash) ||
      pairing.expires_at <= Date.now() || pairing.origin !== origin ||
      pairing.owner_id !== process.env.STUDIO_OWNER_ID) {
    res.status(401).json({ error: '配对码无效或已过期。' });
    return;
  }

  const devices = await allRows<{ value: string }>(
    db().prepare('SELECT value FROM app_state WHERE key LIKE ?').bind(DEVICE_PREFIX + '%'),
  );
  if (devices.results.some(item => {
    const device = parseRecord<Device>(item.value);
    return device?.owner_id === pairing.owner_id && !device.revoked;
  })) {
    res.status(409).json({ error: '站主已有登记设备，请先撤销后再配对。' });
    return;
  }

  const deviceId = randomBytes(18).toString('base64url');
  const deviceSecret = randomBytes(32).toString('base64url');
  const token = `cxdev1.${deviceId}.${deviceSecret}`;
  const now = Date.now();
  const consumed = await db().prepare(`DELETE FROM app_state
    WHERE key=? AND json_valid(value) AND json_extract(value,'$.credential_hash')=?
      AND json_extract(value,'$.expires_at')>? AND json_extract(value,'$.owner_id')=?`)
    .bind(pairKey, pairing.credential_hash, now, pairing.owner_id).run();
  if (!consumed.meta?.changes) { res.status(409).json({ error: '配对码已被使用，请重新生成。' }); return; }

  await db().prepare('INSERT INTO app_state(key,value) VALUES (?,?)').bind(
    DEVICE_PREFIX + deviceId,
    JSON.stringify({
      version: 1, token_hash: hash(deviceSecret), owner_id: pairing.owner_id,
      origin, device_id: deviceId, device_name: input.device_name.trim(),
      created_at: now, last_seen_at: 0, revoked: false,
    } satisfies Device),
  ).run();
  await persistStudioDatabase();
  res.set('Cache-Control', 'no-store').status(201).json({
    device_id: deviceId,
    token,
    message: '设备已配对。请勿分享或保存未加密的执行器凭据。',
  });
};

async function verifiedDevice(req: Request): Promise<Device | false | null> {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer cxdev1.')) return null;
  const match = /^Bearer cxdev1\.([A-Za-z0-9_-]{20,32})\.([A-Za-z0-9_-]{40,48})$/.exec(header);
  if (!match) return false;
  const [, deviceId, secret] = match;
  const row = await firstRow<{ value: string }>(
    db().prepare('SELECT value FROM app_state WHERE key=?').bind(DEVICE_PREFIX + deviceId),
  );
  const device = parseRecord<Device>(row?.value);
  const presentedHash = Buffer.from(hash(secret), 'hex');
  const storedHash = Buffer.from(device?.token_hash || '', 'hex');
  if (!device || device.revoked || device.owner_id !== process.env.STUDIO_OWNER_ID ||
      device.device_id !== deviceId || storedHash.length !== presentedHash.length ||
      !timingSafeEqual(storedHash, presentedHash) ||
      req.protocol !== 'https' || device.origin !== `https://${req.get('host')}` ||
      req.get('origin') !== device.origin || req.get('sec-fetch-site') === 'cross-site') return false;
  return device;
}

async function approvalFor(device: Device, jobId: string) {
  const row = await firstRow<{ value: string }>(
    db().prepare('SELECT value FROM app_state WHERE key=?').bind(APPROVAL_PREFIX + jobId),
  );
  const approval = parseRecord<Approval>(row?.value);
  if (!approval || approval.revoked || approval.owner_id !== device.owner_id ||
      approval.device_id !== device.device_id || approval.job_id !== jobId) return null;
  const job = await getJob(jobId);
  if (!job || job.owner_id !== device.owner_id || job.is_test !== 0 ||
      !['waiting_executor', 'running'].includes(job.status) ||
      job.revision !== approval.revision || sourceHash(job.source_snapshot) !== approval.source_hash) return null;
  return { approval, job };
}

export async function authorizeCodexExecutorDeviceRequest(
  req: Request,
): Promise<Device | false | null> {
  const device = await verifiedDevice(req);
  if (device === null || device === false) return device;
  const input = bodyObject(req, 1_500_000);
  const jobId = typeof input?.id === 'string' ? input.id : '';
  if (!jobId) return false;
  const current = await approvalFor(device, jobId);
  if (!current) return false;
  const scopedGrant = {
    job_id: jobId,
    expires_at: Number.MAX_SAFE_INTEGER,
    revoked: false,
  };
  return isCodexBridgeRequestAllowed(scopedGrant, input) ? device : false;
}

export const codexExecutorDeviceMiddleware: RequestHandler = (req, res, next) => {
  void verifiedDevice(req).then(device => {
    if (!device) { res.status(401).json({ error: '本机执行器未登记、已撤销或授权已失效。' }); return; }
    requestIdentity.run({
      kind: 'codex-executor', userId: device.owner_id, executorDeviceId: device.device_id,
    }, next as NextFunction);
  }).catch(next);
};

export const pollCodexExecutorJobs: RequestHandler = async (req, res) => {
  const input = bodyObject(req);
  if (!input || Object.keys(input).length) { res.status(400).json({ error: '轮询请求格式无效。' }); return; }
  const identity = requestIdentity.getStore();
  const deviceId = identity?.executorDeviceId;
  const owner = identity?.userId;
  if (typeof deviceId !== 'string' || typeof owner !== 'string') {
    res.status(401).json({ error: '本机执行器身份无效。' });
    return;
  }
  const deviceKey = DEVICE_PREFIX + deviceId;
  const deviceRow = await firstRow<{ value: string }>(db().prepare('SELECT value FROM app_state WHERE key=?').bind(deviceKey));
  const device = parseRecord<Device>(deviceRow?.value);
  if (!device || device.revoked || device.owner_id !== owner) {
    res.status(401).json({ error: '本机执行器已撤销。' });
    return;
  }
  const now = Date.now();
  if (now - device.last_seen_at >= 30_000) {
    device.last_seen_at = now;
    await db().prepare(`UPDATE app_state SET value=? WHERE key=? AND json_valid(value)
      AND json_extract(value,'$.revoked')=0 AND json_extract(value,'$.token_hash')=?`)
      .bind(JSON.stringify(device), deviceKey, device.token_hash).run();
    await persistStudioDatabase();
  }
  const rows = await allRows<{ key: string; value: string }>(
    db().prepare('SELECT key,value FROM app_state WHERE key LIKE ?').bind(APPROVAL_PREFIX + '%'),
  );
  const tasks: Array<{ job_id: string; revision: number; approved_at: number }> = [];
  const approvedJobs: string[] = [];
  const staleApprovals: Array<{ key: string; value: string }> = [];
  for (const row of rows.results) {
    const approval = parseRecord<Approval>(row.value);
    if (!approval || approval.device_id !== deviceId || approval.owner_id !== owner || approval.revoked) continue;
    const current = await approvalFor(device, approval.job_id);
    if (!current) {
      staleApprovals.push({ key: row.key, value: row.value });
      continue;
    }
    approvedJobs.push(approval.job_id);
    if (current.job.status === 'waiting_executor' ||
        current.job.status === 'running' && Number(current.job.lease_until || 0) <= now) {
      tasks.push({ job_id: approval.job_id, revision: approval.revision, approved_at: approval.approved_at });
    }
  }
  if (staleApprovals.length) {
    await db().batch(staleApprovals.map(item => db().prepare('DELETE FROM app_state WHERE key=? AND value=?').bind(item.key, item.value)));
    await persistStudioDatabase();
  }
  res.set('Cache-Control', 'no-store').json({
    tasks: tasks.slice(0, 5),
    approved_jobs: approvedJobs.slice(0, 100),
    polled_at: now,
  });
};

export const readCodexExecutorDeviceStatus: RequestHandler = async (req, res) => {
  const owner = await ownerId(req);
  if (!owner) { res.status(403).json({ error: '站主身份无效。' }); return; }
  const rows = await allRows<{ key: string; value: string }>(
    db().prepare('SELECT key,value FROM app_state WHERE key LIKE ?').bind(DEVICE_PREFIX + '%'),
  );
  const device = rows.results.map(row => parseRecord<Device>(row.value))
    .find(value => !!value && value.owner_id === owner && !value.revoked);
  const jobId = new URL(req.originalUrl, `https://${req.get('host')}`).searchParams.get('job_id');
  let approved = false;
  if (jobId) {
    const row = await firstRow<{ value: string }>(
      db().prepare('SELECT value FROM app_state WHERE key=?').bind(APPROVAL_PREFIX + jobId),
    );
    const approval = parseRecord<Approval>(row?.value);
    approved = !!approval && !!device && !approval.revoked && approval.owner_id === owner &&
      approval.device_id === device.device_id && !!(await approvalFor(device, jobId));
  }
  res.set('Cache-Control', 'private, no-store').json({
    device: device ? {
      device_id: device.device_id,
      device_name: device.device_name,
      online: Date.now() - device.last_seen_at < 90_000,
      last_seen_at: device.last_seen_at,
    } : null,
    approved,
  });
};

export const approveCodexExecutorJob: RequestHandler = async (req, res) => {
  if (!sameOrigin(req)) { res.status(403).json({ error: '不接受跨站请求。' }); return; }
  const input = bodyObject(req);
  const jobId = input?.job_id;
  if (typeof jobId !== 'string' || !/^job_[A-Za-z0-9_-]{1,100}$/.test(jobId) ||
      Object.keys(input || {}).some(key => key !== 'job_id')) {
    res.status(400).json({ error: '任务编号无效。' });
    return;
  }
  const owner = await ownerId(req);
  if (!owner) { res.status(403).json({ error: '站主身份无效。' }); return; }
  const job = await getJob(jobId);
  if (!job || job.owner_id !== owner || job.is_test !== 0 || job.status !== 'waiting_executor' ||
      !validSource(job.source_snapshot)) {
    res.status(409).json({ error: '任务已变化或缺少有效来源，不能授权给本机执行器。' });
    return;
  }
  const rows = await allRows<{ value: string }>(
    db().prepare('SELECT value FROM app_state WHERE key LIKE ?').bind(DEVICE_PREFIX + '%'),
  );
  const device = rows.results.map(row => parseRecord<Device>(row.value))
    .find(value => !!value && value.owner_id === owner && !value.revoked);
  if (!device) { res.status(409).json({ error: '请先配对一台本机执行器。' }); return; }
  const approval: Approval = {
    version: 1, owner_id: owner, device_id: device.device_id, job_id: jobId,
    revision: job.revision, source_hash: sourceHash(job.source_snapshot),
    approved_at: Date.now(), revoked: false,
  };
  await db().prepare(`INSERT INTO app_state(key,value) VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .bind(APPROVAL_PREFIX + jobId, JSON.stringify(approval)).run();
  await persistStudioDatabase();
  res.set('Cache-Control', 'no-store').status(201).json({ approved: true, device_name: device.device_name });
};

export const revokeCodexExecutorJobApproval: RequestHandler = async (req, res) => {
  if (!sameOrigin(req)) { res.status(403).json({ error: '不接受跨站请求。' }); return; }
  const input = bodyObject(req);
  const jobId = input?.job_id;
  if (typeof jobId !== 'string' || !/^job_[A-Za-z0-9_-]{1,100}$/.test(jobId) ||
      Object.keys(input || {}).some(key => key !== 'job_id')) {
    res.status(400).json({ error: '任务编号无效。' });
    return;
  }
  const owner = await ownerId(req);
  const key = APPROVAL_PREFIX + jobId;
  const row = await firstRow<{ value: string }>(db().prepare('SELECT value FROM app_state WHERE key=?').bind(key));
  const approval = parseRecord<Approval>(row?.value);
  if (approval?.owner_id === owner) {
    await db().prepare('DELETE FROM app_state WHERE key=?').bind(key).run();
    await persistStudioDatabase();
  }
  res.status(204).end();
};

export const revokeCodexExecutorDevice: RequestHandler = async (req, res) => {
  if (!sameOrigin(req)) { res.status(403).json({ error: '不接受跨站请求。' }); return; }
  const input = bodyObject(req);
  const deviceId = input?.device_id;
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{20,32}$/.test(deviceId) ||
      Object.keys(input || {}).some(key => key !== 'device_id')) {
    res.status(400).json({ error: '设备编号无效。' });
    return;
  }
  const owner = await ownerId(req);
  const key = DEVICE_PREFIX + deviceId;
  const row = await firstRow<{ value: string }>(db().prepare('SELECT value FROM app_state WHERE key=?').bind(key));
  const device = parseRecord<Device>(row?.value);
  if (device?.owner_id === owner) {
    const approvals = await allRows<{ key: string; value: string }>(
      db().prepare('SELECT key,value FROM app_state WHERE key LIKE ?').bind(APPROVAL_PREFIX + '%'),
    );
    const statements = approvals.results
      .filter(item => parseRecord<Approval>(item.value)?.device_id === deviceId)
      .map(item => db().prepare('DELETE FROM app_state WHERE key=?').bind(item.key));
    statements.push(db().prepare('DELETE FROM app_state WHERE key=?').bind(key));
    await db().batch(statements);
    await persistStudioDatabase();
  }
  res.status(204).end();
};
