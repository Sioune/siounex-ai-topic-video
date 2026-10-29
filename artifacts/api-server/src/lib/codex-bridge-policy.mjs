const schemas = {
  read: ['action', 'id'],
  claim: ['action', 'id', 'executor'],
  heartbeat: ['action', 'id', 'lease_token'],
  checkpoint: ['action', 'id', 'lease_token', 'checkpoint_version', 'checkpoint'],
  submit: ['action', 'id', 'lease_token', 'base_revision', 'submission_id', 'draft'],
  fail: ['action', 'id', 'lease_token', 'error', 'diagnostic'],
};

export function isCodexBridgeRequestAllowed(grant, body, now = Date.now()) {
  if (!grant || grant.revoked || !Number.isSafeInteger(grant.expires_at) || grant.expires_at <= now) return false;
  if (!body || typeof body !== 'object' || Array.isArray(body) || !schemas[body.action]) return false;
  if (Object.keys(body).some(key => !schemas[body.action].includes(key))) return false;
  if (body.id !== grant.job_id) return false;
  if (typeof body.action !== 'string') return false;
  if (body.action === 'claim' && (typeof body.executor !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(body.executor))) return false;
  if (['heartbeat', 'checkpoint', 'submit', 'fail'].includes(body.action) &&
      (typeof body.lease_token !== 'string' || body.lease_token.length > 200)) return false;
  if (body.action === 'checkpoint' && (!Number.isSafeInteger(body.checkpoint_version) || body.checkpoint_version < 0)) return false;
  if (body.action === 'submit' && (!Number.isSafeInteger(body.base_revision) || body.base_revision < 0 ||
      typeof body.submission_id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(body.submission_id) || !body.draft || typeof body.draft !== 'object' || Array.isArray(body.draft))) return false;
  if (body.action === 'fail' && (typeof body.error !== 'string' || body.error.length > 2000)) return false;
  return true;
}
