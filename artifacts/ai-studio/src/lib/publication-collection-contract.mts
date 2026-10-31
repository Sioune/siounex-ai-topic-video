/** Browser-safe contracts. A publication is an owner report, not platform verification. */
export const COLLECTION_TARGETS = [24, 48] as const;
export const PUBLICATION_PLATFORMS = {unspecified:'未指定平台',wechat_channels:'微信视频号',douyin:'抖音',xiaohongshu:'小红书',bilibili:'哔哩哔哩',kuaishou:'快手',other:'其他'} as const;
export type PublicationPlatform = keyof typeof PUBLICATION_PLATFORMS;
export type CollectionStatus = 'scheduled' | 'due' | 'uploaded' | 'sampled';
export type Publication = {
 id:string; video_id:string; original_video_id:string; job_id:string; title:string; published_at:string|null;
 platform:PublicationPlatform; platform_url:string|null; created_at:string;
 time_source:'owner_click'|'owner_entered'|'native_observation'|'existing_record';
 native_observation?:import('./publication-details.mts').NativePublicationObservation; collection_anchor_note?:string; exact_platform_published_at?:null;
 video_sha256:string|null; site_archive_id:string|null;
};
export type CollectionEvidence = {
 id:string; file_name:string; content_type:string; sha256:string; size_bytes:number;
 captured_at:string|null; attached_at:string; url:string;
};
export type PublicationCollection = {
 id:string; owner_id?:never; video_id:string; original_video_id:string; job_id:string|null;
 title:string; platform:PublicationPlatform; published_at:string|null;
 native_observation?:import('./publication-details.mts').NativePublicationObservation; collection_anchor_note?:string;
 target_hours:24|48; sample_kind:'single_t24'|'single_t48'; due_at:string|null;
 status:CollectionStatus; evidence:CollectionEvidence[]; sample_ids:string[];
 generated_at:string|null; upload_url:string;
};
export type PublicationResponse = {
 can_publish:boolean; reason:string|null; binding_current:boolean|null; publication:Publication|null; collections:PublicationCollection[];
 replayed?:boolean;
};
export type CollectionResponse = {collections:PublicationCollection[];replayed?:boolean};
export type DueCollectionReminder = {
 id:string; reminder_id:string; collection_id:string; video_id:string; job_id:string|null;
 title:string; platform:PublicationPlatform; due_at:string; target_hours:24|48;
 sample_kind:'single_t24'|'single_t48'; upload_url:string;
};
