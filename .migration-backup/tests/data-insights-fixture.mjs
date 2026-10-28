// SYNTHETIC only. Shapes resemble the supported workflows, never private metrics.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {metrics} from '../lib/data-contract.mts';

export const OWNER = 'SYNTHETIC-data-owner';
export const T = '2026-10-10T00:00:00.000Z';
export const T24 = '2026-10-11T00:00:00.000Z';
export const T48 = '2026-10-12T00:00:00.000Z';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const clone = value => JSON.parse(JSON.stringify(value));
export function video(id, extra = {}) {
  return {id, owner_id: OWNER, title: 'SYNTHETIC work ' + id, topic_type: 'story', published_at: T, publication_source: 'SYNTHETIC manually recorded publication timestamp, not independent platform verification', job_id: null, supersedes_id: null, duration: null, record_hash: digest(id), request_id: 'SYNTHETIC-video-' + id, created_at: T, ...extra};
}
export function sample(id, video_id, observed_at, values = {}, extra = {}) {
  const {peer = {}, labels = {}, supersedes = null, diagnostic = null, ...fields} = extra;
  return {id, video_id, sample_kind: 'single_snapshot', relation_id: null, observed_at, metrics: JSON.stringify(metrics(values)), evidence_ids: '[]', note: JSON.stringify({schema: 'sample-details-v1', text: 'SYNTHETIC panel note', captured_at: observed_at, time_source: 'SYNTHETIC actual screenshot timestamp', source: null, diagnostic, peer_percentiles: peer, peer_labels: labels, platform_advice: null, publication_observations: {}, supersedes_id: supersedes}), record_hash: digest(id), request_id: 'SYNTHETIC-sample-' + id, created_at: observed_at || T, ...fields};
}
export function relation(id, old_video_id, extra = {}) {
  return {id, new_video_id: 'new', old_video_id, published_anchor: T, exposure_start: 10, exposure_end: 13, evidence_note: 'SYNTHETIC recorded relation; no causal authorization', record_hash: digest(id), request_id: 'SYNTHETIC-relation-' + id, created_at: T, ...extra};
}
export function sixWorks() {
  const videos = [video('uncaptured'), video('snapshot'), ...['old-a', 'old-b', 'old-c'].map(id => video(id, {published_at: '2026-10-08T00:00:00.000Z'})), video('new')];
  const relations = ['a', 'b', 'c'].map(suffix => relation('r-' + suffix, 'old-' + suffix));
  const samples = [sample('snapshot-only', 'snapshot', T48, {plays: 77, three_second_rate: 45, completion_rate: 12, average_duration: 8}, {peer: {plays: 50, completion: 20, average_watch: 65, three_second: 80}, labels: {plays: '高', completion: '低', average_watch: '高', three_second: '高'}})];
  for (const [index, suffix] of ['a', 'b', 'c'].entries()) {
    samples.push(sample('r-' + suffix + '-24', 'old-' + suffix, T24, {plays: 100 + index * 20, three_second_rate: 50, completion_rate: 10, average_duration: 7, likes: 0}, {sample_kind: 'relation_baseline', relation_id: 'r-' + suffix}));
    samples.push(sample('r-' + suffix + '-48', 'old-' + suffix, T48, {plays: 110 + index * 20, three_second_rate: 52, completion_rate: 11, average_duration: 8, likes: 2}, {sample_kind: 'relation_followup', relation_id: 'r-' + suffix}));
  }
  samples.push(sample('own-24', 'new', T24, {plays: 500, three_second_rate: 54, completion_rate: 20, average_duration: 9, likes: 1}, {sample_kind: 'single_t24'}));
  samples.push(sample('own-48', 'new', T48, {plays: 512, three_second_rate: 56, completion_rate: 21, average_duration: 10, likes: 3}, {sample_kind: 'single_t48'}));
  return {videos, samples, relations, evidence: [], analysis_reports: []};
}
const migrations = fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort().map(name => fs.readFileSync('drizzle/' + name, 'utf8'));
export function sqliteFixture(t, input = sixWorks()) {
  const sql = new DatabaseSync(':memory:');
  for (const migration of migrations) sql.exec(migration);
  function insert(table, row) {
    const columns = sql.prepare('PRAGMA table_info(' + table + ')').all().map(column => column.name).filter(key => row[key] !== undefined);
    sql.prepare('INSERT INTO ' + table + '(' + columns.join(',') + ') VALUES (' + columns.map(() => '?').join(',') + ')').run(...columns.map(key => row[key]));
  }
  for (const row of input.videos) insert('production_data_videos', row);
  for (const row of input.relations) insert('production_data_relations', row);
  for (const row of input.samples) insert('production_data_samples', row);
  for (const row of input.evidence || []) insert('production_data_evidence', row);
  class Statement {
    constructor(query, args = []) {this.query = query; this.args = args;}
    bind(...args) {return new Statement(this.query, args);}
    async first() {return sql.prepare(this.query).get(...this.args) || null;}
    async all() {return {results: sql.prepare(this.query).all(...this.args)};}
    async run() {return /^\s*SELECT/i.test(this.query) ? this.all() : {meta: {changes: Number(sql.prepare(this.query).run(...this.args).changes)}};}
  }
  const db = {prepare: query => new Statement(query), async batch(statements) {
    sql.exec('BEGIN');
    try {const rows = []; for (const statement of statements) rows.push(await statement.run()); sql.exec('COMMIT'); return rows;}
    catch (error) {sql.exec('ROLLBACK'); throw error;}
  }};
  globalThis.__dataInsightsDb = db;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {throw Error('SYNTHETIC fixture forbids network, workers and models');};
  t.after(() => {sql.close(); delete globalThis.__dataInsightsDb; globalThis.fetch = oldFetch;});
  return {sql, db};
}
