// Shared geometry from the owner-selected native DeepSeek stage and history A
// card. Project IDs are provenance only; placement never branches on a job.
export const NODE_STAGE_PROFILE='approved-node-stage-v1';
export const LOWER_SLOT_LAYOUT_VERSION='explicit-history-lower-slot-v2';
export const NODE_STAGE_LAYOUT={
 canvas:[1080,1920],title:{x:64,y:150,size:110,max_lines:2,max_width:948},
 source:{x:28,y:490,width:1024,height:576},caption:{x:540,y:1128,normal_size:76},
 chapter:{x:0,y:1220,width:1080,height:62},filmstrip:{x:64,y:1370,width:952,height:96},
 history:{x:64,y:1304,width:952,height:236},minimum_bottom_clearance:380,
 history_card:{width:952,height:236,radius:20,background:'#1c2d41',border:'#8295ad',cover:{x:3,y:3,width:304,height:228,radius:16},copy:{x:335,y:17,width:600},label:{size:30,y:17,height:40},title:{size:64,y:69,height:77},description:{size:48,y:158,height:58},counter:{size:30,y:17,right:935},accent:{x:335,y:25,width:4,height:24},text:'#eff2ee',muted:'#bcc8d7',accent_color:'#ffc29c',counter_color:'#91a0b5'},
 reference:{kind:'owner-approved-native-layout',project_id:'572a8ac4-4945-4367-b378-e3d679be535a',timeline_id:'54f55fda-4672-4c3f-8c2f-414304a8949c',history_asset_id:'377d4620-9b34-4345-be3e-08c18e7210b6',source:'history-redesign-20261019/A-implementation-manifest.json and deepseek/native-edit-receipts.json'}
};
const tokens=text=>String(text).match(/[A-Za-z0-9][A-Za-z0-9._+'’/-]*|\s+|[^\s]/gu)||[];
const weight=text=>Array.from(text).reduce((n,c)=>n+(/[\x00-\x7f]/.test(c)?.55:1),0);
/** A display heading is distinct from the complete immutable editorial title. */
export function stageDisplayTitle(title,shortTitle,maxUnits=16){
 const supplied=typeof shortTitle==='string'?shortTitle.trim():'';
 let text=supplied||String(title||'').trim().split(/[：:]/u)[0];
 if(!text)throw Error('STAGE_DISPLAY_TITLE_REQUIRED');text=text.replace(/[\r\n]+/g,' ').trim();
 if(weight(text)<=maxUnits)return text;
 let result='';for(const token of tokens(text)){if(weight(result+token)>maxUnits-1)break;result+=token;}
 if(!result.trim()){const first=tokens(text)[0];if(weight(first)<=24)return first;throw Error('STAGE_DISPLAY_WORD_TOO_LONG');}
 return result.trim().replace(/[，,、；;：:。.!！?？]+$/u,'')+'…';
}
export function stageChapters(frames,labels=['先看内容','关键细节','取舍与结果','你的选择']){
 if(!Number.isSafeInteger(frames)||frames<90)throw Error('STAGE_CHAPTER_FRAMES_REQUIRED');
 const names=Array.isArray(labels)&&labels.length===4&&labels.every(s=>typeof s==='string'&&s.trim()&&weight(s)<=7)?labels:['先看内容','关键细节','取舍与结果','你的选择'];
 return names.map((label,i)=>({label,start_frame:Math.floor(frames*i/4),end_frame:Math.floor(frames*(i+1)/4),center_x:135+270*i}));
}
// History is the selected lower-slot content for the whole body. An approved
// frozen renderer keeps its original schedule, scaled only with its audio clock.
export function stageHistoryIntervals(frames,episodes,{frozenConfig=null}={}){
 if(!Number.isSafeInteger(frames)||frames<90||!Array.isArray(episodes)||!episodes.length||episodes.some(e=>!e.id)||new Set(episodes.map(e=>e.id)).size!==episodes.length)throw Error('STAGE_HISTORY_SCHEDULE_INPUT_REQUIRED');
 if(frozenConfig){const prior=frozenConfig.history?.intervals,n=frozenConfig.body?.frames;if(!Number.isSafeInteger(n)||n<90||!Array.isArray(prior)||prior.length!==episodes.length||prior.some((w,i)=>w.id!==episodes[i].id||!Number.isSafeInteger(w.start_frame)||!Number.isSafeInteger(w.end_frame)||w.start_frame<0||w.end_frame<=w.start_frame||w.end_frame>n||i>0&&w.start_frame!==prior[i-1].end_frame))throw Error('FROZEN_STAGE_HISTORY_SCHEDULE_CHANGED');return prior.map(w=>({id:w.id,start_frame:Math.floor(w.start_frame*frames/n),end_frame:Math.floor(w.end_frame*frames/n)}));}
 return episodes.map((episode,i)=>({id:episode.id,start_frame:Math.floor(frames*i/episodes.length),end_frame:Math.floor(frames*(i+1)/episodes.length)}));
}
// Preserve a supplied short approved heading for the renderer's actual pixel
// fitter. Only legacy complete-topic fallbacks need a display abbreviation.
const shortHistoryText=value=>{if(typeof value!=='string')return null;const text=value.replace(/\s*\r?\n\s*/g,' ').trim();if(!text)return null;if(Array.from(text).length<=16)return text;const sentence=/^.*?[。！？!?]/u.exec(text)?.[0];return sentence&&Array.from(sentence).length<=16?sentence:null;};
export function stageHistoryCopy(item){return {...item,display_title:shortHistoryText(item.display_title)||stageDisplayTitle(item.title,null,10),display_lookpoint:shortHistoryText(item.description||item.display_lookpoint)||stageDisplayTitle(item.lookpoint===item.title?'已发布 · 主页可看':item.lookpoint,null,12)};}
