// SYNTHETIC in-memory browser receipts only. Never opens a browser or calls a platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({entryPoints:[root+'lib/publishing-browser.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-browser-boundaries',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'store',namespace:'synthetic'}));
 b.onResolve({filter:/^\.\/publishing$/},()=>({path:'publishing',namespace:'synthetic'}));
 b.onResolve({filter:/^\.\/site-file-archive$/},()=>({path:'archive',namespace:'synthetic'}));
 b.onLoad({filter:/.*/,namespace:'synthetic'},args=>({contents:args.path==='store'?'export function db(){return globalThis.__publishingBrowser.db}':args.path==='archive'?`export async function readSiteArchiveFile(){throw Error('SYNTHETIC receipt tests must not read media');}export async function getSiteArchiveMetadata(){throw Error('SYNTHETIC receipt tests must not inspect archive');}`:`export async function assertPublishingDispatchCurrent(owner,input,options){const f=globalThis.__publishingBrowser;f.guardCalls.push({owner,input:structuredClone(input),options:structuredClone(options)});await f.guardHook?.(owner,input,options);return {submission_window:{start:new Date().toISOString(),end:new Date(Date.now()+300000).toISOString()}};}export async function readPublishingDispatchMaterials(owner,input){return globalThis.__publishingBrowser.materials(input)}export async function publishingDispatchPreparation(){return null;}export async function assertPublishingPreparationCurrent(){throw Error('No synthetic prepared fixture');}export async function publishingPreparationMaterialPacket(){throw Error('No synthetic prepared fixture');}`}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=synthetic:publishing-browser-test.bundle.mjs\n').toString('base64'));
const OWNER='SYNTHETIC-browser-owner',OTHER='SYNTHETIC-other-owner',SHA='a'.repeat(64),ACCOUNT='SYNTHETIC-creator-account';
const PORTALS={douyin:'https://creator.douyin.com/creator-micro/home',wechat_channels:'https://channels.weixin.qq.com/platform',bilibili:'https://member.bilibili.com/platform/home',kuaishou:'https://cp.kuaishou.com/'};

function fixture(t){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE app_state (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)');
 sql.exec('CREATE TABLE publishing_authorizations(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,request_id TEXT NOT NULL,reference TEXT NOT NULL,content_hash TEXT NOT NULL,created_at TEXT NOT NULL);CREATE TABLE publishing_plans(owner_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL,authorization_id TEXT,active_since TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)');
 const active=new Date(Date.now()-60000).toISOString();
 sql.prepare('INSERT INTO publishing_authorizations VALUES (?,?,?,?,?,?)').run('SYNTHETIC-grant',OWNER,'SYNTHETIC-request','SYNTHETIC owner authorized collection','a'.repeat(64),active);
 sql.prepare('INSERT INTO publishing_plans VALUES (?,1,?,?,?,?)').run(OWNER,'SYNTHETIC-grant',active,active,active);
 const f={sql,guardCalls:[],guardHook:null,beforeRun:null};
 class Statement{
  constructor(query,args=[]){this.query=query;this.args=args;}
  bind(...args){return new Statement(this.query,args);}
  async first(){return sql.prepare(this.query).get(...this.args)||null;}
  async all(){return {results:sql.prepare(this.query).all(...this.args)};}
  async run(){await f.beforeRun?.(this);return {results:[],meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}
 }
 f.db={prepare:query=>new Statement(query)};
 f.read=id=>JSON.parse(sql.prepare('SELECT value FROM app_state WHERE key=?').get('publishing_browser_work_v2:'+id).value);
 f.patch=(id,changes)=>{const current=f.read(id);sql.prepare('UPDATE app_state SET value=? WHERE key=?').run(JSON.stringify({...current,...changes}),'publishing_browser_work_v2:'+id);};
 f.account=(platform='douyin',owner=OWNER)=>JSON.parse(sql.prepare('SELECT value FROM app_state WHERE key=?').get('publishing_browser_account_v2:'+owner+':'+platform).value);
 f.setAccount=(value,owner=OWNER)=>sql.prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('publishing_browser_account_v2:'+owner+':'+value.platform,JSON.stringify(value));
 f.pause=()=>sql.prepare('UPDATE publishing_plans SET enabled=0 WHERE owner_id=?').run(OWNER);
 f.renew=()=>{const id='SYNTHETIC-new-grant',at=new Date().toISOString();sql.prepare('INSERT INTO publishing_authorizations VALUES (?,?,?,?,?,?)').run(id,OWNER,'SYNTHETIC-new-request','SYNTHETIC owner renewed collection','b'.repeat(64),at);sql.prepare('UPDATE publishing_plans SET enabled=1,authorization_id=?,active_since=?,updated_at=? WHERE owner_id=?').run(id,at,at,OWNER);};
 f.observe=(changes={},owner=OWNER)=>api.recordBrowserAccountObservation(owner,{platform:'douyin',state:'ready',account_id:ACCOUNT,account_label:'SYNTHETIC creator',can_publish:true,can_collect:true,evidence_url:PORTALS[changes.platform||'douyin'],evidence_note:'SYNTHETIC official-page observation; no real account inspected',...changes});
 f.dispatch=(changes={})=>({owner_id:OWNER,platform:'douyin',account_id:ACCOUNT,idempotency_key:'SYNTHETIC-idempotency',release_id:'SYNTHETIC-release',slot_id:'SYNTHETIC-slot',job_id:'SYNTHETIC-job',title:'SYNTHETIC approved video',binding:{job_id:'SYNTHETIC-job',revision:3,script_hash:'b'.repeat(64),mode_epoch:0,contract_hash:'SYNTHETIC-contract',video_milestone_id:'SYNTHETIC-video',video_artifact_version:1,video_artifact_hash:'SYNTHETIC-video-artifact',delivery_milestone_id:'SYNTHETIC-delivery',delivery_artifact_version:1,delivery_artifact_hash:'SYNTHETIC-delivery-artifact',site_archive_id:'SYNTHETIC-archive',video_sha256:SHA,size_bytes:1234,file_name:'SYNTHETIC-final.mp4'},...changes});
 f.enqueue=async(changes={})=>{const input=f.dispatch(changes),result=await api.browserPublishingAdapter.publish(input);return {input,id:result.receipt.work_id,result};};
 f.claim=(id,owner=OWNER)=>api.claimBrowserPublishingWork(owner,{work_id:id,worker:'SYNTHETIC-worker'});
 f.materials=(input)=>({materials_hash:'b'.repeat(64),copy:{title:'SYNTHETIC approved title',description:'SYNTHETIC approved description',tags:['AI工具']},covers:[{role:'cover_3_4',site_archive_id:'SYNTHETIC-cover',sha256:'c'.repeat(64)},{role:'cover_4_3',site_archive_id:'SYNTHETIC-landscape',sha256:'d'.repeat(64)}],option_policy:{category:'technology-ai',originality:'self-produced-commentary',ai_disclosure:'ai-generated',visibility:'public',publish_mode:'immediate',download:'disabled',sync:'disabled'}});
 f.preflight=(input)=>({platform:input.platform,account_id:input.account_id,video_sha256:SHA,materials_hash:'b'.repeat(64),title:'SYNTHETIC approved title',description:'SYNTHETIC approved description',tags:{mode:'platform-tag-controls',selected:[{label:'AI工具'}],evidence_note:'SYNTHETIC actual topic chip'},cover_inventory_complete:true,required_cover_slots:['portrait'],covers:[{slot:'portrait',label:'SYNTHETIC cover control',required:true,status:'selected',expected_ratio:'3:4',source_ratio:'3:4',actual_ratio:'3:4',role:'cover_3_4',archive_id:'SYNTHETIC-cover',sha256:'c'.repeat(64),crop_confirmed:true,preview_confirmed:true,safe_area_confirmed:true,evidence_note:'SYNTHETIC actual crop and complete title/brand'}],options:Object.fromEntries(Object.entries(f.materials(input).option_policy).map(([k,v])=>[k,{label:'SYNTHETIC '+k,status:'selected',value:v,evidence_note:'SYNTHETIC visible selected control'}])),required_unknown_controls:[],observed_at:new Date(Date.now()-1).toISOString(),evidence_url:PORTALS[input.platform],evidence_note:'SYNTHETIC full creator form; never a real site observation'});
 f.check=(claim,phase,changes={},owner=OWNER)=>api.checkpointBrowserPublishingWork(owner,{work_id:claim.work.id,claim_token:claim.claim_token,phase,local_sha256:SHA,account_id:ACCOUNT,preflight:f.preflight(f.read(claim.work.id).input),...changes});
 f.complete=(claim,result,owner=OWNER)=>api.completeBrowserPublishingWork(owner,{work_id:claim.work.id,claim_token:claim.claim_token,result});
 f.result=(changes={})=>({status:'published',external_post_id:'1234567890123456789',platform_url:'https://www.douyin.com/video/1234567890123456789',published_at:new Date(Date.now()-60000).toISOString(),evidence_url:PORTALS.douyin,evidence_note:'SYNTHETIC receipt; only simulates a visible publication confirmation',...changes});
 f.collectInput=(changes={})=>({owner_id:OWNER,platform:'douyin',account_id:ACCOUNT,external_post_id:'1234567890123456789',post_id:'SYNTHETIC-post',target_hours:24,published_at:new Date(Date.now()-86400000).toISOString(),...changes});
 f.enqueueCollect=async(changes={})=>{const input=f.collectInput(changes);await api.browserPublishingAdapter.collect(input);const rows=await api.readBrowserPublishingWork(OWNER);return {input,id:rows.work.find(w=>w.kind==='collect'&&w.input.post_id===input.post_id&&w.input.target_hours===input.target_hours&&w.input.collection_key===input.collection_key).id};};
 globalThis.__publishingBrowser=f;
 t.after(()=>{sql.close();delete globalThis.__publishingBrowser;});
 return f;
}

test('account observations bind every platform to its exact official creator hostname',async t=>{
 const f=fixture(t);
 for(const platform of Object.keys(PORTALS)){
  await f.observe({platform});
  const account=(await api.readBrowserAccounts(OWNER)).find(a=>a.platform===platform);
  assert.equal(account.connected,true);assert.equal(account.can_publish,true);assert.equal(account.account_id,ACCOUNT);
 }
 for(const evidence_url of ['http://creator.douyin.com/','https://creator.douyin.com.evil.invalid/','https://evil.invalid/?redirect=https://creator.douyin.com/','https://www.douyin.com/','https://cp.kuaishou.com/','https://user:pass@creator.douyin.com/']){
  await assert.rejects(()=>f.observe({evidence_url}),/官方创作者后台/);
 }
 await assert.rejects(()=>f.observe({platform:'__proto__'}),/平台无效/);
 await assert.rejects(()=>f.observe({account_id:''}),/文本为空/);
 await assert.rejects(()=>f.observe({state:'connected'}),/状态无效/);
});

test('security_blocked is sticky through ready, login_required and unverified updates',async t=>{
 const f=fixture(t);await f.observe({platform:'wechat_channels',state:'security_blocked'});
 for(const state of ['ready','login_required','unverified'])await assert.rejects(()=>f.observe({platform:'wechat_channels',state}),/不能通过修改登录观察绕过/);
 const account=(await api.readBrowserAccounts(OWNER)).find(a=>a.platform==='wechat_channels');
 assert.equal(account.state,'security_blocked');assert.equal(account.connected,false);assert.equal(account.can_publish,false);assert.equal(account.account_id,null);
});

test('a concurrent security block cannot be overwritten by an observation that read an older account',async t=>{
 const f=fixture(t);await f.observe();let injected=false;
 f.beforeRun=async statement=>{
  if(injected||!statement.query.startsWith('INSERT INTO app_state')||!String(statement.args[0]).startsWith('publishing_browser_account_v2:'))return;
  const next=JSON.parse(statement.args[1]);if(next.state!=='ready')return;
  injected=true;f.setAccount({...f.account(),state:'security_blocked',can_publish:false,can_collect:false,evidence_note:'SYNTHETIC concurrent safety block'});
 };
 await assert.rejects(()=>f.observe({account_label:'SYNTHETIC stale readiness'}));
 assert.equal(injected,true);assert.equal(f.account().state,'security_blocked');
});

test('missing, stale, wrong or incapable browser accounts cannot claim publication work',async t=>{
 const f=fixture(t),{id}=await f.enqueue();
 await assert.rejects(()=>f.claim(id),/未登录|账号与待办不符/);
 await f.observe({can_publish:false});await assert.rejects(()=>f.claim(id),/未登录|账号与待办不符/);
 await f.observe({account_id:'SYNTHETIC-other-account'});await assert.rejects(()=>f.claim(id),/账号与待办不符/);
 await f.observe();f.setAccount({...f.account(),observed_at:new Date(Date.now()-25*3600000).toISOString()});
 await assert.rejects(()=>f.claim(id),/未登录|账号与待办不符/);
 assert.equal(f.read(id).state,'queued');assert.equal(f.guardCalls.length,0);
 await f.observe();assert.equal((await f.claim(id)).work.state,'claimed');
});

test('the same business key and canonical input are idempotent; another hash or account is rejected',async t=>{
 const f=fixture(t),a=await f.enqueue(),reordered=Object.fromEntries(Object.entries(a.input).reverse());
 reordered.binding=Object.fromEntries(Object.entries(a.input.binding).reverse());
 const replay=await api.browserPublishingAdapter.publish(reordered);
 assert.equal(replay.receipt.work_id,a.id);assert.equal(f.sql.prepare("SELECT count(*) n FROM app_state WHERE key LIKE 'publishing_browser_work_v2:%'").get().n,1);
 for(const input of [{...a.input,title:'SYNTHETIC changed title'},{...a.input,account_id:'SYNTHETIC other account'},{...a.input,binding:{...a.input.binding,video_sha256:'c'.repeat(64)}}])await assert.rejects(()=>api.browserPublishingAdapter.publish(input),/不同版本或账号/);
 assert.deepEqual(f.read(a.id).input,a.input);
});

test('concurrent claims produce one lease and no public claim hash or owner identity',async t=>{
 const f=fixture(t);await f.observe();const {id}=await f.enqueue();
 const results=await Promise.allSettled([f.claim(id),f.claim(id)]),passed=results.filter(r=>r.status==='fulfilled'),failed=results.filter(r=>r.status==='rejected');
 assert.equal(passed.length,1);assert.equal(failed.length,1);assert.ok(passed[0].value.claim_token);
 const work=passed[0].value.work;
 assert.equal(work.claim_hash,undefined);assert.equal(work.owner_id,undefined);assert.equal(work.input.owner_id,undefined);
 assert.match(work.archive_url,/^\/api\/site-archive\?/);assert.ok(f.read(id).claim_hash);
 await assert.rejects(()=>f.check({...passed[0].value,claim_token:'SYNTHETIC forged token'},'preparing'),/凭据已失效/);
});

test('claim and final submission use the current core guard contract and immutable release binding',async t=>{
 const f=fixture(t);await f.observe();const {id,input}=await f.enqueue(),claim=await f.claim(id);
 await f.check(claim,'ready_to_submit');await f.check(claim,'submitting');
 assert.deepEqual(f.guardCalls.map(c=>c.options),[{stage:'claim'},{stage:'before_external'},{stage:'before_external'},{stage:'before_external'},{stage:'before_external'}]);
 for(const call of f.guardCalls){assert.equal(call.owner,OWNER);assert.deepEqual(call.input,input);}
 assert.equal(f.read(id).state,'submitting');
});

test('local SHA and observed account mismatch reject before the final external guard',async t=>{
 const f=fixture(t);await f.observe();const {id}=await f.enqueue(),claim=await f.claim(id),count=f.guardCalls.length;
 await assert.rejects(()=>f.check(claim,'submitting',{local_sha256:'c'.repeat(64)}),/SHA|账号/);
 await assert.rejects(()=>f.check(claim,'submitting',{account_id:'SYNTHETIC other account'}),/SHA|账号/);
 assert.equal(f.guardCalls.length,count);assert.equal(f.read(id).state,'claimed');
});

test('release revocation or a new current media binding is rechecked immediately before submission',async t=>{
 const f=fixture(t);await f.observe();const {id}=await f.enqueue(),claim=await f.claim(id);
 f.guardHook=async(_owner,_input,options)=>{const stage=typeof options==='string'?options:options.stage;if(stage==='before_external')throw Error('SYNTHETIC release revoked or current media binding changed');};
 await assert.rejects(()=>f.check(claim,'ready_to_submit'),/release revoked/);
 await assert.rejects(()=>f.check(claim,'submitting'),/release revoked/);
 assert.equal(f.read(id).state,'claimed');
});

test('account login loss or security block after claim prevents the external submission checkpoint',async t=>{
 const f=fixture(t);await f.observe();const {id}=await f.enqueue(),claim=await f.claim(id);
 await f.observe({state:'login_required'});
 await assert.rejects(()=>f.check(claim,'submitting'),/账号|登录|拦截|受阻/);
 assert.equal(f.read(id).state,'claimed');
 await f.observe({state:'security_blocked'});
 await assert.rejects(()=>f.check(claim,'submitting'),/账号|登录|拦截|受阻/);
 assert.equal(f.read(id).state,'claimed');
});

test('submitted cannot skip the submitting checkpoint and its media/account/release revalidation',async t=>{
 const f=fixture(t);await f.observe();const {id}=await f.enqueue(),claim=await f.claim(id);
 await assert.rejects(()=>f.check(claim,'submitted',{local_sha256:'SYNTHETIC wrong SHA',account_id:'SYNTHETIC wrong account'}),/提交|阶段|外发/);
 assert.equal(f.read(id).state,'claimed');
 await assert.rejects(()=>f.complete(claim,f.result()),/提交阶段/);
});

test('submitting and submitted work never becomes claimable after lease expiry or phase rollback',async t=>{
 const f=fixture(t);await f.observe();const {id}=await f.enqueue(),claim=await f.claim(id);
 await f.check(claim,'submitting');
 for(const phase of ['preparing','ready_to_submit','submitting','login_required'])await assert.rejects(()=>f.check(claim,phase),/不能回退/);
 await f.check(claim,'submitted');f.patch(id,{lease_until:Date.now()-1000});
 await assert.rejects(()=>f.claim(id),/禁止重新领取/);
 const recorded=await f.complete(claim,f.result());assert.equal(recorded.work.state,'confirmed');
 await assert.rejects(()=>f.claim(id),/禁止重新领取/);
});

test('an uncertain publication result is durable and cannot be claimed or republished blindly',async t=>{
 const f=fixture(t);await f.observe();const {id,input,result}=await f.enqueue(),claim=await f.claim(id);
 await f.check(claim,'submitting');await f.complete(claim,f.result({status:'uncertain'}));
 await assert.rejects(()=>f.claim(id),/禁止重新领取/);
 await assert.rejects(()=>f.check(claim,'preparing'),/不能继续/);
 const replay=await api.browserPublishingAdapter.publish(input);assert.equal(replay.receipt.work_id,id);assert.equal(f.read(id).state,'uncertain');
 const reconciled=await api.browserPublishingAdapter.reconcile({...input,receipt:result.receipt});assert.equal(reconciled.status,'uncertain');assert.equal(reconciled.external_post_id,undefined);
});

test('login-required work can resume only before external submission and only after a fresh matching account observation',async t=>{
 const f=fixture(t);await f.observe();const {id}=await f.enqueue(),claim=await f.claim(id);
 await f.check(claim,'login_required');await f.observe({state:'login_required'});
 await assert.rejects(()=>f.claim(id),/未登录|账号/);
 await f.observe();const resumed=await f.claim(id);assert.equal(resumed.work.state,'claimed');assert.notEqual(resumed.claim_token,claim.claim_token);
 await assert.rejects(()=>f.check(claim,'submitting'),/凭据已失效/);
 await f.check(resumed,'submitting');await assert.rejects(()=>f.check(resumed,'login_required'),/不能回退/);
});

test('expired pre-submit claims can be reclaimed with a new guard check and a new token',async t=>{
 const f=fixture(t);await f.observe();const {id}=await f.enqueue(),old=await f.claim(id);f.patch(id,{lease_until:Date.now()-1000});
 const fresh=await f.claim(id);assert.notEqual(fresh.claim_token,old.claim_token);assert.equal(f.guardCalls.length,2);
 await assert.rejects(()=>f.check(old,'submitting'),/凭据已失效/);
 await f.check(fresh,'submitting');assert.equal(f.read(id).state,'submitting');
});

test('uncertain work gets an exclusive readback lease that cannot re-enter the submission workflow',async t=>{
 const f=fixture(t);await f.observe();const {id}=await f.enqueue(),claim=await f.claim(id);await f.check(claim,'submitting');await f.check(claim,'uncertain');f.patch(id,{lease_until:Date.now()-1000});
 const readback=await api.claimBrowserPublishingReconciliation(OWNER,{work_id:id,worker:'SYNTHETIC-readback'});
 assert.equal(readback.readback_only,true);assert.equal(readback.work.state,'uncertain');assert.equal(readback.work.claim_kind,'reconcile');
 await assert.rejects(()=>api.claimBrowserPublishingReconciliation(OWNER,{work_id:id,worker:'SYNTHETIC-second-readback'}),/正在回读/);
 await assert.rejects(()=>f.claim(id),/禁止重新领取/);
 await assert.rejects(()=>f.check(readback,'submitting'),/回读|不能继续/);
 await assert.rejects(()=>f.complete(claim,f.result()),/凭据已失效/);
 await f.complete(readback,f.result());assert.equal(f.read(id).state,'confirmed');
});

test('readback cannot grant access to a security-blocked, missing, wrong or unreadable platform account',async t=>{
 const f=fixture(t);await f.observe();const {id}=await f.enqueue(),claim=await f.claim(id);await f.check(claim,'submitting');await f.check(claim,'uncertain');
 f.sql.prepare('DELETE FROM app_state WHERE key=?').run('publishing_browser_account_v2:'+OWNER+':douyin');
 await assert.rejects(()=>api.claimBrowserPublishingReconciliation(OWNER,{work_id:id,worker:'SYNTHETIC-readback'}),/账号|登录|拦截|受阻/);
 for(const changes of [{state:'login_required'},{state:'ready',account_id:'SYNTHETIC other account'},{state:'ready',can_collect:false},{state:'security_blocked'}]){
  await f.observe(changes);await assert.rejects(()=>api.claimBrowserPublishingReconciliation(OWNER,{work_id:id,worker:'SYNTHETIC-readback'}),/账号|登录|拦截|受阻/);
 }
 assert.equal(f.read(id).state,'uncertain');assert.notEqual(f.read(id).claim_kind,'reconcile');
});

test('published confirmation requires an external ID, timezone-bearing actual time and matching official evidence',async t=>{
 const f=fixture(t);await f.observe();const {id,input,result}=await f.enqueue(),claim=await f.claim(id);await f.check(claim,'submitting');
 for(const changes of [{external_post_id:''},{published_at:''},{published_at:'2026-10-20T08:00:00'},{published_at:new Date(Date.now()+3600000).toISOString()},{evidence_url:'https://cp.kuaishou.com/'},{platform_url:'https://www.douyin.com.evil.invalid/video/123'},{evidence_note:''}])await assert.rejects(()=>f.complete(claim,f.result(changes)));
 assert.equal(f.read(id).state,'submitting');
 const accepted=await f.complete(claim,f.result());assert.equal(accepted.work.state,'confirmed');assert.equal(accepted.work.result.external_post_id,'1234567890123456789');
 const reconciled=await api.browserPublishingAdapter.reconcile({...input,receipt:result.receipt});assert.equal(reconciled.status,'published');assert.equal(reconciled.published_at,accepted.work.result.published_at);
 assert.equal((await api.readBrowserPublishingWork(OWNER)).work.length,0);
});

test('reconciliation cannot attach one work item publication evidence to another release',async t=>{
 const f=fixture(t);await f.observe();const first=await f.enqueue(),claim=await f.claim(first.id);await f.check(claim,'submitting');await f.complete(claim,f.result());
 const second=await f.enqueue({idempotency_key:'SYNTHETIC-second-key',release_id:'SYNTHETIC-second-release'});
 await assert.rejects(()=>api.browserPublishingAdapter.reconcile({...second.input,receipt:first.result.receipt}),/工作|绑定|不一致|不匹配|业务/);
 assert.equal(f.read(second.id).state,'queued');
});

test('queued collection cannot be claimed while the owner plan is paused or absent',async t=>{
 const f=fixture(t);await f.observe();const{id}=await f.enqueueCollect(),before=f.read(id);f.pause();
 await assert.rejects(()=>f.claim(id),/暂停|授权/);assert.deepEqual(f.read(id),before);
 f.sql.prepare('DELETE FROM publishing_plans WHERE owner_id=?').run(OWNER);await assert.rejects(()=>f.claim(id),/暂停|授权/);assert.deepEqual(f.read(id),before);
});

test('collection claim CAS rejects a concurrent pause without creating a usable claim',async t=>{
 const f=fixture(t);await f.observe();const{id}=await f.enqueueCollect(),before=f.read(id);let injected=false;
 f.beforeRun=async statement=>{if(injected||!statement.query.startsWith('UPDATE app_state'))return;const next=JSON.parse(statement.args[0]);if(next.kind!=='collect'||next.state!=='claimed')return;injected=true;f.pause();};
 await assert.rejects(()=>f.claim(id),/授权/);assert.equal(injected,true);assert.deepEqual(f.read(id),before);assert.equal(f.read(id).claim_hash,undefined);
});

test('a changed collection grant invalidates the old claim and checkpoint',async t=>{
 const f=fixture(t);await f.observe();const{id}=await f.enqueueCollect(),claim=await f.claim(id),before=f.read(id);assert.equal(before.collection_authorization.authorization_id,'SYNTHETIC-grant');f.renew();
 await assert.rejects(()=>f.check(claim,'preparing'),/授权/);assert.deepEqual(f.read(id),before);
});

test('pause before collection completion preserves the pending claim without confirming or starting another observation',async t=>{
 const f=fixture(t);await f.observe();const{id,input}=await f.enqueueCollect(),claim=await f.claim(id),before=f.read(id),result={status:'collected',external_post_id:input.external_post_id,observed_at:new Date().toISOString(),metrics:{plays:0},evidence_url:'https://www.douyin.com/video/'+input.external_post_id,evidence_note:'SYNTHETIC actual observed zero retained by caller'};f.pause();
 await assert.rejects(()=>f.complete(claim,result),/暂停|授权/);assert.deepEqual(f.read(id),before);assert.equal(await api.browserPublishingAdapter.readCollectionResult(input),null);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM app_state WHERE key LIKE 'publishing_browser_work_v2:%'").get().n,1);assert.equal(result.metrics.plays,0);
});

for(const change of ['pause','grant','security_blocked'])test('collection completion CAS rejects a concurrent '+change+' and keeps the exact observation unconfirmed',async t=>{
 const f=fixture(t);await f.observe();const{id,input}=await f.enqueueCollect(),claim=await f.claim(id),before=f.read(id);let injected=false;
 const result={status:'collected',external_post_id:input.external_post_id,observed_at:new Date().toISOString(),metrics:{plays:7},evidence_url:'https://www.douyin.com/video/'+input.external_post_id,evidence_note:'SYNTHETIC real observation must not be silently promoted across a changed grant'};
 f.beforeRun=async statement=>{if(injected||!statement.query.startsWith('UPDATE app_state'))return;const next=JSON.parse(statement.args[0]);if(next.kind!=='collect'||next.state!=='confirmed')return;injected=true;if(change==='pause')f.pause();else if(change==='grant')f.renew();else f.setAccount({...f.account(),state:'security_blocked',can_collect:false,can_publish:false});};
 await assert.rejects(()=>f.complete(claim,result),/账号|授权/);assert.equal(injected,true);assert.deepEqual(f.read(id),before);assert.equal(await api.browserPublishingAdapter.readCollectionResult(input),null);
});

test('confirmed collection receipt remains readable after pause without enqueuing or observing again',async t=>{
 const f=fixture(t);await f.observe();const{id,input}=await f.enqueueCollect(),claim=await f.claim(id),observed=new Date().toISOString();
 await f.complete(claim,{status:'collected',external_post_id:input.external_post_id,observed_at:observed,metrics:{plays:0},evidence_url:'https://www.douyin.com/video/'+input.external_post_id,evidence_note:'SYNTHETIC persisted original observation'});
 const before=f.read(id);f.pause();const receipt=await api.browserPublishingAdapter.readCollectionResult(input);assert.equal(receipt.observed_at,observed);assert.equal(receipt.metrics.plays,0);assert.deepEqual(f.read(id),before);
});

test('collection preserves unknown metrics as null and accepts observed zero without fabricating missing values',async t=>{
 const f=fixture(t);await f.observe();const {id,input}=await f.enqueueCollect(),claim=await f.claim(id);
 const observed_at=new Date(Date.now()-1000).toISOString(),result={status:'collected',external_post_id:input.external_post_id,observed_at,metrics:{plays:0,likes:null},evidence_url:PORTALS.douyin,evidence_context:'creator-list-row',evidence_note:'SYNTHETIC row '+input.external_post_id+' visible zero plays; likes unavailable'};
 await f.complete(claim,result);
 const collected=await api.browserPublishingAdapter.collect(input);
 assert.equal(collected.status,'collected');assert.equal(collected.metrics.plays,0);assert.equal(collected.metrics.likes,null);
 assert.ok(Object.entries(collected.metrics).every(([key,value])=>key==='plays'?value===0:value===null),'unobserved metrics may be filled with null, never fabricated zero');
 assert.equal(collected.source.external_post_id,input.external_post_id);assert.equal(collected.source.kind,'creator-browser-observation');assert.equal(collected.observed_at,observed_at);
});

test('collection cannot complete with all unknown, empty, invalid or cross-platform metrics evidence',async t=>{
 const f=fixture(t);await f.observe();const {id,input}=await f.enqueueCollect(),claim=await f.claim(id);
 const result={status:'collected',external_post_id:input.external_post_id,observed_at:new Date(Date.now()-1000).toISOString(),metrics:{plays:1},evidence_url:PORTALS.douyin,evidence_context:'creator-list-row',evidence_note:'SYNTHETIC observed row '+input.external_post_id};
 for(const changes of [{metrics:{}},{metrics:{plays:null}},{metrics:{plays:'0'}},{metrics:{plays:-1}},{metrics:{plays:1.5}},{metrics:{plays:Infinity}},{metrics:{completion_rate:101}},{metrics:{invented_metric:12}},{evidence_url:PORTALS.bilibili},{observed_at:'2026-10-20T08:00:00'},{observed_at:new Date(Date.now()+3600000).toISOString()}])await assert.rejects(()=>f.complete(claim,{...result,...changes}));
 assert.equal(f.read(id).state,'claimed');
});

test('collection requires an actually observed post ID and rejects another post on the same official platform',async t=>{
 const f=fixture(t);await f.observe();const {id,input}=await f.enqueueCollect(),claim=await f.claim(id),result={status:'collected',external_post_id:input.external_post_id,observed_at:new Date(Date.now()-1000).toISOString(),metrics:{plays:4},evidence_url:'https://www.douyin.com/video/'+input.external_post_id,evidence_note:'SYNTHETIC exact current single-video panel'};
 const {external_post_id,...missing}=result;await assert.rejects(()=>f.complete(claim,missing),/文本为空|作品|ID/);
 await assert.rejects(()=>f.complete(claim,{...result,external_post_id:'9876543210987654321'}),/作品ID.*不匹配/);
 for(const evidence_url of ['https://www.douyin.com/video/9876543210987654321','https://www.douyin.com/video/9876543210987654321?ref='+input.external_post_id,'https://www.douyin.com/video/9876543210987654321#'+input.external_post_id])await assert.rejects(()=>f.complete(claim,{...result,evidence_url}),/详情路径.*不匹配/);
 assert.equal(f.read(id).state,'claimed');await f.complete(claim,result);const saved=await api.browserPublishingAdapter.collect(input);assert.equal(saved.source.external_post_id,input.external_post_id);assert.equal(saved.source.evidence_context,'single-post-detail');
});

test('generic official lists require explicit row context and evidence containing the observed post ID',async t=>{
 const f=fixture(t);await f.observe();const {id,input}=await f.enqueueCollect(),claim=await f.claim(id),result={status:'collected',external_post_id:input.external_post_id,observed_at:new Date(Date.now()-1000).toISOString(),metrics:{plays:5},evidence_url:'https://creator.douyin.com/creator-micro/content/manage',evidence_note:'SYNTHETIC account-wide dashboard only'};
 await assert.rejects(()=>f.complete(claim,result),/当前行作品ID/);await assert.rejects(()=>f.complete(claim,{...result,evidence_context:'creator-list-row'}),/当前行作品ID/);await f.complete(claim,{...result,evidence_context:'creator-list-row',evidence_note:'SYNTHETIC exact list row '+input.external_post_id+' and its visible plays'});assert.equal(f.read(id).result.source.evidence_context,'creator-list-row');
});

test('observed Kuaishou detail post IDs are checked against the actual creator route',async t=>{
 const f=fixture(t);await f.observe({platform:'kuaishou'});const {id,input}=await f.enqueueCollect({platform:'kuaishou',external_post_id:'3x4cdne9bxpbbkk'}),claim=await f.claim(id),result={status:'collected',external_post_id:input.external_post_id,observed_at:new Date(Date.now()-1000).toISOString(),metrics:{plays:4113},evidence_url:'https://cp.kuaishou.com/statistics/article/detail/'+input.external_post_id,evidence_note:'SYNTHETIC exact current work core panel'};await assert.rejects(()=>f.complete(claim,{...result,evidence_url:'https://cp.kuaishou.com/statistics/article/detail/OTHER?postid='+input.external_post_id}),/路径.*不匹配/);await f.complete(claim,result);assert.equal(f.read(id).result.source.external_post_id,'3x4cdne9bxpbbkk');
});

test('observed Douyin creator work-detail collection validates the numeric pathname, never a query or fragment alias',async t=>{
 const f=fixture(t);await f.observe();const {id,input}=await f.enqueueCollect({external_post_id:'7697949692843363584'}),claim=await f.claim(id),route='https://creator.douyin.com/creator-micro/work-management/work-detail/',result={status:'collected',external_post_id:input.external_post_id,observed_at:new Date(Date.now()-1000).toISOString(),metrics:{plays:0},evidence_url:route+input.external_post_id+'?enter_from=content',evidence_note:'SYNTHETIC exact creator single-work panel'};
 for(const evidence_url of [route+'1234567890123456789',route+'1234567890123456789?ref='+input.external_post_id,route+'1234567890123456789#'+input.external_post_id,route+'?id='+input.external_post_id,route+input.external_post_id+'/extra',route+'not-numeric'])await assert.rejects(()=>f.complete(claim,{...result,evidence_url}),/详情路径.*不匹配/);
 assert.equal(f.read(id).state,'claimed');await f.complete(claim,result);const saved=await api.browserPublishingAdapter.collect(input);assert.equal(saved.source.external_post_id,input.external_post_id);assert.equal(saved.source.evidence_context,'single-post-detail');assert.equal(saved.source.url,route+input.external_post_id+'?enter_from=content');
});

test('daily collection keys are scoped by post identity, while each post/date remains idempotent',async t=>{
 const f=fixture(t),key='snapshot:2026-10-20',first=await f.enqueueCollect({target_hours:null,sample_kind:'single_snapshot',collection_key:key,post_id:'SYNTHETIC-existing-A'}),second=await f.enqueueCollect({target_hours:null,sample_kind:'single_snapshot',collection_key:key,post_id:'SYNTHETIC-existing-B',external_post_id:'9876543210987654321'});
 assert.notEqual(first.id,second.id);assert.equal((await f.enqueueCollect({...first.input})).id,first.id);
 const tomorrow=await f.enqueueCollect({...first.input,collection_key:'snapshot:2026-10-21'});assert.notEqual(first.id,tomorrow.id);
 assert.equal((await api.readBrowserPublishingWork(OWNER)).work.length,3);
});

test('cross-owner work access, mutation, claim tokens and reconciliation are rejected',async t=>{
 const f=fixture(t);await f.observe();const first=await f.enqueue(),claim=await f.claim(first.id);
 assert.equal((await api.readBrowserPublishingWork(OTHER)).work.length,0);
 await assert.rejects(()=>f.claim(first.id,OTHER),/不属于当前账号/);
 await assert.rejects(()=>f.check(claim,'submitting',{},OTHER),/不属于当前账号/);
 await assert.rejects(()=>f.complete(claim,f.result(),OTHER),/不属于当前账号/);
 await assert.rejects(()=>api.browserPublishingAdapter.reconcile({...first.input,owner_id:OTHER,receipt:first.result.receipt}),/不属于当前账号/);
 assert.equal(f.read(first.id).state,'claimed');
 assert.ok((await api.readBrowserAccounts(OTHER)).every(a=>a.connected===false&&a.account_id===null));
});

test('a minute-only real platform confirmation retains explicit precision through durable receipt and reconcile',async t=>{
 const f=fixture(t);await f.observe();const {input,id}=await f.enqueue(),claim=await f.claim(id);await f.check(claim,'submitting');const at=new Date(Date.now()-60000).toISOString().slice(0,16)+'Z';
 for(const result of [f.result({published_at:at}),f.result({published_at:at,published_at_precision:'second'}),f.result({published_at:at.replace('Z',':17Z'),published_at_precision:'minute'})])await assert.rejects(()=>f.complete(claim,result),/秒|精度/);
 assert.equal(f.read(id).state,'submitting');await f.complete(claim,f.result({published_at:at,published_at_precision:'minute'}));const saved=f.read(id).result,canonical=new Date(at).toISOString();assert.equal(saved.published_at,canonical);assert.equal(saved.published_at_precision,'minute');assert.equal(saved.published_at_range_start,canonical);assert.equal(saved.published_at_range_end,new Date(Date.parse(canonical)+59000).toISOString());assert.equal(saved.published_at_uncertainty_seconds,59);
 const result=await api.browserPublishingAdapter.reconcile({...input,receipt:{transport:'browser',work_id:id}});assert.equal(result.status,'published');assert.equal(result.published_at_precision,'minute');assert.equal(result.published_at_range_end,saved.published_at_range_end);assert.equal(f.read(id).state,'confirmed');
});

test('submission requires a fresh exact full-form preflight, not only media identity',async t=>{const f=fixture(t);await f.observe();const {id}=await f.enqueue(),claim=await f.claim(id);await assert.rejects(()=>f.check(claim,'submitting',{preflight:undefined}),/表单回读/);const bad=f.preflight(f.read(id).input);bad.tags.mode='plain-text';await assert.rejects(()=>f.check(claim,'submitting',{preflight:bad}),/话题|tags/);bad.tags.mode='platform-tag-controls';bad.description='SYNTHETIC changed';await assert.rejects(()=>f.check(claim,'submitting',{preflight:bad}),/description/);assert.equal(f.read(id).state,'claimed');await f.check(claim,'submitting');assert.ok(f.read(id).preflight.digest);});

test('collection receipt lookup never enqueues and requires the exact frozen owner, account, work and timestamp precision',async t=>{
 const f=fixture(t);await f.observe();const input=f.collectInput(),count=()=>Number(f.sql.prepare("SELECT count(*) n FROM app_state WHERE key LIKE 'publishing_browser_work_v2:%'").get().n);
 assert.equal(await api.browserPublishingAdapter.readCollectionResult(input),null);assert.equal(count(),0);
 const {id}=await f.enqueueCollect(input);assert.equal(await api.browserPublishingAdapter.readCollectionResult(input),null);const claim=await f.claim(id),observed=new Date().toISOString();assert.equal(await api.browserPublishingAdapter.readCollectionResult(input),null);await f.complete(claim,{status:'collected',external_post_id:input.external_post_id,observed_at:observed,metrics:{plays:0},evidence_url:'https://www.douyin.com/video/'+input.external_post_id,evidence_note:'SYNTHETIC exact single post observation'});
 const saved=await api.browserPublishingAdapter.readCollectionResult(input);assert.equal(saved.status,'collected');assert.equal(saved.observed_at,observed);assert.equal(saved.metrics.plays,0);assert.equal(saved.metrics.likes,null);
 for(const changes of [{account_id:'SYNTHETIC-other-account'},{external_post_id:'9876543210987654321'},{published_at:new Date(Date.parse(input.published_at)+60000).toISOString()},{published_at_precision:'minute'},{sample_kind:'single_t48'},{platform:'kuaishou'}])await assert.rejects(()=>api.browserPublishingAdapter.readCollectionResult({...input,...changes}),/不匹配/);
 for(const changes of [{target_hours:48},{collection_key:'snapshot:2026-10-21'},{post_id:'SYNTHETIC-other-post'}])assert.equal(await api.browserPublishingAdapter.readCollectionResult({...input,...changes}),null);
 assert.equal(await api.browserPublishingAdapter.readCollectionResult({...input,owner_id:OTHER}),null);assert.equal(count(),1);assert.equal(f.read(id).state,'confirmed');
});

test('published browser reconciliation rejects a different known platform post ID or an unconfirmed saved result',async t=>{
 const f=fixture(t);await f.observe();const {input,id,result}=await f.enqueue(),claim=await f.claim(id);await f.check(claim,'submitting');await f.complete(claim,f.result());await assert.rejects(()=>api.browserPublishingAdapter.reconcile({...input,receipt:result.receipt,external_post_id:'9876543210987654321'}),/作品身份不匹配/);f.patch(id,{state:'uncertain'});await assert.rejects(()=>api.browserPublishingAdapter.reconcile({...input,receipt:result.receipt}),/状态或平台作品身份不匹配/);assert.equal(f.read(id).state,'uncertain');
});
