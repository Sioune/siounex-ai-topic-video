// Preserve raw transport errors. Only the exact pre-tool WebSocket fallback
// prelude can supply a semantic view, and persisted consumers require the
// parent's independently accepted observation plus a real successful receipt.
import {isNativeMetadataWarning} from './native-speech-policy.mjs';
import {studioBrowserEvents} from './heygen-studio-browser-discovery.mjs';
const prefix=Object.freeze([
 'Reconnecting... 2/5','Reconnecting... 3/5','Reconnecting... 4/5','Reconnecting... 5/5',
 'Falling back from WebSockets to HTTPS transport. request timed out',
]);
const safeId=/^[A-Za-z0-9_.:-]{1,200}$/,sha=/^[a-f0-9]{64}$/;
export const isStudioStartupTransportDiagnostic=value=>typeof value==='string'&&prefix.includes(value);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const receiptSuccess=r=>!!r&&r.exit_code===0&&r.timed_out===false&&r.termination_unconfirmed===false&&r.result_unknown===false&&r.lifecycle_cleanup_completed===true&&iso(r.started_at)&&iso(r.finished_at)&&Date.parse(r.finished_at)>=Date.parse(r.started_at);
const cleanPrelude=e=>object(e)&&e.event==='error'&&e.tool===null&&e.item_type===null&&e.item_id==null&&e.status==null&&e.response_sha256==null&&e.failure_class==null&&e.mcp_server==null&&e.mcp_tool==null&&!Object.hasOwn(e,'api_calls')&&Object.keys(e).every(k=>['event','tool','item_type','item_id','status','response_sha256','failure_class','diagnostic'].includes(k));
const rejectedMetadata=/\b(?:401|403|429)\b|site.?safety|security.?block|safety.?polic|access (?:is )?denied|permission denied|not permitted|forbidden|rate.?limit|too many requests|captcha|log[ -]?in|sign[ -]?in|verification|身份|验证码|登录|扫码/i;
const metadataWarning=e=>e.event==='item.completed'&&e.item_type==='error'&&e.tool===null&&e.status==null&&e.response_sha256==null&&e.failure_class==null&&!Object.hasOwn(e,'api_calls')&&isNativeMetadataWarning(e.diagnostic)&&!rejectedMetadata.test(e.diagnostic);
export function studioStartupCandidateView(raw,receipt){
 const events=Array.isArray(raw)?raw:[],records=events.every(object),indices=[];events.forEach((e,i)=>{if(isStudioStartupTransportDiagnostic(e?.diagnostic))indices.push(i);});
 const sequence=indices.length===prefix.length&&indices.every((n,i)=>cleanPrelude(events[n])&&events[n].diagnostic===prefix[i]&&(i===0||n===indices[i-1]+1));
 const firstTool=events.findIndex(e=>e?.tool!=null),before=sequence&&firstTool>=0&&indices.at(-1)<firstTool;
 const stripped=sequence?events.filter((_,i)=>!indices.includes(i)):events,tools=stripped.filter(e=>e?.tool!=null),ids=new Set(tools.map(e=>e.item_id));
 const terminal=stripped[0]?.event==='thread.started'&&stripped[1]?.event==='turn.started'&&stripped.at(-1)?.event==='turn.completed'&&['thread.started','turn.started','turn.completed'].every(type=>stripped.filter(e=>e?.event===type).length===1);
 const scope=records&&studioBrowserEvents(stripped)!==null;
 const noErrors=scope&&stripped.every(e=>{
  if(!['thread.started','turn.started','item.started','item.updated','item.completed','turn.completed'].includes(e.event)||e.status==='failed'||e.failure_class!=null)return false;
  if(e.item_type==='error')return metadataWarning(e);
  if(e.diagnostic!=null)return false;
  return e.tool!=null?e.item_type==='mcp_tool_call':e.item_type==null||['reasoning','agent_message','todo_list'].includes(e.item_type);
 });
 const complete=records&&ids.size>0&&[...ids].every(id=>{
  const rows=tools.filter(e=>e.item_id===id),first=rows[0],last=rows.at(-1);
  return safeId.test(id||'')&&first.event==='item.started'&&first.status==='in_progress'&&last.event==='item.completed'&&last.status==='completed'&&sha.test(last.response_sha256||'')&&rows.filter(e=>e.event==='item.started').length===1&&rows.filter(e=>e.event==='item.completed').length===1&&rows.every((e,i)=>e.item_type==='mcp_tool_call'&&e.tool===first.tool&&e.mcp_server===first.mcp_server&&e.mcp_tool===first.mcp_tool&&(i===0||i===rows.length-1||e.event==='item.updated'&&e.status==='in_progress'));
 });
 const cua=complete&&[...ids].some(id=>{const first=tools.find(e=>e.item_id===id);return first.item_type==='mcp_tool_call'&&first.tool==='cua_repl.js'&&['cua_repl','mcp__cua_repl'].includes(first.mcp_server)&&first.mcp_tool==='js';});
 const accepted=Array.isArray(raw)&&sequence&&before&&terminal&&noErrors&&complete&&cua&&receiptSuccess(receipt);
 return {events:accepted?stripped:raw,proof:{candidate_count:indices.length,sequence_accepted:sequence,before_first_tool:before,terminal_success:terminal,no_later_errors:noErrors,tool_results_complete:complete,real_cua_completed:cua,receipt_success:receiptSuccess(receipt),candidate_accepted:accepted}};
}
function parentAccepted(s,r){const v=s?.validation;return s?.schema==='heygen-studio-browser-events-v1'&&s.startup_transport_recovered===true&&s.parent_accepted===true&&s.event_stream_complete===true&&s.exit_code===0&&s.timed_out===false&&s.termination_unconfirmed===false&&v?.parent_accepted===true&&v.startup_transport_recovered===true&&v.failed===false&&v.scope_violation===false&&v.parse_errors===0&&v.event_overflow===false&&v.thread_received===true&&v.exit_code_ok===true&&v.timed_out===false&&v.termination_unconfirmed===false&&receiptSuccess(r);}
export function studioAcceptedEventView(summary,receipt){
 const raw=summary?.events;if(!parentAccepted(summary,receipt))return raw;
 return studioStartupCandidateView(raw,receipt).events;
}
export function studioAcceptedDiagnostics(summary,receipt,values){
 const raw=summary?.events,view=studioAcceptedEventView(summary,receipt);
 return view!==raw&&Array.isArray(view)&&Array.isArray(values)?values.filter(value=>!isStudioStartupTransportDiagnostic(value)):values;
}
