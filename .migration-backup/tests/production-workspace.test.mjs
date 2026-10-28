import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React,{act} from 'react';
const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=createRequire(process.env.TOPIC_TEST_PACKAGE||new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom');
const out=await build({stdin:{contents:"export {productionWorkspacePlacement} from './lib/production-workspace.mts';export {ProductionTaskGroups} from './components/production-desk';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false});
const mod={exports:{}};new Function('require','module','exports',out.outputFiles[0].text)(require,mod,mod.exports);
const {productionWorkspacePlacement:place,ProductionTaskGroups}=mod.exports;
function clip(){return {id:'SYNTHETIC',owner_id:'SYNTHETIC-owner',revision:2,approved_revision:2,approved_hash:'b'.repeat(64),mode_epoch:3,status:'approved',milestones:[{id:'SYNTHETIC-video',node:'video',revision:2,mode_epoch:3,artifact_version:1,artifact_hash:'a'.repeat(64),status:'awaiting_human',report:null}],reviews:[],facts:{candidate_present:true,candidate_video_sha256:'c'.repeat(64),files_archived:true,video_approval:'not-recorded',complete_package_archived:false}};}
function acceptedClip(){const j=clip();j.status='completed';j.facts.video_approval='owner-node-approved';j.facts.complete_package_archived=true;j.milestones[0].status='approved';j.milestones.push({id:'SYNTHETIC-delivery',node:'delivery',revision:2,mode_epoch:3,artifact_version:1,artifact_hash:'d'.repeat(64),status:'approved',report:null});for(const m of j.milestones){m.report=JSON.stringify({decision:'approve',actor:j.owner_id,revision:2,mode_epoch:3,artifact_hash:m.artifact_hash});j.reviews.push({id:'SYNTHETIC-approval-'+m.node,revision:2,content_hash:m.artifact_hash,decision:'approve',reviewer:j.owner_id,note:m.report});}return j;}
test('an archived video awaiting its first viewing remains in production; only exact owner approval and complete delivery enter the store',()=>{
 const j=clip();assert.deepEqual(place(j,true),{workspace_section:'in_progress',workspace_badge:'成片待本人审核',publication_count:0});
 j.milestones[0].status='approved';j.facts.video_approval='owner-node-approved';assert.equal(place(j,true).workspace_section,'in_progress');assert.equal(place(j,true).workspace_badge,'成片待本人审核');assert.deepEqual(place(acceptedClip(),true),{workspace_section:'completed',workspace_badge:'交付完成，待发布',publication_count:0});
});
test('a verified release package uses the completed store only with the same current owner approvals and delivery verification',()=>{
 const j=acceptedClip();j.facts.complete_package_archived=false;j.facts.release_package_ready=true;
 assert.equal(place(j,true).workspace_section,'completed');
 assert.equal(place(j,false).workspace_section,'in_progress');
 j.reviews=[];assert.equal(place(j,true).workspace_section,'in_progress');
});
test('an accepted ordinary clip shows the automatic voice step, while its new owner-voice result still requires review',()=>{
 const j=acceptedClip();j.status='approved';j.facts.complete_package_archived=false;
 j.milestones[0].artifact=JSON.stringify({qa:{voice_kind:'ordinary-review'}});
 assert.equal(place(j).workspace_badge,'普通版已通过，待本人换声');assert.equal(place(j).workspace_section,'in_progress');
 j.milestones.push({...j.milestones[0],artifact_version:2,status:'awaiting_human',report:null,artifact:JSON.stringify({qa:{voice_kind:'owner-cloned'}})});
 assert.equal(place(j).workspace_badge,'成片待本人审核');
 j.milestones.pop();j.milestones[0].artifact=JSON.stringify({qa:{voice_kind:'owner-cloned'}});
 assert.equal(place(j).workspace_badge,'成片已审，待交付');
 j.reviews=[];assert.equal(place(j).workspace_badge,'成片待本人审核','a status bit without owner approval cannot bypass review');
});
for(const [reason,change]of[
 ['rejected video',j=>j.milestones[0].status='revise'],['unarchived candidate',j=>j.facts.files_archived=false],['new script revision',j=>j.revision=3],['old mode',j=>j.mode_epoch=4],['invalidated newest video',j=>j.milestones.push({...j.milestones[0],artifact_version:2,status:'invalidated'})],['chat returned candidate',j=>j.facts.candidate_owner_review={decision:'rework-requested'}],['invalid hash',j=>j.facts.candidate_video_sha256='unknown'],['delivery flag alone',j=>{j.status='completed';j.facts.candidate_present=false;}]
])test(reason+' cannot turn retained or incomplete media into a current completed clip',()=>{const j=clip();change(j);assert.equal(place(j,true).workspace_section,'in_progress');});
for(const [reason,change]of[
 ['not-completed delivery',j=>j.status='approved'],['missing full archive',j=>j.facts.complete_package_archived=false],['missing delivery validation',()=>{}],['AI video report',j=>{const m=j.milestones[0];m.report=JSON.stringify({...JSON.parse(m.report),actor:'codex-cli'});j.reviews[0].note=m.report;j.reviews[0].reviewer='codex-cli';}],['AI delivery report',j=>{const m=j.milestones[1];m.report=JSON.stringify({...JSON.parse(m.report),actor:'codex-cli'});j.reviews[1].note=m.report;j.reviews[1].reviewer='codex-cli';}],['missing owner identity',j=>delete j.owner_id],['missing audit',j=>j.reviews=[]],['different audit owner',j=>j.reviews[0].reviewer='SYNTHETIC-other'],['stale report hash',j=>j.milestones[0].artifact_hash='e'.repeat(64)],['new awaiting video',j=>j.milestones.push({...j.milestones[0],artifact_version:2,status:'awaiting_human'})],['new awaiting delivery',j=>j.milestones.push({...j.milestones[1],artifact_version:2,status:'awaiting_human'})],['current AI approval only',j=>j.facts.video_approval='not-recorded']
])test(reason+' cannot place a generated or AI-approved result in the owner-completed store',()=>{const j=acceptedClip();change(j);assert.equal(place(j,reason!=='missing delivery validation').workspace_section,'in_progress');});
test('only dated actual publication records take priority, with registration wording',()=>{
 const j=clip();j.milestones[0].status='revise';j.publication_reports=[{published_at:null},{published_at:'invalid'}];assert.equal(place(j).workspace_section,'in_progress');
 j.publication_reports.push({published_at:'2026-10-20T10:00:00Z'});assert.deepEqual(place(j),{workspace_section:'published',workspace_badge:'已登记发布',publication_count:1});
});
function summaryJobs(){
 const base={kind:'production-job-summary-v1',revision:2,review_mode:'auto',status_label:'成片待本人审核',is_test:0};
 return [{...base,id:'p',title:'SYNTHETIC published',...place({...clip(),publication_reports:[{published_at:'2026-10-20T10:00:00Z'}]})},{...base,id:'c',title:'SYNTHETIC ready',status_label:'交付已完成',...place(acceptedClip(),true)},{...base,id:'w',title:'SYNTHETIC waiting for owner',...place(clip(),true)}];
}
async function ui(t){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.test/production'}),saved={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=require('react-dom/client'),root=createRoot(document.querySelector('#root')),selected=[],cancelled=[];
 const render=async(jobs,selectedId=null,busy=false)=>act(async()=>root.render(React.createElement(ProductionTaskGroups,{jobs,selectedId,busy,onSelect:id=>selected.push(id),onCancel:job=>cancelled.push(job.id)})));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,saved);});
 return {d:dom.window.document,render,selected,cancelled,click:async el=>act(async()=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}))),key:async(el,key)=>act(async()=>el.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true})))};
}
test('workspace tabs default to production, show all counts and switch lists without changing the selected task',async t=>{
 const f=await ui(t),jobs=summaryJobs();await f.render(jobs);const tabs=[...f.d.querySelectorAll('[role="tab"]')];
 assert.deepEqual(tabs.map(e=>e.textContent),['已发布1','已完成片仓1','制作中1','已取消0']);assert.equal(tabs[2].getAttribute('aria-selected'),'true');assert.equal(f.d.querySelector('[role="tabpanel"]:not([hidden])').dataset.workspaceSection,'in_progress');
 for(const tab of tabs){const panel=f.d.getElementById(tab.getAttribute('aria-controls'));assert.ok(panel);assert.equal(panel.getAttribute('aria-labelledby'),tab.id);}
 assert.match(f.d.querySelector('[role="tabpanel"]:not([hidden])').textContent,/SYNTHETIC waiting for owner.*成片待本人审核/);await f.click(tabs[1]);assert.equal(f.d.querySelector('[role="tabpanel"]:not([hidden])').dataset.workspaceSection,'completed');assert.match(f.d.querySelector('[role="tabpanel"]:not([hidden])').textContent,/SYNTHETIC ready.*交付完成，待发布/);assert.doesNotMatch(f.d.querySelector('[role="tabpanel"]:not([hidden])').textContent,/SYNTHETIC waiting for owner/);assert.deepEqual(f.selected,[],'a section switch never loads or clears a task');
 await f.click(f.d.querySelector('[role="tabpanel"]:not([hidden]) button'));assert.deepEqual(f.selected,['c']);
});
test('current selected task follows its new section on refresh, while identical status refresh respects a manual tab choice',async t=>{
 const f=await ui(t),jobs=summaryJobs();await f.render(jobs,'c');assert.equal(f.d.querySelector('[role="tabpanel"]:not([hidden])').dataset.workspaceSection,'completed');assert.equal(f.d.querySelector('[aria-current="true"]').textContent.includes('SYNTHETIC ready'),true);
 await f.click(f.d.querySelectorAll('[role="tab"]')[0]);await f.render(jobs.map(j=>({...j})),'c');assert.equal(f.d.querySelector('[role="tabpanel"]:not([hidden])').dataset.workspaceSection,'published','polling does not steal the user section');
 jobs[1].workspace_section='in_progress';await f.render([...jobs],'c');assert.equal(f.d.querySelector('[role="tabpanel"]:not([hidden])').dataset.workspaceSection,'in_progress');assert.equal(f.d.querySelector('[aria-current="true"]').closest('[role="tabpanel"]').hidden,false);assert.deepEqual([...f.d.querySelectorAll('.production-section-count')].map(e=>e.textContent),['1','0','2','0']);
 await f.click(f.d.querySelectorAll('[role="tab"]')[1]);assert.match(f.d.querySelector('[role="tabpanel"]:not([hidden])').textContent,/还没有已审核完成的成片/);assert.deepEqual(f.selected,[]);
});
test('workspace tabs support arrow, Home and End keyboard focus and keep task buttons disabled while busy',async t=>{
 const f=await ui(t);await f.render(summaryJobs(),null,true);let tabs=[...f.d.querySelectorAll('[role="tab"]')];tabs[3].focus();await f.key(tabs[3],'ArrowRight');assert.equal(tabs[0].getAttribute('aria-selected'),'true');assert.equal(f.d.activeElement,tabs[0]);
 await f.key(tabs[0],'End');assert.equal(tabs[3].getAttribute('aria-selected'),'true');await f.key(tabs[3],'Home');assert.equal(tabs[0].getAttribute('aria-selected'),'true');await f.key(tabs[0],'ArrowLeft');assert.equal(tabs[3].getAttribute('aria-selected'),'true');assert.equal(f.d.querySelector('[data-task-select]').disabled,true);assert.equal(tabs.filter(e=>e.tabIndex===0).length,1);
});

test('cancellation stays separate from task selection and archived work has no cancel action',async t=>{const f=await ui(t),jobs=summaryJobs();await f.render(jobs);const button=f.d.querySelector('.production-task-cancel');assert.ok(button);assert.equal(button.closest('[role=tabpanel]').dataset.workspaceSection,'in_progress');assert.equal(button.parentElement.querySelector('button button'),null);await f.click(button);assert.deepEqual(f.cancelled,['w']);assert.deepEqual(f.selected,[]);assert.equal(f.d.querySelectorAll('.production-task-cancel').length,1);jobs[2]={...jobs[2],status:'cancelled',...place({...clip(),status:'cancelled'})};await f.render(jobs,'w');assert.equal(f.d.querySelector('[role=tabpanel]:not([hidden])').dataset.workspaceSection,'cancelled');assert.equal(f.d.querySelectorAll('.production-task-cancel').length,0);assert.match(f.d.querySelector('[role=tabpanel]:not([hidden])').textContent,/已取消制作/);});

test('the task list renders saved clone failure and continuation timing without offering another approval',async t=>{
 const f=await ui(t),jobs=summaryJobs(),j=jobs[2];j.workspace_badge='本人换声受阻';j.status_label='工作室草稿准备 · 尚未取得本人音轨';j.clone_progress={request_id:'acl_'+'a'.repeat(64),stage:'blocked',label:'本人换声受阻',phase:'工作室草稿准备',reason:'尚未取得本人音轨',next_step:'沿同一原请求接续，无需重新首审。',first_review_at:'2026-10-23T04:54:24.000Z',created_at:'2026-10-23T04:54:24.000Z',updated_at:'2026-10-25T05:59:00.000Z',failure_code:'STUDIO_PREVIEW_BROWSER_UI_ERROR',failure_count:3,last_failed_at:'2026-10-25T05:59:00.000Z',next_retry_at:'2026-10-25T06:05:00.000Z'};
 await f.render(jobs);const row=f.d.querySelector('[data-clone-list-progress]');assert.ok(row);assert.match(row.textContent,/首审通过后已等待.*连续 3 次未完成/);assert.match(row.textContent,/北京时间.*14:05/);assert.match(row.parentElement.textContent,/本人换声受阻.*工作室草稿准备/);assert.deepEqual(f.selected,[]);assert.equal(row.parentElement.querySelectorAll('button').length,0);
});
