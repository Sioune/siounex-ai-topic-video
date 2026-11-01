import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const MIN_TOKEN_LENGTH = 32;
const MAX_TOKEN_LENGTH = 512;

export function verifyServiceBearer(authorization: string | undefined, configuredToken: string | undefined): boolean {
  if (!configuredToken || configuredToken.length < MIN_TOKEN_LENGTH || configuredToken.length > MAX_TOKEN_LENGTH ||
      !/^[\x21-\x7e]+$/.test(configuredToken)) return false;
  const match = /^Bearer ([\x21-\x7e]+)$/i.exec(authorization ?? '');
  if (!match || match[1].length < MIN_TOKEN_LENGTH || match[1].length > MAX_TOKEN_LENGTH) return false;

  const expected = createHash('sha256').update(configuredToken).digest();
  const presented = createHash('sha256').update(match[1]).digest();
  return timingSafeEqual(expected, presented);
}

export const publishingServiceAuth: RequestHandler = (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.get('origin') || req.get('sec-fetch-site')) {
    res.status(403).json({ error: 'browser_requests_not_allowed' });
    return;
  }
  if (!req.secure) {
    res.status(403).json({ error: 'https_required' });
    return;
  }

  const configuredToken = process.env.SERVICE_TOKEN;
  if (!configuredToken || configuredToken.length < MIN_TOKEN_LENGTH || configuredToken.length > MAX_TOKEN_LENGTH) {
    res.status(503).json({ error: 'publishing_service_not_configured' });
    return;
  }
  if (!verifyServiceBearer(req.get('authorization'), configuredToken)) {
    res.status(401).json({ error: 'invalid_service_token' });
    return;
  }
  next();
};
