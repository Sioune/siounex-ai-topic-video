import { Router } from 'express';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { authenticatedUser, requestIdentity } from '../lib/studio-auth';
import { persistStudioDatabase } from '../lib/studio-database';
import * as audioIntake from '../imported/app/api/audio-intake/route';
import * as catalog from '../imported/app/api/catalog/route';
import * as coverCandidate from '../imported/app/api/cover-candidate/route';
import * as workInProgressVideo from '../imported/app/api/work-in-progress-video/route';
import * as ownerFeedback from '../imported/app/api/owner-feedback/route';
import * as dataCenter from '../imported/app/api/data-center/route';
import * as dataCollections from '../imported/app/api/data-collections/route';
import * as dataEvidence from '../imported/app/api/data-evidence/route';
import * as disposition from '../imported/app/api/disposition/route';
import * as executor from '../imported/app/api/executor/route';
import * as favorites from '../imported/app/api/favorites/route';
import * as ingest from '../imported/app/api/ingest/route';
import * as library from '../imported/app/api/library/route';
import * as maintenance from '../imported/app/api/maintenance/route';
import * as mediaPlan from '../imported/app/api/media-plan/route';
import * as originals from '../imported/app/api/originals/route';
import * as pendingRevision from '../imported/app/api/pending-revision/route';
import * as privateReview from '../imported/app/api/private-review/route';
import * as productionIntake from '../imported/app/api/production-intake/route';
import * as production from '../imported/app/api/production/route';
import * as promoDelivery from '../imported/app/api/promo-delivery/route';
import * as promotion from '../imported/app/api/promotion/route';
import * as publications from '../imported/app/api/publications/route';
import * as publicityAssets from '../imported/app/api/publicity-assets/route';
import * as publishingCopy from '../imported/app/api/publishing-copy/route';
import * as publishingServiceMedia from '../imported/app/api/publishing-service/media/route';
import * as publishingService from '../imported/app/api/publishing-service/route';
import * as publishing from '../imported/app/api/publishing/route';
import * as refresh from '../imported/app/api/refresh/route';
import * as research from '../imported/app/api/research/route';
import * as series from '../imported/app/api/series/route';
import * as siteArchive from '../imported/app/api/site-archive/route';
import * as status from '../imported/app/api/status/route';
import * as technicalPreview from '../imported/app/api/technical-preview/route';
import * as voiceReplacement from '../imported/app/api/voice-replacement/route';
import * as mcp from '../imported/app/mcp/route';

const routes: Record<string, any> = {
  'cover-candidate': coverCandidate, 'work-in-progress-video': workInProgressVideo,
  'owner-feedback': ownerFeedback,
  'audio-intake': audioIntake, catalog, 'data-center': dataCenter,
  'data-collections': dataCollections, 'data-evidence': dataEvidence, disposition,
  executor, favorites, ingest, library, maintenance, 'media-plan': mediaPlan, originals,
  'pending-revision': pendingRevision, 'private-review': privateReview,
  'production-intake': productionIntake, production, 'promo-delivery': promoDelivery,
  promotion, publications, 'publicity-assets': publicityAssets,
  'publishing-copy': publishingCopy, 'publishing-service/media': publishingServiceMedia,
  'publishing-service': publishingService, publishing, refresh, research, series,
  'site-archive': siteArchive, status, 'technical-preview': technicalPreview,
  'voice-replacement': voiceReplacement,
};
export const importedRouter = Router();
let queue: Promise<void> = Promise.resolve();
export function serializeStudioRequest<T>(callback: () => Promise<T>): Promise<T> {
  const result = queue.then(callback);
  queue = result.then(() => {}, () => {});
  return result;
}

async function dispatch(module: any, req: any, res: any) {
  const handler = module[req.method] ?? (req.method === 'HEAD' ? module.GET : null);
  if (!handler) { res.status(405).set('Allow', Object.keys(module).filter(k => /^[A-Z]+$/.test(k)).join(', ')).end(); return; }
  try {
    await serializeStudioRequest(async () => {
      const proto = req.get('x-forwarded-proto') || 'https';
      const host = req.get('x-forwarded-host') || req.get('host');
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase().startsWith('oai-authenticated-')) continue;
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : String(value));
      }
      const url = `${proto}://${host}${req.originalUrl}`;
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body ?? {});
      const request = new Request(url, { method: req.method, headers, body });
      const response: Response = await requestIdentity.run(authenticatedUser(req), () => handler(request));
      await persistStudioDatabase();
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (req.method === 'HEAD' || !response.body) return res.end();
      for await (const chunk of Readable.fromWeb(response.body as any)) {
        if (!res.write(chunk)) await once(res, 'drain');
      }
      await persistStudioDatabase();
      res.end();
    });
  } catch (error) {
    req.log.error({ errorName: error instanceof Error ? error.name : 'Error' }, 'Studio request failed');
    if (!res.headersSent) res.status(503).json({ error: '工作台暂时不可用，请稍后重试。' });
  }
}
for (const [name, module] of Object.entries(routes)) {
  importedRouter.all(`/api/${name}`, (req, res) => dispatch(module, req, res));
}
// Keep the original MCP path, but never expose the former host's identity headers.
importedRouter.all('/mcp', (req, res) => dispatch(mcp, req, res));
