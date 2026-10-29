import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import * as oidc from 'openid-client';
import { sessionGet, sessionSet, sessionDelete, persistStudioDatabase } from './studio-database';
import { isStudioOwner } from './studio-owner';

export const requestIdentity = new AsyncLocalStorage<any>();
export const authRouter = Router();
const cookie = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
let config: Promise<oidc.Configuration>;
const configuration = () => config ??= oidc.discovery(new URL('https://replit.com/oidc'), process.env.REPL_ID!);
const origin = (req: any) => `${req.get('x-forwarded-proto') || 'https'}://${req.get('x-forwarded-host') || req.get('host')}`;
const safePath = (value: any) => typeof value === 'string' && /^\/(?!\/)/.test(value) && !value.includes('\\') ? value : '/';
export function authenticatedUser(req: any) {
  const session = sessionGet(req.cookies?.studio_session ?? '');
  return session?.kind === 'user' ? session.user : null;
}

authRouter.get('/auth/user', (req, res) => res.set('Cache-Control', 'private, no-store').json({ user: authenticatedUser(req) }));
authRouter.get('/login', async (req, res) => {
  try {
    const cfg = await configuration();
    const verifier = oidc.randomPKCECodeVerifier(), state = oidc.randomState(), nonce = oidc.randomNonce();
    const pending = randomBytes(32).toString('hex');
    sessionSet(pending, { kind: 'oidc', verifier, state, nonce, returnTo: safePath(req.query.returnTo) }, 600000);
    await persistStudioDatabase();
    res.cookie('studio_oidc', pending, { ...cookie, maxAge: 600000 });
    res.redirect(oidc.buildAuthorizationUrl(cfg, { redirect_uri: origin(req) + '/api/callback', scope: 'openid email profile', code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', state, nonce }).href);
  } catch { req.log.warn('OIDC login unavailable'); res.status(503).send('登录服务暂时不可用，请稍后重试。'); }
});
authRouter.get('/callback', async (req, res) => {
  try {
    const pending = sessionGet(req.cookies?.studio_oidc ?? '');
    if (pending?.kind !== 'oidc') return res.status(400).send('登录请求已过期，请重新登录。');
    const tokens = await oidc.authorizationCodeGrant(await configuration(), new URL(req.originalUrl, origin(req)), { pkceCodeVerifier: pending.verifier, expectedState: pending.state, expectedNonce: pending.nonce });
    const claims = tokens.claims()!;
    const ownerId = process.env.STUDIO_OWNER_ID || process.env.REPL_OWNER_ID;
    const username = claims.preferred_username || claims.username || claims.name;
    // Fail closed: never give the first visitor ownership of a private import.
    if (!isStudioOwner(claims, ownerId)) {
      return res.status(403).send('此工作台仅限所有者使用。请在 Secrets 中配置 STUDIO_OWNER_ID 为所有者的 Replit 用户 ID，然后重新登录。');
    }
    const sid = randomBytes(32).toString('hex');
    const user = { userId: claims.sub, displayName: username || claims.first_name || '所有者', email: claims.email || '', fullName: claims.name || null };
    sessionDelete(req.cookies.studio_oidc);
    sessionSet(sid, { kind: 'user', user }, 7 * 86400000);
    await persistStudioDatabase();
    res.clearCookie('studio_oidc', cookie);
    res.cookie('studio_session', sid, { ...cookie, maxAge: 7 * 86400000 });
    return res.redirect(safePath(pending.returnTo));
  } catch { req.log.warn('OIDC callback rejected'); return res.status(400).send('登录验证未完成，请重新登录。'); }
});
authRouter.get('/logout', async (req, res) => {
  sessionDelete(req.cookies?.studio_session ?? '');
  await persistStudioDatabase();
  res.clearCookie('studio_session', cookie);
  res.redirect('/');
});
