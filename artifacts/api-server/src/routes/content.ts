import { Router, type RequestHandler } from 'express';
import { ListPublicTopicsQueryParams, ListPublicResultsQueryParams, SetResultVisibilityBody } from '@workspace/api-zod';
import { authenticatedUser, requireStudioOwner } from '../lib/studio-auth';
import { studioDatabase as db, persistStudioDatabase } from '../lib/studio-database';
import {
  catalogResult, catalogResults, ContentError, displayUrl, removeCatalogResult,
  saveCatalogResult, setCatalogVisibility,
} from '../lib/content-catalog';
import {
  AUTO_REFRESH_MINUTES, issueSyncKey, jsonBody, lastRefreshError, refreshRunning,
  revokeSyncKey, sameSiteWrite, sourceStatuses, startSourceRefresh, syncKeyActive, syncOwner,
} from '../lib/content-sync';
import { serializeStudioRequest } from '../lib/studio-queue';
import sources from '../imported/lib/sources.json';

const owner = () => process.env.STUDIO_OWNER_ID || '';
function handle(callback: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try { await callback(req, res, next); }
    catch (error) {
      if (error instanceof ContentError) { res.status(error.status).json({ error: error.message }); return; }
      req.log.error({ errorName: error instanceof Error ? error.name : 'Error' }, 'Content request failed');
      res.status(503).json({ error: '内容暂时无法读取或保存，请稍后重试；已有内容不会用空结果替代。' });
    }
  };
}
async function write<T>(callback: () => Promise<T>) {
  return serializeStudioRequest(async () => { const result = await callback(); await persistStudioDatabase(); return result; });
}
const safeUrl = (raw: unknown) => { try { return displayUrl(String(raw || '')); } catch { return ''; } };
export const publicContentRouter = Router();
export const adminContentRouter = Router();

publicContentRouter.get('/public/topics', handle(async (req, res) => {
  const parsed = ListPublicTopicsQueryParams.safeParse(req.query);
  if (!parsed.success) throw new ContentError('查询条件无效。');
  const { q = '', category = '', page = 1 } = parsed.data;
  if (page > 10_000) throw new ContentError('页码过大。');
  const query = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  const sourceIds = sources.map(source => source.id);
  const allowedSources = `source_id IN (${sourceIds.map(() => '?').join(',')})`;
  const filter = `WHERE ${allowedSources} AND (?='' OR title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\') AND (?='' OR category=?)`;
  const bindings = [...sourceIds, q, query, query, category, category];
  const { results } = await db.prepare(`SELECT id,title,summary,url,source,category,published_at FROM topics ${filter}
    ORDER BY published_at DESC,id LIMIT 24 OFFSET ?`).bind(...bindings, (page - 1) * 24).all();
  const total = await db.prepare(`SELECT count(*) AS n FROM topics ${filter}`).bind(...bindings).first() as Record<string, unknown> | null;
  const categories = await db.prepare(`SELECT DISTINCT category FROM topics WHERE ${allowedSources} ORDER BY category`).bind(...sourceIds).all();
  const last = await db.prepare('SELECT max(last_success) AS at FROM source_status').first() as Record<string, unknown> | null;
  res.json({
    topics: results.map(row => ({
      id: String(row.id), title: String(row.title), summary: String(row.summary || ''),
      url: safeUrl(row.url), source: String(row.source), category: String(row.category),
      published_at: String(row.published_at || ''),
    })),
    total: Number(total?.n || 0), page, page_size: 24,
    categories: categories.results.map(row => String(row.category)), last_synced_at: last?.at || null,
  });
}));
publicContentRouter.get('/public/results', handle(async (req, res) => {
  const parsed = ListPublicResultsQueryParams.safeParse(req.query);
  if (!parsed.success) throw new ContentError('查询条件无效。');
  const { q = '', kind } = parsed.data;
  const results = await catalogResults(owner(), true);
  res.json(results.filter(item => (!kind || item.kind === kind) && `${item.title}\n${item.summary}`.toLowerCase().includes(q.toLowerCase())));
}));
publicContentRouter.get('/public/results/:id', handle(async (req, res) => {
  res.json(await catalogResult(String(req.params.id), owner()));
}));
// An import credential is intentionally not a user session or Codex execution grant.
publicContentRouter.post('/sync/results', handle(async (req, res) => {
  // Authenticate inside the same write queue as revoke/rotation to avoid TOCTOU.
  const result = await write(async () => saveCatalogResult(jsonBody(req), await syncOwner(req)));
  res.json(result);
}));
adminContentRouter.use('/admin', requireStudioOwner);
adminContentRouter.get('/admin/content', handle(async (req, res) => {
  const id = authenticatedUser(req)!.userId;
  const topicCount = await db.prepare('SELECT count(*) AS n FROM topics').first() as Record<string, unknown> | null;
  const legacyCount = await db.prepare('SELECT count(*) AS n FROM production_jobs WHERE owner_id=?').bind(id).first() as Record<string, unknown> | null;
  const statuses = await sourceStatuses();
  if (lastRefreshError()) statuses.push({ id: 'sync-service', name: '同步服务', state: 'error', message: lastRefreshError()!, last_attempt: null, last_success: null });
  res.json({
    results: await catalogResults(id, false), sources: statuses, sync_key_active: await syncKeyActive(id),
    topic_count: Number(topicCount?.n || 0), legacy_job_count: Number(legacyCount?.n || 0),
    refresh_running: refreshRunning(), automatic_refresh_minutes: AUTO_REFRESH_MINUTES,
  });
}));
adminContentRouter.post('/admin/results', handle(async (req, res) => {
  sameSiteWrite(req);
  res.json(await write(() => saveCatalogResult(jsonBody(req), authenticatedUser(req)!.userId)));
}));
adminContentRouter.post('/admin/results/:id/visibility', handle(async (req, res) => {
  sameSiteWrite(req);
  const input = SetResultVisibilityBody.strict().safeParse(jsonBody(req));
  if (!input.success) throw new ContentError('可见性或版本号无效。');
  res.json(await write(() => setCatalogVisibility(String(req.params.id), authenticatedUser(req)!.userId, input.data.visible, input.data.revision)));
}));
adminContentRouter.delete('/admin/results/:id', handle(async (req, res) => {
  sameSiteWrite(req);
  await write(() => removeCatalogResult(String(req.params.id), authenticatedUser(req)!.userId));
  res.status(204).end();
}));
adminContentRouter.post('/admin/sources/refresh', handle(async (req, res) => {
  sameSiteWrite(req);
  const started = startSourceRefresh(error => req.log.error({ errorName: error instanceof Error ? error.name : 'Error' }, 'Source refresh failed'));
  res.json({ message: started ? '已开始同步固定来源。请查看各来源的实际回执。' : '已有同步正在进行，请勿重复启动。' });
}));
adminContentRouter.post('/admin/sync-key', handle(async (req, res) => {
  sameSiteWrite(req);
  const token = await write(() => issueSyncKey(authenticatedUser(req)!.userId));
  res.status(201).json({ token, endpoint: `${req.protocol}://${req.get('host')}/api/sync/results` });
}));
adminContentRouter.delete('/admin/sync-key', handle(async (req, res) => {
  sameSiteWrite(req);
  await write(revokeSyncKey);
  res.status(204).end();
}));
