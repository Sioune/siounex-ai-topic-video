import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { studioDatabase as db, persistStudioDatabase } from './studio-database';
import { serializeStudioRequest } from './studio-queue';
import { refreshFeeds } from '../imported/lib/store';
import sources from '../imported/lib/sources.json';
import { ContentError } from './content-catalog';

const KEY = 'display_import_key_v1';
export const AUTO_REFRESH_MINUTES = 30;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
let running = false;
let refreshError: string | null = null;
export const refreshRunning = () => running;
export const lastRefreshError = () => refreshError;

export function sameSiteWrite(req: Request) {
  if (req.get('origin') !== `${req.protocol}://${req.get('host')}` ||
      req.get('sec-fetch-site') === 'cross-site') {
    throw new ContentError('管理员写操作必须来自本站。', 403);
  }
}
export function jsonBody(req: Request) {
  if (!req.is('application/json')) throw new ContentError('请使用 JSON 请求。');
  if (!Buffer.isBuffer(req.body) || req.body.length > 150_000) throw new ContentError('请求过大或格式无效。', 413);
  try { return JSON.parse(req.body.toString('utf8')) as unknown; }
  catch { throw new ContentError('请求不是有效的 JSON。'); }
}
export async function syncKeyActive(owner: string) {
  const row = await db.prepare('SELECT value FROM app_state WHERE key=?').bind(KEY).first() as Record<string, unknown> | null;
  if (!row) return false;
  const record = JSON.parse(String(row.value));
  return record.owner_id === owner && Number(record.expires_at) > Date.now();
}
export async function issueSyncKey(owner: string) {
  const token = 'cxresult1.' + randomBytes(32).toString('base64url');
  await db.prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(KEY, JSON.stringify({ owner_id: owner, hash: hash(token), expires_at: Date.now() + 30 * 86400_000 })).run();
  return token;
}
export async function revokeSyncKey() {
  await db.prepare('DELETE FROM app_state WHERE key=?').bind(KEY).run();
}
export async function syncOwner(req: Request) {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  if (!/^cxresult1\.[A-Za-z0-9_-]{43}$/.test(token)) throw new ContentError('成果同步凭据无效。', 401);
  if (req.get('sec-fetch-site') === 'cross-site' || !req.is('application/json')) throw new ContentError('同步请求格式无效。', 403);
  const row = await db.prepare('SELECT value FROM app_state WHERE key=?').bind(KEY).first() as Record<string, unknown> | null;
  const record = row ? JSON.parse(String(row.value)) : null;
  const presented = Buffer.from(hash(token), 'hex');
  const expected = Buffer.from(record?.hash || '', 'hex');
  if (!record || expected.length !== presented.length || !timingSafeEqual(expected, presented) ||
      record.owner_id !== process.env.STUDIO_OWNER_ID || Number(record.expires_at) <= Date.now()) {
    throw new ContentError('成果同步凭据已撤销或过期。', 401);
  }
  return String(record.owner_id);
}
export async function sourceStatuses() {
  const { results } = await db.prepare('SELECT id,last_attempt,last_success,state,message FROM source_status').all();
  return sources.map(source => {
    const row = results.find(item => item.id === source.id);
    return {
      id: source.id, name: source.name, state: row ? String(row.state) : 'never',
      message: row ? String(row.message) : '尚未同步',
      last_attempt: row?.last_attempt ? String(row.last_attempt) : null,
      last_success: row?.last_success ? String(row.last_success) : null,
    };
  });
}
// Source fetching still uses the existing safe allowlist and business queue.
// Public reads are deliberately NOT on that queue.
export function startSourceRefresh(onError: (error: unknown) => void) {
  if (running) return false;
  running = true;
  refreshError = null;
  void serializeStudioRequest(async () => {
    await refreshFeeds();
    await persistStudioDatabase();
  }).catch(error => {
    refreshError = '同步未完成，已有资料保留。请检查来源状态后重试。';
    onError(error);
  }).finally(() => { running = false; });
  return true;
}
export function scheduleSourceRefresh(onError: (error: unknown) => void) {
  const timer = setInterval(() => { startSourceRefresh(onError); }, AUTO_REFRESH_MINUTES * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
