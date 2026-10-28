import {db} from './store';
import {balanceSqlConjunction} from './sql-conjunction.mts';
import {RETENTION_IDLE_SQL} from './site-retention-state';
import {getJob} from './production';
import {ProductionError} from './production-contract';
import {assertNativeApprovedScript,nativeScopeContext,MINICPM_JOB,PROTECTED_VIDEO_JOB} from './native-return-context';
import {CURRENT_OWNER_LICENSE_SQL} from './current-media-operation';
import {siteCanonical,type SiteFileArchive,type SiteArchiveFile} from './site-file-archive-contract.mts';

export type VersionActor={owner_id:string}|{trusted_owner_service:true};
export const VERSION_PREFIX='approved_native_version_v1:';
export const VERSION_ROLES=['video','source_bundle','cover_3_4','cover_4_3','promotion','complete_bundle'] as const;
export const CARRIED_ROLES=['cover_3_4','cover_4_3','promotion'] as const;
export type VersionRole=typeof VERSION_ROLES[number];
export type LocalAudioOnlyProof={schema:'local-audio-only-finishing-v1';base_video_sha256:string;output_video_sha256:string;source_video_stream_sha256:string;output_video_stream_sha256:string;video_stream_unchanged:true;music_sha256:string;music_gain_db:number;audio_codec:'aac';audio_bitrate_kbps:192;recovery_receipt_sha256:string;checked_at:string};
export type ApprovedVersionVideo={sha256:string;size_bytes:number;duration:number;file_name:string;project_id:string;timeline_id:string;render_id:string|null;delivery_method?:'local-audio-only-finishing';local_audio_proof?:LocalAudioOnlyProof};
export type VersionRecord={
 schema:'approved-existing-native-version-v1';version_id:string;request_id:string;request_hash:string;job_id:string;owner_id:string;status:'staging'|'committed'|'cancelled';
 binding:{revision:number;script_hash:string;mode_epoch:number;contract_hash:string;candidate_id:string;candidate_sha256:string;project_id:string;timeline_id:string};
 base:{milestone_id:string;artifact_version:number;artifact_hash:string;sha256:string};
 video:ApprovedVersionVideo;delivery_id?:string;
 approval:{decision:'approved';source:'owner-oral-report';reviewed_voice_kind:'owner-cloned'|'ordinary-temporary';quote:string;reported_at:string;source_thread_id:string|null;website_button_clicked:false};
 qa:Record<string,unknown>;adjustments:Record<string,unknown>;carried_materials:Record<string,{site_archive_id:string;sha256:string;file:SiteArchiveFile}>;
 owner_review_id:string;scope_id:string;scope_hash:string;created_at:string;cancelled_at?:string;cancel_note?:string;committed_at?:string;commit_hash?:string;archives?:Record<string,string>;milestone_ids?:Record<string,string>;
 snapshot:{source:string;skill:string;scope_raw:string;nodes_raw:string;updated_at:string;reworks:number;ai_calls:number;attempt:number;error:string|null;review_note:string|null};
};
export const versionKey=(id:string,version:string)=>VERSION_PREFIX+id+':'+version;
export function requireVersionJob(id:string){if(!/^job_[a-f0-9-]{36}$/.test(id)||[MINICPM_JOB,PROTECTED_VIDEO_JOB].includes(id))throw new ProductionError('此任务不接收已认可成品版本回传',403);}
export async function versionOwner(id:string,actor:VersionActor){
 requireVersionJob(id);const row=await db().prepare('SELECT owner_id,is_test FROM production_jobs WHERE id=?').bind(id).first<{owner_id:string|null;is_test:number}>();
 if(!row?.owner_id||row.is_test||!actor||('owner_id'in actor?actor.owner_id!==row.owner_id:!('trusted_owner_service'in actor&&actor.trusted_owner_service===true)))throw new ProductionError('已认可版本仅限真实任务所有者',403);
 return row.owner_id;
}
export function versionNodesRaw(j:Awaited<ReturnType<typeof getJob>>){return JSON.stringify(j.milestones.map(m=>({id:m.id,node:m.node,revision:m.revision,artifact_version:m.artifact_version,artifact_hash:m.artifact_hash,artifact:m.artifact,status:m.status,mode_epoch:m.mode_epoch,report:m.report})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0));}
const nodesSql="(SELECT COALESCE(json_group_array(json_object('id',m.id,'node',m.node,'revision',m.revision,'artifact_version',m.artifact_version,'artifact_hash',m.artifact_hash,'artifact',m.artifact,'status',m.status,'mode_epoch',m.mode_epoch,'report',m.report)),'[]') FROM (SELECT id,node,revision,artifact_version,artifact_hash,artifact,status,mode_epoch,report FROM production_milestones WHERE job_id=j.id ORDER BY id) m)";
// This same guard protects beginning, each archive mutation, and the final CAS.
// It intentionally excludes archive audit rows, which are appended while staging.
export const VERSION_BASE_SQL=balanceSqlConjunction(`${RETENTION_IDLE_SQL} AND j.owner_id=? AND j.is_test=0 AND j.status='completed' AND j.review_mode='node' AND j.revision=? AND j.approved_revision=j.revision AND j.approved_hash=? AND j.mode_epoch=? AND j.contract_hash=? AND j.source_snapshot=? AND j.skill_snapshot=? AND j.updated_at=? AND j.reworks=? AND j.ai_calls=? AND j.attempt=? AND j.error IS ? AND j.review_note IS ? AND ${nodesSql}=? AND EXISTS(SELECT 1 FROM app_state WHERE key='media_scope_v1:'||j.id AND value=?) AND ${CURRENT_OWNER_LICENSE_SQL} AND COALESCE(j.lease_until,0)<=? AND NOT EXISTS(SELECT 1 FROM production_data_videos v WHERE v.job_id=j.id AND v.published_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM production_operations o WHERE o.job_id=j.id AND o.status IN ('running','prepared') AND (o.lease_until IS NULL OR o.lease_until>?)) AND NOT EXISTS(SELECT 1 FROM production_stages s WHERE s.job_id=j.id AND s.status='running' AND CASE WHEN json_valid(s.result) THEN COALESCE(json_extract(s.result,'$.lease_until'),?+1)>? ELSE 1 END) AND NOT EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=j.id AND (m.review_until>? OR m.status='ai_running' AND m.review_until IS NULL))`);
export function versionBaseArgs(v:Pick<VersionRecord,'owner_id'|'binding'|'snapshot'>){const b=v.binding,s=v.snapshot,t=Date.now();return[v.owner_id,b.revision,b.script_hash,b.mode_epoch,b.contract_hash,s.source,s.skill,s.updated_at,s.reworks,s.ai_calls,s.attempt,s.error,s.review_note,s.nodes_raw,s.scope_raw,t,t,t,t,t];}
export function versionMutationGuard(v:VersionRecord,raw:string){return{sql:VERSION_BASE_SQL+' AND EXISTS(SELECT 1 FROM app_state version WHERE version.key=? AND version.value=?)',args:[...versionBaseArgs(v),versionKey(v.job_id,v.version_id),raw]};}
export async function readVersionRecord(id:string,version:unknown,actor:VersionActor){
 const owner=await versionOwner(id,actor);if(typeof version!=='string'||!/^apv_[a-f0-9]{64}$/.test(version))throw new ProductionError('已认可版本身份无效',400);
 const key=versionKey(id,version),row=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key).first<{value:string}>();if(!row)throw new ProductionError('已认可版本不存在',404);
 const v=JSON.parse(row.value) as VersionRecord;if(v.schema!=='approved-existing-native-version-v1'||v.owner_id!==owner||v.job_id!==id||v.version_id!==version)throw new ProductionError('已认可版本归属不匹配',403);
 return{key,raw:row.value,v};
}
export async function assertVersionBase(j:Awaited<ReturnType<typeof getJob>>,v:VersionRecord){
 if(j.is_test||j.status!=='completed'||j.review_mode!=='node'||j.revision!==v.binding.revision||j.approved_hash!==v.binding.script_hash||j.mode_epoch!==v.binding.mode_epoch||j.contract_hash!==v.binding.contract_hash||j.publication_reports.length||j.source_snapshot!==v.snapshot.source||j.skill_snapshot!==v.snapshot.skill||j.updated_at!==v.snapshot.updated_at||j.reworks!==v.snapshot.reworks||j.ai_calls!==v.snapshot.ai_calls||j.attempt!==v.snapshot.attempt||j.error!==v.snapshot.error||j.review_note!==v.snapshot.review_note||versionNodesRaw(j)!==v.snapshot.nodes_raw)throw new ProductionError('原完成版、稿件、审核或模式已变化；旧文件保留',409);
 await assertNativeApprovedScript(j);const scope=await nativeScopeContext(j);if(scope.owner!==v.owner_id||scope.scope_raw!==v.snapshot.scope_raw||scope.scope_id!==v.scope_id||scope.scope_hash!==v.scope_hash)throw new ProductionError('原私有制作范围已变化',409);
 if(Number(j.lease_until)>Date.now()||j.operations.some(o=>['running','prepared'].includes(String(o.status))&&(o.lease_until===null||Number(o.lease_until)>Date.now()))||j.stages.some(s=>s.status==='running'&&(()=>{try{const n=JSON.parse(String(s.result)).lease_until;return n==null||Number(n)>Date.now()}catch{return true}})())||j.milestones.some(m=>Number(m.review_until)>Date.now()||m.status==='ai_running'&&m.review_until===null))throw new ProductionError('已有执行或审核在途，先等待原回执',409);
 return scope;
}
export async function approvedVersionArchiveContext(id:string,version:unknown,actor:VersionActor){
 const record=await readVersionRecord(id,version,actor);if(record.v.status!=='staging')throw new ProductionError('已提交版本不可再增加或改写归档',409);
 const job=await getJob(id);await assertVersionBase(job,record.v);const v=record.v;
 return{job,binding:v.binding,owner_review_id:v.owner_review_id,scope_id:v.scope_id,scope_hash:v.scope_hash,
 snapshot:{owner:v.owner_id,source:v.snapshot.source,skill:v.snapshot.skill,scope_raw:v.snapshot.scope_raw,native_raw:'',reviews_raw:'',text_nodes_raw:'',version_key:record.key,version_raw:record.raw},version:record};
}
export function versionArchiveMatches(v:VersionRecord,a:SiteFileArchive){return a.version_request_id===v.version_id&&a.owner_review_id===v.owner_review_id&&a.scope_id===v.scope_id&&a.scope_hash===v.scope_hash&&siteCanonical(a.binding)===siteCanonical(v.binding);}
