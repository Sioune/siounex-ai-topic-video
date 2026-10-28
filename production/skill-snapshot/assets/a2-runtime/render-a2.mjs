import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Local rendering only. This program never calls narration, avatar or cloud services.
// Inputs must be approved, materialized local files with the registry hashes.
const args=process.argv.slice(2),configPath=path.resolve(args[0]||'render-config.json');
const cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));
process.chdir(path.dirname(configPath));
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ff=a=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error',...a],{windowsHide:true,maxBuffer:10000000});
const probe=f=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',f],{encoding:'utf8',windowsHide:true,maxBuffer:10000000}));
const esc=f=>f.replaceAll('\\','/').replaceAll(':','\\:').replaceAll("'","\\'");
const ensure=(ok,msg)=>{if(!ok)throw Error(msg);};
ensure(cfg.template==='siounex-a2-silver-history-v1','Unknown template version');
ensure(cfg.approval.layout===true&&cfg.approval.script===true&&cfg.approval.audio===true,'Bind an approved layout, script and audio before rendering');
ensure(cfg.next_episode?.visible===false,'This approved template has no next-episode teaser');
ensure(cfg.history.length>=1&&cfg.history.length<=3,'Use 1–3 genuine published past episodes');
const inputs=[cfg.body,cfg.audio_master,cfg.outro,cfg.background,...cfg.history.map(x=>x.cover)];
for(const i of inputs){ensure(fs.existsSync(i.path),'Missing local input: '+i.path);ensure(sha(i.path)===i.sha256,'Input hash mismatch: '+i.path);}
for(const font of Object.values(cfg.fonts))ensure(fs.existsSync(font.path)&&sha(font.path)===font.sha256,'Font missing or changed: '+font.family+'; bind a locally verified compatible font explicitly');
const outroFrames=cfg.outro.frames??120;ensure([119,120].includes(outroFrames),'Bind actual 119-frame v5 or legacy 120-frame outro');
const v=probe(cfg.body.path).streams.find(x=>x.codec_type==='video'),ov=probe(cfg.outro.path).streams.find(x=>x.codec_type==='video');
ensure(v.r_frame_rate==='30/1'&&Number(v.nb_frames)===cfg.body.frames,'Body must be the approved 30 fps frame sequence');
ensure(Number(ov.nb_frames)===outroFrames&&ov.width===1080&&ov.height===1920,'Outro must match the exact pinned original frame sequence');
const [cx,cy,cw,ch]=cfg.body.complete_source_plane;
ensure(cx>=0&&cy>=0&&cx+cw<=v.width&&cy+ch<=v.height&&Math.abs(cw/ch-16/9)<1e-8,'Source plane must contain the complete horizontal source; cropping a story to fill is forbidden');
ensure(cfg.body.complete_content_confirmed===true,'Full source content confirmation is required');
const dur=cfg.body.frames/30,clauses=JSON.parse(fs.readFileSync(cfg.alignment,'utf8')).alignment;
ensure(clauses.every(x=>typeof x.text==='string'&&x.start>=0&&x.end>x.start&&x.end<=dur+.01),'Invalid approved caption alignment');
for(const episode of cfg.history)ensure(episode.published_confirmed===true&&episode.title&&episode.lookpoint&&episode.cover.provenance,'Every history card needs title, lookpoint and actual asset provenance');
if(args.includes('--check')){console.log(JSON.stringify({inputs_verified:true,body_frames:cfg.body.frames,history_cards:cfg.history.length,paid_calls:0}));process.exit(0);}
const root=cfg.output_dir||'rendered';ensure(!path.isAbsolute(root)&&!root.split(/[\\/]/).includes('..'),'Output must stay under the config directory');fs.mkdirSync(root,{recursive:true});
const L=cfg.layout,write=(f,s)=>fs.writeFileSync(root+'/'+f,s),font=(x)=>`fontfile='${esc(cfg.fonts[x].path)}'`;
write('title.txt',cfg.title);write('module-label.txt',cfg.module_label);
for(let n=0;n<cfg.history.length;n++){
 const h=cfg.history[n];write('history-'+n+'-title.txt',h.title);write('history-'+n+'-lookpoint.txt',h.lookpoint);
 const lookY=h.title.includes('\n')?216:154;
 const f=`[0:v]scale=240:320:force_original_aspect_ratio=decrease,pad=240:320:(ow-iw)/2:(oh-ih)/2:color=0xEAF1F6,setsar=1,format=rgba[cover];color=c=black@0.0:s=1024x348:r=30,format=rgba[base];[base][cover]overlay=x=24:y=8:format=auto,drawtext=${font('bold')}:textfile='${esc(root)}/history-${n}-title.txt':fontsize=50:fontcolor=0x223542:line_spacing=12:x=318:y=48,drawtext=${font('regular')}:textfile='${esc(root)}/history-${n}-lookpoint.txt':fontsize=36:fontcolor=0x516875:x=318:y=${lookY},format=rgba[card]`;
 ff(['-i',h.cover.path,'-filter_complex',f,'-map','[card]','-frames:v','1','-update','1','-y',root+'/card-'+n+'.png']);
}
const assTime=t=>{const n=Math.round(t*100);return `${Math.floor(n/360000)}:${String(Math.floor(n/6000)%60).padStart(2,'0')}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`;};
const header=`[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,${cfg.fonts.regular.family},${L.caption.normal_size},&H003E3120&,&H003E3120&,&H00000000&,&H00000000&,0,0,0,0,100,100,1,0,1,0,0,2,76,76,788,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
const style=t=>/^\d+辆/.test(t)?`{\\an2\\pos(${L.caption.x},${L.caption.y})\\fn${cfg.fonts.numeric.family}\\fs${L.caption.numeric_size}\\c&H88691F&}${t.match(/^\d+/)[0]}{\\fn${cfg.fonts.regular.family}\\fs${L.caption.suffix_size}\\c&H3E3120&}${t.replace(/^\d+/,'')}`:`{\\an2\\pos(${L.caption.x},${L.caption.y})}${t}`;
write('captions.ass',header+clauses.map(x=>`Dialogue: 0,${assTime(x.start)},${assTime(x.end)},Caption,,0,0,0,,${style(x.text)}`).join('\n')+'\n');
const events=[],P=cfg.carousel.protected_ranges,H=cfg.history.length,T=cfg.carousel.transition_seconds;
let t=cfg.carousel.opening_static_seconds,k=0;
while(H>1&&t+T<dur){const hit=P.find(([a,b])=>t<b&&t+T>a);if(hit){t=hit[1]+.02;continue;}events.push({start:t,end:t+T,from:k%H,to:(k+1)%H});k++;t+=T+cfg.carousel.hold_seconds;}
const ease=e=>{const q=`min(max((t-${e.start})/${T},0),1)`;return `(3*pow(${q},2)-2*pow(${q},3))`;};
const pos=i=>{const build=n=>{if(n===events.length)return i===0?'0':'348';const e=events[n],E=ease(e),during=e.from===i?`-348*${E}`:e.to===i?`348*(1-${E})`:'348',before=n===0?(i===0?'0':'348'):(events[n-1].to===i?'0':'348');return `if(lt(t,${e.start}),${before},if(lt(t,${e.end}),${during},${n+1===events.length?(e.to===i?'0':'348'):build(n+1)}))`;};return build(0);};
const f=[`[0:v]setpts=N/(30*TB),crop=${cw}:${ch}:${cx}:${cy},scale=${L.source.width}:${L.source.height}:flags=lanczos,setsar=1[real]`,`[1:v]setpts=PTS-STARTPTS,format=rgba[bg]`];
for(let i=0;i<H;i++)f.push(`[${i+2}:v]setpts=PTS-STARTPTS,format=rgba[c${i}]`);
f.push('color=c=black@0.0:s=1024x348:r=30,format=rgba[w0]');for(let i=0;i<H;i++)f.push(`[w${i}][c${i}]overlay=x=0:y='${pos(i)}':format=auto[w${i+1}]`);
f.push(`[bg][real]overlay=x=${L.source.x}:y=${L.source.y}:shortest=0[main]`,`[main][w${H}]overlay=x=${L.history.x}:y=${L.history.y}:shortest=0,drawtext=${font('bold')}:textfile='${esc(root)}/title.txt':fontsize=${L.title.size}:fontcolor=0x20313E:x=${L.title.x}:y=${L.title.y},drawtext=${font('regular')}:textfile='${esc(root)}/module-label.txt':fontsize=38:fontcolor=0x486477:x=64:y=1254,ass='${esc(root)}/captions.ass',fps=30:start_time=0,format=yuv420p[out]`);
write('filtergraph.txt',f.join(';'));
const inputsFF=['-i',cfg.body.path,'-loop','1','-framerate','30','-i',cfg.background.path];for(let i=0;i<H;i++)inputsFF.push('-loop','1','-framerate','30','-i',root+'/card-'+i+'.png');
const smoke=args.includes('--smoke');
ff([...inputsFF,'-filter_complex_script',root+'/filtergraph.txt','-map','[out]','-frames:v',String(smoke?90:cfg.body.frames),'-an','-c:v','libx264','-preset','veryfast','-crf','19','-r','30','-y',root+'/body-visual.mp4']);
const renderedFrames=Number(probe(root+'/body-visual.mp4').streams[0].nb_frames);ensure(renderedFrames===(smoke?90:cfg.body.frames),'Rendered frame count failed');
if(smoke){ff(['-i',root+'/body-visual.mp4','-frames:v','1','-update','1','-y',root+'/first-frame.png']);write('smoke-qa.json',JSON.stringify({frames:renderedFrames,inputs_verified:true,paid_calls:0,sha256:sha(root+'/body-visual.mp4')},null,2));console.log('90-frame local template smoke export completed');process.exit(0);}
write('concat.txt',`file 'body-visual.mp4'\nfile '${path.resolve(cfg.outro.path).replaceAll('\\','/')}'\n`);
ff(['-f','concat','-safe','0','-i',root+'/concat.txt','-an','-c:v','copy','-y',root+'/full-visual.mp4']);
const target=root+'/full-review.mp4';ff(['-itsoffset',String(cfg.audio_master.original_video_start),' -i'.trim(),root+'/full-visual.mp4','-i',cfg.audio_master.path,'-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart','-y',target]);
ff(['-i',target,'-frames:v','1','-update','1','-y',root+'/first-frame.png']);ff(['-i',target,'-t','3','-vf','setpts=PTS-STARTPTS','-frames:v','90','-c:v','libx264','-preset','veryfast','-crf','19','-c:a','aac','-b:a','160k','-movflags','+faststart','-y',root+'/first-three-seconds.mp4']);
const packets=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=data_hash,pts_time,duration_time','-of','json',file],{encoding:'utf8',windowsHide:true,maxBuffer:10000000})).packets;
const frameHashes=(file,filter)=>ff(['-i',file,...(filter?['-vf',filter]:[]),'-an','-f','framemd5','-']).toString().split('\n').filter(x=>x&&!x.startsWith('#')).map(x=>x.split(',').at(-1).trim());
const checks={full_decode:!!ff(['-i',target,'-f','null','-']),audio_packets_and_timestamps_unchanged:JSON.stringify(packets(target))===JSON.stringify(packets(cfg.audio_master.path)),outro_decoded_frames_unchanged:JSON.stringify(frameHashes(target,`trim=start_frame=${cfg.body.frames},setpts=PTS-STARTPTS`))===JSON.stringify(frameHashes(cfg.outro.path)),total_frames:Number(probe(target).streams.find(x=>x.codec_type==='video').nb_frames)===cfg.body.frames+outroFrames};
ensure(Object.values(checks).every(Boolean),'Final media preservation QA failed');
write('render-receipt.json',JSON.stringify({template:cfg.template,config_sha256:sha(path.basename(configPath)),file:target,sha256:sha(target),duration:Number(probe(target).format.duration),checks,carousel_events:events,paid_calls:0,narration_calls:0,muted_player_check_pending:true,listened:false,full_export_owner_approval_pending:true,public_publication:false},null,2));console.log(JSON.stringify({rendered:target,sha256:sha(target),checks}));
