import {clickedPublicationDetails,nativePublicationInterval,NATIVE_COLLECTION_ANCHOR_NOTE} from './publication-details.mts';
import type {PublishingBinding,NativePublishingReceipt,PublishingPost} from './publishing-contract.mts';
import type {PublicationCollection} from './publication-collection-contract.mts';
type Row={id:string;job_id?:unknown;published_at?:unknown;publication_source?:unknown;created_at?:unknown;title?:unknown};
type Archive={site_archive_id:string;status:string;materialized_sha256?:string;binding:{revision:number;script_hash:string;mode_epoch:number;contract_hash:string};file:{role:string;sha256:string;size_bytes:number;file_name:string}};
/** Match immutable identities, never titles, account labels, or a browser blocked row alone. */
export function nativeReceiptSource(row:Row,binding:PublishingBinding){
 const source=clickedPublicationDetails(row.publication_source),at=typeof row.published_at==='string'?row.published_at:null,interval=nativePublicationInterval(row.publication_source,at);
 if(row.job_id!==binding.job_id||source?.platform!=='wechat_channels'||source.time_source!=='native_observation'||!interval||!at||source.independent_platform_verification!==false)return null;
 const v=source.video;
 if(v.script_revision!==binding.revision||v.script_hash!==binding.script_hash||v.sha256!==binding.video_sha256||v.site_archive_id!==binding.site_archive_id||v.size_bytes!==binding.size_bytes||v.file_name!==binding.file_name)return null;
 return {source,interval,at};
}
export function nativeReceiptProjection(post:PublishingPost,binding:PublishingBinding,row:Row,originalVideoId:string,archive:Archive,collections:PublicationCollection[]):NativePublishingReceipt|null{
 const match=nativeReceiptSource(row,binding);if(post.platform!=='wechat_channels'||!match)return null;
 const a=archive,v=match.source.video;
 if(a.site_archive_id!==binding.site_archive_id||a.status!=='confirmed'||a.materialized_sha256!==v.sha256||a.file.role!=='video'||a.file.sha256!==v.sha256||a.file.size_bytes!==v.size_bytes||a.file.file_name!==v.file_name||a.binding.revision!==binding.revision||a.binding.script_hash!==binding.script_hash||a.binding.mode_epoch!==binding.mode_epoch||a.binding.contract_hash!==binding.contract_hash)return null;
 const exact=collections.filter(c=>c.job_id===binding.job_id&&c.video_id===row.id&&c.original_video_id===originalVideoId&&c.platform==='wechat_channels'&&c.published_at===match.at&&c.due_at===new Date(Date.parse(match.at)+c.target_hours*3600000).toISOString()&&c.native_observation?.range_start===match.interval.range_start&&c.native_observation?.range_end===match.interval.range_end);
 const complete=exact.length===2&&exact.filter(c=>c.target_hours===24).length===1&&exact.filter(c=>c.target_hours===48).length===1;
 return {browser_post_id:post.id,release_id:post.release_id,job_id:binding.job_id,publication_id:row.id,original_video_id:originalVideoId,platform:'wechat_channels',title:post.title,status:'registered',binding_current:true,video_sha256:v.sha256,site_archive_id:v.site_archive_id,revision:binding.revision,script_hash:binding.script_hash,source:'owner-native-observation',independent_platform_verification:false,exact_platform_published_at:null,external_post_id:null,platform_url:match.source.platform_url||null,native_observation:match.interval,collection_anchor:match.at,collection_anchor_note:NATIVE_COLLECTION_ANCHOR_NOTE,registered_at:String(row.created_at||''),collection_state:complete?'complete':'incomplete',collections:exact.sort((a,b)=>a.target_hours-b.target_hours)};
}
