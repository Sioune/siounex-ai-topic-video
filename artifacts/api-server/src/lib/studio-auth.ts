import { AsyncLocalStorage } from 'node:async_hooks';
import { getAuth } from '@clerk/express';
import { Router, type Request, type RequestHandler } from 'express';
import { resolveStudioOwner } from './studio-owner';

export const requestIdentity = new AsyncLocalStorage<any>();
export const authRouter = Router();

// Clerk verifies identity; the curated owner gate still controls all private work.
// No JIT user creation: the original app never enrolled arbitrary visitors.
export function authenticatedUser(req: Request) {
  const executorIdentity = requestIdentity.getStore();
  if (executorIdentity?.kind === 'codex-executor' && typeof executorIdentity.userId === 'string') {
    return { userId: executorIdentity.userId, displayName: '本地 Codex 执行器', email: '', fullName: null };
  }
  const auth = getAuth(req);
  if (!auth.userId) return null;
  return resolveStudioOwner(auth.sessionClaims, process.env.STUDIO_OWNER_ID);
}

export const requireStudioOwner: RequestHandler = (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  if (requestIdentity.getStore()?.kind === 'codex-executor') {
    next();
    return;
  }
  if (!getAuth(req).userId) {
    res.status(401).json({ error: '请登录后使用私人工作台。' });
    return;
  }
  if (!authenticatedUser(req)) {
    res.status(403).json({ error: '此账号没有站主权限。请联系站主完成安全配置。' });
    return;
  }
  next();
};

// Application authorization, not a replacement identity/session endpoint.
authRouter.get('/studio/access', requireStudioOwner, (req, res) => {
  res.json({ user: authenticatedUser(req), role: 'owner' });
});
