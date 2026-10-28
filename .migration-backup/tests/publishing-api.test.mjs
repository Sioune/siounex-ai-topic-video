// SYNTHETIC local integration only: real routes, identity/origin checks, controller,
// browser bridge and MCP dispatch; mocked ChatGPT session, publishing core and reminder data.
// /api/publishing-service deliberately trusts an upstream owner-private Sites dispatch.
// Its public marker header is NOT a secret. These local tests cannot prove the deployed
// Sites audience/access configuration, header provenance, browser login or a platform post.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{contents:`export {GET as publishingGET,POST as publishingPOST} from './app/api/publishing/route';export {POST as servicePOST} from './app/api/publishing-service/route';export {POST as mediaPOST} from './app/api/publishing-service/media/route';export {POST as mcpPOST} from './app/mcp/route';export {browserPublishingAdapter} from './lib/publishing-browser';export {publishingMcpTools,callPublishingMcp} from './lib/publishing-mcp';`,resolveDir:root},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'synthetic-api-boundaries',setup(b){
 b.onResolve({filter:/^\.\/(?:native-production-gateway|outro-upgrade|outro-upgrade-storage)$/},()=>({path:'outside',namespace:'inert-native'}));
 b.onLoad({filter:/.*/,namespace:'inert-native'},()=>({contents:'export async function nativeProductionRequest(){throw Error("Unexpected native action")}export async function readUnpublishedOutroInventory(){throw Error("Unexpected outro action")}export async function readOutroUpgradeSourcePart(){throw Error("Unexpected outro action")}export async function activateUnpublishedV6Outros(){throw Error("Unexpected outro action")}export async function stageV6OutroParts(){throw Error("Unexpected outro action")}'}));
 b.onResolve({filter:/^@\/app\/chatgpt-auth$/},()=>({path:'auth',namespace:'synthetic'}));
 b.onResolve({filter:/^\.\/store$/},()=>({path:'store',namespace:'synthetic'}));
 b.onResolve({filter:/^\.\/publishing$/},()=>({path:'core',namespace:'synthetic'}));
 b.onResolve({filter:/^\.\/publishing-engagement$/},()=>({path:'engagement',namespace:'synthetic-engagement'}));
 b.onLoad({filter:/.*/,namespace:'synthetic-engagement'},()=>({contents:`export async function readPublishingEngagement(owner){return {engagement:[]};}export async function observeBrowserPublishingEngagement(owner,body){globalThis.__publishingApi.coreCalls.push({kind:'browser-engagement-observe',owner,body});return {work:{publication_id:'SYNTHETIC-original-browser-post'},publication_registration:'not_asserted',official_publication_time:null};}export async function observeNativePublishingEngagement(owner,body){globalThis.__publishingApi.coreCalls.push({kind:'native-engagement-observe',owner,body});return {work:{publication_id:'SYNTHETIC-native-engagement'},publication_registration:'not_asserted'};}export async function claimPublishingEngagement(owner,body){globalThis.__publishingApi.coreCalls.push({kind:'engagement-claim',owner,body});return {claim_token:'SYNTHETIC-memory-only',no_action_required:false};}export async function recordPublishingEngagement(owner,body){globalThis.__publishingApi.coreCalls.push({kind:'engagement-record',owner,body});return {replayed:false};}`}));
 b.onResolve({filter:/^\.\/publishing-existing$/},()=>({path:'existing',namespace:'synthetic-existing'}));
 b.onLoad({filter:/.*/,namespace:'synthetic-existing'},()=>({contents:`const result=(owner)=>({existing_publications:[{id:'SYNTHETIC-existing-post',owner_marker:owner}],existing_collections:[],candidates:[{id:'SYNTHETIC-registration-only',verification_state:'needs_reconciliation'}]});export async function readExistingPlatformDashboard(owner){const f=globalThis.__publishingApi;f.existingCalls.push({kind:'dashboard',owner});return result(owner);}export async function recordExistingPlatformObservation(owner,body){const f=globalThis.__publishingApi;f.existingCalls.push({kind:'observe',owner,body});return result(owner);}export async function runExistingCollectionTick(owner){const f=globalThis.__publishingApi;f.existingCalls.push({kind:'tick',owner});return result(owner);}`}));
 b.onResolve({filter:/^@\/lib\/publication-collections$/},()=>({path:'reminders',namespace:'synthetic'}));
 b.onResolve({filter:/^\.\/site-file-archive$/},()=>({path:'archive',namespace:'synthetic'}));
 b.onLoad({filter:/.*/,namespace:'synthetic'},args=>({contents:args.path==='auth'?`export async function getChatGPTUser(){const f=globalThis.__publishingApi;f.authReads++;return f.user;}`:args.path==='store'?`export function siteArchiveBucket(){throw Error("SYNTHETIC no archive access")} export function db(){return globalThis.__publishingApi.db;}`:args.path==='archive'?`export async function getSiteArchiveMetadata(job,id,owner){const f=globalThis.__publishingApi;f.archiveCalls.push({kind:'metadata',job,id,owner});if(owner!==f.archiveOwner||id!=='SYNTHETIC-archive')throw Error('SYNTHETIC wrong archive binding');return structuredClone(f.archiveMeta);}export async function readSiteArchiveFile(job,id,owner){const f=globalThis.__publishingApi;f.archiveCalls.push({kind:'read',job,id,owner});return {body:new TextEncoder().encode('SYNTHETIC-media')};}`:args.path==='reminders'?`export async function readDueCollectionReminders(owner){const f=globalThis.__publishingApi;f.reminderCalls.push({kind:'read',owner});if(f.reminderError)throw f.reminderError;return {reminders:[{id:'SYNTHETIC-reminder',upload_url:'/data/upload?collection=SYNTHETIC-collection'}]};}export async function markCollectionRemindersGenerated(owner,args){const f=globalThis.__publishingApi;f.reminderCalls.push({kind:'mark',owner,args});if(f.reminderError)throw f.reminderError;return {reminder_ids:args.reminder_ids,notification_delivery:'not_asserted'};}`:`export async function reconcileWarehouseCoverBranding(){return {no_external_action:true};}export async function readPublishingDashboard(owner){const f=globalThis.__publishingApi;f.coreCalls.push({kind:'dashboard',owner});if(f.coreError)throw f.coreError;return {owner_marker:owner,plan:{enabled:false},reserve_queue:f.reserveQueue,publications:[],collections:[]};}export async function currentPublishingBinding(owner,job_id){const f=globalThis.__publishingApi;f.coreCalls.push({kind:'current-binding',owner,job_id});return {...f.dispatch(owner).binding,job_id};}export async function currentPublishingPromotionText(owner,binding){const f=globalThis.__publishingApi;f.coreCalls.push({kind:'current-promotion',owner,binding});return f.promotionText;}export async function currentPlatformCopyReview(owner,binding,title){const f=globalThis.__publishingApi;f.coreCalls.push({kind:'copy-review',owner,binding,title});return null;}export async function configurePublishingPlan(owner,body){globalThis.__publishingApi.coreCalls.push({kind:'configure',owner,body});}export async function syncPublishingReserve(owner){globalThis.__publishingApi.coreCalls.push({kind:'sync',owner});}export async function runSlotContinuationReconciliation(owner,body){return authorizeBrowserTagAmendment(owner,body);}export async function authorizeSlotContinuation(owner,body){return authorizeBrowserTagAmendment(owner,body);}export async function authorizeScheduledBrowserTagAmendment(owner,body){return authorizeBrowserTagAmendment(owner,body);}export async function authorizeBrowserTagAmendment(owner,body){const f=globalThis.__publishingApi;f.coreCalls.push({kind:"tag-amendment",owner,body});return {amendment:{request_id:body.request_id},replayed:false,refresh_materials_required:true};}export async function authorizeEmptySlotBrowserRecovery(owner,body){globalThis.__publishingApi.coreCalls.push({kind:'browser-recovery',owner,body});return {browser_recovery:{request_id:body.request_id},no_external_action:true};}export async function authorizeEmptySlotMakeup(owner,body){globalThis.__publishingApi.coreCalls.push({kind:'empty-slot-makeup',owner,body});return {one_time_makeup:{request_id:body.request_id},preparation:{id:'SYNTHETIC-original-empty-slot'},no_external_action:true};}export async function authorizePreparedSlotContinuation(owner,body){globalThis.__publishingApi.coreCalls.push({kind:'prepared-continuation',owner,body});return {continuation:{request_id:body.request_id},replayed:false,no_external_action:true};}export async function prepareNextPublishingSlot(owner){const f=globalThis.__publishingApi;f.coreCalls.push({kind:'prepare-next',owner});return {preparation:{id:'SYNTHETIC-preparation'},package:{id:'SYNTHETIC-package',approval_scope:'warehouse-frozen-package'},work:[],no_external_action:true};}export async function readPublishingPreparation(owner,body={}){globalThis.__publishingApi.coreCalls.push({kind:'preparation-read',owner,body});return {preparation:null,package:null,work:[],no_external_action:true};}export async function armPreparedPublishingSlot(owner,body){globalThis.__publishingApi.coreCalls.push({kind:'arm-prepared-slot',owner,body});return {staged:true,no_external_action:true};}export async function readPublishingReadiness(owner){return {platforms:[],no_external_action:true};}export async function registerPublishingCoverAdaptation(owner){return {no_external_action:true};}export async function runPreparedPublishingTick(owner){globalThis.__publishingApi.coreCalls.push({kind:'prepared-tick',owner});return {no_submission:true};}export async function runPublishingReconciliation(owner){globalThis.__publishingApi.coreCalls.push({kind:'reconcile-publications',owner});return {no_external_action:true};}export async function assertPublishingPreparationCurrent(owner,work){globalThis.__publishingApi.coreCalls.push({kind:'preparation-guard',owner,work});return {};}export async function publishingPreparationMaterialPacket(owner,work){const f=globalThis.__publishingApi;f.coreCalls.push({kind:'preparation-materials',owner,work});return f.materials({platform:work.platform,binding:{video_sha256:'a'.repeat(64)},account_id:work.account_id});}export async function publishingDispatchPreparation(){return null;}export async function readOneTimeSlotMakeupPreparation(owner,body){const f=globalThis.__publishingApi;f.coreCalls.push({kind:"makeup-preparation",owner,body});return {preparation_only:true,claim_created:false,candidate:null};}export async function runOneTimeMakeupReconciliation(owner,body){const f=globalThis.__publishingApi;f.coreCalls.push({kind:"makeup-readback",owner,body});return {no_external_action:true,publications:[],collections:[]};}export async function authorizeOneTimeMakeupContinuation(owner,body){const f=globalThis.__publishingApi;f.coreCalls.push({kind:"makeup-child",owner,body});return {makeup_continuation:{request_id:body.request_id},no_external_action:true};}export async function runOneTimeSlotMakeup(owner,body){const f=globalThis.__publishingApi;f.coreCalls.push({kind:"one-time-makeup",owner,body});return {one_time_makeup:{request_id:body.request_id},replayed:false,posts:[]};}export async function runCollectionTick(owner){const f=globalThis.__publishingApi;f.coreCalls.push({kind:'collection-tick',owner});if(f.coreError)throw f.coreError;}export async function runPublishingTick(owner){const f=globalThis.__publishingApi;f.coreCalls.push({kind:'tick',owner});if(f.coreError)throw f.coreError;}export async function assertPublishingDispatchCurrent(owner,input,options){const f=globalThis.__publishingApi;f.coreCalls.push({kind:'guard',owner,input,options});if(f.guardError)throw f.guardError;}export async function recordPublishingExclusion(owner,body){globalThis.__publishingApi.coreCalls.push({kind:'exclusion',owner,body});return {excluded:true};}export async function readPublishingDispatchMaterials(owner,input){globalThis.__publishingApi.coreCalls.push({kind:'materials',owner,input});return globalThis.__publishingApi.materials(input);}`}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=synthetic:publishing-api-test.bundle.mjs\n').toString('base64'));
const ORIGIN='https://synthetic-studio.invalid',OWNER='SYNTHETIC-sites-owner',OTHER='SYNTHETIC-other-owner';

function fixture(t){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE app_state(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);CREATE TABLE production_jobs(id TEXT PRIMARY KEY NOT NULL,owner_id TEXT,is_test INTEGER NOT NULL DEFAULT 0)');
 const f={sql,user:{userId:OWNER},authReads:0,dbReads:0,coreCalls:[],existingCalls:[],reminderCalls:[],archiveCalls:[],reserveQueue:[],promotionText:'SYNTHETIC approved promotion fixture only',archiveOwner:OWNER,archiveMeta:{file:{role:'video',sha256:'a'.repeat(64),size_bytes:15,mime_type:'video/mp4'}},secret:'SYNTHETIC-private-value-never-in-discovery',coreError:null,reminderError:null};
 class Statement{
  constructor(query,args=[]){this.query=query;this.args=args;}
  bind(...args){return new Statement(this.query,args);}
  async first(){f.dbReads++;return sql.prepare(this.query).get(...this.args)||null;}
  async all(){f.dbReads++;return {results:sql.prepare(this.query).all(...this.args)};}
  async run(){return {results:[],meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}
 }
 f.db={prepare:query=>new Statement(query)};
 f.realOwner=(owner=OWNER,id='SYNTHETIC-real-job')=>sql.prepare('INSERT INTO production_jobs(id,owner_id,is_test) VALUES (?,?,0)').run(id,owner);
 f.dispatch=(owner=OWNER)=>({owner_id:owner,platform:'douyin',account_id:'SYNTHETIC-account',idempotency_key:'SYNTHETIC-key-'+owner,release_id:'SYNTHETIC-release',slot_id:'SYNTHETIC-slot',job_id:'SYNTHETIC-job',title:'SYNTHETIC video',binding:{job_id:'SYNTHETIC-job',video_sha256:'a'.repeat(64),site_archive_id:'SYNTHETIC-archive',size_bytes:15,file_name:'SYNTHETIC-video.mp4',materials:[]}});
 f.materials=input=>({materials_hash:'b'.repeat(64),copy:{title:'SYNTHETIC approved title',description:'SYNTHETIC approved description',tags:['SYNTHETIC-topic']},covers:[{role:'cover_3_4',site_archive_id:'SYNTHETIC-cover',sha256:'c'.repeat(64)},{role:'cover_4_3',site_archive_id:'SYNTHETIC-landscape',sha256:'d'.repeat(64)}],option_policy:{category:'technology-ai',originality:'self-produced-commentary',ai_disclosure:'ai-generated',visibility:'public',publish_mode:'immediate',download:'disabled',sync:'disabled'}});
 f.preflight=input=>{const packet=f.materials(input);return {platform:input.platform,account_id:input.account_id,video_sha256:input.binding.video_sha256,materials_hash:packet.materials_hash,title:packet.copy.title,description:packet.copy.description,tags:{mode:'platform-tag-controls',selected:[{label:'SYNTHETIC-topic'}],evidence_note:'SYNTHETIC selected platform topic fixture'},cover_inventory_complete:true,required_cover_slots:['portrait'],covers:[{slot:'portrait',label:'SYNTHETIC cover control',required:true,status:'selected',expected_ratio:'3:4',source_ratio:'3:4',actual_ratio:'3:4',role:'cover_3_4',archive_id:'SYNTHETIC-cover',sha256:'c'.repeat(64),crop_confirmed:true,preview_confirmed:true,safe_area_confirmed:true,evidence_note:'SYNTHETIC crop and safe area fixture'}],options:Object.fromEntries(Object.entries(packet.option_policy).map(([key,value])=>[key,{label:'SYNTHETIC '+key,status:'selected',value,evidence_note:'SYNTHETIC selected control fixture'}])),required_unknown_controls:[],observed_at:new Date(Date.now()-1).toISOString(),evidence_url:'https://creator.douyin.com/creator-micro/content/publish',evidence_note:'SYNTHETIC complete form fixture; no browser or platform visited'};};
 f.body=(action,extra={})=>({action,...extra});
 f.observation=(extra={})=>({platform:'douyin',state:'ready',account_id:'SYNTHETIC-account',account_label:'SYNTHETIC creator',can_publish:true,can_collect:true,evidence_url:'https://creator.douyin.com/',evidence_note:'SYNTHETIC observation, never a real browser login',...extra});
 f.existingObservation=(extra={})=>({job_id:'SYNTHETIC-job',data_video_id:'SYNTHETIC-registered-video',platform:'bilibili',account_id:'SYNTHETIC-account',external_post_id:'BV1JAnG6HEB7',platform_url:'https://www.bilibili.com/video/BV1JAnG6HEB7',platform_published_at:'2026-10-18T10:20:11Z',observed_at:'2026-10-20T02:00:00Z',evidence_reference:'https://member.bilibili.com/platform/upload-manager/article',evidence_note:'SYNTHETIC independent creator observation',observation_kind:'creator-backend-observation',independently_observed:true,identity_match_note:'SYNTHETIC creator account and exact work match',...extra});
 globalThis.__publishingApi=f;t.after(()=>{sql.close();delete globalThis.__publishingApi;});return f;
}
const webRequest=(body,headers={},method='POST')=>new Request(ORIGIN+'/api/publishing',{method,headers:{'content-type':'application/json',origin:ORIGIN,...headers},...(method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
const serviceRequest=(body,headers={})=>new Request(ORIGIN+'/api/publishing-service',{method:'POST',headers:{'content-type':'application/json','x-publishing-service':'owner-private',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const mediaRequest=(body,headers={})=>new Request(ORIGIN+'/api/publishing-service/media',{method:'POST',headers:{'content-type':'application/json','x-publishing-service':'owner-private',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const mcpRequest=(method,params={},owner=OWNER,headers={})=>new Request(ORIGIN+'/mcp',{method:'POST',headers:{'content-type':'application/json',...(owner?{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':'synthetic@example.invalid'}:{}),...headers},body:JSON.stringify({jsonrpc:'2.0',id:7,method,params})});
const decode=response=>response.json();
const toolCall=(name,args={},owner=OWNER,headers={})=>api.mcpPOST(mcpRequest('tools/call',{name,arguments:args},owner,headers));
const output=body=>JSON.parse(body.result.content[0].text);

test('visible browser engagement is discoverable and owner-bound through web, private service and MCP, without time or submission controls',async t=>{
 const f=fixture(t);f.realOwner();const args={work_id:'SYNTHETIC-original-work',package_id:'SYNTHETIC-frozen-package',account_id:'SYNTHETIC-account',external_post_id:'BV1iunc6mEMG',platform_url:'https://www.bilibili.com/video/BV1iunc6mEMG',browser_publication_visible:true,observed_at:'2026-10-22T00:30:00.000Z',evidence_note:'SYNTHETIC actual original public work page visible in current creator account, official time unavailable'};
 for(const transport of ['web','service','mcp']){const response=transport==='web'?await api.publishingPOST(webRequest({action:'observe_browser_engagement',...args})):transport==='service'?await api.servicePOST(serviceRequest({action:'observe_browser_engagement',...args})):await toolCall('observe_browser_publishing_engagement',args);assert.equal(response.status,200);const raw=await response.json(),result=transport==='mcp'?output(raw):raw;assert.equal(result.work.publication_id,'SYNTHETIC-original-browser-post');assert.equal(result.publication_registration,'not_asserted');assert.equal(result.official_publication_time,null);}
 const calls=f.coreCalls.filter(c=>c.kind==='browser-engagement-observe');assert.equal(calls.length,3);assert.ok(calls.every(c=>c.owner===OWNER));assert.deepEqual(calls[0].body,{action:'observe_browser_engagement',...args});
 for(const key of ['owner_id','published_at','now','force','replacement_work_id','target_hours']){const count=f.coreCalls.length;assert.ok((await api.servicePOST(serviceRequest({action:'observe_browser_engagement',...args,[key]:'SYNTHETIC-forbidden'}))).status>=400);const result=await decode(await toolCall('observe_browser_publishing_engagement',{...args,[key]:'SYNTHETIC-forbidden'}));assert.equal(result.result.isError,true);assert.equal(f.coreCalls.length,count);}
 const spec=api.publishingMcpTools.find(t=>t.name==='observe_browser_publishing_engagement');assert.equal(spec.inputSchema.additionalProperties,false);assert.equal(spec.inputSchema.properties.browser_publication_visible.const,true);assert.equal(spec.inputSchema.required.length,8);assert.equal(spec.inputSchema.properties.published_at,undefined);f.user=null;const count=f.coreCalls.length;assert.equal((await api.publishingPOST(webRequest({action:'observe_browser_engagement',...args}))).status,403);assert.equal(f.coreCalls.length,count);
});

test('owner-private prepared continuation accepts only the exact frozen scope and no clock or renewal controls',async t=>{
 const f=fixture(t);f.realOwner();const args={action:'authorize_prepared_slot_continuation',request_id:'SYNTHETIC-once',preparation_id:'SYNTHETIC-original-preparation',package_id:'SYNTHETIC-frozen-package',platforms:['douyin','bilibili'],authorization_reference:'SYNTHETIC actual owner authorizes this package to continue now'};
 for(const transport of ['web','service']){const response=transport==='web'?await api.publishingPOST(webRequest(args)):await api.servicePOST(serviceRequest(args));assert.equal(response.status,200);assert.equal((await response.json()).continuation.request_id,args.request_id);}
 assert.deepEqual(f.coreCalls.filter(c=>c.kind==='prepared-continuation').map(c=>({owner:c.owner,body:c.body})),[{owner:OWNER,body:args},{owner:OWNER,body:args}]);
 for(const key of ['now','expires_at','duration_minutes','force','owner_id','job_id','release_id','new_package_id']){const count=f.coreCalls.length;assert.ok((await api.servicePOST(serviceRequest({...args,[key]:'SYNTHETIC-forbidden'}))).status>=400);assert.equal(f.coreCalls.length,count);}
 const count=f.coreCalls.length;f.user=null;assert.equal((await api.publishingPOST(webRequest(args))).status,403);assert.equal(f.coreCalls.length,count);
});

test('dedicated one-time makeup routes preserve exact parameters and reject virtual clocks or general catch-up flags',async t=>{
 const f=fixture(t);f.realOwner();const args={request_id:'SYNTHETIC-one-time-explicit',scheduled_at:'2026-10-20T00:00:00.000Z',release_id:'SYNTHETIC-release',binding_hash:'b'.repeat(64),copy_hash:'c'.repeat(64),authorization_reference:'SYNTHETIC explicit human authorization for one otherwise missed morning slot'};
 for(const transport of ['web','service','mcp']){const response=transport==='web'?await api.publishingPOST(webRequest({action:'run_one_time_slot_makeup',...args})):transport==='service'?await api.servicePOST(serviceRequest({action:'run_one_time_slot_makeup',...args})):await toolCall('run_one_time_slot_makeup',args);assert.equal(response.status,200);const body=await decode(response),result=transport==='mcp'?output(body):body;assert.equal(result.one_time_makeup.request_id,args.request_id);assert.equal('dashboard' in result,false);}
 assert.equal(f.coreCalls.filter(x=>x.kind==='one-time-makeup').length,3);for(const call of f.coreCalls.filter(x=>x.kind==='one-time-makeup')){assert.equal(call.owner,OWNER);assert.deepEqual(call.body,{...args,action:'run_one_time_slot_makeup'});}
 for(const key of ['now','force','owner_id','slot_grace_minutes']){const before=f.coreCalls.length;assert.ok((await api.publishingPOST(webRequest({action:'run_one_time_slot_makeup',...args,[key]:'SYNTHETIC-rejected'}))).status>=400);const mcp=await decode(await toolCall('run_one_time_slot_makeup',{...args,[key]:'SYNTHETIC-rejected'}));assert.equal(mcp.result.isError,true);assert.equal(f.coreCalls.length,before);}
 const tool=api.publishingMcpTools.find(x=>x.name==='run_one_time_slot_makeup');assert.equal(tool.inputSchema.additionalProperties,false);assert.deepEqual(tool.inputSchema.properties.scheduled_at.enum,['2026-10-20T00:00:00.000Z','2026-10-21T10:00:00.000Z']);assert.equal(tool.inputSchema.required.length,6);assert.equal(api.publishingMcpTools.find(x=>x.name==='run_publishing_tick').inputSchema.properties.now,undefined);
});

test('exact tag-amendment action is owner-bound across web/service/MCP and cannot accept clocks, changed content or grant renewal fields',async t=>{
 const f=fixture(t);f.realOwner();const args={request_id:'SYNTHETIC-four-topics',work_id:'SYNTHETIC-ks-work',claim_token:'SYNTHETIC-memory-claim',grant_request_id:'SYNTHETIC-original-grant',grant_expires_at:'2026-10-20T02:32:15.000Z',base_materials_hash:'d'.repeat(64),old_tags:['怎么用好AI','AI兴趣卡','日语学习','抖音AI工坊','实用知识'],new_tags:['怎么用好AI','AI兴趣卡','日语学习','实用知识'],authorization_reference:'SYNTHETIC owner explicitly agrees to these four topics for this one work'};
 for(const transport of ['web','service','mcp']){const response=transport==='web'?await api.publishingPOST(webRequest({action:'authorize_browser_tag_amendment',...args})):transport==='service'?await api.servicePOST(serviceRequest({action:'authorize_browser_tag_amendment',...args})):await toolCall('authorize_browser_tag_amendment',args);assert.equal(response.status,200);const body=await decode(response),result=transport==='mcp'?output(body):body;assert.equal(result.amendment.request_id,args.request_id);assert.equal(result.refresh_materials_required,true);}
 for(const call of f.coreCalls.filter(c=>c.kind==='tag-amendment')){assert.equal(call.owner,OWNER);assert.deepEqual(call.body,{...args,action:'authorize_browser_tag_amendment'});}assert.equal(f.coreCalls.filter(c=>c.kind==='tag-amendment').length,3);
 for(const key of ['now','force','description','copy_hash','expires_at','owner_id']){const before=f.coreCalls.length;assert.ok((await api.publishingPOST(webRequest({action:'authorize_browser_tag_amendment',...args,[key]:'SYNTHETIC-rejected'}))).status>=400);const mcp=await decode(await toolCall('authorize_browser_tag_amendment',{...args,[key]:'SYNTHETIC-rejected'}));assert.equal(mcp.result.isError,true);assert.equal(f.coreCalls.length,before);}
 const schema=api.publishingMcpTools.find(c=>c.name==='authorize_browser_tag_amendment').inputSchema;assert.equal(schema.additionalProperties,false);assert.equal(schema.required.length,9);assert.equal(schema.properties.old_tags.maxItems,5);assert.equal(schema.properties.new_tags.maxItems,4);
});

test('web API identity comes from the session; headers cannot choose an owner',async t=>{
 const f=fixture(t),response=await api.publishingGET(webRequest(undefined,{'oai-authenticated-user-id':OTHER},'GET'));
 assert.equal(response.status,200);assert.equal((await decode(response)).owner_marker,OWNER);assert.equal(f.coreCalls[0].owner,OWNER);
 f.user=null;assert.equal((await api.publishingGET(webRequest(undefined,{'oai-authenticated-user-id':OWNER},'GET'))).status,401);
 assert.equal((await api.publishingPOST(webRequest({action:'sync_reserve'}))).status,403);
 assert.equal(f.coreCalls.filter(c=>c.kind==='sync').length,0);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
});

test('browser mutations reject cross-origin, missing-origin and non-JSON before reaching the controller',async t=>{
 const f=fixture(t);
 for(const req of [webRequest({action:'sync_reserve'},{origin:'https://other.invalid'}),webRequest({action:'sync_reserve'},{origin:'null'}),webRequest({action:'sync_reserve'},{'content-type':'text/plain'}),new Request(ORIGIN+'/api/publishing',{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"sync_reserve"}'})])assert.equal((await api.publishingPOST(req)).status,403);
 assert.equal(f.coreCalls.length,0);
 const good=await api.publishingPOST(webRequest({action:'sync_reserve'}));assert.equal(good.status,200);assert.equal(f.coreCalls.find(c=>c.kind==='sync').owner,OWNER);
});

test('web and service bodies cannot select a different owner and do not mutate on malformed envelopes',async t=>{
 const f=fixture(t);f.realOwner();
 for(const field of ['owner','owner_id']){
  assert.equal((await api.publishingPOST(webRequest({action:'sync_reserve',[field]:OTHER}))).status,400);
  assert.equal((await api.servicePOST(serviceRequest({action:'sync_reserve',[field]:OTHER}))).status,403);
 }
 for(const body of ['[1]','null','{"action":','x'.repeat(40001)]){
  assert.ok((await api.publishingPOST(webRequest(body))).status>=400);
  assert.ok((await api.servicePOST(serviceRequest(body))).status>=400);
 }
 assert.equal(f.coreCalls.length,0);
});

test('dashboard handles current synthetic reserve bindings and an absent platform-copy review',async t=>{
 const f=fixture(t),binding=f.dispatch().binding;f.reserveQueue=[{job_id:binding.job_id,status:'ready',title:'SYNTHETIC reserve',binding}];
 const response=await api.publishingGET(webRequest(undefined,{},'GET')),body=await decode(response);assert.equal(response.status,200);assert.deepEqual(body.copy_reviews,[]);assert.equal(body.reserve_queue[0].binding.job_id,binding.job_id);assert.deepEqual(f.coreCalls.find(c=>c.kind==='copy-review'),{kind:'copy-review',owner:OWNER,binding,title:'SYNTHETIC reserve'});
});

test('automation service cannot review or approve a platform-copy draft for the owner',async t=>{
 const f=fixture(t);f.realOwner();
 for(const decision of ['approve','revise']){
  const response=await api.servicePOST(serviceRequest({action:'review_platform_copy',job_id:'SYNTHETIC-real-job',copy_hash:'e'.repeat(64),decision,reason:'SYNTHETIC automation attempt',originality:'self-produced-commentary'}));assert.equal(response.status,403);assert.match(JSON.stringify(await decode(response)),/本人在网页审阅|自动执行器不能代为批准/);
 }
 assert.equal(f.coreCalls.length,0,'source=automation is rejected before reading a review binding or deciding');assert.equal(f.sql.prepare('SELECT count(*) n FROM app_state').get().n,0,'no synthetic approval is written');
});

test('service rejects every browser Origin/fetch header and a missing or wrong public dispatch marker',async t=>{
 const f=fixture(t);f.realOwner();
 for(const headers of [{origin:ORIGIN},{origin:'https://other.invalid'},{'sec-fetch-site':'same-origin'},{'sec-fetch-site':'cross-site'},{'x-publishing-service':''},{'x-publishing-service':'arbitrary'},{'content-type':'text/plain'}])assert.equal((await api.servicePOST(serviceRequest({action:'run_tick'},headers))).status,403);
 assert.equal(f.coreCalls.length,0);
});

test('service requires the JSON media type, not a prefix such as application/jsonp',async t=>{
 const f=fixture(t);f.realOwner();
 for(const type of ['application/jsonp','application/json-malformed'])assert.equal((await api.servicePOST(serviceRequest({action:'run_tick'},{'content-type':type}))).status,403);
 assert.equal(f.coreCalls.length,0);
});

test('both service dashboard and mutations reject unknown owner, archive, path, credential or force arguments',async t=>{
 const f=fixture(t);f.realOwner();
 for(const action of ['read_dashboard','run_tick','run_collection_tick'])for(const key of ['archive','path','cookie','access_token','force','now','owner']){
  const response=await api.servicePOST(serviceRequest({action,[key]:'SYNTHETIC unsupported'}));assert.ok(response.status>=400,action+' '+key);
 }
 assert.equal(f.coreCalls.length,0);
});

test('web plan configuration passes the selected platform subset to the publishing core',async t=>{
 const f=fixture(t),platforms=['douyin','bilibili','kuaishou'];
 const response=await api.publishingPOST(webRequest({action:'configure_plan',enabled:true,request_id:'SYNTHETIC-configure',platforms,authorization_reference:'SYNTHETIC explicit owner schedule'}));
 assert.equal(response.status,200);assert.deepEqual(f.coreCalls.find(c=>c.kind==='configure').body.platforms,platforms);
});

test('existing-publication actions use only session or private-service ownership and reject owner/unknown arguments',async t=>{
 const f=fixture(t);f.realOwner();
 for(const action of ['observe_existing_publication','read_existing_publications']){
  const fields=action==='observe_existing_publication'?f.existingObservation():{};
  for(const key of ['owner','owner_id','archive','path','cookie','release_id','slot_id','force']){
   assert.ok((await api.publishingPOST(webRequest({action,...fields,[key]:OTHER}))).status>=400);
   assert.ok((await api.servicePOST(serviceRequest({action,...fields,[key]:OTHER}))).status>=400);
  }
 }
 assert.equal(f.existingCalls.length,0);
 const body={action:'observe_existing_publication',...f.existingObservation()};
 assert.equal((await api.publishingPOST(webRequest(body,{'oai-authenticated-user-id':OTHER}))).status,200);
 assert.equal((await api.servicePOST(serviceRequest(body,{'oai-authenticated-user-id':OTHER}))).status,200);
 assert.ok(f.existingCalls.filter(c=>c.kind==='observe').every(c=>c.owner===OWNER&&c.body.job_id==='SYNTHETIC-job'));
 assert.equal(f.coreCalls.length,0,'existing observations must not dispatch or manufacture new release/slot events');
 const listed=await decode(await api.servicePOST(serviceRequest({action:'read_existing_publications'})));
 assert.equal(listed.existing_publications[0].owner_marker,OWNER);
});

test('minute precision observation crosses web, private service and MCP without allowing derived or misspelled fields',async t=>{
 const f=fixture(t);f.realOwner();const fields=f.existingObservation({platform_published_at:'2026-10-18T18:16+08:00',published_at_precision:'minute'}),body={action:'observe_existing_publication',...fields};
 assert.equal((await api.publishingPOST(webRequest(body))).status,200);
 assert.equal((await api.servicePOST(serviceRequest(body))).status,200);
 const observed=await decode(await toolCall('observe_existing_platform_publication',fields));assert.equal(observed.result.isError,false);
 const calls=f.existingCalls.filter(c=>c.kind==='observe');assert.equal(calls.length,3);
 for(const call of calls){assert.equal(call.owner,OWNER);assert.equal(call.body.platform_published_at,fields.platform_published_at);assert.equal(call.body.published_at_precision,'minute');}
 const schema=api.publishingMcpTools.find(tool=>tool.name==='observe_existing_platform_publication').inputSchema;
 assert.deepEqual(schema.properties.published_at_precision.enum,['minute','second']);assert.equal(schema.additionalProperties,false);
 for(const key of ['platform_published_at_precision','published_at_range_start','published_at_range_end','published_at_uncertainty_seconds','owner_id']){
  assert.ok((await api.publishingPOST(webRequest({...body,[key]:'SYNTHETIC injected'}))).status>=400,key);
  assert.ok((await api.servicePOST(serviceRequest({...body,[key]:'SYNTHETIC injected'}))).status>=400,key);
  const rejected=await decode(await toolCall('observe_existing_platform_publication',{...fields,[key]:'SYNTHETIC injected'}));assert.equal(rejected.result.isError,true,key);
 }
 assert.equal(f.existingCalls.filter(c=>c.kind==='observe').length,3,'unknown arguments never reach the mocked observation boundary');
});

for(const transport of ['web','service','mcp'])test(transport+': platform acceptance without an ID is submitted rather than unknown and cannot be claimed again',async t=>{
 const f=fixture(t);f.realOwner();await api.publishingPOST(webRequest({action:'observe_account',...f.observation()}));const queued=await api.browserPublishingAdapter.publish(f.dispatch()),work_id=queued.receipt.work_id,claim=await decode(await api.publishingPOST(webRequest({action:'claim_browser_work',work_id,worker:'SYNTHETIC current existing submitter'})));assert.equal((await api.publishingPOST(webRequest({action:'checkpoint_browser_work',work_id,claim_token:claim.claim_token,phase:'submitting',account_id:'SYNTHETIC-account',local_sha256:'a'.repeat(64),preflight:f.preflight(f.dispatch())}))).status,200);
 const args={work_id,claim_token:claim.claim_token,result:{status:'submitted',evidence_url:'https://creator.douyin.com/creator-micro/content/manage',evidence_note:'SYNTHETIC actual creator page shows 发布成功 and matching work row 审核中; ID not yet available'}};const response=transport==='mcp'?await toolCall('complete_browser_publishing_work',args):transport==='service'?await api.servicePOST(serviceRequest({action:'complete_browser_work',...args})):await api.publishingPOST(webRequest({action:'complete_browser_work',...args}));assert.equal(response.status,200);const body=await response.json(),saved=transport==='mcp'?output(body):body;assert.equal(saved.work.state,'submitted');assert.equal(saved.work.result.external_post_id,undefined);assert.equal(saved.work.result.published_at,undefined);assert.match(saved.work.result.reason,/平台已受理/);assert.equal((await api.publishingPOST(webRequest({action:'claim_browser_work',work_id,worker:'SYNTHETIC forbidden re-upload'}))).status,409);
});

for(const transport of ['web','service','mcp'])test(transport+': browser published receipt preserves minute uncertainty and rejects invented seconds',async t=>{
 const f=fixture(t);f.realOwner();assert.equal((await api.publishingPOST(webRequest({action:'observe_account',...f.observation()}))).status,200);
 const work=await api.browserPublishingAdapter.publish(f.dispatch()),work_id=work.receipt.work_id;
 const claimed=await decode(await api.publishingPOST(webRequest({action:'claim_browser_work',work_id,worker:'SYNTHETIC precision worker'})));
 const claim_token=claimed.claim_token;assert.ok(claim_token);
 assert.equal((await api.publishingPOST(webRequest({action:'checkpoint_browser_work',work_id,claim_token,phase:'submitting',account_id:'SYNTHETIC-account',local_sha256:'a'.repeat(64),preflight:f.preflight(f.dispatch())}))).status,200);
 const fields={work_id,claim_token},receipt={status:'published',external_post_id:'1234567890123456789',platform_url:'https://www.douyin.com/video/1234567890123456789',published_at:'2026-10-18T18:16+08:00',evidence_url:'https://creator.douyin.com/creator-micro/work-management/work-detail/1234567890123456789',evidence_note:'SYNTHETIC fixture: the official detail display shows 18:16, with no observed seconds'};
 const complete=async result=>{
  if(transport==='mcp'){const response=await decode(await toolCall('complete_browser_publishing_work',{...fields,result}));return {failed:response.result.isError===true,body:response.result.isError?response:output(response)};}
  const request={action:'complete_browser_work',...fields,result},response=transport==='service'?await api.servicePOST(serviceRequest(request)):await api.publishingPOST(webRequest(request));return {failed:response.status>=400,body:await decode(response)};
 };
 assert.equal((await complete(receipt)).failed,true,'a time without seconds cannot silently become second precision');
 assert.equal((await complete({...receipt,published_at_precision:'second'})).failed,true);
 assert.equal((await complete({...receipt,published_at:'2026-10-18T18:16:17+08:00',published_at_precision:'minute'})).failed,true,'minute precision cannot retain invented nonzero seconds');
 assert.equal((await complete({...receipt,published_at_precision:'hour'})).failed,true);
 const prior=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('publishing_browser_work_v2:'+work_id).value);assert.equal(prior.state,'submitting');assert.equal(prior.result,undefined);
 assert.equal((await api.publishingPOST(webRequest({action:'complete_browser_work',...fields,result:{...receipt,published_at_precision:'minute'},published_at_uncertainty_seconds:0}))).status,400,'derived precision metadata is not an accepted action argument');
 const saved=await complete({...receipt,published_at_precision:'minute',published_at_range_start:'SYNTHETIC invented range',published_at_range_end:'SYNTHETIC invented range',published_at_uncertainty_seconds:0});assert.equal(saved.failed,false);
 const result=saved.body.work.result;assert.equal(result.published_at,'2026-10-18T10:16:00.000Z');assert.equal(result.published_at_precision,'minute');assert.equal(result.published_at_range_start,'2026-10-18T10:16:00.000Z');assert.equal(result.published_at_range_end,'2026-10-18T10:16:59.000Z');assert.equal(result.published_at_uncertainty_seconds,59);
 const persisted=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('publishing_browser_work_v2:'+work_id).value);assert.equal(persisted.state,'confirmed');assert.equal(persisted.result.published_at_precision,'minute');assert.equal(persisted.result.published_at_uncertainty_seconds,59);
 const resultSchema=api.publishingMcpTools.find(tool=>tool.name==='complete_browser_publishing_work').inputSchema.properties.result;
 assert.deepEqual(resultSchema.properties.published_at_precision.enum,['minute','second']);
});

test('dashboard and scheduler integrate existing collection separately from new-video publication state',async t=>{
 const f=fixture(t);f.realOwner();const response=await api.publishingGET(webRequest(undefined,{},'GET')),body=await decode(response);
 assert.equal(response.status,200);assert.equal(body.existing_publications[0].owner_marker,OWNER);assert.equal(body.existing_candidates[0].verification_state,'needs_reconciliation');assert.deepEqual(body.reserve_queue,[]);assert.deepEqual(body.publications,[]);
 assert.equal((await api.servicePOST(serviceRequest({action:'run_tick'}))).status,200);
 assert.equal(f.existingCalls.filter(c=>c.kind==='tick').length,1);assert.equal(f.existingCalls.find(c=>c.kind==='tick').owner,OWNER);assert.equal(f.coreCalls.filter(c=>c.kind==='tick').length,1);
 assert.equal(f.coreCalls.some(c=>c.kind==='configure'||c.kind==='exclusion'),false);
});

test('collection-only action is owner-bound and runs only gated collection paths through web/private service',async t=>{
 const f=fixture(t);f.realOwner();
 for(const response of [await api.publishingPOST(webRequest({action:'run_collection_tick'})),await api.servicePOST(serviceRequest({action:'run_collection_tick'}))]){assert.equal(response.status,200);const d=await decode(response);assert.equal(d.owner_marker,OWNER);assert.match(d.scheduler.last_result,/独立到期采集/);}
 assert.equal(f.coreCalls.filter(c=>c.kind==='collection-tick').length,2);assert.ok(f.coreCalls.filter(c=>c.kind==='collection-tick').every(c=>c.owner===OWNER));assert.equal(f.existingCalls.filter(c=>c.kind==='tick').length,2);assert.equal(f.coreCalls.some(c=>['tick','sync','configure','one-time-makeup','guard','exclusion'].includes(c.kind)),false);
 for(const key of ['now','force','owner','owner_id','request_id','release_id','slot_id'])assert.ok((await api.publishingPOST(webRequest({action:'run_collection_tick',[key]:'SYNTHETIC-rejected'}))).status>=400);
 assert.equal(f.coreCalls.filter(c=>c.kind==='collection-tick').length,2);
});

test('collection-only authorization failure cannot reach existing collection or mutate scheduler state',async t=>{
 const f=fixture(t);f.realOwner();f.coreError=Object.assign(new Error('SYNTHETIC current plan authorization disabled'),{status:409});const before=f.sql.prepare('SELECT * FROM app_state').all();
 const response=await api.servicePOST(serviceRequest({action:'run_collection_tick'}));assert.ok(response.status>=400);assert.equal(f.coreCalls.filter(c=>c.kind==='collection-tick').length,1);assert.equal(f.existingCalls.length,0);assert.deepEqual(f.sql.prepare('SELECT * FROM app_state').all(),before);assert.equal(f.coreCalls.some(c=>['tick','sync','configure','one-time-makeup'].includes(c.kind)),false);
});

test('private Sites service has no internal visitor authentication: its marker is not a secret or identity',async t=>{
 const f=fixture(t);f.realOwner();f.user=null;
 const response=await api.servicePOST(serviceRequest({action:'read_dashboard'},{'oai-authenticated-user-id':OTHER,'oai-authenticated-user-email':'other@example.invalid'}));
 assert.equal(response.status,200);assert.equal((await decode(response)).owner_marker,OWNER);assert.equal(f.authReads,0);
 // This acceptance is intentional only inside the upstream private Sites boundary.
 // It would not prove this raw handler safe on a public deployment.
 const tick=await api.servicePOST(serviceRequest({action:'run_tick'}));assert.equal(tick.status,200);assert.equal(f.coreCalls.find(c=>c.kind==='tick').owner,OWNER);
 const row=f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('publishing_scheduler_v2:'+OWNER);
 assert.ok(JSON.parse(row.value).heartbeat_at);assert.equal(tick.headers.get('cache-control'),'private, no-store');
});

test('service owner is derived from exactly one distinct real production owner; test jobs cannot appoint it',async t=>{
 const f=fixture(t);
 f.sql.prepare('INSERT INTO production_jobs(id,owner_id,is_test) VALUES (?,?,1)').run('SYNTHETIC-test-job',OTHER);
 assert.equal((await api.servicePOST(serviceRequest({action:'read_dashboard'}))).status,403);
 f.realOwner();f.realOwner(OWNER,'SYNTHETIC-second-real-job');
 assert.equal((await api.servicePOST(serviceRequest({action:'read_dashboard'}))).status,200);
 f.realOwner(OTHER,'SYNTHETIC-foreign-real-job');
 assert.equal((await api.servicePOST(serviceRequest({action:'read_dashboard'}))).status,403);
 assert.ok(f.coreCalls.every(c=>c.owner===OWNER));
});

test('media service rejects browser access, arbitrary archives/paths/owners and cross-owner work before any archive read',async t=>{
 const f=fixture(t);f.realOwner();const own=await api.browserPublishingAdapter.publish(f.dispatch()),foreign=await api.browserPublishingAdapter.publish(f.dispatch(OTHER));
 for(const headers of [{origin:ORIGIN},{origin:'https://other.invalid'},{'sec-fetch-site':'same-origin'},{'x-publishing-service':''},{'content-type':'application/jsonp'}])assert.equal((await api.mediaPOST(mediaRequest({work_id:own.receipt.work_id,role:'video'},headers))).status,403);
 for(const key of ['owner','owner_id','archive','archive_id','path','url','cookie'])assert.equal((await api.mediaPOST(mediaRequest({work_id:own.receipt.work_id,role:'video',[key]:'SYNTHETIC injected'}))).status,400);
 assert.equal((await api.mediaPOST(mediaRequest({work_id:foreign.receipt.work_id,role:'video'}))).status,403);
 assert.equal((await api.mediaPOST(mediaRequest({work_id:own.receipt.work_id,role:'../../secret'}))).status,400);
 assert.equal(f.archiveCalls.length,0);
});

test('media service resolves only the frozen work package and checks archive hash/size/role before streaming',async t=>{
 const f=fixture(t);f.realOwner();const work=await api.browserPublishingAdapter.publish(f.dispatch());
 const success=await api.mediaPOST(mediaRequest({work_id:work.receipt.work_id,role:'video'},{'oai-authenticated-user-id':OTHER}));
 assert.equal(success.status,200);assert.equal(await success.text(),'SYNTHETIC-media');assert.equal(success.headers.get('x-asset-sha256'),'a'.repeat(64));assert.equal(success.headers.get('cache-control'),'private, no-store');assert.equal(success.headers.get('content-type'),'video/mp4');
 assert.ok(f.archiveCalls.every(c=>c.owner===OWNER&&c.job==='SYNTHETIC-job'&&c.id==='SYNTHETIC-archive'));assert.equal(f.coreCalls.find(c=>c.kind==='guard').options.stage,'claim');
 const reads=f.archiveCalls.filter(c=>c.kind==='read').length;
 for(const changes of [{sha256:'b'.repeat(64)},{size_bytes:16},{role:'cover'}]){
  const prior=structuredClone(f.archiveMeta);Object.assign(f.archiveMeta.file,changes);assert.equal((await api.mediaPOST(mediaRequest({work_id:work.receipt.work_id,role:'video'}))).status,409);f.archiveMeta=prior;
 }
 assert.equal(f.archiveCalls.filter(c=>c.kind==='read').length,reads);
 f.guardError=Error('SYNTHETIC revoked release');const count=f.archiveCalls.length;assert.ok((await api.mediaPOST(mediaRequest({work_id:work.receipt.work_id,role:'video'}))).status>=400);assert.equal(f.archiveCalls.length,count);
});

test('MCP discovery lists the old and new tools without reading account state or exposing credentials',async t=>{
 const f=fixture(t);f.user=null;
 const response=await api.mcpPOST(mcpRequest('tools/list',{},null)),body=await decode(response),names=body.result.tools.map(tool=>tool.name);
 assert.equal(response.status,200);assert.equal(new Set(names).size,names.length);assert.equal(names.length,3+api.publishingMcpTools.length);
 for(const name of ['studio_preview_owner_policy_request','read_due_collection_reminders','mark_collection_reminders_generated',...api.publishingMcpTools.map(tool=>tool.name)])assert.ok(names.includes(name));
 assert.equal(f.authReads,0);assert.equal(f.dbReads,0);assert.equal(f.coreCalls.length,0);assert.equal(f.reminderCalls.length,0);
 assert.equal(f.existingCalls.length,0);
 const encoded=JSON.stringify(body);for(const value of [OWNER,OTHER,f.secret,'SYNTHETIC-account'])assert.equal(encoded.includes(value),false);
 assert.ok(body.result.tools.every(tool=>tool.inputSchema.additionalProperties===false));
 assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const discovery=await decode(await api.mcpPOST(mcpRequest('server/discover',{},null)));assert.deepEqual(discovery.result.supportedVersions,['2026-07-28']);
});

test('new MCP calls require both Sites identity headers, ignore browser session identity and reject cross-site transport',async t=>{
 const f=fixture(t);f.user={userId:OTHER};
 const response=await toolCall('read_publishing_dashboard'),body=await decode(response);assert.equal(output(body).owner_marker,OWNER);assert.equal(f.authReads,0);
 for(const req of [mcpRequest('tools/call',{name:'read_publishing_dashboard'},null),mcpRequest('tools/call',{name:'read_publishing_dashboard'},null,{'oai-authenticated-user-id':OWNER}),mcpRequest('tools/call',{name:'read_publishing_dashboard'},null,{'oai-authenticated-user-email':'synthetic@example.invalid'})])assert.equal((await api.mcpPOST(req)).status,401);
 for(const headers of [{origin:'https://other.invalid'},{'sec-fetch-site':'cross-site'}])assert.equal((await toolCall('run_publishing_tick',{},OWNER,headers)).status,403);
 assert.equal((await toolCall('run_publishing_tick',{},OWNER,{'content-type':'text/plain'})).status,415);
 assert.equal(f.coreCalls.filter(c=>c.kind==='tick').length,0);
});

test('MCP owner/action injection and unknown tools are rejected before controller execution',async t=>{
 const f=fixture(t);
 for(const name of api.publishingMcpTools.map(t=>t.name))for(const key of ['owner','owner_id','action']){
  const body=await decode(await toolCall(name,{[key]:OTHER}));assert.equal(body.result.isError,true);assert.match(body.result.content[0].text,/不能指定所有者或操作/);
 }
 const unknown=await decode(await toolCall('SYNTHETIC_unknown_tool'));assert.equal(unknown.error.code,-32602);assert.equal(f.coreCalls.length,0);assert.equal(f.dbReads,0);
});

test('MCP rejects unknown runtime keys according to advertised additionalProperties, including wrong-platform hints',async t=>{
 const f=fixture(t);
 for(const [name,args] of [['read_browser_publishing_work',{platform:'kuaishou'}],['read_browser_publishing_work',{cookie:f.secret}],['run_publishing_tick',{force:true}],['read_publishing_dashboard',{ownerId:OTHER}],['observe_publishing_account',{...f.observation(),cookie:f.secret}]]){
  const body=await decode(await toolCall(name,args));assert.equal(body.result.isError,true,name);assert.equal(JSON.stringify(body).includes(f.secret),false);
 }
 assert.equal(f.coreCalls.length,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM app_state').get().n,0);
});

test('wrong platform and cross-owner work IDs are rejected through actual MCP controller/bridge integration',async t=>{
 const f=fixture(t);
 const invalid=await decode(await toolCall('observe_publishing_account',f.observation({platform:'wechat'})));assert.equal(invalid.result.isError,true);assert.match(invalid.result.content[0].text,/平台无效|参数/);
 const observed=await decode(await toolCall('observe_publishing_account',f.observation()));assert.equal(observed.result.isError,false);
 const work=await api.browserPublishingAdapter.publish(f.dispatch()),id=work.receipt.work_id;
 const mismatch=await decode(await toolCall('claim_browser_publishing_work',{work_id:id,worker:'SYNTHETIC-worker',platform:'kuaishou'}));assert.equal(mismatch.result.isError,true);
 const foreign=await decode(await toolCall('claim_browser_publishing_work',{work_id:id,worker:'SYNTHETIC-worker'},OTHER));assert.equal(foreign.result.isError,true);assert.match(foreign.result.content[0].text,/不属于当前账号/);
 const pending=await decode(await toolCall('read_browser_publishing_work',{},OTHER));assert.equal(output(pending).work.length,0);
 const good=await decode(await toolCall('claim_browser_publishing_work',{work_id:id,worker:'SYNTHETIC-worker'}));assert.equal(good.result.isError,false);assert.ok(output(good).claim_token);assert.equal(output(good).work.claim_hash,undefined);assert.equal(output(good).work.owner_id,undefined);
});

test('new existing-publication MCP tools bind only Sites ownership and reject report/slot/credential injection',async t=>{
 const f=fixture(t);f.user={userId:OTHER};
 for(const [name,args] of [['read_existing_platform_publications',{platform:'bilibili'}],['observe_existing_platform_publication',f.existingObservation({slot_id:'SYNTHETIC-fake-slot'})],['observe_existing_platform_publication',f.existingObservation({cookie:f.secret})],['observe_existing_platform_publication',f.existingObservation({owner_id:OTHER})]]){
  const result=await decode(await toolCall(name,args));assert.equal(result.result.isError,true);assert.equal(JSON.stringify(result).includes(f.secret),false);
 }
 assert.equal(f.existingCalls.length,0);
 const read=await decode(await toolCall('read_existing_platform_publications'));assert.equal(read.result.isError,false);assert.equal(output(read).existing_publications[0].owner_marker,OWNER);
 const observed=await decode(await toolCall('observe_existing_platform_publication',f.existingObservation()));assert.equal(observed.result.isError,false);assert.equal(f.existingCalls.find(c=>c.kind==='observe').owner,OWNER);assert.equal(f.authReads,0);assert.equal(f.coreCalls.length,0);
});

test('the two original reminder tools preserve owner binding, upload URLs and notification semantics',async t=>{
 const f=fixture(t),read=await decode(await toolCall('read_due_collection_reminders'));
 assert.equal(read.result.isError,false);assert.equal(output(read).notification_delivery,'not_asserted');assert.equal(output(read).reminders[0].upload_url,ORIGIN+'/data/upload?collection=SYNTHETIC-collection');assert.equal(f.reminderCalls[0].owner,OWNER);
 const marked=await decode(await toolCall('mark_collection_reminders_generated',{reminder_ids:['SYNTHETIC-reminder'],request_id:'SYNTHETIC-request'}));
 assert.equal(marked.result.isError,false);assert.equal(output(marked).notification_delivery,'not_asserted');assert.deepEqual(f.reminderCalls[1],{kind:'mark',owner:OWNER,args:{reminder_ids:['SYNTHETIC-reminder'],request_id:'SYNTHETIC-request'}});
 for(const name of ['read_due_collection_reminders','mark_collection_reminders_generated']){const rejected=await decode(await toolCall(name,{owner:OTHER,reminder_ids:['SYNTHETIC-reminder'],request_id:'SYNTHETIC-request'}));assert.equal(rejected.error.code,-32602);}
 assert.equal(f.reminderCalls.length,2);
 f.reminderError=Object.assign(Error('SYNTHETIC reminder not due'),{status:409});const domain=await decode(await toolCall('read_due_collection_reminders'));assert.equal(domain.result.isError,true);assert.equal(domain.result.content[0].text,'SYNTHETIC reminder not due');
});

test('server failures redact internal errors and oversized MCP requests never invoke publishing',async t=>{
 const f=fixture(t);f.realOwner();f.coreError=Error(f.secret);
 for(const response of [await api.publishingGET(webRequest(undefined,{},'GET')),await api.servicePOST(serviceRequest({action:'read_dashboard'})),await toolCall('read_publishing_dashboard')]){
  const body=await response.text();assert.equal(body.includes(f.secret),false);
 }
 const count=f.coreCalls.length,large=new Request(ORIGIN+'/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(33000)});
 assert.equal((await api.mcpPOST(large)).status,400);assert.equal(f.coreCalls.length,count);
});


test('read-only evening preparation crosses web/service/MCP without clock or mutation fields',async t=>{const f=fixture(t);f.realOwner();const args={scheduled_at:'2026-10-21T10:00:00.000Z'};for(const transport of ['web','service','mcp']){const response=transport==='web'?await api.publishingPOST(webRequest({action:'read_one_time_slot_makeup_preparation',...args})):transport==='service'?await api.servicePOST(serviceRequest({action:'read_one_time_slot_makeup_preparation',...args})):await toolCall('read_one_time_slot_makeup_preparation',args);assert.equal(response.status,200);const body=await decode(response),result=transport==='mcp'?output(body):body;assert.equal(result.preparation_only,true);assert.equal(result.claim_created,false);}assert.equal(f.coreCalls.filter(c=>c.kind==='makeup-preparation').length,3);const denied=await api.servicePOST(serviceRequest({action:'read_one_time_slot_makeup_preparation',...args,now:'2026-10-21T12:30:00Z'}));assert.equal(denied.status,400);});


test('one-time child permission is exact and owner-bound through web/service/MCP, rejecting clocks and renewal fields',async t=>{const f=fixture(t);f.realOwner();const args={request_id:'SYNTHETIC-child',slot_id:'SYNTHETIC-original-slot',release_id:'SYNTHETIC-original-release',job_id:'SYNTHETIC-original-job',binding_hash:'a'.repeat(64),copy_hash:'b'.repeat(64),authorization_reference:'SYNTHETIC owner explicitly permits this WorkBuddy continuation until 21:30'};for(const transport of ['web','service','mcp']){const response=transport==='web'?await api.publishingPOST(webRequest({action:'authorize_one_time_makeup_continuation',...args})):transport==='service'?await api.servicePOST(serviceRequest({action:'authorize_one_time_makeup_continuation',...args})):await toolCall('authorize_one_time_makeup_continuation',args);assert.equal(response.status,200);const body=await decode(response),result=transport==='mcp'?output(body):body;assert.equal(result.no_external_action,true);}assert.equal(f.coreCalls.filter(x=>x.kind==='makeup-child').length,3);for(const extra of [{now:'2026-10-21T12:40:00Z'},{expires_at:'2026-10-22T00:00:00Z'},{force:true}])assert.equal((await api.servicePOST(serviceRequest({action:'authorize_one_time_makeup_continuation',...args,...extra}))).status,400);});

test('regular preparation, slot dispatch and receipt ingestion are separate owner-bound operations with no virtual clock',async t=>{
 const f=fixture(t);f.realOwner();const operations=[['prepare_next_slot','prepare_next_publishing_slot','prepare-next'],['read_preparation','read_publishing_preparation','preparation-read'],['run_prepared_tick','run_prepared_publishing_tick','prepared-tick'],['reconcile_publications','reconcile_publishing_publications','reconcile-publications']];
 for(const [action,name,kind]of operations){const before=f.coreCalls.filter(c=>c.kind===kind).length;for(const transport of ['web','service','mcp']){const response=transport==='web'?await api.publishingPOST(webRequest({action})):transport==='service'?await api.servicePOST(serviceRequest({action})):await toolCall(name);assert.equal(response.status,200);const body=await decode(response),result=transport==='mcp'?output(body):body;if(action==='prepare_next_slot'){assert.equal(result.package.approval_scope,'warehouse-frozen-package');assert.equal(result.no_external_action,true);}if(action==='read_preparation')assert.equal(result.preparation,null);}assert.ok(f.coreCalls.filter(c=>c.kind===kind).length>=before+3);}
 assert.ok(f.coreCalls.every(c=>c.owner===OWNER));assert.equal(f.coreCalls.filter(c=>c.kind==='tick'||c.kind==='collection-tick').length,0,'new preparation/reconciliation never dispatches the old mixed tick');
 for(const [action,name]of operations)for(const [key,value]of Object.entries({now:'2099-01-01T00:00:00Z',force:true,owner_id:OTHER,job_id:'SYNTHETIC-alternate',scheduled_at:'2099-01-01T00:00:00Z'})){const before=f.coreCalls.length;assert.ok((await api.servicePOST(serviceRequest({action,[key]:value}))).status>=400);const denied=await decode(await toolCall(name,{[key]:value}));assert.equal(denied.result.isError,true);assert.equal(f.coreCalls.length,before);}
});

test('preparation claims cannot cross owners or turn a draft checkpoint into a publish action',async t=>{
 const f=fixture(t),id='SYNTHETIC-native-preparation-work',work={schema:'publishing-preparation-work-v1',id,owner_id:OWNER,preparation_id:'SYNTHETIC-preparation',package_id:'SYNTHETIC-package',platform:'wechat_channels',transport:'native',expected_account_label:'怎么用好AI',account_id:null,state:'queued',phase:'waiting_executor',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};f.sql.prepare('INSERT INTO app_state(key,value)VALUES(?,?)').run('publishing_preparation_work_v1:'+id,JSON.stringify(work));
 const foreign=await decode(await toolCall('claim_publishing_preparation',{work_id:id,worker:'SYNTHETIC-worker'},OTHER));assert.equal(foreign.result.isError,true);const claimed=output(await decode(await toolCall('claim_publishing_preparation',{work_id:id,worker:'SYNTHETIC-worker'})));assert.ok(claimed.claim_token);assert.equal(claimed.publish_allowed,false);assert.equal(claimed.work.owner_id,undefined);assert.equal(claimed.work.claim_hash,undefined);
 const denied=await decode(await toolCall('checkpoint_publishing_preparation',{work_id:id,claim_token:claimed.claim_token,phase:'published'}));assert.equal(denied.result.isError,true);const stored=JSON.parse(f.sql.prepare('SELECT value FROM app_state WHERE key=?').get('publishing_preparation_work_v1:'+id).value);assert.equal(stored.phase,'preparing');assert.equal(f.coreCalls.filter(c=>c.kind==='prepared-tick'||c.kind==='tick').length,0);
});

test('engagement APIs use a separate action field and never accept publication ownership or arbitrary comment sending instructions',async t=>{
 const f=fixture(t);f.realOwner();const args={publication_id:'SYNTHETIC-published-post',engagement_action:'first_comment',worker:'SYNTHETIC-worker'};const claimed=await decode(await toolCall('claim_publishing_engagement',args));assert.equal(claimed.result.isError,false);assert.deepEqual(f.coreCalls.find(c=>c.kind==='engagement-claim'),{kind:'engagement-claim',owner:OWNER,body:{...args,action:'claim_engagement'}});
 const result={publication_id:args.publication_id,engagement_action:'first_comment',claim_token:'SYNTHETIC-memory-only',state:'done',author_ui_observed:true,comment_visible:true,comment_text:'SYNTHETIC frozen comment',evidence_url:'https://www.bilibili.com/video/SYNTHETIC',evidence_note:'SYNTHETIC real-UI observation fixture only',observed_at:new Date().toISOString()};assert.equal((await api.servicePOST(serviceRequest({action:'record_engagement',...result}))).status,200);
 for(const extra of [{owner_id:OTHER},{force:true},{comment:'SYNTHETIC unreviewed override'},{now:'2099-01-01T00:00:00Z'}]){const before=f.coreCalls.length;const denied=await decode(await toolCall('record_publishing_engagement',{...result,...extra}));assert.equal(denied.result.isError,true);assert.equal(f.coreCalls.length,before);}
 assert.equal(api.publishingMcpTools.find(tool=>tool.name==='read_publishing_engagement').annotations.readOnlyHint,true);
});


test('prepared arm and current-date owner continuation are discoverable owner-bound first-class MCP actions',async t=>{
 const f=fixture(t);let r=await toolCall('arm_prepared_publishing_slot',{preparation_id:'SYNTHETIC-preparation'});assert.equal(r.status,200);assert.ok(f.coreCalls.some(c=>c.kind==='arm-prepared-slot'));
 r=await toolCall('arm_prepared_publishing_slot',{preparation_id:'SYNTHETIC-preparation',now:'2026-10-27T10:00:00Z'});assert.equal(r.status,200);assert.equal((await decode(r)).result.isError,true);
 const definition=api.publishingMcpTools.find(t=>t.name==='authorize_prepared_slot_continuation');assert.ok(definition);assert.equal(definition.inputSchema.properties.preparation_id.type,'string');assert.equal(Object.hasOwn(definition.inputSchema.properties,'scheduled_at'),false);
 const checkpoint=api.publishingMcpTools.find(t=>t.name==='checkpoint_browser_publishing_work');assert.ok(checkpoint.inputSchema.properties.phase.enum.includes('armed'));
});


test('the existing support tool exposes the same staged operation when connector discovery is cached',async t=>{
 const f=fixture(t),b={action:'arm_prepared_slot',preparation_id:'SYNTHETIC original preparation'};
 const good=await decode(await toolCall('publishing_support_request',{request_json:JSON.stringify(b)}));assert.equal(good.result.isError,false);assert.equal(f.coreCalls.filter(c=>c.kind==='arm-prepared-slot').length,1);
 for(const key of ['now','owner','force','expires_at']){const before=f.coreCalls.length;const bad=await decode(await toolCall('publishing_support_request',{request_json:JSON.stringify({...b,[key]:'SYNTHETIC forbidden'})}));assert.equal(bad.result.isError,true);assert.equal(f.coreCalls.length,before);}
});
