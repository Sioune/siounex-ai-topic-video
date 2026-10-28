// Synthetic read-only SSR; no real owner action, Site write or media approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(new URL('../package.json',import.meta.url));
const built=await build({stdin:{contents:"export {default as MediaContinuation,miniScopeResume} from './components/media-continuation';export {SiteArchiveFiles,NativeSiteMilestone,visibleSiteArchives} from './components/site-archive-files';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
const {MediaContinuation,miniScopeResume,SiteArchiveFiles,NativeSiteMilestone,visibleSiteArchives}=module.exports;
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){
 const binding={revision:2,script_hash:'a'.repeat(64),mode_epoch:0,contract_hash:'b'.repeat(64),candidate_id:'native_video_'+'c'.repeat(64),candidate_sha256:'d'.repeat(64),project_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',timeline_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'};
 const pending='nsd_'+'1'.repeat(64),scope={id:'SYNTHETIC-owner-scope',scope:'private-video',binding:{revision:2,script_hash:binding.script_hash,mode_epoch:0,contract_hash:binding.contract_hash},new_paid_authorization:false,publication_authorization:false,quality_approved:false};
 const archives=['video','cover_3_4','cover_4_3','promotion'].map((role,i)=>{const sha=role==='video'?binding.candidate_sha256:'e'.repeat(64);return{schema:'site-private-file-archive-v1',site_archive_id:'sitefile_'+String(i+2).repeat(64),storage:'site-private-r2',binding,owner_review_id:null,pending_native_request_id:pending,quality_review:'awaiting-human',scope_id:scope.id,scope_hash:'f'.repeat(64),file:{role,sha256:sha,size_bytes:1000,file_name:'SYNTHETIC-'+role+(role==='video'?'.mp4':role==='promotion'?'.txt':'.png'),mime_type:role==='video'?'video/mp4':role==='promotion'?'text/plain':'image/png'},status:'confirmed',part_size:524288,part_count:1,created_at:'2026-10-18T00:00:00Z',confirmed_at:'2026-10-18T00:01:00Z',materialized_sha256:sha,manifest_sha256:'f'.repeat(64),quality_approved:false,publication_authorized:false,new_paid_calls:0};});
 const current={id:'SYNTHETIC-new-node',node:'video',revision:2,mode_epoch:0,artifact_version:2,status:'awaiting_human',artifact:JSON.stringify({sha256:binding.candidate_sha256,qa:{native_handoff:true,native_candidate_id:binding.candidate_id,pending_native_site_id:pending,site_archive_id:archives[0].site_archive_id,file_name:archives[0].file.file_name,project_id:binding.project_id,timeline_id:binding.timeline_id,render_id:'cccccccc-cccc-cccc-cccc-cccccccccccc',native_render_id:'cccccccc-cccc-cccc-cccc-cccccccccccc',quality_approved:false}})};
 const old={id:'SYNTHETIC-old-node',node:'video',revision:2,mode_epoch:0,artifact_version:1,status:'revise',artifact:'{}'};
 const job={id:'job_9ef39025-d92e-4770-82d0-05881451c5df',is_test:0,status:'approved',review_mode:'node',revision:2,approved_revision:2,approved_hash:binding.script_hash,mode_epoch:0,contract_hash:binding.contract_hash,reworks:1,publication_reports:[],milestones:[old,current],stages:[],media_continuation:{current_id:scope.id,scope,licenses:[]},facts:{site_file_archives:archives,candidate_present:true,candidate_record_id:binding.candidate_id,candidate_video_sha256:binding.candidate_sha256,video_approval:'not-recorded',files_archived:true,complete_package_archived:false,native_completion_evidence:{source:'actual-native-render-and-four-confirmed-private-site-files',quality_approved:false}}};
 return{job,current,old};
}
test('paused exact Mini v2 rejection exposes the real owner scope form without approving the film',()=>{
 const {job,old}=fixture();job.status='paused';job.milestones=[old];job.facts={};
 assert.equal(miniScopeResume(job)?.id,old.id);const html=render(MediaContinuation,{job,onSaved:()=>{}});
 assert.match(html,/预览继续范围/);assert.match(html,/准备并允许零新增费用私有视频制作/);assert.match(html,/当前稿未获媒体继续授权|旧范围已失效/);assert.doesNotMatch(html,/本站只读交接信息|当前视频节点已在本站通过/);
 for(const mutate of [v=>{v.revision=3},v=>{v.reworks=3},v=>{v.milestones[0].status='awaiting_human'},v=>{v.is_test=1}]){const invalid=clone(job);mutate(invalid);assert.equal(miniScopeResume(invalid),null);}
});
test('four pending Site files display without an invented owner approval or Library identity',()=>{
 const {job,current}=fixture();assert.equal(visibleSiteArchives(job).length,4);
 const html=render(SiteArchiveFiles,{job});assert.match(html,/待本人审核/);assert.match(html,/播放本版成片/);assert.match(html,/3:4 封面原件/);assert.match(html,/4:3 封面原件/);assert.match(html,/宣发文案/);assert.doesNotMatch(html,/已通过本人封面节点|已通过本人宣发节点|Library 版本|已回传正式视频节点.*通过/);
 const node=render(NativeSiteMilestone,{job,milestone:current});assert.match(node,/待本人审片/);assert.match(node,/播放本站归档成片/);assert.doesNotMatch(node,/当前正式视频节点已通过本人审核/);
 assert.match(node,/<video[^>]*controls/);
});
test('actual owner approval replaces pending film copy without rewriting immutable intake review fields',()=>{const {job,current}=fixture();current.status='approved';const html=render(SiteArchiveFiles,{job});assert.match(html,/成片节点已通过本人审核/);assert.doesNotMatch(html,/成片待本人审核/);assert.equal(job.facts.site_file_archives[0].quality_review,'awaiting-human');});

test('actual rejection keeps the private files while the banner asks for a new revision',()=>{const {job,current}=fixture();current.status='revise';job.status='paused';const html=render(SiteArchiveFiles,{job});assert.match(html,/成片已打回，保留本版并按意见另交新文件/);assert.doesNotMatch(html,/成片待本人审核|成片节点已通过本人审核/);assert.equal(visibleSiteArchives(job).length,4);});
test('stale pending file bindings are hidden and old preparation is described as history only after real native completion',()=>{
 const {job}=fixture();job.stages=[{id:'SYNTHETIC-old-probe',stage:'media_inputs',review_revision:2,status:'blocked',result:JSON.stringify({scope_id:job.media_continuation.scope.id,binding:job.media_continuation.scope.binding,attempt:1,receipt:{checks:[{code:'SYNTHETIC',passed:false,detail:'Old preparation was incomplete'}]}})}];
 const html=render(MediaContinuation,{job,onSaved:()=>{}});assert.match(html,/已由独立原生完成回执接续，不表示仍有制作任务空等/);assert.doesNotMatch(html,/排队一次只读重查/);
 job.mode_epoch=1;assert.deepEqual(visibleSiteArchives(job),[]);
});
