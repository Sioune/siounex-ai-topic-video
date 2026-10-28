import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {narrationGate,narrationPreflight,assertCleanFrontstage} from '../scripts/narration-preflight.mjs';

test('frozen checker rejects source-style frontstage while clean planned story separates text from pending media',t=>{
 const job={skill_snapshot:fs.readFileSync('production/skill-snapshot/snapshot.json','utf8')};
 const parent=path.resolve('.sites-runtime');fs.mkdirSync(parent,{recursive:true});const root=fs.mkdtempSync(path.join(parent,'SYNTHETIC-narration-check-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(root)),parent);assert.ok(path.basename(root).startsWith('SYNTHETIC-narration-check-'));fs.rmSync(root,{recursive:true,force:true});});
 const planned={script:'据IT之家报道，客服可以用这张卡找到问题。',storyboard:[{narration:'先看售后卡片',visual:'待制作的售后情境卡片示意'}]};
 assert.ok(narrationGate(job).includes('语义门'));
 const r=narrationPreflight(job,planned,{root});assert.throws(()=>assertCleanFrontstage(r),/Frontstage/);assert.equal(r.text_preflight,'blocked');
 const clean={...planned,script:'假如客服收到一句：货到了，颜色不对。屏幕上只留下售后这张卡，问题也就清楚了。'};
 const c=narrationPreflight(job,clean,{root});assert.doesNotThrow(()=>assertCleanFrontstage(c));
 assert.equal(c.machine_preflight,'blocked');assert.equal(c.text_preflight,'clear');assert.deepEqual(c.text_problems,[]);assert.equal(c.material_status,'pending');assert.equal(c.production_ready,false);assert.ok(c.material_problems.some(x=>x.includes('素材')));
 const overlay=narrationPreflight(job,{...clean,overlays:['来源：IT之家']},{root});assert.throws(()=>assertCleanFrontstage(overlay));assert.equal(overlay.text_preflight,'blocked');
});

test('silent existing outros do not require body speech or acquired media, while missing body text still blocks',t=>{
 const job={skill_snapshot:fs.readFileSync('production/skill-snapshot/snapshot.json','utf8')},parent=path.resolve('.sites-runtime'),root=fs.mkdtempSync(path.join(parent,'SYNTHETIC-narration-tail-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const body={start:0,end:51,narration:'先看两个人不同的选择。',visual:'计划使用真实双人对谈原图，权利待核查。',asset_id:'image_0'},tail={start:51,end:55,narration:'',visual:'沿用既有4秒片尾：保留原件。',sound:'无新增旁白；片尾音乐保持自身速度。',asset_id:''},content={script:body.narration,storyboard:[body,tail]};
 for(const asset_id of ['', 'existing_outro_4s']){const result=narrationPreflight(job,{...content,storyboard:[body,{...tail,asset_id}]},{root});assert.equal(result.text_preflight,'clear');assert.equal(result.production_ready,false);assert.equal(result.deferred_non_narrated_segments.length,1);assert.ok(result.material_problems.length>0);}
 const broken=narrationPreflight(job,{...content,storyboard:[{...body,narration:''},tail]},{root});assert.equal(broken.text_preflight,'blocked');assert.ok(broken.text_problems.some(p=>p.includes('缺文字')));
});

test('the frozen text checker excludes the explicit original119-frame v5 tail and still rejects empty body narration',t=>{
 const job={skill_snapshot:fs.readFileSync('production/skill-snapshot/snapshot.json','utf8')},parent=path.resolve('.sites-runtime'),root=fs.mkdtempSync(path.join(parent,'SYNTHETIC-v5-narration-tail-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const body={start:0,end:52,narration:'先看两个人不同的选择。',visual:'计划使用真实双人对谈原图，权利待核查。',asset_id:'image_0'},tail={start:52,end:55.97,narration:'',visual:'保留既有v5片尾全部119帧，1×原速，不删帧、不重设计。',sound:'完整保留片尾原声；BGM不随正文旁白调速。',asset_id:'existing_v5_outro'},content={script:body.narration,storyboard:[body,tail]},before=structuredClone(content);
 for(const asset_id of ['existing_v5_outro','existing_v5_outro_119f']){const result=narrationPreflight(job,{...content,storyboard:[body,{...tail,asset_id}]},{root});assert.equal(result.text_preflight,'clear');assert.deepEqual(result.text_problems,[]);assert.equal(result.deferred_non_narrated_segments.length,1);assert.equal(result.deferred_non_narrated_segments[0].index,1);assert.equal(result.production_ready,false);assert.ok(result.material_problems.length>0);assert.deepEqual(content,before);}
 const broken=narrationPreflight(job,{...content,storyboard:[{...body,narration:''},tail]},{root});assert.equal(broken.text_preflight,'blocked');assert.ok(broken.text_problems.some(p=>p.includes('segments[0] 缺文字')));
});
