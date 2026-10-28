// Explicit owner consent to replace an unacknowledged Studio preparation.
// Old attempts remain unchanged and unknown. This is not a provider/API retry.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {speechSha} from './native-speech-policy.mjs';
import {claimOwnerPreparationResume} from './heygen-owner-preparation-resume.mjs';

export const OWNER_PREPARATION_AUTHORIZATION='studio-owner-preparation-authorization.json';
export const OWNER_PREPARATION_CLAIM='studio-owner-preparation-claim.json';
function read(file){try{const s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink()&&s.size<2000000?JSON.parse(fs.readFileSync(file,'utf8')):null;}catch{return null;}}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}

export function claimOwnerPreparation({dir,request,binding,speech_text_sha256,clock=Date.now,isProcessAlive=alive}={}){
 const grant=read(path.join(dir,OWNER_PREPARATION_AUTHORIZATION));
 if(!grant)return null;
 const deny=()=>{throw Object.assign(Error('STUDIO_PREVIEW_OWNER_PREPARATION_UNAVAILABLE'),{code:'STUDIO_PREVIEW_OWNER_PREPARATION_UNAVAILABLE'});};
 const original=read(path.join(dir,'studio-prepare-started.json'));
 if(grant.schema!=='heygen-studio-owner-preparation-authorization-v1'||grant.request_id!==request.id||grant.job_id!==request.job_id||path.basename(dir)!==request.id||path.basename(path.dirname(dir))!=='automatic-clone'||path.basename(path.dirname(path.dirname(dir)))!=='revision-'+binding.revision||path.basename(path.dirname(path.dirname(path.dirname(dir))))!==request.job_id||speechSha(grant.binding)!==speechSha(binding)||grant.speech_text_sha256!==speech_text_sha256||!original||original.request_id!==request.id||speechSha(original.binding)!==speechSha(binding)||original.text_sha256!==speech_text_sha256||grant.original_started_sha256!==speechSha(fs.readFileSync(path.join(dir,'studio-prepare-started.json')))||grant.source!=='current-user-message'||typeof grant.owner_instruction!=='string'||!grant.owner_instruction.length||grant.owner_instruction_sha256!==speechSha(grant.owner_instruction)||!Number.isFinite(Date.parse(grant.authorized_at))||Date.parse(grant.authorized_at)>clock()+5000||grant.maximum_new_prepare_count!==1||grant.new_payment_limit!==0||grant.api_fallback_allowed!==false||grant.publication_authorized!==false||request.acquisition_method!=='heygen_studio_audio_preview'||request.provider_call_started||request.provider_result)return deny();
 // Consuming the grant cannot permanently disable read-only discovery of the
 // same unfinished preparation. Returning null uses the existing recovery
 // route; it does not create another claim, draft, preview or provider call.
 if(fs.existsSync(path.join(dir,OWNER_PREPARATION_CLAIM))){const spent=read(path.join(dir,OWNER_PREPARATION_CLAIM));if(spent?.schema!=='heygen-studio-owner-preparation-claim-v1'||spent.request_id!==request.id||spent.job_id!==request.job_id||speechSha(spent.binding)!==speechSha(binding)||spent.speech_text_sha256!==speech_text_sha256||spent.authorization_sha256!==speechSha(fs.readFileSync(path.join(dir,OWNER_PREPARATION_AUTHORIZATION))))return deny();return claimOwnerPreparationResume({dir,request,binding,speech_text_sha256,grant,spent,clock,isProcessAlive});}
 const names=fs.readdirSync(dir);
 if(names.some(n=>/^(?:studio-draft\.json|studio-play-observed\.json|preview-|provider-|generation-started\.json|readiness-)/.test(n)))return deny();
 // Never overlap a still-running child, including one which lost its summary.
 for(const name of names.filter(n=>/^browser-[a-f0-9-]{36}$/.test(n))){
  const started=read(path.join(dir,name,'process/process-started.json'));
  const ended=read(path.join(dir,name,'process/process-exit.json'));
  if(!started||!Number.isSafeInteger(started.pid)||ended&&(ended.pid!==started.pid||ended.started_at!==started.started_at)||(!ended||ended.termination_unconfirmed===true)&&isProcessAlive(started.pid)!==false)return deny();
 }
 const attempt='browser-'+randomUUID(),claim={schema:'heygen-studio-owner-preparation-claim-v1',request_id:request.id,job_id:request.job_id,binding,speech_text_sha256,authorization_sha256:speechSha(fs.readFileSync(path.join(dir,OWNER_PREPARATION_AUTHORIZATION))),next_attempt:attempt,claimed_at:new Date(clock()).toISOString(),previous_outcome:'unchanged-unknown',new_request:false,new_payment_limit:0};
 try{fs.writeFileSync(path.join(dir,OWNER_PREPARATION_CLAIM),JSON.stringify(claim,null,2)+'\n',{flag:'wx'});}catch(e){if(e.code==='EEXIST')return deny();throw e;}
 const attemptDir=path.join(dir,attempt);fs.mkdirSync(attemptDir);return{dir:attemptDir,claim};
}
