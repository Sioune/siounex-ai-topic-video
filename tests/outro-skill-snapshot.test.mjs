import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {frozenSkill} from '../scripts/frozen-skill.mjs';

test('a real future SQLite job freezes the v6 default without migrating existing old job evidence',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const f of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 class Statement{
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.sql,args);}
  async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}
  async all(){return{results:sqlite.prepare(this.sql).all(...this.args)};}
  async run(){return{meta:{changes:Number(sqlite.prepare(this.sql).run(...this.args).changes)}};}
 }
 globalThis.__outroSnapshotDb={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 try{
  const compiled=await build({entryPoints:['lib/production.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'outro-snapshot-sqlite',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'snapshot-db',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function db(){return globalThis.__outroSnapshotDb} export function siteArchiveBucket(){throw Error("No archive writes in snapshot test")}'}));}}]});
  const production=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  for(const id of ['old-outro-topic','future-outro-topic'])sqlite.prepare('INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated,content_lang) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'https://example.org/'+id,'zh','中文来源','真实选题','真实选题','可核对原文','2026-10-21','AI实用',60,'材料','亮点','切口','原文','范围',0,'zh');
  const old=await production.createJob('old-outro-topic','owner'),legacy=fs.readFileSync('production/skill-snapshots/c3c66b3dd605a86de6237ccd8d21050472bb15c5/snapshot.json','utf8');
  sqlite.prepare('UPDATE production_jobs SET skill_snapshot=?,contract_hash=? WHERE id=?').run(legacy,'a'.repeat(64),old.job.id);
  const before=sqlite.prepare('SELECT skill_snapshot,contract_hash,created_at,revision,status FROM production_jobs WHERE id=?').get(old.job.id);
  const future=await production.createJob('future-outro-topic','owner'),frozen=JSON.parse(future.job.skill_snapshot),currentPath=/import skill from '([^']+)'/.exec(fs.readFileSync('lib/production.ts','utf8'))[1],current=JSON.parse(fs.readFileSync('lib/'+currentPath,'utf8'));
  assert.equal(JSON.parse(frozen.files['assets/brand.json']).current_outro.creative_version,'v6');assert.equal(future.created,true);assert.equal(frozen.revision,current.revision);assert.equal(frozen.sha256,current.sha256);assert.equal(JSON.parse(frozen.files['assets/brand.json']).current_outro.frames,119);assert.ok(frozenSkill({skill_snapshot:future.job.skill_snapshot}).promptText);
  assert.equal(JSON.parse(frozen.files['assets/day-night-templates-v1/policy.json']).selection.mode,'owner-serial-alternating');assert.match(frozen.files['SKILL.md'],/08:00/);
  assert.deepEqual(sqlite.prepare('SELECT skill_snapshot,contract_hash,created_at,revision,status FROM production_jobs WHERE id=?').get(old.job.id),before);
  assert.equal((await production.createJob('future-outro-topic','owner')).job.id,future.job.id);
  assert.equal(sqlite.prepare('SELECT count(*) count FROM production_jobs').get().count,2);
 }finally{delete globalThis.__outroSnapshotDb;sqlite.close();}
});
