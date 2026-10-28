// Synthetic read-only SSR fixtures. No production storage, media, or approvals.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=createRequire(process.env.TOPIC_TEST_PACKAGE||new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom');
const output=await build({stdin:{contents:"export {NativeVideoArchive,NativeVideoVersions} from './components/native-video-archive';export {SiteArchiveFiles,NativeSiteMilestone,visibleSiteArchives,siteArchiveWasDeleted} from './components/site-archive-files';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(require,module,module.exports);
const {NativeVideoArchive,NativeVideoVersions,SiteArchiveFiles,NativeSiteMilestone,visibleSiteArchives,siteArchiveWasDeleted}=module.exports;
const copy=x=>JSON.parse(JSON.stringify(x));
const render=(Component,props)=>new JSDOM(renderToStaticMarkup(React.createElement(Component,props))).window.document;
function fixture(){
 const binding={revision:1,script_hash:'a'.repeat(64),mode_epoch:0,contract_hash:'b'.repeat(64),candidate_id:'native_video_'+'c'.repeat(64),candidate_sha256:'d'.repeat(64),project_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',timeline_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'};
 const review={id:'SYNTHETIC-review',decision:'approved',reviewed_voice_kind:'owner-cloned',binding:copy(binding)};
 const roles=['video','source_bundle','cover_3_4','cover_4_3','promotion','complete_bundle'];
 const files=roles.map((role,i)=>({schema:'site-private-file-archive-v1',site_archive_id:'sitefile_'+String(i+1).repeat(64),storage:'site-private-r2',binding:copy(binding),owner_review_id:review.id,scope_id:'SYNTHETIC-scope',scope_hash:'e'.repeat(64),file:{role,sha256:role==='video'?binding.candidate_sha256:'f'.repeat(64),size_bytes:1234,file_name:'SYNTHETIC current '+role+(role==='video'?'.mp4':role.startsWith('cover')?'.png':role==='promotion'?'.txt':'.zip'),mime_type:role==='video'?'video/mp4':role.startsWith('cover')?'image/png':role==='promotion'?'text/plain':'application/zip'},status:'confirmed',part_size:524288,part_count:1,created_at:'2026-10-18T00:00:00Z',confirmed_at:'2026-10-18T00:01:00Z',materialized_sha256:role==='video'?binding.candidate_sha256:'f'.repeat(64),manifest_sha256:'f'.repeat(64),quality_approved:false,publication_authorized:false,new_paid_calls:0}));
 const milestone=(id,version,status,sha,qa)=>({id,node:'video',revision:1,mode_epoch:0,artifact_version:version,status,artifact:JSON.stringify({sha256:sha,qa:{native_handoff:true,...qa}})});
 const current=milestone('SYNTHETIC-current',3,'approved',binding.candidate_sha256,{site_archive_id:files[0].site_archive_id,file_name:files[0].file.file_name,voice_kind:'owner-cloned',approved_native_version_id:'apv_'+'7'.repeat(64),owner_review_source:'owner-oral-report'});
 const old=milestone('SYNTHETIC-old-site',2,'superseded','8'.repeat(64),{site_archive_id:'sitefile_'+'9'.repeat(64),file_name:'SYNTHETIC old site.mp4'});
 const library=milestone('SYNTHETIC-old-library',1,'approved','0'.repeat(64),{file_name:'SYNTHETIC old Library.mp4',duration_seconds:20,size_bytes:1234});
 const deleted={site_archive_id:'sitefile_'+'9'.repeat(64),sha256:'8'.repeat(64),deleted_at:'2026-10-18T01:00:00Z',current_archive_id:files[0].site_archive_id,policy_id:'SYNTHETIC-current-final-policy'};
 const job={id:'job_1c2556b8-53d5-4dc0-8d7a-faec60fa36ba',status:'completed',revision:1,approved_revision:1,approved_hash:binding.script_hash,mode_epoch:0,contract_hash:binding.contract_hash,milestones:[library,old,current],media_continuation:{scope:{id:'SYNTHETIC-scope'}},facts:{candidate_record_id:binding.candidate_id,candidate_video_sha256:binding.candidate_sha256,candidate_owner_review:review,site_file_archives:files,archive_retention:{rule:'current-final-per-role',deleted:[deleted]}}};
 return {job,current,old,library,deleted,files};
}

test('current final policy preserves all six current file downloads and current video playback without mutating facts',()=>{
 const {job,files}=fixture(),before=copy(job),document=render(SiteArchiveFiles,{job});
 assert.equal(visibleSiteArchives(job).length,6);assert.equal(document.querySelectorAll('a[download]').length,6);assert.equal(document.querySelectorAll('img').length,2);
 for(const file of files)assert.ok([...document.querySelectorAll('a[download]')].some(a=>a.getAttribute('href').includes(file.site_archive_id)));
 assert.ok(document.querySelector('[data-current-final-retention]'));assert.match(document.body.textContent,/按项目与成果类型仅保留当前定稿/);assert.doesNotMatch(document.body.textContent,/旧成片保留在历史版本中/);
 assert.equal(document.querySelectorAll('a').length,9);assert.deepEqual(job,before);
});

test('physically verified deleted history has no playable or downloadable URL while retaining exact hash and audit identity',()=>{
 const {job,old,deleted}=fixture(),document=render(NativeSiteMilestone,{job,milestone:old,historical:true});
 assert.ok(document.querySelector('[data-archive-retention-cleaned]'));assert.match(document.body.textContent,/已按当前定稿保留政策清理；哈希与审核记录保留/);assert.match(document.body.textContent,/SYNTHETIC old site/);assert.match(document.body.textContent,new RegExp(deleted.sha256));
 assert.equal(document.querySelector('a,video,audio,img'),null);assert.doesNotMatch(document.body.textContent,/文件仍保留|本文件保留用于|ChatGPT|ChatCut.*删除/);
});

test('retained history is closed and contains no old Site or Library playback entry; only current final has links',()=>{
 const {job,files,deleted}=fixture(),document=render(NativeVideoVersions,{job}),history=document.querySelector('details[data-historical-native-videos]');
 assert.ok(history);assert.equal(history.hasAttribute('open'),false);assert.match(history.textContent,/历史审核记录|SYNTHETIC old site|SYNTHETIC old Library/);assert.equal(history.querySelector('a,video,audio,img'),null);
 assert.doesNotMatch(document.body.innerHTML,new RegExp('archive='+deleted.site_archive_id));assert.doesNotMatch(document.body.innerHTML,/href="https:\/\/chatgpt\.com/);
 assert.ok(document.querySelector('a[download]')?.getAttribute('href').includes(files[0].site_archive_id));assert.match(document.body.textContent,/已登记本人在制作对话中的成片确认/);
});

test('unverified deletion does not claim cleanup and history remains an audit summary under the policy',()=>{
 const {job,old}=fixture();job.facts.archive_retention.deleted=[];
 const document=render(NativeSiteMilestone,{job,milestone:old,historical:true});
 assert.equal(document.querySelector('[data-archive-retention-cleaned]'),null);assert.doesNotMatch(document.body.textContent,/已.*清理|已.*删除/);assert.match(document.body.textContent,/仅展示哈希与审核摘要/);assert.equal(document.querySelector('a'),null);
});

test('cleanup label requires exact archive ID, SHA, timestamp, replacement ID and policy record',()=>{
 const {job,old,deleted}=fixture();assert.equal(siteArchiveWasDeleted(job,deleted.site_archive_id,deleted.sha256),true);
 for(const [key,value]of [['sha256','a'.repeat(64)],['site_archive_id','sitefile_'+'a'.repeat(64)],['deleted_at','not-a-date'],['current_archive_id','invalid'],['policy_id','']]){
  const changed=copy(job);changed.facts.archive_retention.deleted[0][key]=value;
  assert.equal(siteArchiveWasDeleted(changed,deleted.site_archive_id,deleted.sha256),false,key);assert.equal(render(NativeSiteMilestone,{job:changed,milestone:old,historical:true}).querySelector('[data-archive-retention-cleaned]'),null,key);
 }
 const changed=copy(job);changed.facts.archive_retention.rule='unknown';assert.equal(siteArchiveWasDeleted(changed,deleted.site_archive_id,deleted.sha256),false);
});

test('policy also separates ordinary voice history and does not depend on owner-cloned labeling',()=>{
 const {job,files}=fixture();job.facts.candidate_owner_review.reviewed_voice_kind='ordinary-temporary';
 const document=render(NativeVideoVersions,{job}),history=document.querySelector('details[data-historical-native-videos]');
 assert.ok(history);assert.equal(history.querySelector('a'),null);assert.ok(document.querySelector('a[download]')?.getAttribute('href').includes(files[0].site_archive_id));
});

test('missing current binding cannot fall back to a historical Library download under the policy',()=>{
 const {job}=fixture();job.facts.site_file_archives=[];job.facts.native_video_archive={file_name:'SYNTHETIC stale.mp4',size_bytes:1234,version:1,sha256:'a'.repeat(64),verified_at:'2026-10-18'};
 const document=render(NativeVideoArchive,{job});assert.match(document.body.textContent,/当前归档绑定需重新读取/);assert.equal(document.querySelector('a'),null);assert.doesNotMatch(document.body.textContent,/Library|已.*删除/);
 const versions=render(NativeVideoVersions,{job});assert.equal(versions.querySelector('a,video,audio'),null);
});

test('absent retention facts preserve the existing historical Site and Library behavior',()=>{
 const {job,deleted}=fixture();delete job.facts.archive_retention;
 const document=render(NativeVideoVersions,{job}),history=document.querySelector('details[data-historical-native-videos]');
 assert.ok(history);assert.ok([...history.querySelectorAll('a')].some(a=>a.getAttribute('href').includes(deleted.site_archive_id)));assert.ok(history.querySelector('a[href="https://chatgpt.com/"]'));assert.equal(history.querySelector('[data-archive-retention-cleaned]'),null);
 job.facts.site_file_archives=[];job.facts.native_video_archive={file_name:'SYNTHETIC legacy.mp4',size_bytes:1234,version:1,sha256:'a'.repeat(64),verified_at:'2026-10-18'};
 assert.ok(render(NativeVideoArchive,{job}).querySelector('a[href="https://chatgpt.com/"]'));
});

for(const status of [undefined,'pending','partial','failed','protected']){
 test('enabled policy does not claim complete cleanup before a verified completion: '+String(status),()=>{
  const {job}=fixture();Object.assign(job.facts.archive_retention,{status,pending_count:3,last_error:status==='failed'?'SYNTHETIC storage verification failed':''});
  const document=render(SiteArchiveFiles,{job}),notice=document.querySelector('[data-current-final-retention]');
  assert.match(notice.textContent,/规则已启用，旧成果清理待完成/);assert.match(notice.textContent,/待处理 3 项/);assert.doesNotMatch(notice.textContent,/清理已核验|已全部删除|Library/);assert.equal(document.querySelectorAll('a[download]').length,6);
  if(status==='failed')assert.match(notice.querySelector('[data-retention-error]').textContent,/SYNTHETIC storage verification failed/);
  if(status==='partial')assert.match(notice.textContent,/已完成部分本站旧归档清理/);
 });
}

test('complete status reports only verified website cleanup and does not imply third-party deletion',()=>{
 const {job}=fixture();job.facts.archive_retention.status='complete';
 const document=render(SiteArchiveFiles,{job}),notice=document.querySelector('[data-current-final-retention]');
 assert.equal(notice.getAttribute('data-retention-status'),'complete');assert.match(notice.textContent,/网站旧归档清理已核验/);assert.doesNotMatch(notice.textContent,/待完成|全部.*删除|Library|ChatGPT|ChatCut/);assert.equal(document.querySelectorAll('a[download]').length,6);
});

test('protected entries override a complete status and explain retained files as escaped plain text',()=>{
 const {job,deleted}=fixture();Object.assign(job.facts.archive_retention,{status:'complete',pending_count:1,protected:[{site_archive_id:deleted.site_archive_id,reason:'SYNTHETIC 当前成品仍依赖此素材 <img src=x onerror=alert(1)>'}]});
 const document=render(SiteArchiveFiles,{job}),notice=document.querySelector('[data-current-final-retention]');
 assert.equal(notice.getAttribute('data-retention-status'),'protected');assert.match(notice.textContent,/规则已启用，旧成果清理待完成/);assert.match(notice.querySelector('[data-retention-protected]').textContent,/部分保留原因|当前成品仍依赖此素材|<img src=x/);assert.equal(notice.querySelector('img,script,a'),null);assert.doesNotMatch(notice.textContent,/清理已核验|已全部删除/);
 job.facts.site_file_archives=[];assert.match(render(NativeVideoArchive,{job}).body.textContent,/部分保留原因|清理待完成/);
});
