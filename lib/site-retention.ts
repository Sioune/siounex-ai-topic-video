import {completedOwnerPostVideoDelivery,ownerPostVideoTarget} from './owner-post-video-approval-contract.mts';
import {editorialMutationGuard,type EditorialAuthorization} from './owner-editorial-delivery-contract.mts';
import {nativeScopeContext} from './native-return-context';
import {CURRENT_OWNER_LICENSE_SQL} from './current-media-operation';
import {createHash} from 'node:crypto';
import {db,siteArchiveBucket} from './store';
import {getJob} from './production';
import {ProductionError,text} from './production-contract';
import {siteCanonical as canonical,validSiteArchive,siteSha,SITE_ARCHIVE_DECISION,type SiteFileArchive} from './site-file-archive-contract.mts';
import {getSiteArchiveMetadata} from './site-file-archive';
import {retentionTombstoneKey} from './site-retention-state';
export type RetentionActor={owner_id:string}|{trusted_owner_service:true};
const ROLES=['video','source_bundle','cover_3_4','cover_4_3','promotion','complete_bundle'] as const;
const POST_VIDEO_ROLES=['video','cover_3_4','cover_4_3','promotion','complete_bundle'] as const;
const POST_DECISIONS="'approve','revise','pause','native_video_candidate','native_candidate_voice_provenance','audio_intake','media_scope','reported_owner_candidate_feedback','owner_editorial_delivery_v1','owner_editorial_delivery_revoked_v1','owner_post_video_approval_v1','owner_post_video_delivery_complete_v1','media_license','intake_accepted'";
const postReviewsSql="(SELECT COALESCE(json_group_array(json_object('id',r.id,'revision',r.revision,'content_hash',r.content_hash,'decision',r.decision,'note',r.note,'reviewer',r.reviewer,'created_at',r.created_at)),'[]') FROM (SELECT id,revision,content_hash,decision,note,reviewer,created_at FROM production_reviews WHERE job_id=j.id AND decision IN ("+POST_DECISIONS+") ORDER BY id) r)";
const REVIEW_FIELDS=['id','revision','content_hash','decision','note','reviewer','created_at'] as const;
const digest=(v:string)=>createHash('sha256').update(v).digest('hex'),at=()=>new Date().toISOString(),policyKey=(owner:string)=>'site_retention_policy_v1:'+owner,planKey=(id:string,p:string)=>'site_retention_plan_v1:'+id+':'+p;
const object=(v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new ProductionError('需完整保留政策/核验对象',400);return v as Record<string,unknown>};
const stamp=(v:unknown)=>{const s=text(v,80);if(!Number.isFinite(Date.parse(s))||Date.parse(s)>Date.now()+30000)throw new ProductionError('真实报告时间无效',400);return s};
const requestId=(v:unknown)=>{const s=text(v,120);if(!/^[A-Za-z0-9._:-]+$/.test(s))throw new ProductionError('request_id无效',400);return s};
const sid=(v:unknown)=>typeof v==='string'&&/^sitefile_[a-f0-9]{64}$/.test(v);
type Policy={schema:'current-final-retention-policy-v1';policy_id:string;owner_id:string;request_id:string;rule:'current-final-per-role';quote:string;reported_at:string;source:'owner-oral-report';website_button_clicked:false};
type PostSnapshot={schema:'owner-post-video-retention-snapshot-v1';source:string;skill:string;checkpoint:string;checkpoint_version:number;attempt:number;reworks:number;ai_calls:number;scope_raw:string;reviews_raw:string;review_rows:Record<string,unknown>[];archives:{key:string;raw:string}[];editorial?:EditorialAuthorization};
type Snapshot={revision:number;approved_hash:string;mode_epoch:number;contract_hash:string;updated_at:string;nodes_raw:string;post_video?:PostSnapshot};
type Candidate={site_archive_id:string;sha256:string;size_bytes:number;role:string;current_archive_id:string;raw_hash:string;keys:string[];removed:string[];done:boolean};
type Plan={schema:'site-retention-plan-v1';plan_id:string;job_id:string;owner_id:string;policy_id:string;policy_raw:string;request_id:string;request_hash:string;status:'pending'|'partial'|'complete'|'failed'|'protected';snapshot:Snapshot;keep:Record<string,string>;candidates:Candidate[];protected:{site_archive_id:string;reason:string}[];created_at:string;updated_at:string;step?:number;last_error?:string;lease_token?:string;lease_until?:number;dependency_proof?:Record<string,unknown>};
async function ownerOf(id:string,actor:RetentionActor){if(!/^job_[a-f0-9-]{36}$/.test(id)||id==='job_e13e8b19-aa0a-4840-abc9-333eefc91b05')throw new ProductionError('此任务不支持旧成果清理',403);const r=await db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string;is_test:number}>();if(!r?.owner_id||r.is_test||!actor||('owner_id'in actor?actor.owner_id!==r.owner_id:actor.trusted_owner_service!==true))throw new ProductionError('仅真实任务本人可管理归档保留',403);return r.owner_id;}
async function policyFor(owner:string){const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(policyKey(owner)).first<{value:string}>();if(!row)return null;const p=JSON.parse(row.value) as Policy;if(p.owner_id!==owner||p.schema!=='current-final-retention-policy-v1'||p.rule!=='current-final-per-role')throw new ProductionError('保留政策归属无效',409);return{p,raw:row.value};}
async function audit(id:string,decision:string,note:unknown,key:string){const raw=canonical(note);await db().prepare('INSERT INTO production_reviews(id,job_id,revision,content_hash,decision,note,reviewer,created_at) SELECT ?,id,revision,?,?,?,\'verified-site-retention\',? FROM production_jobs WHERE id=? ON CONFLICT(id) DO NOTHING').bind(key,digest(raw),decision,raw,at(),id).run();}
async function writePlan(stmt:D1PreparedStatement){try{return await stmt.run()}catch(e){const err=e instanceof Error?e:null,cause=err?.cause;console.error('site-retention-plan-write',{message:err?.message?.slice(0,500),cause:cause instanceof Error?cause.message.slice(0,500):undefined});throw e}}
function publicPolicy(p:Policy){const{owner_id,...rest}=p;return rest;}
function publicPlan(p:Plan){const{owner_id,policy_raw,snapshot,lease_token,...rest}=p;return{...rest,pending_count:p.candidates.filter(c=>!c.done).length};}
export async function setSiteRetentionPolicy(id:string,b:Record<string,unknown>,actor:RetentionActor){const owner=await ownerOf(id,actor),old=await policyFor(owner);if(b.confirmed!==true||b.rule!=='current-final-per-role'||b.source!=='owner-oral-report'||b.website_button_clicked!==false)throw new ProductionError('需真实持续用户规则，不能冒充网站按钮确认',400);const p:Policy={schema:'current-final-retention-policy-v1',policy_id:'retention_policy_'+digest(owner+'\n'+requestId(b.request_id)),owner_id:owner,request_id:requestId(b.request_id),rule:'current-final-per-role',quote:text(b.quote,4000),reported_at:stamp(b.reported_at),source:'owner-oral-report',website_button_clicked:false},raw=canonical(p);if(old?.p.policy_id===p.policy_id){if(old.raw!==raw)throw new ProductionError('同一政策请求不可覆盖不同用户原话',409);return{policy:publicPolicy(old.p),replayed:true}}if((old?.p.policy_id||'')!==(b.current_policy_id||''))throw new ProductionError('保留政策已更新，须重新读取',409);const r=old?await db().prepare('UPDATE app_state SET value=? WHERE key=? AND value=?').bind(raw,policyKey(owner),old.raw).run():await db().prepare('INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(policyKey(owner),raw).run();if(!r.meta.changes)throw new ProductionError('政策并发变化',409);await audit(id,'site_retention_policy_v1',p,'site_retention_policy_receipt_'+digest(p.policy_id));return{policy:publicPolicy(p),replayed:false};}
const nodeRaw=(j:Awaited<ReturnType<typeof getJob>>)=>JSON.stringify(j.milestones.map(m=>({id:m.id,node:m.node,revision:m.revision,artifact_version:m.artifact_version,artifact_hash:m.artifact_hash,artifact:m.artifact,status:m.status,mode_epoch:m.mode_epoch,report:m.report})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0));
const nodesSql="(SELECT COALESCE(json_group_array(json_object('id',m.id,'node',m.node,'revision',m.revision,'artifact_version',m.artifact_version,'artifact_hash',m.artifact_hash,'artifact',m.artifact,'status',m.status,'mode_epoch',m.mode_epoch,'report',m.report)),'[]') FROM (SELECT id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,report FROM production_milestones WHERE job_id=j.id ORDER BY id) m)";
function guard(p:Plan){const base={sql:`j.owner_id=? AND j.is_test=0 AND j.status='completed' AND j.revision=? AND j.approved_revision=j.revision AND j.approved_hash=? AND j.mode_epoch=? AND j.contract_hash=? AND j.updated_at=? AND ${nodesSql}=? AND EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?) AND NOT EXISTS(SELECT 1 FROM production_operations o WHERE o.job_id=j.id AND o.status IN ('running','prepared')) AND NOT EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=j.id AND m.revision=j.revision AND m.mode_epoch=j.mode_epoch AND m.artifact_version=(SELECT MAX(latest.artifact_version) FROM production_milestones latest WHERE latest.job_id=m.job_id AND latest.node=m.node AND latest.revision=j.revision AND latest.mode_epoch=j.mode_epoch) AND m.status IN ('awaiting_human','awaiting_ai','ai_running')) AND NOT EXISTS(SELECT 1 FROM app_state s WHERE ((s.key>='approved_native_version_v1:'||j.id||':' AND s.key<'approved_native_version_v1:'||j.id||';') OR (s.key>='pending_native_site_v1:'||j.id||':' AND s.key<'pending_native_site_v1:'||j.id||';') OR (s.key>='native_site_final_v1:'||j.id||':' AND s.key<'native_site_final_v1:'||j.id||';')) AND json_extract(CASE WHEN json_valid(s.value) THEN s.value ELSE json_object('status','staging') END,'$.status')='staging')`,args:[p.owner_id,p.snapshot.revision,p.snapshot.approved_hash,p.snapshot.mode_epoch,p.snapshot.contract_hash,p.snapshot.updated_at,p.snapshot.nodes_raw,policyKey(p.owner_id),p.policy_raw]};
 const v=p.snapshot.post_video;if(!ownerPostVideoTarget(p.job_id))return base;if(!v||v.schema!=='owner-post-video-retention-snapshot-v1')return{sql:'0=1',args:[]};
 const editorial=v.editorial?editorialMutationGuard(v.editorial):null;
 // One complete row-identity parameter per EXISTS also stays below D1's
 // bounded parameter count for the real GLM approval/provenance chain.
 const reviewGate=v.review_rows.map(()=>"EXISTS(SELECT 1 FROM production_reviews proof WHERE proof.job_id=j.id AND json_object('id',proof.id,'revision',proof.revision,'content_hash',proof.content_hash,'decision',proof.decision,'note',proof.note,'reviewer',proof.reviewer,'created_at',proof.created_at)=?)").join(' AND '),reviewArgs=v.review_rows.map(r=>JSON.stringify(Object.fromEntries(REVIEW_FIELDS.map(k=>[k,r[k]]))));
 const archives=v.archives.map(()=>"EXISTS(SELECT 1 FROM app_state archive WHERE archive.key=? AND archive.value=?)").join(' AND ');
 return{sql:base.sql+" AND j.review_mode='node' AND j.source_snapshot=? AND j.skill_snapshot=? AND j.checkpoint=? AND j.checkpoint_version=? AND j.attempt=? AND j.reworks=? AND j.ai_calls=? AND EXISTS(SELECT 1 FROM app_state scope WHERE scope.key='media_scope_v1:'||j.id AND scope.value=?) AND "+postReviewsSql+'=? AND '+CURRENT_OWNER_LICENSE_SQL+' AND COALESCE(j.lease_until,0)<=? AND NOT EXISTS(SELECT 1 FROM production_stages active_stage WHERE active_stage.job_id=j.id AND active_stage.status=\'running\') AND NOT EXISTS(SELECT 1 FROM production_milestones active_review WHERE active_review.job_id=j.id AND (active_review.status=\'ai_running\' OR COALESCE(active_review.review_until,0)>?)) AND NOT EXISTS(SELECT 1 FROM production_data_videos published WHERE published.job_id=j.id AND published.published_at IS NOT NULL) AND ('+reviewGate+') AND ('+archives+')'+(editorial?' AND '+editorial.sql:''),args:[...base.args,v.source,v.skill,v.checkpoint,v.checkpoint_version,v.attempt,v.reworks,v.ai_calls,v.scope_raw,v.reviews_raw,Date.now(),Date.now(),...reviewArgs,...v.archives.flatMap(a=>[a.key,a.raw]),...(editorial?editorial.args:[])]};
}
async function assertGuard(p:Plan){const g=guard(p);if(!await db().prepare('SELECT j.id FROM production_jobs j WHERE j.id=? AND '+g.sql).bind(p.job_id,...g.args).first())throw new ProductionError('当前定稿、本人或在途版本已变化；未删除当前成果',409);}
async function current(id:string,owner:string){
 const j=await getJob(id),latest=(node:string)=>j.milestones.filter(m=>m.node===node&&m.revision===j.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0];
 if(j.status!=='completed'||j.approved_revision!==j.revision||!j.approved_hash||['source','script','video','cover','promotion','delivery'].some(n=>latest(n)?.status!=='approved'||latest(n)?.mode_epoch!==j.mode_epoch))throw new ProductionError('not-supported：仅清理六个正式节点已批准的完整交付；待审任务不清理',409);
 const video=JSON.parse(latest('video')!.artifact),version=video.qa?.approved_native_version_id,target=ownerPostVideoTarget(id),post=target?await completedOwnerPostVideoDelivery(j,owner):null;
 if(target&&!post)throw new ProductionError('not-supported：本次三条交付缺少准确本人认可与完整包技术回执，不能改走旧六角色规则',409);
 const roles=post?POST_VIDEO_ROLES:ROLES;let keep:Record<string,string>={},postSnapshot:PostSnapshot|undefined;
 if(post){
  keep={video:post.target.video.site_archive_id,cover_3_4:post.target.materials.cover_3_4.site_archive_id,cover_4_3:post.target.materials.cover_4_3.site_archive_id,promotion:post.target.materials.promotion.site_archive_id,complete_bundle:String(post.complete_bundle.site_archive_id)};
  const scope=await nativeScopeContext(j);if(scope.owner!==owner||scope.scope_id!==post.target.scope_id||scope.scope_hash!==post.target.scope_hash)throw new ProductionError('当前私有制作范围已变化，未删除旧成果',409);
  const rows=(await db().prepare('SELECT id,revision,content_hash,decision,note,reviewer,created_at FROM production_reviews WHERE job_id=? AND decision IN ('+POST_DECISIONS+') ORDER BY id').bind(id).all<Record<string,unknown>>()).results,selected=j.reviews.filter(r=>POST_DECISIONS.includes("'"+r.decision+"'")).map(r=>Object.fromEntries(REVIEW_FIELDS.map(k=>[k,r[k]]))).sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
  if(canonical(rows)!==canonical(selected))throw new ProductionError('当前所有者回执在核验期间变化，未建立清理计划',409);
  postSnapshot={schema:'owner-post-video-retention-snapshot-v1',source:j.source_snapshot,skill:j.skill_snapshot,checkpoint:j.checkpoint,checkpoint_version:j.checkpoint_version,attempt:j.attempt,reworks:j.reworks,ai_calls:j.ai_calls,scope_raw:scope.scope_raw,reviews_raw:JSON.stringify(rows),review_rows:post.review_rows.map(r=>Object.fromEntries(REVIEW_FIELDS.map(k=>[k,r[k]]))),archives:[],...(post.editorial?{editorial:post.editorial}:{})};
 }else{if(typeof version==='string'){const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('approved_native_version_v1:'+id+':'+version).first<{value:string}>();const v=row?JSON.parse(row.value):null;if(!v||v.status!=='committed'||v.owner_id!==owner||v.video.sha256!==video.sha256||v.milestone_ids.video!==latest('video')!.id||['cover','promotion','delivery'].some(n=>v.milestone_ids[n]!==latest(n)!.id))throw new ProductionError('not-supported：当前交付指针不完整',409);keep=v.archives;}else{const files=j.facts.site_file_archives||[];for(const role of ROLES){const rows=files.filter(a=>a.file.role===role);if(rows.length!==1)throw new ProductionError('not-supported：尚无权威六角色当前归档',409);keep[role]=rows[0].site_archive_id;}if(video.qa?.site_archive_id!==keep.video)throw new ProductionError('not-supported：当前视频归档不符',409);}}
 if(roles.some(r=>!sid(keep[r]))||new Set(Object.values(keep)).size!==roles.length)throw new ProductionError('当前交付角色身份不完整',409);
 const files:Record<string,SiteFileArchive>={};for(const role of roles){
  const a=await getSiteArchiveMetadata(id,keep[role],owner);if(a.file.role!==role||a.binding.revision!==j.revision||a.binding.script_hash!==j.approved_hash||a.binding.mode_epoch!==j.mode_epoch||a.binding.contract_hash!==j.contract_hash||role==='video'&&a.file.sha256!==video.sha256)throw new ProductionError('当前归档与正式交付不符',409);
  if(post){
   if(role==='source_bundle')throw new ProductionError('本次五角色定稿不以历史源包作为可删成品',409);
   const expected=role==='video'?post.target.video:role==='complete_bundle'?post.complete_bundle:post.target.materials[role],review=nodeReview(post.approvals,role==='complete_bundle'?'cover':'video');
   if(!validSiteArchive(a)||a.status!=='confirmed'||a.materialized_sha256!==expected.sha256||a.file.sha256!==expected.sha256||a.file.size_bytes!==expected.size_bytes||!a.manifest_sha256||canonical(a.binding)!==canonical(post.binding)||a.scope_id!==post.target.scope_id||a.scope_hash!==post.target.scope_hash||a.voice_provenance_id!==post.target.voice_provenance_id||(role==='video'?a.pending_candidate_id!==post.binding.candidate_id:a.post_video_delivery_id!==post.target.video.id||a.owner_review_id!==post.target.video.owner_review_id)||role==='complete_bundle'&&(a.post_video_material_reviews?.cover!==review||a.post_video_material_reviews?.promotion!==nodeReview(post.approvals,'promotion')))throw new ProductionError('当前五角色真实归档与已认可交付不符',409);
   const key='site_archive_v1:'+a.site_archive_id,row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key).first<{value:string}>(),stored=row?JSON.parse(row.value):null;
   if(!row||stored.job_id!==id||stored.owner_id!==owner||canonical(stored.archive)!==canonical(a))throw new ProductionError('当前持久归档元数据并发变化，未清理',409);postSnapshot!.archives.push({key,raw:row.value});
  }
  files[role]=a;
 }
 return{j,keep,files,video,roles,snapshot:{revision:j.revision,approved_hash:j.approved_hash,mode_epoch:j.mode_epoch,contract_hash:j.contract_hash,updated_at:j.updated_at,nodes_raw:nodeRaw(j),...(postSnapshot?{post_video:postSnapshot}:{})}};
}
function nodeReview(approvals:Record<string,{review_id:unknown}>,node:string){return approvals[node]?.review_id;}

function proof(value:unknown,c:Awaited<ReturnType<typeof current>>){if(value===undefined)return undefined;if(!c.keep.source_bundle||!c.files.source_bundle)throw new ProductionError('本次五角色交付未指定当前源包，不能用嵌入源证明授权删除输入',400);const p=object(value);if(p.source_bundle_id!==c.keep.source_bundle||p.source_bundle_sha256!==c.files.source_bundle.file.sha256||p.source_bundle_size_bytes!==c.files.source_bundle.file.size_bytes||p.zip_crc_passed!==true||p.actual_full_zip_sha256_verified!==true||!Array.isArray(p.embedded_sources)||p.embedded_sources.length>200)throw new ProductionError('嵌入源证明必须绑定已完整核验的当前源包',400);stamp(p.checked_at);for(const v of p.embedded_sources){const e=object(v);if(!siteSha(e.sha256)||!Number.isSafeInteger(e.size_bytes)||Number(e.size_bytes)<=0||typeof e.path!=='string'||!e.path||e.path.startsWith('/')||e.path.includes('..')||e.path.includes('\\'))throw new ProductionError('源包成员身份无效',400);}return JSON.parse(canonical(p)) as Record<string,unknown>;}
function referenced(value:unknown,id:string){return canonical(value).includes(id);}
async function sharedReference(jobId:string,owner:string,archiveId:string){
 const row=await db().prepare(`SELECT j.id FROM production_jobs j WHERE j.owner_id=? AND j.is_test=0 AND j.id<>? AND (
 instr(j.source_snapshot,?)>0 OR EXISTS(SELECT 1 FROM production_drafts d WHERE d.job_id=j.id AND d.revision=j.revision AND instr(d.content,?)>0)
 OR EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=j.id AND m.revision=j.revision AND m.mode_epoch=j.mode_epoch AND m.status NOT IN ('invalidated','superseded')
 AND m.artifact_version=(SELECT MAX(x.artifact_version) FROM production_milestones x WHERE x.job_id=m.job_id AND x.node=m.node AND x.revision=j.revision AND x.mode_epoch=j.mode_epoch AND x.status NOT IN ('invalidated','superseded')) AND instr(m.artifact,?)>0)) LIMIT 1`).bind(owner,jobId,archiveId,archiveId,archiveId).first<{id:string}>();
 return row?'其他任务 '+row.id+' 的当前来源、稿件或制作节点仍引用此文件':'';
}
export async function planSiteRetention(id:string,b:Record<string,unknown>,actor:RetentionActor){const owner=await ownerOf(id,actor),policy=await policyFor(owner);if(!policy)throw new ProductionError('尚未登记持续保留政策',409);const c=await current(id,owner),dep=proof(b.dependency_proof??c.video.qa?.retention_dependencies,c),request=requestId(b.request_id),plan_id='retention_plan_'+digest(id+'\n'+owner+'\n'+request),key=planKey(id,plan_id),requestHash=digest(canonical({request,policy:policy.raw,snapshot:c.snapshot,dep})),old=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key).first<{value:string}>();if(old){const p=JSON.parse(old.value)as Plan;if(p.request_hash!==requestHash)throw new ProductionError('清理请求不可改绑另一当前版本或源证明',409);return{plan:publicPlan(p),replayed:true};}
 const rows=(await db().prepare("SELECT key,value FROM app_state WHERE key>='site_archive_v1:' AND key<'site_archive_v1;' AND json_extract(value,'$.job_id')=?").bind(id).all<{key:string;value:string}>()).results,candidates:Candidate[]=[],protectedFiles:Plan['protected']=[];
 const activeInputs={source:JSON.parse(c.j.source_snapshot),draft:c.j.drafts.find(d=>d.revision===c.j.revision)?.content,intake:c.j.intake};
 for(const row of rows){const stored=JSON.parse(row.value),a=stored.archive as SiteFileArchive;if(stored.owner_id!==owner||Object.values(c.keep).includes(a?.site_archive_id)||!validSiteArchive(a)||a.status!=='confirmed'||!ROLES.some(r=>r===a.file.role))continue;if(c.snapshot.post_video&&a.file.role==='source_bundle'){const removed=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(retentionTombstoneKey(a.site_archive_id)).first<{value:string}>();if(!removed||JSON.parse(removed.value).status!=='deleted')protectedFiles.push({site_archive_id:a.site_archive_id,reason:'本次五角色成品交付没有指定当前源包，历史源包作为可能仍需使用的制作输入保留'});continue;}if(!c.roles.some(role=>role===a.file.role))continue;const r=c.j.reviews.find(r=>r.decision===SITE_ARCHIVE_DECISION&&r.content_hash===a.file.sha256&&r.note===canonical({owner_id:owner,...a}));if(!r||!Array.isArray(stored.parts)||stored.parts.length!==a.part_count)throw new ProductionError('旧归档缺少完整固定证据，未清理',409);let reason=await sharedReference(id,owner,a.site_archive_id);if(referenced(activeInputs,a.site_archive_id))reason='当前来源或批准稿仍按身份引用此文件';const base=c.video.qa?.local_audio_proof?.base_video_sha256;if(a.file.sha256===base&&!(dep?.embedded_sources as Record<string,unknown>[]|undefined)?.some(e=>e.sha256===a.file.sha256&&e.size_bytes===a.file.size_bytes))reason='当前本地混音依赖的原视频尚无当前源包内嵌核验证明';if(reason){protectedFiles.push({site_archive_id:a.site_archive_id,reason});continue;}const prior=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(retentionTombstoneKey(a.site_archive_id)).first<{value:string}>();if(prior&&JSON.parse(prior.value).status==='deleted')continue;candidates.push({site_archive_id:a.site_archive_id,sha256:a.file.sha256,size_bytes:a.file.size_bytes,role:a.file.role,current_archive_id:c.keep[a.file.role],raw_hash:digest(row.value),keys:[...Array.from({length:a.part_count},(_,n)=>'site-private-archives/v1/'+a.site_archive_id+'/part-'+String(n).padStart(3,'0')),'site-private-archives/v1/'+a.site_archive_id+'/manifest.json'],removed:[],done:false});}
 const now=at(),p:Plan={schema:'site-retention-plan-v1',plan_id,job_id:id,owner_id:owner,policy_id:policy.p.policy_id,policy_raw:policy.raw,request_id:request,request_hash:requestHash,status:candidates.length?'pending':protectedFiles.length?'protected':'complete',snapshot:c.snapshot,keep:c.keep,candidates,protected:protectedFiles,created_at:now,updated_at:now,...(dep?{dependency_proof:dep}:{})},g=guard(p),raw=canonical(p);const r=await writePlan(db().prepare('INSERT INTO app_state(key,value) SELECT ?,? FROM production_jobs j WHERE j.id=? AND '+g.sql+' ON CONFLICT(key) DO NOTHING').bind(key,raw,id,...g.args));if(!r.meta.changes)throw new ProductionError('定稿或清理计划并发变化',409);await statusAudit(p);return{plan:publicPlan(p),replayed:false};}
async function statusAudit(p:Plan){const note={rule:'current-final-per-role',plan_id:p.plan_id,status:p.status,sequence:p.step||0,pending_count:p.candidates.filter(c=>!c.done).length,protected:p.protected,...(p.last_error?{last_error:p.last_error}:{})};await audit(p.job_id,'site_retention_status_v1',note,'retention_status_'+digest(canonical(note)));}
async function readPlan(id:string,plan:unknown,actor:RetentionActor){const owner=await ownerOf(id,actor);if(typeof plan!=='string'||!/^retention_plan_[a-f0-9]{64}$/.test(plan))throw new ProductionError('清理计划身份无效',400);const key=planKey(id,plan),row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key).first<{value:string}>();if(!row)throw new ProductionError('清理计划不存在',404);const p=JSON.parse(row.value)as Plan;if(p.owner_id!==owner||p.job_id!==id)throw new ProductionError('清理计划归属不符',403);return{key,raw:row.value,p};}
export async function readSiteRetention(id:string,b:Record<string,unknown>,actor:RetentionActor){const owner=await ownerOf(id,actor),policy=await policyFor(owner);return{policy:policy?publicPolicy(policy.p):null,...(b.plan_id?{plan:publicPlan((await readPlan(id,b.plan_id,actor)).p)}:{}),job:await getJob(id)};}
export async function applySiteRetention(id:string,b:Record<string,unknown>,actor:RetentionActor){
 const value=await readPlan(id,b.plan_id,actor),p=value.p,max=b.max_objects===undefined?16:Number(b.max_objects);
 if(!Number.isSafeInteger(max)||max<1||max>16)throw new ProductionError('每次只允许1至16个物理对象',400);
 if(['complete','protected'].includes(p.status)){await statusAudit(p);return{plan:publicPlan(p),replayed:true};}
 if(Number(p.lease_until)>Date.now())throw new ProductionError('清理批次仍在途，等待回执',409);
 await assertGuard(p);
 const claimed={...p,lease_token:crypto.randomUUID(),lease_until:Date.now()+120000},claimRaw=canonical(claimed),g=guard(p);
 const won=await db().prepare('UPDATE app_state SET value=? WHERE key=? AND value=? AND EXISTS(SELECT 1 FROM production_jobs j WHERE j.id=? AND '+g.sql+')').bind(claimRaw,value.key,value.raw,id,...g.args).run();
 if(!won.meta.changes)throw new ProductionError('清理计划或当前定稿并发变化',409);
 const next:Plan={...claimed,status:'partial',step:(p.step||0)+1,updated_at:at()};delete next.last_error;
 const item=next.candidates.find(c=>!c.done);
 try{
  if(!item)throw new ProductionError('清理计划无待删对象',409);
  if(Object.values(next.keep).includes(item.site_archive_id))throw new ProductionError('禁止清理当前正式成果',409);
  const row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('site_archive_v1:'+item.site_archive_id).first<{value:string}>();
  if(!row||digest(row.value)!==item.raw_hash)throw new ProductionError('旧归档元数据已变化',409);
  const shared=await sharedReference(id,p.owner_id,item.site_archive_id);
  if(shared){
   const started=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(retentionTombstoneKey(item.site_archive_id)).first();
   if(item.removed.length||started)throw new ProductionError('清理已开始后出现新的共享引用，已停止继续删除：'+shared,409);
   next.candidates=next.candidates.filter(c=>c.site_archive_id!==item.site_archive_id);
   next.protected.push({site_archive_id:item.site_archive_id,reason:shared});
  }else{
   const tombstone={schema:'site-archive-retention-tombstone-v1',status:'deleting',job_id:id,owner_id:p.owner_id,site_archive_id:item.site_archive_id,sha256:item.sha256,policy_id:p.policy_id,plan_id:p.plan_id,current_archive_id:item.current_archive_id};
   const markerGuard=guard(p),marked=await db().prepare('INSERT INTO app_state(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?)'+(p.snapshot.post_video?' AND EXISTS(SELECT 1 FROM production_jobs j WHERE j.id=? AND '+markerGuard.sql+')':'')+' ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(retentionTombstoneKey(item.site_archive_id),canonical(tombstone),value.key,claimRaw,...(p.snapshot.post_video?[id,...markerGuard.args]:[])).run();
   if(!marked.meta.changes)throw new ProductionError('清理租约已变化，未继续删除',409);
   await assertGuard(p);
   if(await sharedReference(id,p.owner_id,item.site_archive_id))throw new ProductionError('删除前发现新的共享输入，已停止清理',409);
   const bucket=siteArchiveBucket(),keys=item.keys.filter(k=>!item.removed.includes(k)).slice(0,max);
   if(keys.length)await bucket.delete(keys);
   for(const key of keys)if(await bucket.head(key))throw new ProductionError('物理删除尚未验证缺失',503);
   item.removed.push(...keys);
   if(item.removed.length===item.keys.length){
    const listed=await bucket.list({prefix:'site-private-archives/v1/'+item.site_archive_id+'/',limit:1});
    if(listed.objects.length||listed.truncated)throw new ProductionError('旧归档前缀仍有物理对象，未声明清理完成',503);
    const done={...tombstone,status:'deleted',deleted_at:at(),physical_absence_verified:true,deleted_object_count:item.keys.length};
    const written=await db().prepare('UPDATE app_state SET value=? WHERE key=? AND EXISTS(SELECT 1 FROM app_state WHERE key=? AND value=?)').bind(canonical(done),retentionTombstoneKey(item.site_archive_id),value.key,claimRaw).run();
    if(!written.meta.changes)throw new ProductionError('物理缺失已核验，清理回执仍待恢复',409);
    await audit(id,'site_archive_deleted_v1',done,'site_archive_deleted_'+digest(item.site_archive_id));item.done=true;
   }
  }
  next.status=next.candidates.every(c=>c.done)?next.protected.length?'protected':'complete':'partial';
 }catch(e){next.status='failed';next.last_error=e instanceof Error?e.message:'物理清理失败，保留待办';}
 delete next.lease_token;delete next.lease_until;
 const saved=await db().prepare('UPDATE app_state SET value=? WHERE key=? AND value=?').bind(canonical(next),value.key,claimRaw).run();
 if(!saved.meta.changes)throw new ProductionError('清理回执并发变化，先读回核对',409);
 await statusAudit(next);return{plan:publicPlan(next),replayed:false};
}
// A completed delivery stays successful even when retention is unsupported or a
// bounded physical batch needs resuming. No policy means no deletion capability.
export async function triggerSiteRetention(id:string){
 try{
  const row=await db().prepare('SELECT owner_id FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string}>();
  if(!row?.owner_id||!await policyFor(row.owner_id))return{status:'policy-not-enabled'};
  const j=await getJob(id),m=j.milestones.filter(m=>m.node==='video'&&m.revision===j.revision).sort((a,b)=>b.artifact_version-a.artifact_version)[0],actor={owner_id:row.owner_id};
  if(!m)return{status:'not-supported',reason:'尚无正式成片'};
  let plan=(await planSiteRetention(id,{request_id:'completed:'+m.artifact_hash},actor)).plan;
  const maximum=plan.candidates.reduce((n,c)=>n+Math.max(1,Math.ceil(c.keys.length/16)),0)+1;
  for(let n=0;n<maximum&&!['complete','protected'].includes(plan.status);n++){
   plan=(await applySiteRetention(id,{plan_id:plan.plan_id,max_objects:16},actor)).plan;
   if(plan.status==='failed')break;
  }
  return plan;
 }catch(e){return{status:'not-supported-or-pending',reason:e instanceof Error?e.message:'cleanup pending'};}
}
