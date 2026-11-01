// An abandoned read-only planning child may have an unknown remote result.
// Preserve that fact and every original file; only admit a separate attempt.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {legacyProcessAlive} from './legacy-selection-policy-transition.mjs';
import {isNativeMetadataWarning} from './native-speech-policy.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const transportMessage=value=>typeof value==='string'&&(
 /^Reconnecting\.\.\. (?:\d+\/\d+ \((?:request timed out|stream disconnected before completion: (?:tls handshake eof|[^\r\n]*\(os error 10054\)|Transport error: network error: error decoding response body))\)|waiting for network \(Connection failed: error sending request\))$/.test(value)||
 /^Falling back from WebSockets to HTTPS transport\. stream disconnected before completion: (?:tls handshake eof|[^\r\n]*\(os error 10054\))$/.test(value));
function safeDiagnostic(line){return /^\d{4}-\d\d-\d\dT\S+ ERROR (?:codex_models_manager::manager: failed to refresh available models: timeout waiting for child process to exit|codex_skills_extension::host_service: failed to install system skills: io error while remove existing system skills dir: [^\r\n]*\(os error 5\)|codex_api::endpoint::responses_websocket: failed to connect to websocket: IO error: (?:tls handshake eof|[^\r\n]*\(os error 10054\)), url: wss:\/\/chatgpt\.com\/backend-api\/codex\/responses)$/.test(line);}
function safeEvents(log){
 const lines=log.trim().split(/\r?\n/);if(!log.trim()||lines.length>100000)return false;
 let thread=false,turn=false;
 for(const line of lines){let e;try{e=JSON.parse(line);}catch{if(safeDiagnostic(line))continue;return false;}
  if(e.type==='thread.started'&&typeof e.thread_id==='string'){thread=true;continue;}
  if(e.type==='turn.started'){turn=true;continue;}
  if(e.type==='error'&&transportMessage(e.message))continue;
  if(e.type==='item.completed'&&e.item?.type==='error'&&(isNativeMetadataWarning(e.item.message)||transportMessage(e.item.message)))continue;
  return false;
 }
 return thread&&turn;
}
export function inspectStaleMaterialSelection({dir,started,intent,prompt,binding,read,isProcessAlive=legacyProcessAlive}){
 const output=path.join(dir,'selection.json'),receipt=path.join(dir,'selection-receipt.json'),meta=path.join(dir,'process');
 if(fs.existsSync(output)||fs.existsSync(receipt)||fs.existsSync(path.join(meta,'cli-process-exit.json'))||canonical(started.binding)!==canonical(binding))throw Error('selection-result-requires-recovery');
 const startBytes=read(path.join(meta,'cli-process-started.json')),ownedBytes=read(path.join(meta,'cli-owned-child.json')),events=read(path.join(meta,'cli-events.log'));
 const start=JSON.parse(startBytes),owned=JSON.parse(ownedBytes);
 if(start.sandbox!=='read-only'||start.scope!=='owned-cli-child-tree'||start.prompt_sha256!==sha(prompt)||!Number.isFinite(Date.parse(start.started_at))||Math.abs(Date.parse(start.started_at)-Date.parse(started.started_at))>2000||owned.started_at!==start.started_at||owned.scope!==start.scope||!Number.isSafeInteger(owned.pid)||owned.pid<1||!Number.isSafeInteger(owned.parent_pid)||owned.parent_pid<1||!safeEvents(events.toString('utf8')))throw Error('unconfirmed-readonly-selection');
 const proof={schema:'stale-readonly-material-selection-v1',input_hash:started.input_hash,binding,intent_sha256:sha(intent),prompt_sha256:sha(prompt),process_started_sha256:sha(startBytes),owned_process_sha256:sha(ownedBytes),event_log_sha256:sha(events),original_started_at:started.started_at,original_result_unknown:true,original_files_preserved:true,original_process_no_longer_running:true,observed_tool_calls:0,output_reused:false};
 const proofFile=path.join(dir,'selection-stale-readonly.json');
 // A verified dead process cannot return. Repeating CIM under render load can
 // time out and wrongly reinstate the old hold after it was already resolved.
 // Reuse only this exact immutable observation; no output, intent, process or
 // log change may be hidden by it. The remote model result remains unknown.
 if(fs.existsSync(proofFile)){
  if(sha(read(proofFile))!==sha(Buffer.from(JSON.stringify(proof,null,2))))throw Error('stale-selection-proof-changed');
 }else for(const pid of [owned.pid,owned.parent_pid])if(isProcessAlive(pid,{startedAt:owned.started_at,output})!==false)throw Error('selection-process-still-running');
 if(fs.existsSync(output)||fs.existsSync(receipt)||fs.existsSync(path.join(meta,'cli-process-exit.json')))throw Error('selection-result-arrived');
 return proof;
}
