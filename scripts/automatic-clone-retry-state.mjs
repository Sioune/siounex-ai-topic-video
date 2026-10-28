// Bounded preparation retries only. This policy grants no draft creation,
// provider call, Play or recovery; the existing adapter retains those guards.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {sanitizeStudioDiagnostic} from './heygen-studio-preview-recovery.mjs';
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
// Captured once at module load. A live old process cannot claim that later
// on-disk edits have already been loaded into its running adapter.
const implementationFiles=['heygen-preview-cache.mjs','native-speech-bridge.mjs','../lib/studio-preview-generation-contract.mts','../lib/automatic-clone-contract.mts','automatic-clone-retry-state.mjs','automatic-clone-consumer.mjs','native-speech-read-direct.mjs','heygen-studio-preview-bridge.mjs','heygen-studio-preview-recovery.mjs','heygen-studio-preparation-recovery.mjs','heygen-studio-prepared-reuse.mjs','heygen-studio-persistence-repair.mjs','heygen-studio-owner-preview-continuation.mjs','heygen-studio-startup-transport.mjs','heygen-studio-app-server-child.mjs','heygen-studio-direct-bootstrap.mjs','resolve-studio-desktop-cli.mjs','heygen-studio-owned-page-cleanup.mjs','heygen-studio-owner-preparation.mjs','heygen-owner-preparation-resume.mjs','heygen-owner-preparation-pending.mjs','heygen-studio-pending-preparation.mjs','heygen-studio-inventory-date-group.mjs'];
// Visual recovery is part of the same loaded clone executor. Record these
// dependencies too, so a running old process cannot report a later repair.
implementationFiles.push('automatic-clone-render.mjs','completed-clone-results.mjs','clone-visual-repair.mjs','automatic-material-video.mjs','content-motion-plan.mjs','content-motion-qa.mjs','native-production-transport.mjs');
implementationFiles.push('resolve-native-production-cli.mjs','native-credential-direct.mjs','native-scheduled-worker.mjs','content-motion-repeat-review.mjs','../lib/content-motion-contract.mts');
implementationFiles.push('private-review-producer.mjs','private-review-continuation.mjs','finalize-brand-video.mjs','../production/corner-bug-policy.json','../production/assets/brand/corner_bug_v5.webm','../lib/brand-finalization-contract.mts');
let loadedStudioBindingSha256=null;try{const file=path.join(process.cwd(),'.sites-runtime/runtime-descriptors/studio-cli.json'),stat=fs.lstatSync(file);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=65536)loadedStudioBindingSha256=sha(fs.readFileSync(file));}catch{}
let loadedNativeProductionBindingSha256=null;try{const file=path.join(process.cwd(),'.sites-runtime/runtime-descriptors/production-cli.json'),stat=fs.lstatSync(file);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=65536)loadedNativeProductionBindingSha256=sha(fs.readFileSync(file));}catch{}
export const CLONE_PREPARATION_IMPLEMENTATION_SHA256=sha({files:implementationFiles.map(name=>({name,sha256:sha(fs.readFileSync(fileURLToPath(new URL(name,import.meta.url))))})),loaded_studio_binding_sha256:loadedStudioBindingSha256,loaded_native_production_binding_sha256:loadedNativeProductionBindingSha256});
export const CLONE_PREPARATION_RETRY_DELAYS_MS=Object.freeze([180000,360000,720000,1440000,1800000]);
const schema='automatic-clone-preparation-retry-v1',filename='studio-preparation-retry-state.json';
const eligibleCodes=new Set(['STUDIO_PREVIEW_BROWSER_UNAVAILABLE','STUDIO_PREVIEW_DRAFT_DISCOVERY_UNKNOWN','STUDIO_PREVIEW_DRAFT_NOT_FOUND','STUDIO_PREVIEW_BROWSER_UI_ERROR','NATIVE_CLI_CONNECTION_FAILED','STUDIO_PREVIEW_BROWSER_RESULT_UNKNOWN']);
const phases=new Set(['prepare','recover-preparation']);
const progressNames=['studio-draft.json','studio-owner-preparation-claim.json','studio-owner-preparation-resume-claim.json','studio-owner-preparation-ui-continuation.json','preparation-resume-pending.json','preview-play-intent.json','studio-play-observed.json','studio-owner-extra-play-observed.json','preview-loaded-audio.json','provider-receipt.json'];
const read=file=>{try{const s=fs.lstatSync(file);if(s.isSymbolicLink()||!s.isFile()||s.size>2000000)return null;const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),sha256:sha(bytes)};}catch{return null;}};
export function clonePreparationRetryFields(value){
 if(!value||!phases.has(value.phase)||!eligibleCodes.has(value.failure_code)||!Number.isSafeInteger(value.consecutive_count)||value.consecutive_count<1||value.consecutive_count>1000||typeof value.diagnostic!=='string'||value.diagnostic.length>600||!/^[a-f0-9]{64}$/.test(value.implementation_sha256||'')||![value.last_failed_at,value.next_retry_at].every(t=>typeof t==='string'&&/^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(t)&&Number.isFinite(Date.parse(t)))||Date.parse(value.next_retry_at)<=Date.parse(value.last_failed_at)||Date.parse(value.next_retry_at)>Date.parse(value.last_failed_at)+1800000)return null;
 return Object.fromEntries(['phase','failure_code','diagnostic','consecutive_count','last_failed_at','next_retry_at','implementation_sha256'].map(k=>[k,value[k]]));
}
export function createClonePreparationRetryPolicy({root=process.cwd(),job_id,now=Date.now,implementation_sha256=CLONE_PREPARATION_IMPLEMENTATION_SHA256}={}){
 if(!/^[a-f0-9]{64}$/.test(implementation_sha256)||typeof now!=='function')throw Error('CLONE_PREPARATION_RETRY_INPUT_INVALID');
 function directory(request){
  if(!/^job_[a-f0-9-]{36}$/.test(job_id||'')||!/^acl_[a-f0-9]{64}$/.test(request?.id||'')||!Number.isSafeInteger(request.binding?.revision)||request.binding.revision<1)return null;
  const base=path.resolve(root),dir=path.resolve(base,'.sites-runtime','authorized-inputs',job_id,'revision-'+request.binding.revision,'automatic-clone',request.id);
  let cursor=base;try{if(fs.lstatSync(base).isSymbolicLink())return null;for(const part of path.relative(base,dir).split(path.sep)){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())return null;}}catch{return null;}return dir;
 }
 function safeScope(request,dir){return dir&&request.acquisition_method==='heygen_studio_audio_preview'&&['cost_check_pending','blocked','queued'].includes(request.status)&&request.lease_until==null&&request.provider_call_started!==true&&!request.provider_result&&!['preview-play-intent.json','studio-play-observed.json','studio-owner-extra-play-observed.json','preview-loaded-audio.json','provider-receipt.json'].some(name=>fs.existsSync(path.join(dir,name)));}
 function progress(dir){return sha(progressNames.map(name=>({name,sha256:read(path.join(dir,name))?.sha256||null})));}
 const scope=request=>sha({job_id,request_id:request.id,binding:request.binding,first_review_id:request.first_review_id||null,base:request.base||null,voice_id:request.voice_id,acquisition_method:request.acquisition_method});
 function current(request,dir){const state=read(path.join(dir,filename))?.value;if(state?.schema!==schema||state.request_id!==request.id||state.scope_sha256!==scope(request)||state.implementation_sha256!==implementation_sha256||state.progress_sha256!==progress(dir)||!clonePreparationRetryFields(state))return null;return state;}
 function pending(request){const dir=directory(request);if(!safeScope(request,dir))return null;const state=current(request,dir);return state&&Date.parse(state.next_retry_at)>now()?clonePreparationRetryFields(state):null;}
 function record(request,error,{started_at_ms=now()}={}){
  const dir=directory(request);if(!safeScope(request,dir)||!eligibleCodes.has(error?.code))return null;
  const candidates=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&/^browser-[a-f0-9-]{36}$/.test(e.name)).flatMap(e=>{
   const base=path.join(dir,e.name),a=read(path.join(base,'browser-attempt.json')),s=read(path.join(base,'browser-events.json')),x=read(path.join(base,'process/process-exit.json'));
   if(a?.value.request_id!==request.id||!phases.has(a.value.phase)||s?.value.phase!==a.value.phase||s.value.draft_checkpoint_saved!==false||s.value.play_journal_saved!==false||!eligibleCodes.has(s.value.failure_code)||!x||x.value.termination_unconfirmed===true||!Number.isFinite(Date.parse(x.value.finished_at))||Date.parse(x.value.finished_at)<started_at_ms-5000||Date.parse(x.value.finished_at)>now()+5000)return[];
   return[{attempt:e.name,summary:s,phase:a.value.phase,finished_at:x.value.finished_at,evidence_sha256:sha({attempt:a.sha256,summary:s.sha256,exit:x.sha256})}];
  }).sort((a,b)=>a.finished_at.localeCompare(b.finished_at));
  const last=candidates.at(-1);if(!last)return null;const previous=current(request,dir);if(previous?.source_attempt===last.attempt&&previous.evidence_sha256===last.evidence_sha256)return clonePreparationRetryFields(previous);
  const failure_code=last.summary.value.failure_code,consecutive_count=previous&&previous.phase===last.phase&&previous.failure_code===failure_code?Math.min(1000,previous.consecutive_count+1):1;
  const diagnostic=sanitizeStudioDiagnostic(last.summary.value.structured_failure?.diagnostic||error.diagnostic||error.message,{voice_id:request.voice_id}).slice(0,600),at=now(),delay=CLONE_PREPARATION_RETRY_DELAYS_MS[Math.min(consecutive_count-1,CLONE_PREPARATION_RETRY_DELAYS_MS.length-1)],providerNext=Date.parse(error.next_retry_at||'');
  const state={schema,job_id,request_id:request.id,scope_sha256:scope(request),progress_sha256:progress(dir),implementation_sha256,source_attempt:last.attempt,evidence_sha256:last.evidence_sha256,phase:last.phase,failure_code,diagnostic,consecutive_count,last_failed_at:new Date(at).toISOString(),next_retry_at:new Date(Math.min(at+1800000,Math.max(at+delay,Number.isFinite(providerNext)?providerNext:0))).toISOString()};
  const bytes=JSON.stringify(state,null,2),history=path.join(dir,'preparation-retry-history');if(fs.existsSync(history)&&fs.lstatSync(history).isSymbolicLink())return null;fs.mkdirSync(history,{recursive:true});fs.writeFileSync(path.join(history,randomUUID()+'.json'),bytes,{flag:'wx',mode:0o600});const temp=path.join(dir,'.preparation-retry-'+randomUUID()+'.json');fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});fs.renameSync(temp,path.join(dir,filename));return clonePreparationRetryFields(state);
 }
 return Object.freeze({pending,record});
}
export function clonePreparationRetryReason(retry){
 const r=clonePreparationRetryFields(retry);if(!r)return null;const stage=r.phase==='prepare'?'建立本人声草稿':'查找原本人声草稿',time=new Date(Date.parse(r.next_retry_at)+8*3600000).toISOString().replace('T',' ').slice(0,19);
 return stage+'未完成：'+r.failure_code+'；'+r.diagnostic+'。同阶段连续失败'+r.consecutive_count+'次，下次检查 '+time+'（北京时间）。保留原请求与首审；本次未进入试听。';
}

