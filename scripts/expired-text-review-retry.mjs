// Inspect existing bytes/processes only. Never starts a model, writes a file, or resolves an unknown result.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {legacyProcessAlive} from './legacy-selection-policy-transition.mjs';
import {reviewExecutionBinding} from './completed-review-output.mjs';
import {cliRejectionEvents} from '../lib/cli-failure-contract.mts';
import {TEXT_REVIEW_RETRY_SCHEMA,currentTextReviewRetry,textReviewRetryBinding,validTextReviewRetryProof} from '../lib/text-review-retry-contract.mts';
import {projectPreviousTextReviewPrompt} from './text-review-skill-context.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const fail=code=>{throw Object.assign(Error(code),{code})};
function originalRetryPrompt(reviewRoot,p){
 const found=[],base=path.join(reviewRoot,p.original_cache_key);
 function walk(dir,depth=0){if(depth>3||!fs.existsSync(dir))return;if(fs.lstatSync(dir).isSymbolicLink())fail('TEXT_REVIEW_RETRY_LINKED_FILE');for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())fail('TEXT_REVIEW_RETRY_LINKED_FILE');const f=path.join(dir,e.name);if(e.isDirectory())walk(f,depth+1);else if(e.name==='review-execution-intent.json'){const intent=JSON.parse(fs.readFileSync(f,'utf8'));if(intent.binding?.invocation_id!==p.invocation_id)continue;const prompt=fs.readFileSync(path.join(dir,'prompt.txt'),'utf8');if(sha(prompt)!==p.prompt_sha256)fail('TEXT_REVIEW_RETRY_ORIGINAL_BINDING_CHANGED');found.push(prompt)}}}
 walk(base);if(found.length!==1)fail('TEXT_REVIEW_RETRY_EXACT_INVOCATION_MISSING');return found[0];
}
export function inspectExpiredTextReview({job,milestone,root=process.cwd(),isProcessAlive=legacyProcessAlive,now=Date.now()}={}){
 if(!currentTextReviewRetry(job,milestone,now))fail('TEXT_REVIEW_RETRY_CURRENT_SCOPE_INVALID');
 const reviewRoot=path.resolve(root,'.sites-runtime/reviews');if(fs.realpathSync(reviewRoot)!==reviewRoot)fail('TEXT_REVIEW_RETRY_DIRECTORY_UNSAFE');
 const read=file=>{const s=fs.lstatSync(file);if(s.isSymbolicLink()||!s.isFile()||s.size>3000000)fail('TEXT_REVIEW_RETRY_FILE_UNSAFE');return fs.readFileSync(file)};
 const expected=reviewExecutionBinding(job,milestone),matches=[];let visited=0;
 function walk(dir,depth=0){if(depth>5||++visited>10000||fs.lstatSync(dir).isSymbolicLink())fail('TEXT_REVIEW_RETRY_DIRECTORY_UNSAFE');for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())fail('TEXT_REVIEW_RETRY_LINKED_FILE');const file=path.join(dir,e.name);if(e.isDirectory())walk(file,depth+1);else if(e.name==='review-execution-intent.json'){const bytes=read(file),v=JSON.parse(bytes);if(canonical(v.binding)===canonical(expected))matches.push({dir,intent:v,intentBytes:bytes});}}}
 walk(reviewRoot);if(matches.length!==1)fail('TEXT_REVIEW_RETRY_EXACT_INVOCATION_MISSING');
 const {dir,intent,intentBytes}=matches[0];
 const absent=()=>{for(const name of ['output.json','execution.json','receipt.json'])if(fs.existsSync(path.join(dir,name)))fail('TEXT_REVIEW_RETRY_RESULT_REQUIRES_RECONCILIATION')};absent();
 const prompt=read(path.join(dir,'prompt.txt')),schema=read(path.join(dir,'schema.json')),startedBytes=read(path.join(dir,'cli-process/cli-process-started.json')),ownedBytes=read(path.join(dir,'cli-process/cli-owned-child.json')),exitBytes=read(path.join(dir,'cli-process/cli-process-exit.json')),eventBytes=read(path.join(dir,'cli-process/cli-events.log'));
 const start=JSON.parse(startedBytes),owned=JSON.parse(ownedBytes),exit=JSON.parse(exitBytes),choices=JSON.parse(schema).properties?.checks?.items?.properties?.evidence?.enum,key=sha(prompt+'\nreview-evidence-schema-v3\n'+JSON.stringify(choices));
 const relative=path.relative(reviewRoot,dir).split(path.sep),knownDirectory=relative[0]===key&&(relative.length===1||relative.length===3&&/^(?:recovery|owner-retry)-[a-f0-9]{64}$/.test(relative[1])&&relative[2]==='ai-call-'+job.ai_calls);
 if(!knownDirectory||intent.schema!=='review-execution-intent-v1'||intent.prompt_sha256!==sha(prompt)||intent.schema_sha256!==sha(schema)||start.sandbox!=='read-only'||start.scope!=='owned-cli-child-tree'||start.model!=='gpt-5.6-sol'||start.prompt_sha256!==sha(prompt)||owned.scope!==start.scope||owned.started_at!==start.started_at||exit.scope!==start.scope||exit.started_at!==start.started_at||exit.pid!==owned.pid||exit.prompt_sha256!==sha(prompt)||!Number.isFinite(Date.parse(exit.finished_at))||!Number.isInteger(exit.exit_code)||exit.exit_code===0||exit.output_present!==false||exit.output_sha256||exit.error_code==='CLI_COMPLETED'||!Number.isSafeInteger(owned.pid)||owned.pid<1||!Number.isSafeInteger(owned.parent_pid)||owned.parent_pid<1)fail('TEXT_REVIEW_RETRY_READONLY_PROCESS_UNPROVEN');
 const parsed=cliRejectionEvents(eventBytes.toString('utf8'));if(!parsed.complete)fail('TEXT_REVIEW_RETRY_UNKNOWN_EVENT');
 let thread=false,turn=false;for(const e of parsed.events){if(e.type==='thread.started'){thread=true;continue}if(e.type==='turn.started'){turn=true;continue}if(['error','turn.failed'].includes(e.type))continue;if(['item.started','item.completed'].includes(e.type)&&['reasoning','error'].includes(e.item?.type))continue;fail('TEXT_REVIEW_RETRY_POSSIBLE_OUTPUT_OR_TOOL_EVENT')}
 if(!thread||!turn||exit.tool_events!==0||exit.event_log_sha256!==sha(eventBytes))fail('TEXT_REVIEW_RETRY_EVENTS_UNPROVEN');
 const checkProcesses=()=>{for(const pid of [owned.pid,owned.parent_pid])if(isProcessAlive(pid,{startedAt:owned.started_at,output:path.join(dir,'output.json')})!==false)fail('TEXT_REVIEW_RETRY_PROCESS_STILL_RUNNING')};checkProcesses();
 // Close the inspection race without changing the original invocation files.
 for(const [name,bytes] of [['prompt.txt',prompt],['schema.json',schema],['review-execution-intent.json',intentBytes],['cli-process/cli-process-started.json',startedBytes],['cli-process/cli-owned-child.json',ownedBytes],['cli-process/cli-process-exit.json',exitBytes],['cli-process/cli-events.log',eventBytes]])if(!read(path.join(dir,name)).equals(bytes))fail('TEXT_REVIEW_RETRY_EVIDENCE_CHANGED');absent();checkProcesses();
 return {schema:TEXT_REVIEW_RETRY_SCHEMA,...textReviewRetryBinding(job,milestone),source_snapshot_sha256:sha(job.source_snapshot),skill_snapshot_sha256:sha(job.skill_snapshot),artifact_json_sha256:sha(milestone.artifact),original_report_sha256:sha(milestone.report??'null'),original_cache_key:key,prompt_sha256:sha(prompt),schema_sha256:sha(schema),intent_sha256:sha(intentBytes),started_sha256:sha(startedBytes),owned_process_sha256:sha(ownedBytes),process_exit_sha256:sha(exitBytes),event_log_sha256:sha(eventBytes),original_started_at:start.started_at,original_exit_code:exit.exit_code,original_exit_category:exit.error_code,read_only:true,original_process_no_longer_running:true,local_output_present:false,completed_local_result_present:false,original_result_unknown:true,original_files_preserved:true,observed_tool_calls:0,new_model_calls:0,verified_at:new Date(now).toISOString()};
}

// Read back the server's owner retry audit after an ordinary, counted claim.
// The old unknown invocation is inspected again; it is never overwritten.
export function ownerTextReviewRetryDirectory({baseDir,job,milestone,prompt,key,claim,isProcessAlive=legacyProcessAlive}={}){
 const candidates=[];
 for(const r of job.reviews||[]){if(r.decision!=='owner_text_review_retry'||r.revision!==job.revision||r.content_hash!==milestone.artifact_hash)continue;let v;try{v=JSON.parse(r.note)}catch{continue}const p=v?.proof;if(p?.milestone_id===milestone.id&&p.ai_calls+1===job.ai_calls)candidates.push({r,v,p});}
 if(!candidates.length)return null;if(candidates.length!==1)fail('TEXT_REVIEW_RETRY_AUDIT_AMBIGUOUS');
 const {r,v,p}=candidates[0],current=job.milestones?.find(m=>m.id===milestone.id),ordinaryInvocation=`review-${sha(milestone.id+':'+milestone.artifact_hash+':'+milestone.mode_epoch)}-call-${job.ai_calls}`;
 if(v.schema!=='owner-text-review-retry-event-v1'||r.id!=='owner_text_review_retry_'+sha(JSON.stringify(p))||typeof r.reviewer!=='string'||!r.reviewer||job.owner_id&&job.owner_id!==r.reviewer||v.original_result_unknown!==true||v.new_model_calls!==0||v.quality_approval!==false||v.publication_authorization!==false||v.counters_preserved!==true||job.status!=='awaiting_review'||job.error||!claim?.review_token||claim.reconciliation_only===true||claim.invocation_id!==ordinaryInvocation||!current||current.status!=='ai_running'||current.invocation_id!==claim.invocation_id||current.revision!==job.revision||current.mode_epoch!==job.mode_epoch||current.artifact_hash!==milestone.artifact_hash||current.artifact!==milestone.artifact||p.job_id!==job.id||p.attempt!==job.attempt||p.revision!==job.revision||p.mode_epoch!==job.mode_epoch||p.contract_hash!==job.contract_hash||p.artifact_hash!==milestone.artifact_hash||!Number.isFinite(Date.parse(r.created_at)))fail('TEXT_REVIEW_RETRY_NEW_CLAIM_MISMATCH');
 const prior=v.prior,originalMilestone={...milestone,status:prior?.status,invocation_id:prior?.invocation_id,report:prior?.report,review_until:prior?.review_until,updated_at:prior?.updated_at},originalJob={...job,status:prior?.job_status,error:prior?.job_error,ai_calls:p.ai_calls,updated_at:p.job_updated_at,milestones:job.milestones.map(m=>m.id===milestone.id?originalMilestone:m)};
 if(!validTextReviewRetryProof(originalJob,originalMilestone,p)||(job.reviews||[]).some(stop=>stop.reviewer===r.reviewer&&['pause','production_cancelled','resume_stop','resume_manual','resume_manual_text','revise','script_feedback','script_feedback_rework'].includes(stop.decision)&&String(stop.created_at)>=p.original_started_at))fail('TEXT_REVIEW_RETRY_ORIGINAL_BINDING_CHANGED');
 const reviewRoot=path.dirname(path.resolve(baseDir)),root=path.dirname(path.dirname(reviewRoot));if(path.basename(reviewRoot)!=='reviews'||path.basename(path.dirname(reviewRoot))!=='.sites-runtime'||path.basename(path.resolve(baseDir))!==key)fail('TEXT_REVIEW_RETRY_DIRECTORY_UNSAFE');
 const checked=inspectExpiredTextReview({job:originalJob,milestone:originalMilestone,root,isProcessAlive,now:Date.parse(p.verified_at)});
 if(canonical(checked)!==canonical(p))fail('TEXT_REVIEW_RETRY_EVIDENCE_CHANGED');
 if(p.original_cache_key!==key||p.prompt_sha256!==sha(prompt)){
  const original=originalRetryPrompt(reviewRoot,p);
  if(projectPreviousTextReviewPrompt(original,job,milestone.node)!==prompt)fail('TEXT_REVIEW_RETRY_NEW_PROMPT_CHANGED');
 }
 return path.join(baseDir,'owner-retry-'+sha(JSON.stringify(p)),'ai-call-'+job.ai_calls);
}
