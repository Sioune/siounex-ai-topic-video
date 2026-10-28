import test from 'node:test';
import assert from 'node:assert/strict';
import {CREDENTIAL_CONFIG,SITES_NATIVE_TOOLS,SITES_TOOL_POLICY,SITES_CONNECTOR_ID,INSTALLED_OTHER_CONNECTORS,sitesToolPolicyOverride,credentialConfigArgs,credentialChildArgs,credentialErrorCode,nativeCredentialObserver,credentialRetryAllowed,credentialRetryPlan} from '../scripts/native-credential-policy.mjs';
import {createHash} from 'node:crypto';import fs from 'node:fs';
import {nativeSiteToken} from '../scripts/native-site-token.mjs';

const project='test-project',secret='SYNTHETIC_TOKEN_DO_NOT_PERSIST_123456789';
const final=value=>({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(value)}});
const completed={completed:true,blocked:false,new_fee:false};
const tool=(overrides={})=>({type:'item.completed',item:{type:'mcp_tool_call',server:'codex_apps',tool:'sites.get_site',status:'completed',arguments:{project_id:project},result:{structuredContent:{id:project,siwc_bypass_bearer_token:secret}},...overrides}});
function observe(...events){const value=nativeCredentialObserver(project);for(const event of events)value.accept(JSON.stringify(event));return value;}

test('child-only policy overrides every installed Sites tool and exposes exactly the existing read',()=>{
 const enabled=Object.entries(SITES_TOOL_POLICY).filter(([,value])=>value).map(([key])=>key);
 assert.deepEqual(enabled,['sites.get_site']);
 assert.ok(SITES_NATIVE_TOOLS.includes('sites.add_custom_domain'));
 for(const name of SITES_NATIVE_TOOLS)assert.equal(SITES_TOOL_POLICY[name],name==='sites.get_site');
 assert.ok(CREDENTIAL_CONFIG.includes(`apps.${SITES_CONNECTOR_ID}.default_tools_enabled=false`));
 for(const feature of ['shell_tool','js_repl','browser_use','computer_use','multi_agent','multi_agent_v2'])assert.ok(CREDENTIAL_CONFIG.includes(`features.${feature}=false`));
 assert.equal(credentialConfigArgs().length,CREDENTIAL_CONFIG.length*2);
 assert.equal(CREDENTIAL_CONFIG.some(value=>value.startsWith('mcp_servers.')),false);
});
test('CLI dotted-path parser receives a tools table, with dotted raw names only on the TOML right side',()=>{
 const override=sitesToolPolicyOverride(),separator=override.indexOf('='),key=override.slice(0,separator),value=override.slice(separator+1);
 assert.deepEqual(key.split('.'),['apps',SITES_CONNECTOR_ID,'tools']);
 const actual=Object.fromEntries([...value.matchAll(/"(sites\.[a-z_]+)"=\{enabled=(true|false)\}/g)].map(match=>[match[1],match[2]==='true']));
 assert.deepEqual(actual,SITES_TOOL_POLICY);assert.equal(Object.keys(actual).length,25);assert.equal(actual['sites.get_site'],true);assert.equal(actual['sites.add_custom_domain'],false);
 assert.equal(CREDENTIAL_CONFIG.some(value=>value.startsWith(`apps.${SITES_CONNECTOR_ID}.tools.`)),false);
});
test('every other installed connector is explicitly disabled despite inherited app enables',()=>{
 assert.equal(new Set(INSTALLED_OTHER_CONNECTORS).size,17);assert.equal(INSTALLED_OTHER_CONNECTORS.includes(SITES_CONNECTOR_ID),false);
 for(const id of INSTALLED_OTHER_CONNECTORS)assert.ok(CREDENTIAL_CONFIG.includes(`apps.${id}.enabled=false`));
 const enabled=CREDENTIAL_CONFIG.filter(value=>/^apps\.[^.]+\.enabled=true$/.test(value));assert.deepEqual(enabled,[`apps.${SITES_CONNECTOR_ID}.enabled=true`]);
});
test('credential argv uses the compatible non-escalating read-only policy and preserves the original model',()=>{
 const argv=credentialChildArgs('codex.js','schema.json');assert.equal(argv[argv.indexOf('--sandbox')+1],'read-only');assert.equal(argv.includes('--approve-for-me'),false);assert.equal(argv.includes('approval_policy="never"'),true);assert.equal(argv[argv.indexOf('--model')+1],'gpt-5.6-sol');assert.equal(argv.includes('model_reasoning_effort="medium"'),true);assert.deepEqual(argv.slice(-3),['--output-schema','schema.json','-']);
});
test('only an exact successful native response is usable, and diagnostics never serialize its secret',()=>{
 const observer=observe(tool(),final(completed)),diagnostic=observer.diagnostic({exit_code:0});
 assert.equal(diagnostic.code,'CREDENTIAL_READ_SUCCEEDED');assert.equal(diagnostic.final_schema_valid,true);
 assert.equal(JSON.stringify(diagnostic).includes(secret),false);assert.equal(JSON.stringify(diagnostic).includes('siwc_bypass_bearer_token'),false);
 assert.equal(observer.takeToken(),secret);assert.equal(observer.takeToken(),null);
});
test('an exit-zero self-report without a native call is a retryable credential failure, never work success',()=>{
 const diagnostic=observe(final(completed)).diagnostic({exit_code:0});
 assert.equal(diagnostic.code,'CREDENTIAL_NO_TOOL_CALL');assert.equal(diagnostic.credential_received,false);
 assert.equal(credentialRetryAllowed(diagnostic,1),true);assert.equal(credentialRetryAllowed(diagnostic,2),false);
});
test('the known benign skill metadata warning neither hides a transient cause nor removes the no-tool retry',()=>{const warning={type:'item.completed',item:{type:'error',message:'Skill descriptions were shortened '+secret}},o=observe(warning,final(completed)),d=o.diagnostic({exit_code:0});assert.equal(d.code,'CREDENTIAL_NO_TOOL_CALL');assert.equal(credentialRetryAllowed(d,1),true);o.observeError('Unstructured stderr informational prefix '+secret);o.observeError('MCP client for `codex_apps` failed to start: transport connection closed '+secret);assert.equal(credentialRetryAllowed(o.diagnostic({exit_code:1}),1),true);assert.equal(JSON.stringify(o.diagnostic({exit_code:1})).includes(secret),false);});
test('a different Site tool or a shell command fails closed and cannot trigger the credential retry',()=>{
 for(const unexpected of [tool({tool:'sites.add_custom_domain'}),{type:'item.completed',item:{type:'command_execution',status:'completed',aggregated_output:secret}}]){
  const diagnostic=observe(unexpected,tool(),final(completed)).diagnostic({exit_code:0});
  assert.equal(diagnostic.code,'CREDENTIAL_SCOPE_VIOLATION');assert.equal(credentialRetryAllowed(diagnostic,1),false);assert.equal(JSON.stringify(diagnostic).includes(secret),false);
 }
});
test('wrong project, malformed arguments and broadened argument sets cannot release a token',()=>{
 for(const args of [{project_id:'another-project'},'{invalid}',{project_id:project,unknown:secret}]){
  const item=tool({arguments:args}).item;assert.equal(nativeSiteToken(item,project),null);
  const diagnostic=observe({type:'item.completed',item},final(completed)).diagnostic({exit_code:0});
  assert.equal(diagnostic.code,'CREDENTIAL_BINDING_MISMATCH');assert.equal(credentialRetryAllowed(diagnostic,1),false);assert.equal(JSON.stringify(diagnostic).includes(secret),false);
 }
});
test('error responses, tool-name aliases, other servers and incomplete tool calls are rejected',()=>{
 for(const override of [{tool:'sites_get_site'},{tool:'other.get_site'},{server:'other'},{status:'in_progress'},{result:{isError:true,structuredContent:{id:project,siwc_bypass_bearer_token:secret}}}])assert.equal(nativeSiteToken(tool(override).item,project),null);
});
test('final booleans are recorded only after strict schema checking and are not proof of the read',()=>{
 for(const value of [{completed:'true',blocked:false,new_fee:false},{...completed,token:secret}]){
  const diagnostic=observe(tool(),final(value)).diagnostic({exit_code:0});assert.equal(diagnostic.code,'CREDENTIAL_FINAL_SCHEMA_INVALID');assert.equal(JSON.stringify(diagnostic).includes(secret),false);assert.equal(credentialRetryAllowed(diagnostic,1),false);
 }
 const contradictory=observe(tool(),final({...completed,new_fee:true})).diagnostic({exit_code:0});assert.equal(contradictory.code,'CREDENTIAL_FINAL_SCHEMA_CONFLICT');
});
test('nonzero exit, timeout, missing result and overflow cannot be reported as success',()=>{
 const good=observe(tool(),final(completed));assert.equal(good.diagnostic({exit_code:1}).code,'CREDENTIAL_CHILD_NONZERO');assert.equal(good.diagnostic({exit_code:0,timed_out:true}).code,'CREDENTIAL_DEADLINE');
 const missing=observe(tool({result:{content:[]}}),final(completed)).diagnostic({exit_code:0});assert.equal(missing.code,'CREDENTIAL_TOKEN_MISSING');assert.equal(credentialRetryAllowed(missing,1),false,'a started tool/result is outside pre-tool startup recovery');
 good.observeError(Error('Child output overflow'));assert.equal(good.diagnostic({exit_code:0}).code,'CREDENTIAL_OUTPUT_OVERFLOW');
});
test('known Sites MCP startup connection failures retry once with only hashed structured diagnostics',()=>{
 const messages=['MCP client for `codex_apps` failed to start: connection closed during initialize '+secret,'MCP server codex_apps failed to initialize: HTTP 503 '+secret,'mcp: codex_apps connection reset ECONNRESET '+secret,'MCP server codex_apps failed to connect: timed out '+secret];
 for(const message of messages){const o=observe(final({completed:false,blocked:true,new_fee:false}));o.observeError(message);const d=o.diagnostic({exit_code:1}),s=d.startup[0];assert.equal(d.credential_received,false);assert.equal(d.calls.length,0);assert.equal(s.server,'codex_apps');assert.deepEqual(Object.keys(s).sort(),['server','phase','http_status','timeout','message_sha256'].sort());assert.equal(s.message_sha256,createHash('sha256').update(message).digest('hex'));assert.equal(credentialRetryAllowed(d,1),true);assert.equal(credentialRetryAllowed(d,2),false);assert.equal(JSON.stringify(d).includes(secret),false);assert.equal(JSON.stringify(d).includes(message),false);}
});
test('structured MCP phase records sanitize arbitrary server fields without preserving messages or URLs',()=>{const d=observe({type:'mcp.startup',server:'codex_apps',phase:'connection-reset',message:'private https://secret.invalid/?token='+secret}).diagnostic({exit_code:1});assert.equal(d.startup[0].phase,'connection-reset');assert.equal(credentialRetryAllowed(d,1),true);const other=observe({type:'mcp.startup',server:'private-server-'+secret,phase:'timeout',message:secret}).diagnostic({exit_code:1});assert.equal(other.startup[0].server,'other');assert.equal(credentialRetryAllowed(other,1),false);for(const value of [d,other]){assert.equal(JSON.stringify(value).includes(secret),false);assert.equal(JSON.stringify(value).includes('secret.invalid'),false);}});
for(const cause of ['HTTP 401 authentication required','HTTP 403 forbidden','HTTP 429 Too Many Requests','HTTP 400 bad request','invalid config TOML','Invalid arguments for tool sites.get_site','Unknown feature flag','MCP server codex_apps failed to initialize'])test('startup recovery does not bypass permanent or unproven cause '+cause,()=>{const o=observe(final({completed:false,blocked:true,new_fee:false}));o.observeError('MCP client for `codex_apps` failed to start: '+cause+' '+secret);const d=o.diagnostic({exit_code:1});assert.equal(credentialRetryAllowed(d,1),false);assert.equal(JSON.stringify(d).includes(secret),false);});
test('unrelated/unknown startup source, malformed output or unknown business activity never enables the read retry',()=>{
 for(const message of ['MCP server unrelated failed to connect: timed out','MCP startup failed: connection reset','SYNTHETIC unknown workflow outcome']){const o=observe(final(completed));o.observeError(message+' '+secret);assert.equal(credentialRetryAllowed(o.diagnostic({exit_code:1}),1),false);}
 const malformed=observe(final(completed));malformed.accept('SYNTHETIC truncated unknown output');assert.equal(credentialRetryAllowed(malformed.diagnostic({exit_code:1}),1),false);const unknown=observe({type:'item.completed',item:{type:'dynamic_tool_call',result:{token:secret}}},final(completed));assert.equal(credentialRetryAllowed(unknown.diagnostic({exit_code:1}),1),false);
});
test('even transient startup evidence cannot retry once get_site started or a real RAM credential was received',()=>{for(const event of [tool({status:'in_progress',result:{}}),tool()]){const o=observe(event,final(completed));o.observeError('MCP server codex_apps failed to connect: connection reset '+secret);assert.equal(credentialRetryAllowed(o.diagnostic({exit_code:1}),1),false);}});
test('success still requires one real matched Sites call, RAM token and exact final schema',()=>{const o=observe(tool({id:'one'}),tool({id:'two'}),final(completed)),d=o.diagnostic({exit_code:0});assert.equal(d.code,'CREDENTIAL_TOOL_CALL_COUNT_INVALID');assert.equal(d.tool_call_count,2);assert.equal(credentialRetryAllowed(d,1),false);const good=observe({type:'item.started',item:{...tool().item,id:'same',status:'in_progress',result:{}}},tool({id:'same'}),final(completed));assert.equal(good.diagnostic({exit_code:0}).code,'CREDENTIAL_READ_SUCCEEDED');assert.equal(good.takeToken(),secret);});
test('retry backoff stays inside the two-attempt finite read phase; production has one natural child and no retry loop',()=>{const d=observe(final(completed)).diagnostic({exit_code:0});assert.deepEqual(credentialRetryPlan(d,1,{now_ms:10000,deadline_ms:20000}),{next_attempt:2,delay_ms:1500,reason:'CREDENTIAL_NO_TOOL_CALL'});assert.equal(credentialRetryPlan(d,2,{now_ms:10000,deadline_ms:20000}),null);assert.equal(credentialRetryPlan(d,1,{now_ms:10000,deadline_ms:12000}),null);assert.equal(credentialRetryPlan(d,1,{now_ms:10000,deadline_ms:NaN}),null);const source=fs.readFileSync('scripts/native-scheduled-worker.mjs','utf8');assert.match(source,/attempt=1;attempt<=2;attempt\+\+/);assert.match(source,/const credentialDeadline=budget\.credentialDeadline\(\)/);assert.match(source,/credentialRetryPlan\(diagnostic,attempt,\{deadline_ms:credentialDeadline\}\)/);assert.match(source,/await new Promise\(resolve=>setTimeout\(resolve,retry.delay_ms\)\)/);assert.equal((source.match(/ownedNaturalChild\(\['scripts\/site-queue-pass.mjs'\]/g)||[]).length,1);assert.equal(CREDENTIAL_CONFIG.some(value=>value==='features.apps=true'||value==='features.apps=false'),false);});
test('authentication and configuration failures retain only stable codes and do not retry',()=>{
 for(const message of ['authentication required '+secret,'invalid transport '+secret,'model unavailable '+secret]){
  const observer=observe(final(completed));observer.observeError(Error(message));const diagnostic=observer.diagnostic({exit_code:1});assert.equal(credentialRetryAllowed(diagnostic,1),false);assert.equal(JSON.stringify(diagnostic).includes(secret),false);
 }
});
test('native rate-limit events retain their safe category and do not start a second credential read',()=>{
 const message='exceeded retry limit, last status: 429 Too Many Requests '+secret;
 for(const event of [{type:'error',message},{type:'turn.failed',error:{message}},{type:'item.completed',item:{type:'error',message}}]){
  const diagnostic=observe({type:'item.completed',item:{type:'error',message:'Skill descriptions were shortened'}},event).diagnostic({exit_code:1});
  assert.equal(diagnostic.code,'CREDENTIAL_RATE_LIMITED');assert.equal(credentialRetryAllowed(diagnostic,1),false);assert.equal(credentialRetryAllowed(diagnostic,2),false);assert.equal(JSON.stringify(diagnostic).includes(secret),false);
 }
 assert.equal(credentialErrorCode('unclassified child error 1429'),'CHILD_ERROR');
});

test('a rate-limit event forbids a retry even when a timeout or earlier error sets the outer diagnostic',()=>{
 const observer=observe({type:'item.completed',item:{type:'error',message:'MCP server failed to connect'}});
 observer.observeError(Error('connection failed: 429 '+secret));
 const diagnostic=observer.diagnostic({exit_code:null,timed_out:true});
 assert.equal(diagnostic.code,'CREDENTIAL_DEADLINE');assert.equal(credentialRetryAllowed(diagnostic,1),false);assert.equal(JSON.stringify(diagnostic).includes(secret),false);
 for(const code of ['CREDENTIAL_CHILD_NONZERO','CREDENTIAL_DEADLINE','CREDENTIAL_NO_TOOL_CALL','CREDENTIAL_TOKEN_MISSING'])assert.equal(credentialRetryAllowed({...diagnostic,code},1),false);
});

test('ordinary read-only transient failures retain only their existing single retry budget',()=>{
 for(const receipt of [{exit_code:1},{exit_code:null,timed_out:true},{exit_code:0}]){
  const diagnostic=observe(final(completed)).diagnostic(receipt);
  assert.equal(credentialRetryAllowed(diagnostic,1),true);assert.equal(credentialRetryAllowed(diagnostic,2),false);
 }
});

test('native errors retain safe diagnostic categories instead of being mislabeled as a random missing call',()=>{
 const cases=[
  ["error: '--sandbox <SANDBOX_MODE>' cannot be used with '--approve-for-me'",'CLI_ARGUMENT_CONFLICT'],
  ['Unknown feature: future_flag','FEATURE_UNKNOWN'],
  ['Feature native_apps conflicts with another feature','FEATURE_CONFLICT'],
  ['MCP server codex_apps failed to initialize','MCP_STARTUP_FAILED'],
  ['No MCP tools are available','MCP_NO_TOOLS'],
  ['Unknown tool sites.get_site','TOOL_UNAVAILABLE'],
  ['Invalid recipient functions.exec','TOOL_UNAVAILABLE'],
  ['Tool sites.get_site is not registered','TOOL_UNAVAILABLE'],
  ['Tool discovery is disabled for this session','TOOL_DISCOVERY_DISABLED'],
  ['Invalid arguments for tool sites.get_site','TOOL_PARAMETER_VALIDATION_FAILED'],
  ['Model does not support function calls','MODEL_TOOL_INTERFACE_UNSUPPORTED'],
  ['Windows sandbox is unavailable','SANDBOX_UNAVAILABLE'],
  ['HTTP 429','RATE_LIMITED'],
  ['Too Many Requests','RATE_LIMITED'],
  ['Rate limit reached','RATE_LIMITED'],
  ['rate_limit_exceeded','RATE_LIMITED'],
  ['connection failed: rate-limited','RATE_LIMITED'],
 ];
 for(const [message,expected] of cases){
  assert.equal(credentialErrorCode(message+' https://private.invalid/path '+secret),expected);
  const diagnostic=observe({type:'item.completed',item:{type:'error',message:message+' '+secret}},final({completed:false,blocked:true,new_fee:false})).diagnostic({exit_code:0});assert.equal(diagnostic.code,'CREDENTIAL_'+expected);assert.equal(credentialRetryAllowed(diagnostic,1),false);assert.equal(JSON.stringify(diagnostic).includes(secret),false);
 }
});
