import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDedicatedStudioBrowser,sameText,dedicatedSpeechText} from '../scripts/heygen-dedicated-browser.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {studioCanonical} from '../lib/studio-preview-generation-contract.mts';
const digest=s=>createHash('sha256').update(s).digest('hex');
const scratch=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const input={job_id:'job_12345678-1234-1234-1234-123456789abc',request_id:'acl_'+'a'.repeat(64),title:'test',text:'test speech',speech_text_sha256:createHash('sha256').update('test speech').digest('hex'),binding:{revision:1}};
const fakePage={url:()=> 'https://app.heygen.com/projects'};
test('script comparison permits line breaks only and detects actual text changes',()=>{assert.equal(sameText('第一句。第二句。','第一句。\n第二句。'),true);assert.equal(sameText('第一句。第二句。','第一句。第二句！'),false);assert.equal(sameText('第一句。 第二句。','第一句。第二句。'),false);});
test('refuses recovery unless its original request is explicitly authorized',async t=>{
  const browser=createDedicatedStudioBrowser({connect:async()=>({contexts:()=>[{pages:()=>[fakePage]}]})});
  await assert.rejects(browser('recover-preparation',input,{dir:scratch(t)}),{code:'DEDICATED_RECOVERY_NOT_AUTHORIZED'});
});
test('unrelated port and ambiguous pages are rejected',async t=>{
  assert.throws(()=>createDedicatedStudioBrowser({endpoint:'http://127.0.0.1:9222'}),{code:'DEDICATED_ENDPOINT_INVALID'});
  const browser=createDedicatedStudioBrowser({connect:async()=>({contexts:()=>[{pages:()=>[fakePage,fakePage]}]})});
  await assert.rejects(browser('preview',input,{dir:scratch(t)}),{code:'DEDICATED_PAGE_AMBIGUOUS'});
});
test('unimplemented reconciliation cannot silently generate',async t=>{
  const browser=createDedicatedStudioBrowser({connect:async()=>({contexts:()=>[{pages:()=>[fakePage]}]})});
  await assert.rejects(browser('unsupported',input,{dir:scratch(t)}),{code:'DEDICATED_PHASE_NOT_IMPLEMENTED'});
});
test('each failed dedicated operation disconnects its CDP client without closing a tab',async t=>{
 let connections=0,disconnects=0;const browser=createDedicatedStudioBrowser({connect:async()=>{connections++;return {contexts:()=>[{pages:()=>[fakePage]}],close:async()=>{disconnects++;}};}});
 await assert.rejects(browser('unsupported',input,{dir:scratch(t)}),{code:'DEDICATED_PHASE_NOT_IMPLEMENTED'});
 await assert.rejects(browser('unsupported',input,{dir:scratch(t)}),{code:'DEDICATED_PHASE_NOT_IMPLEMENTED'});
 assert.equal(connections,2);assert.equal(disconnects,2);
});
for(const kind of ['reject','hang'])test('unconfirmed disconnect preserves the original failure and blocks another operation: '+kind,async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-disconnect-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const browser=createDedicatedStudioBrowser({disconnectTimeoutMs:20,connect:async()=>({contexts:()=>[{pages:()=>[fakePage]}],close:()=>kind==='reject'?Promise.reject(Error('disconnect failed')):new Promise(()=>{})})});
 await assert.rejects(browser('unsupported',input,{dir}),{code:'DEDICATED_PHASE_NOT_IMPLEMENTED'});
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'dedicated-disconnect-unconfirmed.json'),'utf8')).disconnect_confirmed,false);
 await assert.rejects(browser('unsupported',input,{dir}),{code:'DEDICATED_DISCONNECT_UNCONFIRMED'});
});
test('a disconnect failure cannot discard an observed full preview result',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-close-result-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const draft='b'.repeat(32),journal=path.join(dir,'studio-play-observed.json');fs.writeFileSync(path.join(dir,'preview-play-intent.json'),JSON.stringify({schema:'heygen-studio-preview-play-intent-v1',draft_id:draft,maximum_new_play_count:1}));
 let clicks=0,currentUrl=`https://app.heygen.com/create-v4/${draft}`;const listeners={};
 const page={url:()=>currentUrl,goto:async url=>{currentUrl=url;},evaluate:async()=>({title:input.title,text:input.text,body_count:1,voice_count:1,audio:clicks?[{url:'https://resource.heygen.ai/audio',readyState:4,duration:12}]:[]}),locator:()=>({count:async()=>1,isEnabled:async()=>true,waitFor:async()=>{},first(){return this;},click:async()=>{clicks++;listeners.request({url:()=> 'https://resource.heygen.ai/audio'});listeners.response({url:()=> 'https://resource.heygen.ai/audio',status:()=>200});}}),waitForFunction:async()=>{},on:(name,fn)=>{listeners[name]=fn;},off:()=>{}};
 const browser=createDedicatedStudioBrowser({connect:async()=>({contexts:()=>[{pages:()=>[page]}],close:async()=>{throw Error('disconnect failed');}})}),args={...input,draft_id:draft,play_observed_file:journal};
 const result=await browser('preview',args,{dir:path.join(dir,'attempt')});assert.equal(result.play_clicked,true);assert.equal(result.url,'https://resource.heygen.ai/audio');assert.equal(clicks,1);
 await assert.rejects(browser('preview',args,{dir:path.join(dir,'attempt2')}),{code:'DEDICATED_DISCONNECT_UNCONFIRMED'});assert.equal(clicks,1);
});
test('the exact pending blank editor resumes without opening another draft',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-pending-blank-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'cdp-production-prepare-intent.json'),JSON.stringify({schema:'dedicated-prepare-intent-v1',job_id:input.job_id,request_id:input.request_id,binding:input.binding,text_sha256:input.speech_text_sha256,new_payment:0}));
 let navigations=0;const page={url:()=> 'https://app.heygen.com/create-v4/draft?panel=scene',goto:async()=>{navigations++;},evaluate:async()=>true,locator:()=>({waitFor:async()=>{throw Error('synthetic stop before write');}})};
 const browser=createDedicatedStudioBrowser({allowFirstPreparation:()=>true,connect:async()=>({contexts:()=>[{pages:()=>[page]}]})});
 await assert.rejects(browser('recover-preparation',{...input,checkpoint_file:path.join(dir,'studio-draft.json')},{dir:path.join(dir,'attempt')}),/synthetic stop before write/);
 assert.equal(navigations,0);const evidence=JSON.parse(fs.readFileSync(path.join(dir,'attempt','dedicated-failure.json'),'utf8'));assert.equal(evidence.events.at(-1).event,'resume-current-blank-editor');
});
test('a pending blank editor with another intent is not modified',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-pending-mismatch-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'cdp-production-prepare-intent.json'),JSON.stringify({schema:'dedicated-prepare-intent-v1',job_id:input.job_id,request_id:'acl_'+'b'.repeat(64),binding:input.binding,text_sha256:input.speech_text_sha256,new_payment:0}));
 let touched=false;const page={url:()=> 'https://app.heygen.com/create-v4/draft',evaluate:async()=>{touched=true;},goto:async()=>{touched=true;}};const browser=createDedicatedStudioBrowser({allowFirstPreparation:()=>true,connect:async()=>({contexts:()=>[{pages:()=>[page]}]})});
 await assert.rejects(browser('recover-preparation',{...input,checkpoint_file:path.join(dir,'studio-draft.json')},{dir:path.join(dir,'attempt')}),{code:'DEDICATED_PREPARE_INTENT_MISMATCH'});assert.equal(touched,false);
});
test('a pending editor with any existing content is not modified',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-pending-content-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'cdp-production-prepare-intent.json'),JSON.stringify({schema:'dedicated-prepare-intent-v1',job_id:input.job_id,request_id:input.request_id,binding:input.binding,text_sha256:input.speech_text_sha256,new_payment:0}));
 let touched=false;const page={url:()=> 'https://app.heygen.com/create-v4/draft',evaluate:async fn=>{const prior=globalThis.document;globalThis.document={querySelectorAll:selector=>selector.startsWith('input')?[{value:''}]:[{cloneNode:()=>({querySelectorAll:()=>[],textContent:'非 p 元素中的已有正文'})}]};try{return fn();}finally{globalThis.document=prior;}},goto:async()=>{touched=true;},locator:()=>{touched=true;}};const browser=createDedicatedStudioBrowser({allowFirstPreparation:()=>true,connect:async()=>({contexts:()=>[{pages:()=>[page]}]})});
 await assert.rejects(browser('recover-preparation',{...input,checkpoint_file:path.join(dir,'studio-draft.json')},{dir:path.join(dir,'attempt')}),{code:'DEDICATED_PENDING_DRAFT_REQUIRES_RECONCILIATION'});assert.equal(touched,false);
});
test('one observed preview is journaled and cannot be clicked again',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-cdp-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const draft='b'.repeat(32),journal=path.join(dir,'studio-play-observed.json');
  fs.writeFileSync(path.join(dir,'preview-play-intent.json'),JSON.stringify({schema:'heygen-studio-preview-play-intent-v1',draft_id:draft,maximum_new_play_count:1}));
  let clicks=0,currentUrl=`https://app.heygen.com/create-v4/${draft}`;const listeners={};
  const page={url:()=>currentUrl,goto:async url=>{currentUrl=url;},evaluate:async()=>({title:input.title,text:input.text,body_count:1,voice_count:1,audio:clicks?[{url:'https://resource.heygen.ai/audio',readyState:4,duration:12}]:[]}),locator:()=>({count:async()=>1,isEnabled:async()=>true,waitFor:async()=>{},first(){return this;},click:async()=>{clicks++;listeners.request({url:()=> 'https://resource.heygen.ai/audio'});listeners.response({url:()=> 'https://resource.heygen.ai/audio',status:()=>200});}}),waitForFunction:async()=>{},on:(name,fn)=>{listeners[name]=fn;},off:()=>{}};
  const browser=createDedicatedStudioBrowser({connect:async()=>({contexts:()=>[{pages:()=>[page]}]})});
  const args={...input,draft_id:draft,play_observed_file:journal};
  const output=await browser('preview',args,{dir:path.join(dir,'attempt')});
  assert.equal(output.play_clicked,true);assert.equal(clicks,1);assert.equal(JSON.parse(fs.readFileSync(journal,'utf8')).request_id,input.request_id);
  await assert.rejects(browser('preview',args,{dir:path.join(dir,'attempt2')}),{code:'DEDICATED_AUDIO_RECONCILIATION_REQUIRED'});
  assert.equal(clicks,1);
});
test('generation effect observes same draft without clicking or claiming released editor',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-cdp-effect-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const draft='b'.repeat(32);let clicks=0,currentUrl=`https://app.heygen.com/create-v4/${draft}`;
  const page={url:()=>currentUrl,goto:async url=>{currentUrl=url;},evaluate:async()=>({title:input.title,text:input.text,body_count:1,voice_count:1,audio:[]}),locator:selector=>({count:async()=>selector.includes('progressbar')?0:1,isEnabled:async()=>true,waitFor:async()=>{},first(){return this;},click:async()=>{clicks++;}})};
  const browser=createDedicatedStudioBrowser({connect:async()=>({contexts:()=>[{pages:()=>[page]}]})});
  const result=await browser('generation-effect',{...input,draft_id:draft},{dir:path.join(dir,'readiness-123')});
  assert.equal(result.play_clicked,false);assert.equal(result.generation_evidence.editor_released,true);assert.equal(currentUrl,'https://app.heygen.com/projects');assert.equal(clicks,0);
});
test('generation preview uses the exact persisted claim and never clicks again',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-cdp-generation-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const draft='b'.repeat(32),voice='synthetic-voice',binding={job_id:input.job_id,request_id:input.request_id,revision:1,mode_epoch:0,script_hash:digest('script'),contract_hash:digest('contract'),script_text_sha256:digest(input.text),speech_text_sha256:input.speech_text_sha256,base_milestone_id:'synthetic-milestone',base_artifact_hash:digest('artifact'),base_video_sha256:digest('video'),first_review_id:'synthetic-review',voice_id:voice,scope_id:'synthetic-scope'};
  const generation={schema:'studio-preview-generation-v1',generation_id:'spg_'+digest('generation'),ordinal:1,job_id:input.job_id,request_id:input.request_id,binding,draft_id:draft,policy_id:'spp_'+digest('policy'),policy_sha256:digest('policy record'),previous_generation_id:'legacy-gen0',previous_generation_evidence_sha256:digest('prior'),effect_proof_sha256:digest('effect'),created_at:new Date().toISOString(),maximum_play_count:1,previous_outcome:'unchanged-unknown',history_reinterpreted:false,zero_historical_side_effects_proven:false,new_payment_limit:0,new_voice_allowed:false,api_fallback_allowed:false,publication_authorized:false};
  const intent={schema:'heygen-studio-preview-play-intent-v1',draft_id:draft,maximum_new_play_count:1,created_at:new Date().toISOString()};
  fs.writeFileSync(path.join(dir,'preview-generation.json'),studioCanonical(generation));fs.writeFileSync(path.join(dir,'preview-play-intent.json'),studioCanonical(intent));
  let clicks=0,currentUrl=`https://app.heygen.com/create-v4/${draft}`;const listeners={};
  const page={url:()=>currentUrl,goto:async url=>{currentUrl=url;},evaluate:async()=>({title:input.title,text:input.text,body_count:1,voice_count:1,audio:clicks?[{url:'https://resource.heygen.ai/audio',readyState:4,duration:12}]:[]}),locator:selector=>({count:async()=>selector.includes('progressbar')?0:1,isEnabled:async()=>true,waitFor:async()=>{},first(){return this;},click:async()=>{clicks++;listeners.request({url:()=> 'https://resource.heygen.ai/audio'});listeners.response({url:()=> 'https://resource.heygen.ai/audio',status:()=>200});}}),waitForFunction:async()=>{},on:(name,fn)=>{listeners[name]=fn;},off:()=>{}};
  const browser=createDedicatedStudioBrowser({connect:async()=>({contexts:()=>[{pages:()=>[page]}]})});
  const args={...input,voice_id:voice,draft_id:draft,generation,play_observed_file:path.join(dir,'studio-play-observed.json'),generation_permit:{generation_id:generation.generation_id,generation_header_sha256:digest(studioCanonical(generation)),local_intent_sha256:digest(studioCanonical(intent)),created_at:intent.created_at}};
  const output=await browser('generation-preview',args,{dir:path.join(dir,'attempt')});
  assert.equal(clicks,1);assert.equal(output.generation_play.generation_id,generation.generation_id);assert.equal(output.generation_evidence.editor_released,true);assert.equal(currentUrl,'https://app.heygen.com/projects');
  await assert.rejects(browser('generation-preview',args,{dir:path.join(dir,'attempt2')}));assert.equal(clicks,1);
});
test('a partially prepared known draft continues without creating another draft or playing',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-cdp-prepare-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const draft='b'.repeat(32),checkpoint=path.join(dir,'studio-draft.json');fs.writeFileSync(checkpoint,JSON.stringify({draft_id:draft,title:input.title,request_id:input.request_id}));
  let text='',fills=0,reloads=0,currentUrl=`https://app.heygen.com/create-v4/${draft}`;const page={url:()=>currentUrl,goto:async url=>{currentUrl=url;},evaluate:async()=>text?{title:input.title,text,body_count:1,voice_count:1,audio:[]}: '',reload:async()=>{reloads++;},locator:selector=>({waitFor:async()=>{},first(){return this;},inputValue:async()=>input.title,count:async()=>1,fill:async value=>{text=value;fills++;},press:async()=>{}})};
  const browser=createDedicatedStudioBrowser({connect:async()=>({contexts:()=>[{pages:()=>[page]}]})});
  const result=await browser('prepare',{...input,draft_id:draft,checkpoint_file:checkpoint},{dir:path.join(dir,'attempt')});
  assert.equal(result.persisted_draft_verified,true);assert.equal(result.play_clicked,false);assert.equal(fills,1);assert.equal(reloads,1);
});


test('unavailable dedicated Chrome reports concrete cause without launching or playing',async()=>{const browser=createDedicatedStudioBrowser({connect:async()=>{throw Error('ECONNREFUSED')}});await assert.rejects(browser('recover-preparation',input,{dir:os.tmpdir()}),error=>error.code==='DEDICATED_BROWSER_UNAVAILABLE'&&/专属 HeyGen 浏览器未连接/.test(error.message));});
test('login page is reported without touching draft or playing',async()=>{const browser=createDedicatedStudioBrowser({connect:async()=>({contexts:()=>[{pages:()=>[{url:()=> 'https://app.heygen.com/login'}]}],close:async()=>{}})});await assert.rejects(browser('recover-preparation',input,{dir:os.tmpdir()}),error=>error.code==='DEDICATED_LOGIN_REQUIRED');});

test('Studio single paragraph retains all speech characters while avoiding multiline persistence truncation',()=>{assert.equal(dedicatedSpeechText('第一句。\n第二句！'),'第一句。第二句！');assert.equal(dedicatedSpeechText('第一句。\r\n第二句！'),'第一句。第二句！');});
test('delayed Studio UUID is awaited and checkpointed before writing speech',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-delayed-uuid-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'cdp-production-prepare-intent.json'),JSON.stringify({schema:'dedicated-prepare-intent-v1',job_id:input.job_id,request_id:input.request_id,binding:input.binding,text_sha256:input.speech_text_sha256,new_payment:0}));
 let url='https://app.heygen.com/create-v4/draft?panel=scene',value='',waited=false;const draft='f'.repeat(32),checkpoint=path.join(dir,'studio-draft.json');
 const title={waitFor:async()=>{},fill:async v=>{value=v},press:async()=>{},inputValue:async()=>value};
 const page={url:()=>url,evaluate:async()=>true,waitForURL:async predicate=>{await new Promise(resolve=>setTimeout(resolve,15));url='https://app.heygen.com/create-v4/'+draft;assert.ok(predicate(new URL(url)));waited=true},locator:s=>s.startsWith('input[')?title:{count:async()=>{assert.ok(waited);assert.equal(JSON.parse(fs.readFileSync(checkpoint,'utf8')).draft_id,draft);throw Error('synthetic stop after checkpoint')}}};
 const browser=createDedicatedStudioBrowser({allowFirstPreparation:()=>true,connect:async()=>({contexts:()=>[{pages:()=>[page]}],close:async()=>{}})});
 await assert.rejects(browser('recover-preparation',{...input,checkpoint_file:checkpoint},{dir:path.join(dir,'attempt')}),/synthetic stop after checkpoint/);assert.ok(waited);
});
test('late UUID on named page resumes same original draft without creating another',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-late-uuid-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const draft='e'.repeat(32),checkpoint=path.join(dir,'studio-draft.json');
 fs.writeFileSync(path.join(dir,'cdp-production-prepare-intent.json'),JSON.stringify({schema:'dedicated-prepare-intent-v1',job_id:input.job_id,request_id:input.request_id,binding:input.binding,text_sha256:input.speech_text_sha256,new_payment:0}));
 let navigations=0;const title={waitFor:async()=>{},inputValue:async()=>input.title};const page={url:()=> 'https://app.heygen.com/create-v4/'+draft,goto:async()=>{navigations++},evaluate:async()=>'',locator:s=>s.startsWith('input[')?title:{count:async()=>{assert.equal(JSON.parse(fs.readFileSync(checkpoint,'utf8')).draft_id,draft);throw Error('synthetic stop after resume')}}};
 const browser=createDedicatedStudioBrowser({allowFirstPreparation:()=>true,connect:async()=>({contexts:()=>[{pages:()=>[page]}],close:async()=>{}})});
 await assert.rejects(browser('recover-preparation',{...input,checkpoint_file:checkpoint},{dir:path.join(dir,'attempt')}),/synthetic stop after resume/);assert.equal(navigations,0);
});
test('late named draft rejects a different request before touching the page',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-late-other-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'cdp-production-prepare-intent.json'),JSON.stringify({schema:'dedicated-prepare-intent-v1',job_id:input.job_id,request_id:'acl_'+'b'.repeat(64),binding:input.binding,text_sha256:input.speech_text_sha256,new_payment:0}));let touched=false;const page={url:()=> 'https://app.heygen.com/create-v4/'+'e'.repeat(32),locator:()=>{touched=true;}};const browser=createDedicatedStudioBrowser({allowFirstPreparation:()=>true,connect:async()=>({contexts:()=>[{pages:()=>[page]}]})});await assert.rejects(browser('recover-preparation',{...input,checkpoint_file:path.join(dir,'studio-draft.json')},{dir:path.join(dir,'attempt')}),{code:'DEDICATED_PREPARE_INTENT_MISMATCH'});assert.equal(touched,false);
});

test('even a completed idle editor stays put when save state is unknown',async t=>{
 for (const kind of ['complete','unknown','busy','playing','unsaved']) {
  const dir=scratch(t),draft='e'.repeat(32);let url='https://app.heygen.com/create-v4/'+draft,navigations=0;
  const page={url:()=>url,goto:async v=>{navigations++;url=v;},evaluate:async()=>kind==='playing',locator:s=>({count:async()=>kind==='busy'?1:0,waitFor:async()=>{throw Error('synthetic stop at project search')}})};
  const browser=createDedicatedStudioBrowser({allowFirstPreparation:()=>true,canLeaveCompletedEditor:async id=>id===draft&&kind!=='unknown',connect:async()=>({contexts:()=>[{pages:()=>[page]}],close:async()=>{}})});
  const args={...input,checkpoint_file:path.join(dir,'studio-draft.json')};
  await assert.rejects(browser('recover-preparation',args,{dir:path.join(dir,'attempt')}),{code:'DEDICATED_EDITOR_SAVE_STATE_UNKNOWN'});assert.equal(navigations,0);assert.equal(url,'https://app.heygen.com/create-v4/'+draft);
 }
});

test('reload waits for the saved exact script and voice to finish rendering',async t=>{
 const dir=scratch(t),draft='c'.repeat(32),checkpoint=path.join(dir,'studio-draft.json');fs.writeFileSync(checkpoint,JSON.stringify({draft_id:draft,title:input.title,request_id:input.request_id}));let reloaded=false,reads=0,waits=0,url='https://app.heygen.com/create-v4/'+draft;
 const page={url:()=>url,goto:async v=>{url=v},reload:async()=>{reloaded=true},waitForTimeout:async()=>{waits++},evaluate:async()=>{if(!reloaded&&reads++===0)return input.text;if(reloaded&&waits<2)return {title:input.title,text:'',body_count:1,voice_count:0,audio:[]};return {title:input.title,text:input.text,body_count:1,voice_count:1,audio:[]}},locator:()=>({waitFor:async()=>{},first(){return this},inputValue:async()=>input.title,count:async()=>1})};
 const browser=createDedicatedStudioBrowser({connect:async()=>({contexts:()=>[{pages:()=>[page]}],close:async()=>{}})});const result=await browser('prepare',{...input,draft_id:draft,checkpoint_file:checkpoint},{dir:path.join(dir,'attempt')});assert.equal(result.persisted_draft_verified,true);assert.equal(waits,2);assert.equal(result.play_clicked,false);
});
