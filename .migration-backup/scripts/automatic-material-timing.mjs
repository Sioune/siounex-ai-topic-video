import {deriveAuthoritativeNarration} from '../lib/authoritative-narration.mts';
import {bodyStoryboard} from '../lib/storyboard-segments.mts';
import {originalOutroFrames} from '../lib/outro-contract.mts';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fail=()=>{throw Object.assign(Error('AUTO_MATERIAL_NARRATION_TIMING_CHANGED'),{code:'AUTO_MATERIAL_NARRATION_TIMING_CHANGED'})};

// The caller supplies an already byte-checked completed project. Only its
// measured narration timeline is projected here: visual revisions must not
// invalidate unchanged audio, or turn nominal storyboard seconds into audio.
export function automaticMaterialTiming({job,binding,project=null,timing=null}){
 if(!project&&!timing)return null;
 const draft=job.drafts?.find(d=>d.revision===job.revision&&d.content_hash===job.approved_hash);
 if(!draft||sha(draft.content)!==job.approved_hash)fail();
 const content=JSON.parse(draft.content);let story;try{story=deriveAuthoritativeNarration(content.script,bodyStoryboard(content.storyboard)).storyboard}catch{fail()}const expected={revision:job.revision,script_hash:job.approved_hash,mode_epoch:job.mode_epoch,contract_hash:job.contract_hash,scope_id:binding.scope_id};
 let result=timing;
 if(project){
  if(project.schema!=='editable-local-private-review-v1'||project.job_id!==job.id||project.fps!==30||project.script!==content.script||project.script_text_sha256!==sha(content.script)||Object.entries(expected).some(([k,v])=>project.binding?.[k]!==v)||project.source_to_timeline?.length!==story.length)fail();
  let cursor=0;
  const segments=project.source_to_timeline.map((row,index)=>{if(row.index!==index||row.text!==story[index].narration||row.start_frame!==cursor||!Number.isSafeInteger(row.end_frame)||row.end_frame<=cursor||!/^[a-f0-9]{64}$/.test(row.audio?.sha256||''))fail();const frames=row.end_frame-cursor;cursor=row.end_frame;return{index,frames,narration_sha256:sha(row.text),audio_sha256:row.audio.sha256};});
  if(project.body_frames!==cursor)fail();
  let outroFrames;try{outroFrames=originalOutroFrames(project.outro,project.outro_frames);}catch{fail();}
  result={schema:'exact-existing-narration-timing-v1',binding:expected,fps:30,body_frames:cursor,outro_frames:outroFrames,segments};
 }
 let tail;try{tail=originalOutroFrames(null,result?.outro_frames);}catch{fail();}
 if(result?.schema!=='exact-existing-narration-timing-v1'||canonical(result.binding)!==canonical(expected)||result.fps!==30||!Number.isSafeInteger(result.body_frames)||result.body_frames<1||result.body_frames+tail>1800||!Array.isArray(result.segments)||result.segments.length!==story.length)fail();
 let total=0;
 for(const [index,row]of result.segments.entries()){if(row.index!==index||!Number.isSafeInteger(row.frames)||row.frames<1||row.narration_sha256!==sha(story[index].narration)||!/^[a-f0-9]{64}$/.test(row.audio_sha256||''))fail();total+=row.frames;}
 if(total!==result.body_frames)fail();
 return result;
}
