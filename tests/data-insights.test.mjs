// SYNTHETIC, isolated full-migration SQLite / pure analytics only.
// No private metrics, network, model, executor, real media or live data writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {metrics, samplingWindow} from '../lib/data-contract.mts';
import {channelReview} from '../lib/data-details.mts';
import {OWNER, T, T24, T48, clone, video, sample, relation, sixWorks, sqliteFixture} from './data-insights-fixture.mjs';

const built = await build({stdin: {contents: "export {buildDataInsights} from './lib/data-insights.mts'; export {dataCenter,saveSample} from './lib/data-center'; export {dataExport} from './lib/data-export';", resolveDir: process.cwd()}, bundle: true, platform: 'node', format: 'esm', write: false, footer: {js: '//# sourceURL=synthetic-data-insights-under-test.mjs'}, plugins: [{name: 'synthetic-insights-db', setup(b) {
  b.onResolve({filter: /^\.\/store$/}, () => ({path: 'db', namespace: 'fixture'}));
  b.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: 'export function db(){return globalThis.__dataInsightsDb}'}));
}}]});
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
const NOW = '2026-10-16T00:00:00.000Z';
const analyze = input => api.buildDataInsights(input, {now: NOW});
const empty = () => ({videos: [], samples: [], relations: [], evidence: [], analysis_reports: []});
const find = (data, id) => data.videos.find(v => v.video_id === id);
const only = (samples, extra = {}) => ({...empty(), videos: [video('v')], samples, ...extra});
const allFindings = data => [...data.feedback.positives, ...data.feedback.problems, ...data.feedback.next_steps];

test('SYNTHETIC native interval retains normal metrics and trends while exports describe conservative time semantics',async t=>{
 const interval={range_start:'2026-10-10T07:12:56.810127Z',range_end:'2026-10-10T07:13:56.858140Z',evidence_note:'SYNTHETIC native success observed'},anchor='2026-10-10T07:13:56.859Z';
 const publication_source=JSON.stringify({schema:'owner-click-publication-v1',time_source:'native_observation',precision:'observed_interval',display_time:'SYNTHETIC',timestamp_role:'collection_anchor',platform:'wechat_channels',video:{storage:'site-private-r2',site_archive_id:'SYNTHETIC',sha256:'a'.repeat(64)},independent_platform_verification:false,exact_platform_published_at:null,collection_anchor_rule:'observation_range_end',native_observation:interval});
 const input={...empty(),videos:[video('native',{published_at:anchor,publication_source,duration:37})],samples:[sample('native24','native','2026-10-11T07:13:56.859Z',{plays:100,likes:2},{sample_kind:'single_t24'}),sample('native48','native','2026-10-12T07:13:56.859Z',{plays:120,likes:3},{sample_kind:'single_t48'})]};
 const d=analyze(input),v=find(d,'native');assert.equal(v.publication_precision,'observed_interval');assert.match(v.publication_time_description,/官方精确发布时间未知/);assert.equal(v.latest_panel.metrics.plays,120);assert.equal(v.series[0].latest_pair.metrics.plays.delta,20);assert.equal(d.coverage.paired_series,1);assert.equal(d.coverage.comparable_t24_videos,0);assert.equal(v.series[0].points[0].window_comparable,false);
 sqliteFixture(t,input);const persisted=await api.dataCenter(OWNER);
 for(const format of ['summary_csv','history_csv']){const csv=await api.dataExport(persisted,format).text();assert.match(csv,/publication_observation_range_start/);assert.match(csv,/2026-10-10T07:12:56\.810127Z/);assert.match(csv,/2026-10-10T07:13:56\.858140Z/);assert.match(csv,/conservative_upper_bound_collection_anchor/);assert.match(csv,/observed_interval/);}
});

test('SYNTHETIC six-work coverage includes relation-only portraits and an explicit unsampled follow-up', () => {
  const input = sixWorks(), data = analyze(input);
  assert.equal(data.schema, 'data-insights-v1'); assert.equal(data.method, 'deterministic-recorded-data');
  assert.equal(data.coverage.logical_videos, 6); assert.equal(data.coverage.video_records, 6);
  assert.equal(data.coverage.sample_records, 9); assert.equal(data.coverage.effective_samples, 9);
  assert.equal(data.coverage.sampled_videos, 5); assert.equal(data.coverage.unsampled_videos, 1);
  assert.equal(data.coverage.metric_samples.plays, 9); assert.equal(data.coverage.metric_videos.plays, 5);
  assert.equal(data.coverage.paired_series, 4);
  assert.equal(data.videos.length, 6);
  for (const raw of input.videos) assert.ok(data.feedback.markdown.includes(raw.title), 'all works need a report section, including unsampled work');
  for (const id of ['old-a', 'old-b', 'old-c']) {
    const v = find(data, id); assert.equal(v.latest_panel.family, 'relation'); assert.equal(v.latest_single, null);
    assert.equal(v.latest_panel.sample_kind, 'relation_followup'); assert.ok(v.positives.length + v.problems.length + v.next_steps.length > 0);
  }
  const missing = find(data, 'uncaptured'); assert.equal(missing.latest_panel, null); assert.ok(missing.next_steps.length > 0);
  assert.ok(missing.next_steps.some(f => f.basis === 'coverage' || f.basis === 'next_test'));
  assert.ok(Object.values(missing.last_known_metrics).every(value => value === null));
  assert.equal(data.overview.latest_panel_plays_sum, 979); assert.equal(data.overview.plays_video_n, 5);
  assert.equal(data.overview.metric_summaries.three_second_rate.median, 52);
  assert.equal(data.overview.metric_summaries.three_second_rate.n, 5);
});

test('SYNTHETIC empty/all-null data has no invented zero, trend, platform percentile or score', () => {
  const noData = analyze(empty());
  assert.equal(noData.overview.latest_panel_plays_sum, null); assert.equal(noData.coverage.logical_videos, 0);
  assert.deepEqual(noData.postpublish_changes, []);
  const data = analyze(only([sample('nulls', 'v', T24)]));
  assert.equal(find(data, 'v').latest_panel.metrics.plays, null);
  assert.equal(data.overview.plays_video_n, 0); assert.equal(data.overview.latest_panel_plays_sum, null);
  assert.ok(Object.values(data.overview.metric_summaries).every(s => s.n === 0 && s.median === null));
  assert.equal(allFindings(data).some(f => f.basis === 'platform_percentile'), false);
  assert.equal(/"(?:quality_score|overall_score|rating|score)"\s*:/.test(JSON.stringify(data)), false);
});

test('SYNTHETIC latest panel retains null; last-known metrics identify their older source and timestamp', () => {
  const data = analyze(only([sample('earlier', 'v', T24, {plays: 0, likes: 3}), sample('current', 'v', T48, {plays: 10})]));
  const v = find(data, 'v'); assert.equal(v.latest_panel.sample_id, 'current'); assert.equal(v.latest_panel.metrics.likes, null);
  assert.equal(v.last_known_metrics.likes.value, 3); assert.equal(v.last_known_metrics.likes.sample_id, 'earlier'); assert.equal(v.last_known_metrics.likes.observed_at, T24);
  assert.equal(data.postpublish_changes[0].metrics.likes.delta, null);
  assert.equal(data.overview.metric_summaries.likes.n, 0, 'latest-panel aggregate must not silently carry older likes forward');
});

test('SYNTHETIC measured zeros remain valid observations in coverage, medians and panel totals', () => {
  const data = analyze(only([sample('measured-zero', 'v', T24, {plays: 0, likes: 0, three_second_rate: 0, completion_rate: 0, average_duration: 0})]));
  assert.equal(data.overview.latest_panel_plays_sum, 0); assert.equal(data.overview.plays_video_n, 1);
  for (const key of ['plays', 'likes', 'three_second_rate', 'completion_rate', 'average_duration']) {
    assert.equal(data.coverage.metric_samples[key], 1); assert.equal(data.overview.metric_summaries[key].n, 1); assert.equal(data.overview.metric_summaries[key].median, 0);
  }
  assert.equal(data.overview.metric_summaries.shares.n, 0); assert.equal(data.overview.metric_summaries.shares.median, null);
});

test('SYNTHETIC rate differences are percentage points and zero baselines never create infinite relative growth', () => {
  const data = analyze(only([sample('before', 'v', T24, {plays: 0, likes: 0, three_second_rate: 54, average_duration: 9}), sample('after', 'v', T48, {plays: 10, likes: 0, three_second_rate: 56, average_duration: 10})]));
  const d = data.postpublish_changes[0]; assert.equal(d.interval_hours, 24); assert.equal(d.delta_eligible, true);
  assert.equal(d.metrics.plays.delta, 10); assert.equal(d.metrics.plays.relative_pct, null);
  assert.equal(d.metrics.likes.delta, 0); assert.equal(d.metrics.likes.relative_pct, null);
  assert.equal(d.metrics.three_second_rate.delta, 2); assert.equal(d.metrics.three_second_rate.unit, 'percentage_points'); assert.equal(d.metrics.three_second_rate.relative_pct, null);
  assert.equal(d.metrics.average_duration.delta, 1); assert.equal(d.metrics.average_duration.unit, 'seconds');
});

test('SYNTHETIC one work may use a relation panel while own/relation series and different relations never mix deltas', () => {
  const records = [sample('own-a', 'v', T24, {plays: 10}, {sample_kind: 'single_t24'}), sample('rel-a', 'v', '2026-10-11T01:00:00.000Z', {plays: 100}, {sample_kind: 'relation_baseline', relation_id: 'r'}), sample('own-b', 'v', T48, {plays: 20}, {sample_kind: 'single_t48'}), sample('rel-b', 'v', '2026-10-12T01:00:00.000Z', {plays: 150}, {sample_kind: 'relation_followup', relation_id: 'r'}), sample('other-rel', 'v', '2026-10-13T00:00:00.000Z', {plays: 999}, {sample_kind: 'relation_baseline', relation_id: 'r2'})];
  const input = only(records, {videos: [video('v', {published_at: '2026-10-08T00:00:00.000Z'}), video('new'), video('new2')], relations: [relation('r', 'v'), relation('r2', 'v', {new_video_id: 'new2'})]}), data = analyze(input), v = find(data, 'v');
  assert.equal(v.latest_panel.sample_id, 'other-rel'); assert.equal(v.latest_single.sample_id, 'own-b');
  assert.equal(v.series.length, 3); assert.equal(data.postpublish_changes.length, 2);
  assert.deepEqual(data.postpublish_changes.map(d => d.metrics.plays.delta).sort((a, b) => a - b), [10, 50]);
  assert.equal(data.postpublish_changes.find(d => d.group_key === 'single').metrics.plays.relative_pct, 100);
  for (const change of data.postpublish_changes) assert.equal(change.baseline.group_key, change.followup.group_key);
  const review = channelReview(input.videos, input.samples, input.relations).histories.find(h => h.video.id === 'v');
  assert.equal(review.latest.id, 'other-rel'); assert.equal(review.changes.plays, null, 'legacy total-table delta cannot span different relation groups');
});

test('SYNTHETIC same-time observations do not create a zero-hour improvement', () => {
  const data = analyze(only([sample('same-a', 'v', T24, {plays: 100}), sample('same-b', 'v', T24, {plays: 120})]));
  assert.equal(data.postpublish_changes.length, 1); const d = data.postpublish_changes[0];
  assert.equal(d.delta_eligible, false); assert.equal(d.interval_hours, 0); assert.equal(d.metrics.plays.delta, null); assert.ok(d.reasons.length > 0);
});

test('SYNTHETIC ambiguous same-time baselines stay unavailable in analytics and legacy CSV review alike', () => {
  const input = only([sample('duplicate-a', 'v', T24, {plays: 100}), sample('duplicate-b', 'v', T24, {plays: 120}), sample('later', 'v', T48, {plays: 150})]), data = analyze(input);
  assert.ok(data.postpublish_changes.every(d => !d.delta_eligible && d.metrics.plays.delta === null));
  const review = channelReview(input.videos, input.samples, input.relations).histories[0];
  assert.equal(review.changes.plays, null, 'summary CSV cannot select an arbitrary same-time baseline that current analytics rejects');
});

test('SYNTHETIC cumulative decreases stay signed and flagged instead of being presented as negative recommendation effect', () => {
  const data = analyze(only([sample('reset-a', 'v', T24, {plays: 100}), sample('reset-b', 'v', T48, {plays: 90})]));
  const d = data.postpublish_changes[0]; assert.equal(d.metrics.plays.delta, -10); assert.equal(d.metrics.plays.counter_decreased, true);
  assert.ok(find(data, 'v').problems.length > 0); assert.match(data.feedback.markdown, /口径|重计|下降/);
  assert.ok(d.interpretation.length > 0, 'retain the interpretation boundary beside the signed observation');
});

test('SYNTHETIC correction chains count one logical work and exclude replaced samples without rewriting original inputs', () => {
  const original = video('original'), current = video('corrected', {supersedes_id: 'original', created_at: T48});
  const before = sample('before', 'original', T24, {plays: 100}), bad = sample('bad', 'original', T48, {plays: 999999}), fixed = sample('fixed', 'corrected', T48, {plays: 120}, {supersedes: 'bad'});
  const input = {...empty(), videos: [original, current], samples: [before, bad, fixed]}, snapshot = clone(input), data = analyze(input);
  assert.equal(data.coverage.video_records, 2); assert.equal(data.coverage.logical_videos, 1); assert.equal(data.coverage.sample_records, 3); assert.equal(data.coverage.effective_samples, 2);
  assert.equal(data.videos[0].video_id, 'corrected'); assert.equal(data.videos[0].latest_panel.sample_id, 'fixed'); assert.equal(data.postpublish_changes[0].metrics.plays.delta, 20);
  assert.equal(data.videos[0].series.flatMap(s => s.points).some(p => p.sample_id === 'bad'), false); assert.deepEqual(input, snapshot);
});

test('SYNTHETIC publication precision, late observations and separate diagnostic times retain their actual meaning', () => {
  const approximate = JSON.stringify({schema: 'reported-publication-v1', precision: 'approximate', time_source: 'self_reported', timestamp_role: 'ordering_anchor_only', display_time: 'SYNTHETIC approximate date'});
  const input = only([sample('at-24', 'v', T24, {plays: 10}, {sample_kind: 'single_t24', diagnostic: {observed_at: '2026-10-10T23:00:00.000Z', plays: 9}})], {videos: [video('v', {publication_source: approximate})]}), data = analyze(input), point = find(data, 'v').latest_panel;
  assert.equal(point.observed_at, T24); assert.equal(point.diagnostic_at, '2026-10-10T23:00:00.000Z'); assert.equal(point.metrics.plays, 10); assert.equal(point.diagnostic_plays, 9);
  assert.equal(point.window_comparable, false); assert.equal(data.coverage.comparable_t24_videos, 0);
  const late = analyze(only([sample('late', 'v', T48, {plays: 500}, {sample_kind: 'single_t24'})])); assert.equal(find(late, 'v').latest_panel.actual_hours, 48); assert.equal(late.coverage.comparable_t24_videos, 0);
  assert.equal(samplingWindow(T, '2026-10-11T06:00:00+08:00', 24).comparable, true);
  assert.equal(samplingWindow(T, '2026-10-11T10:00:00+08:00', 24).comparable, true);
  assert.equal(samplingWindow(T, '2026-10-11T05:59:59+08:00', 24).comparable, false);
});

test('SYNTHETIC missing/unknown observation times do not acquire invented chronological baselines', () => {
  const data = analyze(only([sample('unknown', 'v', null, {plays: 900}), sample('known', 'v', T24, {plays: 10})]));
  assert.equal(find(data, 'v').latest_panel.sample_id, 'known'); assert.equal(data.coverage.observed_samples, 1);
  assert.equal(data.postpublish_changes.some(d => d.delta_eligible), false);
});

test('SYNTHETIC recorded platform percentiles keep their original value/source and never become invented scores', () => {
  const data = analyze(sixWorks()), p = find(data, 'snapshot').latest_panel.platform_percentiles;
  assert.equal(p.length, 4); const completion = p.find(p => p.metric === 'completion_rate');
  assert.equal(completion.value, 20); assert.equal(completion.source_sample_id, 'snapshot-only'); assert.equal(completion.observed_at, T48); assert.ok(completion.source_label);
  const plain = analyze(only([sample('no-peer', 'v', T24, {completion_rate: 99})]));
  assert.equal(find(plain, 'v').latest_panel.platform_percentiles.length, 0); assert.equal(allFindings(plain).some(f => f.basis === 'platform_percentile'), false);
});

test('SYNTHETIC percentile finding evidence belongs to the platform diagnostic cutoff, not the later panel capture', () => {
  const cutoff = '2026-10-10T23:00:00.000Z', data = analyze(only([sample('separate-cutoff', 'v', T24, {plays: 10, completion_rate: 12}, {peer: {completion: 20}, labels: {completion: '低'}, diagnostic: {observed_at: cutoff, plays: 9}})]));
  const point = find(data, 'v').latest_panel, finding = allFindings(data).find(f => f.basis === 'platform_percentile');
  assert.equal(point.observed_at, T24); assert.equal(point.platform_percentiles[0].observed_at, cutoff);
  assert.ok(finding); assert.equal(finding.evidence[0].value, 20); assert.equal(finding.evidence[0].observed_at, cutoff);
  assert.equal(finding.evidence[0].metric, 'completion_rate');
  assert.equal(finding.evidence[0].captured_at, T24); assert.equal(finding.evidence[0].statistical_cutoff_at, cutoff); assert.equal(finding.evidence[0].value_kind, 'platform_percentile');
});

test('SYNTHETIC Library-source metadata and site evidence are separate valid trace links, not fabricated image verification', () => {
  const input = sixWorks();
  input.samples.forEach((s, i) => {
    s.note = JSON.stringify({...JSON.parse(s.note), source: {library_file_id: 'libfile_a' + i.toString(16), sha256: 'f'.repeat(64), file_name: 'SYNTHETIC original-' + i + '.png'}});
    if (i < 4) {s.evidence_ids = JSON.stringify(['site-image-' + i]); input.evidence.push({id: 'site-image-' + i, file_name: 'SYNTHETIC site-' + i + '.png', sha256: 'f'.repeat(64)});}
  });
  const data = analyze(input), points = data.videos.flatMap(v => v.series.flatMap(s => s.points));
  assert.equal(data.coverage.evidence_samples, 9);
  assert.equal(data.coverage.library_source_samples, 9); assert.equal(data.coverage.onsite_evidence_samples, 4); assert.equal(data.coverage.onsite_evidence_records, 4);
  assert.equal(points.filter(p => p.source?.library_file_id).length, 9);
  assert.equal(points.reduce((sum, p) => sum + p.evidence_ids.length, 0), 4);
  for (const point of points) assert.ok(point.source.sha256 === 'f'.repeat(64));
  assert.deepEqual(Object.keys(data.overview.metric_summaries).sort(), Object.keys(metrics({})).sort(), 'no unverified three-second-to-completion funnel metric is invented');
});

test('SYNTHETIC findings cite included samples and exact recorded numbers or explicit platform percentiles', () => {
  const input = sixWorks(), data = analyze(input), raw = new Map(input.samples.map(s => [s.id, s]));
  assert.ok(allFindings(data).length > 0);
  for (const finding of allFindings(data)) {
    for (const id of finding.video_ids) assert.ok(input.videos.some(v => v.id === id));
    for (const id of finding.sample_ids) assert.ok(raw.has(id));
    for (const evidence of finding.evidence) {
      assert.ok(raw.has(evidence.sample_id));
      if (finding.basis === 'platform_percentile') {
        const point = data.videos.flatMap(v => v.series.flatMap(s => s.points)).find(p => p.sample_id === evidence.sample_id);
        assert.ok(point.platform_percentiles.some(p => p.metric === evidence.metric && p.value === evidence.value));
      } else {assert.equal(evidence.observed_at, raw.get(evidence.sample_id).observed_at); assert.equal(evidence.value, JSON.parse(raw.get(evidence.sample_id).metrics)[evidence.metric]);}
    }
  }
});

test('SYNTHETIC signatures ignore input order and report runtime, but change when underlying evidence changes', () => {
  const input = sixWorks(), original = analyze(input), reversed = {...input, videos: [...input.videos].reverse(), samples: [...input.samples].reverse(), relations: [...input.relations].reverse()};
  assert.equal(original.source_signature, analyze(reversed).source_signature);
  assert.equal(original.source_signature, api.buildDataInsights(input, {now: '2026-10-17T00:00:00.000Z'}).source_signature);
  const changed = clone(input); changed.samples[0].metrics = JSON.stringify(metrics({plays: 78})); assert.notEqual(original.source_signature, analyze(changed).source_signature);
});

test('SYNTHETIC historical partial reports cannot masquerade as full current coverage', () => {
  const input = sixWorks(); input.analysis_reports = [{request_id: 'SYNTHETIC-old-report', title: 'SYNTHETIC historical subset', created_at: T48, video_ids: ['old-a'], sample_request_ids: ['SYNTHETIC-sample-r-a-24'], markdown: 'SYNTHETIC subset only'}];
  const data = analyze(input), report = data.historical_reports[0];
  assert.equal(report.coverage_current, false); assert.ok(report.uncovered_video_ids.includes('uncaptured')); assert.ok(report.uncovered_sample_ids.length > 0);
  assert.equal(data.videos.length, 6, 'a historical subset cannot replace the current all-work analysis');
});

test('SYNTHETIC real D1-style read integration computes all six portraits, isolates owners and writes nothing', async t => {
  const input = sixWorks(), other = video('other-owner', {owner_id: 'SYNTHETIC-other-owner'}); input.videos.push(other); input.samples.push(sample('other-owner-point', other.id, T24, {plays: 987654}));
  const f = sqliteFixture(t, input), before = f.sql.prepare('SELECT * FROM production_data_samples ORDER BY id').all();
  const data = await api.dataCenter(OWNER);
  assert.equal(data.analytics.videos.length, 6); assert.equal(data.analytics.coverage.logical_videos, 6); assert.equal(data.analytics.overview.latest_panel_plays_sum, 979);
  assert.equal(JSON.stringify(data.analytics).includes('987654'), false); assert.equal(JSON.stringify(data.analytics).includes('other-owner'), false);
  assert.deepEqual(f.sql.prepare('SELECT * FROM production_data_samples ORDER BY id').all(), before);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n, 0);
  const exported = JSON.parse(await api.dataExport(data, 'json').text()); assert.deepEqual(exported.analytics, data.analytics);
  const feedback = api.dataExport(data, 'feedback_md'); assert.equal(await feedback.text(), data.analytics.feedback.markdown); assert.equal(feedback.headers.get('cache-control'), 'private, no-store');
  for (const v of data.analytics.videos) assert.ok(data.analytics.feedback.markdown.includes(v.title));
});

test('SYNTHETIC persisted correction changes current analytics without mutating source samples or historical counts', async t => {
  const input = sixWorks(), f = sqliteFixture(t, input), original = f.sql.prepare('SELECT * FROM production_data_samples WHERE id=?').get('own-48');
  const first = await api.dataCenter(OWNER), corrected = await api.saveSample(OWNER, {request_id: 'SYNTHETIC-corrected-48', video_id: 'new', sample_kind: 'single_t48', relation_id: null, observed_at: T48, metrics: {plays: 520}, note: 'SYNTHETIC correction, not a content edit or intervention', evidence_ids: [], supersedes_id: 'own-48'});
  const second = await api.dataCenter(OWNER);
  assert.equal(second.analytics.coverage.sample_records, 10); assert.equal(second.analytics.coverage.effective_samples, 9); assert.equal(second.analytics.videos.length, 6);
  assert.equal(find(second.analytics, 'new').latest_panel.sample_id, corrected.sample.id); assert.equal(find(second.analytics, 'new').latest_panel.metrics.plays, 520);
  assert.notEqual(first.analytics.source_signature, second.analytics.source_signature); assert.deepEqual(f.sql.prepare('SELECT * FROM production_data_samples WHERE id=?').get('own-48'), original);
  assert.equal((await api.saveSample(OWNER, {request_id: 'SYNTHETIC-corrected-48', video_id: 'new', sample_kind: 'single_t48', relation_id: null, observed_at: T48, metrics: {plays: 520}, note: 'SYNTHETIC correction, not a content edit or intervention', evidence_ids: [], supersedes_id: 'own-48'})).replayed, true);
});
