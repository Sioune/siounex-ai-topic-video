import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('archive and task lookups use migrated indexes without touching existing tables',()=>{
 const db=new DatabaseSync(':memory:');try{
  for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
  const plan=q=>db.prepare('EXPLAIN QUERY PLAN '+q).all().map(r=>r.detail).join('\n');
  assert.match(plan("SELECT value FROM app_state WHERE key>='site_archive_v1:' AND key<'site_archive_v1;' AND json_extract(value,'$.job_id')='job' ORDER BY key"),/site_archive_job_lookup/);
  assert.match(plan("SELECT * FROM production_reviews WHERE job_id='job' ORDER BY created_at DESC"),/production_reviews_job_created/);
  assert.match(plan("SELECT id FROM production_reviews WHERE job_id='job' AND revision=1 AND decision='approve' AND content_hash='sha'"),/production_reviews_job_binding/);
  assert.match(plan("SELECT id FROM production_data_videos WHERE job_id='job' AND published_at IS NOT NULL"),/data_video_job_published/);
  const sql=fs.readFileSync('drizzle/0013_production_lookup_indexes.sql','utf8');assert.doesNotMatch(sql,/CREATE TABLE|DROP|DELETE|UPDATE|ALTER/i);
 }finally{db.close();}
});
