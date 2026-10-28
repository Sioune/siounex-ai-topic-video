// Isolated real scope/native CAS functions and rendered UI. No actual media,
// model, browser, provider, payment or production decision is exercised.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';import {build} from 'esbuild';import {createRequire} from 'node:module';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const sha=value=>createHash('sha256').update(value).digest('hex'),ID='job_11111111-1111-4111-8111-111111111111',OWNER='SYNTHETIC-owner',AT='2026-10-20T00:00:00Z',actor={owner_id:OWNER};
const bundle=await build({stdin:{contents:"export * from './lib/media-continuation';export * from './lib/media-continuation-contract';export * from './lib/native-preparation-handoff';export {getJob} from './lib/production';export {nextWork} from './lib/dispatch';export {saveSeries} from './lib/series';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'SYNTHETIC-auto-private-db',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function db(){return globalThis.__autoPrivateDb} export function siteArchiveBucket(){throw Error("SYNTHETIC must not access remote archive")}'}));}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const ui=await build({entryPoints:['components/media-continuation.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}),uiModule={exports:{}},require=createRequire(new URL('../package.json',import.meta.url));new Function('require','module','exports',ui.outputFiles[0].text)(require,uiModule,uiModule.exports);const View=uiModule.exports.default;
async function fixture(t){
 const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 class S{constructor(q,a=[]){this.q=q;this.a=a}bind(...a){return new S(this.q,a)}async first(){return sql.prepare(this.q).get(...this.a)||null}async all(){return{results:sql.prepare(this.q).all(...this.a)}}async run(){return{meta:{changes:Number(sql.prepare(this.q).run(...this.a).changes)}}}}
 let hook;globalThis.__autoPrivateDb={prepare:q=>new S(q),async batch(ss){if(hook){const h=hook;hook=null;h()}sql.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};t.after(()=>{sql.close();delete globalThis.__autoPrivateDb});
 const content=JSON.stringify({script:'SYNTHETIC unchanged approved narration',materials:'SYNTHETIC existing source images',limits:'SYNTHETIC rights pending; no actual production',evidence:[],storyboard:[]}),hash=sha(content),contract='a'.repeat(64),binding={revision:1,script_hash:hash,mode_epoch:2,contract_hash:contract};
 sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk,curated) VALUES ('SYNTHETIC-topic','https://example.org/SYNTHETIC-private','S','S','S','S','S',?,'行业动态',0,'S','S','S','S','S',0)").run(AT);
 sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,status,review_mode,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,mode_epoch,attempt,reworks,ai_calls,created_at,updated_at) VALUES (?,'SYNTHETIC-topic',?,'approved','auto','{}','{}',?,1,1,?,2,2,1,2,?,?)").run(ID,OWNER,contract,hash,AT,AT);
 sql.prepare("INSERT INTO production_drafts VALUES (?,1,'SYNTHETIC-draft',?,?,'SYNTHETIC',?)").run(ID,content,hash,AT);
 for(const node of ['source','script'])sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_hash,artifact,status,mode_epoch,report,created_at,updated_at) VALUES (?,?,?,1,?,?,'approved',2,?,?,?)").run('SYNTHETIC-'+node,ID,node,hash,content,JSON.stringify({decision:'approve',actor:OWNER}),AT,AT);
 await p.saveSeries(ID,OWNER,{base_id:'',revision:1,mode_epoch:2,template_key:'deep-tech@3',reason:'SYNTHETIC saved template and three-episode snapshot',request_id:'SYNTHETIC-series'});
 const free=(await p.registerFreePreparation(ID,{binding})).job,body={binding,scope:'private-video',confirmed:true,current_id:free.media_continuation.current_id,request_id:'SYNTHETIC-private-confirm'};
 const protectedRows=()=>JSON.stringify(['production_jobs','production_drafts','production_milestones'].map(table=>sql.prepare('SELECT * FROM '+table).all()));
 const scopeRaw=()=>sql.prepare('SELECT value FROM app_state WHERE key=?').get('media_scope_v1:'+ID).value,seriesRaw=()=>sql.prepare('SELECT value FROM app_state WHERE key=?').get('series_selection_v1:'+ID).value;
 return{sql,binding,body,protectedRows,scopeRaw,seriesRaw,hook:h=>{hook=h}};
}
test('explicit current owner scope enables auto private-video native handoff without changing text, mode, budget or series',async t=>{
 const f=await fixture(t),before=f.protectedRows(),series=f.seriesRaw(),oldScope=JSON.parse(f.scopeRaw()),oldBinding={...f.binding,scope_id:oldScope.id,scope:'preparation'};
 const old=(await p.ensureNativePreparationHandoff(ID,{binding:oldBinding},actor)).handoff;
 const claim=await p.claimNativePreparationHandoff(ID,{queue_id:old.queue_id,version:old.version,executor:'SYNTHETIC-preparation',invocation_id:'SYNTHETIC-preparation'},actor);
 await p.progressNativePreparationHandoff(ID,{queue_id:old.queue_id,version:claim.handoff.version,invocation_id:'SYNTHETIC-preparation',lease_token:claim.lease_token,status:'blocked',artifacts:[],missing:[{code:'source',detail:'SYNTHETIC existing cached source'}],note:'SYNTHETIC preparation returned'},actor);
 const saved=await p.confirmMediaScope(ID,OWNER,{...f.body,new_paid_authorization:true,publication_authorization:true}),j=saved.job,s=j.media_continuation.scope;
 assert.equal(s.scope,'private-video');assert.equal(s.owner_confirmed,true);assert.equal(s.authorization_source,'owner-private-video');for(const flag of ['new_paid_authorization','publication_authorization','quality_approved'])assert.equal(s[flag],false);
 assert.equal(j.review_mode,'auto');assert.equal(j.mode_epoch,2);assert.equal(f.protectedRows(),before);assert.equal(f.seriesRaw(),series);await p.assertMediaScope(j,'video');
 const selected=await p.nextWork();assert.equal(selected.kind,'preparation','scope upgrade retains the ordinary bounded input checks');
 const next=(await p.ensureNativePreparationHandoff(ID,{binding:{...f.binding,scope_id:s.id,scope:'private-video'}},actor)).handoff;
 assert.notEqual(next.queue_id,old.queue_id);assert.equal(next.editing_allowed,true);assert.equal(next.quality_approved,false);assert.equal(next.new_paid_calls,0);assert.equal(next.publication_authorized,false);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='native_preparation_handoff_event' AND json_extract(note,'$.queue_id')=?").get(old.queue_id).n,3,'old preparation events remain immutable');
 assert.equal((await p.confirmMediaScope(ID,OWNER,f.body)).replayed,true);assert.equal(f.protectedRows(),before);assert.equal(f.seriesRaw(),series);
 const html=renderToStaticMarkup(React.createElement(View,{job:j,onSaved:()=>{}}));assert.match(html,/一站到底保持自动/);assert.match(html,/零新增费用/);assert.match(html,/批准质量、外部发布和新付费不在此确认内/);
});
test('free preparation and legacy auto scope cannot imply permission for private editing',async t=>{
 const f=await fixture(t),free=(await p.getJob(ID)).media_continuation.scope;assert.equal(p.privateVideoScopeAuthorized(free,'auto'),false);
 const legacy={...free,scope:'private-video'};delete legacy.authorization_source;delete legacy.owner_confirmed;
 f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify({id:legacy.id,scope:legacy}),'media_scope_v1:'+ID);
 f.sql.prepare('UPDATE production_reviews SET note=?,reviewer=? WHERE id=?').run(JSON.stringify(legacy),OWNER,legacy.id);
 const j=await p.getJob(ID);await assert.rejects(()=>p.assertMediaScope(j,'video'));await assert.rejects(()=>p.ensureNativePreparationHandoff(ID,{binding:{...f.binding,scope_id:legacy.id,scope:'private-video'}},actor));
 const upgraded=(await p.confirmMediaScope(ID,OWNER,f.body)).job;assert.notEqual(upgraded.media_continuation.current_id,legacy.id);assert.equal(upgraded.media_continuation.scope.owner_confirmed,true);assert.equal(upgraded.review_mode,'auto');
});
test('owner/version/current-scope and live native lease prevent unintended authorization',async t=>{
 const f=await fixture(t),before=f.scopeRaw();await assert.rejects(()=>p.confirmMediaScope(ID,'other-owner',f.body));
 for(const body of [{...f.body,confirmed:false},{...f.body,binding:{...f.binding,mode_epoch:3}},{...f.body,binding:{...f.binding,revision:2}},{...f.body,current_id:'SYNTHETIC-stale'},{...f.body,scope:'public-video'}])await assert.rejects(()=>p.confirmMediaScope(ID,OWNER,body));
 assert.equal(f.scopeRaw(),before);
 const scope=JSON.parse(before),q=(await p.ensureNativePreparationHandoff(ID,{binding:{...f.binding,scope_id:scope.id,scope:'preparation'}},actor)).handoff,c=await p.claimNativePreparationHandoff(ID,{queue_id:q.queue_id,version:q.version,executor:'SYNTHETIC-active',invocation_id:'SYNTHETIC-active'},actor);
 await assert.rejects(()=>p.confirmMediaScope(ID,OWNER,f.body),/租约/);assert.equal(f.scopeRaw(),before);
 const html=renderToStaticMarkup(React.createElement(View,{job:await p.getJob(ID),onSaved:()=>{}}));assert.match(html,/正在执行只读检查或媒体操作/);assert.equal(c.handoff.editing_allowed,false);
});
test('native or AI review lease appearing during confirmation blocks the SQL CAS',async t=>{
 for(const race of ['native','review'])await t.test(race,async t=>{
  const f=await fixture(t),before=f.scopeRaw(),series=f.seriesRaw();f.hook(()=>{if(race==='native')f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('native_preparation_handoff_v1:'+ID,JSON.stringify({status:'claimed',lease_until:Date.now()+60000}));else f.sql.prepare("UPDATE production_milestones SET status='ai_running',review_until=? WHERE node='source'").run(Date.now()+60000)});
  await assert.rejects(()=>p.confirmMediaScope(ID,OWNER,f.body),/并发/);assert.equal(f.scopeRaw(),before);assert.equal(f.seriesRaw(),series);assert.equal(f.sql.prepare("SELECT count(*) n FROM production_reviews WHERE decision='media_scope' AND json_extract(note,'$.scope')='private-video'").get().n,0);
 });
});
