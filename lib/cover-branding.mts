import manifest from '../production/cover-branding-migrations.json' with {type:'json'};
import type {PublishingBinding} from './publishing-contract.mts';
const canonical=(v:unknown)=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const warehouseBrandingJobIds=manifest.migrations.map(m=>m.job_id);
export function warehouseBrandCover(jobId:string,archiveId:string){
 const migration=manifest.migrations.find(m=>m.job_id===jobId);
 const file=migration?.covers.find(c=>c.source_archive_id===archiveId||c.site_archive_id===archiveId);
 return migration&&file?{migration,file}:null;
}
export function currentBrandCoverId(jobId:string,archiveId:string){return warehouseBrandCover(jobId,archiveId)?.file.site_archive_id||archiveId;}
function derivative(source:PublishingBinding):PublishingBinding{
 return {...source,materials:source.materials.map(m=>{const found=warehouseBrandCover(source.job_id,m.site_archive_id);if(!found||found.file.source_sha256!==m.sha256)return m;const f=found.file;return{...m,site_archive_id:f.site_archive_id,sha256:f.sha256,size_bytes:f.size_bytes,file_name:f.file_name,mime_type:f.mime_type};})};
}
// This migration changes only the two explicitly authorized, still-unpublished
// warehouse covers. Old releases and in-flight packages retain their identities.
export function applyWarehouseCoverBranding(binding:PublishingBinding):PublishingBinding{
 const m=manifest.migrations.find(m=>canonical(m.original_binding)===canonical(binding));return m?derivative(binding):binding;
}
// Carry an existing copy decision only across this exact cover-only change.
// A changed script, video, promotion or any other field never inherits approval.
export function coverBrandingSourceBinding(binding:PublishingBinding):PublishingBinding|null{
 const m=manifest.migrations.find(m=>canonical(derivative(m.original_binding as PublishingBinding))===canonical(binding));return m?m.original_binding as PublishingBinding:null;
}
