import type {SnapshotEvidence} from './immutable-snapshot';
import type {CandidateReviewBinding} from './native-candidate-feedback-contract.mts';
import type {SiteArchiveFile} from './site-file-archive-contract.mts';
import type {AigcCoverRequest} from './post-video-aigc-cover-contract.mts';
import type {ReleasePolicy,ReleasePackageManifest} from './release-package-contract.mts';
export const POST_VIDEO_PREPARATION_ROLES=['cover_3_4','cover_4_3','promotion','complete_bundle'] as const;
export type PostVideoPreparationRole=(typeof POST_VIDEO_PREPARATION_ROLES)[number]|'source_notes';
export type PostVideoPreparationFile=Omit<SiteArchiveFile,'role'>;
export type PostVideoPreparationPlan={
 schema:'post-video-preparation-v1';plan_id:string;job_id:string;owner_id:string;version:number;status:'queued'|'staging'|'prepared';
 delivery_mode?:'results-only';package_kind?:'release-package-v2';release_policy?:ReleasePolicy;release_manifest?:ReleasePackageManifest;
 binding:CandidateReviewBinding;scope_id:string;scope_hash:string;
 base_video:{id:string;artifact_hash:string;artifact_version:number;sha256:string;site_archive_id:string;size_bytes:number};
 project_archive:{site_archive_id:string;sha256:string;size_bytes:number}|null;
 promo_package_id:string|null;promo_content_hash?:string;files?:Partial<Record<PostVideoPreparationRole,PostVideoPreparationFile>>;archives?:Partial<Record<PostVideoPreparationRole,string>>;
 cover_request?:AigcCoverRequest;aigc_covers?:ReturnType<typeof import('./post-video-aigc-cover-contract.mts').validateAigcCoverReceipt>;
 snapshot:{base_reviews:{id:string;revision:number;content_hash:string;decision:string;note:string;reviewer:string}[];base_files:SnapshotEvidence[];owner:string;source:string;skill:string;scope_raw:string;local_key:string;local_raw?:string;local_ref?:string;text_nodes_raw:string};
 created_at:string;updated_at:string;prepared_at?:string;quality_approved:false;publication_authorized:false;new_paid_calls:0;
};
export function postVideoPreparationProjection(p:PostVideoPreparationPlan){const {snapshot,owner_id,...plan}=p;return plan;}
export function postVideoPreparationReturnPayload(p:PostVideoPreparationPlan,archives=p.archives){return{schema:'post-video-preparation-return-v1',plan_id:p.plan_id,binding:p.binding,base_video:p.base_video,promo_package_id:p.promo_package_id,promo_content_hash:p.promo_content_hash,archives,...(p.delivery_mode?{delivery_mode:p.delivery_mode}:{}),...(p.package_kind?{package_kind:p.package_kind,release_policy:p.release_policy,release_manifest:p.release_manifest}:{}),...(p.cover_request?{cover_request:p.cover_request,aigc_covers:p.aigc_covers}:{}),quality_approved:false,publication_authorized:false,new_paid_calls:0};}
export function validPostVideoPreparationId(id:unknown):id is string{return typeof id==='string'&&/^post_video_prep_[a-f0-9]{64}$/.test(id);}
