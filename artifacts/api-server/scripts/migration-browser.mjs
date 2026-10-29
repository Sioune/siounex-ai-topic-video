import { chromium } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

if (process.env.NODE_ENV === 'production') throw new Error('Development browser test only');
const baseURL = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:80';
const db = new DatabaseSync(path.resolve(import.meta.dirname, '../.runtime/studio.sqlite'));
const sid = randomBytes(32).toString('hex');
const owner = 'migration-browser-test';
db.prepare('INSERT INTO _studio_sessions VALUES (?,?,?)').run(sid, JSON.stringify({ kind: 'user', user: { userId: owner, displayName: 'Migration browser test' } }), Date.now() + 600000);
const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [], failures = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 500) failures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
mkdirSync('generated-artifacts/migration', { recursive: true });
try {
  await page.goto(baseURL);
  await page.getByRole('link', { name: '登录', exact: true }).waitFor();
  console.log('Anonymous login gate: OK');
  await context.addCookies([{ name: 'studio_session', value: sid, url: baseURL, httpOnly: true, secure: baseURL.startsWith('https'), sameSite: 'Lax' }]);
  for (const [route, name] of [['/', 'topics'], ['/research', 'research'], ['/originals', 'originals'], ['/production', 'production'], ['/publishing', 'publishing'], ['/data', 'data'], ['/data/upload', 'upload']]) {
    await page.goto(baseURL + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    assert.equal(await page.getByRole('link', { name: '登录', exact: true }).count(), 0, `${route}: unexpectedly signed out`);
    assert((await page.locator('body').innerText()).length > 80, `${route}: empty screen`);
    await page.screenshot({ path: `generated-artifacts/migration/${name}.png`, fullPage: true });
    console.log(`${route}: loaded`);
  }
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  const search = page.locator('#topic-search');
  if (await search.count()) {
    await search.fill('Google');
    await page.waitForTimeout(350);
    assert((await page.locator('body').innerText()).includes('Google'));
    await search.fill('');
    console.log('Search: OK');
  }
  await page.getByRole('button', { name: '大字模式', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-reading'), 'large');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('data-reading'), 'large');
  await page.getByRole('button', { name: '大字模式', exact: true }).click();
  await page.getByRole('combobox', { name: '界面主题' }).selectOption('dark');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.getByRole('combobox', { name: '界面主题' }).selectOption('light');
  console.log('Reading and theme settings: OK');
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  console.log('Command navigation dialog: OK');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'generated-artifacts/migration/mobile.png', fullPage: true });
  console.log('Mobile viewport captured');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  assert.deepEqual(failures, [], `API failures: ${failures.join('; ')}`);
  console.log('Browser verification: PASS');
} finally {
  db.prepare('DELETE FROM favorites WHERE user_id=?').run(owner);
  db.prepare('DELETE FROM dispositions WHERE user_id=?').run(owner);
  await fetch(baseURL + '/api/logout', { headers: { Cookie: `studio_session=${sid}` }, redirect: 'manual' });
  db.close();
  await browser.close();
}
