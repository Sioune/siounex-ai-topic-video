import {releaseTextSha256} from './release-package-sha256.mts';

// A publishing package identifies the bytes and choices an owner can review.
// An editable project is a separate immutable reference, never an embedded member
// or a claim that an incomplete technical archive has been confirmed.
export const RELEASE_PACKAGE_V2='release-package-v2' as const;
export const RELEASE_PACKAGE_ROLES=['cover_3_4','cover_4_3','promotion'] as const;
export const RELEASE_PACKAGE_PLATFORMS=['wechat_channels','douyin','bilibili','kuaishou','xiaohongshu'] as const;
type ArchiveRef={site_archive_id:string;sha256:string;size_bytes:number};
type FileRef={sha256:string;size_bytes:number;file_name:string;mime_type:string;width?:number;height?:number};
type Copy={title:string;description:string;tags:string[]};
export type ReleasePolicy={option_policy:{category:'technology-ai';originality:'self-produced-commentary'|'repost'|'owner-selection-required';ai_disclosure:'ai-generated';visibility:'public';publish_mode:'immediate';download:'disabled';sync:'disabled'};collection_policy:{target_name:'怎么用好AI';if_available:true}};
export type ReleasePackageManifest={schema:'publishing-release-package-v2';package_kind:typeof RELEASE_PACKAGE_V2;manifest_sha256:string;job_id:string;binding:Record<string,unknown>;video:ArchiveRef;delivery_mode?:'results-only';project_archive:ArchiveRef|null;files:Record<(typeof RELEASE_PACKAGE_ROLES)[number],FileRef>;promo_content_hash:string;platform_copies:Record<(typeof RELEASE_PACKAGE_PLATFORMS)[number],Copy>;release_policy:ReleasePolicy;quality_approved:false;publication_authorized:false};
const canonical=(v:unknown):string=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sha=releaseTextSha256;
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function fail(code:string):never{throw Object.assign(Error(code),{code});}
function object(v:unknown,code:string):Record<string,any>{if(!v||typeof v!=='object'||Array.isArray(v))fail(code);return v as Record<string,any>;}
function keys(v:Record<string,any>,allowed:readonly string[],code:string){if(Object.keys(v).length!==allowed.length||Object.keys(v).some(k=>!allowed.includes(k)))fail(code);}
function text(v:unknown,max:number,code:string):string{if(typeof v!=='string'||!v.trim()||v!==v.trim()||v.length>max||/[\x00]/.test(v))fail(code);return v;}
function archive(v:unknown):ArchiveRef{const a=object(v,'RELEASE_PACKAGE_ARCHIVE_REF_REQUIRED');if(!/^sitefile_[a-f0-9]{64}$/.test(a.site_archive_id)||!digest(a.sha256)||!Number.isSafeInteger(a.size_bytes)||a.size_bytes<1)fail('RELEASE_PACKAGE_ARCHIVE_REF_REQUIRED');return{site_archive_id:a.site_archive_id,sha256:a.sha256,size_bytes:a.size_bytes};}
function binding(v:unknown){const b=object(v,'RELEASE_PACKAGE_BINDING_REQUIRED'),names=['revision','script_hash','mode_epoch','contract_hash','candidate_id','candidate_sha256','project_id','timeline_id'];keys(b,names,'RELEASE_PACKAGE_BINDING_REQUIRED');if(!Number.isSafeInteger(b.revision)||b.revision<1||!Number.isSafeInteger(b.mode_epoch)||b.mode_epoch<0||!digest(b.script_hash)||!digest(b.contract_hash)||!digest(b.candidate_sha256)||!/^lrd_[a-f0-9]{64}$/.test(b.candidate_id)||!/^local:[a-f0-9]{64}$/.test(b.project_id)||!/^local:[a-f0-9]{64}$/.test(b.timeline_id))fail('RELEASE_PACKAGE_BINDING_REQUIRED');return structuredClone(b);}
function files(v:unknown){const f=object(v,'RELEASE_PACKAGE_FILES_REQUIRED'),result={} as ReleasePackageManifest['files'];for(const role of RELEASE_PACKAGE_ROLES){const a=object(f[role],'RELEASE_PACKAGE_FILE_REQUIRED'),cover=role!=='promotion';keys(a,cover?['sha256','size_bytes','file_name','mime_type','width','height']:['sha256','size_bytes','file_name','mime_type'],'RELEASE_PACKAGE_FILE_REQUIRED');if(!digest(a.sha256)||!Number.isSafeInteger(a.size_bytes)||a.size_bytes<1||a.size_bytes>=(cover?50*1024*1024:20001)||typeof a.file_name!=='string'||!a.file_name.trim()||a.file_name.length>240||/[\x00-\x1f/\\]/.test(a.file_name)||a.mime_type!==(cover?'image/png':'text/plain'))fail('RELEASE_PACKAGE_FILE_REQUIRED');if(cover){const [w,h]=role==='cover_3_4'?[3,4]:[4,3];if(!Number.isSafeInteger(a.width)||!Number.isSafeInteger(a.height)||a.width<1||a.height<1||a.width>16384||a.height>16384||a.width*h!==a.height*w)fail('RELEASE_PACKAGE_COVER_DIMENSIONS');}result[role]=structuredClone(a) as FileRef;}return result;}
function copies(v:unknown){const c=object(v,'RELEASE_PACKAGE_PLATFORM_COPIES_REQUIRED');keys(c,RELEASE_PACKAGE_PLATFORMS,'RELEASE_PACKAGE_PLATFORM_COPIES_REQUIRED');return Object.fromEntries(RELEASE_PACKAGE_PLATFORMS.map(platform=>{const p=object(c[platform],'RELEASE_PACKAGE_PLATFORM_COPY_REQUIRED');keys(p,['title','description','tags'],'RELEASE_PACKAGE_PLATFORM_COPY_REQUIRED');const title=text(p.title,100,'RELEASE_PACKAGE_PLATFORM_COPY_REQUIRED'),description=text(p.description,18000,'RELEASE_PACKAGE_PLATFORM_COPY_REQUIRED');if(!Array.isArray(p.tags)||!p.tags.length||p.tags.length>(platform==='kuaishou'?4:12)||p.tags.some((t:unknown)=>typeof t!=='string'||!t.trim()||t!==t.trim()||t.length>50||/[\x00\r\n]/.test(t))||new Set(p.tags).size!==p.tags.length)fail('RELEASE_PACKAGE_PLATFORM_TAGS_REQUIRED');return[platform,{title,description,tags:[...p.tags]}];})) as ReleasePackageManifest['platform_copies'];}
export function validateReleasePolicy(value:unknown):ReleasePolicy{const p=object(value,'RELEASE_PACKAGE_POLICY_REQUIRED');keys(p,['option_policy','collection_policy'],'RELEASE_PACKAGE_POLICY_REQUIRED');const o=object(p.option_policy,'RELEASE_PACKAGE_POLICY_REQUIRED'),c=object(p.collection_policy,'RELEASE_PACKAGE_POLICY_REQUIRED');keys(o,['category','originality','ai_disclosure','visibility','publish_mode','download','sync'],'RELEASE_PACKAGE_POLICY_REQUIRED');keys(c,['target_name','if_available'],'RELEASE_PACKAGE_POLICY_REQUIRED');if(o.category!=='technology-ai'||!['self-produced-commentary','repost','owner-selection-required'].includes(o.originality)||o.ai_disclosure!=='ai-generated'||o.visibility!=='public'||o.publish_mode!=='immediate'||o.download!=='disabled'||o.sync!=='disabled'||c.target_name!=='怎么用好AI'||c.if_available!==true)fail('RELEASE_PACKAGE_POLICY_REQUIRED');return structuredClone(p) as ReleasePolicy;}

export function createReleasePackageManifest(value:unknown):ReleasePackageManifest{
 const x=object(value,'RELEASE_PACKAGE_INPUT_REQUIRED'),results=x.delivery_mode==='results-only';if(x.delivery_mode!==undefined&&!results)fail('RELEASE_PACKAGE_INPUT_REQUIRED');keys(x,['job_id','binding','video','project_archive','files','promo_content_hash','platform_copies','release_policy',...(results?['delivery_mode']:[])],'RELEASE_PACKAGE_INPUT_REQUIRED');
 if(!/^job_[a-f0-9-]{36}$/.test(x.job_id)||!digest(x.promo_content_hash))fail('RELEASE_PACKAGE_INPUT_REQUIRED');
 if(results&&x.project_archive!==null)fail('RELEASE_PACKAGE_ARCHIVE_REF_REQUIRED');
 const b=binding(x.binding),video=archive(x.video),project=results?null:archive(x.project_archive);if(b.candidate_sha256!==video.sha256||project&&video.site_archive_id===project.site_archive_id)fail('RELEASE_PACKAGE_VIDEO_BINDING_CHANGED');
 const payload={schema:'publishing-release-package-v2' as const,package_kind:RELEASE_PACKAGE_V2,job_id:x.job_id,binding:b,video,...(results?{delivery_mode:'results-only' as const}:{}),project_archive:project,files:files(x.files),promo_content_hash:x.promo_content_hash,platform_copies:copies(x.platform_copies),release_policy:validateReleasePolicy(x.release_policy),quality_approved:false as const,publication_authorized:false as const};
 return{...payload,manifest_sha256:sha(canonical(payload))};
}

export function validateReleasePackageManifest(value:unknown,expectations:Record<string,unknown>={}):ReleasePackageManifest{
 const x=object(value,'RELEASE_PACKAGE_MANIFEST_REQUIRED'),{schema,package_kind,manifest_sha256,quality_approved,publication_authorized,...input}=x;
 if(schema!=='publishing-release-package-v2'||package_kind!==RELEASE_PACKAGE_V2||quality_approved!==false||publication_authorized!==false||!digest(manifest_sha256))fail('RELEASE_PACKAGE_MANIFEST_REQUIRED');
 const result=createReleasePackageManifest(input);if(canonical(result)!==canonical(x))fail('RELEASE_PACKAGE_MANIFEST_SHA_CHANGED');
 for(const [name,wanted]of Object.entries(expectations)){if(!['job_id','binding','video','project_archive','delivery_mode','files','promo_content_hash','release_policy','platform_copies'].includes(name))fail('RELEASE_PACKAGE_EXPECTATION_UNSUPPORTED');const expected=name==='project_archive'&&wanted===null&&result.delivery_mode==='results-only'?null:name==='video'||name==='project_archive'?archive(wanted):name==='files'?files(wanted):name==='release_policy'?validateReleasePolicy(wanted):wanted;if(canonical(result[name as keyof ReleasePackageManifest])!==canonical(expected))fail('RELEASE_PACKAGE_'+name.toUpperCase()+'_CHANGED');}
 return result;
}

// App-state storage orders object keys canonically. Release member bytes must
// survive that round trip, including nested policy, binding and file objects.
export const releasePackageJson=(value:unknown)=>JSON.stringify(JSON.parse(canonical(value)),null,2);
export const RELEASE_PACKAGE_MEMBERS=['video.mp4','cover_3_4.png','cover_4_3.png','promotion.txt','promotion.json','publishing-policy.json','release-manifest.json'] as const;
export function releasePackageMemberExpectations(manifest:ReleasePackageManifest){
 const fixed=(value:unknown)=>{const text=releasePackageJson(value);return{sha256:sha(text),size_bytes:new TextEncoder().encode(text).length};};
 return{'video.mp4':manifest.video,'cover_3_4.png':manifest.files.cover_3_4,'cover_4_3.png':manifest.files.cover_4_3,'promotion.txt':manifest.files.promotion,'promotion.json':{sha256:manifest.promo_content_hash,size_bytes:null},'publishing-policy.json':fixed(manifest.release_policy),'release-manifest.json':fixed(manifest)};
}
/** Check the verified ZIP inventory without accepting technical inputs as members. */
export function validateReleasePackageMembers(value:unknown,members:unknown){
 const manifest=validateReleasePackageManifest(value),expected=releasePackageMemberExpectations(manifest);
 if(!Array.isArray(members)||members.length!==RELEASE_PACKAGE_MEMBERS.length)fail('RELEASE_PACKAGE_ZIP_MEMBERS_CHANGED');const seen=new Set<string>();
 for(const item of members){const m=object(item,'RELEASE_PACKAGE_ZIP_MEMBERS_CHANGED'),wanted=expected[m.file as keyof typeof expected];if(!wanted||seen.has(m.file)||m.sha256!==wanted.sha256||!Number.isSafeInteger(m.size_bytes)||m.size_bytes<1||m.size_bytes>(m.file==='promotion.json'?100000:50*1024*1024)||wanted.size_bytes!==null&&m.size_bytes!==wanted.size_bytes)fail('RELEASE_PACKAGE_ZIP_MEMBERS_CHANGED');seen.add(m.file);}
 return true;
}
