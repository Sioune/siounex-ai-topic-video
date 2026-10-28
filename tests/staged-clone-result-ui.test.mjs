// SYNTHETIC confirmed-video projections; no production API or approval writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {cloneUiFixture,ACL} from './fixtures/automatic-clone-ui.mjs';
const require=createRequire(new URL('../package.json',import.meta.url)),built=await build({entryPoints:['components/staged-clone-result.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}),module={exports:{}};
new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
const {default:Preview,currentStagedCloneResult}=module.exports;
function fixture(){const {job}=cloneUiFixture(),archive='sitefile_'+'a'.repeat(64);return{job,value:{id:job.id,request_id:ACL,local_draft_id:'lrd_'+'b'.repeat(64),binding:{revision:job.revision,script_hash:job.approved_hash,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash},status:'staging',video:{site_archive_id:archive,sha256:'c'.repeat(64),size_bytes:9000,duration_seconds:50.438,url:'/api/site-archive?id='+encodeURIComponent(job.id)+'&archive='+archive},technical_archive:{status:'uploading',sha256:'d'.repeat(64),size_bytes:253071537},human_review_pending:true,warehouse_allowed:false,quality_approved:false,publication_authorized:false}};}
test('confirmed staged video is visible without making engineering uploads part of the review flow',()=>{const {job,value}=fixture();assert.equal(currentStagedCloneResult(job,ACL,value),value);const html=renderToStaticMarkup(React.createElement(Preview,{job,requestId:ACL,result:value}));assert.match(html,/<video/);assert.match(html,/50\.438 秒/);assert.match(html,/由你在网站审核入仓/);assert.doesNotMatch(html,/工程归档|二次审核通过并入片仓|<button[^>]*>批准/);});
test('results-only staged preview accepts the real video with no engineering archive',()=>{const {job,value}=fixture();value.delivery_mode='results-only';value.technical_archive=null;assert.equal(currentStagedCloneResult(job,ACL,value),value);const html=renderToStaticMarkup(React.createElement(Preview,{job,requestId:ACL,result:value}));assert.match(html,/<video/);assert.doesNotMatch(html,/工程|ZIP/);value.quality_approved=true;assert.equal(currentStagedCloneResult(job,ACL,value),null);});
for(const [name,mutate]of [
 ['other job',v=>v.id+='other'],['other request',v=>v.request_id='acl_'+'e'.repeat(64)],['old revision',v=>v.binding.revision++],['other script',v=>v.binding.script_hash='f'.repeat(64)],['other mode',v=>v.binding.mode_epoch++],['other contract',v=>v.binding.contract_hash='f'.repeat(64)],['foreign URL',v=>v.video.url='https://example.invalid/video.mp4'],['invalid SHA',v=>v.video.sha256='invalid'],['unknown archive state',v=>v.technical_archive.status='ready'],['fake quality approval',v=>v.quality_approved=true],['fake warehouse grant',v=>v.warehouse_allowed=true],['fake publish authorization',v=>v.publication_authorized=true]
])test('staged preview rejects '+name,()=>{const {job,value}=fixture();mutate(value);assert.equal(currentStagedCloneResult(job,ACL,value),null);assert.equal(renderToStaticMarkup(React.createElement(Preview,{job,requestId:ACL,result:value})), '');});
