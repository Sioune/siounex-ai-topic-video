// Synthetic time metadata and in-memory migration checks; no platform IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['lib/publishing-time.mts'],bundle:true,write:false,platform:'node',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));

test('precision parser distinguishes observed seconds from a disclosed minute anchor and bounded uncertainty',()=>{
 const minute=api.parsePublishedAt('2026-10-18T18:16+08:00','minute');assert.deepEqual(minute,{published_at:'2026-10-18T10:16:00.000Z',published_at_precision:'minute',published_at_range_start:'2026-10-18T10:16:00.000Z',published_at_range_end:'2026-10-18T10:16:59.000Z',published_at_uncertainty_seconds:59});assert.deepEqual(api.parsePublishedAt(minute.published_at,'minute'),minute);
 const second=api.parsePublishedAt('2026-10-18T18:16:27.123+08:00');assert.equal(second.published_at,'2026-10-18T10:16:27.123Z');assert.equal(second.published_at_range_end,second.published_at);assert.equal(second.published_at_uncertainty_seconds,0);
 for(const [value,precision] of [['2026-10-18T18:16+08:00',undefined],['2026-10-18T18:16+08:00','second'],['2026-10-18T18:16:01+08:00','minute'],['2026-10-18T18:16:00.001+08:00','minute'],['2026-10-18T18:16','minute'],['2026-10-18T18:16:27+08:00','hour']])assert.throws(()=>api.parsePublishedAt(value,precision));
 assert.deepEqual(api.publishedAtMetadata(null,'minute'),{published_at_precision:null,published_at_range_start:null,published_at_range_end:null,published_at_uncertainty_seconds:null});assert.equal(api.collectionTimeMetadata('2026-10-19T10:16:00.000Z','minute',24).due_at_range_end,'2026-10-19T10:16:59.000Z');assert.equal(api.collectionTimeMetadata('2026-10-19T10:16:00.000Z','minute',null).due_at_range_end,null);
});

test('0011 preserves existing second timestamps and receipts exactly while enforcing persisted precision',t=>{
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('CREATE TABLE publishing_posts(id TEXT PRIMARY KEY,published_at TEXT,receipt TEXT);CREATE TABLE publishing_existing_posts(id TEXT PRIMARY KEY,platform_published_at TEXT,record_hash TEXT)');sql.prepare('INSERT INTO publishing_posts VALUES (?,?,?)').run('old-post','2026-10-18T10:20:11.123Z','{"schema":"unchanged"}');sql.prepare('INSERT INTO publishing_existing_posts VALUES (?,?,?)').run('old-existing','2026-10-18T10:23:34.000Z','SYNTHETIC-unchanged');const before=JSON.stringify([sql.prepare('SELECT * FROM publishing_posts').all(),sql.prepare('SELECT * FROM publishing_existing_posts').all()]);sql.exec(fs.readFileSync('drizzle/0011_platform_time_precision.sql','utf8'));assert.equal(sql.prepare('SELECT published_at_precision FROM publishing_posts').get().published_at_precision,'second');assert.equal(sql.prepare('SELECT published_at_precision FROM publishing_existing_posts').get().published_at_precision,'second');assert.equal(JSON.stringify([sql.prepare('SELECT id,published_at,receipt FROM publishing_posts').all(),sql.prepare('SELECT id,platform_published_at,record_hash FROM publishing_existing_posts').all()]),before);assert.throws(()=>sql.prepare('UPDATE publishing_existing_posts SET published_at_precision=?').run('hour'),/CHECK/);sql.prepare('UPDATE publishing_existing_posts SET published_at_precision=?').run('minute');assert.equal(sql.prepare('SELECT published_at_precision FROM publishing_existing_posts').get().published_at_precision,'minute');
});
