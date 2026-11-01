import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';

const fixtureSetup = `
  globalThis.__publishingV1Handlers = {};
  globalThis.__publishingV1Fixtures = { work: [], accounts: [] };
`;
const { outputFiles } = await build({
  stdin: {
    contents: `import router from './src/routes/publishing-v1'; export default router;`,
    resolveDir: path.resolve(import.meta.dirname, '..'),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'publishing-v1-fixtures',
    setup(build) {
      build.onResolve({ filter: /^express$/ }, () => ({ path: 'express', namespace: 'fixture' }));
      build.onResolve({ filter: /publishing-browser$/ }, () => ({ path: 'browser', namespace: 'fixture' }));
      build.onResolve({ filter: /publishing-controller$/ }, () => ({ path: 'controller', namespace: 'fixture' }));
      build.onResolve({ filter: /publishing-service-read$/ }, () => ({ path: 'service-read', namespace: 'fixture' }));
      build.onResolve({ filter: /production-contract$/ }, () => ({ path: 'contract', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({
        contents: name === 'express'
          ? `export function Router(){return {get(path,handler){globalThis.__publishingV1Handlers['GET '+path]=handler},all(_path,handler){globalThis.__publishingV1Handlers.all=handler}}}`
          : name === 'browser'
          ? `export async function readBrowserPublishingWork(owner){globalThis.__publishingV1Owner=owner;return globalThis.__publishingV1Fixtures}`
          : name === 'controller'
            ? `export async function publishingServiceOwner(){return 'legacy-owner'}`
            : name === 'service-read'
              ? `export async function readServicePublishingPackage(owner,id){globalThis.__publishingV1PackageRequest={owner,id};return {task_id:id,materials:{schema:'approved-publishing-materials-v2'}}}`
              : `export class ProductionError extends Error{constructor(message,status){super(message);this.status=status}}`,
      }));
    },
  }],
});
await import(`data:text/javascript;base64,${Buffer.from(fixtureSetup + outputFiles[0].text).toString('base64')}`);
const handlers = globalThis.__publishingV1Handlers;
const makeResponse = () => ({
  code: 200,
  body: null,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
  setHeader() {},
});

test('read-only task list returns only connected, queued publish summaries and paginates', async () => {
  const prefix = 'pbw_';
  const id = n => prefix + n.toString(16).padStart(64, '0');
  globalThis.__publishingV1Fixtures = {
    work: Array.from({ length: 26 }, (_, index) => ({
      id: id(index + 1), kind: 'publish', state: 'queued', platform: 'douyin',
      created_at: '2026-11-02T00:00:00.000Z',
      input: {
        job_id: `job-${index + 1}`, account_id: 'acct-1', title: `Approved ${index + 1}`,
        release_id: `release-${index + 1}`, slot_id: `slot-${index + 1}`,
        binding: { video_sha256: 'a'.repeat(64) }, owner_id: 'must-not-leak',
        private_note: 'must-not-leak',
      },
    })).concat([
      { id: id(27), kind: 'collect', state: 'queued', platform: 'douyin', input: { account_id: 'acct-1' } },
      { id: id(28), kind: 'publish', state: 'claimed', platform: 'douyin', input: { account_id: 'acct-1' } },
      { id: id(29), kind: 'publish', state: 'queued', platform: 'bilibili', input: { account_id: 'acct-2' } },
    ]),
    accounts: [
      { platform: 'douyin', connected: true, can_publish: true, account_id: 'acct-1' },
      { platform: 'bilibili', connected: false, can_publish: false, account_id: null },
    ],
  };
  const firstResponse = makeResponse();
  await handlers['GET /tasks']({ query: { state: 'ready' } }, firstResponse);
  assert.equal(firstResponse.code, 200);
  assert.equal(firstResponse.body.tasks.length, 25);
  assert.equal(firstResponse.body.tasks[0].job_id, 'job-1');
  assert.equal(firstResponse.body.tasks[0].video_sha256, 'a'.repeat(64));
  assert.equal(JSON.stringify(firstResponse.body).includes('must-not-leak'), false);
  assert.equal(globalThis.__publishingV1Owner, 'legacy-owner');
  assert.equal(typeof firstResponse.body.next_cursor, 'string');

  const secondResponse = makeResponse();
  await handlers['GET /tasks']({ query: { state: 'ready', cursor: firstResponse.body.next_cursor } }, secondResponse);
  assert.equal(secondResponse.body.tasks.length, 1);
  assert.equal(secondResponse.body.tasks[0].job_id, 'job-26');
  assert.equal(secondResponse.body.next_cursor, null);
});

test('package endpoint binds to derived owner; all non-GET actions are rejected', async () => {
  const capability = makeResponse();
  await handlers['GET /']({}, capability);
  assert.equal(capability.body.mode, 'read_only');
  assert.equal(capability.body.publish_allowed, false);
  assert.deepEqual(capability.body.enabled_writes, []);

  const response = makeResponse();
  await handlers['GET /tasks/:id/package']({ params: { id: 'pbw_' + 'a'.repeat(64) } }, response);
  assert.equal(response.code, 200);
  assert.deepEqual(globalThis.__publishingV1PackageRequest, { owner: 'legacy-owner', id: 'pbw_' + 'a'.repeat(64) });

  const denied = makeResponse();
  await handlers.all({ method: 'POST' }, denied);
  assert.equal(denied.code, 405);
  assert.equal(denied.body.error, 'publishing_bridge_read_only');
});
