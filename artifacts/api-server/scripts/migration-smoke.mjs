import assert from 'node:assert/strict';

// Live, non-mutating boundary checks. Authenticated reads are exercised by the
// programmatic Clerk browser test, never by inserting legacy SQLite sessions.
if (process.env.NODE_ENV === 'production') throw new Error('Development smoke test only');
const origin = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:80';
for (const route of ['/api/library', '/api/data-center', '/api/production', '/api/publishing-service', '/api/studio/access', '/mcp']) {
  for (const headers of [
    {},
    { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.invalid' },
    { Cookie: 'studio_session=obsolete-opaque-session' },
    { Authorization: 'Bearer forged-session' },
  ]) {
    const response = await fetch(origin + route, { headers, redirect: 'manual' });
    assert.equal(response.status, 401, `${route} must deny unverified identity`);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  console.log(`${route}: unverified identities denied`);
}
const health = await fetch(origin + '/api/healthz');
assert.equal(health.status, 200);
console.log('Clerk boundary smoke: PASS');
