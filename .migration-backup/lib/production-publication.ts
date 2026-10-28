import {db} from './store';
import {getJob} from './production';
import {completedProductionDelivery} from './production-handoff';
import {getSiteArchiveMetadata} from './site-file-archive';
import {hash, ProductionError, text, type ProductionJob} from './production-contract';
import {logicalData} from './data-logical.mjs';
import {clickedPublicationDetails, nativePublicationInterval, nativePublicationAnchor, parseNativePublicationObservation, publicationTimeDescription, NATIVE_COLLECTION_ANCHOR_NOTE, type ClickedPublication} from './publication-details.mts';
import {PUBLICATION_PLATFORMS, type Publication, type PublicationResponse, type PublicationPlatform} from './publication-collection-contract.mts';
import {collectionInsertStatements, optionalCollectionTime, readPublicationCollections} from './publication-collections';

type VideoRow={id:string;[key:string]:unknown};
async function existingPublication(owner:string,jobId:string):Promise<Publication|null> {
 const videos=(await db().prepare('SELECT * FROM production_data_videos WHERE owner_id=? OR owner_id IS NULL').bind(owner).all()).results as VideoRow[];
 const logical=logicalData(videos,[],[]),jobRoots=new Set(videos.filter(v=>v.job_id===jobId).map(v=>logical.revision_roots[v.id])),publishedRoots=new Set(videos.filter(v=>v.published_at).map(v=>logical.revision_roots[v.id])),v=logical.current_videos.filter(v=>jobRoots.has(logical.revision_roots[v.id])&&publishedRoots.has(logical.revision_roots[v.id])).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||a.id.localeCompare(b.id))[0];
 if(!v)return null;
 const original=videos.filter(r=>logical.revision_roots[r.id]===logical.revision_roots[v.id]&&r.published_at).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||a.id.localeCompare(b.id))[0],source=clickedPublicationDetails(v.publication_source)||clickedPublicationDetails(original?.publication_source);
 const published=typeof v.published_at==='string'?v.published_at:null,interval=nativePublicationInterval(v.publication_source,published);
 return {id:v.id,video_id:v.id,original_video_id:logical.revision_roots[v.id],job_id:jobId,title:String(v.title),published_at:published,platform:source?.platform||'unspecified',platform_url:source?.platform_url||null,created_at:String(original?.created_at||v.created_at),time_source:source?.time_source==='native_observation'&&!interval?'existing_record':source?.time_source||'existing_record',video_sha256:source?.video.sha256||null,site_archive_id:source?.video.site_archive_id||null,...(interval?{native_observation:interval,collection_anchor_note:NATIVE_COLLECTION_ANCHOR_NOTE,exact_platform_published_at:null}: {})};
}
function eligibility(job:ProductionJob):string|null {
 if(job.is_test)return '隔离测试任务不能登记真实发布';
 if(!completedProductionDelivery(job))return '请先完成本版成片、交付审核及本站归档';
 return null;
}
export async function readProductionPublication(owner:string,jobId:string):Promise<PublicationResponse> {
 const job=await getJob(text(jobId,100),owner) as unknown as ProductionJob,publication=await existingPublication(owner,jobId),{collections}=await readPublicationCollections(owner,{job_id:jobId});
 const currentSha=job.facts?.candidate_video_sha256,bindingCurrent=publication?.video_sha256&&currentSha?publication.video_sha256===currentSha:null;
 const reason=publication?bindingCurrent===false?'原发布记录绑定的是旧成品；当前视频已变化，本版新视频尚未登记发布。原记录和时间继续保留。':bindingCurrent===null?'已有发布记录与本站当前成品的绑定尚未核验，不能据此确认本版新视频已发布；原记录和时间继续保留。':'本任务已登记发布；再次读取或提交不会重置发布时间':eligibility(job);
 return {can_publish:!reason,reason,binding_current:bindingCurrent,publication,collections};
}

export async function ensureProductionCollections(owner:string,b:Record<string,unknown>):Promise<PublicationResponse> {
 const jobId=text(b.job_id,100);text(b.request_id,120);await getJob(jobId,owner);
 const publication=await existingPublication(owner,jobId);
 if(!publication)throw new ProductionError('请先登记本片发布情况',409);
 if(!publication.published_at)throw new ProductionError('请先更正实际发布时间，再建立采集计划',409);
 const before=await readPublicationCollections(owner,{job_id:jobId});
 const results=before.collections.length?[]:await db().batch(await collectionInsertStatements(owner,publication.original_video_id,publication.video_id,jobId));
 return {...await readProductionPublication(owner,jobId),replayed:results.every(r=>!r.meta.changes)};
}
function platformUrl(value:unknown) {
 if(value===null||value===undefined||value==='')return null;
 const raw=text(value,2000);let url:URL;try{url=new URL(raw);}catch{throw new ProductionError('平台链接应为完整HTTPS网址',400);}
 if(url.protocol!=='https:'||url.username||url.password)throw new ProductionError('平台链接应为无账号密码的HTTPS网址',400);
 return url.href;
}
function milestone(job:ProductionJob,node:string){return job.milestones?.filter(m=>m.node===node&&m.revision===job.revision&&m.mode_epoch===job.mode_epoch&&!['invalidated','superseded'].includes(m.status)).sort((a,b)=>b.artifact_version-a.artifact_version)[0];}

export async function publishProduction(owner:string,b:Record<string,unknown>):Promise<PublicationResponse> {
 const jobId=text(b.job_id,100),request=text(b.request_id,120),job=await getJob(jobId,owner) as unknown as ProductionJob;
 const prior=await existingPublication(owner,jobId);
 if(prior)return {...await readProductionPublication(owner,jobId),replayed:true};
 const reason=eligibility(job);if(reason)throw new ProductionError(reason,409);
 const clock=new Date().toISOString();let interval;try{interval=parseNativePublicationObservation(b.native_observation,Date.parse(clock));}catch(e){throw new ProductionError((e as Error).message,400);}
 const entered=optionalCollectionTime(b.published_at);
 if(interval&&entered)throw new ProductionError('原生观察区间与单点发布时间不能同时填写',400);
 const published=interval?nativePublicationAnchor(interval):entered||clock;
 if(Date.parse(published)>Date.now()+60000)throw new ProductionError('已发布记录不能填写未来时间',400);
 const platform=(b.platform===undefined||b.platform===null||b.platform==='')?'unspecified':text(b.platform,40);
 if(!Object.hasOwn(PUBLICATION_PLATFORMS,platform))throw new ProductionError('发布平台无效',400);
 const videoMilestone=milestone(job,'video')!,deliveryMilestone=milestone(job,'delivery')!,artifact=JSON.parse(videoMilestone.artifact),archive=await getSiteArchiveMetadata(jobId,String(artifact.site_archive_id||artifact.qa?.site_archive_id),owner);
 if(archive.status!=='confirmed'||archive.file.role!=='video'||archive.file.sha256!==artifact.sha256||archive.materialized_sha256!==artifact.sha256||archive.binding.revision!==job.revision||archive.binding.script_hash!==job.approved_hash||archive.binding.mode_epoch!==job.mode_epoch||archive.binding.contract_hash!==job.contract_hash)throw new ProductionError('当前视频、归档和批准稿件绑定不一致',409);
 const topic=await db().prepare('SELECT title,category FROM topics WHERE id=?').bind(job.topic_id).first<{title:string;category:string}>();
 if(!topic?.title)throw new ProductionError('作品标题来源缺失，请重新读取任务',409);
 const source:ClickedPublication={schema:'owner-click-publication-v1',time_source:interval?'native_observation':entered?'owner_entered':'owner_click',precision:interval?'observed_interval':entered?'owner_entered':'registration_time',display_time:new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'}).format(new Date(published)),timestamp_role:'collection_anchor',platform:platform as PublicationPlatform,platform_url:platformUrl(b.platform_url),video:{storage:'site-private-r2',site_archive_id:archive.site_archive_id,sha256:archive.file.sha256,file_name:archive.file.file_name,size_bytes:archive.file.size_bytes,script_revision:job.revision,script_hash:job.approved_hash!},independent_platform_verification:false,source_note:interval?'本人登记手机原生界面已观察到发布成功；'+NATIVE_COLLECTION_ANCHOR_NOTE:entered?'本人在本站点击已发布并填写时间；未独立核验平台作品或发布时间。':'本人在本站点击已发布；默认以服务器首次接收登记的时间作为发布时间和采集锚点，未独立核验平台实际发布时间。',request_id:request,...(interval?{native_observation:interval,exact_platform_published_at:null,collection_anchor_rule:'observation_range_end' as const}: {})};
 if(interval)source.display_time=publicationTimeDescription(published,JSON.stringify(source));
 // The business key is stable across new browser request IDs, reloads, and double clicks.
 const business=await hash(owner+'\n'+jobId),videoId='dv_pub_'+business,stableRequest='owner-publish:'+business,publicationSource=JSON.stringify(source),duration=typeof artifact.duration==='number'&&artifact.duration>0?artifact.duration:null;
 const content={title:topic.title,topic_type:'other',published_at:published,publication_source:publicationSource,job_id:jobId,supersedes_id:null,duration};
 const insert=db().prepare(`INSERT INTO production_data_videos(id,owner_id,title,topic_type,published_at,publication_source,job_id,supersedes_id,duration,record_hash,request_id,created_at) SELECT ?,?,?,?,?,?,?,NULL,?,?,?,? FROM production_jobs j WHERE j.id=? AND j.owner_id=? AND j.is_test=0 AND j.status='completed' AND j.revision=? AND j.approved_revision=j.revision AND j.approved_hash=? AND j.mode_epoch=? AND j.contract_hash=? AND EXISTS(SELECT 1 FROM production_milestones WHERE id=? AND job_id=j.id AND artifact_hash=? AND status='approved') AND EXISTS(SELECT 1 FROM production_milestones WHERE id=? AND job_id=j.id AND artifact_hash=? AND status='approved') AND NOT EXISTS(SELECT 1 FROM production_milestones newer WHERE newer.job_id=j.id AND newer.revision=j.revision AND newer.mode_epoch=j.mode_epoch AND newer.node='video' AND newer.artifact_version>?) AND NOT EXISTS(SELECT 1 FROM production_milestones newer WHERE newer.job_id=j.id AND newer.revision=j.revision AND newer.mode_epoch=j.mode_epoch AND newer.node='delivery' AND newer.artifact_version>?) AND NOT EXISTS(SELECT 1 FROM production_data_videos prior WHERE prior.job_id=j.id AND prior.published_at IS NOT NULL AND (prior.owner_id=? OR prior.owner_id IS NULL)) ON CONFLICT DO NOTHING`).bind(videoId,owner,topic.title,'other',published,publicationSource,jobId,duration,await hash(JSON.stringify(content)),stableRequest,clock,jobId,owner,job.revision,job.approved_hash,job.mode_epoch,job.contract_hash,videoMilestone.id,videoMilestone.artifact_hash,deliveryMilestone.id,deliveryMilestone.artifact_hash,videoMilestone.artifact_version,deliveryMilestone.artifact_version,owner);
 const results=await db().batch([insert,...await collectionInsertStatements(owner,videoId)]);
 const response=await readProductionPublication(owner,jobId);
 if(!response.publication)throw new ProductionError('提交期间交付状态已变化，请重新读取当前版本',409);
 return {...response,replayed:!results[0].meta.changes};
}
