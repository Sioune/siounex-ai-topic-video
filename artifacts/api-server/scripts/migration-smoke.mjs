import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';

// Run against the managed development workflow only. This creates an ephemeral
// authenticated test session, never a production login or a bypass in app code.
if (process.env.NODE_ENV === 'production') throw new Error('Development smoke test only');
const db = new DatabaseSync(path.resolve(import.meta.dirname, '../.runtime/studio.sqlite'));
const sid = randomBytes(32).toString('hex');
const owner = 'migration-smoke-test';
const origin = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:80';
db.prepare('INSERT INTO _studio_sessions VALUES (?,?,?)').run(sid, JSON.stringify({ kind: 'user', user: { userId: owner, displayName: 'Migration test' } }), Date.now() + 600000);
const headers = { Cookie: `studio_session=${sid}`, Origin: new URL(origin).origin, 'Content-Type': 'application/json' };
async function read(route) {
  const response = await fetch(origin + '/api/' + route, { headers });
  const data = await response.json();
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(data).slice(0, 200)}`);
  console.log(`${route}: OK`);
  return data;
}
try {
  const anonymous = await fetch(origin + '/api/library');
  assert.equal(anonymous.status, 401);
  const spoofed = await fetch(origin + '/api/library', { headers: { 'oai-authenticated-user-id': owner, 'oai-authenticated-user-email': 'not-an-account' } });
  assert.equal(spoofed.status, 401);
  const mcpCall = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_due_collection_reminders', arguments: {} } };
  for (const legacy of [false, true]) {
    const response = await fetch(origin + '/mcp', { method: 'POST', headers: { ...headers, ...(legacy ? { 'oai-authenticated-user-id': 'other-owner', 'oai-authenticated-user-email': 'other-owner.invalid' } : {}) }, body: JSON.stringify(mcpCall) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).error, undefined, 'Authenticated MCP read must use the session');
  }
  const anonymousMcp = await fetch(origin + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', 'oai-authenticated-user-id': owner, 'oai-authenticated-user-email': 'spoof.invalid' }, body: JSON.stringify(mcpCall) });
  assert.equal(anonymousMcp.status, 401);
  const library = await read('library');
  assert(library.topics.length > 0, 'Original source seeds must load');
  for (const route of ['data-center', 'production', 'research', 'originals', 'publishing', 'status']) await read(route);
  const topic = library.topics[0];
  for (const saved of [true, false]) {
    const response = await fetch(origin + '/api/favorites', { method: 'POST', headers, body: JSON.stringify({ id: topic.id, saved }) });
    assert.equal(response.status, 200, await response.text());
    const reloaded = await read('library');
    assert.equal(Boolean(reloaded.topics.find(t => t.id === topic.id).favorite), saved);
  }
  const rejected = await fetch(origin + '/api/favorites', { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.invalid' }, body: JSON.stringify({ id: topic.id, saved: true }) });
  assert.equal(rejected.status, 403);
  console.log('Authentication, all main read flows, favorite persistence, CSRF: OK');
} finally {
  db.prepare('DELETE FROM favorites WHERE user_id=?').run(owner);
  await fetch(origin + '/api/logout', { headers, redirect: 'manual' });
  db.close();
}
