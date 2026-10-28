// Run actual preparation with synthetic source bytes and in-process media-tool
// stubs. No FFmpeg, source decoding, speech or provider calls execute.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {stageChapters} from '../production/unified-runtime/node-stage-layout.mjs';
import {NODE_STAGE_SPACED_PROFILE} from '../production/unified-runtime/node-stage-profiles.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const mock=`import fs from'node:fs';import path from'node:path';
const frames=file=>/range-0\\.mkv$/.test(file)?90:/range-1\\.mkv$/.test(file)?270:360;
export async function probe(file){return path.basename(file)==='audio.m4a'?{format:{duration:String(479/30)},streams:[{codec_type:'audio'}]}:{format:{duration:'12'},streams:[{codec_type:'video',r_frame_rate:'30/1',nb_frames:path.basename(file)==='outro.mp4'?119:360,width:path.basename(file)==='outro.mp4'?1080:1024,height:path.basename(file)==='outro.mp4'?1920:576}]};}
export async function command(exe,args){if(exe==='ffprobe'){const file=args.at(-1);return{out:JSON.stringify({streams:[{codec_type:'video',r_frame_rate:'30/1',time_base:'1/30000',nb_read_frames:frames(file),width:1024,height:576}]}),error:''};}if(exe!=='ffmpeg')throw Error('SYNTHETIC unexpected executable '+exe);fs.writeFileSync(args.at(-1),'SYNTHETIC prepared plane');return{out:'',error:''};}`;

await build({entryPoints:['scripts/prepare-unified-project.mjs'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/day-night-preparation-test.mjs',logLevel:'silent',plugins:[{name:'synthetic-media-tools',setup(b){b.onResolve({filter:/media-adapter\.mjs$/},()=>({path:'media',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:mock,loader:'js'}));}}]});
const {prepareUnified}=await import(pathToFileURL(path.resolve('.sites-runtime/day-night-preparation-test.mjs')).href);
const catalog=JSON.parse(fs.readFileSync('production/template-catalog.json','utf8'));

test('real new-project preparation preserves the approved day/night headline size, spacing and dependency graph',async t=>{
 const temp=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(temp,'SYNTHETIC-day-night-prepare-'));t.after(()=>{assert.equal(path.dirname(root),temp);assert.ok(path.basename(root).startsWith('SYNTHETIC-day-night-prepare-'));fs.rmSync(root,{recursive:true,force:true});});
 const put=(name,bytes)=>{fs.writeFileSync(path.join(root,name),bytes);return{path:name,sha256:sha(bytes)};},source=put('source.mkv','SYNTHETIC source'),audio=put('audio.m4a','SYNTHETIC audio'),outro=put('outro.mp4','SYNTHETIC outro'),captions=put('captions.ass','SYNTHETIC approved captions');
 for(const id of ['morning-light','evening-dark']){
  const template=catalog.find(t=>t.id===id&&t.version===1),selection={id:'SYNTHETIC-'+id,template,template_hash:sha(JSON.stringify(template)),mode_epoch:0},project={schema:'siounex-unified-project-v2',title:'英伟达黄仁勋劝诫欧洲各国',layout_profile:NODE_STAGE_SPACED_PROFILE,binding:{script_revision:1,script_hash:'a'.repeat(64),mode_epoch:0,series_selection_id:selection.id},authorization:{scope:'private-review-existing-media',reference:'SYNTHETIC isolated template test'},series_selection:selection,body:{source,frames:360,source_rectangle:[0,0,1024,576],complete_source_confirmed:true,opening_highlight:{start_frame:0,continuous_real_frames:90,selection_reason:'SYNTHETIC already frontloaded approved source'}},audio_master:{...audio,coverage:'body-and-outro',authorization_reference:'SYNTHETIC reused audio'},outro:{...outro,frames:119,version:'v5'},captions,chapters:stageChapters(360),lower_slot:{mode:'none',episodes:[],intervals:[]}};
  const prepared=await prepareUnified({project,inputRoot:root,outputRoot:path.join(root,id)}),config=JSON.parse(fs.readFileSync(prepared.config,'utf8')),mechanism=JSON.parse(fs.readFileSync(path.join(prepared.out,config.mechanism),'utf8'));
  assert.equal(config.title_font_size,110,'new runtime names must retain the owner-reviewed headline size');assert.equal(config.layout_profile,NODE_STAGE_SPACED_PROFILE);assert.equal(mechanism.layout.source.y,474);assert.equal(mechanism.layout.caption.y,1136);assert.equal(mechanism.layout.chapter.y,1228);
  assert.equal(config.title,project.title);assert.equal(config.captions.sha256,captions.sha256);assert.equal(config.audio_master.sha256,audio.sha256);assert.equal(config.outro.frames,119);
  assert.equal(config.runtime_fix.schema,'private-title-runtime-fix-v3');assert.equal(config.runtime_fix.existing_template_lock_preserved,true);assert.deepEqual(config.series_selection,selection);assert.equal(sha(fs.readFileSync(path.join(prepared.out,'title-layout.mjs'))),sha(fs.readFileSync('production/unified-runtime/title-layout-v3.mjs')));assert.equal(prepared.receipt.runtime_fix.renderer_sha256,sha(fs.readFileSync('production/unified-runtime/render-v10.mjs')));const renderer=fs.readFileSync(path.join(prepared.out,'render-project.mjs'),'utf8');assert.equal(renderer.split('minFontSize:32,').length-1,2);
  for(const dep of ['node-stage-layout.mjs','node-stage-profiles.mjs','node-stage-layout-v2.json','stage-themes.mjs','render-project.mjs'])assert.ok(fs.existsSync(path.join(prepared.out,dep)),dep);
 }
});
