import {createHash} from 'node:crypto';
import {db} from './store';
import {getJob} from './production';
import {ProductionError} from './production-contract';
import {VERSION_BASE_SQL,versionBaseArgs,versionNodesRaw} from './approved-native-version-context';
import {assertNativeApprovedScript,nativeScopeContext,assertNativeDemonstration} from './native-return-context';
import {editorialMutationGuard} from './owner-editorial-delivery-contract.mts';
import {candidateReviewBinding} from './native-candidate-feedback-contract.mts';
import {currentCandidateVoiceProvenance} from './native-candidate-voice-contract.mts';
import {siteCanonical as canonical,validSiteArchive,type SiteFileArchive} from './site-file-archive-contract.mts';
import {ownerPostVideoTarget,postVideoApprovalEvidence,postVideoTechnicalVerification,postVideoMaterialApprovalKind,type OwnerPostVideoTarget,type PostVideoFileReference} from './owner-post-video-approval-contract.mts';
import type {SiteArchiveActor} from './site-file-archive';
import {triggerSiteRetention} from './site-retention';

const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex'),fail=(s:string,n=409)=>new ProductionError(s,n);
const DECISIONS="'approve','revise','pause','native_video_candidate','native_candidate_voice_provenance','audio_intake','media_scope','reported_owner_candidate_feedback','owner_editorial_delivery_v1','owner_editorial_delivery_revoked_v1','owner_post_video_approval_v1','owner_post_video_delivery_complete_v1'";
const REVIEW_SQL="(SELECT COALESCE(json_group_array(json_object('id',r.id,'revision',r.revision,'content_hash',r.content_hash,'decision',r.decision,'note',r.note,'reviewer',r.reviewer,'created_at',r.created_at)),'[]') FROM (SELECT id,revision,content_hash,decision,note,reviewer,created_at FROM production_reviews WHERE job_id=j.id AND revision=j.revision AND decision IN ("+DECISIONS+") ORDER BY id) r)";
const REVIEW_FIELDS=['id','revision','content_hash','decision','note','reviewer','created_at'] as const;
const MATERIAL_ROLES=['cover_3_4','cover_4_3','promotion'] as const;
type Job=Awaited<ReturnType<typeof getJob>>;
type Milestone=Job['milestones'][number];
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
function object(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v))throw fail('请求对象不完整',400);return v as Record<string,unknown>;}
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).sort().join(',')!==[...allowed].sort().join(','))throw fail('请求字段必须准确，不接收隐含授权',400);}
function current(j:Job,node:string){return j.milestones.filter(m=>m.node===node&&m.revision===j.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];}
function reference(m:Milestone){return{id:m.id,artifact_version:m.artifact_version,artifact_hash:m.artifact_hash};}
function approvalFor(j:Job,node:string,owner:string){
 const m=current(j,node);if(!m||m.status!=='approved'||m.mode_epoch!==j.mode_epoch||hash(m.artifact)!==m.artifact_hash||!m.report)throw fail('当前'+node+'节点缺少准确本人批准');
 const report=object(JSON.parse(m.report)),r=j.reviews.find(r=>r.decision==='approve'&&r.revision===j.revision&&r.content_hash===m.artifact_hash&&r.note===m.report&&r.reviewer===owner);
 if(report.actor!==owner||report.decision!=='approve'||report.revision!==j.revision||report.mode_epoch!==j.mode_epoch||report.artifact_hash!==m.artifact_hash||!r)throw fail('当前'+node+'节点缺少真实所有者审核回执');
 return{m,report,review_id:String(r.id),reviewed_at:String(r.created_at)};
}
function commonRequest(id:string,b:Record<string,unknown>,delivery:boolean){
 keys(b,[...(b.action!==undefined?['action']:[]),...(b.id!==undefined?['id']:[]),'request_id','binding','milestone','approval','publication_authorized','new_paid_calls','new_generation_authorized',...(delivery?['completion_authorized','human_zip_inspected','technical_verification']:['node'])]);
 const action=delivery?'owner_post_video_delivery_complete':'owner_post_video_approve';
 if(b.action!==undefined&&b.action!==action||b.id!==undefined&&b.id!==id||typeof b.request_id!=='string'||!/^[A-Za-z0-9._:-]{1,120}$/.test(b.request_id)||b.publication_authorized!==false||b.new_paid_calls!==0||b.new_generation_authorized!==false||(!delivery&&!['cover','promotion'].includes(String(b.node)))||(delivery&&(b.completion_authorized!==true||b.human_zip_inspected!==false)))throw fail('仅登记已认可私有成果；不授权生成、收费、发布或ZIP人审',400);
 let approval:ReturnType<typeof postVideoApprovalEvidence>,technical:Record<string,unknown>|undefined;
 try{approval=postVideoApprovalEvidence(b.approval);if(delivery)technical=postVideoTechnicalVerification(b.technical_verification);}catch(e){throw fail(e instanceof Error?e.message:'真实认可证据不完整',400);}
 const binding=object(b.binding),milestone=object(b.milestone);keys(binding,['revision','script_hash','mode_epoch','contract_hash','candidate_id','candidate_sha256','project_id','timeline_id']);keys(milestone,['id','artifact_version','artifact_hash']);
 if(typeof milestone.id!=='string'||!milestone.id||!Number.isSafeInteger(milestone.artifact_version)||Number(milestone.artifact_version)<1||typeof milestone.artifact_hash!=='string'||!/^[a-f0-9]{64}$/.test(milestone.artifact_hash))throw fail('须当前正式节点的完整身份',400);
 return{node:delivery?'delivery':String(b.node),approval,technical,binding,milestone,request_hash:hash(canonical({...b,action:undefined,id:undefined,approval}))};
}
async function ownerOf(id:string,actor:SiteArchiveActor){
 const row=await db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string;is_test:number}>();
 if(!row?.owner_id||row.is_test||!actor||('owner_id'in actor?actor.owner_id!==row.owner_id:actor.trusted_owner_service!==true))throw fail('只有本任务真实所有者可登记本次认可',403);return row.owner_id;
}
async function verifyFile(id:string,owner:string,ref:Pick<PostVideoFileReference,'site_archive_id'|'sha256'|'size_bytes'>,role:SiteFileArchive['file']['role'],target:OwnerPostVideoTarget,videoReview:string,states:{key:string;raw:string}[]){
 const {getSiteArchiveMetadata,readSiteArchiveFile}=await import('./site-file-archive');
 const a=await getSiteArchiveMetadata(id,ref.site_archive_id,owner);
 if(!validSiteArchive(a)||a.status!=='confirmed'||a.materialized_sha256!==ref.sha256||a.file.role!==role||a.file.sha256!==ref.sha256||a.file.size_bytes!==ref.size_bytes||!a.manifest_sha256||!same(a.binding,target.binding)||a.scope_id!==target.scope_id||a.scope_hash!==target.scope_hash||a.voice_provenance_id!==target.voice_provenance_id||(role==='video'?a.pending_candidate_id!==target.binding.candidate_id:a.post_video_delivery_id!==target.video.id||a.owner_review_id!==videoReview))throw fail('当前'+role+'真实归档、本人声音或私有绑定不符');
 const bytes=await readSiteArchiveFile(id,a.site_archive_id,owner),reader=bytes.body.getReader(),digest=createHash('sha256'),textParts:Uint8Array[]=[],prefix:Uint8Array[]=[];let size=0;
 for(;;){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;digest.update(x.value);if(role==='promotion')textParts.push(x.value);if(prefix.length===0)prefix.push(x.value.slice(0,8));}
 if(size!==ref.size_bytes||digest.digest('hex')!==ref.sha256)throw fail('当前'+role+'完整持久字节校验失败');
 const key='site_archive_v1:'+a.site_archive_id,row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key).first<{value:string}>();
 const stored=row?JSON.parse(row.value):null;if(!row||stored.job_id!==id||stored.owner_id!==owner||!same(stored.archive,a))throw fail('私有归档元数据并发变化');states.push({key,raw:row.value});
 let text:string|null=null;if(role==='promotion'){try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(textParts));}catch{throw fail('宣发归档不是完整UTF-8正文');}}
 return{archive:a,text,verification:{site_archive_id:a.site_archive_id,sha256:ref.sha256,size_bytes:size,server_full_stream_sha256_verified:true},prefix:prefix[0]};
}
async function context(id:string,target:OwnerPostVideoTarget,owner:string,r:ReturnType<typeof commonRequest>){
 const j=await getJob(id);if(j.is_test||j.status!=='approved'||j.review_mode!=='node'||!same(r.binding,target.binding)||j.revision!==target.binding.revision||j.approved_revision!==j.revision||j.approved_hash!==target.binding.script_hash||j.contract_hash!==target.binding.contract_hash||j.mode_epoch!==target.binding.mode_epoch||hash(j.source_snapshot)!==target.source_snapshot_sha256||hash(j.skill_snapshot)!==target.skill_snapshot_sha256||j.checkpoint_version!==target.checkpoint_version||hash(j.checkpoint)!==target.checkpoint_sha256||Object.entries(target.counts).some(([k,v])=>j[k as 'attempt'|'reworks'|'ai_calls']!==v)||j.publication_reports.length)throw fail('本次认可的原稿、检查点、计数或私有制作绑定已改变');
 const m=current(j,r.node);if(!m||m.status!=='awaiting_human'||m.mode_epoch!==j.mode_epoch||!same(reference(m),r.milestone)||hash(m.artifact)!==m.artifact_hash||(r.node==='cover'&&!same(reference(m),target.cover)))throw fail('须本次当前唯一待审节点，不能认可旧产物');
 const rows=(await db().prepare('SELECT id,revision,content_hash,decision,note,reviewer,created_at FROM production_reviews WHERE job_id=? AND revision=? AND decision IN ('+DECISIONS+') ORDER BY id').bind(id,j.revision).all<Record<string,unknown>>()).results;
 const selected=j.reviews.filter(v=>DECISIONS.includes("'"+v.decision+"'")).map(v=>Object.fromEntries(REVIEW_FIELDS.map(k=>[k,v[k]]))).sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
 if(!same(selected,rows))throw fail('本人审核记录在读取期间改变');
 const draft=await assertNativeApprovedScript(j),scope=await nativeScopeContext(j);if(scope.owner!==owner||scope.scope_id!==target.scope_id||scope.scope_hash!==target.scope_hash)throw fail('当前私有制作范围已改变');
 const video=approvalFor(j,'video',owner),va=JSON.parse(video.m.artifact);
 if(!same(reference(video.m),{id:target.video.id,artifact_version:target.video.artifact_version,artifact_hash:target.video.artifact_hash})||video.review_id!==target.video.owner_review_id||va.sha256!==target.video.sha256||va.qa?.site_archive_id!==target.video.site_archive_id||va.qa?.voice_provenance_id!==target.voice_provenance_id||va.qa?.voice_kind!=='owner-cloned')throw fail('须本次已通过的准确成片与真实本人审阅');
 const row=j.reviews.find(v=>v.id===target.binding.candidate_id&&v.decision==='native_video_candidate'),candidate=row?{id:String(row.id),value:JSON.parse(String(row.note))}:null,voice=candidate&&currentCandidateVoiceProvenance(j,candidate);
 if(!candidate||!same(candidateReviewBinding(j,candidate),target.binding)||!voice||voice.id!==target.voice_provenance_id||voice.scope_id!==target.scope_id)throw fail('原生候选或本人声音来源已改变');
 const editorial=await assertNativeDemonstration(j,{...va,sha256:target.video.sha256}),eg=editorial?editorialMutationGuard(editorial):null,states:{key:string;raw:string}[]=[],files:Record<string,SiteFileArchive>={},verified:Record<string,unknown>[]=[];
 const vf=await verifyFile(id,owner,target.video,'video',target,video.review_id,states);files.video=vf.archive;verified.push(vf.verification);
 let promotionText='';for(const role of MATERIAL_ROLES){const ref=target.materials[role],file=await verifyFile(id,owner,ref,role,target,video.review_id,states);if(file.archive.file.file_name!==ref.file_name)throw fail('已认可材料文件名改变');files[role]=file.archive;verified.push(file.verification);if(role==='promotion')promotionText=file.text!;}
 const cover=current(j,'cover'),ca=cover?JSON.parse(cover.artifact):null,ids=Object.fromEntries(MATERIAL_ROLES.filter(n=>n!=='promotion').map(role=>[role,target.materials[role].site_archive_id]));
 if(!cover||!same(reference(cover),target.cover)||ca?.sha256!==target.materials.cover_3_4.sha256||ca?.qa?.post_video_delivery_id!==target.video.id||!same(ca?.qa?.site_archive_ids,ids)||ca?.qa?.promotion_site_archive_id!==target.materials.promotion.site_archive_id)throw fail('双封面节点与本次九个认可文件不符');
 if(r.node!=='cover'){
  const acceptedCover=approvalFor(j,'cover',owner),coverKind=postVideoMaterialApprovalKind(acceptedCover.report,{owner,revision:j.revision,artifact_hash:acceptedCover.m.artifact_hash,mode_epoch:j.mode_epoch});if(!coverKind||coverKind==='owner-oral-report'&&!same(acceptedCover.report.binding,target.binding))throw fail('封面须有当前准确文件的真实本人节点批准或本次原话认可');
  const promotion=current(j,'promotion'),pa=promotion?JSON.parse(promotion.artifact):null,limits=pa&&typeof pa.limits==='string'?JSON.parse(pa.limits):null;
  if(!promotion||pa.text!==promotionText||!same(limits,{schema:'site-promotion-file-v1',site_archive_id:target.materials.promotion.site_archive_id,sha256:target.materials.promotion.sha256}))throw fail('宣发节点须逐字绑定已认可归档全文');
 }
 const snapshot={source:j.source_snapshot,skill:j.skill_snapshot,scope_raw:scope.scope_raw,nodes_raw:versionNodesRaw(j),updated_at:j.updated_at,reworks:j.reworks,ai_calls:j.ai_calls,attempt:j.attempt,error:j.error,review_note:j.review_note};
 const guard={sql:VERSION_BASE_SQL.replace("j.status='completed'","j.status='approved'")+' AND j.checkpoint_version=? AND j.checkpoint=? AND '+REVIEW_SQL+'=? AND EXISTS(SELECT 1 FROM production_drafts d WHERE d.job_id=j.id AND d.revision=j.revision AND d.content_hash=j.approved_hash AND d.content=?)'+(eg?' AND '+eg.sql:''),args:[...versionBaseArgs({owner_id:owner,binding:target.binding,snapshot}),j.checkpoint_version,j.checkpoint,JSON.stringify(rows),draft.content,...(eg?eg.args:[])]};
 return{j,m,video,files,states,verified,promotionText,guard,editorial};
}
async function run(id:string,b:Record<string,unknown>,actor:SiteArchiveActor,delivery:boolean){
 const target=ownerPostVideoTarget(id);if(!target)throw fail('本次认可仅限三条已审稿件及九个固定材料',403);
 const owner=await ownerOf(id,actor),r=commonRequest(id,b,delivery),rid=(delivery?'owner_post_video_delivery_':'owner_post_video_approval_')+hash(id+'\n'+owner+'\n'+r.node+'\n'+b.request_id),decision=delivery?'owner_post_video_delivery_complete_v1':'owner_post_video_approval_v1',prior=await db().prepare('SELECT note FROM production_reviews WHERE id=? AND job_id=? AND decision=?').bind(rid,id,decision).first<{note:string}>();
 if(prior){const n=JSON.parse(prior.note);if(n.request_hash!==r.request_hash)throw fail('同一认可回执不可更改原话、节点、文件或技术报告');const j=await getJob(id),m=current(j,r.node);if(!m||m.status!=='approved'||m.id!==n.milestone.id||m.artifact_hash!==n.milestone.artifact_hash||hash(m.report||'')!==n.formal_report_sha256)throw fail('此前认可对应的当前节点已变化，先读取核对');return{audit_id:rid,review_id:n.review_id,replayed:true,job:j};}
 const c=await context(id,target,owner,r),archiveRefs=Object.fromEntries(MATERIAL_ROLES.map(role=>[role,{site_archive_id:c.files[role].site_archive_id,sha256:c.files[role].file.sha256,size_bytes:c.files[role].file.size_bytes}]));
 let technical:Record<string,unknown>|null=null;
 if(delivery){
  const pa=approvalFor(c.j,'promotion',owner),promotionKind=postVideoMaterialApprovalKind(pa.report,{owner,revision:c.j.revision,artifact_hash:pa.m.artifact_hash,mode_epoch:c.j.mode_epoch});if(!promotionKind||promotionKind==='owner-oral-report'&&!same(pa.report.binding,target.binding))throw fail('宣发稿须有当前准确全文的真实本人节点批准或本次原话认可');
  const da=JSON.parse(c.m.artifact),limits=typeof da.limits==='string'?JSON.parse(da.limits):null,refs=limits?.complete_bundle;
  if(!limits||limits.schema!=='site-private-delivery-v1'||!refs||limits.secondary_download_verified!==true||limits.external_publication!==false||limits.new_paid_calls!==0||limits.project_id!==target.binding.project_id||limits.timeline_id!==target.binding.timeline_id||!same(limits.archives,{video:{site_archive_id:target.video.site_archive_id,sha256:target.video.sha256,size_bytes:target.video.size_bytes},...archiveRefs})||limits.package_manifest_sha256!==r.technical!.package_manifest_sha256||limits.package_verification_report_sha256!==r.technical!.verification_report_sha256||limits.package_member_count!==r.technical!.member_count)throw fail('交付清单须完整绑定准确四项成果、整包及真实技术报告');
  const approvals=Object.fromEntries(['video','cover','promotion'].map(node=>{const v=approvalFor(c.j,node,owner);return[node,{milestone_id:v.m.id,artifact_hash:v.m.artifact_hash,review_id:v.review_id,reviewed_at:v.reviewed_at}];}));
  if(!same(limits.approvals,approvals)||Object.keys(refs).sort().join(',')!=='sha256,site_archive_id,size_bytes'||typeof refs.site_archive_id!=='string'||typeof refs.sha256!=='string'||!/^[a-f0-9]{64}$/.test(refs.sha256)||!Number.isSafeInteger(refs.size_bytes))throw fail('完整包须绑定三条准确本人批准和完整文件身份');
  const bundle=await verifyFile(id,owner,refs,'complete_bundle',target,c.video.review_id,c.states);if(bundle.prefix?.[0]!==80||bundle.prefix?.[1]!==75||bundle.archive.post_video_material_reviews?.cover!==approvals.cover.review_id||bundle.archive.post_video_material_reviews?.promotion!==approvals.promotion.review_id)throw fail('完整包格式或材料审核绑定不符');
  c.verified.push(bundle.verification);technical={...r.technical,verification_source:'owner-service-technical-report',server_streamed_files:c.verified,human_zip_inspected:false};
 }
 const at=new Date().toISOString(),reviewId='owner_post_video_formal_'+hash(rid),report=canonical({decision:'approve',actor:owner,source:delivery?'owner-authorized-technical-delivery':'owner-oral-report',reason:r.approval.quote,revision:c.j.revision,artifact_hash:c.m.artifact_hash,mode_epoch:c.j.mode_epoch,approval_evidence:r.approval,owner_message_sent_at:null,recorded_at:at,recorded_at_meaning:'server transcription and registration time; not the user message timestamp',website_button_clicked:false,publication_authorized:false,new_paid_calls:0,quality_approved:false,binding:target.binding,video_milestone:reference(c.video.m),video_sha256:target.video.sha256,archives:archiveRefs,...(c.editorial?{editorial_delivery_authorization_id:c.editorial.id,delivery_type:'official-demo-commentary'}:{}),...(delivery?{completion_authorized:true,human_zip_inspected:false,technical_verification:technical}:{} )}),note=canonical({schema:decision,request_hash:r.request_hash,node:r.node,binding:target.binding,milestone:reference(c.m),approval_evidence:r.approval,archives:archiveRefs,video_owner_review_id:c.video.review_id,voice_provenance_id:target.voice_provenance_id,scope_id:target.scope_id,scope_hash:target.scope_hash,server_streamed_files:c.verified,review_id:reviewId,formal_report_sha256:hash(report),recorded_at:at,owner_message_sent_at:null,website_button_clicked:false,publication_authorized:false,new_paid_calls:0,...(delivery?{human_zip_inspected:false,technical_verification:technical}:{}),commit_token:crypto.randomUUID()}),won='EXISTS(SELECT 1 FROM production_reviews winner WHERE winner.id=? AND winner.note=?)',wonArgs=[rid,note];
 const stateGate=c.states.map(()=> 'EXISTS(SELECT 1 FROM app_state file WHERE file.key=? AND file.value=?)').join(' AND '),stateArgs=c.states.flatMap(s=>[s.key,s.raw]);
 const statements=[
 db().prepare('INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,j.id,j.revision,?,?,?,?,? FROM production_jobs j WHERE j.id=? AND '+c.guard.sql+' AND '+stateGate+' ON CONFLICT(id) DO NOTHING').bind(rid,c.m.artifact_hash,decision,note,owner,at,id,...c.guard.args,...stateArgs),
 db().prepare("UPDATE production_milestones SET status='approved',report=?,review_token_hash=NULL,review_until=NULL,updated_at=? WHERE id=? AND status='awaiting_human' AND artifact_hash=? AND "+won).bind(report,at,c.m.id,c.m.artifact_hash,...wonArgs),
 db().prepare("INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,?,?,?,'approve',?,?,? WHERE "+won).bind(reviewId,id,c.j.revision,c.m.artifact_hash,report,owner,at,...wonArgs),
 db().prepare('UPDATE production_jobs SET '+(delivery?"status='completed',":'')+'updated_at=? WHERE id=? AND '+won).bind(at,id,...wonArgs)
 ];
 if(!delivery)statements.push(db().prepare("UPDATE production_milestones SET status='awaiting_human',updated_at=? WHERE job_id=? AND revision=? AND mode_epoch=? AND node=? AND status='pending' AND "+won).bind(at,id,c.j.revision,c.j.mode_epoch,r.node==='cover'?'promotion':'delivery',...wonArgs));
 const results=await db().batch(statements);if(!results[0].meta.changes){const saved=await db().prepare('SELECT note FROM production_reviews WHERE id=? AND job_id=?').bind(rid,id).first<{note:string}>();if(!saved||JSON.parse(saved.note).request_hash!==r.request_hash)throw fail('节点、授权、租约或真实文件并发变化；未认可旧材料，请先读回');return{audit_id:rid,review_id:JSON.parse(saved.note).review_id,replayed:true,job:await getJob(id)};}
 const retention=delivery?await triggerSiteRetention(id):undefined;
 return{audit_id:rid,review_id:reviewId,replayed:false,...(delivery?{retention,human_zip_inspected:false}:{}),job:await getJob(id)};
}
export const approveOwnerPostVideo=(id:string,b:Record<string,unknown>,actor:SiteArchiveActor)=>run(id,b,actor,false);
export const completeOwnerPostVideoDelivery=(id:string,b:Record<string,unknown>,actor:SiteArchiveActor)=>run(id,b,actor,true);
