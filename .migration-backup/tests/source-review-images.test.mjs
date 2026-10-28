// SYNTHETIC local files and injected review runner. No Codex/model/worker process,
// network, actual visual inspection, genuine approval or production state.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {textCliArgs} from '../scripts/bounded-codex-cli.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const bundle = await build({entryPoints: ['scripts/milestone-cli.mjs'], bundle: true, platform: 'node', format: 'esm', write: false, footer: {js: '//# sourceURL=synthetic-source-review-images-under-test.mjs'}, plugins: [{name: 'synthetic-review-runner', setup(b) {
  b.onResolve({filter: /^\.\/bounded-codex-cli\.mjs$/}, () => ({path: 'SYNTHETIC-no-process', namespace: 'fixture'}));
  b.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: 'export const boundedCodexCli = options => globalThis.__sourceReviewImagesMock(options);'}));
}}]});
const {reviewText} = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'));

function fixture(t, count = 23) {
  const parent = path.resolve('.sites-runtime'); fs.mkdirSync(parent, {recursive: true});
  const root = fs.mkdtempSync(path.join(parent, 'SYNTHETIC-review-images-'));
  const savedAppData = process.env.APPDATA; process.env.APPDATA = root;
  const fakeCli = path.join(root, 'npm/node_modules/@openai/codex/bin/codex.js'); fs.mkdirSync(path.dirname(fakeCli), {recursive: true}); fs.writeFileSync(fakeCli, '// SYNTHETIC existence fixture; never executed');
  t.after(() => {delete globalThis.__sourceReviewImagesMock; if (savedAppData === undefined) delete process.env.APPDATA; else process.env.APPDATA = savedAppData; const target = path.resolve(root); assert.equal(path.dirname(target), parent); assert.ok(path.basename(target).startsWith('SYNTHETIC-review-images-')); fs.rmSync(target, {recursive: true, force: true});});
  const sourceFile = path.join(root, 'source.txt'); fs.writeFileSync(sourceFile, 'SYNTHETIC exact original article.');
  const sources = [{url: 'https://article.example.org/SYNTHETIC', file: sourceFile, sha256: sha(fs.readFileSync(sourceFile))}];
  for (let i = 0; i < count; i++) {const file = path.join(root, 'SYNTHETIC-original-' + i + '.png'); fs.writeFileSync(file, 'SYNTHETIC image bytes ' + i); sources.push({url: 'https://images.example.org/SYNTHETIC-' + i + '.png', file, sha256: sha(fs.readFileSync(file)), kind: 'image'});}
  const files = {'SKILL.md': 'SYNTHETIC immutable skill for a runner test.'}, artifact = JSON.stringify({evidence: sources.map(({file: _file, ...row}) => row), materials: 'SYNTHETIC original evidence', limits: 'SYNTHETIC no visual inspection or approval'});
  const job = {id: 'SYNTHETIC-review-job', mode_epoch: 0, source_snapshot: JSON.stringify({url: sources[0].url}), skill_snapshot: JSON.stringify({files, sha256: sha(JSON.stringify(files))})};
  const milestone = {node: 'source', revision: 1, artifact, artifact_hash: sha(artifact)};
  return {root, sources, job, milestone, fakeCli};
}

test('SYNTHETIC source review binds all twenty-three exact image paths and hashes without executing a CLI', async t => {
  const f = fixture(t), images = f.sources.filter(source => source.kind === 'image').map(source => path.resolve(source.file)); let runs = 0;
  globalThis.__sourceReviewImagesMock = async options => {
    runs++; assert.deepEqual(options.images, images); assert.equal(options.cli, f.fakeCli);
    const args = textCliArgs({...options}), begin = args.indexOf('--image'), end = args.indexOf('--color');
    assert.ok(begin > 0); assert.deepEqual(args.slice(begin + 1, end), images); assert.equal(args.filter(value => images.includes(value)).length, 23);
    assert.ok(args.includes('--sandbox')); assert.ok(args.includes('read-only')); assert.ok(args.includes('--ignore-user-config'));
    for (const source of f.sources) {assert.ok(options.prompt.includes(source.sha256)); assert.equal(sha(fs.readFileSync(source.file)), source.sha256);}
    const criteria = ['source_identity', 'facts', 'materials', 'limits'];
    fs.writeFileSync(options.output, JSON.stringify({decision: 'pause', reason: 'SYNTHETIC runner only; human inspection required', checks: criteria.map(criterion => ({criterion, pass: false, reason: 'SYNTHETIC no genuine image inspection', evidence: 'SYNTHETIC original evidence', visual_observations: 'SYNTHETIC injected output, not a genuine visual observation'}))}));
    return {exit_code: 0, error_code: 'CLI_COMPLETED', scope: 'SYNTHETIC injected runner; no process started'};
  };
  const options = {...f, root: path.join(f.root, 'reviews')}, result = await reviewText(options);
  assert.equal(runs, 1); assert.equal(result.decision, 'pause'); assert.deepEqual(result.inspected_images, f.sources.slice(1).map(source => source.sha256)); assert.deepEqual(result.receipt.image_hashes, result.inspected_images);
  assert.ok(f.sources.every(source => result.inspected_sources.includes(source.sha256)));
  assert.equal((await reviewText(options)).decision, 'pause'); assert.equal(runs, 1, 'exact cached review is read without another runner call');
  fs.appendFileSync(f.sources.at(-1).file, 'SYNTHETIC altered bytes');
  await assert.rejects(() => reviewText(options), /hash/i); assert.equal(runs, 1, 'changed image bytes cannot reuse approval or start a new runner');
});

test('SYNTHETIC source review still rejects missing exact source, changed skill and excessive image inputs before the runner', async t => {
  const f = fixture(t, 34); let runs = 0; globalThis.__sourceReviewImagesMock = async () => {runs++; throw Error('SYNTHETIC runner must not execute');};
  await assert.rejects(() => reviewText({...f, root: path.join(f.root, 'reviews')}), /bounded input/);
  await assert.rejects(() => reviewText({...f, sources: f.sources.slice(1), root: path.join(f.root, 'reviews')}), /Missing exact materialized source/);
  const skill = JSON.parse(f.job.skill_snapshot); skill.files['SKILL.md'] += 'SYNTHETIC changed';
  await assert.rejects(() => reviewText({...f, job: {...f.job, skill_snapshot: JSON.stringify(skill)}, root: path.join(f.root, 'reviews')}), /Frozen skill contents/);
  assert.equal(runs, 0);
});
