import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';

const { outputFiles } = await build({
  stdin: {
    contents: `export {readServicePublishingPackage} from './src/imported/lib/publishing-service-read';`,
    resolveDir: path.resolve(import.meta.dirname, '..'),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'service-package-fixtures',
    setup(build) {
      build.onResolve({ filter: /(^|\/)store$/ }, () => ({ path: 'store', namespace: 'fixture' }));
      build.onResolve({ filter: /publishing-browser$/ }, () => ({ path: 'browser', namespace: 'fixture' }));
      build.onResolve({ filter: /production-contract$/ }, () => ({ path: 'contract', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({
        contents: name === 'store'
          ? `export function db(){return {prepare(){return {bind(key){globalThis.__serviceReadKey=key;return {async first(){return globalThis.__serviceReadRow}}}}}}}`
          : name === 'browser'
            ? `export async function readBrowserAccounts(){return globalThis.__serviceReadAccounts} export async function readBrowserPublishingMaterials(owner,args){globalThis.__serviceReadCalls.push({owner,args});return {schema:'approved-publishing-materials-v2'}}`
            : `export class ProductionError extends Error{constructor(message,status){super(message);this.status=status}}`,
      }));
    },
  }],
});
const { readServicePublishingPackage } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

test('service package refuses another owner, stale/non-publish work, or unavailable account before reading materials', async () => {
  const id = 'pbw_' + 'a'.repeat(64);
  const work = {
    id, owner_id: 'legacy-owner', kind: 'publish', state: 'queued', platform: 'douyin',
    input: { account_id: 'account', job_id: 'job', release_id: 'release', binding: { video_sha256: 'b'.repeat(64) } },
  };
  globalThis.__serviceReadCalls = [];
  globalThis.__serviceReadAccounts = [{ platform: 'douyin', connected: true, can_publish: true, account_id: 'account' }];
  for (const change of [
    { owner_id: 'another-owner' }, { id: 'pbw_' + 'c'.repeat(64) },
    { kind: 'collect' }, { state: 'claimed' }, { state: 'uncertain' },
  ]) {
    globalThis.__serviceReadRow = { value: JSON.stringify({ ...work, ...change }) };
    await assert.rejects(readServicePublishingPackage('legacy-owner', id), error => [404, 409].includes(error.status));
  }
  globalThis.__serviceReadRow = { value: JSON.stringify(work) };
  globalThis.__serviceReadAccounts = [{ platform: 'douyin', connected: false, can_publish: false, account_id: 'account' }];
  await assert.rejects(readServicePublishingPackage('legacy-owner', id), error => error.status === 409);
  assert.equal(globalThis.__serviceReadCalls.length, 0);

  globalThis.__serviceReadAccounts = [{ platform: 'douyin', connected: true, can_publish: true, account_id: 'account' }];
  const result = await readServicePublishingPackage('legacy-owner', id);
  assert.equal(result.task_id, id);
  assert.equal(result.video_sha256, 'b'.repeat(64));
  assert.deepEqual(globalThis.__serviceReadCalls, [{ owner: 'legacy-owner', args: { work_id: id } }]);
  assert.equal(globalThis.__serviceReadKey, `publishing_browser_work_v2:${id}`);
});
