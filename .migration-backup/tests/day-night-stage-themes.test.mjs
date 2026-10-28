import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {NODE_STAGE_PROFILE,NODE_STAGE_LAYOUT} from '../production/unified-runtime/node-stage-layout.mjs';
import {NODE_STAGE_SPACED_PROFILE,NODE_STAGE_SPACED_LAYOUT,nodeStageLayout} from '../production/unified-runtime/node-stage-profiles.mjs';
import {themedStage,styleCaptions} from '../production/unified-runtime/stage-themes.mjs';

const base=JSON.parse(fs.readFileSync('production/unified-runtime/mechanism-v1.json','utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');

test('day/night v2 uses the approved spacing without changing a frozen v1 project',()=>{
 const old=themedStage(base,'casual-tech-safe-v1',{layoutProfile:NODE_STAGE_PROFILE}).style;
 for(const runtime of ['morning-light-v1','evening-dark-v2']){
  const {style,svg}=themedStage(base,runtime),L=style.layout;
  assert.equal(style.theme.layout_profile,NODE_STAGE_SPACED_PROFILE);assert.equal(L.source.y,474);assert.equal(L.caption.y,1136);assert.equal(L.chapter.y,1228);
  assert.deepEqual([L.source.x,L.source.width,L.source.height],[28,1024,576]);assert.equal(L.caption.normal_size,76);
  assert.deepEqual(L.history,NODE_STAGE_LAYOUT.history);assert.equal(1920-L.history.y-L.history.height,380);assert.equal(L.history.y-L.chapter.y-L.chapter.height,14);
  // Measured two-line subtitle ink plus outline is approximately 134px high.
  assert.ok(L.caption.y-64-(L.source.y+L.source.height)>=22);assert.ok(L.chapter.y-(L.caption.y+69)>=23);
  assert.equal(style.background_sha256,sha(svg));assert.ok(svg.includes('y="430"'));
  assert.deepEqual(style.layout, explicitLayout(runtime));
 }
 function explicitLayout(runtime){return themedStage(base,runtime,{layoutProfile:NODE_STAGE_SPACED_PROFILE}).style.layout;}
 assert.equal(old.layout.source.y,490);assert.equal(old.layout.caption.y,1128);assert.equal(old.layout.chapter.y,1220);
 assert.equal(nodeStageLayout(NODE_STAGE_PROFILE),NODE_STAGE_LAYOUT);assert.equal(nodeStageLayout(NODE_STAGE_SPACED_PROFILE),NODE_STAGE_SPACED_LAYOUT);assert.equal(nodeStageLayout('unknown'),null);
 assert.throws(()=>themedStage(base,'morning-light-v1',{layoutProfile:NODE_STAGE_PROFILE}),/STAGE_THEME_LAYOUT_VERSION_MISMATCH/);
});

test('morning template colors every visible text/card layer for light backgrounds while keeping dark v2 colors',()=>{
 const light=themedStage(base,'morning-light-v1').style,dark=themedStage(base,'evening-dark-v2').style;
 assert.deepEqual(light.theme.background,['#F7F4ED','#EDF2F3']);assert.equal(light.theme.title,'#1B3247');assert.equal(light.theme.brand,'#6C8290');
 assert.equal(light.chapter.future_text,'#657B87');assert.equal(light.chapter.revealed_text,'#FFFCF6');assert.deepEqual(light.chapter.revealed,['#2F6A70','#2F6A70','#2F6A70']);
 assert.equal(light.history_card.background,'#FCFCF8');assert.equal(light.history_card.text,'#1B3247');assert.equal(light.history_card.accent_color,'#A96B48');assert.deepEqual(light.history_card.cover,dark.history_card.cover);
 assert.equal(dark.theme.title,'#fbf6ee');assert.equal(dark.history_card.background,'#1c2d41');assert.equal(dark.history_card.text,'#eff2ee');
 // Mutating one prepared mechanism cannot recolor other projects or constants.
 light.history_card.title.size=1;light.theme.background[0]='#000000';assert.equal(NODE_STAGE_LAYOUT.history_card.title.size,64);assert.equal(themedStage(base,'morning-light-v1').style.theme.background[0],'#F7F4ED');
});

test('new palette backgrounds match the actual owner-reviewed preview backgrounds exactly',()=>{
 assert.equal(themedStage(base,'morning-light-v1').style.background_sha256,'1a644313296137ef2e55dd6a7e1bbfeaff516cbad0cffd2b639be126a3bf4de4');
 assert.equal(themedStage(base,'evening-dark-v2').style.background_sha256,'9fe6dfe992bbd387c983c33227883b1bb34dc1e40a58828ba144371d4c31d653');
});

test('light and dark subtitle treatment preserves approved dialogue/time and keeps the 76px baseline',()=>{
 const source='Style: Default,Microsoft YaHei,58,&HFFFFFF,&HFFFFFF,&H000000,&H000000,0,0,0,0,100,100,0,0,1,2,2,2,0,0,0,1\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\pos(540,1128)}第一行\\N第二行';
 for(const [runtime,primary,outline,width]of [['morning-light-v1','&H0047321B','&H00EDF4F7','1.2'],['evening-dark-v2','&H00F4FAFF','&H001A0E08','2']]){
  const out=styleCaptions(source,themedStage(base,runtime).style.theme),row=out.split('\n')[0].split(',');
  assert.equal(row[2],'76');assert.equal(row[3],primary);assert.equal(row[4],primary);assert.equal(row[5],outline);assert.equal(row[16],width);
  assert.equal(out.split('\n')[1],source.split('\n')[1].replace('pos(540,1128)','pos(540,1136)'));
 }
});

test('day/night catalog source bundles bind the real runtime dependency graph, original outro and versioned layout identity',()=>{
 const catalog=JSON.parse(fs.readFileSync('production/template-catalog.json','utf8')),identity=JSON.parse(fs.readFileSync('production/template-layout-identity.json','utf8'));
 assert.equal(identity.profile,NODE_STAGE_SPACED_PROFILE);assert.equal(identity.sha256,sha(fs.readFileSync('production/unified-runtime/node-stage-layout-v2.json')));
 for(const [id,time,tone,opposite]of [['morning-light','08:00','light','dark'],['evening-dark','18:00','dark','light']]){
  const row=catalog.find(t=>t.id===id&&t.version===1);assert.ok(row);assert.equal(row.time_slot,time);assert.equal(row.tone,tone);assert.equal(row.outro_variant,opposite);assert.equal(row.layout_profile,NODE_STAGE_SPACED_PROFILE);assert.equal(row.outro_version,'v5');assert.equal(row.bundle,null);
  const bytes=fs.readFileSync(row.source_bundle.manifest_path),manifest=JSON.parse(bytes);assert.equal(sha(bytes),row.source_bundle.sha256);assert.equal(manifest.runtime,row.runtime);assert.equal(manifest.outro.variant,opposite);assert.equal(manifest.outro.frames,119);assert.deepEqual(manifest.layout_identity,identity);
  for(const file of manifest.files){const bytes=fs.readFileSync(file.path);assert.equal(sha(bytes),file.sha256,file.path);assert.equal(bytes.length,file.size_bytes,file.path);}
  for(const dep of ['render-v9.mjs','stage-themes.mjs','node-stage-profiles.mjs','node-stage-layout-v2.json','node-stage-layout.mjs','concat-video.mjs','title-layout.mjs','time-format.mjs'])assert.ok(manifest.files.some(f=>f.path.endsWith('/'+dep)),dep);
 }
 assert.equal(catalog.find(t=>t.id==='legacy-silver').aesthetic_status,'pending');
});
