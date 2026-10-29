import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('task grants issue, authenticate, rotate and revoke without access to other jobs', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'codex-bridge-test-'));
  try {
    const outfile = path.join(dir, 'bridge.mjs');
    await build({
      stdin: {
        contents: `export * from './src/lib/codex-executor-bridge.ts'; export { sql } from 'bridge-test-db';`,
        resolveDir: path.resolve(import.meta.dirname, '..'),
      },
      bundle: true, platform: 'node', format: 'esm', outfile,
      define: {
        'process.env.STUDIO_OWNER_ID': JSON.stringify('owner_bridge_test'),
        'process.env.REPLIT_DEV_DOMAIN': JSON.stringify('bridge-test.replit.dev'),
        'process.env.REPLIT_DOMAINS': JSON.stringify(''),
      },
      plugins: [{
        name: 'isolated-bridge-fixtures',
        setup(build) {
          build.onResolve({ filter: /^bridge-test-db$|\/imported\/lib\/store$|\/studio-database$|\/studio-auth$/ }, ({ path: name }) => ({
            path: name.endsWith('/studio-auth') ? 'auth' : name.endsWith('/studio-database') ? 'persist' : 'db',
            namespace: 'bridge-test',
          }));
          build.onLoad({ filter: /.*/, namespace: 'bridge-test' }, ({ path: name }) => ({
            loader: 'js',
            contents: name === 'auth' ? `
              import { AsyncLocalStorage } from 'node:async_hooks';
              export const requestIdentity = new AsyncLocalStorage();
              export const authenticatedUser = req => req.ownerId ? {userId:req.ownerId} : null;
            ` : name === 'persist' ? `export async function persistStudioDatabase() {}` : `
              import { DatabaseSync } from 'node:sqlite';
              export const sql = new DatabaseSync(':memory:');
              sql.exec("CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE production_jobs(id TEXT PRIMARY KEY,owner_id TEXT,is_test INTEGER,status TEXT,source_snapshot TEXT)");
              const adapter = {
                prepare(query) {
                  let values = [];
                  return {
                    bind(...args) { values = args; return this; },
                    async first() { return sql.prepare(query).get(...values) || null; },
                    async all() { return {results:sql.prepare(query).all(...values)}; },
                    run() { return sql.prepare(query).run(...values); },
                  };
                },
                async batch(statements) {
                  sql.exec('BEGIN');
                  try { for (const statement of statements) statement.run(); sql.exec('COMMIT'); }
                  catch (error) { sql.exec('ROLLBACK'); throw error; }
                },
              };
              export const db = () => adapter;
            `,
          }));
        },
      }],
    });
    const bridge = await import(pathToFileURL(outfile).href);
    const host = 'bridge-test.replit.dev';
    const origin = `https://${host}`;
    bridge.sql.prepare('INSERT INTO production_jobs VALUES (?,?,?,?,?)').run(
      'job_local', 'owner_bridge_test', 0, 'waiting_executor', JSON.stringify({ url: 'https://source.example/article' }));
    const request = (body, extra = {}) => ({
      protocol: 'https', ownerId: 'owner_bridge_test', body: Buffer.from(JSON.stringify(body)),
      get(name) { return ({ host, origin, ...extra })[name.toLowerCase()]; },
    });
    async function invoke(handler, req) {
      return new Promise((resolve, reject) => {
        const result = { status: 200 };
        const res = {
          status(value) { result.status = value; return this; },
          set() { return this; },
          json(body) { resolve({ ...result, body }); return this; },
          end() { resolve(result); return this; },
        };
        const next = error => error ? reject(error) : resolve({ ...result, next: true });
        Promise.resolve(handler(req, res, next)).catch(reject);
      });
    }
    const issue = () => invoke(bridge.issueCodexExecutorGrant, request({ job_id: 'job_local' }));
    assert.equal((await invoke(bridge.issueCodexExecutorGrant, request({ job_id: 'job_local' }, { origin: 'https://evil.example' }))).status, 403);
    const first = await issue();
    assert.equal(first.status, 201);
    assert.ok(first.body.token.startsWith('cxbr1.'));
    const stored = bridge.sql.prepare('SELECT value FROM app_state').get().value;
    assert.ok(!stored.includes(first.body.token), 'Plaintext credential must never be persisted');
    assert.ok(!stored.includes(first.body.token.split('.')[2]), 'The secret itself must not be persisted either');
    const execute = (token, body, extra = {}) => invoke(bridge.codexExecutorBridgeMiddleware,
      request(body, { authorization: `Bearer ${token}`, ...extra }));
    assert.equal((await execute(first.body.token, { action: 'read', id: 'job_local' })).next, true);
    assert.equal((await execute(first.body.token, { action: 'read', id: 'job_other' })).status, 401);
    assert.equal((await execute(first.body.token, { action: 'dispatch_next', id: 'job_local' })).status, 401);
    assert.equal((await execute(first.body.token, { action: 'read', id: 'job_local' }, { host: 'wrong.replit.dev' })).status, 401);
    assert.equal((await execute(first.body.token + 'wrong', { action: 'read', id: 'job_local' })).status, 401);
    const second = await issue();
    assert.equal(second.status, 201);
    assert.equal((await execute(first.body.token, { action: 'read', id: 'job_local' })).status, 401);
    assert.equal((await execute(second.body.token, { action: 'read', id: 'job_local' })).next, true);
    assert.equal((await invoke(bridge.revokeCodexExecutorGrant, request({ grant_id: second.body.grant_id }))).status, 204);
    assert.equal((await execute(second.body.token, { action: 'read', id: 'job_local' })).status, 401);
    const concurrent = await Promise.all([issue(), issue()]);
    assert.ok(concurrent.every(result => result.status === 201));
    assert.equal(bridge.sql.prepare('SELECT count(*) AS count FROM app_state').get().count, 1);
    const outcomes = await Promise.all(concurrent.map(result => execute(result.body.token, { action: 'read', id: 'job_local' })));
    assert.equal(outcomes.filter(result => result.next).length, 1, 'Concurrent issuance must leave only the latest credential valid');
    bridge.sql.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
