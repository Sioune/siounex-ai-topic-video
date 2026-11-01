import assert from 'node:assert/strict';

// Live, non-mutating boundary checks. Authenticated reads are exercised by the
// programmatic Clerk browser test, never by inserting legacy SQLite sessions.
if (process.env.NODE_ENV === 'production') throw new Error('Development smoke test only');
const origin = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:80';
for (const route of ['/api/library', '/api/data-center', '/api/production', '/api/publishing-service', '/api/cover-candidate', '/api/work-in-progress-video', '/api/owner-feedback', '/api/studio/access', '/mcp']) {
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
const fakeCodexGrant = await fetch(origin + '/api/executor', {
  method: 'POST',
  headers: { Authorization: 'Bearer cxbr1.not-a-real-grant.not-a-real-secret', 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'read', id: 'job_not-authorized' }),
});
assert.equal(fakeCodexGrant.status, 401, 'A forged local Codex grant must be denied');
const health = await fetch(origin + '/api/healthz');
assert.equal(health.status, 200);
console.log('Clerk boundary smoke: PASS');
const serviceExpectedStatus = process.env.SERVICE_TOKEN && process.env.SERVICE_TOKEN.length >= 32 ? 401 : 503;
for (const authorization of [undefined, 'Bearer forged-service-token']) {
  const response = await fetch(origin + '/api/v1/publishing/tasks?state=ready', {
    headers: authorization ? { Authorization: authorization } : {},
    redirect: 'manual',
  });
  assert.equal(response.status, serviceExpectedStatus, 'publishing bridge must require an unguessable configured service token');
  assert.match(response.headers.get('cache-control'), /no-store/);
}
console.log('/api/v1/publishing/tasks: service credential boundary enforced');

if (process.env.SERVICE_TOKEN) {
  // Use the secret only inside this process; never print headers, tokens, or task payloads.
  const serviceHeaders = { Authorization: `Bearer ${process.env.SERVICE_TOKEN}` };
  const capabilityResponse = await fetch(origin + '/api/v1/publishing', {
    headers: serviceHeaders, redirect: 'manual',
  });
  assert.equal(capabilityResponse.status, 200, 'Configured service credential must authenticate');
  const capability = await capabilityResponse.json();
  assert.equal(capability.mode, 'read_only');
  assert.equal(capability.publish_allowed, false);
  assert.deepEqual(capability.enabled_writes, []);
  console.log('Publishing service: authenticated capability probe PASS (read-only)');

  const privateResponse = await fetch(origin + '/api/library', {
    headers: serviceHeaders, redirect: 'manual',
  });
  assert.equal(privateResponse.status, 401, 'Service credential must not grant private workspace access');
  const browserResponse = await fetch(origin + '/api/v1/publishing', {
    headers: { ...serviceHeaders, Origin: 'https://browser.invalid' }, redirect: 'manual',
  });
  assert.equal(browserResponse.status, 403, 'Browser requests must not use the service credential');
  const writeResponse = await fetch(origin + '/api/v1/publishing', {
    method: 'POST', headers: serviceHeaders, redirect: 'manual',
  });
  assert.equal(writeResponse.status, 405, 'Service credential must not enable writes');
  console.log('Publishing service: private workspace, browser, and write boundaries PASS');

  const tasksResponse = await fetch(origin + '/api/v1/publishing/tasks?state=ready', {
    headers: serviceHeaders, redirect: 'manual',
  });
  assert.equal(tasksResponse.status, 200, 'Authenticated task list must be readable');
  const taskPage = await tasksResponse.json();
  assert.equal(taskPage.schema, 'replit-publishing-task-list-v1');
  assert.equal(taskPage.publish_allowed, false);
  assert.ok(Array.isArray(taskPage.tasks));
  console.log(`Publishing service: authenticated task list PASS (${taskPage.tasks.length} eligible tasks in this page)`);

  if (taskPage.tasks.length > 0) {
    const id = taskPage.tasks[0].task_id;
    assert.match(id, /^pbw_[a-f0-9]{64}$/);
    const packageResponse = await fetch(origin + `/api/v1/publishing/tasks/${encodeURIComponent(id)}/package`, {
      headers: serviceHeaders, redirect: 'manual',
    });
    assert.ok([200, 409].includes(packageResponse.status), 'Package must be readable or reject stale authorization');
    if (packageResponse.status === 200) {
      const approvedPackage = await packageResponse.json();
      assert.equal(approvedPackage.schema, 'replit-publishing-task-package-v1');
      assert.equal(approvedPackage.task_id, id);
      console.log('Publishing service: authenticated current package read PASS');
    } else {
      console.log('Publishing service: package authorization changed; current package read not verified');
    }
  } else {
    console.log('Publishing service: no eligible tasks; live package read not exercised');
  }
}
