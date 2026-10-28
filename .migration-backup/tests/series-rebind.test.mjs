// Isolated SQLite/auth/SSR fixtures. No model, browser, media, or real decision.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
await build({stdin:{contents:"export * from './lib/series';export {POST} from './app/api/series/route';export {SeriesLibrary} from './components/series-library';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/series-rebind-under-test.mjs',external:['react','react-dom','react-dom/server'],plugins:[{name:'SYNTHETIC-series-rebind',setup(b){
 b.onResolve({filter:/\/store$|^\.\/store$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='db'?'export function db(){return globalThis.__seriesRebindDb}':'export async function getChatGPTUser(){return globalThis.__seriesRebindOwner?{userId:globalThis.__seriesRebindOwner}:null}'}));
}}]});
const p=await import('../.sites-runtime/series-rebind-under-test.mjs');
async function fixture(t){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 class S{constructor(q,a=[]){this.q=q;this.a=a}bind(...a){return new S(this.q,a)}async first(){return sql.prepare(this.q).get(...this.a)||null}async all(){return{results:sql.prepare(this.q).all(...this.a)}}async run(){return{meta:{changes:Number(sql.prepare(this.q).run(...this.a).changes)}}}}
 let hook;globalThis.__seriesRebindDb={prepare:q=>new S(q),async batch(ss){if(hook){const h=hook;hook=undefined;h()}sql.exec('BEGIN');try{const result=[];for(const s of ss)result.push(await s.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
 t.after(()=>{sql.close();delete globalThis.__seriesRebindDb;delete globalThis.__seriesRebindOwner});
 sql.exec("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated) VALUES ('SYNTHETIC-topic','https://example.org/SYNTHETIC-rebind','test','test','SYNTHETIC','SYNTHETIC','test','before','test',0,'test','test','test','test','test',0);INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,review_mode,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,mode_epoch,attempt,reworks,ai_calls,created_at,updated_at) VALUES ('SYNTHETIC-job','SYNTHETIC-topic','owner',0,'approved','auto','{}','{}','SYNTHETIC-contract',1,1,'SYNTHETIC-approved-script',0,3,1,5,'before','before')");
 const id='SYNTHETIC-job',key='series_selection_v1:'+id;
 function published(pid,day,jobId=null){sql.prepare("INSERT INTO production_data_videos(id,owner_id,job_id,title,topic_type,published_at,publication_source,record_hash,request_id,created_at) VALUES (?,'owner',?,?,'test',?,'SYNTHETIC archive',?,?,?)").run(pid,jobId,pid,'2026-10-'+day+'T00:00:00Z','SYNTHETIC-'+pid,'SYNTHETIC-'+pid,day);}
 for(const [pid,day] of [['old','10'],['middle','11'],['recent','12']])published(pid,day);
 const selected=await p.saveSeries(id,'owner',{base_id:'',revision:1,mode_epoch:0,request_id:'SYNTHETIC-first',template_key:'deep-tech@3',reason:'SYNTHETIC original template/history selection'});
 sql.prepare('UPDATE production_jobs SET mode_epoch=1 WHERE id=?').run(id);
 const body={base_id:selected.current.id,revision:1,mode_epoch:1,request_id:'SYNTHETIC-rebind'};
 return{sql,id,key,selected,body,published,beforeBatch:fn=>{hook=fn},raw:()=>sql.prepare('SELECT value FROM app_state WHERE key=?').get(key).value,jobs:()=>JSON.stringify(sql.prepare('SELECT * FROM production_jobs').all()),audits:()=>sql.prepare("SELECT * FROM production_reviews WHERE decision='series_mode_rebind'").all()};
}
function queued(f){f.sql.prepare("INSERT INTO production_operations(id,job_id,node,revision,script_hash,mode_epoch,base_artifact_version,input_hash,plan,status,created_at,updated_at) VALUES ('SYNTHETIC-operation',?,'video',1,'SYNTHETIC-approved-script',1,0,'SYNTHETIC-input','{}','queued','now','now')").run(f.id);}
function native(f,value){f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('native_preparation_handoff_v1:'+f.id,typeof value==='string'?value:JSON.stringify(value));}
test('owner rebind preserves exact template, seed, three-episode snapshot and prior history without refreshing latest',async t=>{
 const f=await fixture(t),old=JSON.parse(f.raw()),beforeJobs=f.jobs();f.published('new-latest','19');
 const stale=await p.readSeries(f.id,'owner');assert.equal(stale.choice_current,false);assert.equal(stale.available_history.selected[0].id,'new-latest');
 const result=await p.rebindSeries(f.id,'owner',f.body),c=result.current;
 assert.equal(result.choice_current,true);assert.equal(c.mode_epoch,1);assert.equal(c.created_revision,1);assert.equal(c.sequence,2);assert.notEqual(c.id,old.current.id);
 for(const field of ['template','template_hash','seed','method','candidates','similarity','history','subtitle','outro','safe_area'])assert.deepEqual(c[field],old.current[field],field+' remains exactly saved');
 assert.deepEqual(result.history[0],old.history[0]);assert.equal(result.history.length,2);assert.equal(c.quality_approved,false);assert.equal(c.history.selected[0].id,'recent');assert.equal(result.available_history.selected[0].id,'new-latest');assert.equal(f.jobs(),beforeJobs);
 const audit=f.audits();assert.equal(audit.length,1);const note=JSON.parse(audit[0].note);assert.equal(note.source_selection_id,old.current.id);for(const flag of ['random_selection','latest_history_refreshed','quality_approved','new_paid_authorization','publication_authorization'])assert.equal(note[flag],false);
 const replay=await p.rebindSeries(f.id,'owner',f.body);assert.equal(replay.replayed,true);assert.equal(replay.current.id,c.id);assert.equal(f.audits().length,1);
 await assert.rejects(()=>p.rebindSeries(f.id,'owner',{...f.body,reason:'changed request'}),/请求ID/);
 await assert.rejects(()=>p.rebindSeries(f.id,'owner',{...f.body,request_id:'stale-old-base'}),/选择发生变化/);
 await assert.rejects(()=>p.rebindSeries(f.id,'owner',{...f.body,base_id:c.id,request_id:'already-current'}),/已有效/);
});
test('rebind is owner-only and binds exact base/revision/mode without accepting content changes',async t=>{
 const f=await fixture(t),before=f.raw();await assert.rejects(()=>p.rebindSeries(f.id,'other-owner',f.body));await assert.rejects(()=>p.rebindSeries(f.id,undefined,f.body));
 for(const body of [{...f.body,base_id:'not-saved'},{...f.body,revision:2},{...f.body,mode_epoch:0},{...f.body,mode_epoch:'1'},{...f.body,template_key:'another@1'},{...f.body,history:{selected:[]}}])await assert.rejects(()=>p.rebindSeries(f.id,'owner',body));
 assert.equal(f.raw(),before);assert.equal(f.audits().length,0);
 f.sql.prepare('UPDATE production_jobs SET is_test=1 WHERE id=?').run(f.id);await assert.rejects(()=>p.rebindSeries(f.id,'other-owner',f.body),/仅任务本人/);
});
test('selection blocker rejects queued work, native leases and malformed native records',async t=>{
 for(const kind of ['queued','native','malformed','technical','review','running','completed','published'])await t.test(kind,async t=>{
  const f=await fixture(t),before=f.raw();
  if(kind==='queued')queued(f);if(kind==='native')native(f,{status:'claimed',lease_until:Date.now()+60000});if(kind==='malformed')native(f,'{unknown');
  if(kind==='technical')f.sql.prepare("INSERT INTO production_stages(id,job_id,stage,review_revision,review_hash,status,result,updated_at) VALUES ('SYNTHETIC-stage',?,'media_inventory',1,'SYNTHETIC-approved-script','running',?,'now')").run(f.id,JSON.stringify({lease_until:Date.now()+60000}));
  if(kind==='review')f.sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES ('SYNTHETIC-review',?,'cover',1,'SYNTHETIC-hash','{}','ai_running',1,'now','now')").run(f.id);
  if(['running','completed'].includes(kind))f.sql.prepare('UPDATE production_jobs SET status=? WHERE id=?').run(kind,f.id);if(kind==='published')f.published('this-post','19',f.id);
  assert.equal((await p.readSeries(f.id,'owner')).capabilities.selection_editable,false);await assert.rejects(()=>p.rebindSeries(f.id,'owner',f.body));assert.equal(f.raw(),before);assert.equal(f.audits().length,0);
 });
});
test('CAS protects a new epoch, queued operation or native lease appearing after validation',async t=>{
 for(const race of ['epoch','queued','native'])await t.test(race,async t=>{
  const f=await fixture(t),before=f.raw();f.beforeBatch(()=>{if(race==='epoch')f.sql.prepare('UPDATE production_jobs SET mode_epoch=2 WHERE id=?').run(f.id);if(race==='queued')queued(f);if(race==='native')native(f,{status:'claimed',lease_until:Date.now()+60000})});
  await assert.rejects(()=>p.rebindSeries(f.id,'owner',f.body),/确认期间/);assert.equal(f.raw(),before);assert.equal(f.audits().length,0);
 });
});
test('simultaneous rebind has one CAS winner and a completed request can reconcile while work is queued',async t=>{
 const f=await fixture(t),r=await Promise.allSettled(['SYNTHETIC-a','SYNTHETIC-b'].map(request_id=>p.rebindSeries(f.id,'owner',{...f.body,request_id})));
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.filter(x=>x.status==='rejected').length,1);assert.equal(f.audits().length,1);const note=JSON.parse(f.audits()[0].note);
 queued(f);const result=await p.rebindSeries(f.id,'owner',note.request);assert.equal(result.replayed,true);assert.equal(result.history.length,2);assert.equal(f.audits().length,1);
});
test('actual API enforces authentication/origin and UI offers the explicit button only for a stale choice',async t=>{
 const f=await fixture(t),body={id:f.id,action:'rebind',...f.body};
 const req=(b,origin='https://example.org')=>new Request('https://example.org/api/series',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(b)});
 globalThis.__seriesRebindOwner=null;assert.equal((await p.POST(req(body))).status,403);globalThis.__seriesRebindOwner='owner';assert.equal((await p.POST(req(body,'https://wrong.example'))).status,403);
 const stale=await p.readSeries(f.id,'owner'),render=state=>renderToStaticMarkup(React.createElement(p.SeriesLibrary,{jobId:f.id,revision:1,epoch:1,initial:state}));
 assert.ok(render(stale).includes('沿用已保存模板与三期，确认当前模式'));assert.equal(render({...stale,choice_current:true}).includes('沿用已保存模板与三期，确认当前模式'),false);
 const response=await p.POST(req(body));assert.equal(response.status,200);const state=await response.json();assert.equal(state.choice_current,true);assert.equal(state.current.seed,f.selected.current.seed);assert.equal(render(state).includes('沿用已保存模板与三期，确认当前模式'),false);
});
