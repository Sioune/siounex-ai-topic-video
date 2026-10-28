// Cleanup needs a real active Codex turn. A direct MCP call after turn end has
// no CUA session/turn metadata and a hook acknowledgement is not a closed page.
export const STUDIO_CLEANUP_MARK='STUDIO_TEMP_PAGE_CLEANUP_V1:';
function chromeListCleanupSteps(page){
 const binding=JSON.stringify({request_id:page.request_id,attempt_id:page.attempt_id,tab_id:page.tab_id}),browser=JSON.stringify(page.browser_id||null),inventoryBrowser=JSON.stringify(page.browser_id||'chrome');
 return [page.browser_id?`let studioOwnedCleanupEntryBrowser=await cua.getBrowser({id:${browser}});`:`let studioOwnedCleanupEntryTab=await cua.getTab(${JSON.stringify(page.tab_id)},{browser:'chrome'});`,
`let studioOwnedCleanupTabs=await cua.listTabs({browser:${inventoryBrowser},emit:false});
let studioOwnedCleanupBinding=${binding};
let studioOwnedCleanupTab=null;
let studioOwnedCleanupManagement=null;
let studioOwnedCloseError=false;
let studioOwnedInitialReadable=Array.isArray(studioOwnedCleanupTabs)&&studioOwnedCleanupTabs.every(t=>t&&typeof t.browserId==='string'&&t.browserId&&(${browser}===null||t.browserId===${browser})&&t.id!==undefined)&&new Set(studioOwnedCleanupTabs.map(t=>String(t.id))).size===studioOwnedCleanupTabs.length;
let studioOwnedRows=studioOwnedInitialReadable?studioOwnedCleanupTabs.filter(t=>String(t.id)===studioOwnedCleanupBinding.tab_id):[];
if(!studioOwnedInitialReadable||studioOwnedRows.length>1||studioOwnedRows.length===1&&${browser}!==null&&studioOwnedRows[0].browserId!==${browser}){studioOwnedCloseError=true;}
else if(studioOwnedRows.length===1){
if(typeof tab!=='undefined'&&String(tab.id)===studioOwnedCleanupBinding.tab_id){studioOwnedCleanupTab=tab;}
else if(typeof studioOwnedCleanupEntryTab!=='undefined'&&String(studioOwnedCleanupEntryTab.id)===studioOwnedCleanupBinding.tab_id){studioOwnedCleanupTab=studioOwnedCleanupEntryTab;}
else{try{if(!/^[0-9]+$/.test(studioOwnedCleanupBinding.tab_id))throw Error('Unrecognized Chrome tab identity');let studioOwnedCleanupBrowser=typeof studioOwnedCleanupEntryBrowser!=='undefined'?studioOwnedCleanupEntryBrowser:await cua.getBrowser({id:studioOwnedRows[0].browserId});studioOwnedCleanupManagement=await studioOwnedCleanupBrowser.capabilities.get('management');nodeRepl.write(await studioOwnedCleanupManagement.documentation());}catch{studioOwnedCloseError=true;}}
}`,
`if(!studioOwnedCloseError){try{if(studioOwnedCleanupTab)await studioOwnedCleanupTab.close();else if(studioOwnedCleanupManagement)await studioOwnedCleanupManagement.tabs.remove(Number(studioOwnedCleanupBinding.tab_id));}catch{studioOwnedCloseError=true;}}`,
`let studioOwnedFinalTabs=await cua.listTabs({browser:${inventoryBrowser},emit:false});
let studioOwnedInventoryReadable=Array.isArray(studioOwnedFinalTabs)&&studioOwnedFinalTabs.every(t=>t&&typeof t.browserId==='string'&&t.browserId&&(${browser}===null||t.browserId===${browser})&&t.id!==undefined)&&new Set(studioOwnedFinalTabs.map(t=>String(t.id))).size===studioOwnedFinalTabs.length;
nodeRepl.write('${STUDIO_CLEANUP_MARK}'+JSON.stringify({...studioOwnedCleanupBinding,inventory_readable:studioOwnedInventoryReadable,absent:studioOwnedInventoryReadable&&!studioOwnedFinalTabs.some(t=>String(t.id)===studioOwnedCleanupBinding.tab_id),close_error:studioOwnedCloseError}));`];
}
export function ownedPageCleanupSteps(page){
 if(page.inventory_mode==='chrome-list-tabs')return chromeListCleanupSteps(page);
 const binding=JSON.stringify({request_id:page.request_id,attempt_id:page.attempt_id,tab_id:page.tab_id});
 return [`let studioOwnedCleanupState=await cua.getState();`,
`let studioOwnedCleanupBinding=${binding};
let studioOwnedCleanupTab=null;
let studioOwnedCleanupManagement=null;
let studioOwnedCloseError=false;
let studioOwnedBrowser=studioOwnedCleanupState.browsers?.find(b=>String(b.id)===${JSON.stringify(page.browser_id)}&&b.family==='chrome'&&Array.isArray(b.tabs));
if(!(studioOwnedCleanupState.errors||[]).length&&studioOwnedBrowser?.tabs.some(t=>String(t.id)===studioOwnedCleanupBinding.tab_id)){
if(typeof tab!=='undefined'&&String(tab.id)===studioOwnedCleanupBinding.tab_id){studioOwnedCleanupTab=tab;}
else{try{if(!/^[0-9]+$/.test(studioOwnedCleanupBinding.tab_id))throw Error('Unrecognized Chrome tab identity');let studioOwnedCleanupBrowser=await cua.getBrowser({id:String(studioOwnedBrowser.id)});studioOwnedCleanupManagement=await studioOwnedCleanupBrowser.capabilities.get('management');nodeRepl.write(await studioOwnedCleanupManagement.documentation());}catch{studioOwnedCloseError=true;}}
}`,
`if(!studioOwnedCloseError){try{if(studioOwnedCleanupTab)await studioOwnedCleanupTab.close();else if(studioOwnedCleanupManagement)await studioOwnedCleanupManagement.tabs.remove(Number(studioOwnedCleanupBinding.tab_id));}catch{studioOwnedCloseError=true;}}
let studioOwnedFinalInventory=await cua.getState({emit:false});
let studioOwnedInventoryReadable=Array.isArray(studioOwnedFinalInventory.browsers)&&!(studioOwnedFinalInventory.errors||[]).length&&studioOwnedFinalInventory.browsers.some(b=>String(b.id)===${JSON.stringify(page.browser_id)}&&b.family==='chrome'&&Array.isArray(b.tabs));
nodeRepl.write('${STUDIO_CLEANUP_MARK}'+JSON.stringify({...studioOwnedCleanupBinding,inventory_readable:studioOwnedInventoryReadable,absent:studioOwnedInventoryReadable&&!studioOwnedFinalInventory.browsers.some(b=>b.tabs.some(t=>String(t.id)===studioOwnedCleanupBinding.tab_id)),close_error:studioOwnedCloseError}));`];
}
export const ownedPageCleanupCode=page=>ownedPageCleanupSteps(page).at(-1);
export function ownedPageCleanupPrompt(page){return `The owner requested automatic cleanup of worker-created temporary pages. Cleanup ONLY the exact created page recorded by THIS original owner thread. Execute these ${page.inventory_mode==='chrome-list-tabs'?'four':'three'} cua_repl.js calls in order, verbatim, each with timeout_ms:60000. Read each result before the next call. ${page.inventory_mode==='chrome-list-tabs'?'The first call initializes current documentation through the already verified browser ID, or reselects only this exact worker-created numeric tab ID when its browser ID was not yet recorded. That pending-page reselect is confined to this same original owner thread. If it is already closed or unavailable, stop with cleanup unconfirmed; never select a different page. Call2 obtains the Chrome-only inventory.':'The first call is inventory only and initializes documentation after a kernel reset.'} Reuse the retained owner handle when available. If the handle was lost, read the official Chrome management capability documentation in call2, then use its documented close operation solely on THIS recorded numeric Chrome tab ID verified in fresh inventory. This is temporary-page cleanup, never a borrowed page claim, access recovery or media fallback. Never close a borrowed/user page, bypass an ownership/security refusal, create, name, navigate, inspect content, edit, preview, generate, close another page or use another thread. On a failed tool call stop.\n${ownedPageCleanupSteps(page).map((code,i)=>`CALL ${i+1}:\n${code}`).join('\n')}`;}
export function cleanupCollector({threadId,page,onDone=()=>{}}){
 const codes=ownedPageCleanupSteps(page),state={turn_id:null,terminal:false,status:null,tool_call_count:0,scope_valid:true,proof:null};let toolId=null,step=0;
 const invalidate=()=>{state.scope_valid=false;};
 return {state,code:codes.at(-1),receive(v){
  const p=v.params||{};
  if(v.method==='turn/started'){if(p.threadId!==threadId||typeof p.turn?.id!=='string'||state.turn_id&&state.turn_id!==p.turn.id)invalidate();else state.turn_id=p.turn.id;}
  else if(/^item\/(?:started|completed|updated)$/.test(v.method)){
   if(p.threadId!==threadId||p.turnId!==state.turn_id||state.terminal||!p.item)return invalidate();const i=p.item;
   if(i.type==='userMessage'){if(i.content?.length!==1||i.content[0]?.text!==ownedPageCleanupPrompt(page))invalidate();return;}
   if(i.type==='mcpToolCall'){
    if(i.server!=='cua_repl'||i.tool!=='js'||i.arguments?.code!==codes[step])return invalidate();
    if(v.method==='item/started'){if(toolId||step>=codes.length)invalidate();toolId=i.id;state.tool_call_count++;}
    else if(v.method==='item/completed'){
     if(toolId!==i.id||i.status!=='completed'||i.result?.isError===true)return invalidate();toolId=null;
     if(++step<codes.length)return;
     const texts=(i.result?.content||[]).filter(c=>c.type==='text').map(c=>c.text),markers=texts.filter(s=>s.includes(STUDIO_CLEANUP_MARK));
     if(markers.length!==1)return invalidate();let proof;try{const raw=markers[0];if(raw.split(STUDIO_CLEANUP_MARK).length!==2)return invalidate();proof=JSON.parse(raw.slice(raw.indexOf(STUDIO_CLEANUP_MARK)+STUDIO_CLEANUP_MARK.length).trim());}catch{return invalidate();}
     const keys=['request_id','attempt_id','tab_id','inventory_readable','absent','close_error'];if(Object.keys(proof).sort().join()!==keys.sort().join()||['request_id','attempt_id','tab_id'].some(k=>proof[k]!==page[k])||['inventory_readable','absent','close_error'].some(k=>typeof proof[k]!=='boolean'))return invalidate();state.proof=proof;
    }
   }else if(!['reasoning','agentMessage'].includes(i.type))invalidate();
  }else if(v.method==='turn/completed'){
   if(p.threadId!==threadId||p.turn?.id!==state.turn_id||state.terminal)invalidate();state.terminal=true;state.status=p.turn?.status;onDone();
  }else if(v.method==='error')invalidate();
 },verified(){return state.scope_valid&&state.terminal&&state.status==='completed'&&state.tool_call_count===codes.length&&step===codes.length&&state.proof?.inventory_readable===true&&state.proof.absent===true&&state.proof.close_error===false;}};
}
