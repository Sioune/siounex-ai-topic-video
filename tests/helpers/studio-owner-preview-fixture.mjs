// Test-only synthetic parent authorization and completed metadata confirmation.
import fs from 'node:fs';
import path from 'node:path';
import {previewSha} from '../../scripts/heygen-preview-cache.mjs';
import {claimStudioPersistenceRepair} from '../../scripts/heygen-studio-persistence-repair.mjs';
import {OWNER_PREVIEW_AUTHORIZATION_FILE,OWNER_PREVIEW_AUTHORIZATION_INSTRUCTION} from '../../scripts/heygen-studio-owner-preview-continuation.mjs';
export function completeSyntheticStudioPersistence(f,{clock=f.input.clock,repair_at=clock()-10000}={}){
 const claim=claimStudioPersistenceRepair({...f.input,clock:()=>repair_at});if(!claim)throw Error('SYNTHETIC complete fixture needs an eligible original failure');
 const name=path.basename(claim.dir),draft_id=f.input.draft_id,request_id=f.input.request_id,speech_text_sha256=f.input.speech_text_sha256,start=new Date(repair_at+10).toISOString(),end=new Date(repair_at+1000).toISOString(),evidence='9'.repeat(64);
 f.write(name+'/browser-attempt.json',{schema:'heygen-studio-browser-attempt-v1',phase:'prepare',request_id,draft_id,speech_text_sha256,started_at:start});const proc={scope:'owned-child-tree',pid:900003,periodic_run_id:f.input.periodic_run_id,started_at:start,deadline_ms:clock()+300000};f.write(name+'/process/process-started.json',proc);f.write(name+'/process/process-exit.json',{...proc,finished_at:end,exit_code:0,timed_out:false,termination_unconfirmed:false});
 const summary=structuredClone(f.read(f.accepted+'/browser-events.json'));summary.validation.persisted_draft_verified=true;for(const e of summary.events)if(e.event==='item.completed'&&e.tool)e.response_sha256=evidence;f.write(name+'/browser-events.json',summary);
 f.write('studio-prepared-persistence.json',{schema:'heygen-studio-prepared-persistence-v1',request_id,binding:f.input.binding,draft_id,speech_text_sha256,repair_intent_sha256:claim.journal_sha256,browser_evidence_sha256:evidence,persisted_draft_verified:true,verified_at:new Date(repair_at+1010).toISOString(),same_draft_only:true,new_request:false,new_play_allowed:false,previous_preview_outcome:'unchanged-unknown',history_reinterpreted:false});
 return{claim,name};
}
export function writeOwnerPreviewAuthorization({dir,clock=Date.now,authorization_nonce='SYNTHETIC-owner-chat-nonce-unique',source_chat_id='SYNTHETIC-current-owner-chat',owner_instruction=OWNER_PREVIEW_AUTHORIZATION_INSTRUCTION}={}){
 const read=name=>({value:JSON.parse(fs.readFileSync(path.join(dir,name))),sha256:previewSha(fs.readFileSync(path.join(dir,name)))}),p=read('preview-prepared-draft.json'),a=read('preview-acquisition-intent.json'),j=read('preview-play-intent.json'),q=read('studio-prepared-persistence.json'),b=p.value.binding;
 const manifest={schema:'heygen-studio-owner-preview-authorization-v1',job_id:b.job_id,request_id:b.request_id,draft_id:b.draft_id,binding:{revision:b.revision,mode_epoch:b.mode_epoch,script_hash:b.script_hash,contract_hash:b.contract_hash},speech_text_sha256:b.speech_text_sha256,voice_id:b.voice_id,prepared_file_sha256:p.sha256,acquisition_intent_sha256:a.sha256,play_intent_sha256:j.sha256,persistence_evidence_sha256:q.sha256,authorization_nonce,authorized_at:new Date(clock()).toISOString(),source_chat_id,owner_instruction,maximum_extra_play_count:1,new_request:false,new_provider_draft_allowed:false,new_payment_limit:0,api_fallback_allowed:false,publication_authorized:false,previous_preview_outcome:'unchanged-unknown'};
 const file=path.join(dir,OWNER_PREVIEW_AUTHORIZATION_FILE);fs.writeFileSync(file,JSON.stringify(manifest),{flag:'wx'});return{manifest,file,sha256:previewSha(fs.readFileSync(file))};
}
