// SYNTHETIC, isolated full-migration SQLite / pure analytics only.
// No private metrics, network, model, executor, real media or live data writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {metrics, samplingWindow} from '../lib/data-contract.mts';
import {channelReview} from '../lib/data-details.mts';
import {OWNER, T, T24, T48, clone, video, sample, relation, sixWorks, sqliteFixture} from './data-insights-fixture.mjs';

const built = await build({stdin: {contents: "export {buildDataInsights} from './lib/data-insights.mts'; export {dataCenter,dataCenterOverview,dataCenterWorkspace,dataCenterSamples,dataCenterVideos,dataCenterRelations,dataCenterEvidencePage,dataCenterEvidenceSelection,dataCenterHistory,dataCenterHistoryLocation,saveSample} from './lib/data-center'; export {dataExport} from './lib/data-export'; export {analysisReport} from './lib/data-analysis';", resolveDir: process.cwd()}, bundle: true, platform: 'node', format: 'esm', write: false, footer: {js: '//# sourceURL=synthetic-data-insights-under-test.mjs'}, plugins: [{name: 'synthetic-insights-db', setup(b) {
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

test('overview retains full-history analytics and counts without raw ledger',async t=>{const input=sixWorks();sqliteFixture(t,input);const full=await api.dataCenter(OWNER),small=await api.dataCenterOverview(OWNER);assert.deepEqual(small.logical_counts,full.logical_counts);assert.equal(small.review.effective_samples,full.review.effective_samples);assert.equal(small.review.all_sample_records,full.review.all_sample_records);assert.equal(small.evidence_count,full.evidence.length);assert.equal(small.video_record_count,full.videos.length);const a=structuredClone(full.analytics),b=structuredClone(small.analytics);delete a.generated_at;delete b.generated_at;assert.deepEqual(b,a);for(const key of ['videos','samples','relations','evidence','analysis_reports','current_videos'])assert.equal(key in small,false);});
test('paged raw samples preserve full analytics, exports, owner isolation and prior corrections',async t=>{const videos=[video('own'),video('other',{owner_id:'SYNTHETIC-other'})],samples=Array.from({length:45},(_,i)=>sample('sample-'+String(i).padStart(2,'0'),'own',T24,{plays:i},{created_at:T24,...(i===44?{supersedes:'sample-00'}:{})}));samples.push(sample('other-sample','other',T24,{plays:999}));sqliteFixture(t,{videos,samples,relations:[],evidence:[],analysis_reports:[]});const full=await api.dataCenter(OWNER),view=await api.dataCenterWorkspace(OWNER),a=await api.dataCenterSamples(OWNER,0),b=await api.dataCenterSamples(OWNER,20),c=await api.dataCenterSamples(OWNER,40);assert.deepEqual([a.samples.length,b.samples.length,c.samples.length],[20,20,5]);assert.deepEqual([a.has_more,b.has_more,c.has_more],[true,true,false]);assert.equal(new Set([...a.samples,...b.samples,...c.samples].map(s=>s.id)).size,45);assert.equal((await api.dataCenterSamples('SYNTHETIC-other',0)).samples.length,1);assert.equal(view.samples.length,0);assert.equal('canonical_samples' in view,false);assert.equal('analytics' in view,false);assert.equal('revision_roots' in view,false);assert.equal('rows' in view.review,false);assert.ok(JSON.stringify(view).length<JSON.stringify(full).length/2,'workspace should omit the historical duplicates');assert.equal(view.review.histories[0].samples.length,0);assert.equal(view.review.histories[0].sample_count,45);const first=await api.dataCenterHistory(OWNER,'own',0),last=await api.dataCenterHistory(OWNER,'own',40);assert.equal(first.samples.length,20);assert.equal(last.samples.length,5);assert.equal(first.samples.find(s=>s.id==='sample-00').effective,false);assert.equal(last.samples.find(s=>s.id==='sample-44').effective,true);await assert.rejects(()=>api.dataCenterHistory('SYNTHETIC-other','own',0),e=>e.status===404);const location=await api.dataCenterHistoryLocation(OWNER,'sample-44');assert.equal(location.video_id,'own');assert.equal(location.sample.id,'sample-44');await assert.rejects(()=>api.dataCenterHistoryLocation('SYNTHETIC-other','sample-44'),e=>e.status===404);assert.equal(view.review.all_sample_records,45);assert.equal(view.review.effective_samples,44);assert.deepEqual(view.logical_counts,full.logical_counts);const history=await api.dataExport(full,'history_csv').text();assert.match(history,/sample-00/);assert.match(history,/sample-44/);});
test('paged publication records preserve complete correction chain, current form fields and full export',async t=>{const videos=Array.from({length:45},(_,i)=>video('work-'+String(i).padStart(2,'0'),{created_at:T24}));videos.push(video('private-other',{owner_id:'SYNTHETIC-other'}));sqliteFixture(t,{videos,samples:[],relations:[],evidence:[],analysis_reports:[]});const full=await api.dataCenter(OWNER),workspace=await api.dataCenterWorkspace(OWNER),a=await api.dataCenterVideos(OWNER,0),b=await api.dataCenterVideos(OWNER,20),c=await api.dataCenterVideos(OWNER,40);assert.deepEqual([a.videos.length,b.videos.length,c.videos.length],[20,20,5]);assert.equal(new Set([...a.videos,...b.videos,...c.videos].map(v=>v.id)).size,45);assert.equal((await api.dataCenterVideos('SYNTHETIC-other',0)).videos.length,1);assert.equal(workspace.videos.length,45);assert.equal(workspace.videos[0].record_hash,undefined);assert.equal(workspace.videos[0].publication_source,full.videos[0].publication_source);const exported=await api.dataExport(full,'json').text();assert.match(exported,/work-00/);assert.match(exported,/work-44/);});
test('evidence metadata pages and selected older screenshots remain owner scoped',async t=>{const evidence=Array.from({length:45},(_,i)=>({id:'evidence-'+String(i).padStart(2,'0'),owner_id:OWNER,file_name:'synthetic-'+i+'.png',content_type:'image/png',sha256:i.toString(16).padStart(64,'0'),size_bytes:10,image_base64:'',created_at:T24,storage_kind:'d1'}));evidence.push({...evidence[0],id:'evidence-other',owner_id:'SYNTHETIC-other'});sqliteFixture(t,{videos:[],samples:[],relations:[],evidence,analysis_reports:[]});const view=await api.dataCenterWorkspace(OWNER),a=await api.dataCenterEvidencePage(OWNER,0),b=await api.dataCenterEvidencePage(OWNER,20),c=await api.dataCenterEvidencePage(OWNER,40),selected=await api.dataCenterEvidenceSelection(OWNER,['evidence-00','evidence-other']);assert.equal(view.evidence.length,0);assert.deepEqual([a.evidence.length,b.evidence.length,c.evidence.length],[20,20,5]);assert.deepEqual(selected.evidence.map(e=>e.id),['evidence-00']);assert.equal(a.evidence[0].image_base64,undefined);});
test('relation pages keep historical bindings, current candidate and complete export',async t=>{const videos=[video('new'),video('old'),video('other',{owner_id:'SYNTHETIC-other'})],relations=Array.from({length:45},(_,i)=>relation('relation-'+String(i).padStart(2,'0'),'old',{created_at:T24,evidence_note:'synthetic relation '+i}));relations.push(relation('relation-other','old',{new_video_id:'other'}));const samples=[sample('bound-old','old',T24,{plays:10},{sample_kind:'relation_baseline',relation_id:'relation-00'})];sqliteFixture(t,{videos,samples,relations,evidence:[],analysis_reports:[]});const full=await api.dataCenter(OWNER),workspace=await api.dataCenterWorkspace(OWNER),a=await api.dataCenterRelations(OWNER,0),b=await api.dataCenterRelations(OWNER,20),c=await api.dataCenterRelations(OWNER,40);assert.deepEqual([a.relations.length,b.relations.length,c.relations.length],[20,20,5]);assert.equal((await api.dataCenterRelations('SYNTHETIC-other',0)).relations.length,1);assert.equal(workspace.relations.length,45);assert.equal(workspace.relations.find(r=>r.id==='relation-00').published_anchor,relations[0].published_anchor);assert.equal(workspace.relations.find(r=>r.id==='relation-00').evidence_note,undefined);assert.deepEqual(workspace.current_relations,full.current_relations);const exported=await api.dataExport(full,'json').text();assert.match(exported,/synthetic relation 0/);assert.match(exported,/synthetic relation 44/);});
test('old report bodies are fetched by owner on demand while analytics and exports stay complete',async t=>{const input=sixWorks(),f=sqliteFixture(t,input),report={request_id:'SYNTHETIC-report',title:'SYNTHETIC old report',created_at:T48,markdown:'SYNTHETIC long historical report '.repeat(200),attachments:[{library_file_id:'libfile_abcdef',label:'SYNTHETIC attachment'}],video_ids:['old-a'],sample_request_ids:['SYNTHETIC-sample-r-a-24'],record_hash:'x'};f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run('data_analysis_v1:'+OWNER+':'+report.request_id,JSON.stringify(report));const full=await api.dataCenter(OWNER),view=await api.dataCenterWorkspace(OWNER),summary=await api.dataCenterOverview(OWNER);assert.equal(view.analysis_reports.length,1);assert.equal(view.analysis_reports[0].markdown,undefined);assert.equal(view.analysis_reports[0].title,report.title);assert.equal((await api.analysisReport(OWNER,report.request_id)).markdown,report.markdown);await assert.rejects(()=>api.analysisReport('SYNTHETIC-other',report.request_id),e=>e.status===404);assert.equal(summary.analytics.historical_reports[0].request_id,report.request_id);const expected=structuredClone(full.analytics),actual=structuredClone(summary.analytics);delete expected.generated_at;delete actual.generated_at;assert.deepEqual(actual,expected);assert.deepEqual(summary.logical_counts,full.logical_counts);assert.equal(summary.review.effective_samples,full.review.effective_samples);assert.match(await api.dataExport(full,'analysis_md').text(),/SYNTHETIC long historical report/);assert.match(await api.dataExport(full,'json').text(),/SYNTHETIC long historical report/);});
test('single work history matches full analytics across video and sample corrections without unrelated reads',async t=>{const input=sixWorks();input.videos.push(video('old-a-rev',{published_at:'2026-10-08T00:00:00.000Z',supersedes_id:'old-a',created_at:T48}));input.samples.push(sample('r-a-corrected','old-a-rev',T48,{plays:115},{sample_kind:'relation_followup',relation_id:'r-a',supersedes:'r-a-48'}));const fixture=sqliteFixture(t,input),full=await api.dataCenter(OWNER),expected=full.review.histories.find(h=>h.video.id==='old-a-rev');assert.ok(expected);const queries=[],original=fixture.db.batch;fixture.db.batch=async statements=>{queries.push(...statements.map(s=>s.query));return original.call(fixture.db,statements)};const page=await api.dataCenterHistory(OWNER,'old-a-rev',0),location=await api.dataCenterHistoryLocation(OWNER,'r-a-48');assert.deepEqual(page.samples,expected.samples);assert.deepEqual(location.sample,expected.samples.find(s=>s.id==='r-a-48'));assert.equal(location.video_id,'old-a-rev');assert.equal(location.sample.effective,false);assert.equal(page.samples.find(s=>s.id==='r-a-corrected').effective,true);assert.equal(queries.length,6);assert(queries.every(q=>!q.includes('production_data_evidence')&&!q.includes('app_state')));await assert.rejects(()=>api.dataCenterHistory(OWNER,'old-a',0),e=>e.status===404);});

test('workspace strips report bodies in SQL while preserving full statistics and attachment metadata',async t=>{const f=sqliteFixture(t,sixWorks()),report={request_id:'report-large',title:'synthetic',created_at:T48,markdown:'full report '.repeat(2000),attachments:[{library_file_id:'libfile_abcdef',label:'attachment'}],video_ids:['old-a'],sample_request_ids:['SYNTHETIC-sample-r-a-24'],record_hash:'x'};f.sql.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run('data_analysis_v1:'+OWNER+':'+report.request_id,JSON.stringify(report));const full=await api.dataCenter(OWNER),queries=[],prepare=f.db.prepare;f.db.prepare=query=>{queries.push(query);return prepare(query)};const view=await api.dataCenterWorkspace(OWNER);assert(queries.some(q=>q.includes("json_remove(value,'$.markdown')")));assert(!queries.some(q=>q==='SELECT value FROM app_state WHERE key>=? AND key<? ORDER BY key DESC'));assert.deepEqual(view.comparison,full.comparison);assert.deepEqual(view.observations,full.observations);assert.deepEqual(view.logical_counts,full.logical_counts);assert.deepEqual(view.analysis_reports[0].attachments,report.attachments);assert.equal((await api.analysisReport(OWNER,report.request_id)).markdown,report.markdown);});
