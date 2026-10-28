import policy from '../production/content-motion-policy.json' with {type:'json'};
import {createHash} from 'node:crypto';
export const CONTENT_MOTION_POLICY=policy;
export const MOTION_REPORT_SCHEMA='actual-content-motion-qa-v1';
export const MOTION_REPEAT_REVIEW_CONTRACT='actual-temporal-repeat-review-v1';
export const motionCanonical=(v:any):string=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const motionSha=(v:any):string=>createHash('sha256').update(typeof v==='string'||v instanceof Uint8Array?v:motionCanonical(v)).digest('hex');
const digest=(v:any)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=(v:any)=>typeof v==='string'&&v.trim().length>0;
const integer=(n:any)=>Number.isSafeInteger(n)&&n>=0;
type Row=Record<string,any>;

export function contentVisualTasks(draft:Row,source:Row={}){
 return (draft.storyboard||[]).map((s:Row,index:number)=>({
  index,narration:s.narration,approved_visual:s.visual||'',
  question:'观众在这段实际看到什么新动作、结果、变化或机制？',
  search_angles:[source.title||'',s.narration,s.visual||''].filter(Boolean),
  needs_actual_case:s.demonstration_required===true||draft.demonstration_required===true,
  allowed_support:['actual-related-video','authorized-real-recording','grounded-process-animation','brief-image-evidence'],
  forbidden:['narration-text-card','slideshow-fallback','unrelated-technology-b-roll','invented-demonstration']
 }));
}

// This runs both before rendering and on the server's candidate-return boundary.
// Timing is integer frames; words, a moving watermark or a container extension
// cannot make an otherwise static picture count as a meaningful moving shot.
export function observationIntervals(shots:Row[]){return shots.flatMap(s=>{const count=Math.ceil((s.end_frame-s.start_frame)/policy.inspection_interval_frames);return Array.from({length:count},(_,i)=>{const start=s.start_frame+Math.floor(i*(s.end_frame-s.start_frame)/count),end=s.start_frame+Math.floor((i+1)*(s.end_frame-s.start_frame)/count);return {...s,recipe_index:s.index,start_frame:start,end_frame:end,source_start_frame:s.source_start_frame+start-s.start_frame};});}).map((s,index)=>({...s,index}));}
export function motionShotIssues(shots:Row[],bodyFrames:number,{observed=false,checkRepeats=true}:{observed?:boolean;checkRepeats?:boolean}={}){
 const issues:Row[]=[];const add=(code:string,shot?:number,detail?:string)=>issues.push({code,...(shot===undefined?{}:{shot}),...(detail?{detail}:{})});
 if(!integer(bodyFrames)||bodyFrames<1||bodyFrames>(observed?1800:policy.maximum_source_plan_frames)||!Array.isArray(shots)||!shots.length||shots.length>(observed?policy.maximum_observed_intervals:policy.maximum_shots))return {issues:[{code:'MOTION_TIMELINE_REQUIRED'}],metrics:null};
 let cursor=0,dynamic=0,still=0,replays=0,replayed=0,observedReplays=0,staticRun=0,staticRecipe:any=null;const ranges=new Map<string,Row[]>(),core=new Set<number>(),tasks=new Set<number>(),requiredCases=new Set<number>(),actualCases=new Set<number>();
 for(const [index,s]of shots.entries()){
  if(s.index!==index||s.start_frame!==cursor||!integer(s.end_frame)||s.end_frame<=cursor||s.end_frame>bodyFrames){add('MOTION_TIMELINE_GAP',index);continue;}
  const frames=s.end_frame-s.start_frame;cursor=s.end_frame;
  if(!integer(s.task_index)||!digest(s.source_sha256)||!text(s.visible_content)||!text(s.supports_narration)||!['core','explanation','context'].includes(s.role))add('MOTION_SHOT_EVIDENCE_REQUIRED',index);
  tasks.add(s.task_index);if(['core','explanation'].includes(s.role)||s.silent_closing===true&&['video','recording'].includes(s.kind)&&['direct','supporting'].includes(s.relevance))core.add(s.task_index);
  if(s.actual_case_required===true)requiredCases.add(s.task_index);if(['video','recording'].includes(s.kind)&&s.illustrative!==true&&s.role==='core'&&s.relevance==='direct'&&(!observed||s.observation?.relevance==='direct'))actualCases.add(s.task_index);
  if(s.rate!==1)add('MOTION_SOURCE_SPEED_CHANGED',index);
  if(s.text_only===true||['article-quote','text-card','kinetic-text','unknown'].includes(s.kind))add('MOTION_TEXT_CARD_FORBIDDEN',index);
  if(!['video','recording','image','mechanism'].includes(s.kind))add('MOTION_SHOT_KIND_INVALID',index);
  if(s.relevance!=='direct'&&s.relevance!=='supporting')add('MOTION_UNRELATED_SHOT',index);
  let meaningful=['video','recording','mechanism'].includes(s.kind);
  if(s.kind==='mechanism'&&(!digest(s.mechanism_recipe_sha256)||s.mechanism_state_changes<2||s.illustrative!==true))add('MOTION_MECHANISM_PROCESS_REQUIRED',index);
  if(observed){
   const o=s.observation;
   if(!o||!['moving-content','still-evidence','mechanism-process','text-only','decorative-motion','unrelated'].includes(o.classification)||!text(o.what_changed)||!Array.isArray(o.frame_sha256)||o.frame_sha256.length<(frames===1?1:2)||o.frame_sha256.some((x:any)=>!digest(x)))add('MOTION_ACTUAL_FRAME_REVIEW_REQUIRED',index);
   if(o?.text_only===true||o?.classification==='text-only')add('MOTION_EXPORTED_TEXT_CARD',index);
   if(o?.classification==='unrelated'||o?.relevance!=='direct'&&o?.relevance!=='supporting')add('MOTION_EXPORTED_UNRELATED_SHOT',index);
   meaningful=meaningful&&['moving-content','mechanism-process'].includes(o?.classification)&&o?.meaningful_change===true&&s.measured_motion===true&&frames>1;
   if(o?.classification==='mechanism-process'&&s.kind!=='mechanism'&&!(s.kind==='video'&&s.illustrative===true&&digest(s.mechanism_recipe_sha256)&&Number.isSafeInteger(s.mechanism_state_changes)&&s.mechanism_state_changes>=2))add('MOTION_UNDECLARED_SIMULATION',index);
  }
  if(meaningful){dynamic+=frames;staticRun=0;staticRecipe=null;}else{still+=frames;if(observed){staticRun=staticRecipe===(s.recipe_index??index)?staticRun+frames:frames;staticRecipe=s.recipe_index??index;}if(frames>policy.maximum_single_still_frames||staticRun>policy.maximum_single_still_frames)add('MOTION_STILL_TOO_LONG',index);}
  const key=digest(s.content_identity)?s.content_identity:s.source_sha256,previous=ranges.get(key)||[];
  if(checkRepeats&&s.kind==='image'){
   if(previous.length)add('MOTION_REPEATED_IMAGE',index);previous.push(s);ranges.set(key,previous);
  }else if(checkRepeats&&s.kind!=='mechanism'){
   if(!integer(s.source_start_frame)||s.source_start_frame+frames>s.source_available_frames)add('MOTION_SOURCE_RANGE_TOO_SHORT',index);
   const overlap=previous.filter(p=>s.source_start_frame<p.source_start_frame+(p.end_frame-p.start_frame)&&s.source_start_frame+frames>p.source_start_frame);
   if(overlap.length){
    const p=overlap[0],overlapFrames=Math.min(s.source_start_frame+frames,p.source_start_frame+p.end_frame-p.start_frame)-Math.max(s.source_start_frame,p.source_start_frame);
    if(overlap.length!==1||p.start_frame!==0||p.end_frame>policy.hook_repeat_maximum_frames||p.hook!==true||s.hook_reprise!==true||s.start_frame<policy.hook_repeat_maximum_frames||overlapFrames>policy.hook_repeat_maximum_frames||replays>=policy.hook_repeat_maximum_count)add('MOTION_REPEATED_VIDEO_RANGE',index);
    else{replays++;replayed+=overlapFrames;}
   }else if(s.hook_reprise===true)add('MOTION_SPURIOUS_HOOK_REPRISE',index);
   previous.push(s);ranges.set(key,previous);
  }
  if(checkRepeats&&observed&&s.observation?.duplicate_of!==null&&s.observation?.duplicate_of!==undefined){
   const p=shots[s.observation.duplicate_of];
   if(!Number.isSafeInteger(s.observation.duplicate_of)||s.observation.duplicate_of>=index||!p||p.start_frame!==0||p.end_frame>policy.hook_repeat_maximum_frames||p.hook!==true||s.hook_reprise!==true||frames>policy.hook_repeat_maximum_frames||observedReplays>=1)add('MOTION_EXPORTED_REPEAT',index);else observedReplays++;
  }
 }
 if(cursor!==bodyFrames)add('MOTION_TIMELINE_GAP');
 for(const task of tasks)if(!core.has(task))add('MOTION_TASK_HAS_ONLY_BACKGROUND',undefined,String(task));
 for(const task of requiredCases)if(!actualCases.has(task))add('MOTION_ACTUAL_CASE_REQUIRED',undefined,String(task));
 if(dynamic/bodyFrames+1e-9<policy.minimum_dynamic_ratio)add('MOTION_DYNAMIC_COVERAGE_LOW');
 if(still/bodyFrames-policy.maximum_still_ratio>1e-9)add('MOTION_STILL_COVERAGE_HIGH');
 return {issues,metrics:{body_frames:bodyFrames,dynamic_frames:dynamic,still_frames:still,dynamic_ratio:dynamic/bodyFrames,still_ratio:still/bodyFrames,hook_replays:replays,replayed_frames:replayed,shot_count:shots.length}};
}

export function motionReportIssues(report:any,context:{video_sha256:string;project_sha256:string;script_text_sha256:string;feedback_sha256:string}){
 const issues:Row[]=[];
 if(report?.schema!==MOTION_REPORT_SCHEMA||report.policy_id!==policy.id||report.policy_sha256!==motionSha(policy)||report.video_sha256!==context.video_sha256||report.project_sha256!==context.project_sha256||report.script_text_sha256!==context.script_text_sha256||report.feedback_sha256!==context.feedback_sha256||!digest(report.video_sha256)||!digest(report.project_sha256)||!digest(report.script_text_sha256)||report.human_quality_approved!==false||report.publication_authorized!==false||report.main_picture_only!==true)return [{code:'MOTION_REPORT_BINDING_REQUIRED'}];
 const source=motionShotIssues(report.source_shots,report.body_frames);issues.push(...source.issues);const expected=Array.isArray(report.source_shots)?observationIntervals(report.source_shots):[];
 if(!Array.isArray(report.shots)||expected.length!==report.shots.length)return [...issues,{code:'MOTION_FULL_BODY_INTERVALS_REQUIRED'}];
 const reprises=new Set<number>();
 for(const [index,s]of report.shots.entries()){
  const e:Row=expected[index];for(const k of Object.keys(e))if(motionCanonical(s[k])!==motionCanonical(e[k])){issues.push({code:'MOTION_OBSERVATION_SOURCE_CHANGED',shot:index});break;}
  const verified=s.observation?.duplicate_verification;if(verified){const{assessment_sha256,...assessment}=verified,previous=report.shots[verified.previous_index];if(report.repeat_review_contract!==MOTION_REPEAT_REVIEW_CONTRACT||s.observation.duplicate_of!==null||verified.contract!==MOTION_REPEAT_REVIEW_CONTRACT||verified.verdict!=='distinct-content'||verified.index!==index||!integer(verified.previous_index)||verified.previous_index>=index||!previous||!text(verified.explanation)||!digest(verified.review_receipt_sha256)||assessment_sha256!==motionSha(assessment)||motionCanonical(verified.previous_frame_sha256)!==motionCanonical(previous.observation?.frame_sha256)||motionCanonical(verified.current_frame_sha256)!==motionCanonical(s.observation.frame_sha256))issues.push({code:'MOTION_REPEAT_VERIFICATION_REQUIRED',shot:index});}
  const duplicate=s.observation?.duplicate_of;if(duplicate!==null&&duplicate!==undefined){const p=report.shots[duplicate],origin=report.source_shots[s.recipe_index],prior=p&&report.source_shots[p.recipe_index];if(!integer(duplicate)||duplicate>=index||!prior||prior.start_frame!==0||prior.end_frame>90||prior.hook!==true||origin.hook_reprise!==true||origin.end_frame-origin.start_frame>90)issues.push({code:'MOTION_EXPORTED_REPEAT',shot:index});else reprises.add(s.recipe_index);}
 }
 if(reprises.size>1)issues.push({code:'MOTION_EXPORTED_REPEAT'});
 const calculated=motionShotIssues(report.shots,report.body_frames,{observed:true,checkRepeats:false});issues.push(...calculated.issues);if(calculated.metrics&&source.metrics){calculated.metrics.hook_replays=source.metrics.hook_replays;calculated.metrics.replayed_frames=source.metrics.replayed_frames;calculated.metrics.shot_count=report.source_shots.length;}
 if(motionCanonical(calculated.metrics)!==motionCanonical(report.metrics))issues.push({code:'MOTION_REPORT_METRICS_CHANGED'});
 if(!digest(report.inspection_manifest_sha256)||!digest(report.actual_frame_review_sha256)||report.recipe_sha256!==motionSha(report.source_shots)||report.frame_review_scope!=='actual-export-main-picture-temporal-pairs')issues.push({code:'MOTION_EXPORTED_INSPECTION_REQUIRED'});
 if(!Array.isArray(report.revision_checks)||report.feedback_sha256!==motionSha('')&&!report.revision_checks.length||report.revision_checks.some((r:Row)=>r.passed!==true||!text(r.requirement)||!text(r.change)))issues.push({code:'MOTION_REVISION_NOT_RESOLVED'});
 return issues;
}
