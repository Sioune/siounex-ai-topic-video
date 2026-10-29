import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';

const { outputFiles } = await build({
  stdin: {
    contents: `export {handleCollectionMcp} from './src/imported/lib/data-collection-mcp.mts'; export {isStudioOwner,resolveStudioOwner} from './src/lib/studio-owner.ts'; export {setUser} from './src/imported/app/chatgpt-auth';`,
    resolveDir: path.resolve(import.meta.dirname, '..'),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'isolated-session', setup(b) {
    b.onResolve({ filter: /chatgpt-auth$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'let user=null; export function setUser(value){user=value}; export async function getChatGPTUser(){return user}' }));
  } }],
});
const { handleCollectionMcp, isStudioOwner, resolveStudioOwner, setUser } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
function request(name, args = {}, spoof = false) {
  return new Request('https://studio.invalid/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(spoof ? { 'oai-authenticated-user-id': 'other-owner', 'oai-authenticated-user-email': 'other-owner.invalid' } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
}
test('Only the verified Clerk legacy userId grants owner access', () => {
  assert.equal(isStudioOwner({ userId: 'owner', sub: 'user_clerk-native' }, 'owner'), true);
  assert.equal(isStudioOwner({ userId: 'attacker', sub: 'owner', name: 'owner', username: 'owner' }, 'owner'), false);
  assert.equal(isStudioOwner({ sub: 'owner', email: 'owner' }, 'owner'), false);
  assert.equal(isStudioOwner({ userId: 'attacker' }, undefined), false);
  assert.equal(isStudioOwner(null, 'owner'), false);
});
test('Clerk bridge preserves data ownership ID and derives display fields from claims', () => {
  assert.equal(resolveStudioOwner({ userId: 'legacy-id', sub: 'user_native', firstName: 'Owner', email: 'owner@example.invalid' }, 'legacy-id').userId, 'legacy-id');
  assert.equal(resolveStudioOwner({ userId: 'attacker', sub: 'legacy-id' }, 'legacy-id'), null);
  assert.equal(resolveStudioOwner({ userId: 'owner' }, undefined), null);
});
test('MCP reads and mutations derive ownership from the session, not legacy headers', async () => {
  const calls = [];
  const deps = {
    readDue: async owner => { calls.push(['read', owner]); return { reminders: [] }; },
    markGenerated: async (owner, args) => { calls.push(['write', owner, args]); return { reminder_ids: args.reminder_ids }; },
  };
  setUser(null);
  assert.equal((await handleCollectionMcp(request('read_due_collection_reminders', {}, true), deps)).status, 401);
  assert.deepEqual(calls, []);
  setUser({ userId: 'verified-owner' });
  for (const spoof of [false, true]) {
    let response = await handleCollectionMcp(request('read_due_collection_reminders', {}, spoof), deps);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).error, undefined);
    response = await handleCollectionMcp(request('mark_collection_reminders_generated', { reminder_ids: ['one'], request_id: 'test' }, spoof), deps);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).error, undefined);
  }
  assert.equal(calls.length, 4);
  assert(calls.every(call => call[1] === 'verified-owner'));
});
