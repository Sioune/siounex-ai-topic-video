import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { db } from '../imported/lib/store';
import { persistStudioDatabase } from './studio-database';
import { authenticatedUser, requestIdentity } from './studio-auth';
import { isCodexBridgeRequestAllowed } from './codex-bridge-policy.mjs';
import { authorizeCodexExecutorDeviceRequest } from './codex-executor-device';

const GRANT_PREFIX = 'codex_executor_grant_v1:';
const TTL_MS = 60 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type StatementLike = {
  first(): Promise<unknown>;
  all(): Promise<{ results: unknown[] }>;
};

async function firstRow<T>(statement: StatementLike): Promise<T | null> {
  return await statement.first() as T | null;
}

async function allRows<T>(statement: StatementLike): Promise<T[]> {
  return (await statement.all()).results as T[];
}

export function trustedRequestOrigin(req: Request) {
  const host = req.get('host') || '';
  const allowedHosts = [
    process.env.REPLIT_DEV_DOMAIN,
    ...(process.env.REPLIT_DOMAINS || '').split(',').map(value => value.trim()).filter(Boolean),
  ].filter((value): value is string => !!value);
  if (req.protocol !== 'https' || !allowedHosts.includes(host)) throw new Error('不支持为此网站地址签发本地执行授权。');
  return `https://${host}`;
}

function bodyObject(req: Request, limit = 10000) {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!raw || Buffer.byteLength(raw) > limit) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function requireSameOrigin(req: Request, res: Response) {
  let origin: string;
  try { origin = trustedRequestOrigin(req); } catch {
    res.status(403).json({ error: '此预览地址不受支持。' });
    return false;
  }
  if (req.get('origin') !== origin || req.get('sec-fetch-site') === 'cross-site') {
    res.status(403).json({ error: '不接受跨站请求。' });
    return false;
  }
  return true;
}

export const issueCodexExecutorGrant: RequestHandler = async (req, res) => {
  if (!requireSameOrigin(req, res)) return;
  const input = bodyObject(req);
  const jobId = input?.job_id;
  if (typeof jobId !== 'string' || !/^job_[A-Za-z0-9_-]{1,100}$/.test(jobId) ||
      Object.keys(input || {}).some(key => key !== 'job_id')) {
    res.status(400).json({ error: '任务编号无效。' });
    return;
  }
  const owner = authenticatedUser(req)?.userId;
  if (typeof owner !== 'string' || !owner) {
    res.status(403).json({ error: '站主身份无效。' });
    return;
  }
  const job = await firstRow<{ owner_id: string | null; is_test: number; status: string }>(
    db().prepare('SELECT owner_id,is_test,status FROM production_jobs WHERE id=?').bind(jobId),
  );
  if (job?.owner_id !== owner || job.is_test !== 0) {
    res.status(404).json({ error: '找不到可授权的正式制作任务。' });
    return;
  }
  if (job.status !== 'waiting_executor') {
    res.status(409).json({ error: '本机 Codex 只接收当前等待执行的任务。' });
    return;
  }
  try {
    const sourceRow = await firstRow<{ source_snapshot: string }>(
      db().prepare('SELECT source_snapshot FROM production_jobs WHERE id=?').bind(jobId),
    );
    const source = JSON.parse(String(sourceRow?.source_snapshot || 'null'));
    if (typeof source?.url !== 'string' || !/^https?:\/\/\S+$/i.test(source.url)) throw new Error('missing source url');
  } catch {
    res.status(409).json({ error: '任务缺少可核对的原始来源链接，无法交给本机执行器。' });
    return;
  }
  let origin: string;
  try { origin = trustedRequestOrigin(req); } catch {
    res.status(403).json({ error: '此预览地址不受支持。' });
    return;
  }
  const tokenId = randomBytes(18).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const token = `cxbr1.${tokenId}.${secret}`;
  const grantId = `grant_${tokenId}`;
  const grant = {
    version: 1, token_hash: hash(secret), owner_id: owner, job_id: jobId,
    origin, created_at: Date.now(), expires_at: Date.now() + TTL_MS, revoked: false,
  };
  const existing = await allRows<{ key: string; value: string }>(
    db().prepare("SELECT key,value FROM app_state WHERE key LIKE ?").bind(GRANT_PREFIX + '%'),
  );
  const statements = [];
  let active = 0;
  for (const row of existing.results) {
    let prior: any;
    try { prior = JSON.parse(row.value); } catch { statements.push(db().prepare('DELETE FROM app_state WHERE key=?').bind(row.key)); continue; }
    if (prior.expires_at <= Date.now() || prior.revoked === true ||
        prior.owner_id === owner && prior.job_id === jobId) {
      statements.push(db().prepare('DELETE FROM app_state WHERE key=?').bind(row.key));
    } else if (prior.owner_id === owner) active++;
  }
  if (active >= 5) {
    res.status(429).json({ error: '当前已有多个本机任务授权；先等待过期或撤销后重试。' });
    return;
  }
  // Rotate at transaction execution time, not from the earlier read: two
  // simultaneous clicks must not leave two active grants for the same job.
  statements.push(db().prepare(`DELETE FROM app_state WHERE key LIKE ? AND json_valid(value)
    AND json_extract(value,'$.owner_id')=? AND json_extract(value,'$.job_id')=?`)
    .bind(GRANT_PREFIX + '%', owner, jobId));
  statements.push(db().prepare('INSERT INTO app_state(key,value) VALUES (?,?)')
    .bind(GRANT_PREFIX + tokenId, JSON.stringify(grant)));
  await db().batch(statements);
  await persistStudioDatabase();
  res.set('Cache-Control', 'no-store').status(201).json({
    grant_id: grantId, token, job_id: jobId, origin, expires_at: grant.expires_at,
    one_time_display: true,
  });
};

export const revokeCodexExecutorGrant: RequestHandler = async (req, res) => {
  if (!requireSameOrigin(req, res)) return;
  const input = bodyObject(req);
  const grantId = input?.grant_id;
  if (typeof grantId !== 'string' || !/^grant_[A-Za-z0-9_-]{1,100}$/.test(grantId) ||
      Object.keys(input || {}).some(key => key !== 'grant_id')) {
    res.status(400).json({ error: '授权编号无效。' });
    return;
  }
  const owner = authenticatedUser(req)?.userId;
  const tokenId = grantId.slice('grant_'.length);
  const key = GRANT_PREFIX + tokenId;
  const row = await firstRow<{ value: string }>(db().prepare('SELECT value FROM app_state WHERE key=?').bind(key));
  if (!row) { res.status(204).end(); return; }
  const grant = JSON.parse(row.value);
  if (grant.owner_id !== owner) { res.status(404).json({ error: '授权不存在。' }); return; }
  await db().prepare('DELETE FROM app_state WHERE key=?').bind(key).run();
  await persistStudioDatabase();
  res.status(204).end();
};

async function executorIdentity(req: Request) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer cxbr1.')) return null;
  const match = /^Bearer cxbr1\.([A-Za-z0-9_-]{20,32})\.([A-Za-z0-9_-]{40,48})$/.exec(header);
  if (!match) return false;
  const row = await firstRow<{ value: string }>(
    db().prepare('SELECT value FROM app_state WHERE key=?').bind(GRANT_PREFIX + match[1]),
  );
  if (!row) return false;
  let grant: any;
  try { grant = JSON.parse(row.value); } catch { return false; }
  const presentedHash = Buffer.from(hash(match[2]), 'hex');
  const storedHash = Buffer.from(typeof grant.token_hash === 'string' ? grant.token_hash : '', 'hex');
  if (storedHash.length !== presentedHash.length || !timingSafeEqual(storedHash, presentedHash)) return false;
  if (req.protocol !== 'https' || grant.origin !== `https://${req.get('host')}`) return false;
  if (typeof grant.owner_id !== 'string' || grant.owner_id !== process.env.STUDIO_OWNER_ID) return false;
  const job = await firstRow<{ owner_id: string; is_test: number }>(
    db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(grant.job_id),
  );
  if (job?.owner_id !== grant.owner_id || job.is_test !== 0) return false;
  const body = bodyObject(req, 1500000);
  if (!isCodexBridgeRequestAllowed(grant, body)) return false;
  return grant;
}

export const codexExecutorBridgeMiddleware: RequestHandler = (req, res, next) => {
  void executorIdentity(req).then(grant => {
    if (grant) {
      requestIdentity.run({ kind: 'codex-executor', userId: grant.owner_id, executorGrant: true }, next as NextFunction);
      return;
    }
    if (grant === false) { res.status(401).json({ error: '本机执行授权无效、已过期或不适用于此任务。' }); return; }
    void authorizeCodexExecutorDeviceRequest(req).then(device => {
      if (device === null) { next(); return; }
      if (device === false) { res.status(401).json({ error: '本机执行器未获准处理此任务，或设备授权已撤销。' }); return; }
      requestIdentity.run({
        kind: 'codex-executor', userId: device.owner_id, executorDeviceId: device.device_id,
      }, next as NextFunction);
    }).catch(next);
  }).catch(next);
};
