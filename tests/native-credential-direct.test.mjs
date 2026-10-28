import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readNativeSiteCredential} from '../scripts/native-credential-direct.mjs';
import {CREDENTIAL_CONFIG, SITES_CONNECTOR_ID, credentialRetryAllowed} from '../scripts/native-credential-policy.mjs';

const project = 'synthetic-private-project';
const secret = 'SYNTHETIC_DIRECT_CREDENTIAL_MUST_STAY_IN_RAM_123456789';
const privateMessage = 'https://private.invalid/?token=' + secret;
const source = 'app-server-direct-native-read';
const successfulRead = () => ({content: [], structuredContent: {id: project, siwc_bypass_bearer_token: secret}});

function metadataFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? metadataFiles(filename) : [filename];
  });
}

// The fake exchanges the same JSONL protocol as a child process. No test starts
// a CLI, calls an app, reads account state, or provides any real credential.
function fakeNativeChild({readResult = successfulRead(), threadResult, onRequest, stallAt} = {}) {
  const child = new EventEmitter();
  child.pid = 51001;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  const messages = [], spawns = [], terminated = [];
  let input = '', closed = false;
  const emit = value => child.stdout.emit('data', Buffer.from(typeof value === 'string' ? value : JSON.stringify(value) + '\n'));
  const reply = (request, result) => emit({id: request.id, result});
  const close = (code = 0, signal = null) => {
    if (closed) return;
    closed = true;
    child.exitCode = code;
    child.emit('close', code, signal);
  };
  function receive(message) {
    messages.push(message);
    queueMicrotask(() => {
      if (closed) return;
      if (onRequest?.(message, {emit, reply, child, close}) === true) return;
      if (message.method === stallAt) return;
      if (message.method === 'initialize') reply(message, {userAgent: 'synthetic-test-client'});
      else if (message.method === 'thread/start') reply(message, threadResult ?? {thread: {id: 'synthetic-ephemeral-thread', ephemeral: true}});
      else if (message.method === 'mcpServer/tool/call') reply(message, readResult);
      else if (message.method === 'thread/unsubscribe') reply(message, {status: 'unsubscribed'});
    });
  }
  child.stdin = Object.assign(new EventEmitter(), {
    write(chunk) {
      input += chunk.toString();
      let newline;
      while ((newline = input.indexOf('\n')) >= 0) {
        const line = input.slice(0, newline);
        input = input.slice(newline + 1);
        if (line.trim()) receive(JSON.parse(line));
      }
      return true;
    },
    end(chunk) {
      if (chunk !== undefined) this.write(chunk);
      queueMicrotask(() => close());
    },
  });
  child.kill = () => { close(null, 'SIGTERM'); return true; };
  return {
    child, messages, spawns, terminated,
    spawnChild(command, args, options) {
      spawns.push({command, args, options});
      return child;
    },
    async terminate(ownedChild) {
      terminated.push(ownedChild);
      queueMicrotask(() => close(null, 'SIGTERM'));
    },
  };
}

async function readWithFake(t, settings = {}, overrides = {}) {
  const metadataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siounex-direct-credential-test-'));
  const ownedPrefix = path.resolve(os.tmpdir()) + path.sep + 'siounex-direct-credential-test-';
  t.after(() => {
    assert.ok(path.resolve(metadataDir).startsWith(ownedPrefix));
    fs.rmSync(metadataDir, {recursive: true, force: true});
  });
  const fake = fakeNativeChild(settings);
  const result = await readNativeSiteCredential(project, {
    cwd: process.cwd(), cli: 'synthetic-codex-cli.js',
    deadline: Date.now() + 1500, metadataDir,
    spawnChild: fake.spawnChild, terminate: fake.terminate, now: Date.now,
    ...overrides,
  });
  return {result, fake, metadataDir};
}

function assertNoSecret(result, metadataDir) {
  for (const safeValue of [result.diagnostic, result.process]) {
    const text = JSON.stringify(safeValue);
    assert.equal(text.includes(secret), false);
    assert.equal(text.includes('private.invalid'), false);
  }
  for (const filename of metadataFiles(metadataDir)) {
    const bytes = fs.readFileSync(filename);
    assert.equal(bytes.includes(Buffer.from(secret)), false, filename);
    assert.equal(bytes.includes(Buffer.from('private.invalid')), false, filename);
  }
}

function assertFixedToolScope(fake) {
  const calls = fake.messages.filter(message => message.method === 'mcpServer/tool/call');
  assert.ok(calls.length <= 1, 'a direct native read must never retry a started tool');
  for (const call of calls) assert.deepEqual(call.params, {
    threadId: 'synthetic-ephemeral-thread', server: 'codex_apps', tool: 'sites.get_site', arguments: {project_id: project},
  });
  assert.equal(fake.messages.some(message => /^(?:turn\/|thread\/inject_items|model\/)/.test(message.method ?? '')), false);
}

test('one direct native read keeps its token in RAM and never starts a model turn', async t => {
  const {result, fake, metadataDir} = await readWithFake(t, {
    onRequest(message, {child}) {
      if (message.method === 'initialize') child.stderr.emit('data', Buffer.from('informational prefix ' + privateMessage + '\n'));
    },
  });
  assert.equal(result.token, secret);
  assert.equal(result.diagnostic.code, 'CREDENTIAL_READ_SUCCEEDED');
  assert.equal(result.diagnostic.credential_received, true);
  assert.equal(result.diagnostic.tool_call_count, 1);
  assert.equal(result.source ?? result.diagnostic.source, source);
  assert.equal(result.diagnostic.final_source, 'verified-native-response');
  assert.deepEqual(result.diagnostic.final, {completed: true, blocked: false, new_fee: false});
  assert.deepEqual(fake.messages.filter(message => message.method && message.method !== 'thread/unsubscribe').map(message => message.method), [
    'initialize', 'initialized', 'thread/start', 'mcpServer/tool/call',
  ]);
  const thread = fake.messages.find(message => message.method === 'thread/start').params;
  assert.equal(thread.ephemeral, true);
  assert.equal(thread.approvalPolicy, 'never');
  assert.equal(thread.sandbox, 'read-only');
  assert.equal(thread.model, 'gpt-5.6-sol');
  assertFixedToolScope(fake);
  assertNoSecret(result, metadataDir);
});

test('a pinned native executable launches directly while preserving the fixed credential read scope',async t=>{const {result,fake}=await readWithFake(t,{}, {cli:'C:/SYNTHETIC-official/codex.exe'});assert.equal(fake.spawns[0].command,'C:/SYNTHETIC-official/codex.exe');assert.equal(fake.spawns[0].args[0],'app-server');assert.equal(fake.spawns[0].args.includes('exec'),false);assert.equal(result.diagnostic.credential_received,true);assert.equal(fake.messages.some(v=>v.method?.startsWith('turn/')),false);});
test('failed fixed read may be retried once only after its owned child stops',async t=>{
 const {result,fake,metadataDir}=await readWithFake(t,{onRequest(message,{emit}){if(message.method!=='mcpServer/tool/call')return;emit({id:message.id,error:{code:-32603,message:'MCP server failed to start: HTTP 503 connection closed '+privateMessage}});return true;}});
 const d=result.diagnostic;assert.equal(d.code,'CREDENTIAL_MCP_STARTUP_FAILED');assert.deepEqual(d.events[0],{event:'rpc-error',error_code:'MCP_STARTUP_FAILED',rpc_code:-32603,http_status:503,category:'connection'});assert.equal(d.owned_child_stopped,true);assert.equal(credentialRetryAllowed(d,1),true);assert.equal(credentialRetryAllowed(d,2),false);assert.equal(credentialRetryAllowed({...d,owned_child_stopped:false},1),false);assert.equal(credentialRetryAllowed({...d,scope_violation:true},1),false);assert.equal(credentialRetryAllowed({...d,events:[...d.events,{event:'rpc-error',error_code:'AUTHENTICATION_REQUIRED'}]},1),false);assert.equal(credentialRetryAllowed({...d,events:[{...d.events[0],http_status:400}]},1),false);assert.equal(credentialRetryAllowed({...d,calls:[{...d.calls[0],tool:'other'}]},1),false);assertFixedToolScope(fake);assertNoSecret(result,metadataDir);
});
test('the direct child preserves the existing per-tool read-only policy without broadening app access', async t => {
  const {fake} = await readWithFake(t);
  assert.equal(fake.spawns.length, 1);
  const {command, args, options} = fake.spawns[0];
  assert.equal(command, process.execPath);
  assert.equal(args[0], 'synthetic-codex-cli.js');
  assert.ok(args.includes('app-server'));
  assert.equal(args.includes('exec'), false);
  const actualOverrides = args.flatMap((value, index) => value === '--config' || value === '-c' ? [args[index + 1]] : []);
  for (const policy of CREDENTIAL_CONFIG) assert.ok(actualOverrides.includes(policy), policy);
  const tools = actualOverrides.find(value => value.startsWith(`apps.${SITES_CONNECTOR_ID}.tools=`));
  assert.deepEqual([...tools.matchAll(/"([^"]+)"=\{enabled=true\}/g)].map(match => match[1]), ['sites.get_site']);
  assert.equal(options.windowsHide, true);
  assert.equal(options.shell === true, false);
  assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
  assertFixedToolScope(fake);
});

test('a thread without an explicit ephemeral acknowledgement is rejected before the tool call', async t => {
  for (const ephemeral of [false, undefined]) await t.test(String(ephemeral), async childTest => {
    const {result, fake, metadataDir} = await readWithFake(childTest, {threadResult: {thread: {id: 'synthetic-ephemeral-thread', ...(ephemeral === undefined ? {} : {ephemeral})}}});
    assert.equal(result.token, null);
    assert.notEqual(result.diagnostic.code, 'CREDENTIAL_READ_SUCCEEDED');
    assert.equal(fake.messages.some(message => message.method === 'mcpServer/tool/call'), false);
    assert.equal(result.diagnostic.credential_received, false);
    assertNoSecret(result, metadataDir);
  });
});

test('wrong-project, error and token-free native responses cannot release a credential or cause a second tool call', async t => {
  for (const [name, readResult] of [
    ['wrong project', {content: [], structuredContent: {id: 'another-project', siwc_bypass_bearer_token: secret}}],
    ['error result', {...successfulRead(), isError: true}],
    ['missing token', {content: [], structuredContent: {id: project}}],
    ['missing response schema', null],
  ]) await t.test(name, async childTest => {
    const {result, fake, metadataDir} = await readWithFake(childTest, {readResult});
    assert.equal(result.token, null);
    assert.equal(result.diagnostic.credential_received, false);
    assert.notEqual(result.diagnostic.code, 'CREDENTIAL_READ_SUCCEEDED');
    assert.equal(fake.messages.filter(message => message.method === 'mcpServer/tool/call').length, 1);
    assertFixedToolScope(fake);
    assertNoSecret(result, metadataDir);
  });
});

test('server approval and elicitation requests never receive acceptance or trigger a tool retry', async t => {
  for (const method of ['item/commandExecution/requestApproval', 'tool/requestUserInput', 'mcpServer/elicitation/request']) await t.test(method, async childTest => {
    const serverRequestId = 771;
    const {result, fake, metadataDir} = await readWithFake(childTest, {
      onRequest(message, {emit, reply}) {
        if (message.method !== 'mcpServer/tool/call') return;
        emit({id: serverRequestId, method, params: {threadId: 'synthetic-ephemeral-thread', mode: 'form', message: privateMessage}});
        // Even a subsequent valid response cannot turn a rejected approval flow
        // into a successful unattended credential read.
        reply(message, successfulRead());
        return true;
      },
    });
    assert.equal(result.token, null);
    assert.notEqual(result.diagnostic.code, 'CREDENTIAL_READ_SUCCEEDED');
    for (const answer of fake.messages.filter(message => message.id === serverRequestId)) {
      assert.notEqual(answer.result?.action, 'accept');
      assert.notEqual(answer.result?.decision, 'accept');
      assert.equal(JSON.stringify(answer).includes(secret), false);
      assert.ok(answer.error || ['decline', 'cancel'].includes(answer.result?.action));
    }
    assertFixedToolScope(fake);
    assertNoSecret(result, metadataDir);
  });
});

test('RPC authentication and permission failures retain stable codes without retaining sensitive text', async t => {
  for (const [status, code] of [[401, 'CREDENTIAL_AUTHENTICATION_REQUIRED'], [403, 'CREDENTIAL_PERMISSION_DENIED']]) await t.test(String(status), async childTest => {
    const {result, fake, metadataDir} = await readWithFake(childTest, {
      onRequest(message, {emit}) {
        if (message.method !== 'mcpServer/tool/call') return;
        emit({id: message.id, error: {code: -32000, message: 'HTTP ' + status + ' ' + (status === 401 ? 'authentication required ' : 'forbidden ') + privateMessage}});
        return true;
      },
    });
    assert.equal(result.token, null);
    assert.equal(result.diagnostic.code, code);
    assertFixedToolScope(fake);
    assertNoSecret(result, metadataDir);
  });
});

test('a hard deadline terminates only the owned child and does not retry the native tool', {timeout: 3000}, async t => {
  const {result, fake, metadataDir} = await readWithFake(t, {stallAt: 'mcpServer/tool/call'}, {deadline: Date.now() + 40});
  assert.equal(result.token, null);
  assert.equal(result.diagnostic.code, 'CREDENTIAL_DEADLINE');
  assert.ok(fake.terminated.length > 0);
  assert.ok(fake.terminated.every(child => child === fake.child));
  assert.equal(fake.spawns.length, 1);
  assertFixedToolScope(fake);
  assertNoSecret(result, metadataDir);
});

test('an asynchronous stdin EPIPE is a safe credential failure before a native tool is issued', async t => {
  const {result, fake, metadataDir} = await readWithFake(t, {
    onRequest(message, {child}) {
      if (message.method !== 'initialize') return;
      child.stdin.emit('error', Object.assign(new Error('write EPIPE ' + privateMessage), {code: 'EPIPE'}));
      return true;
    },
  });
  assert.equal(result.token, null);
  assert.equal(result.diagnostic.credential_received, false);
  assert.notEqual(result.diagnostic.code, 'CREDENTIAL_READ_SUCCEEDED');
  assert.match(result.diagnostic.code, /^CREDENTIAL_[A-Z_]+$/);
  assert.deepEqual(fake.messages.filter(message => message.method).map(message => message.method), ['initialize']);
  assert.equal(fake.spawns.length, 1);
  assert.ok(fake.terminated.every(child => child === fake.child));
  assertFixedToolScope(fake);
  assertNoSecret(result, metadataDir);
});

test('malformed JSON or incomplete initialization cannot proceed to a thread or business call', {timeout: 3000}, async t => {
  for (const [name, bytes] of [['invalid JSON', '{not-json}\n'], ['unterminated JSON', '{"id":1,"result":']]) await t.test(name, async childTest => {
    const {result, fake, metadataDir} = await readWithFake(childTest, {
      onRequest(message, {emit}) {
        if (message.method !== 'initialize') return;
        emit(bytes);
        return true;
      },
    }, {deadline: Date.now() + 40});
    assert.equal(result.token, null);
    assert.notEqual(result.diagnostic.code, 'CREDENTIAL_READ_SUCCEEDED');
    assert.equal(fake.messages.some(message => message.method === 'thread/start' || message.method === 'mcpServer/tool/call'), false);
    assertFixedToolScope(fake);
    assertNoSecret(result, metadataDir);
  });
});

test('an incomplete thread acknowledgement cannot produce a tool call', async t => {
  const {result, fake, metadataDir} = await readWithFake(t, {threadResult: {thread: {ephemeral: true}}});
  assert.equal(result.token, null);
  assert.notEqual(result.diagnostic.code, 'CREDENTIAL_READ_SUCCEEDED');
  assert.equal(fake.messages.some(message => message.method === 'mcpServer/tool/call'), false);
  assertNoSecret(result, metadataDir);
});

test('JSON values that are not RPC envelopes fail closed without an uncaught stream callback error', {timeout: 3000}, async t => {
  for (const [name, response] of [['null', 'null\n'], ['array', '[]\n'], ['missing result and error', '{"id":1}\n']]) await t.test(name, async childTest => {
    const {result, fake, metadataDir} = await readWithFake(childTest, {
      onRequest(message, {emit}) {
        if (message.method !== 'initialize') return;
        emit(response);
        return true;
      },
    }, {deadline: Date.now() + 40});
    assert.equal(result.token, null);
    assert.notEqual(result.diagnostic.code, 'CREDENTIAL_READ_SUCCEEDED');
    assert.equal(fake.messages.some(message => message.method === 'thread/start' || message.method === 'mcpServer/tool/call'), false);
    assertFixedToolScope(fake);
    assertNoSecret(result, metadataDir);
  });
});
