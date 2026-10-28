import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import test from 'node:test';import assert from 'node:assert/strict';
import {studioReadinessCooldown,STUDIO_READINESS_CONNECTION_COOLDOWN_MS} from '../scripts/heygen-studio-readiness-cooldown.mjs';
const request_id='acl_'+'a'.repeat(64),draft_id='b'.repeat(32),speech_text_sha256='c'.repeat(64),owner='Tab 2115966085 is already part of browser session 01a16084-86ad-7da1-9b09-efdc17bb2e7e',end=1800000000000;
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-cooldown-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return{dir,request_id,draft_id,speech_text_sha256,clock:()=>end+1};}
function attempt(input,{name='readiness-11111111-1111-4111-8111-111111111111',finished=end,reason=owner,binding={},events={},exit={},started={}}={}){
 const base=path.join(input.dir,name),start={pid:1234,started_at:new Date(finished-1000).toISOString(),...started},done={...start,exit_code:0,timed_out:false,finished_at:new Date(finished).toISOString(),...exit},log={phase:'preview-readiness',classification:'child-or-ui-failure',event_stream_complete:true,observation_received:false,play_journal_saved:false,timed_out:false,exit_code:done.exit_code,events:[{tool:'cua_repl.js',status:'completed',failure_class:'ui-result-unknown',diagnostic:reason}],...events};
 fs.mkdirSync(path.join(base,'process'),{recursive:true});for(const[file,value]of [['browser-attempt.json',{phase:'preview-readiness',request_id,draft_id,speech_text_sha256,...binding}],['browser-events.json',log],['process/process-started.json',start],['process/process-exit.json',done]])fs.writeFileSync(path.join(base,file),JSON.stringify(value));return base;
}
test('a real ended same-draft ownership failure has a read-only fifteen-minute deadline and expires automatically',t=>{
 const input=fixture(t),base=attempt(input),before=new Map(fs.readdirSync(base,{recursive:true}).filter(n=>fs.statSync(path.join(base,n)).isFile()).map(n=>[n,fs.readFileSync(path.join(base,n))])),result=studioReadinessCooldown(input);
 assert.equal(STUDIO_READINESS_CONNECTION_COOLDOWN_MS,900000);assert.equal(result.reason,'tab-owned-by-another-session');assert.equal(result.next_retry_at,new Date(end+900000).toISOString());for(const[n,bytes]of before)assert.deepEqual(fs.readFileSync(path.join(base,n)),bytes);
 assert.equal(studioReadinessCooldown({...input,clock:()=>end+900000}),null);
});
for(const reason of ['Chrome disconnected','The browser extension is not connected','Browser connection is closed'])test('only recognized disconnect diagnostics can delay another probe: '+reason,t=>{const input=fixture(t);attempt(input,{reason});assert.equal(studioReadinessCooldown(input).reason,'browser-disconnected');});
for(const reason of ['site safety policy: access denied','Chrome connection timeout','Tab 2115966085 owned by another session; deadline reached','SYNTHETIC unknown network failure','Skill descriptions shortened'])test('no connection cooldown for '+reason,t=>{const input=fixture(t);attempt(input,{reason});assert.equal(studioReadinessCooldown(input),null);});
for(const patch of [{events:{classification:'security-rejection'}},{events:{observation_received:true}},{events:{play_journal_saved:true}},{events:{timed_out:true}},{exit:{timed_out:true}},{exit:{termination_unconfirmed:true}},{exit:{pid:7777}},{binding:{request_id:'acl_'+'d'.repeat(64)}},{binding:{draft_id:'d'.repeat(32)}},{binding:{speech_text_sha256:'d'.repeat(64)}}])test('changed, active or observed readiness evidence never becomes a no-audio connection delay '+JSON.stringify(patch),t=>{const input=fixture(t);attempt(input,patch);assert.equal(studioReadinessCooldown(input),null);});
test('a missing process exit, non-tool warning and existing audio or Play cannot authorize this cooldown',t=>{
 const input=fixture(t),base=attempt(input);fs.unlinkSync(path.join(base,'process/process-exit.json'));assert.equal(studioReadinessCooldown(input),null);
 attempt(input,{events:{events:[{tool:null,status:null,diagnostic:owner}]}});assert.equal(studioReadinessCooldown(input),null);
 attempt(input);for(const name of ['studio-play-observed.json','preview-loaded-audio.json']){fs.writeFileSync(path.join(input.dir,name),'{}');assert.equal(studioReadinessCooldown(input),null);fs.unlinkSync(path.join(input.dir,name));}
});
test('a newer successful or unknown same-draft check supersedes an older ownership failure',t=>{
 const input=fixture(t);attempt(input,{finished:end-2000});attempt(input,{name:'readiness-22222222-2222-4222-8222-222222222222',events:{classification:'observation-received',observation_received:true}});assert.equal(studioReadinessCooldown(input),null);
 attempt(input,{name:'readiness-22222222-2222-4222-8222-222222222222',reason:'SYNTHETIC unknown failure'});assert.equal(studioReadinessCooldown(input),null);
});
test('an ownership error cannot turn another unknown tool failure into a connection cooldown',t=>{const input=fixture(t);attempt(input,{events:{events:[{tool:'cua_repl.js',status:'failed',diagnostic:owner},{tool:'cua_repl.js',status:'failed',diagnostic:'SYNTHETIC unknown result'}]}});assert.equal(studioReadinessCooldown(input),null);});

test('a finished exact-draft CLI rate limit defers only another read and does not extend through repeated checks',t=>{
 const input=fixture(t);attempt(input,{events:{failure_code:'NATIVE_CLI_RATE_LIMITED',events:[{event:'error',diagnostic:'HTTP 429 Too Many Requests'}],tool_call_count:0,browser_tool_call_count:0}});const first=studioReadinessCooldown(input);assert.equal(first.reason,'native-cli-rate-limited');assert.equal(first.next_retry_at,new Date(end+900000).toISOString());assert.equal(studioReadinessCooldown({...input,clock:()=>end+800000}).next_retry_at,first.next_retry_at);assert.equal(studioReadinessCooldown({...input,clock:()=>end+900000}),null);
 fs.writeFileSync(path.join(input.dir,'studio-play-observed.json'),'{}');assert.equal(studioReadinessCooldown(input),null);
});
test('a completed zero-tool readiness without an observation pauses identical reads but never becomes a Play permit',t=>{
 const input=fixture(t);attempt(input,{events:{classification:'observation-missing',tool_call_count:0,browser_tool_call_count:0,events:[{event:'item.completed',item_type:'error',diagnostic:'Skill descriptions were shortened'}]}});assert.equal(studioReadinessCooldown(input).reason,'browser-observation-not-produced');
 attempt(input,{events:{classification:'observation-missing',tool_call_count:1,browser_tool_call_count:1,events:[]}});assert.equal(studioReadinessCooldown(input),null);
});
test('the same bounded rate-limit delay can protect preparation while excluding actual preview phases',t=>{
 const input=fixture(t);attempt(input,{name:'browser-11111111-1111-4111-8111-111111111111',binding:{phase:'prepare'},events:{phase:'prepare',failure_code:'NATIVE_CLI_RATE_LIMITED',events:[{event:'error',diagnostic:'HTTP 429'}]}});assert.equal(studioReadinessCooldown(input),null);assert.equal(studioReadinessCooldown({...input,phases:['prepare','recover-preparation']}).reason,'native-cli-rate-limited');
});
