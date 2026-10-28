// SYNTHETIC bytes/DNS/transports/decode only. No network, real image inspection,
// ffprobe/ffmpeg process, model, worker, production state or external writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readSourceImage, decodeSourceImage} from '../scripts/source-image-reader.mjs';
import {linkedSourceImages, validateSourceImages} from '../scripts/source-materials.mjs';
import {sourceEvidence} from '../scripts/source-evidence.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');
const sha = value => createHash('sha256').update(value).digest('hex');
const URL_A = 'https://images.example.org/figure.png', PUBLIC = '93.184.216.34';
const publicLookup = async () => [{address: PUBLIC, family: 4}];
const ok = (body = PNG) => ({status: 200, body, contentType: 'image/png'});
const decoded = () => ({width: 1, height: 1, codec: 'png', decode: 'ffmpeg-first-frame-v1'});
function fixture(t, count = 7) {
  const parent = path.resolve('.sites-runtime'); fs.mkdirSync(parent, {recursive: true});
  const root = fs.mkdtempSync(path.join(parent, 'SYNTHETIC-source-images-'));
  t.after(() => {const target = path.resolve(root); assert.equal(path.dirname(target), parent); assert.ok(path.basename(target).startsWith('SYNTHETIC-source-images-')); fs.rmSync(target, {recursive: true, force: true});});
  const urls = Array.from({length: count}, (_, i) => 'https://images.ifanr.cn/SYNTHETIC-' + i + '.png');
  const html = '<title>SYNTHETIC source</title><article><h1>SYNTHETIC source</h1><p>' + 'SYNTHETIC complete article text. '.repeat(15) + '</p>' + urls.map(url => '<img src="' + url + '">').join('') + '</article>';
  const sourceFile = path.join(root, 'source.txt'); fs.writeFileSync(sourceFile, html);
  const job = {id: 'SYNTHETIC-source-only', source_snapshot: JSON.stringify({url: 'https://www.ifanr.com/SYNTHETIC-source', title: 'SYNTHETIC source', original_title: 'SYNTHETIC source', published_at: null})};
  return {root, sourceFile, job, urls, directory: path.join(root, 'images')};
}
function imageResult(url, body = Buffer.concat([PNG, Buffer.from('\nSYNTHETIC fixture identity: ' + url)])) {return {url, resolved_url: url, body, sha256: sha(body), size_bytes: body.length, mime_type: 'image/png', extension: '.png', retrieved_at: '2026-10-16T00:00:00.000Z'};}

test('SYNTHETIC public image request pins the validated IPv4 and preserves exact bytes/hash', async () => {
  let calls = 0;
  const result = await readSourceImage(URL_A, {lookup: publicLookup, transport: async (url, address, options) => {
    calls++; assert.equal(url.href, URL_A); assert.equal(address, PUBLIC); assert.equal(options.maxBytes, 5000000); assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 20000); return ok();
  }});
  assert.equal(calls, 1); assert.equal(result.url, URL_A); assert.equal(result.resolved_url, URL_A);
  assert.deepEqual(result.body, PNG); assert.equal(result.sha256, sha(PNG)); assert.equal(result.size_bytes, PNG.length); assert.equal(result.mime_type, 'image/png');
});

test('SYNTHETIC image redirects re-resolve and pin each new public hostname', async () => {
  const hosts = [], seen = [];
  const result = await readSourceImage(URL_A, {lookup: async hostname => {hosts.push(hostname); return [{address: hosts.length === 1 ? PUBLIC : '8.8.8.8', family: 4}];}, transport: async (url, address) => {
    seen.push({host: url.hostname, address}); return seen.length === 1 ? {status: 302, location: 'https://cdn.example.net/second.png'} : ok();
  }});
  assert.deepEqual(hosts, ['images.example.org', 'cdn.example.net']); assert.deepEqual(seen, [{host: 'images.example.org', address: PUBLIC}, {host: 'cdn.example.net', address: '8.8.8.8'}]);
  assert.equal(result.resolved_url, 'https://cdn.example.net/second.png'); assert.equal(result.url, URL_A);
});

test('SYNTHETIC frozen public article context supplies Referer without query secrets and drops it across image-host redirects', async () => {
  const seen = [], sourceUrl = 'https://www.example.org/article?private_context=drop#fragment';
  const result = await readSourceImage(URL_A, {sourceUrl, lookup: publicLookup, transport: async (url, _address, options) => {
    seen.push({url: url.href, referer: options.referer, keys: Object.keys(options)});
    return seen.length === 1 ? {status: 302, location: '/next.png'} : seen.length === 2 ? {status: 302, location: 'https://cdn.example.net/final.png'} : ok();
  }});
  assert.equal(result.resolved_url, 'https://cdn.example.net/final.png');
  assert.deepEqual(seen.map(row => row.referer), ['https://www.example.org/article', 'https://www.example.org/article', undefined]);
  for (const row of seen) assert.ok(row.keys.every(key => ['timeoutMs', 'maxBytes', 'referer'].includes(key)), 'no cookies, authorization or arbitrary headers can be forwarded');
});

test('SYNTHETIC unsafe article Referer contexts fail before DNS or image transport', async () => {
  for (const sourceUrl of ['http://www.example.org/article', 'https://u:p@www.example.org/article', 'https://localhost/article', 'https://127.0.0.1/article', 'https://www.example.org:8443/article', 'https://www.example.org/article\r\nAuthorization: leaked', {}]) {
    let reads = 0;
    await assert.rejects(() => readSourceImage(URL_A, {sourceUrl, lookup: async () => {reads++; return publicLookup();}, transport: async () => {reads++; return ok();}}));
    assert.equal(reads, 0);
  }
});

test('SYNTHETIC article image preparation uses the frozen source URL as public image context', async t => {
  const f = fixture(t, 2), article = JSON.parse(f.job.source_snapshot).url, seen = [];
  const result = await linkedSourceImages({...f, readImage: async (url, options) => {seen.push(options.sourceUrl); return imageResult(url);}, decodeImage: decoded});
  assert.equal(result.image_count, 2); assert.deepEqual(seen, [article, article]);
});

test('SYNTHETIC unsafe image URLs and ports are rejected before DNS or transport', async t => {
  for (const url of ['http://images.example.org/a.png', 'https://u:p@images.example.org/a.png', 'https://images.example.org:8443/a.png', 'https://127.0.0.1/a.png', 'https://2130706433/a.png', 'https://[::1]/a.png', 'https://localhost/a.png', 'https://server.internal/a.png', 'file:///SYNTHETIC.png']) await t.test(url, async () => {
    let dns = 0, http = 0;
    await assert.rejects(() => readSourceImage(url, {lookup: async () => {dns++; return publicLookup();}, transport: async () => {http++; return ok();}}));
    assert.equal(dns, 0); assert.equal(http, 0);
  });
});

test('SYNTHETIC private and mixed-private image DNS results never reach transport', async t => {
  for (const address of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.1', '172.16.0.1']) await t.test(address, async () => {
    let requests = 0;
    await assert.rejects(() => readSourceImage(URL_A, {lookup: async () => [{address: PUBLIC, family: 4}, {address, family: 4}], transport: async () => {requests++; return ok();}}));
    assert.equal(requests, 0);
  });
});

test('SYNTHETIC fake-IP may use verified DoH while the fake address itself is never connected', async () => {
  let resolutions = 0;
  const result = await readSourceImage(URL_A, {lookup: async () => [{address: '198.18.0.63', family: 4}], doh: async host => {resolutions++; assert.equal(host, 'images.example.org'); return [{address: PUBLIC, family: 4}];}, transport: async (_url, address) => {assert.equal(address, PUBLIC); return ok();}});
  assert.equal(resolutions, 1); assert.equal(result.sha256, sha(PNG));
});

test('SYNTHETIC unsafe redirect targets are not followed and redirect loops are bounded', async () => {
  for (const location of ['http://images.example.org/a.png', 'https://127.0.0.1/a.png', 'https://images.example.org:8443/a.png', 'https://user:pass@images.example.org/a.png']) {
    let count = 0;
    await assert.rejects(() => readSourceImage(URL_A, {lookup: publicLookup, transport: async () => {count++; return {status: 302, location};}}));
    assert.equal(count, 1);
  }
  let count = 0;
  await assert.rejects(() => readSourceImage(URL_A, {lookup: publicLookup, transport: async () => {count++; return {status: 302, location: '/loop.png'};}}));
  assert.equal(count, 4);
});

test('SYNTHETIC image HTTP/MIME/encoding/byte failures cannot become successful image receipts', async t => {
  for (const [name, response] of [['403', {status: 403}], ['HTML challenge', {status: 200, body: Buffer.from('<html>not an image</html>'), contentType: 'text/html'}], ['encoded body', {...ok(), contentEncoding: 'gzip'}], ['too large', ok(Buffer.alloc(5000001))], ['bad signature', ok(Buffer.from('SYNTHETIC not image bytes'))]]) await t.test(name, () => assert.rejects(() => readSourceImage(URL_A, {lookup: publicLookup, transport: async () => response})));
});

test('SYNTHETIC a stalled image transport has a finite shared deadline', async () => {
  const started = Date.now();
  await assert.rejects(() => readSourceImage(URL_A, {lookup: publicLookup, transport: async () => new Promise(() => {}), timeoutMs: 20}));
  assert.ok(Date.now() - started < 1000);
});

test('SYNTHETIC article image discovery handles relative/lazy/srcset and excludes page decoration', () => {
  const source = {url: 'https://www.ifanr.com/SYNTHETIC/page', title: 'SYNTHETIC'}, html = '<title>SYNTHETIC</title><header><img src="https://images.ifanr.cn/logo.png"></header><article><p>' + 'SYNTHETIC article text. '.repeat(15) + '</p><img data-original="/fig-a.jpg" src="/placeholder.svg"><img data-src="//images.ifanr.cn/fig-b.webp"><img srcset="/fig-c-small.png 1x, /fig-c-large.png 2x"><img class="avatar" src="https://images.ifanr.cn/avatar.png"><img width="1" height="1" src="https://images.ifanr.cn/pixel.gif"></article><footer><img src="https://images.ifanr.cn/footer-logo.png"></footer>';
  const result = sourceEvidence(Buffer.from(html), source), urls = result.media_references.map(ref => ref.url);
  assert.ok(urls.includes('https://www.ifanr.com/fig-a.jpg')); assert.ok(urls.includes('https://images.ifanr.cn/fig-b.webp')); assert.ok(urls.some(url => /fig-c-(small|large)\.png$/.test(url)));
  assert.ok(urls.every(url => !/(?:logo|avatar|pixel|placeholder)/.test(url))); assert.equal(result.source_sha256, sha(Buffer.from(html)));
});

test('SYNTHETIC seven public non-IT images become an immutable brief and a replay does not fetch again', async t => {
  const f = fixture(t); let reads = 0, decodes = 0;
  const options = {...f, readImage: async url => {reads++; return imageResult(url);}, decodeImage: file => {decodes++; assert.deepEqual(fs.readFileSync(file).subarray(0, PNG.length), PNG); return decoded();}};
  const first = await linkedSourceImages(options); assert.equal(first.image_count, 7); assert.ok(first.brief_file);
  const body = fs.readFileSync(first.brief_file, 'utf8'), manifest = JSON.parse(body);
  assert.equal(manifest.schema, 'source-images-v2'); assert.equal(manifest.images.length, 7); assert.equal(manifest.total_image_bytes, f.urls.reduce((sum, url) => sum + imageResult(url).body.length, 0));
  assert.deepEqual(manifest.references, f.urls); assert.equal(manifest.source_sha256, sha(fs.readFileSync(f.sourceFile)));
  const second = await linkedSourceImages(options); assert.equal(second.reused, true); assert.equal(reads, 7); assert.ok(decodes >= 14); assert.equal(fs.readFileSync(first.brief_file, 'utf8'), body);
});

test('SYNTHETIC a completed first image survives a second-image failure and is reused after retry', async t => {
  const f = fixture(t, 3), counts = new Map(); let fail = true;
  const readImage = async url => {counts.set(url, (counts.get(url) || 0) + 1); if (url === f.urls[1] && fail) throw Error('SYNTHETIC interrupted second image'); return imageResult(url);};
  await assert.rejects(() => linkedSourceImages({...f, readImage, decodeImage: decoded}));
  assert.equal(fs.existsSync(path.join(f.directory, 'source-brief.json')), false);
  fail = false; const complete = await linkedSourceImages({...f, readImage, decodeImage: decoded});
  assert.equal(complete.image_count, 3); assert.equal(counts.get(f.urls[0]), 1); assert.equal(counts.get(f.urls[1]), 2); assert.equal(counts.get(f.urls[2]), 1);
});

test('SYNTHETIC an image downloaded before decode failure is not blindly downloaded twice', async t => {
  const f = fixture(t, 1); let reads = 0, failed = false;
  await assert.rejects(() => linkedSourceImages({...f, readImage: async url => {reads++; return imageResult(url);}, decodeImage: () => {failed = true; throw Error('SYNTHETIC interrupted decoder');}}));
  assert.equal(failed, true);
  const complete = await linkedSourceImages({...f, readImage: async url => {reads++; return imageResult(url);}, decodeImage: decoded});
  assert.equal(complete.image_count, 1); assert.equal(reads, 1);
});

test('SYNTHETIC thirty-two-image support is bounded and thirty-three references stop before downloads', async t => {
  const accepted = fixture(t, 32); let reads = 0;
  const result = await linkedSourceImages({...accepted, readImage: async url => {reads++; return imageResult(url);}, decodeImage: decoded});
  assert.equal(result.image_count, 32); assert.equal(reads, 32);
  const manifest = JSON.parse(fs.readFileSync(result.brief_file, 'utf8'));
  assert.equal(manifest.limits.images, 32);
  assert.equal(validateSourceImages(manifest.images, {root: accepted.root, decodeImage: decoded}).length, 32);
  assert.throws(() => validateSourceImages([...manifest.images, manifest.images[0]], {root: accepted.root, decodeImage: decoded}), error => error.diagnostic?.code === 'image-limit');
  const excess = fixture(t, 33); reads = 0;
  const stopped = await linkedSourceImages({...excess, readImage: async url => {reads++; return imageResult(url);}, decodeImage: decoded});
  assert.equal(stopped.needs_materials, true); assert.equal(reads, 0);
});

test('SYNTHETIC aggregate thirty-MB image limit preserves partial receipts and never writes a successful final brief', async t => {
  const f = fixture(t, 7), large = Buffer.alloc(5000000); PNG.copy(large);
  await assert.rejects(() => linkedSourceImages({...f, readImage: async url => imageResult(url, large), decodeImage: decoded}), error => error.diagnostic?.code === 'image-limit');
  assert.equal(fs.existsSync(path.join(f.directory, 'source-brief.json')), false);
});

test('SYNTHETIC exact five-MB image bound is accepted but one byte over or a higher requested bound is rejected', async () => {
  const bytes = Buffer.alloc(5000000); PNG.copy(bytes);
  const result = await readSourceImage(URL_A, {lookup: publicLookup, transport: async (_url, _address, options) => {assert.equal(options.maxBytes, 5000000); return ok(bytes);}});
  assert.equal(result.size_bytes, 5000000); assert.equal(result.sha256, sha(bytes));
  const over = Buffer.alloc(5000001); PNG.copy(over);
  await assert.rejects(() => readSourceImage(URL_A, {lookup: publicLookup, maxBytes: 1000000000, transport: async (_url, _address, options) => {assert.equal(options.maxBytes, 5000000); return ok(over);}}), error => error.diagnostic?.code === 'image-too-large');
});

test('SYNTHETIC claim-time image validation rechecks bytes, confinement and decode without network', async t => {
  const f = fixture(t, 1), result = await linkedSourceImages({...f, readImage: async url => imageResult(url), decodeImage: decoded}), manifest = JSON.parse(fs.readFileSync(result.brief_file, 'utf8'));
  const files = await validateSourceImages(manifest.images, {root: f.root, decodeImage: decoded}); assert.equal(files.length, 1); assert.ok(path.isAbsolute(files[0]));
  fs.appendFileSync(manifest.images[0].file, 'SYNTHETIC tamper');
  assert.throws(() => validateSourceImages(manifest.images, {root: f.root, decodeImage: decoded}));
  const outside = path.join(f.root, 'outside-allowed-image-root.png'); fs.writeFileSync(outside, PNG); let outsideDecodes = 0;
  assert.throws(() => validateSourceImages([{...manifest.images[0], file: outside, sha256: sha(PNG), size_bytes: PNG.length}], {root: f.directory, decodeImage: () => {outsideDecodes++; return decoded();}}));
  assert.equal(outsideDecodes, 0, 'a real existing out-of-root file must be refused before a decoder is invoked');
});

test('SYNTHETIC technical image checks require bounded probe plus actual first-frame decode commands, using an injected runner', t => {
  const f = fixture(t, 0), file = path.join(f.root, 'SYNTHETIC.png'); fs.writeFileSync(file, PNG); const calls = [];
  const result = decodeSourceImage(file, {run: (command, args, options) => {
    calls.push({command, args, options});
    return command === 'ffprobe' ? {status: 0, stdout: JSON.stringify({streams: [{codec_type: 'video', codec_name: 'png', width: 1, height: 1}]})} : {status: 0, stdout: ''};
  }});
  assert.equal(result.decode, 'ffmpeg-first-frame-v1'); assert.deepEqual(calls.map(c => c.command), ['ffprobe', 'ffmpeg']);
  for (const call of calls) {assert.ok(call.args.includes('-protocol_whitelist')); assert.ok(call.args.includes('file,pipe')); assert.equal(call.options.windowsHide, true); assert.ok(call.options.timeout <= 15000);}
  assert.ok(calls[1].args.includes('-nostdin')); const frames = calls[1].args.indexOf('-frames:v'); assert.ok(frames >= 0); assert.equal(calls[1].args[frames + 1], '1');
  let runs = 0;
  assert.throws(() => decodeSourceImage(file, {run: () => {runs++; return {status: 0, stdout: JSON.stringify({streams: [{codec_type: 'video', width: 20000, height: 20000}]})};}})); assert.equal(runs, 1);
  assert.throws(() => decodeSourceImage(file, {run: command => command === 'ffprobe' ? {status: 0, stdout: JSON.stringify({streams: [{codec_type: 'video', width: 1, height: 1}]})} : {status: 1}}));
});

test('SYNTHETIC a successful image manifest detects later byte changes without fetching or overwriting', async t => {
  const f = fixture(t, 1); let reads = 0;
  const options = {...f, readImage: async url => {reads++; return imageResult(url);}, decodeImage: decoded}, result = await linkedSourceImages(options), original = fs.readFileSync(result.brief_file), manifest = JSON.parse(original);
  fs.appendFileSync(manifest.images[0].file, 'SYNTHETIC tampered image');
  await assert.rejects(() => linkedSourceImages(options), error => error.diagnostic?.code === 'image-cache');
  assert.equal(reads, 1); assert.deepEqual(fs.readFileSync(result.brief_file), original);
});

test('SYNTHETIC cached image manifests cannot silently omit article references or their materialized images', async t => {
  for (const omit of ['reference', 'image']) {
    const f = fixture(t, 3); let reads = 0;
    const options = {...f, readImage: async url => {reads++; return imageResult(url);}, decodeImage: decoded};
    const result = await linkedSourceImages(options), manifest = JSON.parse(fs.readFileSync(result.brief_file, 'utf8'));
    if (omit === 'reference') manifest.references.pop(); else manifest.images.pop();
    fs.writeFileSync(result.brief_file, JSON.stringify(manifest)); const altered = fs.readFileSync(result.brief_file);
    await assert.rejects(() => linkedSourceImages(options), error => error.diagnostic?.code === 'image-cache');
    assert.equal(reads, 3); assert.deepEqual(fs.readFileSync(result.brief_file), altered);
  }
});
