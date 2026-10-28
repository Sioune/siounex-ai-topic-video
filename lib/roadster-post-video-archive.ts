import {createHash} from 'node:crypto';
import {db} from './store';
import {getJob} from './production';
import {ProductionError,hash} from './production-contract';
import {assertNativeApprovedScript,nativeScopeContext} from './native-return-context';
import {candidateReviewBinding,type CandidateReviewBinding} from './native-candidate-feedback-contract.mts';
import {currentCandidateVoiceProvenance,CANDIDATE_VOICE_DECISION} from './native-candidate-voice-contract.mts';
import {pendingCandidateArchiveBinding,postVideoArchiveJobMatches,currentPostVideoApproval,siteCanonical,type SiteFileArchive} from './site-file-archive-contract.mts';
import type {SiteArchiveActor} from './site-file-archive';

export const POST_VIDEO_MATERIAL_ROLES=['cover_3_4','cover_4_3','promotion','source_notes','source_bundle','complete_bundle'] as const;
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const fail=(s:string,status=409)=>new ProductionError(s,status);
function rowsRaw(rows:Record<string,unknown>[],revision:number,decision:string){return JSON.stringify(rows.filter(r=>r.revision===revision&&r.decision===decision).map(r=>({id:r.id,revision:r.revision,content_hash:r.content_hash,note:r.note,created_at:r.created_at})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id))));}
function textRaw(ms:Record<string,unknown>[],revision:number){return JSON.stringify(ms.filter(m=>m.revision===revision&&['source','script'].includes(String(m.node))).map(m=>({id:m.id,node:m.node,artifact_hash:m.artifact_hash,status:m.status,mode_epoch:m.mode_epoch})).sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
export const POST_VIDEO_NODES_SQL="(SELECT COALESCE(json_group_array(json_object('id',m.id,'node',m.node,'artifact_version',m.artifact_version,'artifact_hash',m.artifact_hash,'artifact',m.artifact,'status',m.status,'mode_epoch',m.mode_epoch,'report',m.report)),'[]') FROM (SELECT id,node,artifact_version,artifact_hash,artifact,status,mode_epoch,report FROM production_milestones WHERE job_id=j.id AND revision=j.revision AND node IN ('video','cover','promotion') ORDER BY id) m)";
export const POST_VIDEO_APPROVALS_SQL="(SELECT COALESCE(json_group_array(json_object('id',r.id,'revision',r.revision,'content_hash',r.content_hash,'note',r.note,'reviewer',r.reviewer,'created_at',r.created_at)),'[]') FROM (SELECT id,revision,content_hash,note,reviewer,created_at FROM production_reviews WHERE job_id=j.id AND revision=j.revision AND decision='approve' ORDER BY created_at DESC,id DESC) r)";
function mediaNodesRaw(j:Awaited<ReturnType<typeof getJob>>){return JSON.stringify(j.milestones.filter(m=>m.revision===j.revision&&['video','cover','promotion'].includes(m.node)).map(m=>({id:m.id,node:m.node,artifact_version:m.artifact_version,artifact_hash:m.artifact_hash,artifact:m.artifact,status:m.status,mode_epoch:m.mode_epoch,report:m.report})).sort((a,b)=>a.id.localeCompare(b.id)));}
async function actualOwnerApproval(j:Awaited<ReturnType<typeof getJob>>,owner:string,node:string){
 const current=currentPostVideoApproval({...j,owner_id:owner},node);
 if(!current||await hash(current.milestone.artifact)!==current.milestone.artifact_hash)throw fail('缺少当前'+node+'节点的真实本人批准');
 const audit=await db().prepare("SELECT id FROM production_reviews WHERE id=? AND job_id=? AND revision=? AND content_hash=? AND decision='approve' AND reviewer=? AND note=?").bind(current.review_id,j.id,j.revision,current.milestone.artifact_hash,owner,current.milestone.report).first<{id:string}>();
 if(!audit)throw fail('当前'+node+'节点缺少真实所有者审核审计记录');
 return current;
}
export async function roadsterPostVideoArchiveContext(id:string,delivery:unknown,actor:SiteArchiveActor,write=true){
 if(!pendingCandidateArchiveBinding(id)||typeof delivery!=='string'||!/^native_draft_[a-f0-9]{64}$/.test(delivery))throw fail('此制作后材料归档仅限本次已登记的私有成片',403);
 const own=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string|null}>();
 if(!own?.owner_id||!actor||('owner_id'in actor?actor.owner_id!==own.owner_id:actor.trusted_owner_service!==true))throw fail('制作后材料归档所有者不匹配',403);
 const j=await getJob(id);
 if(!postVideoArchiveJobMatches(j)||!(write?['approved']:['approved','completed']).includes(j.status)||j.publication_reports.length)throw fail('稿件、模式、合同或私有交付范围已变化');
 await assertNativeApprovedScript(j);const scope=await nativeScopeContext(j);
 const row=j.reviews.find(r=>r.id===j.facts.candidate_record_id&&r.decision==='native_video_candidate'&&r.revision===j.revision);let candidate=null;try{if(row)candidate={id:String(row.id),value:JSON.parse(String(row.note))};}catch{}
 const binding=candidate&&candidateReviewBinding(j,candidate),voice=candidate&&currentCandidateVoiceProvenance(j,candidate),video=await actualOwnerApproval(j,own.owner_id,'video');
 const a=JSON.parse(video.milestone.artifact);
 if(!candidate||!binding||!voice||candidate.value.approved_native_version_id!==undefined||row?.content_hash!==binding.candidate_sha256||j.facts.candidate_video_sha256!==binding.candidate_sha256||video.milestone.id!==delivery||a.sha256!==binding.candidate_sha256||a.qa?.native_candidate_id!==binding.candidate_id||a.qa?.voice_kind!=='owner-cloned'||a.qa?.voice_provenance_id!==voice.id||a.qa?.project_id!==binding.project_id||a.qa?.timeline_id!==binding.timeline_id)throw fail('必须绑定当前已批准成片、真实工程及本人音轨');
 if(write&&(Number(j.lease_until)>Date.now()||j.operations.some(o=>['running','prepared'].includes(String(o.status))&&(o.lease_until===null||Number(o.lease_until)>Date.now()))||j.stages.some(s=>s.status==='running'&&(()=>{try{const u=JSON.parse(String(s.result)).lease_until;return u==null||Number(u)>Date.now()}catch{return true}})())||j.milestones.some(m=>m.review_until!==null&&m.review_until>Date.now()||m.status==='ai_running'&&m.review_until===null)))throw fail('已有执行或审阅租约，先等待原回执');
 const approvals=(await db().prepare("SELECT id,revision,content_hash,note,reviewer,created_at FROM production_reviews WHERE job_id=? AND revision=? AND decision='approve' ORDER BY created_at DESC,id DESC").bind(id,j.revision).all<Record<string,unknown>>()).results;
 const context={job:j,binding,owner_review_id:video.review_id,scope_id:scope.scope_id,scope_hash:scope.scope_hash,snapshot:{owner:own.owner_id,source:j.source_snapshot,skill:j.skill_snapshot,scope_raw:scope.scope_raw,native_raw:rowsRaw(j.reviews,j.revision,'native_video_candidate'),reviews_raw:rowsRaw(j.reviews,j.revision,'reported_owner_candidate_feedback'),text_nodes_raw:textRaw(j.milestones as unknown as Record<string,unknown>[],j.revision),voice_raw:rowsRaw(j.reviews,j.revision,CANDIDATE_VOICE_DECISION),audio_raw:rowsRaw(j.reviews,j.revision,'audio_intake'),post_media_raw:mediaNodesRaw(j),post_approval_raw:JSON.stringify(approvals),post_files_raw:'[]'},post_video:{id:delivery,voice_provenance_id:voice.id,material_reviews:undefined as {cover:string;promotion:string}|undefined}};
 if(currentPostVideoApproval({...j,owner_id:own.owner_id},'cover')&&currentPostVideoApproval({...j,owner_id:own.owner_id},'promotion')){const materials=await readApprovedRoadsterMaterials(context);context.post_video.material_reviews=materials.reviews;context.snapshot.post_files_raw=JSON.stringify(materials.states);}
 return context;
}
// A ZIP can only become a complete package after the exact two materials have
// genuine owner approvals. Confirmed staging bytes alone are never sufficient.
type MaterialContext={job:Awaited<ReturnType<typeof getJob>>;snapshot:{owner:string};post_video:{id:string;voice_provenance_id:string};owner_review_id:string;binding:CandidateReviewBinding;scope_id:string;scope_hash:string};
async function readApprovedRoadsterMaterials(c:MaterialContext){
 const cover=await actualOwnerApproval(c.job,c.snapshot.owner,'cover'),promotion=await actualOwnerApproval(c.job,c.snapshot.owner,'promotion'),ca=JSON.parse(cover.milestone.artifact),pa=JSON.parse(promotion.milestone.artifact);let limits=null;try{limits=JSON.parse(pa.limits);}catch{}
 const ids=ca.qa?.site_archive_ids;
 if(ca.qa?.post_video_delivery_id!==c.post_video.id||!ids||Object.keys(ids).sort().join(',')!=='cover_3_4,cover_4_3'||limits?.schema!=='site-promotion-file-v1'||typeof pa.text!=='string'||!pa.text.trim()||limits.sha256!==digest(pa.text))throw fail('完整交付包须绑定已批准双封面及准确宣发全文');
 const {getSiteArchiveMetadata}=await import('./site-file-archive'),states:{key:string;value:string}[]=[];
 for(const [role,sid] of Object.entries({...ids,promotion:limits.site_archive_id}) as [string,string][]){
  const a:SiteFileArchive=await getSiteArchiveMetadata(c.job.id,sid,c.snapshot.owner);
  if(a.post_video_delivery_id!==c.post_video.id||a.owner_review_id!==c.owner_review_id||a.voice_provenance_id!==c.post_video.voice_provenance_id||a.file.role!==role||siteCanonical(a.binding)!==siteCanonical(c.binding)||a.scope_id!==c.scope_id||a.scope_hash!==c.scope_hash||role==='cover_3_4'&&a.file.sha256!==ca.sha256||role==='promotion'&&(a.file.sha256!==limits.sha256||a.file.size_bytes!==new TextEncoder().encode(pa.text).length))throw fail('完整交付包与当前已批准材料的真实归档字节不匹配');
  const key='site_archive_v1:'+a.site_archive_id,row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key).first<{value:string}>();
  if(!row||siteCanonical(JSON.parse(row.value).archive)!==siteCanonical(a))throw fail('已批准材料的归档确认状态已变化');
  states.push({key,value:row.value});
 }
 return {reviews:{cover:cover.review_id,promotion:promotion.review_id},states:states.sort((a,b)=>a.key.localeCompare(b.key))};
}
export async function approvedRoadsterMaterialReviews(c:MaterialContext){return(await readApprovedRoadsterMaterials(c)).reviews;}
