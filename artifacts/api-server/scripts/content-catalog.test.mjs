import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const express = require('express');

test('public display and private result import preserve isolation, revisions and approval', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'display-catalog-'));
  let server;
  try {
    const outfile = path.join(dir, 'content.mjs');
    await build({
      stdin: {
        contents: "export * from './src/routes/content.ts'; export {sql} from 'content-test-db';",
        resolveDir: path.resolve(import.meta.dirname, '..'),
      },
      bundle: true, platform: 'node', format: 'esm', outfile,
      // Express is provided to the outer app, not bundled into the test module.
      external: ['express'],
      define: { 'process.env.STUDIO_OWNER_ID': JSON.stringify('test-owner') },
      plugins: [{
        name: 'isolated-content-fixtures',
        setup(b) {
          b.onResolve({ filter: /^express$/ }, () => ({ path: require.resolve('express'), external: true }));
          b.onResolve({ filter: /^content-test-db$|\/studio-database$|\/studio-auth$|\/studio-queue$|\/imported\/lib\/store$/ }, ({ path: name }) => ({
            path: name.endsWith('studio-auth') ? 'auth' :
              name.endsWith('studio-queue') ? 'queue' : name.endsWith('/store') ? 'feed' : 'db',
            namespace: 'content-test',
          }));
          b.onLoad({ filter: /.*/, namespace: 'content-test' }, ({ path: name }) => ({
            loader: 'js',
            contents: name === 'auth' ? `
              export const authenticatedUser = req => req.get('x-test-owner') === 'yes' ? {userId:'test-owner'} : null;
              export const requireStudioOwner = (req,res,next) => authenticatedUser(req) ? next() : res.status(401).json({error:'Denied'});
            ` : name === 'queue' ? `
              let queue=Promise.resolve();
              export const serializeStudioRequest = callback => {const r=queue.then(callback);queue=r.catch(()=>{});return r;};
            ` : name === 'feed' ? 'export async function refreshFeeds() {}' : `
              import {DatabaseSync} from 'node:sqlite';
              export const sql=new DatabaseSync(':memory:');
              sql.exec("CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE topics(id TEXT,title TEXT,summary TEXT,url TEXT,source TEXT,source_id TEXT,category TEXT,published_at TEXT,private_note TEXT); CREATE TABLE source_status(id TEXT,last_attempt TEXT,last_success TEXT,state TEXT,message TEXT); CREATE TABLE production_jobs(owner_id TEXT)");
              export const studioDatabase={prepare(query){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){return sql.prepare(query).run(...values)}}}};
              export async function persistStudioDatabase(){}
            `,
          }));
        },
      }],
    });
    const mod = await import(pathToFileURL(outfile).href);
    mod.sql.prepare('INSERT INTO topics VALUES(?,?,?,?,?,?,?,?,?)').run('topic_public','公开选题','摘要','https://example.com/news','量子位','qbitai-zh','行业动态','2026-10-30','do-not-leak');
    mod.sql.prepare('INSERT INTO topics VALUES(?,?,?,?,?,?,?,?,?)').run('topic_private','内部材料','秘密','https://example.com/private','私人','private-manual','内部','2026-10-30','private');
    const app = express();
    app.use(express.raw({ type: () => true }));
    app.use((req, _res, next) => { req.log = { error() {} }; next(); });
    app.use('/api', mod.publicContentRouter, mod.adminContentRouter);
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (route, method = 'GET', body, extra = {}) => {
      const response = await fetch(base + '/api' + route, {
        method, headers: { 'Content-Type': 'application/json', Origin: base, ...extra },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, data: response.status === 204 ? null : await response.json() };
    };
    const admin = { 'x-test-owner': 'yes' };
    const topics = await call('/public/topics');
    assert.equal(topics.status, 200);
    assert.equal(topics.data.total, 1);
    assert.ok(!JSON.stringify(topics.data).includes('private'));
    assert.equal((await call('/admin/content')).status, 401);
    assert.equal((await call('/admin/sync-key', 'POST', {}, { ...admin, Origin: 'https://evil.example' })).status, 403);
    const issued = await call('/admin/sync-key', 'POST', {}, admin);
    assert.equal(issued.status, 201);
    const importAuth = { Authorization: `Bearer ${issued.data.token}` };
    const input = { external_id: 'external-one', revision: 1, kind: 'article', title: '外部成果', summary: '真实摘要', body: '正文', source_url: 'https://example.com/source', content_url: '', cover_url: '' };
    assert.equal((await call('/sync/results', 'POST', input)).status, 401);
    const imported = await call('/sync/results', 'POST', input, importAuth);
    assert.equal(imported.status, 200);
    assert.equal(imported.data.visible, false);
    const id = imported.data.id;
    assert.equal((await call('/public/results')).data.length, 0);
    assert.equal((await call(`/public/results/${id}`)).status, 404);
    assert.equal((await call('/sync/results', 'POST', { ...input, visible: true }, importAuth)).status, 400);
    assert.equal((await call(`/admin/results/${id}/visibility`, 'POST', { visible: true, revision: 1 }, importAuth)).status, 401);
    assert.equal((await call(`/admin/results/${id}/visibility`, 'POST', { visible: true, revision: 1 }, admin)).status, 200);
    const visible = await call(`/public/results/${id}`);
    assert.equal(visible.status, 200);
    assert.ok(!('owner_id' in visible.data) && !('payload_hash' in visible.data));
    assert.equal((await call('/sync/results', 'POST', input, importAuth)).data.visible, true, 'Exact retries must not change visibility');
    assert.equal((await call('/sync/results', 'POST', { ...input, title: '同版篡改' }, importAuth)).status, 409);
    assert.equal((await call('/sync/results', 'POST', { ...input, source_url: 'javascript:alert(1)' }, importAuth)).status, 400);
    assert.equal((await call('/sync/results', 'POST', { ...input, source_url: 'https://example.com/?token=secret' }, importAuth)).status, 400);
    assert.equal((await call('/sync/results', 'POST', { ...input, revision: 2, body: '第二版' }, importAuth)).data.visible, false);
    assert.equal((await call(`/public/results/${id}`)).status, 404, 'New content must be reviewed again');
    assert.equal((await call(`/admin/results/${id}/visibility`, 'POST', { visible: true, revision: 1 }, admin)).status, 409);
    const rotated = await call('/admin/sync-key', 'POST', {}, admin);
    assert.equal((await call('/sync/results', 'POST', input, importAuth)).status, 401);
    assert.equal((await call('/admin/sync-key', 'DELETE', undefined, admin)).status, 204);
    assert.equal((await call('/sync/results', 'POST', input, { Authorization: `Bearer ${rotated.data.token}` })).status, 401);
    assert.equal((await call(`/admin/results/${id}`, 'DELETE', undefined, admin)).status, 204);
    assert.equal((await call('/admin/content', 'GET', undefined, admin)).data.results.length, 0);
    assert.equal(mod.sql.prepare('SELECT count(*) AS n FROM topics').get().n, 2, 'Existing source data must be preserved');
    mod.sql.close();
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
