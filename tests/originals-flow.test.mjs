// SYNTHETIC full-migration SQLite tests. No hosted write, model, media or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {assertD1PatternLimit} from './research-d1-fixture.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex'),clone=value=>JSON.parse(JSON.stringify(value));
const OWNER='SYNTHETIC-original-owner',OTHER='SYNTHETIC-other-owner',AT='2026-10-23T10:00:00Z';
const built=await build({stdin:{contents:["export * from './lib/originals';","export {createJob,getJob} from './lib/production';","export {materializeSource} from './lib/dispatch';","export {ingest,validateEntries} from './lib/editorial';","export {GET as originalGET,POST as originalPOST} from './app/api/originals/route';"].join('\n'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,footer:{js:'//# sourceURL=synthetic-originals-flow-under-test.mjs'},plugins:[{name:'synthetic-original-db',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));
 b.onResolve({filter:/(?:^|\/)chatgpt-auth$/},()=>({path:'auth',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?'export async function getChatGPTUser(){return globalThis.__originalBrowserOwner?{userId:globalThis.__originalBrowserOwner}:null}':'export function db(){return globalThis.__originalFixtureDb} export function siteArchiveBucket(){throw Error("SYNTHETIC fixture has no archive bucket")}'}));
}}]});
const p=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
const migrations=fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort().map(n=>fs.readFileSync('drizzle/'+n,'utf8'));
function input(extra={}){return {title:'SYNTHETIC 一个镜头改好以后',summary:'SYNTHETIC 本人产品说明与候选报道，不是真实功能验证。',original_text:'  SYNTHETIC 产品完整原文\r\n\n功能甲：说明中写有，不代表实测。\n',draft:'# SYNTHETIC 候选报道\n\n本稿仅为隔离测试。<script>untrusted text</script>\n',description_date:'2026-10-23',pending_claims:'SYNTHETIC 同项目连续日志和录屏待核。',verified_notes:'SYNTHETIC 仅确认已收到这份文字；无功能验收。',history_note:'SYNTHETIC 原稿旧状态保留为历史引用。',source_refs:[{library_file_id:'libfile_SYNTHETIC-original',version:0,file_name:'SYNTHETIC原文.txt'}],...extra}}
function editInput(extra={}){const {original_text,description_date,source_refs,...editable}=input();return {...editable,...extra}}
function fixture(t,{persistent=false}={}){
 const directory=persistent?fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-original-')):null,file=directory?path.join(directory,'fixture.sqlite'):':memory:';
 let sql=new DatabaseSync(file),hook,failAt=-1;
 for(const migration of migrations)sql.exec(migration);
 const queries=[];
 class Statement{
  constructor(query,args=[]){this.query=query;this.args=args}
  bind(...args){return new Statement(this.query,args)}
  check(){assertD1PatternLimit(this.query,this.args);queries.push({query:this.query,args:this.args})}
  async first(){this.check();return sql.prepare(this.query).get(...this.args)||null}
  async all(){this.check();return {results:sql.prepare(this.query).all(...this.args)}}
  async run(){this.check();return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}}}
 }
 const db={prepare:q=>new Statement(q),async batch(statements){
  if(hook){const fn=hook;hook=undefined;await fn()}
  sql.exec('BEGIN');try{const result=statements.map((s,index)=>{s.check();if(index===failAt){failAt=-1;throw Error('SYNTHETIC injected batch failure')}return {meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}}});sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}
 }};
 globalThis.__originalFixtureDb=db;
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('SYNTHETIC forbidden network')};
 t.after(()=>{sql.close();if(directory)fs.rmSync(directory,{recursive:true,force:true});delete globalThis.__originalFixtureDb;delete globalThis.__originalBrowserOwner;globalThis.fetch=oldFetch});
 return {get sql(){return sql},queries,beforeBatch:fn=>{hook=fn},failBatchAt:index=>{failAt=index},reopen(){sql.close();sql=new DatabaseSync(file)}};
}
function snapshot(f){return clone(Object.fromEntries(f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,f.sql.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()])))}
async function unchanged(f,fn,status=409){const before=snapshot(f);await assert.rejects(fn,e=>e.status===status);assert.deepEqual(snapshot(f),before)}
const create=async(request_id='SYNTHETIC-create',value=input(),owner=OWNER)=>(await p.createOriginal(owner,{request_id,input:value})).original;
const topic=(f,id)=>f.sql.prepare('SELECT * FROM topics WHERE id=?').get(id);

test('SYNTHETIC concurrent and retried original submission creates exactly one topic, no production or publication work',async t=>{
 const f=fixture(t),body={request_id:'SYNTHETIC-double-submit',input:input()};
 const values=await Promise.all([p.createOriginal(OWNER,body),p.createOriginal(OWNER,body)]);
 assert.equal(values[0].original.id,values[1].original.id);assert.ok(values.some(v=>v.replayed));
 const original=values[0].original,before=snapshot(f);
 assert.equal((await p.createOriginal(OWNER,body)).replayed,true);assert.deepEqual(snapshot(f),before);
 const again=await p.createOriginal(OWNER,{request_id:'SYNTHETIC-new-request-same-original',input:input()});
 assert.equal(again.original.id,original.id);assert.equal(again.duplicate,true);assert.equal(again.original.versions[0].draft,input().draft);
 await unchanged(f,()=>p.createOriginal(OWNER,{request_id:'SYNTHETIC-new-request-different-draft',input:input({draft:'SYNTHETIC alternate draft must not be silently discarded'})}));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM topics').get().n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM publishing_slots').get().n,0);
 assert.equal(topic(f,original.topic.id).source_id,'owner-original');assert.equal(topic(f,original.topic.id).published_at,null);assert.equal(topic(f,original.topic.id).material,'待核实');
 await unchanged(f,()=>p.createOriginal(OWNER,{...body,input:input({draft:'SYNTHETIC changed replay'})}));
});

test('SYNTHETIC competing distinct request IDs deduplicate identical owner text and isolate another owner',async t=>{
 const f=fixture(t),results=await Promise.all([p.createOriginal(OWNER,{request_id:'SYNTHETIC-one',input:input()}),p.createOriginal(OWNER,{request_id:'SYNTHETIC-two',input:input()})]);
 assert.equal(results[0].original.id,results[1].original.id);assert.equal(f.sql.prepare('SELECT count(*) n FROM topics').get().n,1);
 const other=await create('SYNTHETIC-one',input(),OTHER);assert.notEqual(other.id,results[0].original.id);
 assert.deepEqual((await p.listOriginals(OWNER)).map(v=>v.id),[results[0].original.id]);
 await unchanged(f,()=>p.getOriginal(other.id,OWNER),403);
 await unchanged(f,()=>p.editOriginal(other.id,OWNER,{request_id:'SYNTHETIC-theft',expected_version:1,input:editInput()}),403);
});

test('SYNTHETIC racing different drafts for one original preserve the winner and every loser retry returns a conflict',async t=>{
 const f=fixture(t),loser={request_id:'SYNTHETIC-racing-loser',input:input({draft:'SYNTHETIC losing new draft must remain unsaved'})};let winner;
 f.beforeBatch(async()=>{winner=await create('SYNTHETIC-racing-winner')});
 await assert.rejects(()=>p.createOriginal(OWNER,loser),e=>e.status===409);
 assert.ok(winner);assert.equal(f.sql.prepare('SELECT count(*) n FROM topics').get().n,1);
 const saved=await p.getOriginal(winner.id,OWNER);assert.equal(saved.version,1);assert.equal(saved.versions.length,1);assert.equal(saved.versions[0].draft,input().draft);
 // A receipt from the already rejected race is an idempotency trace, never a success.
 const before=snapshot(f);await assert.rejects(()=>p.createOriginal(OWNER,loser),e=>e.status===409);assert.deepEqual(snapshot(f),before);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n,0);
});

test('SYNTHETIC browser API rejects anonymous, cross-origin, wrong content type and forged owner fields',async t=>{
 const f=fixture(t),origin='https://synthetic.test',body={action:'create',request_id:'SYNTHETIC-http',input:input()};
 const post=(payload=body,headers={})=>p.originalPOST(new Request(origin+'/api/originals',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(payload)}));
 const before=snapshot(f);assert.equal((await p.originalGET(new Request(origin+'/api/originals'))).status,401);assert.equal((await post()).status,403);
 globalThis.__originalBrowserOwner=OWNER;
 assert.equal((await post(body,{Origin:'https://different.test'})).status,403);assert.equal((await post(body,{'Content-Type':'text/plain'})).status,403);
 assert.equal((await post({...body,owner_id:OTHER})).status,400);assert.deepEqual(snapshot(f),before);
 const response=await post();assert.equal(response.status,200);const owned=(await response.json()).original;assert.equal(owned.owner_id,OWNER);
 const other=await create('SYNTHETIC-other',input(),OTHER);
 assert.equal((await p.originalGET(new Request(origin+'/api/originals?id='+other.id))).status,403);
 const list=await (await p.originalGET(new Request(origin+'/api/originals'))).json();assert.deepEqual(list.originals.map(v=>v.id),[owned.id]);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n,0);
});

test('SYNTHETIC complete text and draft retain every UTF-8 byte, whitespace and null release date after database reopen',async t=>{
 const f=fixture(t,{persistent:true}),value=input({original_text:' \r\n'+('SYNTHETIC 原文段落：不得由摘要复原。\r\n').repeat(700)+'\n ',draft:'\n'+('SYNTHETIC 完整草稿、素材需求与待核矩阵。\n').repeat(1500)+'\n'}),created=await create('SYNTHETIC-persistent',value);
 assert.ok(Buffer.byteLength(value.original_text)>20000);assert.ok(Buffer.byteLength(value.draft)>50000);
 f.reopen();const read=await p.getOriginal(created.id,OWNER),v=read.versions[0];
 assert.deepEqual(Buffer.from(read.original_text),Buffer.from(value.original_text));assert.deepEqual(Buffer.from(v.draft),Buffer.from(value.draft));assert.equal(read.original_sha256,sha(value.original_text));assert.equal(v.draft_sha256,sha(value.draft));assert.deepEqual(read.source_refs,value.source_refs);assert.equal(read.description_date,'2026-10-23');assert.equal(topic(f,read.topic.id).published_at,null);
 assert.ok(f.queries.some(q=>/key>=\? AND key<\?/.test(q.query)));assert.ok(!f.queries.some(q=>/LIKE|GLOB/.test(q.query)));
});

test('SYNTHETIC failed create batch rolls back receipt, original, version, mapping and topic, then same request can retry',async t=>{
 const f=fixture(t),before=snapshot(f),body={request_id:'SYNTHETIC-rollback',input:input()};f.failBatchAt(4);
 await assert.rejects(()=>p.createOriginal(OWNER,body),/injected batch failure/);assert.deepEqual(snapshot(f),before);
 const saved=await p.createOriginal(OWNER,body);assert.equal(saved.replayed,false);assert.equal(saved.original.versions.length,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM topics').get().n,1);
});

test('SYNTHETIC edit appends a version, preserves original and stable topic, replays once and rejects stale or conflicting edits',async t=>{
 const f=fixture(t),created=await create(),body={request_id:'SYNTHETIC-edit',expected_version:1,input:editInput({title:'SYNTHETIC revised title',draft:'  SYNTHETIC 改写草稿\r\n'})};
 const changed=(await p.editOriginal(created.id,OWNER,body)).original;assert.equal(changed.version,2);assert.equal(changed.topic.id,created.topic.id);assert.equal(changed.original_text,created.original_text);assert.deepEqual(changed.versions[0],created.versions[0]);assert.equal(changed.versions[1].draft,body.input.draft);assert.equal(topic(f,created.topic.id).title,body.input.title);
 const before=snapshot(f);assert.equal((await p.editOriginal(created.id,OWNER,body)).replayed,true);assert.deepEqual(snapshot(f),before);
 await unchanged(f,()=>p.editOriginal(created.id,OWNER,{...body,request_id:'SYNTHETIC-stale'}));
 await unchanged(f,()=>p.editOriginal(created.id,OWNER,{...body,input:editInput({draft:'SYNTHETIC changed replay'})}));
 await unchanged(f,()=>p.editOriginal(created.id,OWNER,{request_id:'SYNTHETIC-immutable-original',expected_version:2,input:{...editInput(),original_text:'SYNTHETIC overwrite original'}}),400);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM topics').get().n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n,0);
});

test('SYNTHETIC concurrent edits cannot both write version two and a failed edit batch leaves prior state intact',async t=>{
 const f=fixture(t),created=await create();let winner;
 f.beforeBatch(async()=>{await p.editOriginal(created.id,OWNER,{request_id:'SYNTHETIC-winner',expected_version:1,input:editInput({draft:'SYNTHETIC winner'})});winner=snapshot(f)});
 await assert.rejects(()=>p.editOriginal(created.id,OWNER,{request_id:'SYNTHETIC-loser',expected_version:1,input:editInput({draft:'SYNTHETIC loser'})}),e=>e.status===409);assert.deepEqual(snapshot(f),winner);
 const before=snapshot(f);f.failBatchAt(3);await assert.rejects(()=>p.editOriginal(created.id,OWNER,{request_id:'SYNTHETIC-edit-fail',expected_version:2,input:editInput()}),/injected/);assert.deepEqual(snapshot(f),before);
});

test('SYNTHETIC unrelated favorites, exclusions, old production records and publishing plan survive create and edit byte-for-byte',async t=>{
 const f=fixture(t),old=await create('SYNTHETIC-legacy-material',input({original_text:'SYNTHETIC old material'}));
 f.sql.prepare('INSERT INTO favorites(user_id,topic_id,created_at) VALUES (?,?,?)').run(OWNER,old.topic.id,AT);
 f.sql.prepare('INSERT INTO dispositions(user_id,topic_id,status,updated_at) VALUES (?,?,?,?)').run(OWNER,old.topic.id,'rejected',AT);
 f.sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,status,source_snapshot,skill_snapshot,contract_hash,created_at,updated_at) VALUES (?,?,?,'paused','{}','{}','SYNTHETIC-old-contract',?,?)").run('SYNTHETIC-old-job',old.topic.id,OWNER,AT,AT);
 f.sql.prepare('INSERT INTO production_drafts(job_id,revision,submission_id,content,content_hash,executor,created_at) VALUES (?,1,?,?,?,?,?)').run('SYNTHETIC-old-job','SYNTHETIC-old-submit','SYNTHETIC preserved original draft','SYNTHETIC-hash','SYNTHETIC-executor',AT);
 f.sql.prepare('INSERT INTO publishing_plans(owner_id,enabled,created_at,updated_at) VALUES (?,1,?,?)').run(OWNER,AT,AT);
 const kept=['favorites','dispositions','production_jobs','production_drafts','publishing_plans'],before=Object.fromEntries(kept.map(name=>[name,clone(f.sql.prepare('SELECT * FROM '+name).all())]));
 const saved=await create('SYNTHETIC-new-material');await p.editOriginal(saved.id,OWNER,{request_id:'SYNTHETIC-new-edit',expected_version:1,input:editInput({draft:'SYNTHETIC new draft'})});
 for(const name of kept)assert.deepEqual(clone(f.sql.prepare('SELECT * FROM '+name).all()),before[name],name);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n,1);
});

test('SYNTHETIC external news ingestion cannot overwrite an original topic via existing ID',async t=>{
 const f=fixture(t),original=await create(),before=clone(topic(f,original.topic.id)),entries=p.validateEntries([{url:'https://news.example/report',source:'SYNTHETIC 外部新闻',title:'SYNTHETIC 中文新闻标题',summary:'这是用于本机隔离测试的中文新闻摘要，包含足够中文供来源规则检查，不代表任何真实产品或外部报道，也不应修改本人原创资料。',angle:'SYNTHETIC 中文切口',materials:'SYNTHETIC 未看素材',risk:'SYNTHETIC 尚未核实',published_at:null,existing_id:original.topic.id}]);
 await assert.rejects(()=>p.ingest(entries),/本人原创资料不能由外部新闻导入覆盖/);assert.deepEqual(clone(topic(f,original.topic.id)),before);assert.equal((await p.getOriginal(original.id,OWNER)).original_text,input().original_text);
});

test('SYNTHETIC explicit later job freezes original and draft, materializes without fetch, keeps old snapshot after edits and rejects tampering',async t=>{
 const f=fixture(t),original=await create();assert.equal(f.sql.prepare('SELECT count(*) n FROM production_jobs').get().n,0);
 await unchanged(f,()=>p.createJob(original.topic.id,OTHER),403);
 const j=(await p.createJob(original.topic.id,OWNER)).job,snapshot=j.source_snapshot,source=JSON.parse(snapshot);assert.equal(source.original.version,1);assert.equal(source.original.original_text,input().original_text);assert.equal(source.original.draft,input().draft);assert.equal(source.published_at,null);
 const material=await p.materializeSource(j.id,0,0,j.contract_hash,async()=>{throw Error('SYNTHETIC must not fetch')});
 const packet=JSON.parse(material.content);assert.equal(packet.original.original_text,input().original_text);assert.equal(packet.original.draft,input().draft);assert.equal(material.sha256,sha(material.content));assert.equal(material.source_snapshot_hash,sha(snapshot));assert.equal(material.complete_response,true);assert.equal(material.source_kind,'owner-original');assert.match(packet.boundary,/待核项不是实测/);
 await p.editOriginal(original.id,OWNER,{request_id:'SYNTHETIC-edit-after-freeze',expected_version:1,input:editInput({draft:'SYNTHETIC newer draft'})});assert.equal((await p.getJob(j.id,OWNER)).source_snapshot,snapshot);assert.equal((await p.materializeSource(j.id,0,0,j.contract_hash,async()=>{throw Error('no network')})).content,material.content);
 await assert.rejects(()=>p.materializedOriginal({...source,original:{...source.original,draft:'SYNTHETIC tampered'}}),e=>e.status===409);
 await assert.rejects(()=>p.materializedOriginal(source,OTHER),e=>e.status===409);
 await assert.rejects(()=>p.frozenOriginalForTopic(topic(f,original.topic.id),OTHER),e=>e.status===403);
});

test('SYNTHETIC invalid dates, forbidden authorization fields, malformed refs and oversized input cannot partially persist',async t=>{
 const f=fixture(t);
 for(const [index,change] of [{description_date:'2026-02-30'},{description_date:'not a date'},{quality_approved:true},{source_refs:[{library_file_id:'https://fake.example',version:0,file_name:'fake'}]},{original_text:'x'.repeat(100001)}].entries())await unchanged(f,()=>create('SYNTHETIC-invalid-'+index,input(change)),400);
});
