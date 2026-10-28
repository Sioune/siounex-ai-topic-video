// SYNTHETIC actual React, next-themes, Radix and cmdk DOM tests. Navigation is intercepted.
// No production API calls, server-state writes or browser pixel-layout claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React, {act} from 'react';

const require = createRequire(new URL('../package.json', import.meta.url));
const {JSDOM} = createRequire(process.env.TOPIC_TEST_PACKAGE || new URL('../.sites-runtime/test-deps/package.json', import.meta.url))('jsdom');
const {RouterContext} = require('next/dist/shared/lib/router-context.shared-runtime');
const built = await build({entryPoints: ['components/app-frame.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, plugins: [{name: 'synthetic-frame-boundaries', setup(b) {
  b.onResolve({filter: /^next\/navigation$/}, () => ({path: 'navigation', namespace: 'fixture'}));
  b.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: "export function usePathname(){return globalThis.__studioFramePath||'/data'};export function useRouter(){return {push:(href)=>globalThis.__studioFrameNavigation(href)}}"}));
  // Bundle next-themes so the no-DOM SSR and browser entry each evaluate its own environment.
  b.onResolve({filter: /^next-themes$/}, () => ({path: path.resolve('node_modules/next-themes/dist/index.mjs')}));
  b.onLoad({filter: /app-frame\.tsx$/}, async args => ({contents: (await fs.promises.readFile(args.path, 'utf8')).replace('window.location.assign(href)', 'globalThis.__studioFrameReload(href)'), loader: 'tsx'}));
}}]});
const code = built.outputFiles[0].text;
function component() {const record = {exports: {}}; new Function('require', 'module', 'exports', code)(require, record, record.exports); return record.exports.default;}
const server = spawnSync(process.execPath, ['-e', "const fs=require('node:fs'),React=require('react'),{renderToString}=require('react-dom/server'),record={exports:{}};new Function('require','module','exports',fs.readFileSync(0,'utf8'))(require,record,record.exports);process.stdout.write(renderToString(React.createElement(record.exports.default,null,React.createElement('p',{id:'SYNTHETIC-child'},'SYNTHETIC preserved child'))));"], {cwd: process.cwd(), input: code, encoding: 'utf8'});
assert.equal(server.status, 0, server.stderr);
const serverHTML = server.stdout;
let firstDom = true, createRoot, hydrateRoot;
const sleep = () => new Promise(resolve => setTimeout(resolve, 5));
async function settle() {await act(async () => {await sleep();}); await act(async () => {await sleep();});}
async function setup(t, {theme, reading, dark = false, hydrate = false, denyStorage = false, strict = false} = {}) {
  const dom = new JSDOM('<!doctype html><html lang="zh-CN"><head></head><body><div id="root">' + (hydrate ? serverHTML : '') + '</div></body></html>', {url: 'https://SYNTHETIC.test/data', pretendToBeVisual: true, runScripts: 'outside-only'});
  const win = dom.window, mediaListeners = new Set(), listeners = {keydown: new Set(), storage: new Set()}, navigation = [], reloads = [], calls = [];
  let systemDark = dark;
  const media = {media: '(prefers-color-scheme: dark)', get matches() {return systemDark;}, addListener: fn => mediaListeners.add(fn), removeListener: fn => mediaListeners.delete(fn), addEventListener: (name, fn) => mediaListeners.add(fn), removeEventListener: (name, fn) => mediaListeners.delete(fn)};
  win.matchMedia = () => media;
  const add = win.addEventListener.bind(win), remove = win.removeEventListener.bind(win);
  win.addEventListener = (name, handler, options) => {listeners[name]?.add(handler); return add(name, handler, options);};
  win.removeEventListener = (name, handler, options) => {listeners[name]?.delete(handler); return remove(name, handler, options);};
  if (theme) win.localStorage.setItem('siounex-studio-theme', theme);
  if (reading) win.localStorage.setItem('siounex-reading-size', reading);
  if (denyStorage) Object.defineProperty(win, 'localStorage', {get() {throw new win.DOMException('SYNTHETIC storage denied', 'SecurityError');}});
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'NodeFilter', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'MutationObserver', 'DocumentFragment']) globalThis[key] = win[key];
  for (const key of Object.getOwnPropertyNames(win).filter(key => /^(HTML|SVG|FocusEvent|PointerEvent)/.test(key))) if (win[key]) globalThis[key] = win[key];
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: win.navigator});
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get: () => win.localStorage});
  globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  globalThis.requestAnimationFrame = cb => win.requestAnimationFrame(cb);
  globalThis.cancelAnimationFrame = id => win.cancelAnimationFrame(id);
  globalThis.ResizeObserver = class {observe() {} unobserve() {} disconnect() {}};
  globalThis.IntersectionObserver = class {observe() {} unobserve() {} disconnect() {}};
  win.HTMLElement.prototype.scrollIntoView = () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__studioFramePath = '/data';
  globalThis.__studioFrameNavigation = href => navigation.push(href);
  globalThis.__studioFrameReload = href => reloads.push(href);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {calls.push(args); throw Error('SYNTHETIC frame must not call an API');};
  if (firstDom) {({createRoot, hydrateRoot} = await import('react-dom/client')); firstDom = false;}
  if (hydrate) {const script = document.querySelector('#root script'); assert.ok(script); win.eval(script.textContent);}
  const AppFrame = component(), child = React.createElement('p', {id: 'SYNTHETIC-child'}, 'SYNTHETIC preserved child');
  const app = strict ? React.createElement(React.StrictMode, null, React.createElement(AppFrame, null, child)) : React.createElement(AppFrame, null, child);
  const tree = React.createElement(RouterContext.Provider, {value:{pathname:'/data',asPath:'/data',push:href=>{navigation.push(href);return Promise.resolve(true)},prefetch:()=>{calls.push('unexpected prefetch');return Promise.resolve()}}}, app);
  const before = document.getElementById('SYNTHETIC-child'), recoverable = [], errors = [], previousError = console.error;
  console.error = (...values) => errors.push(values.map(String).join(' '));
  let root;
  await act(async () => {if (hydrate) root = hydrateRoot(document.getElementById('root'), tree, {onRecoverableError: error => recoverable.push(error)}); else {root = createRoot(document.getElementById('root')); root.render(tree);}});
  await settle();
  let closed = false;
  async function close() {if (closed) return; closed = true; await act(async () => root.unmount()); await sleep();}
  t.after(async () => {await close(); console.error = previousError; globalThis.fetch = oldFetch; dom.window.close(); delete globalThis.__studioFrameNavigation; delete globalThis.__studioFrameReload; delete globalThis.__studioFramePath;});
  return {dom, win, before, recoverable, errors, listeners, mediaListeners, navigation, reloads, calls, close, async renderPath(value) {globalThis.__studioFramePath=value;await act(async()=>root.render(React.cloneElement(tree,{children:React.cloneElement(app)})));await settle();}, async system(value) {systemDark = value; await act(async () => {for (const listener of [...mediaListeners]) listener(media);}); await settle();}};
}
const dialog = () => document.querySelector('[role="dialog"]');
async function key(options, element = window) {let event; await act(async () => {event = new KeyboardEvent('keydown', {bubbles: true, cancelable: true, ...options}); element.dispatchEvent(event);}); await settle(); return event;}
async function click(element) {assert.ok(element); await act(async () => element.click()); await settle();}
async function selectTheme(value) {await act(async () => {const select = document.querySelector('[aria-label="界面主题"]'); select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));}); await settle();}

test('SYNTHETIC no-DOM SSR has stable system/comfortable controls and the correct page, without reading local storage', () => {
  const doc = new JSDOM(serverHTML).window.document;
  assert.equal(doc.querySelector('a[aria-current="page"]').getAttribute('href'), '/data');
  assert.equal(doc.querySelector('[aria-label="界面主题"]').value, 'system');
  assert.equal(doc.querySelector('.studio-reading-toggle').getAttribute('aria-pressed'), 'false');
  assert.match(doc.querySelector('script').textContent, /siounex-studio-theme/);
  assert.ok(doc.getElementById('studio-main'));
  assert.equal(doc.querySelector('.studio-skip').getAttribute('href'), '#studio-main');
  assert.equal(doc.querySelector('a[href="/research"]').textContent.trim(), '关键词研究');
});

test('SYNTHETIC hydration restores stored dark and large preferences without replacing the SSR child or emitting mismatches', async t => {
  const f = await setup(t, {theme: 'dark', reading: 'large', hydrate: true});
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(document.documentElement.dataset.reading, 'large');
  assert.equal(document.querySelector('[aria-label="界面主题"]').value, 'dark');
  assert.equal(document.querySelector('.studio-reading-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(document.getElementById('SYNTHETIC-child'), f.before);
  assert.deepEqual(f.recoverable, []);
  assert.deepEqual(f.errors.filter(e => /hydrat|mismatch|did not match/i.test(e)), []);
  assert.equal(f.calls.length, 0);
});

test('SYNTHETIC real next-themes follows system changes, persists explicit choices and handles cross-tab theme events', async t => {
  const f = await setup(t, {theme: 'system', dark: true});
  assert.equal(document.documentElement.dataset.theme, 'dark');
  await f.system(false);
  assert.equal(document.documentElement.dataset.theme, 'light');
  await selectTheme('dark');
  assert.equal(localStorage.getItem('siounex-studio-theme'), 'dark');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  await f.system(false);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  await act(async () => window.dispatchEvent(new f.win.StorageEvent('storage', {key: 'siounex-studio-theme', oldValue: 'dark', newValue: 'light'})));
  await settle();
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(document.querySelector('[aria-label="界面主题"]').value, 'light');
});

test('SYNTHETIC large reading changes only local preferences and the command palette can restore comfortable reading', async t => {
  const f = await setup(t);
  await click(document.querySelector('.studio-reading-toggle'));
  assert.equal(document.documentElement.dataset.reading, 'large');
  assert.equal(localStorage.getItem('siounex-reading-size'), 'large');
  await click(document.querySelector('.studio-quick-open'));
  assert.ok(dialog());
  await click([...document.querySelectorAll('[cmdk-item]')].find(e => e.textContent.includes('恢复舒适字号')));
  assert.equal(document.documentElement.dataset.reading, 'comfortable');
  assert.equal(localStorage.getItem('siounex-reading-size'), 'comfortable');
  assert.equal(dialog(), null);
  assert.equal(f.calls.length, 0);
});

test('SYNTHETIC Ctrl K and Meta K manage one palette, ignore composition/Alt, filter commands and navigate to the chosen page', async t => {
  const f = await setup(t);
  for (const ignored of [{key: 'k'}, {key: 'k', ctrlKey: true, altKey: true}, {key: 'k', ctrlKey: true, isComposing: true}]) {assert.equal((await key(ignored)).defaultPrevented, false); assert.equal(dialog(), null);}
  assert.equal((await key({key: 'K', ctrlKey: true})).defaultPrevented, true);
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(document.activeElement.getAttribute('aria-label'), '搜索页面或操作');
  await key({key: 'k', metaKey: true});
  assert.equal(dialog(), null);
  await key({key: 'k', metaKey: true});
  const input = document.querySelector('[aria-label="搜索页面或操作"]');
  await act(async () => {Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '数据中心'); input.dispatchEvent(new Event('input', {bubbles: true}));}); await settle();
  assert.equal(document.querySelectorAll('[cmdk-item]').length, 1);
  await key({key: 'Enter'}, input);
  assert.deepEqual(f.reloads, ['/data']);
  assert.deepEqual(f.navigation, []);
  assert.equal(dialog(), null);
  assert.equal(f.calls.length, 0);
});

test('SYNTHETIC theme command toggles the resolved system-dark appearance to light', async t => {
  await setup(t, {theme: 'system', dark: true});
  assert.equal(document.documentElement.dataset.theme, 'dark');
  await click(document.querySelector('.studio-quick-open'));
  const command = [...document.querySelectorAll('[cmdk-item]')].find(e => /切换.*外观/.test(e.textContent));
  assert.equal(command.textContent, '切换浅色外观');
  await click(command);
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(localStorage.getItem('siounex-studio-theme'), 'light');
});

test('SYNTHETIC keyword research is available from the shared command palette without starting a request', async t => {
  const f = await setup(t);
  await click(document.querySelector('.studio-quick-open'));
  await click([...document.querySelectorAll('[cmdk-item]')].find(e => e.textContent.includes('关键词研究')));
  assert.deepEqual(f.navigation, ['/research']);
  assert.equal(f.calls.length, 0);
});

test('SYNTHETIC sidebar and home brand use client navigation without prefetching or replacing the page shell', async t => {
  const f = await setup(t), child = document.getElementById('SYNTHETIC-child');
  const research = document.querySelector('.studio-sidebar nav a[href="/research"]');
  assert.equal(research.getAttribute('href'), '/research');
  await click(research);
  assert.deepEqual(f.navigation, ['/research']);
  assert.match(document.querySelector('[role="status"]').textContent,/正在打开关键词研究/);
  assert.equal(document.querySelector('[role="status"] a').getAttribute('href'),'/research');
  assert.equal(document.getElementById('SYNTHETIC-child'), child);
  let modifiedPrevented;
  const preventJSDOMNavigation=e=>{modifiedPrevented=e.defaultPrevented;e.preventDefault();};
  document.addEventListener('click',preventJSDOMNavigation,{once:true});
  await act(async()=>research.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:true})));
  assert.equal(modifiedPrevented,false,'Ctrl-click remains native for opening another tab');
  assert.deepEqual(f.navigation, ['/research']);
  await f.renderPath('/research');
  assert.equal(document.querySelector('[role="status"]'),null,'arrival clears the pending message');
  assert.equal(document.querySelector('a[aria-current="page"]').getAttribute('href'), '/research');
  await click(document.querySelector('.studio-brand'));
  assert.deepEqual(f.navigation, ['/research', '/']);
  assert.equal(document.getElementById('SYNTHETIC-child'), child);
  assert.equal(f.calls.length, 0, 'visible navigation must not prefetch unrelated pages');
});

test('SYNTHETIC production opens as a normal document navigation from the sidebar and command palette',async t=>{
  const f=await setup(t),link=document.querySelector('.studio-sidebar nav a[href="/production"]');let native=false;
  const prevent=e=>{native=!e.defaultPrevented;e.preventDefault()};document.addEventListener('click',prevent,{once:true});
  await act(async()=>link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0})));await settle();
  assert.equal(native,true);assert.deepEqual(f.navigation,[]);assert.match(document.querySelector('[role="status"]').textContent,/正在打开制作与审稿/);
  await click(document.querySelector('.studio-quick-open'));await click([...document.querySelectorAll('[cmdk-item]')].find(e=>e.textContent.includes('制作与审稿')));
  assert.deepEqual(f.reloads,['/production']);assert.deepEqual(f.navigation,[]);
});

test('SYNTHETIC modified sidebar click keeps native behavior and does not show a pending message', async t => {
  const f=await setup(t),link=document.querySelector('.studio-sidebar nav a[href="/production"]');
  const prevent=e=>e.preventDefault();document.addEventListener('click',prevent,{once:true});
  await act(async()=>link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:true})));
  assert.equal(document.querySelector('[role="status"]'),null);
  assert.deepEqual(f.navigation,[]);
});

test('SYNTHETIC same-page navigation with a query uses the original document navigation to reset page state', async t => {
  const f=await setup(t);
  async function expectNativeLink(selector,href){
    const link=document.querySelector(selector);assert.ok(link);assert.equal(link.getAttribute('href'),href);
    let nativeEvent=false;const prevent=e=>{nativeEvent=!e.defaultPrevented;e.preventDefault();};
    document.addEventListener('click',prevent,{once:true});
    await act(async()=>link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0})));
    assert.equal(nativeEvent,true,'same-page link remains a normal document navigation');
    assert.deepEqual(f.navigation,[]);
  }
  f.win.history.replaceState({},'', '/production?job=SYNTHETIC');await f.renderPath('/production');
  await expectNativeLink('.studio-sidebar nav a[href="/production"]','/production');
  await click(document.querySelector('.studio-quick-open'));
  await click([...document.querySelectorAll('[cmdk-item]')].find(e=>e.textContent.includes('制作与审稿')));
  assert.deepEqual(f.reloads,['/production']);assert.deepEqual(f.navigation,[]);
  f.win.history.replaceState({},'', '/?q=SYNTHETIC');await f.renderPath('/');
  await expectNativeLink('.studio-brand','/');
  await click(document.querySelector('.studio-quick-open'));
  await click([...document.querySelectorAll('[cmdk-item]')].find(e=>e.textContent.includes('选题库')));
  assert.deepEqual(f.reloads,['/production','/']);assert.deepEqual(f.navigation,[]);
  assert.equal(f.calls.length,0);
});

test('SYNTHETIC Escape closes the command dialog, restores its opener and releases body interaction', async t => {
  await setup(t);
  const opener = document.querySelector('.studio-quick-open'); opener.focus();
  await click(opener);
  await key({key: 'Escape'}, document.activeElement);
  assert.equal(dialog(), null);
  assert.ok(document.activeElement === opener, 'Escape must restore focus to the quick-open button');
  assert.notEqual(document.body.style.pointerEvents, 'none');
});

test('SYNTHETIC Ctrl K from an ordinary input restores that input; a removed origin falls back to quick-open', async t => {
  await setup(t);
  const input = document.createElement('input'); input.setAttribute('aria-label', 'SYNTHETIC editor'); input.value = 'SYNTHETIC unsaved text';
  document.getElementById('studio-main').appendChild(input); input.focus();
  await key({key: 'k', ctrlKey: true}, input);
  assert.ok(dialog());
  await key({key: 'Escape'}, document.activeElement);
  assert.equal(dialog(), null);
  assert.ok(document.activeElement === input, 'Escape must restore the original text input');
  assert.equal(input.value, 'SYNTHETIC unsaved text');
  await key({key: 'k', ctrlKey: true}, input);
  input.remove();
  await key({key: 'Escape'}, document.activeElement);
  assert.equal(dialog(), null);
  assert.ok(document.activeElement === document.querySelector('.studio-quick-open'), 'Removed origin must fall back to a connected opener');
});

test('SYNTHETIC StrictMode/unmount cleans shortcut, storage and system listeners without duplicating a later mount', async t => {
  const f = await setup(t, {strict: true});
  // JSDOM's selector engine owns a persistent key tracker in recent versions.
  // Count the frame's Ctrl/Meta K handler, then require that exact handler to be removed.
  const shortcuts=[...f.listeners.keydown].filter(handler=>String(handler).includes('event.isComposing'));
  assert.equal(shortcuts.length, 1);
  assert.equal(f.listeners.storage.size, 1);
  assert.equal(f.mediaListeners.size, 1);
  await f.close();
  assert.equal([...f.listeners.keydown].some(handler=>String(handler).includes('event.isComposing')), false);
  assert.equal(f.listeners.storage.size, 0);
  assert.equal(f.mediaListeners.size, 0);
  assert.equal((await key({key: 'k', ctrlKey: true})).defaultPrevented, false);
  assert.equal(dialog(), null);
});

test('SYNTHETIC unavailable local storage leaves usable controls and never breaks rendering', async t => {
  const f = await setup(t, {denyStorage: true});
  assert.equal(document.querySelector('[aria-label="界面主题"]').value, 'system');
  await click(document.querySelector('.studio-reading-toggle'));
  assert.equal(document.documentElement.dataset.reading, 'large');
  await selectTheme('dark');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.deepEqual(f.errors, []);
});

test('SYNTHETIC light and dark token pairs preserve readable text and accent buttons', () => {
  const css = fs.readFileSync('app/studio.css', 'utf8');
  const luminance = hex => {const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;};
  for (const selector of [':root', 'html[data-theme=dark]']) {
    const block = css.slice(css.indexOf(selector + '{') + selector.length + 1).split('}')[0];
    const values = Object.fromEntries([...block.matchAll(/--studio-([\w-]+):\s*(#[a-f0-9]{6})/gi)].map(m => [m[1], m[2]]));
    for (const [foreground, background] of [['text', 'surface'], ['muted', 'surface'], ['on-accent', 'accent']]) {
      const a = luminance(values[foreground]), b = luminance(values[background]);
      assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, selector + ': ' + foreground + '/' + background);
    }
  }
});
