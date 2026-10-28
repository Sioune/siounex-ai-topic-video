import{preparationExecution}from'./preparation-execution-view.mts';
import{requiresToolDemonstration,toolDemonstrationProblems}from'./tool-demonstration.mts';
import{pendingNativeSiteArchives}from'./pending-native-site-view.mts';
import{finalNativeSiteArchives}from'./native-site-final-view.mts';
import{isFixedOutroSegment}from'./storyboard-segments.mts';
export type MaterialReadinessJob={revision:number;approved_revision?:number|null;approved_hash:string|null;status?:string;mode_epoch?:number;contract_hash?:string;source_snapshot?:string;drafts?:{revision:number;content:string}[];milestones?:{node:string;revision:number;artifact:string;artifact_hash?:string;artifact_version?:number;mode_epoch?:number;status?:string}[];reviews?:Record<string,unknown>[];stages?:Record<string,unknown>[];media_continuation?:{current_id?:string;scope?:{id?:string;schema?:string;scope?:string;binding?:unknown}|null}};
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
function record(raw:unknown){try{return object(typeof raw==='string'?JSON.parse(raw):raw)}catch{return null}}
function currentBinding(j:MaterialReadinessJob,b:unknown){const v=object(b);return !!v&&j.status==='approved'&&j.approved_revision===j.revision&&typeof j.approved_hash==='string'&&!!j.approved_hash&&Number.isInteger(j.mode_epoch)&&Number(j.mode_epoch)>=0&&typeof j.contract_hash==='string'&&!!j.contract_hash&&v.revision===j.revision&&v.script_hash===j.approved_hash&&v.mode_epoch===j.mode_epoch&&v.contract_hash===j.contract_hash;}
function currentScope(j:MaterialReadinessJob){const c=j.media_continuation,s=c?.scope;return !!s&&s.schema==='owner-media-scope-v1'&&typeof c?.current_id==='string'&&!!c.current_id&&s.id===c.current_id&&['preparation','private-video'].includes(String(s.scope))&&currentBinding(j,s.binding);}
function currentRecord(j:MaterialReadinessJob,r:Record<string,unknown>,decision:string){return r.decision===decision&&r.revision===j.revision&&r.content_hash===j.approved_hash;}
function scopeIdMatches(j:MaterialReadinessJob,v:Record<string,unknown>){return v.scope_id===undefined||v.scope_id===j.media_continuation?.current_id;}

// Legacy execution/material notes did not store scope_id. Their exact input facts
// require a current scope; only probes explicitly naming that scope can be ready.
export function currentPreparationExecution(j:MaterialReadinessJob){
 if(!currentScope(j))return null;
 const reviews=(j.reviews||[]).filter(r=>{if(!currentRecord(j,r,'preparation_execution_v1'))return false;const v=record(r.note),m=object(v?.manifest);return !!v&&!!m&&currentBinding(j,v.binding)&&currentBinding(j,m.binding)&&scopeIdMatches(j,v)&&scopeIdMatches(j,m)});
 return preparationExecution({...j,reviews});
}
function readyProbe(j:MaterialReadinessJob,s:Record<string,unknown>,kind:string){
 if(s.stage!==kind||s.status!=='ready'||s.review_revision!==j.revision||s.review_hash!==j.approved_hash)return false;
 const p=record(s.result),r=object(p?.receipt);
 return !!p&&p.schema==='media-input-probe-v1'&&p.scope_id===j.media_continuation?.current_id&&currentBinding(j,p.binding)&&!!r&&r.schema==='media-input-probe-receipt-v1'&&r.kind===kind&&r.status==='ready'&&r.cost===0&&r.visual_inspected===false&&r.audio_listened===false&&r.quality_approved===false&&r.publication===false&&Array.isArray(r.checks)&&r.checks.length>0&&r.checks.every(c=>{const check=object(c);return !!check&&check.passed===true&&typeof check.code==='string'&&!!check.code.trim()&&typeof check.detail==='string'&&!!check.detail.trim()});
}
function currentDraftProblems(j:MaterialReadinessJob,content:Record<string,unknown>,historical:string[]){
 if(j.approved_revision!==j.revision||!j.approved_hash||!['source','script'].every(node=>{const m=j.milestones?.filter(m=>m.node===node&&m.revision===j.revision).sort((a,b)=>(b.artifact_version||0)-(a.artifact_version||0))[0];return m?.status==='approved'&&m.artifact_hash===j.approved_hash&&m.mode_epoch===j.mode_epoch;})||!Array.isArray(content.storyboard))return historical;
 const story=content.storyboard;return historical.filter(problem=>{const match=/^segments\[(\d+)\] 缺文字或具体可见画面$/.exec(problem),index=match?Number(match[1]):-1,s=story[index];return !match||!s||typeof s.narration!=='string'||!!s.narration.trim()||typeof s.visual!=='string'||!s.visual.trim()||!isFixedOutroSegment(s,index,story);});
}
export function materialReadiness(j:MaterialReadinessJob){
 let source:Record<string,unknown>={},content:Record<string,unknown>={};try{source=JSON.parse(j.source_snapshot||'{}');content=JSON.parse(j.drafts?.find(d=>d.revision===j.revision)?.content||'{}')}catch{}
 const p=content.narration_preflight as {machine_preflight?:string;problems?:string[];material_status?:string}|undefined,declared=p?.machine_preflight==='blocked'||content.production_ready===false,required=requiresToolDemonstration(source)||declared,scopeCurrent=currentScope(j);
 const evidence=scopeCurrent?(j.reviews||[]).filter(r=>currentRecord(j,r,'preparation_materials_v1')).flatMap(r=>{const v=record(r.note);return v?.schema==='internal-preparation-materials-v1'&&currentBinding(j,v.binding)&&scopeIdMatches(j,v)&&Array.isArray(v.assets)?[v]:[]})[0]:undefined;
 const assets=(evidence?.assets||[])as {sha256:string;file_name:string;duration_seconds:number;source_url:string;rights_status:string;observations:string}[],probesReady=scopeCurrent&&['media_inventory','media_inputs'].every(kind=>(j.stages||[]).some(s=>readyProbe(j,s,kind)));
 const execution=currentPreparationExecution(j),original=requiresToolDemonstration(source)?toolDemonstrationProblems(content):[],historical=[...original,...(Array.isArray(p?.problems)?p.problems:[])],currentProblems=currentDraftProblems(j,content,historical),problems=probesReady?[]:execution?['参考旁白、真实源片节选和技术时序已准备；原生工程、音轨归档及素材权利仍需分别完成。']:assets.length?['已取得官方连续设备演示；录音、分镜时序、原生模板和素材权利仍需分别核验。']:currentProblems.length?[...new Set(currentProblems)]:declared?['稿件记录的制作素材预检未完成；口播批准不代表素材或视频已就绪。']:[];
 const finalFiles=finalNativeSiteArchives({...j,approved_revision:j.approved_revision??null}),finalCompleted=finalFiles.length===6,nativeFiles=[...pendingNativeSiteArchives({...j,approved_revision:j.approved_revision??null}),...finalFiles],nativeCompleted=['video','cover_3_4','cover_4_3','promotion'].every(role=>nativeFiles.some(a=>a.file.role===role));
 return{material_required:required||assets.length>0,material_gate:finalCompleted?'native-completed-final':nativeCompleted?'native-completed-awaiting-review':probesReady?'evidence-bound':problems.length?'blocked':required?'evidence-bound':'not-required',material_problems:nativeCompleted?[]:problems,draft_material_preflight:historical,native_completion_evidence:nativeCompleted?{source:finalCompleted?'actual-native-render-and-six-confirmed-private-site-files-owner-accepted':'actual-native-render-and-four-confirmed-private-site-files',quality_approved:false,publication_authorized:false,preparation_probes_rewritten:false}:null,preparation_materials:evidence?{verified_at:String(evidence.verified_at),assets,publication_authorized:false,quality_approved:false}:null};
}
