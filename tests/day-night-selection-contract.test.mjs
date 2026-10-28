import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

await build({stdin:{contents:"export * from './lib/series-contract'; export * from './lib/pending-technical-refresh.mts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/day-night-selection-contract-test.mjs',logLevel:'silent'});
const m=await import(pathToFileURL(path.resolve('.sites-runtime/day-night-selection-contract-test.mjs')).href),catalog=JSON.parse(fs.readFileSync('production/template-catalog.json','utf8'));

test('approved local day/night sources validate without inventing a Library bundle identity',()=>{
 for(const id of ['morning-light','evening-dark']){
  const row=catalog.find(t=>t.id===id&&t.version===1);assert.equal(row.bundle,null);assert.ok(m.templateAssetsAvailable(row));assert.equal(m.validateTemplate(row),row);
  assert.throws(()=>m.validateTemplate({...row,source_bundle:{...row.source_bundle,sha256:'0'.repeat(64)}}),/本地模板归档/);
  assert.throws(()=>m.validateTemplate({...row,tone:row.tone==='light'?'dark':'light'}),/真实运行器/);
  assert.throws(()=>m.validateTemplate({...row,outro_variant:row.outro_variant==='light'?'dark':'light'}),/本地模板归档|早晚模板/);
 }
});

test('new v2 and preserved v1 are both current supported render targets, so natural continuation keeps human review pending',()=>{
 assert.equal(m.currentPrivateRenderTarget(m.CURRENT_PRIVATE_RENDER_TARGET),true);
 assert.equal(m.registeredPrivateRenderTarget(m.SPACED_PRIVATE_RENDER_TARGET),true);
 assert.equal(m.currentPrivateRenderTarget(m.SPACED_PRIVATE_RENDER_TARGET),true,'v2 must not enter another technical-refresh cycle');
 assert.equal(m.currentPrivateRenderTarget({...m.SPACED_PRIVATE_RENDER_TARGET,lower_slot_layout_sha256:'0'.repeat(64)}),false);
});
