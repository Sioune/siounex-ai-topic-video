import {ownerFeedbackContinuation} from './owner-feedback-continuation.mts';
import {db} from './store';
import {getJob} from './production';
import {hash,ProductionError} from './production-contract';
import {canonicalNativeReturn} from './native-draft-revision-handoff';
import {MINICPM_JOB,PROTECTED_VIDEO_JOB,assertNativeApprovedScript,nativeScopeContext,nativeOwnerRevisionContext} from './native-return-context';
import {requiresToolDemonstration} from './tool-demonstration.mjs';
import {currentCandidateVoiceProvenance,effectiveCandidateVoiceKind} from './native-candidate-voice-contract.mts';
import type {NativeCandidateOwnerReview} from './native-candidate-feedback-contract.mts';

export async function nativeSelectionSnapshot(id:string){
 const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('series_selection_v1:'+id).first<{value:string}>();
 return {raw:row?.value||null,current:row?JSON.parse(row.value).current||null:null};
}
export const NATIVE_INPUT_RECORDS_SQL="(SELECT COALESCE(json_group_array(json_object('id',input.id,'content_hash',input.content_hash,'decision',input.decision,'note',input.note)),'[]') FROM (SELECT id,content_hash,decision,note FROM production_reviews WHERE job_id=j.id AND revision=j.revision AND decision IN ('audio_intake','audio_library_binding','preparation_materials_v1','series_selection') ORDER BY rowid DESC) input)";
export async function nativeInputSnapshot(id:string,revision:number){
 const rows=(await db().prepare("SELECT id,content_hash,decision,note FROM production_reviews WHERE job_id=? AND revision=? AND decision IN ('audio_intake','audio_library_binding','preparation_materials_v1','series_selection') ORDER BY rowid DESC").bind(id,revision).all<{id:string;content_hash:string;decision:string;note:string}>()).results;
 const records=rows.map(r=>({id:r.id,content_hash:r.content_hash,decision:r.decision,note:r.note}));
 return {records,raw:JSON.stringify(records)};
}

export async function readNativeWorkPacket(id:string,owner?:string){
 const j=await getJob(id,owner),ownership=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string|null}>();
 if(owner&&ownership?.owner_id!==owner)throw new ProductionError('仅任务本人可读取原生制作交接',403);
 const blockers:string[]=[],external=[MINICPM_JOB,PROTECTED_VIDEO_JOB].includes(id),latest=j.milestones?.filter(m=>m.node==='video'&&m.revision===j.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 const draft=j.drafts?.find(d=>d.revision===j.revision&&d.content_hash===j.approved_hash);
 let scope:Awaited<ReturnType<typeof nativeScopeContext>>|null=null,revision:Awaited<ReturnType<typeof nativeOwnerRevisionContext>>|null=null;
 try{await assertNativeApprovedScript(j)}catch(e){blockers.push((e as Error).message)}
 try{scope=await nativeScopeContext(j)}catch(e){blockers.push((e as Error).message)}
 if(j.review_mode!=='node')blockers.push('原生成片须交人工审阅；本人切到人工模式并确认当前范围后再回传。');
 if(j.is_test)blockers.push('隔离验收任务不属于正式原生制作交接。');
 if(j.reworks>2&&!ownerFeedbackContinuation(j))blockers.push('已达返工预算，需要本人另行处理；接收回执不会重置计数。');
 if(j.publication_reports?.length)blockers.push('已登记发布的任务保留原交付；不改写已发布视频。');
 if(latest?.status==='revise'&&!external){try{revision=await nativeOwnerRevisionContext(j)}catch(e){blockers.push((e as Error).message)}}
 else if(!['approved'].includes(j.status)&&!external)blockers.push('当前需先完成人工审核或恢复决定。');
 if(j.operations?.some(o=>['running','prepared'].includes(String(o.status))&&(o.lease_until==null||Number(o.lease_until)>Date.now()))||j.milestones?.some(m=>m.review_until!==null&&m.review_until>Date.now()||m.status==='ai_running'&&m.review_until===null)||j.lease_until!==null&&j.lease_until>Date.now())blockers.push('已有执行或审核租约，先等原回执；不重复领取。');
 const artifact=latest?JSON.parse(latest.artifact):null;
 const reported=latest?.report?JSON.parse(latest.report):null;
 const feedbackId=revision?.feedback.id||(typeof reported?.review_id==='string'?reported.review_id:null),feedback=j.reviews?.find(r=>r.id===feedbackId);
 const binding={revision:j.revision,script_hash:j.approved_hash,mode_epoch:j.mode_epoch,contract_hash:j.contract_hash,skill_hash:JSON.parse(j.skill_snapshot).sha256||null,scope_id:scope?.scope_id||null,scope_hash:scope?.scope_hash||null,
  base_milestone_id:latest?.id||null,base_artifact_version:latest?.artifact_version||0,base_artifact_hash:latest?.artifact_hash||null,base_sha256:artifact?.sha256||artifact?.asset?.sha256||null,base_report_sha256:latest?.report?await hash(latest.report):null,
  feedback_review_id:feedbackId,feedback_note_sha256:revision?.feedback.note?await hash(revision.feedback.note):feedback?await hash(String(feedback.note)):null,
  continuation_review_id:revision?.continuation?.id||null,continuation_note_sha256:revision?.continuation?.note?await hash(revision.continuation.note):null};
 const selected=await nativeSelectionSnapshot(id),inputs=await nativeInputSnapshot(id,j.revision);
 let candidate:null|{record_id:string;revision:number;script_hash:string;sha256:string;file_name:string;size_bytes:number;duration:number;project_id:string;timeline_id:string;source:string;archive_status:'archived'|'archive_pending';quality_approved:false;publication_authorized:false;voice_kind?:'ordinary-temporary'|'owner-cloned';voice_provenance_id?:string;owner_review?:NativeCandidateOwnerReview}=null;
 // Formal registration does not remove the immutable candidate or its oral
 // review. Keep their exact reference available for subsequent file archiving.
 const currentNativeNode=latest&&latest.mode_epoch===j.mode_epoch&&['awaiting_human','approved'].includes(latest.status)&&artifact?.qa?.native_handoff===true&&artifact.qa.native_candidate_id===j.facts.candidate_record_id&&artifact.sha256===j.facts.candidate_video_sha256;
 if((!external||artifact?.qa?.pending_native_site_id)&&(!latest||currentNativeNode)&&draft&&j.approved_revision===j.revision){
  const row=j.reviews?.find(r=>r.id===j.facts?.candidate_record_id&&r.decision==='native_video_candidate'&&Number(r.revision)===j.revision);
  if(row)try{const v=JSON.parse(String(row.note));if((!latest||artifact.qa.project_id===v.project_id&&artifact.qa.timeline_id===v.timeline_id)&&v.schema==='native-video-candidate-v1'&&v.script_hash===j.approved_hash&&v.sha256===row.content_hash&&v.sha256===j.facts?.candidate_video_sha256&&/^[a-f0-9]{64}$/.test(v.sha256)&&v.local_file_verified===true&&v.quality_approved===false&&v.publication===false&&typeof v.file_name==='string'&&v.file_name.trim()&&Number.isSafeInteger(v.size_bytes)&&v.size_bytes>0&&typeof v.duration==='number'&&Number.isFinite(v.duration)&&v.duration>0){
   const voice=currentCandidateVoiceProvenance(j,{id:String(row.id),value:v}),voiceKind=(voice||v.voice_kind!==undefined)?effectiveCandidateVoiceKind(j,{id:String(row.id),value:v}):null;
   candidate={record_id:String(row.id),revision:j.revision,script_hash:v.script_hash,sha256:v.sha256,file_name:v.file_name,size_bytes:v.size_bytes,duration:v.duration,project_id:typeof v.project_id==='string'?v.project_id:'',timeline_id:typeof v.timeline_id==='string'?v.timeline_id:'',source:typeof v.source==='string'?v.source:'',...(voiceKind?{voice_kind:voiceKind}:{}),...(voice?{voice_provenance_id:voice.id}:{}),...(typeof v.approved_native_version_id==='string'?{approved_native_version_id:v.approved_native_version_id}:{}),...(v.delivery_method==='local-audio-only-finishing'&&v.render_id===null&&v.native_render_id===null&&/^site_delivery_[a-f0-9]{64}$/.test(v.delivery_id)?{delivery_method:v.delivery_method,delivery_id:v.delivery_id,native_render_id:null,local_audio_proof:v.local_audio_proof}:{}),archive_status:j.facts?.files_archived===true?'archived':'archive_pending',quality_approved:false,publication_authorized:false,...(j.facts?.candidate_owner_review?{owner_review:j.facts.candidate_owner_review}:{})};
  }}catch{}
 }
 const core={schema:'native-work-packet-v1',job_id:id,binding,...(candidate?{candidate}:{}),...(j.facts.site_file_archives?.length?{site_archives:j.facts.site_file_archives}:{}),
  script:draft?{revision:draft.revision,content_hash:draft.content_hash,text:JSON.parse(String(draft.content)).script,content:JSON.parse(String(draft.content))}:null,
  feedback:revision?{review_id:revision.feedback.id,note:JSON.parse(revision.feedback.note),report:revision.report}:feedback?{review_id:String(feedback.id),note:JSON.parse(String(feedback.note)),report:reported}:null,
  template:{skill_snapshot:JSON.parse(j.skill_snapshot),series:{current:selected.current,choice_current:!!selected.current&&selected.current.mode_epoch===j.mode_epoch}},
  inputs:{source_snapshot:JSON.parse(j.source_snapshot),audio_records:inputs.records}};
 if(latest&&['invalidated','superseded'].includes(latest.status))blockers.push('当前视频节点已失效，先重新核对版本与本人决定。');
 const status=external&&!artifact?.qa?.pending_native_site_id?'external_chat_task':latest?.status==='awaiting_human'?'awaiting_human':latest?.status==='approved'?'native_done':candidate?'awaiting_candidate_review':blockers.length?'blocked':latest?.status==='revise'?'needs_native_revision':latest?'blocked':'needs_native_handoff';
 const labels:Record<string,string>={external_chat_task:'已有独立制作会话，本站只读交接信息',awaiting_human:'当前成片等待本人审核',native_done:'本版成片已通过本人审核，可继续封面与宣发交付',awaiting_candidate_review:candidate?.archive_status==='archived'?'已有归档候选，等待回传视频审核节点':'已有视频候选，等待归档与本人审阅',blocked:'原生制作交接有待补条件',needs_native_revision:'本人返工已绑定，等待原生会话交回新文件',needs_native_handoff:'脚本已批准，等待原生制作交接'};
 return {packet:{...core,packet_hash:await hash(canonicalNativeReturn(core)),status,label:labels[status],blockers,
  receipts:{...(id===MINICPM_JOB?{pending_site_actions:{begin:'native_site_draft_begin',read:'native_site_draft_read',return:'native_site_draft_return',cancel:'native_site_draft_cancel',requires:'real owner scope and continuation; real new native render; four confirmed private Site files; no Library identity or quality approval'}}:{}),first_action:'native_draft_return',revision_action:id===MINICPM_JOB?'native_draft_revision_return':id===PROTECTED_VIDEO_JOB?null:'native_video_revision_return',
   required_revision_fields:['packet_hash','contract_hash','scope_id','scope_hash','request_id','revision','script_hash','mode_epoch','base_milestone_id','base_artifact_version','base_artifact_hash','base_sha256','base_report_sha256','feedback_review_id','feedback_note_sha256','sha256','size_bytes','duration','library_file_id','file_id','library_version','verified_at','materialized_sha256','project_id','timeline_id','render_id','file_name','source','qa','quality_approved=false','publication_authorized=false','new_paid_calls=0'],
   continuation_fields:revision?.continuation?['continuation_review_id','continuation_note_sha256']:[],demonstration_required:requiresToolDemonstration(JSON.parse(j.source_snapshot)),preview_schema:'actual-native-preview-v1'},
  capabilities:{native_editor_connected:false,claimed:false,generation_started:false,new_paid_authorization:false,publication_authorization:false},
  limits:'这是当前脚本、模板和返工绑定的只读交接包。原生会话须核对实际工具与素材；网站没有自动编辑ChatCut或领取制作任务。只回传真实已完成文件，不代本人通过，也不授权收费或发布。'}};
}
