import fs from 'node:fs';
import path from 'node:path';
import {motionCanonical,motionSha,CONTENT_MOTION_POLICY as policy} from '../lib/content-motion-contract.mts';
import {command as defaultCommand,probe as defaultProbe} from './media-adapter.mjs';
const fail=code=>{throw Object.assign(Error(code),{code})};
const escapeFilter=s=>String(s).replaceAll('\\','/').replaceAll(':','\\:').replaceAll("'","\\'");
const sameFile=(file,sha)=>{if(fs.lstatSync(file).isSymbolicLink()||motionSha(fs.readFileSync(file))!==sha)fail('MOTION_SOURCE_BYTES_CHANGED');return file;};
const inside=(base,file)=>{const p=path.relative(base,file);return !!p&&!path.isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+path.sep)};
export function validatedIllustrativeMechanism(media,script){
 const v=media?.illustrative_mechanism;if(!v)return null;
 if(v.schema!=='grounded-process-illustration-v1'||v.source_sha256!==media.sha256||v.script_sha256!==motionSha(script)||!Array.isArray(v.grounded_excerpts)||!v.grounded_excerpts.length||v.grounded_excerpts.some(s=>typeof s!=='string'||s.length<4||!script.includes(s))||!Array.isArray(v.states)||v.states.length<3||v.states.length>8||v.states.some(s=>typeof s!=='string'||!s.trim())||v.illustrative!==true)fail('MOTION_MECHANISM_FACT_BINDING_REQUIRED');
 return v;
}
function put(file,bytes){const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(typeof bytes==='string'?bytes:JSON.stringify(bytes,null,2));if(fs.existsSync(file)){if(motionSha(fs.readFileSync(file))!==motionSha(b))fail('MOTION_IMMUTABLE_CACHE_CHANGED');}else fs.writeFileSync(file,b,{flag:'wx'});return file;}

export function validateMechanism(recipe,script){
 if(recipe?.type!=='process-flow'||!Array.isArray(recipe.nodes)||recipe.nodes.length<3||recipe.nodes.length>5||new Set(recipe.nodes).size!==recipe.nodes.length||recipe.nodes.some(n=>typeof n!=='string'||!n.trim()||Array.from(n).length>Math.min(8,Math.floor((Math.floor(880/recipe.nodes.length)-40)/24)))||typeof recipe.grounded_excerpt!=='string'||!script.includes(recipe.grounded_excerpt)||recipe.grounded_excerpt.length<8||recipe.nodes.some(n=>!recipe.grounded_excerpt.includes(n)))fail('MOTION_MECHANISM_FACT_BINDING_REQUIRED');
 if(/口播(?:重点|要点)|本段总结|内容提要/.test(recipe.nodes.join(' ')))fail('MOTION_TEXT_CARD_FORBIDDEN');
 // Grounded labels establish a text quote, not a visual mechanism. The former
 // renderer only highlighted word boxes and moved a dot along connectors; the
 // actual exports repeatedly failed semantic inspection. Do not compile that
 // template, even when all words occur in the approved script. A future named
 // animation must describe and verify its subject, relationship and outcome.
 fail('MOTION_MECHANISM_SPECIFIC_VISUAL_REQUIRED');
}

async function renderMechanism(recipe,file,frames,dir,{command,font,pacing_frames=frames}){
 const nodes=recipe.nodes,count=nodes.length,width=Math.floor(880/count),x0=72,y=230,seconds=frames/30,paceSeconds=Math.min(seconds,pacing_frames/30);
 const filters=[];
 for(let i=0;i<count;i++){
  const fontSize=Math.min(30,Math.floor((width-45)/Array.from(nodes[i]).length)),x=x0+i*width,start=paceSeconds*i/count,end=i===count-1?seconds:paceSeconds*(i+1)/count,label=put(path.join(dir,'node-'+i+'.txt'),nodes[i]);
  filters.push(`drawbox=x=${x}:y=${y}:w=${width-25}:h=110:color=0x17344c:t=fill`,`drawbox=x=${x}:y=${y}:w=${width-25}:h=110:color=0x00b8e6:t=5:enable='between(t,${start},${end})'`,`drawtext=fontfile='${escapeFilter(font)}':textfile='${escapeFilter(label)}':fontsize=${fontSize}:fontcolor=white:x=${x+8}:y=${y+38}`);
  if(i<count-1){
   filters.push(`drawbox=x=${x+width-22}:y=${y+52}:w=22:h=5:color=0x6c829b:t=fill`);
   for(let step=0;step<5;step++){const a=start+(end-start)*step/5,b=start+(end-start)*(step+1)/5;filters.push(`drawbox=x=${x+width-24+step*5}:y=${y+45}:w=9:h=18:color=0x00e5ff:t=fill:enable='between(t,${a},${b})'`);}
  }
 }
 const lastCenter=x0+(count-1)*width+Math.floor((width-25)/2),lastStart=paceSeconds*(count-1)/count,lastSpan=seconds-lastStart;
 filters.push(`drawbox=x=${lastCenter-76}:y=416:w=152:h=108:color=0x17344c:t=fill`,`drawbox=x=${lastCenter-76}:y=416:w=152:h=108:color=0x6c829b:t=2`,`drawbox=x=${lastCenter-2}:y=340:w=4:h=76:color=0x6c829b:t=fill`,`drawtext=fontfile='${escapeFilter(font)}':text='●':fontsize=44:fontcolor=0x00d9f5:x=${lastCenter-17}:y='342+((t-${lastStart})/${lastSpan})*60':enable='between(t,${lastStart},${seconds})'`);
 for(let row=0;row<5;row++){const shown=lastStart+lastSpan*(row+.25)/5;filters.push(`drawbox=x=${lastCenter-58}:y=${428+row*17}:w=${72+row*8}:h=10:color=0x00d9f5:t=fill:enable='gte(t,${shown})'`);}
 const resultLabel=put(path.join(dir,'result-label.txt'),'示意结果');filters.push(`drawtext=fontfile='${escapeFilter(font)}':textfile='${escapeFilter(resultLabel)}':fontsize=18:fontcolor=0x94b6cb:x=${lastCenter-40}:y=535`);
 const label=put(path.join(dir,'illustration-label.txt'),'机制示意');filters.push(`drawtext=fontfile='${escapeFilter(font)}':textfile='${escapeFilter(label)}':fontsize=24:fontcolor=0x94b6cb:x=40:y=40`);
 await command('ffmpeg',['-nostdin','-hide_banner','-v','error','-f','lavfi','-i',`color=c=0x091827:s=1024x576:r=30:d=${seconds}`,'-vf',filters.join(','),'-frames:v',String(frames),'-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-video_track_timescale','30000','-n',file],180000);
}

// Build a parent narration segment from many shots at normal source speed.
// The derived MP4 retains its complete original-shot recipe; QA counts those
// originals, never the fact that a slideshow was encoded into a video container.
export async function compileMotionSequence({shots,task_index,jobDir,script,source_media,frames,pacing_frames=frames,human_review=false},{command=defaultCommand,probe=defaultProbe,font}={}){
 const base=fs.realpathSync(jobDir);if(!Array.isArray(shots)||!shots.length||shots.length>policy.maximum_shots||shots.reduce((n,s)=>n+s.frames,0)!==frames)fail('MOTION_PARENT_DURATION_CHANGED');
 const recipe=shots.map(s=>{
  if(!Number.isSafeInteger(s.frames)||s.frames<1)fail('MOTION_SHOT_DURATION_INVALID');
  if(s.kind==='mechanism'){const mechanism=validateMechanism(s.mechanism,script);return {...s,mechanism,source_sha256:motionSha(mechanism),source_available_frames:s.frames,source_start_frame:0};}
  const m=source_media.find(m=>m.asset_id===s.asset_id);if(!m||!['image','video'].includes(m.kind)||!inside(base,fs.realpathSync(m.file)))fail('MOTION_UNKNOWN_SOURCE');
  sameFile(m.file,m.sha256);if(s.kind==='image'&&m.kind!=='image'||s.kind!=='image'&&m.kind!=='video')fail('MOTION_SOURCE_FORM_CHANGED');
  if(!human_review&&s.kind==='image'&&s.frames>policy.maximum_single_still_frames)fail('MOTION_STILL_TOO_LONG');
  const available=m.kind==='video'?Math.floor((m.video_review?.duration_seconds||m.probe?.duration_seconds||0)*30):s.frames;
  if(!Number.isSafeInteger(s.source_start_frame)||s.source_start_frame<0||s.source_start_frame+s.frames>available)fail('MOTION_SOURCE_RANGE_TOO_SHORT');
  const illustration=m.kind==='video'?validatedIllustrativeMechanism(m,script):null;
  return {...s,source_sha256:m.sha256,source_file:m.file,source_url:m.source_url||m.url,source_available_frames:available,source_start_frame:m.kind==='image'?0:s.source_start_frame,source_context:m.source_context||null,...(illustration?{illustrative_mechanism:illustration}:{})};
 });
 const identity=motionSha({compile_contract:'frame-index-range-v2',policy:policy.id,implementation:motionSha(fs.readFileSync(new URL(import.meta.url))),task_index,recipe,frames,pacing_frames}),dir=path.join(base,'content-motion','compiled',identity);fs.mkdirSync(dir,{recursive:true});
 const output=path.join(dir,'sequence.mp4'),receiptFile=path.join(dir,'sequence-receipt.json'),intent=path.join(dir,'started.json');
 if(fs.existsSync(receiptFile)){
  const r=JSON.parse(fs.readFileSync(receiptFile));if(r.identity!==identity||r.sha256!==motionSha(fs.readFileSync(output))||r.frames!==frames)fail('MOTION_COMPILED_CACHE_CHANGED');return {...r,file:output};
 }
 if(fs.existsSync(intent))fail('MOTION_COMPILE_RESULT_RECONCILIATION_REQUIRED');put(intent,{identity,started_at:new Date().toISOString(),new_speech_calls:0});
 try{
  const parts=[];for(const [i,s]of recipe.entries()){
   const file=path.join(dir,'part-'+i+'.mp4');
   if(s.kind==='mechanism'){
    const profile=JSON.parse(fs.readFileSync(new URL('../production/unified-runtime/font-profile-windows.json',import.meta.url))),art=path.join(dir,'mechanism-'+i);fs.mkdirSync(art,{recursive:true});await renderMechanism(s.mechanism,file,s.frames,art,{command,font:font||profile.regular.path,pacing_frames:Math.max(1,Math.round(s.frames*pacing_frames/frames))});
   }else{
    const input=s.kind==='image'?['-loop','1','-framerate','30','-i',s.source_file]:['-i',s.source_file];
    // Normalize the original timeline before exact frame trimming. Input -ss
    // can drop late GIF/VFR frames; no loop, tail padding or speed change is used.
    const range=s.kind==='image'?'fps=30':`fps=30,trim=start_frame=${s.source_start_frame}:end_frame=${s.source_start_frame+s.frames},setpts=PTS-STARTPTS`;
    await command('ffmpeg',['-nostdin','-hide_banner','-v','error',...input,'-vf',range+',scale=1024:576:force_original_aspect_ratio=decrease,pad=1024:576:(ow-iw)/2:(oh-ih)/2:color=0x091827,setsar=1','-frames:v',String(s.frames),'-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-video_track_timescale','30000','-n',file],180000);
   }
   const p=await probe(file),v=p.streams?.find(s=>s.codec_type==='video');if(!v||Number(v.nb_frames)!==s.frames||v.r_frame_rate!=='30/1')fail('MOTION_COMPILED_PART_TIMING_CHANGED');parts.push(file);
  }
  const list=put(path.join(dir,'concat.txt'),parts.map(f=>"file '"+f.replaceAll('\\','/').replaceAll("'","'\\''")+"'").join('\n'));
  await command('ffmpeg',['-nostdin','-hide_banner','-v','error','-f','concat','-safe','0','-i',list,'-c:v','copy','-an','-video_track_timescale','30000','-n',output],180000);
  const p=await probe(output),v=p.streams?.find(s=>s.codec_type==='video');if(!v||Number(v.nb_frames)!==frames||v.r_frame_rate!=='30/1'||p.streams.some(s=>s.codec_type==='audio'))fail('MOTION_COMPILED_TIMING_CHANGED');
  const result={schema:'verified-content-motion-sequence-v1',identity,asset_id:'motion_sequence_'+identity,kind:'video',sha256:motionSha(fs.readFileSync(output)),size_bytes:fs.statSync(output).size,frames,duration_seconds:frames/30,source_url:'https://siounex-ai-topic-library.siounexzhao.chatgpt.site/production',source_kind:'edited-source-sequence',rights_status:'original-source-rights-preserved',task_index,shots:recipe,recipe_sha256:motionSha(recipe),new_speech_calls:0,source_speed:1,quality_approved:false};put(receiptFile,result);return {...result,file:output};
 }catch(error){put(path.join(dir,'known-failure.json'),{identity,finished_at:new Date().toISOString(),code:error.code||error.message,output_present:fs.existsSync(output),new_speech_calls:0});throw error;}
}

export function projectMotionShots(project){
 const result=[];for(const parent of project.source_to_timeline||[]){
  const recipe=parent.media?.content_motion_sequence;if(!recipe)return null;
  let cursor=parent.start_frame,skip=Math.round((parent.media.start_seconds||0)*30);
  for(const s of recipe.shots){
   if(skip>=s.frames){skip-=s.frames;continue;}if(cursor===parent.end_frame)break;
   const offset=skip,end=cursor+Math.min(s.frames-offset,parent.end_frame-cursor);skip=0;
   result.push({index:result.length,task_index:parent.index,actual_case_required:recipe.actual_case_required===true,...(recipe.silent_closing===true?{silent_closing:true}:{}),start_frame:cursor,end_frame:end,kind:s.kind,source_sha256:s.source_sha256,content_identity:s.content_identity||s.source_sha256,source_start_frame:s.source_start_frame+offset,source_available_frames:s.source_available_frames,rate:1,role:s.role,relevance:s.relevance,visible_content:s.visible_content,supports_narration:s.supports_narration,text_only:false,hook:s.hook===true,hook_reprise:s.hook_reprise===true,...(s.kind==='mechanism'?{mechanism_recipe_sha256:motionSha(s.mechanism),mechanism_state_changes:s.mechanism.nodes.length-1,illustrative:true}:s.illustrative_mechanism?{mechanism_recipe_sha256:motionSha(s.illustrative_mechanism),mechanism_state_changes:s.illustrative_mechanism.states.length-1,illustrative:true}:{})});cursor=end;
  }
  if(cursor!==parent.end_frame)fail('MOTION_SOURCE_RANGE_TOO_SHORT');
 }
 return result;
}
