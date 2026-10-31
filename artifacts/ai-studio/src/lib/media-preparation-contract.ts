import type {ProductionJob} from './production-contract';
import type {FinalDurationProof} from './final-media-contract';
export type PreparationAsset={node:string;library_file_id:string;file_id:string;file_name:string;version:number;sha256:string;size_bytes:number};
export type MediaPreparation={schema:'private-media-preparation-v1';revision:number;script_hash:string;mode_epoch:number;duration:number;voice_kind:'ordinary-review';authorization_reference:string;limits:string;cost:0;quality_approved:false;publication:false;assets:PreparationAsset[];series_selection?:{id:string;template_hash:string;seed:string;association_evidence:string};qa:{decoded:boolean;listened:false;full_playback_verified:false;final_duration?:FinalDurationProof}};
export function currentPreparation(job:ProductionJob):MediaPreparation|null{
 for(const r of job.reviews||[]){if(r.decision!=='media_preparation'||r.revision!==job.revision||r.content_hash!==job.approved_hash)continue;try{const p=JSON.parse(String(r.note)) as MediaPreparation,c=job.series?.current;if(c&&(!p.series_selection||p.series_selection.id!==c.id||p.series_selection.template_hash!==c.template_hash||p.series_selection.seed!==c.seed))continue;if(p.schema==='private-media-preparation-v1'&&p.mode_epoch===job.mode_epoch&&p.script_hash===job.approved_hash&&p.revision===job.revision)return p;}catch{}}
 return null;
}
