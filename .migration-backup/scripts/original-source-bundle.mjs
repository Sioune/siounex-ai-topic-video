import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
// This brief labels the frozen owner text. It never fetches outside sources,
// grants media use, or upgrades a product claim to a verified test result.
export function originalSourceBundle(job,directory,existingFile){
 const source=JSON.parse(job.source_snapshot);
 if(source.source_id!=='owner-original'&&!source.original)return null;
 const original=source.original;
 if(source.source_id!=='owner-original'||original?.schema!=='frozen-owner-original-v1'||original.source_kind!=='owner-original-not-external-news'||typeof original.original_text!=='string'||typeof original.draft!=='string'||sha(original.original_text)!==original.original_sha256||sha(original.draft)!==original.draft_sha256)throw Error('Frozen owner original packet does not match selected version');
 const base=existingFile?JSON.parse(fs.readFileSync(existingFile,'utf8')):{evidence:[],images:[]};
 const brief={...base,evidence:base.evidence||[],images:base.images||[],user_requirements:{...base.user_requirements,goal:base.user_requirements?.goal||original.summary,scope:'Frozen owner-authored product description and draft; no generation, media use, quality or publication authorization',source_type:'owner-original-not-external-news',product_claims:'The complete original text is the owner product description, not independently verified behavior.',pending_claims:original.pending_claims||'Product features remain pending verification.',verified_notes:original.verified_notes||'No product feature test is established by these materials.',history_note:original.history_note||'',date_boundary:'description_date is a material date, never a public product release date.'},original_binding:{id:original.id,version:original.version,original_sha256:original.original_sha256,draft_sha256:original.draft_sha256,description_date:original.description_date||null,media_observed:false,quality_approved:false,publication_authorized:false}};
 const dir=path.resolve(directory);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'original-brief.json'),content=JSON.stringify(brief,null,2);
 if(fs.existsSync(file)){if(fs.readFileSync(file,'utf8')!==content)throw Error('Frozen owner original brief cache changed');}else fs.writeFileSync(file,content,{flag:'wx'});
 return file;
}
