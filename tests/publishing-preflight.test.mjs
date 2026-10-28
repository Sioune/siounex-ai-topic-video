// Synthetic form readbacks only. These checks never open, upload or publish to a platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const buildResult=await build({entryPoints:['lib/publishing-preflight.mts'],bundle:true,write:false,platform:'node',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(buildResult.outputFiles[0].contents).toString('base64'));
const NOW='2026-10-20T00:00:30.000Z',SHA='a'.repeat(64),MATERIALS='b'.repeat(64);
function fixture(){
 const expected={platform:'douyin',account_id:'SYNTHETIC-creator',video_sha256:SHA,materials_hash:MATERIALS,title:'SYNTHETIC 已审标题',description:'SYNTHETIC 已审分平台简介。#AI工具 #实践',tags:['#AI工具','实践'],covers:[{role:'cover_3_4',archive_id:'SYNTHETIC-portrait',sha256:'c'.repeat(64)},{role:'cover_4_3',archive_id:'SYNTHETIC-landscape',sha256:'d'.repeat(64)}],options:{category:'科技',originality:'self-made',ai_disclosure:'ai-assisted',visibility:'public',publish_mode:'immediate',download:'off',sync:'off'}};
 const observed={platform:expected.platform,account_id:expected.account_id,video_sha256:SHA,materials_hash:MATERIALS,title:expected.title,description:expected.description,tags:{mode:'platform-tag-controls',selected:[{label:'AI工具',platform_tag_id:'SYNTHETIC-tag-1'},{label:'实践',platform_tag_id:'SYNTHETIC-tag-2'}],evidence_note:'SYNTHETIC visible selected platform topic chips, independent of the description text'},cover_inventory_complete:true,required_cover_slots:['portrait','landscape'],covers:expected.covers.map((c,i)=>({slot:i?'landscape':'portrait',label:i?'横版封面':'竖版封面',required:true,status:'selected',expected_ratio:i?'4:3':'3:4',source_ratio:i?'4:3':'3:4',actual_ratio:i?'4:3':'3:4',role:c.role,archive_id:c.archive_id,sha256:c.sha256,crop_confirmed:true,preview_confirmed:true,safe_area_confirmed:true,evidence_note:'SYNTHETIC real crop preview checked; complete approved title stays inside the preview safe area'})),options:Object.fromEntries(Object.entries(expected.options).map(([key,value])=>[key,{label:'SYNTHETIC visible '+key,status:'selected',value,evidence_note:'SYNTHETIC actual visible control and current selected value'}])),required_unknown_controls:[],observed_at:'2026-10-20T00:00:20.000Z',evidence_url:'https://creator.douyin.com/creator-micro/content/publish',evidence_note:'SYNTHETIC full current creator form readback; no real platform visited'};
 return {expected,observed,validate:()=>api.validatePublishingPreflight(expected,observed,NOW)};
}
async function rejects(f,path){await assert.rejects(f.validate,error=>{assert.equal(error.status,409);assert.equal(error.code,'PUBLISHING_PREFLIGHT_REJECTED');assert.ok(error.issues.some(i=>i.path.includes(path)),error.message);return true;});}

function fittedFixture(){const f=fixture(),source=f.expected.covers[1];f.expected.platform=f.observed.platform='bilibili';f.observed.evidence_url='https://member.bilibili.com/platform/upload/video';const a={schema:'publishing-cover-adaptation-v1',asset_id:'SYNTHETIC-contained-cover',package_id:'SYNTHETIC-frozen-package',platform:'bilibili',algorithm:'contain-pad-16x9@1',source:{role:source.role,site_archive_id:source.archive_id,sha256:source.sha256,size_bytes:1000,width:1448,height:1086},file:{file:'C:/SYNTHETIC/cover.png',sha256:'f'.repeat(64),size_bytes:1000,width:1920,height:1080},content_rect:{x:240,y:0,width:1440,height:1080},background:'#101827',source_pixels_retained:true,no_new_editorial_content:true,local_sha256_verified:true,visual_check_note:'SYNTHETIC complete approved title and bottom brand verified',evidence_reference:'C:/SYNTHETIC/fit.json',observed_at:'2026-10-19T10:00:00Z',storage:'owner-local-executor',server_archived_bytes:false};f.expected.cover_adaptations=[a];Object.assign(f.observed.covers[1],{archive_id:a.asset_id,sha256:a.file.sha256,source_ratio:'16:9',actual_ratio:'16:9',expected_ratio:'16:9'});return f;}
test('registered complete16:9 fit can fill a Bilibili slot without pretending the approved4:3 original had16:9dimensions',async()=>{const f=fittedFixture(),proof=await f.validate();assert.equal(proof.observation.covers[1].source_ratio,'16:9');assert.equal(proof.observation.covers[1].role,'cover_4_3');assert.equal(proof.observation.covers[1].sha256,'f'.repeat(64));assert.equal(f.expected.covers[1].sha256,'d'.repeat(64));});
test('unregistered, differently sourced, cropped or falsely described technical fits cannot bypass cover approval',async()=>{for(const change of [f=>delete f.expected.cover_adaptations,f=>f.expected.cover_adaptations[0].source.sha256='e'.repeat(64),f=>f.expected.cover_adaptations[0].content_rect.x=0,f=>f.expected.cover_adaptations[0].no_new_editorial_content=false,f=>f.observed.covers[1].source_ratio='4:3',f=>f.observed.covers[1].safe_area_confirmed=false,f=>f.observed.covers[1].sha256='e'.repeat(64)]){const f=fittedFixture();change(f);await assert.rejects(f.validate,api.PublishingPreflightError);}});

test('complete actual form evidence yields a readable, immutable proof with reproducible canonical digest',async()=>{
 const f=fixture(),before=JSON.stringify(f),proof=await f.validate();assert.equal(proof.schema,'publishing-preflight-proof-v1');assert.equal(proof.version,1);assert.equal(proof.validated_at,NOW);assert.match(proof.digest,/^[a-f0-9]{64}$/);assert.equal(proof.expected_digest,await api.publishingPreflightDigest(f.expected));assert.deepEqual(proof.observation,f.observed);assert.equal(JSON.stringify(f),before);
 const {digest,...payload}=proof;assert.equal(digest,await api.publishingPreflightDigest(payload));f.observed.title='SYNTHETIC later changed';assert.notEqual(proof.observation.title,f.observed.title);assert.equal(await api.publishingPreflightDigest({b:2,a:1}),await api.publishingPreflightDigest({a:1,b:2}));
});

test('wrong platform, account, video, material packet, title or description cannot inherit approved form proof',async()=>{
 for(const key of ['platform','account_id','video_sha256','materials_hash','title','description']){const f=fixture();f.observed[key]=key==='platform'?'bilibili':key.endsWith('sha256')||key==='materials_hash'?'e'.repeat(64):'SYNTHETIC changed';await rejects(f,'observation.'+key);}
});

test('caller mutation while WebCrypto is pending cannot change checked identities or persisted proof',async()=>{
 const f=fixture(),expectedDigest=await api.publishingPreflightDigest(f.expected),pending=f.validate();f.observed.account_id='SYNTHETIC-other-account';f.observed.options.visibility.value='private';f.expected.materials_hash='e'.repeat(64);const proof=await pending;assert.equal(proof.expected_digest,expectedDigest);assert.equal(proof.observation.account_id,'SYNTHETIC-creator');assert.equal(proof.observation.options.visibility.value,'public');
});

test('unknown or missing fields are rejected throughout expected, observation and nested controls',async()=>{
 for(const mutate of [f=>delete f.observed.description,f=>f.observed.force=true,f=>delete f.observed.options.ai_disclosure,f=>f.observed.options.visibility.checked=true,f=>delete f.observed.covers[0].safe_area_confirmed,f=>f.observed.tags.selected[0].text='spoof',f=>delete f.expected.options.sync,f=>f.expected.cookie='SYNTHETIC-never-supported']){const f=fixture();mutate(f);await assert.rejects(f.validate,api.PublishingPreflightError);}
});

test('observations must be fresh against real clock and cannot claim a future time',async()=>{
 let f=fixture();f.observed.observed_at='2026-10-19T23:58:30.000Z';await f.validate();f.observed.observed_at='2026-10-19T23:58:29.999Z';await rejects(f,'observed_at');f=fixture();f.observed.observed_at='2026-10-20T00:00:30.001Z';await rejects(f,'observed_at');f=fixture();f.observed.observed_at='2026-10-20T00:00:20';await rejects(f,'observed_at');
});

test('each platform requires its exact official HTTPS creator host and meaningful observation evidence',async()=>{
 const hosts={douyin:'creator.douyin.com',wechat_channels:'channels.weixin.qq.com',bilibili:'member.bilibili.com',kuaishou:'cp.kuaishou.com'};
 for(const [platform,host] of Object.entries(hosts)){const f=fixture();f.expected.platform=platform;f.observed.platform=platform;f.observed.evidence_url='https://'+host+'/SYNTHETIC';await f.validate();}
 for(const evidence_url of ['http://creator.douyin.com/','https://www.douyin.com/','https://creator.douyin.com.evil.invalid/','https://member.bilibili.com/','https://creator.douyin.com:444/','https://user:pass@creator.douyin.com/']){const f=fixture();f.observed.evidence_url=evidence_url;await rejects(f,'evidence_url');}const f=fixture();f.observed.evidence_note=' ';await rejects(f,'evidence_note');
});

test('description hashtags cannot substitute for actual selected platform topic controls',async()=>{
 let f=fixture();f.observed.tags={mode:'plain-text',selected:f.observed.tags.selected,evidence_note:'SYNTHETIC hashtags in body only'};await rejects(f,'tags.mode');
 for(const selected of [[],[{label:'AI工具'}],[{label:'AI工具'},{label:'wrong'}],[{label:'AI工具'},{label:'AI工具'}]]){f=fixture();f.observed.tags.selected=selected;await rejects(f,'tags.selected');}
 f=fixture();f.observed.tags.selected.reverse();await f.validate();f=fixture();f.expected.tags=[];f.observed.tags.selected=[];await f.validate();
});

test('topic matching folds only ASCII case, preserves real labels, and rejects variant duplicates or rewritten words',async()=>{
 const f=fixture();f.expected.tags=['怎么用好AI','AI智能体'];f.observed.tags.selected=[{label:'怎么用好ai'},{label:'ai智能体',platform_tag_id:'SYNTHETIC-native-ai-topic'}];const before=JSON.stringify(f.expected),proof=await f.validate();assert.equal(proof.observation.tags.selected[1].label,'ai智能体');assert.equal(f.expected.tags[1],'AI智能体');assert.equal(JSON.stringify(f.expected),before);
 for(const selected of [[{label:'怎么用好ai'},{label:'人工智能体'}],[{label:'怎么用好ai'}],[{label:'AI智能体'},{label:'ai智能体'}]]){const x=fixture();x.expected.tags=['怎么用好AI','AI智能体'];x.observed.tags.selected=selected;await rejects(x,'tags.selected');}
 const x=fixture();x.expected.tags=['ÄI智能体'];x.observed.tags.selected=[{label:'äi智能体'}];await rejects(x,'tags.selected');const account=fixture();account.observed.account_id=account.expected.account_id.toLowerCase();await rejects(account,'account_id');
});

function withCollection(f=fixture(),collection={control_present:true,target_available:true,selected_name:'怎么用好AI',evidence_note:'SYNTHETIC opened collection control and observed the exact selected existing collection'}){f.expected.collection_policy={target_name:'怎么用好AI',if_available:true};f.observed.collection=collection;return f;}

test('live collection policy binds the exact existing name and optionally its observed ID into the immutable proof',async()=>{
 for(const includeId of [false,true]){const f=withCollection();if(includeId)f.observed.collection.selected_id='SYNTHETIC-visible-collection-id';const proof=await f.validate();assert.deepEqual(proof.observation.collection,f.observed.collection);assert.equal(proof.expected_digest,await api.publishingPreflightDigest(f.expected));const pending=f.validate();f.observed.collection.selected_name='SYNTHETIC changed after validation';const checked=await pending;assert.equal(checked.observation.collection.selected_name,'怎么用好AI');}
});

test('live packets cannot omit collection observation or its control, availability, selection and evidence facts',async()=>{
 for(const field of ['collection','control_present','target_available','selected_name','evidence_note']){const f=withCollection();if(field==='collection')delete f.observed.collection;else delete f.observed.collection[field];await rejects(f,'observation.collection');}
 for(const [field,value] of [['control_present','true'],['target_available',1],['evidence_note',' '],['selected_id',' ']]){const f=withCollection();f.observed.collection[field]=value;await rejects(f,'observation.collection.'+field);}
});

test('an available exact target must be selected; empty, similar or other collection names are rejected',async()=>{
 for(const name of [null,'','另一个合集','怎么用好AI2',' 怎么用好AI','怎么用好AI ']){const f=withCollection();f.observed.collection.selected_name=name;await rejects(f,'collection.selected_name');}
});

test('a missing collection control requires explicit absence evidence and cannot conceal a selection or claim an available target',async()=>{
 const absent={control_present:false,target_available:false,selected_name:null,evidence_note:'SYNTHETIC inspected the complete expanded form and found no collection control'};await withCollection(fixture(),absent).validate();for(const change of [{target_available:true},{selected_name:'其他合集'},{selected_name:'怎么用好AI'},{selected_id:'SYNTHETIC-hidden-selection'},{evidence_note:''}]){const f=withCollection(fixture(),{...absent,...change});await rejects(f,'collection');}
});

test('an unavailable target leaves all collections unselected with search evidence and never authorizes creating or substituting one',async()=>{
 const unavailable={control_present:true,target_available:false,selected_name:null,evidence_note:'SYNTHETIC opened the existing collection picker and searched 怎么用好AI; no exact target was available, nothing selected'};await withCollection(fixture(),unavailable).validate();for(const change of [{selected_name:'相似合集'},{selected_id:'SYNTHETIC-other-collection'},{create_collection:true},{evidence_note:' '}]){const f=withCollection(fixture(),{...unavailable,...change});await rejects(f,'collection');}
 const f=withCollection(fixture(),unavailable);f.observed.required_unknown_controls=['SYNTHETIC unresolved required collection control'];await rejects(f,'required_unknown_controls');
});

test('collection checking applies independently on every live platform while legacy packets and saved proofs retain the old contract',async()=>{
 for(const [platform,host] of Object.entries({douyin:'creator.douyin.com',wechat_channels:'channels.weixin.qq.com',bilibili:'member.bilibili.com',kuaishou:'cp.kuaishou.com'})){const f=withCollection();f.expected.platform=f.observed.platform=platform;f.observed.evidence_url='https://'+host+'/SYNTHETIC';await f.validate();delete f.observed.collection;await rejects(f,'collection');}
 const legacy=fixture(),proof=await legacy.validate();assert.equal(proof.schema,'publishing-preflight-proof-v1');assert.equal(proof.version,1);assert.equal(Object.hasOwn(proof.observation,'collection'),false);assert.equal(proof.expected_digest,await api.publishingPreflightDigest(legacy.expected));const {digest,...saved}=structuredClone(proof);assert.equal(digest,await api.publishingPreflightDigest(saved));const modern=withCollection();assert.notEqual(proof.expected_digest,await api.publishingPreflightDigest(modern.expected));assert.deepEqual(proof.observation,legacy.observed,'new live policy does not mutate a historical proof');
});

test('collection policy and observation reject unknown instructions and malformed available-only semantics',async()=>{
 for(const change of [{if_available:false},{target_name:''},{create_if_missing:true}]){const f=withCollection();Object.assign(f.expected.collection_policy,change);await rejects(f,'collection_policy');}const f=withCollection();f.observed.collection.force=true;await rejects(f,'collection');
});

test('every observed required cover slot must be represented exactly once and selected',async()=>{
 let f=fixture();f.observed.cover_inventory_complete=false;await rejects(f,'cover_inventory_complete');f=fixture();f.observed.covers.pop();await rejects(f,'required_cover_slots');f=fixture();f.observed.required_cover_slots=[];await rejects(f,'required_cover_slots');f=fixture();f.observed.covers[1].slot=f.observed.covers[0].slot;await rejects(f,'covers');f=fixture();f.observed.covers[0].status='not_present';await rejects(f,'covers.0.status');f=fixture();f.observed.covers=[];await rejects(f,'covers');
});

test('cover identity cannot be changed to an unapproved archive, SHA, role or falsely declared source ratio',async()=>{
 for(const [key,value] of [['archive_id','SYNTHETIC-other-archive'],['sha256','e'.repeat(64)],['role','cover_9_16'],['source_ratio','16:9']]){const f=fixture();f.observed.covers[0][key]=value;await rejects(f,'covers.0');}
 const f=fixture();f.expected.covers.pop();await rejects(f,'expected.covers');
});

test('normal platform crop from approved 4:3 to observed 16:9 is permitted only with matching final preview and all confirmations',async()=>{
 const f=fixture();Object.assign(f.observed.covers[1],{expected_ratio:'16:9',actual_ratio:'16:9',source_ratio:'4:3'});await f.validate();
 for(const key of ['crop_confirmed','preview_confirmed','safe_area_confirmed']){const bad=fixture();Object.assign(bad.observed.covers[1],f.observed.covers[1],{[key]:false});await rejects(bad,'covers.1.'+key);}
 const bad=fixture();bad.observed.covers[1].expected_ratio='16:9';await rejects(bad,'actual_ratio');const malformed=fixture();malformed.observed.covers[1].actual_ratio='16x9';await rejects(malformed,'actual_ratio');
});

test('an absent cover control needs explicit absence evidence and cannot conceal a required slot or fabricated selection',async()=>{
 const f=fixture();f.observed.required_cover_slots=[];f.observed.covers=[{slot:'cover-controls',label:'SYNTHETIC 已检查封面区域',required:false,status:'not_present',expected_ratio:null,source_ratio:null,actual_ratio:null,role:null,archive_id:null,sha256:null,crop_confirmed:false,preview_confirmed:false,safe_area_confirmed:false,evidence_note:'SYNTHETIC full form inspection found no cover control on this actual page'}];await f.validate();f.observed.covers[0].preview_confirmed=true;await rejects(f,'preview_confirmed');
});

test('category, originality, AI, visibility, immediate timing, download and sync choices all require exact current readback',async()=>{
 for(const key of api.PUBLISHING_PREFLIGHT_OPTION_KEYS){const f=fixture();f.observed.options[key].value='SYNTHETIC-other';await rejects(f,'options.'+key);}
 for(const [key,value] of [['visibility','private'],['publish_mode','scheduled']]){const f=fixture();f.expected.options[key]=value;f.observed.options[key].value=value;await rejects(f,'expected.options.'+key);}
});

test('not-applicable options require explicit not_present evidence and are never assumed from default values',async()=>{
 const f=fixture();f.expected.options.category=null;f.observed.options.category={label:'分类',status:'not_present',value:null,evidence_note:'SYNTHETIC inspected complete form and no category control exists'};await f.validate();f.observed.options.category.status='selected';await rejects(f,'options.category');
 const bad=fixture();bad.observed.options.ai_disclosure={label:'AI声明',status:'not_present',value:null,evidence_note:'SYNTHETIC no control'};await rejects(bad,'options.ai_disclosure');
});

test('new or undecided required controls block submission instead of silently inheriting defaults',async()=>{
 const f=fixture();f.observed.required_unknown_controls=['SYNTHETIC new mandatory content-rights declaration'];await rejects(f,'required_unknown_controls');
});

test('proof verification must run again with current packet and time, and canonical hashing rejects non-JSON values',async()=>{
 const f=fixture();await f.validate();await assert.rejects(()=>api.validatePublishingPreflight(f.expected,f.observed,'2026-10-20T00:03:00Z'),/2分钟/);f.expected.materials_hash='e'.repeat(64);await rejects(f,'materials_hash');await assert.rejects(()=>api.publishingPreflightDigest({optional:undefined}));await assert.rejects(()=>api.publishingPreflightDigest({notFinite:NaN}));
});

test('policy cleanup: optional operation evidence never expires or requires a second full form',async()=>{
 const expected={platform:'douyin',account_id:'SYNTHETIC',video_sha256:'a'.repeat(64),materials_hash:'b'.repeat(64),title:'SYNTHETIC',description:'SYNTHETIC',tags:[],covers:[],options:{visibility:'public',publish_mode:'immediate'}};
 const evidence={platform:'douyin',account_id:'SYNTHETIC',video_sha256:'a'.repeat(64),observed_at:'2026-01-01T00:00:00Z',evidence_note:'SYNTHETIC actual retained draft; no new approval'};
 const proof=await api.validatePublishingPreflight(expected,evidence,'2026-10-27T10:55:00Z');
 assert.equal(proof.observation.observed_at,evidence.observed_at);
 await assert.rejects(()=>api.validatePublishingPreflight(expected,{...evidence,account_id:'SYNTHETIC wrong'}),/account/);
});
