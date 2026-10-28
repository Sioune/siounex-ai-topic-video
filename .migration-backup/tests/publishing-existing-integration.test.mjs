// SYNTHETIC end-to-end local contract regression, not a real platform observation.
// Real controller + publishing core + existing collector + browser bridge + every migration.
// Only D1, owner-bound production reads and archive I/O are replaced. No network/browser/media.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{contents:`export {publishingAction,publishingDashboard} from './lib/publishing-controller';export {readExistingPlatformDashboard} from './lib/publishing-existing';`,resolveDir:root},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-existing-integration-boundaries',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'store',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/production$/},()=>({path:'production',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/site-file-archive$/},()=>({path:'archive',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='store'?`export function db(){return globalThis.__existingIntegration.db;}`:args.path==='production'?`export async function getJob(id,owner){const f=globalThis.__existingIntegration;f.jobReads.push({id,owner});const row=f.sql.prepare('SELECT * FROM production_jobs WHERE id=? AND owner_id=?').get(id,owner);if(!row)throw Error('SYNTHETIC owner-bound job not found');return {...row,milestones:f.sql.prepare('SELECT * FROM production_milestones WHERE job_id=?').all(id)};}`:`export async function getSiteArchiveMetadata(){globalThis.__existingIntegration.archiveReads++;throw Error('Existing collection must never inspect video archives');}export async function readSiteArchiveFile(){globalThis.__existingIntegration.archiveReads++;throw Error('Existing collection must never download media');}`}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=synthetic:publishing-existing-integration.bundle.mjs\n').toString('base64'));
const OWNER='SYNTHETIC-integration-owner',OTHER='SYNTHETIC-other-owner',JOB='SYNTHETIC-existing-job',REGISTERED='2026-10-16T12:00:00.000Z',PUBLISHED='2026-10-16T10:20:11.000Z';

function fixture(t){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 const migrations=fs.readdirSync(root+'drizzle').filter(name=>name.endsWith('.sql')).sort();
 for(const file of migrations)sql.exec(fs.readFileSync(root+'drizzle/'+file,'utf8'));
 sql.prepare('INSERT INTO publishing_authorizations(id,owner_id,request_id,reference,content_hash,created_at) VALUES (?,?,?,?,?,?)').run('SYNTHETIC-grant',OWNER,'SYNTHETIC-request','SYNTHETIC owner enabled collection','a'.repeat(64),'2026-10-16T00:00:00Z');
 sql.prepare('INSERT INTO publishing_plans(owner_id,enabled,authorization_id,active_since,created_at,updated_at) VALUES (?,1,?,?,?,?)').run(OWNER,'SYNTHETIC-grant','2026-10-16T00:00:00Z','2026-10-16T00:00:00Z','2026-10-16T00:00:00Z');
 const f={sql,migrations,now:'2026-10-20T02:00:00.000Z',jobReads:[],archiveReads:0};
 class Statement{
  constructor(query,args=[]){this.query=query;this.args=args;}
  bind(...args){return new Statement(this.query,args);}
  async first(){return sql.prepare(this.query).get(...this.args)||null;}
  async all(){return {results:sql.prepare(this.query).all(...this.args)};}
  async run(){return {results:[],meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}
  execute(){return /^\s*SELECT/i.test(this.query)?{results:sql.prepare(this.query).all(...this.args)}:{results:[],meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}
 }
 f.db={prepare:query=>new Statement(query),async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 globalThis.__existingIntegration=f;
 // Control elapsed retry time without sleeping or replacing the real adapter/controller.
 const NativeDate=globalThis.Date;
 globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[f.now]));}static now(){return NativeDate.parse(f.now);}};
 t.after(()=>{globalThis.Date=NativeDate;sql.close();delete globalThis.__existingIntegration;});
 f.count=table=>Number(sql.prepare('SELECT count(*) n FROM '+table).get().n);
 f.protected=()=>JSON.stringify(Object.fromEntries(['topics','production_jobs','production_drafts','production_milestones','production_reviews','production_stages','production_operations','production_data_videos','production_data_samples','production_data_collections','publishing_authorizations','publishing_plans','publishing_reserve','publishing_slots','publishing_posts','publishing_collections'].map(table=>[table,sql.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()])));
 f.workRows=()=>sql.prepare("SELECT value FROM app_state WHERE key LIKE 'publishing_browser_work_v2:%' ORDER BY key").all().map(row=>JSON.parse(row.value));
 f.seed=(platform,url)=>{
  sql.prepare("INSERT INTO topics(id,url,source_id,source,title,original_title,summary,collected_at,category,score,material,highlight,angle,materials,risk) VALUES ('SYNTHETIC-topic','https://synthetic.invalid/fixture','synthetic','synthetic','SYNTHETIC historical video','synthetic','synthetic',?,'AI实用',1,'m','h','a','m','r')").run(REGISTERED);
  // Not a completed production job: the real publishing sync must not reserve a new release.
  sql.prepare("INSERT INTO production_jobs(id,topic_id,owner_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,approved_revision,approved_hash,mode_epoch,created_at,updated_at) VALUES (?,'SYNTHETIC-topic',?,0,'approved','{}','{}','SYNTHETIC-contract',3,3,?,0,?,?)").run(JOB,OWNER,'b'.repeat(64),REGISTERED,REGISTERED);
  sql.prepare("INSERT INTO production_milestones(id,job_id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,created_at,updated_at) VALUES ('SYNTHETIC-video-approved',?,'video',3,1,'SYNTHETIC-artifact','{}','approved',0,?,?)").run(JOB,REGISTERED,REGISTERED);
  sql.prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) VALUES ('SYNTHETIC-original-review',?,3,'SYNTHETIC-artifact','approved','SYNTHETIC existing approval retained',?,?)").run(JOB,OWNER,REGISTERED);
  sql.prepare("INSERT INTO production_data_videos(id,owner_id,title,topic_type,published_at,publication_source,job_id,record_hash,request_id,created_at) VALUES ('SYNTHETIC-registration',?,'SYNTHETIC registered video','other',?,?,?,'SYNTHETIC-registration-hash','SYNTHETIC-registration-request',?)").run(OWNER,REGISTERED,JSON.stringify({schema:'owner-click-publication-v1',platform,platform_url:url,independent_platform_verification:false}),JOB,REGISTERED);
 };
 return f;
}

const platforms=[
 {platform:'bilibili',id:'BV1JAnG6HEB7',account:'SYNTHETIC-bilibili-account',creator:'https://member.bilibili.com/platform/upload-manager/article',post:'https://www.bilibili.com/video/BV1JAnG6HEB7',evidence:'https://member.bilibili.com/platform/upload-manager/article/data/BV1JAnG6HEB7',published:PUBLISHED,precision:'second',uncertainty:0,rangeEnd:PUBLISHED},
 {platform:'kuaishou',id:'3x4cdne9bxpbbkk',account:'SYNTHETIC-kuaishou-account',creator:'https://cp.kuaishou.com/',post:'https://cp.kuaishou.com/statistics/article/detail/3x4cdne9bxpbbkk',evidence:'https://cp.kuaishou.com/statistics/article/detail/3x4cdne9bxpbbkk',published:'2026-10-16T18:16+08:00',normalized:'2026-10-16T10:16:00.000Z',precision:'minute',uncertainty:59,rangeEnd:'2026-10-16T10:16:59.000Z'},
 {platform:'douyin',id:'1234567890123456789',account:'SYNTHETIC-douyin-account',creator:'https://creator.douyin.com/creator-micro/home',post:'https://creator.douyin.com/creator-micro/work-management/work-detail/1234567890123456789',evidence:'https://creator.douyin.com/creator-micro/work-management/work-detail/1234567890123456789',published:'2026-10-16T18:16+08:00',normalized:'2026-10-16T10:16:00.000Z',precision:'minute',uncertainty:59,rangeEnd:'2026-10-16T10:16:59.000Z'},
];

for(const p of platforms)test(p.platform+' '+p.precision+': existing observation → real browser work → zero/null receipt → same snapshot collected, without production mutation',async t=>{
 const f=fixture(t);f.seed(p.platform,p.post);const before=f.protected();
 assert.ok(f.migrations.includes('0010_existing_platform_collection.sql'));assert.ok(f.migrations.includes('0011_platform_time_precision.sql'));assert.equal(f.sql.prepare("SELECT count(*) n FROM production_jobs WHERE status='completed'").get().n,0);
 const account=await api.publishingAction(OWNER,{action:'observe_account',platform:p.platform,state:'ready',account_id:p.account,account_label:'SYNTHETIC logged-in creator',can_publish:false,can_collect:true,evidence_url:p.creator,evidence_note:'SYNTHETIC current account observation; no real browser opened'});
 assert.equal(account.accounts.find(a=>a.platform===p.platform).can_collect,true);
 const input={action:'observe_existing_publication',job_id:JOB,data_video_id:'SYNTHETIC-registration',platform:p.platform,account_id:p.account,external_post_id:p.id,platform_url:p.post,platform_published_at:p.published,...(p.precision==='minute'?{published_at_precision:'minute'}:{}),observed_at:f.now,evidence_reference:p.evidence,evidence_note:'SYNTHETIC exact creator work and displayed publication time; precision follows the displayed value',observation_kind:'creator-backend-observation',independently_observed:true,identity_match_note:'SYNTHETIC matching current creator account, content and precise platform work ID'};
 if(p.precision==='minute'){
  const {published_at_precision,...noPrecision}=input;
  await assert.rejects(()=>api.publishingAction(OWNER,noPrecision),/秒|second|精度|时间/);
  await assert.rejects(()=>api.publishingAction(OWNER,{...input,published_at_precision:'second'}),/秒|second|精度|时间/);
  await assert.rejects(()=>api.publishingAction(OWNER,{...input,platform_published_at:'2026-10-16T18:16:17+08:00'}),/秒|minute|精度|时间/);
  assert.equal(f.count('publishing_existing_posts'),0,'invalid or overstated time precision cannot create a verified identity');
 }
 await assert.rejects(()=>api.publishingAction(OWNER,{...input,published_at_uncertainty_seconds:0}),/不支持的参数/);
 const recorded=await api.publishingAction(OWNER,input),published=p.normalized||p.published;
 const post=recorded.existing_publications[0];assert.equal(post.verification_state,'verified');assert.equal(post.account_id,p.account);assert.equal(post.external_post_id,p.id);assert.equal(post.platform_published_at,published);assert.equal(post.registered_published_at,REGISTERED);
 assert.equal(post.published_at_precision,p.precision);assert.equal(post.published_at_uncertainty_seconds,p.uncertainty);assert.equal(post.published_at_range_start,published);assert.equal(post.published_at_range_end,p.rangeEnd);
 const storedPost=f.sql.prepare('SELECT * FROM publishing_existing_posts WHERE id=?').get(post.id);assert.equal(storedPost.published_at_precision,p.precision);
 if(p.precision==='minute'){
  const replay=await api.publishingAction(OWNER,{...input,platform_published_at:published});assert.equal(replay.replayed,true,'normalized minute anchors replay the same observed precision');
  await assert.rejects(()=>api.publishingAction(OWNER,{...input,platform_published_at:published,published_at_precision:'second'}),/覆盖|精度|首次|锁定/);
  assert.equal(f.sql.prepare('SELECT published_at_precision FROM publishing_existing_posts WHERE id=?').get(post.id).published_at_precision,'minute','a normalized :00 anchor cannot silently promote unknown seconds');
 }
 assert.equal(recorded.candidates[0].verification_state,'needs_reconciliation','old owner registration retains its original provenance');

 const first=await api.publishingAction(OWNER,{action:'run_collection_tick'},'automation'),snapshot=first.existing_collections.find(c=>c.sample_kind==='single_snapshot');
 assert.equal(snapshot.status,'pending');assert.equal(snapshot.target_hours,null);assert.equal(snapshot.collection_key,'snapshot:2026-10-20');assert.equal(snapshot.metrics,null);assert.equal(first.existing_collections.filter(c=>c.status==='missed').length,0);assert.equal(first.existing_collections.filter(c=>c.target_hours!==null&&c.status==='pending').length,2);
 const pending=await api.publishingAction(OWNER,{action:'read_browser_work'});assert.equal(pending.work.length,3);const work=pending.work.find(w=>w.input.collection_key===snapshot.collection_key);
 assert.equal(work.kind,'collect');assert.equal(work.platform,p.platform);assert.equal(work.input.post_id,post.id);assert.equal(work.input.external_post_id,p.id);assert.equal(work.input.account_id,p.account);assert.equal(work.input.collection_key,snapshot.collection_key);assert.equal(work.input.target_hours,null);assert.equal(work.input.sample_kind,'single_snapshot');assert.equal(work.input.published_at,published);assert.equal(work.input.published_at_precision||'second',p.precision);
 if(p.precision==='second')assert.equal(Object.hasOwn(work.input,'published_at_precision'),false,'legacy second-precision work keeps its original input hash contract');
 for(const collection of first.existing_collections){assert.equal(collection.anchor_published_at_precision,p.precision);assert.equal(collection.anchor_uncertainty_seconds,p.uncertainty);assert.equal(collection.due_at_range_end,collection.sample_kind==='single_snapshot'?null:new Date(Date.parse(collection.due_at)+p.uncertainty*1000).toISOString());}
 const frozen=f.workRows().find(w=>w.id===work.id);assert.equal(frozen.input.owner_id,OWNER);assert.equal(frozen.owner_id,OWNER);assert.equal(frozen.state,'queued');assert.match(frozen.input_hash,/^[a-f0-9]{64}$/);
 const claim=await api.publishingAction(OWNER,{action:'claim_browser_work',work_id:work.id,worker:'SYNTHETIC-collection-browser'});
 assert.equal(claim.work.state,'claimed');assert.ok(claim.claim_token);assert.equal(claim.work.claim_hash,undefined);
 const observation={status:'collected',external_post_id:p.id,observed_at:f.now,metrics:{plays:0,likes:null},evidence_url:p.evidence,evidence_note:'SYNTHETIC visible single-work plays=0; likes and other values unreadable'};
 const finish=result=>api.publishingAction(OWNER,{action:'complete_browser_work',work_id:work.id,claim_token:claim.claim_token,result});
 const {external_post_id,...missingIdentity}=observation;
 await assert.rejects(()=>finish(missingIdentity),/作品|ID|文本为空/);
 await assert.rejects(()=>finish({...observation,external_post_id:'SYNTHETIC-wrong-post'}),/作品|ID|匹配/);
 await assert.rejects(()=>finish({...observation,evidence_url:p.evidence.replace(p.id,p.platform==='bilibili'?'BV1LPnM6NEyx':'OTHER-KUAISHOU-POST')}),/作品|ID|匹配|路径/);
 assert.equal(f.workRows().find(w=>w.id===work.id).state,'claimed','invalid collection identities must not consume or confirm the work');
 const completed=await finish(observation);
 assert.equal(completed.work.state,'confirmed');assert.equal(completed.work.result.metrics.plays,0);assert.equal(completed.work.result.metrics.likes,null);assert.equal(completed.work.result.source.external_post_id,p.id);
 assert.equal((await api.publishingAction(OWNER,{action:'read_browser_work'})).work.length,2);

 f.now='2026-10-20T02:01:01.000Z';
 const second=await api.publishingAction(OWNER,{action:'run_collection_tick'},'automation'),saved=second.existing_collections.find(c=>c.id===snapshot.id);
 assert.equal(saved.status,'collected');assert.equal(saved.observed_at,'2026-10-20T02:00:00.000Z');assert.equal(saved.metrics.plays,0);assert.equal(saved.metrics.likes,null);assert.ok(Object.entries(saved.metrics).every(([key,value])=>key==='plays'?value===0:value===null));
 const observedPost=second.existing_publications.find(row=>row.id===post.id);assert.equal(observedPost.published_at_precision,p.precision);assert.equal(observedPost.published_at_uncertainty_seconds,p.uncertainty);assert.equal(observedPost.platform_published_at,published);assert.equal(saved.anchor_published_at_precision,p.precision);assert.equal(saved.anchor_uncertainty_seconds,p.uncertainty);assert.equal(saved.due_at_range_end,null);
 const persisted=f.sql.prepare('SELECT * FROM publishing_existing_collections WHERE id=?').get(snapshot.id),source=JSON.parse(persisted.source);
 assert.equal(source.kind,'creator-browser-observation');assert.equal(source.external_post_id,p.id);assert.equal(source.url,p.evidence);assert.equal(source.mapping_version,'creator-browser-v2');assert.match(source.note,/SYNTHETIC/);assert.equal(persisted.lease_hash,null);assert.equal(persisted.lease_until,null);
 const prior=JSON.stringify(persisted),workCount=f.workRows().length;
 await api.publishingAction(OWNER,{action:'run_collection_tick'},'automation');
 assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM publishing_existing_collections WHERE id=?').get(snapshot.id)),prior);assert.equal(f.workRows().length,workCount);assert.equal(f.count('publishing_existing_collections'),3);assert.equal(f.sql.prepare("SELECT count(*) n FROM publishing_existing_collections WHERE status='collected'").get().n,1);
 assert.equal((await api.readExistingPlatformDashboard(OTHER)).existing_publications.length,0);assert.equal((await api.publishingAction(OTHER,{action:'read_browser_work'})).work.length,0);
 assert.equal(f.protected(),before,'existing collection does not change production approvals, owner publication registrations or new-video slots/releases');
 assert.equal(f.archiveReads,0);assert.ok(f.jobReads.length>0);assert.ok(f.jobReads.every(read=>read.id===JOB&&read.owner===OWNER));
 assert.equal(f.count('publishing_posts'),0);assert.equal(f.count('publishing_slots'),0);assert.equal(f.count('publishing_reserve'),0);assert.equal(f.count('production_data_samples'),0);
});

for(const target of [24,48,null])test('durable existing '+(target===null?'daily snapshot':'T'+target)+' is ingested after its deadline using the original actual observation',async t=>{
 const f=fixture(t),p=platforms[0];f.seed(p.platform,p.post);const before=f.protected(),published=target===24?'2026-10-19T02:00:00.000Z':target===48?'2026-10-18T02:00:00.000Z':PUBLISHED;
 f.now=target===null?'2026-10-20T15:59:00.000Z':'2026-10-20T03:59:00.000Z';const observed=f.now;
 await api.publishingAction(OWNER,{action:'observe_account',platform:p.platform,state:'ready',account_id:p.account,account_label:'SYNTHETIC creator',can_publish:false,can_collect:true,evidence_url:p.creator,evidence_note:'SYNTHETIC exact current account'});
 await api.publishingAction(OWNER,{action:'observe_existing_publication',job_id:JOB,data_video_id:'SYNTHETIC-registration',platform:p.platform,account_id:p.account,external_post_id:p.id,platform_url:p.post,platform_published_at:published,observed_at:f.now,evidence_reference:p.evidence,evidence_note:'SYNTHETIC exact work and time',observation_kind:'creator-backend-observation',independently_observed:true,identity_match_note:'SYNTHETIC same creator account and exact work'});
 const first=await api.publishingAction(OWNER,{action:'run_collection_tick'},'automation'),collection=first.existing_collections.find(c=>c.target_hours===target),work=(await api.publishingAction(OWNER,{action:'read_browser_work'})).work.find(w=>w.input.collection_key===collection.collection_key&&w.input.post_id===collection.post_id);assert.ok(work);
 const claim=await api.publishingAction(OWNER,{action:'claim_browser_work',work_id:work.id,worker:'SYNTHETIC-window-collector'});await api.publishingAction(OWNER,{action:'complete_browser_work',work_id:work.id,claim_token:claim.claim_token,result:{status:'collected',external_post_id:p.id,observed_at:observed,metrics:{plays:0,likes:null},evidence_url:p.evidence,evidence_note:'SYNTHETIC real receipt persisted before its sampling deadline'}});
 const oldWorkCount=f.workRows().length;f.now=target===null?'2026-10-20T16:01:00.000Z':'2026-10-20T04:01:00.000Z';const next=await api.publishingAction(OWNER,{action:'run_collection_tick'},'automation'),saved=next.existing_collections.find(c=>c.id===collection.id);assert.equal(saved.status,'collected');assert.equal(saved.observed_at,observed);assert.equal(saved.metrics.plays,0);assert.equal(saved.metrics.likes,null);assert.equal(f.workRows().filter(w=>w.id===work.id).length,1);assert.equal(f.workRows().length,oldWorkCount+(target===null?1:0),'a new calendar day may create its own snapshot, never another old target');assert.equal(f.protected(),before);assert.equal(f.archiveReads,0);
});
