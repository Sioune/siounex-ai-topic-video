import {currentSiteArchives} from './site-file-archive-contract.mts';
type Job={id?:string;owner_id?:string|null;revision:number;approved_hash:string|null;approved_revision?:number|null;mode_epoch?:number;contract_hash?:string;media_continuation?:{scope?:unknown};reviews?:Record<string,unknown>[]};
export function nativeVideoArchive(j:Job,videoSha:string|null,reference:string|null){
 if(!videoSha||!reference)return null;
 const library=(j.reviews||[]).filter(r=>r.decision==='native_video_archive_v1'&&r.revision===j.revision).flatMap(r=>{try{const v=JSON.parse(String(r.note)),b=v.binding;if(v.schema!=='native-video-library-archive-v1'||b.revision!==j.revision||b.script_hash!==j.approved_hash||b.video_sha256!==videoSha||b.video_reference!==reference||v.sha256!==videoSha||v.materialized_sha256!==videoSha||v.quality_approved!==false||v.publication_authorized!==false||!/^libfile_[a-f0-9]{32}$/.test(v.library_file_id)||!/^file_[a-f0-9]{32}$/.test(v.file_id)||!Number.isInteger(v.version)||v.version<0||!Number.isInteger(v.size_bytes)||v.size_bytes<=0)return[];return[{id:String(r.id),library_file_id:String(v.library_file_id),file_id:String(v.file_id),version:Number(v.version),file_name:String(v.file_name),size_bytes:Number(v.size_bytes),sha256:videoSha,verified_at:String(v.verified_at),location:'ChatGPT Library',site_bytes_stored:false}]}catch{return[]}})[0];
 if(library)return library;
 const row=(j.reviews||[]).find(r=>r.id===reference&&r.decision==='native_video_candidate');let candidate=null;try{if(row)candidate={id:String(row.id),value:JSON.parse(String(row.note))};}catch{}
 const site=currentSiteArchives(j,candidate).find(a=>a.file.role==='video'&&a.file.sha256===videoSha);
 return site?{id:site.site_archive_id,site_archive_id:site.site_archive_id,storage:'site-private-r2' as const,file_name:site.file.file_name,size_bytes:site.file.size_bytes,sha256:videoSha,verified_at:site.confirmed_at!,location:'Site private R2',site_bytes_stored:true}:null;
}
