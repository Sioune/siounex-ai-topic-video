// Synthetic filesystem evidence only. This fixture never launches a browser.
import fs from 'node:fs';
import path from 'node:path';
import {previewSha} from '../../scripts/heygen-preview-cache.mjs';
import {writeStudioPersistenceHistory} from './studio-persistence-fixture.mjs';

export const PROVIDER_EDITOR_AUTHORIZATION_FILE='studio-owner-editor-authorization.json';
export const PROVIDER_EDITOR_INTENT_FILE='studio-provider-editor-continuation-intent.json';
export const PROVIDER_EDITOR_TRANSFER_FILE='studio-provider-editor-transfer-observed.json';
export const PROVIDER_EDITOR_PERSISTENCE_FILE='studio-provider-editor-persistence.json';
export const PROVIDER_EDITOR_INSTRUCTION='允许电视原请求接回编辑并额外试听一次';

export function writeProviderEditorAuthorization(f,{
 clock=f.input.clock,authorization_nonce='SYNTHETIC-owner-editor-nonce',
 source_chat_id='SYNTHETIC-current-owner-chat',owner_instruction=PROVIDER_EDITOR_INSTRUCTION,
}={}){
 const full=f.read('preview-prepared-draft.json').binding,hash=name=>previewSha(fs.readFileSync(path.join(f.dir,name)));
 const manifest={schema:'heygen-studio-owner-editor-authorization-v1',job_id:full.job_id,request_id:full.request_id,draft_id:full.draft_id,binding:{...f.input.binding},prepared_binding:full,speech_text_sha256:full.speech_text_sha256,voice_id:full.voice_id,prepared_file_sha256:hash('preview-prepared-draft.json'),acquisition_intent_sha256:hash('preview-acquisition-intent.json'),play_intent_sha256:hash('preview-play-intent.json'),authorization_nonce,authorized_at:new Date(clock()-5000).toISOString(),source_chat_id,owner_instruction,maximum_editor_transfer_count:1,maximum_extra_play_count:1,new_request:false,new_provider_draft_allowed:false,new_payment_limit:0,api_fallback_allowed:false,publication_authorized:false,previous_preview_outcome:'unchanged-unknown'};
 f.write(PROVIDER_EDITOR_AUTHORIZATION_FILE,manifest);
 return{manifest,file:path.join(f.dir,PROVIDER_EDITOR_AUTHORIZATION_FILE),sha256:hash(PROVIDER_EDITOR_AUTHORIZATION_FILE)};
}

export function writeProviderEditorLock(f,{
 name='readiness-33333333-3333-4333-8333-333333333333',clock=f.input.clock,
 start_at=clock()-1000,finished_at=clock()-500,observed_at=clock()-400,
 periodic_run_id=f.input.periodic_run_id,audio_present=null,generation_in_progress=null,
}={}){
 const iso=value=>new Date(value).toISOString(),browser_evidence_sha256='5'.repeat(64);
 const certificate={schema:'heygen-studio-provider-edit-lock-v1',request_id:f.input.request_id,binding:{...f.input.binding},draft_id:f.input.draft_id,speech_text_sha256:f.input.speech_text_sha256,voice_id:f.input.voice_id,owner_editor_authorization_sha256:previewSha(fs.readFileSync(path.join(f.dir,PROVIDER_EDITOR_AUTHORIZATION_FILE))),observed_at:iso(observed_at),browser_evidence_sha256,observation:{origin:'https://app.heygen.com',modal_title:'正在编辑草稿',modal_message:'此草稿已在你的另一个窗口或标签页中打开。草稿一次只能在一个位置编辑。',edit_button_label:'在此编辑',edit_button_count:1,back_button_label:'返回',same_draft_verified:true,content_modified:false,play_clicked:false,audio_present,generation_in_progress}};
 f.write(name+'/browser-attempt.json',{schema:'heygen-studio-browser-attempt-v1',phase:'preview-readiness',request_id:f.input.request_id,draft_id:f.input.draft_id,speech_text_sha256:f.input.speech_text_sha256,started_at:iso(start_at)});
 const proc={scope:'owned-child-tree',pid:900004,periodic_run_id,started_at:iso(start_at),deadline_ms:clock()+300000};
 f.write(name+'/process/process-started.json',proc);f.write(name+'/process/process-exit.json',{...proc,finished_at:iso(finished_at),exit_code:0,timed_out:false,termination_unconfirmed:false});
 const summary=structuredClone(f.read(f.accepted+'/browser-events.json'));Object.assign(summary,{phase:'preview-readiness',observation_received:false,draft_checkpoint_saved:false});Object.assign(summary.validation,{provider_edit_lock_accepted:true,persisted_draft_verified:false,marker_count:0,unique_marker_count:0,repeated_observation_count:0});for(const e of summary.events)if(e.tool&&e.event==='item.completed')e.response_sha256=browser_evidence_sha256;
 f.write(name+'/browser-events.json',summary);f.write(name+'/studio-provider-edit-lock.json',certificate);
 return{name,certificate,file:path.join(f.dir,name,'studio-provider-edit-lock.json'),sha256:previewSha(fs.readFileSync(path.join(f.dir,name,'studio-provider-edit-lock.json')))};
}

export function writeProviderEditorHistory(options={}){
 const f=writeStudioPersistenceHistory(options);
 f.input.voice_id=f.read('preview-prepared-draft.json').binding.voice_id;
 f.patch(f.accepted+'/browser-events.json',s=>s.validation.persisted_draft_verified=true);
 f.patch(f.failed+'/browser-events.json',s=>{s.failure_code=s.parent_failure_code=s.structured_failure.code='STUDIO_PREVIEW_TAB_OWNED';s.structured_failure.diagnostic='SYNTHETIC official same-draft editor lock';});
 f.authorization=writeProviderEditorAuthorization(f);f.lock=writeProviderEditorLock(f);
 f.lockInput=()=>({...f.input,provider_edit_lock_file:f.lock.file});
 f.originalBytes=()=>Object.fromEntries(['preview-prepared-draft.json','studio-draft.json','preview-acquisition-intent.json','preview-play-intent.json',f.failed+'/browser-attempt.json',f.failed+'/browser-events.json',f.failed+'/browser-events.ndjson',f.failed+'/process/process-started.json',f.failed+'/process/process-exit.json'].map(name=>[name,fs.readFileSync(path.join(f.dir,name))]));
 return f;
}

export function writeProviderEditorTransfer(f,claim,{transferred_at=f.input.clock()+10,editor_transfer_clicked=true}={}){
 const manifest={schema:'heygen-studio-provider-editor-transfer-observed-v1',request_id:f.input.request_id,draft_id:f.input.draft_id,speech_text_sha256:f.input.speech_text_sha256,voice_id:f.input.voice_id,owner_editor_authorization_sha256:f.authorization.sha256,authorization_nonce:f.authorization.manifest.authorization_nonce,editor_intent_sha256:claim.journal_sha256,transferred_at:new Date(transferred_at).toISOString(),editor_transfer_clicked,new_play_allowed:false};
 f.write(PROVIDER_EDITOR_TRANSFER_FILE,manifest);return{manifest,file:path.join(f.dir,PROVIDER_EDITOR_TRANSFER_FILE),sha256:previewSha(fs.readFileSync(path.join(f.dir,PROVIDER_EDITOR_TRANSFER_FILE)))};
}

export function finishProviderEditorAttempt(f,claim,{
 phase='provider-editor-continuation',name=path.basename(claim.dir),
 started_at=f.input.clock()+1,finished_at=f.input.clock()+50,
 exit_code=0,timed_out=false,termination_unconfirmed=false,accepted=true,
}={}){
 const iso=value=>new Date(value).toISOString(),evidence='6'.repeat(64);
 f.write(name+'/browser-attempt.json',{schema:'heygen-studio-browser-attempt-v1',phase,request_id:f.input.request_id,draft_id:f.input.draft_id,speech_text_sha256:f.input.speech_text_sha256,started_at:iso(started_at)});
 const proc={scope:'owned-child-tree',pid:900005,periodic_run_id:f.input.periodic_run_id,started_at:iso(started_at),deadline_ms:f.input.clock()+300000};f.write(name+'/process/process-started.json',proc);f.write(name+'/process/process-exit.json',{...proc,finished_at:iso(finished_at),exit_code,timed_out,termination_unconfirmed});
 const summary=structuredClone(f.read(f.accepted+'/browser-events.json'));Object.assign(summary,{phase,classification:accepted?'observation-received':'child-or-ui-failure',parent_accepted:accepted,observation_received:accepted,draft_checkpoint_saved:false,exit_code,timed_out,termination_unconfirmed});Object.assign(summary.validation,{parent_accepted:accepted,provider_editor_persistence_accepted:accepted,persisted_draft_verified:accepted,exit_code_ok:exit_code===0,timed_out,termination_unconfirmed});for(const e of summary.events)if(e.tool&&e.event==='item.completed')e.response_sha256=evidence;
 if(!accepted){summary.failure_code=summary.parent_failure_code='STUDIO_PREVIEW_BROWSER_RESULT_UNKNOWN';summary.validation.marker_count=summary.validation.unique_marker_count=0;summary.validation.repeated_observation_count=0;}
 f.write(name+'/browser-events.json',summary);return{name,evidence};
}

export function writeProviderEditorPersistence(f,claim,verification,{
 current_audio={present:null,ready_state:null,duration_seconds:null,media_url_sha256:null,generation_in_progress:null},
 verified_at=f.input.clock()+60,
}={}){
 const hash=name=>previewSha(fs.readFileSync(path.join(f.dir,name))),manifest={schema:'heygen-studio-provider-editor-persistence-v1',request_id:f.input.request_id,binding:{...f.input.binding},draft_id:f.input.draft_id,speech_text_sha256:f.input.speech_text_sha256,voice_id:f.input.voice_id,owner_editor_authorization_sha256:f.authorization.sha256,editor_intent_sha256:claim.journal_sha256,lock_certificate_sha256:f.lock.sha256,editor_transfer_observed_sha256:hash(PROVIDER_EDITOR_TRANSFER_FILE),verification_attempt:verification.name,browser_evidence_sha256:verification.evidence,persisted_draft_verified:true,verified_at:new Date(verified_at).toISOString(),current_audio,same_draft_only:true,new_request:false,new_play_allowed:false,previous_preview_outcome:'unchanged-unknown',history_reinterpreted:false};
 f.write(PROVIDER_EDITOR_PERSISTENCE_FILE,manifest);return{manifest,file:path.join(f.dir,PROVIDER_EDITOR_PERSISTENCE_FILE),sha256:hash(PROVIDER_EDITOR_PERSISTENCE_FILE)};
}

export function writeProviderOwnerPreviewAuthorization(f,{persistence_file=PROVIDER_EDITOR_PERSISTENCE_FILE}={}){
 const editor=f.read(PROVIDER_EDITOR_AUTHORIZATION_FILE),hash=name=>previewSha(fs.readFileSync(path.join(f.dir,name))),manifest={schema:'heygen-studio-owner-preview-authorization-v2',job_id:editor.job_id,request_id:editor.request_id,draft_id:editor.draft_id,binding:{...editor.binding},speech_text_sha256:editor.speech_text_sha256,voice_id:editor.voice_id,prepared_file_sha256:hash('preview-prepared-draft.json'),acquisition_intent_sha256:hash('preview-acquisition-intent.json'),play_intent_sha256:hash('preview-play-intent.json'),persistence_evidence_sha256:hash(persistence_file),authorization_nonce:editor.authorization_nonce,authorized_at:editor.authorized_at,source_chat_id:editor.source_chat_id,owner_instruction:editor.owner_instruction,maximum_extra_play_count:1,new_request:false,new_provider_draft_allowed:false,new_payment_limit:0,api_fallback_allowed:false,publication_authorized:false,previous_preview_outcome:'unchanged-unknown',owner_editor_authorization_sha256:hash(PROVIDER_EDITOR_AUTHORIZATION_FILE)};
 f.write('studio-owner-preview-authorization.json',manifest);return{manifest,file:path.join(f.dir,'studio-owner-preview-authorization.json'),sha256:hash('studio-owner-preview-authorization.json')};
}

export function writeProviderEditorOrphanedDiscovery(f,{
 name='browser-88888888-8888-4888-8888-888888888888',
 started_at=Date.parse(f.read('preview-play-intent.json').created_at)-60000,
 phase='recover-preparation',draft_id=null,pid=900006,
}={}){
 const iso=value=>new Date(value).toISOString();
 f.write(name+'/browser-attempt.json',{schema:'heygen-studio-browser-attempt-v1',phase,request_id:f.input.request_id,draft_id,speech_text_sha256:f.input.speech_text_sha256,started_at:iso(started_at)});
 f.write(name+'/process/process-started.json',{scope:'owned-child-tree',pid,periodic_run_id:'SYNTHETIC-legacy-discovery-run',started_at:iso(started_at+10),deadline_ms:started_at+10000});
 const events=[{event:'thread.started',tool:null},{event:'turn.started',tool:null},{event:'item.started',item_id:'SYNTHETIC-orphan-cua',item_type:'mcp_tool_call',tool:'cua_repl.js',status:'in_progress',api_calls:['getState']},{event:'item.completed',item_id:'SYNTHETIC-orphan-cua',item_type:'mcp_tool_call',tool:'cua_repl.js',status:'completed',response_sha256:'8'.repeat(64)}];
 const file=path.join(f.dir,name,'browser-events.ndjson');fs.writeFileSync(file,events.map(event=>JSON.stringify(event)+'\n').join(''));
 return{name,pid,events,file,sha256:previewSha(fs.readFileSync(file)),started_at:iso(started_at+10)};
}

export function writeProviderEditorDirectAccess(f,{
 name='readiness-99999999-9999-4999-8999-999999999999',
 started_at=f.input.clock()-300,finished_at=f.input.clock()-100,
}={}){
 const verification=finishProviderEditorAttempt(f,{dir:path.join(f.dir,name)},{name,phase:'preview-readiness',started_at,finished_at});
 f.patch(name+'/browser-events.json',summary=>{summary.validation.provider_editor_direct_access_accepted=true;summary.validation.same_draft_reload_verified=true;});
 return verification;
}
