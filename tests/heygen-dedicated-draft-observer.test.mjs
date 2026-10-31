import test from 'node:test';
import assert from 'node:assert/strict';
import {observeDedicatedStudioDraft} from '../scripts/heygen-dedicated-draft-observer.mjs';

const draft_id = 'a'.repeat(32);
const input = {draft_id,title:'Sample',narration:'sample narration',voice_name:'Sample voice'};
const url = `https://app.heygen.com/create-v4/${draft_id}`;
const facts = {title:input.title,text:input.narration,readable:true,footer:'Sample voice',audio:[]};
const page = (u = url, f = facts) => ({url: () => u, evaluate: async () => f});

test('read-only observation never authorizes play or asserts audio absence', async () => {
  const result = await observeDedicatedStudioDraft(page(), input);
  assert.equal(result.source, 'playwright-cdp');
  assert.equal(result.play_authorized, false);
  assert.equal(result.audio_ready, false);
  assert.equal(result.audio_absence_verified, false);
  assert.equal(result.voice_selection_verified, false);
});
test('wrong provider or draft fails before page inspection', async () => {
  let inspected = false;
  await assert.rejects(observeDedicatedStudioDraft({url:()=> 'https://example.com/create-v4/' + draft_id,
    evaluate:async()=>{inspected=true;}}, input), {code:'DEDICATED_DRAFT_IDENTITY_INVALID'});
  assert.equal(inspected,false);
});
test('wrong script, title, or voice cannot be adopted', async () => {
  for (const f of [{...facts,text:'other'},{...facts,title:'other'},{...facts,footer:'other'}]) {
    await assert.rejects(observeDedicatedStudioDraft(page(url,f),input), {code:'DEDICATED_DRAFT_BINDING_MISMATCH'});
  }
});
test('partial and navigated pages cannot be adopted', async () => {
  await assert.rejects(observeDedicatedStudioDraft(page(url,{...facts,readable:false}),input), {code:'DEDICATED_DRAFT_READ_INCOMPLETE'});
  let n=0;
  await assert.rejects(observeDedicatedStudioDraft({url:()=> ++n===1?url:'https://example.com', evaluate:async()=>facts},input), {code:'DEDICATED_DRAFT_READ_INCOMPLETE'});
});
