// Isolated synthetic React UI only. All HTTP is intercepted; no owner API,
// production opinion, media upload or quality approval is sent by these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React,{act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=createRequire(process.env.TOPIC_TEST_PACKAGE||new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://synthetic.test/production',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLDetailsElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Element','Node','Event','MouseEvent','KeyboardEvent','HashChangeEvent','MutationObserver','DocumentFragment','CustomEvent','history'])globalThis[key]=dom.window[key];
for(const key of ['requestAnimationFrame','cancelAnimationFrame','getComputedStyle'])globalThis[key]=dom.window[key].bind(dom.window);
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HTMLElement.prototype.scrollIntoView=function(){};
const {createRoot}=await import('react-dom/client');
const built=await build({stdin:{contents:"export {SiteArchiveFiles,NativeSiteMilestone,visibleSiteArchives,currentSiteVideoMilestone,siteMaterialReviewStatus} from './components/site-archive-files';export {default as NativeHandoff} from './components/native-handoff';export {default as ProductionDesk,pendingArchivedCandidateReviewStatus,postVideoMaterialReviewStatus} from './components/production-desk';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false});
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
const {SiteArchiveFiles,NativeSiteMilestone,visibleSiteArchives,currentSiteVideoMilestone,siteMaterialReviewStatus,NativeHandoff,ProductionDesk,pendingArchivedCandidateReviewStatus,postVideoMaterialReviewStatus}=module.exports;
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(formal=false){
 const binding={revision:3,script_hash:'d9d74b6682cc75f06575925b1b946038fb72ac37dd21225f61b55ba2c023de4a',mode_epoch:0,contract_hash:'65e245fe5e4d5babb9e881ad45b286f22255a5ed6a49c501f998ec1bf740ac61',candidate_id:'native_video_'+'c'.repeat(64),candidate_sha256:'d'.repeat(64),project_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',timeline_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'};
 const scope={id:'media_scope_SYNTHETIC',scope:'private-video',binding:Object.fromEntries(Object.entries(binding).slice(0,4)),new_paid_authorization:false,publication_authorization:false,quality_approved:false};
 const file={role:'video',sha256:binding.candidate_sha256,size_bytes:18465682,file_name:'SYNTHETIC owner full review.mp4',mime_type:'video/mp4'};
 const archive={schema:'site-private-file-archive-v1',site_archive_id:'sitefile_'+'e'.repeat(64),storage:'site-private-r2',binding:copy(binding),owner_review_id:null,pending_candidate_id:binding.candidate_id,voice_provenance_id:'candidate_voice_'+'7'.repeat(64),quality_review:'awaiting-human',scope_id:scope.id,scope_hash:'f'.repeat(64),file,status:'confirmed',part_size:524288,part_count:Math.ceil(file.size_bytes/524288),created_at:'2026-10-18T00:00:00Z',confirmed_at:'2026-10-18T00:01:00Z',materialized_sha256:file.sha256,manifest_sha256:'f'.repeat(64),quality_approved:false,publication_authorized:false,new_paid_calls:0};
 const candidate={schema:'native-video-candidate-v1',script_hash:binding.script_hash,sha256:file.sha256,file_name:file.file_name,size_bytes:file.size_bytes,duration:55.018667,project_id:binding.project_id,timeline_id:binding.timeline_id,local_file_verified:true,quality_approved:false,publication:false};
 const milestone={id:'SYNTHETIC-current-video',node:'video',revision:3,mode_epoch:0,artifact_version:1,artifact_hash:'9'.repeat(64),status:'awaiting_human',artifact:JSON.stringify({sha256:file.sha256,qa:{native_handoff:true,native_candidate_id:binding.candidate_id,pending_candidate_id:binding.candidate_id,site_archive_id:archive.site_archive_id,project_id:binding.project_id,timeline_id:binding.timeline_id,voice_kind:'owner-cloned',voice_provenance_id:archive.voice_provenance_id}}),report:null,review_until:null};
 const job={id:'job_c3adf563-321c-4bac-b807-b1e749681c82',topic_id:'SYNTHETIC',is_test:0,status:'approved',review_mode:'node',revision:3,approved_revision:3,approved_hash:binding.script_hash,mode_epoch:0,contract_hash:binding.contract_hash,reworks:0,ai_calls:0,source_snapshot:JSON.stringify({title:'SYNTHETIC Roadster',url:'https://example.org/synthetic'}),skill_snapshot:'{}',checkpoint:'{}',lease_until:null,updated_at:'2026-10-18T00:01:00Z',operations:[],stages:[],drafts:[],publication_reports:[],reviews:[{id:binding.candidate_id,revision:3,content_hash:file.sha256,decision:'native_video_candidate',note:JSON.stringify(candidate)}],milestones:formal?[milestone]:[],media_continuation:{current_id:scope.id,scope,licenses:[]},facts:{candidate_present:true,candidate_record_id:binding.candidate_id,candidate_video_sha256:file.sha256,files_archived:true,complete_package_archived:false,video_approval:'not-recorded',script_approved:true,material_problems:[],summary:'SYNTHETIC 已有完整候选，等待独立审片',site_file_archives:[archive]}};
 const packet={status:formal?'awaiting_human':'awaiting_candidate_review',label:'SYNTHETIC 当前成片等待本人审核',binding:{revision:3,base_artifact_version:formal?1:0},blockers:[],packet_hash:'8'.repeat(64),capabilities:{claimed:false,native_editor_connected:false},candidate:{record_id:binding.candidate_id,sha256:file.sha256,file_name:file.file_name,duration:candidate.duration,project_id:binding.project_id,timeline_id:binding.timeline_id,voice_kind:'owner-cloned',archive_status:'archived'}};
 return{job,archive,candidate,binding,milestone,packet};
}
const render=(Component,props)=>new JSDOM(renderToStaticMarkup(React.createElement(Component,props))).window.document;

const FIRST_REVIEW_UI_CASES=[
 {id:'job_b7dcd6bf-682d-429f-9016-7c9f3df41c16',script:'8580f6bbad4bdca0c07af05915e61ed734b3fd6c8d492e5c9a21ef92937594fa',contract:'670a348cda9d5941d4a7ac66ba00f1c0ce6388cb0d80fc6bdd595da7315bba6f'},
 {id:'job_38fd8bfd-2949-4d26-8b67-d07a03e6f0b0',script:'c1eb8ebb836302272fabc9b31f9db756ec076f2387bdb0b2ca13fbcf3a8ec5ab',contract:'9d2868f931b066b12f8d7d0a7cabdd9306a76c39ba3e3d86ab3b03db25dbdc27'},
 {id:'job_ed3c8123-59ed-4948-9d99-fdb7067ee522',script:'18050f4876ebf14998b69e2b9e183ab4b1332d6f0d4fae6e8030f27ee7e694d3',contract:'e8bc99b09a4df6745474336f3c5ab195d014f275ceabffd7158f29bb945059fd'},
];
function firstReviewFixture(target,formal=false){
 const f=fixture(formal);f.job.id=target.id;f.job.revision=1;f.job.approved_revision=1;f.job.approved_hash=target.script;f.job.contract_hash=target.contract;
 Object.assign(f.binding,{revision:1,script_hash:target.script,contract_hash:target.contract});f.archive.binding=copy(f.binding);
 f.job.media_continuation.scope.binding={revision:1,script_hash:target.script,mode_epoch:0,contract_hash:target.contract};
 f.candidate.script_hash=target.script;f.job.reviews[0].revision=1;f.job.reviews[0].note=JSON.stringify(f.candidate);f.milestone.revision=1;f.packet.binding.revision=1;
 return f;
}
for(const target of FIRST_REVIEW_UI_CASES)for(const formal of [false,true])test('SYNTHETIC authorized v1 first-review UI '+target.id+' formal='+formal,()=>{
 const f=firstReviewFixture(target,formal),before=copy(f.job),d=render(SiteArchiveFiles,{job:f.job});
 assert.equal(visibleSiteArchives(f.job).length,1);assert.equal(d.querySelector('video')?.getAttribute('src'),'/api/site-archive?id='+target.id+'&archive='+f.archive.site_archive_id);
 assert.match(d.body.textContent,/完整候选已保存，等待本人审片/);assert.doesNotMatch(d.body.textContent,/已通过本人审核|交付已完成/);assert.deepEqual(f.job,before);
 if(formal){const node=render(NativeSiteMilestone,{job:f.job,milestone:f.milestone});assert.ok(node.querySelector('video'));assert.match(node.body.textContent,/本人声音版已回站.*待本人审片/);assert.equal(pendingArchivedCandidateReviewStatus(f.job),'成片待本人审核');}
});
for(const target of FIRST_REVIEW_UI_CASES)for(const [label,change] of [
 ['node mode',f=>f.job.review_mode='auto'],['revision',f=>f.job.revision=2],['script',f=>f.job.approved_hash='a'.repeat(64)],['contract',f=>f.job.contract_hash='a'.repeat(64)],['epoch',f=>f.job.mode_epoch=1],
 ['test',f=>f.job.is_test=1],['scope permission',f=>f.job.media_continuation.scope.new_paid_authorization=true],['scope binding',f=>f.job.media_continuation.scope.binding.contract_hash='a'.repeat(64)],
 ['typed voice',f=>f.archive.voice_provenance_id='plain-text-voice'],['fake quality approval',f=>f.archive.quality_approved=true],['fake owner review',f=>f.archive.owner_review_id='SYNTHETIC-forged-review'],
])test('SYNTHETIC authorized v1 review UI hides stale '+label+' '+target.id,()=>{
 const f=firstReviewFixture(target,true);change(f);assert.deepEqual(visibleSiteArchives(f.job),[]);assert.equal(render(SiteArchiveFiles,{job:f.job}).querySelector('video,a'),null);
});
test('SYNTHETIC v1 owner review button keeps the displayed node binding and never auto-approves intake',async t=>{
 const f=firstReviewFixture(FIRST_REVIEW_UI_CASES[1],true),before=copy(f.job),calls=await mount(t,f,ProductionDesk);
 assert.equal(calls.some(c=>c.options.method==='POST'),false);const button=[...document.querySelector('#video-review').querySelectorAll('button')].find(el=>el.textContent==='通过此节点');assert.ok(button);
 await act(async()=>button.click());await settle();const writes=calls.filter(c=>c.options.method==='POST');assert.equal(writes.length,1);
 assert.deepEqual(JSON.parse(writes[0].options.body),{action:'milestone_review',id:f.job.id,milestone_id:f.milestone.id,revision:1,artifact_hash:f.milestone.artifact_hash,mode_epoch:0,decision:'approve',note:''});assert.deepEqual(f.job,before);
});

test('first pending candidate plays privately before any quality approval or formal node',()=>{
 const f=fixture(),before=copy(f.job);assert.equal(visibleSiteArchives(f.job).length,1);
 const d=render(SiteArchiveFiles,{job:f.job}),video=d.querySelector('video');assert.ok(video);assert.equal(video.controls,true);assert.equal(video.playsInline,true);assert.equal(video.preload,'metadata');assert.equal(video.getAttribute('src'),'/api/site-archive?id='+f.job.id+'&archive='+f.archive.site_archive_id);
 assert.match(d.body.textContent,/完整候选已保存，等待本人审片/);assert.equal(d.querySelector('button'),null);assert.doesNotMatch(d.body.textContent,/已通过本人审核|交付已完成|Library 版本/);assert.deepEqual(f.job,before);
});
test('matching first formal node keeps the candidate player and actual owner voice label',()=>{
 const f=fixture(true),d=render(NativeSiteMilestone,{job:f.job,milestone:f.milestone});assert.equal(visibleSiteArchives(f.job).length,1);assert.match(d.body.textContent,/本人声音版已回站.*待本人审片/);assert.match(d.querySelector('video').getAttribute('aria-label'),/本人声音版/);assert.doesNotMatch(d.body.textContent,/当前正式视频节点已通过本人审核/);assert.equal(d.querySelector('a[href="#video-review"]')?.textContent,'前往视频里程碑审核 →');
});
for(const[name,change]of[
 ['current candidate ID',f=>f.job.facts.candidate_record_id='native_video_'+'1'.repeat(64)],
 ['candidate script',f=>{f.candidate.script_hash='1'.repeat(64);f.job.reviews[0].note=JSON.stringify(f.candidate)}],
 ['candidate not verified',f=>{f.candidate.local_file_verified=false;f.job.reviews[0].note=JSON.stringify(f.candidate)}],
 ['null candidate record',f=>f.job.reviews[0].note='null'],
 ['scope',f=>f.job.media_continuation.scope.id+='-old'],
 ['scope permission',f=>f.job.media_continuation.scope.publication_authorization=true],
 ['scope binding',f=>f.job.media_continuation.scope.binding.mode_epoch=1],
 ['archive candidate',f=>f.archive.pending_candidate_id='native_video_'+'1'.repeat(64)],
 ['archive candidate SHA',f=>f.archive.binding.candidate_sha256='1'.repeat(64)],
 ['archive project',f=>f.archive.binding.project_id='cccccccc-cccc-cccc-cccc-cccccccccccc'],
 ['archive timeline',f=>f.archive.binding.timeline_id='cccccccc-cccc-cccc-cccc-cccccccccccc'],
 ['archive bytes',f=>f.archive.file.size_bytes--],
 ['archive filename',f=>f.archive.file.file_name='SYNTHETIC other.mp4'],
 ['archive not materialized',f=>f.archive.materialized_sha256='1'.repeat(64)],
 ['archive missing manifest',f=>delete f.archive.manifest_sha256],
 ['archive not confirmed',f=>f.archive.status='sealed'],
 ['missing archive voice source',f=>delete f.archive.voice_provenance_id],
 ['invented owner approval',f=>f.archive.owner_review_id='SYNTHETIC-invented'],
 ['formal candidate',f=>{const v=JSON.parse(f.milestone.artifact);v.qa.native_candidate_id='old';f.milestone.artifact=JSON.stringify(v)}],
 ['formal archive',f=>{const v=JSON.parse(f.milestone.artifact);v.qa.site_archive_id='old';f.milestone.artifact=JSON.stringify(v)}],
 ['formal timeline',f=>{const v=JSON.parse(f.milestone.artifact);v.qa.timeline_id='old';f.milestone.artifact=JSON.stringify(v)}],
 ['formal voice kind',f=>{const v=JSON.parse(f.milestone.artifact);v.qa.voice_kind='ordinary-temporary';f.milestone.artifact=JSON.stringify(v)}],
 ['formal voice source',f=>{const v=JSON.parse(f.milestone.artifact);v.qa.voice_provenance_id='candidate_voice_'+'1'.repeat(64);f.milestone.artifact=JSON.stringify(v)}],
 ['formal invalidated',f=>f.milestone.status='invalidated'],
 ['test task',f=>f.job.is_test=1],
 ['unrelated task',f=>f.job.id='SYNTHETIC-other-task'],
])test('mismatched pending candidate remains hidden: '+name,()=>{const f=fixture(true);change(f);assert.deepEqual(visibleSiteArchives(f.job),[]);assert.equal(render(SiteArchiveFiles,{job:f.job}).querySelector('video,a'),null);});
for(const status of ['approved','revise'])test('actual formal '+status+' changes review wording without changing immutable file intake',()=>{const f=fixture(true);f.milestone.status=status;const d=render(SiteArchiveFiles,{job:f.job});assert.ok(d.querySelector('video'));assert.match(d.body.textContent,status==='approved'?/本版成片节点已通过本人审核/:/本版成片已打回/);assert.equal(f.archive.owner_review_id,null);assert.equal(f.archive.quality_review,'awaiting-human');});

const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
// The HTTP list is now an explicit small read model. Review behavior below
// continues to use only the separately supplied full detail fixture.
function summaryRow(j){return{kind:'production-job-summary-v1',id:j.id,topic_id:j.topic_id,title:JSON.parse(j.source_snapshot).title,is_test:j.is_test,status:j.status,revision:j.revision,mode_epoch:j.mode_epoch,review_mode:j.review_mode,updated_at:j.updated_at,status_label:postVideoMaterialReviewStatus(j)||pendingArchivedCandidateReviewStatus(j)||j.facts?.summary||j.status,current_candidate:null,current_node:null,execution_condition:j.status};}
async function mount(t,f,Component){
 document.body.innerHTML='<div id="root"></div>';history.replaceState(null,'','/production?job='+f.job.id);const originalFetch=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{assert.ok(typeof url==='string'&&url.startsWith('/api/'));calls.push({url,options});if(options.method==='POST'){assert.equal(url,'/api/production');return Response.json({job:f.job});}if(url.startsWith('/api/site-archive?')&&f.promotionReply)return f.promotionReply(url,options);if(url.includes('view=native_packet'))return Response.json({packet:f.packet});if(url==='/api/production')return Response.json({jobs:[summaryRow(f.job)]});if(url.startsWith('/api/production?'))return Response.json({job:f.job});return Response.json({error:'SYNTHETIC optional endpoint unavailable'},{status:503});};
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=originalFetch;});await act(async()=>root.render(React.createElement(Component,Component===ProductionDesk?{}:{job:f.job})));await settle();await settle();if(Component===ProductionDesk){const media=[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='素材与制作');await act(async()=>{media.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));media.click();});await settle();}return calls;
}
test('handoff shows validated packet voice and the real node link with no automatic write',async t=>{const f=fixture(true),before=copy(f.job),calls=await mount(t,f,NativeHandoff);assert.equal(document.querySelector('[data-native-candidate-voice]').textContent,'声音：本人声音版');assert.ok(document.querySelector('a[href="#video-review"]'));assert.ok(document.querySelector('video'));assert.equal(calls.some(c=>c.options.method==='POST'),false);assert.deepEqual(f.job,before);});
test('actual owner button uses existing formal node binding; intercepted synthetic UI never submits candidate oral feedback',async t=>{
 const f=fixture(true),before=copy(f.job),calls=await mount(t,f,ProductionDesk);assert.equal(calls.some(c=>c.options.method==='POST'),false);
 const node=document.querySelector('#video-review'),button=[...node.querySelectorAll('button')].find(el=>el.textContent==='通过此节点');assert.ok(button);await act(async()=>button.click());await settle();
 const writes=calls.filter(c=>c.options.method==='POST');assert.equal(writes.length,1);assert.deepEqual(JSON.parse(writes[0].options.body),{action:'milestone_review',id:f.job.id,milestone_id:f.milestone.id,revision:3,artifact_hash:f.milestone.artifact_hash,mode_epoch:0,decision:'approve',note:''});assert.equal(writes.some(c=>JSON.parse(c.options.body).action==='native_candidate_feedback'),false);assert.deepEqual(f.job,before);
});
test('formal rework requires an explicit reason and sends it only for the displayed node',async t=>{
 const f=fixture(true),calls=await mount(t,f,ProductionDesk),node=document.querySelector('#video-review'),button=[...node.querySelectorAll('button')].find(el=>el.textContent==='打回返工');
 await act(async()=>button.click());assert.equal(calls.some(c=>c.options.method==='POST'),false);assert.match(node.textContent,/请填写需要返工的具体修改意见/);
 const input=node.querySelector('textarea'),reason='SYNTHETIC 开头字幕过快，请延长显示。';
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,reason);input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>button.click());await settle();
 const writes=calls.filter(c=>c.options.method==='POST');assert.equal(writes.length,1);assert.deepEqual(JSON.parse(writes[0].options.body),{action:'milestone_review',id:f.job.id,milestone_id:f.milestone.id,revision:3,artifact_hash:f.milestone.artifact_hash,mode_epoch:0,decision:'revise',note:reason});
});
test('real current pending archived node overrides historical preparation in header and selected slim sidebar',async t=>{
 const f=fixture(true),scope=f.job.media_continuation.scope;
 f.job.stages=[{stage:'media_inputs',status:'blocked',review_revision:3,review_hash:f.job.approved_hash,result:JSON.stringify({schema:'media-input-probe-v1',scope_id:scope.id,binding:scope.binding,receipt:{schema:'media-input-probe-receipt-v1',status:'blocked',checks:[{passed:false,detail:'SYNTHETIC old preparation needs voice'}]}})}];
 f.listJob=Object.fromEntries(Object.entries(f.job).filter(([key])=>!['facts','milestones','reviews','media_continuation','stages'].includes(key)));
 const before=copy(f.job),calls=await mount(t,f,ProductionDesk),header=document.querySelector('.production-current'),selectedRow=document.querySelector('.production-task-items button[aria-current="true"]');
 assert.equal(header.querySelector('.production-status').textContent,'成片待本人审核');assert.equal(selectedRow.querySelector('span').textContent,'成片待本人审核');assert.match(header.textContent,/完整成片已归档并回传当前审核节点/);assert.doesNotMatch(header.textContent,/准备检查待补充|old preparation needs voice|口播稿已批准/);assert.equal(header.querySelector('.production-current-task').getAttribute('href'),'#video-review');
 const connection=[...document.querySelectorAll('section.milestone-card')].find(section=>section.querySelector('h3')?.textContent==='执行器连接');assert.ok(connection);assert.doesNotMatch(connection.textContent,/old preparation needs voice/);
 assert.equal(calls.some(c=>c.options.method==='POST'),false);assert.deepEqual(f.job,before);assert.equal(Object.hasOwn(f.listJob,'facts'),false);
});
test('pending archived status is a review label and cannot infer quality approval',()=>{const f=fixture(true),before=copy(f.job);assert.equal(pendingArchivedCandidateReviewStatus(f.job),'成片待本人审核');assert.deepEqual(f.job,before);assert.equal(f.job.facts.video_approval,'not-recorded');assert.equal(f.milestone.status,'awaiting_human');assert.equal(f.archive.quality_approved,false);});
for(const[name,change]of[
 ['no formal video node',f=>f.job.milestones=[]],
 ['old video revision',f=>f.milestone.revision--],
 ['old video epoch',f=>f.milestone.mode_epoch++],
 ['missing archive',f=>f.job.facts.site_file_archives=[]],
 ['unconfirmed archive',f=>f.archive.status='sealed'],
 ['different candidate',f=>f.job.facts.candidate_record_id='native_video_'+'1'.repeat(64)],
 ['changed scope',f=>f.job.media_continuation.scope.id+='-changed'],
 ['unverified archive fact',f=>f.job.facts.files_archived=false],
 ['approved node',f=>f.milestone.status='approved'],
 ['rejected node',f=>f.milestone.status='revise'],
 ['other job',f=>f.job.id='SYNTHETIC-other'],
])test('pending archive review status does not replace other states: '+name,()=>{const f=fixture(true);change(f);assert.equal(pendingArchivedCandidateReviewStatus(f.job),null);});

function postVideoFixture(){
 const f=fixture(true);f.milestone.id='native_draft_'+'1'.repeat(64);f.milestone.status='approved';f.packet.status='native_done';f.packet.label='本版成片已通过本人审核，可继续封面与宣发交付';
 const approve=(milestone,id)=>{milestone.status='approved';milestone.report=JSON.stringify({decision:'approve',actor:'SYNTHETIC-owner',revision:3,artifact_hash:milestone.artifact_hash,mode_epoch:0,operation_id:id});const r={id,revision:3,content_hash:milestone.artifact_hash,decision:'approve',note:milestone.report,created_at:'2026-10-18T00:02:00Z'};f.job.reviews.push(r);return r;};
 const approval=approve(f.milestone,'SYNTHETIC-video-owner-approval');
 const promotionText='SYNTHETIC 宣发正文\n<script>plain text only</script>\n未经外发。';
 const material=(role,n)=>{const a=copy(f.archive);delete a.pending_candidate_id;if(role==='complete_bundle')delete a.quality_review;a.post_video_delivery_id=f.milestone.id;a.owner_review_id=approval.id;a.site_archive_id='sitefile_'+String(n).repeat(64);a.file={role,sha256:role==='promotion'?createHash('sha256').update(promotionText).digest('hex'):String(n).repeat(64),size_bytes:role==='promotion'?Buffer.byteLength(promotionText):1000,file_name:'SYNTHETIC '+role+(role.startsWith('cover_')?'.png':role==='promotion'?'.md':'.zip'),mime_type:role.startsWith('cover_')?'image/png':role==='promotion'?'text/plain':'application/zip',...(role==='cover_3_4'?{width:1536,height:2048}:role==='cover_4_3'?{width:2048,height:1536}:{})};a.materialized_sha256=a.file.sha256;a.part_count=Math.ceil(a.file.size_bytes/a.part_size);return a;};
 const cover3=material('cover_3_4',2),cover4=material('cover_4_3',3),promotion=material('promotion',4);
 f.job.facts.site_file_archives.push(cover3,cover4,promotion);
 const cover={id:'SYNTHETIC-cover-node',node:'cover',revision:3,mode_epoch:0,artifact_version:1,artifact_hash:'6'.repeat(64),status:'awaiting_human',artifact:JSON.stringify({url:'https://example.org/SYNTHETIC-contact-sheet.png',sha256:'5'.repeat(64),provider_job_id:'SYNTHETIC-image-gen',cost:0,qa:{post_video_delivery_id:f.milestone.id,site_archive_ids:{cover_3_4:cover3.site_archive_id,cover_4_3:cover4.site_archive_id}}}),report:null,review_until:null};
 f.job.milestones.push(cover);
 const promotionMilestone=()=>({id:'SYNTHETIC-promotion-node',node:'promotion',revision:3,mode_epoch:0,artifact_version:1,artifact_hash:'7'.repeat(64),status:'awaiting_human',artifact:JSON.stringify({text:promotionText,limits:JSON.stringify({schema:'site-promotion-file-v1',site_archive_id:promotion.site_archive_id,sha256:promotion.file.sha256})}),report:null,review_until:null});
 return {...f,approval,approve,material,cover3,cover4,promotion,promotionText,cover,promotionMilestone};
}
test('post-video materials merge with approved video and display separate real cover/promotion review states',()=>{
 const f=postVideoFixture(),before=copy(f.job),files=visibleSiteArchives(f.job);assert.deepEqual(files.map(a=>a.file.role),['video','cover_3_4','cover_4_3','promotion']);assert.equal(currentSiteVideoMilestone(f.job).id,f.milestone.id);assert.equal(currentSiteVideoMilestone(f.job).status,'approved');
 assert.equal(siteMaterialReviewStatus(f.job,f.cover3),'awaiting_human');assert.equal(siteMaterialReviewStatus(f.job,f.cover4),'awaiting_human');assert.equal(siteMaterialReviewStatus(f.job,f.promotion),null);assert.equal(postVideoMaterialReviewStatus(f.job),'封面待本人审核');
 const d=render(SiteArchiveFiles,{job:f.job});assert.equal(d.querySelectorAll('img').length,2);assert.ok(d.querySelector('video'));assert.match(d.body.textContent,/本版成片节点已通过本人审核/);assert.match(d.body.textContent,/封面质量待单独审核/);assert.match(d.body.textContent,/宣发文案待单独审核/);assert.ok(d.querySelector('[data-site-promotion-preview]'));assert.doesNotMatch(d.body.textContent,/本文件已通过本人封面节点|本文件已通过本人宣发节点|交付已完成/);for(const a of d.querySelectorAll('a[href^="/api/site-archive"]'))assert.ok(a.getAttribute('href').startsWith('/api/site-archive?id='+f.job.id+'&archive=sitefile_'));assert.deepEqual(f.job,before);
});
for(const[name,change]of[
 ['different video node',f=>f.cover3.post_video_delivery_id='SYNTHETIC-old-video'],
 ['different candidate',f=>f.cover3.binding.candidate_id='native_video_'+'1'.repeat(64)],
 ['different bytes binding',f=>f.cover3.binding.candidate_sha256='1'.repeat(64)],
 ['different scope',f=>f.cover3.scope_id='SYNTHETIC-old-scope'],
 ['unconfirmed material',f=>f.cover3.status='sealed'],
 ['wrong material bytes',f=>f.cover3.materialized_sha256='1'.repeat(64)],
 ['missing actual video owner audit',f=>f.cover3.owner_review_id='SYNTHETIC-fake-approval'],
 ['wrong video audit hash',f=>f.job.reviews.find(r=>r.id===f.approval.id).content_hash='1'.repeat(64)],
])test('stale post-video material is hidden while the immutable approved video remains: '+name,()=>{const f=postVideoFixture();change(f);const files=visibleSiteArchives(f.job);assert.equal(files.some(a=>a.site_archive_id===f.cover3.site_archive_id),false);assert.equal(files.some(a=>a.site_archive_id===f.archive.site_archive_id),true);assert.equal(currentSiteVideoMilestone(f.job).status,'approved');});
test('cover file approval requires this pair of archive IDs and this approved video, not file confirmation',()=>{
 const f=postVideoFixture();f.cover.status='approved';assert.equal(siteMaterialReviewStatus(f.job,f.cover3),'approved');const changed=JSON.parse(f.cover.artifact);changed.qa.site_archive_ids.cover_3_4='sitefile_'+'1'.repeat(64);f.cover.artifact=JSON.stringify(changed);assert.equal(siteMaterialReviewStatus(f.job,f.cover3),null);assert.equal(siteMaterialReviewStatus(f.job,f.cover4),'approved');changed.qa.post_video_delivery_id='SYNTHETIC-old-video';f.cover.artifact=JSON.stringify(changed);assert.equal(siteMaterialReviewStatus(f.job,f.cover4),null);
});
test('after real cover approval the actual promotion node becomes current without changing video approval',()=>{
 const f=postVideoFixture();f.approve(f.cover,'SYNTHETIC-cover-owner-approval');const promotion=f.promotionMilestone();f.job.milestones.push(promotion);assert.equal(siteMaterialReviewStatus(f.job,f.promotion),'awaiting_human');assert.equal(postVideoMaterialReviewStatus(f.job),'宣发待本人审核');assert.equal(currentSiteVideoMilestone(f.job).status,'approved');assert.equal(f.promotion.quality_approved,false);
});
test('complete bundle remains hidden until both exact current cover and promotion owner audits exist',()=>{
 const f=postVideoFixture(),bundle=f.material('complete_bundle',8),promotion=f.promotionMilestone();f.job.milestones.push(promotion);bundle.post_video_material_reviews={cover:'SYNTHETIC-cover-owner-approval',promotion:'SYNTHETIC-promotion-owner-approval'};f.job.facts.site_file_archives.push(bundle);
 assert.equal(visibleSiteArchives(f.job).some(a=>a.file.role==='complete_bundle'),false);f.approve(f.cover,bundle.post_video_material_reviews.cover);assert.equal(visibleSiteArchives(f.job).some(a=>a.file.role==='complete_bundle'),false);f.approve(promotion,bundle.post_video_material_reviews.promotion);assert.equal(visibleSiteArchives(f.job).some(a=>a.file.role==='complete_bundle'),true);bundle.post_video_material_reviews.promotion='SYNTHETIC-old-approval';assert.equal(visibleSiteArchives(f.job).some(a=>a.file.role==='complete_bundle'),false);
});
test('post-video header/sidebar use the actual cover node and keep old preparation out of current status',async t=>{
 const f=postVideoFixture();f.listJob=Object.fromEntries(Object.entries(f.job).filter(([key])=>!['facts','milestones','reviews','media_continuation','stages'].includes(key)));const before=copy(f.job),calls=await mount(t,f,ProductionDesk);
 assert.equal(document.querySelector('.production-status').textContent,'封面待本人审核');assert.equal(document.querySelector('.production-task-items button[aria-current="true"] span').textContent,'封面待本人审核');assert.equal(document.querySelector('.production-current-task').getAttribute('href'),'#cover-review');assert.doesNotMatch(document.querySelector('.production-current').textContent,/口播稿已批准|准备检查待补充/);assert.match(document.querySelector('#voice-replacement').textContent,/保留本版稿件、当前归档画面和原4秒片尾/);assert.doesNotMatch(document.querySelector('#voice-replacement').textContent,/龙|森林/);assert.equal(calls.some(c=>c.options.method==='POST'),false);assert.deepEqual(f.job,before);
});
test('approved video handoff asks for separate materials review without repeating a video approval request',async t=>{const f=postVideoFixture(),calls=await mount(t,f,NativeHandoff),section=document.querySelector('[aria-label="原生视频制作交接"]');assert.match(section.textContent,/本版成片已通过当前正式视频节点/);assert.doesNotMatch(section.textContent,/当前仍按节点状态等待本人审片|前往成片审核：通过或填写修改意见/);assert.match(section.textContent,/查看已通过的成片审核记录/);assert.equal(calls.some(c=>c.options.method==='POST'),false);});
test('only the actual cover review click sends its exact existing formal node binding',async t=>{
 const f=postVideoFixture(),calls=await mount(t,f,ProductionDesk),button=[...document.querySelectorAll('#cover-review button')].find(el=>el.textContent==='通过此节点');assert.equal(calls.some(c=>c.options.method==='POST'),false);await act(async()=>button.click());await settle();const writes=calls.filter(c=>c.options.method==='POST');assert.equal(writes.length,1);assert.deepEqual(JSON.parse(writes[0].options.body),{action:'milestone_review',id:f.job.id,milestone_id:f.cover.id,revision:3,artifact_hash:f.cover.artifact_hash,mode_epoch:0,decision:'approve',note:''});assert.equal(f.milestone.status,'approved');assert.equal(f.cover.status,'awaiting_human');
});
test('promotion plaintext preview reads only its fixed private archive on demand and escapes markup',async t=>{
 const f=postVideoFixture();f.promotionReply=()=>new Response(f.promotionText,{headers:{'Content-Type':'text/plain; charset=utf-8','X-Asset-SHA256':f.promotion.file.sha256}});const calls=await mount(t,f,SiteArchiveFiles);assert.equal(calls.length,0);const preview=document.querySelector('[data-site-promotion-preview]');await act(async()=>{preview.open=true;preview.dispatchEvent(new Event('toggle',{bubbles:true}));});await settle();await settle();
 assert.equal(document.querySelector('[aria-label="本站宣发全文"]').textContent,f.promotionText);assert.equal(preview.querySelector('script'),null);assert.equal(calls.filter(c=>c.url.startsWith('/api/site-archive?')).length,1);assert.equal(calls[0].url,'/api/site-archive?id='+f.job.id+'&archive='+f.promotion.site_archive_id);assert.equal(calls.some(c=>c.options.method==='POST'),false);
});
test('a mismatched promotion download is never displayed as the current text',async t=>{
 const f=postVideoFixture();f.promotionReply=()=>new Response('SYNTHETIC replaced bytes',{headers:{'Content-Type':'text/plain','X-Asset-SHA256':f.promotion.file.sha256}});await mount(t,f,SiteArchiveFiles);const preview=document.querySelector('[data-site-promotion-preview]');await act(async()=>{preview.open=true;preview.dispatchEvent(new Event('toggle',{bubbles:true}));});await settle();await settle();assert.equal(document.querySelector('[aria-label="本站宣发全文"]'),null);assert.match(preview.textContent,/字节不匹配|校验未通过/);
});

function finalPostVideoFixture(state='completed'){
 const f=postVideoFixture(),coverReview=f.approve(f.cover,'SYNTHETIC-cover-final-approval'),promotion=f.promotionMilestone();f.job.milestones.push(promotion);const promotionReview=f.approve(promotion,'SYNTHETIC-promotion-final-approval');
 const bundle=f.material('complete_bundle',8);bundle.post_video_material_reviews={cover:coverReview.id,promotion:promotionReview.id};f.job.facts.site_file_archives.push(bundle);Object.assign(f.job.facts,{video_approval:'owner-node-approved',files_archived:true,complete_package_archived:true});
 const tuple=a=>({site_archive_id:a.site_archive_id,sha256:a.file.sha256,size_bytes:a.file.size_bytes}),approval=(m,r)=>({milestone_id:m.id,artifact_hash:m.artifact_hash,review_id:r.id,reviewed_at:r.created_at});
 const limits={schema:'site-private-delivery-v1',complete_bundle:tuple(bundle),archives:Object.fromEntries(['video','cover_3_4','cover_4_3','promotion'].map(role=>[role,tuple(f.job.facts.site_file_archives.find(a=>a.file.role===role))])),approvals:{video:approval(f.milestone,f.approval),cover:approval(f.cover,coverReview),promotion:approval(promotion,promotionReview)},project_id:f.binding.project_id,timeline_id:f.binding.timeline_id,secondary_download_verified:true,external_publication:false,new_paid_calls:0};
 const artifact=JSON.stringify({text:'SYNTHETIC 完整交付与精确下载清单；未外发。',limits:JSON.stringify(limits)}),delivery={id:'artifact_'+'9'.repeat(64),node:'delivery',revision:3,mode_epoch:0,artifact_version:1,artifact,artifact_hash:createHash('sha256').update(artifact).digest('hex'),status:'awaiting_human',report:null,review_until:null};f.job.milestones.push(delivery);
 let deliveryReview=null;if(state==='completed'){deliveryReview=f.approve(delivery,'SYNTHETIC-delivery-final-approval');f.job.status='completed';}
 return {...f,coverReview,promotion,promotionReview,bundle,delivery,deliveryReview,limits,saveLimits(){delivery.artifact=JSON.stringify({text:'SYNTHETIC 完整交付与精确下载清单；未外发。',limits:JSON.stringify(limits)});}};
}
test('exact Site-only final packet with current owner approvals displays completed delivery without a Library or source ZIP',()=>{
 const f=finalPostVideoFixture(),before=copy(f.job);assert.equal(Object.hasOwn(f.job,'owner_id'),false);assert.equal(f.job.facts.native_video_archive,undefined);assert.equal(f.job.facts.site_file_archives.some(a=>a.file.role==='source_bundle'),false);assert.equal(postVideoMaterialReviewStatus(f.job),'交付已完成');assert.deepEqual(f.job,before);
});
test('the same exact complete package remains waiting until the real delivery node is approved',()=>{
 const f=finalPostVideoFixture('awaiting_human'),before=copy(f.job);assert.equal(postVideoMaterialReviewStatus(f.job),'等待交付审核');assert.equal(f.job.status,'approved');assert.equal(f.delivery.report,null);assert.deepEqual(f.job,before);
});
for(const[name,change]of[
 ['completed status alone',f=>f.job.facts.site_file_archives=f.job.facts.site_file_archives.filter(a=>a.file.role!=='complete_bundle')],
 ['ZIP without delivery node',f=>f.job.milestones=f.job.milestones.filter(m=>m.node!=='delivery')],
 ['unconfirmed complete ZIP',f=>f.bundle.status='sealed'],
 ['wrong complete ZIP candidate binding',f=>f.bundle.binding.candidate_sha256='1'.repeat(64)],
 ['wrong complete ZIP material reviews',f=>f.bundle.post_video_material_reviews.cover='SYNTHETIC-old-review'],
 ['missing video owner audit',f=>f.job.reviews=f.job.reviews.filter(r=>r.id!==f.approval.id)],
 ['missing cover owner audit',f=>f.job.reviews=f.job.reviews.filter(r=>r.id!==f.coverReview.id)],
 ['missing promotion owner audit',f=>f.job.reviews=f.job.reviews.filter(r=>r.id!==f.promotionReview.id)],
 ['missing delivery owner audit',f=>f.job.reviews=f.job.reviews.filter(r=>r.id!==f.deliveryReview.id)],
 ['wrong delivery audit hash',f=>f.deliveryReview.content_hash='1'.repeat(64)],
 ['wrong delivery owner',f=>{const r=JSON.parse(f.delivery.report);r.actor='SYNTHETIC-other-owner';f.delivery.report=JSON.stringify(r);f.deliveryReview.note=f.delivery.report;}],
 ['delivery not current epoch',f=>f.delivery.mode_epoch++],
 ['newer invalidated delivery',f=>f.job.milestones.push({...f.delivery,id:'SYNTHETIC-newer-invalidated',artifact_version:2,status:'invalidated'})],
 ['not formally completed',f=>f.job.status='approved'],
 ['wrong final script',f=>f.job.approved_hash='1'.repeat(64)],
 ['other job',f=>f.job.id='SYNTHETIC-unrelated'],
])test('final delivery is not inferred from incomplete or stale evidence: '+name,()=>{const f=finalPostVideoFixture();change(f);assert.notEqual(postVideoMaterialReviewStatus(f.job),'交付已完成');});
for(const[name,change]of[
 ['delivery schema',v=>v.schema='SYNTHETIC-unbound'],
 ['complete archive ID',v=>v.complete_bundle.site_archive_id='sitefile_'+'1'.repeat(64)],
 ['complete SHA',v=>v.complete_bundle.sha256='1'.repeat(64)],
 ['complete bytes',v=>v.complete_bundle.size_bytes++],
 ['video tuple',v=>v.archives.video.sha256='1'.repeat(64)],
 ['3:4 cover tuple',v=>v.archives.cover_3_4.site_archive_id='sitefile_'+'1'.repeat(64)],
 ['4:3 cover tuple',v=>v.archives.cover_4_3.size_bytes++],
 ['promotion tuple',v=>v.archives.promotion.sha256='1'.repeat(64)],
 ['video approval ID',v=>v.approvals.video.review_id='SYNTHETIC-old'],
 ['cover approval hash',v=>v.approvals.cover.artifact_hash='1'.repeat(64)],
 ['promotion approval time',v=>v.approvals.promotion.reviewed_at='2026-10-17T00:00:00Z'],
 ['project',v=>v.project_id='SYNTHETIC-other-project'],
 ['timeline',v=>v.timeline_id='SYNTHETIC-other-timeline'],
 ['secondary download',v=>v.secondary_download_verified=false],
 ['publication flag',v=>v.external_publication=true],
 ['payment flag',v=>v.new_paid_calls=1],
])test('delivery waiting status requires the exact current delivery manifest: '+name,()=>{const f=finalPostVideoFixture('awaiting_human');change(f.limits);f.saveLimits();assert.notEqual(postVideoMaterialReviewStatus(f.job),'等待交付审核');});
for(const state of ['completed','awaiting_human'])test('Site-only '+state+' delivery shows the same exact state in the header and selected slim sidebar without writes',async t=>{
 const f=finalPostVideoFixture(state);f.listJob=Object.fromEntries(Object.entries(f.job).filter(([key])=>!['facts','milestones','reviews','media_continuation','stages'].includes(key)));const before=copy(f.job),calls=await mount(t,f,ProductionDesk),label=state==='completed'?'交付已完成':'等待交付审核',header=document.querySelector('.production-current');assert.equal(header.querySelector('.production-status').textContent,label);assert.equal(document.querySelector('.production-task-items button[aria-current="true"] span').textContent,label);assert.doesNotMatch(header.textContent,/封面与宣发按节点继续|口播稿已批准|准备检查待补充/);assert.match(header.textContent,state==='completed'?/本版成片、双封面、宣发和完整交付包已完成审核并归档/:/完整交付包已归档，等待交付审核/);if(state==='completed')assert.equal(header.querySelector('.production-current-task'),null);else assert.equal(header.querySelector('.production-current-task').getAttribute('href'),'#delivery-review');assert.equal(calls.some(c=>c.options.method==='POST'),false);assert.deepEqual(f.job,before);
});
