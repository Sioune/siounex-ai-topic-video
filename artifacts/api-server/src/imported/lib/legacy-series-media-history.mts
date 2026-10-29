// Historical media stays in its original ledger. It is never a candidate or
// approval for the newly approved script. Unknown and current work still block.
const digest=(v:any)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const parse=(s:any)=>{try{const v=JSON.parse(s);return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}};
const earlier=(j:any,r:any)=>Number.isSafeInteger(r?.revision)&&r.revision>0&&Number.isSafeInteger(r.mode_epoch)&&r.mode_epoch>=0&&(r.revision<j.revision||r.revision===j.revision&&r.mode_epoch<j.mode_epoch);
export function knownHistoricalSeriesVideo(j:any,m:any){
 if(!earlier(j,m)||m.node!=='video'||m.review_until!=null||m.review_token_hash!=null||!digest(m.artifact_hash)||typeof m.artifact!=='string')return false;
 if(['invalidated','superseded'].includes(m.status))return true;
 const a=parse(m.artifact);return ['awaiting_human','approved','revise'].includes(m.status)&&!!a&&digest(a.sha256)&&Number.isSafeInteger(a.size_bytes)&&a.size_bytes>0;
}
export function knownHistoricalSeriesOperation(j:any,o:any){
 if(!earlier(j,o)||o.lease_until!=null||o.lease_hash!=null)return false;
 return ['abandoned','cancelled'].includes(o.status)||o.status==='completed'&&!!parse(o.result)&&!o.error;
}
export function knownHistoricalSeriesReview(j:any,r:any){
 if(!Number.isSafeInteger(r?.revision)||r.revision<1||r.revision>=j.revision)return false;
 const v=parse(r.note);if(!v||!digest(v.sha256)||r.content_hash!==v.sha256||!Number.isSafeInteger(v.size_bytes)||v.size_bytes<=0||v.quality_approved!==false)return false;
 if(r.decision==='native_video_candidate')return v.schema==='native-video-candidate-v1'&&digest(v.script_hash)&&v.local_file_verified===true&&v.publication===false&&typeof v.file_name==='string'&&!!v.file_name&&Number.isFinite(v.duration)&&v.duration>0;
 if(r.decision==='native_video_archive_v1')return v.schema==='native-video-library-archive-v1'&&v.binding?.revision===r.revision&&Number.isSafeInteger(v.binding.mode_epoch)&&v.binding.mode_epoch>=0&&digest(v.binding.script_hash)&&v.binding.video_sha256===v.sha256&&v.materialized_sha256===v.sha256&&v.publication_authorized===false&&v.site_bytes_stored===false&&typeof v.verified_at==='string'&&Number.isFinite(Date.parse(v.verified_at))&&/^libfile_[a-f0-9]{32}$/.test(v.library_file_id||'')&&/^file_[a-f0-9]{32}$/.test(v.file_id||'');
 return false;
}
export function seriesMediaHistorySafe(j:any,{videos=[],operations=[],reviews=[]}:any={}){
 return videos.every((m:any)=>knownHistoricalSeriesVideo(j,m))&&operations.every((o:any)=>knownHistoricalSeriesOperation(j,o))&&reviews.every((r:any)=>knownHistoricalSeriesReview(j,r));
}
