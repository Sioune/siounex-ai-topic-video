import { Router } from 'express';
import { ProductionError } from '../imported/lib/production-contract';
import { readBrowserPublishingWork } from '../imported/lib/publishing-browser';
import { publishingServiceOwner } from '../imported/lib/publishing-controller';
import { readServicePublishingPackage } from '../imported/lib/publishing-service-read';

const router = Router();
const PAGE_SIZE = 25;

function encodeCursor(id: string) {
  return Buffer.from(JSON.stringify({ v: 1, id })).toString('base64url');
}

function decodeCursor(value: string | undefined) {
  if (!value) return null;
  if (value.length > 256) throw new ProductionError('分页游标无效', 400);
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (parsed?.v !== 1 || typeof parsed.id !== 'string' || !/^pbw_[a-f0-9]{64}$/.test(parsed.id)) {
      throw new Error('invalid cursor');
    }
    return parsed.id as string;
  } catch {
    throw new ProductionError('分页游标无效', 400);
  }
}

function routeError(error: unknown, res: import('express').Response) {
  if (error instanceof ProductionError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(503).json({ error: 'publishing_service_unavailable' });
}

async function readOwnerId(): Promise<string> {
  const owner = await publishingServiceOwner();
  if (typeof owner !== 'string' || owner.length === 0) throw new ProductionError('需唯一有效站主身份', 403);
  return owner;
}

router.get('/', (_req, res) => {
  res.json({
    schema: 'replit-publishing-bridge-v1',
    mode: 'read_only',
    publish_allowed: false,
    implemented: ['GET /api/v1/publishing/tasks', 'GET /api/v1/publishing/tasks/{id}/package'],
    enabled_writes: [],
  });
});

router.get('/tasks', async (req, res) => {
  try {
    if (Object.keys(req.query).some(key => !['state', 'cursor'].includes(key)) ||
        (req.query.cursor !== undefined && typeof req.query.cursor !== 'string')) {
      throw new ProductionError('只支持 state 和 cursor 查询参数', 400);
    }
    if (req.query.state && req.query.state !== 'ready') throw new ProductionError('只支持 state=ready', 400);
    const afterId = decodeCursor(typeof req.query.cursor === 'string' ? req.query.cursor : undefined);
    const owner = await readOwnerId();
    const { work, accounts } = await readBrowserPublishingWork(owner);
    const accountByPlatform = new Map(accounts.map(account => [account.platform, account]));
    const ready = work
      .filter(item => {
        const input = item.input as Record<string, any>;
        const account = accountByPlatform.get(item.platform);
        return item.kind === 'publish' && item.state === 'queued' &&
          account?.connected === true && account.can_publish === true &&
          account.account_id === input.account_id;
      })
      .map(item => {
        const input = item.input as Record<string, any>;
        return {
          task_id: item.id,
          job_id: input.job_id,
          platform: item.platform,
          state: 'ready' as const,
          created_at: item.created_at,
          title: input.title,
          release_package_id: input.release_id,
          slot_id: input.slot_id,
          video_sha256: input.binding?.video_sha256,
        };
      })
      .filter(item => afterId === null || item.task_id > afterId)
      .sort((a, b) => a.task_id.localeCompare(b.task_id));
    const page = ready.slice(0, PAGE_SIZE);
    res.json({
      schema: 'replit-publishing-task-list-v1',
      mode: 'read_only',
      publish_allowed: false,
      authorization_recheck_required: true,
      source_window_limit: 200,
      tasks: page,
      next_cursor: ready.length > PAGE_SIZE ? encodeCursor(page[page.length - 1].task_id) : null,
    });
  } catch (error) {
    routeError(error, res);
  }
});

router.get('/tasks/:id/package', async (req, res) => {
  try {
    const owner = await readOwnerId();
    const id = req.params.id;
    if (typeof id !== 'string') throw new ProductionError('发布任务编号无效', 400);
    const result = await readServicePublishingPackage(owner, id);
    res.json({ schema: 'replit-publishing-task-package-v1', ...result });
  } catch (error) {
    routeError(error, res);
  }
});

router.all(/.*/, (_req, res) => {
  res.setHeader('Allow', 'GET, HEAD');
  res.status(405).json({ error: 'publishing_bridge_read_only' });
});

export default router;
