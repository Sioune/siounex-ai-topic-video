// A saved Play intent is not evidence that the browser was reached. Only a
// completed child failure before every tool call can resume the original Play.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {previewSha} from './heygen-preview-cache.mjs';

function read(file){if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||!fs.lstatSync(file).isFile()||fs.statSync(file).size>2000000)return null;try{const bytes=fs.readFileSync(file);return{value:JSON.parse(bytes),sha256:previewSha(bytes)};}catch{return null;}}
function completeEventStream(file,events){if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||!fs.lstatSync(file).isFile()||fs.statSync(file).size>2000000)return null;try{const bytes=fs.readFileSync(file),text=bytes.toString('utf8');if(!text.endsWith('\n'))return null;const lines=text.slice(0,-1).split('\n').map(line=>JSON.parse(line));return previewSha(lines)===previewSha(events)?previewSha(bytes):null;}catch{return null;}}
export function sanitizeStudioDiagnostic(value,input={}){
 let message=typeof value==='string'?value:typeof value?.message==='string'?value.message:'';
 for(const secret of [input.text,input.voice_id,input.title])if(typeof secret==='string'&&secret)message=message.split(secret).join('[private input]');
 return message.replace(/https?:\/\/[^\s<>"']+/gi,'[URL redacted]').replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [redacted]').replace(/\b(?:sk-|sess-)[A-Za-z0-9_-]+/g,'[credential redacted]').replace(/(["']?(?:access[_ -]?token|refresh[_ -]?token|api[_ -]?key|authorization|password|cookie|signature|secret)["']?\s*[=:]\s*["']?)[^\s,;}"']+/gi,'$1[redacted]').replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[credential redacted]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email redacted]').replace(/\b[a-f0-9]{24,}\b/gi,'[id redacted]').replace(/\b\d{11,}\b/g,'[number redacted]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,1600);
}
export function inspectUnstartedStudioPreview({dir,request_id,draft_id,speech_text_sha256,clock=Date.now}){
 if(!fs.existsSync(dir)||fs.lstatSync(dir).isSymbolicLink())return null;
 const acquisition=read(path.join(dir,'preview-acquisition-intent.json')),play=read(path.join(dir,'preview-play-intent.json')),a=acquisition?.value,p=play?.value,playAt=Date.parse(p?.created_at||'');
 if(!a||!p||a.binding?.request_id!==request_id||a.binding?.draft_id!==draft_id||a.binding?.speech_text_sha256!==speech_text_sha256||p.draft_id!==draft_id||p.acquisition_id!==a.acquisition_id||p.maximum_new_play_count!==1||!Number.isFinite(playAt))return null;
 if(['studio-play-observed.json','preview-loaded-audio.json','provider-receipt.json','preview-cache-metadata.json','preview-audio.download'].some(name=>fs.existsSync(path.join(dir,name)))||fs.readdirSync(dir).some(name=>/^provider-audio\./.test(name)))return null;
 const attempts=[];
 for(const entry of fs.readdirSync(dir,{withFileTypes:true}).filter(e=>/^browser-[A-Za-z0-9-]+$/.test(e.name))){
  if(!entry.isDirectory()||entry.isSymbolicLink())return null;
  const base=path.join(dir,entry.name),processDir=path.join(base,'process');if(fs.existsSync(processDir)&&fs.lstatSync(processDir).isSymbolicLink())return null;const start=read(path.join(base,'process/process-started.json')),startedAt=Date.parse(start?.value?.started_at||'');
  if(!Number.isFinite(startedAt)){if(fs.statSync(base).mtimeMs>=playAt)return null;continue;}if(startedAt<playAt)continue;
  const events=read(path.join(base,'browser-events.json')),exit=read(path.join(base,'process/process-exit.json')),e=events?.value,x=exit?.value;
  // Any started tool, missing terminal receipt, timeout or partial observation
  // remains unknown. An absent click marker alone never permits a second Play.
  if(!e||e.phase!=='preview'||e.classification!=='child-or-ui-failure'||e.observation_received!==false||e.play_journal_saved!==false||e.exit_code!==1||e.timed_out!==false||!Array.isArray(e.events)||!e.events.some(v=>['error','turn.failed'].includes(v.event))||e.events.some(v=>v.tool!=null)||e.browser_tool_call_count>0||e.tool_call_count>0||!x||x.exit_code!==1||x.timed_out!==false||x.termination_unconfirmed===true||x.pid!==start.value.pid||x.started_at!==start.value.started_at||!Number.isFinite(Date.parse(x.finished_at||''))||Date.parse(x.finished_at)<startedAt||Date.parse(x.finished_at)>clock()+5000)return null;
  const streamHash=completeEventStream(path.join(base,'browser-events.ndjson'),e.events),typed=e.tool_call_count!==undefined;if(!streamHash||e.events[0]?.event!=='thread.started'||e.events[1]?.event!=='turn.started'||e.events.at(-1)?.event!=='turn.failed'||e.events.some(v=>!['thread.started','turn.started','item.started','item.completed','item.updated','error','turn.failed'].includes(v.event)))return null;
  if(typed){if(e.tool_call_count!==0||e.browser_tool_call_count!==0||e.event_stream_complete!==true||e.events.some(v=>v.item_id&&!['reasoning','agent_message','todo_list'].includes(v.item_type)))return null;}
  // The old projector did not preserve item types. Its only recoverable legacy
  // shape is the complete pre-tool prefix: no item started/updated, at most the
  // initial non-tool item_0 completion, then error and the failed turn.
  else if(e.events.some(v=>['item.started','item.updated'].includes(v.event))||e.events.filter(v=>v.event==='item.completed').length>1||e.events.some(v=>v.event==='item.completed'&&(v.item_id!=='item_0'||v.tool!==null)))return null;
  const binding=read(path.join(base,'browser-attempt.json'));if(binding&&(binding.value.phase!=='preview'||binding.value.request_id!==request_id||binding.value.draft_id!==draft_id||binding.value.speech_text_sha256!==speech_text_sha256))return null;
  attempts.push({attempt:entry.name,started_at:start.value.started_at,finished_at:x.finished_at,events_sha256:events.sha256,event_stream_sha256:streamHash,exit_sha256:exit.sha256,start_sha256:start.sha256});
 }
 if(!attempts.length)return null;attempts.sort((a,b)=>a.started_at.localeCompare(b.started_at)||a.attempt.localeCompare(b.attempt));const last=attempts.at(-1);
 if(fs.existsSync(path.join(dir,'preview-resume-'+last.attempt+'.json')))return null;
 return{schema:'heygen-studio-unstarted-preview-v1',request_id,draft_id,speech_text_sha256,acquisition_id:a.acquisition_id,play_intent_sha256:play.sha256,attempts};
}
export function claimUnstartedStudioPreview(input){
 const proof=inspectUnstartedStudioPreview(input);if(!proof)return null;
 const attempt='browser-'+randomUUID(),source=proof.attempts.at(-1).attempt,file=path.join(input.dir,'preview-resume-'+source+'.json'),record={schema:'heygen-studio-resume-original-play-v1',request_id:input.request_id,draft_id:input.draft_id,speech_text_sha256:input.speech_text_sha256,acquisition_id:proof.acquisition_id,original_play_intent_sha256:proof.play_intent_sha256,proof_sha256:previewSha(proof),source_attempt:source,next_attempt:attempt,created_at:new Date((input.clock||Date.now)()).toISOString(),new_request:false,new_play_count_limit:1};
 try{fs.writeFileSync(file,JSON.stringify(record),{flag:'wx'});}catch(error){if(error.code==='EEXIST')return null;throw error;}
 const attemptDir=path.join(input.dir,attempt);fs.mkdirSync(attemptDir);return{dir:attemptDir,record};
}
