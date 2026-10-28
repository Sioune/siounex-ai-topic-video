// SYNTHETIC real React/JSDOM with intercepted reads only. No task, editor or media action.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React,{act} from 'react';
import {productionWorkspacePlacement} from '../lib/production-workspace.mts';
const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=createRequire(process.env.TOPIC_TEST_PACKAGE||new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://synthetic.test/production',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLDetailsElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Element','Node','Event','MouseEvent','KeyboardEvent','HashChangeEvent','MutationObserver','DocumentFragment','CustomEvent','history'])globalThis[key]=dom.window[key];
for(const key of ['requestAnimationFrame','cancelAnimationFrame','getComputedStyle'])globalThis[key]=dom.window[key].bind(dom.window);
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HTMLElement.prototype.scrollIntoView=function(){};
const {createRoot}=await import('react-dom/client');
const built=await build({stdin:{contents:"export {default as NativeHandoff,candidateOwnerReviewSummary} from './components/native-handoff'; export {default as ProductionDesk,archivedOrdinaryVideoStatus,postVideoMaterialReviewStatus,pendingArchivedCandidateReviewStatus} from './components/production-desk';export {executionDisplay} from './lib/execution-display.mts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false});
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);const {NativeHandoff,ProductionDesk,archivedOrdinaryVideoStatus,candidateOwnerReviewSummary,postVideoMaterialReviewStatus,pendingArchivedCandidateReviewStatus,executionDisplay}=module.exports;
const JOB='job_33333333-3333-3333-3333-333333333333',PROJECT='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const clone=v=>JSON.parse(JSON.stringify(v));
const listColumns='review_mode,mode_epoch,reworks,ai_calls,id,topic_id,is_test,status,source_snapshot,skill_snapshot,contract_hash,revision,checkpoint_version,checkpoint,lease_until,executor,attempt,error,review_note,approved_revision,approved_hash,created_at,updated_at'.split(',');
// Match listJobs: raw public columns, plus facts only for a current owner candidate review.
const listRow=j=>({...Object.fromEntries(listColumns.filter(key=>Object.hasOwn(j,key)).map(key=>[key,j[key]])),...(j.facts?.candidate_owner_review?{facts:j.facts}:{})});
// Keep legacy listRow for its direct compatibility assertions; HTTP now uses
// the small summary contract and never sends those raw snapshots or facts.
function apiSummary(j){return{kind:'production-job-summary-v1',...productionWorkspacePlacement(j),id:j.id,topic_id:j.topic_id,title:JSON.parse(j.source_snapshot).title,is_test:j.is_test,status:j.status,revision:j.revision,mode_epoch:j.mode_epoch,review_mode:j.review_mode,updated_at:j.updated_at,status_label:postVideoMaterialReviewStatus(j)||pendingArchivedCandidateReviewStatus(j)||archivedOrdinaryVideoStatus(j)||candidateOwnerReviewSummary(j)||executionDisplay(j).label||j.status,current_candidate:null,current_node:null,execution_condition:j.status};}
const sleep=()=>new Promise(resolve=>setTimeout(resolve,5));async function settle(){await act(async()=>{await sleep();});await act(async()=>{await sleep();});}
function job(){return {id:JOB,topic_id:'SYNTHETIC',status:'approved',is_test:0,source_snapshot:JSON.stringify({title:'SYNTHETIC candidate episode',url:'https://example.org/SYNTHETIC'}),skill_snapshot:'{}',contract_hash:'c'.repeat(64),review_mode:'node',revision:1,approved_revision:1,approved_hash:'f'.repeat(64),mode_epoch:0,updated_at:'SYNTHETIC-unchanged-time',created_at:'now',lease_until:null,attempt:1,reworks:0,ai_calls:0,checkpoint_version:0,checkpoint:'{}',intake:null,operations:[],stages:[],reviews:[],publication_reports:[],milestones:[],drafts:[],facts:{candidate_record_id:'native_video_SYNTHETIC',candidate_video_sha256:'a'.repeat(64),files_archived:false}};}
function packet({archived=false,project=PROJECT}={}){return {status:'awaiting_candidate_review',label:archived?'已有归档候选，等待回传视频审核节点':'已有视频候选，等待归档与本人审阅',blockers:['SYNTHETIC scope must be reconfirmed'],binding:{revision:1,base_artifact_version:0},packet_hash:'e'.repeat(64),capabilities:{claimed:false,native_editor_connected:false},candidate:{record_id:'native_video_SYNTHETIC',sha256:'a'.repeat(64),file_name:'SYNTHETIC ordinary SAPI review candidate.mp4',duration:54.9,project_id:project,timeline_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',archive_status:archived?'archived':'archive_pending'}};}
function reviewed({decision='approved',quote='SYNTHETIC 本人原话：普通配音版可以',id='SYNTHETIC-feedback-1',archived=false}={}){
 const j=job(),p=packet({archived}),r={id,decision,quote,reported_at:'2026-10-17T00:00:00Z',source_thread_id:null,sequence:1,source:'owner-oral-report',reviewed_voice_kind:'ordinary-temporary',website_button_clicked:false,formal_milestone_approved:false,quality_approved:false,publication_authorized:false,new_paid_calls:0,binding:{revision:j.revision,script_hash:j.approved_hash,mode_epoch:j.mode_epoch,contract_hash:j.contract_hash,candidate_id:j.facts.candidate_record_id,candidate_sha256:j.facts.candidate_video_sha256,project_id:p.candidate.project_id,timeline_id:p.candidate.timeline_id}};
 j.facts={...j.facts,files_archived:archived,candidate_present:true,candidate_owner_review:r,summary:'已有成片候选，等待独立审片',video_approval:'not-recorded'};p.candidate.owner_review=clone(r);return {j,p,r};
}
function unreviewedCandidate(){
 const j=job(),p=packet(),id='native_video_'+'a'.repeat(64),sha='b'.repeat(64),binding={revision:j.revision,script_hash:j.approved_hash,mode_epoch:j.mode_epoch,contract_hash:j.contract_hash};
 j.media_continuation={current_id:'SYNTHETIC-scope',scope:{id:'SYNTHETIC-scope',binding}};
 j.stages=[{id:'SYNTHETIC-old-preparation',stage:'media_inputs',status:'queued',review_revision:j.revision,review_hash:j.approved_hash,result:JSON.stringify({schema:'media-input-probe-v1',scope_id:'SYNTHETIC-scope',binding})}];
 j.facts={...j.facts,candidate_record_id:id,candidate_video_sha256:sha,candidate_present:true,script_approved:true,video_approval:'not-recorded',summary:'已有成片候选，等待独立审片'};
 j.reviews=[{id,decision:'native_video_candidate',revision:j.revision,content_hash:sha,note:JSON.stringify({schema:'native-video-candidate-v1',script_hash:j.approved_hash,sha256:sha,project_id:PROJECT,timeline_id:p.candidate.timeline_id,local_file_verified:true,quality_approved:false,publication:false})}];
 p.candidate.record_id=id;p.candidate.sha256=sha;return{j,p};
}
async function mount(t,{initial=job(),value=packet(),fetcher,desk=false,query=true}={}){
 document.body.innerHTML='<div id="root"></div>';history.replaceState(null,'',query?'/production?job='+JOB:'/production');const oldFetch=globalThis.fetch,calls=[];let currentPacket=value;
 globalThis.fetch=async(url,options={})=>{assert.notEqual(options.method,'POST','Read-only UI must not write');assert.ok(typeof url==='string'&&url.startsWith('/api/'),'Only intercepted synthetic API reads');calls.push(url);if(fetcher)return fetcher(url,options);if(url.includes('view=native_packet'))return Response.json({packet:currentPacket});if(url==='/api/production')return Response.json({jobs:[apiSummary(initial)]});if(url.startsWith('/api/production?')&&(!url.includes('view=')||url.includes('view=desk')))return Response.json({job:initial});return Response.json({error:'SYNTHETIC optional input unavailable'},{status:503});};
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=oldFetch;});
 const render=async j=>{await act(async()=>root.render(React.createElement(NativeHandoff,{job:j})));await settle();};
 if(desk){await act(async()=>root.render(React.createElement(ProductionDesk)));await settle();if(query){const media=[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='素材与制作');await act(async()=>{media.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));media.click();});await settle();}}else await render(initial);
 return {calls,render,setPacket(v){currentPacket=v;}};
}
test('SYNTHETIC candidate UI opens only the fixed real editor route and does not call an approval or render action',async t=>{
 const f=await mount(t),section=document.querySelector('[aria-label="原生视频制作交接"]');assert.match(section.textContent,/已有视频候选，等待归档与本人审阅/);assert.match(section.textContent,/ordinary SAPI review candidate/);assert.match(section.textContent,/无需重复制作/);assert.match(section.textContent,/SYNTHETIC scope must be reconfirmed/);assert.doesNotMatch(section.textContent,/最新终版|尚无成片|尚未领取/);
 const link=section.querySelector('a');assert.equal(link.href,'https://app.chatcut.io/editor/'+PROJECT);assert.equal(new URL(link.href).search,'');assert.equal(link.target,'_blank');assert.match(link.rel,/noopener/);assert.match(link.rel,/noreferrer/);assert.equal(f.calls.length,1);assert.equal(section.querySelectorAll('button,video').length,0);
});
test('SYNTHETIC archived candidate copy preserves the pending formal review node',async t=>{await mount(t,{value:packet({archived:true}),initial:{...job(),facts:{...job().facts,files_archived:true}}});assert.match(document.body.textContent,/已有归档候选，等待回传视频审核节点/);assert.match(document.body.textContent,/候选已归档/);assert.doesNotMatch(document.body.textContent,/文件归档与正式视频审核节点尚待回传/);});
for(const project of ['javascript:alert(1)',PROJECT+'?boot=SYNTHETIC','https://attacker.invalid/'+PROJECT,'SYNTHETIC-invalid',''])test('SYNTHETIC invalid project '+JSON.stringify(project)+' is not made into an editor link',async t=>{
 await mount(t,{value:packet({project})});assert.equal(document.querySelector('[aria-label="原生视频制作交接"] a'),null);if(project)assert.ok(document.body.textContent.includes(project));assert.equal(document.querySelector('script'),null);
});
test('SYNTHETIC candidate and archive changes refresh the packet even when the job updated_at is unchanged',async t=>{
 const initial=job();initial.facts={candidate_record_id:null,candidate_video_sha256:null,files_archived:false};
 const empty={...packet(),status:'needs_native_handoff',label:'脚本已批准，等待原生制作交接',candidate:null},f=await mount(t,{initial,value:empty});assert.equal(f.calls.length,1);
 f.setPacket(packet());await f.render(job());assert.equal(f.calls.length,2);assert.match(document.body.textContent,/已有视频候选/);
 const archived=job();archived.facts.files_archived=true;f.setPacket(packet({archived:true}));await f.render(archived);assert.equal(f.calls.length,3);assert.match(document.body.textContent,/已有归档候选/);
 const formal=clone(archived);formal.milestones=[{id:'SYNTHETIC-video',node:'video',revision:1,artifact_version:1,status:'awaiting_human',mode_epoch:0}];f.setPacket({...packet(),status:'awaiting_human',label:'当前成片等待本人审核',candidate:null});await f.render(formal);assert.equal(f.calls.length,4);assert.match(document.body.textContent,/当前成片等待本人审核/);assert.equal(document.querySelector('a'),null);
});
test('SYNTHETIC delayed obsolete packet cannot overwrite the candidate from a newer read',async t=>{
 let firstResolve,count=0;const f=await mount(t,{initial:{...job(),facts:{}},fetcher:async()=>{count++;if(count===1)return new Promise(resolve=>{firstResolve=resolve;});return Response.json({packet:packet()});}});
 await f.render(job());assert.match(document.body.textContent,/已有视频候选/);await act(async()=>{firstResolve(Response.json({packet:{...packet(),label:'SYNTHETIC STALE',status:'needs_native_handoff',candidate:null}}));});await settle();assert.doesNotMatch(document.body.textContent,/SYNTHETIC STALE/);assert.match(document.body.textContent,/已有视频候选/);
});
test('SYNTHETIC ordinary production banner describes a review candidate without calling it a final version',async t=>{
 await mount(t,{desk:true});const mediaTab=[...document.querySelectorAll('[role="tab"]')].find(el=>el.textContent==='素材与制作');assert.ok(mediaTab);await act(async()=>mediaTab.click());await settle();
 const panel=document.querySelector('[data-production-panel="media"]');assert.match(panel.textContent,/当前视频候选待归档与审阅/);assert.match(panel.textContent,/未代替本人审片/);assert.doesNotMatch(panel.textContent,/最新终版/);
});
for(const decision of ['approved','rework-requested'])test('SYNTHETIC native handoff shows exact ordinary-voice chat feedback '+decision+' without formal approval or writes',async t=>{
 const quote=decision==='approved'?'SYNTHETIC 看过普通声，这个可以':'SYNTHETIC 开头没理解，要改第一段',f=reviewed({decision,quote});await mount(t,{initial:f.j,value:f.p});const section=document.querySelector('[aria-label="原生视频制作交接"]'),notice=section.querySelector('[aria-label="当前普通配音候选聊天审阅"]');
 assert.ok(notice);assert.equal(notice.querySelector('blockquote').textContent,quote);assert.match(notice.textContent,decision==='approved'?/本人聊天审阅：通过/:/本人聊天审阅：需修改/);assert.match(notice.textContent,/文件待归档/);assert.match(notice.textContent,/不等于正式节点批准/);assert.doesNotMatch(section.textContent,/等待归档与本人审阅|本节点已通过|本站通过|已发布/);assert.equal(notice.querySelector('button'),null);
 if(decision==='rework-requested'){assert.match(section.textContent,/制作会话应按本次原话修改/);assert.doesNotMatch(section.textContent,/无需重复制作/);}else assert.match(section.querySelector('[role="status"]').textContent,/聊天审阅通过 · 待归档/);
});
test('SYNTHETIC feedback quote is plain text and cannot inject markup',async t=>{
 const quote='SYNTHETIC 原话\n<img src=x onerror="alert(1)"><script>alert(1)</script>',f=reviewed({quote});await mount(t,{initial:f.j,value:f.p});const notice=document.querySelector('[aria-label="当前普通配音候选聊天审阅"]');assert.equal(notice.querySelector('blockquote').textContent,quote);assert.equal(notice.querySelector('img,script'),null);
});
for(const [key,value]of[['revision',2],['script_hash','0'.repeat(64)],['mode_epoch',1],['contract_hash','0'.repeat(64)],['candidate_id','native_video_SYNTHETIC-old'],['candidate_sha256','0'.repeat(64)],['project_id','cccccccc-cccc-cccc-cccc-cccccccccccc'],['timeline_id','dddddddd-dddd-dddd-dddd-dddddddddddd']])test('SYNTHETIC chat review is hidden when its current candidate binding differs: '+key,async t=>{
 const f=reviewed();f.r.binding[key]=value;f.p.candidate.owner_review=clone(f.r);await mount(t,{initial:f.j,value:f.p});assert.equal(document.querySelector('[aria-label="当前普通配音候选聊天审阅"]'),null);assert.doesNotMatch(document.body.textContent,/SYNTHETIC 本人原话/);
});
for(const change of [r=>{r.reviewed_voice_kind='cloned-final';},r=>{r.formal_milestone_approved=true;},r=>{r.quality_approved=true;}])test('SYNTHETIC non-ordinary or falsely formal review is not shown as chat approval',async t=>{
 const f=reviewed();change(f.r);f.p.candidate.owner_review=clone(f.r);await mount(t,{initial:f.j,value:f.p});assert.equal(document.querySelector('[aria-label="当前普通配音候选聊天审阅"]'),null);
});
test('SYNTHETIC feedback id alone refreshes the packet and never inherits the previous file review',async t=>{
 const first=reviewed(),f=await mount(t,{initial:first.j,value:first.p});assert.equal(f.calls.length,1);const second=reviewed({decision:'rework-requested',quote:'SYNTHETIC 最新原话：开头要改',id:'SYNTHETIC-feedback-2'});assert.equal(first.j.updated_at,second.j.updated_at);f.setPacket(second.p);await f.render(second.j);assert.equal(f.calls.length,2);assert.match(document.body.textContent,/SYNTHETIC 最新原话：开头要改/);assert.doesNotMatch(document.body.textContent,/SYNTHETIC 本人原话：普通配音版可以/);
 const next=clone(second.j);next.facts.candidate_record_id='native_video_SYNTHETIC-next';next.facts.candidate_video_sha256='9'.repeat(64);const nextPacket=clone(second.p);nextPacket.candidate.record_id=next.facts.candidate_record_id;nextPacket.candidate.sha256=next.facts.candidate_video_sha256;f.setPacket(nextPacket);await f.render(next);assert.equal(document.querySelector('[aria-label="当前普通配音候选聊天审阅"]'),null);
});
test('SYNTHETIC a delayed packet carrying older feedback cannot overwrite a newer feedback read',async t=>{
 let oldResolve,count=0;const old=reviewed(),latest=reviewed({decision:'rework-requested',quote:'SYNTHETIC 只显示新意见',id:'SYNTHETIC-feedback-new'}),f=await mount(t,{initial:old.j,fetcher:async()=>{count++;return count===1?new Promise(resolve=>{oldResolve=resolve;}):Response.json({packet:latest.p});}});await f.render(latest.j);assert.match(document.body.textContent,/SYNTHETIC 只显示新意见/);await act(async()=>oldResolve(Response.json({packet:old.p})));await settle();assert.match(document.body.textContent,/SYNTHETIC 只显示新意见/);assert.doesNotMatch(document.body.textContent,/SYNTHETIC 本人原话：普通配音版可以/);
});
for(const decision of ['approved','rework-requested'])test('SYNTHETIC production overview and candidate card reflect chat '+decision+' while the formal node remains independent',async t=>{
 const f=reviewed({decision,quote:'SYNTHETIC 普通声聊天意见'});await mount(t,{initial:f.j,value:f.p,desk:true});const heading=document.querySelector('.production-current');assert.match(heading.textContent,decision==='approved'?/普通配音版聊天审阅通过 · 待归档/:/普通配音版需修改/);assert.doesNotMatch(heading.textContent,/等待独立审片|本节点已通过|本站通过|已发布/);assert.match(document.querySelector('.production-task-items > button').textContent,/普通配音版/);
 const mediaTab=[...document.querySelectorAll('[role="tab"]')].find(el=>el.textContent==='素材与制作');await act(async()=>mediaTab.click());await settle();const panel=document.querySelector('[data-production-panel="media"]'),card=panel.querySelector('.milestone-card');assert.match(card.textContent,/当前视频候选待归档/);assert.match(card.textContent,/SYNTHETIC 普通声聊天意见/);assert.match(card.textContent,/不等于正式节点批准/);assert.doesNotMatch(card.textContent,/未代替本人审片/);const facts=document.querySelector('[aria-label="任务事实"]');assert.doesNotMatch(facts.textContent,/等待独立审片/);assert.match(facts.textContent,/正式节点仍待审|正式节点未批准/);assert.equal(f.j.facts.video_approval,'not-recorded');
});
test('SYNTHETIC feedback does not replace an actual formal node approval or fabricate archive completion',async t=>{
 const f=reviewed({archived:true});f.j.facts.video_approval='owner-node-approved';f.j.facts.summary='当前成片已通过本人节点审核';await mount(t,{initial:f.j,value:f.p,desk:true});assert.match(document.querySelector('.production-current').textContent,/当前成片已通过本人节点审核/);assert.doesNotMatch(document.querySelector('.production-current').textContent,/待归档/);assert.match(document.querySelector('[aria-label="任务事实"]').textContent,/当前视频节点已在本站通过/);const notices=[...document.querySelectorAll('[aria-label="当前普通配音候选聊天审阅"]')];assert.ok(notices.length);assert.match(notices[0].textContent,/文件已归档/);assert.equal(notices[0].querySelector('blockquote').textContent,f.r.quote);
});
test('SYNTHETIC an unselected task list displays chat approval from the slim list payload without relying on a detail read',async t=>{
 const f=reviewed(),row=listRow(f.j);assert.equal(Object.hasOwn(row,'drafts'),false);assert.equal(Object.hasOwn(row,'reviews'),false);assert.equal(Object.hasOwn(row,'milestones'),false);
 const mounted=await mount(t,{initial:f.j,value:f.p,desk:true,query:false});assert.match(document.querySelector('.production-task-items > button').textContent,/普通配音版聊天审阅通过 · 待归档/);assert.equal(document.querySelector('.production-current'),null);assert.deepEqual(mounted.calls,['/api/production']);
});
test('SYNTHETIC a real current unreviewed native candidate takes precedence over old queued preparation in the header and connection message',async t=>{
 const f=unreviewedCandidate(),before=clone(f.j);await mount(t,{initial:f.j,value:f.p,desk:true});const header=document.querySelector('.production-current');assert.equal(header.querySelector('.production-status').textContent,'本版成片候选待审，待归档与本人审阅');assert.match(header.querySelector('[role="status"]').textContent,/本版成片候选待审，待归档与本人审阅/);assert.doesNotMatch(document.body.textContent,/尚未开始成片制作/);assert.doesNotMatch(header.textContent,/准备检查已排队/);assert.equal(document.querySelector('[aria-label="当前普通配音候选聊天审阅"]'),null);assert.deepEqual(f.j,before);
 // The actual slim list has no facts/review receipt, so it retains its previous label.
 assert.doesNotMatch(document.querySelector('.production-task-items > button').textContent,/本版成片候选待审/);
});
for(const [name,change]of[
 ['revision',j=>{j.reviews[0].revision=0;}],
 ['script',j=>{const v=JSON.parse(j.reviews[0].note);v.script_hash='0'.repeat(64);j.reviews[0].note=JSON.stringify(v);}],
 ['candidate ID',j=>{j.reviews[0].id='native_video_'+'c'.repeat(64);}],
 ['candidate SHA',j=>{const v=JSON.parse(j.reviews[0].note);v.sha256='0'.repeat(64);j.reviews[0].note=JSON.stringify(v);}],
 ['verified local file',j=>{const v=JSON.parse(j.reviews[0].note);v.local_file_verified=false;j.reviews[0].note=JSON.stringify(v);}],
 ['unapproved script',j=>{j.approved_revision=0;}],
 ['external candidate',j=>{j.reviews[0].decision='external_delivery';j.reviews[0].note=JSON.stringify({assets:[],duration:54.9,limits:'SYNTHETIC external receipt'});}],
 ['missing facts',j=>{delete j.facts;}]
])test('SYNTHETIC header does not infer a new completed native candidate from '+name+' mismatch',async t=>{
 const f=unreviewedCandidate();change(f.j);await mount(t,{initial:f.j,value:f.p,desk:true});assert.doesNotMatch(document.querySelector('.production-current').textContent,/本版成片候选待审/);assert.equal(document.querySelector('.production-status').textContent,name==='unapproved script'?'口播稿已批准':'准备检查已排队');
});
test('SYNTHETIC a current formal video milestone keeps its existing header priority over an unreviewed native receipt',async t=>{
 const f=unreviewedCandidate();f.j.milestones=[{id:'SYNTHETIC-current-video',node:'video',revision:f.j.revision,mode_epoch:f.j.mode_epoch,artifact_version:1,status:'awaiting_human',artifact:'{}'}];await mount(t,{initial:f.j,value:f.p,desk:true});assert.doesNotMatch(document.querySelector('.production-current').textContent,/本版成片候选待审/);assert.equal(document.querySelector('.production-status').textContent,'准备检查已排队');
});
test('SYNTHETIC an old script video milestone does not hide a new approved script native candidate',async t=>{
 const f=unreviewedCandidate();f.j.revision=2;f.j.approved_revision=2;f.j.reviews[0].revision=2;f.j.milestones=[{id:'SYNTHETIC-old-video',node:'video',revision:1,mode_epoch:0,artifact_version:1,status:'revise',artifact:'{}'}];await mount(t,{initial:f.j,value:f.p,desk:true});assert.match(document.querySelector('.production-status').textContent,/本版成片候选待审/);
});
for(const decision of ['approved','rework-requested'])test('SYNTHETIC current candidate owner '+decision+' keeps priority over the new pending-candidate display',async t=>{
 const f=unreviewedCandidate(),r=reviewed({decision}).r;r.binding.candidate_id=f.j.facts.candidate_record_id;r.binding.candidate_sha256=f.j.facts.candidate_video_sha256;f.j.facts.candidate_owner_review=r;f.p.candidate.owner_review=clone(r);await mount(t,{initial:f.j,value:f.p,desk:true});const header=document.querySelector('.production-current');assert.match(header.textContent,decision==='approved'?/普通配音版聊天审阅通过/:/普通配音版需修改/);assert.doesNotMatch(header.textContent,/本版成片候选待审|尚未开始成片制作/);
});
for(const status of ['awaiting_human','approved'])test('SYNTHETIC current Site video '+status+' uses private file links and keeps old preparation closed',async t=>{
 const f=reviewed({archived:true}),sha=f.j.facts.candidate_video_sha256,sid='sitefile_'+'8'.repeat(64),scope='SYNTHETIC-Site-scope';
 f.j.media_continuation={scope:{id:scope,scope:'private-video',binding:{revision:f.j.revision,script_hash:f.j.approved_hash,mode_epoch:f.j.mode_epoch,contract_hash:f.j.contract_hash}},licenses:[]};
 f.j.facts.site_file_archives=[{schema:'site-private-file-archive-v1',site_archive_id:sid,storage:'site-private-r2',binding:clone(f.r.binding),owner_review_id:f.r.id,scope_id:scope,scope_hash:'a'.repeat(64),file:{role:'video',sha256:sha,size_bytes:1234,file_name:'SYNTHETIC Site review.mp4',mime_type:'video/mp4'},status:'confirmed',part_size:524288,part_count:1,created_at:'2026-10-17T00:00:00Z',confirmed_at:'2026-10-17T01:00:00Z',materialized_sha256:sha,manifest_sha256:'a'.repeat(64),quality_approved:false,publication_authorized:false,new_paid_calls:0}];
 f.j.milestones=[{id:'SYNTHETIC-Site-video-node',node:'video',revision:f.j.revision,mode_epoch:f.j.mode_epoch,artifact_version:1,status,content_hash:'e'.repeat(64),artifact:JSON.stringify({storage:'site-private-r2',site_archive_id:sid,sha256:sha,qa:{native_handoff:true,site_archive_id:sid,file_name:'SYNTHETIC Site review.mp4',size_bytes:1234,duration_seconds:54.9}})}];
 if(status==='approved'){f.j.facts.video_approval='owner-node-approved';f.j.facts.summary='当前成片已通过本人节点审核';}
 f.p={...f.p,status:status==='approved'?'native_done':'awaiting_human',label:status==='approved'?'本版成片已通过本人审核，可继续封面与宣发交付':'当前成片等待本人审核',candidate:null};
 await mount(t,{initial:f.j,value:f.p,desk:true});const tab=[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent==='素材与制作');await act(async()=>{tab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));tab.click();});await settle();
 const panel=document.querySelector('[data-production-panel="media"]'),native=panel.querySelector('[aria-label="本站归档成片审核状态"]');assert.ok(native);assert.doesNotMatch(native.textContent,/Library|资料库/);assert.ok(native.querySelector('a[href^="/api/site-archive?id="]'));assert.match(native.textContent,status==='approved'?/视频节点已通过/:/待本人审片/);
 const notice=panel.querySelector('[aria-label="当前普通配音候选聊天审阅"]');assert.match(notice.textContent,status==='approved'?/正式视频节点已通过本人审核/:/正式视频节点已回传，待本人审片/);assert.doesNotMatch(notice.textContent,/尚待回传/);
 const history=panel.querySelector('details[data-historical-preparation]');assert.ok(history);assert.equal(history.open,false);assert.ok(history.querySelector('#recording-input'));assert.ok(history.querySelector('#media-plan-input'));assert.equal(history.contains(panel.querySelector('#site-archive-handoff')),false);
});

const ORDINARY_ARCHIVE_JOBS=['job_1c2556b8-53d5-4dc0-8d7a-faec60fa36ba','job_79fcd694-545b-4423-971c-984d95b5511c'];
function ordinaryArchivedFixture(id,status='approved'){
 const f=reviewed({archived:true}),sha=f.j.facts.candidate_video_sha256,scope='SYNTHETIC-current-site-scope',sid='sitefile_'+'7'.repeat(64),binding={revision:f.j.revision,script_hash:f.j.approved_hash,mode_epoch:f.j.mode_epoch,contract_hash:f.j.contract_hash};
 f.j.id=id;f.j.media_continuation={current_id:scope,scope:{id:scope,scope:'private-video',binding},licenses:[]};
 f.j.stages=[{stage:'media_inputs',status:'blocked',review_revision:f.j.revision,review_hash:f.j.approved_hash,result:JSON.stringify({schema:'media-input-probe-v1',scope_id:scope,binding,receipt:{schema:'media-input-probe-receipt-v1',status:'blocked',checks:[{passed:false,detail:'SYNTHETIC old missing voice/Native Library preparation'}]}})}];
 f.j.facts.site_file_archives=[{schema:'site-private-file-archive-v1',site_archive_id:sid,storage:'site-private-r2',binding:clone(f.r.binding),owner_review_id:f.r.id,scope_id:scope,scope_hash:'a'.repeat(64),file:{role:'video',sha256:sha,size_bytes:1234,file_name:'SYNTHETIC ordinary archived.mp4',mime_type:'video/mp4'},status:'confirmed',part_size:524288,part_count:1,created_at:'2026-10-17T00:00:00Z',confirmed_at:'2026-10-17T01:00:00Z',materialized_sha256:sha,manifest_sha256:'a'.repeat(64),quality_approved:false,publication_authorized:false,new_paid_calls:0}];
 f.j.milestones=[{id:'SYNTHETIC-current-site-video',node:'video',revision:f.j.revision,mode_epoch:f.j.mode_epoch,artifact_version:1,status,artifact:JSON.stringify({storage:'site-private-r2',site_archive_id:sid,sha256:sha,qa:{native_handoff:true,site_archive_id:sid}})}];
 if(status==='approved'){f.j.facts.video_approval='owner-node-approved';f.j.facts.summary='当前成片已通过本人节点审核';}
 f.p={...f.p,status:status==='approved'?'native_done':'awaiting_human',label:status==='approved'?'本版成片已通过本人审核，可继续封面与宣发交付':'当前成片等待本人审核'};
 return f;
}
for(const id of ORDINARY_ARCHIVE_JOBS)for(const status of ['awaiting_human','approved'])test('SYNTHETIC exact ordinary archived job hides inapplicable clone controls '+id+' '+status,async t=>{
 const f=ordinaryArchivedFixture(id,status),before=clone(f.j),mounted=await mount(t,{initial:f.j,value:f.p,desk:true});
 assert.equal(document.querySelector('#voice-replacement'),null);assert.doesNotMatch(document.body.textContent,/换成我的克隆旁白|现有龙\/森林画面|本人克隆旁白替换/);assert.equal(mounted.calls.some(url=>url.startsWith('/api/voice-replacement')),false);
 if(status==='approved'){assert.equal(document.querySelector('.production-status').textContent,'成片已通过，待交付');assert.match(document.querySelector('.production-task-items > button').textContent,/成片已通过，待交付/);assert.doesNotMatch(document.querySelector('.production-current').textContent,/准备检查待补充|old missing voice/);}
 else assert.doesNotMatch(document.querySelector('.production-status').textContent,/成片已通过，待交付/);
 assert.deepEqual(f.j,before);
});
for(const id of ORDINARY_ARCHIVE_JOBS)test('SYNTHETIC unselected ordinary archived task uses current projected Site facts in slim list '+id,async t=>{
 const f=ordinaryArchivedFixture(id),row=listRow(f.j);assert.equal(Object.hasOwn(row,'media_continuation'),false);assert.equal(Object.hasOwn(row,'milestones'),false);const before=clone(row);
 const mounted=await mount(t,{initial:f.j,value:f.p,desk:true,query:false});assert.match(document.querySelector('.production-task-items > button').textContent,/成片已通过，待交付/);assert.deepEqual(mounted.calls,['/api/production']);assert.deepEqual(row,before);
});
for(const [name,status,delivery,expected]of[['delivery review','awaiting_human','awaiting_human','等待交付审核'],['completed','completed','approved','交付已完成']])test('SYNTHETIC ordinary archived status preserves actual '+name,async t=>{
 const f=ordinaryArchivedFixture(ORDINARY_ARCHIVE_JOBS[0]);f.j.status=status;f.j.milestones.push({id:'SYNTHETIC-delivery',node:'delivery',revision:f.j.revision,mode_epoch:f.j.mode_epoch,artifact_version:1,status:delivery,artifact:'{}'});await mount(t,{initial:f.j,value:f.p,desk:true});assert.equal(document.querySelector('.production-status').textContent,expected);assert.match(document.querySelector('.production-task-items > button').textContent,new RegExp(expected));if(delivery==='awaiting_human')assert.match(document.querySelector('.production-current-task').textContent,/检查交付/);
});
test('SYNTHETIC ordinary archive status rejects stale binding and leaves other jobs untouched',()=>{
 const f=ordinaryArchivedFixture(ORDINARY_ARCHIVE_JOBS[0]);assert.equal(archivedOrdinaryVideoStatus(f.j),'成片已通过，待交付');assert.equal(archivedOrdinaryVideoStatus(listRow(f.j)),'成片已通过，待交付');
 for(const change of [j=>{j.id=JOB;},j=>{j.id='job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee';},j=>{j.facts.video_approval='not-recorded';},j=>{j.facts.files_archived=false;},j=>{j.media_continuation.scope.id+='-old';},j=>{j.milestones[0].status='revise';},j=>{j.approved_hash='0'.repeat(64);},j=>{j.revision++;},j=>{j.mode_epoch++;},j=>{j.contract_hash='0'.repeat(64);},j=>{j.facts.site_file_archives[0].binding.candidate_id+='-old';},j=>{j.facts.site_file_archives[0].binding.project_id='cccccccc-cccc-cccc-cccc-cccccccccccc';},j=>{j.facts.site_file_archives[0].binding.timeline_id='dddddddd-dddd-dddd-dddd-dddddddddddd';},j=>{j.facts.site_file_archives[0].materialized_sha256='0'.repeat(64);},j=>{j.facts.site_file_archives[0].status='sealed';}]){const changed=clone(f.j);change(changed);assert.equal(archivedOrdinaryVideoStatus(changed),null);}
});
function archivedMaterialsFixture(id,approved=false){
 const f=ordinaryArchivedFixture(id),base=f.j.facts.site_file_archives[0];
 for(const [index,role]of ['cover_3_4','cover_4_3','promotion'].entries()){const hash=String(index+3).repeat(64);f.j.facts.site_file_archives.push({...clone(base),site_archive_id:'sitefile_'+hash,file:{role,sha256:hash,size_bytes:1234,file_name:'SYNTHETIC-'+role+(role==='promotion'?'.txt':'.png'),mime_type:role==='promotion'?'text/plain':'image/png'},materialized_sha256:hash});}
 if(approved){const covers=f.j.facts.site_file_archives.filter(a=>a.file.role.startsWith('cover_')),promo=f.j.facts.site_file_archives.find(a=>a.file.role==='promotion');for(const [node,artifact]of [['cover',{files:covers.map(a=>({site_archive_id:a.site_archive_id,sha256:a.file.sha256}))}],['promotion',{text:'SYNTHETIC saved copy',limits:JSON.stringify({schema:'site-promotion-file-v1',site_archive_id:promo.site_archive_id,sha256:promo.file.sha256})}]])f.j.milestones.push({id:'SYNTHETIC-'+node,node,revision:f.j.revision,mode_epoch:f.j.mode_epoch,artifact_version:1,status:'approved',artifact:JSON.stringify(artifact)});}
 return f;
}
function deliveryReads(f){return async url=>{if(url.includes('view=native_packet'))return Response.json({packet:f.p});if(url==='/api/production')return Response.json({jobs:[apiSummary(f.j)]});if(url.startsWith('/api/production?')&&(!url.includes('view=')||url.includes('view=desk')))return Response.json({job:f.j});if(url.startsWith('/api/promo-delivery?'))return Response.json({packages:[],current_binding:null});return Response.json({error:'SYNTHETIC optional input unavailable'},{status:503});};}
for(const id of ORDINARY_ARCHIVE_JOBS)for(const approved of [false,true])test('SYNTHETIC current Site material trio folds only old Library delivery and preserves real review '+id+' '+approved,async t=>{
 const f=archivedMaterialsFixture(id,approved),before=clone(f.j);await mount(t,{initial:f.j,value:f.p,desk:true,fetcher:deliveryReads(f)});const tab=[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent==='交付与版本');await act(async()=>{tab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));tab.click();});await settle();
 const panel=document.querySelector('[data-production-panel="delivery"]'),history=panel.querySelector('details[data-historical-library-promotion]'),current=panel.querySelector('[data-current-site-promotion]');assert.ok(history);assert.equal(history.open,false);assert.equal(history.querySelector('summary').textContent,'历史 Library 宣发交付记录');assert.ok(history.querySelector('#promotion-delivery'));assert.match(history.textContent,/尚无完整宣发归档/);assert.match(current.textContent,/本版封面及宣发已存入本站私有归档，正式审核及下载见下方/);assert.equal(current.querySelector('a').getAttribute('href'),'#native-video-archive');
 assert.match(panel.querySelector('[data-historical-external-receipts] h3').textContent,/历史外部交付回执（本站归档见上方）/);const site=panel.querySelector('#native-video-archive');assert.ok(site);assert.equal(history.contains(site),false);assert.equal(site.querySelectorAll('a[href^="/api/site-archive?"]').length>=4,true);assert.match(site.textContent,approved?/本文件已通过本人封面节点审核/:/封面质量待单独审核/);assert.match(site.textContent,approved?/本文件已通过本人宣发节点审核/:/宣发文案待单独审核/);assert.deepEqual(f.j,before);
});
for(const [name,change]of [['missing cover',f=>{f.j.facts.site_file_archives=f.j.facts.site_file_archives.filter(a=>a.file.role!=='cover_4_3');}],['unconfirmed promotion',f=>{f.j.facts.site_file_archives.find(a=>a.file.role==='promotion').status='sealed';}],['stale scope',f=>{f.j.media_continuation.scope.id+='-old';}],['another job',f=>{f.j.id=JOB;}]])test('SYNTHETIC '+name+' retains the ordinary Library delivery path',async t=>{
 const f=archivedMaterialsFixture(ORDINARY_ARCHIVE_JOBS[0]);change(f);await mount(t,{initial:f.j,value:f.p,desk:true,fetcher:deliveryReads(f)});const deliveryTab=[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='交付与版本');await act(async()=>{deliveryTab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));deliveryTab.click();});await settle();const panel=document.querySelector('[data-production-panel="delivery"]');assert.equal(panel.querySelector('details[data-historical-library-promotion]'),null);assert.equal(panel.querySelector('[data-current-site-promotion]'),null);assert.ok(panel.querySelector('#promotion-delivery'));assert.equal(panel.querySelector('[data-historical-external-receipts]'),null);assert.match(panel.textContent,/真实交付回执/);
});
