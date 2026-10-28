// Isolated metadata test. No provider, browser, model, generation, or owner-approval write.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['lib/studio-preview-owner-policy.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'inherited-policy-fixture',setup(b){
 b.onResolve({filter:/^\.\/store$/},()=>({path:'store',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/automatic-clone$/},()=>({path:'clone',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='store'?`export function db(){return {prepare(){return {bind(){return {async first(){return null},async run(){throw Error('read must not register an owner policy')}}}}}}}`:`export async function studioPreviewOwnerContext(){return globalThis.inheritedPolicyFixture}`}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
test('project instruction supplies ordinary free-preview continuation without a per-request approval or fabricated button click',async()=>{
 const job='job_12345678-1234-4234-8234-123456789012',request='acl_'+'a'.repeat(64),p={id:request,job_id:job,owner_id:'SYNTHETIC',acquisition_method:'heygen_studio_audio_preview',binding:{revision:1,mode_epoch:0,script_hash:'b'.repeat(64),contract_hash:'c'.repeat(64)},base:{milestone_id:'SYNTHETIC-base',artifact_hash:'d'.repeat(64),video_sha256:'e'.repeat(64)},first_review_id:'SYNTHETIC-first',voice_id:'SYNTHETIC-voice',scope_id:'SYNTHETIC-scope',version:1,engine:'elevenlabs',provider_call_started:true};
 globalThis.inheritedPolicyFixture={p,j:{drafts:[{revision:1,content_hash:p.binding.script_hash,content:JSON.stringify({script:'SYNTHETIC approved voice text'})}]}};
 try{
 const r=await api.readStudioPreviewGenerationState(job,{request_id:request},{trusted_owner_service:true});
 assert.equal(r.policy.instruction.source,'project-owner-policy');assert.equal(r.policy.instruction.owner_button_clicked,false);
 assert.equal(r.policy.flags.new_payment_limit,0);assert.equal(r.previous_evidence.outcome,'unchanged-unknown');assert.equal(r.media_started,false);assert.equal(r.new_play_allowed,false);
 assert.equal(r.policy.binding.request_id,request);
 }finally{delete globalThis.inheritedPolicyFixture;}
});
