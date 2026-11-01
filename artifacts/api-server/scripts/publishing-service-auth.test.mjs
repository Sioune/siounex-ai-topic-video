import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';

const syntheticToken = 'test-only-service-token_0123456789abcdef0123456789';
const { outputFiles } = await build({
  stdin: {
    contents: `export {verifyServiceBearer,publishingServiceAuth} from './src/lib/publishing-service-auth.ts';`,
    resolveDir: path.resolve(import.meta.dirname, '..'),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  define: { 'process.env.SERVICE_TOKEN': JSON.stringify(syntheticToken) },
});
const { verifyServiceBearer, publishingServiceAuth } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

test('publishing service bearer requires a configured, sufficiently long exact token', () => {
  const secret = 'test-only-service-token_0123456789abcdef0123456789';
  assert.equal(verifyServiceBearer(`Bearer ${secret}`, secret), true);
  assert.equal(verifyServiceBearer(`bearer ${secret}`, secret), true);
  assert.equal(verifyServiceBearer(`Bearer ${secret}x`, secret), false);
  assert.equal(verifyServiceBearer(`Bearer ${secret.slice(1)}`, secret), false);
  assert.equal(verifyServiceBearer(secret, secret), false);
  assert.equal(verifyServiceBearer(`Bearer ${'x'.repeat(31)}`, 'x'.repeat(31)), false);
  assert.equal(verifyServiceBearer(`Bearer ${secret}`, undefined), false);
});

test('service middleware accepts only TLS machine requests and never treats browser identity as service identity', () => {
  const invoke = ({ secure = true, headers = {} } = {}) => {
    let nextCalled = false;
    const res = {
      code: 200, body: null,
      setHeader() {},
      status(code) { this.code = code; return this; },
      json(value) { this.body = value; return this; },
    };
    publishingServiceAuth({ secure, get: name => headers[name.toLowerCase()] }, res, () => { nextCalled = true; });
    return { ...res, nextCalled };
  };
  const bearer = { authorization: `Bearer ${syntheticToken}` };
  assert.equal(invoke({ headers: bearer }).nextCalled, true);
  assert.equal(invoke({ headers: {} }).code, 401);
  assert.equal(invoke({ headers: { ...bearer, origin: 'https://browser.invalid' } }).code, 403);
  assert.equal(invoke({ headers: { ...bearer, 'sec-fetch-site': 'same-origin' } }).code, 403);
  assert.equal(invoke({ secure: false, headers: bearer }).code, 403);
});
