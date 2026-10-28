// Prompt/example contracts only; all browser operations below are fake adapters.
import test from 'node:test';
import assert from 'node:assert/strict';
import {studioPreviewPrompt,STUDIO_DIRECTORY_READ_POLICY,STUDIO_DIRECTORY_SORT_CLICK_CODE,STUDIO_DIRECTORY_LOCAL_READ_CODE} from '../scripts/heygen-studio-preview-bridge.mjs';
import {STUDIO_DIRECT_BROWSER_SELECT_CODE,STUDIO_DIRECT_BROWSER_INVENTORY_CODE,STUDIO_DIRECT_CREATE_CODE,STUDIO_DIRECT_PROJECTS_READ_CODE,studioDirectInventoryCode,studioDirectNavigationCode} from '../scripts/heygen-studio-direct-bootstrap.mjs';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const input={request_id:'acl_'+'a'.repeat(64),browser_attempt_id:'browser-synthetic',draft_id:null};

test('sorting click and a necessary whole-page read are separate executable examples',async()=>{
 const operations=[],control={click:async options=>operations.push({kind:'click',options})},tab={getAXState:async()=>operations.push({kind:'ax'})};
 await new AsyncFunction('studioObservedSortControl',STUDIO_DIRECTORY_SORT_CLICK_CODE)(control);
 assert.deepEqual(operations,[{kind:'click',options:{timeoutMs:10000}}]);
 assert.doesNotMatch(STUDIO_DIRECTORY_SORT_CLICK_CODE,/getAXState|domSnapshot|waitFor/);
 await new AsyncFunction('tab',STUDIO_DIRECT_PROJECTS_READ_CODE)(tab);
 assert.deepEqual(operations,[{kind:'click',options:{timeoutMs:10000}},{kind:'ax'}]);
 assert.match(STUDIO_DIRECTORY_READ_POLICY,/Do not append getAXState\(\), domSnapshot\(\), another click/);
 assert.ok(STUDIO_DIRECTORY_READ_POLICY.includes('code:'+JSON.stringify(STUDIO_DIRECTORY_SORT_CLICK_CODE)+',timeout_ms:60000'));
 assert.ok(STUDIO_DIRECTORY_READ_POLICY.includes('code:'+JSON.stringify(STUDIO_DIRECT_PROJECTS_READ_CODE)+',timeout_ms:90000'));
});

test('local sorting read returns only actual visible-control properties as JSON with its own ten-second budget',async()=>{
 const writes=[],seen=[],el={innerText:'SYNTHETIC visible order',clientWidth:80,clientHeight:24,getAttribute:name=>({'aria-expanded':'true','aria-selected':null,'aria-checked':'false'}[name]??null)};
 const control={evaluate:async(fn,arg,options)=>{seen.push({arg,options});return fn(el);}};
 await new AsyncFunction('studioObservedSortControl','nodeRepl',STUDIO_DIRECTORY_LOCAL_READ_CODE)(control,{write:value=>writes.push(value)});
 assert.deepEqual(seen,[{arg:undefined,options:{timeoutMs:10000}}]);
 assert.equal(typeof writes[0],'string');
 assert.deepEqual(JSON.parse(writes[0]),{label:el.innerText,expanded:'true',selected:null,checked:'false',width:80,height:24});
 assert.doesNotMatch(STUDIO_DIRECTORY_LOCAL_READ_CODE,/click\(|fetch\(|localStorage|__NEXT|querySelectorAll|innerHTML|getComputedStyle|isVisible/);
});

test('unacknowledged recovery preserves all six proven exact calls and limits ninety seconds to later independent full reads',()=>{
 const prompt=studioPreviewPrompt('recover-preparation',input);
 for(const code of [STUDIO_DIRECT_BROWSER_SELECT_CODE,STUDIO_DIRECT_BROWSER_INVENTORY_CODE,STUDIO_DIRECT_CREATE_CODE,studioDirectInventoryCode(input),studioDirectNavigationCode('projects'),STUDIO_DIRECT_PROJECTS_READ_CODE])assert.ok(prompt.includes(code));
 assert.ok(prompt.includes(STUDIO_DIRECTORY_READ_POLICY));
 assert.match(prompt,/Set timeout_ms:60000 on each of these exact first SIX invocations/);
 assert.match(prompt,/only a necessary later full-page AX\/DOM read uses its own single-API invocation with timeout_ms:90000/);
 assert.doesNotMatch(prompt,/Set timeout_ms:60000 on EACH invocation|Set timeout_ms:60000 on every browser invocation/);
 assert.match(prompt,/first reuse the actual Projects AX already returned/);
 assert.match(prompt,/Do not read the unchanged full page again merely to begin sorting/);
 assert.match(prompt,/Never read hidden DOM, stores, application internals or network state/);
 assert.match(prompt,/Missing facts stay null\/unknown/);
 assert.match(prompt,/complete zero-search, scope, filter, sort, pending-watermark or pagination evidence/);
 assert.doesNotMatch(STUDIO_DIRECTORY_READ_POLICY,/\b43\b/);
});

test('pending preparation keeps its original target and six-call budget without gaining a sorting, creation or Play instruction',()=>{
 const pending={...input,pending_preparation_permit:{evidence:{schema:'heygen-studio-pending-preparation-continuation-v1'}}},prompt=studioPreviewPrompt('prepare',pending);
 assert.ok(prompt.includes(studioDirectNavigationCode('pending-preparation')));
 assert.match(prompt,/Set timeout_ms:60000 on each of these exact first SIX invocations/);
 assert.match(prompt,/90000 outer budget|outer timeout_ms:90000/);
 assert.ok(!prompt.includes(STUDIO_DIRECTORY_READ_POLICY));
 assert.match(prompt,/Never click New, Create, 创建 or any creation menu/);
 assert.match(prompt,/No Play or media generation is permitted/);
});

test('bound preview initialization retains its existing inventory and does not receive the new directory-reading policy',()=>{
 const prompt=studioPreviewPrompt('preview-readiness',{...input,draft_id:'b'.repeat(32)});
 assert.ok(!prompt.includes(STUDIO_DIRECTORY_READ_POLICY));
 assert.match(prompt,/first cua_repl invocation must execute exactly let studioInitialInventory=await cua\.getState\(\)/);
 assert.match(prompt,/Set timeout_ms:60000 on this initial cua_repl call/);
 assert.match(prompt,/play_clicked:false/i);
});
