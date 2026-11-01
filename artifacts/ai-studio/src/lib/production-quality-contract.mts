export const PRODUCTION_PRINCIPLES_VERSION='production-principles-v1';
export const PRODUCTION_PRINCIPLES=`制作与验收强制要求：本人旁白以1.15作为利落、有精神的参考，先确认原音频已有处理速度；当前完整实测正文音轨加固定原片尾及其他占时为60<T≤70秒时，不额外缩稿，可有依据地仅正文口播保音高额外提速，累计速度允许超过旧1.25／1.3默认上限并如实记录，不盲叠；T>70秒才缩稿，最终完整导出仍须≤60秒。原v5片尾全部119帧、1×原速与完整原声保留，BGM不随正文提速。保音高调速，删除无意义额外停顿，依实际词级时间重对齐字幕、镜头与嘴型。自然、完整断句和尾字优先；未真实试听不得称听过。往期默认最近已发布三期；按本次明确授权名单锁定真实历史ID及实际发布原标题，逐字保留，不改为简称。完整标题优先单行，放不下须改布局或完整换行，不缩成小字、不省略、不截断；章节完整可见，推荐标题/说明/封面间距有层级，并核验手机尺寸实际导出。保留已有模板的贯穿分隔渐进蒙版章节进度、本期缩略图与真实进度、和往期卡片同槽轮换，不能擅删组件或整套重设计。实演必须正常速度；原始FPS与输出FPS转换保持相同经过时间，不慢放/循环/重帧凑旁白。记录每段原片SHA、入出点、输出帧范围、倍速及相邻重复帧审计，对照实际导出源区域。剪去等待需明确说明，不能伪造零延迟。机器检查通过不等于审美、听审、版权、付费或发布批准。`;
const normalized=(s:string)=>s.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'');
const closing=/^[，,。.!！?？：:；;、）》」』”’]/u;
export function spokenBody(script:string,outroText?:string){const lines=script.split(/\r?\n/);return outroText&&lines.at(-1)===outroText?lines.slice(0,-1).join('\n'):script;}
export function captionIssues(cues:{start:number;end:number;text:string}[],script:string,bodySeconds:number){
 const problems:string[]=[];let end=0;
 if(!Array.isArray(cues)||!cues.length)return['Missing real caption timeline'];
 for(const [i,c]of cues.entries()){
  if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<end-.02||c.end<=c.start||c.end>bodySeconds+.04)problems.push('Caption timing differs at '+i);
  if(!normalized(c.text))problems.push('Standalone punctuation caption at '+i);
  if(closing.test(c.text.trim()))problems.push('Caption begins with orphan punctuation at '+i);
  const pairs=[['“','”'],['「','」'],['『','』']];for(const[a,b]of pairs)if(c.text.split(a).length!==c.text.split(b).length)problems.push('Quoted phrase split across captions at '+i);
  end=c.end;
 }
 if(normalized(cues.map(c=>c.text).join(''))!==normalized(script))problems.push('Caption text does not match locked script');
 return problems;
}
export function alignNarrationWords(words:{word:string;start:number;end:number}[],tempo:number,maxChars=14){
 if(!Number.isFinite(tempo)||tempo<.9||tempo>1.3)throw Error('Tempo requires a natural bounded choice');
 const cues:{start:number;end:number;text:string}[]=[],chunk:typeof words=[];let quoteDepth=0;
 function flush(){if(!chunk.length)return;const text=chunk.map(w=>w.word).join('');if(!normalized(text)){if(cues.length)cues.at(-1)!.text+=text;}else cues.push({start:chunk[0].start/tempo,end:Math.max(chunk[0].start/tempo+.15,chunk.at(-1)!.end/tempo),text});chunk.length=0;}
 for(const w of words.filter(w=>!/^<.*>$/.test(w.word))){if(!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end<w.start)throw Error('Invalid actual word timing');if(chunk.length&&chunk.map(w=>w.word).join('').length+w.word.length>maxChars&&!quoteDepth&&!closing.test(w.word)&&normalized(w.word))flush();chunk.push(w);for(const c of w.word){if('“「『'.includes(c))quoteDepth++;if('”」』'.includes(c))quoteDepth=Math.max(0,quoteDepth-1);}if(/[。？！]$/.test(w.word)&&!quoteDepth)flush();}
 flush();return cues;
}
export function expectedProductionHistory(job:any){
 // A task-specific oral direction is evidence only, never a website click.
 const explicit=(job.reviews||[]).filter((r:any)=>r.decision==='explicit_user_media_revision'&&r.revision===job.revision).map((r:any)=>({...JSON.parse(r.note),review_id:r.id})).find((r:any)=>r.mode_epoch===job.mode_epoch&&Array.isArray(r.recents));
 const locked=explicit?.recents||job.series?.current?.history?.selected,available=job.series?.available_history;
 if(!Array.isArray(locked)||locked.length>3)throw Error('Missing authorized publication snapshot');
 if(locked.length<3&&available?.catalog_verified!==true)throw Error('Fewer than three works requires a verified complete publication catalog');
 const catalog=[...(available?.records||[]),...(available?.selected||[])];
 for(const p of locked)if(!catalog.some((c:any)=>c.id===p.id&&c.title===p.title))throw Error('Publication ID/title changed; obtain explicit current selection');
 if(!explicit&&available?.selected&&JSON.stringify(locked.map((p:any)=>p.id))!==JSON.stringify(available.selected.map((p:any)=>p.id)))throw Error('Latest published selection changed; do not silently replace locked history');
 return locked.map((p:any)=>({id:p.id,title:p.title}));
}
export function qualityManifestIssues(m:any,c:{script_hash:string;script:string;history:{id:string;title:string}[];job_id?:string;mode_epoch?:number;outro_pin?:any}){
 const p:string[]=[];const add=(ok:unknown,message:string)=>{if(!ok)p.push(message)};
 add(m?.schema==='production-quality-input-v1','Missing production quality input schema');if(!m)return p;
 add(m.binding?.script_hash===c.script_hash,'Quality evidence belongs to another script');
 if(c.job_id)add(m.binding?.job_id===c.job_id&&m.binding?.mode_epoch===c.mode_epoch,'Quality evidence belongs to another job/mode');
 add(JSON.stringify(m.history)===JSON.stringify(c.history),'History IDs or exact publication titles differ');
 add(m.narration?.prior_tempo===1&&Array.isArray(m.narration?.applied_factors)&&m.narration.applied_factors.length===1&&m.narration.applied_factors[0]===m.narration.tempo,'Unknown prior tempo or stacked tempo');
 add(m.narration?.tempo>=.9&&m.narration?.tempo<=1.3&&m.narration?.tempo_reference===1.15,'Missing natural tempo/reference');
 add(typeof m.narration?.choice_reason==='string'&&m.narration.choice_reason.trim(),'Tempo choice needs a reason; reference is not forced');
 add(m.narration?.pitch_preserving===true,'Pitch-preserving audio processing required');
 add(Number.isFinite(m.body_seconds)&&Number.isFinite(m.narration?.raw_seconds)&&m.body_seconds-m.narration.raw_seconds/m.narration.tempo>=-.02&&m.body_seconds-m.narration.raw_seconds/m.narration.tempo<=.15,'Extra silence or voice-tail truncation');
 if(c.outro_pin)add(m.narration?.outro?.sha256===c.outro_pin.sha256&&m.narration?.outro?.frames===c.outro_pin.frames&&m.narration?.outro?.version==='v5','Current production must bind the selected actual v5 outro original');
 add(m.narration?.music_speed===1&&m.narration?.outro_speed===1,'Independent music/outro must retain speed');
 add(Array.isArray(m.sources)&&m.sources.length>0,'Missing source time map');let next=0;
 for(const s of m.sources||[]){add(s.rate===1&&s.output_start_frame===next&&Number.isInteger(s.frames)&&s.frames>0&&Math.abs(s.source_end-s.source_start-s.frames/m.output_fps)<=1/m.output_fps,'Source slowdown/gap or time-map mismatch');next+=s.frames;}
 add(Math.abs(next/m.output_fps-m.body_seconds)<=1/m.output_fps,'Source ranges do not cover body');
 add(m.wait_edit?.removed!==true||typeof m.wait_edit.visible_label==='string'&&m.wait_edit.visible_label.trim().length>0,'Edited waiting must be disclosed');
 add(m.layout?.canvas?.[0]===1080&&m.layout?.canvas?.[1]===1920&&m.layout?.phone_width===360,'Actual phone layout required');
 const kinds=(m.layout?.components||[]).map((e:any)=>e.kind);for(const k of['chapter-progress','filmstrip-progress',...(c.history.length?['history-rotation']:[])])add(kinds.includes(k),'Original template component missing: '+k);
 add(Array.isArray(m.layout?.text)&&m.layout.text.length>0,'Missing full-title/chapter layout measurements');
 for(const h of c.history)add(m.layout?.text?.some((t:any)=>t.role==='history'&&t.history_id===h.id&&t.text===h.title),'Missing exact full history title: '+h.id);
 add(m.layout?.text?.some((t:any)=>t.role==='title')&&m.layout?.text?.some((t:any)=>t.role==='chapter'),'Missing title/chapter measurements');
 if(c.history.length)add(m.layout?.cover_size?.[1]>=180&&Math.abs(m.layout.cover_size[0]/m.layout.cover_size[1]-.75)<.01,'History cover must retain clear portrait size/proportions');
 for(const t of m.layout?.text||[]){add(Array.isArray(t.lines)&&t.lines.join('')===t.text,'Truncated or rewritten layout text');add(t.role!=='history'||c.history.some(h=>h.id===t.history_id&&h.title===t.text),'Displayed history title differs');add(t.font_size>=({chapter:36,history:48,caption:66,title:72}as Record<string,number>)[t.role],'Phone text too small');add(t.x>=0&&t.y>=0&&t.width>0&&t.height>0&&t.x+t.width<=1080&&t.y+t.height<=1540,'Layout exceeds safe bounds');}
 add(m.layout?.history_header_gap>=32,'History label and title collide');
 return p;
}
export function qualityReceiptIssues(job:any,operation:any,artifact:any,receipt:any){
 if(job.is_test||job.id==='job_e13e8b19-aa0a-4840-abc9-333eefc91b05'||operation.node!=='video')return[];
 const plan=JSON.parse(operation.plan),p:string[]=[],r=artifact?.qa?.production_principles,ref=plan.inputs.find((i:any)=>i.role==='production_quality');
 if(!(ref? r?.manifest_file_sha256===ref.sha256:r?.evidence_stage==='post-render'&&r?.operation_input_hash===operation.input_hash&&r?.job_id===job.id&&r?.mode_epoch===operation.mode_epoch&&/^[a-f0-9]{64}$/.test(r?.manifest_file_sha256))||r?.schema!=='actual-production-principles-qa-v1'||r.principles_version!==PRODUCTION_PRINCIPLES_VERSION||r.machine_checks_passed!==true||r.quality_approved!==false||r.publication!==false||r.video_sha256!==artifact.sha256||r.script_hash!==operation.script_hash||!Array.isArray(r.issues)||r.issues.length)p.push('Missing matching actual four-principle QA report');
 // The operation freezes the selected original. A later default must not rewrite an old operation.
 const outroPin=plan.outro_binding;if(outroPin&&(outroPin.schema!=='operation-outro-binding-v1'||!['v5','v6'].includes(outroPin.version)||outroPin.frames!==119||outroPin.fps!==30||!plan.inputs.some((i:any)=>i.role==='outro'&&i.sha256===outroPin.sha256)||r?.checks?.outro?.source_sha256!==outroPin.sha256||r?.checks?.outro?.frames!==outroPin.frames||r?.checks?.outro?.fps!==30))p.push('Frozen v5 outro lacks exact original SHA/frame QA');
 if(r){try{if(JSON.stringify(r.history)!==JSON.stringify(expectedProductionHistory(job)))p.push('Quality history binding became stale');}catch(e){p.push((e as Error).message);}if(!r.checks?.sources?.length||!r.checks?.narration||!r.checks?.layout?.length||!r.checks?.components?.length)p.push('Quality report has empty checks');}
 return p;
}
