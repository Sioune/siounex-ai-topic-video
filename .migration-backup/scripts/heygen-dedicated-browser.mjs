import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import os from 'node:os';
import {searchDedicatedProjects} from './heygen-dedicated-project-search.mjs';
import {studioCanonical,studioGenerationValid} from '../lib/studio-preview-generation-contract.mts';
import {CLONE_PREPARATION_IMPLEMENTATION_SHA256} from './automatic-clone-retry-state.mjs';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fail = code => { throw Object.assign(Error(code), {code}); };
export const dedicatedSpeechText = text => text.replace(/\r?\n/g,'');
export const sameText = (a,b) => typeof a === 'string' && typeof b === 'string' && a.replace(/\r?\n/g,'') === b.replace(/\r?\n/g,'');
const writeOnce = (file,value) => { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx',mode:0o600}); };

// All interaction is in the calling production worker's voice station. The
// dedicated profile/port must already be started and logged in by the owner.
export function createDedicatedStudioBrowser({endpoint='http://127.0.0.1:9339',connect,allowFirstPreparation=()=>false,disconnectTimeoutMs=5000}={}) {
  if(endpoint!=='http://127.0.0.1:9339') fail('DEDICATED_ENDPOINT_INVALID');
  let browser,disconnectUnconfirmed=false; const sessionId=randomUUID();
  const acquire = async () => {
    if (!browser) {
      const load = connect || (async url => createRequire(path.join(os.homedir(),'package.json'))('playwright-core').chromium.connectOverCDP(url));
      try { browser = await load(endpoint); } catch { throw Object.assign(Error('专属 HeyGen 浏览器未连接，请启动该浏览器并确认已登录。'),{code:'DEDICATED_BROWSER_UNAVAILABLE'}); }
    }
    const contexts=browser.contexts(); if(contexts.length!==1) fail('DEDICATED_CONTEXT_AMBIGUOUS');
    const pages=contexts[0].pages().filter(p=>{try{return new URL(p.url()).origin==='https://app.heygen.com';}catch{return false;}});
    if(pages.length!==1) throw Object.assign(Error('专属浏览器中需要一个已登录的 HeyGen 页面。'),{code:'DEDICATED_PAGE_AMBIGUOUS'});
    const current=new URL(pages[0].url()); if(/^\/(?:login|signin|auth)(?:\/|$)/i.test(current.pathname))throw Object.assign(Error('专属 HeyGen 浏览器需要重新登录。'),{code:'DEDICATED_LOGIN_REQUIRED'});
    return pages[0];
  };
  return async function dedicatedBrowser(phase,input,{dir}={}) {
    if(disconnectUnconfirmed) fail('DEDICATED_DISCONNECT_UNCONFIRMED');
    const events=[];
    try {
    if(!dir || !/^acl_[a-f0-9]{64}$/.test(input?.request_id||'') || !/^job_[a-f0-9-]{36}$/.test(input?.job_id||'') || typeof input.text!=='string' || !input.text || typeof input.title!=='string' || hash(input.text)!==input.speech_text_sha256) fail('DEDICATED_INPUT_INVALID');
    const page=await acquire();
    const record=(event,extra={})=>events.push({event,at:new Date().toISOString(),...extra});
    const ensureScenePanel=async()=>{const panel=page.locator('[data-pacific-component="SceneHomePanel"]:visible');if(await panel.count()===1)return;const heading=page.getByRole('heading',{name:'编辑音色',exact:true}),back=page.locator('svg[role="button"][aria-label="返回"]:visible');if(await heading.count()===1&&await back.count()===1){await back.click();record('voice-settings-back');}};
    const releaseEditor=async()=>{await page.goto('https://app.heygen.com/projects');const u=new URL(page.url());if(u.origin!=='https://app.heygen.com'||u.pathname!=='/projects')fail('DEDICATED_EDITOR_RELEASE_UNKNOWN');record('editor-released');};
    const acknowledge=async()=>{const u=new URL(page.url()),m=/^\/create-v4\/([a-f0-9]{32})$/.exec(u.pathname);if(!m||u.origin!=='https://app.heygen.com')return null;const title=await page.locator('input[placeholder="未命名 视频"],input[placeholder="未命名视频"]').inputValue();if(title!==input.title)return null;const value={draft_id:m[1],title,request_id:input.request_id};if(fs.existsSync(input.checkpoint_file)){const old=JSON.parse(fs.readFileSync(input.checkpoint_file,'utf8'));if(old.draft_id!==value.draft_id||old.title!==value.title||old.request_id!==value.request_id)fail('DEDICATED_DRAFT_IDENTITY_CHANGED');}else writeOnce(input.checkpoint_file,value);record('draft-acknowledged',{draft_id:m[1]});return m[1];};
    if(phase!=='recover-preparation'&&input.draft_id){const u=new URL(page.url());if(u.origin==='https://app.heygen.com'&&u.pathname==='/projects')await page.goto('https://app.heygen.com/create-v4/'+input.draft_id);}
    const snapshot=async()=>{
      await ensureScenePanel();
      await page.locator('input[placeholder="未命名 视频"],input[placeholder="未命名视频"]').waitFor({state:'visible',timeout:60000});
      await page.locator('.node-segment').first().waitFor({state:'visible',timeout:60000});
      await page.locator('[data-pacific-component="SceneHomePanel"] [data-pacific-component="SceneSubSection"] [data-pacific-component="SceneRowButton"] div[title="Siounex口播"]').waitFor({state:'visible',timeout:60000});
      let facts;
      // Reload may expose the shell before the saved script and voice finish loading.
      // Read only until the exact binding appears, then verify as usual.
      for(let attempt=0;attempt<31;attempt++){
      facts=await page.evaluate(()=>{
        const title=document.querySelector('input[placeholder="未命名 视频"]')||document.querySelector('input[placeholder="未命名视频"]');
        const nodes=Array.from(document.querySelectorAll('.node-segment [data-node-view-content-react]'));
        const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
        const panels=Array.from(document.querySelectorAll('[data-pacific-component="SceneHomePanel"]')).filter(visible);
        const voices=panels.length===1?Array.from(panels[0].querySelectorAll('[data-pacific-component="SceneSubSection"] [data-pacific-component="SceneRowButton"] div[title="Siounex口播"]')).filter(visible):[];
        const audio=Array.from(document.querySelectorAll('audio')).map(a=>({url:a.currentSrc||a.src||null,readyState:a.readyState,duration:Number.isFinite(a.duration)?a.duration:null}));
        return {title:title?.value??null,text:nodes.map(n=>n.innerText).join('\n'),body_count:nodes.length,voice_count:voices.length,audio};
      });
      if(facts.body_count&&facts.title===input.title&&sameText(facts.text,input.text)&&facts.voice_count===1)break;
      if(attempt<30)await page.waitForTimeout(500);
      }
      const u=new URL(page.url()),match=/^\/create-v4\/([a-f0-9]{32})$/.exec(u.pathname);
      if(u.origin!=='https://app.heygen.com'||!match||!facts.body_count||facts.title!==input.title||!sameText(facts.text,input.text)||facts.voice_count!==1) fail('DEDICATED_DRAFT_BINDING_UNVERIFIED');
      if(input.draft_id&&input.draft_id!==match[1]) fail('DEDICATED_DRAFT_IDENTITY_CHANGED');
      return {draft_id:match[1],title:facts.title,text:facts.text,voice_name:'Siounex口播',audio:facts.audio};
    };
    if(phase==='prepare'&&input.draft_id) {
      const title=page.locator('input[placeholder="未命名 视频"],input[placeholder="未命名视频"]');await title.waitFor({state:'visible',timeout:60000});
      const currentTitle=await title.inputValue();if(currentTitle&&currentTitle!==input.title)fail('DEDICATED_DRAFT_BINDING_UNVERIFIED');
      if(!currentTitle){await title.fill(input.title);await title.press('Tab');}await acknowledge();
      const actual=await page.evaluate(()=>Array.from(document.querySelectorAll('.node-segment [data-node-view-content-react]')).map(n=>n.innerText).join('\n'));
      if(actual&&!sameText(actual,input.text))fail('DEDICATED_DRAFT_BINDING_UNVERIFIED');
      if(!actual){const editor=page.locator('.node-segment [data-node-view-content-react]');if(await editor.count()!==1)fail('DEDICATED_EDITOR_UNAVAILABLE');await editor.fill(dedicatedSpeechText(input.text));await acknowledge();}
      await ensureScenePanel();const selected=page.locator('[data-pacific-component="SceneHomePanel"] [data-pacific-component="SceneSubSection"] [data-pacific-component="SceneRowButton"] div[title="Siounex口播"]:visible');
      if(await selected.count()!==1){const choice=page.getByText('无音色',{exact:true});if(await choice.count()!==1)fail('DEDICATED_VOICE_CONTROL_UNKNOWN');await choice.click();const voice=page.getByText('Siounex口播',{exact:true});if(await voice.count()!==1)fail('DEDICATED_VOICE_PICKER_AMBIGUOUS');await voice.click();const apply=page.getByRole('button',{name:'应用',exact:true});if(await apply.count()===1)await apply.click();}
      await acknowledge();const before=await snapshot();await page.reload();const after=await snapshot();if(after.draft_id!==before.draft_id)fail('DEDICATED_DRAFT_IDENTITY_CHANGED');record('bound-preparation-persisted',{draft_id:after.draft_id});await releaseEditor();
      const evidence={schema:'heygen-dedicated-browser-evidence-v1',source:'playwright-cdp',phase,job_id:input.job_id,request_id:input.request_id,events};fs.mkdirSync(dir,{recursive:true});const evidenceFile=path.join(dir,'dedicated-events.json');writeOnce(evidenceFile,evidence);
      return {...after,audio:undefined,source:'playwright-cdp',persisted_draft_verified:true,play_clicked:false,url:null,browser_evidence_sha256:hash(fs.readFileSync(evidenceFile,'utf8'))};
    }
    if(phase==='recover-preparation'||phase==='prepare'&&!input.draft_id) {
      if(!allowFirstPreparation(input)) fail('DEDICATED_RECOVERY_NOT_AUTHORIZED');
      const claim=path.join(path.dirname(input.checkpoint_file),'cdp-production-prepare-intent.json');
      const current=new URL(page.url());
      // A first attempt can time out just before Studio assigns its UUID.
      // Resume the already named page only under the same durable intent.
      const pendingNamed=current.origin==='https://app.heygen.com'&&/^\/create-v4\/[a-f0-9]{32}$/.test(current.pathname)&&fs.existsSync(claim)&&!fs.existsSync(input.checkpoint_file);
      if(pendingNamed){
        const old=JSON.parse(fs.readFileSync(claim,'utf8'));
        if(old.schema!=='dedicated-prepare-intent-v1'||old.job_id!==input.job_id||old.request_id!==input.request_id||studioCanonical(old.binding)!==studioCanonical(input.binding)||old.text_sha256!==hash(input.text)||old.new_payment!==0)fail('DEDICATED_PREPARE_INTENT_MISMATCH');
        if(['preview-play-intent.json','studio-play-observed.json','cdp-manual-play-intent.json'].some(name=>fs.existsSync(path.join(path.dirname(claim),name))))fail('DEDICATED_PENDING_DRAFT_REQUIRES_RECONCILIATION');
        const draft=await acknowledge();if(!draft)fail('DEDICATED_DRAFT_IDENTITY_CHANGED');
        const resumed=await dedicatedBrowser('prepare',{...input,draft_id:draft},{dir});
        return {...resumed,prepared_new:true};
      }
      const otherDraft=current.origin==='https://app.heygen.com'&&/^\/create-v4\/([a-f0-9]{32})$/.exec(current.pathname);
      // A completed site result and an idle player do not prove this editor has
      // no unsaved owner changes. No reliable HeyGen save-state signal has yet
      // been verified, so never navigate away from this different draft.
      if(otherDraft) fail('DEDICATED_EDITOR_SAVE_STATE_UNKNOWN');
      const pendingBlank=current.origin==='https://app.heygen.com'&&current.pathname==='/create-v4/draft'&&fs.existsSync(claim);
      if(pendingBlank){
        const old=JSON.parse(fs.readFileSync(claim,'utf8'));
        if(old.schema!=='dedicated-prepare-intent-v1'||old.job_id!==input.job_id||old.request_id!==input.request_id||studioCanonical(old.binding)!==studioCanonical(input.binding)||old.text_sha256!==hash(input.text)||old.new_payment!==0)fail('DEDICATED_PREPARE_INTENT_MISMATCH');
        const blank=await page.evaluate(()=>{const titles=Array.from(document.querySelectorAll('input[placeholder="未命名 视频"],input[placeholder="未命名视频"]')),editors=Array.from(document.querySelectorAll('div.tiptap.ProseMirror[role="textbox"]'));if(titles.length!==1||titles[0].value!==''||editors.length!==1)return false;const copy=editors[0].cloneNode(true);copy.querySelectorAll('button,[role="button"]').forEach(e=>e.remove());copy.querySelectorAll('div.tw-pointer-events-none[contenteditable="false"]').forEach(e=>{if(e.textContent.trim().replace(/\s+/g,' ')==='输入脚本或 使用 / 输入指令')e.remove();});return !copy.textContent.trim();});
        if(!blank)fail('DEDICATED_PENDING_DRAFT_REQUIRES_RECONCILIATION');
        record('resume-current-blank-editor');
      } else {
      const search=await searchDedicatedProjects(page,{job_id:input.job_id,request_id:input.request_id,revision:input.binding.revision});
      record('search',{result:search});
      if(search.observed_exact_match_ids.length===1&&!search.no_results_visible) {
        await page.goto('https://app.heygen.com/create-v4/'+search.observed_exact_match_ids[0]);
        const found=await snapshot(); record('existing-draft-observed',{draft_id:found.draft_id});await releaseEditor();
        const evidence={schema:'heygen-dedicated-browser-evidence-v1',source:'playwright-cdp',phase,job_id:input.job_id,request_id:input.request_id,events};
        fs.mkdirSync(dir,{recursive:true}); const evidenceFile=path.join(dir,'dedicated-events.json');writeOnce(evidenceFile,evidence);
        return {...found,audio:undefined,source:'playwright-cdp',found_count:1,play_clicked:false,url:null,browser_evidence_sha256:hash(fs.readFileSync(evidenceFile,'utf8'))};
      }
      if(search.observed_exact_match_ids.length!==0||!search.no_results_visible) fail('DEDICATED_EXISTING_DRAFT_REQUIRES_RECONCILIATION');
      writeOnce(claim,{schema:'dedicated-prepare-intent-v1',job_id:input.job_id,request_id:input.request_id,binding:input.binding,text_sha256:hash(input.text),created_at:new Date().toISOString(),new_payment:0});
      await page.goto('https://app.heygen.com/create-v4/draft?vt=l&panel=scene',{waitUntil:'domcontentloaded',timeout:60000}); record('open-original-preparation');
      }
      const title=page.locator('input[placeholder="未命名 视频"],input[placeholder="未命名视频"]');
      await title.waitFor({state:'visible',timeout:60000}); await title.fill(input.title); await title.press('Tab'); record('title-set');
      // Studio assigns the persistent UUID asynchronously after naming. Wait
      // for it before editing, so a later failure resumes the same draft.
      await page.waitForURL(u=>u.origin==='https://app.heygen.com'&&/^\/create-v4\/[a-f0-9]{32}$/.test(u.pathname),{timeout:30000}); if(!await acknowledge())fail('DEDICATED_DRAFT_IDENTITY_CHANGED');
      const editor=page.locator('.node-segment [data-node-view-content-react]'); if(await editor.count()!==1) fail('DEDICATED_EDITOR_UNAVAILABLE');
      await editor.fill(dedicatedSpeechText(input.text)); record('text-set');await acknowledge();
      await ensureScenePanel();if(await page.locator('[data-pacific-component="SceneHomePanel"] [data-pacific-component="SceneSubSection"] [data-pacific-component="SceneRowButton"] div[title="Siounex口播"]:visible').count()!==1) {
        const choice=page.getByText('无音色',{exact:true}); if(await choice.count()!==1) fail('DEDICATED_VOICE_CONTROL_UNKNOWN');
        await choice.click(); const voice=page.getByText('Siounex口播',{exact:true}); if(await voice.count()!==1) fail('DEDICATED_VOICE_PICKER_AMBIGUOUS'); await voice.click();
        const apply=page.getByRole('button',{name:'应用',exact:true}); if(await apply.count()===1) await apply.click(); record('voice-selected');await acknowledge();
      }
      await acknowledge();let before=await snapshot(); record('draft-observed',{draft_id:before.draft_id});
      await page.reload(); let after=await snapshot(); if(after.draft_id!==before.draft_id) fail('DEDICATED_DRAFT_IDENTITY_CHANGED'); record('draft-reloaded',{draft_id:after.draft_id});await releaseEditor();
      const evidence={schema:'heygen-dedicated-browser-evidence-v1',source:'playwright-cdp',phase,job_id:input.job_id,request_id:input.request_id,events};
      fs.mkdirSync(dir,{recursive:true});const evidenceFile=path.join(dir,'dedicated-events.json');writeOnce(evidenceFile,evidence);
      return {...after,audio:undefined,source:'playwright-cdp',prepared_new:true,persisted_draft_verified:true,play_clicked:false,url:null,browser_evidence_sha256:hash(fs.readFileSync(evidenceFile,'utf8'))};
    }
    if(phase==='generation-effect') {
      const current=await snapshot(),buttons=page.locator('[role="textbox"] button:has(svg use[href="#play"])');
      const busy=page.locator('[role="progressbar"]:visible,[aria-busy="true"]:visible');
      if(await buttons.count()!==1||!await buttons.isEnabled()||await busy.count()!==0) fail('DEDICATED_GENERATION_EFFECT_UNKNOWN');
      const loaded=current.audio.filter(a=>a.url&&a.readyState===4&&a.duration>0);let known=null;
      if(current.audio.some(a=>a.url)) {
        const base=path.resolve(path.dirname(input.checkpoint_file));let priorFile=path.join(base,'preview-loaded-audio.json');
        if(input.known_audio_observation_file){const candidate=path.resolve(input.known_audio_observation_file),generations=path.join(base,'preview-generations')+path.sep;if(!candidate.startsWith(generations)||path.basename(candidate)!=='preview-loaded-audio.json'||!/^spg_[a-f0-9]{64}$/.test(path.basename(path.dirname(candidate))))fail('DEDICATED_AUDIO_RECONCILIATION_REQUIRED');priorFile=candidate;}
        let prior;try{prior=JSON.parse(fs.readFileSync(priorFile,'utf8'));}catch{fail('DEDICATED_AUDIO_RECONCILIATION_REQUIRED');}
        if(loaded.length!==1||prior.draft_id!==current.draft_id||prior.voice_id!==input.voice_id||prior.speech_text_sha256!==input.speech_text_sha256||prior.media_url_sha256!==hash(loaded[0].url)) fail('DEDICATED_AUDIO_RECONCILIATION_REQUIRED');
        known=loaded[0];
      }
      const observed_at=new Date().toISOString();record('generation-effect',{draft_id:current.draft_id,audio_present:!!known,...(known?{audio_url_sha256:hash(known.url)}:{}),observed_at});await releaseEditor();
      const evidence={schema:'heygen-dedicated-browser-evidence-v1',source:'playwright-cdp',phase,job_id:input.job_id,request_id:input.request_id,session_id:sessionId,events};
      fs.mkdirSync(dir,{recursive:true});const evidenceFile=path.join(dir,'dedicated-events.json');writeOnce(evidenceFile,evidence);
      const evidenceSha=hash(fs.readFileSync(evidenceFile,'utf8')), lifecycle={schema:'dedicated-session-lifecycle-v1',session_id:sessionId,phase,editor_released:true,active_call:false},lifecycleFile=path.join(dir,'dedicated-lifecycle.json');
      writeOnce(lifecycleFile,lifecycle);
      return {...current,audio:undefined,source:'playwright-cdp',origin:'https://app.heygen.com',pathname:'/create-v4/'+current.draft_id,ui_fully_loaded:true,preview_audio_verified:true,audio_present:!!known,generation_in_progress:false,editor_conflict:false,editor_tab_id:sessionId,editor_browser_id:sessionId,readyState:known?4:0,duration_seconds:known?.duration??null,url:known?.url??null,play_clicked:false,observed_at,browser_evidence_sha256:evidenceSha,
        generation_evidence:{source:'playwright-cdp',browser_attempt_id:path.basename(dir),browser_evidence_sha256:evidenceSha,event_stream_sha256:evidenceSha,lifecycle_sha256:hash(fs.readFileSync(lifecycleFile,'utf8')),implementation_sha256:CLONE_PREPARATION_IMPLEMENTATION_SHA256,cleanup_confirmed:true,editor_released:true,active_call:false}};
    }
    if(phase==='reconcile') {
      const before=await snapshot();
      const priorFile=path.join(path.dirname(input.checkpoint_file),'preview-loaded-audio.json');
      let prior; try { prior=JSON.parse(fs.readFileSync(priorFile,'utf8')); } catch { fail('DEDICATED_AUDIO_RECONCILIATION_REQUIRED'); }
      const loaded=before.audio.filter(a=>a.url&&a.readyState===4&&a.duration>0);
      if(loaded.length!==1||prior.draft_id!==before.draft_id||prior.voice_id!==input.voice_id||prior.speech_text_sha256!==input.speech_text_sha256||prior.media_url_sha256!==hash(loaded[0].url)) fail('DEDICATED_AUDIO_RECONCILIATION_REQUIRED');
      record('known-audio-reconciled',{audio_url_sha256:hash(loaded[0].url),duration_seconds:loaded[0].duration});
      await releaseEditor();
      const evidence={schema:'heygen-dedicated-browser-evidence-v1',source:'playwright-cdp',phase,job_id:input.job_id,request_id:input.request_id,events}; fs.mkdirSync(dir,{recursive:true});const evidenceFile=path.join(dir,'dedicated-events.json');writeOnce(evidenceFile,evidence);
      return {...before,audio:undefined,url:loaded[0].url,readyState:4,duration_seconds:loaded[0].duration,play_clicked:false,browser_evidence_sha256:hash(fs.readFileSync(evidenceFile,'utf8'))};
    }
    if(phase==='preview'||phase==='generation-preview') {
      const before=await snapshot(); if(before.audio.some(a=>a.url)) fail('DEDICATED_AUDIO_RECONCILIATION_REQUIRED');
      const intent=path.join(path.dirname(input.play_observed_file),'preview-play-intent.json'); if(!fs.existsSync(intent)||fs.existsSync(input.play_observed_file)) fail('DEDICATED_PLAY_INTENT_REQUIRED');
      let playIntent; try { playIntent=JSON.parse(fs.readFileSync(intent,'utf8')); } catch { fail('DEDICATED_PLAY_INTENT_REQUIRED'); }
      if(playIntent.schema!=='heygen-studio-preview-play-intent-v1'||playIntent.draft_id!==before.draft_id||playIntent.maximum_new_play_count!==1) fail('DEDICATED_PLAY_INTENT_REQUIRED');
      let generationReady=null;
      if(phase==='generation-preview') {
        const generation=input.generation,permit=input.generation_permit;
        let header;try{header=JSON.parse(fs.readFileSync(path.join(path.dirname(intent),'preview-generation.json'),'utf8'));}catch{fail('DEDICATED_PLAY_INTENT_REQUIRED');}
        if(!studioGenerationValid(generation)||generation.maximum_play_count!==1||generation.draft_id!==before.draft_id||generation.request_id!==input.request_id||generation.job_id!==input.job_id||generation.binding.voice_id!==input.voice_id||generation.binding.speech_text_sha256!==input.speech_text_sha256||!permit||permit.generation_id!==generation.generation_id||permit.generation_header_sha256!==hash(studioCanonical(generation))||studioCanonical(header)!==studioCanonical(generation)||permit.local_intent_sha256!==hash(studioCanonical(playIntent))||permit.created_at!==playIntent.created_at) fail('DEDICATED_PLAY_INTENT_REQUIRED');
        const busy=page.locator('[role="progressbar"]:visible,[aria-busy="true"]:visible');if(await busy.count()!==0) fail('DEDICATED_GENERATION_EFFECT_UNKNOWN');
        const ready_observed_at=new Date().toISOString();
        generationReady={ready_response_sha256:hash({draft_id:before.draft_id,title:before.title,text_sha256:hash(before.text),voice:before.voice_name,audio_sources:0}),ready_code_sha256:hash(fs.readFileSync(new URL(import.meta.url),'utf8')),ready_binding_sha256:hash(studioCanonical(input.generation.binding)),ready_observed_at,editor_tab_sha256:hash({session_id:sessionId}),ready_parent_accepted:true};
      }
      const button=page.locator('[role="textbox"] button:has(svg use[href="#play"])'); if(await button.count()!==1||!await button.isEnabled()) fail('DEDICATED_PREVIEW_CONTROL_UNKNOWN');
      const requests=new Set(),responses=new Set();let recording=false;
      const observeRequest=request=>{if(recording){const value=request.url();try{const u=new URL(value);if(u.protocol==='https:'&&/^resource[0-9]*\.heygen\.ai$/i.test(u.hostname))requests.add(value);}catch{}}};
      const observeResponse=response=>{if(recording&&response.status()>=200&&response.status()<300)responses.add(response.url());};
      page.on('request',observeRequest);
      page.on('response',observeResponse);
      try {
        recording=true; await button.click(); const clicked_at=new Date().toISOString();
        const journal={schema:phase==='generation-preview'?'heygen-studio-generation-play-observed-v1':'heygen-studio-play-observed-v1',request_id:input.request_id,draft_id:before.draft_id,speech_text_sha256:input.speech_text_sha256,voice_name:'Siounex口播',clicked_at,play_clicked:true,...(generationReady?{generation_id:input.generation.generation_id,generation_header_sha256:input.generation_permit.generation_header_sha256,local_play_intent_sha256:input.generation_permit.local_intent_sha256,...generationReady}:{})};
        if(generationReady) {fs.mkdirSync(path.dirname(input.play_observed_file),{recursive:true});fs.writeFileSync(input.play_observed_file,studioCanonical(journal),{flag:'wx',mode:0o600});} else writeOnce(input.play_observed_file,journal); record('preview-clicked',{clicked_at});
        await page.waitForFunction(()=>{const a=Array.from(document.querySelectorAll('audio'));return a.length===1&&a[0].readyState===4&&!!(a[0].currentSrc||a[0].src)&&Number.isFinite(a[0].duration)&&a[0].duration>0;},undefined,{timeout:90000});
        const after=await snapshot(),loaded=after.audio.filter(a=>a.url&&a.readyState===4&&a.duration>0); if(loaded.length!==1) fail('DEDICATED_AUDIO_UNVERIFIED');
        record('audio-loaded',{audio_url_sha256:hash(loaded[0].url),duration_seconds:loaded[0].duration,matching_request_observed:requests.has(loaded[0].url),matching_response_observed:responses.has(loaded[0].url)});
        const evidence={schema:'heygen-dedicated-browser-evidence-v1',source:'playwright-cdp',phase,job_id:input.job_id,request_id:input.request_id,events}; fs.mkdirSync(dir,{recursive:true});const evidenceFile=path.join(dir,'dedicated-events.json');writeOnce(evidenceFile,evidence);
        // The exact loaded URL must have been requested by this same page
        // during the single full-narration click; otherwise retain unknown.
        if(!requests.has(loaded[0].url)||!responses.has(loaded[0].url)) fail('DEDICATED_AUDIO_ASSOCIATION_UNKNOWN');
        const evidenceSha=hash(fs.readFileSync(evidenceFile,'utf8')),observed_at=new Date().toISOString(); await releaseEditor();const lifecycle={schema:'dedicated-session-lifecycle-v1',session_id:sessionId,phase,editor_released:true,active_call:false},lifecycleFile=path.join(dir,'dedicated-lifecycle.json');
        if(generationReady) writeOnce(lifecycleFile,lifecycle);
        return {...after,audio:undefined,url:loaded[0].url,readyState:4,duration_seconds:loaded[0].duration,play_clicked:true,browser_evidence_sha256:evidenceSha,...(generationReady?{source:'playwright-cdp',origin:'https://app.heygen.com',pathname:'/create-v4/'+after.draft_id,ui_fully_loaded:true,preview_audio_verified:true,audio_present:true,generation_in_progress:false,editor_conflict:false,editor_tab_id:sessionId,editor_browser_id:sessionId,observed_at,generation_ready:generationReady,generation_play:journal,generation_evidence:{source:'playwright-cdp',browser_attempt_id:path.basename(dir),browser_evidence_sha256:evidenceSha,event_stream_sha256:evidenceSha,lifecycle_sha256:hash(fs.readFileSync(lifecycleFile,'utf8')),implementation_sha256:CLONE_PREPARATION_IMPLEMENTATION_SHA256,cleanup_confirmed:true,editor_released:true,active_call:false}}:{})};
      } finally { page.off('request',observeRequest); page.off('response',observeResponse); }
    }
    fail('DEDICATED_PHASE_NOT_IMPLEMENTED');
    } catch(error) {
      if(dir)try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'dedicated-failure.json'),JSON.stringify({schema:'dedicated-failure-v1',source:'playwright-cdp',phase,error_name:typeof error?.name==='string'?error.name.slice(0,80):'Error',error_code:typeof error?.code==='string'&&/^[A-Z_0-9]+$/.test(error.code)?error.code:null,events}),{flag:'wx',mode:0o600});}catch{}
      throw error;
    } finally {
      // For a CDP-connected browser, close() disconnects this Playwright
      // client; the owner's existing Chrome process and tabs remain open.
      const connected=browser;
      if(connected && typeof connected.close==='function') {
        let timer;
        const closed=await Promise.race([Promise.resolve().then(()=>connected.close()).then(()=>true,()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),disconnectTimeoutMs);})]);
        clearTimeout(timer);
        if(closed) browser=undefined;
        else {disconnectUnconfirmed=true;if(dir)try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'dedicated-disconnect-unconfirmed.json'),JSON.stringify({schema:'dedicated-disconnect-v1',source:'playwright-cdp',phase,observed_at:new Date().toISOString(),disconnect_confirmed:false}),{flag:'wx',mode:0o600});}catch{}}
      } else browser=undefined;
    }
  };
}
