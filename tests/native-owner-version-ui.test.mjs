// Synthetic read-only UI fixtures. No live job, media, or approval operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(new URL('../package.json',import.meta.url));
const output=await build({stdin:{contents:"export {NativeVideoVersions} from './components/native-video-archive';export {SiteArchiveFiles,NativeSiteMilestone} from './components/site-archive-files';export {currentCandidateOwnerReview,NativeCandidateOwnerReviewNotice} from './components/native-handoff';export {currentProductionMilestone,archivedOrdinaryVideoStatus} from './components/production-desk';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false});
const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(require,module,module.exports);
const {NativeVideoVersions,SiteArchiveFiles,NativeSiteMilestone,currentCandidateOwnerReview,NativeCandidateOwnerReviewNotice,currentProductionMilestone,archivedOrdinaryVideoStatus}=module.exports;
const clone=x=>JSON.parse(JSON.stringify(x));
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
function fixture(){
 const binding={revision:1,script_hash:'a'.repeat(64),mode_epoch:0,contract_hash:'b'.repeat(64),candidate_id:'native_video_'+'c'.repeat(64),candidate_sha256:'d'.repeat(64),project_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',timeline_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'};
 const review={id:'SYNTHETIC-owner-voice-review',binding,decision:'approved',quote:'SYNTHETIC 这两个本人声版本可以，继续归档。',reported_at:'2026-10-18T00:00:00Z',source_thread_id:null,sequence:1,source:'owner-oral-report',reviewed_voice_kind:'owner-cloned',website_button_clicked:false,formal_milestone_approved:false,quality_approved:false,publication_authorized:false,new_paid_calls:0};
 const archive=(role,id)=>({schema:'site-private-file-archive-v1',site_archive_id:'sitefile_'+id.repeat(64),storage:'site-private-r2',binding:clone(binding),owner_review_id:review.id,scope_id:'SYNTHETIC-scope',scope_hash:'e'.repeat(64),file:{role,sha256:role==='video'?binding.candidate_sha256:'f'.repeat(64),size_bytes:1234,file_name:role==='video'?'SYNTHETIC 最新本人声.mp4':'SYNTHETIC 新版完整包.zip',mime_type:role==='video'?'video/mp4':'application/zip'},status:'confirmed',part_size:524288,part_count:1,created_at:'2026-10-18T00:00:00Z',confirmed_at:'2026-10-18T00:01:00Z',materialized_sha256:role==='video'?binding.candidate_sha256:'f'.repeat(64),manifest_sha256:'f'.repeat(64),quality_approved:false,publication_authorized:false,new_paid_calls:0});
 const files=[archive('video','1'),archive('complete_bundle','2')];
 const current={id:'SYNTHETIC-current-video',node:'video',revision:1,mode_epoch:0,artifact_version:2,status:'approved',artifact:JSON.stringify({sha256:binding.candidate_sha256,qa:{native_handoff:true,native_candidate_id:binding.candidate_id,site_archive_id:files[0].site_archive_id,file_name:files[0].file.file_name,voice_kind:'owner-cloned',approved_native_version_id:'apv_'+'3'.repeat(64),owner_review_source:'owner-oral-report',website_button_clicked:false}})};
 const historical={id:'SYNTHETIC-old-video',node:'video',revision:1,mode_epoch:0,artifact_version:1,status:'superseded',artifact:JSON.stringify({sha256:'4'.repeat(64),qa:{native_handoff:true,site_archive_id:'sitefile_'+'5'.repeat(64),file_name:'SYNTHETIC 历史普通配音.mp4'}})};
 const job={id:'job_1c2556b8-53d5-4dc0-8d7a-faec60fa36ba',is_test:0,status:'completed',revision:1,approved_revision:1,approved_hash:binding.script_hash,mode_epoch:0,contract_hash:binding.contract_hash,milestones:[historical,current],media_continuation:{scope:{id:'SYNTHETIC-scope'}},facts:{candidate_record_id:binding.candidate_id,candidate_video_sha256:binding.candidate_sha256,candidate_owner_review:review,site_file_archives:files,video_approval:'owner-node-approved',files_archived:true,complete_package_archived:true}};
 return {job,review,current,historical};
}

test('current owner-cloned review retains exact binding and does not claim a website approval click',()=>{
 const {job,review}=fixture();assert.equal(currentCandidateOwnerReview(job)?.id,review.id);
 const html=render(NativeCandidateOwnerReviewNotice,{review,archived:true,formalStatus:'approved'});
 assert.match(html,/本人声音版/);assert.match(html,/聊天审片确认已回传正式视频节点/);assert.match(html,/未记录网站按钮点击/);assert.doesNotMatch(html,/普通配音版|已点击|已发布/);
 const stale=clone(job);stale.facts.candidate_owner_review.binding.candidate_sha256='9'.repeat(64);assert.equal(currentCandidateOwnerReview(stale),null);
 const invalid=clone(job);invalid.facts.candidate_owner_review.reviewed_voice_kind='cloned-final';assert.equal(currentCandidateOwnerReview(invalid),null);
});

test('latest committed owner voice is current while the old ordinary file is a closed historical record',()=>{
 const {job,current}=fixture();assert.equal(currentProductionMilestone(job,'video')?.id,current.id);
 assert.equal(archivedOrdinaryVideoStatus(job),'本人声音版 · 交付已完成');
 const html=render(NativeVideoVersions,{job}),history=html.indexOf('data-historical-native-videos');
 assert.ok(history>0);assert.match(html.slice(0,history),/SYNTHETIC 最新本人声/);assert.doesNotMatch(html.slice(0,history),/SYNTHETIC 历史普通配音/);
 assert.match(html.slice(history),/历史成片版本|历史普通配音|下载历史成片/);assert.doesNotMatch(html,/<details[^>]*\sopen(?:=|\s|>)/);
 assert.match(html,/archive=sitefile_555555/);assert.doesNotMatch(html,/token=|owner_id=/);
});

test('current archive points only at current owner-voice video and bundle without modifying the input',()=>{
 const {job,current}=fixture(),before=clone(job),html=render(SiteArchiveFiles,{job});
 assert.match(html,/当前交付为本人声音版/);assert.match(html,/最新本人声|新版完整包/);assert.doesNotMatch(html,/历史普通配音/);
 const node=render(NativeSiteMilestone,{job,milestone:current});assert.match(node,/已登记本人在制作对话中的成片确认/);assert.doesNotMatch(node,/已点击|网站按钮已/);
 assert.deepEqual(job,before);
});

test('stale archived bindings cannot become current through the owner-voice label',()=>{
 const {job}=fixture();job.facts.site_file_archives[0].binding.candidate_id='native_video_'+'9'.repeat(64);
 assert.equal(archivedOrdinaryVideoStatus(job),null);
 assert.doesNotMatch(render(SiteArchiveFiles,{job}),/最新本人声/);
});

test('local audio finishing is labeled separately from a ChatCut native render while preserving the editable project',()=>{
 const {job,current}=fixture(),artifact=JSON.parse(current.artifact);Object.assign(artifact.qa,{delivery_method:'local-audio-only-finishing',delivery_id:'site_delivery_'+'6'.repeat(64),render_id:null,native_render_id:null,project_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'});current.artifact=JSON.stringify(artifact);
 const html=render(NativeSiteMilestone,{job,milestone:current});assert.match(html,/本地音轨混合成品，保留ChatCut可编辑工程/);assert.match(html,/最终音轨在本地混合/);assert.match(html,/本文件未使用ChatCut原生渲染/);assert.match(html,/app\.chatcut\.io\/editor\/aaaaaaaa/);assert.match(html,/播放本站归档成片/);assert.match(html,/本人声音版/);
 const old=clone(current),legacy=JSON.parse(old.artifact);delete legacy.qa.delivery_method;old.artifact=JSON.stringify(legacy);assert.doesNotMatch(render(NativeSiteMilestone,{job,milestone:old}),/本地音轨混合成品/);
});

test('ordinary native versions separate old artifacts and mode epochs from the current review',()=>{
 const {job,current,historical}=fixture();job.facts.candidate_owner_review.reviewed_voice_kind='ordinary-temporary';historical.status='approved';
 const artifact=JSON.parse(current.artifact);artifact.qa.voice_kind='ordinary-temporary';current.artifact=JSON.stringify(artifact);
 const oldEpoch=clone(current);oldEpoch.id='SYNTHETIC-old-epoch';oldEpoch.mode_epoch=9;oldEpoch.artifact_version=99;oldEpoch.artifact=JSON.stringify({sha256:'8'.repeat(64),qa:{native_handoff:true,file_name:'SYNTHETIC prior mode epoch.mp4',duration_seconds:10,size_bytes:1024}});job.milestones.push(oldEpoch);
 const before=clone(job),html=render(NativeVideoVersions,{job}),history=html.indexOf('data-historical-native-videos');assert.ok(history>0);
 assert.match(html.slice(0,history),/SYNTHETIC 最新本人声/);assert.doesNotMatch(html.slice(0,history),/SYNTHETIC 历史普通配音|SYNTHETIC prior mode epoch/);
 assert.match(html.slice(history),/SYNTHETIC 历史普通配音/);assert.match(html.slice(history),/SYNTHETIC prior mode epoch/);assert.doesNotMatch(html.slice(history),/原生草稿已回站|前往视频里程碑审核/);assert.deepEqual(job,before);
});

test('unarchived current native return also uses the current epoch and latest artifact version',()=>{
 const {job,current,historical}=fixture();job.facts={};delete job.media_continuation;job.mode_epoch=2;
 current.mode_epoch=2;current.status='awaiting_human';current.artifact=JSON.stringify({sha256:'a'.repeat(64),qa:{native_handoff:true,file_name:'SYNTHETIC current unarchived.mp4',duration_seconds:30,size_bytes:1024}});
 historical.mode_epoch=1;historical.status='approved';historical.artifact_version=50;
 const html=render(NativeVideoVersions,{job}),history=html.indexOf('data-historical-native-videos');assert.ok(history>0);assert.match(html.slice(0,history),/SYNTHETIC current unarchived/);assert.match(html.slice(0,history),/待本人审片/);assert.doesNotMatch(html.slice(0,history),/历史普通配音/);
});
