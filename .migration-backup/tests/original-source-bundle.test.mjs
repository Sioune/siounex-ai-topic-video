// SYNTHETIC local packet tests; no live owner record, model, media or publishing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {originalSourceBundle} from '../scripts/original-source-bundle.mjs';
import {sourceEvidence} from '../scripts/source-evidence.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-original-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
function source(){const original_text='SYNTHETIC 产品说明：支持镜头修改后接续，功能尚未实测。\n',draft='# SYNTHETIC 草稿\n\n这次介绍思路，后续用真实任务验证。\n';return {url:'https://synthetic.example/originals?id=original_'+('a'.repeat(64)),source_id:'owner-original',title:'SYNTHETIC title',original:{schema:'frozen-owner-original-v1',id:'original_'+('a'.repeat(64)),owner_id:'SYNTHETIC-owner',version:1,original_text,original_sha256:sha(original_text),draft,draft_sha256:sha(draft),title:'SYNTHETIC 中文草稿',summary:'SYNTHETIC 核对镜头的局部修改',pending_claims:'SYNTHETIC 接续行为待核',verified_notes:'SYNTHETIC 仅确认收到说明；没有产品实测。',history_note:'SYNTHETIC 原稿状态是历史记录。',description_date:'2026-10-23',source_refs:[],created_at:'2026-10-24T00:00:00Z',source_kind:'owner-original-not-external-news'}};}

test('SYNTHETIC owner original brief preserves boundaries and existing media facts without fetching or approving',t=>{
 const directory=fixture(t),s=source(),job={source_snapshot:JSON.stringify(s)},existing=path.join(directory,'provided.json'),base={evidence:[{url:'https://synthetic.example/evidence',sha256:'b'.repeat(64)}],images:[],user_requirements:{goal:'SYNTHETIC explicit direction'}};
 fs.writeFileSync(existing,JSON.stringify(base));const file=originalSourceBundle(job,path.join(directory,'notes'),existing),brief=JSON.parse(fs.readFileSync(file));
 assert.deepEqual(brief.evidence,base.evidence);assert.deepEqual(brief.images,[]);assert.equal(brief.user_requirements.goal,base.user_requirements.goal);assert.equal(brief.user_requirements.pending_claims,s.original.pending_claims);assert.equal(brief.user_requirements.verified_notes,s.original.verified_notes);assert.equal(brief.user_requirements.history_note,s.original.history_note);
 assert.equal(brief.original_binding.media_observed,false);assert.equal(brief.original_binding.quality_approved,false);assert.equal(brief.original_binding.publication_authorized,false);assert.equal(brief.original_binding.original_sha256,s.original.original_sha256);assert.equal(brief.original_binding.draft_sha256,s.original.draft_sha256);
 assert.equal(originalSourceBundle(job,path.join(directory,'notes'),existing),file);
 s.original.draft+='SYNTHETIC change';assert.throws(()=>originalSourceBundle({source_snapshot:JSON.stringify(s)},path.join(directory,'notes'),existing),/packet/);
});

test('SYNTHETIC source metadata keeps material date distinct from unknown public release and refuses changed raw bytes',()=>{
 const s=source(),packet=Buffer.from('SYNTHETIC complete frozen product description and draft packet'),evidence=sourceEvidence(packet,s);
 assert.equal(evidence.published_at,null);assert.equal(evidence.description_date,'2026-10-23');assert.equal(evidence.source_sha256,sha(packet));assert.equal(evidence.source_kind,'owner-original-not-external-news');assert.deepEqual(evidence.media_references,[]);assert.match(evidence.limits,/not observed test results/);
 s.original.original_text+='SYNTHETIC changed';assert.throws(()=>sourceEvidence(packet,s),/binding mismatch/);
});

test('SYNTHETIC mismatched source identities cannot smuggle original packets and ordinary external sources stay outside this brief',t=>{
 const directory=fixture(t),s=source();s.source_id='editorial-zh';assert.throws(()=>originalSourceBundle({source_snapshot:JSON.stringify(s)},directory),/packet/);assert.throws(()=>sourceEvidence(Buffer.from('SYNTHETIC'),s),/binding mismatch/);
 assert.equal(originalSourceBundle({source_snapshot:JSON.stringify({source_id:'editorial-zh',url:'https://synthetic.example/a'})},directory),null);
});

test('SYNTHETIC cached original brief cannot be silently replaced',t=>{
 const directory=fixture(t),s=source(),file=originalSourceBundle({source_snapshot:JSON.stringify(s)},directory);fs.writeFileSync(file,'SYNTHETIC corrupted cache');assert.throws(()=>originalSourceBundle({source_snapshot:JSON.stringify(s)},directory),/cache changed/);
});
