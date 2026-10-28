import fs from 'node:fs';
import path from 'node:path';
import {nativeSpeechFailureCode,isNativeMetadataWarning} from './native-speech-policy.mjs';

export const STUDIO_READINESS_CONNECTION_COOLDOWN_MS=15*60*1000;
function read(file){try{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>2000000)return null;return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function connectionReason(text){
 if(typeof text!=='string'||/timed?\s*out|timeout|deadline|watchdog|site.?safety|security.?block|safety.?polic|access (?:is )?denied|forbidden|permission denied/i.test(text))return null;
 if(/\bTab\s+\d+\s+(?:is\s+)?already part of browser session\b|\bTab\s+\d+[^\n]{0,80}\bowned by (?:another |browser )?session\b/i.test(text))return'tab-owned-by-another-session';
 if(/\b(?:Chrome|browser|browser extension|extension|browser tool)\s+(?:(?:is|was|has been)\s+)?(?:disconnected|not connected)\b|\b(?:browser|Chrome|extension) connection (?:is |was )?(?:closed|lost|disconnected)\b/i.test(text))return'browser-disconnected';
 return null;
}
// This only avoids another read-only connection probe. It never proves that
// an original audio request failed, or authorizes another Play.
export function studioReadinessCooldown({dir,request_id,draft_id,speech_text_sha256,clock=Date.now,phases=['preview-readiness']}){
 let entries;try{if(fs.lstatSync(dir).isSymbolicLink())return null;entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return null;}
 if(['studio-play-observed.json','preview-loaded-audio.json','provider-receipt.json','preview-cache-metadata.json','preview-audio.download'].some(name=>fs.existsSync(path.join(dir,name)))||entries.some(e=>/^provider-audio\./.test(e.name)))return null;
 const attempts=entries.filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&/^(?:readiness|browser)-[a-f0-9-]{36}$/.test(e.name)).map(e=>{const base=path.join(dir,e.name),binding=read(path.join(base,'browser-attempt.json')),started=read(path.join(base,'process/process-started.json'));return{base,name:e.name,binding,started,start:Date.parse(started?.started_at)};}).filter(a=>phases.includes(a.binding?.phase)&&a.binding.request_id===request_id&&a.binding.draft_id===draft_id&&a.binding.speech_text_sha256===speech_text_sha256&&Number.isFinite(a.start)).sort((a,b)=>b.start-a.start||b.name.localeCompare(a.name));
 const latest=attempts[0];if(!latest)return null;
 const events=read(path.join(latest.base,'browser-events.json')),exit=read(path.join(latest.base,'process/process-exit.json')),now=clock(),end=Date.parse(exit?.finished_at);
 if(!events||events.phase!==latest.binding.phase||!['child-or-ui-failure','observation-missing'].includes(events.classification)||events.event_stream_complete!==true||events.observation_received!==false||events.play_journal_saved!==false||events.timed_out!==false||events.termination_unconfirmed===true||!Array.isArray(events.events)||!Number.isInteger(exit?.exit_code)||exit.exit_code<0||exit.timed_out!==false||exit.termination_unconfirmed===true||exit.pid!==latest.started.pid||exit.started_at!==latest.started.started_at||events.exit_code!==exit.exit_code||!Number.isFinite(end)||end<latest.start||end>now||end+STUDIO_READINESS_CONNECTION_COOLDOWN_MS<=now)return null;
 const operational=events.failure_code||events.events.filter(e=>['error','turn.failed'].includes(e.event)||e.item_type==='error').map(e=>e.diagnostic).filter(d=>d&&!isNativeMetadataWarning(d)).map(d=>nativeSpeechFailureCode(d,'NATIVE_CLI')).find(code=>['NATIVE_CLI_RATE_LIMITED','NATIVE_CLI_CAPACITY_UNAVAILABLE'].includes(code));
 if(['NATIVE_CLI_RATE_LIMITED','NATIVE_CLI_CAPACITY_UNAVAILABLE'].includes(operational))return{reason:operational==='NATIVE_CLI_RATE_LIMITED'?'native-cli-rate-limited':'native-cli-capacity-unavailable',next_retry_at:new Date(end+STUDIO_READINESS_CONNECTION_COOLDOWN_MS).toISOString(),source_attempt:latest.name};
 // A completed zero-tool read with no observation has no useful new UI result.
 // Delaying the next identical read never authorizes Play or changes its state.
 if(events.classification==='observation-missing'&&events.exit_code===0&&events.tool_call_count===0&&events.browser_tool_call_count===0)return{reason:'browser-observation-not-produced',next_retry_at:new Date(end+STUDIO_READINESS_CONNECTION_COOLDOWN_MS).toISOString(),source_attempt:latest.name};
 const failures=events.events.filter(e=>e.tool==='cua_repl.js'&&(e.status==='failed'||e.failure_class==='ui-result-unknown'));if(!failures.length||failures.some(e=>!connectionReason(e.diagnostic)))return null;const failure=failures[0];
 return{reason:connectionReason(failure.diagnostic),next_retry_at:new Date(end+STUDIO_READINESS_CONNECTION_COOLDOWN_MS).toISOString(),source_attempt:latest.name};
}
