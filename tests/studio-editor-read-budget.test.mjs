// Prompt contracts and fake adapters only: no browser, provider or media calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {studioPreviewPrompt,STUDIO_EDITOR_READ_POLICY,STUDIO_EDITOR_DOM_READ_CODE} from '../scripts/heygen-studio-preview-bridge.mjs';
import {STUDIO_DIRECT_BROWSER_SELECT_CODE,STUDIO_DIRECT_BROWSER_INVENTORY_CODE,STUDIO_DIRECT_CREATE_CODE,STUDIO_DIRECT_PROJECTS_READ_CODE,studioDirectInventoryCode,studioDirectNavigationCode} from '../scripts/heygen-studio-direct-bootstrap.mjs';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const input={request_id:'acl_'+'a'.repeat(64),browser_attempt_id:'browser-synthetic',draft_id:'b'.repeat(32)};

test('necessary editor AX and DOM reads are executable independent ninety-second examples',async()=>{
 const operations=[],tab={getAXState:async()=>operations.push('ax'),playwright:{domSnapshot:async()=>operations.push('dom')}};
 await new AsyncFunction('tab',STUDIO_DIRECT_PROJECTS_READ_CODE)(tab);
 assert.deepEqual(operations,['ax']);
 await new AsyncFunction('tab',STUDIO_EDITOR_DOM_READ_CODE)(tab);
 assert.deepEqual(operations,['ax','dom']);
 for(const code of [STUDIO_DIRECT_PROJECTS_READ_CODE,STUDIO_EDITOR_DOM_READ_CODE]){
  assert.equal((code.match(/\bawait\b/g)||[]).length,1);
  assert.doesNotMatch(code,/click|fill|goto|reload|waitFor/);
  assert.ok(STUDIO_EDITOR_READ_POLICY.includes('code:'+JSON.stringify(code)+',timeout_ms:90000'));
 }
 assert.match(STUDIO_EDITOR_READ_POLICY,/Do not rely on the tool's default 30000 budget/);
});

test('bound preparation explicitly budgets necessary script and voice readback without an every-call sixty-second conflict',()=>{
 const prompt=studioPreviewPrompt('prepare',input);
 assert.ok(prompt.includes(STUDIO_EDITOR_READ_POLICY));
 assert.match(prompt,/after the original title commit, script entry, existing-voice selection and saving/);
 assert.match(prompt,/original same-UUID reload's required persistence checks/);
 assert.doesNotMatch(prompt,/Set timeout_ms:60000 on EVERY cua_repl\.js call/);
 assert.match(prompt,/Set timeout_ms:60000 on this initial cua_repl call/);
 assert.match(prompt,/Never click Play\/Preview\/Generate\/Render\/Export/);
 assert.match(prompt,/a different nonempty substantive title must stop as a binding change/);
});

test('pending preparation retains the exact six bootstrap calls and their proven sixty-second budget',()=>{
 const pending={...input,draft_id:null,pending_preparation_permit:{evidence:{schema:'heygen-studio-pending-preparation-continuation-v1'}}},prompt=studioPreviewPrompt('prepare',pending);
 for(const code of [STUDIO_DIRECT_BROWSER_SELECT_CODE,STUDIO_DIRECT_BROWSER_INVENTORY_CODE,STUDIO_DIRECT_CREATE_CODE,studioDirectInventoryCode(pending),studioDirectNavigationCode('pending-preparation'),STUDIO_DIRECT_PROJECTS_READ_CODE])assert.ok(prompt.includes(code));
 assert.match(prompt,/Set timeout_ms:60000 on each of these exact first SIX invocations/);
 assert.match(STUDIO_EDITOR_READ_POLICY,/including their first target AX, still require timeout_ms:60000/);
 assert.match(prompt,/Never click New, Create, 创建 or any creation menu/);
 assert.match(prompt,/No Play or media generation is permitted/);
});

test('already authorized editor readiness and reconciliation get the same independent-read budget without adding actions',()=>{
 for(const phase of ['preview-readiness','reconcile','preview']){
  const prompt=studioPreviewPrompt(phase,input);
  assert.ok(prompt.includes(STUDIO_EDITOR_READ_POLICY),phase);
  assert.doesNotMatch(prompt,/Set timeout_ms:60000 on EVERY cua_repl\.js call/);
 }
 assert.match(STUDIO_EDITOR_READ_POLICY,/Keep navigation, reload, click, fill, title commit and voice selection in their own separate invocations/);
 assert.match(STUDIO_EDITOR_READ_POLICY,/does not extend the parent deadline or any loading\/cleanup window/);
 assert.match(STUDIO_EDITOR_READ_POLICY,/grants no editor entry, edit, reload, new draft, page, generation, retry or Play permission/);
 assert.match(STUDIO_EDITOR_READ_POLICY,/On any actual tool\/security\/ownership error stop/);
});

test('directory recovery keeps its existing evidence and first-six policy when an authorized exact result reaches an editor',()=>{
 const prompt=studioPreviewPrompt('recover-preparation',{...input,draft_id:null});
 assert.ok(prompt.includes(STUDIO_EDITOR_READ_POLICY));
 assert.match(prompt,/Only AFTER the exact-title search completed/);
 assert.match(prompt,/complete zero-search, scope, filter, sort, pending-watermark or pagination evidence/);
 assert.match(prompt,/Set timeout_ms:60000 on each of these exact first SIX invocations/);
 assert.match(STUDIO_EDITOR_READ_POLICY,/Reuse an already returned complete current editor read/);
 assert.match(STUDIO_EDITOR_READ_POLICY,/All original same-draft, exact title\/script\/scene-voice, persistence, ownership, unknown-result and Play gates remain required/);
});
