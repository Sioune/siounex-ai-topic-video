/** Public contracts contain account identities and immutable media bindings, never credentials. */
export const PUBLISHING_PLATFORMS = ['douyin','wechat_channels','bilibili','kuaishou'] as const;
export type PublishingPlatform = typeof PUBLISHING_PLATFORMS[number];
export type PublishedAtPrecision='minute'|'second';
export type PublishedAtMetadata={published_at_precision:PublishedAtPrecision|null;published_at_range_start:string|null;published_at_range_end:string|null;published_at_uncertainty_seconds:0|59|null};
export type CollectionTimeMetadata={anchor_published_at_precision:PublishedAtPrecision;anchor_uncertainty_seconds:0|59;due_at_range_end:string|null};
export const PUBLISHING_PLATFORM_LABELS:Record<PublishingPlatform,string> = {douyin:'抖音',wechat_channels:'微信视频号',bilibili:'B站',kuaishou:'快手'};
export const PUBLISHING_TIMEZONE = 'Asia/Shanghai' as const;
export const PUBLISHING_TIMES = ['08:00','18:00'] as const;
export const PUBLISHING_SLOT_GRACE_MS = 5*60*1000;
export type PublishingMaterialBinding={role:'cover_3_4'|'cover_4_3'|'promotion';site_archive_id:string;sha256:string;size_bytes:number;file_name:string;mime_type:string;milestone_id:string;artifact_hash:string;artifact_version:number};
export type PublishingBinding = {
 job_id:string;revision:number;script_hash:string;mode_epoch:number;contract_hash:string;
 template_publishing_slot?:import('./template-schedule.mts').TemplatePublishingSlot;
 video_milestone_id:string;video_artifact_version:number;video_artifact_hash:string;
 delivery_milestone_id:string;delivery_artifact_version:number;delivery_artifact_hash:string;
 site_archive_id:string;video_sha256:string;size_bytes:number;file_name:string;materials:PublishingMaterialBinding[];
};
export type PublishingConnection = {platform:PublishingPlatform;connected:boolean;account_id:string|null;can_publish:boolean;can_collect:boolean;reason:string|null;mode?:'browser'|'official_api';login_required?:boolean;supported?:boolean};
export type PublishingDispatch = {owner_id:string;platform:PublishingPlatform;account_id:string;idempotency_key:string;release_id:string;slot_id:string;job_id:string;binding:PublishingBinding;title:string};
export type PublishingResult = {status:'published'|'submitted'|'blocked'|'uncertain';external_post_id?:string;platform_url?:string;published_at?:string;published_at_precision?:PublishedAtPrecision;reason?:string;receipt?:Record<string,unknown>};
export type PublishingCollectionInput = {owner_id:string;platform:PublishingPlatform;account_id:string;external_post_id:string;post_id:string;target_hours:24|48|null;published_at:string;published_at_precision?:PublishedAtPrecision;sample_kind?:'single_t24'|'single_t48'|'single_snapshot';collection_key?:string};
export type PublishingCollected = {status?:'pending'|'blocked'|'collected';observed_at?:string;metrics?:Record<string,number|null>;source?:Record<string,unknown>;reason?:string};
export type PublishingAdapter = {
 now?:()=>Date;
 status:(owner:string,platform:PublishingPlatform)=>Promise<PublishingConnection>;
 publish:(input:PublishingDispatch)=>Promise<PublishingResult>;
 /** Persists a browser-only work packet. It must never contact a publishing platform. */
 preparePublish?:(input:PublishingDispatch)=>Promise<PublishingResult>;
 reconcile?:(input:PublishingDispatch & {external_post_id?:string;receipt?:Record<string,unknown>})=>Promise<PublishingResult>;
 collect?:(input:PublishingCollectionInput)=>Promise<PublishingCollected>;
 /** Read an already-durable exact collection receipt without enqueueing browser work. */
 readCollectionResult?:(input:PublishingCollectionInput)=>Promise<PublishingCollected|null>;
};
export type PublishingPlan = {enabled:boolean;timezone:typeof PUBLISHING_TIMEZONE;slots:typeof PUBLISHING_TIMES;platforms:typeof PUBLISHING_PLATFORMS;authorization_id:string|null;authorization_reference:string|null;active_since:string|null;updated_at:string|null};
export type PublishingReserve = {template_time?:'08:00'|'18:00'|null;id:string;job_id:string;title:string;approved_at:string;status:string;binding:PublishingBinding;reason:string|null};
export type PublishingSlot = {id:string;scheduled_at:string;status:string;release_id:string|null;reason:string|null};
export type PublishingPost = PublishedAtMetadata & {id:string;platform:PublishingPlatform;account_id:string|null;status:string;submission_state?:'waiting_browser'|'platform_accepted'|null;release_id:string;slot_id:string;title:string;external_post_id:string|null;platform_url:string|null;published_at:string|null;reason:string|null;updated_at:string};
export type PublishingCollection = CollectionTimeMetadata & {id:string;post_id:string;platform:PublishingPlatform;target_hours:24|48;due_at:string;status:string;observed_at:string|null;metrics:Record<string,number|null>|null;reason:string|null;collection_policy?:'next-day-following-day-best-effort';delay_hours?:number|null;late?:boolean;strict_target_comparable?:boolean};
/** A separate owner registration; it never upgrades a browser connection or verification. */
export type NativePublishingReceipt = {
 browser_post_id:string;release_id:string;job_id:string;publication_id:string;original_video_id:string;platform:'wechat_channels';
 title:string;status:'registered';binding_current:true;video_sha256:string;site_archive_id:string;revision:number;script_hash:string;
 source:'owner-native-observation';independent_platform_verification:false;exact_platform_published_at:null;external_post_id:null;platform_url:string|null;
 native_observation:import('./publication-details.mts').NativePublicationObservation;collection_anchor:string;collection_anchor_note:string;registered_at:string;
 collection_state:'complete'|'incomplete';collections:import('./publication-collection-contract.mts').PublicationCollection[];
};
export type PublishingDashboard = {
 plan:PublishingPlan;connections:PublishingConnection[];reserve_queue:PublishingReserve[];slots:PublishingSlot[];publications:PublishingPost[];collections:PublishingCollection[];next_slots:string[];
 summary:{ready:number;reserved:number;published:number;blocked:number;uncertain:number};
 policy:{fifo:'delivery_approved_at';no_catch_up:true;slot_grace_minutes:5};automatic_collection:boolean;
 native_receipts?:NativePublishingReceipt[];native_receipt_issues?:{browser_post_id:string;job_id:string;reason:string}[];
};
export type ExistingPlatformPublication=PublishedAtMetadata & {id:string;job_id:string;data_video_id:string|null;title:string;platform:PublishingPlatform;account_id:string|null;external_post_id:string|null;platform_url:string|null;platform_published_at:string|null;registered_published_at:string|null;verification_state:'needs_reconciliation'|'verified'|'policy_blocked';identity_method:'creator-account-and-content-observation'|'owner-report-only';evidence_reference:string|null;evidence_note:string;observed_at:string;reason:string|null};
export type ExistingPlatformCollection=CollectionTimeMetadata & {id:string;post_id:string;job_id:string;title:string;platform:PublishingPlatform;sample_kind:'single_t24'|'single_t48'|'single_snapshot';target_hours:24|48|null;collection_key:string;due_at:string;status:string;observed_at:string|null;metrics:Record<string,number|null>|null;reason:string|null};
export type ExistingPublicationCandidate={data_video_id:string;job_id:string|null;title:string;platform:string;registered_published_at:string|null;registration_source:string;platform_url:string|null;external_post_id:null;verification_state:'needs_reconciliation';reason:string};
export type ExistingPlatformDashboard={existing_publications:ExistingPlatformPublication[];existing_collections:ExistingPlatformCollection[];candidates:ExistingPublicationCandidate[]};

/** Immutable owner-approved warehouse content, reused across preparation and submission. */
export type FrozenPublishingCopy={title:string;description:string;tags:string[]};
export type FrozenPublishingPackage={schema:'publishing-frozen-package-v1';id:string;package_hash:string;owner_id:string;approval_scope:'warehouse-frozen-package';release_id:string;job_id:string;title:string;authorization_id:string;binding:PublishingBinding;copies:Record<PublishingPlatform,FrozenPublishingCopy>;option_policy:{category:string;originality:string;ai_disclosure:string;visibility:'public';publish_mode:'immediate';download:'disabled';sync:'disabled'};collection_policy:{target_name:'怎么用好AI';if_available:true};author_engagement:Record<string,unknown>;created_at:string};
export type PublishingSlotPreparation={schema:'publishing-slot-preparation-v1';id:string;owner_id:string;slot_id:string;scheduled_at:string;submission_window:{start:string;end:string};empty_slot_makeup?:{schema:'publishing-empty-slot-makeup-link-v1';request_id:string;original_submission_window:{start:string;end:string}};authorization_id:string;package_id:string;release_id:string;job_id:string;title:string;state:'preparing'|'ready'|'claimed'|'stale'|'missed';reason:string|null;created_at:string;updated_at:string};
export type EmptySlotMakeupGrant={submission_starts_at?:string;schema:'publishing-empty-slot-makeup-v1';owner_id:string;request_id:string;slot_id:string;scheduled_at:string;original_submission_window:{start:string;end:string};preparation_id:string;package_id:string;package_hash:string;release_id:string;job_id:string;authorization_id:string;reserve_binding_hash:string;platforms:PublishingPlatform[];authorization_reference:string;created_at:string;expires_at:string};
export type PreparedSlotContinuation={schema:'publishing-prepared-slot-continuation-v1';owner_id:string;request_id:string;preparation_id:string;package_id:string;package_hash:string;slot_id:string;scheduled_at:string;release_id:string;job_id:string;authorization_id:string;reserve_binding_hash:string;platforms:PublishingPlatform[];targets:{platform:PublishingPlatform;preparation_work_id:string;account_id:string;draft_locator:string;post_id:string;work_id:string|null}[];authorization_reference:string;created_at:string;expires_at:string};
export type PublishingPreparationWork={schema:'publishing-preparation-work-v1';id:string;owner_id:string;preparation_id:string;package_id:string;platform:PublishingPlatform;transport:'browser'|'native';expected_account_label:string|null;account_id:string|null;account_label?:string|null;state:'queued'|'claimed'|'prepared'|'blocked'|'uncertain';phase:'waiting_executor'|'preparing'|'draft_saved'|'blocked'|'uncertain';claim_hash?:string;lease_until?:number;worker?:string;draft_locator?:string;prepared_at?:string;preflight?:Record<string,unknown>;evidence_url?:string;evidence_note?:string;reason:string|null;created_at:string;updated_at:string};
