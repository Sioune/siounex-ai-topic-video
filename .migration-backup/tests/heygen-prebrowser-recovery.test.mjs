import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {studioPreparationFailedBeforeBrowser} from '../scripts/heygen-studio-preview-bridge.mjs';

test('a CLI binding failure before any browser attempt resumes the same original preparation', t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-before-browser-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const r={id:'acl_'+'c'.repeat(64),status:'blocked',provider_call_started:false,provider_result:null,lease_until:null,reason:'工作室试听准备尚未完整读回（STUDIO_PREVIEW_BROWSER_UNAVAILABLE）',binding:{revision:1,script_hash:'a'.repeat(64)}};
 const digest='b'.repeat(64),marker={request_id:r.id,binding:r.binding,text_sha256:digest,started_at:'2026-10-29T13:16:08.276Z'};
 fs.writeFileSync(path.join(dir,'studio-prepare-started.json'),JSON.stringify(marker));
 fs.mkdirSync(path.join(dir,'account-read-3223015c-8b84-453c-9429-bf0a79aeb0d5'));
 const inspect=(request=r,hash=digest)=>studioPreparationFailedBeforeBrowser({dir,request,speech_text_sha256:hash});
 assert.equal(inspect(),true);
 assert.equal(inspect({...r,reason:'STUDIO_PREVIEW_BROWSER_UNAVAILABLE'}),false);
 assert.equal(inspect({...r,provider_call_started:true}),false);
 assert.equal(inspect({...r,provider_result:{audio_sha256:'c'}}),false);
 assert.equal(inspect({...r,lease_until:1}),false);
 assert.equal(inspect({...r,binding:{...r.binding,revision:2}}),false);
 assert.equal(inspect(r,'0'.repeat(64)),false);
 fs.mkdirSync(path.join(dir,'browser-11111111-1111-4111-8111-111111111111'));
 assert.equal(inspect(),false);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'studio-prepare-started.json'))),marker);
});
