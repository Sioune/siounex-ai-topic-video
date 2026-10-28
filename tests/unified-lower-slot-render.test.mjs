// Exercise the real renderer entry point with synthetic bytes and isolated
// media-tool mocks. No FFmpeg, Sharp decoder, provider, or product media runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {NODE_STAGE_PROFILE,NODE_STAGE_LAYOUT,stageChapters,stageHistoryIntervals} from '../production/unified-runtime/node-stage-layout.mjs';
import {NODE_STAGE_SPACED_PROFILE} from '../production/unified-runtime/node-stage-profiles.mjs';
import {themedStage} from '../production/unified-runtime/stage-themes.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../production/unified-runtime');
const childStub=`
import fs from 'node:fs';import path from 'node:path';
export function execFileSync(exe,args,options={}){
 fs.appendFileSync('mock-tool-calls.jsonl',JSON.stringify({exe,args})+'\\n');
 if(exe==='ffprobe')return JSON.stringify({streams:[{codec_type:'video',width:args.at(-1)==='outro.mp4'?1080:1024,height:args.at(-1)==='outro.mp4'?1920:576,r_frame_rate:'30/1',nb_frames:args.at(-1)==='outro.mp4'?'119':'900'}]});
 if(exe!=='ffmpeg')throw Error('SYNTHETIC test forbids external tool '+exe);
 if(args[0]==='-version')return 'SYNTHETIC ffmpeg mock; no media tools executed\\n';
 const output=args.at(-1);if(!output||output.startsWith('-'))throw Error('SYNTHETIC output required');
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,'SYNTHETIC output '+path.basename(output));return options.encoding?'':Buffer.alloc(0);
}`;
const sharpStub=`
import fs from 'node:fs';import path from 'node:path';
function sharp(){const chain={};for(const key of ['png','resize','extract','ensureAlpha','composite'])chain[key]=()=>chain;chain.toBuffer=async()=>Buffer.from('SYNTHETIC raster bytes');chain.toFile=async file=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'SYNTHETIC PNG');return{width:1,height:1};};return chain;}
sharp.versions={sharp:'SYNTHETIC-mock'};export default sharp;`;
const titleStub=`export function fitTitleText({text,fontSize}){return{text,lines:text.split('\\n'),font_size:fontSize,approved_text_unchanged:true,measured_line_widths:[100],bounded_height:100};}`;
const concatStub=`export function concatPinnedVideoFrames(){throw Error('Preview tests must not concatenate or render a final video');}`;

async function fixture(t,mode='history',{theme='casual-tech-safe-v1',profile=NODE_STAGE_PROFILE}={}){
 const temp=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(temp,'SYNTHETIC-lower-slot-render-'));t.after(()=>{assert.equal(path.dirname(path.resolve(root)),temp);assert.ok(path.basename(root).startsWith('SYNTHETIC-lower-slot-render-'));fs.rmSync(root,{recursive:true,force:true});});
 const put=(file,bytes)=>{const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);return{path:file,sha256:sha(bytes)};};
 const source=put('source.mkv','SYNTHETIC true source bytes'),audio=put('audio.m4a','SYNTHETIC audio bytes'),outro=put('outro.mp4','SYNTHETIC pinned outro'),captions=put('captions.ass','[Script Info]\nPlayResX: 1080\nPlayResY: 1920\n[Events]\nDialogue: 0,0:00:00.00,0:00:30.00,Default,,0,0,0,,SYNTHETIC approved caption\n');
 const font=put('font.ttf','SYNTHETIC font bytes'),fonts=Object.fromEntries(['bold','regular','numeric'].map(k=>[k,{...font,family:'SYNTHETIC '+k}]));put('fonts.json',JSON.stringify(fonts));
 const base=JSON.parse(fs.readFileSync(path.join(runtime,'mechanism-v1.json'),'utf8')),{style,svg}=themedStage(base,theme,{layoutProfile:profile});style.background='background.svg';style.background_sha256=sha(svg);put(style.background,svg);put('mechanism.json',JSON.stringify(style));
 const episodes=(['none','current'].includes(mode)?[]:mode==='next'?[0]:[0,1,2]).map(i=>({id:'SYNTHETIC-history-'+i,title:'SYNTHETIC published '+i,display_title:'往期作品'+i,lookpoint:'真实旧作看点'+i,published_confirmed:true,cover:{...put('episode-'+i+'.png','SYNTHETIC cover '+i),provenance:'SYNTHETIC known publication'}}));
 const intervals=['none','current'].includes(mode)?[]:mode==='next'?[{id:episodes[0].id,start_frame:300,end_frame:600}]:stageHistoryIntervals(900,episodes);
 const cfg={schema:'siounex-unified-case-v1',lower_slot_mode:mode,mechanism:'mechanism.json',font_profile:'fonts.json',layout_profile:profile,title:'SYNTHETIC approved title',approval:{script:true,audio:true,prepared_visual_timeline:true},body:{source,frames:900,source_rectangle:[0,0,1024,576],complete_source_confirmed:true},audio_master:audio,outro:{...outro,frames:119},captions,chapters:stageChapters(900),history:{mode:'single-round',label:'往期回顾',episodes,intervals},filmstrip:{enabled:mode==='current',samples:Array.from({length:6},(_,i)=>({frame:i*150,roi:[0,0,1024,576],thumbnail_only:true}))}};
 put('case.json',JSON.stringify(cfg));
 await build({entryPoints:[path.join(runtime,'render-v9.mjs')],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'actual-renderer.mjs'),logLevel:'silent',plugins:[{name:'isolated-media-tools',setup(b){
  b.onResolve({filter:/^(node:)?child_process$/},()=>({path:'child',namespace:'SYNTHETIC'}));
  b.onResolve({filter:/^sharp$/},()=>({path:'sharp',namespace:'SYNTHETIC'}));
  b.onResolve({filter:/[\\/]?title-layout\.mjs$/},()=>({path:'title',namespace:'SYNTHETIC'}));
  b.onResolve({filter:/[\\/]?concat-video\.mjs$/},()=>({path:'concat',namespace:'SYNTHETIC'}));
  b.onLoad({filter:/.*/,namespace:'SYNTHETIC'},args=>({contents:({child:childStub,sharp:sharpStub,title:titleStub,concat:concatStub})[args.path],loader:'js'}));
 }}]});
 const run=(start,seconds=1)=>{
  const name='preview-'+String(start).replace('.','-'),stdout=execFileSync(process.execPath,[path.join(root,'actual-renderer.mjs'),'case.json','--preview',String(start),String(seconds),'--out',name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:15000});
  const dir=path.join(root,name),report=JSON.parse(stdout.trim().split(/\r?\n/).at(-1)),calls=fs.readFileSync(path.join(root,'mock-tool-calls.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
  return{dir,graph:fs.readFileSync(path.join(dir,'filtergraph.txt'),'utf8'),report,calls,files:fs.readdirSync(dir)};
 };
 return{root,cfg,run};
}
function visibleCards(graph,localFrame){
 const result=[];const re=/\[p\d+\]\[h(\d+)\]overlay=[^;]+?:enable='gte\(\(n\+(\d+)\),(\d+)\)\*lt\(\(n\+(\d+)\),(\d+)\)'/g;
 for(const m of graph.matchAll(re)){assert.equal(m[2],m[4]);const globalFrame=localFrame+Number(m[2]);if(globalFrame>=Number(m[3])&&globalFrame<Number(m[5]))result.push(Number(m[1]));}
 return result;
}
function assertNoFilm(result){
 assert.doesNotMatch(result.graph,/\[film\]|\[head\]|clip\(1\.5-abs/);
 assert.ok(!result.files.some(n=>/^(?:film(?:-base)?\.png|thumb-\d+\.png|time-(?:start|end)\.txt)$/.test(n)));
 assert.ok(result.calls.every(c=>!c.args.some(a=>/(?:^|\/)(?:film(?:-base)?\.png|thumb-\d+\.png|time-(?:start|end)\.txt)$/.test(a))));
}

test('real history renderer covers opening, middle and tail with three cards and no fallback filmstrip',async t=>{
 const f=await fixture(t);
 for(const [start,card]of [[0,0],[14,1],[29,2]]){
  const r=f.run(start);assertNoFilm(r);assert.deepEqual(r.report.history_window,[0,30]);assert.deepEqual(r.report.global_body_range,[start,start+1]);assert.equal(r.report.rendered_frames,30);
  for(let frame=0;frame<30;frame++)assert.deepEqual(visibleCards(r.graph,frame),[card]);
  const main=r.calls.filter(c=>c.args.includes('-filter_complex_script')).at(-1),inputs=main.args.flatMap((arg,i)=>arg==='-i'?[main.args[i+1]]:[]);assert.equal(inputs.length,7);assert.deepEqual(inputs.slice(4).map(s=>path.basename(s)),['history-0.png','history-1.png','history-2.png']);
  assert.match(r.graph,/\[4:v\][^;]*\[h0\]/);assert.match(r.graph,/\[6:v\][^;]*\[h2\]/);
 }
 const full=f.run(0,30);for(let frame=0;frame<900;frame++)assert.deepEqual(visibleCards(full.graph,frame),[Math.floor(frame/300)]);
});

test('current mode alone generates six real-frame thumbnail requests, time labels and pointer overlay',async t=>{
 const f=await fixture(t,'current'),r=f.run(14);assert.match(r.graph,/\[film\]/);assert.match(r.graph,/\[content\]\[head\]overlay=/);assert.match(r.graph,/trim=start_frame=420:end_frame=450/);assert.match(r.graph,/\(T\+14\)/);
 assert.equal(r.files.filter(n=>/^thumb-\d+\.png$/.test(n)).length,6);for(const file of ['film-base.png','film.png','time-start.txt','time-end.txt'])assert.ok(r.files.includes(file));
 const thumbnailCalls=r.calls.filter(c=>c.exe==='ffmpeg'&&c.args.some(a=>/\/thumb-\d+\.png$/.test(a)));assert.equal(thumbnailCalls.length,6);assert.ok(thumbnailCalls.every(c=>c.args.includes('source.mkv')&&c.args.some(a=>a.startsWith('select=eq(n'))));
 const main=r.calls.find(c=>c.args.includes('-filter_complex_script'));assert.ok(main.args.some(a=>a.endsWith('/film.png')));assert.match(r.graph,/\[4:v\][^;]*\[film\]/);assert.deepEqual(visibleCards(r.graph,0),[]);assert.equal(r.report.TTS_calls,0);assert.equal(r.report.paid_calls,0);
});

test('next mode leaves lower slot blank outside its exact interval and never substitutes a filmstrip',async t=>{
 const f=await fixture(t,'next');
 for(const [start,expected]of [[0,[]],[14,[0]],[29,[]]]){const r=f.run(start);assertNoFilm(r);for(let frame=0;frame<30;frame++)assert.deepEqual(visibleCards(r.graph,frame),expected);}
});

test('none mode has no history, thumbnail or pointer layers even if stale sample descriptors are present',async t=>{
 const f=await fixture(t,'none'),r=f.run(14);assertNoFilm(r);assert.deepEqual(visibleCards(r.graph,0),[]);assert.equal(r.files.some(n=>/^history-\d+\.png$/.test(n)),false);const main=r.calls.find(c=>c.args.includes('-filter_complex_script'));assert.equal(main.args.filter(a=>a==='-i').length,4);
});

test('both new day/night templates render the v2 spacing and their actual card/brand palette through the real entry point',async t=>{
 for(const [theme,cardColor,brand]of [['morning-light-v1','#FCFCF8','6C8290'],['evening-dark-v2','#1c2d41','A3B1C6']]){
  const f=await fixture(t,'history',{theme,profile:NODE_STAGE_SPACED_PROFILE}),r=f.run(14),proof=JSON.parse(fs.readFileSync(path.join(r.dir,'history-0-layout-proof.json'),'utf8'));
  assert.match(r.graph,/overlay=28:474:/);assert.match(r.graph,/overlay=0:1228:/);assert.match(r.graph,/overlay=64:1304:/);
  assert.ok(r.graph.includes('fontsize=28:fontcolor=0x'+brand+':x=64:y=103'));
  assert.equal(proof.profile,NODE_STAGE_SPACED_PROFILE);assert.equal(proof.card.background,cardColor);assert.equal(proof.card.title.size,64);assert.equal(proof.card.description.size,48);
  assert.equal(r.report.template_runtime,theme);assert.equal(r.report.bottom_clearance_pixels,380);assertNoFilm(r);
 }
});
