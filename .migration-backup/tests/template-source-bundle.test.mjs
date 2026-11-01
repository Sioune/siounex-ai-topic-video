import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyTemplateSourceBundle} from '../scripts/template-source-bundle.mjs';

// The production preflight checks these actual locked source bundles. A remux
// recovery change must not invalidate either existing approved template.
const catalog=JSON.parse(fs.readFileSync(new URL('../production/template-catalog.json',import.meta.url),'utf8'));
for(const id of ['morning-light','evening-dark']){
 test(`${id} retains its exact approved source bundle alongside remux recovery`,()=>{
  const template=catalog.find(t=>t.id===id&&t.version===1);
  assert.ok(template?.source_bundle);
  const manifest=verifyTemplateSourceBundle(template);
  assert.equal(manifest.template_id,id);
  assert.equal(manifest.files.find(f=>f.path==='production/unified-runtime/concat-video.mjs')?.sha256,'4016bb70080f56dfe15060b5c5ea3741ca9e5dbc62e9cadb1602f4536a1b8079');
 });
}
