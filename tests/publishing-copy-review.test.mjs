// SYNTHETIC approvals in an isolated in-memory SQLite fixture only.
// No real owner approves anything; no production DB, browser, media or network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import manifest from '../production/cover-branding-migrations.json' with {type:'json'};
import {applyWarehouseCoverBranding} from '../lib/cover-branding.mts';
import {applyV6OutroBinding} from '../lib/outro-upgrade-contract.mts';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({entryPoints:[root+'lib/publishing-copy-review.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-copy-review-boundaries',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'store',namespace:'synthetic-copy'}));
 b.onResolve({filter:/platform-promotion-drafts\.json$/},()=>({path:'seeds',namespace:'synthetic-copy'}));
 b.onLoad({filter:/.*/,namespace:'synthetic-copy'},args=>({contents:args.path==='store'?`export function db(){return globalThis.__copyReviewFixture.db;}`:`export default {get schema(){return globalThis.__copyReviewFixture.seeds.schema;},get strategy_version(){return globalThis.__copyReviewFixture.seeds.strategy_version;},get drafts(){return globalThis.__copyReviewFixture.seeds.drafts;}};`}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=synthetic:publishing-copy-review.bundle.mjs\n').toString('base64'));
const OWNER='SYNTHETIC-copy-owner',OTHER='SYNTHETIC-other-owner',JOB='SYNTHETIC-copy-job',SOURCE='f'.repeat(64);
const context=new AsyncLocalStorage();
const deferred=label=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,async wait(){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SYNTHETIC concurrency barrier timed out: '+label)),3000);})]);}finally{clearTimeout(timer);}}};};

function fixture(t){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE app_state(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)');
 const platforms=Object.fromEntries(['douyin','wechat_channels','bilibili','kuaishou','xiaohongshu'].map(p=>[p,{title:'SYNTHETIC '+p+' title',description:'SYNTHETIC '+p+' description; only a fixture, never a real observation',tags:['SYNTHETIC-'+p],approach:'SYNTHETIC '+p+' editorial reason'}]));
 const f={sql,seeds:{schema:'platform-promotion-drafts-v1',strategy_version:'SYNTHETIC-strategy-v1',drafts:[{job_id:JOB,source_promotion_sha256:SOURCE,review_status:'pending_owner_review',platforms}]},beforeFirst:null,afterFirst:null,beforeRun:null,afterRun:null};
 class Statement{
  constructor(query,args=[]){this.query=query;this.args=args;}
  bind(...args){return new Statement(this.query,args);}
  async first(){await f.beforeFirst?.(this);const result=sql.prepare(this.query).get(...this.args)||null;await f.afterFirst?.(this,result);return result;}
  async run(){await f.beforeRun?.(this);const result={meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};await f.afterRun?.(this,result);return result;}
 }
 f.db={prepare:query=>new Statement(query)};
 f.binding={job_id:JOB,revision:1,script_hash:'a'.repeat(64),mode_epoch:0,contract_hash:'SYNTHETIC-contract',video_milestone_id:'SYNTHETIC-video',video_artifact_version:1,video_artifact_hash:'b'.repeat(64),delivery_milestone_id:'SYNTHETIC-delivery',delivery_artifact_version:1,delivery_artifact_hash:'c'.repeat(64),site_archive_id:'SYNTHETIC-final-archive',video_sha256:'d'.repeat(64),size_bytes:10,file_name:'SYNTHETIC-final.mp4',materials:[{role:'cover_3_4',site_archive_id:'SYNTHETIC-portrait',sha256:'1'.repeat(64),size_bytes:10,file_name:'portrait.png',mime_type:'image/png',milestone_id:'SYNTHETIC-cover',artifact_hash:'2'.repeat(64),artifact_version:1},{role:'cover_4_3',site_archive_id:'SYNTHETIC-landscape',sha256:'3'.repeat(64),size_bytes:10,file_name:'landscape.png',mime_type:'image/png',milestone_id:'SYNTHETIC-cover',artifact_hash:'2'.repeat(64),artifact_version:1},{role:'promotion',site_archive_id:'SYNTHETIC-promotion',sha256:SOURCE,size_bytes:10,file_name:'promotion.md',mime_type:'text/markdown',milestone_id:'SYNTHETIC-promotion',artifact_hash:'4'.repeat(64),artifact_version:1}]};
 f.key=(owner=OWNER)=>'publishing_platform_copy_review_v1:'+owner+':'+JOB;
 f.saved=(owner=OWNER)=>{const row=sql.prepare('SELECT value FROM app_state WHERE key=?').get(f.key(owner));return row?JSON.parse(row.value):null;};
 f.review=(owner=OWNER,binding=f.binding)=>api.platformCopyReview(owner,binding,'SYNTHETIC topic title');
 f.decide=async(decision='approve',changes={},owner=OWNER,binding=f.binding)=>{const current=await f.review(owner,binding);return api.decidePlatformCopy(owner,binding,{copy_hash:current.copy_hash,decision,originality:decision==='approve'?'self-produced-commentary':undefined,reason:decision==='revise'?'SYNTHETIC revision requested':undefined,...changes});};
 f.approved=(platform='douyin',owner=OWNER,binding=f.binding)=>api.approvedPlatformCopy(owner,binding,platform);
 globalThis.__copyReviewFixture=f;t.after(()=>{sql.close();delete globalThis.__copyReviewFixture;});return f;
}

test('new platform copy starts pending and cannot inherit a historical production approval',async t=>{
 const f=fixture(t),review=await f.review();assert.equal(review.status,'awaiting_review');assert.equal(review.reviewed_at,null);assert.equal(review.originality_decision,null);assert.equal(review.option_policy.originality,'owner-selection-required');assert.match(review.copy_hash,/^[a-f0-9]{64}$/);assert.match(review.binding_hash,/^[a-f0-9]{64}$/);assert.equal(f.saved(),null);
 await assert.rejects(()=>f.approved(),/尚未通过|等待本人审核/);assert.equal(f.saved(),null);
});

test('explicit warehouse logo-only migration carries the original copy decision without rewriting it; changed content does not',async t=>{
 const f=fixture(t);f.binding=structuredClone(manifest.migrations[0].original_binding);f.seeds.drafts[0].job_id=f.binding.job_id;f.seeds.drafts[0].source_promotion_sha256=f.binding.materials.find(m=>m.role==='promotion').sha256;f.key=(owner=OWNER)=>'publishing_platform_copy_review_v1:'+owner+':'+f.binding.job_id;
 await f.decide();const saved=f.saved(),next=applyWarehouseCoverBranding(f.binding),review=await f.review(OWNER,next);assert.equal(review.status,'approved');assert.equal(review.reviewed_at,saved.reviewed_at);assert.equal(review.originality_decision,saved.originality);assert.notEqual(review.copy_hash,saved.copy_hash);assert.deepEqual(f.saved(),saved);assert.equal((await f.approved('bilibili',OWNER,next)).copy_hash,review.copy_hash);
 for(const key of ['script_hash','video_sha256','delivery_artifact_hash'])assert.equal((await f.review(OWNER,{...next,[key]:'changed'})).status,'awaiting_review');const changed=structuredClone(next);changed.materials.find(m=>m.role==='promotion').sha256='changed';assert.equal((await f.review(OWNER,changed)).status,'source_changed');assert.deepEqual(f.saved(),saved);
});

test('V6 tail-only plus approved logo derivatives carry the unchanged platform copy decision without manufacturing new approval',async t=>{
 const f=fixture(t);f.binding=structuredClone(manifest.migrations[0].original_binding);f.seeds.drafts[0].job_id=f.binding.job_id;f.seeds.drafts[0].source_promotion_sha256=f.binding.materials.find(m=>m.role==='promotion').sha256;f.key=(owner=OWNER)=>'publishing_platform_copy_review_v1:'+owner+':'+f.binding.job_id;
 await f.decide();const saved=f.saved(),next=applyV6OutroBinding(applyWarehouseCoverBranding(f.binding));assert.notEqual(next.video_sha256,f.binding.video_sha256);const review=await f.review(OWNER,next);assert.equal(review.status,'approved');assert.equal(review.reviewed_at,saved.reviewed_at);assert.deepEqual(f.saved(),saved);assert.equal((await f.approved('bilibili',OWNER,next)).copy_hash,review.copy_hash);assert.equal((await f.review(OWNER,{...next,script_hash:'changed'})).status,'awaiting_review');
});
test('a synthetic owner decision binds the exact copy and material hashes and is immutable',async t=>{
 const f=fixture(t),before=await f.review(),decided=await f.decide();assert.equal(decided.status,'approved');assert.equal(decided.copy_hash,before.copy_hash);assert.equal(decided.binding_hash,before.binding_hash);
 const saved=f.saved();assert.equal(saved.reviewer,OWNER);assert.equal(saved.copy_hash,before.copy_hash);assert.equal(saved.binding_hash,before.binding_hash);assert.equal(saved.originality,'self-produced-commentary');assert.ok(saved.reviewed_at);
 const copy=await f.approved('kuaishou');assert.equal(copy.title,f.seeds.drafts[0].platforms.kuaishou.title);assert.equal(copy.selection,'platform-specific');assert.equal(copy.copy_hash,before.copy_hash);assert.equal(copy.option_policy.originality,'self-produced-commentary');assert.equal(decided.originality_decision,'self-produced-commentary');
 await assert.rejects(()=>f.decide('revise'),/已有审核决定|不能覆盖/);assert.equal(f.saved().status,'approved');
});

test('synthetic approval requires an explicit valid source choice and preserves a selected repost policy',async t=>{
 const f=fixture(t),before=await f.review();
 for(const originality of [undefined,null,'','original','SYNTHETIC default',' repost ',['repost'],['self-produced-commentary'],{}]){
  await assert.rejects(()=>f.decide('approve',{originality}),/本人须先确认|不能由执行器推定原创/);assert.equal(f.saved(),null,'a missing or unsupported source choice cannot create approval');
 }
 const decided=await f.decide('approve',{originality:'repost'});assert.equal(decided.originality_decision,'repost');assert.equal(decided.copy_hash,before.copy_hash);assert.equal(f.saved().originality,'repost');assert.equal((await f.approved('bilibili')).option_policy.originality,'repost');await assert.rejects(()=>f.decide('approve',{originality:'self-produced-commentary'}),/已有审核决定|不能覆盖/);assert.equal(f.saved().originality,'repost');
});

test('rejected or malformed synthetic decisions never produce publishable copy',async t=>{
 const f=fixture(t),review=await f.review();
 await assert.rejects(()=>f.decide('approve',{copy_hash:'0'.repeat(64)}),/变化|刷新/);
 for(const decision of ['unsupported',['approve'],['revise'],{}])await assert.rejects(()=>f.decide(decision),/决定无效/);
 await assert.rejects(()=>f.decide('revise',{reason:''}),/文本为空/);assert.equal(f.saved(),null);
 assert.equal((await f.decide('revise')).status,'revise');await assert.rejects(()=>f.approved(),/revision requested|尚未通过/);await assert.rejects(()=>f.decide(),/已有审核决定|不能覆盖/);assert.equal(f.saved().copy_hash,review.copy_hash);
});

test('copy text, tags, strategy or any frozen material change invalidates the prior synthetic decision',async t=>{
 const f=fixture(t);await f.decide();const old=f.saved().copy_hash;
 for(const mutate of [()=>{f.seeds.drafts[0].platforms.douyin.description+=' changed';},()=>{f.seeds.drafts[0].platforms.kuaishou.tags.push('SYNTHETIC-new-tag');},()=>{f.seeds.strategy_version='SYNTHETIC-strategy-v2';},()=>{f.binding.materials[0].sha256='5'.repeat(64);},()=>{f.binding.video_sha256='6'.repeat(64);}]){
  mutate();const current=await f.review();assert.equal(current.status,'awaiting_review');assert.notEqual(current.copy_hash,old);assert.equal(current.reviewed_at,null);assert.equal(current.originality_decision,null);await assert.rejects(()=>f.approved(),/等待本人审核|尚未通过/);await assert.rejects(()=>api.decidePlatformCopy(OWNER,f.binding,{copy_hash:old,decision:'approve',originality:'self-produced-commentary'}),/变化|刷新/);
 }
 assert.equal(f.saved().copy_hash,old,'a new view never rewrites the old decision as approved');
});

test('changed or missing source promotion archives block review and approved-copy lookup',async t=>{
 const f=fixture(t);await f.decide();const original=structuredClone(f.binding);
 f.binding.materials.find(m=>m.role==='promotion').sha256='7'.repeat(64);assert.equal((await f.review()).status,'source_changed');await assert.rejects(()=>f.decide(),/变化|刷新/);await assert.rejects(()=>f.approved(),/来源已改变|尚未通过/);
 f.binding=original;f.binding.materials=f.binding.materials.filter(m=>m.role!=='promotion');assert.equal((await f.review()).status,'source_changed');await assert.rejects(()=>f.decide(),/变化|刷新/);
});

test('owner review storage is isolated; a matching digest from another owner grants no approval',async t=>{
 const f=fixture(t),other=await f.review(OTHER);await f.decide();assert.equal((await f.review(OTHER)).status,'awaiting_review');assert.equal(f.saved(OTHER),null);await assert.rejects(()=>f.approved('douyin',OTHER),/等待本人审核|尚未通过/);assert.equal((await f.review()).status,'approved');assert.equal(other.copy_hash,(await f.review()).copy_hash,'ownership is enforced by the separate storage key, not by treating the public hash as a credential');
});

test('missing requested platform never falls back to another platform or generic copy',async t=>{
 const f=fixture(t);delete f.seeds.drafts[0].platforms.kuaishou;await f.decide();await assert.rejects(()=>f.approved('kuaishou'),/缺少对应平台专稿|禁止/);assert.equal((await f.approved('douyin')).title,f.seeds.drafts[0].platforms.douyin.title);
});

for(const prior of ['none','approved-old-binding'])test('competing synthetic decisions cannot overwrite an already committed decision; prior='+prior,{timeout:10000},async t=>{
 const f=fixture(t);
 if(prior==='approved-old-binding'){await f.decide();const oldHash=f.saved().copy_hash;f.binding.materials[0].sha256='9'.repeat(64);assert.equal((await f.review()).status,'awaiting_review');await assert.rejects(()=>api.decidePlatformCopy(OWNER,f.binding,{copy_hash:oldHash,decision:'approve',originality:'self-produced-commentary'}),/变化|刷新/);}
 const review=await f.review(),bothReadPending=deferred('both pending reads: '+prior),firstWrite=deferred('first committed decision: '+prior),counts={approve:0,revise:0};
 f.beforeFirst=async()=>{const task=context.getStore();if(!task)return;counts[task]++;if(task==='revise'&&counts[task]===2)await firstWrite.wait();};
 f.afterFirst=async()=>{const task=context.getStore();if(task==='approve'&&counts[task]===1)await bothReadPending.wait();if(task==='revise'&&counts[task]===1)bothReadPending.resolve();};
 f.afterRun=async()=>{if(context.getStore()==='approve')firstWrite.resolve();};
 try{
  const results=await Promise.allSettled([
   context.run('approve',()=>api.decidePlatformCopy(OWNER,f.binding,{copy_hash:review.copy_hash,decision:'approve',originality:'self-produced-commentary'})),
   context.run('revise',()=>api.decidePlatformCopy(OWNER,f.binding,{copy_hash:review.copy_hash,decision:'revise',reason:'SYNTHETIC competing revision'}))
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'only one exact-version decision may commit');assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(f.saved().status,'approved','the first decision remains immutable');
  assert.equal(f.saved().copy_hash,review.copy_hash);assert.equal((await f.approved()).copy_hash,review.copy_hash,'only the newly reviewed material binding can become publishable');
 }finally{bothReadPending.resolve();firstWrite.resolve();}
});

test('policy cleanup: platform copy is usable without a second owner approval and no owner approval is fabricated',async t=>{
 const f=fixture(t),copy=await f.approved();
 assert.equal(copy.title,f.seeds.drafts[0].platforms.douyin.title);
 assert.equal(copy.reviewed_at,null);assert.equal(f.saved(),null);
 assert.equal(copy.option_policy.originality,'self-produced-commentary');
 await f.decide('revise');await assert.rejects(()=>f.approved(),/修改|revision/i);
});
