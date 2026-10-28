import {nativeSiteToken} from './native-site-token.mjs';
import {createHash} from 'node:crypto';

// Installed Sites plugin .app.json, and the raw MCP tool name from successful
// native receipts. These are child-only config overrides, never global edits.
export const SITES_CONNECTOR_ID='connector_20205bf7d4e99a89d7154bb849718324';
export const SITE_READ_TOOL='sites.get_site';
// Unique connector IDs from installed plugin .app.json manifests, not account,
// environment or credential files. Explicit false defeats inherited app enables.
export const INSTALLED_OTHER_CONNECTORS=Object.freeze([
 'asdk_app_68df038e0ba48191908c8434991bbac2',
 'asdk_app_69418aad55e08191aa5e437b649ca2e4',
 'asdk_app_69a1d78e929881919bba0dbda1f6436d',
 'asdk_app_sites_4123e20f32a48191b1e7165d4c44a50f',
 'asdk_app_sites_4e856e302c84819195eb6888eb101ab3',
 'connector_2128aebfecb84f64a069897515042a44',
 'connector_68df038e0ba48191908c8434991bbac2',
 'connector_68df33b1a2d081918778431a9cfca8ba',
 'connector_76869538009648d5b282a4bb21c3d157',
 'connector_947e0d954944416db111db556030eea6',
 'connector_openai_chatgpt_pets',
 'connector_openai_codex_document_control',
 'connector_openai_default_templates',
 'connector_openai_pages',
 'connector_openai_plugin_management',
 'connector_openai_write_like_me',
 'templated_apps_GitHubEnterprise',
]);
// Enumerated from this installation's native Sites tool metadata (2026-10-19).
// Explicit false also overrides inherited per-tool enables. New tools remain
// disabled by default; do not add a tool here without checking its provenance.
export const SITES_NATIVE_TOOLS=Object.freeze(['add_custom_domain','change_site_slug','create_schedule','create_site','create_source_repository_write_credential','deploy_private_site_version','deploy_site_version','generate_siwc_bypass_token','get_deployment_status','get_environment_variables','get_site','get_site_version','get_site_worker_logs','list_custom_domains','list_site_versions','list_sites','read_database_overview','read_database_table_rows','refresh_custom_domain_status','remove_custom_domain','save_site_version','save_version_and_deploy_private','update_environment_variables','update_site_access','update_site_metadata'].map(name=>'sites.'+name));
export const SITES_TOOL_POLICY=Object.freeze(Object.fromEntries(SITES_NATIVE_TOOLS.map(name=>[name,name===SITE_READ_TOOL])));
// CLI 0.153.2 splits the LEFT side on every dot without TOML key parsing.
// Keep raw names containing dots on the parsed TOML RIGHT side, as quoted keys.
export function sitesToolPolicyOverride(){return `apps.${SITES_CONNECTOR_ID}.tools={`+Object.entries(SITES_TOOL_POLICY).map(([name,enabled])=>`${JSON.stringify(name)}={enabled=${enabled}}`).join(',')+'}';}
export const CREDENTIAL_CONFIG=Object.freeze([
 'apps._default.enabled=false',
 ...INSTALLED_OTHER_CONNECTORS.map(id=>`apps.${id}.enabled=false`),
 `apps.${SITES_CONNECTOR_ID}.enabled=true`,
 `apps.${SITES_CONNECTOR_ID}.default_tools_enabled=false`,
 sitesToolPolicyOverride(),
 'features.shell_tool=false',
 'features.js_repl=false',
 'features.browser_use=false',
 'features.computer_use=false',
 'features.multi_agent=false',
 'features.multi_agent_v2=false',
 'web_search="disabled"',
]);
export function credentialConfigArgs(){return CREDENTIAL_CONFIG.flatMap(value=>['--config',value]);}
export function credentialChildArgs(cli,schemaFile){return [cli,'exec','--model','gpt-5.6-sol','--config','model_reasoning_effort="medium"',...credentialConfigArgs(),'--config','approval_policy="never"','--ephemeral','--sandbox','read-only','--color','never','--json','--output-schema',schemaFile,'-'];}

const BOOL_KEYS=['blocked','completed','new_fee'];
function finalSchema(text){try{const value=JSON.parse(text);return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===BOOL_KEYS.join(',')&&BOOL_KEYS.every(key=>typeof value[key]==='boolean')?{completed:value.completed,blocked:value.blocked,new_fee:value.new_fee}:null;}catch{return null;}}
function known(value,values){return values.includes(value)?value:'other';}
function toolName(value){return typeof value==='string'&&/^sites\.[a-z_]{1,60}$/.test(value)?value:'other';}
function eventName(value){return known(value,['thread.started','turn.started','turn.completed','turn.failed','error','item.started','item.updated','item.completed']);}
function argumentBinding(item,projectId){if(item.arguments===undefined)return 'not-emitted';let value=item.arguments;try{if(typeof value==='string')value=JSON.parse(value)}catch{return 'invalid'}return value&&typeof value==='object'&&!Array.isArray(value)&&value.project_id===projectId&&Object.keys(value).every(key=>['project_id','include_mcp_connection'].includes(key))?'matched':'mismatch';}
export function credentialErrorCode(value){
 const text=typeof value==='string'?value:'';
 if(/skill descriptions? (?:were |was |have been )?(?:shortened|truncated)/i.test(text))return 'SKILL_METADATA_WARNING';
 if(/cannot be used with|conflicts with.*--|argument.*conflict|unexpected argument|unrecognized (?:option|argument)/i.test(text))return 'CLI_ARGUMENT_CONFLICT';
 if(/unknown feature|unrecognized feature|unsupported feature|unknown.*feature.*flag/i.test(text))return 'FEATURE_UNKNOWN';
 if(/feature.*(?:incompatible|conflict)|(?:incompatible|conflict).*feature/i.test(text))return 'FEATURE_CONFLICT';
 if(/\b429\b|\btoo\s+many\s+requests\b|\brate[\s_-]+limit(?:ed|ing)?(?:\b|_)/i.test(text))return 'RATE_LIMITED';
 if(/authentication|unauthorized|not authenticated|login required|\b(?:HTTP|status)\s*401\b/i.test(text))return 'AUTHENTICATION_REQUIRED';
 if(/permission denied|forbidden|access denied|\b(?:HTTP|status)\s*403\b/i.test(text))return 'PERMISSION_DENIED';
 if(/invalid transport|invalid.*config|unknown.*config|(?:parse|deserialize).*config|\bTOML\b|unsupported transport|invalid (?:server )?url|certificate (?:verify|validation|has expired)|self.signed certificate/i.test(text))return 'CONFIGURATION_INVALID';
 if(/model.*(?:does not support|unsupported).*(?:tool|function)|(?:tool|function).*not supported.*model|unsupported parameter.*(?:tool|function)/i.test(text))return 'MODEL_TOOL_INTERFACE_UNSUPPORTED';
 if(/model.*unavailable|model.*not found/i.test(text))return 'MODEL_UNAVAILABLE';
 if(/(?:sandbox|read.only).*(?:unavailable|not supported|failed|cannot)|(?:failed|unable).*(?:sandbox)/i.test(text))return 'SANDBOX_UNAVAILABLE';
 if(/(?:mcp|server).*(?:start|initializ|connect).*(?:fail|error|timed out)|(?:mcp|server).*(?:fail|error|timed out).*(?:start|initializ|connect)|(?:fail|error|timed out).*(?:start|initializ|connect).*(?:mcp|server)/i.test(text))return 'MCP_STARTUP_FAILED';
 if(/(?:mcp|tool catalog).*(?:no tools|empty|zero tools)|no (?:mcp|app) tools/i.test(text))return 'MCP_NO_TOOLS';
 if(/tool (?:search|discovery).*(?:disabled|not enabled|unavailable)|(?:disabled|unavailable).*(?:tool search|tool discovery)/i.test(text))return 'TOOL_DISCOVERY_DISABLED';
 if(/(?:unknown|invalid|unrecognized) (?:tool|recipient|function)|no such tool|(?:tool|function).*(?:not available|unavailable|not found|disabled|not registered|does not exist)|cannot (?:find|resolve).*(?:tool|function)/i.test(text))return 'TOOL_UNAVAILABLE';
 if(/(?:tool|function).*(?:invalid arguments|schema|deserialize|parameter.*valid|argument.*valid)|invalid (?:argument|parameter).*tool|(?:parse|parsing).*(?:function call|tool call)/i.test(text))return 'TOOL_PARAMETER_VALIDATION_FAILED';
 if(/connection|network|disconnected/i.test(text))return 'CONNECTION_FAILED';
 return 'CHILD_ERROR';
}
const STARTUP_PHASES=new Set(['starting','initializing','ready','startup-failed','initialize-failed','connect-failed','connection-reset','connection-refused','connection-closed','http-failed','timeout']);
function startupProjection(message,source={}){
 const text=typeof message==='string'?message:'',structured=['mcp_startup','mcp.startup','mcp_startup_update'].includes(source.type);
 if(!structured&&!/\bmcp\b/i.test(text))return null;
 let server='unknown';if(structured&&source.server!==undefined)server=source.server==='codex_apps'?'codex_apps':'other';else if(/\bmcp:\s*codex_apps\b|\bmcp\s+(?:server|client)(?:\s+for)?\s*[`'\"]?codex_apps\b/i.test(text))server='codex_apps';else if(/\bmcp:\s*[a-z_][a-z0-9_-]*|\bmcp\s+(?:server|client)(?:\s+for)?\s*[`'\"]?[a-z_][a-z0-9_-]*/i.test(text))server='other';
 const match=/\b(?:HTTP(?:\/[0-9.]+)?(?:\s+status)?|status(?:\s+code)?)[\s:=]*(\d{3})\b/i.exec(text),http=match?Number(match[1]):null,http_status=http>=100&&http<=599?http:null;
 const timeout=structured&&source.phase==='timeout'||/timed?\s*out|timeout|ETIMEDOUT/i.test(text);let phase=structured&&STARTUP_PHASES.has(source.phase)?source.phase:null;
 if(timeout)phase='timeout';else if(/ECONNRESET|connection reset/i.test(text))phase='connection-reset';else if(/ECONNREFUSED|connection refused/i.test(text))phase='connection-refused';else if(/EPIPE|transport.*closed|connection.*closed|closed.*connection|broken pipe|socket.*closed/i.test(text))phase='connection-closed';else if(http_status)phase='http-failed';else if(/failed to connect|connect(?:ion)?[^\n]{0,50}(?:failed|failure)/i.test(text))phase='connect-failed';else if(/initializ[^\n]*(?:fail|error)|(?:fail|error)[^\n]*initializ/i.test(text))phase='initialize-failed';else if(/start[^\n]*(?:fail|error)|(?:fail|error)[^\n]*start/i.test(text))phase='startup-failed';else if(/\bready\b|startup complete/i.test(text))phase='ready';else if(/initializ/i.test(text))phase='initializing';else if(/starting|start/i.test(text))phase='starting';
 if(!phase)return null;
 return{server,phase,http_status,timeout,message_sha256:createHash('sha256').update(text).digest('hex')};
}

// Raw events, arguments, messages, tool results and tokens remain inside this
// closure. Only the explicit diagnostic projection is serializable.
export function nativeCredentialObserver(projectId){
 let token=null,parseErrors=0,final=null,finalSeen=false,scopeViolation=false,bindingMismatch=false,outputOverflow=false,unknownActivity=false,anonymousCompleted=0;
 const events=[],calls=[],startup=[],toolIds=new Set(),completedCalls=new Set();
 const recordStartup=(message,source)=>{const entry=startupProjection(message,source);if(entry&&!startup.some(s=>JSON.stringify(s)===JSON.stringify(entry)))startup.push(entry);return entry;};
 function accept(line){
  if(!line?.trim())return;
  let value;try{value=JSON.parse(line)}catch{parseErrors++;return;}
  const item=value.item,entry={event:eventName(value.type)},message=value.error?.message||value.error||value.message||item?.message;
  const start=recordStartup(message,{type:value.type,server:value.server,phase:value.phase});
  if(entry.event==='other'&&!start)unknownActivity=true;
  if(item){entry.item_type=known(item.type,['mcp_tool_call','agent_message','reasoning','command_execution','file_change','web_search','todo_list','error']);entry.status=known(item.status,['in_progress','completed','failed']);}
  if(item?.type==='mcp_tool_call'){
   if(typeof item.id==='string'&&item.id)toolIds.add(item.id);if(item.status==='completed')completedCalls.add(typeof item.id==='string'&&item.id?item.id:'anonymous-'+(++anonymousCompleted));
   const allowed=item.server==='codex_apps'&&item.tool===SITE_READ_TOOL;
   const binding=allowed?argumentBinding(item,projectId):'not-applicable';
   const call={event:entry.event,server:item.server==='codex_apps'?'codex_apps':'other',tool:toolName(item.tool),status:entry.status,allowed,binding};
   calls.push(call);Object.assign(entry,{server:call.server,tool:call.tool,allowed,binding});
   if(!allowed)scopeViolation=true;
   if(['invalid','mismatch'].includes(binding))bindingMismatch=true;
   const candidate=allowed&&binding!=='invalid'&&binding!=='mismatch'?nativeSiteToken(item,projectId):null;
   if(candidate)token=candidate;
  }else if(item?.type==='command_execution'||item?.type==='file_change'||item?.type==='web_search')scopeViolation=true;
  if(item&&entry.item_type==='other')unknownActivity=true;
  if(item?.type==='agent_message'){finalSeen=true;final=finalSchema(item.text);entry.final_schema_valid=final!==null;}
  if(value.type==='error'||value.type==='turn.failed'||item?.type==='error'){entry.error_code=credentialErrorCode(message);entry.message_present=typeof message==='string'&&message.length>0;entry.startup_observed=!!start;}
  events.push(entry);
 }
 function diagnostic(receipt={}){
  let code='CREDENTIAL_READ_SUCCEEDED';
  const explicitError=events.find(value=>value.error_code&&!['CHILD_ERROR','CONNECTION_FAILED','SKILL_METADATA_WARNING'].includes(value.error_code)),toolCount=Math.max(toolIds.size,completedCalls.size);
  if(scopeViolation)code='CREDENTIAL_SCOPE_VIOLATION';
  else if(bindingMismatch)code='CREDENTIAL_BINDING_MISMATCH';
  else if(outputOverflow)code='CREDENTIAL_OUTPUT_OVERFLOW';
  else if(unknownActivity)code='CREDENTIAL_UNRECOGNIZED_ACTIVITY';
  else if(events.some(value=>['CLI_ARGUMENT_CONFLICT','FEATURE_UNKNOWN','FEATURE_CONFLICT','CONFIGURATION_INVALID'].includes(value.error_code)))code='CREDENTIAL_'+events.find(value=>['CLI_ARGUMENT_CONFLICT','FEATURE_UNKNOWN','FEATURE_CONFLICT','CONFIGURATION_INVALID'].includes(value.error_code)).error_code;
  else if(receipt.timed_out)code='CREDENTIAL_DEADLINE';
  else if(receipt.exit_code!==0)code=explicitError?'CREDENTIAL_'+explicitError.error_code:'CREDENTIAL_CHILD_NONZERO';
  else if(calls.length===0)code=explicitError?'CREDENTIAL_'+explicitError.error_code:'CREDENTIAL_NO_TOOL_CALL';
  else if(toolCount!==1)code='CREDENTIAL_TOOL_CALL_COUNT_INVALID';
  else if(!token)code='CREDENTIAL_TOKEN_MISSING';
  else if(!final)code='CREDENTIAL_FINAL_SCHEMA_INVALID';
  else if(!final.completed||final.blocked||final.new_fee)code='CREDENTIAL_FINAL_SCHEMA_CONFLICT';
  return {code,credential_received:!!token,scope_violation:scopeViolation,binding_mismatch:bindingMismatch,unknown_activity:unknownActivity,tool_call_count:toolCount,parse_errors:parseErrors,final_seen:finalSeen,final_schema_valid:final!==null,final,startup:startup.map(value=>({...value})),events:events.map(value=>({...value})),calls:calls.map(value=>({...value}))};
 }
 return {accept,diagnostic,observeError(error){const text=String(error?.message||error);if(text==='Child output overflow')outputOverflow=true;const start=recordStartup(text);events.push({event:'child-error',error_code:credentialErrorCode(text),startup_observed:!!start});},takeToken(){const value=token;token=null;return value;},clear(){token=null;}};
}
export function credentialRetryAllowed(diagnostic,attempt){
 if(attempt!==1||diagnostic.credential_received!==false||diagnostic.scope_violation||diagnostic.binding_mismatch||diagnostic.unknown_activity||diagnostic.parse_errors||!Array.isArray(diagnostic.calls))return false;
 // A direct app-server invocation can only issue the fixed, read-only Sites
 // lookup. An explicit startup RPC error after that read was issued is still
 // safe to retry once after its owned child has demonstrably stopped. The old
 // observer may represent arbitrary model activity and keeps its stricter rule.
 if(diagnostic.source==='app-server-direct-native-read'&&diagnostic.owned_child_stopped===true&&diagnostic.phase==='native-tool-read'&&diagnostic.code==='CREDENTIAL_MCP_STARTUP_FAILED'&&diagnostic.calls.length===1){
  const c=diagnostic.calls[0],events=diagnostic.events||[];
  return c.server==='codex_apps'&&c.tool===SITE_READ_TOOL&&c.status==='in_progress'&&c.allowed===true&&c.binding==='matched'&&events.some(e=>e.event==='rpc-error'&&e.error_code==='MCP_STARTUP_FAILED')&&events.every(e=>e.error_code==='MCP_STARTUP_FAILED'&&(e.http_status===undefined||[408,500,502,503,504].includes(e.http_status)));
 }
 if(diagnostic.calls.length)return false;
 const forbidden=['AUTHENTICATION_REQUIRED','PERMISSION_DENIED','CONFIGURATION_INVALID','MODEL_UNAVAILABLE','MODEL_TOOL_INTERFACE_UNSUPPORTED','RATE_LIMITED','CLI_ARGUMENT_CONFLICT','FEATURE_UNKNOWN','FEATURE_CONFLICT','SANDBOX_UNAVAILABLE','TOOL_PARAMETER_VALIDATION_FAILED','TOOL_UNAVAILABLE','TOOL_DISCOVERY_DISABLED','MCP_NO_TOOLS'];
 if(diagnostic.events.some(event=>forbidden.includes(event.error_code)||event.error_code==='CHILD_ERROR'&&event.event!=='child-error'&&!event.startup_observed))return false;
 const failures=(diagnostic.startup||[]).filter(s=>!['starting','initializing','ready'].includes(s.phase));
 if(failures.length&&!failures.every(s=>s.server==='codex_apps'&&(s.http_status!==null?[408,500,502,503,504].includes(s.http_status):s.timeout||['connect-failed','connection-reset','connection-refused','connection-closed'].includes(s.phase))))return false;
 if(!failures.length&&diagnostic.events.some(event=>event.error_code==='CHILD_ERROR'))return false;
 return ['CREDENTIAL_NO_TOOL_CALL','CREDENTIAL_DEADLINE','CREDENTIAL_CHILD_NONZERO'].includes(diagnostic.code)||diagnostic.code==='CREDENTIAL_MCP_STARTUP_FAILED'&&failures.length>0;
}
export function credentialRetryPlan(diagnostic,attempt,{now_ms=Date.now(),deadline_ms=Infinity}={}){const delay_ms=1500;if(!credentialRetryAllowed(diagnostic,attempt)||!Number.isFinite(now_ms)||!(Number.isFinite(deadline_ms)||deadline_ms===Infinity)||now_ms+delay_ms+1000>=deadline_ms)return null;return{next_attempt:2,delay_ms,reason:diagnostic.code};}
