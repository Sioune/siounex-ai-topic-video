import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import{renderToStaticMarkup}from'react-dom/server';
const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=createRequire(process.env.TOPIC_TEST_PACKAGE||new URL('../.sites-runtime/test-deps/package.json',import.meta.url))('jsdom');
const out=await build({stdin:{contents:"export {SiteArchiveFiles,visibleSiteArchives} from './components/site-archive-files';export {NativeVideoArchive} from './components/native-video-archive';export {default as NativeHandoff} from './components/native-handoff';export {HistoricalPreparation} from './components/production-desk';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false});
const mod={exports:{}};new Function('require','module','exports',out.outputFiles[0].text)(require,mod,mod.exports);
const {SiteArchiveFiles,visibleSiteArchives,NativeVideoArchive,NativeHandoff,HistoricalPreparation}=mod.exports;
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const binding={revision:2,script_hash:'b'.repeat(64),mode_epoch:0,contract_hash:'c'.repeat(64),candidate_id:'native_video_'+ 'd'.repeat(64),candidate_sha256:'e'.repeat(64),project_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',timeline_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'};
 const j={id:'job_79fcd694-545b-4423-971c-984d95b5511c',revision:2,approved_revision:2,approved_hash:binding.script_hash,mode_epoch:0,contract_hash:binding.contract_hash,updated_at:'now',milestones:[],media_continuation:{scope:{id:'scope-SYNTHETIC'}},facts:{candidate_record_id:binding.candidate_id,candidate_video_sha256:binding.candidate_sha256,candidate_owner_review:{id:'review-SYNTHETIC',decision:'approved',binding}}};
 const make=(role,n)=>({schema:'site-private-file-archive-v1',site_archive_id:'sitefile_'+String(n).repeat(64),storage:'site-private-r2',binding:copy(binding),owner_review_id:'review-SYNTHETIC',scope_id:'scope-SYNTHETIC',scope_hash:'f'.repeat(64),file:{role,sha256:role==='video'?binding.candidate_sha256:'a'.repeat(64),size_bytes:1234,file_name:'SYNTHETIC '+role+(role.includes('bundle')?'.zip':role.startsWith('cover')?'.png':role==='video'?'.mp4':'.txt'),mime_type:role==='video'?'video/mp4':role.includes('bundle')?'application/zip':role.startsWith('cover')?'image/png':'text/plain'},status:'confirmed',part_size:524288,part_count:1,created_at:'2026-10-17T00:00:00Z',confirmed_at:'2026-10-17T01:00:00Z',materialized_sha256:role==='video'?binding.candidate_sha256:'a'.repeat(64),manifest_sha256:'a'.repeat(64),quality_approved:false,publication_authorized:false,new_paid_calls:0});
 j.facts.site_file_archives=[make('video',1),make('source_bundle',2),make('cover_3_4',3),make('promotion',4)];
 return{j,make};
}
function render(C,props){return new JSDOM(renderToStaticMarkup(React.createElement(C,props))).window.document;}
test('current Site files show owner-relative playback/download links and distinguish production ZIP from full delivery',()=>{
 const {j}=fixture(),before=copy(j),d=render(NativeVideoArchive,{job:j});assert.equal(d.querySelector('#native-video-archive')?.getAttribute('aria-label'),'本站私有文件归档');assert.match(d.body.textContent,/本站私有归档/);assert.match(d.body.textContent,/制作归档包 ZIP/);assert.match(d.body.textContent,/完整交付包尚未归档/);assert.doesNotMatch(d.body.textContent,/Library 版本|资料库|已发布|质量已通过/);
 const links=[...d.querySelectorAll('a')];assert.ok(links.length>=5);for(const a of links){assert.ok(a.getAttribute('href').startsWith('/api/site-archive?id='));assert.ok(a.getAttribute('href').includes('&archive=sitefile_'));assert.doesNotMatch(a.href,/r2|library|token|owner_id/);}
 assert.match(d.querySelector('img').alt,/归档文件预览/);assert.match(d.body.textContent,/封面质量待单独审核/);assert.match(d.body.textContent,/宣发文案待单独审核/);assert.equal(d.querySelectorAll('button').length,0);assert.deepEqual(j,before);
});
test('Site file cards also appear in native handoff without requiring a new claim or write',()=>{
 const {j}=fixture(),d=render(NativeHandoff,{job:j});assert.ok(d.querySelector('#site-archive-handoff'));assert.match(d.body.textContent,/正在核对批准稿/);assert.match(d.body.textContent,/下载制作归档包 ZIP/);assert.equal(d.querySelectorAll('button').length,0);
});
test('a real complete bundle has its own label and removes only the pending-complete message',()=>{
 const {j,make}=fixture();j.facts.site_file_archives.push(make('complete_bundle',5));const d=render(SiteArchiveFiles,{job:j});assert.match(d.body.textContent,/完整交付包 ZIP/);assert.doesNotMatch(d.body.textContent,/完整交付包尚未归档/);
});
for(const [name,change]of [['revision',a=>a.binding.revision++],['script',a=>a.binding.script_hash='9'.repeat(64)],['epoch',a=>a.binding.mode_epoch++],['contract',a=>a.binding.contract_hash='9'.repeat(64)],['candidate',a=>a.binding.candidate_id='old'],['candidate bytes',a=>a.binding.candidate_sha256='9'.repeat(64)],['review',a=>a.owner_review_id='old'],['scope',a=>a.scope_id='old'],['unconfirmed',a=>a.status='sealed'],['wrong bytes',a=>a.materialized_sha256='9'.repeat(64)]]){
 test('stale Site archive links stay hidden: '+name,()=>{const {j}=fixture();for(const a of j.facts.site_file_archives)change(a);assert.equal(visibleSiteArchives(j).length,0);assert.equal(render(SiteArchiveFiles,{job:j}).querySelector('a'),null);});
}
test('archive metadata stays plain text and same-origin links never embed a supplied file URL',()=>{
 const {j}=fixture();j.facts.site_file_archives[0].file.file_name='<img src=x onerror=alert(1)>.mp4';const d=render(SiteArchiveFiles,{job:j});assert.equal(d.querySelectorAll('img').length,1);assert.match(d.body.textContent,/<img src=x/);assert.equal(d.querySelectorAll('script').length,0);
});
test('Library-only and no-archive jobs retain the existing path',()=>{
 const {j}=fixture();delete j.facts.site_file_archives;j.facts.native_video_archive={file_name:'SYNTHETIC old.mp4',size_bytes:1234,version:9,sha256:'a'.repeat(64),verified_at:'2026-10-17'};
 const d=render(NativeVideoArchive,{job:j});assert.match(d.body.textContent,/Library 版本 9/);assert.equal(d.querySelector('a').href,'https://chatgpt.com/');assert.doesNotMatch(d.body.textContent,/本站私有归档与下载/);delete j.facts.native_video_archive;assert.equal(render(NativeVideoArchive,{job:j}).body.textContent,'');
});
test('historical preparation is closed and clearly separated only after a current video exists',()=>{
 const child=React.createElement('p',null,'SYNTHETIC 旧检查：缺录音');
 const d=render(HistoricalPreparation,{archived:true,children:child});const details=d.querySelector('details[data-historical-preparation]');assert.ok(details);assert.equal(details.hasAttribute('open'),false);assert.match(details.querySelector('summary').textContent,/已有归档成片，无需重复制作/);assert.match(details.textContent,/旧缺项不是当前归档成片的新制作指令/);
 const normal=render(HistoricalPreparation,{archived:false,children:child});assert.equal(normal.querySelector('details'),null);assert.equal(normal.body.textContent,'SYNTHETIC 旧检查：缺录音');
 const {j}=fixture();delete j.media_continuation;assert.equal(visibleSiteArchives(j).length,0);
});
test('cover and promotion approval comes only from the current formal node matching this archive ID and SHA',()=>{
 const {j}=fixture(),cover=j.facts.site_file_archives[2],promo=j.facts.site_file_archives[3];
 const milestone=(node,a,status='approved',version=1)=>({id:'SYNTHETIC-'+node,node,revision:j.revision,mode_epoch:j.mode_epoch,artifact_version:version,status,artifact:JSON.stringify({assets:[{site_archive_id:a.site_archive_id,sha256:a.file.sha256}]})});
 j.milestones=[milestone('cover',cover),milestone('promotion',promo)];
 j.milestones[1].artifact=JSON.stringify({text:'SYNTHETIC approved public copy',limits:JSON.stringify({schema:'site-promotion-file-v1',site_archive_id:promo.site_archive_id,sha256:promo.file.sha256})});
 let d=render(SiteArchiveFiles,{job:j});assert.match(d.body.textContent,/本文件已通过本人封面节点审核/);assert.match(d.body.textContent,/本文件已通过本人宣发节点审核/);assert.doesNotMatch(d.body.textContent,/封面质量待单独审核|宣发文案待单独审核/);
 for(const key of ['site_archive_id','sha256']){const changed=copy(j),a=JSON.parse(changed.milestones[0].artifact);a.assets[0][key]='different';changed.milestones[0].artifact=JSON.stringify(a);d=render(SiteArchiveFiles,{job:changed});assert.match(d.body.textContent,/封面质量待单独审核/);}
 j.milestones.push(milestone('cover',cover,'awaiting_human',2));d=render(SiteArchiveFiles,{job:j});assert.match(d.body.textContent,/封面质量待单独审核/);assert.doesNotMatch(d.body.textContent,/本文件已通过本人封面节点审核/);
 j.milestones[2].status='revise';d=render(SiteArchiveFiles,{job:j});assert.match(d.body.textContent,/封面节点已打回/);
 j.milestones[2].status='invalidated';d=render(SiteArchiveFiles,{job:j});assert.match(d.body.textContent,/封面质量待单独审核/);
});

