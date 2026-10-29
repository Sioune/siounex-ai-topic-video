import test from 'node:test';
import assert from 'node:assert/strict';
import { isCodexBridgeRequestAllowed } from '../src/lib/codex-bridge-policy.mjs';

const grant = { job_id: 'job_123', expires_at: 5000 };
test('Codex bridge grants are limited to one unexpired production job', () => {
  for (const action of [
    { action: 'read', id: 'job_123' },
    { action: 'claim', id: 'job_123', executor: 'codex-local' },
    { action: 'heartbeat', id: 'job_123', lease_token: 'lease' },
    { action: 'checkpoint', id: 'job_123', lease_token: 'lease', checkpoint_version: 1, checkpoint: {} },
    { action: 'submit', id: 'job_123', lease_token: 'lease', base_revision: 1, submission_id: 'request-1', draft: {} },
    { action: 'fail', id: 'job_123', lease_token: 'lease', error: 'bounded failure' },
  ]) assert.equal(isCodexBridgeRequestAllowed(grant, action, 4999), true);
  assert.equal(isCodexBridgeRequestAllowed(grant, { action: 'read', id: 'job_other' }, 4999), false);
  assert.equal(isCodexBridgeRequestAllowed(grant, { action: 'dispatch_next', id: 'job_123' }, 4999), false);
  assert.equal(isCodexBridgeRequestAllowed(grant, { action: 'test_create', id: 'job_123' }, 4999), false);
  assert.equal(isCodexBridgeRequestAllowed(grant, { action: 'submit', id: 'job_123', lease_token: 'lease', base_revision: 1, submission_id: 'request-1', draft: {}, owner_id: 'forged' }, 4999), false);
  assert.equal(isCodexBridgeRequestAllowed(grant, { action: 'submit', id: 'job_123', lease_token: 'lease', base_revision: 1, submission_id: 'request-1', draft: {} }, 5000), false);
  assert.equal(isCodexBridgeRequestAllowed({ ...grant, revoked: true }, { action: 'read', id: 'job_123' }, 1), false);
});
