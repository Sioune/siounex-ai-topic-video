// Synthetic owner/platform observations in real SQLite. Never opens or writes a real platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

const OWNER='SYNTHETIC-owner';
const bundled=await build({stdin:{contents:"export * from './lib/publishing-existing.ts';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'existing-fixture',setup(b){b.onResolve({filter:/^\.\/store$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/^\.\/production$/},()=>({path:'job',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='db'?'export function db(){return globalThis.__existingFixture.db}':'export async function getJob(id,owner){const f=globalThis.__existingFixture;const j=f.sql.prepare("SELECT * FROM production_jobs WHERE id=? AND owner_id=?").get(id,owner);if(!j)throw Error("SYNTHETIC owner mismatch");return j}'}));}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
function fixture(t){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 sql.prepare('INSERT INTO publishing_authorizations(id,owner_id,request_id,reference,content_hash,created_at) VALUES (?,?,?,?,?,?)').run('SYNTHETIC-grant',OWNER,'SYNTHETIC-request','SYNTHETIC owner enabled collection','a'.repeat(64),'2026-10-16T00:00:00Z');
 sql.prepare('INSERT INTO publishing_plans(owner_id,enabled,authorization_id,active_since,created_at,updated_at) VALUES (?,1,?,?,?,?)').run(OWNER,'SYNTHETIC-grant','2026-10-16T00:00:00Z','2026-10-16T00:00:00Z','2026-10-16T00:00:00Z');
 class Statement{constructor(query,args=[]){this.query=query;this.args=args}bind(...args){return new Statement(this.query,args)}async first(){return sql.prepare(this.query).get(...this.args)||null}async all(){return {results:sql.prepare(this.query).all(...this.args)}}async run(){return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}}}execute(){return /^\s*SELECT/i.test(this.query)?{results:sql.prepare(this.query).all(...this.args)}:{meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}}}}
 const f={sql,owner:OWNER,now:'2026-10-20T02:00:00Z',calls:[],publishCalls:0,connected:true,result:null,collectHook:null};f.db={prepare:q=>new Statement(q),async batch(s){sql.exec('BEGIN');try{const out=s.map(x=>x.execute());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};globalThis.__existingFixture=f;t.after(()=>{sql.close();delete globalThis.__existingFixture;});
 f.add=(id,owner=OWNER)=>{sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk) VALUES (?,?,'synthetic','synthetic',?,?,'s',?,'AI实用',1,'m','h','a','m','r')").run('t-'+id,'https://synthetic.invalid/'+id,id,id,f.now);sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,created_at,updated_at) VALUES (?,?,?,0,'completed','{}','{}','SYNTHETIC',?,?)").run(id,'t-'+id,owner,f.now,f.now);};
 f.video=(id,job,platform='bilibili',owner=OWNER,published='2026-10-18T12:00:00Z',supersedes=null)=>{sql.prepare('INSERT INTO production_data_videos(id,owner_id,title,topic_type,published_at,publication_source,job_id,supersedes_id,record_hash,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,id,'other',published,JSON.stringify({schema:'owner-click-publication-v1',platform,platform_url:'https://www.bilibili.com/video/BVSYNTHETIC',independent_platform_verification:false}),job,supersedes,'hash-'+id,'request-'+id,f.now);};
 f.observe=(changes={})=>api.recordExistingPlatformObservation(OWNER,{job_id:'one',platform:'bilibili',account_id:'SYNTHETIC-bilibili-owner',external_post_id:'BV1JAnG6HEB7',platform_url:'https://www.bilibili.com/video/BV1JAnG6HEB7',platform_published_at:'2026-10-18T18:20:11+08:00',observed_at:f.now,evidence_reference:'https://member.bilibili.com/platform/upload-manager/article',evidence_note:'SYNTHETIC actual creator row and exact BVID/publication time',observation_kind:'creator-backend-observation',independently_observed:true,identity_match_note:'SYNTHETIC same logged-in creator account, title, video content and publication row',...changes},f.adapter);
 f.adapter={now:()=>new Date(f.now),status:async(owner,p)=>({platform:p,connected:f.connected,account_id:f.connected?'SYNTHETIC-'+p+'-owner':null,can_publish:false,can_collect:f.connected,reason:f.connected?null:'SYNTHETIC login required'}),publish:async()=>{f.publishCalls++;throw Error('must never publish')},collect:async input=>{f.calls.push(input);await f.collectHook?.(input);return f.result||{status:'collected',observed_at:f.now,metrics:{plays:4113,average_duration:10.2,completion_rate:1.1,likes:9,comments:1,saves:0,follows:0},source:{kind:'creator-browser-observation',url:input.platform==='bilibili'?'https://member.bilibili.com/platform/upload-manager/article':'https://cp.kuaishou.com/statistics/article/detail/'+input.external_post_id,note:'SYNTHETIC exact current core metrics, not the adjacent prior-seven-days panel',external_post_id:input.external_post_id,mapping_version:'synthetic-v1'}};}};
 f.count=table=>sql.prepare('SELECT count(*) n FROM '+table).get().n;
 f.protected=()=>JSON.stringify(['production_jobs','production_milestones','production_reviews','production_data_videos','production_data_samples','production_data_collections','publishing_plans','publishing_posts','publishing_reserve','publishing_slots'].map(table=>sql.prepare('SELECT * FROM '+table).all()));
 return f;
}

test('legacy missed target resumes a real later observation instead of discarding it forever',async t=>{
 const f=fixture(t);f.add('one');await f.observe();f.result={status:'pending',reason:'SYNTHETIC delayed device'};await api.runExistingCollectionTick(OWNER,f.adapter);
 const target=f.sql.prepare('SELECT * FROM publishing_existing_collections WHERE target_hours=24').get();f.sql.prepare("UPDATE publishing_existing_collections SET status='missed',next_retry_at=NULL WHERE id=?").run(target.id);
 f.now='2026-10-22T02:00:00Z';f.result=null;const d=await api.runExistingCollectionTick(OWNER,f.adapter),saved=d.existing_collections.find(c=>c.id===target.id);
 assert.equal(saved.status,'collected');assert.equal(saved.observed_at,new Date(f.now).toISOString());assert.equal(saved.late,true);assert.equal(saved.strict_target_comparable,false);assert.equal(saved.metrics.saves,0);
 const source=JSON.parse(f.sql.prepare('SELECT source FROM publishing_existing_collections WHERE id=?').get(target.id).source);assert.equal(source.timing.observed_at,new Date(f.now).toISOString());assert.equal(source.timing.strict_target_comparable,false);assert.equal(f.publishCalls,0);
});

test('current candidates are read-only owner registrations, including a newly registered video-channel publication',async t=>{
 const f=fixture(t);f.add('one');f.add('other','other');f.video('old','one');f.video('current','one','wechat_channels',OWNER,'2026-10-19T12:00:00Z','old');f.video('foreign','other','bilibili','other');const before=f.protected(),r=await api.readExistingPublicationCandidates(OWNER);assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].data_video_id,'current');assert.equal(r.candidates[0].platform,'wechat_channels');assert.equal(r.candidates[0].registered_published_at,'2026-10-19T12:00:00Z');assert.equal(r.candidates[0].verification_state,'needs_reconciliation');assert.equal(r.candidates[0].external_post_id,null);assert.equal(f.protected(),before);
});

test('verified links preserve registered time and original approvals without fabricating slots or releases',async t=>{
 const f=fixture(t);f.add('one');f.video('registered','one');const before=f.protected(),r=await f.observe({data_video_id:'registered'});assert.equal(r.existing_publications[0].verification_state,'verified');assert.equal(r.existing_publications[0].registered_published_at,'2026-10-18T12:00:00Z');assert.equal(r.existing_publications[0].platform_published_at,'2026-10-18T10:20:11.000Z');assert.equal(r.existing_publications[0].identity_method,'creator-account-and-content-observation');assert.equal((await f.observe({data_video_id:'registered'})).replayed,true);assert.equal(f.protected(),before);assert.equal(f.count('publishing_existing_posts'),1);assert.equal(f.publishCalls,0);
 const fact=f.sql.prepare("SELECT value FROM app_state WHERE key LIKE 'existing_platform_observation_v1:%'").get().value;assert.match(fact,/未声明平台媒体文件SHA256/);assert.doesNotMatch(fact,/cryptographic/);
});

test('missing IDs or independent evidence remain pending reconciliation rather than false platform verification',async t=>{
 const f=fixture(t);f.add('one');let r=await f.observe({external_post_id:null,platform_url:null});assert.equal(r.existing_publications[0].verification_state,'needs_reconciliation');await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(f.calls.length,0);assert.equal(f.count('publishing_existing_collections'),0);
 r=await f.observe({independently_observed:false});assert.equal(r.existing_publications[0].verification_state,'needs_reconciliation');r=await f.observe();assert.equal(r.existing_publications[0].verification_state,'verified');
});

test('existing collection respects paused or absent owner authorization without materializing targets',async t=>{
 const f=fixture(t);f.add('one');await f.observe();
 f.sql.prepare('UPDATE publishing_plans SET enabled=0 WHERE owner_id=?').run(OWNER);await api.runExistingCollectionTick(OWNER,f.adapter);
 assert.equal(f.calls.length,0);assert.equal(f.count('publishing_existing_collections'),0);
 f.sql.prepare('DELETE FROM publishing_plans WHERE owner_id=?').run(OWNER);await api.runExistingCollectionTick(OWNER,f.adapter);
 assert.equal(f.calls.length,0);assert.equal(f.count('publishing_existing_collections'),0);
});

test('existing readback cannot complete after the owner pauses collection mid-observation',async t=>{
 const f=fixture(t);f.add('one');await f.observe();f.collectHook=async()=>{f.sql.prepare('UPDATE publishing_plans SET enabled=0 WHERE owner_id=?').run(OWNER);};
 const d=await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(f.calls.length,1);assert.equal(d.existing_collections.filter(c=>c.status==='collected').length,0);
 const attempted=d.existing_collections.find(c=>c.status==='pending');assert.ok(attempted);assert.equal(attempted.metrics,null);assert.match(attempted.reason,/暂停|授权/);
});

test('real owner/job, matching original registration and exact official post identity are required',async t=>{
 const f=fixture(t);f.add('one');f.add('two');f.add('foreign','other');f.video('foreign-video','foreign','bilibili','other');f.video('other-job','two');f.video('legacy-owner-null','one','bilibili',null);
 await assert.rejects(()=>f.observe({job_id:'foreign'}));await assert.rejects(()=>f.observe({data_video_id:'foreign-video'}),/本人/);await assert.rejects(()=>f.observe({data_video_id:'other-job'}),/匹配/);await assert.rejects(()=>f.observe({data_video_id:'legacy-owner-null'}),/本人/);
 await assert.rejects(()=>f.observe({platform_url:'https://cp.kuaishou.com/a/BV1JAnG6HEB7'}),/对应平台/);await assert.rejects(()=>f.observe({platform_url:'https://www.bilibili.com/video/BVWRONG'}),/作品ID/);await assert.rejects(()=>f.observe({platform_published_at:'2026-10-21T10:00:00Z'}),/晚于/);await assert.rejects(()=>f.observe({observed_at:'2026-10-21T10:00:00Z'}),/未来/);
});

test('sticky video-channel policy blocks even a complete observation and never calls a collector',async t=>{
 const f=fixture(t);f.add('one');f.sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?)').run('publishing_browser_account_v2:'+OWNER+':wechat_channels',JSON.stringify({state:'security_blocked'}));const r=await f.observe({platform:'wechat_channels',account_id:'SYNTHETIC-wechat_channels-owner',external_post_id:'SYNTHETIC-channel-post',platform_url:'https://channels.weixin.qq.com/platform/SYNTHETIC-channel-post',evidence_reference:'https://channels.weixin.qq.com/platform'});assert.equal(r.existing_publications[0].verification_state,'policy_blocked');await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(f.calls.length,0);assert.equal(f.count('publishing_existing_collections'),0);
});

test('delayed T24 remains a real target sample distinct from daily snapshots; real zeros stay zeros',async t=>{
 const f=fixture(t);f.add('one');await f.observe();const before=f.protected();let d=await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(d.existing_collections.length,3);assert.equal(d.existing_collections.find(c=>c.target_hours===24).status,'collected');assert.equal(d.existing_collections.find(c=>c.target_hours===24).observed_at,new Date(f.now).toISOString());assert.equal(d.existing_collections.find(c=>c.target_hours===24).late,true);assert.equal(d.existing_collections.find(c=>c.target_hours===24).strict_target_comparable,false);assert.equal(d.existing_collections.find(c=>c.target_hours===48).due_at,'2026-10-20T10:20:11.000Z');const snapshot=d.existing_collections.find(c=>c.sample_kind==='single_snapshot');assert.equal(snapshot.target_hours,null);assert.equal(snapshot.status,'collected');assert.equal(snapshot.metrics.plays,4113);assert.equal(snapshot.metrics.recommendations,null);assert.equal(snapshot.metrics.saves,0);assert.equal(f.protected(),before);
 const calls=f.calls.length;await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(f.calls.length,calls);f.now='2026-10-20T10:20:11Z';d=await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(d.existing_collections.find(c=>c.target_hours===48).status,'collected');assert.equal(f.calls.at(-1).target_hours,48);
 f.now='2026-10-21T02:00:00Z';d=await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(d.existing_collections.filter(c=>c.sample_kind==='single_snapshot').length,2);assert.equal(f.calls.at(-1).collection_key,'snapshot:2026-10-21');assert.equal(f.publishCalls,0);
});

test('off-slot 11:30 maintenance materializes a real existing-publication T48 target without publication state',async t=>{
 const f=fixture(t);f.now='2026-10-20T03:29:59Z';f.add('one');await f.observe({platform_published_at:'2026-10-18T03:30:00Z'});const before=f.protected();f.result={status:'pending',reason:'SYNTHETIC awaiting actual browser metrics'};
 let d=await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(d.existing_collections.find(c=>c.target_hours===48).status,'scheduled');assert.equal(f.calls.some(c=>c.target_hours===48),false);
 f.now='2026-10-20T03:30:00Z';d=await api.runExistingCollectionTick(OWNER,f.adapter);const target=d.existing_collections.find(c=>c.target_hours===48);assert.equal(target.due_at,'2026-10-20T03:30:00.000Z');assert.equal(target.status,'pending');assert.equal(target.metrics,null);assert.equal(f.calls.filter(c=>c.target_hours===48).length,1);assert.equal(f.protected(),before);assert.equal(f.publishCalls,0);assert.equal(f.count('publishing_slots'),0);assert.equal(f.count('publishing_reserve'),0);assert.equal(f.count('publishing_posts'),0);
});

test('concurrent collection ticks use one durable claim per target and never duplicate snapshots',async t=>{
 const f=fixture(t);f.add('one');await f.observe();await Promise.all([api.runExistingCollectionTick(OWNER,f.adapter),api.runExistingCollectionTick(OWNER,f.adapter)]);assert.equal(f.calls.length,2);assert.equal(new Set(f.calls.map(c=>c.post_id+':'+c.collection_key)).size,2);assert.equal(f.count('publishing_existing_collections'),3);assert.equal(f.publishCalls,0);
});

test('pending browser work does not invent metrics; unknown, wrong-post and cross-platform evidence are rejected',async t=>{
 const f=fixture(t);f.add('one');await f.observe();f.result={status:'pending',reason:'SYNTHETIC waiting browser'};await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(f.sql.prepare('SELECT count(*) n FROM publishing_existing_collections WHERE metrics IS NOT NULL').get().n,0);
 f.now='2026-10-20T02:01:00Z';f.result={status:'collected',observed_at:f.now,metrics:{plays:null},source:{url:'https://member.bilibili.com/',note:'SYNTHETIC',external_post_id:'BV1JAnG6HEB7'}};await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(f.sql.prepare('SELECT count(*) n FROM publishing_existing_collections WHERE metrics IS NOT NULL').get().n,0);
 f.now='2026-10-20T02:06:00Z';f.result={status:'collected',observed_at:f.now,metrics:{plays:4113},source:{url:'https://cp.kuaishou.com/',note:'SYNTHETIC',external_post_id:'BV1JAnG6HEB7'}};await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(f.sql.prepare('SELECT count(*) n FROM publishing_existing_collections WHERE metrics IS NOT NULL').get().n,0);
 f.now='2026-10-20T02:11:00Z';f.result.source={url:'https://member.bilibili.com/',note:'SYNTHETIC',external_post_id:'BVWRONG'};await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(f.sql.prepare('SELECT count(*) n FROM publishing_existing_collections WHERE metrics IS NOT NULL').get().n,0);
});

test('missing login pauses existing collection; recovered matching account can resume a read-only task',async t=>{
 const f=fixture(t);f.add('one');await f.observe();f.connected=false;let d=await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(d.existing_collections.find(c=>c.target_hours===null).status,'blocked');assert.equal(f.calls.length,0);f.connected=true;f.now='2026-10-20T02:01:00Z';d=await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(d.existing_collections.find(c=>c.target_hours===null).status,'collected');assert.equal(f.publishCalls,0);
});

test('expired collection lease can recover reads while a changed verified post cannot accept an old in-flight result',async t=>{
 const f=fixture(t);f.add('one');await f.observe();f.result={status:'pending'};await api.runExistingCollectionTick(OWNER,f.adapter);const row=f.sql.prepare("SELECT id FROM publishing_existing_collections WHERE target_hours IS NULL").get();f.sql.prepare("UPDATE publishing_existing_collections SET status='collecting',lease_hash='expired',lease_until=1,next_retry_at=NULL WHERE id=?").run(row.id);f.result=null;f.collectHook=async()=>{f.sql.prepare("UPDATE publishing_existing_posts SET verification_state='policy_blocked',record_hash='SYNTHETIC-new-proof' WHERE job_id='one'").run();};await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(f.sql.prepare('SELECT metrics FROM publishing_existing_collections WHERE id=?').get(row.id).metrics,null);
});

test('verified external ID, account and true timestamp are immutable without an explicit correction workflow',async t=>{
 const f=fixture(t);f.add('one');await f.observe();await assert.rejects(()=>f.observe({external_post_id:'BV1LPnM6NEyx',platform_url:'https://www.bilibili.com/video/BV1LPnM6NEyx'}),/不能被覆盖/);await assert.rejects(()=>f.observe({platform_published_at:'2026-10-18T18:23:34+08:00'}),/不能被覆盖/);assert.equal((await api.readExistingPlatformDashboard('other')).existing_publications.length,0);
});

test('official URL query or fragment substrings cannot masquerade as the precise platform post identity',async t=>{
 const f=fixture(t);f.add('one');for(const url of ['https://www.bilibili.com/?id=BV1JAnG6HEB7','https://www.bilibili.com/video/BV1LPnM6NEyx?ref=BV1JAnG6HEB7','https://www.bilibili.com/video/BV1LPnM6NEyx#BV1JAnG6HEB7','https://member.bilibili.com/platform/upload-manager/article?video=BV1JAnG6HEB7'])await assert.rejects(()=>f.observe({platform_url:url}),/路径必须精确/);
 await f.observe({platform_url:'https://member.bilibili.com/platform/upload-manager/article/data/BV1JAnG6HEB7?from=creator'});assert.equal(f.sql.prepare('SELECT verification_state FROM publishing_existing_posts').get().verification_state,'verified');
});

test('current creator-account identity must match before an observation can become independently verified',async t=>{
 const f=fixture(t);f.add('one');let d=await f.observe({account_id:'SYNTHETIC-wrong-account'});assert.equal(d.existing_publications[0].verification_state,'needs_reconciliation');assert.equal(d.existing_publications[0].identity_method,'owner-report-only');f.connected=false;d=await f.observe();assert.equal(d.existing_publications[0].verification_state,'needs_reconciliation');f.connected=true;d=await f.observe();assert.equal(d.existing_publications[0].verification_state,'verified');
});

test('real Kuaishou creator-detail routes resolve only their exact post ID and never a query alias',async t=>{
 const f=fixture(t);f.add('one');const fields={platform:'kuaishou',account_id:'SYNTHETIC-kuaishou-owner',external_post_id:'3x4cdne9bxpbbkk',platform_url:'https://cp.kuaishou.com/statistics/article/detail/3x4cdne9bxpbbkk',evidence_reference:'https://cp.kuaishou.com/statistics/article/detail/3x4cdne9bxpbbkk',platform_published_at:'2026-10-18T18:23:34+08:00'};await assert.rejects(()=>f.observe({...fields,platform_url:'https://cp.kuaishou.com/statistics/article/detail/OTHER?postid=3x4cdne9bxpbbkk'}),/路径必须精确/);const d=await f.observe(fields);assert.equal(d.existing_publications[0].verification_state,'verified');assert.equal(d.existing_publications[0].platform_published_at,'2026-10-18T10:23:34.000Z');
});

test('observed Douyin creator work-detail routes match only the numeric path ID on the precise creator host',async t=>{
 const f=fixture(t);f.add('one');const id='7697949692843363584',route='https://creator.douyin.com/creator-micro/work-management/work-detail/',fields={platform:'douyin',account_id:'SYNTHETIC-douyin-owner',external_post_id:id,platform_url:route+id+'?enter_from=content',evidence_reference:route+id+'?enter_from=content',evidence_note:'SYNTHETIC exact observed creator-detail route identity'};
 for(const platform_url of [route+'1234567890123456789',route+'1234567890123456789?ref='+id,route+'1234567890123456789#'+id,route+'?id='+id,route+id+'/extra','https://www.douyin.com/creator-micro/work-management/work-detail/'+id])await assert.rejects(()=>f.observe({...fields,platform_url}),/路径必须精确/);
 await assert.rejects(()=>f.observe({...fields,external_post_id:'not-numeric',platform_url:route+'not-numeric'}),/路径必须精确/);const d=await f.observe(fields);assert.equal(d.existing_publications[0].verification_state,'verified');assert.equal(d.existing_publications[0].external_post_id,id);assert.equal(d.existing_publications[0].platform_url,route+id+'?enter_from=content');
});

test('ever-verified identity and true platform time stay locked after login or evidence downgrade',async t=>{
 const f=fixture(t);f.add('one');await f.observe();f.connected=false;let d=await f.observe();assert.equal(d.existing_publications[0].verification_state,'needs_reconciliation');f.connected=true;
 await assert.rejects(()=>f.observe({external_post_id:'BV1LPnM6NEyx',platform_url:'https://www.bilibili.com/video/BV1LPnM6NEyx'}),/首次已核验.*不能.*覆盖/);await assert.rejects(()=>f.observe({platform_published_at:'2026-10-18T18:23:34+08:00'}),/不能.*覆盖/);await assert.rejects(()=>f.observe({account_id:'SYNTHETIC-other-account'}),/不能.*覆盖/);
 d=await f.observe();assert.equal(d.existing_publications[0].verification_state,'verified');assert.equal(d.existing_publications[0].external_post_id,'BV1JAnG6HEB7');assert.equal(d.existing_publications[0].platform_published_at,'2026-10-18T10:20:11.000Z');assert.equal(f.sql.prepare("SELECT count(*) n FROM app_state WHERE key LIKE 'existing_platform_verified_identity_v1:%'").get().n,1);
 // Simulate an older deployment without a dedicated lock: immutable verified receipts still protect identity.
 f.sql.prepare("DELETE FROM app_state WHERE key LIKE 'existing_platform_verified_identity_v1:%'").run();f.connected=false;await f.observe();f.sql.prepare("DELETE FROM app_state WHERE key LIKE 'existing_platform_verified_identity_v1:%'").run();f.connected=true;await assert.rejects(()=>f.observe({platform_published_at:'2026-10-18T18:23:34+08:00'}),/不能.*覆盖/);
});

test('an old collection anchor cannot read metrics from a post with a different verified publication time',async t=>{
 const f=fixture(t);f.add('one');await f.observe({platform_published_at:'2026-10-19T02:00:00Z'});f.result={status:'pending'};await api.runExistingCollectionTick(OWNER,f.adapter);const originalCalls=f.calls.filter(c=>c.target_hours===24).length;assert.equal(originalCalls,1);
 f.sql.prepare("UPDATE publishing_existing_collections SET anchor_published_at='2026-10-18T02:00:00.000Z' WHERE target_hours=24").run();f.now='2026-10-20T02:01:00Z';const d=await api.runExistingCollectionTick(OWNER,f.adapter),old=d.existing_collections.find(c=>c.target_hours===24);assert.equal(old.status,'blocked');assert.match(old.reason,/锚点/);assert.equal(f.calls.filter(c=>c.target_hours===24).length,originalCalls);assert.equal(old.metrics,null);
});

test('minute publication facts keep unknown seconds explicit in durable identity, DTO and target windows',async t=>{
 const f=fixture(t);f.add('one');f.video('registered','one');const before=f.protected(),fields={data_video_id:'registered',platform_published_at:'2026-10-18T18:20+08:00',published_at_precision:'minute'};
 let d=await f.observe(fields),p=d.existing_publications[0];assert.equal(p.platform_published_at,'2026-10-18T10:20:00.000Z');assert.equal(p.published_at_precision,'minute');assert.equal(p.published_at_range_start,p.platform_published_at);assert.equal(p.published_at_range_end,'2026-10-18T10:20:59.000Z');assert.equal(p.published_at_uncertainty_seconds,59);
 assert.equal((await f.observe({...fields,platform_published_at:'2026-10-18T10:20:00.000Z'})).replayed,true);const lock=JSON.parse(f.sql.prepare("SELECT value FROM app_state WHERE key LIKE 'existing_platform_verified_identity_v1:%'").get().value);assert.equal(lock.published_at_precision,'minute');
 d=await api.runExistingCollectionTick(OWNER,f.adapter);const standard=d.existing_collections.find(c=>c.target_hours===48),snapshot=d.existing_collections.find(c=>c.target_hours===null);assert.equal(standard.due_at,'2026-10-20T10:20:00.000Z');assert.equal(standard.due_at_range_end,'2026-10-20T10:20:59.000Z');assert.equal(standard.anchor_published_at_precision,'minute');assert.equal(standard.anchor_uncertainty_seconds,59);assert.equal(snapshot.due_at_range_end,null);assert.equal(f.calls[0].published_at_precision,'minute');assert.equal(snapshot.metrics.saves,0);assert.equal(snapshot.metrics.recommendations,null);
 f.connected=false;await f.observe(fields);f.connected=true;await assert.rejects(()=>f.observe({...fields,platform_published_at:'2026-10-18T10:20:00Z',published_at_precision:'second'}),/精度不能被覆盖/);assert.equal(f.protected(),before);
});

test('second-precision legacy locks remain immutable and no seconds are inferred from a minute-only input',async t=>{
 const f=fixture(t);f.add('one');await assert.rejects(()=>f.observe({platform_published_at:'2026-10-18T18:20+08:00'}),/真实秒/);await assert.rejects(()=>f.observe({platform_published_at:'2026-10-18T18:20:11+08:00',published_at_precision:'minute'}),/非零秒/);await f.observe();
 const key=f.sql.prepare("SELECT key,value FROM app_state WHERE key LIKE 'existing_platform_verified_identity_v1:%'").get(),legacy=JSON.parse(key.value);delete legacy.published_at_precision;f.sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify(legacy),key.key);
 f.connected=false;await f.observe();f.connected=true;await assert.rejects(()=>f.observe({platform_published_at:'2026-10-18T18:20:00+08:00',published_at_precision:'minute'}),/不能被覆盖/);const d=await f.observe();assert.equal(d.existing_publications[0].published_at_precision,'second');assert.equal(d.existing_publications[0].published_at_uncertainty_seconds,0);assert.equal(d.existing_publications[0].published_at_range_end,'2026-10-18T10:20:11.000Z');
 await api.runExistingCollectionTick(OWNER,f.adapter);assert.equal(Object.hasOwn(f.calls[0],'published_at_precision'),false);
});
